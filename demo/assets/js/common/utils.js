/* ============================================================
 * V4 基础工具库：DOM、转义、日期、格式化、命名空间
 * 纯函数，无 DOM 副作用（除注册命名空间）
 * ============================================================ */
(function () {
  'use strict';

  // ---------- DOM 工具 ----------
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }
  function el(tag, attrs, children) {
    var d = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (k === 'class') d.className = attrs[k];
        else if (k === 'style') d.style.cssText = attrs[k];
        else if (k.indexOf('on') === 0) d.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
        else if (k === 'html') d.innerHTML = attrs[k];
        else d.setAttribute(k, attrs[k]);
      }
    }
    if (children) {
      (Array.isArray(children) ? children : [children]).forEach(function (c) {
        if (c == null) return;
        d.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      });
    }
    return d;
  }

  // ---------- HTML 转义 ----------
  var ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ESC_MAP[c]; });
  }

  // ---------- 数字格式化 ----------
  function fmtNum(n, digits) {
    if (n == null || isNaN(n)) return '-';
    var d = digits == null ? 0 : digits;
    return Number(n).toLocaleString('zh-CN', {
      minimumFractionDigits: d, maximumFractionDigits: d
    });
  }
  // 金额：万元 → 带单位的易读形式
  function fmtWan(n) {
    if (n == null) return '-';
    n = Number(n);
    if (n >= 10000) return (n / 10000).toFixed(1) + ' 亿';
    return n.toLocaleString('zh-CN') + ' 万';
  }

  // ---------- 日期 ----------
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function fmtDate(d) {
    d = d instanceof Date ? d : new Date(d);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function fmtDateTime(d) {
    d = d instanceof Date ? d : new Date(d);
    return fmtDate(d) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function daysAgo(n) {
    var d = new Date();
    d.setDate(d.getDate() - n);
    return d;
  }
  function daysFromNow(n) {
    var d = new Date();
    d.setDate(d.getDate() + n);
    return d;
  }
  function inLastNDays(dateStr, n) {
    var t = new Date(dateStr).getTime();
    var now = Date.now();
    return !isNaN(t) && (now - t) <= n * 86400000 && t <= now;
  }

  // ---------- 随机工具（可种子化，演示用）----------
  // Mulberry32 伪随机，种子固定则结果稳定
  function makeRng(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
  function randInt(rng, a, b) { return a + Math.floor(rng() * (b - a + 1)); }
  function randFloat(rng, a, b, digits) {
    var v = a + rng() * (b - a);
    return digits == null ? v : Number(v.toFixed(digits));
  }
  function randBool(rng, prob) { return rng() < prob; }

  // ---------- 命名空间注册 ----------
  window.APP = window.APP || {};
  var U = {
    $: $, $$: $$, el: el,
    esc: esc,
    fmtNum: fmtNum, fmtWan: fmtWan,
    fmtDate: fmtDate, fmtDateTime: fmtDateTime,
    daysAgo: daysAgo, daysFromNow: daysFromNow, inLastNDays: inLastNDays,
    pad: pad,
    makeRng: makeRng, pick: pick, randInt: randInt, randFloat: randFloat, randBool: randBool
  };
  window.APP.U = U;
})();
