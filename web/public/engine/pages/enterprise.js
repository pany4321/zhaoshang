/* ============================================================
 * 页面：企业概况（企业列表 + 多条件查询 + 筛选 + 排序 + 分页 + 导出）
 * ============================================================ */
(function () {
  'use strict';
  var U = APP.U;
  var state = APP.state;
  var C = APP.Components;
  var M = window.MOCK;

  var PAGE_SIZE = 20;
  var kwState = { active: false, pos: null };

  // 列配置定义：key / label / width / fixed（true 必选，不可隐藏）/ 默认显示
  var COLUMNS = [
    { key: 'name',     label: '企业名称',    width: '22%',   fixed: true  },
    { key: 'tag',      label: '企业标签',    width: '160px', fixed: false },
    { key: 'scale',    label: '规模',        width: '90px',  fixed: false },
    { key: 'credit',   label: '信用状态',    width: '100px', fixed: false },
    { key: 'revenue',  label: '营收',        width: '110px', fixed: false },
    { key: 'tax',      label: '纳税',        width: '100px', fixed: false },
    { key: 'employees',label: '员工数',      width: '90px',  fixed: false },
    { key: 'perform',  label: '履约率',      width: '80px',  fixed: false },
    { key: 'risk',     label: '风险等级',    width: '130px', fixed: false },
    { key: 'legal',    label: '法定代表人',  width: '100px', fixed: false },
    { key: 'regCap',   label: '注册资本',    width: '110px', fixed: false },
    { key: 'found',    label: '成立日期',    width: '110px', fixed: false },
    { key: 'policy',   label: '匹配政策数',  width: '90px',  fixed: false },
  ];
  // 默认显示列（key 列表），其余隐藏
  var DEFAULT_VISIBLE = ['name', 'scale', 'credit', 'revenue', 'tax', 'employees', 'perform', 'risk'];
  // 列设置状态（保存在模块级，跨渲染保留）
  var colVisible = {};
  COLUMNS.forEach(function (c) {
    colVisible[c.key] = c.fixed || DEFAULT_VISIBLE.indexOf(c.key) >= 0;
  });
  // 列设置弹窗状态
  var colSettingsOpen = false;
  // 企业对比选中集合（挂在 state 上，跨页保留；compareIds 为同一数组的引用）
  if (!state.compareEntIds) state.compareEntIds = [];
  var compareIds = state.compareEntIds;

  function renderEnterprise() {
    var f = state.filter.enterprise;

    // 筛选
    var list = M.ENTERPRISES.filter(function (e) {
      if (f.keyword && e.name.indexOf(f.keyword) < 0 && e.creditCode.indexOf(f.keyword) < 0 && e.legal.indexOf(f.keyword) < 0) return false;
      if (f.risk && e.riskLevel !== f.risk) return false;
      if (f.industry && e.industry !== f.industry) return false;
      if (f.district && f.district !== 'all' && e.district !== f.district) return false;
      if (f.scale && e.scale !== f.scale) return false;
      if (f.tag && (e.tags || []).indexOf(f.tag) < 0) return false;
      return true;
    });

    // 收集全部企业标签（去重），用于标签筛选
    var allTags = {};
    M.ENTERPRISES.forEach(function (e) {
      (e.tags || []).forEach(function (t) { allTags[t] = true; });
    });
    allTags = Object.keys(allTags).sort();

    // 排序
    var sortKey = f.sort;
    list.sort(function (a, b) {
      var av, bv;
      switch (sortKey) {
        case 'revenueDesc': av = a.overview.revenueWan; bv = b.overview.revenueWan; return bv - av;
        case 'revenueAsc':  av = a.overview.revenueWan; bv = b.overview.revenueWan; return av - bv;
        case 'riskDesc':    av = a.riskScore; bv = b.riskScore; return bv - av;
        case 'riskAsc':     av = a.riskScore; bv = b.riskScore; return av - bv;
        case 'taxDesc':     av = a.overview.taxWan; bv = b.overview.taxWan; return bv - av;
        case 'employeesDesc': av = a.overview.employees; bv = b.overview.employees; return bv - av;
        case 'performDesc': av = a.status.performRate; bv = b.status.performRate; return bv - av;
        case 'performAsc':  av = a.status.performRate; bv = b.status.performRate; return av - bv;
        default: return b.riskScore - a.riskScore;
      }
    });

    // 分页
    var total = list.length;
    var totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (f.page > totalPages) f.page = totalPages;
    var pageData = list.slice((f.page - 1) * PAGE_SIZE, f.page * PAGE_SIZE);

    // 工具栏选项
    var industryOpts = '<option value="">全部行业</option>' +
      M.INDUSTRIES.map(function (i) { return '<option value="' + i.key + '"' + (f.industry === i.key ? ' selected' : '') + '>' + U.esc(i.name) + '</option>'; }).join('');
    var districtOpts = '<option value="all">全部区县</option>' +
      M.DISTRICTS.map(function (d) { return '<option value="' + d.key + '"' + (f.district === d.key ? ' selected' : '') + '>' + U.esc(d.name) + '</option>'; }).join('');
    var scaleOpts = '<option value="">全部规模</option>' +
      ['大型企业','中型企业','小型企业','微型企业'].map(function (s) { return '<option value="' + s + '"' + (f.scale === s ? ' selected' : '') + '>' + s + '</option>'; }).join('');
    var tagOpts = '<option value="">全部标签</option>' +
      allTags.map(function (t) { return '<option value="' + U.esc(t) + '"' + (f.tag === t ? ' selected' : '') + '>' + U.esc(t) + '</option>'; }).join('');
    var riskOpts = '<option value="">全部风险</option>' +
      [['red','重大风险'],['orange','较高风险'],['yellow','一般风险'],['blue','关注风险']].map(function (r) {
        return '<option value="' + r[0] + '"' + (f.risk === r[0] ? ' selected' : '') + '>' + r[1] + '</option>';
      }).join('');

    // 排序头
    function th(label, key, width, sortable, visible) {
      var hideStyle = visible === false ? 'display:none;' : '';
      if (sortable === false) {
        return '<th data-col="' + key + '" style="width:' + (width || 'auto') + ';' + hideStyle + ';">' + U.esc(label) + '</th>';
      }
      var active = f.sort === key + 'Desc' || f.sort === key + 'Asc';
      var dir = active ? (f.sort === key + 'Desc' ? 'desc' : 'asc') : '';
      return '<th class="sort-th' + (active ? ' sorted-' + dir : '') + '" data-sort="' + key + '" data-col="' + key + '" style="width:' + (width || 'auto') + ';' + hideStyle + ';">' +
        U.esc(label) + '<span class="sort-icon"><span class="si-up">▲</span><span class="si-dn">▼</span></span></th>';
    }

    // 获取单元格内容（按列 key）
    function cellContent(e, key) {
      switch (key) {
        case 'name':
          return '<div class="ent-cell"><div class="ent-name-cell">' + U.esc(e.name) + '</div>' +
            '<div class="ent-sub-cell"><span>' + U.esc(e.industryName) + '</span> · <span>' + U.esc(e.districtName) + '</span></div></div>';
        case 'tag':
          var tagHtml = (e.tags || []).slice(0, 3).map(function (t) {
            return '<span class="tag tag-sm tag-filter" data-tag="' + U.esc(t) + '" title="按此标签筛选">' + U.esc(t) + '</span>';
          }).join('');
          if ((e.tags || []).length > 3) tagHtml += '<span class="muted" style="font-size:11px;"> +' + (e.tags.length - 3) + '</span>';
          return tagHtml || '<span class="muted">-</span>';
        case 'scale':
          return '<span class="num">' + U.esc(e.scale) + '</span>';
        case 'credit':
          var cc = e.status.credit === '优良' ? '#22C55E' : e.status.credit === '良好' ? '#3B82F6' : e.status.credit === '关注' ? '#F97316' : '#e03131';
          return '<span style="color:' + cc + ';">●</span> ' + U.esc(e.status.credit);
        case 'revenue':
          return '<span class="num">' + U.esc(e.overview.revenue) + '</span>';
        case 'tax':
          return '<span class="num">' + U.esc(e.overview.tax) + '</span>';
        case 'employees':
          return '<span class="num">' + e.overview.employees.toLocaleString() + '</span>';
        case 'perform':
          var pc = e.status.performRate >= 80 ? '#22C55E' : e.status.performRate >= 50 ? '#F97316' : '#e03131';
          return '<span class="num" style="color:' + pc + ';font-weight:600;">' + e.status.performRate + '%</span>';
        case 'risk':
          return C.lvlBadge(e.riskLevel) + ' <span class="muted" style="font-size:11px;">' + e.riskScore + '分</span>';
        case 'legal':
          return U.esc(e.legal);
        case 'regCap':
          return '<span class="num">' + U.esc(e.regCapitalFmt) + '</span>';
        case 'found':
          return U.esc(e.found);
        case 'policy':
          return '<span class="num">' + (e.policies ? e.policies.length : 0) + ' 项</span>';
        default:
          return '';
      }
    }

    // 表头：所有列都渲染，不可见列设 display:none，列设置可直接 DOM 切换
    var theadHtml =
      '<th style="width:40px;text-align:center;">' +
        '<input type="checkbox" id="chkAllEnt" style="width:14px;height:14px;cursor:pointer;" title="全选当前页"/>' +
      '</th>' +
      COLUMNS.map(function (c) {
        var label = c.key === 'name' ? '企业名称/行业/区县' : c.label;
        var sortable = c.key === 'name' || c.key === 'tag' || c.key === 'legal' || c.key === 'found' ? false : true;
        return th(label, c.key, c.width, sortable, colVisible[c.key]);
      }).join('');

    // 表格行：所有列都渲染，不可见列设 display:none，列设置可直接 DOM 切换
    var rowsHtml = pageData.map(function (e) {
      var checked = compareIds.indexOf(e.id) >= 0 ? ' checked' : '';
      var cells = COLUMNS.map(function (c) {
        var hideStyle = colVisible[c.key] ? '' : 'display:none;';
        return '<td data-col="' + c.key + '" style="' + hideStyle + '">' + cellContent(e, c.key) + '</td>';
      }).join('');
      return '<tr class="ent-row" data-id="' + e.id + '">' +
        '<td style="text-align:center;">' +
          '<input type="checkbox" class="ent-chk" data-id="' + e.id + '"' + checked + ' style="width:14px;height:14px;cursor:pointer;"/>' +
        '</td>' + cells +
        '<td style="width:80px;"><button class="btn sm primary">查看画像</button></td>' +
      '</tr>';
    }).join('');

    var emptyOrTable = total === 0
      ? C.emptyHtml('🔍', '未找到符合条件的企业', '清除筛选')
      : '<div class="table-wrap"><table class="tbl tbl-hover">' +
          '<thead><tr>' + theadHtml + '<th style="width:90px;">操作</th></tr></thead>' +
          '<tbody>' + rowsHtml + '</tbody>' +
        '</table></div>';

    // 顶部统计条（随筛选结果动态更新，与驾驶舱"全市全量"形成互补）
    var selRevWan = list.reduce(function(s,e){return s + e.overview.revenueWan;},0);
    var selTaxWan = list.reduce(function(s,e){return s + e.overview.taxWan;},0);
    var selEmp = list.reduce(function(s,e){return s + e.overview.employees;},0);
    var selRisk = list.filter(function(e){return e.riskLevel==='red'||e.riskLevel==='orange'||e.riskLevel==='yellow';}).length;
    var selKey = list.filter(function(e){return e.scale === '大型企业';}).length;
    var selNew = list.filter(function(e){return e.signDaysAgo <= 30;}).length;
    var selPerf = list.length > 0 ? Math.round(list.reduce(function(s,e){return s + e.status.performRate;},0) / list.length) : 0;
    var selReveStr = selRevWan >= 10000 ? (selRevWan / 10000).toFixed(1) + '亿元' : selRevWan.toFixed(0) + '万元';
    var selTaxStr = selTaxWan >= 10000 ? (selTaxWan / 10000).toFixed(2) + '亿元' : selTaxWan.toFixed(0) + '万元';

    function osItem(label, val, unit, color) {
      return '<div class="os-item">' +
        '<div class="os-label">' + U.esc(label) + '</div>' +
        '<div class="os-value"' + (color ? ' style="color:' + color + ';"' : '') + '>' + U.esc(String(val)) + (unit ? '<span>' + unit + '</span>' : '') + '</div>' +
      '</div>';
    }
    var topStrip =
      '<div class="card mt overview-strip">' +
        osItem('筛选企业数', total.toLocaleString(), '家') +
        '<div class="os-divider"></div>' +
        osItem('总营收', selReveStr, '', '#2563EB') +
        '<div class="os-divider"></div>' +
        osItem('纳税总额', selTaxStr, '', '#F97316') +
        '<div class="os-divider"></div>' +
        osItem('带动就业', selEmp.toLocaleString(), '人', '#22C55E') +
        '<div class="os-divider"></div>' +
        osItem('风险企业', selRisk, '家', '#e03131') +
        '<div class="os-divider"></div>' +
        osItem('大型企业', selKey, '家') +
        '<div class="os-divider"></div>' +
        osItem('近30天新签约', selNew, '家', '#8B5CF6') +
        '<div class="os-divider"></div>' +
        osItem('平均履约率', selPerf, '%', '#06B6D4') +
      '</div>';

    U.$('#content').innerHTML =
      // 全市口径统计条
      topStrip +

      // 企业清单卡（标题栏 + 查询区 + 明细表 + 分页，样式对齐招商项目页「项目清单」）
      '<div class="card mt">' +
        '<div class="card-title">企业名录' +
          '<span style="margin-left:12px;">' +
            '<button class="btn sm" id="btnCompareTop" title="企业对比">' +
              '⚖ 对比' +
              (compareIds.length > 0 ? '<em style="font-style:normal;margin-left:4px;padding:0 6px;background:#2563EB;color:#fff;border-radius:10px;font-size:11px;line-height:1.6;">' + compareIds.length + '</em>' : '') +
            '</button>' +
            (compareIds.length > 0 ? ' <button class="btn sm" id="btnClearTop" title="清空选择">✕ 清空</button>' : '') +
            ' <button class="btn sm" id="btnColSetting" title="列设置">⚙ 列设置</button> ' +
            '<button class="btn sm" id="btnExport">⬇ 导出报表</button>' +
          '</span>' +
        '</div>' +
        '<div class="filter-card" style="background:#F8FAFC;border:1px solid var(--c-border-light);border-radius:8px;padding:12px 16px;margin-bottom:4px;">' +
          '<div class="filter-row">' +
            '<div class="filter-item"><label>关键词</label>' +
              '<input type="text" class="f-input" id="fKeyword" placeholder="企业名称/法人/统一社会信用代码" value="' + U.esc(f.keyword) + '"/>' +
            '</div>' +
            '<div class="filter-item"><label>风险等级</label>' +
              '<select class="f-select" id="fRisk">' + riskOpts + '</select>' +
            '</div>' +
            '<div class="filter-item"><label>行业</label>' +
              '<select class="f-select" id="fIndustry">' + industryOpts + '</select>' +
            '</div>' +
            '<div class="filter-item"><label>区县</label>' +
              '<select class="f-select" id="fDistrict">' + districtOpts + '</select>' +
            '</div>' +
            '<div class="filter-item"><label>规模</label>' +
              '<select class="f-select" id="fScale">' + scaleOpts + '</select>' +
            '</div>' +
            '<div class="filter-item"><label>企业标签</label>' +
              '<select class="f-select" id="fTag">' + tagOpts + '</select>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="result-info" style="margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;">' +
          '<div>共 <b>' + total + '</b> 家企业 · 第 ' + f.page + '/' + totalPages + ' 页</div>' +
          (compareIds.length > 0 ? '<div style="font-size:12px;color:#64748B;">已选 <b style="color:#2563EB;">' + compareIds.length + '</b> 家（可勾选复选框对比）</div>' : '') +
        '</div>' +
        emptyOrTable +
        (total > 0 ? C.paginationHtml(f.page, total, PAGE_SIZE) : '') +
      '</div>';

    // ---- 事件绑定 ----
    // 关键词：动态筛选 + IME 保护
    var kwEl = U.$('#fKeyword');
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
    ['fRisk','fIndustry','fDistrict','fScale','fTag'].forEach(function (id) {
      var el = U.$('#' + id);
      if (el) el.addEventListener('change', function () {
        kwState.active = false;
        var key = id === 'fTag' ? 'tag' : id.substring(1).toLowerCase();
        applyFilterField(key, this.value);
      });
    });
    // 标签点击快速筛选
    U.$$('.tag-filter').forEach(function (el) {
      el.addEventListener('click', function (ev) {
        ev.stopPropagation();
        kwState.active = false;
        f.tag = this.dataset.tag;
        f.page = 1;
        APP.render();
      });
    });
    // 顶部对比按钮
    var cmpTopBtn = U.$('#btnCompareTop');
    if (cmpTopBtn) {
      cmpTopBtn.addEventListener('click', function () {
        if (compareIds.length < 2) {
          C.toast('请先在表格中勾选至少 2 家企业（最多 5 家）', 'warning');
          return;
        }
        openCompareFloat();
      });
    }
    // 列设置按钮
    var colSetBtn = U.$('#btnColSetting');
    if (colSetBtn) {
      colSetBtn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        openColSettings(this);
      });
    }
    // 导出
    U.$('#btnExport').addEventListener('click', function () {
      var headers = ['企业名称', '统一社会信用代码', '法定代表人', '行业', '区县', '规模', '标签', '信用状态', '营收', '纳税', '员工数', '履约率', '风险等级', '风险指数'];
      var rows = list.map(function (e) {
        return [e.name, e.creditCode, e.legal, e.industryName, e.districtName, e.scale,
                (e.tags || []).join('、'),
                e.status.credit,
                e.overview.revenue, e.overview.tax, e.overview.employees,
                e.status.performRate + '%',
                M.LEVELS[e.riskLevel].name, e.riskScore];
      });
      C.exportCSV('企业概况_' + U.fmtDate(new Date()), headers, rows);
      C.toast('已导出 ' + rows.length + ' 条企业数据', 'success');
    });
    // 空态清除筛选
    var emptyBtn = document.querySelector('.empty-btn button');
    if (emptyBtn) {
      emptyBtn.addEventListener('click', function () {
        kwState.active = false;
        f.keyword = ''; f.risk = ''; f.industry = ''; f.district = 'all'; f.scale = ''; f.tag = ''; f.page = 1;
        APP.render();
      });
    }
    // 排序
    var table = U.$('.tbl');
    if (table) {
      C.bindTableSort(table, function (key) {
        kwState.active = false;
        var cur = f.sort;
        if (cur === key + 'Desc') f.sort = key + 'Asc';
        else f.sort = key + 'Desc';
        APP.render();
      });
    }
    // 分页
    var pg = U.$('.pagination');
    if (pg) {
      C.bindPagination(pg, function (p) { kwState.active = false; f.page = p; APP.render(); });
    }
    // 行点击 / 按钮点击 → 画像
    U.$$('.ent-row').forEach(function (tr) {
      tr.addEventListener('click', function (ev) {
        // 点击复选框 / 标签时不跳转
        if (ev.target.closest('.ent-chk') || ev.target.closest('.tag-filter')) return;
        kwState.active = false;
        state.ent = tr.dataset.id;
        state.page = 'profile';
        APP.render();
      });
    });
    // 复选框点击（选择对比企业）
    U.$$('.ent-chk').forEach(function (cb) {
      cb.addEventListener('click', function (ev) {
        ev.stopPropagation();
      });
      cb.addEventListener('change', function () {
        var id = this.dataset.id;
        var idx = compareIds.indexOf(id);
        if (this.checked) {
          if (compareIds.length >= 5) {
            C.toast('最多选择 5 家企业进行对比', 'warning');
            this.checked = false;
            return;
          }
          if (idx < 0) compareIds.push(id);
        } else {
          if (idx >= 0) compareIds.splice(idx, 1);
        }
        APP.render();
      });
    });
    // 全选当前页
    var chkAll = U.$('#chkAllEnt');
    if (chkAll) {
      var allChecked = pageData.every(function (e) { return compareIds.indexOf(e.id) >= 0; });
      chkAll.checked = allChecked && pageData.length > 0;
      chkAll.addEventListener('click', function (ev) {
        ev.stopPropagation();
      });
      chkAll.addEventListener('change', function () {
        if (this.checked) {
          pageData.forEach(function (e) {
            if (compareIds.length >= 5) return;
            if (compareIds.indexOf(e.id) < 0) compareIds.push(e.id);
          });
        } else {
          pageData.forEach(function (e) {
            var idx = compareIds.indexOf(e.id);
            if (idx >= 0) compareIds.splice(idx, 1);
          });
        }
        APP.render();
      });
    }
    // 顶部清空选择
    var clearTopBtn = U.$('#btnClearTop');
    if (clearTopBtn) {
      clearTopBtn.addEventListener('click', function () {
        compareIds = [];
        APP.render();
      });
    }
    // 如果浮动面板已打开，刷新内容（选中可能变化了）
    if (state.compareFloatOpen) {
      setTimeout(function () { refreshCompareFloat(); }, 0);
    }

    // 关键词焦点恢复
    if (kwState.active && kwEl && kwEl.value === f.keyword) {
      try { kwEl.focus(); kwEl.setSelectionRange(kwState.pos, kwState.pos); } catch (e) {}
    }

    function applyFilterField(field, val) {
      var map = { risk: 'fRisk', industry: 'fIndustry', district: 'fDistrict', scale: 'fScale' };
      f[field] = val;
      f.page = 1;
      APP.render();
    }
  }

  // 列设置弹窗
  function openColSettings(anchor) {
    // 已打开则不再重复打开
    if (document.getElementById('colSettingFloat')) return;

    var panel = U.el('div', { class: 'col-setting-float', id: 'colSettingFloat' }, [
      U.el('div', { class: 'csf-header', id: 'csfHeader', html:
        '<div class="csf-title">⚙ 列设置</div>' +
        '<div class="csf-actions"><span id="csfClose" title="关闭">×</span></div>'
      }),
      U.el('div', { class: 'csf-body', id: 'csfBody' }),
      U.el('div', { class: 'csf-footer', html:
        '<button class="btn sm" id="csfReset" style="flex:1;">恢复默认</button>' +
        '<button class="btn sm primary" id="csfDone" style="flex:1;">完成</button>'
      })
    ]);

    // 定位到按钮附近（默认右上方）
    if (anchor && anchor.getBoundingClientRect) {
      var r = anchor.getBoundingClientRect();
      panel.style.top = (r.bottom + 8) + 'px';
      panel.style.right = Math.max(16, window.innerWidth - r.right + 20) + 'px';
      panel.style.left = 'auto';
      panel.style.bottom = 'auto';
    } else {
      panel.style.top = '120px';
      panel.style.right = '32px';
    }
    document.body.appendChild(panel);

    function buildList() {
      var body = panel.querySelector('#csfBody');
      body.innerHTML = COLUMNS.map(function (c) {
        var checked = colVisible[c.key] ? ' checked' : '';
        var disabled = c.fixed ? ' disabled' : '';
        return '<label class="csf-item">' +
          '<input type="checkbox" data-col="' + c.key + '"' + checked + disabled + '/>' +
          '<span>' + U.esc(c.label) + '</span>' +
          (c.fixed ? '<em>必选</em>' : '') +
        '</label>';
      }).join('');

      // 勾选：直接切换 table 对应列的 display，不触发全页 render
      body.querySelectorAll('input[type=checkbox]').forEach(function (cb) {
        cb.addEventListener('change', function () {
          var key = this.dataset.col;
          var col = null;
          for (var i = 0; i < COLUMNS.length; i++) if (COLUMNS[i].key === key) { col = COLUMNS[i]; break; }
          if (col && col.fixed) { this.checked = true; return; }
          colVisible[key] = this.checked;
          var display = this.checked ? '' : 'none';
          var cells = document.querySelectorAll('th[data-col="' + key + '"], td[data-col="' + key + '"]');
          for (var j = 0; j < cells.length; j++) {
            cells[j].style.display = display;
          }
        });
      });
    }
    buildList();

    // 拖拽
    var header = panel.querySelector('#csfHeader');
    var isDragging = false, startX, startY, startLeft, startTop;
    header.addEventListener('mousedown', function (e) {
      if (e.target.closest('span')) return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      var r = panel.getBoundingClientRect();
      startLeft = r.left;
      startTop = r.top;
      panel.style.right = 'auto';
      panel.style.left = startLeft + 'px';
      panel.style.top = startTop + 'px';
      e.preventDefault();
    });
    document.addEventListener('mousemove', function (e) {
      if (!isDragging) return;
      var dx = e.clientX - startX;
      var dy = e.clientY - startY;
      var newLeft = Math.max(0, Math.min(window.innerWidth - panel.offsetWidth, startLeft + dx));
      var newTop = Math.max(0, Math.min(window.innerHeight - 40, startTop + dy));
      panel.style.left = newLeft + 'px';
      panel.style.top = newTop + 'px';
    });
    document.addEventListener('mouseup', function () { isDragging = false; });

    function closePanel() {
      panel.style.opacity = '0';
      setTimeout(function () { if (panel.parentNode) panel.parentNode.removeChild(panel); }, 150);
    }
    panel.querySelector('#csfClose').addEventListener('click', closePanel);
    panel.querySelector('#csfDone').addEventListener('click', closePanel);
    panel.querySelector('#csfReset').addEventListener('click', function () {
      COLUMNS.forEach(function (c) {
        colVisible[c.key] = c.fixed || DEFAULT_VISIBLE.indexOf(c.key) >= 0;
      });
      COLUMNS.forEach(function (c) {
        if (c.fixed) return;
        var show = DEFAULT_VISIBLE.indexOf(c.key) >= 0;
        var cells = document.querySelectorAll('th[data-sort="' + c.key + '"], td[data-col="' + c.key + '"]');
        for (var j = 0; j < cells.length; j++) {
          cells[j].style.display = show ? '' : 'none';
        }
      });
      buildList();
    });
  }

  // 构建对比表格 HTML（供浮动面板和弹窗复用）
  function buildCompareTableHtml(ents) {
    // 对比维度
    var dims = [
      { key: 'basic', label: '基本信息', items: [
        { k: 'industry', label: '所属行业', get: function (e) { return e.industryName; } },
        { k: 'district', label: '所在区县', get: function (e) { return e.districtName; } },
        { k: 'scale', label: '企业规模', get: function (e) { return e.scale; } },
        { k: 'legal', label: '法定代表人', get: function (e) { return e.legal; } },
        { k: 'found', label: '成立日期', get: function (e) { return e.found; } },
        { k: 'regCap', label: '注册资本', get: function (e) { return e.regCapitalFmt; } },
      ]},
      { key: 'overview', label: '经营概况', items: [
        { k: 'revenue', label: '年营收', num: true, higher: true, get: function (e) { return e.overview.revenueWan; }, fmt: function (v) { return v >= 10000 ? (v/10000).toFixed(1)+'亿元' : v+'万元'; } },
        { k: 'tax', label: '年纳税', num: true, higher: true, get: function (e) { return e.overview.taxWan; }, fmt: function (v) { return v+'万元'; } },
        { k: 'employees', label: '员工数', num: true, higher: true, get: function (e) { return e.overview.employees; }, fmt: function (v) { return v.toLocaleString()+'人'; } },
        { k: 'landMu', label: '用地面积', num: true, higher: true, get: function (e) { return e.landMu; }, fmt: function (v) { return v+'亩'; } },
        { k: 'profit', label: '利润', num: true, higher: true, get: function (e) { return e.overview.profit; }, fmt: function (v) { return v; } },
      ]},
      { key: 'status', label: '经营状态', items: [
        { k: 'biz', label: '经营状态', get: function (e) { return e.status.biz; } },
        { k: 'credit', label: '信用状态', get: function (e) { return e.status.credit; } },
        { k: 'performRate', label: '履约率', num: true, higher: true, get: function (e) { return e.status.performRate; }, fmt: function (v) { return v+'%'; } },
      ]},
      { key: 'risk', label: '风险情况', items: [
        { k: 'riskScore', label: '综合风险分', num: true, higher: false, get: function (e) { return e.riskScore; }, fmt: function (v) { return v+'分'; } },
        { k: 'riskLevel', label: '风险等级', get: function (e) { return '<span class="compare-risk-badge" style="background:' + M.LEVELS[e.riskLevel].bg + ';color:' + M.LEVELS[e.riskLevel].color + ';">' + M.LEVELS[e.riskLevel].name + '</span>'; } },
        { k: 'policies', label: '匹配政策', num: true, higher: true, get: function (e) { return (e.policies||[]).length; }, fmt: function (v) { return v+'项'; } },
      ]},
    ];

    function renderRow(item) {
      var values = ents.map(function (e) { return item.get(e); });
      var cells = ents.map(function (e, i) {
        var v = item.get(e);
        var html = item.fmt ? item.fmt(v) : v;
        var cls = '';
        if (item.num && typeof v === 'number') {
          var nums = values.filter(function (x) { return typeof x === 'number'; });
          var maxV = Math.max.apply(null, nums);
          var minV = Math.min.apply(null, nums);
          if (v === maxV && nums.length > 1 && maxV !== minV) {
            cls = item.higher ? 'compare-val-higher' : 'compare-val-lower';
          } else if (v === minV && nums.length > 1 && maxV !== minV) {
            cls = item.higher ? 'compare-val-lower' : 'compare-val-higher';
          }
        }
        return '<td class="' + cls + '">' + html + '</td>';
      }).join('');
      return '<tr><th>' + item.label + '</th>' + cells + '</tr>';
    }

    var html = '';
    var headCells = ents.map(function (e) {
      return '<th class="cmp-head-ent">' +
        '<div class="compare-ent-name" style="font-size:13px;">' + U.esc(e.name) + '</div>' +
        '<div class="compare-ent-sub">' + U.esc(e.industryName) + ' · ' + U.esc(e.districtName) + '</div>' +
      '</th>';
    }).join('');
    html += '<table class="compare-table" style="width:100%;"><thead><tr><th class="cmp-head-corner">对比项</th>' + headCells + '</tr></thead><tbody>';

    dims.forEach(function (d) {
      html += '<tr class="cmp-dim-row"><th colspan="' + (ents.length + 1) + '" style="background:#EFF6FF;color:#2563EB;font-size:11px;">' + d.label + '</th></tr>';
      d.items.forEach(function (item) {
        html += renderRow(item);
      });
    });
    html += '</tbody></table>';
    return html;
  }

  // 浮动对比面板
  function openCompareFloat() {
    // 如果已经有浮动面板，只刷新内容
    var existing = document.getElementById('compareFloatPanel');
    if (existing) {
      refreshCompareFloat();
      return;
    }

    var ents = compareIds.map(function (id) {
      for (var i = 0; i < M.ENTERPRISES.length; i++)
        if (M.ENTERPRISES[i].id === id) return M.ENTERPRISES[i];
      return null;
    }).filter(Boolean);
    if (ents.length < 2) { C.toast('请至少选择 2 家企业', 'warning'); return; }

    var panel = U.el('div', { class: 'compare-float', id: 'compareFloatPanel' }, [
      U.el('div', { class: 'compare-float-header', id: 'cmpFloatHeader', html:
        '<div class="compare-float-title">⚖ 企业对比（' + ents.length + '家）</div>' +
        '<div class="compare-float-actions">' +
          '<span id="cmpFloatMin" title="最小化">—</span>' +
          '<span id="cmpFloatClose" title="关闭">×</span>' +
        '</div>'
      }),
      U.el('div', { class: 'compare-float-body', id: 'cmpFloatBody', html: buildCompareTableHtml(ents) }),
      U.el('div', { class: 'compare-float-footer', html:
        '<span>勾选企业实时更新对比 · 可拖拽标题栏移动</span>' +
        '<button class="btn sm primary" id="cmpFloatCloseBottom">关闭</button>'
      })
    ]);
    document.body.appendChild(panel);

    // 拖拽
    var header = panel.querySelector('#cmpFloatHeader');
    var isDragging = false, startX, startY, startLeft, startTop;
    header.addEventListener('mousedown', function (e) {
      if (e.target.closest('span')) return; // 点按钮时不拖
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      var r = panel.getBoundingClientRect();
      startLeft = r.left;
      startTop = r.top;
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
      panel.style.left = startLeft + 'px';
      panel.style.top = startTop + 'px';
      e.preventDefault();
    });
    document.addEventListener('mousemove', function (e) {
      if (!isDragging) return;
      var dx = e.clientX - startX;
      var dy = e.clientY - startY;
      var newLeft = Math.max(0, Math.min(window.innerWidth - panel.offsetWidth, startLeft + dx));
      var newTop = Math.max(0, Math.min(window.innerHeight - 40, startTop + dy));
      panel.style.left = newLeft + 'px';
      panel.style.top = newTop + 'px';
    });
    document.addEventListener('mouseup', function () { isDragging = false; });

    // 最小化
    panel.querySelector('#cmpFloatMin').addEventListener('click', function () {
      panel.classList.toggle('compare-float-min');
      this.textContent = panel.classList.contains('compare-float-min') ? '▢' : '—';
      this.title = panel.classList.contains('compare-float-min') ? '展开' : '最小化';
    });
    // 关闭（清空选择 + 关闭面板）
    function closeAndClear() {
      compareIds.length = 0;
      panel.remove();
      state.compareFloatOpen = false;
      if (state.page === 'enterprise') APP.render();
    }
    panel.querySelector('#cmpFloatClose').addEventListener('click', closeAndClear);
    // 底部关闭按钮
    panel.querySelector('#cmpFloatCloseBottom').addEventListener('click', closeAndClear);

    state.compareFloatOpen = true;
  }

  // 刷新浮动面板内容（选择变化时调用）
  function refreshCompareFloat() {
    var panel = document.getElementById('compareFloatPanel');
    if (!panel) return;
    var ents = compareIds.map(function (id) {
      for (var i = 0; i < M.ENTERPRISES.length; i++)
        if (M.ENTERPRISES[i].id === id) return M.ENTERPRISES[i];
      return null;
    }).filter(Boolean);
    if (ents.length < 2) {
      panel.remove();
      state.compareFloatOpen = false;
      return;
    }
    panel.querySelector('.compare-float-title').textContent = '⚖ 企业对比（' + ents.length + '家）';
    panel.querySelector('#cmpFloatBody').innerHTML = buildCompareTableHtml(ents);
  }

  // 企业对比弹窗（全屏模式，从浮动面板的"全屏查看"进入）
  function openCompareDialog() {
    var ents = compareIds.map(function (id) {
      for (var i = 0; i < M.ENTERPRISES.length; i++)
        if (M.ENTERPRISES[i].id === id) return M.ENTERPRISES[i];
      return null;
    }).filter(Boolean);
    if (ents.length < 2) { C.toast('请至少选择 2 家企业', 'warning'); return; }

    var tableHtml = buildCompareTableHtml(ents);

    var mask = U.el('div', { class: 'modal-mask', style: 'z-index:2000;' });
    var box = U.el('div', { class: 'modal compare-modal' }, [
      U.el('div', { class: 'modal-header', html: '⚖ 企业对比分析（' + ents.length + '家）' }),
      U.el('div', { class: 'modal-body', style: 'flex:1;overflow-y:auto;padding:0 16px 16px;', html: tableHtml }),
      U.el('div', { class: 'modal-footer', html: '<button class="btn primary" id="cmpCloseBtn">关闭</button>' })
    ]);
    mask.appendChild(box);
    document.body.appendChild(mask);

    function closeDialog() {
      mask.style.opacity = '0';
      setTimeout(function () { if (mask.parentNode) mask.parentNode.removeChild(mask); }, 200);
    }
    box.querySelector('#cmpCloseBtn').addEventListener('click', closeDialog);
    mask.addEventListener('click', function (e) {
      if (e.target === mask) closeDialog();
    });
  }

  APP.registerRenderer('enterprise', renderEnterprise);
})();
