/* 登录门禁功能校验：解析 index.html + 模拟登录模块行为 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const INDEX = path.join(ROOT, 'demo/index.html');
const LOGIN = path.join(ROOT, 'demo/assets/js/common/login.js');

let failures = 0;
function ok(cond, msg) {
  console.log((cond ? '  PASS ' : '  FAIL ') + msg);
  if (!cond) failures++;
}

// ---------- 1) index.html 解析 + 关键结构 ----------
console.log('[1] 解析 index.html 并校验结构');
const html = fs.readFileSync(INDEX, 'utf8');
const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://example/' });
const doc = dom.window.document;
ok(!!doc.getElementById('loginScreen'), '存在 #loginScreen 登录页容器');
ok(!!doc.getElementById('loginUser'), '存在登录用户名输入框 #loginUser');
ok(!!doc.getElementById('loginPass'), '存在登录密码输入框 #loginPass');
ok(!!doc.getElementById('loginSubmit'), '存在登录按钮 #loginSubmit');
ok(!!doc.getElementById('loginError'), '存在登录错误提示 #loginError');
ok(/assets\/js\/common\/login\.js/.test(html), 'index.html 已引入 login.js');
ok(/assets\/js\/app\.js/.test(html), 'index.html 仍引入 app.js');
ok(/class="login-page"/.test(html), '登录页使用 .login-page 类');
ok(/login-bg/.test(html) && /lg-star/.test(html), '登录页内联 SVG 背景（星河/数据网络）已复刻');
ok(/演示账号/.test(html), '登录页展示演示账号提示');
// 登录页必须是 .app 的兄弟节点（不被 .app 的 logged-out 隐藏规则误伤）
const loginScreen = doc.getElementById('loginScreen');
const appEl = doc.querySelector('.app');
ok(loginScreen && appEl && loginScreen.parentElement === appEl.parentElement, '#loginScreen 与 .app 同级（均为 body 直接子元素）');

// ---------- 2) 登录模块逻辑 + DOM 门禁切换 ----------
console.log('[2] 加载 login.js 校验门禁逻辑');
const tpl = `<!DOCTYPE html><html><head></head><body>
  <div id="loginScreen" class="login-page">
    <div class="login-card">
      <div class="login-brand"></div>
      <div class="login-form">
        <input id="loginUser" type="text"/>
        <input id="loginPass" type="password"/>
        <button id="loginSubmit" type="button"></button>
        <div id="loginError" class="login-error"></div>
        <div class="login-hint"></div>
      </div>
    </div>
  </div>
  <div class="app"><div class="user-area"><div class="user-meta">
    <div class="user-name">系统管理员</div><div class="user-role"></div>
  </div></div></div>
</body></html>`;
const w = new JSDOM(tpl, { runScripts: 'outside-only', url: 'https://example/' }).window;
w.APP = {};
w.APP.Components = { confirm: (t, m, cb) => cb() }; // 用即时确认替代浏览器 confirm
// 预填与真实脚本一致
w.document.documentElement.classList.add('logged-out');
// 在 window 全局作用域执行 login.js
w.eval(fs.readFileSync(LOGIN, 'utf8'));
// 模拟浏览器解析完成：触发 DOMContentLoaded，使 init()（绑定登录/登出）执行
if (w.document.readyState === 'loading') {
  w.document.dispatchEvent(new w.Event('DOMContentLoaded', { bubbles: true }));
}
const APP = w.APP;
const doc2 = w.document;

ok(typeof APP.login === 'object', 'APP.login 已注册');
ok(APP.login.isLoggedIn() === false, '初始未登录');
ok(doc2.documentElement.classList.contains('logged-out'), '初始处于 logged-out 覆盖态');

// 错误凭据
let r = APP.login.login('foo', 'bar');
ok(r.ok === false && r.msg === '用户名或密码错误', '错误凭据被拒绝并提示“用户名或密码错误”');
ok(APP.login.isLoggedIn() === false, '错误凭据后仍未登录');

// 正确凭据
r = APP.login.login('admin', 'admin123');
ok(r.ok === true, '正确凭据 admin/admin123 通过');
ok(APP.login.isLoggedIn() === true, '登录成功后 isLoggedIn 为真');
ok(!!w.localStorage.getItem('zs_token') && !!w.localStorage.getItem('zs_user'), '登录态写入 localStorage');

// 表单提交路径：模拟输入框 + 点击按钮 → 移除 logged-out（APP.startApp 不存在时不报错）
w.localStorage.removeItem('zs_token');
w.localStorage.removeItem('zs_user');
doc2.documentElement.classList.add('logged-out');
doc2.getElementById('loginUser').value = 'admin';
doc2.getElementById('loginPass').value = 'admin123';
doc2.getElementById('loginSubmit').dispatchEvent(new w.Event('click'));
ok(!doc2.documentElement.classList.contains('logged-out'), '点击登录按钮后移除 logged-out（主应用显现）');
ok(APP.login.isLoggedIn() === true, '提交后登录态持久化');

// 注销路径：点击 .user-area → confirm 通过 → 清除登录态并回到 logged-out
doc2.getElementById('loginSubmit'); // noop
doc2.querySelector('.user-area').dispatchEvent(new w.Event('click'));
ok(APP.login.isLoggedIn() === false, '注销后清除登录态');
ok(doc2.documentElement.classList.contains('logged-out'), '注销后回到登录页覆盖态');
ok(doc2.querySelector('.user-role').textContent.indexOf('管理员') >= 0, '顶栏用户区角色回填正常');

console.log('\n' + (failures === 0 ? '✅ 全部通过' : '❌ 失败 ' + failures + ' 项'));
process.exit(failures === 0 ? 0 : 1);
