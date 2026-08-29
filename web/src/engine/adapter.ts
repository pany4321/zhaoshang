// ============================================================
// 服务器数据 → demo 引擎（window.MOCK）形状适配层
// demo 的数据引擎按"企业/事件/项目/任务/政策"五类明细推导全部派生结构
// （聚合、图谱、AI 日报等），本层只负责把 server 实体映射成明细形状，
// 派生部分交给 MOCK_ENGINE.rebuild 重算，保证口径与纯前端版一致。
// ============================================================

// —— 服务器原始类型（/api/bootstrap 下发） ——
export interface RawShareholder { name: string; ratio: number; sort: number }
export interface RawEnterprise {
  id: string; name: string; creditCode: string; legal: string; found: string;
  scale: string; bizStatus: string; creditStatus: string; regCapital: string;
  districtId: string; industryId: string; isKey: boolean; isNew: boolean; newDate: string | null;
  revenue: number; tax: number; investment: number; employees: number; landMu: number;
  performRate: number; commitRate: number | null;
  riskScore: number; riskLevel: string;
  riskOp: number; riskFin: number; riskLegal: number; riskCredit: number;
  riskTender: number; riskTax: number; riskCommit: number; riskIp: number;
  shareholders: RawShareholder[];
  district: { id: string; name: string };
  industry: { id: string; name: string };
}
export interface RawRiskEvent {
  id: string; title: string; dimension: string; dimensionName: string;
  level: string; status: string; enterpriseId: string; districtId: string;
  foundDate: string; detail: string; suggestion: string;
  enterprise: { id: string; name: string };
}
export interface RawProject {
  id: string; name: string; enterpriseId: string; stage: number; stageName: string;
  progress: number; investment: number; districtId: string; industryId: string;
  org: string; contact: string | null; riskLevel: string; riskScore: number; startDate: string;
  stage1Detail: string | null; stage2Detail: string | null; stage3Detail: string | null;
  stage4Detail: string | null; stage5Detail: string | null; stage6Detail: string | null;
  lastContact: string | null;
  enterprise: RawEnterprise; district: { id: string; name: string }; industry: { id: string; name: string };
}
export interface RawTask {
  id: number; title: string; type: string; priority: string; status: string;
  dueDate: string; createdAt: string; finishedAt: string | null;
  description: string | null; processLog: string | null;
  enterpriseId: string | null; projectId: string | null; assignee: string; source: string | null;
  enterprise: { id: string; name: string } | null;
  project: { id: string; name: string; stageName: string } | null;
  riskEvent: { id: string } | null;
}
export interface RawPolicy {
  id: string; title: string; category: string; level: string; dept: string;
  publishDate: string; summary: string; target: string; support: string;
  materials: string; hot: number; industryId: string | null;
  amount: number; redeemed: number; helpedEnts: number;
  industry: { id: string; name: string } | null;
}
export interface BootstrapData {
  districts: { id: string; name: string; sort: number }[];
  industries: { id: string; name: string; sort: number }[];
  enterprises: RawEnterprise[];
  riskEvents: RawRiskEvent[];
  projects: RawProject[];
  tasks: RawTask[];
  policies: RawPolicy[];
}

// —— 风险维度映射：server 9 维 → demo 8 维（env 折入经营） ——
const DIM_MAP: Record<string, string> = {
  op: 'operation', fin: 'finance', legal: 'judicial', credit: 'credit',
  tender: 'tender', tax: 'tax', commit: 'perform', ip: 'ip', env: 'operation',
}
const DIM_META: Record<string, { key: string; label: string; name: string }> = {
  operation: { key: '经营', label: '经营异常', name: '经营风险' },
  finance: { key: '财务', label: '财务指标异常', name: '财务风险' },
  judicial: { key: '司法', label: '司法涉诉', name: '司法风险' },
  credit: { key: '信用', label: '信用降档', name: '信用风险' },
  tender: { key: '招投标', label: '招投标异常', name: '招投标风险' },
  tax: { key: '税务', label: '纳税异常', name: '税务风险' },
  perform: { key: '履约', label: '履约滞后', name: '招商履约风险' },
  ip: { key: '知识产权', label: '知识产权预警', name: '知识产权风险' },
}
const LEVEL_STATUS: Record<string, string> = { pending: '待处置', doing: '已派发', done: '已关闭' }
const TASK_TYPE_MAP: Record<string, string> = {
  risk: '风险处置', project: '项目跟进', service: '企业服务',
  policy: '政策推送', patrol: '日常巡检',
}
const PRIO_MAP: Record<string, string> = { high: '高', normal: '中', low: '低' }
const TASK_STATUS_MAP: Record<string, string> = {
  pending: '待处理', doing: '进行中', overdue: '已逾期', done: '已完成',
}
const STAGE_KEYS = ['lead', 'talk', 'sign', 'build', 'operate', 'reach']
const STAGE_NAMES = ['线索对接', '深度洽谈', '签约落地', '建设推进', '投产运营', '达产评价']
const POLICY_LEVEL_MAP: Record<string, string> = {
  national: '国家级', provincial: '省级', municipal: '市级', district: '市级',
}
const POLICY_TYPE_MAP: Record<string, string> = {
  产业: '资金', 财税: '税收', 人才: '人才', 科技: '资金', 金融: '资金', 用地: '要素',
}
const POLICY_TAGS = [
  '高新技术企业', '专精特新', '数据要素', '新能源产业链', '乡村振兴', '跨境电子商务',
  '重点招商企业', '信创', '生物医药', '文旅融合', '智慧物流', '传统产业升级',
  '绿色建材', '多式联运', '专精特新小巨人', '半导体材料',
]
const INDUSTRY_BASE_TAG: Record<string, string> = {
  software: '数据要素', neequip: '新能源产业链', chemical: '传统产业升级',
  agrifood: '乡村振兴', genequip: '专精特新', biomed: '生物医药',
  culture: '文旅融合', logistics: '智慧物流', wholesale: '跨境电子商务',
  building: '绿色建材', agriequip: '乡村振兴', oilgas: '传统产业升级',
}

// —— 稳定伪随机（按实体 id 派生，跨会话稳定，不干扰全局种子） ——
function strRng(seed: string) {
  let h = 2166136261
  const s = String(seed || '')
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  let st = h >>> 0
  return () => {
    st = (st + 0x6d2b79f5) >>> 0
    let t = st
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function mkR(seed: string) {
  const rng = strRng(seed)
  return {
    rng,
    int: (a: number, b: number) => a + Math.floor(rng() * (b - a + 1)),
    float: (a: number, b: number, d?: number) => {
      const v = a + rng() * (b - a)
      return d == null ? v : Number(v.toFixed(d))
    },
    pick: <T>(arr: T[]): T => arr[Math.floor(rng() * arr.length)],
    bool: (p: number) => rng() < p,
  }
}
const pad = (n: number) => (n < 10 ? '0' + n : '' + n)
function fmtDate(d: Date) {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
}
function daysAgoDate(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d
}
function daysLaterDate(n: number) {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d
}
function daysBetween(dateStr: string) {
  const t = new Date(dateStr).getTime()
  if (isNaN(t)) return 0
  return Math.max(0, Math.floor((Date.now() - t) / 86400000))
}
function fmtAmountWan(n: number) {
  return n >= 10000 ? (n / 10000).toFixed(1) + '亿' : n + '万'
}
const clamp100 = (v: number) => Math.max(0, Math.min(100, Math.round(v)))

const DYN_POOLS: { type: string; pool: string[] }[] = [
  { type: '经营', pool: ['上半年营收同比增长，保持良好势头', '经营指标平稳，订单量稳步增加', '市场拓展取得新突破，进入新区域市场'] },
  { type: '创新', pool: ['新增发明专利授权', '通过省级技术中心认定', '研发投入同比增长，新产品上市'] },
  { type: '招投标', pool: ['中标政府项目', '入围省级采购目录', '签订重要合作协议'] },
  { type: '招商', pool: ['二期项目签约', '落地新投资计划', '纳入重点培育企业库'] },
  { type: '风险', pool: ['出现经营异常提醒', '环保整改通知', '信用等级下调预警'] },
  { type: '司法', pool: ['新增合同纠纷', '被列为被执行人', '涉诉案件开庭'] },
]

// ============================================================
// 企业映射
// ============================================================
export function mapEnterprise(e: RawEnterprise): any {
  const r = mkR('ent-' + e.id)
  const regCapitalWan = parseInt(String(e.regCapital).replace(/\D/g, ''), 10) || Math.round(e.investment * 0.6) || 500

  // 税率与人均营收（用于年度/月度序列推导）
  const taxRate = e.revenue > 0 ? Math.min(0.15, Math.max(0.02, e.tax / e.revenue)) : 0.05
  const revPerEmp = e.employees > 0 ? e.revenue / e.employees : 60

  // 年度增长率（科技行业更高，稳定性由 id 保证）
  let yearGrowth = r.float(-0.03, 0.18, 3)
  if (['software', 'biomed', 'neequip'].includes(e.industryId)) {
    yearGrowth = Math.max(0.03, yearGrowth + 0.06)
  }
  const years: number[] = []
  const curYear = new Date().getFullYear()
  for (let y = 0; y < 5; y++) years.push(curYear - 4 + y)
  const yearlyRevenue = years.map((_, y) => Math.round(e.revenue * Math.pow(1 + yearGrowth, y - 4)))
  yearlyRevenue[4] = e.revenue

  // 月度经营序列（1 月 → 当月，不足 6 个月补齐）
  const monthsThisYear = Math.max(1, new Date().getMonth() + 1)
  const len = Math.max(6, monthsThisYear)
  const monthly: number[] = []
  for (let m = 0; m < monthsThisYear; m++) {
    const season = 1 + 0.1 * Math.sin((m / 12) * Math.PI * 2 - Math.PI / 2)
    monthly.push(Math.max(1, Math.round((e.revenue / 12) * season * (1 + r.float(-0.05, 0.05, 3)))))
  }
  while (monthly.length < len) {
    monthly.unshift(Math.round((yearlyRevenue[3] / 12) * 1.15))
  }
  const taxArr = monthly.map(v => Math.round(v * taxRate))
  const investTotal = Math.max(e.investment, Math.round(e.revenue * 0.8)) || 1000
  const investArr = monthly.map((_, i) => Math.round(investTotal * (0.6 + (0.4 * i) / 5)))
  const empArr = monthly.map(v => Math.max(5, Math.round(v / revPerEmp)))

  // 风险维度（server op/fin/.../ip + env≈commit*0.6 折入经营）并按 demo 权重重算
  const envRisk = Math.round(e.riskCommit * 0.6)
  const risks: Record<string, number> = {
    operation: clamp100(e.riskOp * 0.8 + envRisk * 0.2),
    finance: clamp100(e.riskFin),
    judicial: clamp100(e.riskLegal),
    credit: clamp100(e.riskCredit),
    tender: clamp100(e.riskTender),
    tax: clamp100(e.riskTax),
    perform: clamp100(e.riskCommit),
    ip: clamp100(e.riskIp),
  }
  const M = (window as any).MOCK
  let riskScore = e.riskScore
  let riskLevel = e.riskLevel
  if (M && M.calcRiskScore) {
    riskScore = M.calcRiskScore(risks)
    riskLevel = M.scoreToLevel(riskScore)
  }

  // 标签（驱动政策匹配与图谱展示）
  const tags: string[] = []
  const baseTag = INDUSTRY_BASE_TAG[e.industryId] || '重点招商企业'
  tags.push(baseTag)
  if (e.scale === '大型企业') tags.push('重点招商企业')
  if (r.bool(0.3)) tags.push('高新技术企业')
  if (r.bool(0.2)) tags.push('专精特新')

  const regCapitalFmt = regCapitalWan >= 10000
    ? (regCapitalWan / 10000).toFixed(1) + '亿元'
    : regCapitalWan + '万元'
  const revenueFmt = e.revenue >= 10000
    ? (e.revenue / 10000).toFixed(1) + '亿元'
    : e.revenue + '万元'
  const taxFmt = e.tax >= 10000 ? (e.tax / 10000).toFixed(1) + '亿元' : e.tax + '万元'
  const investFmt = e.investment >= 10000
    ? (e.investment / 10000).toFixed(1) + '亿元'
    : e.investment + '万元'

  // 动态（2~6 条，高风险企业更多风险类动态）
  const dynamics: { date: string; type: string; text: string }[] = []
  const dynCount = r.int(2, 6)
  const riskDynCount = riskLevel === 'red' ? 2 : riskLevel === 'orange' ? 1 : 0
  for (let i = 0; i < dynCount; i++) {
    const pool = i < riskDynCount
      ? DYN_POOLS.filter(t => t.type === '风险' || t.type === '司法')[0]
      : r.pick(DYN_POOLS)
    dynamics.push({
      date: fmtDate(daysAgoDate(r.int(1, 180))),
      type: pool.type,
      text: r.pick(pool.pool),
    })
  }
  dynamics.sort((a, b) => (a.date < b.date ? 1 : -1))

  const commitments = [
    { name: '注册资本', promise: regCapitalWan, actual: Math.round(regCapitalWan * r.float(0.9, 1.0, 2)), unit: '万元' },
    { name: '实际投资', promise: investTotal, actual: e.investment, unit: '万元' },
    { name: '年营收', promise: Math.round(e.revenue * 1.2), actual: e.revenue, unit: '万元' },
    { name: '年纳税', promise: Math.round(e.revenue * taxRate * 1.1), actual: e.tax, unit: '万元' },
    { name: '就业岗位', promise: Math.round(e.employees * 1.15), actual: e.employees, unit: '人' },
  ]

  return {
    id: e.id,
    name: e.name,
    creditCode: e.creditCode,
    legal: e.legal,
    regCapital: regCapitalWan,
    regCapitalFmt,
    found: e.found,
    industry: e.industryId,
    industryName: e.industry?.name || e.industryId,
    scale: e.scale,
    tags,
    district: e.districtId,
    districtName: e.district?.name || e.districtId,
    address: (e.district?.name || '') + (r.bool(0.5) ? '工业园区' : '产业园区') + (r.bool(0.5) ? ' A 座' : ' B 区'),
    isDeep: !!e.isKey,
    signDaysAgo: r.int(1, 180),
    overview: {
      regCapital: regCapitalFmt,
      revenue: revenueFmt,
      revenueWan: e.revenue,
      tax: taxFmt,
      taxWan: e.tax,
      employees: e.employees,
      invest: investFmt,
      investWan: e.investment,
      profit: Math.round(e.revenue * r.float(0.05, 0.2, 2)) + '万元',
      yearly: {
        years,
        revenueWan: yearlyRevenue,
        taxWan: yearlyRevenue.map(v => Math.round(v * taxRate)),
        employees: yearlyRevenue.map(v => Math.max(5, Math.round(v / revPerEmp))),
        investWan: yearlyRevenue.map((_, i) => Math.round(investTotal * (0.4 + (0.6 * i) / 4))),
      },
    },
    status: {
      biz: e.bizStatus === '在营' ? '正常' : (e.bizStatus || '正常'),
      credit: e.creditStatus === '良好' ? '正常' : (e.creditStatus === '较差' ? '异常' : '关注'),
      performRate: e.performRate,
    },
    operation: {
      revenue: monthly.map(v => +(v / 10000).toFixed(2)),
      tax: taxArr,
      invest: investArr,
      employees: empArr,
    },
    commitments,
    dynamics,
    risks,
    riskScore,
    riskLevel,
    shareholders: (e.shareholders || []).map(s => ({ name: s.name, ratio: s.ratio })),
    policies: [],
    ai: null,
    _new: !!e.isNew,
    _newDate: e.newDate,
  }
}

// ============================================================
// 风险事件 / 项目 / 任务 / 政策映射
// ============================================================
export function mapRiskEvent(ev: RawRiskEvent): any {
  const r = mkR('ev-' + ev.id)
  const dimKey = DIM_MAP[ev.dimension] || 'operation'
  const meta = DIM_META[dimKey]
  const finding = ev.title || '风险预警'
  return {
    id: ev.id,
    time: ev.foundDate,
    timeHm: pad(r.int(8, 17)) + ':' + pad(r.int(0, 59)),
    entId: ev.enterpriseId,
    enterprise: ev.enterprise?.name || ev.enterpriseId,
    enterpriseName: ev.enterprise?.name || ev.enterpriseId,
    title: meta.label + '：' + finding,
    finding,
    type: meta.label,
    typeKey: meta.key,
    dim: dimKey,
    dimKey,
    dimName: meta.name,
    level: ev.level,
    advice: ev.suggestion || '关注跟进',
    suggestion: ev.suggestion || '关注跟进',
    status: LEVEL_STATUS[ev.status] || '待处置',
    basis: ev.detail || '监测指标异常，需进一步核实。',
    detail: finding + '。' + (ev.detail || '监测指标异常，需进一步核实。'),
    daysAgo: daysBetween(ev.foundDate),
    _serverStatus: ev.status,
  }
}

const RECORD_POOL = [
  '企业反映电力增容审批进度偏慢，已协调供电公司加快。',
  '现场巡检：施工进度符合预期，安全措施到位。',
  '企业反映用地指标尚未落实，建议加快审批。',
  '企业订单饱满，正申请扩产用地，需协调自然资源局。',
  '正在推进用地规划调整，预计下月完成。',
  '企业经营持续下滑，环保整改未完成，已上报风险监管部门。',
  '接入东西部协作电商渠道，月订单增长明显。',
]

export function mapProject(p: RawProject): any {
  const r = mkR('pj-' + p.id)
  const ent = p.enterprise
  const stage = Math.max(0, Math.min(5, p.stage))
  const stageNotesSrc = [p.stage1Detail, p.stage2Detail, p.stage3Detail, p.stage4Detail, p.stage5Detail, p.stage6Detail]

  // 时间线：已到达阶段回溯、未来阶段计划
  const timeline: { date: string; stage: string; note: string }[] = []
  for (let si = 0; si <= stage; si++) {
    const back = (stage - si) * 30 + r.int(5, 15)
    timeline.push({
      date: fmtDate(daysAgoDate(back)),
      stage: STAGE_NAMES[si],
      note: stageNotesSrc[si] || (ent?.name || p.name) + '项目' + STAGE_NAMES[si] + '阶段',
    })
  }
  for (let si = stage + 1; si < 6; si++) {
    timeline.push({
      date: fmtDate(daysLaterDate((si - stage) * 60 + r.int(0, 20))) + '（计划）',
      stage: STAGE_NAMES[si],
      note: STAGE_NAMES[si] + '阶段计划完成',
    })
  }

  const records: { date: string; person: string; content: string }[] = []
  const recCount = r.int(2, 5)
  const person = (p.contact || '专班').split(' ')[0]
  for (let i = 0; i < recCount; i++) {
    records.push({
      date: fmtDate(daysAgoDate(r.int(1, 120))),
      person,
      content: stageNotesSrc[stage] && i === 0 ? String(stageNotesSrc[stage]) : r.pick(RECORD_POOL),
    })
  }
  records.sort((a, b) => (a.date < b.date ? 1 : -1))

  const promises = [
    '投资 ' + fmtAmountWan(Math.round(p.investment)) + '元',
    '就业 ' + Math.round((ent?.employees || 100) * 1.1) + ' 人',
    '达产营收 ' + (ent ? (ent.revenue >= 10000 ? (ent.revenue / 10000).toFixed(1) + '亿元' : ent.revenue + '万元') : '—'),
    '税收 ' + (ent ? (ent.tax >= 10000 ? (ent.tax / 10000).toFixed(1) + '亿元' : ent.tax + '万元') : '—'),
  ]

  // 进展情况：历史阶段取阶段详情，当前阶段缺省小结
  const stageNotes: Record<string, string> = {}
  for (let si = 0; si < stage; si++) {
    stageNotes[STAGE_KEYS[si]] = stageNotesSrc[si] || '已完成' + STAGE_NAMES[si] + '阶段各项节点。'
  }
  stageNotes[STAGE_KEYS[stage]] = stageNotesSrc[stage] || '阶段小结：整体推进有序，正协调解决要素保障等具体事项，下一步按计划节点推进。'

  return {
    id: p.id,
    name: p.name,
    shortName: ent?.name || p.name,
    enterprise: p.enterpriseId,
    enterpriseName: ent?.name || p.enterpriseId,
    stage: STAGE_KEYS[stage],
    stageName: p.stageName || STAGE_NAMES[stage],
    amount: fmtAmountWan(Math.round(p.investment)),
    amountWan: Math.round(p.investment),
    owner: p.org || '招商一组',
    contact: p.contact || '招商专班 139****0000',
    progress: p.progress,
    risk: p.riskLevel === 'red' ? '重大风险' : p.riskLevel === 'orange' ? '关注' : '正常',
    riskLevel: p.riskLevel,
    district: p.districtId,
    districtName: p.district?.name || p.districtId,
    timeline,
    records,
    promises,
    stageNotes,
    stageNoteTime: p.lastContact ? p.lastContact + ' 10:00' : undefined,
    _sid: p.id,
  }
}

export function mapTask(t: RawTask): any {
  const overdueDays = t.status !== 'done' ? daysBetween(t.dueDate) : 0
  const isOverdue = t.status !== 'done' && overdueDays > 0
  return {
    id: String(t.id),
    _sid: t.id,
    title: t.title,
    enterprise: t.enterpriseId || '',
    enterpriseName: t.enterprise?.name || '',
    due: t.dueDate,
    priority: PRIO_MAP[t.priority] || '中',
    status: TASK_STATUS_MAP[t.status] || '待处理',
    completeTime: t.finishedAt ? t.finishedAt + ' 10:00' : undefined,
    source: t.riskEvent?.id || t.projectId || '',
    type: TASK_TYPE_MAP[t.type] || '企业服务',
    createTime: t.createdAt,
    processNote: t.processLog || undefined,
    processNoteTime: t.processLog ? (t.finishedAt || t.createdAt) + ' 10:00' : undefined,
    overdue: isOverdue,
    overdueDays: isOverdue ? overdueDays : 0,
    assignee: t.assignee,
  }
}

export function mapPolicy(p: RawPolicy): any {
  const r = mkR('pol-' + p.id)
  return {
    code: p.id,
    name: p.title,
    dept: p.dept,
    type: POLICY_TYPE_MAP[p.category] || '资金',
    level: POLICY_LEVEL_MAP[p.level] || '市级',
    apply: p.summary,
    tag: r.pick(POLICY_TAGS),
    date: p.publishDate,
    brief: p.summary,
    support: p.support,
    materials: (p.materials || '').replace(/\n/g, '<br/>'),
    hot: p.hot,
    _sid: p.id,
  }
}

// ============================================================
// 全量引导映射（引擎 rebuild 输入）
// ============================================================
export function mapBootstrap(raw: BootstrapData) {
  const enterprises = (raw.enterprises || []).map(mapEnterprise)
  const events = (raw.riskEvents || []).map(mapRiskEvent)
  events.sort((a, b) => (a.time < b.time ? 1 : -1))
  const projects = (raw.projects || []).map(mapProject)
  const policies = (raw.policies || []).map(mapPolicy)

  const tasks = (raw.tasks || []).map(mapTask)
  const statusOrder: Record<string, number> = { 待处理: 0, 进行中: 1, 已逾期: 2, 已完成: 3 }
  const prioOrder: Record<string, number> = { 高: 0, 中: 1, 低: 2 }
  tasks.sort((a, b) => {
    if (statusOrder[a.status] !== statusOrder[b.status]) return statusOrder[a.status] - statusOrder[b.status]
    return prioOrder[a.priority] - prioOrder[b.priority]
  })

  return { ENTERPRISES: enterprises, RISK_EVENTS: events, PROJECTS: projects, TASKS: tasks, POLICY_LIB: policies }
}
