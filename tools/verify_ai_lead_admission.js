// AI 推荐「确认纳入」字段真实性回归
// 覆盖：外省线索不得伪造区县 / 注册资本用真实工商值 / 国标二级→招商产业映射 / 承诺项不留假数据
// 用法：node tools/verify_ai_lead_admission.js（需在仓库根执行）
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'demo/index.html'), 'utf-8');
const mockJs = fs.readFileSync(path.join(root, 'demo/assets/data/mock.js'), 'utf-8');
const utilsJs = fs.readFileSync(path.join(root, 'demo/assets/js/common/utils.js'), 'utf-8');
const stateJs = fs.readFileSync(path.join(root, 'demo/assets/js/common/state.js'), 'utf-8');
const compJs = fs.readFileSync(path.join(root, 'demo/assets/js/common/components.js'), 'utf-8');
const appJs = fs.readFileSync(path.join(root, 'demo/assets/js/app.js'), 'utf-8');
const pagesDir = path.join(root, 'demo/assets/js/pages');
const pageFiles = fs.readdirSync(pagesDir).filter((f) => f.endsWith('.js'));

function makeGradient() {
  return { addColorStop: function () {} };
}
const stubEcharts = {
  init: () => ({ setOption() {}, dispose() {}, resize() {}, on() {} }),
  registerMap() {},
  graphic: { LinearGradient: makeGradient, RadialGradient: makeGradient },
};

const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/' });
const w = dom.window;
w.echarts = stubEcharts;
w.requestAnimationFrame = (cb) => setTimeout(cb, 16);

w.eval(mockJs);
w.eval('window.APP = {};');
w.eval(utilsJs);
w.eval(stateJs);
w.eval(compJs);
pageFiles.forEach((f) => w.eval(fs.readFileSync(path.join(pagesDir, f), 'utf-8')));
w.eval(appJs);

let pass = 0;
let fail = 0;
function ok(name, cond, actual) {
  if (cond) {
    pass++;
    console.log(`  [OK]   ${name}`);
  } else {
    fail++;
    console.log(`  [FAIL] ${name} → ${JSON.stringify(actual)}`);
  }
}

// —— 固定推荐响应（模拟后端：两家外省真实企业） ——
const FAKE_RECS = {
  code: 0,
  data: {
    summary: '测试用总体判断',
    poolSize: 325,
    degraded: false,
    recommendations: [
      {
        id: 1,
        name: '宁夏测试化工有限责任公司',
        province: '宁夏',
        city: '银川市',
        industryL2: '化学原料和化学制品制造业',
        regCapital: 30000, // 万元（3 亿）
        foundDate: '2008-05-01',
        score: 91,
        reasons: ['国标行业为化学原料和化学制品制造业，与庆阳石化产业链匹配'],
        approach: '核实原料就近供应意愿',
      },
      {
        id: 2,
        name: '陕西测试软件技术有限公司',
        province: '陕西省',
        city: '西安市',
        industryL2: '软件和信息技术服务业',
        regCapital: 20000,
        foundDate: '2010-01-01',
        score: 88,
        reasons: ['软件和信息技术服务业，可对接东数西算算力需求'],
        approach: '对接算力消纳与数据标注业务',
      },
    ],
  },
};

w.localStorage.setItem('zs_token', 'test-token');
w.fetch = function (url) {
  if (String(url).indexOf('/api/ai/project-recommend') >= 0) {
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(FAKE_RECS) });
  }
  return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
};

setTimeout(() => {
  const M = w.MOCK;
  const doc = w.document;

  console.log('\n=== AI 推荐 → 确认纳入 字段回归 ===');
  const beforeEnt = M.ENTERPRISES.length;
  const beforeProj = M.PROJECTS.length;

  // 进入项目管理页并触发 AI 推荐
  w.APP.state.page = 'project';
  w.APP.render();
  const btn = doc.querySelector('#pjAiRec');
  ok('AI 推荐按钮存在', !!btn);
  if (!btn) {
    console.log('\n结果：无法继续（按钮缺失）');
    process.exit(1);
  }
  btn.click();

  // 等待 6 步动画（合计约 5.1s + 随机抖动）结束，结果区出现按钮
  const started = Date.now();
  const timer = setInterval(() => {
    const applyBtn = doc.querySelector('#aiRecApplyBtn');
    const ready = applyBtn && applyBtn.style.display !== 'none';
    if (!ready && Date.now() - started < 15000) return;
    clearInterval(timer);
    if (!ready) {
      console.log('  [FAIL] 推荐结果未在 15s 内就绪');
      process.exit(1);
    }
    applyBtn.click();

    setTimeout(() => {
      const added = M.ENTERPRISES.slice(0, M.ENTERPRISES.length - beforeEnt);
      const projs = M.PROJECTS.slice(0, M.PROJECTS.length - beforeProj);
      ok('企业档案已进入企业名单', added.length === 2, added.length);
      ok('招商项目已创建', projs.length === 2, projs.length);

      const chem = added.find((e) => e.name.indexOf('化工') >= 0);
      const soft = added.find((e) => e.name.indexOf('软件') >= 0);
      ok('两家推荐企业均建档', !!chem && !!soft);

      if (chem && soft) {
        // 1) 注册资本取真实工商值，不再 ×0.25
        ok('注册资本=真实工商值（30000 万）', chem.regCapital === 30000, chem.regCapital);
        ok('注册资本展示单位正确', chem.regCapitalFmt === '3.0亿元', chem.regCapitalFmt);
        ok('软件企业注册资本=20000 万', soft.regCapital === 20000, soft.regCapital);

        // 2) 区县不得伪造为西峰区
        ok('区县未伪造（district 为空）', chem.district === '', chem.district);
        ok('区县展示为省外线索', String(chem.districtName).indexOf('省外线索') >= 0, chem.districtName);
        ok('区县展示含真实所在地', String(chem.districtName).indexOf('银川') >= 0, chem.districtName);
        ok('地址标注待落地核实', String(chem.address).indexOf('待落地核实') >= 0, chem.address);
        ok('地址未伪造园区', String(chem.address).indexOf('产业园区') < 0, chem.address);

        // 3) 产业按国标二级映射，不回落默认 software
        ok('化学原料→chemical', chem.industry === 'chemical', chem.industry);
        ok('化工企业产业名非默认软件业', chem.industryName !== '软件与信息技术', chem.industryName);
        ok('软件和信息技术→software', soft.industry === 'software', soft.industry);

        // 4) 项目侧：区县/承诺项
        const chemProj = projs.find((p) => p.name.indexOf('化工') >= 0);
        ok('项目区县为空', chemProj && chemProj.district === '', chemProj && chemProj.district);
        ok(
          '项目区县展示省外线索',
          chemProj && String(chemProj.districtName).indexOf('省外线索') >= 0,
          chemProj && chemProj.districtName
        );
        ok(
          '承诺项不含「就业 0 人」',
          chemProj && !chemProj.promises.some((s) => s.indexOf('就业 0') >= 0),
          chemProj && chemProj.promises
        );
        ok(
          '承诺项不含「营收 —」',
          chemProj && !chemProj.promises.some((s) => s.indexOf('—') >= 0),
          chemProj && chemProj.promises
        );
        ok(
          '承诺项标注投资额待核实',
          chemProj && chemProj.promises.some((s) => s.indexOf('待初访核实') >= 0),
          chemProj && chemProj.promises
        );
      }

      console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
      process.exit(fail ? 1 : 0);
    }, 200);
  }, 200);
}, 300);
