/* ============================================================
 * V4 入口：路由、图表生命周期、全局绑定
 * 依赖加载顺序：echarts → mock.js → common/utils.js → common/state.js
 *           → common/components.js → pages/*.js → app.js
 * ============================================================ */
(function () {
  'use strict';
  var U = APP.U;
  var state = APP.state;
  var C = APP.Components;
  var M = window.MOCK;

  // 图表生命周期（APP.mkChart / disposeCharts 已在 common/state.js 定义）
  window.addEventListener('resize', function () {
    APP.liveCharts.forEach(function (c) { try { c.resize(); } catch (e) {} });
  });

  // 页面元数据（标题）
  var PAGE_META = {
    dashboard:  { t: '招商驾驶舱' },
    enterprise: { t: '企业概况' },
    profile:    { t: '企业画像' },
    risk:       { t: '风险预警' },
    graph:      { t: '关系图谱' },
    workbench:  { t: '我的工作台' },
    project:    { t: '招商项目' },
    policy:     { t: '政策服务' },
    aidemo:     { t: '招商智能体' }
  };

  // 浏览器历史路由状态（页面切换写入历史，支持浏览器后退/前进）
  var currentPage = null;
  var navigatingFromHistory = false;

  // 主渲染函数
  function render() {
    APP.disposeCharts();
    C.closeDrawer();
    closeSearchDialog(); // 任何页面切换都关闭全局搜索弹窗
    document.body.classList.remove('nav-open'); // 小屏抽屉导航随切页自动收起
    clearDemoTip();
    clearDemoHighlight();

    var meta = PAGE_META[state.page] || { t: '' };
    U.$('#pageTitle').textContent = meta.t;

    // 导航高亮
    U.$$('#nav .nav-item').forEach(function (n) {
      n.classList.toggle('active', n.dataset.page === state.page);
    });

    var samePage = currentPage === state.page; // 同页操作（筛选/排序/分页）保持滚动（先记下来，后面会更新 currentPage）

    // 页面切换时写入浏览器历史（首次用替换不产生多余记录；一键演示期间不写入）
    if (currentPage !== state.page) {
      try {
        if (currentPage === null) {
          history.replaceState({ page: state.page }, '', '#/' + state.page);
        } else if (!navigatingFromHistory && !state.demoPlaying) {
          history.pushState({ page: state.page }, '', '#/' + state.page);
        }
      } catch (e) { /* 极少数环境限制 file:// 历史 API 时静默降级 */ }
      navigatingFromHistory = false;
      currentPage = state.page;
    }

    // 内容区淡入 + 滚动控制
    var content = U.$('#content');
    content.style.animation = 'none';
    content.offsetHeight;
    content.style.animation = '';
    var prevScroll = content.scrollTop;

    var fn = APP.renderers[state.page];
    if (fn) fn();

    // 滚动优先级：页面指定目标(state.scrollTo) > 切页归零 > 同页保持
    // 放到 setTimeout 确保 DOM 布局完成后再设置，避免 innerHTML 替换导致的浏览器自动滚动
    var targetScroll = state.scrollTo;
    state.scrollTo = null;
    setTimeout(function () {
      if (typeof targetScroll === 'number') {
        content.scrollTop = targetScroll;
      } else if (samePage) {
        content.scrollTop = prevScroll;
      } else {
        content.scrollTop = 0;
      }
    }, 0);
  }
  APP.render = render;

  // 全局下钻：切换到某企业画像
  APP.viewEnterprise = function (id) {
    state.ent = id;
    state.page = 'profile';
    render();
  };
  // 兼容旧接口
  window.viewEnt = APP.viewEnterprise;

  // 全局下钻：切换到风险中心（带筛选）
  APP.goRisk = function (opts) {
    state.page = 'risk';
    if (opts && opts.level) state.filter.risk.level = opts.level;
    if (opts && opts.district) state.filter.risk.district = opts.district;
    if (opts && opts.keyword) state.filter.risk.keyword = opts.keyword;
    state.filter.risk.page = 1;
    render();
    // 跳转到风险事件清单卡片顶部（延迟到 render 的滚动重置之后再设）
    setTimeout(function () {
      setTimeout(function () {
        var content = U.$('#content');
        if (!content) return;
        // 找到"风险事件清单"卡片标题
        var titles = document.querySelectorAll('.card-title');
        var target = null;
        for (var i = titles.length - 1; i >= 0; i--) {
          if (titles[i].textContent.indexOf('风险事件清单') >= 0) { target = titles[i]; break; }
        }
        if (!target) return;
        var rect = target.getBoundingClientRect();
        var cRect = content.getBoundingClientRect();
        var offsetTop = content.scrollTop + (rect.top - cRect.top);
        content.scrollTop = Math.max(0, offsetTop);
      }, 0);
    }, 0);
  };

  // 派发风险事件 → 生成任务
  APP.handleDispatch = function (eventId) {
    var ev = null;
    for (var i = 0; i < M.RISK_EVENTS.length; i++) {
      if (M.RISK_EVENTS[i].id === eventId) { ev = M.RISK_EVENTS[i]; break; }
    }
    if (!ev) return;
    if (ev.status !== '待处置') {
      C.toast('该事件已在处置流程中', 'warning');
      return;
    }
    C.confirm('派发确认', '确定将「' + ev.title + '」派发处置？', function () {
      ev.status = '已派发';
      state.dispatched[eventId] = true;
      // 生成对应任务
      var today = new Date();
      var deadline = new Date(today.getTime() + 7 * 86400000);
      var p = function (x) { return x < 10 ? '0' + x : '' + x; };
      var deadlineStr = deadline.getFullYear() + '-' + p(deadline.getMonth()+1) + '-' + p(deadline.getDate());
      var newTask = {
        id: 'T' + (M.TASKS.length + 100),
        title: ev.title + ' - 风险处置',
        type: '风险处置',
        enterprise: ev.entId,
        enterpriseName: (M.entById(ev.entId) || {}).name || ev.enterprise,
        priority: ev.level === 'red' ? '高' : (ev.level === 'orange' ? '中' : '低'),
        status: '进行中',
        deadline: deadlineStr,
        overdue: false,
        overdueDays: 0,
        eventId: ev.id,
        source: '风险预警派发'
      };
      M.TASKS.unshift(newTask);
      C.toast('已派发，任务已生成', 'success');
      render();
    });
  };

  // 跳转到工作台并定位某任务
  APP.goDispatch = function (eventId) {
    state.page = 'workbench';
    state.filter.workbench.status = '';
    state.filter.workbench.type = '';
    state.filter.workbench.page = 1;
    render();
    C.toast('请在工作台查看处置进展', 'info');
  };

  // ---------------- 全局搜索（企业 / 项目 / 政策） ----------------
  var searchMask = null;

  function closeSearchDialog() {
    if (searchMask && searchMask.parentNode) searchMask.parentNode.removeChild(searchMask);
    searchMask = null;
    document.removeEventListener('keydown', searchKeyHandler);
  }
  function searchKeyHandler(e) { if (e.key === 'Escape') closeSearchDialog(); }

  // 回车触发：按 企业名称 → 项目名称 → 政策名称 依次匹配，弹窗分类展示
  APP.runGlobalSearch = function (kw) {
    kw = (kw || '').trim();
    if (!kw) { C.toast('请输入搜索关键词', 'warning'); return; }
    var k = kw.toLowerCase();
    function hit(s) { return (s || '').toLowerCase().indexOf(k) >= 0; }

    var ents = M.ENTERPRISES.filter(function (e) { return hit(e.name); });
    var projs = M.PROJECTS.filter(function (p) { return hit(p.name) || hit(p.shortName); });
    var pols = M.POLICY_LIB.filter(function (p) { return hit(p.name); });

    var LIMIT = 8; // 每类最多展示条数，超出给提示
    function secHead(icon, title, n) {
      return '<div style="display:flex;align-items:baseline;gap:8px;margin:12px 0 6px;">' +
        '<span style="font-size:13px;font-weight:700;color:#0F172A;">' + icon + ' ' + title + '</span>' +
        '<span style="font-size:11px;color:#94A3B8;">共 ' + n + ' 条匹配</span></div>';
    }
    function rows(list, renderRow) {
      return list.slice(0, LIMIT).map(renderRow).join('') +
        (list.length > LIMIT ? '<div style="padding:5px 10px 2px;font-size:11px;color:#94A3B8;">… 还有 ' + (list.length - LIMIT) + ' 条匹配未展示，可细化关键词</div>' : '');
    }

    var entHtml = ents.length ? secHead('◫', '企业', ents.length) + rows(ents, function (e) {
      var lv = M.LEVELS[e.riskLevel];
      return '<div class="gs-row" onclick="APP.globalSearchJump(\'ent\',\'' + e.id + '\')">' +
        '<span class="gs-name">' + U.esc(e.name) + '</span>' +
        '<span class="gs-meta">' + U.esc(e.industryName) + ' · ' + U.esc(e.districtName) + '</span>' +
        '<span class="gs-badge" style="color:' + lv.color + ';background:' + lv.bg + ';">' + lv.name + '</span>' +
      '</div>';
    }) : '';

    var projHtml = projs.length ? secHead('❖', '招商项目', projs.length) + rows(projs, function (p) {
      return '<div class="gs-row" onclick="APP.globalSearchJump(\'proj\',\'' + p.id + '\')">' +
        '<span class="gs-name">' + U.esc(p.shortName || p.name) + '</span>' +
        '<span class="gs-meta">' + U.esc(p.stageName) + ' · ' + U.esc(p.enterpriseName) + ' · 总投资 ' + U.esc(p.amount) + '</span>' +
        '<span class="gs-badge" style="color:#2563EB;background:#EFF6FF;">' + U.esc(p.stageName) + '</span>' +
      '</div>';
    }) : '';

    var polHtml = pols.length ? secHead('✎', '政策', pols.length) + rows(pols, function (p) {
      return '<div class="gs-row" onclick="APP.globalSearchJump(\'pol\',\'' + (p.code || p.id) + '\')">' +
        '<span class="gs-name">' + U.esc(p.name) + '</span>' +
        '<span class="gs-meta">' + U.esc(p.dept) + '</span>' +
        '<span class="gs-badge" style="color:#2563EB;background:#EFF6FF;">' + U.esc(p.level) + '</span>' +
      '</div>';
    }) : '';

    var total = ents.length + projs.length + pols.length;
    var bodyHtml = total === 0
      ? '<div style="text-align:center;padding:36px 0 30px;color:#94A3B8;">' +
          '<div style="font-size:34px;margin-bottom:10px;">⌕</div>' +
          '<div style="font-size:13px;color:#475569;">未找到与「' + U.esc(kw) + '」相关的企业、项目或政策</div>' +
          '<div style="font-size:12px;margin-top:6px;">可尝试企业简称、项目名称或政策名称关键词</div>' +
        '</div>'
      : entHtml + projHtml + polHtml;

    closeSearchDialog();
    searchMask = U.el('div', { class: 'modal-mask' });
    searchMask.style.zIndex = 10000;
    var box = U.el('div', { class: 'modal' });
    box.style.width = '620px';
    box.style.maxWidth = '94vw';
    box.innerHTML =
      '<div class="modal-header" style="display:flex;align-items:center;gap:10px;">' +
        '<span style="flex:1;">⌕ 搜索结果 ·「' + U.esc(kw) + '」</span>' +
        '<span id="gsClose" style="cursor:pointer;font-size:20px;line-height:1;color:#94A3B8;font-weight:400;padding:0 2px;">×</span>' +
      '</div>' +
      '<div class="modal-body">' + bodyHtml + '</div>';
    searchMask.appendChild(box);
    document.body.appendChild(searchMask);
    searchMask.addEventListener('click', function (ev) { if (ev.target === searchMask) closeSearchDialog(); });
    box.querySelector('#gsClose').addEventListener('click', closeSearchDialog);
    document.addEventListener('keydown', searchKeyHandler);
  };

  // 点击匹配行跳转：企业→画像、项目→项目清单筛选定位、政策→政策列表筛选定位；跳转后关闭对话框
  APP.globalSearchJump = function (type, id) {
    closeSearchDialog();
    var input = U.$('#globalSearch');
    if (input) { input.value = ''; input.blur(); }
    if (type === 'ent') { APP.viewEnterprise(id); return; }
    if (type === 'proj') {
      // 以项目全名作为清单关键词，自动过滤出该项目并高亮定位（不打开详情抽屉）
      var p = null;
      for (var i = 0; i < M.PROJECTS.length; i++) if (M.PROJECTS[i].id === id) { p = M.PROJECTS[i]; break; }
      var fp = state.filter.project;
      fp.keyword = p ? p.name : '';
      fp.stage = '';
      fp.district = 'all';
      fp.owner = '';
      fp.page = 1;
      state.highlightProjectId = id; // 复用新建项目后的高亮+滚动定位机制
      state.page = 'project';
      render();
      return;
    }
    // 政策：走 policy 页的 state.policyId 联动通道；locate-only 模式只筛选定位、不打开抽屉
    state.policyId = id;
    state.policyLocateOnly = true;
    state.page = 'policy';
    render();
  };

  // ---------------- 任务创建（手动 / 各页面一键添加） ----------------
  var TASK_TYPES = ['风险处置', '项目跟进', '企业服务', '政策推送', '日常巡检'];
  var taskSeq = 0;

  // 创建任务（各页面共用）：d = { title, type, entId, due, priority, source }
  APP.createTask = function (d) {
    var ent = d.entId ? M.entById(d.entId) : null;
    taskSeq++;
    var t = {
      id: 'TM' + (taskSeq < 10 ? '0' : '') + taskSeq,
      title: d.title,
      type: TASK_TYPES.indexOf(d.type) >= 0 ? d.type : '企业服务',
      enterprise: ent ? ent.id : '',
      enterpriseName: ent ? ent.name : '',
      due: d.due,
      priority: d.priority || '中',
      status: '待处理',
      source: d.source || '手动创建',
      createTime: U.fmtDateTime(new Date())
    };
    M.TASKS.unshift(t);
    return t;
  };

  // 新建任务表单（抽屉）；prefill 可预填 { title, type, entId, projectId }
  APP.openTaskForm = function (prefill) {
    prefill = prefill || {};
    var p = prefill.projectId
      ? M.PROJECTS.filter(function (x) { return x.id === prefill.projectId; })[0]
      : null;
    if (p && !prefill.title) prefill.title = '【项目跟进】' + p.shortName + ' 进度跟进';
    if (p && !prefill.entId) prefill.entId = p.enterprise;
    if (p && !prefill.type) prefill.type = '项目跟进';

    var today = new Date();
    function dstr(offset) {
      var d = new Date(today.getTime() + (offset || 0) * 86400000);
      var f = function (x) { return x < 10 ? '0' + x : '' + x; };
      return d.getFullYear() + '-' + f(d.getMonth() + 1) + '-' + f(d.getDate());
    }
    var entOpts = '<option value="">（不关联企业）</option>' +
      M.ENTERPRISES.map(function (e) {
        return '<option value="' + e.id + '"' + (e.id === prefill.entId ? ' selected' : '') + '>' +
          U.esc(e.name) + '</option>';
      }).join('');
    var projOpts = '<option value="">（不关联具体项目）</option>' +
      M.PROJECTS.map(function (x) {
        return '<option value="' + x.id + '"' + (x.id === prefill.projectId ? ' selected' : '') + '>' +
          U.esc(x.shortName || x.name) + ' · ' + U.esc(x.stageName) + '</option>';
      }).join('');
    var typeOpts = TASK_TYPES.map(function (t) {
      return '<option value="' + t + '"' + (t === (prefill.type || '') ? ' selected' : '') + '>' + t + '</option>';
    }).join('');

    var html =
      '<div style="font-size:13px;">' +
        '<div class="dt-row"><span class="dt-k">任务标题</span></div>' +
        '<input type="text" class="f-input" id="tfTitle" style="width:100%;margin-bottom:12px;" placeholder="请输入任务标题" value="' + U.esc(prefill.title || '') + '"/>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;">' +
          '<div><div class="dt-row"><span class="dt-k">任务类型</span></div>' +
            '<select class="f-select" id="tfType" style="width:100%;">' + typeOpts + '</select></div>' +
          '<div><div class="dt-row"><span class="dt-k">优先级</span></div>' +
            '<select class="f-select" id="tfPri" style="width:100%;">' +
              ['高', '中', '低'].map(function (x) { return '<option' + (x === (prefill.priority || '中') ? ' selected' : '') + '>' + x + '</option>'; }).join('') +
            '</select></div>' +
        '</div>' +
        '<div id="tfProjWrap" style="display:none;margin-bottom:12px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:10px 12px;">' +
          '<div class="dt-row"><span class="dt-k">关联项目</span></div>' +
          '<select class="f-select" id="tfProj" style="width:100%;margin-bottom:8px;">' + projOpts + '</select>' +
          '<div class="dt-row" style="margin-bottom:0;"><span class="dt-k">项目当前阶段</span><span class="dt-v" id="tfStage">—</span></div>' +
        '</div>' +
        '<div class="dt-row"><span class="dt-k">关联企业</span></div>' +
        '<select class="f-select" id="tfEnt" style="width:100%;margin-bottom:12px;">' + entOpts + '</select>' +
        '<div class="dt-row"><span class="dt-k">截止日期</span></div>' +
        '<input type="date" class="f-input" id="tfDue" style="width:100%;margin-bottom:12px;" value="' + (prefill.due || dstr(3)) + '"/>' +
        '<div class="dt-row" style="margin-bottom:16px;"><span class="dt-k">初始状态</span><span class="dt-v">待处理</span></div>' +
        '<div style="display:flex;gap:8px;">' +
          '<button class="btn primary w-100" id="tfSave">创建任务</button>' +
          '<button class="btn w-100" onclick="APP.Components.closeDrawer()">取消</button>' +
        '</div>' +
      '</div>';
    C.openDrawer({ title: '新建任务', subtitle: '手动创建工作任务', bodyHtml: html, width: 520 });

    setTimeout(function () {
      var saveBtn = U.$('#tfSave');
      if (!saveBtn) return;
      // 任务类型=项目跟进 时显示关联项目与当前阶段；切换项目自动带出阶段与关联企业
      function projById(pid) {
        for (var i = 0; i < M.PROJECTS.length; i++) {
          if (M.PROJECTS[i].id === pid) return M.PROJECTS[i];
        }
        return null;
      }
      function syncProj() {
        var wrap = U.$('#tfProjWrap');
        if (!wrap) return;
        var isProj = U.$('#tfType').value === '项目跟进';
        wrap.style.display = isProj ? '' : 'none';
        if (!isProj) return;
        var pr = projById(U.$('#tfProj').value);
        U.$('#tfStage').textContent = pr ? pr.stageName : '—';
      }
      U.$('#tfType').addEventListener('change', syncProj);
      U.$('#tfProj').addEventListener('change', function () {
        var pr = projById(this.value);
        if (pr) U.$('#tfEnt').value = pr.enterprise;
        syncProj();
      });
      syncProj();
      saveBtn.addEventListener('click', function () {
        var title = U.$('#tfTitle').value.trim();
        var due = U.$('#tfDue').value;
        if (!title) { C.toast('请填写任务标题', 'warning'); return; }
        if (!due) { C.toast('请选择截止日期', 'warning'); return; }
        var ttype = U.$('#tfType').value;
        var pr = ttype === '项目跟进' ? projById(U.$('#tfProj').value) : null;
        var nt = APP.createTask({
          title: title,
          type: ttype,
          priority: U.$('#tfPri').value,
          entId: pr ? pr.enterprise : U.$('#tfEnt').value,
          due: due,
          source: pr ? pr.id : '手动创建'
        });
        C.closeDrawer();
        C.toast('任务已创建：' + title, 'success');
        // 确保新任务立即可见：清除工作台筛选回到第一页，并一次性高亮新任务行
        var wf = state.filter.workbench;
        wf.status = ''; wf.type = ''; wf.priority = ''; wf.overdue = false; wf.page = 1;
        state.highlightTaskId = nt.id;
        render();
      });
    }, 0);
  };

  // ---------------- 一键演示 ----------------
  function toggleDemo() {
    if (state.demoPlaying) stopDemo(); else startDemo();
  }
  function startDemo() {
    state.demoPlaying = true;
    state.demoIndex = 0;
    var btn = U.$('#demoBtn');
    if (btn) { btn.textContent = '■ 停止演示'; btn.classList.add('playing'); }
    runDemoStep();
  }
  function stopDemo() {
    state.demoPlaying = false;
    if (state.demoTimer) { clearTimeout(state.demoTimer); state.demoTimer = null; }
    var btn = U.$('#demoBtn');
    if (btn) { btn.textContent = '▶ 演示模式'; btn.classList.remove('playing'); }
    clearDemoTip();
    clearDemoHighlight();
    // 演示结束后回到驾驶舱（首页）
    if (state.page !== 'dashboard') {
      state.page = 'dashboard';
      render();
    }
  }
  function runDemoStep() {
    if (!state.demoPlaying) return;
    var script = M.DEMO_SCRIPT;
    if (state.demoIndex >= script.length) { stopDemo(); return; }
    var step = script[state.demoIndex];
    var currentIdx = state.demoIndex;
    // 有的步骤需在同一页面内切换内部页签（如画像页的 AI 综合研判）：
    // 侧边导航 page 相同，故须强制重渲染，并通过 state.demoTab 记录目标页签。
    if (step.page !== state.page || typeof step.tab === 'number') {
      if (typeof step.tab === 'number') state.demoTab = step.tab;
      state.page = step.page;
      render();
    }
    setTimeout(function () {
      if (!state.demoPlaying) return;
      if (step.highlight) demoHighlight(step.highlight);
      showDemoTip(currentIdx + 1, script.length, step.desc || '');
    }, 400);
    state.demoIndex++;
    state.demoTimer = setTimeout(runDemoStep, step.delay || 6000);
  }
  function showDemoTip(idx, total, desc) {
    var w = U.$('#demoTipWrap');
    if (!w) return;
    w.innerHTML = '<div class="demo-tip"><span class="step">第 ' + idx + '/' + total + ' 步</span>' + U.esc(desc) + '</div>';
  }
  function clearDemoTip() {
    var w = U.$('#demoTipWrap');
    if (w) w.innerHTML = '';
  }
  function demoHighlight(sel) {
    clearDemoHighlight();
    var el = document.querySelector(sel);
    if (!el) return;
    // 滚动到可见区域
    el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    var box = document.createElement('div');
    box.className = 'demo-highlight-box';
    box.id = 'demoHighlightBox';
    // 挂到 .app 下而非 body，确保全屏模式下仍可见
    var host = document.querySelector('.app') || document.body;
    host.appendChild(box);
    // 等滚动完成再定位
    setTimeout(function () { positionHighlightBox(el, box); }, 400);
    // 监听滚动，实时更新位置
    box._scrollHandler = function () { positionHighlightBox(el, box); };
    window.addEventListener('scroll', box._scrollHandler, true);
    window.addEventListener('resize', box._scrollHandler);
  }
  function positionHighlightBox(el, box) {
    var rect = el.getBoundingClientRect();
    box.style.left = (rect.left - 4) + 'px';
    box.style.top = (rect.top - 4) + 'px';
    box.style.width = (rect.width + 8) + 'px';
    box.style.height = (rect.height + 8) + 'px';
  }
  function clearDemoHighlight() {
    var box = document.getElementById('demoHighlightBox');
    if (box) {
      if (box._scrollHandler) {
        window.removeEventListener('scroll', box._scrollHandler, true);
        window.removeEventListener('resize', box._scrollHandler);
      }
      box.remove();
    }
  }

  // ---------------- 全局事件 ----------------
  function bindGlobal() {
    // 导航
    U.$$('.nav-item').forEach(function (n) {
      n.addEventListener('click', function () {
        stopDemo();
        document.body.classList.remove('nav-open'); // 小屏：选中后收起抽屉导航
        state.page = n.dataset.page;
        render();
      });
    });

    // 侧边栏折叠/展开（桌面端；仅显示图标，扩大右侧可视面积；状态持久化）
    var sideToggle = U.$('#sideToggle');
    var sidebarEl = document.querySelector('.sidebar');
    if (sideToggle && sidebarEl) {
      var initCollapsed = false;
      try { initCollapsed = localStorage.getItem('zs_sidebar_collapsed') === '1'; } catch (e) {}
      if (initCollapsed) {
        sidebarEl.classList.add('collapsed');
        sideToggle.textContent = '»';
        sideToggle.title = '展开菜单';
      }
      sideToggle.addEventListener('click', function () {
        var collapsed = sidebarEl.classList.toggle('collapsed');
        sideToggle.textContent = collapsed ? '»' : '«';
        sideToggle.title = collapsed ? '展开菜单' : '收起菜单';
        try { localStorage.setItem('zs_sidebar_collapsed', collapsed ? '1' : '0'); } catch (e) {}
        // 折叠/展开后图表容器尺寸变化，重算当前页活动图表
        setTimeout(function () {
          APP.liveCharts.forEach(function (c) { try { c.resize(); } catch (err) {} });
        }, 240);
      });
    }

    // 移动端抽屉导航：汉堡开关 + 遮罩点击关闭
    var navToggle = U.$('#navToggle');
    if (navToggle) navToggle.addEventListener('click', function () {
      document.body.classList.toggle('nav-open');
    });
    var sidebarMask = U.$('#sidebarMask');
    if (sidebarMask) sidebarMask.addEventListener('click', function () {
      document.body.classList.remove('nav-open');
    });

    // 行政区划切换
    var ds = U.$('#districtSel');
    if (ds) ds.addEventListener('change', function () {
      state.district = this.value;
      if (state.page === 'dashboard') render();
    });

    // 时钟
    function tick() {
      var d = new Date();
      var p = function (x) { return x < 10 ? '0' + x : '' + x; };
      var el = U.$('#clock');
      if (el) el.textContent = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
    }
    tick(); setInterval(tick, 30000);

    // 一键演示按钮
    var demoBtn = U.$('#demoBtn');
    if (demoBtn) demoBtn.addEventListener('click', toggleDemo);

    // 全屏按钮（顶栏全局，所有页面统一入口）
    var fsBtn = U.$('#fullscreenBtn');
    if (fsBtn) {
      fsBtn.addEventListener('click', function () {
        var fsEl = document.fullscreenElement || document.webkitFullscreenElement;
        if (!fsEl) {
          var target = document.querySelector('.app') || document.documentElement;
          var req = target.requestFullscreen || target.webkitRequestFullscreen;
          if (req) req.call(target);
          else C.toast('当前浏览器不支持全屏', 'warning');
        } else {
          var exit = document.exitFullscreen || document.webkitExitFullscreen;
          if (exit) exit.call(document);
        }
      });
      function updFsText() {
        var fsEl = document.fullscreenElement || document.webkitFullscreenElement;
        fsBtn.innerHTML = fsEl ? '退出全屏' : '全屏';
        // 全屏投影样式钩子：大屏排版、卡片对比度、高风险脉冲动效
        var appEl = document.querySelector('.app');
        if (appEl) appEl.classList.toggle('is-fullscreen', !!fsEl);
      }
      document.addEventListener('fullscreenchange', updFsText);
      document.addEventListener('webkitfullscreenchange', updFsText);
    }

    // 全局搜索：回车触发搜索弹窗
    var gs = U.$('#globalSearch');
    if (gs) gs.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') APP.runGlobalSearch(this.value);
    });

    // ESC
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        C.closeDrawer();
        if (state.demoPlaying) stopDemo();
      }
    });

    // 浏览器后退/前进 → 恢复对应页面
    window.addEventListener('popstate', function (e) {
      var page = (e.state && e.state.page) ||
        (location.hash.indexOf('#/') === 0 ? location.hash.slice(2) : '') || 'dashboard';
      if (!APP.renderers[page]) page = 'dashboard';
      if (page === state.page) return;
      navigatingFromHistory = true;
      state.page = page;
      render();
    });
  }

  // 支持 #/页面名 直达（如 index.html#/workbench）
  var mHash = (location.hash || '').match(/^#\/(\w+)/);
  if (mHash && APP.renderers[mHash[1]]) state.page = mHash[1];

  bindGlobal();

  // —— 登录门禁 ——
  // 暴露给 login.js：登录成功后移除 logged-out 并渲染主应用。
  // 关键：未登录时主应用（.app）被 CSS 隐藏、且此处不调用 render()，
  // 避免 ECharts 在 display:none 容器下以 0 尺寸初始化导致图表不显示。
  APP.startApp = function () {
    document.documentElement.classList.remove('logged-out');
    render();
  };

  if (APP.login && APP.login.isLoggedIn()) {
    APP.startApp();
  } else if (APP.login) {
    // 未登录：保持 logged-out 覆盖态，等待登录页回调，暂不渲染
    document.documentElement.classList.add('logged-out');
  } else {
    // 异常兜底：login 模块缺失时仍渲染，避免白屏
    render();
  }
})();
