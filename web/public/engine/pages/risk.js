/* ============================================================
 * 页面：风险预警中心
 * 双视图：平台总风险态势（左） + 选中企业风险画像（右）
 * ============================================================ */
(function () {
  'use strict';
  var U = APP.U;
  var state = APP.state;
  var C = APP.Components;
  var M = window.MOCK;
  var mkChart = APP.mkChart;

  var kwState = { active: false, pos: null };

  // tooltip 定位：垂直居中于光标，水平在光标右侧（避免上部被遮挡）
  function tooltipPos(point, params, dom, rect, size) {
    var x = point[0] + 15;
    var y = point[1] - size.contentSize[1] / 2;
    if (x + size.contentSize[0] > size.viewSize[0]) {
      x = point[0] - size.contentSize[0] - 15;
    }
    if (y < 0) y = 0;
    if (y + size.contentSize[1] > size.viewSize[1]) {
      y = size.viewSize[1] - size.contentSize[1];
    }
    return [x, y];
  }

  function renderRisk() {
    var f = state.filter.risk;
    var dims = M.RISK_DIMS.filter(function(d){return d.weight>0;});

    // 平台总风险：所有企业九维平均
    var avgRisks = {};
    dims.forEach(function(d){ avgRisks[d.key] = 0; });
    M.ENTERPRISES.forEach(function(e){
      dims.forEach(function(d){ avgRisks[d.key] += (e.risks[d.key]||0); });
    });
    var n = M.ENTERPRISES.length;
    dims.forEach(function(d){ avgRisks[d.key] = +(avgRisks[d.key]/n).toFixed(1); });
    var avgScore = Math.round(M.calcRiskScore(avgRisks));
    var avgLevel = M.scoreToLevel(avgScore);

    // 选中企业
    var selEnt = M.entById(state.ent) || M.ENTERPRISES[0];

    // 风险事件筛选
    var events = M.RISK_EVENTS.filter(function (ev) {
      if (f.keyword && ev.enterprise.indexOf(f.keyword) < 0 && ev.title.indexOf(f.keyword) < 0) return false;
      if (f.level && ev.level !== f.level) return false;
      if (f.dim && ev.dim !== f.dim) return false;
      if (f.status && ev.status !== f.status) return false;
      if (f.district && f.district !== 'all') {
        var eE = M.entById(ev.entId);
        if (eE && eE.district !== f.district) return false;
      }
      return true;
    });
    // 排序：按时间倒序
    events.sort(function(a,b){ return new Date(b.time) - new Date(a.time); });

    // 分页
    var PS = 10;
    var total = events.length;
    var totalPages = Math.max(1, Math.ceil(total / PS));
    if (f.page > totalPages) f.page = totalPages;
    var pageData = events.slice((f.page - 1) * PS, f.page * PS);

    // 统计概览
    var rs = M.riskStats();
    var redCount = rs.red, orangeCount = rs.orange, yellowCount = rs.yellow, blueCount = rs.blue;
    // 三态模型：待处置 / 已派发 / 已关闭；页面指标显示名保持「处置中=已派发、已处置=已关闭」
    var eventStats = {
      total: M.RISK_EVENTS.length,
      pending: M.RISK_EVENTS.filter(function(e){return e.status==='待处置';}).length,
      processing: M.RISK_EVENTS.filter(function(e){return e.status==='已派发';}).length,
      closed: M.RISK_EVENTS.filter(function(e){return e.status==='已关闭';}).length
    };

    // 维度统计
    var dimStats = {};
    dims.forEach(function(d){ dimStats[d.key] = 0; });
    M.RISK_EVENTS.forEach(function(ev){ if(dimStats.hasOwnProperty(ev.dim)) dimStats[ev.dim]++; });

    // 选项
    var levelOpts = '<option value="">全部等级</option>' +
      [['red','重大风险'],['orange','较高风险'],['yellow','一般风险'],['blue','关注风险']].map(function(r){
        return '<option value="'+r[0]+'"'+(f.level===r[0]?' selected':'')+'>'+r[1]+'</option>';
      }).join('');
    var dimOpts = '<option value="">全部维度</option>' +
      dims.map(function(d){ return '<option value="'+d.key+'"'+(f.dim===d.key?' selected':'')+'>'+d.name+'</option>'; }).join('');
    var statusOpts = '<option value="">全部状态</option>' +
      ['待处置','已派发','已关闭'].map(function(s){
        return '<option value="'+s+'"'+(f.status===s?' selected':'')+'>'+s+'</option>';
      }).join('');
    var districtOpts = '<option value="all">全部区县</option>' +
      M.DISTRICTS.map(function(d){ return '<option value="'+d.key+'"'+(f.district===d.key?' selected':'')+'>'+d.name+'</option>'; }).join('');

    // 风险事件行
    var evtRows = pageData.map(function (ev) {
      return '<tr class="evt-row" data-id="'+ev.id+'">' +
        '<td style="width:30px;"><input type="checkbox"/></td>' +
        '<td>' + C.lvlBadge(ev.level) + '</td>' +
        '<td><div class="evt-title">' + U.esc(ev.title) + '</div>' +
          '<div class="evt-meta"><span>' + U.esc(ev.time) + '</span></div></td>' +
        '<td style="width:110px;">' + U.esc(ev.dimName) + '</td>' +
        '<td class="evt-ent" data-ent="' + ev.entId + '">' + U.esc(ev.enterprise) + '</td>' +
        '<td><span class="s-badge ' + statusClass(ev.status) + '">' + U.esc(ev.status) + '</span></td>' +
        '<td style="width:70px;text-align:center;">' +
          (ev.status === '待处置' ? '<button class="btn sm primary btn-dispatch" data-id="'+ev.id+'">派发</button>'
            : (ev.status === '已派发' ? '<button class="btn sm" onclick="APP.goDispatch(\''+ev.id+'\')">跟进</button>'
            : '<button class="btn sm">查看</button>')) +
        '</td>' +
      '</tr>';
    }).join('');

    // 权重状态徽标（默认 / 自定义）
    var __defaultW = typeof M.defaultRiskWeights === 'function' ? M.defaultRiskWeights() : [];
    var __isDefault = __defaultW.length > 0 && __defaultW.every(function (d) {
      var cur = M.RISK_DIMS.filter(function (x) { return x.key === d.key; })[0];
      return cur && Math.abs(cur.weight - d.weight) < 0.001;
    });
    var weightBadge = '<span class="rw-state-badge' + (__isDefault ? '' : ' custom') + '" title="' +
      (__isDefault ? '当前为系统默认权重' : '当前为自定义权重（点击 ⚙ 可调整）') + '">' +
      (__isDefault ? '默认权重' : '自定义权重') + '</span>';

    U.$('#content').innerHTML =
      // 顶部：双视图雷达 + 统计卡
      '<div class="row">' +
        // 左：平台总风险（标题栏含权重状态徽标 + 配置入口）
        '<div class="col card">' +
          '<div class="card-title" style="display:flex;justify-content:space-between;align-items:center;gap:8px;">' +
            '<span>全市风险态势 ' + weightBadge +
              '<span class="muted" style="font-size:12px;font-weight:400;">全市 ' + n + ' 家企业加权平均</span></span>' +
            '<button class="btn sm" id="rfWeightCfg" title="调整八大维度权重并全量重算企业风险评分">⚙ 权重配置</button>' +
          '</div>' +
          '<div style="display:flex;align-items:center;">' +
            '<div id="c_risk_radar_all" class="chart" style="width:60%;height:300px;"></div>' +
            '<div style="width:40%;padding-left:12px;">' +
              '<div class="risk-big-score" style="color:' + M.LEVELS[avgLevel].color + '">' + avgScore + '</div>' +
              '<div style="text-align:center;">' + C.lvlBadge(avgLevel) + '</div>' +
              '<div class="mt-s">' +
                '<div class="mt-s" style="font-size:12px;color:#475569;line-height:2;">' +
                  dims.map(function(d){
                    return '<div style="display:flex;justify-content:space-between;"><span>' + d.name + '</span>' +
                      '<span style="font-weight:600;">' + avgRisks[d.key] + '</span></div>';
                  }).join('') +
                '</div>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
        // 右：选中企业
        '<div class="col card">' +
          '<div class="card-title" style="display:flex;align-items:center;gap:12px;">' +
            '<span>企业风险态势</span>' +
            '<select class="f-select" id="riskSelEnt" style="width:260px;height:26px;font-size:12px;">' +
              M.ENTERPRISES.slice().sort(function(a,b){return b.riskScore-a.riskScore;}).slice(0,50).map(function(e){
                return '<option value="'+e.id+'"'+(e.id===selEnt.id?' selected':'')+'>'+U.esc(e.name)+'</option>';
              }).join('') +
            '</select>' +
          '</div>' +
          '<div style="display:flex;align-items:center;">' +
            '<div id="c_risk_radar_sel" class="chart" style="width:60%;height:300px;"></div>' +
            '<div style="width:40%;padding-left:12px;">' +
              '<div class="risk-big-score" style="color:' + M.LEVELS[selEnt.riskLevel].color + '">' + selEnt.riskScore + '</div>' +
              '<div style="text-align:center;">' + C.lvlBadge(selEnt.riskLevel) + '</div>' +
              '<div class="mt-s">' +
                '<div class="mt-s" style="font-size:12px;color:#475569;line-height:2;">' +
                  dims.map(function(d){
                    var v = selEnt.risks[d.key] || 0;
                    var diff = +(v - avgRisks[d.key]).toFixed(1);
                    var diffColor = diff > 0 ? '#e03131' : (diff < 0 ? '#22C55E' : '#94A3B8');
                    var diffStr = diff === 0 ? '持平' : (diff > 0 ? '↑' + diff : '↓' + Math.abs(diff));
                    return '<div style="display:flex;justify-content:space-between;"><span>' + d.name + '</span>' +
                      '<span style="font-weight:600;">' + v + ' <span style="font-size:10px;color:' + diffColor + '">' + diffStr + '</span></span></div>';
                  }).join('') +
                '</div>' +
              '</div>' +
              '<div style="margin-top:10px;text-align:center;">' +
                '<button class="btn sm primary" onclick="APP.viewEnterprise(\''+selEnt.id+'\')">查看企业画像</button>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +

      // 统计卡行（两行 × 每行 4 个）
      '<div class="kpi-grid mt" style="grid-template-columns:repeat(4,1fr);">' +
        '<div class="kpi"><div class="k-label">重大风险企业</div><div class="k-value" style="color:#e03131;">' + redCount + '<span style="font-size:14px;">家</span></div></div>' +
        '<div class="kpi"><div class="k-label">较高风险企业</div><div class="k-value" style="color:#F97316;">' + orangeCount + '<span style="font-size:14px;">家</span></div></div>' +
        '<div class="kpi"><div class="k-label">一般风险企业</div><div class="k-value" style="color:#f1b400;">' + yellowCount + '<span style="font-size:14px;">家</span></div></div>' +
        '<div class="kpi"><div class="k-label">关注风险企业</div><div class="k-value" style="color:#1c7ed6;">' + blueCount + '<span style="font-size:14px;">家</span></div></div>' +
        '<div class="kpi"><div class="k-label">风险事件总数</div><div class="k-value">' + eventStats.total + '<span style="font-size:14px;">件</span></div></div>' +
        '<div class="kpi"><div class="k-label">待处置</div><div class="k-value" style="color:#e03131;">' + eventStats.pending + '<span style="font-size:14px;">件</span></div></div>' +
        '<div class="kpi"><div class="k-label">处置中</div><div class="k-value" style="color:#F97316;">' + eventStats.processing + '<span style="font-size:14px;">件</span></div></div>' +
        '<div class="kpi"><div class="k-label">已处置</div><div class="k-value" style="color:#22C55E;">' + eventStats.closed + '<span style="font-size:14px;">件</span></div></div>' +
      '</div>' +

      // 维度分布 + 趋势
      '<div class="row mt">' +
        '<div class="col card">' +
          '<div class="card-title">风险维度分布</div>' +
          '<div id="c_dim_bar" class="chart" style="height:280px"></div>' +
        '</div>' +
        '<div class="col-2 card">' +
          '<div class="card-title">近 30 天风险事件趋势</div>' +
          '<div id="c_risk_trend" class="chart" style="height:280px"></div>' +
        '</div>' +
      '</div>' +

      // 事件清单（查询条件内嵌于卡片上部）
      '<div class="card mt">' +
        '<div class="card-title">风险事件清单' +
          '<span style="margin-left:12px;">' +
            '<button class="btn sm primary" id="rfAddRisk">＋ 新建风险事件</button> ' +
            '<button class="btn sm" id="batchDispatch">批量派发</button> ' +
            '<button class="btn sm" id="exportRisk">⬇ 导出报表</button>' +
          '</span>' +
        '</div>' +
        '<div class="filter-card" style="background:#F8FAFC;border:1px solid var(--c-border-light);border-radius:8px;padding:12px 16px;margin-bottom:4px;">' +
          '<div class="filter-row">' +
            '<div class="filter-item"><label>关键词</label>' +
              '<input type="text" class="f-input" id="rfKw" placeholder="企业/事件标题" value="' + U.esc(f.keyword) + '"/>' +
            '</div>' +
            '<div class="filter-item"><label>风险等级</label>' +
              '<select class="f-select" id="rfLevel">' + levelOpts + '</select>' +
            '</div>' +
            '<div class="filter-item"><label>风险维度</label>' +
              '<select class="f-select" id="rfDim">' + dimOpts + '</select>' +
            '</div>' +
            '<div class="filter-item"><label>状态</label>' +
              '<select class="f-select" id="rfStatus">' + statusOpts + '</select>' +
            '</div>' +
            '<div class="filter-item"><label>区县</label>' +
              '<select class="f-select" id="rfDistrict">' + districtOpts + '</select>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="result-info">共 <b>' + total + '</b> 条风险事件 · 第 ' + f.page + '/' + totalPages + ' 页</div>' +
        (total === 0 ? C.emptyHtml('🔍', '暂无符合条件的风险事件', '清除筛选')
          : '<div class="table-wrap"><table class="tbl tbl-hover">' +
              '<thead><tr>' +
                '<th style="width:30px;"><input type="checkbox"/></th>' +
                '<th style="width:110px;">风险等级</th>' +
                '<th>风险事件</th>' +
                '<th style="width:110px;">风险维度</th>' +
                '<th>涉事企业</th>' +
                '<th style="width:90px;">状态</th>' +
                '<th style="width:80px;">操作</th>' +
              '</tr></thead><tbody>' + evtRows + '</tbody></table></div>' +
              C.paginationHtml(f.page, total, PS)) +
      '</div>';

    // ---- 图表 ----
    renderDualRadar(dims, avgRisks, selEnt);
    renderDimBar(dims, dimStats);
    renderRiskTrend();

    // ---- 事件绑定 ----
    // 关键词：动态筛选 + IME 保护
    var kwEl = U.$('#rfKw');
    if (kwEl) {
      kwEl.addEventListener('compositionstart', function () { this._composing = true; });
      kwEl.addEventListener('compositionend', function () {
        this._composing = false;
        kwState.active = true;
        kwState.pos = this.selectionStart;
        f.keyword = this.value.trim();
        f.page = 1;
        APP.render();
      });
      kwEl.addEventListener('input', function () {
        if (this._composing) return;
        kwState.active = true;
        kwState.pos = this.selectionStart;
        var self = this;
        clearTimeout(this._t);
        this._t = setTimeout(function () {
          f.keyword = self.value.trim();
          f.page = 1;
          APP.render();
        }, 150);
      });
    }
    // 下拉框：即时筛选
    ['rfLevel','rfDim','rfStatus','rfDistrict'].forEach(function (id) {
      var el = U.$('#' + id);
      if (el) el.addEventListener('change', function () {
        kwState.active = false;
        applyFilterField(id.substring(2).toLowerCase(), this.value);
      });
    });
    // 导出
    U.$('#exportRisk').addEventListener('click', function () {
      var headers = ['事件ID','风险等级','风险维度','事件标题','涉事企业','时间','状态','详情'];
      var rows = events.map(function(ev){
        return [ev.id, M.LEVELS[ev.level].name, ev.dimName, ev.title, ev.enterprise, ev.time, ev.status, ev.detail];
      });
      C.exportCSV('风险事件清单_' + U.fmtDate(new Date()), headers, rows);
      C.toast('已导出 ' + rows.length + ' 条风险事件', 'success');
    });
    // 空态清除筛选
    var emptyBtn = document.querySelector('.empty-btn button');
    if (emptyBtn) {
      emptyBtn.addEventListener('click', function () {
        kwState.active = false;
        f.keyword=''; f.level=''; f.dim=''; f.status=''; f.district='all'; f.page=1;
        APP.render();
      });
    }
    // 对比企业选择
    var selEntDD = U.$('#riskSelEnt');
    if (selEntDD) selEntDD.addEventListener('change', function(){
      state.ent = this.value;
      APP.render();
    });
    // 派发
    U.$$('.btn-dispatch').forEach(function(b){
      b.addEventListener('click', function(ev){
        ev.stopPropagation();
        kwState.active = false;
        APP.handleDispatch(b.dataset.id);
      });
    });
    // 行点击 → 风险详情
    U.$$('.evt-row').forEach(function(r){
      r.addEventListener('click', function(){
        kwState.active = false;
        var id = r.dataset.id;
        showRiskDetail(id);
      });
    });
    // 企业名 → 画像
    U.$$('.evt-ent').forEach(function(el){
      el.addEventListener('click', function(ev){
        ev.stopPropagation();
        kwState.active = false;
        state.ent = el.dataset.ent;
        APP.render();
      });
      el.style.cursor = 'pointer';
      el.style.color = '#2563EB';
    });
    // 分页
    var pg = U.$('.pagination');
    if (pg) C.bindPagination(pg, function(p){ kwState.active = false; f.page = p; APP.render(); });
    // 新建风险
    U.$('#rfAddRisk').addEventListener('click', function () {
      openRiskForm();
    });
    U.$('#rfWeightCfg').addEventListener('click', openWeightDrawer);
    // 批量派发
    U.$('#batchDispatch').addEventListener('click', function(){
      C.toast('已发起批量派发，共 0 条（演示）', 'info');
    });

    // 关键词焦点恢复
    if (kwState.active && kwEl && kwEl.value === f.keyword) {
      try { kwEl.focus(); kwEl.setSelectionRange(kwState.pos, kwState.pos); } catch (e) {}
    }

    function applyFilterField(field, val) {
      f[field] = val;
      f.page = 1;
      APP.render();
    }
  }

  function renderDualRadar(dims, avgRisks, selEnt) {
    var indicator = dims.map(function(d){ return { name: d.name, max: 100 }; });
    var allData = dims.map(function(d){ return avgRisks[d.key]; });
    var selData = dims.map(function(d){ return selEnt.risks[d.key] || 0; });

    // 左：平台总
    mkChart(U.$('#c_risk_radar_all'), {
      tooltip: { position: tooltipPos },
      radar: {
        indicator: indicator,
        radius: '65%',
        center: ['50%', '50%'],
        axisName: { fontSize: 10, color: '#475569' },
        splitArea: { areaStyle: { color: ['#F8FAFC','#F1F5F9'] } },
        axisLine: { lineStyle: { color: '#CBD5E1' } }
      },
      series: [{
        type: 'radar',
        symbolSize: 4,
        data: [{
          value: allData,
          name: '平台',
          lineStyle: { color: '#F97316', width: 2 },
          areaStyle: { color: 'rgba(249,115,22,0.18)' },
          itemStyle: { color: '#F97316' }
        }]
      }]
    });

    // 右：选中企业（叠加平台平均对比）
    mkChart(U.$('#c_risk_radar_sel'), {
      tooltip: { position: tooltipPos },
      legend: { data: ['平台', selEnt.name], bottom: 0, textStyle: { fontSize: 10 } },
      radar: {
        indicator: indicator,
        radius: '65%',
        center: ['50%', '50%'],
        axisName: { fontSize: 10, color: '#475569' },
        splitArea: { areaStyle: { color: ['#F8FAFC','#F1F5F9'] } },
        axisLine: { lineStyle: { color: '#CBD5E1' } }
      },
      series: [{
        type: 'radar',
        symbolSize: 4,
        data: [
          {
            value: allData,
            name: '平台',
            lineStyle: { color: '#F97316', width: 1.5, type: 'dashed' },
            areaStyle: { color: 'rgba(249,115,22,0.08)' },
            itemStyle: { color: '#F97316' }
          },
          {
            value: selData,
            name: selEnt.name,
            lineStyle: { color: '#e03131', width: 2 },
            areaStyle: { color: 'rgba(224,49,49,0.2)' },
            itemStyle: { color: '#e03131' }
          }
        ]
      }]
    });
  }

  function renderDimBar(dims, dimStats) {
    mkChart(U.$('#c_dim_bar'), {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, position: tooltipPos },
      grid: { left: 60, right: 20, top: 10, bottom: 20 },
      xAxis: { type: 'value', axisLabel: { fontSize: 10 } },
      yAxis: { type: 'category', data: dims.map(function(d){return d.name;}), axisLabel: { fontSize: 11 } },
      series: [{
        type: 'bar',
        data: dims.map(function(d){ return dimStats[d.key] || 0; }),
        barWidth: 14,
        itemStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
            { offset: 0, color: '#6366F1' }, { offset: 1, color: '#2563EB' }
          ]),
          borderRadius: [0, 3, 3, 0]
        },
        label: { show: true, position: 'right', fontSize: 11 }
      }]
    });
  }

  function renderRiskTrend() {
    // 近 30 天每天事件数
    var days = 30;
    var data = [];
    var dates = [];
    var today = new Date();
    for (var i = days - 1; i >= 0; i--) {
      var d = new Date(today.getTime() - i * 86400000);
      var dateStr = (d.getMonth()+1) + '/' + d.getDate();
      dates.push(dateStr);
      // 用企业总数和时间构造伪随机日增量（平稳 + 小幅波动）
      var base = Math.round(M.RISK_EVENTS.length / 90);
      var seed = d.getFullYear()*10000 + (d.getMonth()+1)*100 + d.getDate();
      var rng = U.makeRng(seed);
      data.push(Math.max(0, base + Math.round((rng()-0.5) * base * 1.5)));
    }
    mkChart(U.$('#c_risk_trend'), {
      tooltip: { trigger: 'axis', position: tooltipPos },
      grid: { left: 40, right: 20, top: 20, bottom: 30 },
      xAxis: { type: 'category', data: dates, axisLabel: { fontSize: 9, interval: 3 } },
      yAxis: { type: 'value', axisLabel: { fontSize: 10 } },
      series: [{
        type: 'line',
        smooth: true,
        data: data,
        itemStyle: { color: '#e03131' },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(224,49,49,0.3)' },
            { offset: 1, color: 'rgba(224,49,49,0)' }
          ])
        }
      }]
    });
  }

  function statusClass(s) {
    if (s === '待处置') return 's-red';
    if (s === '已派发') return 's-orange';
    if (s === '已关闭') return 's-green';
    return 's-blue';
  }

  // 风险详情抽屉
  function showRiskDetail(id) {
    var ev = null;
    for (var i = 0; i < M.RISK_EVENTS.length; i++) {
      if (M.RISK_EVENTS[i].id === id) { ev = M.RISK_EVENTS[i]; break; }
    }
    if (!ev) return;
    var ent = M.entById(ev.entId);
    var html =
      '<div style="font-size:13px;line-height:1.8;">' +
        '<div style="font-size:16px;font-weight:600;margin-bottom:4px;">' + U.esc(ev.title) + '</div>' +
        '<div style="color:#94A3B8;font-size:12px;margin-bottom:12px;">' +
          '事件ID：' + ev.id + '　' + C.lvlBadge(ev.level) + '　' +
          '<span class="s-badge ' + statusClass(ev.status) + '">' + U.esc(ev.status) + '</span>' +
        '</div>' +
        '<div class="dt-row"><span class="dt-k">风险维度</span><span class="dt-v">' + U.esc(ev.dimName) + '</span></div>' +
        '<div class="dt-row"><span class="dt-k">涉事企业</span><span class="dt-v"><a onclick="APP.viewEnterprise(\''+ev.entId+'\')" style="color:#2563EB;cursor:pointer;">' + U.esc(ev.enterprise) + '</a></span></div>' +
        '<div class="dt-row"><span class="dt-k">发现时间</span><span class="dt-v">' + U.esc(ev.time) + '</span></div>' +
        '<div class="dt-row"><span class="dt-k">所在区县</span><span class="dt-v">' + U.esc(ent ? ent.districtName : '-') + '</span></div>' +
        '<div style="margin-top:16px;">' +
          '<div style="font-weight:600;margin-bottom:6px;">事件详情</div>' +
          '<div style="background:#F8FAFC;padding:10px;border-radius:4px;font-size:12px;line-height:1.8;">' + U.esc(ev.detail) + '</div>' +
        '</div>' +
        '<div style="margin-top:16px;">' +
          '<div style="font-weight:600;margin-bottom:6px;">处置建议</div>' +
          '<div style="background:#EFF6FF;padding:10px;border-radius:4px;font-size:12px;line-height:1.8;color:#1E40AF;">' + U.esc(ev.suggestion || '请相关部门核查，必要时约谈企业负责人。') + '</div>' +
        '</div>' +
        '<div style="margin-top:16px;display:flex;gap:8px;">' +
          (ev.status === '待处置' ? '<button class="btn primary w-100" onclick="APP.handleDispatch(\''+ev.id+'\')">派发处置</button>' : '') +
          (ev.status !== '已关闭' ? '<button class="btn w-100">记录处置进展</button>' : '') +
          '<button class="btn w-100" onclick="APP.Components.closeDrawer()">关闭</button>' +
        '</div>' +
      '</div>';
    C.openDrawer({ title: ev.title, subtitle: '风险预警详情', bodyHtml: html, width: 420 });
  }

  // ---- 新建风险表单 ----
  // ============ 八大风险维度权重动态配置 ============
  // 预设权重（8 维，合计 100%）：默认权重（取自引擎出厂快照）/ 强化履约 / 强化税务 / 强化司法信用
  var WEIGHT_PRESETS = {
    perform:  { operation: 10, finance: 10, judicial: 10, credit: 10, tender: 5,  tax: 10, perform: 40, ip: 5 },
    tax:      { operation: 15, finance: 15, judicial: 10, credit: 10, tender: 5,  tax: 35, perform: 5,  ip: 5 },
    credit:   { operation: 10, finance: 10, judicial: 30, credit: 30, tender: 5,  tax: 5,  perform: 5,  ip: 5 }
  };

  function openWeightDrawer() {
    var dims = M.RISK_DIMS;
    var LS_KEY = 'zs_rw_custom_presets';

    function loadCustomPresets() {
      try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch (e) { return {}; }
    }
    function saveCustomPresets(obj) {
      try { localStorage.setItem(LS_KEY, JSON.stringify(obj)); } catch (e) { /* 隐私模式等场景静默 */ }
    }

    var slidersHtml = dims.map(function (d) {
      var pct = Math.round((d.weight || 0) * 100);
      return '<div style="margin-bottom:14px;">' +
        '<div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px;">' +
          '<span style="font-weight:600;color:#334155;">' + U.esc(d.name) + '</span>' +
          '<span class="rw-pct" data-key="' + d.key + '" style="font-weight:700;color:#2563EB;min-width:42px;text-align:right;">' + pct + '%</span>' +
        '</div>' +
        '<input type="range" min="0" max="60" step="5" value="' + pct + '" class="rw-slider" data-key="' + d.key + '" style="width:100%;cursor:pointer;"/>' +
      '</div>';
    }).join('');

    var html =
      '<div style="font-size:13px;">' +
        '<div style="background:#F1F5F9;border-radius:8px;padding:10px 12px;margin-bottom:16px;">' +
          '<div style="font-size:12px;color:#64748B;margin-bottom:8px;">预设权重（一键应用）：</div>' +
          '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px;">' +
            '<button class="btn sm rw-preset" data-p="standard">默认权重</button>' +
            '<button class="btn sm rw-preset" data-p="perform">强化招商履约</button>' +
            '<button class="btn sm rw-preset" data-p="tax">强化税务合规</button>' +
            '<button class="btn sm rw-preset" data-p="credit">强化司法信用</button>' +
          '</div>' +
          '<div id="rwCustomArea"></div>' +
          '<div style="margin-top:8px;"><button class="btn sm" id="rwSaveCustom">💾 保存当前为自定义预设</button></div>' +
        '</div>' +
        slidersHtml +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:16px;padding-top:12px;border-top:1px solid #E2E8F0;">' +
          '<div style="font-size:13px;">权重总和：<b id="rwSum" style="font-size:15px;">100%</b> <span id="rwHint" style="font-size:11px;color:#94A3B8;"></span></div>' +
        '</div>' +
        '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px;">' +
          '<button class="btn" id="rwCancel">取消</button>' +
          '<button class="btn primary" id="rwApply">应用并重算</button>' +
        '</div>' +
      '</div>';

    C.openDrawer({ title: '⚙ 八大风险维度权重模型配置', subtitle: '调整后自动全量重算企业风险评分', bodyHtml: html, width: 460 });

    // openDrawer 同步渲染到 #drawerWrap，直接在其上绑定
    var wrap = U.$('#drawerWrap');
    function $(sel) { return wrap ? wrap.querySelector(sel) : null; }
    function $$(sel) { return wrap ? wrap.querySelectorAll(sel) : []; }

    function refreshSum() {
      var sum = 0;
      $$('.rw-slider').forEach(function (s) { sum += parseInt(s.value, 10) || 0; });
      var sumEl = $('#rwSum'), hintEl = $('#rwHint'), applyBtn = $('#rwApply');
      if (sumEl) {
        sumEl.textContent = sum + '%';
        sumEl.style.color = sum === 100 ? '#22C55E' : '#e03131';
      }
      if (hintEl) {
        hintEl.textContent = sum === 100 ? '✓ 合计符合要求' : '（需调整至 100%，当前差 ' + (100 - sum) + '%）';
        hintEl.style.color = sum === 100 ? '#22C55E' : '#e03131';
      }
      if (applyBtn) {
        applyBtn.disabled = (sum !== 100);
        applyBtn.style.opacity = sum === 100 ? '1' : '0.5';
      }
      return sum;
    }

    $$('.rw-slider').forEach(function (slider) {
      slider.addEventListener('input', function () {
        var pctEl = $('.rw-pct[data-key="' + this.dataset.key + '"]');
        if (pctEl) pctEl.textContent = this.value + '%';
        refreshSum();
      });
    });

    // 当前滑块值 → {维度key: 百分比}，供预设应用/保存共用
    function currentPresetFromSliders() {
      var preset = {};
      dims.forEach(function (d) {
        var s = $('.rw-slider[data-key="' + d.key + '"]');
        preset[d.key] = parseInt(s ? s.value : '0', 10) || 0;
      });
      return preset;
    }
    function applyPresetToSliders(preset) {
      dims.forEach(function (d) {
        var val = preset[d.key];
        var slider = $('.rw-slider[data-key="' + d.key + '"]');
        var pctEl = $('.rw-pct[data-key="' + d.key + '"]');
        if (slider) slider.value = val;
        if (pctEl) pctEl.textContent = val + '%';
      });
      refreshSum();
    }

    function renderCustomArea() {
      var area = $('#rwCustomArea');
      if (!area) return;
      var customs = loadCustomPresets();
      var names = Object.keys(customs);
      if (!names.length) { area.innerHTML = ''; return; }
      area.innerHTML = names.map(function (n) {
        return '<span style="display:inline-flex;align-items:center;gap:2px;margin:2px 4px 2px 0;">' +
          '<button class="btn sm rw-preset" data-p="custom:' + U.esc(n) + '">' + U.esc(n) + '</button>' +
          '<button class="btn sm rw-del" data-n="' + U.esc(n) + '" title="删除该预设" style="padding:4px 8px;">×</button>' +
        '</span>';
      }).join('');
      area.querySelectorAll('.rw-del').forEach(function (delBtn) {
        delBtn.addEventListener('click', function () {
          var customs2 = loadCustomPresets();
          delete customs2[this.dataset.n];
          saveCustomPresets(customs2);
          renderCustomArea();
          C.toast('已删除自定义预设「' + this.dataset.n + '」', 'info');
        });
      });
    }

    // 保存当前滑块为自定义预设（自动命名：自定义1/2/3…）
    var saveBtn = $('#rwSaveCustom');
    if (saveBtn) saveBtn.addEventListener('click', function () {
      if (refreshSum() !== 100) {
        C.toast('权重总和需为 100% 后才能保存为预设', 'warning');
        return;
      }
      var customs = loadCustomPresets();
      var i = 1;
      while (customs['自定义' + i]) i++;
      var name = '自定义' + i;
      customs[name] = currentPresetFromSliders();
      saveCustomPresets(customs);
      renderCustomArea();
      C.toast('已保存自定义预设「' + name + '」', 'success');
    });

    $$('.rw-preset').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var p = this.dataset.p;
        // 「默认权重」取引擎出厂快照（与初始化 RISK_DIMS 严格同源），其余走预设表
        var preset;
        if (p === 'standard') {
          preset = {};
          (M.defaultRiskWeights ? M.defaultRiskWeights() : []).forEach(function (d) {
            preset[d.key] = Math.round(d.weight * 100);
          });
        } else if (p.indexOf('custom:') === 0) {
          var customs = loadCustomPresets();
          preset = customs[p.slice(7)];
        } else {
          preset = WEIGHT_PRESETS[p];
        }
        if (!preset) return;
        applyPresetToSliders(preset);
      });
    });

    var cancelBtn = $('#rwCancel');
    if (cancelBtn) cancelBtn.addEventListener('click', function () { C.closeDrawer(); });

    renderCustomArea();
    var applyBtn = $('#rwApply');
    if (applyBtn) applyBtn.addEventListener('click', function () {
      if (refreshSum() !== 100) {
        C.toast('权重总和必须等于 100%', 'warning');
        return;
      }
      var newWeights = dims.map(function (d) {
        var slider = $('.rw-slider[data-key="' + d.key + '"]');
        return { key: d.key, name: d.name, weight: (parseInt(slider ? slider.value : '0', 10) || 0) / 100 };
      });
      // 1) 前端引擎热重算（demo 与全栈版均走 M.applyRiskWeights）
      var ok = typeof M.applyRiskWeights === 'function' && M.applyRiskWeights(newWeights);
      if (!ok) { C.toast('权重重算失败', 'error'); return; }
      // 2) 全栈版同步落库（demo 无 APP.sync，自动跳过）
      if (window.APP && window.APP.sync && window.APP.sync.riskWeightsUpdated) {
        window.APP.sync.riskWeightsUpdated(newWeights);
      }
      C.closeDrawer();
      C.toast('已应用新权重，全量重算完成', 'success');
      APP.render();
    });

    refreshSum();
  }

  function openRiskForm() {
    var dims = M.RISK_DIMS.filter(function(d){return d.weight>0;});
    var entOpts = M.ENTERPRISES.slice().sort(function(a,b){return a.name.localeCompare(b.name,'zh');}).map(function(e){
      return '<option value="' + e.id + '">' + U.esc(e.name) + '</option>';
    }).join('');
    var dimOpts = dims.map(function(d){
      return '<option value="' + d.key + '">' + U.esc(d.name) + '</option>';
    }).join('');
    var levelOpts = [['red','重大风险'],['orange','较高风险'],['yellow','一般风险'],['blue','关注风险']].map(function(r){
      return '<option value="' + r[0] + '">' + r[1] + '</option>';
    }).join('');

    var html =
      '<div style="font-size:13px;line-height:1.8;">' +
        '<div class="dt-row"><span class="dt-k">涉事企业</span><span class="dt-v">' +
          '<select class="f-select" id="rfmEnt" style="width:100%;">' + entOpts + '</select>' +
        '</span></div>' +
        '<div class="dt-row"><span class="dt-k">风险维度</span><span class="dt-v">' +
          '<select class="f-select" id="rfmDim" style="width:100%;">' + dimOpts + '</select>' +
        '</span></div>' +
        '<div class="dt-row"><span class="dt-k">风险等级</span><span class="dt-v">' +
          '<select class="f-select" id="rfmLevel" style="width:100%;">' + levelOpts + '</select>' +
        '</span></div>' +
        '<div class="dt-row"><span class="dt-k">事件标题</span><span class="dt-v">' +
          '<input type="text" class="f-input" id="rfmTitle" placeholder="请输入风险事件标题" style="width:100%;"/>' +
        '</span></div>' +
        '<div style="margin-top:12px;"><div style="font-weight:600;margin-bottom:6px;">风险详情</div>' +
          '<textarea id="rfmDetail" class="f-input" placeholder="请输入风险详情描述..." ' +
            'style="width:100%;min-height:90px;padding:8px;resize:vertical;box-sizing:border-box;"></textarea>' +
        '</div>' +
        '<div style="margin-top:12px;"><div style="font-weight:600;margin-bottom:6px;">处置建议</div>' +
          '<textarea id="rfmAdvice" class="f-input" placeholder="请输入处置建议（选填）..." ' +
            'style="width:100%;min-height:70px;padding:8px;resize:vertical;box-sizing:border-box;"></textarea>' +
        '</div>' +
        '<div style="margin-top:20px;display:flex;gap:8px;">' +
          '<button class="btn primary w-100" id="rfmSave">保存</button>' +
          '<button class="btn w-100" onclick="APP.Components.closeDrawer()">取消</button>' +
        '</div>' +
      '</div>';
    C.openDrawer({ title: '新建风险预警', subtitle: '手动录入风险事件', bodyHtml: html, width: 480 });

    U.$('#rfmSave').addEventListener('click', function () {
      var entId = U.$('#rfmEnt').value;
      var dimKey = U.$('#rfmDim').value;
      var level = U.$('#rfmLevel').value;
      var title = U.$('#rfmTitle').value.trim();
      var detail = U.$('#rfmDetail').value.trim();
      var advice = U.$('#rfmAdvice').value.trim();

      if (!entId) { C.toast('请选择涉事企业', 'warning'); return; }
      if (!title) { C.toast('请输入事件标题', 'warning'); return; }
      if (!detail) { C.toast('请输入风险详情', 'warning'); return; }

      var ent = M.entById(entId);
      if (!ent) return;
      var dim = dims.filter(function(d){return d.key===dimKey;})[0] || dims[0];
      var today = new Date();
      var dateStr = U.fmtDate(today);

      // 计算新 ID
      var maxId = 0;
      M.RISK_EVENTS.forEach(function(ev){
        var n = parseInt(ev.id.replace(/\D/g, ''));
        if (n > maxId) maxId = n;
      });
      var newId = 'R' + (maxId + 1 < 100 ? '0' : '') + (maxId + 1);

      var newEv = {
        id: newId,
        time: dateStr,
        timeHm: (today.getHours()<10?'0':'') + today.getHours() + ':' + (today.getMinutes()<10?'0':'') + today.getMinutes(),
        entId: ent.id,
        enterprise: ent.name,
        enterpriseName: ent.name,
        title: title,
        finding: title,
        type: dim.name + '异常',
        typeKey: dim.key,
        dim: dim.key,
        dimKey: dim.key,
        dimName: dim.name,
        level: level,
        advice: advice || '请相关部门核查，必要时约谈企业负责人。',
        suggestion: advice || '请相关部门核查，必要时约谈企业负责人。',
        status: '待处置',
        basis: detail,
        detail: detail,
        daysAgo: 0
      };
      M.RISK_EVENTS.unshift(newEv);
      C.closeDrawer();
      C.toast('风险预警已创建', 'success');
      state.filter.risk.page = 1;
      APP.render();
    });
  }

  APP.registerRenderer('risk', renderRisk);
})();
