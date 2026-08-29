/* ============================================================
 * V4 公共组件库：Toast、Confirm Modal、Drawer、空态、分页、表格工具
 * 所有组件挂在 window.APP.Components
 * ============================================================ */
(function () {
  'use strict';
  var U = APP.U;
  var state = APP.state;

  // ---------- Toast ----------
  function toast(msg, type) {
    type = type || 'info'; // info / success / warning / error
    var wrap = document.getElementById('toastWrap');
    if (!wrap) {
      wrap = U.el('div', { id: 'toastWrap', class: 'toast-wrap' });
      // 挂到 .app 下（全屏时仍可见），兜底 body
      (document.querySelector('.app') || document.body).appendChild(wrap);
    }
    var t = U.el('div', { class: 'toast toast-' + type, html: U.esc(msg) });
    wrap.appendChild(t);
    // 触发动画（每个 toast 独立计时，互不影响）
    requestAnimationFrame(function () { t.classList.add('show'); });
    setTimeout(function () {
      t.classList.remove('show');
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 250);
    }, 2200);
  }

  // ---------- Confirm Modal ----------
  // 调用约定：C.confirm(标题, 内容, 确认回调[, 取消回调]) 或 C.confirm({title, html|content, hideCancel}, 确认回调[, 取消回调])
  // 取消：仅关闭（触发 onCancel，如有）；确定：关闭并执行确认回调。两者行为互不干扰。
  function confirmBox(a1, a2, a3, a4) {
    var title, bodyHtml, onOk, onCancel, hideCancel;
    if (typeof a1 === 'string') {
      title = a1; bodyHtml = U.esc(a2 || ''); onOk = a3; onCancel = a4;
    } else {
      title = (a1 && a1.title) || '确认';
      bodyHtml = a1 ? (a1.html || U.esc(a1.content || '')) : '';
      hideCancel = a1 && a1.hideCancel;
      onOk = a2; onCancel = a3;
    }
    var closed = false;
    var mask = U.el('div', { class: 'modal-mask' });
    var cancelBtn = U.el('button', { class: 'btn sm', onclick: function () { close(); } }, '取消');
    if (hideCancel) cancelBtn.style.display = 'none';
    var box = U.el('div', { class: 'modal' }, [
      U.el('div', { class: 'modal-header' }, title),
      U.el('div', { class: 'modal-body', html: bodyHtml }),
      U.el('div', { class: 'modal-footer', style: hideCancel ? 'justify-content:center;' : '' }, [
        cancelBtn,
        U.el('button', { class: 'btn sm primary', onclick: function () { close(); onOk && onOk(); } }, '确定')
      ])
    ]);
    mask.appendChild(box);
    (document.querySelector('.app') || document.body).appendChild(mask);

    function close() {
      if (closed) return;
      closed = true;
      if (mask.parentNode) mask.parentNode.removeChild(mask);
      onCancel && onCancel();
    }
    mask.addEventListener('click', function (e) { if (e.target === mask) close(); });
    return { close: close };
  }

  // ---------- Drawer ----------
  var drawerClearTimer = null; // 关闭后的延迟清场定时器；重开时需取消，避免清掉新抽屉
  function openDrawer(opts) {
    // opts: { title, subtitle, tag, tagClass, width, bodyHtml, onClose }
    var wrap = document.getElementById('drawerWrap');
    if (!wrap) {
      wrap = U.el('div', { id: 'drawerWrap' });
      (document.querySelector('.app') || document.body).appendChild(wrap);
    }
    if (drawerClearTimer) { clearTimeout(drawerClearTimer); drawerClearTimer = null; }
    var tagHtml = opts.tag
      ? '<span class="tag ' + (opts.tagClass || '') + '">' + U.esc(opts.tag) + '</span>'
      : '';
    var subHtml = opts.subtitle ? '<div class="dh-sub">' + U.esc(opts.subtitle) + '</div>' : '';
    wrap.innerHTML =
      '<div class="drawer-mask" id="drawerMask"></div>' +
      '<div class="drawer" style="width:' + (opts.width || 520) + 'px">' +
        '<div class="drawer-header">' +
          '<div class="dh-title-wrap">' +
            '<div class="dh-title">' + U.esc(opts.title || '') + '</div>' + subHtml +
          '</div>' + tagHtml +
          '<div class="drawer-close" id="drawerClose">×</div>' +
        '</div>' +
        '<div class="drawer-body">' + (opts.bodyHtml || '') + '</div>' +
      '</div>';
    // 进场
    requestAnimationFrame(function () {
      wrap.querySelector('.drawer').classList.add('in');
    });
    wrap.querySelector('#drawerMask').addEventListener('click', closeDrawer);
    wrap.querySelector('#drawerClose').addEventListener('click', closeDrawer);
    if (opts.onReady) opts.onReady(wrap);
  }
  function closeDrawer() {
    var wrap = document.getElementById('drawerWrap');
    if (!wrap) return;
    var dr = wrap.querySelector('.drawer');
    if (dr) dr.classList.remove('in');
    if (drawerClearTimer) clearTimeout(drawerClearTimer);
    drawerClearTimer = setTimeout(function () {
      drawerClearTimer = null;
      if (wrap.parentNode) wrap.innerHTML = '';
    }, 200);
  }

  // ---------- 空态 ----------
  function emptyHtml(icon, text, btnText, onBtn) {
    var btn = btnText
      ? '<div class="empty-btn"><button class="btn sm primary">' + U.esc(btnText) + '</button></div>'
      : '';
    var html = '<div class="empty-state">' +
      '<div class="empty-icon">' + (icon || '📭') + '</div>' +
      '<div class="empty-text">' + U.esc(text || '暂无数据') + '</div>' + btn +
      '</div>';
    return html;
  }

  // ---------- 分页 ----------
  // 返回 HTML 字符串；调用者自己绑定 .pg-btn 事件
  function paginationHtml(current, total, pageSize) {
    var totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (totalPages <= 1) return '';
    current = Math.max(1, Math.min(current, totalPages));
    var pages = [];
    // 生成页码序列（1 ... 4 5 6 ... N）
    function push(p) { pages.push(p); }
    push(1);
    var start = Math.max(2, current - 1);
    var end = Math.min(totalPages - 1, current + 1);
    if (start > 2) push('...');
    for (var i = start; i <= end; i++) push(i);
    if (end < totalPages - 1) push('...');
    if (totalPages > 1) push(totalPages);

    var html = '<div class="pagination">';
    html += '<button class="pg-btn prev" data-page="' + (current - 1) + '"' + (current === 1 ? ' disabled' : '') + '>上一页</button>';
    pages.forEach(function (p) {
      if (p === '...') {
        html += '<span class="pg-dot">…</span>';
      } else {
        html += '<button class="pg-btn' + (p === current ? ' active' : '') + '" data-page="' + p + '">' + p + '</button>';
      }
    });
    html += '<button class="pg-btn next" data-page="' + (current + 1) + '"' + (current === totalPages ? ' disabled' : '') + '>下一页</button>';
    html += '<span class="pg-total">共 ' + total + ' 条 / ' + totalPages + ' 页</span>';
    html += '</div>';
    return html;
  }
  // 绑定分页事件（事件委托到父容器）
  function bindPagination(parent, onChange) {
    parent.addEventListener('click', function (e) {
      var btn = e.target.closest('.pg-btn');
      if (!btn || btn.disabled || btn.getAttribute('disabled') !== null) return;
      if (btn.classList.contains('disabled')) return;
      var p = parseInt(btn.dataset.page);
      if (!isNaN(p) && p >= 1) onChange(p);
    });
  }

  // ---------- 排序表格工具 ----------
  // sortState: { key, dir: 'asc'|'desc' }
  function thHtml(label, key, sortState) {
    var active = sortState && sortState.key === key;
    var dir = active ? sortState.dir : '';
    return '<th class="sort-th' + (active ? ' sorted-' + dir : '') + '" data-sort="' + key + '">' +
      U.esc(label) + '<span class="sort-icon"><span class="si-up">▲</span><span class="si-dn">▼</span></span></th>';
  }
  function bindTableSort(parent, onChange) {
    parent.addEventListener('click', function (e) {
      var th = e.target.closest('.sort-th');
      if (!th) return;
      var key = th.dataset.sort;
      onChange(key);
    });
  }

  // ---------- 骨架屏 ----------
  function skeletonHtml(rows, cols) {
    rows = rows || 6;
    cols = cols || 1;
    var html = '<div class="skeleton-wrap">';
    for (var r = 0; r < rows; r++) {
      html += '<div class="sk-row">';
      for (var c = 0; c < cols; c++) {
        html += '<div class="sk-bar" style="width:' + (c === 0 ? '30%' : (80 - c * 10) + '%') + '"></div>';
      }
      html += '</div>';
    }
    html += '</div>';
    return html;
  }

  // ---------- 风险等级徽标 ----------
  function lvlBadge(level) {
    var L = (window.MOCK && window.MOCK.LEVELS) || {};
    var lv = L[level];
    if (!lv) return '<span class="lvl">' + U.esc(level || '-') + '</span>';
    return '<span class="lvl ' + level + '">' + lv.name + '</span>';
  }

  // ---------- 导出 CSV ----------
  function exportCSV(filename, headers, rows) {
    var csv = '﻿'; // UTF-8 BOM，防 Excel 打开中文乱码
    csv += headers.map(function (h) { return csvEscape(h); }).join(',') + '\n';
    rows.forEach(function (r) {
      csv += r.map(function (v) { return csvEscape(v); }).join(',') + '\n';
    });
    var fname = filename + '.csv';
    // 优先用 msSaveBlob（Edge/IE 旧版）
    if (navigator.msSaveBlob) {
      navigator.msSaveBlob(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), fname);
      return;
    }
    // 用 data URI 而不是 Blob URL：
    // Blob URL 在 file:// 协议下会被浏览器忽略 download 属性，导出成 UUID 文件名；
    // data URI 能稳定保留中文文件名，且 CSV 体积小，完全够用。
    var url = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    var a = U.el('a', { href: url, download: fname, style: 'display:none;' });
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      if (a.parentNode) a.parentNode.removeChild(a);
    }, 200);
  }
  function csvEscape(v) {
    v = v == null ? '' : String(v);
    if (v.indexOf(',') >= 0 || v.indexOf('"') >= 0 || v.indexOf('\n') >= 0) {
      v = '"' + v.replace(/"/g, '""') + '"';
    }
    return v;
  }

  // ---------- 输出 ----------
  window.APP = window.APP || {};
  window.APP.Components = {
    toast: toast,
    confirm: confirmBox,
    openDrawer: openDrawer,
    closeDrawer: closeDrawer,
    emptyHtml: emptyHtml,
    paginationHtml: paginationHtml,
    bindPagination: bindPagination,
    thHtml: thHtml,
    bindTableSort: bindTableSort,
    skeletonHtml: skeletonHtml,
    lvlBadge: lvlBadge,
    exportCSV: exportCSV
  };
})();
