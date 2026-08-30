/* ============================================================
 * V4 全局状态：路由、区划、筛选态、派发态、活动图表
 * 所有页面读写 state 都走这个对象，render() 统一触发
 * ============================================================ */
(function () {
  'use strict';

  var state = {
    page: 'dashboard',
    ent: 'E001',           // 当前选中企业
    event: null,           // 当前选中风险事件
    district: 'all',       // 区县筛选
    demoPlaying: false,
    demoIndex: 0,
    demoTimer: null,
    dispatched: {},        // 风险事件 -> 派发状态
    highlightTaskId: null, // 新建任务后一次性高亮的任务行
    highlightProjectId: null, // 新建项目后一次性高亮的项目卡片
    project: null,         // 抽屉打开时的项目
    // 筛选态（按页面分组，避免互相污染）
    filter: {
      enterprise: { keyword: '', risk: '', industry: '', district: '', scale: '', sort: 'riskDesc', page: 1 },
      risk: { keyword: '', level: '', type: '', status: '', district: '', page: 1, sort: 'timeDesc' },
      project: { keyword: '', stage: '', risk: '', owner: '', district: '', page: 1, view: 'card' },
      workbench: { keyword: '', status: '', priority: '', page: 1 },
      profile: { keyword: '', risk: '', industry: '', sort: 'riskDesc' },
      policy: { keyword: '', level: '', dept: '', type: '', page: 1 },
      dashboard: { trendTab: 'year' }
    },
    // 下钻返回用
    navBack: null          // { page, filter }
  };

  // 活动图表句柄（页面切换统一销毁）
  var liveCharts = [];

  window.APP = window.APP || {};
  window.APP.state = state;
  window.APP.liveCharts = liveCharts;

  // 渲染器注册表（各页面模块自行注入）
  var renderers = {};
  APP.renderers = renderers;
  APP.registerRenderer = function (key, fn) { renderers[key] = fn; };

  // 图表生命周期管理
  function disposeCharts() {
    liveCharts.forEach(function (c) { try { c.dispose(); } catch (e) {} });
    liveCharts.length = 0;
  }
  function mkChart(dom, opt, initOpts) {
    if (!dom) return null;
    // 统一 tooltip 主题（各页显式配置的字段优先，仅补默认外观）
    var tip = opt && opt.tooltip;
    if (tip) {
      if (tip.backgroundColor === undefined) tip.backgroundColor = 'rgba(15, 23, 42, 0.92)';
      if (tip.borderWidth === undefined) tip.borderWidth = 0;
      if (tip.padding === undefined) tip.padding = [8, 12];
      if (tip.textStyle === undefined) tip.textStyle = { color: '#F8FAFC', fontSize: 12 };
      if (tip.extraCssText === undefined) tip.extraCssText = 'border-radius:8px;box-shadow:0 6px 18px rgba(15,23,42,0.25);';
    }
    var c = echarts.init(dom, null, initOpts);
    c.setOption(opt);
    liveCharts.push(c);
    return c;
  }
  APP.mkChart = mkChart;
  APP.disposeCharts = disposeCharts;

  // 便捷方法
  window.APP.State = {
    setPage: function (p) { state.page = p; },
    setEnt: function (id) { state.ent = id; },
    setDistrict: function (d) { state.district = d; },
    resetFilter: function (key) {
      if (state.filter[key]) {
        for (var k in state.filter[key]) {
          var v = state.filter[key];
          if (k === 'page') v[k] = 1;
          else v[k] = '';
        }
      }
    }
  };
})();
