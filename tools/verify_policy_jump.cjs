/* 企业画像 · AI 政策智能匹配卡片点击跳转 回归验证
 * 用 jsdom 装载指定版本的引擎（demo 或 web），模拟点击政策卡片，
 * 观察：卡片是否带 data-policy-id、点击后 state.page / 渲染器 / 宿主桥接回调的变化。
 * 用法：node tools/verify_policy_jump.cjs [demo|web]（默认 web）
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const target = process.argv[2] === 'demo' ? 'demo' : 'web';
const ROOT = path.join(__dirname, '..');
const read = p => fs.readFileSync(p, 'utf-8');

const ENGINE = target === 'web'
  ? path.join(ROOT, 'web/public/engine')
  : path.join(ROOT, 'demo/assets/js');
const DATA = target === 'web'
  ? path.join(ROOT, 'web/public/engine/mock.js')
  : path.join(ROOT, 'demo/assets/data/mock.js');

const html = read(path.join(ROOT, 'demo/index.html'));
const pagesDir = path.join(ENGINE, 'pages');
const pageFiles = fs.readdirSync(pagesDir).filter(f => f.endsWith('.js'));

const calls = { navigate: [], onRouteRendered: [], renderedPages: [] };

function Grad() { this.addColorStop = function () {}; }
const stubEcharts = {
  init: function () {
    return {
      setOption: function () {}, dispose: function () {},
      resize: function () {}, on: function () {}, isDisposed: function () { return false; }
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

// web 版引擎为扁平结构（engine/*.js），demo 版为 common/ 子目录
const commonDir = target === 'web' ? ENGINE : path.join(ENGINE, 'common');
w.eval(read(DATA));
w.eval('window.APP = {};');
w.eval(read(path.join(commonDir, 'utils.js')));
w.eval(read(path.join(commonDir, 'state.js')));
w.eval(read(path.join(commonDir, 'components.js')));
pageFiles.forEach(f => w.eval(read(path.join(pagesDir, f))));
w.eval(read(path.join(ENGINE, target === 'web' ? 'app-core.js' : 'app.js')));

// 纯前端版无宿主路由桥接（无 APP.navigate / APP.setPage），按各自机制验证
if (target === 'web') {
  w.APP.navigate = function (page) { calls.navigate.push(page); routerPush('/' + page); };
  w.APP.onRouteRendered = function (page) { calls.onRouteRendered.push(page); routerPush('/' + page); };
} else {
  w.APP.onRouteRendered = function (page) { calls.onRouteRendered.push(page); };
}
Object.keys(w.APP.renderers).forEach(function (k) {
  const orig = w.APP.renderers[k];
  w.APP.renderers[k] = function () { calls.renderedPages.push(k); return orig.apply(this, arguments); };
});

// —— 模拟 Vue Router + EngineHost 的路由桥接（仅 web 版需要） ——
let currentPath = '/profile';
function routerPush(target) {
  if (currentPath === target) return;
  currentPath = target;
  const page = target.slice(1);
  // EngineHost 的 watcher：if (APP.state.page !== page) setPageFromRoute(page)
  if (w.APP.state.page !== page) w.APP.setPage(page);
}

setTimeout(function () {
  let fail = 0;
  function chk(name, cond, extra) {
    console.log((cond ? '  [OK]   ' : '  [FAIL] ') + name + (extra !== undefined ? ' → ' + extra : ''));
    if (!cond) fail++;
  }

  console.log('\n===== 引擎版本：' + target + ' =====');

  w.APP.state.page = 'profile';
  w.APP.state.ent = w.MOCK.ENTERPRISES[0].id;
  calls.renderedPages.length = 0;
  w.APP.render();

  chk('画像页已渲染', calls.renderedPages.indexOf('profile') >= 0, calls.renderedPages.join(','));

  const all = w.document.querySelectorAll('.policy-item');
  const clickable = w.document.querySelectorAll('.policy-item[data-policy-id]');
  console.log('\n  政策卡片总数: ' + all.length + '  带 data-policy-id: ' + clickable.length);
  chk('政策卡片存在', all.length > 0, all.length);
  chk('卡片带 data-policy-id（可点击跳转）', clickable.length > 0, clickable.length);

  if (clickable.length) {
    const first = clickable[0];
    console.log('  首个卡片 policy-id: ' + first.getAttribute('data-policy-id'));
    calls.renderedPages.length = 0;
    calls.navigate.length = 0;
    calls.onRouteRendered.length = 0;

    first.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));

    console.log('\n  --- 点击后 ---');
    chk('state.page 切到 policy', w.APP.state.page === 'policy', w.APP.state.page);
    chk('policy 渲染器被调用', calls.renderedPages.indexOf('policy') >= 0, calls.renderedPages.join(','));
    if (target === 'web') {
      chk('走宿主路由桥接 APP.navigate', calls.navigate.indexOf('policy') >= 0, calls.navigate.join(','));
      chk('路由停在 /policy', currentPath === '/policy', currentPath);
    } else {
      chk('回退为直接切页重渲染（无 navigate）', calls.navigate.length === 0, calls.navigate.join(','));
    }

    const content = w.document.getElementById('content');
    const isPolicyPage = content && content.innerHTML.indexOf('全部层级') >= 0;
    const isProfilePage = content && content.innerHTML.indexOf('搜索企业名称') >= 0;
    chk('#content 最终是政策服务页', isPolicyPage && !isProfilePage,
      isPolicyPage ? '政策页' : (isProfilePage ? '仍是画像页 ✗' : '未知页面'));
    chk('已标记打开详情而非仅高亮', w.APP.state.policyLocateOnly === false, String(w.APP.state.policyLocateOnly));

    // 政策页是否按 policyId 自动筛选出对应政策（f.keyword）
    const kw = w.APP.state.filter.policy.keyword;
    chk('政策页已按该政策自动筛选', !!kw, kw || '(未筛选)');
  }

  console.log('\n===== 结果 =====');
  console.log(fail === 0 ? '全部通过 ✓' : '失败 ' + fail + ' 项 ✗');
  process.exit(fail === 0 ? 0 : 1);
}, 120);
