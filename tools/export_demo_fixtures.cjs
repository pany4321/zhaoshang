// ============================================================
// 导出 demo 口径的数据 fixtures（单一事实源）
// 从 demo/assets/data/mock.js（唯一设计基准）导出 server 形状的实体
// 到 server/prisma/demo-fixtures.json，seed 只负责入库。
//
// 用法：node tools/export_demo_fixtures.cjs
// 对账：node tools/check_data_parity.cjs（校验 fixtures 与 demo 一致）
// ============================================================
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const DEMO_MOCK = path.join(ROOT, 'demo', 'assets', 'data', 'mock.js');
const OUT = path.join(ROOT, 'server', 'prisma', 'demo-fixtures.json');

// ---------- 加载 demo mock ----------
const ctx = { window: {}, console };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(DEMO_MOCK, 'utf8'), ctx, { filename: 'mock.js' });
const M = ctx.window.MOCK;

// ---------- 确定性日期工具 ----------
function fmtDate(d) {
  const p = n => (n < 10 ? '0' + n : '' + n);
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
function daysAgoDate(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

// ---------- 映射表（与 web/src/engine/adapter.ts 的映射互为逆） ----------
const DIM_REVERSE = { operation: 'op', finance: 'fin', judicial: 'legal', credit: 'credit', tender: 'tender', tax: 'tax', perform: 'commit', ip: 'ip' };
const STATUS_REVERSE = { '待处置': 'pending', '已派发': 'doing', '已关闭': 'done' };
const TASK_TYPE_REVERSE = { '风险处置': 'risk', '项目跟进': 'project', '企业服务': 'service', '政策推送': 'policy', '日常巡检': 'patrol' };
const TASK_STATUS_REVERSE = { '待处理': 'pending', '进行中': 'doing', '已逾期': 'overdue', '已完成': 'done' };
const PRIO_REVERSE = { '高': 'high', '中': 'normal', '低': 'low' };
const STAGE_KEYS = ['lead', 'talk', 'sign', 'build', 'operate', 'reach'];
const POLICY_CATEGORY_REVERSE = { '资金': '产业', '税收': '财税', '人才': '人才', '要素': '用地' };
const POLICY_LEVEL_REVERSE = { '国家级': 'national', '省级': 'provincial', '市级': 'municipal', '区县': 'district' };
const POLICY_LEVEL_NAMES = { national: '国家级', provincial: '省级', municipal: '市级', district: '区县级' };
const SUPPORT_POOL = ['财政奖补', '税收优惠', '贷款贴息', '用地保障', '人才补贴', '专项资金'];
const RISK_SCORE_BY_LEVEL = { red: 65, orange: 48, yellow: 30, blue: 15 };
const WORKERS = ['zhaoshang01', 'zhaoshang02', 'zhaoshang03'];

// ---------- 字典 ----------
const districts = M.DISTRICTS.map((d, i) => ({ id: d.key, name: d.name, sort: i }));
const industries = M.INDUSTRIES_META.map((m, i) => ({ id: m.key, name: m.name, sort: i }));

// ---------- 企业 + 股东 ----------
const entById = id => M.ENTERPRISES.find(e => e.id === id);
const enterprises = M.ENTERPRISES.map(e => {
  const r = e.risks;
  const isNew = e.signDaysAgo <= 30;
  return {
    id: e.id,
    name: e.name,
    creditCode: e.creditCode,
    legal: e.legal,
    found: e.found,
    scale: e.scale,
    bizStatus: e.status.biz === '正常' ? '在营' : e.status.biz,
    creditStatus: e.status.credit === '正常' ? '良好' : e.status.credit,
    regCapital: e.regCapital + '万元',
    districtId: e.district,
    industryId: e.industry,
    isKey: !!e.isDeep,
    isNew,
    newDate: isNew ? fmtDate(daysAgoDate(e.signDaysAgo)) : null,
    revenue: e.overview.revenueWan,
    tax: e.overview.taxWan,
    investment: e.overview.investWan,
    employees: e.overview.employees,
    landMu: e.landMu,
    performRate: e.status.performRate,
    commitRate: null,
    riskScore: e.riskScore,
    riskLevel: e.riskLevel,
    // server 8 维（adapter 侧 env 由 riskCommit*0.6 推导，无独立字段）
    riskOp: r.operation, riskFin: r.finance, riskLegal: r.judicial, riskCredit: r.credit,
    riskTender: r.tender, riskTax: r.tax, riskCommit: r.perform, riskIp: r.ip,
    shareholders: (e.shareholders || []).map((s, i) => ({ name: s.name, ratio: s.ratio, sort: i })),
  };
});

// ---------- 风险事件 ----------
const riskEvents = M.RISK_EVENTS.map(ev => ({
  id: ev.id,
  title: ev.title,
  dimension: DIM_REVERSE[ev.dimKey] || 'op',
  dimensionName: ev.dimName,
  level: ev.level,
  status: STATUS_REVERSE[ev.status] || 'pending',
  enterpriseId: ev.entId,
  districtId: (entById(ev.entId) || {}).district || 'xf',
  foundDate: ev.time,
  detail: ev.detail,
  suggestion: ev.suggestion,
}));

// ---------- 招商项目 ----------
const projects = M.PROJECTS.map(pj => {
  const ent = entById(pj.enterprise) || {};
  const details = {};
  STAGE_KEYS.forEach((k, i) => { details['stage' + (i + 1) + 'Detail'] = (pj.stageNotes && pj.stageNotes[k]) || null; });
  return {
    id: pj.id,
    name: pj.name,
    enterpriseId: pj.enterprise,
    stage: STAGE_KEYS.indexOf(pj.stage),
    stageName: pj.stageName,
    progress: pj.progress,
    investment: pj.amountWan,
    districtId: pj.district,
    industryId: ent.industry || 'software',
    org: pj.owner,
    contact: pj.contact || null,
    riskLevel: pj.riskLevel || 'blue',
    riskScore: RISK_SCORE_BY_LEVEL[pj.riskLevel] || 15,
    startDate: (pj.timeline && pj.timeline[0] ? pj.timeline[0].date : '').replace('（计划）', ''),
    ...details,
    lastContact: pj.records && pj.records.length ? pj.records[0].date : null,
  };
});

// ---------- 任务 ----------
const tasks = M.TASKS.map((t, i) => ({
  title: t.title,
  type: TASK_TYPE_REVERSE[t.type] || 'service',
  priority: PRIO_REVERSE[t.priority] || 'normal',
  status: TASK_STATUS_REVERSE[t.status] || 'pending',
  dueDate: t.due,
  createdAt: t.createTime,
  finishedAt: t.completeTime || null,
  processLog: t.processNote || null,
  enterpriseId: t.enterprise || null,
  projectId: /^P\d+$/.test(t.source || '') ? t.source : null,
  assignee: WORKERS[i % WORKERS.length],
  source: t.source || null,
}));

// ---------- 政策 ----------
const policies = M.POLICY_LIB.map((p, i) => ({
  id: p.code,
  title: p.name,
  category: POLICY_CATEGORY_REVERSE[p.type] || '产业',
  level: POLICY_LEVEL_REVERSE[p.level] || 'municipal',
  dept: p.dept,
  publishDate: p.date,
  summary: p.apply,
  target: POLICY_LEVEL_NAMES[POLICY_LEVEL_REVERSE[p.level] || 'municipal'] + '各类' + (p.type === '人才' ? '人才' : p.type === '税收' ? '纳税企业' : '市场主体'),
  support: SUPPORT_POOL[i % SUPPORT_POOL.length],
  materials: '1. 申请表\n2. 营业执照\n3. 相关资质证书\n4. 近三年财务报表\n5. 其他证明材料',
  hot: 60 + ((i + 1) * 13) % 90,
  industryId: null,
  amount: p.planWan,
  redeemed: p.redeemedWan,
  helpedEnts: p.entCount,
}));

// ---------- 输出 ----------
const fixtures = { _source: 'demo/assets/data/mock.js（唯一设计基准）', generatedAt: fmtDate(new Date()), districts, industries, enterprises, riskEvents, projects, tasks, policies };
fs.writeFileSync(OUT, JSON.stringify(fixtures, null, 1), 'utf8');
console.log('written', OUT);
console.log('districts', districts.length, '| industries', industries.length, '| enterprises', enterprises.length,
  '| riskEvents', riskEvents.length, '| projects', projects.length, '| tasks', tasks.length, '| policies', policies.length);
