// ============================================================
// 数据完整性对账
//
// 双模式：
//   [REAL 模式] 存在 server/prisma/real-fixtures.json 时启用
//     —— 校验真实数据自身的完整性（规模、ID 唯一、引用完整、
//        字段合规、业务约束）。real-fixtures 是生产数据源。
//   [DEMO 模式] 不存在 real-fixtures 时回退原逻辑
//     —— 校验 demo-fixtures.json 与 demo MOCK 口径一致。
//
// 用法：node tools/check_data_parity.cjs（离线可跑，无服务器依赖）
// ============================================================
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const DEMO_OUT = path.join(ROOT, 'server', 'prisma', 'demo-fixtures.json');
const REAL_OUT = path.join(ROOT, 'server', 'prisma', 'real-fixtures.json');

let fails = 0;

function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`[✅] ${label}`);
  } else {
    fails++;
    console.log(`[❌] ${label}: 实际=${a.slice(0, 150)} 期望=${e.slice(0, 150)}`);
  }
}

function ok(label, cond, extra) {
  if (cond) {
    console.log(`[✅] ${label}${extra ? ' ' + extra : ''}`);
  } else {
    fails++;
    console.log(`[❌] ${label}${extra ? ' ' + extra : ''}`);
  }
}

function duplicates(arr) {
  const seen = new Set();
  const dup = [];
  for (const x of arr) {
    if (seen.has(x.id)) dup.push(x.id);
    seen.add(x.id);
  }
  return dup;
}

// ============================================================
// REAL 模式
// ============================================================
if (fs.existsSync(REAL_OUT)) {
  const F = JSON.parse(fs.readFileSync(REAL_OUT, 'utf-8'));
  console.log('数据源：real-fixtures.json（真实企业数据）');
  console.log(`generatedAt：${F.generatedAt || '(无)'}`);
  if (F._source) console.log(`来源说明：${F._source}`);
  console.log('');

  // ---- 1. 规模 ----
  // 真实样本数不是固定值：取决于「在工商年报中公示了数值型财务数据」的可得量，
  // 目前 79 家（见 docs/数据口径说明.md 的样本选取规则）。
  // 因此这里不预设 120，改为校验非空 + 与导出的原始取数文件口径一致（若存在）。
  ok('企业样本数 > 0', F.enterprises.length > 0, `实际 ${F.enterprises.length}（真实样本，非固定值）`);
  const csvPath = path.join(ROOT, 'data-import', 'enterprises.csv');
  if (fs.existsSync(csvPath)) {
    // 引号感知的行计数：经营范围等字段内含换行，不能用 lines.length 直接数
    const raw = fs.readFileSync(csvPath, 'utf-8');
    let records = 0, inQuotes = false;
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i];
      if (ch === '"') inQuotes = !inQuotes;
      else if (ch === '\n' && !inQuotes) records++;
    }
    if (raw.length && !raw.endsWith('\n')) records++;   // 末行无换行
    const dataRows = records - 1;                       // 去掉表头
    // CSV 是「候选池」：含分公司等不具备独立年报财务的主体；fixtures 只保留满足
    // 样本硬性条件（存续、公司制、年报公示数值型财务且营业收入 > 0）的企业。
    // 因此正确关系是 fixtures ≤ CSV 行数，相等只是特例。
    // 例：'中国联合网络通信有限公司环县分公司' 为分公司，财务并入总公司公示，被规则排除。
    // CSV 无财务列，无法在此自动复算过滤规则，故差额只作提示、不判失败。
    ok('企业数不超过 data-import/enterprises.csv 数据行数',
      F.enterprises.length <= dataRows,
      `fixtures ${F.enterprises.length} / CSV ${dataRows}（差额 ${dataRows - F.enterprises.length} 家为不满足硬性条件被排除的候选）`);
  }
  ok('区县 8 个', F.districts.length === 8, `实际 ${F.districts.length}`);
  ok('行业 ≥10 个', F.industries.length >= 10, `实际 ${F.industries.length}`);
  ok('风险事件 >0', F.riskEvents.length > 0, `实际 ${F.riskEvents.length}`);
  ok('项目 >0', F.projects.length > 0, `实际 ${F.projects.length}`);
  ok('任务 >0', F.tasks.length > 0, `实际 ${F.tasks.length}`);
  ok('政策 >0', F.policies.length > 0, `实际 ${F.policies.length}`);
  ok('司法案件 >0', (F.judicialCases || []).length > 0, `实际 ${(F.judicialCases || []).length}`);

  // ---- 2. 必填字段与脏数据 ----
  const ents = F.enterprises;
  ok('企业名称无空值', ents.filter(e => !e.name || !String(e.name).trim()).length === 0);
  ok('统一社会信用代码无空值', ents.filter(e => !e.creditCode).length === 0);
  ok('企业名称无控制字符',
    ents.filter(e => e.name && /[\u0000-\u001f]/.test(e.name)).length === 0);
  ok('区县 ID 无空值', ents.filter(e => !e.districtId).length === 0);
  ok('行业 ID 无空值', ents.filter(e => !e.industryId).length === 0);

  // ---- 3. ID 唯一性 ----
  for (const [name, arr] of [
    ['企业', F.enterprises], ['风险事件', F.riskEvents],
    ['项目', F.projects], ['任务', F.tasks],
    ['政策', F.policies], ['司法案件', F.judicialCases || []],
  ]) {
    const d = duplicates(arr);
    ok(`${name} ID 唯一`, d.length === 0, d.length ? `重复：${d.slice(0, 5).join(',')}` : '');
  }

  // ---- 4. 引用完整性 ----
  const entIds = new Set(ents.map(e => e.id));
  const distIds = new Set(F.districts.map(d => d.id));
  const indIds = new Set(F.industries.map(d => d.id));
  ok('风险事件→企业引用完整', F.riskEvents.filter(e => !entIds.has(e.enterpriseId)).length === 0);
  ok('项目→企业引用完整', F.projects.filter(p => !entIds.has(p.enterpriseId)).length === 0);
  ok('任务→企业引用完整',
    F.tasks.filter(t => t.enterpriseId && !entIds.has(t.enterpriseId)).length === 0);
  ok('司法案件→企业引用完整',
    (F.judicialCases || []).filter(c => !entIds.has(c.enterpriseId)).length === 0);
  ok('企业→区县引用完整', ents.filter(e => !distIds.has(e.districtId)).length === 0);
  ok('企业→行业引用完整', ents.filter(e => !indIds.has(e.industryId)).length === 0);

  // ---- 5. 业务约束 ----
  const LEVELS = ['red', 'orange', 'yellow', 'blue'];
  ok('企业风险等级取值合法',
    ents.filter(e => !LEVELS.includes(e.riskLevel)).length === 0,
    `异常 ${ents.filter(e => !LEVELS.includes(e.riskLevel)).length}`);
  ok('风险事件状态取值合法',
    F.riskEvents.filter(e => !['pending', 'doing', 'done'].includes(e.status)).length === 0);
  const allShareholders = ents.flatMap(e => (e.shareholders || []));
  ok('股东比例在 0-100 区间',
    allShareholders.filter(s => s.ratio != null && (s.ratio < 0 || s.ratio > 100)).length === 0,
    `共 ${allShareholders.length} 条`);
  ok('无零比例无效股东', allShareholders.filter(s => s.ratio === 0).length === 0);

  // ---- 6. 真实数据特征 ----
  ok('信用代码格式合规（18 位大写字母数字）',
    ents.filter(e => !/^[0-9A-Z]{18}$/.test(e.creditCode || '')).length === 0);
  const coverage = {};
  for (const e of ents) coverage[e.districtId] = (coverage[e.districtId] || 0) + 1;
  ok('每个区县均有企业覆盖',
    Object.keys(coverage).length === F.districts.length,
    `覆盖 ${Object.keys(coverage).length}/${F.districts.length}`);

  // ---- 7. 汇总口径（供文档核对）----
  const sum = k => ents.reduce((s, e) => s + (Number(e[k]) || 0), 0);
  console.log('');
  console.log('— 数据规模摘要 —');
  console.log(`  企业 ${ents.length} / 区县 ${F.districts.length} / 行业 ${F.industries.length}`);
  console.log(`  风险事件 ${F.riskEvents.length} / 项目 ${F.projects.length} / 任务 ${F.tasks.length} / 政策 ${F.policies.length}`);
  console.log(`  股东 ${allShareholders.length} 条（覆盖 ${ents.filter(e => (e.shareholders || []).length).length} 家）`);
  console.log(`  司法案件 ${(F.judicialCases || []).length} 条`);
  console.log(`  总营收 ${(sum('revenue') / 10000).toFixed(1)} 亿 / 总纳税 ${(sum('tax') / 10000).toFixed(2)} 亿 / 固投 ${(sum('investment') / 10000).toFixed(1)} 亿`);
  const lvDist = {};
  for (const e of ents) lvDist[e.riskLevel] = (lvDist[e.riskLevel] || 0) + 1;
  console.log(`  风险分布 ${JSON.stringify(lvDist)}`);

  console.log('\n========================================');
  if (fails) {
    console.log(`结果：${fails} 项校验失败`);
    process.exit(1);
  }
  console.log('结果：real-fixtures 数据完整性校验通过 ✅');
  process.exit(0);
}

// ============================================================
// DEMO 模式（原逻辑，无 real-fixtures 时使用）
// ============================================================
const OUT = DEMO_OUT;

const ctx = { window: {}, console };
const sandbox = vm.createContext(ctx);
const mockSrc = fs.readFileSync(path.join(ROOT, 'demo', 'assets', 'data', 'mock.js'), 'utf-8');
vm.runInContext(mockSrc, sandbox, { filename: 'demo/assets/data/mock.js' });
const M = ctx.window.MOCK;

const F = JSON.parse(fs.readFileSync(OUT, 'utf-8'));

const STATUS_MAP = { '待处置': 'pending', '已派发': 'doing', '已关闭': 'done' };
const sorted = v => (v && typeof v === 'object' && !Array.isArray(v))
  ? Object.keys(v).sort().reduce((o, k) => (o[k] = v[k], o), {})
  : v;

// 1. 五类实体 + 字典计数
check('区县数', F.districts.length, M.DISTRICTS.length);
check('行业数', F.industries.length, M.INDUSTRIES.length);
check('企业数', F.enterprises.length, M.ENTERPRISES.length);
check('风险事件数', F.riskEvents.length, M.RISK_EVENTS.length);
check('项目数', F.projects.length, M.PROJECTS.length);
check('任务数', F.tasks.length, M.TASKS.length);
check('政策数', F.policies.length, M.POLICY_LIB.length);

// 2. ID 集合一致
const idsets = (arr, key) => arr.map(x => x[key]).sort().join(',');
check('企业 ID 集合', idsets(F.enterprises, 'id'), idsets(M.ENTERPRISES, 'id'));
check('风险事件 ID 集合', idsets(F.riskEvents, 'id'), idsets(M.RISK_EVENTS, 'id'));
check('项目 ID 集合', idsets(F.projects, 'id'), idsets(M.PROJECTS, 'id'));
// 注意：demo 侧政策对象的主键字段名是 code（P01…），导出到 fixtures 时映射为 id；
// 此处不能统一取 'id'，否则 mock 侧全部取到 undefined。其余实体两侧同名。
check('政策 ID 集合', idsets(F.policies, 'id'), idsets(M.POLICY_LIB, 'code'));

// 3. 分布与顺序
const dist = (arr, key) => {
  const o = {};
  for (const x of arr) o[x[key]] = (o[x[key]] || 0) + 1;
  return sorted(o);
};
check('红/橙/黄/蓝 企业分布', dist(F.enterprises, 'riskLevel'), dist(M.ENTERPRISES, 'riskLevel'));
check('风险事件三态分布',
  dist(F.riskEvents, 'status'),
  dist(M.RISK_EVENTS.map(e => ({ status: STATUS_MAP[e.status] || e.status })), 'status'));
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
