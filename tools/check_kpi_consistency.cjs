// KPI 口径一致性断言：同名的「风险企业」在驾驶舱与企业概况必须同值
//
// 背景：2026-10-24 修复前，驾驶舱按 red||orange 计 21 家，企业概况统计条却含
// yellow 算出 60 家；点卡片下钻后统计条与列表又变成 21，同屏自相矛盾。
// 本脚本把「三处必须相等」固化为回归断言，防止任一侧改口径再次漂移。
//
// 断言链：
//   ① 驾驶舱「风险企业」卡片数字
//   ② 企业概况（无筛选）统计条「风险企业」
//   ③ 下钻 red,orange 后：筛选企业数 == 列表「共 X 家企业」 == ①
//
// 只依赖 JSDOM + demo 静态资源，不需要 server。

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const DEMO = path.join(ROOT, 'demo');

const html = fs.readFileSync(path.join(DEMO, 'index.html'), 'utf-8');
const mockJs = fs.readFileSync(path.join(DEMO, 'assets/data/mock.js'), 'utf-8');
const utilsJs = fs.readFileSync(path.join(DEMO, 'assets/js/common/utils.js'), 'utf-8');
const stateJs = fs.readFileSync(path.join(DEMO, 'assets/js/common/state.js'), 'utf-8');
const compJs = fs.readFileSync(path.join(DEMO, 'assets/js/common/components.js'), 'utf-8');
const appJs = fs.readFileSync(path.join(DEMO, 'assets/js/app.js'), 'utf-8');

const pagesDir = path.join(DEMO, 'assets/js/pages');

function makeGradient() {
  return { addColorStop: function () {} };
}
const stubEcharts = {
  init: function () {
    return { setOption: function () {}, dispose: function () {}, resize: function () {}, on: function () {} };
  },
  registerMap: function () {},
  graphic: { LinearGradient: makeGradient, RadialGradient: makeGradient },
};

const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/' });
const w = dom.window;
w.echarts = stubEcharts;
w.requestAnimationFrame = cb => setTimeout(cb, 16);
w.console = console;

// --- 加载引擎 ---
// 默认装载 demo/assets/data/real-data.js（与全栈版同源的 88 家真实工商数据），
// 即线上口径；文件不存在时自动回退 mock.js 内置 120 家。--mock 强制走模拟数据。
const FORCE_MOCK = process.argv.includes('--mock');
const realPath = path.join(DEMO, 'assets/data/real-data.js');
const WITH_REAL = !FORCE_MOCK && fs.existsSync(realPath);
if (!FORCE_MOCK && !WITH_REAL) {
  console.warn('[warn] 未找到 demo/assets/data/real-data.js，本次按 mock.js 内置数据检查');
}
try {
  w.eval(mockJs);
  if (WITH_REAL) {
    w.global = w; // real-data.js 的 IIFE 通过 global.MOCK_ENGINE 回写
    w.eval(fs.readFileSync(realPath, 'utf-8'));
    if (!w.MOCK.__REAL_DATA__) {
      console.error('[FAIL] real-data.js 装载未生效（__REAL_DATA__ 非 true）');
      process.exit(1);
    }
  }
  w.eval('window.APP = {};');
  w.eval(utilsJs);
  w.eval(stateJs);
  w.eval(compJs);
  fs.readdirSync(pagesDir)
    .filter(f => f.endsWith('.js'))
    .forEach(f => w.eval(fs.readFileSync(path.join(pagesDir, f), 'utf-8')));
  w.eval(appJs);
} catch (e) {
  console.error('[FAIL] 引擎加载失败:', e.message);
  process.exit(1);
}

// --- 数字提取 ---
function firstNum(text) {
  const m = String(text).replace(/[,，\s]/g, '').match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : NaN;
}

// 从统计条里按标签取数（结构：<div class="os-item"><...>标签</...><...>数值</...></div>）
function statNum(doc, label) {
  const items = Array.from(doc.querySelectorAll('.os-item'));
  for (const it of items) {
    const t = it.textContent.replace(/\s/g, '');
    if (t.indexOf(label) === 0 || t.indexOf(label) >= 0) {
      const rest = t.replace(label, '');
      const n = firstNum(rest);
      if (!Number.isNaN(n)) return n;
    }
  }
  return NaN;
}

// 列表底部「共 X 家企业」
function listTotal(doc) {
  const nodes = Array.from(doc.querySelectorAll('#content *'));
  for (const n of nodes) {
    if (n.children.length === 0 && /共\s*\d+\s*家企业/.test(n.textContent)) {
      return firstNum(n.textContent);
    }
  }
  // 退路：整块内容里找「共 N 家企业」
  const m = doc.body.textContent.match(/共\s*(\d+)\s*家企业/);
  return m ? Number(m[1]) : NaN;
}

setTimeout(() => {
  const doc = w.document;
  const errors = [];
  const checks = [];

  function eq(label, actual, expected, hint) {
    const ok = actual === expected;
    checks.push({ label, actual, expected, ok });
    if (!ok) errors.push(`${label}: 实际 ${actual}，期望 ${expected}${hint ? '（' + hint + '）' : ''}`);
  }

  // 基准：直接从数据算，不依赖任何页面，作为第五方独立口径
  const expectedRisk = w.MOCK.ENTERPRISES.filter(
    e => e.riskLevel === 'red' || e.riskLevel === 'orange'
  ).length;
  const expectedAll = w.MOCK.ENTERPRISES.length;

  // ① 驾驶舱
  w.APP.state.page = 'dashboard';
  w.APP.render();
  const kpiEl = doc.querySelector('[data-kpi="riskEnterprises"]');
  if (!kpiEl) {
    console.error('[FAIL] 驾驶舱未找到 [data-kpi="riskEnterprises"] 卡片');
    process.exit(1);
  }
  const dashRisk = firstNum(kpiEl.textContent);

  // ② 企业概况（无筛选）
  w.APP.state.page = 'enterprise';
  w.APP.render();
  const entAll = statNum(doc, '筛选企业数');
  const entRiskUnfiltered = statNum(doc, '风险企业');

  // ③ 下钻：模拟驾驶舱「风险企业」卡片点击带入 red,orange
  w.APP.state.filter.enterprise.risk = 'red,orange';
  w.APP.state.filter.enterprise.page = 1;
  w.APP.render();
  const drillTotal = statNum(doc, '筛选企业数');
  const drillRisk = statNum(doc, '风险企业');
  const drillList = listTotal(doc);

  // --- 断言 ---
  eq('基准（数据层 red+orange）', expectedRisk, expectedRisk, '数据层口径');
  eq('① 驾驶舱「风险企业」卡片', dashRisk, expectedRisk, '应等于数据层红+橙');
  eq('② 企业概况（无筛选）统计条「风险企业」', entRiskUnfiltered, dashRisk, '不得含黄档');
  eq('② 企业概况（无筛选）统计条「筛选企业数」', entAll, expectedAll, '应为全量企业数');
  eq('③ 下钻后统计条「筛选企业数」', drillTotal, dashRisk, '下钻即该口径');
  eq('③ 下钻后统计条「风险企业」', drillRisk, dashRisk, '筛选后同口径');
  eq('③ 下钻后列表「共 X 家企业」', drillList, dashRisk, '列表条数须与卡片一致');

  // 口径自证：黄档企业不应被计入风险企业
  const yellowCount = w.MOCK.ENTERPRISES.filter(e => e.riskLevel === 'yellow').length;
  const riskWithYellow = expectedRisk + yellowCount;

  console.log('===== KPI 口径一致性检查（风险企业 = 红+橙）=====');
  console.log(`  数据源: ${w.MOCK.__REAL_DATA__ ? 'real-data.js（真实工商数据）' : 'mock.js 内置模拟数据'}`);
  checks.forEach(c => {
    console.log(`  ${c.ok ? '[OK]  ' : '[FAIL]'} ${c.label}: ${c.actual}${c.ok ? '' : ' ≠ ' + c.expected}`);
  });
  console.log(`  参考：${expectedAll} 家企业中 红+橙 ${expectedRisk} 家、黄档 ${yellowCount} 家（含黄档将得 ${riskWithYellow} 家）`);
  console.log('  说明：「风险企业」口径仅含红/橙，黄档不计入');

  if (errors.length) {
    console.error('\n[FAIL] KPI 口径不一致：');
    errors.forEach(e => console.error('  - ' + e));
    console.error('\n排查：驾驶舱 demo/assets/js/pages/dashboard.js 的 riskEnts 与企业概况');
    console.error('      demo/assets/js/pages/enterprise.js 的 selRisk 必须同为 red||orange。');
    process.exit(1);
  }
  console.log('\n[PASS] 驾驶舱 / 企业概况 / 下钻列表 三处「风险企业」数字一致。');
  process.exit(0);
}, 30);
