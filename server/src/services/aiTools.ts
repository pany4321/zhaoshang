/* ============================================================
 * 网页智能体的工具层（第一阶段：仅 Prisma 本地查询，不接外部 MCP）
 *
 * 设计原则：
 *   1. 只读 —— 只开放查询，不做任何写操作
 *   2. 语义化 —— 不把裸 SQL 暴露给模型，而是封装成业务语义工具
 *   3. 限量 —— 每次返回条数与字段都做裁剪，避免 context 爆炸
 *   4. 可审计 —— 每次调用记录工具名与入参
 * ============================================================ */
import { prisma } from '../utils/prisma.js'
import type { ToolDef } from './llm.js'

export const AI_TOOLS: ToolDef[] = [
  {
    type: 'function',
    function: {
      name: 'query_enterprises',
      description:
        '按条件查询平台内企业列表。用于回答"某区县有哪些企业""哪家企业风险最高""某行业有多少家企业"等问题。返回名称、区县、行业、风险等级、风险分、营收、纳税、规模、是否重点。',
      parameters: {
        type: 'object',
        properties: {
          district: {
            type: 'string',
            description: '区县名称，可选值：西峰区、庆城县、环县、华池县、合水县、正宁县、宁县、镇原县',
          },
          industry: { type: 'string', description: '行业名称关键字，如 石油化工、新能源、软件、农业' },
          riskLevel: { type: 'string', enum: ['red', 'orange', 'yellow', 'blue'], description: '风险等级' },
          isKey: { type: 'boolean', description: '是否只看重点企业' },
          keyword: { type: 'string', description: '企业名称关键字（模糊匹配）' },
          sortBy: { type: 'string', enum: ['riskScore', 'revenue', 'tax'], description: '排序字段，默认按风险分降序' },
          limit: { type: 'number', description: '返回条数，默认 15，最大 30' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_enterprise_detail',
      description:
        '查询单个企业的完整画像：工商照面、八维风险分、财务数据（营收/纳税/资产/净利）、知识产权、司法案件、行政处罚/经营异常等档案记录、主要股东。回答"某企业情况如何""为什么它风险高"时使用。',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '企业名称，支持模糊匹配' },
        },
        required: ['name'],
      },
    },
  },
]

const RISK_LABEL: Record<string, string> = { red: '红色', orange: '橙色', yellow: '黄色', blue: '蓝色' }

/** 执行一次工具调用，返回 JSON 字符串（供回灌模型） */
export async function executeTool(name: string, args: Record<string, any>): Promise<string> {
  try {
    if (name === 'query_enterprises') return await queryEnterprises(args)
    if (name === 'get_enterprise_detail') return await getEnterpriseDetail(args)
    return JSON.stringify({ error: `未知工具：${name}` })
  } catch (e: any) {
    return JSON.stringify({ error: `工具执行失败：${e?.message || e}` })
  }
}

async function queryEnterprises(args: Record<string, any>): Promise<string> {
  const where: any = {}
  const limit = Math.min(Math.max(Number(args.limit) || 15, 1), 30)

  if (args.district) {
    const d = await prisma.district.findFirst({ where: { name: String(args.district) } })
    if (!d) {
      const all = await prisma.district.findMany({ select: { name: true } })
      return JSON.stringify({
        error: `区县不存在：${args.district}`,
        availableDistricts: all.map(x => x.name),
      })
    }
    where.districtId = d.id
  }
  if (args.industry) {
    const inds = await prisma.industry.findMany({ select: { id: true, name: true } })
    const hit = inds.filter(i => i.name.includes(String(args.industry)))
    if (!hit.length) return JSON.stringify({ error: `行业不存在：${args.industry}`, availableIndustries: inds.map(i => i.name) })
    where.industryId = { in: hit.map(i => i.id) }
  }
  if (args.riskLevel) where.riskLevel = String(args.riskLevel)
  if (typeof args.isKey === 'boolean') where.isKey = args.isKey
  if (args.keyword) where.name = { contains: String(args.keyword) }

  const sortField = ['riskScore', 'revenue', 'tax'].includes(String(args.sortBy)) ? String(args.sortBy) : 'riskScore'
  const rows = await prisma.enterprise.findMany({
    where,
    orderBy: { [sortField]: 'desc' },
    take: limit,
    include: { district: { select: { name: true } }, industry: { select: { name: true } } },
  })

  const total = await prisma.enterprise.count({ where })
  return JSON.stringify({
    total,
    returned: rows.length,
    note: total > rows.length ? `共 ${total} 家，仅返回排序后前 ${rows.length} 家` : undefined,
    enterprises: rows.map(e => ({
      name: e.name,
      district: e.district?.name,
      industry: e.industry?.name,
      riskLevel: RISK_LABEL[e.riskLevel] || e.riskLevel,
      riskScore: e.riskScore,
      revenueWan: Math.round(e.revenue),
      taxWan: Math.round(e.tax),
      scale: e.scale,
      isKey: e.isKey,
      patentCount: e.patentCount,
      judicialCount: e.judicialCount,
      shixinCount: e.shixinCount,
    })),
  })
}

async function getEnterpriseDetail(args: Record<string, any>): Promise<string> {
  const name = String(args.name || '').trim()
  if (!name) return JSON.stringify({ error: '缺少企业名称' })

  const rows = await prisma.enterprise.findMany({
    where: { name: { contains: name } },
    include: {
      district: { select: { name: true } },
      industry: { select: { name: true } },
      shareholders: { orderBy: { sort: 'asc' }, take: 8 },
      records: { orderBy: [{ type: 'asc' }, { occurDate: 'desc' }], take: 12 },
    },
    take: 3,
  })

  if (!rows.length) return JSON.stringify({ error: `未找到企业：${name}`, hint: '可先用 query_enterprises 按关键字检索' })
  const e: any = rows[0]

  return JSON.stringify({
    matched: rows.length,
    name: e.name,
    creditCode: e.creditCode,
    legal: e.legal,
    found: e.found,
    scale: e.scale,
    bizStatus: e.bizStatus,
    regCapital: e.regCapital,
    district: e.district?.name,
    industry: e.industry?.name,
    isKey: e.isKey,
    finance: {
      year: e.finYear,
      revenueWan: Math.round(e.revenue),
      taxWan: Math.round(e.tax),
      assetTotalWan: Math.round(e.assetTotal),
      netProfitWan: Math.round(e.netProfit),
      source: e.finYear ? '工商年报公示值' : '无公开年报，系统按注册资本推算',
    },
    risk: {
      score: e.riskScore,
      level: RISK_LABEL[e.riskLevel] || e.riskLevel,
      dims: {
        经营: e.riskOp, 财务: e.riskFin, 司法: e.riskLegal, 信用: e.riskCredit,
        招投标: e.riskTender, 税务: e.riskTax, 招商履约: e.riskCommit, 知识产权: e.riskIp,
      },
    },
    ip: { patent: e.patentCount, invention: e.inventionCount, trademark: e.trademarkCount },
    judicial: { cases: e.judicialCount, zhixing: e.zhixingCount, shixin: e.shixinCount, bids: e.bidCount },
    shareholders: (e.shareholders || []).map((s: any) => ({ name: s.name, ratio: s.ratio })),
    records: (e.records || []).map((r: any) => ({
      type: r.type, title: r.title, date: r.occurDate,
      detail: r.detail ? String(r.detail).slice(0, 200) : null,
    })),
  })
}
