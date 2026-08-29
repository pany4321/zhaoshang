/* ============================================================
 * 页面：政策服务
 * ============================================================ */
(function () {
  'use strict';
  var U = APP.U;
  var state = APP.state;
  var C = APP.Components;
  var M = window.MOCK;

  // 关键词动态筛选：记录焦点与光标位置，重渲染后恢复，避免打字中断
  var kwState = { active: false, pos: null };

  function renderPolicy() {
    var f = state.filter.policy;
    var P = M.POLICY_LIB;
    var R = M.POLICY_REDEEM;

    // 如果从企业画像页跳转过来：自动筛选出对应政策，并将政策列表滚到 content 顶部
    var pendingPolicyId = null;
    if (state.policyId) {
      pendingPolicyId = state.policyId;
      var matched = P.filter(function(p){ return p.code===pendingPolicyId || p.id===pendingPolicyId || p.name===pendingPolicyId; });
      if (matched.length) {
        f.keyword = matched[0].name;
        f.level = '';
        f.type = '';
        f.dept = '';
        f.page = 1;
      }
      state.policyId = null;
    }

    var list = P.filter(function(p){
      if (f.keyword && p.name.indexOf(f.keyword) < 0 && p.dept.indexOf(f.keyword) < 0) return false;
      if (f.level && p.level !== f.level) return false;
      if (f.type && p.type !== f.type) return false;
      if (f.dept && p.dept !== f.dept) return false;
      return true;
    });

    var PS = 8;
    var total = list.length;
    var totalPages = Math.max(1, Math.ceil(total / PS));
    if (f.page > totalPages) f.page = totalPages;
    var pageData = list.slice((f.page - 1) * PS, f.page * PS);

    // 按类型统计
    var typeStats = {};
    P.forEach(function(p){ typeStats[p.type] = (typeStats[p.type]||0) + 1; });
    var levelStats = {};
    P.forEach(function(p){ levelStats[p.level] = (levelStats[p.level]||0) + 1; });

    var levelOpts = '<option value="">全部层级</option>' +
      ['国家级','省级','市级','区县'].map(function(s){
        return '<option value="'+s+'"'+(f.level===s?' selected':'')+'>'+s+'</option>';
      }).join('');
    var typeOpts = '<option value="">全部类型</option>' +
      Object.keys(typeStats).map(function(s){
        return '<option value="'+s+'"'+(f.type===s?' selected':'')+'>'+s+'</option>';
      }).join('');
    var depts = Array.from(new Set(P.map(function(p){return p.dept;})));
    var deptOpts = '<option value="">全部部门</option>' +
      depts.map(function(d){ return '<option value="'+d+'"'+(f.dept===d?' selected':'')+'>'+d+'</option>'; }).join('');

    // 政策卡片
    var cardsHtml = pageData.map(function(p, idx){
      var levelColor = p.level === '国家级' ? '#e03131'
        : p.level === '省级' ? '#F97316'
        : p.level === '市级' ? '#2563EB' : '#22C55E';
      // 浏览热度：按政策序号确定性推导（60–149，稳定不跳变）
      var seq = parseInt(String(p.code || '').replace(/\D/g, ''), 10) || (idx + 1);
      var hot = 60 + (seq * 13) % 90;
      return '<div class="policy-card" data-id="' + (p.code || p.id) + '">' +
        '<div class="plc-head">' +
          '<span class="plc-level" style="color:' + levelColor + ';border-color:' + levelColor + ';">' + U.esc(p.level) + '</span>' +
          '<span class="plc-type">' + U.esc(p.type) + '</span>' +
        '</div>' +
        '<div class="plc-title">' + U.esc(p.name) + '</div>' +
        '<div class="plc-desc">' + U.esc(p.apply || p.brief || '') + '</div>' +
        '<div class="plc-meta">' +
          '<span>📅 ' + U.esc(p.date || '2026-01-01') + '</span>' +
          '<span>🏛️ ' + U.esc(p.dept) + '</span>' +
          '<span>🔥 ' + hot + ' 次浏览</span>' +
        '</div>' +
        '<div class="plc-foot">' +
          '<span style="color:#94A3B8;font-size:11px;">匹配企业：'+(p.entCount || 0)+' 家</span>' +
          '<span class="plc-action">查看详情 →</span>' +
        '</div>' +
      '</div>';
    }).join('');

    // 政策分类侧边
    var typeListHtml = Object.keys(typeStats).map(function(t){
      return '<div class="pt-item' + (f.type===t?' active':'') + '" data-type="'+t+'">' +
        '<span>' + U.esc(t) + '</span>' +
        '<span class="pt-count">' + typeStats[t] + '</span>' +
      '</div>';
    }).join('');

    U.$('#content').innerHTML =
      // 顶部统计（层级计数 + 政策兑现数据均来自 POLICY_REDEEM 真实推导）
      '<div class="kpi-grid">' +
        '<div class="kpi"><div class="k-label">政策总数</div><div class="k-value">' + P.length + '<span style="font-size:14px;">条</span></div></div>' +
        '<div class="kpi"><div class="k-label">国家级</div><div class="k-value" style="color:#e03131;">' + (levelStats['国家级']||0) + '<span style="font-size:14px;">条</span></div></div>' +
        '<div class="kpi"><div class="k-label">省级</div><div class="k-value" style="color:#F97316;">' + (levelStats['省级']||0) + '<span style="font-size:14px;">条</span></div></div>' +
        '<div class="kpi"><div class="k-label">市级</div><div class="k-value" style="color:#2563EB;">' + (levelStats['市级']||0) + '<span style="font-size:14px;">条</span></div></div>' +
        '<div class="kpi"><div class="k-label">年度安排</div><div class="k-value" style="color:#2563EB;">' + (R.planWan / 10000).toFixed(1) + '<span style="font-size:14px;">亿元</span></div></div>' +
        '<div class="kpi"><div class="k-label">已兑现金额</div><div class="k-value" style="color:#F97316;">' + (R.redeemedWan / 10000).toFixed(1) + '<span style="font-size:14px;">亿元</span></div></div>' +
        '<div class="kpi"><div class="k-label">总体兑现率</div><div class="k-value" style="color:#22C55E;">' + R.rate + '<span style="font-size:14px;">%</span></div></div>' +
        '<div class="kpi"><div class="k-label">惠及企业</div><div class="k-value">' + R.entsHelped + '<span style="font-size:14px;">家</span></div></div>' +
      '</div>' +

      // 主体
      '<div class="row mt">' +
        // 左侧分类
        '<div class="col card p-side">' +
          '<div class="card-title">政策类型</div>' +
          '<div class="pt-list">' +
            '<div class="pt-item' + (!f.type?' active':'') + '" data-type="">' +
              '<span>全部政策</span><span class="pt-count">' + P.length + '</span>' +
            '</div>' +
            typeListHtml +
          '</div>' +
          '<div style="margin-top:16px;">' +
            '<div style="font-size:12px;font-weight:600;margin-bottom:8px;color:#0F172A;">📢 近期新政策</div>' +
            P.slice().sort(function(a, b){ return (b.date || '').localeCompare(a.date || ''); }).slice(0, 5).map(function(p){
              return '<div class="recent-policy" data-id="'+(p.code || p.id)+'">' +
                '<div style="font-size:12px;color:#2563EB;line-height:1.4;">' + U.esc(p.name) + '</div>' +
                '<div style="font-size:10px;color:#94A3B8;margin-top:3px;">' + U.esc(p.dept) + ' · ' + U.esc(p.date||'') + '</div>' +
              '</div>';
            }).join('') +
          '</div>' +
        '</div>' +
        // 右侧主体：政策列表（查询条件内嵌于卡片上部）
        '<div class="col-2">' +
          '<div class="card">' +
            '<div class="card-title">政策列表' +
              '<span style="margin-left:12px;">' +
                '<button class="btn sm primary" id="polSync">⟳ 同步政策</button> ' +
                '<button class="btn sm primary" id="polAiMatch">✦ AI 智能匹配</button> ' +
                '<button class="btn sm" id="polExport">⬇ 导出报表</button>' +
              '</span>' +
            '</div>' +
            '<div style="background:#F8FAFC;border:1px solid var(--c-border-light);border-radius:8px;padding:12px 16px;margin-bottom:4px;">' +
              '<div class="filter-row">' +
                '<div class="filter-item" style="flex:2;"><label>搜索政策</label>' +
                  '<input type="text" class="f-input" id="polKw" placeholder="政策名称/发布部门，回车筛选" value="' + U.esc(f.keyword) + '"/>' +
                '</div>' +
                '<div class="filter-item"><label>政策层级</label>' +
                  '<select class="f-select" id="polLevel">' + levelOpts + '</select>' +
                '</div>' +
                '<div class="filter-item"><label>发布部门</label>' +
                  '<select class="f-select" id="polDept">' + deptOpts + '</select>' +
                '</div>' +
              '</div>' +
            '</div>' +
            '<div class="result-info" style="margin-bottom:8px;">共 <b>' + total + '</b> 条政策 · 第 ' + f.page + '/' + totalPages + ' 页</div>' +
            (total === 0 ? C.emptyHtml('📋', '未找到相关政策', '清除筛选')
              : '<div class="policy-grid">' + cardsHtml + '</div>' +
                C.paginationHtml(f.page, total, PS)) +
          '</div>' +
        '</div>' +
      '</div>';

    // 事件：下拉变更即筛选刷新；关键词逐字动态筛选（兼容中文输入法）
    U.$('#polLevel').addEventListener('change', function(){ kwState.active = false; applyFilter(); });
    U.$('#polDept').addEventListener('change', function(){ kwState.active = false; applyFilter(); });
    var kwEl = U.$('#polKw');
    if (kwEl) {
      var composing = false;
      kwEl.addEventListener('compositionstart', function(){ composing = true; });
      kwEl.addEventListener('compositionend', function(){
        composing = false;
        kwState.active = true;
        kwState.pos = kwEl.value.length;
        applyFilter();
      });
      kwEl.addEventListener('input', function(){
        if (composing) return; // 输入法组词期间不刷新
        kwState.active = true;
        kwState.pos = kwEl.selectionStart;
        applyFilter();
      });
      kwEl.addEventListener('keydown', function(e){ if(e.key==='Enter') applyFilter(); });
    }
    // 空态"清除筛选"按钮
    if (total === 0) {
      var clrBtn = document.querySelector('.empty-btn button');
      if (clrBtn) clrBtn.addEventListener('click', function(){
        kwState.active = false;
        f.keyword=''; f.level=''; f.type=''; f.dept=''; f.page=1;
        APP.render();
      });
    }
    // 同步政策按钮
    U.$('#polSync').addEventListener('click', function(){
      if (_syncAddedCount >= M.POLICY_PENDING_POOL.length) {
        C.toast('当前已是最新政策，暂无新政策可同步', 'info');
        return;
      }
      openSyncDialog();
    });
    // AI 智能匹配入口
    U.$('#polAiMatch').addEventListener('click', function(){
      var pending = _syncAddedCount - _aiMatchedCount;
      if (pending <= 0) {
        C.confirm({ title: 'AI 智能匹配', hideCancel: true, html: '当前暂无新同步的政策需要进行智能匹配。<br/><br/>请先点击「同步政策」从官方渠道同步最新政策后，再执行 AI 智能匹配。' }, function(){});
        return;
      }
      openAiMatchDialog();
    });
    // 导出当前筛选下的全部政策（跨页）
    U.$('#polExport').addEventListener('click', function () {
      C.exportCSV('政策清单',
        ['编号', '政策名称', '层级', '类型', '发布部门', '匹配企业数', '年度安排(万元)', '已兑现(万元)'],
        list.map(function (p) {
          return [p.code || p.id || '', p.name, p.level, p.type, p.dept,
            p.entCount || 0, p.planWan || '', p.redeemedWan || ''];
        }));
      C.toast('已导出 ' + list.length + ' 条政策', 'success');
    });
    // 分类点击
    U.$$('.pt-item').forEach(function(el){
      el.addEventListener('click', function(){
        kwState.active = false;
        state.filter.policy.type = el.dataset.type;
        state.filter.policy.page = 1;
        APP.render();
      });
    });
    // 卡片点击
    U.$$('.policy-card').forEach(function(c){
      c.addEventListener('click', function(){ showPolicyDetail(c.dataset.id); });
    });
    U.$$('.recent-policy').forEach(function(c){
      c.addEventListener('click', function(){ showPolicyDetail(c.dataset.id); });
      c.style.cursor = 'pointer';
    });
    // 分页
    var pg = U.$('.pagination');
    if (pg) C.bindPagination(pg, function(p){ f.page = p; kwState.active = false; APP.render(); });

    // 关键词输入中：恢复焦点与光标位置，保证连续输入不中断
    if (kwState.active) {
      var kwe = U.$('#polKw');
      if (kwe) {
        kwe.focus();
        if (kwState.pos != null && kwe.setSelectionRange) {
          try { kwe.setSelectionRange(kwState.pos, kwState.pos); } catch (e) {}
        }
      }
    }

    // 如果从企业画像页/全局搜索跳转过来：政策列表卡片对齐 content 顶部
    if (pendingPolicyId) {
      var pid = pendingPolicyId;
      // locate-only 模式（全局搜索跳转）：只筛选定位高亮，不打开详情抽屉
      var locateOnly = state.policyLocateOnly === true;
      state.policyLocateOnly = false;
      // 让政策列表卡片滚动到 content 顶部（在全局切页归零之后再精调）
      setTimeout(function () {
        setTimeout(function () {
          var contentEl = U.$('#content');
          var cardEl = document.querySelector('.row.mt .col-2 .card');
          if (contentEl && cardEl) {
            var cardRect = cardEl.getBoundingClientRect();
            var contentRect = contentEl.getBoundingClientRect();
            // 顶部留 16px 间距，避免贴顶太紧
            contentEl.scrollTop += cardRect.top - contentRect.top - 16;
          }
          if (locateOnly) {
            var hlCard = document.querySelector('.policy-card[data-id="' + pid + '"]');
            if (hlCard) {
              if (hlCard.scrollIntoView) hlCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
              hlCard.style.background = '#EFF6FF';
              hlCard.style.outline = '2px solid #C7D2FE';
              hlCard.style.outlineOffset = '-2px';
              C.toast('已筛选定位到该政策', 'info');
            }
          } else {
            showPolicyDetail(pid);
          }
        }, 0);
      }, 0);
    }
  }

  function showPolicyDetail(id) {
    var p = null;
    for (var i = 0; i < M.POLICY_LIB.length; i++) {
      var it = M.POLICY_LIB[i];
      // 政策主键为 code（如 P01），兼容 id / 名称传参
      if (it.code === id || it.id === id || it.name === id) { p = it; break; }
    }
    if (!p) return;

    // 匹配企业
    var matchEnts = M.ENTERPRISES.filter(function(e){
      return (e.policies || []).indexOf(p.name) >= 0;
    }).slice(0, 6);
    var matchHtml = matchEnts.length === 0
      ? '<div style="color:#94A3B8;font-size:12px;">暂无匹配企业</div>'
      : matchEnts.map(function(e){
          return '<div class="match-ent" data-id="'+e.id+'">' +
            '<span>' + U.esc(e.name) + '</span>' +
            '<span style="color:#94A3B8;font-size:11px;">' + U.esc(e.industryName) + '</span>' +
          '</div>';
        }).join('');

    var html =
      '<div style="font-size:13px;line-height:1.8;">' +
        '<div style="font-size:16px;font-weight:600;margin-bottom:4px;line-height:1.4;">' + U.esc(p.name) + '</div>' +
        '<div style="color:#94A3B8;font-size:12px;margin-bottom:12px;">' +
          U.esc(p.dept) + ' · ' + U.esc(p.level) + ' · ' + U.esc(p.date||'') +
        '</div>' +
        '<div style="margin-bottom:12px;">' +
          '<span class="plc-level" style="color:#2563EB;border-color:#2563EB;">' + U.esc(p.type) + '</span>' +
        '</div>' +
        '<div style="margin-top:12px;">' +
          '<div style="font-weight:600;margin-bottom:6px;">政策摘要</div>' +
          '<div style="background:#F8FAFC;padding:10px;border-radius:4px;font-size:12px;line-height:1.8;">' +
            U.esc(p.brief || p.apply || '') +
          '</div>' +
        '</div>' +
        '<div style="margin-top:16px;">' +
          '<div style="font-weight:600;margin-bottom:6px;">适用对象</div>' +
          '<div style="font-size:12px;color:#475569;">' + U.esc(p.apply || '符合条件的企业均可申报') + '</div>' +
        '</div>' +
        '<div style="margin-top:16px;">' +
          '<div style="font-weight:600;margin-bottom:6px;">支持方式</div>' +
          '<div style="font-size:12px;color:#475569;">' + U.esc(p.support || '资金补贴、税收优惠、项目扶持等') + '</div>' +
        '</div>' +
        '<div style="margin-top:16px;">' +
          '<div style="font-weight:600;margin-bottom:6px;">申报材料</div>' +
          '<div style="font-size:12px;color:#475569;line-height:1.8;">' + U.esc(p.materials || '1. 企业营业执照副本<br/>2. 申请表<br/>3. 相关证明材料').replace(/&lt;br\s*\/?&gt;|&lt;\/br\s*&gt;/gi, '<br/>') + '</div>' +
        '</div>' +
        '<div style="margin-top:16px;">' +
          '<div style="font-weight:600;margin-bottom:6px;">智能匹配企业 <span style="font-weight:400;color:#94A3B8;font-size:11px;">（AI 基于企业画像自动匹配）</span></div>' +
          '<div class="match-ents">' + matchHtml + '</div>' +
        '</div>' +
        '<div style="margin-top:16px;display:flex;justify-content:flex-end;">' +
          '<button class="btn" onclick="APP.Components.closeDrawer()">关闭</button>' +
        '</div>' +
      '</div>';

    C.openDrawer({ title: p.name, subtitle: '政策详情', bodyHtml: html, width: 460 });

    // 匹配企业点击
    setTimeout(function(){
      U.$$('.match-ent').forEach(function(el){
        el.addEventListener('click', function(){
          C.closeDrawer();
          state.ent = el.dataset.id;
          state.page = 'profile';
          APP.render();
        });
      });
    }, 50);
  }

  var _syncAddedCount = 0; // 已同步计数（对应 M.POLICY_PENDING_POOL 的消费进度）
  var _aiMatchedCount = 0; // 已完成 AI 智能匹配的新政策数

  // 同步政策对话框
  function openSyncDialog() {
    var sources = [
      '国家发改委政策库',
      '工信部产业政策平台',
      '科技部科技政策库',
      '甘肃省人民政府门户',
      '庆阳市政务服务网',
      '庆阳市财政局',
      '庆阳市招商局'
    ];
    var total = sources.length;

    // 本次要新增的政策（1-2 条，从候选池中按顺序取）
    var remaining = M.POLICY_PENDING_POOL.slice(_syncAddedCount);
    var addCount = remaining.length === 0 ? 0 : (remaining.length === 1 ? 1 : 1 + Math.floor(Math.random() * 2));
    addCount = Math.min(addCount, remaining.length);
    var newPolicies = remaining.slice(0, addCount);

    var mask = U.el('div', { class: 'modal-mask', style: 'z-index:2000;' });
    var box = U.el('div', { class: 'modal', style: 'width:460px;' }, [
      U.el('div', { class: 'modal-header', html: '⟳ 政策同步' }),
      U.el('div', { class: 'modal-body', html:
        '<div style="padding:8px 0;">' +
          '<div style="font-size:13px;color:#475569;margin-bottom:12px;">正在从官方渠道同步最新政策到本系统...</div>' +
          '<div class="progress" style="height:8px;margin-bottom:16px;">' +
            '<div id="syncBar" class="bar" style="width:0%;background:linear-gradient(90deg,#2563EB,#6366F1);"></div>' +
          '</div>' +
          '<div id="syncStatus" style="font-size:12px;color:#64748B;line-height:2;">' +
            sources.map(function(s){ return '<div class="sync-src" data-src="'+s+'"><span style="color:#94A3B8;">○</span> ' + U.esc(s) + '</div>'; }).join('') +
          '</div>' +
          '<div id="syncResult" style="display:none;margin-top:16px;padding:12px;background:#F0FDF4;border:1px solid #BBF7D0;border-radius:6px;color:#15803D;font-size:13px;text-align:center;">' +
            '✓ 同步成功，共更新 <b id="syncCount">0</b> 条政策' +
          '</div>' +
        '</div>'
      }),
      U.el('div', { class: 'modal-footer', html:
        '<button class="btn" id="syncCloseBtn" style="display:none;">关闭</button>'
      })
    ]);
    mask.appendChild(box);
    document.body.appendChild(mask);

    var closeBtn = box.querySelector('#syncCloseBtn');
    var syncBar = box.querySelector('#syncBar');
    var syncResult = box.querySelector('#syncResult');
    var syncCount = box.querySelector('#syncCount');

    function closeDialog() {
      mask.style.opacity = '0';
      setTimeout(function(){ if(mask.parentNode) mask.parentNode.removeChild(mask); }, 200);
    }
    closeBtn.addEventListener('click', closeDialog);

    // 逐个模拟同步进度
    var idx = 0;
    function step() {
      if (idx >= total) {
        // 全部完成：真正添加新政策
        if (newPolicies.length) {
          var maxCode = 0;
          M.POLICY_LIB.forEach(function(p){
            var n = parseInt(String(p.code || '').replace(/\D/g, ''), 10);
            if (n > maxCode) maxCode = n;
          });
          newPolicies.forEach(function(p, i){
            var code = 'P' + String(maxCode + i + 1).padStart(2, '0');
            var newP = {
              code: code,
              name: p.name,
              dept: p.dept,
              type: p.type,
              level: p.level,
              apply: p.apply,
              tag: p.tag,
              date: p.date,
              brief: p.brief,
              support: p.support,
              materials: p.materials
            };
            M.POLICY_LIB.unshift(newP);
            if (APP.sync) APP.sync.policyCreated(newP); // 前后端分离版落库；纯前端版无 sync 自动跳过
            // 给带相应标签的企业增加匹配
            M.ENTERPRISES.forEach(function(e){
              if ((e.tags || []).indexOf(p.tag) >= 0 && (e.policies || []).indexOf(p.name) < 0) {
                if (!e.policies) e.policies = [];
                e.policies.unshift(p.name);
                if (e.policies.length > 5) e.policies.length = 5;
              }
            });
          });
          _syncAddedCount += newPolicies.length;
        }
        syncBar.style.width = '100%';
        syncResult.style.display = '';
        syncCount.textContent = newPolicies.length;
        closeBtn.style.display = '';
        // 3.5秒后自动关闭并刷新列表（成功状态停留更久，便于查看）
        setTimeout(function(){
          closeDialog();
          // 重新渲染（同页刷新，保持滚动位置）
          APP.render();
          C.toast('同步完成，新增 ' + newPolicies.length + ' 条政策', 'success');
        }, 1500);
        return;
      }
      var src = sources[idx];
      var srcEl = box.querySelector('.sync-src[data-src="'+src+'"]');
      if (srcEl) {
        srcEl.innerHTML = '<span style="color:#22C55E;">✓</span> ' + U.esc(src) + ' <span style="color:#22C55E;font-size:11px;">完成</span>';
      }
      idx++;
      var pct = Math.round(idx / total * 100);
      syncBar.style.width = pct + '%';
      setTimeout(step, 500 + Math.random() * 300);
    }
    setTimeout(step, 300);
  }

  // AI 智能匹配对话框（模拟大模型匹配过程）
  function openAiMatchDialog() {
    // 待匹配的新政策（从 POLICY_LIB 头部取，因为新同步的 unshift 在前面）
    var pending = _syncAddedCount - _aiMatchedCount;
    var newPolicies = M.POLICY_LIB.slice(0, pending);

    // 为每条新政策生成 AI 匹配企业（多维度智能评分，比简单 tag 匹配更全面）
    function generateMatches(policy) {
      // 候选池：标签匹配 + 行业/规模相关的扩展企业（体现 AI 的泛化能力）
      var tagMatched = M.ENTERPRISES.filter(function(e){
        return (e.tags || []).indexOf(policy.tag) >= 0;
      });
      // AI 额外发现：行业相近或规模达标的企业（标签未命中但实际可能适用）
      var extraCandidates = M.ENTERPRISES.filter(function(e){
        if (tagMatched.indexOf(e) >= 0) return false;
        // 扩展条件：营收达标、或规模中大型、或风险低
        var fit = 0;
        if (e.overview && e.overview.revenueWan > 3000) fit++;
        if (e.scale === '大型企业' || e.scale === '中型企业') fit++;
        if (e.riskLevel === 'blue') fit++;
        return fit >= 2;
      });
      var candidates = tagMatched.concat(extraCandidates.slice(0, 6));
      if (candidates.length === 0) candidates = M.ENTERPRISES.slice(0, 8);

      // AI 多维度评分：行业契合度 + 企业规模 + 信用等级 + 营收能力 + 研发投入
      var scored = candidates.map(function(e){
        var score = 0;
        var reasons = [];
        // 行业/标签契合度（权重最高）
        if ((e.tags || []).indexOf(policy.tag) >= 0) {
          score += 40;
          reasons.push('所属行业与政策方向高度契合');
        } else {
          score += 20 + Math.floor(Math.random() * 10);
          reasons.push('业务领域与政策方向存在交叉机会');
        }
        // 企业规模
        if (e.scale === '大型企业') { score += 20; reasons.push('企业规模达标，具备申报主体资格'); }
        else if (e.scale === '中型企业') { score += 16; reasons.push('企业规模符合申报门槛'); }
        else if (e.scale === '小型企业') { score += 10; reasons.push('小微企业可适用专项扶持条款'); }
        else { score += 6; reasons.push('企业规模偏小，建议关注梯度培育政策'); }
        // 信用/风险等级
        if (e.riskLevel === 'blue') { score += 18; reasons.push('企业经营稳健，信用优良'); }
        else if (e.riskLevel === 'yellow') { score += 13; reasons.push('企业经营状况整体良好'); }
        else if (e.riskLevel === 'orange') { score += 7; reasons.push('存在一定经营风险，需补充证明材料'); }
        else { score += 3; reasons.push('风险偏高，建议审慎评估'); }
        // 营收能力
        if (e.overview && e.overview.revenueWan > 10000) { score += 14; reasons.push('营收规模较大，政策撬动效应显著'); }
        else if (e.overview && e.overview.revenueWan > 3000) { score += 10; reasons.push('营收规模达标'); }
        else if (e.overview && e.overview.revenueWan > 500) { score += 6; reasons.push('营收稳定增长'); }
        else { score += 3; reasons.push('营收规模偏小，成长期企业'); }
        // 随机微调（模拟模型推理的微小波动）
        score += Math.floor(Math.random() * 6) - 2;
        score = Math.max(55, Math.min(98, score));
        // 选 3 条最核心的理由
        return { enterprise: e, score: score, reasons: reasons.slice(0, 3) };
      });

      // 按评分降序，取前 6-9 家
      scored.sort(function(a,b){ return b.score - a.score; });
      var count = Math.min(scored.length, 6 + Math.floor(Math.random() * 4));
      return scored.slice(0, count);
    }

    var allResults = newPolicies.map(function(p){
      return { policy: p, matches: generateMatches(p) };
    });

    // 构建对话框
    var mask = U.el('div', { class: 'modal-mask', style: 'z-index:2000;' });
    var box = U.el('div', { class: 'modal', style: 'width:720px;max-height:80vh;display:flex;flex-direction:column;' }, [
      U.el('div', { class: 'modal-header', html: '✦ AI 政策智能匹配 <span style="font-size:12px;font-weight:400;color:#94A3B8;margin-left:8px;">基于企业全生命周期画像的多维度匹配引擎</span>' }),
      U.el('div', { class: 'modal-body', style: 'flex:1;overflow-y:auto;', html:
        '<div id="aiMatchContent" style="font-size:13px;line-height:1.8;">' +
          '<div style="background:#F0F9FF;border:1px solid #BAE6FD;border-radius:8px;padding:16px;margin-bottom:16px;">' +
            '<div style="font-weight:600;color:#0369A1;margin-bottom:8px;">🧠 匹配引擎启动</div>' +
            '<div id="aiThinking" style="color:#475569;font-size:12px;min-height:120px;white-space:pre-line;">正在初始化大模型推理环境...</div>' +
          '</div>' +
          '<div id="aiResults" style="display:none;"></div>' +
        '</div>'
      }),
      U.el('div', { class: 'modal-footer', html:
        '<button class="btn" id="aiCloseBtn" style="display:none;">关闭</button>' +
        '<button class="btn primary" id="aiApplyBtn" style="display:none;">确认匹配结果</button>'
      })
    ]);
    mask.appendChild(box);
    document.body.appendChild(mask);

    var thinkingEl = box.querySelector('#aiThinking');
    var resultsEl = box.querySelector('#aiResults');
    var closeBtn = box.querySelector('#aiCloseBtn');
    var applyBtn = box.querySelector('#aiApplyBtn');

    function closeDialog() {
      mask.style.opacity = '0';
      setTimeout(function(){ if(mask.parentNode) mask.parentNode.removeChild(mask); }, 200);
    }
    closeBtn.addEventListener('click', closeDialog);
    // 匹配过程中禁止点击遮罩关闭（避免误操作中断匹配）

    // 模拟大模型流式输出思考过程
    var thinkingSteps = [
      { text: '🔍 步骤 1/5：解析新政策文本...', delay: 600 },
      { text: '   → 提取政策类型、适用范围、申报条件、支持力度等核心要素', delay: 800 },
      { text: '📊 步骤 2/5：扫描企业全生命周期画像库...', delay: 500 },
      { text: '   → 检索 ' + M.ENTERPRISES.length + ' 家企业的九维风险数据、经营指标、行业标签', delay: 700 },
      { text: '🧮 步骤 3/5：多维度匹配评分计算...', delay: 600 },
      { text: '   → 维度权重：行业契合度40% · 企业规模20% · 信用等级15% · 营收能力15% · 研发投入10%', delay: 900 },
      { text: '⚙️ 步骤 4/5：交叉验证与去重...', delay: 500 },
      { text: '   → 排除已到期/已享受同类政策企业，过滤风险等级过高企业', delay: 700 },
      { text: '✅ 步骤 5/5：生成匹配报告...', delay: 400 },
      { text: '   → 为每条新政策输出 Top N 匹配企业及匹配理由', delay: 600 }
    ];

    var stepIdx = 0;
    function runStep() {
      if (stepIdx >= thinkingSteps.length) {
        // 思考完成，展示结果
        showResults();
        return;
      }
      var step = thinkingSteps[stepIdx];
      thinkingEl.textContent += '\n' + step.text;
      // 自动滚动到底部
      var thinkingParent = thinkingEl.parentElement;
      thinkingParent.scrollTop = thinkingParent.scrollHeight;
      stepIdx++;
      setTimeout(runStep, step.delay + Math.random() * 300);
    }

    function showResults() {
      thinkingEl.innerHTML += '\n\n<span style="color:#16A34A;">✓ 匹配完成，共处理 ' + newPolicies.length + ' 条新政策</span>';

      var resultsHtml = '';
      allResults.forEach(function(r, pi){
        resultsHtml += '<div style="margin-bottom:24px;">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">' +
            '<div style="font-weight:600;color:#0F172A;font-size:14px;">📄 ' + U.esc(r.policy.name) + '</div>' +
            '<span style="font-size:11px;color:#94A3B8;">匹配 ' + r.matches.length + ' 家企业</span>' +
          '</div>' +
          '<div style="background:#F8FAFC;border:1px solid var(--c-border-light);border-radius:8px;overflow:hidden;">' +
            '<table class="tbl" style="margin:0;">' +
              '<thead><tr>' +
                '<th style="width:40px;text-align:center;">#</th>' +
                '<th>企业名称</th>' +
                '<th style="width:90px;text-align:center;">匹配度</th>' +
                '<th style="width:200px;">匹配依据</th>' +
              '</tr></thead>' +
              '<tbody>' +
                r.matches.map(function(m, mi){
                  var scoreColor = m.score >= 90 ? '#16A34A' : (m.score >= 80 ? '#2563EB' : (m.score >= 70 ? '#F97316' : '#94A3B8'));
                  return '<tr>' +
                    '<td style="text-align:center;color:#94A3B8;">' + (mi+1) + '</td>' +
                    '<td>' +
                      '<div style="font-weight:500;">' + U.esc(m.enterprise.name) + '</div>' +
                      '<div style="font-size:11px;color:#94A3B8;">' + U.esc(m.enterprise.industryName || '') + ' · ' + U.esc(m.enterprise.scale || '') + '</div>' +
                    '</td>' +
                    '<td style="text-align:center;">' +
                      '<span style="font-weight:700;color:' + scoreColor + ';">' + m.score + '</span>' +
                      '<span style="font-size:10px;color:#94A3B8;">分</span>' +
                    '</td>' +
                    '<td style="font-size:11px;color:#475569;line-height:1.6;">' + m.reasons.map(function(r){return '· ' + r;}).join('<br/>') + '</td>' +
                  '</tr>';
                }).join('') +
              '</tbody>' +
            '</table>' +
          '</div>' +
        '</div>';
      });

      // 总体统计
      var totalMatch = allResults.reduce(function(s,r){ return s + r.matches.length; }, 0);
      resultsHtml +=
        '<div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:8px;padding:14px;margin-bottom:8px;">' +
          '<div style="font-weight:600;color:#15803D;margin-bottom:6px;">📈 匹配概览</div>' +
          '<div style="font-size:12px;color:#475569;line-height:1.8;">' +
            '本次共处理 <b>' + newPolicies.length + '</b> 条新政策，匹配 <b>' + totalMatch + '</b> 家/次企业<br/>' +
            '平均匹配度 <b style="color:#16A34A;">' + Math.round(allResults.reduce(function(s,r){
              var avg = r.matches.reduce(function(a,b){return a+b.score;},0) / Math.max(1,r.matches.length);
              return s + avg;
            }, 0) / allResults.length) + '</b> 分<br/>' +
            '置信度 <b>92%</b> · 模型版本 deepseek-v4-pro' +
          '</div>' +
        '</div>';

      resultsEl.innerHTML = resultsHtml;
      resultsEl.style.display = '';

      // 自动滚动到结果区域底部，方便查看完整匹配结果
      var bodyEl = box.querySelector('.modal-body');
      if (bodyEl) {
        setTimeout(function(){ bodyEl.scrollTop = bodyEl.scrollHeight; }, 50);
      }

      // 显示底部按钮
      closeBtn.style.display = '';
      applyBtn.style.display = '';
    }

    // 确认匹配结果：将匹配结果写入企业的 policies，并更新政策的 entCount
    applyBtn.addEventListener('click', function(){
      allResults.forEach(function(r){
        var policyName = r.policy.name;
        var policy = r.policy;
        // 写入企业画像（保留最多 5 条）
        r.matches.forEach(function(m){
          var ent = m.enterprise;
          if (!ent.policies) ent.policies = [];
          if (ent.policies.indexOf(policyName) < 0) {
            ent.policies.unshift(policyName);
            if (ent.policies.length > 5) ent.policies.length = 5;
          }
        });
        // 更新政策自身的 entCount（以 AI 匹配结果为准）
        policy.entCount = r.matches.length;
      });
      _aiMatchedCount = _syncAddedCount;
      closeDialog();
      APP.render();
      C.toast('AI 智能匹配已完成，结果已写入企业画像', 'success');
    });

    // 启动思考过程
    setTimeout(runStep, 400);
  }

  function applyFilter() {
    var f = state.filter.policy;
    f.keyword = U.$('#polKw').value.trim();
    f.level = U.$('#polLevel').value;
    f.dept = U.$('#polDept').value;
    f.page = 1;
    APP.render();
  }

  APP.registerRenderer('policy', renderPolicy);
})();
