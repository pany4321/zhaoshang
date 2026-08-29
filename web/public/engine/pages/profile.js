/* ============================================================
 * 页面：企业 360° 全景画像
 * ============================================================ */
(function () {
  'use strict';
  var U = APP.U;
  var state = APP.state;
  var C = APP.Components;
  var M = window.MOCK;
  var mkChart = APP.mkChart;

  var currentTab = 0;
  var kwState = { active: false, pos: null };
  var listScrollTop = 0;
  var internalSwitch = false; // 标记：当前是否为画像页内点击切换企业
  var aiAssess = {};      // AI 风险评估结果（entId → 结果，会话内有效，刷新还原）
  var assessTimers = [];  // 研判过程定时器

  function renderProfile() {
    // 一键演示：允许指定初始页签（如 AI 综合研判，index 5）；只应用一次，避免影响后续手动交互
    if (typeof state.demoTab === 'number' && state.demoTab > 0) {
      currentTab = state.demoTab;
      delete state.demoTab;
    }
    var f = state.filter.profile;

    // 左侧列表（筛选）
    var ents = M.ENTERPRISES.filter(function (e) {
      if (f.keyword && e.name.indexOf(f.keyword) < 0) return false;
      if (f.risk && e.riskLevel !== f.risk) return false;
      if (f.industry && e.industry !== f.industry) return false;
      return true;
    });
    // 排序
    ents.sort(function (a, b) { return b.riskScore - a.riskScore; });

    // 行业筛选选项
    var indOpts = '<option value="">全部行业</option>' +
      M.INDUSTRIES.map(function (i) { return '<option value="' + i.key + '"' + (f.industry === i.key ? ' selected' : '') + '>' + U.esc(i.name) + '</option>'; }).join('');

    // 风险等级筛选选项
    var riskOpts = '<option value="">全部风险</option>' +
      [['red','重大风险'],['orange','较高风险'],['yellow','一般风险'],['blue','关注风险']].map(function (r) {
        return '<option value="' + r[0] + '"' + (f.risk === r[0] ? ' selected' : '') + '>' + r[1] + '</option>';
      }).join('');

    var listHtml = ents.map(function (e) {
      return '<div class="ent-item ' + (e.id === state.ent ? 'active' : '') + '" data-id="' + e.id + '">' +
        '<div class="ei-name">' + U.esc(e.name) + '</div>' +
        '<div class="ei-meta"><span>' + U.esc(e.scale) + '</span>' + C.lvlBadge(e.riskLevel) + '</div>' +
        '<div class="ei-tags">' + e.tags.slice(0,2).map(function (t) {
          return '<span class="tag primary" style="font-size:10px;padding:1px 5px;">' + U.esc(t) + '</span>';
        }).join('') + '</div>' +
      '</div>';
    }).join('');

    var leftHtml =
      '<div class="profile-list">' +
        '<div class="search-box">' +
          '<input type="text" id="entSearch" placeholder="搜索企业名称..." value="' + U.esc(f.keyword) + '"/>' +
        '</div>' +
        '<div class="profile-side-filter">' +
          '<div style="display:flex;gap:8px;">' +
            '<select class="f-select" id="profileIndFilter" style="flex:1;min-width:0;">' + indOpts + '</select>' +
            '<select class="f-select" id="profileRiskFilter" style="flex:1;min-width:0;">' + riskOpts + '</select>' +
          '</div>' +
        '</div>' +
        '<div class="list">' + (listHtml || '<div style="padding:20px;text-align:center;color:#94A3B8;font-size:13px;">暂无匹配企业</div>') + '</div>' +
        '<div class="muted" style="text-align:center;font-size:11px;margin-top:6px;">共 ' + ents.length + ' 家企业</div>' +
      '</div>';

    // 右侧详情
    var e = M.entById(state.ent) || M.ENTERPRISES[0];
    if (!ents.find(function(x){return x.id===e.id;})) {
      // 当前筛选下企业不在列表里，切第一个
      state.ent = ents[0] ? ents[0].id : (M.ENTERPRISES[0] && M.ENTERPRISES[0].id);
      e = M.entById(state.ent) || M.ENTERPRISES[0];
    }

    var rightHtml = renderDetail(e);

    U.$('#content').innerHTML =
      '<div class="profile-page">' +
        '<div class="profile-wrap">' + leftHtml + '<div class="profile-detail">' + rightHtml + '</div></div>' +
      '</div>';

    // 绑定列表事件
    var listEl = document.querySelector('.profile-list .list');
    U.$$('.ent-item').forEach(function (el) {
      el.addEventListener('click', function () {
        if (listEl) listScrollTop = listEl.scrollTop;
        kwState.active = false;
        internalSwitch = true;
        state.ent = el.dataset.id;
        currentTab = 0;
        renderProfile();
      });
    });
    // 恢复列表滚动位置
    if (listEl) {
      if (internalSwitch && listScrollTop) {
        listEl.scrollTop = listScrollTop;
      } else {
        // 外部进入：滚动左侧列表使选中企业可见并居中
        var activeItem = listEl.querySelector('.ent-item.active');
        if (activeItem) {
          var itemRect = activeItem.getBoundingClientRect();
          var listRect = listEl.getBoundingClientRect();
          var offsetInList = itemRect.top - listRect.top + listEl.scrollTop;
          var target = offsetInList - listEl.clientHeight / 2 + activeItem.offsetHeight / 2;
          listEl.scrollTop = Math.max(0, target);
        }
      }
    }
    var si = U.$('#entSearch');
    if (si) {
      // IME 输入保护：中文组词期间不触发筛选
      si.addEventListener('compositionstart', function () { this._composing = true; });
      si.addEventListener('compositionend', function () {
        this._composing = false;
        kwState.active = true;
        kwState.pos = this.selectionStart;
        f.keyword = this.value;
        renderProfile();
      });
      si.addEventListener('input', function () {
        if (this._composing) return;
        kwState.active = true;
        kwState.pos = this.selectionStart;
        var self = this;
        clearTimeout(this._t);
        this._t = setTimeout(function () { f.keyword = self.value; renderProfile(); }, 150);
      });
    }
    var pif = U.$('#profileIndFilter');
    if (pif) pif.addEventListener('change', function () {
      kwState.active = false;
      f.industry = this.value;
      renderProfile();
    });
    var prf = U.$('#profileRiskFilter');
    if (prf) prf.addEventListener('change', function () {
      kwState.active = false;
      f.risk = this.value;
      renderProfile();
    });

    // AI 政策匹配 → 点击跳转到政策页并打开详情
    U.$$('.policy-item[data-policy-id]').forEach(function (el) {
      el.style.cursor = 'pointer';
      el.addEventListener('click', function () {
        state.policyId = el.dataset.policyId;
        state.policyLocateOnly = false; // 画像页下钻：直接打开政策详情抽屉（非仅高亮定位）
        // 前后端分离版：经宿主任由 Vue Router 切页（APP.navigate）；
        // 纯前端版无 navigate，回退为直接切页重渲染。
        if (APP.navigate) APP.navigate('policy');
        else { state.page = 'policy'; APP.render(); }
      });
    });

    // 详情 Tab
    U.$$('.six-layer-tabs .tab').forEach(function (t) {
      t.addEventListener('click', function () {
        var idx = parseInt(t.dataset.tab);
        currentTab = idx;
        U.$$('.six-layer-tabs .tab').forEach(function (x) { x.classList.remove('active'); });
        t.classList.add('active');
        U.$$('.tab-pane').forEach(function (p) {
          p.style.display = parseInt(p.dataset.pane) === idx ? '' : 'none';
        });
        if (idx === 2) { setTimeout(renderTrendChart, 50); }
      });
    });
    // 设置当前 tab
    var tabs = U.$$('.six-layer-tabs .tab');
    if (tabs[currentTab]) {
      tabs[currentTab].click();
    }

    // 搜索框焦点与光标恢复（输入过程中重渲染不打断）
    if (kwState.active) {
      var kwEl = U.$('#entSearch');
      if (kwEl && kwEl.value === f.keyword) {
        try { kwEl.focus(); kwEl.setSelectionRange(kwState.pos, kwState.pos); } catch (e) {}
      }
    }

    // 滚动控制：完全由画像页自行处理，在全局滚动恢复之后再设最终位置
    var contentEl = U.$('#content');
    if (contentEl) {
      // 延迟两次 setTimeout，确保在 render() 全局 samePage 恢复之后执行
      setTimeout(function () {
        setTimeout(function () {
          var headerEl = document.querySelector('.profile-detail .ent-header');
          var listEl = document.querySelector('.profile-wrap .profile-list');
          if (!headerEl || !listEl) return;
          // 用 getBoundingClientRect 计算两者相对视口的位置差
          var headerRect = headerEl.getBoundingClientRect();
          var listRect = listEl.getBoundingClientRect();
          var diff = headerRect.top - listRect.top;
          if (diff !== 0) {
            contentEl.scrollTop += diff;
          }
        }, 0);
      }, 0);
    }
    internalSwitch = false;
  }

  function renderDetail(e) {
    if (!e) return '';
    var score = e.riskScore;
    var level = e.riskLevel;

    // 标签
    var tabsHtml = ['概况','经营状态','经营趋势','关系网络','企业风险','AI综合研判'].map(function (t, i) {
      return '<div class="tab ' + (i === currentTab ? 'active' : '') + '" data-tab="' + i + '">' + t + '</div>';
    }).join('');

    // 招商承诺表
    var commitHtml = e.commitments.map(function (c) {
      var rate = c.promise > 0 ? Math.round(c.actual / c.promise * 100) : 0;
      var barColor = rate >= 90 ? 'var(--c-green)' : (rate >= 70 ? 'var(--c-orange)' : 'var(--c-red)');
      return '<tr><td>' + U.esc(c.name) + '</td>' +
        '<td class="num">' + U.esc(c.promise.toLocaleString()) + ' ' + U.esc(c.unit) + '</td>' +
        '<td class="num">' + U.esc(c.actual.toLocaleString()) + ' ' + U.esc(c.unit) + '</td>' +
        '<td><div class="progress"><div class="bar" style="width:' + rate + '%;background:' + barColor + '"></div></div></td>' +
        '<td class="num" style="font-weight:600;">' + rate + '%</td></tr>';
    }).join('');

    // 动态时间轴
    var dynHtml = (e.dynamics || []).map(function (d) {
      return '<div class="tl-item"><div class="tl-date">' + U.esc(d.date) + '</div>' +
        '<span class="tl-type">' + U.esc(d.type) + '</span>' +
        '<span class="tl-text">' + U.esc(d.text) + '</span></div>';
    }).join('');

    // 股东
    var shHtml = (e.shareholders || []).map(function (s) {
      return '<tr><td>' + U.esc(s.name) + '</td><td class="num" style="width:100px;">' + s.ratio + '%</td>' +
        '<td><div class="progress"><div class="bar" style="width:' + s.ratio + '%;"></div></div></td></tr>';
    }).join('');

    // 政策匹配
    var policyHtml = (e.policies || []).slice(0, 6).map(function (pname) {
      var item = M.POLICY_LIB.filter(function (pl) { return pl.name === pname; })[0];
      if (!item) {
        // 政策库无同名政策：按名称降级为可点击项（政策页筛选与详情均兼容按名称查找），并告警便于暴露数据错位
        console.warn('[profile] 企业「' + e.name + '」的匹配政策「' + pname + '」未命中政策库，已按名称降级为可点击项');
        return '<div class="policy-item" data-policy-id="' + U.esc(pname) + '">' +
          '<div class="pi-name">' + U.esc(pname) + '</div>' +
          '<div class="pi-link">查看政策详情 →</div>' +
        '</div>';
      }
      return '<div class="policy-item" data-policy-id="' + (item.code || item.id) + '">' +
        '<div class="pi-name">' + U.esc(item.name) + '</div>' +
        '<div class="pi-meta"><span>' + U.esc(item.dept) + '</span><span>' + U.esc(item.level) + '</span></div>' +
        '<div class="pi-desc">' + U.esc(item.apply) + '</div>' +
        '<div class="pi-link">查看政策详情 →</div>' +
      '</div>';
    }).join('');

    // AI 综合研判页签（研判面板 + 操作按钮）
    var aiHtml = judgePaneHtml(e);

    // ===== 企业头部：基本信息网格 =====
    function eiRow(label, value, cls) {
      // cls: 'full' 跨整行 / 'wide' 跨 2 列 / 空=默认 1 列
      return '<div class="ei-row' + (cls ? ' ' + cls : '') + '">' +
        '<span class="ei-label">' + U.esc(label) + '</span>' +
        '<span class="ei-value" title="' + U.esc(value || '-') + '">' + U.esc(value || '-') + '</span>' +
      '</div>';
    }
    var infoGrid =
      '<div class="ent-info-grid">' +
        eiRow('统一社会信用代码', e.creditCode, 'wide') +
        eiRow('法定代表人', e.legal) +
        eiRow('成立时间', e.found) +
        eiRow('注册资本', e.overview.regCapital) +
        eiRow('企业规模', e.scale) +
        eiRow('所属行业', e.industryName, 'wide') +
        eiRow('经营状态', e.status.biz) +
        eiRow('注册地址', e.address, 'wide') +
      '</div>';
    var tagsHtml = (e.tags || []).map(function (t) {
      return '<span class="tag primary">' + U.esc(t) + '</span>';
    }).join('');

    // 概况 Tab 的 KPI
    var kpi4 = function(label, val, color) {
      return '<div style="padding:12px;background:#F8FAFC;border-radius:4px;text-align:center;">' +
        '<div style="font-size:11px;color:#94A3B8;margin-bottom:4px;">' + U.esc(label) + '</div>' +
        '<div style="font-size:20px;font-weight:700;' + (color ? 'color:' + color + ';' : 'color:#0F172A;') + '">' + U.esc(val) + '</div></div>';
    };
    var perfColor = e.status.performRate >= 90 ? '#22C55E' : (e.status.performRate >= 70 ? '#F97316' : '#e03131');

    return (
      // 企业头部（画像页聚焦单个企业；全市口径统计条已移至企业概况页顶部展示）
      '<div class="ent-header">' +
        '<div class="ent-logo">' + U.esc(e.name.charAt(0)) + '</div>' +
        '<div class="ent-main">' +
          '<div class="ent-name">' + U.esc(e.name) + '</div>' +
          infoGrid +
          '<div class="ent-tags">' + tagsHtml + '</div>' +
        '</div>' +
        '<div class="ent-side">' +
          '<div class="risk-label">综合风险指数</div>' +
          '<div class="risk-score" style="color:' + M.LEVELS[level].color + '">' + score + '</div>' +
          '<div style="margin-bottom:8px;">' + C.lvlBadge(level) + '</div>' +
          '<button class="btn sm" onclick="APP.openTaskForm({entId:\'' + e.id + '\', type:\'企业服务\', title:\'企业走访服务：' + U.esc(e.name) + '\'})">＋ 企业服务</button>' +
        '</div>' +
      '</div>' +

      // 六层 Tab
      '<div class="card mt"><div class="six-layer-tabs tabs">' + tabsHtml + '</div>' +
        '<div id="profileTabContent">' +
          // 0 概况
          '<div class="tab-pane" data-pane="0">' +
            '<div class="row" style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px;">' +
              kpi4('总营收', e.overview.revenue) +
              kpi4('纳税', e.overview.tax) +
              kpi4('员工数', e.overview.employees.toLocaleString() + '人') +
              kpi4('履约率', e.status.performRate + '%', perfColor) +
            '</div>' +
            '<div style="font-weight:600;color:#0F172A;margin-bottom:8px;font-size:14px;">招商承诺完成情况</div>' +
            '<table class="tbl"><thead><tr><th>指标</th><th class="num">承诺</th><th class="num">实际</th><th style="width:200px">进度</th><th class="num">完成率</th></tr></thead><tbody>' + commitHtml + '</tbody></table>' +
          '</div>' +
          // 1 经营状态
          '<div class="tab-pane" data-pane="1" style="display:none;">' +
            '<div class="row" style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px;">' +
              '<div style="padding:12px;background:#F8FAFC;border-radius:4px;"><div style="font-size:11px;color:#94A3B8;margin-bottom:4px;">经营状态</div>' +
                '<div style="font-size:16px;font-weight:600;color:' + (e.status.biz==='正常'?'#22C55E':(e.status.biz==='关注'?'#F97316':'#e03131')) + ';">' + U.esc(e.status.biz) + '</div></div>' +
              '<div style="padding:12px;background:#F8FAFC;border-radius:4px;"><div style="font-size:11px;color:#94A3B8;margin-bottom:4px;">信用状态</div>' +
                '<div style="font-size:16px;font-weight:600;color:' + (e.status.credit==='正常'?'#22C55E':(e.status.credit==='关注'?'#F97316':'#e03131')) + ';">' + U.esc(e.status.credit) + '</div></div>' +
              '<div style="padding:12px;background:#F8FAFC;border-radius:4px;"><div style="font-size:11px;color:#94A3B8;margin-bottom:4px;">企业规模</div>' +
                '<div style="font-size:16px;font-weight:600;color:#0F172A;">' + U.esc(e.scale) + '</div></div>' +
            '</div>' +
            '<div style="font-weight:600;color:#0F172A;margin-bottom:8px;font-size:14px;">企业动态时间轴</div>' +
            '<div class="timeline">' + dynHtml + '</div>' +
          '</div>' +
          // 2 经营趋势
          '<div class="tab-pane" data-pane="2" style="display:none;">' +
            '<div id="c_profile_trend" class="chart" style="height:320px"></div>' +
          '</div>' +
          // 3 关系网络
          '<div class="tab-pane" data-pane="3" style="display:none;">' +
            '<div style="font-weight:600;color:#0F172A;margin-bottom:8px;font-size:14px;">股东结构</div>' +
            '<table class="tbl"><thead><tr><th>股东名称</th><th class="num" style="width:100px;">持股比例</th><th style="width:200px">比例</th></tr></thead><tbody>' + shHtml + '</tbody></table>' +
            '<div style="margin-top:16px;font-size:12px;color:#94A3B8;">完整关系网络请查看「产业关系图谱」模块。</div>' +
          '</div>' +
          // 4 企业风险
          '<div class="tab-pane" data-pane="4" style="display:none;">' + riskPaneHtml(e) + '</div>' +
          // 5 AI 研判
          '<div class="tab-pane" data-pane="5" style="display:none;">' + aiHtml + '</div>' +
        '</div>' +
      '</div>' +

      // 政策匹配
      '<div class="card mt">' +
        '<div class="card-title">AI 政策智能匹配 <span style="font-size:12px;font-weight:400;color:#94A3B8;">基于企业画像自动匹配 ' + (e.policies || []).length + ' 项政策</span></div>' +
        '<div class="policy-list">' + policyHtml + '</div>' +
      '</div>'
    );
  }

  // ===== 企业风险 Tab：维度矩阵 + AI 风险评估 =====
  function dimColor(v) {
    return v >= 65 ? '#e03131' : (v >= 45 ? '#F97316' : (v >= 25 ? '#f1b400' : '#1c7ed6'));
  }
  function scoreDeltaHtml(d) {
    if (d === 0) return '<span style="color:#94A3B8">持平</span>';
    return d > 0
      ? '<span style="color:#e03131">↑' + d + '</span>'
      : '<span style="color:#22C55E">↓' + (-d) + '</span>';
  }

  // 页签内容：AI 评估状态区 + 维度矩阵（评估后含档案值对比）+ AI 报告 + 操作按钮
  function riskPaneHtml(e) {
    var as = aiAssess[e.id];
    var matrixHtml = M.RISK_DIMS.filter(function (d) { return d.weight > 0; }).map(function (d) {
      var vOld = e.risks[d.key] || 0;
      var v = as ? as.dims[d.key] : vOld;
      var color = dimColor(v);
      var diffTag = '';
      if (as) {
        var dv = v - vOld;
        diffTag = dv === 0
          ? ' <span style="font-size:10px;color:#94A3B8;font-weight:400;">持平</span>'
          : (dv > 0
              ? ' <span style="font-size:10px;color:#e03131;font-weight:600;">↑' + dv + '</span>'
              : ' <span style="font-size:10px;color:#22C55E;font-weight:600;">↓' + (-dv) + '</span>');
      }
      return '<div class="risk-dim">' +
        '<div class="dim-name">' + U.esc(d.name) +
          ' <span style="font-size:10px;color:#94A3B8;font-weight:400;">权重' + Math.round(d.weight * 100) + '%</span>' +
          (as ? '<span style="font-size:10px;color:#94A3B8;font-weight:400;">　档案值 ' + vOld + '</span>' : '') +
        '</div>' +
        '<div class="dim-score" style="color:' + color + '">' + v + diffTag + '</div>' +
        '<div class="dim-bar"><div class="dim-bar-inner" style="width:' + v + '%;background:' + color + '"></div></div>' +
      '</div>';
    }).join('');

    // 评估完成后仅更新矩阵数据（差异标注），不在卡片内展示报告——报告只在弹窗中呈现
    return '<div class="risk-matrix">' + matrixHtml + '</div>' +
      '<div class="mt" style="display:flex;justify-content:flex-end;gap:8px;">' +
        '<button class="btn sm primary" id="aiRiskBtn" onclick="APP.runProfileRiskAssess()">✦ AI风险评估</button>' +
        '<button class="btn sm primary" onclick="APP.goRisk({keyword:\'' + U.esc(e.name) + '\',entId:\'' + e.id + '\'})">查看风险事件 →</button>' +
      '</div>';
  }

  // AI 风险评估：模拟智能体多步研判，完成后刷新页签数据
  var ASSESS_STEPS = [
    '汇聚企业经营、财务、司法、信用等多维数据',
    '比对行业基准、区域水平与企业历史趋势',
    'AI 模型推理，生成风险评估结论'
  ];
  var ADVICE_MAP = {
    operation: '建议近期开展实地走访，核实生产经营真实状况。',
    finance: '建议调取最新财务报表，重点核查现金流与负债结构。',
    judicial: '建议跟踪司法案件进展，评估涉诉事项的连锁影响。',
    credit: '建议核查合同履约与对外担保情况，防范信用传导风险。',
    tender: '建议关注招投标参与行为，防范失信投标风险。',
    tax: '建议比对纳税申报与经营数据，确认税负波动原因。',
    perform: '建议对照投资协议逐项核对履约进度，必要时启动约谈。',
    ip: '建议关注核心知识产权权属与纠纷情况，保护创新资产。'
  };

  function clearAssessTimers() {
    assessTimers.forEach(function (t) { clearTimeout(t); });
    assessTimers = [];
  }
  function assessLater(fn, ms) { assessTimers.push(setTimeout(fn, ms)); }

  // 基于档案值小幅波动生成新一轮评估结果（模拟智能体实时检出）
  function buildAssessResult(e) {
    var rng = U.makeRng((Date.now() % 2147483647) ^ e.id.charCodeAt(e.id.length - 1));
    var dims = {};
    M.RISK_DIMS.forEach(function (d) {
      if (d.weight <= 0) return;
      var oldV = e.risks[d.key] || 0;
      var nv = oldV;
      var tries = 0;
      while (nv === oldV && tries < 6) { nv = oldV + U.randInt(rng, -8, 8); tries++; }
      dims[d.key] = Math.max(3, Math.min(96, nv));
    });
    var merged = {};
    M.RISK_DIMS.forEach(function (d) { if (d.weight > 0) merged[d.key] = dims[d.key]; });
    var score = M.calcRiskScore(merged);
    var level = M.scoreToLevel(score);

    var rows = M.RISK_DIMS.filter(function (d) { return d.weight > 0; }).map(function (d) {
      return { key: d.key, name: d.name, v: dims[d.key], old: e.risks[d.key] || 0 };
    });
    var topScored = rows.slice().sort(function (a, b) { return b.v - a.v; })[0];
    var second = rows.filter(function (r) { return r !== topScored; })
      .sort(function (a, b) { return b.v - a.v; })[0];
    var mostChanged = rows.slice().sort(function (a, b) {
      return Math.abs(b.v - b.old) - Math.abs(a.v - a.old);
    })[0];

    function lvlWord(v) {
      return v >= 65 ? '处于高位，需重点管控'
        : (v >= 45 ? '偏高，需持续关注' : (v >= 25 ? '总体可控' : '处于低位'));
    }
    var summary = 'AI 基于该企业多维数据完成本轮风险评估：综合指数由档案值 ' + e.riskScore +
      ' 更新为 ' + score + '（' + M.LEVELS[level].name + '），其中「' + mostChanged.name +
      '」维度变化最显著（' + mostChanged.old + ' → ' + mostChanged.v + '），其余维度波动平稳。以下为主要风险点与处置建议，供分级分类监管参考。';

    var adviceKeys = [topScored.key];
    if (mostChanged.key !== topScored.key) adviceKeys.push(mostChanged.key);
    var advice = adviceKeys.map(function (k) { return ADVICE_MAP[k]; });
    advice.push('建议将本轮评估结果纳入企业分级分类监管参考，动态调整巡查频次。');

    return {
      dims: dims,
      score: score,
      level: level,
      confidence: U.randInt(rng, 86, 95),
      time: U.fmtDateTime(new Date()),
      summary: summary,
      topRisks: [
        topScored.name + '得分 ' + topScored.v + '（档案值 ' + topScored.old + '），' + lvlWord(topScored.v) + '。',
        second.name + '得分次之（' + second.v + '），' + lvlWord(second.v) + '。'
      ],
      advice: advice
    };
  }

  // AI 风险评估：弹出对话框模拟智能体多步研判，完成后自动刷新页签数据；用户主动关闭，视图位置不变
  APP.runProfileRiskAssess = function () {
    var e = M.entById(state.ent);
    if (!e) return;
    clearAssessTimers();

    var eid = e.id;
    var closed = false;

    // 先算好结果，过程日志可引用最终数值（模拟“推理已完成、正在回放过程”）
    var R = buildAssessResult(e);

    // ---- 对话框骨架（复用确认弹窗样式）----
    var mask = U.el('div', { class: 'modal-mask' });
    mask.style.zIndex = 10000;
    var box = U.el('div', { class: 'modal' });
    box.style.width = '640px';
    box.style.maxWidth = '94vw';
    box.innerHTML =
      '<div class="modal-header" style="display:flex;align-items:center;gap:10px;">' +
        '<span style="flex:1;">✦ AI 风险评估 · ' + U.esc(e.name) + '</span>' +
        '<span id="aiAsmElapsed" style="font-size:11px;font-weight:400;color:#64748B;background:#F1F5F9;border-radius:10px;padding:2px 10px;">准备中…</span>' +
        '<span id="aiAsmClose" style="cursor:pointer;font-size:20px;line-height:1;color:#94A3B8;font-weight:400;padding:0 2px;">×</span>' +
      '</div>' +
      '<div class="modal-body" id="aiAsmBody"></div>';
    mask.appendChild(box);
    document.body.appendChild(mask);

    function close() {
      if (closed) return;
      closed = true;
      clearAssessTimers();
      if (elapsedTimer) { clearInterval(elapsedTimer); elapsedTimer = null; }
      if (mask.parentNode) mask.parentNode.removeChild(mask);
      document.removeEventListener('keydown', onKey);
    }
    function onKey(ev) { if (ev.key === 'Escape') close(); }
    function onMaskClick(ev) { if (ev.target === mask) close(); }

    document.addEventListener('keydown', onKey);
    mask.addEventListener('click', onMaskClick);
    box.querySelector('#aiAsmClose').addEventListener('click', close);

    var bodyEl = box.querySelector('#aiAsmBody');
    // 一开始就固定对话框高度：评估过程与报告阶段尺寸稳定，内容在内部滚动
    bodyEl.style.height = '48vh';
    bodyEl.style.minHeight = '380px';
    var TOTAL_MS = 8600;

    // 三步清单：逐步点亮
    function stepsHtml(runIdx) {
      return '<div style="display:flex;flex-direction:column;gap:12px;padding:2px 2px 12px;">' +
        ASSESS_STEPS.map(function (txt, i) {
          var ico, color, state;
          if (i < runIdx) {
            ico = '<span style="color:#22C55E;font-weight:700;">✓</span>';
            color = '#334155'; state = '<span style="font-size:11px;color:#22C55E;">完成</span>';
          } else if (i === runIdx) {
            ico = '<span style="display:inline-flex;gap:3px;"><i class="t-dot"></i><i class="t-dot"></i><i class="t-dot"></i></span>';
            color = '#1D4ED8'; state = '<span style="font-size:11px;color:#1D4ED8;">进行中</span>';
          } else {
            ico = '<span style="color:#CBD5E1;">○</span>';
            color = '#94A3B8'; state = '<span style="font-size:11px;color:#CBD5E1;">等待</span>';
          }
          return '<div style="display:flex;align-items:center;gap:10px;font-size:13px;color:' + color + ';">' +
            '<span style="width:36px;text-align:center;flex-shrink:0;">' + ico + '</span>' +
            '<span style="flex:1;">第 ' + (i + 1) + ' 步 · ' + U.esc(txt) + '</span>' + state +
          '</div>';
        }).join('') +
      '</div>';
    }

    // 过程日志区
    bodyEl.innerHTML = '<div id="aiAsmSteps">' + stepsHtml(0) + '</div>' +
      '<div id="aiAsmLog" style="max-height:190px;overflow-y:auto;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:10px 14px;font-size:12px;line-height:2;"></div>';

    var logEl = box.querySelector('#aiAsmLog');
    // 分析阶段：日志区撑满固定高度（控制台观感），出报告时恢复普通布局
    bodyEl.style.display = 'flex';
    bodyEl.style.flexDirection = 'column';
    box.querySelector('#aiAsmSteps').style.flexShrink = '0';
    logEl.style.flex = '1';
    logEl.style.maxHeight = 'none';
    function endAnalysisLayout() {
      bodyEl.style.display = '';
    }
    function log(text, color, bold) {
      var line = U.el('div', {
        style: 'color:' + (color || '#475569') + ';' + (bold ? 'font-weight:600;' : ''),
        html: U.esc(text),
      });
      line.style.animation = 'msgIn .25s ease';
      logEl.appendChild(line);
      logEl.scrollTop = logEl.scrollHeight;
    }
    function dimWord(v) {
      return v >= 65 ? '触及重大风险线' : (v >= 45 ? '高于较高风险线' : (v >= 25 ? '处于常规区间' : '处于低位'));
    }

    // 用时/进度指示
    var elapsedTimer = null;
    var startAt = Date.now();
    elapsedTimer = setInterval(function () {
      var el = box.querySelector('#aiAsmElapsed');
      if (!el || closed) return;
      var t = Date.now() - startAt;
      var pct = Math.min(99, Math.round(t / TOTAL_MS * 100));
      el.textContent = '已用时 ' + (t / 1000).toFixed(1) + ' 秒 · ' + pct + '%';
    }, 100);

    function alive() {
      return !closed && state.ent === eid && !!M.entById(state.ent);
    }

    // ---- 过程时间轴：日志逐条流出，步骤随之推进（总计约 8.6 秒）----
    var topRows = M.RISK_DIMS.filter(function (d) { return d.weight > 0; })
      .map(function (d) { return { name: d.name, v: e.risks[d.key] || 0 }; })
      .sort(function (a, b) { return b.v - a.v; });

    var plan = [
      [100,  function () { log('初始化评估任务，锁定企业：「' + e.name + '」', '#1D4ED8', true); }],
      [550,  function () { log('✓ 工商登记 · 统一社会信用代码 ' + e.creditCode); }],
      [1050, function () { log('✓ 经营数据 · 年营收 ' + e.overview.revenue + '，纳税 ' + e.overview.tax); }],
      [1550, function () { log('✓ 司法与信用 · 信用状态「' + e.status.credit + '」'); }],
      [2050, function () { log('✓ 招投标记录、知识产权登记核验完成'); }],
      [2500, function () { log('✓ 数据汇聚完成：8 维风险指标就绪', '#22C55E', true); }],
      [2700, function () { refreshSteps(1); log('开始比对行业基准、区域水平与历史趋势…', '#1D4ED8', true); }],
      [3150, function () { log('✓ 行业基准：' + e.industryName); }],
      [3600, function () { log('✓ 区域水平：' + e.districtName); }],
      [4050, function () { log('· ' + topRows[0].name + ' ' + topRows[0].v + ' 分，' + dimWord(topRows[0].v)); }],
      [4500, function () { log('· ' + topRows[1].name + ' ' + topRows[1].v + ' 分，' + dimWord(topRows[1].v)); }],
      [4950, function () { log('✓ 历史对比：' + (e.ai && e.ai.prevScore != null ? ('上次研判 ' + e.ai.prevScore + ' 分') : '首次深度评估')); }],
      [5400, function () { log('✓ 比对完成', '#22C55E', true); }],
      [5500, function () { refreshSteps(2); log('启动风险研判模型（8 维加权 + 行业修正）…', '#1D4ED8', true); }],
      [6150, function () { log('· 特征融合：企业指标 × 区域水平 × 历史轨迹'); }],
      [6900, function () { log('· 推理完成 → 综合指数 ' + R.score + '（' + M.LEVELS[R.level].name + '）', '#B45309', true); }],
      [7450, function () { log('· 生成主要风险点与处置建议…'); }],
      [8100, function () { log('✓ 评估完成', '#22C55E', true); }],
      [TOTAL_MS, function () { finish(); }]
    ];
    plan.forEach(function (item) {
      assessLater(function () { if (alive()) item[1](); }, item[0]);
    });

    function refreshSteps(runIdx) {
      var slot = box.querySelector('#aiAsmSteps');
      if (slot) slot.innerHTML = stepsHtml(runIdx);
    }

    function finish() {
      if (!alive()) return;
      aiAssess[eid] = R;

      // 停止用时指示并定格
      if (elapsedTimer) { clearInterval(elapsedTimer); elapsedTimer = null; }
      var el = box.querySelector('#aiAsmElapsed');
      if (el) el.textContent = '总用时 ' + ((Date.now() - startAt) / 1000).toFixed(1) + ' 秒';

      // 自动更新页签内数据（对话框后方同步刷新）
      var pane = document.querySelector('.tab-pane[data-pane="4"]');
      if (pane && state.ent === eid) pane.innerHTML = riskPaneHtml(M.entById(eid));

      // 对话框内展示评估报告
      endAnalysisLayout();
      bodyEl.innerHTML = assessReportHtml(e, R);
      var doneBtn = bodyEl.querySelector('#aiAsmDone');
      if (doneBtn) doneBtn.addEventListener('click', close);
    }
  };

  // 评估报告（对话框内展示）
  function assessReportHtml(e, as) {
    var dimRows = M.RISK_DIMS.filter(function (d) { return d.weight > 0; }).map(function (d) {
      var nv = as.dims[d.key];
      var ov = e.risks[d.key] || 0;
      var dv = nv - ov;
      var mark = dv === 0 ? '<span style="color:#94A3B8;">持平</span>'
        : (dv > 0 ? '<span style="color:#e03131;">↑' + dv + '</span>' : '<span style="color:#22C55E;">↓' + (-dv) + '</span>');
      return '<tr><td>' + U.esc(d.name) + '</td><td class="num">' + ov + '</td><td class="num">' + nv + '</td><td class="num">' + mark + '</td></tr>';
    }).join('');

    return '<div class="ai-panel">' +
        '<div class="ai-title">' +
          '<span>✦ AI 风险评估报告</span>' +
          '<span class="ai-conf">置信度 ' + as.confidence + '% · ' + U.esc(as.time) + '</span>' +
        '</div>' +
        '<div class="ai-body">' +
          '<div class="ai-sec"><p>' + U.esc(as.summary) + '</p></div>' +
          '<div class="ai-sec"><h4>维度评分更新</h4>' +
            '<table class="tbl" style="margin-top:4px;"><thead><tr><th>风险维度</th><th class="num">档案值</th><th class="num">本次评估</th><th class="num">变化</th></tr></thead><tbody>' + dimRows + '</tbody></table>' +
          '</div>' +
          '<div class="ai-sec"><h4>主要风险点</h4><ul>' +
            as.topRisks.map(function (s) { return '<li>' + U.esc(s) + '</li>'; }).join('') +
          '</ul></div>' +
          '<div class="ai-sec"><h4>处置建议</h4><ul>' +
            as.advice.map(function (s) { return '<li>' + U.esc(s) + '</li>'; }).join('') +
          '</ul></div>' +
          '<div class="ai-sec ai-compare">' +
            '<div>档案综合指数：<span class="num">' + e.riskScore + '</span>（' + M.LEVELS[e.riskLevel].name + '）</div>' +
            '<div>本次评估：<span class="num" style="color:' + M.LEVELS[as.level].color + '">' + as.score + '</span>（' + M.LEVELS[as.level].name + '）</div>' +
            '<div>变化：' + scoreDeltaHtml(as.score - e.riskScore) + '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div style="text-align:center;margin-top:14px;">' +
        '<button class="btn sm primary" id="aiAsmDone">关闭</button>' +
      '</div>';
  }

  // ===== AI 综合研判 Tab =====
  var aiJudge = {}; // entId → 重新分析研判结果（会话内有效，刷新还原）

  function li(s) { return '<li>' + U.esc(s) + '</li>'; }

  // 简版研判面板（初始进入页签时展示）：j 为企业档案 ai 数据
  function aiPanelHtml(e, j) {
    var score = e.riskScore;
    var prevScore = j.prevScore != null ? j.prevScore : score;
    var sd = score - prevScore;
    var deltaTxt = sd === 0 ? '<span style="color:#94A3B8">持平</span>'
      : (sd > 0 ? '<span style="color:#e03131">↑' + sd + '</span>' : '<span style="color:#22C55E">↓' + (-sd) + '</span>');
    var confTxt = '置信度 ' + (j.confidence || 85) + '%' + (j.time ? ' · ' + U.esc(j.time) + ' 更新' : '');
    return '<div class="ai-panel">' +
        '<div class="ai-title"><span>✦ AI 综合研判报告</span><span class="ai-conf">' + confTxt + '</span></div>' +
        '<div class="ai-body">' +
          '<div class="ai-sec"><p>' + U.esc(j.summary || '') + '</p></div>' +
          '<div class="ai-sec"><h4>核心优势</h4><ul>' + (j.strengths || []).map(li).join('') + '</ul></div>' +
          '<div class="ai-sec"><h4>关注风险</h4><ul>' + (j.risks || []).map(li).join('') + '</ul></div>' +
          '<div class="ai-sec"><h4>数据来源 <span style="font-weight:400;font-size:11px;color:#94A3B8;">（结论可追溯、可审计）</span></h4>' +
            '<div class="ai-sources">' + (j.sources || []).map(function (s) { return '<span>' + U.esc(s) + '</span>'; }).join('') + '</div></div>' +
          '<div class="ai-sec ai-compare">' +
            '<div>上次研判：<span class="num">' + (j.prevScore != null ? j.prevScore : '-') + '</span> <span style="font-size:11px;">（' + U.esc(j.lastJudge || '-') + '）</span></div>' +
            '<div>本次研判：<span class="num">' + score + '</span></div>' +
            '<div>变化：' + deltaTxt + '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  // 页签内容：初始为简版面板；执行「重新分析研判」后动态更新为完整报告（与弹窗一致）
  function judgePaneHtml(e) {
    var fresh = aiJudge[e.id];
    var panel;
    if (fresh) {
      panel = judgeReportHtml(e, fresh, true);
    } else if (e.ai) {
      panel = aiPanelHtml(e, e.ai);
    } else {
      panel = '<div class="ai-panel ai-simple">' +
        '<div class="ai-title"><span>✦ AI 综合研判</span><span class="ai-conf">置信度 82%</span></div>' +
        '<div class="ai-body"><div class="ai-sec">' +
        '<p>该企业为抽样监测企业，已完成基础风险评估。如需完整综合研判报告，请点击下方「重新分析研判」，或联系招商部门纳入重点企业库。</p>' +
        '</div></div></div>';
    }
    return panel +
      '<div class="mt" style="display:flex;justify-content:flex-end;gap:8px;">' +
        '<button class="btn sm primary" onclick="APP.runProfileJudge()">⟳ 重新分析研判</button>' +
        '<button class="btn sm primary" onclick="APP.exportJudgeReport()">⬇ 导出报告</button>' +
      '</div>';
  }

  // ---- 重新分析研判：弹窗式智能体全面研判（基本信息/股权/经营/招投标/知产/客供/同业/行业/投融/风险）----
  var JUDGE_STEPS = [
    '核验基本信息与主体资格',
    '解析股权结构与关联网络',
    '分析经营表现与履约水平',
    '扫描招投标参与情况',
    '盘点知识产权与创新实力',
    '剖析客户与供应商结构',
    '比对同业竞争格局',
    '研判所处行业发展环境',
    '分析投融资与信贷状况',
    '评估多维风险敞口',
    '生成综合研判结论'
  ];
  var JUDGE_TOTAL = 42000;

  // ---- 扩展维度模拟数据（一份参数化模拟数据集，按企业 id 稳定生成；纯虚构）----
  var SIM_POOL = {
    customers: ['陇昇能源科技有限公司', '庆阳宏图商贸有限公司', '西部陆港供应链管理有限公司', '长庆恒立装备制造有限公司', '甘肃陇原农业发展集团', '陇东电力工程有限公司'],
    suppliers: ['华陇原材料有限公司', '中庆电气设备有限公司', '丝路快运物流股份有限公司', '鑫源包装制品有限公司', '塞上五金加工厂'],
    rivals: ['宁远同业科技有限公司', '平凉金桥装备有限公司', '西峰瑞新实业公司', '环县宏泰同类企业'],
    investors: ['陇原产业投资基金', '西部创业投资合伙企业', '甘肃农银投资公司'],
    edges: ['成本控制与本地化服务能力突出', '交付周期短、响应速度快', '技术积累深厚，产品稳定性强', '渠道下沉充分，区域覆盖率高'],
    phases: ['稳步扩张期', '整合提升期', '高质量发展期'],
    growths: ['+4.8%', '+6.2%', '+8.5%', '+11.3%'],
    policies: ['「东数西算」工程带动算力需求', '新能源及装备制造产业政策加持', '特色农产品产业链扶持政策', '绿色低碳改造专项支持政策']
  };
  var SIM_CACHE = {};
  function simExtraOf(e) {
    if (SIM_CACHE[e.id]) return SIM_CACHE[e.id];
    var seed = 0;
    for (var i = 0; i < e.id.length; i++) seed = (seed * 31 + e.id.charCodeAt(i)) >>> 0;
    var rng = U.makeRng(seed ^ 0x9E3779B9);
    var ri = function (a, b) { return U.randInt(rng, a, b); };
    function pickN(arr, n) {
      var c = arr.slice(), out = [];
      while (out.length < n && c.length) out.push(c.splice(Math.floor(rng() * c.length), 1)[0]);
      return out;
    }

    var tTotal = ri(6, 42);
    var tWin = Math.min(tTotal, ri(2, Math.max(3, Math.round(tTotal * 0.5))));
    var customers = pickN(SIM_POOL.customers, ri(3, 4)).map(function (nm) {
      return { name: nm, share: ri(8, 30) };
    }).sort(function (a, b) { return b.share - a.share; });
    var suppliers = pickN(SIM_POOL.suppliers, ri(3, 4));
    var rivals = pickN(SIM_POOL.rivals, 3).map(function (nm) {
      return { name: nm, score: ri(38, 72) };
    }).sort(function (a, b) { return b.score - a.score; });
    var pTotal = ri(3, 38);
    var pInv = ri(0, Math.max(1, Math.round(pTotal * 0.5)));
    var rounds = ri(0, 3);

    return (SIM_CACHE[e.id] = {
      tender: {
        total: tTotal, win: tWin,
        rate: Math.round(tWin / tTotal * 100),
        amount: (tWin * ri(80, 520)) + ' 万元',
        lastDate: U.fmtDate(U.daysFromNow(-ri(5, 90))),
        clean: true
      },
      ip: {
        patent: pTotal, invention: pInv,
        soft: ri(1, 20), brand: ri(1, 15),
        dispute: rng() < 0.12 ? 1 : 0
      },
      cust: { list: customers, conc: customers.length ? customers[0].share : 0 },
      supp: { list: suppliers },
      peer: {
        rivals: rivals,
        rank: ri(1, 12),
        edge: U.pick(rng, SIM_POOL.edges)
      },
      ind: {
        growth: U.pick(rng, SIM_POOL.growths),
        phase: U.pick(rng, SIM_POOL.phases),
        policy: U.pick(rng, SIM_POOL.policies)
      },
      fin: {
        credit: ri(800, 6000),
        loan: ri(200, 3200),
        rounds: rounds,
        latest: rounds > 0 ? U.pick(rng, ['Pre-A 轮', 'A 轮', 'B 轮', '战略融资']) : null,
        investor: rounds > 0 ? U.pick(rng, SIM_POOL.investors) : null
      }
    });
  }

  function benchWord(v) {
    return v >= 65 ? '触及重大风险线' : (v >= 45 ? '高于较高风险线' : (v >= 25 ? '处于常规区间' : '处于低位'));
  }
  function ctrlWord(v) {
    return v >= 65 ? '处于高位，需重点管控'
      : (v >= 45 ? '偏高，需持续关注' : (v >= 25 ? '总体可控' : '处于低位'));
  }
  function commitRateOf(e) {
    if (!e.commitments || !e.commitments.length) return null;
    var s = 0;
    e.commitments.forEach(function (c) { s += c.promise > 0 ? c.actual / c.promise * 100 : 0; });
    return Math.round(s / e.commitments.length);
  }

  function buildJudgeResult(e) {
    var rng = U.makeRng((Date.now() % 2147483647) ^ (e.id.charCodeAt(e.id.length - 1) || 7));
    var cr = commitRateOf(e);
    var X = simExtraOf(e);
    var rows = M.RISK_DIMS.filter(function (d) { return d.weight > 0; }).map(function (d) {
      return { key: d.key, name: d.name, v: e.risks[d.key] || 0 };
    });
    var top = rows.slice().sort(function (a, b) { return b.v - a.v; });

    var strengths = [
      '注册资本 ' + e.overview.regCapital + '，属' + e.scale + '企业，主体体量' + (e.isDeep ? '稳健' : '尚可') + '。',
      '深耕' + e.industryName + '，注册于' + e.districtName + '，产业区位匹配度高。',
      '年营收 ' + e.overview.revenue + '、纳税 ' + e.overview.tax + '，经营基本盘' + (e.status.performRate >= 70 ? '扎实' : '承压') + '。',
      '招投标中标率 ' + X.tender.rate + '%（中标 ' + X.tender.win + '/' + X.tender.total + '），市场竞争力' + (X.tender.rate >= 35 ? '较强' : '尚可') + '。',
      '知识产权储备：专利 ' + X.ip.patent + ' 项（发明 ' + X.ip.invention + ' 项）、软著 ' + X.ip.soft + ' 项、商标 ' + X.ip.brand + ' 件，创新有支撑。'
    ];
    if (cr != null) strengths.push('招商承诺平均完成率 ' + cr + '%，履约' + (cr >= 90 ? '表现优秀' : (cr >= 70 ? '总体良好' : '存在缺口')) + '。');

    var risks = top.slice(0, 2).map(function (r) {
      return r.name + '得分 ' + r.v + '，' + ctrlWord(r.v) + '。';
    });
    if (X.cust.conc >= 26 && X.cust.list.length) {
      risks.push('第一大客户「' + X.cust.list[0].name + '」占比 ' + X.cust.conc + '%，客户集中度偏高，存在大客户依赖风险。');
    }
    if (X.ip.dispute) risks.push('存在知识产权纠纷 1 起，需关注权属与涉诉进展。');
    if (X.fin.loan > 2400) risks.push('贷款余额 ' + X.fin.loan + ' 万元偏高，需关注偿债压力与现金流匹配度。');
    risks.push(e.status.credit === '正常'
      ? '信用状态正常，未见重大失信记录。'
      : '信用状态为「' + e.status.credit + '」，需重点关注并跟踪变化。');
    risks.push('建议持续跟踪经营、涉诉与招投标动态，按月复核风险等级。');

    var baseSources = ['工商登记', '税务申报', '司法涉诉', '招投标公示', '知识产权', '社保缴纳', '企业动态监测', '投融资公开信息'];
    var sources = (e.ai && e.ai.sources) ? e.ai.sources.concat(baseSources.filter(function (s) {
      return e.ai.sources.indexOf(s) < 0;
    })) : baseSources;

    var summary = 'AI 智能体围绕基本信息、股权关系、经营履约、招投标、知识产权、客户与供应商、同业竞争、行业环境、投融资信贷及多维风险敞口等维度对该企业完成全面研判：' +
      '该企业为' + e.districtName + '的' + e.industryName + e.scale + '企业，综合风险指数 ' + e.riskScore +
      '（' + M.LEVELS[e.riskLevel].name + '），最高风险维度为「' + top[0].name + '」（' + top[0].v + ' 分）。' +
      '近三年招投标中标率 ' + X.tender.rate + '%，专利 ' + X.ip.patent + ' 项' +
      (X.cust.list.length ? '，第一大客户占比 ' + X.cust.conc + '%' : '') +
      (cr != null ? '，招商承诺平均完成率 ' + cr + '%' : '') + '。' +
      '整体判断：' + (e.riskLevel === 'blue' || e.riskLevel === 'yellow' ? '经营基本面平稳，风险可控，可正常推进服务与监管动作。' : '风险信号较多，建议纳入重点监管名单，加密走访与数据核查频次。');

    return {
      summary: summary,
      strengths: strengths,
      risks: risks,
      sources: sources,
      confidence: U.randInt(rng, 88, 96),
      time: U.fmtDateTime(new Date()),
      prevScore: e.ai && e.ai.prevScore != null ? e.ai.prevScore : null,
      lastJudge: e.ai && e.ai.lastJudge ? e.ai.lastJudge : '首次研判'
    };
  }

  APP.runProfileJudge = function () {
    var e = M.entById(state.ent);
    if (!e) return;
    clearAssessTimers();

    var eid = e.id;
    var closed = false;
    var J = buildJudgeResult(e);

    var mask = U.el('div', { class: 'modal-mask' });
    mask.style.zIndex = 10000;
    var box = U.el('div', { class: 'modal' });
    box.style.width = '680px';
    box.style.maxWidth = '94vw';
    box.innerHTML =
      '<div class="modal-header" style="display:flex;align-items:center;gap:10px;">' +
        '<span style="flex:1;">✦ AI 综合研判 · ' + U.esc(e.name) + '</span>' +
        '<span id="jdElapsed" style="font-size:11px;font-weight:400;color:#64748B;background:#F1F5F9;border-radius:10px;padding:2px 10px;">准备中…</span>' +
        '<span id="jdClose" style="cursor:pointer;font-size:20px;line-height:1;color:#94A3B8;font-weight:400;padding:0 2px;">×</span>' +
      '</div>' +
      '<div class="modal-body" id="jdBody"></div>';
    mask.appendChild(box);
    document.body.appendChild(mask);

    function close() {
      if (closed) return;
      closed = true;
      clearAssessTimers();
      if (elapsedTimer) { clearInterval(elapsedTimer); elapsedTimer = null; }
      if (mask.parentNode) mask.parentNode.removeChild(mask);
      document.removeEventListener('keydown', onKey);
    }
    function onKey(ev) { if (ev.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);
    mask.addEventListener('click', function (ev) { if (ev.target === mask) close(); });
    box.querySelector('#jdClose').addEventListener('click', close);

    var bodyEl = box.querySelector('#jdBody');
    // 一开始就固定对话框高度：研判过程与报告阶段尺寸稳定，内容在内部滚动
    bodyEl.style.height = '58vh';
    bodyEl.style.minHeight = '420px';
    // 顶部动态单步展示：运行中为旋转圆圈；完成后圆圈定格为对勾，稍作停顿再切入下一步骤
    function stepRowHtml(idx, state) {
      var done = state === 'done';
      var ico = done
        ? '<span style="width:18px;height:18px;border-radius:50%;background:#DCFCE7;color:#16A34A;font-size:11px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;">✓</span>'
        : '<span class="jd-ring" style="flex-shrink:0;"></span>';
      return '<div style="animation:msgIn .25s ease;display:flex;align-items:center;gap:10px;font-size:13px;font-weight:600;color:' + (done ? '#334155' : '#1D4ED8') + ';padding:10px 12px;background:' + (done ? '#F0FDF4' : '#EFF6FF') + ';border:1px solid ' + (done ? '#BBF7D0' : '#DBEAFE') + ';border-radius:8px;">' +
        ico +
        '<span style="flex:1;">第 ' + (idx + 1) + ' 步 · ' + U.esc(JUDGE_STEPS[idx]) + '</span>' +
        '<span style="font-size:11px;font-weight:400;color:' + (done ? '#22C55E' : '#1D4ED8') + ';">' + (done ? '完成' : '进行中') + '</span>' +
      '</div>';
    }
    function setStep(idx, state) {
      var slot = box.querySelector('#jdSteps');
      if (slot) slot.innerHTML = stepRowHtml(idx, state);
    }
    function refreshSteps(idx) {
      if (idx > 0) {
        setStep(idx - 1, 'done');
        assessLater(function () { if (alive()) setStep(idx, 'run'); }, 650);
      } else {
        setStep(0, 'run');
      }
    }

    bodyEl.innerHTML = '<div id="jdSteps">' + stepRowHtml(0, 'run') + '</div>' +
      '<div id="jdLog" style="max-height:200px;overflow-y:auto;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:10px 14px;font-size:12px;line-height:2;"></div>';
    var logEl = box.querySelector('#jdLog');
    // 分析阶段：日志区撑满固定高度（控制台观感），出报告时恢复普通布局
    bodyEl.style.display = 'flex';
    bodyEl.style.flexDirection = 'column';
    box.querySelector('#jdSteps').style.flexShrink = '0';
    logEl.style.flex = '1';
    logEl.style.maxHeight = 'none';
    function log(text, color, bold) {
      var line = U.el('div', { style: 'color:' + (color || '#475569') + ';' + (bold ? 'font-weight:600;' : ''), html: U.esc(text) });
      line.style.animation = 'msgIn .25s ease';
      logEl.appendChild(line);
      logEl.scrollTop = logEl.scrollHeight;
      // 对话框内容超高时跟随滚动到最新提示
      bodyEl.scrollTop = bodyEl.scrollHeight;
    }

    var elapsedTimer = setInterval(function () {
      var el = box.querySelector('#jdElapsed');
      if (!el || closed) return;
      var t = Date.now() - startAt;
      el.textContent = '已用时 ' + (t / 1000).toFixed(1) + ' 秒 · ' + Math.min(99, Math.round(t / JUDGE_TOTAL * 100)) + '%';
    }, 100);
    var startAt = Date.now();

    function alive() { return !closed && state.ent === eid && !!M.entById(state.ent); }

    var sh = (e.shareholders && e.shareholders.length) ? e.shareholders.slice().sort(function (a, b) { return b.ratio - a.ratio; })[0] : null;
    var dyn = (e.dynamics && e.dynamics[0]) || null;
    var dimsRows = M.RISK_DIMS.filter(function (d) { return d.weight > 0; })
      .map(function (d) { return { name: d.name, v: e.risks[d.key] || 0 }; })
      .sort(function (a, b) { return b.v - a.v; });
    var cr = commitRateOf(e);
    var X = simExtraOf(e);

    var plan = [
      // 第 1 步 · 核验基本信息与主体资格（登记库单表核验，约 2.2 秒）
      [150,  function () { log('初始化综合研判任务：「' + e.name + '」（11 个维度全面体检）', '#1D4ED8', true); }],
      [700,  function () { log('✓ 主体资格 · 统一社会信用代码 ' + e.creditCode); }],
      [1200, function () { log('✓ 法定代表人 ' + e.legal + ' · 成立时间 ' + e.found); }],
      [1700, function () { log('✓ 注册资本 ' + e.overview.regCapital + ' · 企业规模 ' + e.scale + ' · 经营状态 ' + e.status.biz); }],
      [2100, function () { log('✓ 主体资格核验通过'); }],
      // 第 2 步 · 解析股权结构与关联网络（多层穿透 + 关联图谱遍历，约 3.6 秒）
      [2300, function () { refreshSteps(1); log('开始解析股权结构与关联网络…', '#1D4ED8', true); }],
      [3000, function () { log(sh ? ('✓ 股东 ' + e.shareholders.length + ' 名，第一大股东「' + sh.name + '」持股 ' + sh.ratio + '%') : '✓ 股东结构：暂无登记记录'); }],
      [3650, function () { log('· 关联网络比对：对外投资、任职、供应链线索扫描中'); }],
      [4300, function () { log('✓ 股权链' + ((e.shareholders || []).length > 1 ? '多层穿透完成，控制权结构清晰' : '为单层结构，关系简单')); }],
      [4950, function () { log('· 对外投资与对外任职信息交叉核验完成'); }],
      [5700, function () { log('✓ 未发现异常关联交易与隐性控制关系'); }],
      // 第 3 步 · 分析经营表现与履约水平（财税数据聚合，约 3.2 秒）
      [5950, function () { refreshSteps(2); log('分析经营表现与履约水平…', '#1D4ED8', true); }],
      [6600, function () { log('✓ 经营表现 · 年营收 ' + e.overview.revenue + '，纳税 ' + e.overview.tax + '，员工 ' + Number(e.overview.employees).toLocaleString() + ' 人'); }],
      [7250, function () { log('✓ 履约水平 · 平均履约率 ' + e.status.performRate + '%' + (cr != null ? ('，招商承诺平均完成率 ' + cr + '%') : '')); }],
      [7850, function () { log(dyn ? ('✓ 最近动态：' + dyn.date + ' ' + dyn.text) : '✓ 暂无新增企业动态'); }],
      [8750, function () { log('✓ 经营与履约分析完成'); }],
      // 第 4 步 · 扫描招投标参与情况（公共资源交易平台全量检索，约 4.8 秒）
      [9200, function () { refreshSteps(3); log('扫描招投标参与情况…', '#1D4ED8', true); }],
      [9950, function () { log('· 接入公共资源交易平台，分年度检索近三年投标记录…'); }],
      [10700, function () { log('✓ 近三年参与招投标 ' + X.tender.total + ' 次，中标 ' + X.tender.win + ' 次，中标率 ' + X.tender.rate + '%'); }],
      [11450, function () { log('✓ 中标合同累计金额 ' + X.tender.amount + '，最近中标 ' + X.tender.lastDate); }],
      [12200, function () { log('· 与公示处罚库比对：围标、串标、废标记录扫描中'); }],
      [12950, function () { log('✓ 未发现招投标违规记录'); }],
      // 第 5 步 · 盘点知识产权与创新实力（专利/商标/软著三大库联查，约 4.2 秒）
      [13950, function () { refreshSteps(4); log('盘点知识产权与创新实力…', '#1D4ED8', true); }],
      [14700, function () { log('· 分别检索专利、商标、软件著作权三大登记库…'); }],
      [15450, function () { log('✓ 专利 ' + X.ip.patent + ' 项（其中发明 ' + X.ip.invention + ' 项）· 软件著作权 ' + X.ip.soft + ' 项'); }],
      [16150, function () { log('✓ 注册商标 ' + X.ip.brand + ' 件'); }],
      [16850, function () { log(X.ip.dispute ? '⚠ 检索到知识产权纠纷 1 起，需关注权属与涉诉进展' : '✓ 知识产权纠纷记录：无'); }],
      [17700, function () { log('✓ 创新实力盘点完成'); }],
      // 第 6 步 · 剖析客户与供应商结构（供应链上下游穿透，约 4.5 秒）
      [18150, function () { refreshSteps(5); log('剖析客户与供应商结构…', '#1D4ED8', true); }],
      [18950, function () { log('✓ 主要客户 ' + X.cust.list.length + ' 家：' + X.cust.list.map(function (c) { return c.name; }).join('、')); }],
      [19700, function () { log(X.cust.conc >= 26 ? ('⚠ 第一大客户占比 ' + X.cust.conc + '%，客户集中度偏高') : ('✓ 第一大客户占比 ' + X.cust.conc + '%，客户结构均衡')); }],
      [20450, function () { log('✓ 主要供应商 ' + X.supp.list.length + ' 家：' + X.supp.list.join('、')); }],
      [21200, function () { log('· 供应商供货记录与履约质量核验中…'); }],
      [22250, function () { log('✓ 供应链合作关系稳定，未见断供风险信号'); }],
      // 第 7 步 · 比对同业竞争格局（区域同业样本比对，约 3.8 秒）
      [22650, function () { refreshSteps(6); log('比对同业竞争格局…', '#1D4ED8', true); }],
      [23450, function () { log('✓ 区域内主要同业：' + X.peer.rivals.map(function (r) { return r.name; }).join('、')); }],
      [24200, function () { log('✓ 本企业综合竞争力位居区域同类企业第 ' + X.peer.rank + ' 位'); }],
      [24950, function () { log('✓ 竞争优势画像：' + X.peer.edge); }],
      [26150, function () { log('✓ 同业格局比对完成'); }],
      // 第 8 步 · 研判所处行业发展环境（行业景气与政策库匹配，约 3.6 秒）
      [26450, function () { refreshSteps(7); log('研判所处行业发展环境…', '#1D4ED8', true); }],
      [27200, function () { log('✓ 行业坐标：' + e.industryName + '（全市监测 ' + M.INDUSTRIES.length + ' 个行业）· 所在区域 ' + e.districtName); }],
      [27950, function () { log('✓ 行业景气度：本年度预计增长 ' + X.ind.growth + '，处于' + X.ind.phase); }],
      [28700, function () { log('✓ 政策环境：' + X.ind.policy); }],
      [29700, function () { log('✓ 行业环境研判完成'); }],
      // 第 9 步 · 分析投融资与信贷状况（授信/融资多源核查，约 3.4 秒）
      [30050, function () { refreshSteps(8); log('分析投融资与信贷状况…', '#1D4ED8', true); }],
      [30800, function () { log('✓ 银行授信总额 ' + X.fin.credit + ' 万元 · 贷款余额 ' + X.fin.loan + ' 万元'); }],
      [31550, function () { log(X.fin.rounds > 0 ? ('✓ 融资历程：已完成 ' + X.fin.latest + '（投资方：' + X.fin.investor + '）') : '· 公开渠道暂未检索到股权融资记录'); }],
      [32300, function () { log(X.fin.loan > 2400 ? '⚠ 贷款余额偏高，偿债压力需持续关注' : '✓ 偿债能力与现金流匹配度推断完成'); }],
      [33150, function () { log('✓ 投融资信贷画像完成'); }],
      // 第 10 步 · 评估多维风险敞口（八维加权模型逐维计算，约 4.0 秒）
      [33450, function () { refreshSteps(9); log('评估多维风险敞口…', '#1D4ED8', true); }],
      [34000, function () { log('· 启动八维加权风险模型，逐维计算得分与权重贡献…'); }],
      [34750, function () { log('· ' + dimsRows[0].name + ' ' + dimsRows[0].v + ' 分，' + benchWord(dimsRows[0].v)); }],
      [35450, function () { log('· ' + dimsRows[1].name + ' ' + dimsRows[1].v + ' 分，' + benchWord(dimsRows[1].v)); }],
      [36150, function () { log('· ' + dimsRows[2].name + ' ' + dimsRows[2].v + ' 分，' + benchWord(dimsRows[2].v)); }],
      [37050, function () { log('✓ 风险敞口评估完成：综合指数 ' + e.riskScore + '（' + M.LEVELS[e.riskLevel].name + '）', '#22C55E', true); }],
      // 第 11 步 · 生成综合研判结论（汇总推理与报告生成，约 4.7 秒）
      [37450, function () { refreshSteps(10); log('生成综合研判结论…', '#1D4ED8', true); }],
      [38300, function () { log('· 汇总 11 个维度分析结果，生成研判摘要…'); }],
      [39300, function () { log('· 推理完成 → 核心优势与关注风险清单已生成'); }],
      [40200, function () { log('· 数据来源标注与置信度校验通过'); }],
      [41200, function () { log('· 报告排版生成与脱敏检查完成'); }],
      [JUDGE_TOTAL, function () { finish(); }]
    ];
    plan.forEach(function (item) {
      assessLater(function () { if (alive()) item[1](); }, item[0]);
    });

    function finish() {
      if (!alive()) return;
      aiJudge[eid] = J;

      if (elapsedTimer) { clearInterval(elapsedTimer); elapsedTimer = null; }
      var el = box.querySelector('#jdElapsed');
      if (el) el.textContent = '总用时 ' + ((Date.now() - startAt) / 1000).toFixed(1) + ' 秒';

      // 自动更新页签内研判面板（对话框后方同步刷新）
      var pane = document.querySelector('.tab-pane[data-pane="5"]');
      if (pane && state.ent === eid) pane.innerHTML = judgePaneHtml(M.entById(eid));

      // 对话框内展示完整综合研判报告
      bodyEl.style.display = '';
      bodyEl.innerHTML = judgeReportHtml(M.entById(eid), J);
      bodyEl.scrollTop = 0;
      var doneBtn = bodyEl.querySelector('#jdDone');
      if (doneBtn) doneBtn.addEventListener('click', close);
    }
  };

  // 完整综合研判报告：弹窗与「AI 综合研判」页签共用同一份内容（embedded=true 时去掉关闭按钮）
  function judgeReportHtml(e, j, embedded) {
    var X = simExtraOf(e);
    var dimRows = M.RISK_DIMS.filter(function (d) { return d.weight > 0; }).map(function (d) {
      var v = e.risks[d.key] || 0;
      return '<tr><td>' + U.esc(d.name) + '</td><td class="num">' + Math.round(d.weight * 100) + '%</td><td class="num">' + v + '</td><td>' + ctrlWord(v) + '</td></tr>';
    }).join('');
    var cr = commitRateOf(e);
    // 历史研判对比
    var score = e.riskScore;
    var prevScore = j.prevScore != null ? j.prevScore : score;
    var sd = score - prevScore;
    var deltaTxt = sd === 0 ? '<span style="color:#94A3B8;">持平</span>'
      : (sd > 0 ? '<span style="color:#e03131;">↑' + sd + '</span>' : '<span style="color:#22C55E;">↓' + (-sd) + '</span>');
    return '<div class="ai-panel">' +
        '<div class="ai-title"><span>✦ AI 综合研判报告</span><span class="ai-conf">置信度 ' + (j.confidence || 85) + '%' + (j.time ? ' · ' + U.esc(j.time) : '') + '</span></div>' +
        '<div class="ai-body">' +
          '<div class="ai-sec"><p>' + U.esc(j.summary) + '</p></div>' +
          '<div class="ai-sec"><h4>关键指标快照</h4>' +
            '<table class="tbl" style="margin-top:4px;"><thead><tr><th>总营收</th><th class="num">纳税</th><th class="num">员工数</th><th class="num">履约率</th><th class="num">承诺完成率</th><th class="num">综合指数</th></tr></thead><tbody>' +
              '<tr><td>' + U.esc(e.overview.revenue) + '</td><td class="num">' + U.esc(e.overview.tax) + '</td><td class="num">' + Number(e.overview.employees).toLocaleString() + '</td><td class="num">' + e.status.performRate + '%</td><td class="num">' + (cr != null ? cr + '%' : '—') + '</td><td class="num" style="color:' + M.LEVELS[e.riskLevel].color + ';font-weight:700;">' + e.riskScore + '</td></tr>' +
            '</tbody></table></div>' +
          '<div class="ai-sec"><h4>核心优势</h4><ul>' + j.strengths.map(li).join('') + '</ul></div>' +
          '<div class="ai-sec"><h4>关注风险与建议</h4><ul>' + j.risks.map(li).join('') + '</ul></div>' +
          '<div class="ai-sec"><h4>招投标情况（近三年）</h4>' +
            '<table class="tbl" style="margin-top:4px;"><thead><tr><th class="num">参与(次)</th><th class="num">中标(次)</th><th class="num">中标率</th><th class="num">中标金额</th><th>最近中标</th></tr></thead><tbody>' +
              '<tr><td class="num">' + X.tender.total + '</td><td class="num">' + X.tender.win + '</td><td class="num">' + X.tender.rate + '%</td><td class="num">' + X.tender.amount + '</td><td>' + X.tender.lastDate + '</td></tr>' +
            '</tbody></table>' +
            '<p style="margin:6px 0 0;font-size:12px;color:#64748B;">招投标参与整体活跃' + (X.tender.rate >= 35 ? '，中标率高于区域平均水平，市场竞争力较强' : '') + '；未发现围标、串标、废标等违规记录。</p></div>' +
          '<div class="ai-sec"><h4>知识产权情况</h4>' +
            '<table class="tbl" style="margin-top:4px;"><thead><tr><th class="num">专利(项)</th><th class="num">其中发明</th><th class="num">软著(项)</th><th class="num">商标(件)</th><th>纠纷</th></tr></thead><tbody>' +
              '<tr><td class="num">' + X.ip.patent + '</td><td class="num">' + X.ip.invention + '</td><td class="num">' + X.ip.soft + '</td><td class="num">' + X.ip.brand + '</td><td>' + (X.ip.dispute ? '1 起' : '无') + '</td></tr>' +
            '</tbody></table></div>' +
          '<div class="ai-sec"><h4>客户与供应商结构</h4>' +
            '<table class="tbl" style="margin-top:4px;"><thead><tr><th>主要客户</th><th class="num">销售占比</th></tr></thead><tbody>' +
              X.cust.list.map(function (c) {
                return '<tr><td>' + U.esc(c.name) + '</td><td class="num">' + c.share + '%</td></tr>';
              }).join('') +
            '</tbody></table>' +
            '<p style="margin:6px 0 0;font-size:12px;color:#64748B;">主要供应商：' + X.supp.list.map(U.esc).join('、') + '。第一大客户占比 ' + X.cust.conc + '%' + (X.cust.conc >= 26 ? '，客户集中度偏高，建议拓展客户面分散依赖' : '，客户结构均衡') + '。</p></div>' +
          '<div class="ai-sec"><h4>同业竞争格局</h4>' +
            '<table class="tbl" style="margin-top:4px;"><thead><tr><th>区域同业企业</th><th class="num">综合指数</th></tr></thead><tbody>' +
              X.peer.rivals.map(function (r) {
                return '<tr><td>' + U.esc(r.name) + '</td><td class="num">' + r.score + '</td></tr>';
              }).join('') +
            '</tbody></table>' +
            '<p style="margin:6px 0 0;font-size:12px;color:#64748B;">本企业综合竞争力位居区域同类企业第 ' + X.peer.rank + ' 位；竞争优势：' + U.esc(X.peer.edge) + '。</p></div>' +
          '<div class="ai-sec"><h4>所处行业分析</h4><ul>' +
            '<li>行业坐标：' + U.esc(e.industryName) + ' · 所在区域：' + U.esc(e.districtName) + '。</li>' +
            '<li>行业景气度：本年度预计增长 ' + X.ind.growth + '，处于' + X.ind.phase + '。</li>' +
            '<li>政策环境：' + U.esc(X.ind.policy) + '。</li>' +
          '</ul></div>' +
          '<div class="ai-sec"><h4>投融资与信贷状况</h4><ul>' +
            '<li>银行授信总额 ' + X.fin.credit + ' 万元，当前贷款余额 ' + X.fin.loan + ' 万元。' + (X.fin.loan > 2400 ? '贷款余额偏高，需关注偿债压力。' : '') + '</li>' +
            '<li>融资历程：' + (X.fin.rounds > 0 ? ('已完成 ' + X.fin.latest + ' 融资（投资方：' + U.esc(X.fin.investor) + '）。') : '暂未检索到公开股权融资记录。') + '</li>' +
          '</ul></div>' +
          '<div class="ai-sec"><h4>八维风险评分</h4>' +
            '<table class="tbl" style="margin-top:4px;"><thead><tr><th>风险维度</th><th class="num">权重</th><th class="num">得分</th><th>评价</th></tr></thead><tbody>' + dimRows + '</tbody></table></div>' +
          '<div class="ai-sec ai-compare">' +
            '<div>上次研判：<span class="num">' + (j.prevScore != null ? j.prevScore : '-') + '</span> <span style="font-size:11px;">（' + U.esc(j.lastJudge || '-') + '）</span></div>' +
            '<div>本次研判：<span class="num">' + score + '</span>（综合风险指数）</div>' +
            '<div>变化：' + deltaTxt + '</div>' +
          '</div>' +
          '<div class="ai-sec"><h4>数据来源 <span style="font-weight:400;font-size:11px;color:#94A3B8;">（结论可追溯、可审计）</span></h4><div class="ai-sources">' + j.sources.map(function (s) { return '<span>' + U.esc(s) + '</span>'; }).join('') + '</div></div>' +
        '</div>' +
      '</div>' +
      (embedded ? '' : '<div style="text-align:center;margin-top:14px;"><button class="btn sm primary" id="jdDone">关闭</button></div>');
  }

  // ---- 导出正式商务版式 PDF 报告 ----
  function reportDateStr() {
    var d = new Date();
    function p(x) { return x < 10 ? '0' + x : '' + x; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  function buildReportHtml(e, j) {
    var cr = commitRateOf(e);
    var X = simExtraOf(e);
    var dimRows = M.RISK_DIMS.filter(function (d) { return d.weight > 0; }).map(function (d, i) {
      var v = e.risks[d.key] || 0;
      return '<tr><td>' + (i + 1) + '</td><td>' + U.esc(d.name) + '</td><td style="text-align:right;">' + Math.round(d.weight * 100) + '%</td>' +
        '<td style="text-align:right;font-weight:600;color:' + (v >= 65 ? '#C0392B' : (v >= 45 ? '#D35400' : (v >= 25 ? '#B7950B' : '#2471A3'))) + ';">' + v + '</td>' +
        '<td>' + ctrlWord(v) + '</td></tr>';
    }).join('');
    var secTitle = function (n, t) {
      return '<div style="margin:26px 0 10px;padding-left:10px;border-left:4px solid #2563EB;font-size:15px;font-weight:700;color:#0F172A;">' + n + '、' + t + '</div>';
    };

    return '' +
      '<div style="width:794px;box-sizing:border-box;padding:52px 56px;background:#fff;color:#1F2937;font-family:\'Microsoft YaHei\',\'PingFang SC\',sans-serif;font-size:13px;line-height:1.9;">' +
        // 页眉
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #2563EB;padding-bottom:14px;">' +
          '<div>' +
            '<div style="font-size:17px;font-weight:800;color:#0F172A;">招商企业服务与智慧监管平台</div>' +
            '<div style="font-size:11px;color:#64748B;margin-top:2px;">招商企业服务与智慧监管平台</div>' +
          '</div>' +
          '<div style="text-align:right;font-size:11px;color:#64748B;">' +
            '<div style="background:#FEF3C7;color:#92400E;display:inline-block;padding:2px 12px;border-radius:2px;font-weight:700;letter-spacing:2px;">内部资料</div>' +
            '<div style="margin-top:6px;">编号：QY-' + String(e.id).replace(/[^A-Za-z0-9]/g, '') + '-' + reportDateStr().replace(/-/g, '') + '</div>' +
          '</div>' +
        '</div>' +
        // 标题
        '<div style="text-align:center;margin:34px 0 6px;font-size:26px;font-weight:800;letter-spacing:6px;color:#0F172A;">企业综合研判报告</div>' +
        '<div style="text-align:center;font-size:13px;color:#475569;margin-bottom:26px;">—— ' + U.esc(e.name) + ' ——</div>' +
        // 基本信息表
        '<table style="width:100%;border-collapse:collapse;font-size:12px;">' +
          '<tr>' +
            '<td style="border:1px solid #CBD5E1;background:#F8FAFC;padding:7px 10px;width:110px;color:#334155;">企业名称</td><td style="border:1px solid #CBD5E1;padding:7px 10px;font-weight:600;">' + U.esc(e.name) + '</td>' +
            '<td style="border:1px solid #CBD5E1;background:#F8FAFC;padding:7px 10px;width:110px;color:#334155;">统一社会信用代码</td><td style="border:1px solid #CBD5E1;padding:7px 10px;">' + U.esc(e.creditCode) + '</td>' +
          '</tr>' +
          '<tr>' +
            '<td style="border:1px solid #CBD5E1;background:#F8FAFC;padding:7px 10px;color:#334155;">法定代表人</td><td style="border:1px solid #CBD5E1;padding:7px 10px;">' + U.esc(e.legal) + '</td>' +
            '<td style="border:1px solid #CBD5E1;background:#F8FAFC;padding:7px 10px;color:#334155;">成立时间</td><td style="border:1px solid #CBD5E1;padding:7px 10px;">' + U.esc(e.found) + '</td>' +
          '</tr>' +
          '<tr>' +
            '<td style="border:1px solid #CBD5E1;background:#F8FAFC;padding:7px 10px;color:#334155;">注册资本</td><td style="border:1px solid #CBD5E1;padding:7px 10px;">' + U.esc(e.overview.regCapital) + '</td>' +
            '<td style="border:1px solid #CBD5E1;background:#F8FAFC;padding:7px 10px;color:#334155;">企业规模</td><td style="border:1px solid #CBD5E1;padding:7px 10px;">' + U.esc(e.scale) + '</td>' +
          '</tr>' +
          '<tr>' +
            '<td style="border:1px solid #CBD5E1;background:#F8FAFC;padding:7px 10px;color:#334155;">所属行业</td><td style="border:1px solid #CBD5E1;padding:7px 10px;">' + U.esc(e.industryName) + '</td>' +
            '<td style="border:1px solid #CBD5E1;background:#F8FAFC;padding:7px 10px;color:#334155;">所在区县</td><td style="border:1px solid #CBD5E1;padding:7px 10px;">' + U.esc(e.districtName) + '</td>' +
          '</tr>' +
          '<tr>' +
            '<td style="border:1px solid #CBD5E1;background:#F8FAFC;padding:7px 10px;color:#334155;">经营状态</td><td style="border:1px solid #CBD5E1;padding:7px 10px;">' + U.esc(e.status.biz) + '</td>' +
            '<td style="border:1px solid #CBD5E1;background:#F8FAFC;padding:7px 10px;color:#334155;">信用状态</td><td style="border:1px solid #CBD5E1;padding:7px 10px;">' + U.esc(e.status.credit) + '</td>' +
          '</tr>' +
          '<tr>' +
            '<td style="border:1px solid #CBD5E1;background:#F8FAFC;padding:7px 10px;color:#334155;">综合风险指数</td><td style="border:1px solid #CBD5E1;padding:7px 10px;font-weight:700;color:' + M.LEVELS[e.riskLevel].color + ';">' + e.riskScore + '（' + M.LEVELS[e.riskLevel].name + '）</td>' +
            '<td style="border:1px solid #CBD5E1;background:#F8FAFC;padding:7px 10px;color:#334155;">研判置信度</td><td style="border:1px solid #CBD5E1;padding:7px 10px;font-weight:700;">' + j.confidence + '%</td>' +
          '</tr>' +
        '</table>' +
        // 一、研判摘要
        secTitle('一', '研判摘要') +
        '<div style="text-indent:2em;text-align:justify;">' + U.esc(j.summary) + '</div>' +
        // 二、核心优势
        secTitle('二', '核心优势') +
        '<ol style="margin:0;padding-left:26px;">' + j.strengths.map(li).join('') + '</ol>' +
        // 三、关注风险与处置建议
        secTitle('三', '关注风险与处置建议') +
        '<ol style="margin:0;padding-left:26px;">' + j.risks.map(li).join('') + '</ol>' +
        // 四、经营与履约概览
        secTitle('四', '经营与履约概览') +
        '<table style="width:100%;border-collapse:collapse;font-size:12px;text-align:center;">' +
          '<tr style="background:#EFF6FF;font-weight:700;color:#1E3A8A;">' +
            '<th style="border:1px solid #CBD5E1;padding:7px;">年营收</th><th style="border:1px solid #CBD5E1;padding:7px;">纳税总额</th><th style="border:1px solid #CBD5E1;padding:7px;">员工数</th>' +
            '<th style="border:1px solid #CBD5E1;padding:7px;">平均履约率</th><th style="border:1px solid #CBD5E1;padding:7px;">承诺完成率</th>' +
          '</tr>' +
          '<tr>' +
            '<td style="border:1px solid #CBD5E1;padding:7px;">' + U.esc(e.overview.revenue) + '</td>' +
            '<td style="border:1px solid #CBD5E1;padding:7px;">' + U.esc(e.overview.tax) + '</td>' +
            '<td style="border:1px solid #CBD5E1;padding:7px;">' + Number(e.overview.employees).toLocaleString() + ' 人</td>' +
            '<td style="border:1px solid #CBD5E1;padding:7px;">' + e.status.performRate + '%</td>' +
            '<td style="border:1px solid #CBD5E1;padding:7px;">' + (cr != null ? cr + '%' : '—') + '</td>' +
          '</tr>' +
        '</table>' +
        // 五、股权结构简析
        secTitle('五', '股权结构简析') +
        ((e.shareholders && e.shareholders.length)
          ? '<table style="width:100%;border-collapse:collapse;font-size:12px;text-align:center;"><tr style="background:#EFF6FF;font-weight:700;color:#1E3A8A;"><th style="border:1px solid #CBD5E1;padding:7px;">股东名称</th><th style="border:1px solid #CBD5E1;padding:7px;">持股比例</th></tr>' +
            e.shareholders.map(function (s) {
              return '<tr><td style="border:1px solid #CBD5E1;padding:7px;">' + U.esc(s.name) + '</td><td style="border:1px solid #CBD5E1;padding:7px;">' + s.ratio + '%</td></tr>';
            }).join('') + '</table>'
          : '<div>暂无登记股东信息。</div>') +
        // 六、招投标情况
        secTitle('六', '招投标情况（近三年）') +
        '<table style="width:100%;border-collapse:collapse;font-size:12px;text-align:center;">' +
          '<tr style="background:#EFF6FF;font-weight:700;color:#1E3A8A;">' +
            '<th style="border:1px solid #CBD5E1;padding:7px;">参与招投标(次)</th><th style="border:1px solid #CBD5E1;padding:7px;">中标(次)</th><th style="border:1px solid #CBD5E1;padding:7px;">中标率</th>' +
            '<th style="border:1px solid #CBD5E1;padding:7px;">中标金额合计</th><th style="border:1px solid #CBD5E1;padding:7px;">最近中标时间</th>' +
          '</tr>' +
          '<tr>' +
            '<td style="border:1px solid #CBD5E1;padding:7px;">' + X.tender.total + '</td>' +
            '<td style="border:1px solid #CBD5E1;padding:7px;">' + X.tender.win + '</td>' +
            '<td style="border:1px solid #CBD5E1;padding:7px;font-weight:600;">' + X.tender.rate + '%</td>' +
            '<td style="border:1px solid #CBD5E1;padding:7px;">' + X.tender.amount + '</td>' +
            '<td style="border:1px solid #CBD5E1;padding:7px;">' + X.tender.lastDate + '</td>' +
          '</tr>' +
        '</table>' +
        '<div style="margin-top:6px;text-indent:2em;text-align:justify;">该企业近三年招投标参与整体活跃' + (X.tender.rate >= 35 ? '，中标率高于区域平均水平，市场竞争力较强' : '') + '；经与公示处罚信息比对，未发现围标、串标、废标等违规记录。</div>' +
        // 七、知识产权情况
        secTitle('七', '知识产权情况') +
        '<table style="width:100%;border-collapse:collapse;font-size:12px;text-align:center;">' +
          '<tr style="background:#EFF6FF;font-weight:700;color:#1E3A8A;">' +
            '<th style="border:1px solid #CBD5E1;padding:7px;">专利总数(项)</th><th style="border:1px solid #CBD5E1;padding:7px;">其中发明专利</th><th style="border:1px solid #CBD5E1;padding:7px;">软件著作权(项)</th>' +
            '<th style="border:1px solid #CBD5E1;padding:7px;">注册商标(件)</th><th style="border:1px solid #CBD5E1;padding:7px;">知识产权纠纷</th>' +
          '</tr>' +
          '<tr>' +
            '<td style="border:1px solid #CBD5E1;padding:7px;">' + X.ip.patent + '</td>' +
            '<td style="border:1px solid #CBD5E1;padding:7px;">' + X.ip.invention + '</td>' +
            '<td style="border:1px solid #CBD5E1;padding:7px;">' + X.ip.soft + '</td>' +
            '<td style="border:1px solid #CBD5E1;padding:7px;">' + X.ip.brand + '</td>' +
            '<td style="border:1px solid #CBD5E1;padding:7px;">' + (X.ip.dispute ? '1 起' : '无') + '</td>' +
          '</tr>' +
        '</table>' +
        '<div style="margin-top:6px;text-indent:2em;text-align:justify;">该企业专利与软件著作权储备与其' + U.esc(e.industryName) + '业务定位相匹配，发明专利占比 ' + (X.ip.patent > 0 ? Math.round(X.ip.invention / X.ip.patent * 100) : 0) + '%。' + (X.ip.dispute ? '存在知识产权纠纷 1 起，需关注权属与涉诉进展。' : '未发现知识产权纠纷记录。') + '</div>' +
        // 八、客户与供应商结构
        secTitle('八', '客户与供应商结构') +
        '<table style="width:100%;border-collapse:collapse;font-size:12px;text-align:center;">' +
          '<tr style="background:#EFF6FF;font-weight:700;color:#1E3A8A;">' +
            '<th style="border:1px solid #CBD5E1;padding:7px;width:52px;">序号</th><th style="border:1px solid #CBD5E1;padding:7px;">主要客户名称</th><th style="border:1px solid #CBD5E1;padding:7px;width:110px;">销售占比</th>' +
          '</tr>' +
          X.cust.list.map(function (c, i) {
            return '<tr><td style="border:1px solid #CBD5E1;padding:7px;">' + (i + 1) + '</td><td style="border:1px solid #CBD5E1;padding:7px;text-align:left;">' + U.esc(c.name) + '</td><td style="border:1px solid #CBD5E1;padding:7px;">' + c.share + '%</td></tr>';
          }).join('') +
        '</table>' +
        '<div style="margin-top:6px;text-indent:2em;text-align:justify;"><b>主要供应商：</b>' + X.supp.list.map(U.esc).join('、') + '。第一大客户销售占比 ' + X.cust.conc + '%' + (X.cust.conc >= 26 ? '，客户集中度偏高，存在一定大客户依赖，建议拓展客户面分散经营风险' : '，客户结构均衡，经营独立性较好') + '；供应链合作关系稳定，未见断供风险信号。</div>' +
        // 九、同业竞争格局
        secTitle('九', '同业竞争格局') +
        '<table style="width:100%;border-collapse:collapse;font-size:12px;text-align:center;">' +
          '<tr style="background:#EFF6FF;font-weight:700;color:#1E3A8A;">' +
            '<th style="border:1px solid #CBD5E1;padding:7px;width:52px;">序号</th><th style="border:1px solid #CBD5E1;padding:7px;">区域同业企业</th><th style="border:1px solid #CBD5E1;padding:7px;width:130px;">综合风险指数</th>' +
          '</tr>' +
          X.peer.rivals.map(function (r, i) {
            return '<tr><td style="border:1px solid #CBD5E1;padding:7px;">' + (i + 1) + '</td><td style="border:1px solid #CBD5E1;padding:7px;text-align:left;">' + U.esc(r.name) + '</td><td style="border:1px solid #CBD5E1;padding:7px;">' + r.score + '</td></tr>';
          }).join('') +
        '</table>' +
        '<div style="margin-top:6px;text-indent:2em;text-align:justify;">在区域同类企业中，该企业综合竞争力约位居第 ' + X.peer.rank + ' 位；竞争优势画像：' + U.esc(X.peer.edge) + '。整体竞争格局清晰，未见恶性价格竞争信号。</div>' +
        // 十、所处行业分析
        secTitle('十', '所处行业分析') +
        '<div style="text-indent:2em;text-align:justify;"><b>行业坐标：</b>该企业所属' + U.esc(e.industryName) + '行业，注册于' + U.esc(e.districtName) + '，产业区位匹配度较高。</div>' +
        '<div style="text-indent:2em;text-align:justify;margin-top:4px;"><b>行业景气度：</b>本年度行业规模预计增长 ' + X.ind.growth + '，目前处于' + X.ind.phase + '。</div>' +
        '<div style="text-indent:2em;text-align:justify;margin-top:4px;"><b>政策环境：</b>' + U.esc(X.ind.policy) + '，行业发展外部环境总体有利。</div>' +
        // 十一、投融资与信贷状况
        secTitle('十一', '投融资与信贷状况') +
        '<table style="width:100%;border-collapse:collapse;font-size:12px;text-align:center;">' +
          '<tr style="background:#EFF6FF;font-weight:700;color:#1E3A8A;">' +
            '<th style="border:1px solid #CBD5E1;padding:7px;">银行授信总额</th><th style="border:1px solid #CBD5E1;padding:7px;">贷款余额</th><th style="border:1px solid #CBD5E1;padding:7px;">股权融资轮次</th>' +
            '<th style="border:1px solid #CBD5E1;padding:7px;">最新轮次</th><th style="border:1px solid #CBD5E1;padding:7px;">投资方</th>' +
          '</tr>' +
          '<tr>' +
            '<td style="border:1px solid #CBD5E1;padding:7px;">' + X.fin.credit + ' 万元</td>' +
            '<td style="border:1px solid #CBD5E1;padding:7px;">' + X.fin.loan + ' 万元</td>' +
            '<td style="border:1px solid #CBD5E1;padding:7px;">' + X.fin.rounds + ' 轮</td>' +
            '<td style="border:1px solid #CBD5E1;padding:7px;">' + (X.fin.latest || '—') + '</td>' +
            '<td style="border:1px solid #CBD5E1;padding:7px;">' + (X.fin.investor ? U.esc(X.fin.investor) : '—') + '</td>' +
          '</tr>' +
        '</table>' +
        '<div style="margin-top:6px;text-indent:2em;text-align:justify;">' + (X.fin.rounds > 0 ? '该企业已获专业投资机构入股，资本运作能力获得市场认可。' : '该企业暂无公开股权融资记录，扩张主要依赖自身积累与银行信贷。') + (X.fin.loan > 2400 ? '当前贷款余额偏高，需关注偿债压力与现金流匹配度。' : '信贷使用稳健，偿债能力与现金流总体匹配。') + '</div>' +
        // 十二、八维风险评分
        secTitle('十二', '八维风险评分') +
        '<table style="width:100%;border-collapse:collapse;font-size:12px;text-align:center;">' +
          '<tr style="background:#EFF6FF;font-weight:700;color:#1E3A8A;">' +
            '<th style="border:1px solid #CBD5E1;padding:7px;width:44px;">序号</th><th style="border:1px solid #CBD5E1;padding:7px;">风险维度</th><th style="border:1px solid #CBD5E1;padding:7px;width:76px;">权重</th>' +
            '<th style="border:1px solid #CBD5E1;padding:7px;width:76px;">得分</th><th style="border:1px solid #CBD5E1;padding:7px;">评价</th>' +
          '</tr>' + dimRows + '</table>' +
        '<div style="margin-top:8px;font-size:11px;color:#64748B;">注：综合指数 ≥65 为重大风险，≥45 为较高风险，≥25 为一般风险，其余为关注风险。</div>' +
        // 十三、数据来源与研判说明
        secTitle('十三', '数据来源与研判说明') +
        '<div style="font-size:12px;"><b>数据来源：</b>' + j.sources.map(U.esc).join('、') + '。</div>' +
        '<div style="font-size:12px;margin-top:4px;"><b>研判时间：</b>' + U.esc(j.time || (j.lastJudge ? j.lastJudge + '（档案研判）' : '-')) + '；<b>上次研判：</b>' + (j.prevScore != null ? j.prevScore + ' 分（' + U.esc(j.lastJudge || '-') + '）' : '首次研判') + '。</div>' +
        '<div style="font-size:12px;margin-top:4px;"><b>研判模型：</b>平台 AI 智能体围绕基本信息、股权关系、经营履约、招投标、知识产权、客户与供应商、同业竞争、行业环境、投融资信贷及多维风险敞口等 11 个维度完成全面研判，基于八维加权风险模型与多源数据交叉验证生成，结论可追溯、可审计。</div>' +
        // 尾部
        '<div style="margin-top:40px;border-top:1px solid #CBD5E1;padding-top:12px;display:flex;justify-content:space-between;font-size:11px;color:#94A3B8;">' +
          '<span>招商企业服务与智慧监管平台 · AI 智能体</span>' +
          '<span>生成日期：' + reportDateStr() + '</span>' +
        '</div>' +
      '</div>';
  }

  // ---- 文字版 PDF 导出（双轨之一）：jsPDF + 内嵌中文字体子集，矢量文字可选中、可检索、体积小 ----

  // 字体子集按需懒加载（assets/vendor/pdf-font-zh.js 由 tools/make_pdf_font.py 生成）
  var pdfFontPromise = null;
  function ensurePdfFont() {
    if (window.PDF_FONT_ZH) return Promise.resolve();
    if (pdfFontPromise) return pdfFontPromise;
    pdfFontPromise = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = 'assets/vendor/pdf-font-zh.js';
      s.onload = function () { window.PDF_FONT_ZH ? resolve() : reject(new Error('字体数据缺失')); };
      s.onerror = function () { pdfFontPromise = null; reject(new Error('字体文件加载失败')); };
      document.head.appendChild(s);
    });
    return pdfFontPromise;
  }

  function hexRgb(h) {
    h = String(h || '').replace('#', '');
    return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)];
  }

  // 组装 A4 文字版报告（十三章，与打印版同源同构）
  function buildPdfDoc(e, j) {
    var jsPDF = window.jspdf.jsPDF;
    var doc = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' });
    if (!doc.autoTable) throw new Error('jspdf-autotable 未加载');
    doc.addFileToVFS('zh.ttf', window.PDF_FONT_ZH);
    doc.addFont('zh.ttf', 'Zh', 'normal');
    doc.addFont('zh.ttf', 'Zh', 'bold');

    var PW = doc.internal.pageSize.getWidth(), PH = doc.internal.pageSize.getHeight();
    var ML = 46, MR = 46, MB = 56, TOPN = 58;   // 页边距与续页顶部（预留隔页页眉）
    var CW = PW - ML - MR;
    var y = 52;
    var X = simExtraOf(e), cr = commitRateOf(e), lv = M.LEVELS[e.riskLevel];

    function need(h) { if (y + h > PH - MB) { doc.addPage(); y = TOPN; } }

    function secTitle(n, t) {
      need(44);
      y += 12;
      doc.setFillColor(37, 99, 235);
      doc.rect(ML, y + 2, 3, 12, 'F');
      doc.setFont('Zh', 'bold'); doc.setFontSize(11.5); doc.setTextColor(15, 23, 42);
      doc.text(n + '、' + t, ML + 9, y + 11.5);
      y += 21;
    }

    function para(txt, indent, small, gray) {
      indent = indent || 0;
      doc.setFont('Zh', 'normal'); doc.setFontSize(small ? 8.5 : 10);
      doc.setTextColor(gray ? 100 : 31, gray ? 116 : 41, gray ? 139 : 55);
      var lh = small ? 14 : 16.5;
      var lines = doc.splitTextToSize(String(txt == null ? '' : txt), CW - indent);
      for (var i = 0; i < lines.length; i++) { need(lh); doc.text(lines[i], ML + indent, y + 10); y += lh; }
    }

    // 加粗引导词段落（如「数据来源：」），续行悬挂对齐
    function labeledPara(label, rest) {
      doc.setFont('Zh', 'bold'); doc.setFontSize(10);
      var lw = doc.getTextWidth(label) + 3;
      doc.setFont('Zh', 'normal'); doc.setTextColor(31, 41, 55);
      var lines = doc.splitTextToSize(String(rest == null ? '' : rest), CW - 20 - lw);
      for (var i = 0; i < lines.length; i++) {
        need(16.5);
        if (i === 0) {
          doc.setFont('Zh', 'bold'); doc.setTextColor(15, 23, 42);
          doc.text(label, ML + 20, y + 10);
          doc.setFont('Zh', 'normal'); doc.setTextColor(31, 41, 55);
        }
        doc.text(lines[i], ML + 20 + lw, y + 10);
        y += 16.5;
      }
    }

    function numList(items) {
      doc.setFont('Zh', 'normal'); doc.setFontSize(10); doc.setTextColor(31, 41, 55);
      (items || []).forEach(function (t, i) {
        var lines = doc.splitTextToSize(String(t), CW - 16);
        for (var k = 0; k < lines.length; k++) {
          need(16.5);
          if (k === 0) {
            doc.setTextColor(37, 99, 235);
            doc.text((i + 1) + '.', ML + 2, y + 10);
            doc.setTextColor(31, 41, 55);
          }
          doc.text(lines[k], ML + 16, y + 10);
          y += 16.5;
        }
      });
      y += 4;
    }

    function pdfTable(cfg) {
      need(64);
      cfg.startY = y;
      cfg.margin = { left: ML, right: MR, top: TOPN, bottom: MB };
      cfg.theme = 'grid';
      cfg.styles = Object.assign({
        font: 'Zh', fontSize: 9,
        cellPadding: { top: 4.5, left: 6, bottom: 4.5, right: 6 },
        textColor: [31, 41, 55], lineColor: [203, 213, 225], lineWidth: 0.5,
        valign: 'middle', overflow: 'linebreak'
      }, cfg.styles || {});
      cfg.headStyles = Object.assign({
        font: 'Zh', fontStyle: 'bold', fillColor: [239, 246, 255], textColor: [30, 58, 138],
        halign: 'center', lineColor: [147, 197, 253], lineWidth: 0.5
      }, cfg.headStyles || {});
      doc.autoTable(cfg);
      y = doc.lastAutoTable.finalY + 12;
    }

    // 页眉（仅首页）：平台名 + 密级徽标 + 编号 + 蓝色分隔线
    doc.setFont('Zh', 'bold'); doc.setFontSize(13); doc.setTextColor(15, 23, 42);
    doc.text('招商企业服务与智慧监管平台', ML, y + 10);
    doc.setFont('Zh', 'normal'); doc.setFontSize(8); doc.setTextColor(100, 116, 139);
    doc.text('招商企业服务与智慧监管平台', ML, y + 22);
    var badgeW = 78;
    doc.setFillColor(254, 243, 199);
    doc.rect(PW - MR - badgeW, y - 4, badgeW, 17, 'F');
    doc.setFont('Zh', 'bold'); doc.setFontSize(9); doc.setTextColor(146, 64, 14);
    doc.text('内 部 资 料', PW - MR - badgeW / 2, y + 7, { align: 'center' });
    doc.setFont('Zh', 'normal'); doc.setFontSize(8); doc.setTextColor(100, 116, 139);
    doc.text('编号：QY-' + String(e.id).replace(/[^A-Za-z0-9]/g, '') + '-' + reportDateStr().replace(/-/g, ''), PW - MR, y + 26, { align: 'right' });
    doc.setDrawColor(37, 99, 235); doc.setLineWidth(2);
    doc.line(ML, y + 33, PW - MR, y + 33);
    doc.setLineWidth(0.5);
    y += 48;

    // 标题
    doc.setFont('Zh', 'bold'); doc.setFontSize(20); doc.setTextColor(15, 23, 42);
    doc.text('企 业 综 合 研 判 报 告', PW / 2, y + 22, { align: 'center' });
    doc.setFont('Zh', 'normal'); doc.setFontSize(11); doc.setTextColor(71, 85, 105);
    doc.text('—— ' + e.name + ' ——', PW / 2, y + 40, { align: 'center' });
    y += 52;

    // 基本信息
    var kvL1 = 84, kvL2 = 92, kvV = (CW - kvL1 - kvL2) / 2;
    pdfTable({
      body: [
        ['企业名称', { content: e.name, styles: { fontStyle: 'bold' } }, '统一社会信用代码', e.creditCode],
        ['法定代表人', e.legal, '成立时间', e.found],
        ['注册资本', e.overview.regCapital, '企业规模', e.scale],
        ['所属行业', e.industryName, '所在区县', e.districtName],
        ['经营状态', e.status.biz, '信用状态', e.status.credit],
        ['综合风险指数', { content: e.riskScore + '（' + lv.name + '）', styles: { textColor: hexRgb(lv.color), fontStyle: 'bold' } },
         '研判置信度', { content: j.confidence + '%', styles: { fontStyle: 'bold' } }]
      ],
      columnStyles: {
        0: { cellWidth: kvL1, fillColor: [248, 250, 252], textColor: [51, 65, 85], fontStyle: 'bold' },
        1: { cellWidth: kvV },
        2: { cellWidth: kvL2, fillColor: [248, 250, 252], textColor: [51, 65, 85], fontStyle: 'bold' },
        3: { cellWidth: kvV }
      }
    });

    // 一~三章
    secTitle('一', '研判摘要');
    para(j.summary, 20);
    secTitle('二', '核心优势');
    numList(j.strengths);
    secTitle('三', '关注风险与处置建议');
    numList(j.risks);

    // 四、经营与履约概览
    secTitle('四', '经营与履约概览');
    pdfTable({
      head: [['年营收', '纳税总额', '员工数', '平均履约率', '承诺完成率']],
      body: [[e.overview.revenue, e.overview.tax, Number(e.overview.employees).toLocaleString() + ' 人',
        e.status.performRate + '%', cr != null ? cr + '%' : '—']],
      columnStyles: { 0: { cellWidth: CW / 5 }, 1: { cellWidth: CW / 5 }, 2: { cellWidth: CW / 5 }, 3: { cellWidth: CW / 5 }, 4: { cellWidth: CW / 5 } },
      styles: { halign: 'center' }
    });

    // 五、股权结构简析
    secTitle('五', '股权结构简析');
    if (e.shareholders && e.shareholders.length) {
      pdfTable({
        head: [['股东名称', '持股比例']],
        body: e.shareholders.map(function (s) { return [s.name, s.ratio + '%']; }),
        columnStyles: { 0: { cellWidth: CW - 130 }, 1: { cellWidth: 130 } },
        styles: { halign: 'center' }
      });
    } else {
      para('暂无登记股东信息。');
    }

    // 六、招投标情况
    secTitle('六', '招投标情况（近三年）');
    pdfTable({
      head: [['参与招投标(次)', '中标(次)', '中标率', '中标金额合计', '最近中标时间']],
      body: [[X.tender.total, X.tender.win, { content: X.tender.rate + '%', styles: { fontStyle: 'bold' } }, X.tender.amount, X.tender.lastDate]],
      styles: { halign: 'center' }
    });
    para('该企业近三年招投标参与整体活跃' + (X.tender.rate >= 35 ? '，中标率高于区域平均水平，市场竞争力较强' : '') + '；经与公示处罚信息比对，未发现围标、串标、废标等违规记录。', 20);

    // 七、知识产权情况
    secTitle('七', '知识产权情况');
    pdfTable({
      head: [['专利总数(项)', '其中发明专利', '软件著作权(项)', '注册商标(件)', '知识产权纠纷']],
      body: [[X.ip.patent, X.ip.invention, X.ip.soft, X.ip.brand, X.ip.dispute ? '1 起' : '无']],
      styles: { halign: 'center' }
    });
    para('该企业专利与软件著作权储备与其' + e.industryName + '业务定位相匹配，发明专利占比 ' + (X.ip.patent > 0 ? Math.round(X.ip.invention / X.ip.patent * 100) : 0) + '%。' + (X.ip.dispute ? '存在知识产权纠纷 1 起，需关注权属与涉诉进展。' : '未发现知识产权纠纷记录。'), 20);

    // 八、客户与供应商结构
    secTitle('八', '客户与供应商结构');
    pdfTable({
      head: [['序号', '主要客户名称', '销售占比']],
      body: X.cust.list.map(function (c, i) { return [String(i + 1), { content: c.name, styles: { halign: 'left' } }, c.share + '%']; }),
      columnStyles: { 0: { cellWidth: 40 }, 2: { cellWidth: 110 } },
      styles: { halign: 'center' }
    });
    para('主要供应商：' + X.supp.list.join('、') + '。第一大客户销售占比 ' + X.cust.conc + '%' + (X.cust.conc >= 26 ? '，客户集中度偏高，存在一定大客户依赖，建议拓展客户面分散经营风险' : '，客户结构均衡，经营独立性较好') + '；供应链合作关系稳定，未见断供风险信号。', 20);

    // 九、同业竞争格局
    secTitle('九', '同业竞争格局');
    pdfTable({
      head: [['序号', '区域同业企业', '综合风险指数']],
      body: X.peer.rivals.map(function (r, i) { return [String(i + 1), { content: r.name, styles: { halign: 'left' } }, String(r.score)]; }),
      columnStyles: { 0: { cellWidth: 40 }, 2: { cellWidth: 110 } },
      styles: { halign: 'center' }
    });
    para('在区域同类企业中，该企业综合竞争力约位居第 ' + X.peer.rank + ' 位；竞争优势画像：' + X.peer.edge + '。整体竞争格局清晰，未见恶性价格竞争信号。', 20);

    // 十、所处行业分析
    secTitle('十', '所处行业分析');
    labeledPara('行业坐标：', '该企业所属' + e.industryName + '行业，注册于' + e.districtName + '，产业区位匹配度较高。');
    labeledPara('行业景气度：', '本年度行业规模预计增长 ' + X.ind.growth + '，目前处于' + X.ind.phase + '。');
    labeledPara('政策环境：', X.ind.policy + '，行业发展外部环境总体有利。');

    // 十一、投融资与信贷状况
    secTitle('十一', '投融资与信贷状况');
    pdfTable({
      head: [['银行授信总额', '贷款余额', '股权融资轮次', '最新轮次', '投资方']],
      body: [[X.fin.credit + ' 万元', X.fin.loan + ' 万元', X.fin.rounds + ' 轮', X.fin.latest || '—', X.fin.investor || '—']],
      styles: { halign: 'center' }
    });
    para((X.fin.rounds > 0 ? '该企业已获专业投资机构入股，资本运作能力获得市场认可。' : '该企业暂无公开股权融资记录，扩张主要依赖自身积累与银行信贷。') + (X.fin.loan > 2400 ? '当前贷款余额偏高，需关注偿债压力与现金流匹配度。' : '信贷使用稳健，偿债能力与现金流总体匹配。'), 20);

    // 十二、八维风险评分
    secTitle('十二', '八维风险评分');
    pdfTable({
      head: [['序号', '风险维度', '权重', '得分', '评价']],
      body: M.RISK_DIMS.filter(function (d) { return d.weight > 0; }).map(function (d, i) {
        var v = e.risks[d.key] || 0;
        var c = v >= 65 ? '#C0392B' : (v >= 45 ? '#D35400' : (v >= 25 ? '#B7950B' : '#2471A3'));
        return [String(i + 1), d.name, Math.round(d.weight * 100) + '%',
          { content: String(v), styles: { textColor: hexRgb(c), fontStyle: 'bold' } }, ctrlWord(v)];
      }),
      columnStyles: { 0: { cellWidth: 36 }, 2: { cellWidth: 60 }, 3: { cellWidth: 60 } },
      styles: { halign: 'center' }
    });
    para('注：综合指数 ≥65 为重大风险，≥45 为较高风险，≥25 为一般风险，其余为关注风险。', 0, true, true);

    // 十三、数据来源与研判说明
    secTitle('十三', '数据来源与研判说明');
    labeledPara('数据来源：', j.sources.join('、') + '。');
    labeledPara('研判时间：', (j.time || (j.lastJudge ? j.lastJudge + '（档案研判）' : '-')) +
      '；上次研判：' + (j.prevScore != null ? j.prevScore + ' 分（' + (j.lastJudge || '-') + '）' : '首次研判') + '。');
    labeledPara('研判模型：', '平台 AI 智能体围绕基本信息、股权关系、经营履约、招投标、知识产权、客户与供应商、同业竞争、行业环境、投融资信贷及多维风险敞口等 11 个维度完成全面研判，基于八维加权风险模型与多源数据交叉验证生成，结论可追溯、可审计。');

    // 统一补页眉页脚：续页隔页页眉 + 全部页脚（落款 / 生成日期 / 页码）
    var pages = doc.getNumberOfPages();
    for (var p = 1; p <= pages; p++) {
      doc.setPage(p);
      if (p > 1) {
        doc.setFont('Zh', 'normal'); doc.setFontSize(8); doc.setTextColor(148, 163, 184);
        doc.text('企业综合研判报告 · ' + e.name, PW - MR, 34, { align: 'right' });
        doc.setDrawColor(226, 232, 240);
        doc.line(ML, 40, PW - MR, 40);
      }
      doc.setDrawColor(226, 232, 240);
      doc.line(ML, PH - 46, PW - MR, PH - 46);
      doc.setFont('Zh', 'normal'); doc.setFontSize(7.5); doc.setTextColor(148, 163, 184);
      doc.text('招商企业服务与智慧监管平台 · AI 智能体', ML, PH - 34);
      doc.text('生成日期：' + reportDateStr() + '    第 ' + p + ' 页 / 共 ' + pages + ' 页', PW - MR, PH - 34, { align: 'right' });
    }
    return doc;
  }

  APP.exportJudgeReport = function () {
    var e = M.entById(state.ent);
    if (!e) return;
    var j = aiJudge[e.id] || e.ai;
    if (!j) { C.toast('暂无可导出的研判报告，请先点击「重新分析研判」', 'warning'); return; }

    // jsPDF 缺失时回退到打印视图（另存为 PDF）
    if (!(window.jspdf && window.jspdf.jsPDF)) { printReportView(e, j); return; }
    C.toast('正在生成文字版 PDF…', 'info');
    ensurePdfFont()
      .then(function () { return buildPdfDoc(e, j); })
      .then(function (doc) {
        doc.save(e.name + '_企业综合研判报告_' + reportDateStr() + '.pdf');
        C.toast('PDF 已导出（文字版，可选中检索）', 'success');
      })
      .catch(function () { printReportView(e, j); });
  };

  APP.printJudgeReport = function () {
    var e = M.entById(state.ent);
    if (!e) return;
    var j = aiJudge[e.id] || e.ai;
    if (!j) { C.toast('暂无可导出的研判报告，请先点击「重新分析研判」', 'warning'); return; }
    printReportView(e, j);
  };

  // ---- 文字版 PDF 导出（双轨之二）：排版化打印视图，浏览器「另存为 PDF」----
  function printReportView(e, j) {
    var w = window.open('', '_blank');
    if (!w) { C.toast('浏览器拦截了弹出窗口，请允许后重试', 'warning'); return; }
    w.document.write('<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>' + U.esc(e.name) + ' 企业综合研判报告</title>' +
      '<style>' +
      '@page { size: A4 portrait; margin: 16mm 14mm 18mm; }' +
      '* { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }' +
      'body { margin: 0; color: #1F2937; font-family: "Microsoft YaHei","PingFang SC",sans-serif; font-size: 12px; line-height: 1.9; }' +
      'table { width: 100%; border-collapse: collapse; page-break-inside: avoid; }' +
      'tr, li { page-break-inside: avoid; break-inside: avoid; }' +
      'div[style*="border-left:4px solid #2563EB"] { page-break-after: avoid; break-after: avoid; }' +
      '.rpt-bar { position: fixed; top: 12px; right: 16px; display: flex; gap: 8px; }' +
      '.rpt-bar button { padding: 6px 16px; border: 1px solid #2563EB; background: #2563EB; color: #fff; border-radius: 6px; font-size: 13px; cursor: pointer; font-family: inherit; }' +
      '.rpt-bar button:hover { background: #1D4ED8; }' +
      '@media print { .rpt-bar { display: none !important; } }' +
      '@media screen { body { background: #E2E8F0; padding: 28px 0; } body > div:first-of-type { margin: 0 auto; box-shadow: 0 2px 18px rgba(15,23,42,.18); } }' +
      '</style></head><body>' + buildReportHtml(e, j) +
      '<div class="rpt-bar"><button onclick="window.print()">打 印</button></div>' +
      '<script>window.onload=function(){setTimeout(function(){window.print();},300);};<\/script></body></html>');
    w.document.close();
    C.toast('已打开打印视图，可在打印对话框中选择「另存为 PDF」', 'info');
  }

  // 趋势图窄屏阈值：容器不足 480px 时收紧边距、隐藏轴名，避免轴标签挤压重叠
  var TREND_NARROW = 480;
  var _trendResizeH = null;

  function trendOption(w) {
    var narrow = w > 0 && w < TREND_NARROW;
    var e = M.entById(state.ent);
    return {
      tooltip: { trigger: 'axis' },
      legend: {
        data: ['营收(亿)', '纳税(万)', '投资(万)'], top: 0,
        itemGap: narrow ? 8 : 10, textStyle: { fontSize: narrow ? 10 : 11 }
      },
      // containLabel 让绘图区自动避让轴标签，窄屏下边距可收到最小
      grid: {
        left: narrow ? 4 : 12, right: narrow ? 4 : 12,
        top: narrow ? 34 : 30, bottom: narrow ? 4 : 8,
        containLabel: true
      },
      xAxis: {
        type: 'category', data: M.MONTHS,
        axisLabel: { fontSize: narrow ? 9 : 10, interval: 'auto', hideOverlap: true }
      },
      yAxis: [
        // 窄屏隐藏轴名（单位已在图例中体现），把宽度留给数值标签
        { type: 'value', name: narrow ? '' : '营收(亿)', axisLabel: { fontSize: narrow ? 9 : 10 } },
        { type: 'value', name: narrow ? '' : '万元', axisLabel: { fontSize: narrow ? 9 : 10 } }
      ],
      series: [
        { name: '营收(亿)', type: 'line', smooth: true, data: e.operation.revenue,
          itemStyle: { color: '#2563EB' },
          areaStyle: { color: 'rgba(37,99,235,.12)' } },
        { name: '纳税(万)', type: 'line', yAxisIndex: 1, smooth: true, data: e.operation.tax,
          itemStyle: { color: '#F97316' } },
        { name: '投资(万)', type: 'line', yAxisIndex: 1, smooth: true, data: e.operation.invest,
          itemStyle: { color: '#22C55E' } }
      ]
    };
  }

  function renderTrendChart() {
    var e = M.entById(state.ent);
    if (!e) return;
    var dom = U.$('#c_profile_trend');
    if (!dom || !dom.offsetWidth) return;
    APP.disposeCharts();
    var chart = mkChart(dom, trendOption(dom.offsetWidth));

    // 窗口尺寸变化时重算布局（先移除上一轮监听，避免重复绑定）
    if (_trendResizeH) { window.removeEventListener('resize', _trendResizeH); _trendResizeH = null; }
    _trendResizeH = function () {
      var el = U.$('#c_profile_trend');
      var gone = !el || !chart || (chart.isDisposed && chart.isDisposed());
      if (gone) {
        if (_trendResizeH) { window.removeEventListener('resize', _trendResizeH); _trendResizeH = null; }
        return;
      }
      var w = el.offsetWidth;
      if (!w) return;
      chart.resize();
      chart.setOption(trendOption(w), true);
    };
    window.addEventListener('resize', _trendResizeH);
  }

  APP.registerRenderer('profile', renderProfile);
})();
