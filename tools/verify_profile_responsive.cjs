/* 企业画像 · 经营趋势图窄屏响应式 回归验证
 * 用 jsdom 装载引擎，切到「经营趋势」页签并模拟容器宽度，
 * 验证窄屏下收紧边距、隐藏轴名、缩小轴标签，避免文字挤压重叠。
 * 用法：node tools/verify_profile_responsive.cjs [demo|web]（默认 web）
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const target = process.argv[2] === 'demo' ? 'demo' : 'web';
const ROOT = path.join(__dirname, '..');
const read = p => fs.readFileSync(p, 'utf-8');

const ENGINE = target === 'web' ? path.join(ROOT, 'web/public/engine') : path.join(ROOT, 'demo/assets/js');
const DATA = target === 'web' ? path.join(ROOT, 'web/public/engine/mock.js') : path.join(ROOT, 'demo/assets/data/mock.js');
const html = read(path.join(ROOT, 'demo/index.html'));
const pagesDir = path.join(ENGINE, 'pages');
const pageFiles = fs.readdirSync(pagesDir).filter(f => f.endsWith('.js'));

const captured = {};
function Grad() { this.addColorStop = function () {}; }
const stubEcharts = {
  init: function (dom) {
    const id = dom && dom.id;
    const rec = { id: id, options: [] };
    return {
      setOption: function (opt) { rec.options.push(opt); captured[id] = rec; },
      dispose: function () {}, resize: function () {}, on: function () {},
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

const commonDir = target === 'web' ? ENGINE : path.join(ENGINE, 'common');
w.eval(read(DATA));
w.eval('window.APP = {};');
w.eval(read(path.join(commonDir, 'utils.js')));
w.eval(read(path.join(commonDir, 'state.js')));
w.eval(read(path.join(commonDir, 'components.js')));
pageFiles.forEach(f => w.eval(read(path.join(pagesDir, f))));
w.eval(read(path.join(ENGINE, target === 'web' ? 'app-core.js' : 'app.js')));

let fail = 0;
function chk(name, cond, extra) {
  console.log((cond ? '  [OK]   ' : '  [FAIL] ') + name + (extra !== undefined ? ' → ' + JSON.stringify(extra) : ''));
  if (!cond) fail++;
}

// 渲染画像页并切到「经营趋势」页签（index 2）
w.APP.state.page = 'profile';
w.APP.state.ent = w.MOCK.ENTERPRISES[0].id;
w.APP.render();

const trendEl = w.document.getElementById('c_profile_trend');
if (!trendEl) { console.error('[FAIL] 未找到趋势图容器 #c_profile_trend'); process.exit(1); }

let width = 320;
Object.defineProperty(trendEl, 'offsetWidth', { get: () => width, configurable: true });

const tab = w.document.querySelector('.six-layer-tabs .tab[data-tab="2"]');
if (!tab) { console.error('[FAIL] 未找到经营趋势页签'); process.exit(1); }
tab.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));

setTimeout(function () {
  console.log('\n===== 引擎版本：' + target + ' =====');
  const rec = captured['c_profile_trend'];
  if (!rec) { console.error('[FAIL] 趋势图未初始化'); process.exit(1); }

  console.log('\n--- 窄屏 320px ---');
  let o = rec.options[rec.options.length - 1];
  chk('绘图区自动避让轴标签', o.grid.containLabel, true);
  chk('左右边距收紧', o.grid.left <= 6 && o.grid.right <= 6, [o.grid.left, o.grid.right]);
  chk('隐藏 Y 轴名称（单位已在图例）', o.yAxis[0].name === '' && o.yAxis[1].name === '',
    [o.yAxis[0].name, o.yAxis[1].name]);
  chk('轴标签字号缩小', o.xAxis.axisLabel.fontSize === 9, o.xAxis.axisLabel.fontSize);
  chk('X 轴标签自动隐藏重叠项', o.xAxis.axisLabel.hideOverlap, true);

  // 切到宽屏后触发 resize
  width = 900;
  w.dispatchEvent(new w.Event('resize'));
  setTimeout(function () {
    console.log('\n--- 宽屏 900px（恢复完整标注）---');
    const o2 = captured['c_profile_trend'].options[captured['c_profile_trend'].options.length - 1];
    chk('Y 轴名称恢复', o2.yAxis[0].name === '营收(亿)' && o2.yAxis[1].name === '万元',
      [o2.yAxis[0].name, o2.yAxis[1].name]);
    chk('轴标签字号恢复', o2.xAxis.axisLabel.fontSize === 10, o2.xAxis.axisLabel.fontSize);

    console.log('\n===== 结果 =====');
    console.log(fail === 0 ? '全部通过 ✓' : '失败 ' + fail + ' 项 ✗');
    process.exit(fail === 0 ? 0 : 1);
  }, 60);
}, 200);
