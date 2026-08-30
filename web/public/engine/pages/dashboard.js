/* ============================================================
 * 页面：招商驾驶舱
 * ============================================================ */
(function () {
  'use strict';
  var U = APP.U;
  var C = APP.Components;
  var state = APP.state;
  var M = window.MOCK;
  var mkChart = APP.mkChart;

  // 环比 HTML 工具
  function momHtml(v, invert) {
    var up = v >= 0;
    if (invert) up = !up;
    var cls = up ? 'up' : 'down';
    var arr = up ? '▲' : '▼';
    return '<span class="k-mom ' + cls + '"><span class="arr">' + arr + '</span> ' + Math.abs(v).toFixed(1) + '% 环比</span>';
  }

  /* 产业分布饼图响应式阈值：
     窄屏（<420px）右侧竖排图例会挤压重叠，故窄屏将图例移至饼图下方——
     横向自动换行、完整显示行业名称（不截断、不挤压），并隐藏扇区直接标签、
     用像素半径把饼图固定在上方区域，与底部图例互不重叠。
     全局 resize 仅调用 chart.resize()，不会重算 option，故需自行监听并 setOption。 */
  var IND_NARROW = 420;
  var IND_ULTRA = 360;
  var _indResizeH = null;

  function renderDashboard() {
    var O = M.OVERVIEW;
    var districtLabel = state.district === 'all' ? '庆阳市（全市）' : (M.DISTRICTS.filter(function(d){return d.key===state.district;})[0]||{}).name;

    // 按区县过滤企业
    var ents = state.district === 'all'
      ? M.ENTERPRISES
      : M.ENTERPRISES.filter(function (e) { return e.district === state.district; });

    // ===== 实时聚合 KPI =====
    var totalEnts = ents.length;
    var keyEnts = ents.filter(function(e){return e.tags && e.tags.indexOf('重点招商企业')>=0;}).length;
    var newEnts = ents.filter(function(e){return e.signDaysAgo <= 30;}).length;
    var revWan = ents.reduce(function(s,e){return s + e.overview.revenueWan;},0);
    var taxWan = ents.reduce(function(s,e){return s + e.overview.taxWan;},0);
    var invWan = ents.reduce(function(s,e){return s + e.overview.investWan;},0);
    var employ = ents.reduce(function(s,e){return s + e.overview.employees;},0);
    var riskEnts = ents.filter(function(e){return e.riskLevel==='red'||e.riskLevel==='orange';}).length;

    var revenueStr = (revWan/10000).toFixed(1) + '亿元';
    var taxStr = (taxWan/10000).toFixed(2) + '亿元';
    var investStr = (invWan/10000).toFixed(1) + '亿元';

    // 环比（演示用：全市用 OVERVIEW，区县用略小的波动）
    var mom = O.mom;
    // 区县视图下环比稍作调整（模拟区县粒度波动）
    if (state.district !== 'all') {
      var rng = U.makeRng(state.district.charCodeAt(0) * 137);
      mom = {
        revenue: +(O.mom.revenue + (rng()-0.5)*3).toFixed(1),
        tax: +(O.mom.tax + (rng()-0.5)*2).toFixed(1),
        employment: +(O.mom.employment + (rng()-0.5)*1.5).toFixed(1),
        totalEnterprises: +(O.mom.totalEnterprises + (rng()-0.5)*1).toFixed(1),
        keyEnterprises: +(O.mom.keyEnterprises + (rng()-0.5)*2).toFixed(1),
        newEnterprises: +(O.mom.newEnterprises + (rng()-0.5)*5).toFixed(1),
        invest: +(O.mom.invest + (rng()-0.5)*2.5).toFixed(1),
        riskEnterprises: +(O.mom.riskEnterprises + (rng()-0.5)*4).toFixed(1)
      };
    }

    function kpi(label, value, momKey, invert, riskClass, action) {
      var momVal = mom[momKey];
      var cursor = action ? 'style="cursor:pointer;"' : '';
      return '<div class="kpi ' + (riskClass || '') + '" data-kpi="' + momKey + '" ' + cursor + '>' +
        '<div class="k-label">' + U.esc(label) + '</div>' +
        '<div class="k-value">' + U.esc(value) + '</div>' +
        momHtml(momVal, invert) +
        '</div>';
    }

    // 组织架构下拉选项
    var districtOpts = '<option value="all"' + (state.district === 'all' ? ' selected' : '') + '>庆阳市（全市）</option>' +
      M.DISTRICTS.map(function (d) {
        var dcnt = (M.DISTRICT_DATA[d.key]||{}).enterprises || 0;
        return '<option value="' + d.key + '"' + (state.district === d.key ? ' selected' : '') + '>' + d.name + '（' + dcnt + '家）</option>';
      }).join('');

    // 亩均税收 = 税收 / 用地面积（用地由投资规模确定性推导）
    var landMu = ents.reduce(function (s, e) {
      return s + (e.landMu || Math.max(15, Math.round(e.overview.investWan / 90)));
    }, 0);
    var muTax = landMu > 0 ? taxWan / landMu : 0;

    // 本年新增（年内招商签约口径，确定性推导且包含本月新增）
    var newYearCnt = ents.filter(function (e) {
      var idn = parseInt((e.id || '').replace(/\D/g, ''), 10) || 0;
      return (idn * 37) % 100 < 18 || e.signDaysAgo <= 30;
    }).length;

    var kpiHtml =
      // 第一行：规模与风险
      kpi('企业总数', totalEnts.toLocaleString() + '家', 'totalEnterprises', false, '', 'enterprise') +
      kpi('重点企业', keyEnts + '家', 'keyEnterprises', false, '', 'enterprise') +
      kpi('本月新增', newEnts + '家', 'newEnterprises', false, '', 'enterprise') +
      kpi('本年新增', newYearCnt + '家', 'newEnterprises', false, '', 'enterprise') +
      kpi('风险企业', riskEnts + '家', 'riskEnterprises', true, 'risk', 'risk') +
      // 第二行：经济贡献
      kpi('总营收', revenueStr, 'revenue') +
      kpi('固定资产投资', investStr, 'invest') +
      kpi('带动就业', employ.toLocaleString() + '人', 'employment') +
      kpi('纳税总额', taxStr, 'tax') +
      kpi('亩均税收', muTax.toFixed(1) + '万元', 'tax');

    // 数据来源
    var dsHtml = '<div class="data-sources">' +
      M.DATA_SOURCES.map(function (d) {
        return '<div class="ds-item"><span class="dot" style="background:' + d.color + '"></span>' +
          U.esc(d.name) + ' · ' + U.esc(d.update) + '</div>';
      }).join('') + '</div>';

    // 趋势 Tab 状态
    var trendTab = state.filter.dashboard.trendTab || 'year'; // year=本年度, 5y=近五年
    state.filter.dashboard.trendTab = trendTab;

    // 本年度（按月）聚合
    var monthCount = M.MONTHS.length;
    var monthRevenue = new Array(monthCount).fill(0);
    var monthTax = new Array(monthCount).fill(0);
    var monthEmploy = new Array(monthCount).fill(0);
    ents.forEach(function (e) {
      // 用 operation 的月度数据（如果有），否则用年度平均分摊
      if (e.operation && e.operation.revenue && e.operation.revenue.length >= monthCount) {
        for (var mi = 0; mi < monthCount; mi++) {
          monthRevenue[mi] += e.operation.revenue[mi] || 0;
          monthTax[mi] += (e.operation.tax && e.operation.tax[mi]) ? e.operation.tax[mi]/10000 : 0;
          monthEmploy[mi] += (e.operation.employees && e.operation.employees[mi]) ? (e.operation.employees[mi]/100) : 0;
        }
      } else {
        //  fallback：按年度值/12 近似
        var mr = (e.overview.revenueWan / 10000) / 12;
        var mt = (e.overview.taxWan / 10000) / 12;
        var me = (e.overview.employees / 100) / 12;
        for (var mj = 0; mj < monthCount; mj++) {
          monthRevenue[mj] += mr;
          monthTax[mj] += mt;
          monthEmploy[mj] += me;
        }
      }
    });
    // 保留一位小数
    monthRevenue = monthRevenue.map(function(v){return +v.toFixed(1);});
    monthTax = monthTax.map(function(v){return +v.toFixed(2);});
    monthEmploy = monthEmploy.map(function(v){return Math.round(v);});

    // 近五年（按年）聚合
    var yearCount = 5;
    var yearLabels = M.YEARS_5.slice();
    var yearRevenue = new Array(yearCount).fill(0);
    var yearTax = new Array(yearCount).fill(0);
    var yearEmploy = new Array(yearCount).fill(0);
    var yearInvest = new Array(yearCount).fill(0);
    ents.forEach(function (e) {
      var y = e.overview.yearly;
      if (y && y.revenueWan && y.revenueWan.length === 5) {
        for (var yi = 0; yi < 5; yi++) {
          yearRevenue[yi] += y.revenueWan[yi] / 10000;
          yearTax[yi] += (y.taxWan ? y.taxWan[yi] : 0) / 10000;
          yearEmploy[yi] += (y.employees ? y.employees[yi] : 0) / 100;
          yearInvest[yi] += (y.investWan ? y.investWan[yi] : 0) / 10000;
        }
      } else {
        // fallback：用当前值，逐年递减
        for (var yj = 0; yj < 5; yj++) {
          yearRevenue[yj] += (e.overview.revenueWan / 10000) * (0.7 + 0.3 * yj / 4);
          yearTax[yj] += (e.overview.taxWan / 10000) * (0.7 + 0.3 * yj / 4);
          yearEmploy[yj] += (e.overview.employees / 100) * (0.7 + 0.3 * yj / 4);
          yearInvest[yj] += (e.overview.investWan / 10000) * (0.5 + 0.5 * yj / 4);
        }
      }
    });
    yearRevenue = yearRevenue.map(function(v){return +v.toFixed(1);});
    yearTax = yearTax.map(function(v){return +v.toFixed(2);});
    yearEmploy = yearEmploy.map(function(v){return Math.round(v);});
    yearInvest = yearInvest.map(function(v){return +v.toFixed(1);});

    // 风险分布（实时）
    var riskCounts = { red: 0, orange: 0, yellow: 0, blue: 0 };
    ents.forEach(function(e){ riskCounts[e.riskLevel]++; });

    // 行业分布（实时）
    var indMap = {};
    ents.forEach(function(e){
      if (!indMap[e.industry]) indMap[e.industry] = { name: e.industryName, revenue: 0, count: 0, color: '' };
      indMap[e.industry].revenue += e.overview.revenueWan;
      indMap[e.industry].count++;
    });
    var indList = Object.values(indMap).sort(function(a,b){return b.revenue-a.revenue;});
    // 补充颜色
    indList.forEach(function(ind){
      var m = M.INDUSTRIES.filter(function(i){return i.name === ind.name;})[0];
      ind.color = m ? m.color : '#94A3B8';
      ind.revenue = +(ind.revenue/10000).toFixed(1);
    });

    // ===== 招商成效口径（从项目明细推导，与 mock.INVEST_STATS 同口径）=====
    // 签约落地（order>=3）起计入"已签约"；到位资金 = 协议额 × 项目进度
    var projects = state.district === 'all'
      ? M.PROJECTS
      : M.PROJECTS.filter(function (p) { return p.district === state.district; });
    var targetYi = state.district === 'all' ? M.INVEST_TARGETS.total
                                            : (M.INVEST_TARGETS.byDistrict[state.district] || 100);
    var stageOrderMap = {};
    M.PROJECT_STAGES.forEach(function (s) { stageOrderMap[s.key] = s.order; });
    var agreedWan = 0, arrivedWan = 0, pipelineWan = 0, pipelineCnt = 0;
    var funnelCnt = {};
    M.PROJECT_STAGES.forEach(function (s) { funnelCnt[s.key] = 0; });
    projects.forEach(function (p) {
      funnelCnt[p.stage]++;
      if (stageOrderMap[p.stage] >= 3) {
        agreedWan += p.amountWan;
        arrivedWan += Math.round(p.amountWan * p.progress / 100);
      } else { pipelineWan += p.amountWan; pipelineCnt++; }
    });
    var agreeRate = Math.min(100, Math.round(agreedWan / (targetYi * 10000) * 100));
    var arrivedTargetYi = Math.round(targetYi * 0.62);
    var arriveRate = Math.min(100, Math.round(arrivedWan / (arrivedTargetYi * 10000) * 100));
    var timeSeqRate = Math.round((new Date().getMonth() + 1) / 12 * 100); // 时序进度：月/12
    var seqGap = agreeRate - timeSeqRate;

    // 区县招商业绩榜（全市口径，高亮当前区县）
    var horseData = M.DISTRICTS.map(function (d) {
      var b = M.INVEST_STATS.byDistrict[d.key] || { agreedWan: 0 };
      var t = M.INVEST_TARGETS.byDistrict[d.key] || 1;
      return { key: d.key, name: d.name, yi: +(b.agreedWan / 10000).toFixed(1),
               rate: Math.min(100, Math.round(b.agreedWan / (t * 10000) * 100)) };
    }).sort(function (a, b) { return b.yi - a.yi; });

    // 全省市州对标
    var provSelf = M.PROVINCE_COMPARE.filter(function (p) { return p.self; })[0];
    var provSelfRank = M.PROVINCE_COMPARE.indexOf(provSelf) + 1;

    // 政策兑现 TOP3
    var redeem = M.POLICY_REDEEM;
    var topRedeem = M.POLICY_LIB.slice().sort(function (a, b) { return b.redeemedWan - a.redeemedWan; }).slice(0, 3);

    // 处置指标：对应风险预警页事件清单的状态口径（事件按区县联动过滤）
    // 待处置=「待处置」 · 处置中=「已派发」 · 已处置=「已关闭」 · 闭环率自动计算
    var evs = state.district === 'all' ? M.RISK_EVENTS
      : M.RISK_EVENTS.filter(function (ev) {
          var e = M.entById(ev.entId);
          return e && e.district === state.district;
        });
    var tPending = evs.filter(function (ev) { return ev.status === '待处置'; }).length;
    var tDoing = evs.filter(function (ev) { return ev.status === '已派发'; }).length;
    var tDone = evs.filter(function (ev) { return ev.status === '已关闭'; }).length;
    var closeRate = evs.length ? Math.round(tDone / evs.length * 100) : 0;

    // 近 6 个月预警走势：按事件真实日期（ev.time）分月统计，与 MONTHS_6 标签一一对应
    var riskTrend = (function () {
      var now = new Date();
      var keys = [];
      for (var i = 5; i >= 0; i--) {
        var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        keys.push(d.getFullYear() + '-' + (d.getMonth() < 9 ? '0' : '') + (d.getMonth() + 1));
      }
      return keys.map(function (mk) {
        return evs.filter(function (ev) { return String(ev.time).indexOf(mk) === 0; }).length;
      });
    })();

    // 今日行动项
    var evPendingRO = evs.filter(function (ev) {
      return ev.status === '待处置' && (ev.level === 'red' || ev.level === 'orange');
    }).length;
    var overdueScoped = M.TASKS.filter(function (t) {
      if (t.status !== '已逾期') return false;
      if (state.district === 'all') return true;
      var e = M.entById(t.enterprise);
      return e && e.district === state.district;
    });
    var lowestDist = horseData.slice().sort(function (a, b) { return a.rate - b.rate; })[0];
    var actions = [];
    if (evPendingRO > 0) actions.push({ c: '#e03131', t: evPendingRO + ' 条红/橙级预警待处置，建议今日派发核查' });
    if (overdueScoped.length) actions.push({ c: '#F97316', t: overdueScoped.length + ' 件服务任务已逾期，请优先督办办结' });
    if (pipelineCnt) actions.push({ c: '#2563EB', t: pipelineCnt + ' 个在谈项目、协议投资 ' + (pipelineWan / 10000).toFixed(1) + ' 亿元储备中，加快签约转化' });
    if (lowestDist && lowestDist.rate < 80) actions.push({ c: '#f1b400', t: '区县年度目标完成率最低为' + lowestDist.name + '（' + lowestDist.rate + '%），建议专题督导' });
    actions.push({ c: '#22C55E', t: seqGap >= 0
      ? '年度招商目标超时序进度 ' + seqGap + ' 个百分点，保持推进节奏'
      : '年度招商目标欠时序进度 ' + Math.abs(seqGap) + ' 个百分点，需加压推进' });

    // 重大项目 TOP5（按协议投资额）
    var topProj = projects.slice().sort(function (a, b) { return b.amountWan - a.amountWan; }).slice(0, 5);
    var topProjHtml = topProj.map(function (p, i) {
      return '<div class="tp-item" data-id="' + p.id + '" title="点击进入项目库">' +
        '<div class="tp-rank">' + (i + 1) + '</div>' +
        '<div class="tp-main"><div class="tp-name">' + U.esc(p.name) + '</div>' +
        '<div class="tp-meta">' + U.esc(p.districtName) + ' · ' + U.esc(p.owner) + ' · ' + U.esc(p.stageName) + ' ' + p.progress + '%</div></div>' +
        '<div class="tp-amt">' + U.esc(p.amount) + '</div></div>';
    }).join('');

    // AI 今日摘要（基于当前区县数据生成）
    var aiItems = buildAiSummary(ents, districtLabel);
    aiItems.push('招商推进：在库项目 ' + projects.length + ' 个，已签约 ' + (projects.length - pipelineCnt) +
      ' 个、协议投资 ' + (agreedWan / 10000).toFixed(1) + ' 亿元，年度目标完成 ' + agreeRate + '%。');
    var aiHtml = aiItems.map(function (t, i) {
      return '<li style="margin-bottom:8px; line-height:1.7">' +
        '<span style="display:inline-block;width:20px;height:20px;border-radius:50%;' +
        'background:linear-gradient(135deg,#8B5CF6,#3B82F6);color:#fff;font-size:11px;' +
        'text-align:center;line-height:20px;margin-right:8px;vertical-align:middle;">' + (i+1) + '</span>' +
        U.esc(t) + '</li>';
    }).join('');
    var actionHtml = actions.map(function (a) {
      return '<div class="act"><span class="act-dot" style="background:' + a.c + '"></span><span>' + U.esc(a.t) + '</span></div>';
    }).join('');

    U.$('#content').innerHTML =
      // 页面顶栏：组织架构选择
      '<div class="page-toolbar">' +
        '<div class="pt-left">' +
          '<label class="pt-label">辖区</label>' +
          '<select class="f-select" id="dashDistrictSel" style="width:180px;">' + districtOpts + '</select>' +
          '<span class="pt-divider"></span>' +
          '<span class="pt-info">' + U.esc(districtLabel) + ' · 共 ' + totalEnts + ' 家企业</span>' +
        '</div>' +
        '<div class="pt-right">' +
          '<button class="btn sm" id="dashExportBtn">⬇ 导出报表</button>' +
        '</div>' +
      '</div>' +

      // KPI
      '<div class="kpi-grid">' + kpiHtml + '</div>' +

      // 趋势图 + TOP5
      '<div class="row mt">' +
        '<div class="col-2 card">' +
          '<div class="card-title">' +
            '总体运行趋势' +
            '<div class="trend-tabs">' +
              '<span class="trend-tab' + (trendTab === 'year' ? ' active' : '') + '" data-tab="year">本年度</span>' +
              '<span class="trend-tab' + (trendTab === '5y' ? ' active' : '') + '" data-tab="5y">近五年</span>' +
            '</div>' +
          '</div>' +
          '<div id="c_trend" class="chart" style="height:320px"></div>' +
        '</div>' +
        '<div class="col card">' +
          '<div class="card-title">重点企业营收 TOP5</div>' +
          '<div id="c_top5" class="chart" style="height:340px"></div>' +
        '</div>' +
      '</div>' +

      // ★ 招商成效：目标完成度 + 项目漏斗 + 全省对标
      '<div class="row mt">' +
        '<div class="col card">' +
          '<div class="card-title">年度招商目标完成度</div>' +
          '<div class="target-wrap">' +
            '<div class="ring-box">' +
              '<div id="c_ring_agree" class="chart" style="height:128px"></div>' +
              '<div class="ring-center"><b>' + agreeRate + '%</b><span>协议投资额</span></div>' +
              '<div class="ring-sub">签约 ' + (agreedWan / 10000).toFixed(1) + '亿 / 目标 ' + targetYi + '亿</div>' +
            '</div>' +
            '<div class="ring-box">' +
              '<div id="c_ring_arrive" class="chart" style="height:128px"></div>' +
              '<div class="ring-center"><b>' + arriveRate + '%</b><span>到位资金</span></div>' +
              '<div class="ring-sub">到位 ' + (arrivedWan / 10000).toFixed(1) + '亿 / 目标 ' + arrivedTargetYi + '亿</div>' +
            '</div>' +
          '</div>' +
          '<div class="seq-note">时序进度 ' + timeSeqRate + '% · <span class="' + (seqGap >= 0 ? 'seq-up' : 'seq-down') + '">' +
            (seqGap >= 0 ? '超' : '欠') + ' ' + Math.abs(seqGap) + ' 个百分点</span></div>' +
        '</div>' +
        '<div class="col card">' +
          '<div class="card-title">招商项目阶段漏斗 <span class="muted" style="font-size:12px;font-weight:400;">点击下钻项目库</span></div>' +
          '<div id="c_funnel" class="chart" style="height:186px"></div>' +
        '</div>' +
        '<div class="col card">' +
          '<div class="card-title">全省市州对标 <span class="muted" style="font-size:12px;font-weight:400;">全市口径 · 到位资金(亿)</span></div>' +
          '<div id="c_province" class="chart" style="height:196px"></div>' +
          '<div class="seq-note">庆阳市到位资金 <b>' + provSelf.amount + '</b> 亿元，列全省第 <b>' + provSelfRank + '</b> 位</div>' +
        '</div>' +
      '</div>' +

      // ★ 区县赛马榜 + 重大项目 TOP5
      '<div class="row mt">' +
        '<div class="col-2 card">' +
          '<div class="card-title">区县招商业绩榜 <span class="muted" style="font-size:12px;font-weight:400;">签约投资额 · 完成率 · 点击下钻</span></div>' +
          '<div id="c_horse" class="chart" style="height:236px"></div>' +
        '</div>' +
        '<div class="col card">' +
          '<div class="card-title">重大项目 TOP5</div>' +
          '<div class="top-proj">' + topProjHtml + '</div>' +
        '</div>' +
      '</div>' +

      // 地图 + 风险态势
      '<div class="row mt">' +
        '<div class="col-2 card map-area">' +
          '<div class="card-title">区县企业分布热力图 <span class="muted" style="font-size:12px;font-weight:400;">颜色深浅表示企业数量</span></div>' +
          '<div id="c_map" class="chart" style="height:360px"></div>' +
        '</div>' +
        '<div class="col card">' +
          '<div class="card-title" style="display:flex;justify-content:space-between;align-items:center;">风险态势' +
            '<a href="javascript:;" class="risk-jump" style="font-size:12px;font-weight:400;">进入风险预警 →</a></div>' +
          '<div id="c_riskbar" class="chart" style="height:236px"></div>' +
          '<div class="risk-eff">' +
            '<div class="re-item"><b>' + tPending + '</b><span>待处置</span></div>' +
            '<div class="re-item"><b>' + tDoing + '</b><span>处置中</span></div>' +
            '<div class="re-item"><b>' + tDone + '</b><span>已处置</span></div>' +
            '<div class="re-item"><b>' + closeRate + '%</b><span>闭环率</span></div>' +
          '</div>' +
          '<div class="re-sub">近 6 个月预警走势</div>' +
          '<div id="c_risktrend" class="chart" style="height:48px"></div>' +
        '</div>' +
      '</div>' +

      // 产业分布 + 政策兑现
      '<div class="row mt">' +
        '<div class="col-2 card">' +
          '<div class="card-title">产业分布结构</div>' +
          '<div id="c_industry" class="chart" style="height:300px"></div>' +
        '</div>' +
        '<div class="col card">' +
          '<div class="card-title">政策兑现服务</div>' +
          '<div class="redeem-stats">' +
            '<div class="rs-item"><b>' + (redeem.redeemedWan / 10000).toFixed(2) + '亿</b><span>年内已兑现</span></div>' +
            '<div class="rs-item"><b>' + redeem.rate + '%</b><span>兑现率</span></div>' +
            '<div class="rs-item"><b>' + redeem.entsHelped + '家</b><span>惠企企业</span></div>' +
          '</div>' +
          topRedeem.map(function (p) {
            return '<div class="rs-row"><div class="rs-name">' + U.esc(p.name) + '</div>' +
              '<div class="rs-bar"><div class="rs-fill" style="width:' + p.redeemRate + '%"></div></div>' +
              '<div class="rs-val">' + p.redeemRate + '%</div></div>';
          }).join('') +
          '<div class="muted mt-s" style="font-size:12px;">年度安排资金 ' + (redeem.planWan / 10000).toFixed(2) + ' 亿元，惠及 ' + redeem.entsHelped + ' 家企业。</div>' +
        '</div>' +
      '</div>' +

      // AI 今日综述 + 今日行动项
      '<div class="row mt">' +
        '<div class="col-2 card">' +
          '<div class="card-title">✦ 今日运行综述</div>' +
          '<ul style="list-style:none;padding:0;">' + aiHtml + '</ul>' +
        '</div>' +
        '<div class="col card">' +
          '<div class="card-title">⚡ 今日行动项</div>' +
          '<div class="action-list">' + actionHtml + '</div>' +
        '</div>' +
      '</div>' +

      // 数据资源接入（全宽，页面收尾）
      '<div class="card mt">' +
        '<div class="card-title">数据资源接入 · 来源分布</div>' +
        dsHtml +
        '<div class="muted mt-s" style="font-size:12px;">共接入 ' + M.DATA_SOURCES.length + ' 类数据来源，覆盖工商、税务、社保、司法、知识产权、生态环境、应急管理等核心领域。</div>' +
      '</div>';

    // ---- 图表 ----
    // 1. 运行趋势（双轴：营收/纳税左轴，就业右轴）
    // 窄容器：图例换行会压住绘图区、右端图例项被裁——缩小图例、预留两行高度、隐藏轴名
    var trendBox = U.$('#c_trend');
    var trendNarrow = trendBox && trendBox.clientWidth > 0 && trendBox.clientWidth < 380;
    var trendLegend = {
      data: ['营收(亿)', '纳税(亿)', '投资(亿)', '就业(百人)'],
      top: 0,
      textStyle: { fontSize: trendNarrow ? 10 : 11 },
      itemWidth: trendNarrow ? 14 : 18,
      itemHeight: trendNarrow ? 8 : 10,
      itemGap: trendNarrow ? 5 : 10
    };
    var trendGrid = trendNarrow
      ? { left: 34, right: 26, top: 56, bottom: 22 }
      : { left: 40, right: 40, top: 30, bottom: 30 };
    var trendOpt;
    if (trendTab === 'year') {
      // 本年度：月度柱状+折线（与近五年格式一致）
      // 月度投资（从年度投资按月分配，带小幅波动）
      var monthInvest = [];
      for (var mi = 0; mi < monthCount; mi++) {
        monthInvest.push(+(yearInvest[4] / 12 * (1 + 0.05 * Math.sin(mi / 12 * Math.PI * 2))).toFixed(1));
      }
      trendOpt = {
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        legend: trendLegend,
        grid: trendGrid,
        xAxis: { type: 'category', data: M.MONTHS, axisLabel: { fontSize: trendNarrow ? 9 : 10 } },
        yAxis: [
          { type: 'value', name: trendNarrow ? '' : '亿元', axisLabel: { fontSize: trendNarrow ? 9 : 10 } },
          { type: 'value', name: trendNarrow ? '' : '百人', axisLabel: { fontSize: trendNarrow ? 9 : 10 } }
        ],
        series: [
          { name: '营收(亿)', type: 'bar', data: monthRevenue, barMaxWidth: 12,
            itemStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: '#3B82F6' }, { offset: 1, color: '#2563EB' }
            ]), borderRadius: [4, 4, 0, 0] } },
          { name: '纳税(亿)', type: 'bar', data: monthTax, barMaxWidth: 12,
            itemStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: '#FDBA74' }, { offset: 1, color: '#F97316' }
            ]), borderRadius: [4, 4, 0, 0] } },
          { name: '投资(亿)', type: 'bar', data: monthInvest, barMaxWidth: 12,
            itemStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: '#8B5CF6' }, { offset: 1, color: '#6366F1' }
            ]), borderRadius: [4, 4, 0, 0] } },
          { name: '就业(百人)', type: 'line', yAxisIndex: 1, smooth: true, data: monthEmploy,
            itemStyle: { color: '#22C55E' }, lineStyle: { width: 2 },
            symbol: 'circle', symbolSize: 5 }
        ]
      };
    } else {
      // 近五年：年度柱状+折线
      trendOpt = {
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        legend: trendLegend,
        grid: trendGrid,
        xAxis: { type: 'category', data: yearLabels, axisLabel: { fontSize: trendNarrow ? 10 : 11 } },
        yAxis: [
          { type: 'value', name: trendNarrow ? '' : '亿元', axisLabel: { fontSize: trendNarrow ? 9 : 10 } },
          { type: 'value', name: trendNarrow ? '' : '百人', axisLabel: { fontSize: trendNarrow ? 9 : 10 } }
        ],
        series: [
          { name: '营收(亿)', type: 'bar', data: yearRevenue, barMaxWidth: 20,
            itemStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: '#3B82F6' }, { offset: 1, color: '#2563EB' }
            ]), borderRadius: [4, 4, 0, 0] } },
          { name: '纳税(亿)', type: 'bar', data: yearTax, barMaxWidth: 20,
            itemStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: '#FDBA74' }, { offset: 1, color: '#F97316' }
            ]), borderRadius: [4, 4, 0, 0] } },
          { name: '投资(亿)', type: 'bar', data: yearInvest, barMaxWidth: 20,
            itemStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: '#8B5CF6' }, { offset: 1, color: '#6366F1' }
            ]), borderRadius: [4, 4, 0, 0] } },
          { name: '就业(百人)', type: 'line', yAxisIndex: 1, smooth: true, data: yearEmploy,
            itemStyle: { color: '#22C55E' }, lineStyle: { width: 2 },
            symbol: 'circle', symbolSize: 6 }
        ]
      };
    }
    mkChart(U.$('#c_trend'), trendOpt);

    // 2. TOP5 条形图
    var top5 = ents.slice().sort(function (a,b) {
      return b.overview.revenueWan - a.overview.revenueWan;
    }).slice(0, 5);
    mkChart(U.$('#c_top5'), {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' },
        formatter: function (p) { return p[0].name + '<br/>营收：' + p[0].value + ' 亿元'; } },
      grid: { left: 140, right: 30, top: 8, bottom: 24 },
      xAxis: { type: 'value', axisLabel: { fontSize: 10 } },
      yAxis: {
        type: 'category',
        data: top5.map(function(e){ return e.name; }),
        axisLabel: {
          fontSize: 11,
          interval: 0,
          width: 110,
          lineHeight: 14,
          // 按宽度自动断行（可多行），企业名始终完整显示，不做硬性两行拆分
          overflow: 'break'
        }
      },
      series: [{
        type: 'bar',
        data: top5.map(function (e) { return +(e.overview.revenueWan / 10000).toFixed(1); }),
        itemStyle: { color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
          { offset: 0, color: '#2563EB' }, { offset: 1, color: '#3B82F6' }
        ]), borderRadius: [0, 4, 4, 0] },
        barWidth: 14,
        label: { show: true, position: 'right', fontSize: 10, formatter: '{c} 亿' }
      }]
    });

    // 3. 风险柱状图
    var riskBar = [
      { name: '重大风险', value: riskCounts.red, color: '#e03131' },
      { name: '较高风险', value: riskCounts.orange, color: '#F97316' },
      { name: '一般风险', value: riskCounts.yellow, color: '#f1b400' },
      { name: '关注风险', value: riskCounts.blue, color: '#1c7ed6' }
    ];
    var riskChart = mkChart(U.$('#c_riskbar'), {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: 40, right: 20, top: 20, bottom: 30 },
      xAxis: { type: 'category', data: riskBar.map(function(r){return r.name;}), axisLabel: { fontSize: 11 } },
      yAxis: { type: 'value', axisLabel: { fontSize: 10 } },
      series: [{
        type: 'bar',
        data: riskBar.map(function (r) {
          return { value: r.value, itemStyle: { color: r.color, borderRadius: [4,4,0,0] } };
        }),
        barWidth: 36,
        label: { show: true, position: 'top', fontWeight: 'bold', fontSize: 12 }
      }]
    });
    if (riskChart && riskChart.on) {
      riskChart.on('click', function (p) {
        var level = p.name === '重大风险' ? 'red'
                  : p.name === '较高风险' ? 'orange'
                  : p.name === '一般风险' ? 'yellow' : 'blue';
        state.filter.enterprise.risk = level;
        state.filter.enterprise.district = state.district;
        state.page = 'enterprise';
        APP.render();
      });
    }

    // 4. 区县地图
    try {
      echarts.registerMap('qingyang', M.GEO_QINGYANG);
      var mapData = M.DISTRICTS.map(function (d) {
        var dd = M.DISTRICT_DATA[d.key] || {};
        return { name: d.name, value: dd.enterprises || 0, riskCount: dd.riskCount || 0, districtKey: d.key };
      });
      var mapMax = Math.max.apply(null, mapData.map(function(d){return d.value;}));
      var selectedDistrict = state.district;

      var mapDom = U.$('#c_map');
      // 热力图使用 SVG 渲染器：矢量绘制贴近实际地形，缩放/打印不失真
      var mapChart = mkChart(mapDom, {
        tooltip: {
          trigger: 'item',
          formatter: function (p) {
            if (!p.data) return p.name;
            return p.name + '<br/>企业数：' + p.data.value + ' 家<br/>风险企业：' + (p.data.riskCount||0) + ' 家';
          }
        },
        visualMap: {
          min: 0, max: mapMax,
          left: 10, bottom: 10,
          text: ['高', '低'],
          calculable: true,
          inRange: { color: ['#EFF4FE', '#3B82F6', '#2563EB'] },
          textStyle: { fontSize: 11 }
        },
        series: [{
          name: '企业分布',
          type: 'map',
          map: 'qingyang',
          roam: false,
          layoutCenter: ['50%', '50%'],
          layoutSize: '88%',
          data: mapData.map(function(d){
            return { name: d.name, value: d.value, riskCount: d.riskCount, districtKey: d.districtKey,
              selected: d.districtKey === selectedDistrict };
          }),
          selectedMode: 'single',
          itemStyle: { borderColor: '#fff', borderWidth: 1 },
          label: { show: true, fontSize: 11, color: '#0F172A', fontWeight: 'bold',
            formatter: function (p) { return p.name + '\n' + (p.value || 0) + ' 家'; },
            lineHeight: 14,
            textBorderColor: '#fff', textBorderWidth: 2 },
          emphasis: { disabled: false, focus: 'none', scale: false,
            label: { color: '#fff', textBorderColor: 'transparent' },
            itemStyle: { areaColor: '#6366F1', borderColor: '#fff', borderWidth: 1.5 } },
          select: {
            label: { color: '#fff', textBorderColor: 'transparent' },
            itemStyle: { areaColor: '#F97316', borderColor: '#fff', borderWidth: 2 }
          }
        }]
      }, { renderer: 'svg' });

      if (mapChart && mapChart.on) {
        mapChart.on('click', function (params) {
          var d = M.DISTRICTS.filter(function (d) { return d.name === params.name; })[0];
          if (d) {
            state.district = d.key;
            var sel = U.$('#dashDistrictSel');
            if (sel) sel.value = d.key;
            APP.render();
          }
        });
      }
    } catch (e) {
      var mapEl = U.$('#c_map');
      if (mapEl) mapEl.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#94A3B8;">地图加载中...</div>';
    }

    // 5. 产业饼图（响应式：窄屏隐藏右侧图例，改为扇区标签直标「名称 占比」，
    //    把全部水平空间让给饼图与标签，避免文字挤压重叠）
    var indData = indList.map(function (i) { return { name: i.name, value: i.revenue }; });

    function industryOpt(w) {
      var narrow = w > 0 && w < IND_NARROW;
      var ultra = w > 0 && w < IND_ULTRA;
      return {
        tooltip: { trigger: 'item', formatter: '{b}: {c}亿元 ({d}%)' },
        legend: narrow
          ? {
              show: true,
              orient: 'horizontal',
              left: 'center',
              bottom: 6,
              itemGap: 10,
              itemWidth: 10,
              itemHeight: 10,
              textStyle: { fontSize: 11, color: '#555' },
              type: 'plain',            // 自动换行，保证全部行业名称完整可见、不截断不挤压
              width: '94%',
              align: 'left'
            }
          : { orient: 'vertical', right: 10, top: 'center', textStyle: { fontSize: 12 }, type: 'scroll' },
        color: indList.map(function (i) { return i.color; }),
        series: [{
          type: 'pie',
          radius: narrow ? (ultra ? [0, 96] : [0, 116]) : ['45%', '70%'],
          center: narrow ? ['50%', ultra ? 112 : 132] : ['38%', '50%'],
          avoidLabelOverlap: true,
          minAngle: 3,
          itemStyle: { borderRadius: 4, borderColor: '#fff', borderWidth: 2 },
          label: narrow
            ? { show: false }                              // 窄屏图例已在下方完整展示，饼上不再叠加扇区文字
            : { show: true, fontSize: 11, formatter: '{b}\n{d}%' },
          labelLine: { show: !narrow },
          data: indData
        }]
      };
    }
    function indHeight(w) {
      if (w > 0 && w < IND_ULTRA) return 330;   // 收紧高度，让底部图例紧贴饼图、减少留白
      if (w > 0 && w < IND_NARROW) return 350;
      return 300;
    }

    var indEl = U.$('#c_industry');
    var indChart = null;
    if (indEl) {
      indEl.style.height = indHeight(indEl.clientWidth) + 'px';
      indChart = mkChart(indEl, industryOpt(indEl.clientWidth));
    }

    // 窗口尺寸变化时按新宽度重算布局（先移除上一轮监听，避免重复绑定）
    if (_indResizeH) { window.removeEventListener('resize', _indResizeH); _indResizeH = null; }
    _indResizeH = function () {
      var el = U.$('#c_industry');
      var gone = !el || !indChart || (indChart.isDisposed && indChart.isDisposed());
      if (gone) {
        if (_indResizeH) { window.removeEventListener('resize', _indResizeH); _indResizeH = null; }
        return;
      }
      var w = el.clientWidth;
      var h = indHeight(w) + 'px';
      if (el.style.height !== h) el.style.height = h;
      indChart.resize();
      indChart.setOption(industryOpt(w), true);
    };
    window.addEventListener('resize', _indResizeH);

    // 6. 年度目标双环
    function ringOpt(rate, color) {
      return {
        tooltip: { trigger: 'item', formatter: function (p) { return p.value >= rate ? '已完成 ' + rate + '%' : '未完成 ' + (100 - rate) + '%'; } },
        series: [{
          type: 'pie', radius: ['58%', '80%'], startAngle: 90,
          label: { show: false }, labelLine: { show: false },
          data: [
            { value: rate, itemStyle: { color: color } },
            { value: Math.max(0, 100 - rate), itemStyle: { color: '#E8EDF5' } }
          ]
        }]
      };
    }
    mkChart(U.$('#c_ring_agree'), ringOpt(agreeRate, '#2563EB'));
    mkChart(U.$('#c_ring_arrive'), ringOpt(arriveRate, '#F97316'));

    // 7. 招商项目阶段漏斗（点击下钻项目库）
    var stageColors = ['#1D4ED8', '#2563EB', '#3B82F6', '#60A5FA', '#93C5FD', '#BFDBFE'];
    var funnelData = M.PROJECT_STAGES.map(function (s, i) {
      return { name: s.name, value: funnelCnt[s.key], itemStyle: { color: stageColors[i] } };
    });
    var funnelChart = mkChart(U.$('#c_funnel'), {
      tooltip: { trigger: 'item', formatter: function (p) { return p.name + '：' + p.value + ' 个项目'; } },
      series: [{
        type: 'funnel', left: '10%', width: '80%', top: 6, bottom: 6,
        minSize: '20%', maxSize: '100%', sort: 'descending', gap: 2,
        label: { show: true, position: 'inside', fontSize: 11, color: '#fff',
                 formatter: function (p) { return p.name + ' ' + p.value + '个'; } },
        itemStyle: { borderColor: '#fff', borderWidth: 1 },
        data: funnelData
      }]
    });
    if (funnelChart && funnelChart.on) {
      funnelChart.on('click', function (p) {
        var st = M.PROJECT_STAGES.filter(function (s) { return s.name === p.name; })[0];
        if (!st) return;
        // 该阶段项目数为 0 时不跳转
        var cnt = 0;
        for (var i = 0; i < M.PROJECTS.length; i++) {
          if (M.PROJECTS[i].stage === st.key) cnt++;
        }
        if (cnt === 0) {
          APP.Components.toast('该阶段暂无项目', 'info');
          return;
        }
        // 按点击阶段筛选项目库，清除其他条件，清单卡片滚到顶部（与全局搜索同款滚动行为）
        var fp = state.filter.project;
        fp.stage = st.key;
        fp.keyword = '';
        fp.district = 'all';
        fp.owner = '';
        fp.page = 1;
        state.scrollProjListToTop = true;
        state.page = 'project';
        APP.render();
      });
    }

    // 8. 全省市州对标（横向条形，庆阳高亮；数据升序排列使第一名在顶部）
    var provAsc = M.PROVINCE_COMPARE.slice().reverse();
    mkChart(U.$('#c_province'), {
      tooltip: { trigger: 'item',
        formatter: function (p) { return p.name + '：到位资金 ' + p.value + ' 亿元'; } },
      grid: { left: 60, right: 42, top: 10, bottom: 14 },
      xAxis: { type: 'value', axisLabel: { fontSize: 9 } },
      yAxis: { type: 'category', data: provAsc.map(function (p) { return p.name; }),
        axisLabel: { fontSize: 10, interval: 0 } },
      series: [{
        type: 'bar', barWidth: 8,
        data: provAsc.map(function (p) {
          return { value: p.amount,
                   itemStyle: { color: p.self ? '#F97316' : '#93C5FD', borderRadius: [0, 3, 3, 0] } };
        }),
        label: { show: true, position: 'right', fontSize: 9, color: '#94A3B8' }
      }]
    });

    // 9. 区县招商业绩榜（横向条形，当前区县高亮橙色；点击下钻）
    var hd = horseData.slice().reverse(); // 升序排列使第一名在顶部
    var horseChart = mkChart(U.$('#c_horse'), {
      tooltip: { trigger: 'item',
        formatter: function (p) {
          var d = hd[p.dataIndex];
          return d.name + '<br/>签约投资额：' + d.yi + ' 亿元<br/>年度目标完成率：' + d.rate + '%';
        } },
      grid: { left: 62, right: 90, top: 8, bottom: 22 },
      xAxis: { type: 'value', name: '亿元', axisLabel: { fontSize: 10 } },
      yAxis: { type: 'category', data: hd.map(function (d) { return d.name; }),
        axisLabel: { fontSize: 12, fontWeight: 'bold' } },
      series: [{
        type: 'bar', barWidth: 16,
        data: hd.map(function (d) {
          return { value: d.yi,
            itemStyle: d.key === state.district
              ? { color: '#F97316', borderRadius: [0, 4, 4, 0] }
              : { color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
                    { offset: 0, color: '#2563EB' }, { offset: 1, color: '#60A5FA' }
                  ]), borderRadius: [0, 4, 4, 0] } };
        }),
        label: { show: true, position: 'right', fontSize: 11, color: '#64748B',
          formatter: function (p) { var d = hd[p.dataIndex]; return d.yi + '亿 · 完成' + d.rate + '%'; } }
      }]
    });
    if (horseChart && horseChart.on) {
      horseChart.on('click', function (p) {
        var d = hd[p.dataIndex] || hd.filter(function (x) { return x.name === p.name; })[0];
        if (!d) return;
        state.district = d.key;
        var sel = U.$('#dashDistrictSel');
        if (sel) sel.value = d.key;
        APP.render();
      });
    }

    // 10. 近 6 个月预警走势（迷你面积图）
    mkChart(U.$('#c_risktrend'), {
      grid: { left: 4, right: 4, top: 6, bottom: 2 },
      xAxis: { type: 'category', data: M.MONTHS_6,
        axisLabel: { show: false }, axisTick: { show: false }, axisLine: { show: false } },
      yAxis: { type: 'value', show: false },
      series: [{
        type: 'line', data: riskTrend, smooth: true, symbol: 'none',
        lineStyle: { color: '#F97316', width: 2 },
        areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: 'rgba(249,115,22,.30)' }, { offset: 1, color: 'rgba(249,115,22,0)' }
        ]) }
      }]
    });

    // 组织架构下拉
    var dsSel = U.$('#dashDistrictSel');
    if (dsSel) dsSel.addEventListener('change', function () {
      state.district = this.value;
      APP.render();
    });

    // 风险态势卡 → 风险预警中心
    var riskJump = U.$('.risk-jump');
    if (riskJump) riskJump.addEventListener('click', function () {
      if (window.APP.navigate) window.APP.navigate('risk');
      else { state.page = 'risk'; APP.render(); }
    });

    // 趋势 Tab 切换
    U.$$('.trend-tab').forEach(function (t) {
      t.addEventListener('click', function () {
        state.filter.dashboard.trendTab = t.dataset.tab;
        APP.render();
      });
    });

    // 导出报表：汇总当前统计口径（全市/区县）下的驾驶舱关键指标
    var dashExportBtn = U.$('#dashExportBtn');
    if (dashExportBtn) {
      dashExportBtn.addEventListener('click', function () {
        var rows = [
          ['统计口径', districtLabel, '全市=庆阳市全部口径；区县=该县区视角'],
          ['企业总数', totalEnts, '家'],
          ['重点招商企业', keyEnts, '家 · 含重点招商企业标签'],
          ['本月新增企业', newEnts, '家 · 签约/落地 ≤30 天'],
          ['本年度新增企业', newYearCnt, '家 · 年内招商签约口径'],
          ['风险企业（红/橙）', riskEnts, '家 · 综合风险指数为重大/较高'],
          ['总营收', revenueStr, '由企业库实时聚合'],
          ['纳税总额', taxStr, '由企业库实时聚合'],
          ['固定资产投资', investStr, '由企业库实时聚合'],
          ['带动就业', employ, '人'],
          ['亩均税收', muTax.toFixed(2), '万元/亩'],
          ['待处置风险事件', tPending, '条'],
          ['处置中风险事件', tDoing, '条'],
          ['已处置风险事件', tDone, '条'],
          ['风险闭环率', closeRate, '%'],
          ['政策年度安排', (redeem.planWan / 10000).toFixed(2), '亿元'],
          ['政策年内已兑现', (redeem.redeemedWan / 10000).toFixed(2), '亿元'],
          ['政策兑现率', redeem.rate, '%'],
          ['惠企企业', redeem.entsHelped, '家'],
        ];
        C.exportCSV('驾驶舱运行报表_' + districtLabel.replace(/[（(]/g, '').replace(/[)）]/g, '') + '_' + U.fmtDate(new Date()), ['指标', '数值', '口径'], rows);
        C.toast('已导出 ' + rows.length + ' 项驾驶舱指标', 'success');
      });
    }

    // 重大项目 TOP5 点击 → 项目库（自动筛选 + 高亮定位 + 滚动清单到顶，与全局搜索行为一致）
    U.$$('.tp-item').forEach(function (item) {
      item.addEventListener('click', function () {
        var pid = item.dataset.id;
        var p = M.PROJECTS.filter(function (x) { return x.id === pid; })[0];
        if (!p) return;
        // 用项目全名作为关键词，确保精确筛出这一个；清除其他筛选条件
        var fp = state.filter.project;
        fp.keyword = p.name;
        fp.stage = '';
        fp.district = 'all';
        fp.owner = '';
        fp.page = 1;
        state.highlightProjectId = pid; // 复用高亮 + 滚动清单到顶的机制
        state.page = 'project';
        APP.render();
      });
    });

    // KPI 点击下钻 → 企业档案
    U.$$('.kpi').forEach(function (k) {
      k.addEventListener('click', function () {
        var key = k.dataset.kpi;
        if (key === 'riskEnterprises') {
          state.filter.enterprise.risk = 'orange';
        } else {
          state.filter.enterprise.risk = '';
        }
        state.filter.enterprise.district = state.district;
        state.page = 'enterprise';
        APP.render();
      });
    });
  }

  // 生成近 6 个月趋势
  function buildTrendData(revNow, taxNow, empNow, mom) {
    var revenue = [];
    var tax = [];
    var employ = [];
    var gRev = mom.revenue / 100;
    var gTax = mom.tax / 100;
    var gEmp = mom.employment / 100;
    for (var i = 5; i >= 0; i--) {
      revenue.push(+(revNow / Math.pow(1 + gRev, i / 5)).toFixed(1));
      tax.push(+(taxNow / Math.pow(1 + gTax, i / 5)).toFixed(2));
      employ.push(Math.round((empNow / Math.pow(1 + gEmp, i / 5)) / 100));
    }
    return { revenue: revenue, tax: tax, employ: employ };
  }

  // 生成 AI 今日摘要
  function buildAiSummary(ents, label) {
    var n = ents.length;
    if (n === 0) return ['当前选区暂无企业数据。'];
    var topEnt = ents.slice().sort(function(a,b){return b.overview.revenueWan-a.overview.revenueWan;})[0];
    var reds = ents.filter(function(e){return e.riskLevel==='red';}).length;
    var oranges = ents.filter(function(e){return e.riskLevel==='orange';}).length;
    var newThisMonth = ents.filter(function(e){return e.signDaysAgo <= 30;}).length;
    var avgPerform = Math.round(ents.reduce(function(s,e){return s + e.status.performRate;},0) / n);
    var topIndustry = Object.entries(
      ents.reduce(function(m,e){m[e.industryName]=(m[e.industryName]||0)+1;return m;}, {})
    ).sort(function(a,b){return b[1]-a[1];})[0];
    var keyCount = ents.filter(function(e){return e.tags && e.tags.indexOf('重点招商企业')>=0;}).length;

    return [
      label + '共有企业 ' + n + ' 家，其中重点招商企业 ' + keyCount + ' 家，本月新增 ' + newThisMonth + ' 家，整体运行平稳。',
      '营收龙头：' + topEnt.name + '（' + topEnt.overview.revenue + '），' + (topIndustry?topIndustry[0]:'-') + '产业占比最高。',
      '风险预警：重大风险 ' + reds + ' 家、较高风险 ' + oranges + ' 家，风险总体可控，建议重点关注红橙级企业。',
      '招商履约：平均履约率 ' + avgPerform + '%，多数企业按计划推进投资建设。',
      '提示：建议加强对' + (oranges>reds?'较高风险企业':'重大风险企业') + '的日常监测，提前研判，主动处置。'
    ];
  }

  APP.registerRenderer('dashboard', renderDashboard);
})();
