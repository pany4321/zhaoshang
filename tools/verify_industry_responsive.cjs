/* 产业分布饼图 · 响应式布局回归验证
 * 验证招商驾驶舱「产业分布结构」卡片在超窄屏 / 窄屏 / 宽屏三档下的布局切换，
 * 确保窄屏将图例移至饼图下方（横向换行、完整显示、不截断不挤压），扇区直接标签隐藏、
 * 饼图以像素半径固定在上方区域与底部图例互不重叠。
 * 用法：NODE_PATH=<workspace>/node_modules node tools/verify_industry_responsive.cjs
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const read = p => fs.readFileSync(p, 'utf-8');
const html = read(path.join(ROOT, 'demo/index.html'));
const mockJs = read(path.join(ROOT, 'demo/assets/data/mock.js'));
const utilsJs = read(path.join(ROOT, 'demo/assets/js/common/utils.js'));
const stateJs = read(path.join(ROOT, 'demo/assets/js/common/state.js'));
const compJs = read(path.join(ROOT, 'demo/assets/js/common/components.js'));
const appJs = read(path.join(ROOT, 'demo/assets/js/app.js'));
const pagesDir = path.join(ROOT, 'demo/assets/js/pages');
const pageFiles = fs.readdirSync(pagesDir).filter(f => f.endsWith('.js'));

const captured = {};
function Grad() { this.addColorStop = function () {}; }
const stubEcharts = {
  init: function (dom) {
    const id = dom && dom.id;
    const rec = { id: id, options: [] };
    return {
      setOption: function (opt) { rec.options.push(opt); captured[id] = rec; },
      dispose: function () {},
      resize: function () {},
      on: function () {},
      isDisposed: function () { return false; }
    };
  },
  registerMap: function () {},
  graphic: { LinearGradient: Grad, RadialGradient: Grad }
};

const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/' });
const w = dom.window;
w.echarts = stubEcharts;
w.requestAnimationFrame = cb => setTimeout(cb, 0);
w.console = console;

w.eval(mockJs);
w.eval('window.APP = {};');
w.eval(utilsJs);
w.eval(stateJs);
w.eval(compJs);
pageFiles.forEach(f => w.eval(read(path.join(pagesDir, f))));
w.eval(appJs);

setTimeout(function () {
  let fail = 0;
  function chk(name, actual, expected) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    console.log((ok ? '  [OK]   ' : '  [FAIL] ') + name + ' → ' + JSON.stringify(actual) +
      (ok ? '' : '  (期望 ' + JSON.stringify(expected) + ')'));
    if (!ok) fail++;
  }

  w.APP.state.page = 'dashboard';
  w.APP.render();

  const el = w.document.querySelector('#c_industry');
  if (!el) { console.error('[FAIL] 未找到图表容器 #c_industry'); process.exit(1); }
  if (!captured['c_industry']) { console.error('[FAIL] 产业饼图未初始化'); process.exit(1); }

  function setWidth(px) {
    Object.defineProperty(el, 'clientWidth', { get: () => px, configurable: true });
    w.dispatchEvent(new w.Event('resize'));
    const rec = captured['c_industry'];
    return rec.options[rec.options.length - 1];
  }

  console.log('\n--- 超窄屏 320px（图例移至饼图下方，横向换行完整显示）---');
  let o = setWidth(320);
  chk('容器高度', el.style.height, '330px');
  chk('图例显示', o.legend.show, true);
  chk('图例方向(横向)', o.legend.orient, 'horizontal');
  chk('图例位置(底部)', o.legend.bottom, 6);
  chk('图例不滚动(完整显示)', o.legend.type, 'plain');
  chk('扇区标签隐藏', o.series[0].label.show, false);
  chk('饼图半径(像素)', o.series[0].radius, [0, 96]);
  chk('饼图圆心(上方)', o.series[0].center, ['50%', 112]);

  console.log('\n--- 窄屏 390px（图例移至饼图下方）---');
  o = setWidth(390);
  chk('容器高度', el.style.height, '350px');
  chk('图例显示', o.legend.show, true);
  chk('图例方向(横向)', o.legend.orient, 'horizontal');
  chk('图例位置(底部)', o.legend.bottom, 6);
  chk('扇区标签隐藏', o.series[0].label.show, false);
  chk('饼图半径(像素)', o.series[0].radius, [0, 116]);
  chk('饼图圆心(上方)', o.series[0].center, ['50%', 132]);

  console.log('\n--- 宽屏 900px（保持原有右侧竖排图例布局）---');
  o = setWidth(900);
  chk('容器高度', el.style.height, '300px');
  chk('图例显示', o.legend.show === false, false);
  chk('图例方向', o.legend.orient, 'vertical');
  chk('扇区标签显示', o.series[0].label.show, true);
  chk('标签格式', o.series[0].label.formatter, '{b}\n{d}%');
  chk('饼图半径', o.series[0].radius, ['45%', '70%']);
  chk('饼图圆心', o.series[0].center, ['38%', '50%']);

  console.log('\n===== 结果 =====');
  console.log(fail === 0 ? '全部通过 ✓' : '失败 ' + fail + ' 项 ✗');
  process.exit(fail === 0 ? 0 : 1);
}, 100);
