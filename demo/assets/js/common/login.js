/* ============================================================
 * 登录门禁模块（复刻前后端分离项目的登录页逻辑）
 * - 演示账号：admin / admin123（与后端 /auth/login 一致）
 * - 登录态以 localStorage 'zs_token' 持久化，刷新不丢失
 * - 未登录时由 #loginScreen 覆盖主应用，登录成功后回调 APP.startApp() 渲染
 * 依赖：APP.Components.confirm（可选，用于注销确认）
 * ============================================================ */
(function () {
  'use strict';

  var KEY_TOKEN = 'zs_token';
  var KEY_USER = 'zs_user';
  var DEFAULT_USER = { username: 'admin', name: '系统管理员', role: 'admin' };

  function getStoredUser() {
    try {
      var u = localStorage.getItem(KEY_USER);
      if (u) return JSON.parse(u);
    } catch (e) { /* ignore */ }
    return null;
  }

  var login = {
    isLoggedIn: function () {
      try { return !!localStorage.getItem(KEY_TOKEN); } catch (e) { return false; }
    },
    // 演示环境：仅比对演示账号；返回 { ok, msg }
    login: function (username, password) {
      if (username === 'admin' && password === 'admin123') {
        try {
          localStorage.setItem(KEY_TOKEN, 'demo-token-' + Date.now());
          localStorage.setItem(KEY_USER, JSON.stringify(DEFAULT_USER));
        } catch (e) { /* ignore */ }
        return { ok: true };
      }
      return { ok: false, msg: '用户名或密码错误' };
    },
    logout: function () {
      try {
        localStorage.removeItem(KEY_TOKEN);
        localStorage.removeItem(KEY_USER);
      } catch (e) { /* ignore */ }
    }
  };

  window.APP = window.APP || {};
  APP.login = login;

  // —— 主应用显隐控制（门禁切换） ——
  function showApp() {
    document.documentElement.classList.remove('logged-out');
    if (APP.startApp) APP.startApp();   // app.js 暴露：渲染主应用
  }
  function showLogin() {
    document.documentElement.classList.add('logged-out');
  }

  // —— 登录页交互绑定 ——
  function bindLoginScreen() {
    var screen = document.getElementById('loginScreen');
    if (!screen) return;
    var userInput = screen.querySelector('#loginUser');
    var passInput = screen.querySelector('#loginPass');
    var btn = screen.querySelector('#loginSubmit');
    var errEl = screen.querySelector('#loginError');

    // 预填演示账号，降低演示操作成本
    if (userInput && !userInput.value) userInput.value = 'admin';
    if (passInput && !passInput.value) passInput.value = 'admin123';

    function setErr(msg) {
      if (errEl) {
        errEl.textContent = msg || '';
        errEl.classList.toggle('on', !!msg);
      }
    }
    function submit() {
      var u = (userInput ? userInput.value : '').trim();
      var p = (passInput ? passInput.value : '').trim();
      if (!u || !p) { setErr('请输入用户名和密码'); return; }
      var res = login.login(u, p);
      if (res.ok) { setErr(''); showApp(); }
      else { setErr(res.msg); }
    }

    if (btn) btn.addEventListener('click', submit);
    [userInput, passInput].forEach(function (inp) {
      if (inp) inp.addEventListener('keyup', function (e) { if (e.key === 'Enter') submit(); });
    });
  }

  // —— 顶栏用户区：第一行账号名、第二行“系统管理员”，绑定注销 ——
  function syncUserArea() {
    var u = getStoredUser() || DEFAULT_USER;
    var nameEl = document.querySelector('.user-area .user-name');
    var roleEl = document.querySelector('.user-area .user-role');
    if (nameEl) nameEl.textContent = u.username || 'admin';
    if (roleEl) roleEl.textContent = u.name || '系统管理员';
  }

  function bindLogout() {
    var area = document.querySelector('.user-area');
    if (!area) return;
    area.title = '点击退出登录';
    area.addEventListener('click', function () {
      var doLogout = function () {
        login.logout();
        syncUserArea();
        showLogin();
      };
      if (APP.Components && APP.Components.confirm) {
        APP.Components.confirm('退出登录', '确定退出当前账号吗？', doLogout);
      } else if (window.confirm('确定退出当前账号吗？')) {
        doLogout();
      }
    });
  }

  function init() {
    syncUserArea();
    bindLoginScreen();
    bindLogout();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
