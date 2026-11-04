import { FastifyInstance } from 'fastify'
import { prisma } from '../utils/prisma.js'
import { ok, fail } from '../utils/helper.js'
import { llmChat, llmConfigured, llmChatWithTools, AGENT_SYSTEM, RISK_TRACING_SKILL, ENTERPRISE_PROFILE_SKILL } from '../services/llm.js'
import { DORIS_TOOLS, runDorisTool, toolsAvailable } from '../services/dorisTools.js'
import { prefetchCompanyFacts } from '../services/dorisPrefetch.js'
import { DORIS_SCHEMA_HINT } from '../services/dorisSchemaHint.js'
import { AI_TOOLS, executeTool } from '../services/aiTools.js'
import { buildAnswerFile, detectExportIntent, getExport, stamp } from '../services/aiExport.js'

/** 智能体中文名：用于导出文件的标题与文件名 */
const AGENT_LABEL: Record<string, string> = {
  insight: '企业洞察',
  risk: '风险研判',
  plan: '招商谋划',
  service: '企业服务',
}

/** 未公示字段（null）在提示词里显式标注，避免拼成 "纳税：null 万元" 被模型当成数值误读。
 *  2026-10-26 起 tax / employees / assetTotal / netProfit 允许 null，语义为"年报未公示"。 */
const pub = (v: unknown, unit: string): string =>
  v === null || v === undefined ? '（未公示）' : `${v} ${unit}`

// 四个 AI 智能体的预脚本回复（与前端保持一致）
const SCRIPTED_REPLIES: Record<string, Record<string, string>> = {
  insight: {
    '你好': '您好！我是【产业洞察智能体】，可以为您分析产业结构、重点企业画像和经济运行趋势。请问需要查看哪个方面的分析？',
    '产业分析': '当前庆阳市六大重点产业分布情况：\n1. 石油化工：28家，规上占比 35%\n2. 现代农业：32家，规上占比 18%\n3. 数据信息：21家，增速最快（+27%）\n4. 文化旅游：15家，潜力巨大\n5. 装备制造：12家，龙头带动效应显现\n6. 新能源：12家，固投占比高\n\n建议重点关注数据信息和新能源产业的招商力度。',
    '重点企业': '全市重点企业共 25 家，其中：\n- 营收 10亿+：8 家\n- 纳税 5000万+：12 家\n- 上市/拟上市：5 家\n\n西峰区（10 家）、长庆桥园区（5 家）为主要集聚地。需要查看具体名单吗？',
    '趋势': '近 12 个月趋势摘要：\n· 新增企业数逐月增长，月均 +12 家\n· 招商项目转化率提升 8 个百分点\n· 风险预警总量下降 15%，企业经营整体向好\n· 数字经济类项目增长最快，建议加大招引力度',
  },
  risk: {
    '你好': '您好！我是【风险研判智能体】，可以帮助识别企业经营、财务、司法、信用等九大维度的风险。请问您想查询哪家企业或哪个区域的风险情况？',
    '红色预警': '当前全市红色预警企业共 2 家，均集中在：\n1. XX化工有限公司（财务风险 + 司法风险）\n2. XX贸易有限公司（信用风险 + 税务风险）\n\n建议立即启动专项核查，安排专人跟进。需要查看详细处置方案吗？',
    '财务风险': '财务风险高发信号包括：\n· 资产负债率 > 70%\n· 连续两年经营性现金流为负\n· 存货周转天数 > 180 天\n· 应收账款占营收比 > 40%\n\n平台已自动识别 12 家高财务风险企业，可一键导出清单。',
    '建议': '风险防控建议：\n1. 建立红黄蓝三色分级响应机制\n2. 红色预警 24 小时内派单核查\n3. 橙色预警 72 小时内约谈企业\n4. 黄色预警月度跟踪回访\n5. 蓝色关注季度常规巡检',
  },
  plan: {
    '你好': '您好！我是【招商方案智能体】，可以根据目标产业方向，为您定制招商路径、目标企业清单和招商话术。请问您想招引哪个产业方向？',
    '新能源': '【新能源产业招商方案】\n\n一、目标方向：光伏、风电、储能、氢能\n二、重点区域：长三角、珠三角、京津冀\n三、目标企业（示例）：\n   1. 头部新能源制造企业 5 家\n   2. 储能系统集成商 8 家\n   3. 氢能产业链关键企业 3 家\n四、招商策略：产业链招商 + 场景招商 + 基金招商\n五、政策配套：固投补贴 + 电价优惠 + 场景开放\n\n需要生成详细的目标企业名单吗？',
    '数据信息': '【数据信息产业招商方案】\n\n一、目标方向：算力中心、大数据、人工智能、信创\n二、重点区域：北京、上海、深圳、成都、西安\n三、目标企业：头部云厂商、AI 独角兽、信创企业\n四、招商策略：算力资源换产业 + 场景驱动 + 人才政策\n五、落地载体：大数据产业园、数字经济产业园\n\n建议从算力中心项目切入，带动上下游生态企业集聚。',
    '农业': '【现代农业招商方案】\n\n一、目标方向：农产品深加工、智慧农业、预制菜、种业\n二、重点区域：山东、河南、广东、福建\n三、目标企业：国家级农业龙头、预制菜头部品牌\n四、招商策略：资源禀赋招商 + 农业产业链招商\n五、特色优势：庆阳苹果、小杂粮、肉羊等特色农产品资源丰富',
  },
  service: {
    '你好': '您好！我是【企业服务智能体】，可以为企业提供政策匹配、办事指南、诉求响应等服务。请问有什么可以帮您？',
    '政策': '政策匹配流程：\n1. 告知企业所属行业、规模、核心业务\n2. 我将自动匹配国家、省、市、区县四级政策\n3. 生成申报建议清单，包含申报条件、材料、流程\n\n请简单介绍一下企业情况？',
    '补贴': '常见企业可申报补贴类型：\n· 研发费用加计扣除（国家级，按 100% 加计）\n· 高新技术企业认定（所得税减按 15%）\n· 专精特新中小企业奖励（省级 50-200 万）\n· 稳岗返还补贴（失业保险 30%-60% 返还）\n· 工业固投补贴（市级，按固投 3-5% 补助）\n\n具体能否申报需要结合企业实际情况判断。',
    '办事': '企业开办全流程服务：\n1. 工商注册（1 个工作日）\n2. 公章刻制（0.5 个工作日）\n3. 税务登记（即时办结）\n4. 银行开户（1-2 个工作日）\n5. 社保/公积金开户（即时办结）\n\n全程可在线办理，平台提供帮办代办服务。',
  },
}

const DEFAULT_REPLIES: Record<string, string> = {
  insight: '已记录您的查询。我将基于全市产业数据为您分析，请稍候...\n（演示模式：此为模拟智能体回复，真实系统将对接大模型 API）',
  risk: '正在识别相关风险点...\n（演示模式：此为模拟智能体回复，真实系统将对接风险模型和大模型）',
  plan: '正在生成招商方案...\n（演示模式：此为模拟智能体回复，真实系统将对接产业知识图谱）',
  service: '正在为您匹配相关服务...\n（演示模式：此为模拟智能体回复，真实系统将对接政务服务知识库）',
}

function getReply(agent: string, msg: string): string {
  const replies = SCRIPTED_REPLIES[agent] || {}
  // 关键词匹配
  for (const key of Object.keys(replies)) {
    if (msg.includes(key)) return replies[key]
  }
  return DEFAULT_REPLIES[agent] || DEFAULT_REPLIES.service
}

/* ============================================================
 * 企业名称识别 → 强制启用《企业风险溯源报告》技能
 *
 * 需求（2026-11-04）：企业洞察 / 风险研判两个智能体，只要用户给了企业名称，
 * 就必须走 enterprise-risk-tracing-report 技能的六部分报告，而不是几百字泛评。
 * 这里在代码层做识别，命中即注入技能协议（不依赖模型自觉），
 * 并把已确认的主体（全称+统一社会信用代码）一并给出，省掉一轮「先查主体」。
 * ============================================================ */

/** 智能体中需要强制技能的：企业洞察 / 风险研判 */
// 四个智能体统一生效：命中具体企业即进入对应技能协议（早期仅 insight/risk 生效）
const SKILL_AGENTS = new Set(['insight', 'risk', 'plan', 'service'])

/** 去掉行政区划前缀与组织形式后缀，得到可用于简称匹配的核心词 */
function coreName(name: string): string {
  return String(name)
    .replace(/^(?:(?:甘肃|庆阳|华池|镇原|宁县|正宁|合水|环县|庆城|西峰)(?:省|市|县|区)?)+/, '')
    .replace(/(?:有限责任公司|股份有限公司|有限公司|股份公司|集团|公司)$/g, '')
    .trim()
}

/** 核心词的所有可用别名：逐层剥离尾部通用词 + 前缀子串 */
function nameAliases(name: string): string[] {
  const core = coreName(name)
  const set = new Set<string>([core])
  // 逐层剥离尾部通用词（圣越农牧发展 → 圣越农牧）
  const tails = ['发展', '科技', '实业', '产业', '投资', '控股', '开发', '建设', '工程', '农牧', '农业', '新能源', '技术']
  let cur = core
  for (let guard = 0; guard < 4; guard++) {
    const t = tails.find((x) => cur.endsWith(x) && cur.length - x.length >= 2)
    if (!t) break
    cur = cur.slice(0, -t.length)
    set.add(cur)
  }
  // 前缀子串兜底（4~6 字），覆盖用户只说前几个字的情形
  for (const n of [6, 5, 4]) if (core.length > n) set.add(core.slice(0, n))
  return [...set].filter((s) => s.length >= 4)
}

/**
 * 企业类提问的强制技能路由（四个智能体统一生效）
 * - risk：给了企业名且问风险 → enterprise-risk-tracing-report 六部分溯源报告
 * - profile：给了企业名且问基本情况/概况/详情 → doris-daas-query 口径六部分企业详情
 */
const RISK_INTENT_RE =
  /风险|隐患|预警|异常|涉诉|诉讼|被执行|失信|限高|终本|欠税|处罚|违法|违约|纠纷|黑名单|尽调|尽职调查|能不能合作|可以合作|能否合作|是否稳定/
const PROFILE_INTENT_RE =
  /基本|概况|详情|详细|介绍|简介|档案|资料|是谁|做什么|干什么|主营|业务|规模|股东|股权|法人|法定代表人|注册资本|实缴|成立|地址|经营范围|财务|营收|营业收入|利润|纳税|缴税|从业|员工|人数|专利|商标|资质|多大|多少|实力|背景/

export function detectEnterpriseIntent(text: string): 'risk' | 'profile' | 'none' {
  const t = String(text || '')
  if (RISK_INTENT_RE.test(t)) return 'risk'
  if (PROFILE_INTENT_RE.test(t)) return 'profile'
  // 只提了企业名但没问画像/风险（如「能申报哪些政策」「帮我找匹配的项目」）：
  // 不套六段报告，交回各智能体本职，但保留企业主档上下文
  return 'none'
}

/** 文本里出现「像企业全称」的串，但平台样本库中没有 → 走 Doris 外部检索 */
export function looksLikeCompanyName(text: string): string | null {
  const t = String(text || '')
  const re =
    /[\u4e00-\u9fa5A-Za-z0-9（）()·]{2,30}?(?:股份有限公司|有限责任公司|有限公司|集团有限公司|集团|合作社|合伙企业|研究院|事务所|厂)/g
  const hits = t.match(re) || []
  if (!hits.length) return null
  hits.sort((a, b) => b.length - a.length)
  return hits[0] ?? null
}

export async function detectEnterprise(
  message: string
): Promise<{ id: string; name: string; creditCode: string } | null> {
  const text = String(message || '')
  if (text.length < 2) return null
  const ents = await prisma.enterprise.findMany({
    select: { id: true, name: true, creditCode: true },
  })
  // 1) 全称命中（最长优先，避免短名误吞）
  const full = ents
    .filter((e) => e.name.length >= 3 && text.includes(e.name))
    .sort((a, b) => b.name.length - a.name.length)[0]
  if (full) return full
  // 2) 别名/简称命中：命中串越长越可信
  const hits: { e: (typeof ents)[number]; s: string }[] = []
  for (const e of ents) {
    for (const a of nameAliases(e.name)) {
      if (text.includes(a)) hits.push({ e, s: a })
    }
  }
  hits.sort((a, b) => b.s.length - a.s.length)
  return hits.length ? hits[0].e : null
}

/** 强制技能用：把平台已掌握的企业主档一次性注入，避免模型再花 1-2 轮工具查基础信息 */
async function buildEnterpriseDossier(entId: string): Promise<string> {
  const e: any = await prisma.enterprise.findUnique({
    where: { id: entId },
    include: {
      district: { select: { name: true } },
      industry: { select: { name: true } },
      shareholders: { orderBy: { ratio: 'desc' } },
      judicialCases: { take: 12 },
      records: { take: 12 },
      riskEvents: { take: 10 },
    },
  })
  if (!e) return ''
  const nn = (v: any, u = '') => (v === null || v === undefined ? '未公示' : `${v}${u}`)
  const L: string[] = []
  L.push('【平台已掌握的主档数据——以下字段直接引用，不必再调工具重复查询；未覆盖的维度可用 doris_query 补齐】')
  L.push(`企业：${e.name}｜统一社会信用代码 ${e.creditCode}｜${e.district?.name || '区县未定'}｜${e.industry?.name || '行业未定'}｜${e.scale}｜经营状态 ${e.bizStatus}｜信用状态 ${e.creditStatus}`)
  L.push(`登记：法定代表人 ${e.legal}，成立 ${e.found}，注册资本 ${e.regCapital}`)
  L.push(`国标行业：${[e.nationalIndustryL1, e.nationalIndustry, e.nationalIndustryL3].filter(Boolean).join(' / ') || '未获取'}`)
  L.push(`经营（${e.finYear || '年份未公示'}）：营收 ${nn(e.revenue, '万元')}、纳税 ${nn(e.tax, '万元')}、净利润 ${nn(e.netProfit, '万元')}、总资产 ${nn(e.assetTotal, '万元')}、固投 ${nn(e.investment, '万元')}、用地 ${nn(e.landMu, '亩')}、从业 ${nn(e.employees, '人')}（${e.empYear || '年份未公示'}）、履约率 ${e.performRate}%`)
  L.push(`风险：综合 ${e.riskScore} 分（${e.riskLevel}）；八维 经营${e.riskOp}/财务${e.riskFin}/司法${e.riskLegal}/信用${e.riskCredit}/招投标${e.riskTender}/税务${e.riskTax}/履约${e.riskCommit}/知产${e.riskIp}`)
  L.push(`司法与知产：司法案件 ${e.judicialCount} 件、被执行 ${e.zhixingCount}、失信 ${e.shixinCount}、专利 ${e.patentCount}（发明 ${e.inventionCount}）、商标 ${e.trademarkCount}、招投标 ${e.bidCount}`)
  if (e.shareholders?.length) {
    L.push(`股东：${e.shareholders.map((s: any) => `${s.name} ${s.ratio}%`).join('；')}`)
  }
  if (e.judicialCases?.length) {
    L.push(`司法案件明细（前 ${e.judicialCases.length} 条）：${e.judicialCases
      .map((c: any) => `${c.trialTime || ''} ${c.caseReason || c.title || ''}（${c.partyRole || ''}${c.procedure ? '/' + c.procedure : ''}）`)
      .join('；')}`)
  }
  if (e.records?.length) {
    L.push(`工商记录（前 ${e.records.length} 条）：${e.records
      .map((r: any) => `${r.occurDate || ''} ${r.title}${r.amount ? ' ' + r.amount + '万元' : ''}`)
      .join('；')}`)
  }
  if (e.riskEvents?.length) {
    L.push(`平台已登记风险事件（前 ${e.riskEvents.length} 条）：${e.riskEvents
      .map((r: any) => `${r.foundDate} ${r.dimensionName} ${r.title}`)
      .join('；')}`)
  }
  L.push(
    '以上未列出的维度（对外投资 / 行政处罚 / 欠税公告 / 经营异常 / 纳税信用等级 / 资质证书 / 招投标明细 / 工商变更）平台主档未接入，可用 doris_query 补齐（表名先 doris_list_tables 确认，不要猜）；工具也查不到则写「未获取」，不要凭空推测。'
  )
  return L.join('\n')
}

/* ============================================================
 * 平台实时数据上下文：把真实业务数据注入大模型，避免"凭空作答"
 * 按智能体职责裁剪，控制长度（数百字），减少 token 消耗
 * ============================================================ */
async function buildDataContext(agentType: string): Promise<string> {
  const [ents, inds, dists, policies] = await Promise.all([
    prisma.enterprise.findMany({
      select: {
        name: true, districtId: true, industryId: true, scale: true, isKey: true,
        revenue: true, tax: true, riskScore: true, riskLevel: true,
        riskOp: true, riskFin: true, riskLegal: true, riskCredit: true,
        riskTender: true, riskTax: true, riskCommit: true, riskIp: true,
      },
    }),
    prisma.industry.findMany(),
    prisma.district.findMany(),
    prisma.policy.findMany({ select: { title: true, category: true, level: true, dept: true, summary: true } }),
  ])
  const indName = new Map(inds.map(i => [i.id, i.name]))
  const distName = new Map(dists.map(d => [d.id, d.name]))

  const byInd = new Map<string, { n: number; rev: number; risk: number }>()
  const byDist = new Map<string, { n: number; rev: number }>()
  const lv = { red: 0, orange: 0, yellow: 0, blue: 0 } as Record<string, number>
  let totalRev = 0, totalTax = 0, keyN = 0

  for (const e of ents) {
    // industryId / districtId 可为空（外省招商线索未落地），空值单独归入「未分类 / 区县未定」
    const ik = e.industryId || ''
    const dk = e.districtId || ''
    const i = byInd.get(ik) || { n: 0, rev: 0, risk: 0 }
    i.n++; i.rev += e.revenue; i.risk += e.riskScore
    byInd.set(ik, i)
    const d = byDist.get(dk) || { n: 0, rev: 0 }
    d.n++; d.rev += e.revenue
    byDist.set(dk, d)
    lv[e.riskLevel] = (lv[e.riskLevel] || 0) + 1
    totalRev += e.revenue; totalTax += (e.tax ?? 0)   // tax 为 null = 年报未公示，合计仅含已公示企业
    if (e.isKey) keyN++
  }

  const fmt = (n: number) => (n / 10000).toFixed(1)

  if (agentType === 'insight') {
    const indsTxt = [...byInd.entries()]
      .sort((a, b) => b[1].rev - a[1].rev)
      .map(([k, v]) => `${indName.get(k) || k}：${v.n}家，营收${fmt(v.rev)}亿，均分${Math.round(v.risk / v.n)}`)
      .join('；')
    const distTxt = [...byDist.entries()]
      .map(([k, v]) => `${distName.get(k) || (k ? k : '区县未定')}：${v.n}家`)
      .join('；')
    // 企业级明细：不注入的话，问"某区县哪家企业风险高"只能回答"数据不支持"
    const entTxt = [...ents]
      .sort((a, b) => b.riskScore - a.riskScore)
      .map(e => {
        const dist = distName.get(e.districtId || '') || (e.districtId ? e.districtId : '区县未定')
        const ind = indName.get(e.industryId || '') || (e.industryId ? e.industryId : '未分类')
        const lvl = ({ red: '红', orange: '橙', yellow: '黄', blue: '蓝' } as Record<string, string>)[e.riskLevel] || e.riskLevel
        const key = e.isKey ? '重点' : ''
        return `${e.name}｜${dist}｜${ind}｜${lvl}${e.riskScore}分｜营收${Math.round(e.revenue)}万｜纳税${e.tax == null ? '未公示' : Math.round(e.tax) + '万'}｜${key}`
      })
      .join('\n')
    return [
      `统计口径：全市纳入平台企业 ${ents.length} 家（重点企业 ${keyN} 家）。`,
      `总营收 ${fmt(totalRev)} 亿元，纳税合计 ${fmt(totalTax)} 亿元。`,
      `产业分布：${indsTxt}。`,
      `区县分布：${distTxt}。`,
      `风险分布：红色${lv.red}家 / 橙色${lv.orange}家 / 黄色${lv.yellow}家 / 蓝色${lv.blue}家。`,
      `企业明细（名称｜区县｜行业｜风险等级与综合分｜营收｜纳税｜是否重点，按风险分降序）：`,
      entTxt,
    ].join('\n')
  }

  if (agentType === 'risk') {
    const top = [...ents].sort((a, b) => b.riskScore - a.riskScore).slice(0, 12)
    const topTxt = top.map(e => {
      const dims: [string, number][] = [
        ['经营', e.riskOp], ['财务', e.riskFin], ['司法', e.riskLegal], ['信用', e.riskCredit],
        ['招投标', e.riskTender], ['税务', e.riskTax], ['履约', e.riskCommit], ['知产', e.riskIp],
      ]
      const worst = dims.sort((a, b) => b[1] - a[1]).slice(0, 3).map(d => `${d[0]}${d[1]}`).join('/')
      return `${e.name}（${distName.get(e.districtId || '') || (e.districtId ? e.districtId : '区县未定')}，综合${e.riskScore}分，${e.riskLevel}，高分维度：${worst}）`
    }).join('\n')
    return [
      `全市 ${ents.length} 家企业风险分布：红${lv.red} / 橙${lv.orange} / 黄${lv.yellow} / 蓝${lv.blue}。`,
      `风险最高的企业（综合分从高到低）：`,
      topTxt,
      `说明：数据来自平台八维加权风险模型，分数为模型计算结果。`,
    ].join('\n')
  }

  if (agentType === 'plan') {
    const indsTxt = [...byInd.entries()]
      .sort((a, b) => b[1].n - a[1].n)
      .map(([k, v]) => `${indName.get(k) || k}(${v.n}家)`)
      .join('、')
    return [
      `庆阳市现有产业格局：${indsTxt}。`,
      `全市企业 ${ents.length} 家，总营收 ${fmt(totalRev)} 亿元，重点企业 ${keyN} 家。`,
      `政策库现有 ${policies.length} 条政策，覆盖产业、财税、人才、科技、金融、用地等类别。`,
      `可选择的目标方向：产业链补链强链、新兴产业招引（新能源/数据信息/生物医药）、传统产业升级。`,
    ].join('\n')
  }

  // service：政策库 + 企业画像口径
  const polTxt = policies.slice(0, 14).map(p => `《${p.title}》(${p.category}/${p.level}，${p.dept})`).join('；')
  return [
    `平台政策库共 ${policies.length} 条，代表性政策：${polTxt}。`,
    `企业画像维度：区县、行业、规模（大型/中型/小型/微型）、注册资本、成立日期、八维风险分、履约率。`,
    `政策兑现数据：年度安排金额与已兑现金额可在政策服务页查看。`,
  ].join('\n')
}

export default async function (fastify: FastifyInstance) {
  // 获取对话历史
  fastify.get('/history/:agentType', { preHandler: [fastify.authenticate] }, async (request: any) => {
    const { agentType } = request.params
    const username = request.user.username
    const conv = await prisma.aiConversation.findFirst({
      where: { agentType, username },
      orderBy: { updatedAt: 'desc' },
    })
    const messages = conv ? JSON.parse(conv.messages) : []
    return ok({ messages, agentType })
  })

  // 发送消息（模拟 AI 回复）
  fastify.post('/chat/:agentType', { preHandler: [fastify.authenticate] }, async (request: any) => {
    const { agentType } = request.params
    const { message } = request.body || {} as any
    const username = request.user.username

    if (!message) return fail('请输入消息内容')

    // 先取会话（用于多轮上下文）
    let conv = await prisma.aiConversation.findFirst({
      where: { agentType, username },
      orderBy: { updatedAt: 'desc' },
    })

    // 生成回复：优先大模型（注入平台实时数据），失败回退脚本回复
    let aiReply: string
    let llmUsed = false
    // 企业名称识别：命中平台企业库即对本轮强制启用《企业风险溯源报告》技能
    const skillEnt = SKILL_AGENTS.has(agentType) ? await detectEnterprise(message) : null
    // 意图分流：给了企业名 + 问风险 → 风险溯源；给了企业名 + 问基本情况/详情 → 企业详情（doris-daas-query 口径）
    const skillIntent: 'risk' | 'profile' | 'none' = detectEnterpriseIntent(message)
    const skillName = skillIntent === 'risk' ? 'enterprise-risk-tracing-report' : 'doris-daas-query(企业详情)'
    const skillProto = skillIntent === 'risk' ? RISK_TRACING_SKILL : ENTERPRISE_PROFILE_SKILL
    const extEnt = skillEnt ? null : looksLikeCompanyName(message)
    // 平台主档（88 家）+ Doris 实时取数（任意企业，含库外）——两路并行，互不阻塞
    const [dossier, dorisFacts] = await Promise.all([
      skillEnt ? buildEnterpriseDossier(skillEnt.id) : Promise.resolve(''),
      skillIntent === 'none'
        ? Promise.resolve('')
        : skillEnt
          ? prefetchCompanyFacts({ creditCode: skillEnt.creditCode, companyName: skillEnt.name })
          : extEnt
            ? prefetchCompanyFacts({ companyName: extEnt })
            : Promise.resolve(''),
    ])
    let systemPrompt: string
    if (skillEnt && skillIntent === 'none') {
      // 只提了企业名、问的是政策/项目/服务等本职问题：不套六段报告，只给企业上下文
      systemPrompt = [
        AGENT_SYSTEM[agentType] || AGENT_SYSTEM.service,
        '',
        '【本轮企业上下文（平台主档，可直接引用）】',
        `${skillEnt.name}（统一社会信用代码 ${skillEnt.creditCode}）`,
        '',
        dossier,
      ].join('\n')
      console.log(`[ai] 企业上下文注入（不套技能）→ ${skillEnt.name}`)
    } else if (skillEnt) {
      systemPrompt = [
        AGENT_SYSTEM[agentType] || AGENT_SYSTEM.service,
        '',
        skillProto,
        '',
        '【本轮已锁定分析主体】',
        `${skillEnt.name}（统一社会信用代码 ${skillEnt.creditCode}）`,
        skillIntent === 'risk'
          ? '主体已由平台确认，不必再检索同名企业；请直接围绕该企业完整输出六部分风险溯源报告。'
          : '主体已由平台确认，不必再检索同名企业；请直接围绕该企业完整输出六部分企业详情。',
        dorisFacts ? '数据已备齐（下方「水滴企信 Doris 实时取数」），直接引用即可，不要再调 doris_query，避免重复查询浪费时间。' : '',
        '',
        dossier,
        dorisFacts,
      ].join('\n')
      console.log(`[ai] 强制技能 ${skillName} → ${skillEnt.name}（${skillIntent}，Doris ${dorisFacts ? dorisFacts.length + '字' : '未取到'}）`)
    } else if (extEnt) {
      systemPrompt = [
        AGENT_SYSTEM[agentType] || AGENT_SYSTEM.service,
        '',
        skillProto,
        '',
        '【外部企业检索】',
        `用户提到的「${extEnt}」不在平台样本库内。`,
        dorisFacts
          ? `已在数据仓库命中该企业并预取数据（见下方），直接基于预取结果输出六部分内容，不要再调 doris_query。`
          : '必须先调用 doris_query 按企业名称精确检索该企业（表名不要加库前缀，首选 opt_company_base），基于工具返回结果输出。',
        '任一维度取不到写「未获取」，不得用样本库其他企业的数据顶替，也不得编造。',
        '',
        dorisFacts,
      ].join('\n')
      console.log(`[ai] 外部企业检索 ${skillName} → ${extEnt}（${skillIntent}，Doris ${dorisFacts ? dorisFacts.length + '字' : '未命中'}）`)
    } else {
      systemPrompt = AGENT_SYSTEM[agentType] || AGENT_SYSTEM.service
    }
    if (llmConfigured()) {
      try {
        const ctx = await buildDataContext(agentType)
        const history = conv
          ? JSON.parse(conv.messages)
              .filter((m: any) => m.role === 'user' || m.role === 'assistant')
              .slice(-8)
              .map((m: any) => ({ role: m.role, content: String(m.content).slice(0, 600) }))
          : []

        // 工具集：本地 Prisma 查询 + 数据仓库 MCP 深度查询（MCP 未配置时自动降级为仅本地工具）
        const dorisNames = new Set(DORIS_TOOLS.map(t => t.function.name))
        const dorisOn = toolsAvailable()
        const allTools = dorisOn ? [...AI_TOOLS, ...DORIS_TOOLS] : AI_TOOLS

        const msgs: any[] = [
          {
            role: 'system',
            content: [
              systemPrompt,
              '',
              '【平台数据概览】',
              ctx,
              // 表结构速查只在数据仓库可用时注入，省掉「列域→查结构」的 2 轮工具调用
              ...(dorisOn ? ['', DORIS_SCHEMA_HINT] : []),
              '',
              '【工具使用规则】',
              '1. 概览数据只含汇总，若用户问的是具体企业、具体区县的企业名单、某企业的细节，必须调用工具查询，不要凭概览猜测；',
              '2. 查询结果就是权威数据，回答时引用其中的真实数字，不要编造；',
              '3. 工具返回 total 大于 returned 时，说明只看到部分数据，回答中要说明"共 N 家，列举前 M 家"；',
              '4. 工具返回 error 时，如实告知用户数据不支持，不要假装知道。',
              '5. 当问题超出平台样本数据范围（如全市全量企业统计、历史年报、招投标明细、行政处罚明细、跨表关联），使用 doris_query 查询数据仓库；',
              '6. 数据仓库的表名与关键字段已在下方向你提供，直接据此写 SQL；只有速查表里没有的表才调用 doris_list_tables，严禁猜测表名；',
              '7. doris_query 只能执行单条 SELECT，必须填写 purpose 说明查询目的；查询结果同样视为权威数据，不得改写数字；',
              '8. 严禁向用户请示"是否继续取数/请确认口径"——你应当自主完成全部查询步骤后直接给出结论；只有确实查不到数据时才说明缺口。',
              // 平台已内生导出能力：模型若声称"无法生成文件"会和页面上的下载卡片直接矛盾
              '9. 平台已支持把回答一键导出为 PDF / Word：用户要求"导出/下载/生成文件"时，正常给出完整分析内容即可，不要声明"无法生成或导出文件"，也不要建议用户自行复制到 Word 另存。',
            ].join('\n'),
          },
          ...history,
          { role: 'user', content: message },
        ]

        // 工具调用循环：最多 3 轮（速查表已把「列域→结构」压掉，正常是 取数→补一条→结论）
        // 整体软预算 22s：到点用已拿到的结果强制收口，避免用户在 30s+ 白屏等待
        let finalText = ''
        let toolRounds = 0
        const calledTools: string[] = []
        const toolResults: { name: string; text: string }[] = []
        const t0 = Date.now()
        // 整体软预算：常规 25s 收口；强制技能报告篇幅长，放宽到 40s
        const SOFT_BUDGET_MS = skillEnt ? 40000 : 25000

        for (let round = 0; round < 3; round++) {
          const left = SOFT_BUDGET_MS - (Date.now() - t0)
          if (left < 5000) {
            console.warn(`[ai] 软预算用尽（已 ${Math.round((Date.now() - t0) / 1000)}s），转强制收口`)
            break
          }
          let msg: any
          try {
            // 最后一次调用只给剩余预算：超时抛错后直接走收口，不让用户干等
            msg = await llmChatWithTools(msgs, allTools, {
              timeoutMs: Math.max(8000, left),
              maxTokens: skillEnt || extEnt ? 9000 : 6000,
            })
          } catch (llmErr: any) {
            console.warn('[ai] 工具轮调用失败/超时：', llmErr?.message || llmErr)
            break
          }
          const calls = Array.isArray(msg.tool_calls) ? msg.tool_calls : []

          if (!calls.length) {
            finalText = String(msg.content || '').trim()
            break
          }

          toolRounds++
          msgs.push({ role: 'assistant', content: msg.content || '', tool_calls: calls })

          // 同一轮内的多个工具调用并行执行：Doris 查询是 IO 等待，串行会把延迟叠加
          const settled = await Promise.all(calls.map(async (tc: any) => {
            const fname = tc?.function?.name || ''
            let fargs: Record<string, any> = {}
            try {
              fargs = JSON.parse(tc?.function?.arguments || '{}')
            } catch { /* 参数解析失败按空对象处理 */ }
            console.log(`[ai] 工具调用 ${fname} ${JSON.stringify(fargs).slice(0, 200)}`)
            calledTools.push(fname)

            // 工具失败不能中断整轮对话：把错误回灌给模型，让它自行调整或如实告知
            let result: string
            try {
              result = dorisNames.has(fname)
                ? await runDorisTool(fname, fargs)
                : await executeTool(fname, fargs)
            } catch (toolErr: any) {
              console.warn(`[ai] 工具 ${fname} 执行失败：`, toolErr?.message || toolErr)
              result = `工具执行失败：${String(toolErr?.message || toolErr).slice(0, 200)}。可改用其他数据维度回答，或如实告知用户该数据暂不可得。`
            }
            // 单条工具结果限长：4000 字≈30 行明细，足够模型写结论且不撑爆上下文
            return { id: tc.id, fname, text: String(result).slice(0, 4000) }
          }))

          for (const r of settled) {
            msgs.push({ role: 'tool', tool_call_id: r.id, content: r.text })
            toolResults.push({ name: r.fname, text: r.text })
          }
        }
        console.log(`[ai] 工具轮 ${toolRounds} 轮 / 已耗时 ${Math.round((Date.now() - t0) / 1000)}s / 调用 ${calledTools.join(',') || '无'}`)

        // 轮次用尽仍在调用工具时强制收口：用已拿到的结果单独请求一次结论，不再给工具
        if (!finalText && toolResults.length) {
          const digest = toolResults
            .map((t, i) => `【查询${i + 1}：${t.name}】\n${t.text.slice(0, 2500)}`)
            .join('\n\n')
          try {
            finalText = await llmChat(
              [
                { role: 'system', content: systemPrompt },
                {
                  role: 'user',
                  content: `用户问题：${message}\n\n以下是刚从数据仓库查到的真实结果：\n\n${digest}\n\n请基于以上结果直接给出结论，不要再调用工具，不要提及"查询"过程本身。`,
                },
              ],
              { maxTokens: skillEnt || extEnt ? 9000 : 6000 }
            )
            console.log('[ai] 已强制收口生成结论')
          } catch (e: any) {
            console.warn('[ai] 收口失败：', e?.message || e)
          }
        }

        if (!finalText) {
          finalText = '查询已完成，但未能生成结论摘要。请把问题问得更具体一些（例如指明区县、行业或企业名称）。'
        }
        aiReply = finalText
        llmUsed = true
        if (toolRounds) console.log(`[ai] 本次共执行 ${toolRounds} 轮工具调用`)
      } catch (e: any) {
        console.warn('[ai] 大模型调用失败，回退脚本回复：', e?.message || e)
        aiReply = getReply(agentType, message)
      }
    } else {
      aiReply = getReply(agentType, message)
    }

    const userMsg = { role: 'user', content: message, ts: Date.now() }
    const aiMsg = { role: 'assistant', content: aiReply, ts: Date.now() + 1 }

    if (conv) {
      const arr = JSON.parse(conv.messages)
      arr.push(userMsg, aiMsg)
      conv = await prisma.aiConversation.update({
        where: { id: conv.id },
        data: { messages: JSON.stringify(arr) },
      })
    } else {
      conv = await prisma.aiConversation.create({
        data: {
          agentType,
          username,
          messages: JSON.stringify([
            { role: 'assistant', content: `您好！我是【${agentType}智能体】，请问有什么可以帮您？`, ts: Date.now() },
            userMsg, aiMsg,
          ]),
        },
      })
    }

    // 用户明确要文件（"导出/下载 word/pdf"）时，把这条回答同时落成附件返回，
    // 前端渲染成下载卡片；对话文本本身不变，避免"文件+正文"两份内容不一致。
    const files: any[] = []
    const exportFmt = detectExportIntent(message)
    if (exportFmt) {
      try {
        const label = AGENT_LABEL[agentType] || 'AI'
        // 副标题取用户问题的「有效部分」：把"导出成 PDF 给我"这类指令从句子里剔掉，
        // 否则 PDF 抬头会印成「请分析…并导出成 PDF 文件给我」，读起来像工单而不是报告
        const subTitle = String(message)
          .split(/[，,。；;]/)
          .filter((s) => !/(导出|下载|生成|保存|另存|pdf|word|docx|文件|文档)/i.test(s))
          .join('，')
          .trim()
          .slice(0, 60)
        const f = await buildAnswerFile({
          format: exportFmt,
          title: `${label}分析报告`,
          subtitle: subTitle,
          meta: [`智能体：${label}`, `生成时间：${stamp()}`, '数据来源：平台实时数据'],
          markdown: aiReply,
        })
        files.push({
          name: f.name,
          mime: f.mime,
          size: f.size,
          kind: exportFmt,
          url: `/api/ai/export/dl/${f.token}`,
        })
      } catch (e: any) {
        console.warn('[ai] 附件生成失败：', e?.message)
      }
    }

    return ok({
      reply: aiReply,
      messages: JSON.parse(conv.messages),
      llm: llmUsed,
      files,
      // 本轮实际启用的技能（null = 未触发）；前端可据此显示「企业风险溯源报告」标记
      skill: skillEnt ? 'enterprise-risk-tracing-report' : null,
      skillSubject: skillEnt ? { id: skillEnt.id, name: skillEnt.name, creditCode: skillEnt.creditCode } : null,
    })
  })

  // 清空对话
  fastify.post('/clear/:agentType', { preHandler: [fastify.authenticate] }, async (request: any) => {
    const { agentType } = request.params
    const username = request.user.username
    await prisma.aiConversation.deleteMany({ where: { agentType, username } })
    return ok(null, '对话已清空')
  })

  // 前端会话整体同步（引擎层本地生成的预脚本对话持久化，供下次登录恢复）
  fastify.post('/sync/:agentType', { preHandler: [fastify.authenticate] }, async (request: any) => {
    const { agentType } = request.params
    const username = request.user.username
    const { messages } = request.body || {} as any
    if (!Array.isArray(messages)) return fail('messages 必须为数组')

    const conv = await prisma.aiConversation.findFirst({
      where: { agentType, username },
      orderBy: { updatedAt: 'desc' },
    })
    if (conv) {
      await prisma.aiConversation.update({
        where: { id: conv.id },
        data: { messages: JSON.stringify(messages) },
      })
    } else {
      await prisma.aiConversation.create({
        data: { agentType, username, messages: JSON.stringify(messages) },
      })
    }
    return ok(null, '会话已同步')
  })

  /* ============================================================
   * AI 综合研判：针对单个企业生成结构化研判结论
   * 输入企业真实数据 → 大模型 → JSON（summary / strengths / risks / confidence）
   * 前端拿到后覆盖本地预写结论；失败时前端自动回退本地算法结果。
   * ============================================================ */
  fastify.post('/judge', { preHandler: [fastify.authenticate] }, async (request: any) => {
    const { enterpriseId } = request.body || {} as any
    if (!enterpriseId) return fail('缺少 enterpriseId')
    if (!llmConfigured()) return fail('大模型未配置')

    const e = await prisma.enterprise.findUnique({
      where: { id: String(enterpriseId) },
      include: { district: true, industry: true },
    })
    if (!e) return fail('企业不存在')

    const ctx = [
      `企业名称：${e.name}`,
      `统一社会信用代码：${e.creditCode}`,
      `所属区县：${e.district?.name || '—'}；所属行业：${e.industry?.name || '—'}`,
      `成立日期：${e.found}；注册资本：${e.regCapital}；规模：${e.scale}；经营状态：${e.bizStatus}`,
      `年营收：${pub(e.revenue, '万元')}；纳税：${pub(e.tax, '万元')}；固定资产投入：${pub(e.investment, '万元')}；员工：${pub(e.employees, '人')}；用地：${pub(e.landMu, '亩')}`,
      `履约率：${e.performRate}%`,
      `八维风险分（0-100，越高风险越大）：经营 ${e.riskOp}、财务 ${e.riskFin}、司法 ${e.riskLegal}、信用 ${e.riskCredit}、招投标 ${e.riskTender}、税务 ${e.riskTax}、招商履约 ${e.riskCommit}、知识产权 ${e.riskIp}`,
      `综合风险指数：${e.riskScore}（等级 ${e.riskLevel}）`,
      `知识产权：专利 ${e.patentCount} 项（其中发明 ${e.inventionCount} 项）、商标 ${e.trademarkCount} 件`,
      `司法：案件 ${e.judicialCount} 件、被执行 ${e.zhixingCount} 条、失信被执行 ${e.shixinCount} 条`,
      `招投标：参与 ${e.bidCount} 次`,
    ].join('\n')

    const sys = [
      '你是政务招商部门的企业风险研判专家，基于给定企业数据撰写研判结论。',
      '严格只输出 JSON，不要任何解释文字、不要 markdown 代码块包裹，格式如下：',
      '{"summary":"80-150字总体研判","strengths":["优势1","优势2","优势3"],"risks":["风险或建议1","风险或建议2","风险或建议3"],"confidence":85}',
      '硬性要求：只依据给定数据，不得编造未提供的数字或事实；某项为 0 或缺失时表述为“暂无公开记录”；',
      'strengths 与 risks 各 3-5 条，每条不超过 60 字，要具体到数据；confidence 为 60-95 的整数。',
    ].join('\n')

    const started = Date.now()
    try {
      const raw = await llmChat(
        [
          { role: 'system', content: sys },
          { role: 'user', content: ctx },
        ],
        { maxTokens: 6000 }
      )
      const m = raw.match(/\{[\s\S]*\}/)
      if (!m) {
        console.warn('[ai] 研判返回未包含 JSON：', raw.slice(0, 200))
        return fail('大模型返回格式异常')
      }
      const parsed = JSON.parse(m[0])
      const toList = (v: any) =>
        Array.isArray(v) ? v.slice(0, 6).map((x: any) => String(x).slice(0, 200)) : []
      const payload = {
        summary: String(parsed.summary || '').slice(0, 900),
        strengths: toList(parsed.strengths),
        risks: toList(parsed.risks),
        confidence: Math.min(95, Math.max(60, Number(parsed.confidence) || 85)),
      }
      // 落库留痕：judge / risk_assess / policy_match 共用 AiAnalysis 表
      await prisma.aiAnalysis
        .create({
          data: {
            type: 'judge',
            enterpriseId: e.id,
            summary: payload.summary,
            payload: JSON.stringify(payload),
            confidence: payload.confidence,
            degraded: false,
            model: process.env.LLM_MODEL || null,
            latencyMs: Date.now() - started,
            createdBy: request.user?.username || null,
          },
        })
        .catch((err: any) => console.warn('[ai] 研判落库失败：', err?.message))
      return ok({ ...payload, degraded: false, latencyMs: Date.now() - started })
    } catch (err: any) {
      console.warn('[ai] 研判生成失败：', err?.message || err)
      return fail('研判生成失败')
    }
  })

  /* ------------------------------------------------------------
   * AI 风险评估 —— 对八维风险做定性解读
   *
   * 边界（重要）：量化分一律不交给大模型。同一企业同一天必须得到同一分数，
   * LLM 输出会漂移，政务场景过不了复核。LLM 只回答“这个维度为什么高、该怎么处置”，
   * 分数仍由前端八维加权模型计算并展示。
   *
   * 落库：AiAnalysis(type=risk_assess)；degraded=true 表示回退本地算法。
   * ---------------------------------------------------------- */
  fastify.post('/risk-assess', { preHandler: [fastify.authenticate] }, async (request: any) => {
    const { enterpriseId } = (request.body || {}) as any
    if (!enterpriseId) return fail('缺少 enterpriseId')

    const e = await prisma.enterprise.findUnique({
      where: { id: String(enterpriseId) },
      include: { district: true, industry: true },
    })
    if (!e) return fail('企业不存在')

    const DIMS = [
      { key: 'operation', name: '经营风险', weight: 20, v: e.riskOp },
      { key: 'finance', name: '财务风险', weight: 15, v: e.riskFin },
      { key: 'judicial', name: '司法风险', weight: 15, v: e.riskLegal },
      { key: 'credit', name: '信用风险', weight: 15, v: e.riskCredit },
      { key: 'tender', name: '招投标风险', weight: 10, v: e.riskTender },
      { key: 'tax', name: '税务风险', weight: 10, v: e.riskTax },
      { key: 'perform', name: '招商履约风险', weight: 10, v: e.riskCommit },
      { key: 'ip', name: '知识产权风险', weight: 5, v: e.riskIp },
    ]

    const started = Date.now()
    const ctx = [
      `企业名称：${e.name}`,
      `所属区县：${e.district?.name || '—'}；所属行业：${e.industry?.name || '—'}`,
      `成立日期：${e.found}；注册资本：${e.regCapital}；规模：${e.scale}；经营状态：${e.bizStatus}`,
      `年营收：${pub(e.revenue, '万元')}；纳税：${pub(e.tax, '万元')}；固定资产投入：${pub(e.investment, '万元')}；员工：${pub(e.employees, '人')}`,
      `履约率：${e.performRate}%`,
      '八维风险分（0-100，数值越高风险越大）：',
      ...DIMS.map((d) => `  ${d.name}（权重${d.weight}%）：${d.v}`),
      `综合风险指数：${e.riskScore}（等级 ${e.riskLevel}）`,
      `知识产权：专利 ${e.patentCount} 项（发明 ${e.inventionCount}）、商标 ${e.trademarkCount} 件`,
      `司法：案件 ${e.judicialCount} 件、被执行 ${e.zhixingCount} 条、失信被执行 ${e.shixinCount} 条`,
      `招投标：参与 ${e.bidCount} 次`,
    ].join('\n')

    const sys = [
      '你是政务招商部门的企业风险评估专家。基于给定的八维风险分与经营数据，逐维度做定性判断并给出总体结论。',
      '严格只输出 JSON，不要任何解释文字、不要 markdown 代码块包裹，格式：',
      '{"summary":"80-150字总体判断","dimensions":[{"key":"operation","comment":"不超过40字的具体判断","level":"high"}],"topRisks":["不超过60字","不超过60字"],"advice":["不超过50字","不超过50字","不超过50字"],"confidence":85}',
      '硬性要求：',
      `1. dimensions 必须完整覆盖这 8 个 key 且顺序不变：${DIMS.map((d) => d.key).join(', ')}`,
      '2. level 只能是 high / medium / low，按该维度分数判断：>=60 为 high，>=35 为 medium，其余 low',
      '3. comment 必须引用给定数据里的具体数值或事实，不得编造；数据为 0 或缺失时写“暂无公开记录”',
      '4. 不要输出任何风险分数——分数由平台模型计算，你只做定性解读',
      '5. topRisks 与 advice 各 2-4 条，每条不超过 60 字；confidence 为 60-95 的整数',
    ].join('\n')

    let result: any = null
    let degraded = false
    let summary = ''
    let reason = ''
    try {
      if (!llmConfigured()) throw new Error('大模型未配置')
      const raw = await llmChat(
        [
          { role: 'system', content: sys },
          { role: 'user', content: ctx },
        ],
        { maxTokens: 6000 }
      )
      const m = raw.match(/\{[\s\S]*\}/)
      if (!m) throw new Error('返回未包含 JSON')
      const parsed = JSON.parse(m[0])

      // 维度以服务端 DIMS 为准：LLM 漏项按本地分数补 level，多项直接忽略
      const byKey = new Map<string, any>()
      for (const d of parsed.dimensions || []) {
        if (d && d.key) byKey.set(String(d.key), d)
      }
      const dimensions = DIMS.map((d) => {
        const got = byKey.get(d.key)
        const lvl =
          got && ['high', 'medium', 'low'].includes(String(got.level))
            ? String(got.level)
            : d.v >= 60
              ? 'high'
              : d.v >= 35
                ? 'medium'
                : 'low'
        return {
          key: d.key,
          name: d.name,
          score: d.v,
          level: lvl,
          comment: String(got?.comment || '').slice(0, 120),
        }
      })
      const toList = (v: any, n: number) =>
        Array.isArray(v) ? v.slice(0, n).map((x: any) => String(x).slice(0, 200)) : []

      summary = String(parsed.summary || '').slice(0, 900)
      if (!summary) throw new Error('summary 为空')
      result = {
        summary,
        dimensions,
        topRisks: toList(parsed.topRisks, 4),
        advice: toList(parsed.advice, 4),
        confidence: Math.min(95, Math.max(60, Number(parsed.confidence) || 85)),
      }
    } catch (err: any) {
      degraded = true
      reason = err?.message || String(err)
      console.warn('[ai] 风险评估降级：', reason)
    }

    const latencyMs = Date.now() - started
    const createdBy = request.user?.username || null

    if (!result) {
      // 降级：落库留痕但不阻断前端（前端回退本地算法，界面不提示来源差异）
      await prisma.aiAnalysis
        .create({
          data: {
            type: 'risk_assess',
            enterpriseId: e.id,
            summary: `[降级] ${e.name} 风险评估回退本地规则`,
            payload: JSON.stringify({ degraded: true, reason }),
            confidence: 0,
            degraded: true,
            model: null,
            latencyMs,
            createdBy,
          },
        })
        .catch(() => {})
      return fail('大模型不可用')
    }

    await prisma.aiAnalysis
      .create({
        data: {
          type: 'risk_assess',
          enterpriseId: e.id,
          summary,
          payload: JSON.stringify(result),
          confidence: result.confidence,
          degraded: false,
          model: process.env.LLM_MODEL || null,
          latencyMs,
          createdBy,
        },
      })
      .catch((err: any) => console.warn('[ai] 风险评估落库失败：', err?.message))

    return ok({ ...result, degraded, latencyMs })
  })

  /* ------------------------------------------------------------
   * AI 政策智能匹配 —— 规则召回 + 大模型精排
   *
   * 为什么两段式：
   *   把 79 家全量喂给 LLM 约 16K 字，慢且贵，模型还容易忽略中段条目；
   *   纯规则打分又只能给出千篇一律的理由，失去“AI 匹配”的意义。
   *   规则负责“别漏”（缩到 12 家候选），LLM 负责“说清为什么是这几家”。
   *
   * 落库：AiAnalysis(type=policy_match, policyId)；degraded=true 表示仅规则召回。
   * ---------------------------------------------------------- */
  fastify.post('/policy-match', { preHandler: [fastify.authenticate] }, async (request: any) => {
    const body = (request.body || {}) as any
    const { policyId, policy: inlinePolicy } = body
    const topN = Math.min(10, Math.max(1, Number(body.limit) || 5))
    if (!policyId && !inlinePolicy) return fail('缺少 policyId 或 policy')

    let p: any = null
    if (policyId) {
      p = await prisma.policy.findUnique({
        where: { id: String(policyId) },
        include: { industry: true },
      })
    }

    // 前端「同步政策」加入的新政策是本地数据（code 如 P27），尚未落库，
    // 数据库里查不到。此时以请求体携带的政策内容为准，避免整条链路降级。
    if (!p && inlinePolicy && (inlinePolicy.name || inlinePolicy.title)) {
      p = {
        id: String(policyId || 'inline'),
        title: String(inlinePolicy.name || inlinePolicy.title).slice(0, 200),
        category: String(inlinePolicy.type || inlinePolicy.category || '产业'),
        level: String(inlinePolicy.level || 'municipal'),
        dept: String(inlinePolicy.dept || '—'),
        target: String(inlinePolicy.tag || inlinePolicy.target || ''),
        support: String(inlinePolicy.support || ''),
        summary: String(inlinePolicy.brief || inlinePolicy.apply || inlinePolicy.summary || ''),
        industryId: null,
        industry: null,
      }
    }
    if (!p) return fail('政策不存在')

    const ents = await prisma.enterprise.findMany({
      include: { district: true, industry: true },
    })
    if (!ents.length) return fail('企业库为空')

    // ---- 第一段：规则召回（粗排，保证不漏且稳定可复现）----
    const scored = ents.map((e) => {
      let s = 0
      const why: string[] = []
      if (p.industryId && e.industryId === p.industryId) {
        s += 40
        why.push('所属行业与政策方向直接对应')
      }
      if (e.riskLevel === 'blue') {
        s += 18
        why.push('经营稳健、信用优良')
      } else if (e.riskLevel === 'yellow') {
        s += 13
        why.push('经营状况整体良好')
      } else if (e.riskLevel === 'orange') {
        s += 7
      } else {
        s += 3
      }
      if (e.scale === '大型') {
        s += 20
        why.push('企业规模达标，具备申报主体资格')
      } else if (e.scale === '中型') {
        s += 16
        why.push('企业规模符合申报门槛')
      } else if (e.scale === '小型') {
        s += 10
        why.push('小微企业可适用专项扶持条款')
      } else {
        s += 6
      }
      if (e.revenue > 10000) {
        s += 14
        why.push('营收规模较大，政策撬动效应显著')
      } else if (e.revenue > 3000) {
        s += 10
      } else if (e.revenue > 500) {
        s += 6
      } else {
        s += 3
      }
      if (e.isKey) {
        s += 8
        why.push('属重点培育企业')
      }
      return { e, ruleScore: s, ruleWhy: why }
    })
    scored.sort((a, b) => b.ruleScore - a.ruleScore)
    const candidates = scored.slice(0, 12)

    const started = Date.now()
    const ctx = [
      `政策名称：${p.title}`,
      `政策类别：${p.category}；级别：${p.level}；发布部门：${p.dept}`,
      `适用对象：${p.target || '—'}`,
      `支持方式：${p.support || '—'}`,
      `政策摘要：${p.summary || '—'}`,
      p.industry ? `对口行业：${p.industry.name}` : '对口行业：不限',
      '',
      '候选企业（已按规则粗筛）：',
      ...candidates.map(
        (c, i) =>
          `${i + 1}. id=${c.e.id}｜${c.e.name}｜招商产业：${c.e.industry?.name || '—'}｜国标行业：${c.e.nationalIndustry || '暂无'}｜${c.e.scale}｜营收 ${pub(c.e.revenue, '万元')}｜风险等级 ${c.e.riskLevel}｜员工 ${pub(c.e.employees, '人')}${c.e.isKey ? '｜重点企业' : ''}`
      ),
    ].join('\n')

    const sys = [
      '你是政务招商部门的政策匹配专家。从候选企业中挑出最适合申报该政策的企业，并说明理由。',
      '严格只输出 JSON，不要解释文字、不要 markdown 代码块包裹，格式：',
      `{"summary":"60-120字总体匹配说明","matches":[{"id":"候选企业id","fit":92,"reasons":["不超过40字","不超过40字"]}]}`,
      '硬性要求：',
      `1. matches 最多 ${topN} 条，按适合程度从高到低排序`,
      '2. id 必须原样取自候选列表里的 id，不得自造，也不得选择列表外的企业',
      '3. reasons 每条 1-3 句，必须引用该企业的具体数据（行业/规模/营收/风险等级）说明为什么符合该政策',
      '4. fit 为 60-98 的整数，表示匹配度',
      '5. 不得编造候选列表里没有的数字或事实',
    ].join('\n')

    let result: any = null
    let degraded = false
    let summary = ''
    let reason = ''
    try {
      if (!llmConfigured()) throw new Error('大模型未配置')
      const raw = await llmChat(
        [
          { role: 'system', content: sys },
          { role: 'user', content: ctx },
        ],
        { maxTokens: 6000 }
      )
      const m = raw.match(/\{[\s\S]*\}/)
      if (!m) throw new Error('返回未包含 JSON')
      const parsed = JSON.parse(m[0])

      // 只接受候选列表内的 id，杜绝模型幻觉出不存在或不相关的企业
      const candMap = new Map(candidates.map((c) => [c.e.id, c]))
      const matches: any[] = []
      for (const item of parsed.matches || []) {
        const hit = candMap.get(String(item?.id))
        if (!hit) continue
        if (matches.some((x) => x.enterpriseId === hit.e.id)) continue
        matches.push({
          enterpriseId: hit.e.id,
          name: hit.e.name,
          district: hit.e.district?.name || '',
          industry: hit.e.industry?.name || '',
          nationalIndustry: hit.e.nationalIndustry || null,   // 官方国标行业（真实）
          scale: hit.e.scale,
          revenue: hit.e.revenue,
          riskLevel: hit.e.riskLevel,
          fit: Math.min(98, Math.max(60, Number(item.fit) || hit.ruleScore)),
          reasons: Array.isArray(item.reasons)
            ? item.reasons.slice(0, 3).map((r: any) => String(r).slice(0, 120))
            : hit.ruleWhy,
        })
        if (matches.length >= topN) break
      }
      if (!matches.length) throw new Error('未返回有效匹配')

      summary = String(parsed.summary || '').slice(0, 600)
      result = { summary, matches, candidateCount: candidates.length, policyId: p.id, policyTitle: p.title }
    } catch (err: any) {
      degraded = true
      reason = err?.message || String(err)
      console.warn('[ai] 政策匹配降级：', reason)
      // 降级：直接用规则粗排前 N 家，理由取自规则命中项
      const matches = candidates.slice(0, topN).map((c) => ({
        enterpriseId: c.e.id,
        name: c.e.name,
        district: c.e.district?.name || '',
        industry: c.e.industry?.name || '',
        scale: c.e.scale,
        revenue: c.e.revenue,
        riskLevel: c.e.riskLevel,
        fit: Math.min(98, Math.max(60, Math.round(c.ruleScore * 0.9))),
        reasons: c.ruleWhy.length ? c.ruleWhy : ['按规模与信用等级规则匹配'],
      }))
      summary = `按行业、规模、信用与营收规则完成匹配，共筛出 ${matches.length} 家候选企业。`
      result = { summary, matches, candidateCount: candidates.length, policyId: p.id, policyTitle: p.title }
    }

    const latencyMs = Date.now() - started
    const createdBy = request.user?.username || null

    await prisma.aiAnalysis
      .create({
        data: {
          type: 'policy_match',
          policyId: p.id,
          summary,
          payload: JSON.stringify(result),
          confidence: degraded ? 0 : 85,
          degraded,
          model: degraded ? null : process.env.LLM_MODEL || null,
          latencyMs,
          createdBy,
        },
      })
      .catch((err: any) => console.warn('[ai] 政策匹配落库失败：', err?.message))

    return ok({ ...result, degraded, latencyMs })
  })

  /* ------------------------------------------------------------
   * AI 招商项目智能推荐 —— 基于真实外部企业池
   *
   * 数据源：ProspectEnterprise（Doris 官方工商+国标行业导出）：
   *   西北 6 省排除庆阳、存续、注册资本 5000万-5亿、属庆阳重点产业国标二级行业。
   *   原实现用 mock.js 里 18 家虚构线索（华为/宁德时代等虚构落地项目），已废弃——
   *   喂虚构数据给大模型，只会得到一本正经的假结论。
   *
   * 轮转：按 recommended 升序取，多次点击推荐不同企业，全轮完才重复。
   * 落库：AiAnalysis(type=project_recommend)。
   * ---------------------------------------------------------- */
  fastify.post('/project-recommend', { preHandler: [fastify.authenticate] }, async (request: any) => {
    const body = (request.body || {}) as any
    const topN = Math.min(10, Math.max(1, Number(body.limit) || 5))
    const poolSize = Math.min(20, Math.max(topN, Number(body.pool) || 12))

    const total = await prisma.prospectEnterprise.count()
    if (!total) return fail('候选企业池为空，请先执行 npm run seed')

    // 取候选：先按轮转顺序取一批，再按国标二级行业分散（同行业最多 2 家）。
    // 否则按注册资本排序会让高资本行业（如化学原料）扎堆，推荐结果缺多样性。
    const rawPool = await prisma.prospectEnterprise.findMany({
      orderBy: [{ recommended: 'asc' }, { regCapital: 'desc' }],
      take: Math.min(400, poolSize * 12),
    })
    const perInd = new Map<string, number>()
    const candidates: typeof rawPool = []
    for (const c of rawPool) {
      const k = c.industryL2 || '未分类'
      const n = perInd.get(k) || 0
      if (n >= 2) continue
      perInd.set(k, n + 1)
      candidates.push(c)
      if (candidates.length >= poolSize) break
    }

    const started = Date.now()
    const ctx = [
      '庆阳市重点招商产业方向：新能源及装备制造、数据要素与数字经济、生物医药、现代农业及农副食品加工、石油化工与精细化工、文旅创意。',
      '庆阳区位：甘肃省东部，能源资源富集，正在建设全国一体化算力网络国家枢纽节点（东数西算）。',
      '',
      '候选企业（均为西北地区真实存续企业，已按可招引规模筛选）：',
      ...candidates.map(
        (c, i) =>
          `${i + 1}. id=${c.id}｜${c.name}｜${c.province}${c.city}｜国标行业：${c.industryL2 || '—'}｜注册资本 ${(c.regCapital / 10000).toFixed(2)} 亿元｜成立 ${c.foundDate || '—'}${c.bizScope ? `｜经营范围：${c.bizScope.slice(0, 60)}` : ''}`
      ),
    ].join('\n')

    const sys = [
      '你是庆阳市招商部门的产业招商专家。从候选企业中挑出最适合引进庆阳的企业，并给出接洽建议。',
      '严格只输出 JSON，不要解释文字、不要 markdown 代码块包裹，格式：',
      '{"summary":"60-120字总体判断","recommendations":[{"id":"候选企业id","score":88,"reasons":["不超过50字","不超过50字"],"approach":"不超过40字的接洽切入点"}]}',
      '硬性要求：',
      `1. recommendations 最多 ${topN} 条，按推荐优先级从高到低排序`,
      '2. id 必须原样取自候选列表里的 id，不得自造，也不得选择列表外的企业',
      '3. score 为 60-98 的整数，表示与庆阳产业方向的契合度',
      '4. reasons 每条必须引用该企业的具体数据（国标行业、注册资本、所在地、经营范围）说明为什么适合庆阳',
      '5. approach 给出可执行的接洽切入点（如产业链缺环、算力需求、原料就近供应、市场辐射）',
      '6. 不得编造候选列表以外的信息，也不得臆测企业投资意向',
    ].join('\n')

    let result: any = null
    let degraded = false
    let summary = ''
    let reason = ''
    try {
      if (!llmConfigured()) throw new Error('大模型未配置')
      const raw = await llmChat(
        [
          { role: 'system', content: sys },
          { role: 'user', content: ctx },
        ],
        { maxTokens: 6000 }
      )
      const m = raw.match(/\{[\s\S]*\}/)
      if (!m) throw new Error('返回未包含 JSON')
      const parsed = JSON.parse(m[0])

      const byId = new Map(candidates.map((c) => [c.id, c]))
      const recs: any[] = []
      for (const item of parsed.recommendations || []) {
        const hit = byId.get(Number(item?.id))
        if (!hit) continue
        if (recs.some((x) => x.id === hit.id)) continue
        recs.push({
          id: hit.id,
          name: hit.name,
          province: hit.province,
          city: hit.city,
          industryL2: hit.industryL2,
          regCapital: hit.regCapital,
          foundDate: hit.foundDate,
          score: Math.min(98, Math.max(60, Number(item.score) || 75)),
          reasons: Array.isArray(item.reasons)
            ? item.reasons.slice(0, 3).map((r: any) => String(r).slice(0, 140))
            : [],
          approach: String(item.approach || '').slice(0, 120),
        })
        if (recs.length >= topN) break
      }
      if (!recs.length) throw new Error('未返回有效推荐')

      summary = String(parsed.summary || '').slice(0, 600)
      result = { summary, recommendations: recs, poolSize: total }
    } catch (err: any) {
      degraded = true
      reason = err?.message || String(err)
      console.warn('[ai] 招商推荐降级：', reason)
      // 降级：按注册资本排序直接给前 N 家，理由标注为规则筛选
      const recs = candidates.slice(0, topN).map((c) => ({
        id: c.id,
        name: c.name,
        province: c.province,
        city: c.city,
        industryL2: c.industryL2,
        regCapital: c.regCapital,
        foundDate: c.foundDate,
        score: 70,
        reasons: [`${c.province}${c.city}${c.industryL2 || ''}企业，注册资本 ${(c.regCapital / 10000).toFixed(2)} 亿元`],
        approach: '建议由招商专员电话初访，核实扩产或区域布局计划',
      }))
      summary = `已按行业与注册资本规则筛选出 ${recs.length} 家候选企业。`
      result = { summary, recommendations: recs, poolSize: total }
    }

    const latencyMs = Date.now() - started
    const createdBy = request.user?.username || null

    // 记录推荐次数，驱动轮转
    const ids = (result.recommendations || []).map((r: any) => r.id)
    if (ids.length && !degraded) {
      await prisma.prospectEnterprise
        .updateMany({ where: { id: { in: ids } }, data: { recommended: { increment: 1 } } })
        .catch(() => {})
    }

    await prisma.aiAnalysis
      .create({
        data: {
          type: 'project_recommend',
          summary,
          payload: JSON.stringify(result),
          confidence: degraded ? 0 : 85,
          degraded,
          model: degraded ? null : process.env.LLM_MODEL || null,
          latencyMs,
          createdBy,
        },
      })
      .catch((err: any) => console.warn('[ai] 招商推荐落库失败：', err?.message))

    return ok({ ...result, degraded, latencyMs })
  })

  /* ---------------- AI 回答导出（PDF / Word） ----------------
   * 前端「下载 PDF」「下载 Word」按钮打这里；对话接口生成的附件也复用同一份 buf。
   * 走 POST 而不是 GET：正文可能有几千字，塞 query 会撞 URL 长度限制。
   */

  function sendFile(reply: any, f: { name: string; mime: string; buf: Buffer }) {
    const ascii = f.name.replace(/[^\x20-\x7E]/g, '_')
    return reply
      .header('Content-Type', f.mime)
      .header('Content-Length', String(f.buf.length))
      .header('Content-Disposition', `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(f.name)}`)
      .header('Cache-Control', 'no-store')
      .send(f.buf)
  }

  fastify.post('/export/:format', { preHandler: [fastify.authenticate] }, async (request: any, reply: any) => {
    const format = String(request.params?.format || '').toLowerCase()
    if (format !== 'pdf' && format !== 'docx') return fail('仅支持 pdf / docx')
    const body = request.body || {}
    const markdown = typeof body.markdown === 'string' ? body.markdown : ''
    if (!markdown.trim()) return fail('导出内容为空')
    try {
      const f = await buildAnswerFile({
        format,
        title: body.title || 'AI 分析报告',
        subtitle: body.subtitle || '',
        meta: Array.isArray(body.meta) ? body.meta.map(String) : [],
        markdown,
      })
      return sendFile(reply, f)
    } catch (e: any) {
      console.warn('[ai] 导出失败：', e?.message)
      return fail(`导出失败：${e?.message || '未知错误'}`)
    }
  })

  fastify.get('/export/dl/:token', { preHandler: [fastify.authenticate] }, async (request: any, reply: any) => {
    const f = getExport(String(request.params?.token || ''))
    if (!f) return fail('文件已过期，请重新导出')
    return sendFile(reply, f)
  })
}
