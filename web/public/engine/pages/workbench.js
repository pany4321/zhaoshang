/* ============================================================
 * 页面：招商专员工作台
 * ============================================================ */
(function () {
  'use strict';
  var U = APP.U;
  var state = APP.state;
  var C = APP.Components;
  var M = window.MOCK;
  var mkChart = APP.mkChart;

  function renderWorkbench() {
    var f = state.filter.workbench;
    var T = M.TASKS;

    // 我的任务统计
    var myTotal = T.length;
    var myPending = T.filter(function(t){return t.status==='待处理';}).length;
    var myDone = T.filter(function(t){return t.status==='已完成';}).length;
    var myOverdue = T.filter(function(t){return (t.overdue || t.status === '已逾期') && t.status !== '已完成';}).length;
    var myProcessing = T.filter(function(t){return t.status==='进行中';}).length;
    // 近 7 天新建任务数（按任务创建时间真实统计）
    var weekAgoMs = new Date().getTime() - 7 * 86400000;
    var myNewWeek = T.filter(function(t){
      if (!t.createTime) return false;
      var d = new Date(String(t.createTime).replace(/-/g, '/'));
      return !isNaN(d.getTime()) && d.getTime() >= weekAgoMs;
    }).length;
    // 负责企业数：全部任务中关联企业的去重数（与任务清单数据同源，避免口径不一）
    var entSet = {};
    T.forEach(function(t){
      var key = t.enterprise || t.enterpriseName;
      if (key) entSet[key] = true;
    });
    var myEntCount = Object.keys(entSet).length;

    // 筛选
    var tasks = T.filter(function(t){
      if (f.status && t.status !== f.status) return false;
      if (f.type && t.type !== f.type) return false;
      if (f.priority && t.priority !== f.priority) return false;
      if (f.overdue && !(t.overdue || t.status === '已逾期')) return false;
      return true;
    });
    tasks.sort(function(a,b){
      // 按状态分组排序（待处理 > 进行中 > 已逾期 > 已完成），同组内按优先级、截止日期排序
      var so = { '待处理': 0, '进行中': 1, '已逾期': 2, '已完成': 3 };
      var po = {高:0, 中:1, 低:2};
      var sd = (so[a.status] != null ? so[a.status] : 9) - (so[b.status] != null ? so[b.status] : 9);
      if (sd !== 0) return sd;
      if (po[a.priority] !== po[b.priority]) return po[a.priority] - po[b.priority];
      return new Date(a.deadline || a.due) - new Date(b.deadline || b.due);
    });

    var PS = 8;
    var total = tasks.length;
    var totalPages = Math.max(1, Math.ceil(total / PS));
    if (f.page > totalPages) f.page = totalPages;
    var pageData = tasks.slice((f.page - 1) * PS, f.page * PS);

    var statusOpts = '<option value="">全部状态</option>' +
      ['待处理','进行中','已完成','已逾期'].map(function(s){
        return '<option value="'+s+'"'+(f.status===s?' selected':'')+'>'+s+'</option>';
      }).join('');
    var typeOpts = '<option value="">全部类型</option>' +
      ['风险处置','项目跟进','企业服务','政策推送','日常巡检'].map(function(s){
        return '<option value="'+s+'"'+(f.type===s?' selected':'')+'>'+s+'</option>';
      }).join('');
    var priOpts = '<option value="">全部优先级</option>' +
      ['高','中','低'].map(function(s){
        return '<option value="'+s+'"'+(f.priority===s?' selected':'')+'>'+s+'</option>';
      }).join('');

    // 任务列表
    var taskRows = pageData.map(function(t){
      var priClass = t.priority === '高' ? 's-red' : (t.priority === '中' ? 's-orange' : 's-blue');
      var isOd = t.overdue || t.status === '已逾期';
      var statusClass2 = t.status === '已完成' ? 's-green'
        : (isOd ? 's-red'
        : (t.status === '进行中' ? 's-orange' : 's-blue'));
      var statusText = isOd && t.status !== '已完成' ? '已逾期' : t.status;
      var entDisp = t.enterpriseName || t.enterprise || '-';
      // 操作列：按状态给出"下一步动作"，所有任务均可查看（查看与处理分离）
      var opsHtml = '';
      if (t.status === '待处理') {
        opsHtml += '<button class="btn sm primary btn-start" data-id="' + t.id + '">处理</button> ';
      } else if (t.status !== '已完成') {   // 进行中 / 已逾期 → 可完成
        opsHtml += '<button class="btn sm primary btn-complete" data-id="' + t.id + '">完成</button> ';
      }
      opsHtml += '<button class="btn sm btn-view" data-id="' + t.id + '">查看</button>';
      return '<tr class="tsk-row" data-id="'+t.id+'"' +
        (t.id === state.highlightTaskId ? ' style="background:#EEF2FF;outline:2px solid #C7D2FE;outline-offset:-2px;"' : '') + '>' +
        '<td style="width:28px;"><input type="checkbox" class="tsk-sel" data-id="' + t.id + '" title="选择此任务"/></td>' +
        '<td><span class="s-badge '+priClass+'">' + t.priority + '优先级</span></td>' +
        '<td><div style="font-weight:500;">' + (t.processNote ? '<span title="已有处理记录" style="margin-right:2px;">📝</span>' : '') + U.esc(t.title) + '</div>' +
          '<div style="font-size:11px;color:#94A3B8;margin-top:3px;">' +
            U.esc(t.typeName || t.type) + ' · ' + U.esc(entDisp) +
          '</div></td>' +
        '<td style="color:' + (isOd ? '#e03131' : '#475569') + ';">' + U.esc(t.deadline || t.due || '-') +
          (isOd && t.status !== '已完成' ? '<div style="font-size:10px;color:#e03131;">逾期' + (t.overdueDays ? ' ' + t.overdueDays + ' 天' : '') + '</div>' : '') +
        '</td>' +
        '<td><span class="s-badge ' + statusClass2 + '">' + statusText + '</span></td>' +
        '<td style="width:160px;white-space:nowrap;">' + opsHtml + '</td>' +
      '</tr>';
    }).join('');

    // 今日待办
    var today = U.fmtDate(new Date());
    var todayTasks = T.filter(function(t){ return (t.deadline || t.due) === today && t.status !== '已完成'; });
    var todayHtml = todayTasks.length === 0
      ? '<div style="padding:20px;text-align:center;color:#94A3B8;font-size:12px;">今日无待办任务 🎉</div>'
      : todayTasks.slice(0, 5).map(function(t){
          return '<div class="today-item" data-id="' + t.id + '" title="点击进入任务处理">' +
            '<div class="t-dot" style="background:' + (t.priority==='高'?'#e03131':t.priority==='中'?'#F97316':'#22C55E') + '"></div>' +
            '<div class="t-body">' +
              '<div class="t-title">' + U.esc(t.title) + '</div>' +
              '<div class="t-meta">' + U.esc(t.enterpriseName || t.enterprise || t.type) + '</div>' +
            '</div>' +
            '<div style="margin-left:auto;color:#CBD5E1;font-size:14px;flex-shrink:0;">›</div>' +
          '</div>';
        }).join('');

    // 最近动态
    var recentActs = buildRecentActivities();

    U.$('#content').innerHTML =
      // 顶部统计卡
      '<div class="kpi-grid">' +
        '<div class="kpi"><div class="k-label">我的任务</div><div class="k-value">' + myTotal + '<span style="font-size:14px;">件</span></div></div>' +
        '<div class="kpi"><div class="k-label">待处理</div><div class="k-value" style="color:#2563EB;">' + myPending + '<span style="font-size:14px;">件</span></div></div>' +
        '<div class="kpi"><div class="k-label">进行中</div><div class="k-value" style="color:#F97316;">' + myProcessing + '<span style="font-size:14px;">件</span></div></div>' +
        '<div class="kpi risk"><div class="k-label">已逾期</div><div class="k-value" style="color:#e03131;">' + myOverdue + '<span style="font-size:14px;">件</span></div></div>' +
        '<div class="kpi"><div class="k-label">已完成</div><div class="k-value" style="color:#22C55E;">' + myDone + '<span style="font-size:14px;">件</span></div></div>' +
        '<div class="kpi"><div class="k-label">完成率</div><div class="k-value" style="color:#2563EB;">' + (myTotal ? Math.round(myDone/myTotal*100) : 0) + '<span style="font-size:14px;">%</span></div></div>' +
        '<div class="kpi"><div class="k-label">本周新增</div><div class="k-value">' + myNewWeek + '<span style="font-size:14px;">件</span></div></div>' +
        '<div class="kpi"><div class="k-label">负责企业</div><div class="k-value">' + myEntCount + '<span style="font-size:14px;">家</span></div></div>' +
      '</div>' +

      '<div class="row mt">' +
        // 今日待办
        '<div class="col card">' +
          '<div class="card-title">📋 今日待办 <span class="muted" style="font-size:12px;font-weight:400;">' + today + '</span></div>' +
          '<div class="today-list">' + todayHtml + '</div>' +
        '</div>' +
        // 任务类型分布
        '<div class="col card">' +
          '<div class="card-title">任务类型分布</div>' +
          '<div id="c_wb_pie" class="chart" style="height:220px"></div>' +
        '</div>' +
        // 最近动态
        '<div class="col card">' +
          '<div class="card-title">🕒 最近动态</div>' +
          '<div class="activity-list">' + recentActs + '</div>' +
        '</div>' +
      '</div>' +

      // 任务清单（查询条件内嵌于卡片上部）
      '<div class="card mt">' +
        '<div class="card-title">任务清单' +
          '<span style="margin-left:12px;">' +
            '<button class="btn sm primary" id="wbAddTask">＋ 新建任务</button> ' +
            '<button class="btn sm" id="wbBatchDone">批量完成</button> ' +
            '<button class="btn sm" id="wbExport">⬇ 导出报表</button>' +
          '</span>' +
        '</div>' +
        // 内嵌查询区
        '<div style="background:#F8FAFC;border:1px solid var(--c-border-light);border-radius:8px;padding:12px 16px;margin-bottom:4px;">' +
          '<div class="filter-row">' +
            '<div class="filter-item"><label>任务状态</label>' +
              '<select class="f-select" id="wfStatus">' + statusOpts + '</select>' +
            '</div>' +
            '<div class="filter-item"><label>任务类型</label>' +
              '<select class="f-select" id="wfType">' + typeOpts + '</select>' +
            '</div>' +
            '<div class="filter-item"><label>优先级</label>' +
              '<select class="f-select" id="wfPri">' + priOpts + '</select>' +
            '</div>' +
            '<div class="filter-item" style="align-items:flex-end;">' +
              '<label style="display:flex;align-items:center;gap:5px;cursor:pointer;">' +
                '<input type="checkbox" id="wfOverdue"' + (f.overdue ? ' checked' : '') + '/> 仅看逾期</label>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="result-info" style="margin-bottom:8px;">共 <b>' + total + '</b> 条任务 · 第 ' + f.page + '/' + totalPages + ' 页</div>' +
        (total === 0 ? C.emptyHtml('📭', '暂无任务', '清除筛选')
          : '<div class="table-wrap"><table class="tbl tbl-hover">' +
              '<thead><tr>' +
                '<th style="width:28px;"><input type="checkbox" id="tskSelAll" title="全选本页任务"/></th>' +
                '<th style="width:90px;">优先级</th>' +
                '<th>任务名称</th>' +
                '<th style="width:120px;">截止日期</th>' +
                '<th style="width:90px;">状态</th>' +
                '<th style="width:100px;">操作</th>' +
              '</tr></thead><tbody>' + taskRows + '</tbody></table></div>' +
              C.paginationHtml(f.page, total, PS)) +
      '</div>';

    // ---- 图表 ----
    renderTaskPie();

    // ---- 事件绑定 ----
    // 下拉/复选变更即筛选刷新（无查询按钮）
    ['wfStatus', 'wfType', 'wfPri', 'wfOverdue'].forEach(function(id){
      U.$('#' + id).addEventListener('change', applyFilter);
    });
    function resetFilters(){
      f.status=''; f.type=''; f.priority=''; f.overdue=false; f.page=1;
      APP.render();
    }
    // 空态"清除筛选"按钮
    if (total === 0) {
      var clrBtn = document.querySelector('.empty-btn button');
      if (clrBtn) clrBtn.addEventListener('click', resetFilters);
    }
    // 今日待办：点击直接打开任务详情，进入处理流程
    U.$$('.today-item').forEach(function(n){
      n.addEventListener('click', function(){
        APP.openTaskDetail(n.dataset.id);
      });
    });
    // 手动新建任务
    U.$('#wbAddTask').addEventListener('click', function () {
      APP.openTaskForm();
    });
    // 处理：打开详情抽屉（不更改状态，仅进入处理界面）
    U.$$('.btn-start').forEach(function(b){
      b.addEventListener('click', function(e){
        e.stopPropagation();
        openTaskDetail(b.dataset.id);
      });
    });
    // 完成任务
    U.$$('.btn-complete').forEach(function(b){
      b.addEventListener('click', function(e){
        e.stopPropagation();
        completeTask(b.dataset.id);
      });
    });
    // 查看任务详情
    U.$$('.btn-view').forEach(function(b){
      b.addEventListener('click', function(e){
        e.stopPropagation();
        APP.openTaskDetail(b.dataset.id);
      });
    });
    // 批量选择：表头全选与行选择联动（半选态）
    var selAll = U.$('#tskSelAll');
    if (selAll) {
      var syncSelAll = function () {
        var boxes = U.$$('.tsk-sel');
        var checked = boxes.filter(function (b) { return b.checked; });
        selAll.checked = boxes.length > 0 && checked.length === boxes.length;
        selAll.indeterminate = checked.length > 0 && checked.length < boxes.length;
      };
      selAll.addEventListener('change', function () {
        U.$$('.tsk-sel').forEach(function (b) { b.checked = selAll.checked; });
        selAll.indeterminate = false;
      });
      U.$$('.tsk-sel').forEach(function (b) {
        b.addEventListener('change', syncSelAll);
      });
    }
    // 批量完成：完成勾选的未完成任务，并同步关闭关联风险事件
    U.$('#wbBatchDone').addEventListener('click', function () {
      var ids = U.$$('.tsk-sel').filter(function (b) { return b.checked; }).map(function (b) { return b.dataset.id; });
      if (!ids.length) { C.toast('请先勾选要完成的任务', 'warning'); return; }
      var targets = ids.map(findTask).filter(function (t) { return t && t.status !== '已完成'; });
      var skipped = ids.length - targets.length;
      if (!targets.length) { C.toast('所选任务均已完成，无需操作', 'info'); return; }
      C.confirm('批量完成',
        '确定将选中的 ' + targets.length + ' 个任务标记为完成吗？完成后不可回退。' +
        (skipped > 0 ? '（另有 ' + skipped + ' 个已完成的任务将跳过）' : ''),
        function () {
          targets.forEach(markTaskDone);
          C.toast('已批量完成 ' + targets.length + ' 个任务', 'success');
          APP.render();
        });
    });
    // 导出：当前筛选条件下的全部任务（跨页）
    U.$('#wbExport').addEventListener('click', function () {
      C.exportCSV('任务清单', ['编号', '任务名称', '类型', '关联企业', '优先级', '截止日期', '状态', '创建时间'],
        tasks.map(function (t) {
          return [t.id, t.title, t.type, t.enterpriseName || t.enterprise || '', t.priority,
            t.deadline || t.due || '', t.status, t.createTime || ''];
        }));
      C.toast('已导出 ' + tasks.length + ' 条任务', 'success');
    });
    // 分页
    var pg = U.$('.pagination');
    if (pg) C.bindPagination(pg, function(p){ f.page = p; APP.render(); });

    // 新建任务后：滚动到新任务行并清除一次性高亮标记
    if (state.highlightTaskId) {
      var hlRow = document.querySelector('.tsk-row[data-id="' + state.highlightTaskId + '"]');
      if (hlRow && hlRow.scrollIntoView) hlRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
      state.highlightTaskId = null;
    }
  }

  // 标记完成并同步关闭关联风险事件（单个/批量共用）
  function markTaskDone(t) {
    t.status = '已完成';
    t.completeTime = U.fmtDateTime(new Date());
    var srcId = t.eventId || (t.source && t.source.indexOf('R') === 0 ? t.source : null);
    if (srcId) {
      M.RISK_EVENTS.forEach(function(ev){
        if (ev.id === srcId) ev.status = '已关闭';
      });
    }
  }

  function completeTask(id) {
    C.confirm('确认完成', '确定要将此任务标记为完成吗？完成后不可回退。', function(){
      var t = findTask(id);
      if (t) markTaskDone(t);
      C.toast('任务已完成', 'success');
      APP.render();
    });
  }

  function startTask(id) {
    var t = findTask(id);
    if (!t || t.status !== '待处理') return;
    t.status = '进行中';
    C.toast('任务已开始处理', 'success');
    APP.render();
  }

  function findTask(id) {
    for (var i = 0; i < M.TASKS.length; i++) {
      if (M.TASKS[i].id === id) return M.TASKS[i];
    }
    return null;
  }

  // ---------------- 任务详情抽屉 ----------------
  var TYPE_DESC = {
    '风险处置': '请按风险处置要求核实相关风险事件情况，协调企业限期整改并反馈处置结果；处置完成后系统将同步关闭对应风险事件。',
    '项目跟进': '请跟进项目当前阶段进展，协调解决推进中的堵点问题，并及时更新项目进度与对接记录。',
    '企业服务': '请主动对接企业经营诉求，协调相关部门限时办理，并将处理进度与结果反馈企业。',
    '政策推送': '请辅导企业准备申报材料，跟踪申报进度，确保符合条件的企业应享尽享。',
    '日常巡检': '请按巡检计划完成现场核查，如实记录发现的问题并跟进整改闭环。'
  };

  function findProjectByTask(t) {
    // 优先按任务来源中的项目编号匹配；无编号时按企业回溯（一企一项目）
    if (t.source && t.source.charAt(0) === 'P') {
      for (var i = 0; i < M.PROJECTS.length; i++) {
        if (M.PROJECTS[i].id === t.source) return M.PROJECTS[i];
      }
    }
    if (t.enterprise) {
      for (var j = 0; j < M.PROJECTS.length; j++) {
        if (M.PROJECTS[j].enterprise === t.enterprise) return M.PROJECTS[j];
      }
    }
    return null;
  }

  function sourceLabel(t) {
    if (!t.source || t.source === '') return '例行任务安排';
    if (t.source === '手动创建') return '手动创建';
    if (/^R\d+/.test(t.source)) return '风险预警派发';
    if (t.type === '项目跟进') {
      var pr = findProjectByTask(t);
      if (pr) return '业务关联（' + pr.shortName + '）';
    }
    return '业务关联（' + t.source + '）';
  }

  function openTaskDetail(id) {
    var t = findTask(id);
    if (!t) return;
    var isOd = t.status === '已逾期' || (t.overdue && t.status !== '已完成');
    // 状态步骤条：待处理(0) → 进行中(1) → 已完成(2)；已逾期视同进行中并标红
    var stepIdx = t.status === '已完成' ? 2 : (t.status === '待处理' ? 0 : 1);
    var stepNames = ['待处理', '进行中', '已完成'];
    var stepsHtml = stepNames.map(function(s, i){
      var cls = i < stepIdx ? 'done' : (i === stepIdx ? 'active' : '');
      return '<div class="ps-step ' + cls + '" style="flex:1;">' +
        '<div class="ps-dot"></div><div class="ps-label">' + s + '</div></div>';
    }).join('');

    function row(k, v) {
      return '<div class="dt-row"><span class="dt-k">' + k + '</span><span class="dt-v">' + v + '</span></div>';
    }
    var statusBadge = '<span class="s-badge ' + (t.status === '已完成' ? 's-green' : (isOd ? 's-red' : (t.status === '进行中' ? 's-orange' : 's-blue'))) + '" id="tdStatus">' +
      (isOd && t.status !== '已完成' ? '已逾期' : t.status) + '</span>';
    var priBadge = '<span class="s-badge ' + (t.priority === '高' ? 's-red' : (t.priority === '中' ? 's-orange' : 's-blue')) + '">' + t.priority + '优先级</span>';

    var entLink = t.enterprise
      ? '<a href="javascript:void(0)" id="tdEnt" data-id="' + t.enterprise + '" style="color:#2563EB;">' + U.esc(t.enterpriseName || t.enterprise) + ' →</a>'
      : '（未关联）';

    // 项目跟进任务：显示关联项目所处的当前阶段
    var projRow = '';
    if (t.type === '项目跟进') {
      var prj = findProjectByTask(t);
      projRow = row('项目当前阶段', prj
        ? '<span class="tag primary">' + U.esc(prj.shortName) + '</span> <span class="s-badge s-blue">' + U.esc(prj.stageName) + '</span>'
        : '<span style="color:#94A3B8;">未找到关联项目</span>');
    }

    // 处理过程记录：进行中/已逾期可编辑；已完成只读回显；待处理提示
    var editable = t.status !== '已完成';
    var noteHead = '<div style="font-weight:600;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:4px;">处理过程记录' +
      (t.processNoteTime ? '<span style="font-size:10px;color:#94A3B8;font-weight:400;">最近记录：' + U.esc(t.processNoteTime) + '</span>' : '') +
      '</div>';
    var noteHtml;
    if (editable) {
      noteHtml = noteHead +
        '<textarea id="tdNote" style="width:100%;box-sizing:border-box;min-height:96px;padding:8px 10px;border:1px solid #CBD5E1;border-radius:6px;font-size:12px;line-height:1.7;color:#334155;resize:vertical;font-family:inherit;background:#fff;" placeholder="记录处理过程、沟通情况与阶段结论..." >' + U.esc(t.processNote || '') + '</textarea>' +
        '<div style="text-align:right;margin-top:6px;"><button class="btn sm primary" id="tdNoteSave">保存记录</button></div>';
    } else if (t.processNote) {
      noteHtml = noteHead +
        '<div style="background:#F8FAFC;padding:10px;border-radius:4px;font-size:12px;line-height:1.8;color:#475569;' + (t.status === '已完成' ? 'border-left:3px solid #22C55E;' : '') + '">' +
          U.esc(t.processNote) + '</div>';
    } else {
      noteHtml = noteHead +
        '<div style="color:#94A3B8;font-size:12px;">暂无处理记录，可在上方填写处理过程后点"保存记录"。</div>';
    }

    var html =
      '<div style="font-size:13px;line-height:1.8;">' +
        '<div style="font-size:15px;font-weight:600;margin-bottom:8px;line-height:1.5;">' + U.esc(t.title) + '</div>' +
        '<div style="display:flex;gap:6px;margin-bottom:14px;">' + statusBadge + priBadge +
          '<span class="tag primary">' + U.esc(t.type) + '</span>' +
          (isOd && t.status !== '已完成' ? '<span class="tag" style="color:#e03131;border-color:#e03131;">逾期' + (t.overdueDays ? ' ' + t.overdueDays + ' 天' : '') + '</span>' : '') +
        '</div>' +
        '<div style="font-weight:600;margin-bottom:10px;">处理进度</div>' +
        '<div class="pc-timeline" style="margin-bottom:16px;">' + stepsHtml + '</div>' +
        row('任务编号', t.id) +
        row('截止日期', '<span style="color:' + (isOd && t.status !== '已完成' ? '#e03131' : '#475569') + ';">' + U.esc(t.deadline || t.due || '-') + '</span>') +
        row('创建时间', U.esc(t.createTime || '-')) +
        (t.completeTime ? row('完成时间', '<span style="color:#22C55E;">' + U.esc(t.completeTime) + '</span>') : '') +
        row('任务来源', U.esc(sourceLabel(t))) +
        row('关联企业', entLink) +
        projRow +
        '<div style="margin-top:16px;">' +
          '<div style="font-weight:600;margin-bottom:6px;">任务说明</div>' +
          '<div style="background:#F8FAFC;padding:10px;border-radius:4px;font-size:12px;line-height:1.8;color:#475569;">' +
            U.esc(TYPE_DESC[t.type] || '请按任务要求及时处理并反馈结果。') +
          '</div>' +
        '</div>' +
        '<div style="margin-top:16px;">' + noteHtml + '</div>' +
        '<div style="margin-top:16px;display:flex;gap:8px;">' +
          (t.status !== '已完成' ? '<button class="btn primary w-100" id="tdAction">完成任务</button>' : '') +
          '<button class="btn w-100" onclick="APP.Components.closeDrawer()">关闭</button>' +
        '</div>' +
      '</div>';

    C.openDrawer({
      title: '任务详情',
      subtitle: t.type,
      bodyHtml: html,
      width: 520
    });

    setTimeout(function () {
      // 保存处理过程记录（不关抽屉、不重渲染，便于连续记录）
      // 待处理任务一旦保存处理记录，自动流转为"进行中"
      var noteSave = U.$('#tdNoteSave');
      if (noteSave) noteSave.addEventListener('click', function () {
        var ne = U.$('#tdNote');
        t.processNote = ne ? ne.value.trim() : '';
        t.processNoteTime = U.fmtDateTime(new Date());
        var statusChanged = false;
        if (t.status === '待处理') {
          t.status = '进行中';
          statusChanged = true;
          // 就地更新抽屉内的状态徽标与进度步骤条
          var sb = U.$('#tdStatus');
          if (sb) { sb.className = 's-badge s-orange'; sb.textContent = '进行中'; }
          var steps = document.querySelectorAll('.pc-timeline .ps-step');
          if (steps.length === 3) {
            steps[0].classList.remove('active'); steps[0].classList.add('done');
            steps[1].classList.remove('done'); steps[1].classList.add('active');
          }
        }
        C.toast(statusChanged ? '处理记录已保存，任务状态已更新为「进行中」' : '处理记录已保存', 'success');
      });
      var act = U.$('#tdAction');
      if (act) act.addEventListener('click', function () {
        // 完成前先落盘当前编辑的处理记录，避免丢失
        var ne = U.$('#tdNote');
        if (ne) { t.processNote = ne.value.trim(); t.processNoteTime = U.fmtDateTime(new Date()); }
        completeTask(id);   // 完成走确认弹窗；确认后 render 会关闭抽屉
      });
      var ent = U.$('#tdEnt');
      if (ent) ent.addEventListener('click', function () {
        C.closeDrawer();
        APP.viewEnterprise(ent.dataset.id);
      });
    }, 0);
  }
  APP.openTaskDetail = openTaskDetail;

  function renderTaskPie() {
    var types = {};
    M.TASKS.forEach(function(t){ types[t.type] = (types[t.type]||0) + 1; });
    var data = Object.keys(types).map(function(k){ return { name: k, value: types[k] }; });
    // 窄容器下外部标签会重叠/被裁剪：改为只显示百分比 + 底部滚动图例（详情见 tooltip）
    var box = U.$('#c_wb_pie');
    var narrow = box && box.clientWidth > 0 && box.clientWidth < 380;
    mkChart(U.$('#c_wb_pie'), {
      tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
      color: ['#2563EB', '#F97316', '#22C55E', '#8B5CF6', '#EC4899'],
      legend: narrow
        ? { bottom: 0, type: 'scroll', icon: 'circle', itemWidth: 8, itemHeight: 8, itemGap: 8, textStyle: { fontSize: 10, color: '#64748B' }, pageIconSize: 9 }
        : undefined,
      series: [{
        type: 'pie',
        radius: narrow ? ['38%', '58%'] : ['45%', '70%'],
        center: narrow ? ['50%', '42%'] : ['50%', '50%'],
        itemStyle: { borderRadius: 3, borderColor: '#fff', borderWidth: 2 },
        label: { show: true, fontSize: 10, formatter: narrow ? '{d}%' : '{b}\n{d}%' },
        labelLine: { length: narrow ? 6 : 10, length2: narrow ? 4 : 10 },
        labelLayout: { hideOverlap: true },
        data: data
      }]
    });
  }


  function buildRecentActivities() {
    var acts = [];
    // 从任务完成记录 + 风险事件生成
    var done = M.TASKS.filter(function(t){return t.status==='已完成' && t.completeTime;}).slice(0,3);
    done.forEach(function(t){
      acts.push({ time: t.completeTime, text: '完成任务：' + t.title, type: 'done' });
    });
    var newEvts = M.RISK_EVENTS.slice(0, 4);
    newEvts.forEach(function(ev){
      acts.push({ time: ev.time, text: '新增风险：' + ev.enterprise + ' - ' + ev.title, type: 'risk' });
    });
    // 排序
    acts.sort(function(a,b){ return new Date(b.time) - new Date(a.time); });
    return acts.slice(0, 6).map(function(a){
      var color = a.type === 'done' ? '#22C55E' : '#e03131';
      var icon = a.type === 'done' ? '✓' : '!';
      return '<div class="act-item">' +
        '<div class="act-dot" style="background:'+color+'">' + icon + '</div>' +
        '<div class="act-body">' +
          '<div class="act-text">' + U.esc(a.text) + '</div>' +
          '<div class="act-time">' + U.esc(a.time) + '</div>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  function applyFilter() {
    var f = state.filter.workbench;
    f.status = U.$('#wfStatus').value;
    f.type = U.$('#wfType').value;
    f.priority = U.$('#wfPri').value;
    f.overdue = U.$('#wfOverdue').checked;
    f.page = 1;
    APP.render();
  }

  APP.registerRenderer('workbench', renderWorkbench);
})();
