/* ============================================================
 * 企业详情 / 风险溯源的服务端取数预取（Doris DAAS）
 *
 * 为什么要有它：
 *   技能协议要求「按 doris-daas-query 口径输出六部分详情」，但实测让模型自己写 SQL
 *   有两个硬伤：
 *     1) 相关子查询（WHERE p.company_id = c.company_id）在 Doris 上直接报
 *        "Unknown column 'company_id' in 'p' in FILTER clause"，模型会连续试错；
 *     2) JOIN 联查大表普遍触发上游 25s 超时，模型连试三四次把预算烧光。
 *   结果就是「调了工具但一个维度都没取到」，还要等 60-70 秒。
 *
 *   因此改为：由后端用实测通过的固定 SQL（单表精确过滤 + 非相关标量子查询）
 *   一次性预取，把结构化结果注入 prompt。模型只组织语言，不再自由写 SQL。
 *
 * 维护约定：
 *   1. 所有字段名必须来自 information_schema 实测，不要按业务文档猜；
 *   2. 一律「先按 credit_no 取 company_id，再单表 WHERE company_id=? 精确过滤」，
 *      禁止 JOIN 与相关子查询（会超时 / 报错）；
 *   3. 两阶段取数：先 1 条 SQL 拿 12 维度计数，计数为 0 的明细表直接跳过
 *      —— MCP 侧有「每分钟 20 次」频率限制，不省着用会整段失败；
 *   4. 任一子查询失败只丢弃该段，不影响其他维度（全量失败才返回空串）。
 * ============================================================ */
import { mcpCallTool, mcpConfigured } from './mcpClient.js'

const CACHE_TTL_MS = 10 * 60 * 1000
const CACHE_MAX = 80
const cache = new Map<string, { at: number; text: string }>()
const TOTAL_TIMEOUT_MS = 45000
const PER_QUERY_TIMEOUT_MS = 14000
const CONCURRENCY = 1
const RATE_LIMIT_RETRY_MS = 2200

const esc = (s: string) => String(s || '').replace(/'/g, "''")

/** 12 维度计数（单表精确过滤的非相关标量子查询，实测可用；UNION ALL 会被 MCP 校验拒绝） */
const COUNT_TABLES: [string, string, string][] = [
  ['punish_n', 'company_punish', '行政处罚'],
  ['abnormal_n', 'company_abnormal', '经营异常'],
  ['zhixing_n', 'risk_zhixing', '被执行'],
  ['shixin_n', 'risk_shixin', '失信被执行'],
  ['bid_n', 'company_bid_entity_list_new', '招投标'],
  ['pledge_n', 'company_pledge', '股权出质'],
  ['chattel_n', 'company_chattel_mortgage', '动产抵押'],
  ['partner_n', 'opt_ent_partner_std', '股东'],
  ['invest_n', 'annual_report_invest', '年报对外投资'],
  ['change_n', 'company_change', '工商变更'],
]

async function rawQuery(sql: string, purpose: string, limit: number): Promise<string> {
  const t = await Promise.race([
    mcpCallTool('execute_query', { sql, intent: purpose, question: purpose, limit }),
    new Promise<string>((resolve) => setTimeout(() => resolve('__TIMEOUT__'), PER_QUERY_TIMEOUT_MS)),
  ])
  return String(t ?? '')
}

async function q(sql: string, purpose: string, limit = 30, expect: string[] = []): Promise<string> {
  const t0 = Date.now()
  try {
    let t = await rawQuery(sql, purpose, limit)
    // 频率限制：MCP 每分钟 20 次，等待后重试一次（预取一次要打十来条）
    if (/查询频率超限|频率超限|too many requests/i.test(t)) {
      await new Promise((r) => setTimeout(r, RATE_LIMIT_RETRY_MS))
      t = await rawQuery(sql, purpose, limit)
    }
    const ms = Date.now() - t0
    if (t === '__TIMEOUT__') {
      console.warn(`[ai] 预取查询超时 ${ms}ms：${purpose}`)
      return ''
    }
    const s = t.trim()
    if (!s) return ''
    // MCP 出错时返回的是自然语言说明，这类结果不进 prompt
    if (/^(错误|失败|查询被拒绝|SQL 语法错误|SQL 执行错误|查询频率超限)/.test(s)) {
      console.warn(`[ai] 预取查询失败（${ms}ms）：${purpose} → ${s.slice(0, 80)}`)
      return ''
    }
    // 同一 MCP session 下若前一条查询超时被放弃，服务端可能把上一次响应回给本条 → 列校验兜底
    if (expect.length) {
      const head = s.split('\n')[0] || ''
      const miss = expect.filter((c) => !head.includes(c))
      if (miss.length) {
        console.warn(`[ai] 预取结果列不匹配（缺 ${miss.join(',')}），已丢弃：${purpose}`)
        return ''
      }
    }
    return s.length > 1800 ? `${s.slice(0, 1800)}\n…（已截断）` : s
  } catch (e: any) {
    console.warn(`[ai] 预取查询异常（${Date.now() - t0}ms）：${purpose} → ${e?.message || e}`)
    return ''
  }
}

/** 限流并发（MCP 侧串行处理，一次打十来条会排队到超时） */
async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let idx = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (idx < items.length) {
      const i = idx++
      out[i] = await fn(items[i] as T)
    }
  })
  await Promise.all(workers)
  return out
}

/** 从 opt_company_base 的 markdown 结果里抠出 company_id 与公司名 */
function pickBase(txt: string): { cid: string; name: string } | null {
  for (const line of txt.split('\n')) {
    if (!line.trim().startsWith('|')) continue
    const cells = (line.split('|') || []).slice(1, -1).map((c) => c.trim())
    const cid = cells[0] || ''
    if (/^[0-9a-f]{16,}$/.test(cid)) return { cid, name: cells[1] || '' }
  }
  return null
}

/** 把 markdown 表格首个数据行解析成 {列名: 值} */
function firstRow(txt: string): Record<string, string> {
  const lines = txt.split('\n').filter((l) => l.trim().startsWith('|'))
  if (lines.length < 2) return {}
  const head = (lines[0] || '').split('|').slice(1, -1).map((c) => c.trim())
  const body = (lines[1] || '').split('|').slice(1, -1).map((c) => c.trim())
  const out: Record<string, string> = {}
  head.forEach((h, i) => (out[h] = body[i] ?? ''))
  return out
}

function countsLine(r: Record<string, string>): string {
  if (!Object.keys(r).length) return ''
  const parts = COUNT_TABLES.map(([k, , label]) => `${label} ${r[k] ?? '未获取'}`)
  if (r.patent_n !== undefined) parts.push(`专利 ${r.patent_n}`)
  if (r.trademark_n !== undefined) parts.push(`商标 ${r.trademark_n}`)
  return parts.join(' / ')
}

/**
 * 预取某企业的 Doris 全维度事实。命中缓存直接返回（10 分钟）。
 * @param input creditCode 优先；没有信用代码时用 companyName 精确匹配
 */
export async function prefetchCompanyFacts(input: {
  creditCode?: string
  companyName?: string
}): Promise<string> {
  if (!mcpConfigured()) return ''
  const key = String(input.creditCode || input.companyName || '').trim()
  if (!key) return ''

  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    console.log(`[ai] Doris 预取命中缓存 ${key}`)
    return hit.text
  }

  const where = input.creditCode
    ? `credit_no='${esc(input.creditCode)}'`
    : `company_name='${esc(input.companyName || '')}'`

  const run = async (): Promise<string> => {
    // 阶段 1：主体（含照面字段，尽量让报告第一部分不留「未获取」）
    const baseTxt = await q(
      [
        'SELECT company_id, company_name, credit_no, legal_person, establish_date, capital_num,',
        '       n_company_status, company_major_type, province, city, district',
        'FROM opt_company_base',
        `WHERE ${where} AND use_flag=0 LIMIT 3`,
      ].join(' '),
      '企业详情预取：按统一社会信用代码确认主体与 company_id'
    )
    const base = pickBase(baseTxt)
    if (!base) {
      console.warn(`[ai] Doris 预取未命中主体 ${key}`)
      return ''
    }
    const { cid, name } = base
    const cidLit = `'${esc(cid)}'`
    const nameLit = `'${esc(name)}'`

    const L: string[] = []
    L.push('【水滴企信 Doris 实时取数（平台服务端已预取，直接引用，不要再调 doris_query 重复查询）】')
    L.push(`主体键：company_id=${cid}｜${name}`)
    L.push('▸ 工商照面（原始披露）：')
    L.push(baseTxt)

    // 阶段 2：一次拿 12 维度计数
    const countSql = [
      'SELECT',
      ...COUNT_TABLES.map(
        ([k, t]) => ` (SELECT COUNT(*) FROM ${t} WHERE company_id=${cidLit} AND use_flag=0) AS ${k},`
      ),
      ` (SELECT COUNT(*) FROM ip_patent WHERE applicant_name=${nameLit} AND use_flag=0) AS patent_n,`,
      ` (SELECT COUNT(*) FROM ip_trademark WHERE applicant_cn=${nameLit} AND use_flag=0) AS trademark_n`,
    ].join('\n')
    const countTxt = await q(countSql, '企业详情预取：12 维度计数', 5, ['punish_n', 'zhixing_n', 'patent_n'])
    const counts = firstRow(countTxt)
    const line = countsLine(counts)
    if (line) L.push(`规模计数：${line}`)

    // 阶段 3：只查计数 > 0 的明细（0 行即「无记录」，无需再打一次 MCP）
    const need = (k: string) => counts[k] === undefined || Number(counts[k]) > 0
    const jobs: { label: string; sql: string; cols: string[]; limit?: number }[] = [
      {
        label: '股东（水滴企信原始披露）', cols: ['stock_name', 'stock_proportion'],
        sql: `SELECT stock_name, stock_proportion, stock_capital, stock_realcapital, is_personal FROM opt_ent_partner_std WHERE company_id=${cidLit} AND use_flag=0 ORDER BY stock_proportion DESC LIMIT 20`,
      },
      {
        label: '近三年年报（万元）', cols: ['report_year', 'business_income', 'profit_amount'],
        sql: `SELECT report_year, business_income, profit_amount, tax_amount, total_amount, debt_amount, equity_amount FROM annual_report_asset WHERE company_id=${cidLit} AND use_flag=0 ORDER BY report_year DESC LIMIT 3`,
        limit: 5,
      },
      {
        label: '年报从业人数', cols: ['report_year', 'employee_no', 'company_address'],
        sql: `SELECT report_year, employee_no, member_no, company_address, business_scope FROM annual_report_base WHERE company_id=${cidLit} AND use_flag=0 ORDER BY report_year DESC LIMIT 3`,
        limit: 5,
      },
    ]
    if (need('punish_n'))
      jobs.push({
        label: '行政处罚', cols: ['punish_date', 'illegal_type'],
        sql: `SELECT punish_date, illegal_type, punish_content, punish_amount, authority FROM company_punish WHERE company_id=${cidLit} AND use_flag=0 ORDER BY punish_date DESC LIMIT 5`,
        limit: 10,
      })
    if (need('zhixing_n'))
      jobs.push({
        label: '被执行', cols: ['case_code', 'court_name', 'exec_money'],
        sql: `SELECT case_create_time, case_code, court_name, exec_money, case_state FROM risk_zhixing WHERE company_id=${cidLit} AND use_flag=0 ORDER BY case_create_time DESC LIMIT 5`,
        limit: 10,
      })
    if (need('shixin_n'))
      jobs.push({
        label: '失信被执行', cols: ['case_code', 'court_name', 'duty'],
        sql: `SELECT publish_date, case_code, court_name, duty, performance FROM risk_shixin WHERE company_id=${cidLit} AND use_flag=0 LIMIT 5`,
        limit: 10,
      })
    if (need('abnormal_n'))
      jobs.push({
        label: '经营异常', cols: ['included_date', 'included_reason'],
        sql: `SELECT included_date, included_reason, removed_date, removed_reason FROM company_abnormal WHERE company_id=${cidLit} AND use_flag=0 LIMIT 5`,
        limit: 10,
      })
    if (need('change_n'))
      jobs.push({
        label: '工商变更（最近 8 条）', cols: ['change_date', 'change_field'],
        sql: `SELECT change_date, change_type, change_field, content_before, content_after FROM company_change WHERE company_id=${cidLit} AND use_flag=0 ORDER BY change_date DESC LIMIT 8`,
        limit: 10,
      })
    if (need('invest_n'))
      jobs.push({
        label: '年报对外投资', cols: ['investee_name'],
        sql: `SELECT report_year, investee_name, investee_code FROM annual_report_invest WHERE company_id=${cidLit} AND use_flag=0 ORDER BY report_year DESC LIMIT 10`,
        limit: 10,
      })
    if (need('pledge_n'))
      jobs.push({
        label: '股权出质', cols: ['pledge_date', 'pledgor'],
        sql: `SELECT pledge_date, pledgor, pawnee, pledge_equity, pledge_status FROM company_pledge WHERE company_id=${cidLit} AND use_flag=0 LIMIT 5`,
        limit: 10,
      })
    if (need('chattel_n'))
      jobs.push({
        label: '动产抵押', cols: ['chattel_code', 'mortgagee'],
        sql: `SELECT chattel_code, mortgagee FROM company_chattel_mortgage WHERE company_id=${cidLit} AND use_flag=0 LIMIT 5`,
        limit: 10,
      })

    const tStart = Date.now()
    const results = await mapLimit(jobs, CONCURRENCY, (j) => q(j.sql, `企业详情预取：${j.label}`, j.limit ?? 30, j.cols))
    const okN = results.filter(Boolean).length
    console.log(`[ai] Doris 预取 计数${line ? 'OK' : '缺失'} / 明细 ${okN}/${jobs.length} 段成功，耗时 ${Date.now() - tStart}ms`)

    results.forEach((r, i) => {
      if (!r) return
      const job = jobs[i]!
      L.push(`▸ ${job.label}：`)
      L.push(r)
    })
    if (L.length <= 4) return ''
    L.push('（以上为仓库原始披露值；某表 0 行表示该维度「无记录」，与「未获取」不同，报告中须区分。exec_money 等金额字段单位以数值本身的量级判断，拿不准时写「元」。）')
    return L.join('\n')
  }

  let text = ''
  try {
    text = await Promise.race([
      run(),
      new Promise<string>((resolve) => setTimeout(() => resolve(''), TOTAL_TIMEOUT_MS)),
    ])
  } catch (e: any) {
    console.warn('[ai] Doris 预取失败：', e?.message || e)
    return ''
  }
  if (!text) return ''

  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string)
  cache.set(key, { at: Date.now(), text })
  console.log(`[ai] Doris 预取完成 ${key}（${text.length} 字）`)
  return text
}
