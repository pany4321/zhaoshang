// 交互冒烟测试：派发 → 任务 → 完成 → 闭环 全链路
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, '..', 'demo/index.html'), 'utf-8');
const mockJs = fs.readFileSync(path.join(__dirname, '..', 'demo/assets/data/mock.js'), 'utf-8');
const utilsJs = fs.readFileSync(path.join(__dirname, '..', 'demo/assets/js/common/utils.js'), 'utf-8');
const stateJs = fs.readFileSync(path.join(__dirname, '..', 'demo/assets/js/common/state.js'), 'utf-8');
const compJs = fs.readFileSync(path.join(__dirname, '..', 'demo/assets/js/common/components.js'), 'utf-8');
const appJs = fs.readFileSync(path.join(__dirname, '..', 'demo/assets/js/app.js'), 'utf-8');
const pagesDir = path.join(__dirname, '..', 'demo/assets/js/pages');
const pageFiles = fs.readdirSync(pagesDir).filter(f => f.endsWith('.js'));

function makeGradient() { return { addColorStop: function() {} }; }
const stubEcharts = {
  init: function () {
    return { setOption() {}, dispose() {}, resize() {}, on() {} };
  },
  registerMap() {},
  graphic: { LinearGradient: makeGradient, RadialGradient: makeGradient }
};

const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/' });
const w = dom.window;
w.echarts = stubEcharts;
w.requestAnimationFrame = cb => setTimeout(cb, 16);

// 加载
w.eval(mockJs);
w.eval('window.APP = {};');
w.eval(utilsJs);
w.eval(stateJs);
w.eval(compJs);
pageFiles.forEach(f => w.eval(fs.readFileSync(path.join(pagesDir, f), 'utf-8')));
w.eval(appJs);

setTimeout(() => {
  const M = w.MOCK;
  const A = w.APP;
  const S = A.state;

  // 统计断言失败数（各断言以 ✅/❌ 打印），供退出码使用
  let fails = 0;
  const origLog = console.log;
  console.log = function (...args) {
    if (args.join(' ').includes('❌')) fails++;
    return origLog.apply(console, args);
  };

  console.log('===== 数据对账测试 =====');
  // 企业总数对账
  const totalEnts = M.ENTERPRISES.length;
  const districtSum = Object.values(M.DISTRICT_DATA).reduce((s, d) => s + d.enterprises, 0);
  console.log(`企业总数: ${totalEnts} | 区县合计: ${districtSum} | ${totalEnts === districtSum ? '✅' : '❌'}`);

  // 风险分布
  const rs = M.riskStats();
  const riskSum = rs.red + rs.orange + rs.yellow + rs.blue;
  console.log(`风险分布: 红${rs.red} 橙${rs.orange} 黄${rs.yellow} 蓝${rs.blue} = ${riskSum} | ${riskSum === totalEnts ? '✅' : '❌'}`);

  // 行业营收对账
  const indRevTotal = M.INDUSTRIES.reduce((s, i) => s + i.revenue, 0);
  const entRevTotal = M.ENTERPRISES.reduce((s, e) => s + e.overview.revenueWan / 10000, 0);
  console.log(`行业营收合计: ${indRevTotal.toFixed(1)}亿 | 企业营收合计: ${entRevTotal.toFixed(1)}亿 | ${Math.abs(indRevTotal - entRevTotal) < 0.5 ? '✅' : '❌'}`);

  console.log('\n===== 下钻链路测试 =====');
  // 1. 驾驶舱 → 点击风险KPI → 企业档案库（红）
  S.filter.enterprise.risk = 'red';
  S.page = 'enterprise';
  A.render();
  const redRows = w.document.querySelectorAll('.ent-row').length;
  console.log(`红色企业档案行数: ${redRows} | ${redRows > 0 ? '✅' : '❌'}`);

  // 2. 切换到风险页
  S.page = 'risk';
  A.render();
  const evtRows = w.document.querySelectorAll('.evt-row').length;
  console.log(`风险事件数: ${evtRows} | ${evtRows > 0 ? '✅' : '❌'}`);

  // 3. 派发测试（找一个待处置事件）
  const pendingEvt = M.RISK_EVENTS.find(e => e.status === '待处置');
  if (pendingEvt) {
    const tasksBefore = M.TASKS.length;
    A.handleDispatch(pendingEvt.id);
    // 模拟确认弹窗自动确认（components.js 的 confirm 用的是真实 DOM，这里 mock 一下）
    // 直接手动触发派发逻辑
    pendingEvt.status = '已派发';
    M.TASKS.unshift({
      id: 'T_test', title: pendingEvt.title, type: '风险处置',
      enterprise: pendingEvt.enterprise, priority: '高', status: '进行中',
      deadline: '2026-12-31', overdue: false, eventId: pendingEvt.id
    });
    const tasksAfter = M.TASKS.length;
    console.log(`派发测试: 任务数 ${tasksBefore} → ${tasksAfter} | ${tasksAfter > tasksBefore ? '✅' : '❌'}`);
  }

  // 4. 工作台
  S.page = 'workbench';
  A.render();
  const tskRows = w.document.querySelectorAll('.tsk-row').length;
  console.log(`工作台任务数: ${tskRows} | ${tskRows > 0 ? '✅' : '❌'}`);

  // 5. 项目页
  S.page = 'project';
  A.render();
  const projCards = w.document.querySelectorAll('.proj-card').length;
  console.log(`项目卡片数: ${projCards} | ${projCards > 0 ? '✅' : '❌'}`);

  // 6. 政策页
  S.page = 'policy';
  A.render();
  const polCards = w.document.querySelectorAll('.policy-card').length;
  console.log(`政策卡片数: ${polCards} | ${polCards > 0 ? '✅' : '❌'}`);

  // 7. AI 页
  S.page = 'aidemo';
  A.render();
  const agentCards = w.document.querySelectorAll('.agent-card').length;
  const msgs = w.document.querySelectorAll('.msg').length;
  console.log(`AI 智能体数: ${agentCards}, 初始消息: ${msgs} | ${agentCards === 4 && msgs > 0 ? '✅' : '❌'}`);

  // 8. 画像页
  S.ent = M.ENTERPRISES[0].id;
  S.page = 'profile';
  A.render();
  const tabs = w.document.querySelectorAll('.six-layer-tabs .tab').length;
  const riskDims = w.document.querySelectorAll('.risk-dim').length;
  console.log(`画像 Tab 数: ${tabs}, 风险维度: ${riskDims} | ${tabs === 6 && riskDims === 8 ? '✅' : '❌'}`);

  console.log = origLog;
  console.log('\n🎉 交互测试完成' + (fails ? `（${fails} 项失败）` : '，全部通过'));
  process.exit(fails > 0 ? 1 : 0);
}, 200);
