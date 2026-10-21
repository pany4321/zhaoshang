/* ============================================================
 * 数据仓库查询工具（给网页智能体做 function calling 用）
 *
 * 设计原则：
 *   1. 模型不能直接跑任意 SQL —— 先过白名单校验，只允许单条 SELECT
 *   2. 强制 LIMIT，避免全表扫描打满上游 25s 超时
 *   3. 每次查询必须带 purpose（审计追溯）
 *   4. 工具失败不阻断对话，把错误回灌给模型让它自己调整
 * ============================================================ */
import { mcpCallTool, mcpConfigured } from './mcpClient.js'
import type { ToolDef } from './llm.js'

const MAX_SQL_LEN = 4000
const DEFAULT_LIMIT = 100

/** 禁止出现的写操作/危险关键字（整词匹配） */
const FORBIDDEN = [
  'INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'TRUNCATE', 'CREATE',
  'REPLACE', 'MERGE', 'GRANT', 'REVOKE', 'ATTACH', 'DETACH', 'SET',
  'USE', 'LOAD', 'EXPORT', 'ADMIN', 'KILL', 'SHUTDOWN',
]

export interface SqlCheck {
  ok: boolean
  sql?: string
  reason?: string
}

/** 校验并规整 SQL：只放行单条 SELECT / WITH 查询 */
export function validateSql(raw: string): SqlCheck {
  if (!raw || typeof raw !== 'string') return { ok: false, reason: 'SQL 为空' }
  let sql = raw.trim()
  if (sql.length > MAX_SQL_LEN) return { ok: false, reason: `SQL 过长（上限 ${MAX_SQL_LEN} 字符）` }

  // 去掉末尾分号后再判断多语句
  sql = sql.replace(/;+\s*$/, '')
  if (sql.includes(';')) return { ok: false, reason: '不允许多条语句' }

  const upper = sql.toUpperCase()
  if (!/^(SELECT|WITH)\b/.test(upper)) return { ok: false, reason: '只允许 SELECT / WITH 查询' }

  // 去掉字符串字面量后再做关键字检查，避免误伤合法常量
  const stripped = upper.replace(/'[^']*'/g, "''").replace(/"[^"]*"/g, '""')
  for (const kw of FORBIDDEN) {
    if (new RegExp(`\\b${kw}\\b`).test(stripped)) {
      return { ok: false, reason: `SQL 中不允许出现 ${kw}` }
    }
  }

  // 强制 LIMIT（已有则不动）
  if (!/\bLIMIT\s+\d+/i.test(sql)) {
    sql = `${sql} LIMIT ${DEFAULT_LIMIT}`
  }
  return { ok: true, sql }
}

/** 供 LLM 使用的工具定义 */
export const DORIS_TOOLS: ToolDef[] = [
  {
    type: 'function',
    function: {
      name: 'doris_query',
      description: [
        '在庆阳市政务数据仓库（Doris，daas 库）执行只读 SQL 查询，用于回答平台样本数据之外的问题。',
        '适用场景：跨表关联统计、历史年报、招投标明细、司法案件明细、行政处罚等深度查询。',
        '限制：只允许单条 SELECT；表名直接写裸表名（如 opt_company_base），不要加库名前缀；查询会自动附加 LIMIT 100。',
        '如果不确定表名或字段名，先用 doris_list_tables 和 doris_table_schema 确认，不要猜。',
      ].join('\n'),
      parameters: {
        type: 'object',
        properties: {
          sql: { type: 'string', description: '单条 SELECT 查询语句' },
          purpose: { type: 'string', description: '本次查询目的（必填），用于审计，如"统计西峰区存续企业数量"' },
        },
        required: ['sql', 'purpose'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'doris_list_tables',
      description: '列出数据仓库中所有可用的数据域与数据表（含用途摘要）。不确定有哪些表时先调用它。',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'doris_table_schema',
      description: '查询指定表的字段明细、口径说明、关联键。写 SQL 前用它确认字段名，避免猜错。',
      parameters: {
        type: 'object',
        properties: {
          table_name: { type: 'string', description: '表名，如 opt_company_base' },
        },
        required: ['table_name'],
      },
    },
  },
]

export function toolsAvailable(): boolean {
  return mcpConfigured()
}

/** 执行一个工具调用，返回给模型看的文本结果 */
export async function runDorisTool(name: string, args: Record<string, any>): Promise<string> {
  if (name === 'doris_list_tables') {
    return await mcpCallTool('list_domains', {})
  }

  if (name === 'doris_table_schema') {
    const table = String(args?.table_name || '').trim()
    if (!table) return '错误：缺少 table_name'
    return await mcpCallTool('get_table_detail', { tables: [table] })
  }

  if (name === 'doris_query') {
    const check = validateSql(String(args?.sql || ''))
    if (!check.ok) return `查询被拒绝：${check.reason}。请修正后重试。`
    const purpose = String(args?.purpose || '业务查询').slice(0, 200)
    return await mcpCallTool('execute_query', {
      sql: check.sql,
      intent: purpose,
      question: purpose,
      limit: DEFAULT_LIMIT,
    })
  }

  return `错误：未知工具 ${name}`
}
