// ============================================================
// 数据口径对账：demo MOCK（唯一设计基准） vs server fixtures
// 保证 server/prisma/demo-fixtures.json 与 demo 口径完全一致。
// fixtures 由 tools/export_demo_fixtures.cjs 生成；若有漂移，
// 重新执行该脚本即可对齐。
//
// 用法：node tools/check_data_parity.cjs（离线可跑，无服务器依赖）
// ============================================================
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'server', 'prisma', 'demo-fixtures.json');

// ---------- demo MOCK ----------
const ctx = { window: {}, console };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'demo', 'assets', 'data', 'mock.js'), 'utf8'), ctx, { filename: 'mock.js' });
const M = ctx.window.MOCK;

// ---------- fixtures ----------
if (!fs.existsSync(OUT)) {
  console.error('FAIL: 未找到 demo-fixtures.json，请先运行 node tools/export_demo_fixtures.cjs');
  process.exit(1);
}
const F = JSON.parse(fs.readFileSync(OUT, 'utf-8'));

let fails = 0;
const STATUS_MAP = { '待处置': 'pending', '已派发': 'doing', '已关闭': 'done' };
// 对象比较前按键排序，避免键序差异误报
const sorted = v => (v && typeof v === 'object' && !Array.isArray(v))
  ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1)))
  : v;
function check(label, actual, expected) {
  const ok = JSON.stringify(sorted(actual)) === JSON.stringify(sorted(expected));
  if (!ok) fails++;
  console.log(`[${ok ? '✅' : '❌'}] ${label}: demo=${JSON.stringify(sorted(expected))} fixtures=${JSON.stringify(sorted(actual))}`);
}

// 1. 五类实体 + 字典计数
check('区县数', F.districts.length, M.DISTRICTS.length);
check('行业数', F.industries.length, M.INDUSTRIES_META.length);
check('企业数', F.enterprises.length, M.ENTERPRISES.length);
check('风险事件数', F.riskEvents.length, M.RISK_EVENTS.length);
check('项目数', F.projects.length, M.PROJECTS.length);
check('任务数', F.tasks.length, M.TASKS.length);
check('政策数', F.policies.length, M.POLICY_LIB.length);

// 2. ID 集合一致（顺序无关）
const idsets = (arr, key) => arr.map(x => x[key]).sort().join(',');
check('企业 ID 集合', F.enterprises.map(x => x.id).sort().join(','), M.ENTERPRISES.map(e => e.id).sort().join(','));
check('风险事件 ID 集合', F.riskEvents.map(x => x.id).sort().join(','), M.RISK_EVENTS.map(e => e.id).sort().join(','));
check('项目 ID 集合', F.projects.map(x => x.id).sort().join(','), M.PROJECTS.map(p => p.id).sort().join(','));
check('政策 ID 集合', F.policies.map(x => x.id).sort().join(','), M.POLICY_LIB.map(p => p.code).sort().join(','));

// 3. 关键业务数字（演示对数口径）
const riskSum = M.riskStats();
check('红/橙/黄/蓝 企业分布',
  F.enterprises.reduce((acc, e) => { acc[e.riskLevel] = (acc[e.riskLevel] || 0) + 1; return acc; }, {}),
  { red: riskSum.red, orange: riskSum.orange, yellow: riskSum.yellow, blue: riskSum.blue });
check('风险事件三态分布',
  F.riskEvents.reduce((acc, e) => { acc[e.status] = (acc[e.status] || 0) + 1; return acc; }, {}),
  M.RISK_EVENTS.reduce((acc, e) => { acc[STATUS_MAP[e.status] || e.status] = (acc[STATUS_MAP[e.status] || e.status] || 0) + 1; return acc; }, {}));
check('政策名称一致（按序）', F.policies.map(p => p.title), M.POLICY_LIB.map(p => p.name));
check('企业名称一致（按序）', F.enterprises.map(p => p.name), M.ENTERPRISES.map(e => e.name));

// 4. 引用完整性
const entIds = new Set(F.enterprises.map(e => e.id));
check('风险事件企业引用完整', F.riskEvents.filter(e => !entIds.has(e.enterpriseId)).length, 0);
check('项目企业引用完整', F.projects.filter(p => !entIds.has(p.enterpriseId)).length, 0);
const districtIds = new Set(F.districts.map(d => d.id));
check('企业区县引用完整', F.enterprises.filter(e => !districtIds.has(e.districtId)).length, 0);
const industryIds = new Set(F.industries.map(d => d.id));
check('企业行业引用完整', F.enterprises.filter(e => !industryIds.has(e.industryId)).length, 0);

console.log('\n========================================');
if (fails) {
  console.log(`结果：${fails} 项不一致 —— 运行 node tools/export_demo_fixtures.cjs 重新导出`);
  process.exit(1);
}
console.log('结果：fixtures 与 demo 口径完全一致 ✅');
