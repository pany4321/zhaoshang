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

  // ---------- 大模型输出渲染：Markdown 子集 ----------
  // 只覆盖大模型实际会写的语法，够用即止：
  //   #~#### 标题、整行加粗的中文序号小标题、1. / （1） 有序列表、
  //   - / * / + 无序列表（含「两空格硬换行 + 缩进」续行）、> 引用、
  //   |表格|、--- 分隔线、空行分段、**粗体** *斜体* `代码` ~~删除~~ [文本](url)
  // 安全边界：先 esc 再解析，输出只含白名单标签；链接协议白名单。
  // 流式宽容：未闭合的 ** 与 ` 直接抹掉，不在打字途中闪星号。
  var MD_LINK = /\[([^\]\n]+)\]\(([^)\s]+)\)/g;
  var MD_CN_NUM = /^[（(]?[一二三四五六七八九十百]+[)）]?[、.．]/;
  var MD_PROTO_BAD = /^\s*(javascript|data|vbscript):/i;

  function mdInline(s) {
    // 链接先抽成占位符，避免 URL 中的 * _ ~ 被后续规则误伤
    var links = [];
    s = s.replace(MD_LINK, function (m, t, u) {
      if (MD_PROTO_BAD.test(u)) return t; // 危险协议降级为纯文本
      links.push('<a href="' + u + '" target="_blank" rel="noopener noreferrer">' + t + '</a>');
      return '\u0001' + (links.length - 1) + '\u0001';
    });
    s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
         .replace(/__([^_\n]+)__/g, '<strong>$1</strong>')
         .replace(/(^|[^*\w])\*([^*\n]+)\*(?![*\w])/g, '$1<em>$2</em>')
         .replace(/~~([^~\n]+)~~/g, '<del>$1</del>')
         .replace(/`([^`\n]+)`/g, '<code>$1</code>')
         .replace(/\*\*/g, '')  // 残留未闭合的 ** 抹掉
         .replace(/`/g, '');    // 残留未闭合的反引号抹掉
    return s.replace(/\u0001(\d+)\u0001/g, function (m, n) { return links[+n] || ''; });
  }

  function mdSplitRow(line) {
    return line.replace(/^\|/, '').replace(/\|$/, '').split('|').map(function (c) { return c.trim(); });
  }

  function mdTable(head, rows) {
    var th = head.map(function (c) { return '<th>' + mdInline(c) + '</th>'; }).join('');
    var body = rows.map(function (r) {
      var tds = '';
      for (var c = 0; c < head.length; c++) tds += '<td>' + mdInline(r[c] || '') + '</td>';
      return '<tr>' + tds + '</tr>';
    }).join('');
    return '<div class="md-table-wrap"><table class="md-table"><thead><tr>' + th +
      '</tr></thead><tbody>' + body + '</tbody></table></div>';
  }

  function md(raw) {
    var text = esc(String(raw == null ? '' : raw)).replace(/\r\n?/g, '\n');
    var L = text.split('\n');
    var out = [];
    var para = [];
    var list = null;   // { tag: 'ol'|'ul', items: [ [html...] ] }
    var quote = [];

    function flushPara() {
      if (!para.length) return;
      out.push('<p class="md-p">' + para.join('<br/>') + '</p>');
      para = [];
    }
    function flushList() {
      if (!list) return;
      var items = list.items.map(function (it) { return '<li>' + it.join('<br/>') + '</li>'; });
      out.push('<' + list.tag + ' class="md-list">' + items.join('') + '</' + list.tag + '>');
      list = null;
    }
    function flushQuote() {
      if (!quote.length) return;
      out.push('<blockquote class="md-quote">' + quote.join('<br/>') + '</blockquote>');
      quote = [];
    }
    function flushAll() { flushPara(); flushList(); flushQuote(); }

    for (var i = 0; i < L.length; i++) {
      var rawLine = L[i];
      var noTail = rawLine.replace(/[ \t]+$/, '');       // 去掉行尾硬换行空格
      var t = noTail.trim();
      var indent = noTail.length - noTail.replace(/^[ \t]+/, '').length;

      // 空行 —— 块边界
      if (!t) { flushAll(); continue; }
      // 引用块结束（注意：esc 之后 > 已变成 &gt;）
      if (quote.length && !/^&gt;/.test(t)) flushQuote();

      // 引用行
      if (/^&gt;/.test(t)) {
        flushPara(); flushList();
        quote.push(mdInline(t.replace(/^&gt;\s?/, '')));
        continue;
      }

      // 缩进续行：并入上一个列表项 / 段落 / 引用（模型常用缩进写条目正文）
      if (indent >= 2) {
        if (list && list.items.length) { list.items[list.items.length - 1].push(mdInline(t)); continue; }
        if (para.length) { para.push(mdInline(t)); continue; }
        if (quote.length) { quote.push(mdInline(t)); continue; }
      }

      // 表格：|表头| 下一行是分隔行（流式下分隔行可能尚未闭合，也认）
      if (/^\|.*\|$/.test(t)) {
        var nx = (L[i + 1] || '').trim();
        if (/^\|[\s:|-]*$/.test(nx) && nx.indexOf('-') > -1) {
          flushPara(); flushList();
          var head = mdSplitRow(t);
          i += 2;
          var rows = [];
          while (i < L.length && /^\|.*\|$/.test(L[i].trim())) { rows.push(mdSplitRow(L[i].trim())); i++; }
          i--;
          out.push(mdTable(head, rows));
          continue;
        }
      }

      // ATX 标题
      var hm = t.match(/^(#{1,6})\s+(.+)$/);
      if (hm) {
        flushPara(); flushList();
        out.push('<div class="md-h md-h' + hm[1].length + '">' + mdInline(hm[2]) + '</div>');
        continue;
      }

      // 分隔线
      if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) {
        flushPara(); flushList();
        out.push('<hr class="md-hr"/>');
        continue;
      }

      // 整行加粗且以中文序号开头（如 **一、风险总体**）→ 小标题
      var bm = t.match(/^\*\*([^*\n]{1,40})\*\*[：:]?$/);
      if (bm && MD_CN_NUM.test(bm[1])) {
        flushPara(); flushList();
        out.push('<div class="md-h md-h4">' + mdInline(bm[1]) + '</div>');
        continue;
      }

      // 无序列表
      var ulm = t.match(/^[-*+]\s+(.+)$/);
      // 有序列表：1. / 1、 / 1) / （1）；(?!\d) 避免把「1.5亿元」当列表
      var olm = t.match(/^\d{1,2}[.、)](?!\d)\s*(.+)$/) || t.match(/^[（(]\d{1,2}[)）]\s*(.+)$/);

      if (ulm) {
        flushPara();
        if (!list || list.tag !== 'ul') { flushList(); list = { tag: 'ul', items: [] }; }
        list.items.push([mdInline(ulm[1])]);
        continue;
      }
      if (olm) {
        flushPara();
        if (!list || list.tag !== 'ol') { flushList(); list = { tag: 'ol', items: [] }; }
        list.items.push([mdInline(olm[1])]);
        continue;
      }

      // 中文序号小节（一、xxx）短行 → 小标题
      if (MD_CN_NUM.test(t) && t.length <= 32) {
        flushPara(); flushList();
        out.push('<div class="md-h md-h4">' + mdInline(t.replace(/[：:]$/, '')) + '</div>');
        continue;
      }

      // 流式半截标记：只剩标记没有内容 → 吞掉，避免逐帧闪烁
      if (/^#{1,6}$/.test(t) || /^\|[\s:|-]*$/.test(t) || /^[-*_]{1,2}$/.test(t)) continue;

      // 半截表格行（流式传输中）：剥掉竖线按段落渲染，不露字面
      if (t.charAt(0) === '|') {
        flushList();
        para.push(mdInline(t.replace(/^\|/, '').replace(/\|$/, '').replace(/\s*\|\s*/g, ' · ')));
        continue;
      }

      // 普通段落
      flushList();
      para.push(mdInline(t));
    }
    flushAll();
    return out.join('');
  }

  // 纯文本化：给不支持 HTML 的通道（PDF）用，剥掉标记保留可读结构
  function mdPlain(raw) {
    var s = String(raw == null ? '' : raw);
    return s.replace(/\r\n?/g, '\n')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/^\s{0,3}#{1,6}\s+/gm, '')
      .replace(/\*\*([^*\n]+)\*\*/g, '$1')
      .replace(/__([^_\n]+)__/g, '$1')
      .replace(/(^|[^*\w])\*([^*\n]+)\*(?![*\w])/g, '$1$2')
      .replace(/~~([^~\n]+)~~/g, '$1')
      .replace(/`([^`\n]+)`/g, '$1')
      .replace(/\[([^\]\n]+)\]\([^)\s]+\)/g, '$1')
      .replace(/^\s*\|[\s:|-]+\|\s*$/gm, '')          // 表格分隔行整行删掉
      .replace(/^\s*\|(.*?)\|\s*$/gm, function (m, inner) {  // 表格行竖线转全角分隔符
        return inner.split('|').map(function (x) { return x.trim(); }).join('　｜　');
      })
      .replace(/^\s*>\s?/gm, '')
      .replace(/\*\*/g, '')
      .trim();
  }

  // ---------- AI 回答导出（PDF / Word）----------
  // 走服务端渲染：字体子集化后一份中文报告只有 50–200KB。
  // 纯前端 jsPDF 方案要把整个中文字体嵌进 PDF（3MB+/份），自由文本场景不划算，
  // 因此只有离线 file:// 直开时才不可用（调用方需自行兜底提示）。
  function saveBlob(name, blob) {
    var url = URL.createObjectURL(blob);
    var a = el('a', { href: url, download: name, style: 'display:none;' });
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      if (a.parentNode) a.parentNode.removeChild(a);
      URL.revokeObjectURL(url);
    }, 600);
  }

  function authToken() {
    try { return localStorage.getItem('zs_token') || ''; } catch (e) { return ''; }
  }

  function filenameFromResponse(r, fallback) {
    var cd = '';
    try { cd = r.headers.get('Content-Disposition') || ''; } catch (e) {}
    var m = /filename\*=UTF-8''([^;]+)/i.exec(cd);
    if (m) { try { return decodeURIComponent(m[1]); } catch (e) {} }
    return fallback;
  }

  /** 把一段 Markdown 文本导出成 PDF / Word 并触发下载 */
  function exportAnswer(o) {
    o = o || {};
    var token = authToken();
    var fmt = o.format === 'docx' ? 'docx' : 'pdf';
    if (!token || typeof fetch !== 'function') {
      return Promise.reject(new Error('离线演示环境不支持文件导出，请登录后使用'));
    }
    return fetch('/api/ai/export/' + fmt, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({
        title: o.title || 'AI 分析报告',
        subtitle: o.subtitle || '',
        meta: o.meta || [],
        markdown: o.markdown || ''
      })
    }).then(function (r) {
      var ct = '';
      try { ct = r.headers.get('Content-Type') || ''; } catch (e) {}
      if (ct.indexOf('application/json') >= 0) {
        return r.json().then(function (j) { throw new Error((j && j.msg) || '导出失败'); });
      }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      var name = filenameFromResponse(r, (o.title || 'AI分析报告') + '.' + fmt);
      return r.blob().then(function (b) { saveBlob(name, b); return name; });
    });
  }

  /** 下载服务端登记过的附件（对话接口返回的 files[].url） */
  function downloadAttachment(url, name) {
    var token = authToken();
    if (!token || typeof fetch !== 'function') return Promise.reject(new Error('离线演示环境不支持下载'));
    return fetch(url, { headers: { 'Authorization': 'Bearer ' + token } }).then(function (r) {
      var ct = '';
      try { ct = r.headers.get('Content-Type') || ''; } catch (e) {}
      if (ct.indexOf('application/json') >= 0) {
        return r.json().then(function (j) { throw new Error((j && j.msg) || '下载失败'); });
      }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      var fn = filenameFromResponse(r, name || 'attachment');
      return r.blob().then(function (b) { saveBlob(fn, b); return fn; });
    });
  }

  /** 从回答里挑出模型自己给出的文件链接（.pdf/.docx/.xlsx/.csv），供渲染成下载卡片 */
  function mdFileLinks(raw) {
    var out = [];
    var re = /\[([^\]\n]{1,80})\]\(([^)\s]+\.(?:pdf|docx|xlsx|doc|csv))\)/gi;
    var s = String(raw == null ? '' : raw);
    var m;
    while ((m = re.exec(s)) !== null) {
      out.push({ name: m[1], url: m[2], ext: String(m[2].split('.').pop() || '').toLowerCase() });
    }
    return out;
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
    md: md, mdPlain: mdPlain,
    saveBlob: saveBlob, exportAnswer: exportAnswer, downloadAttachment: downloadAttachment, mdFileLinks: mdFileLinks,
    fmtNum: fmtNum, fmtWan: fmtWan,
    fmtDate: fmtDate, fmtDateTime: fmtDateTime,
    daysAgo: daysAgo, daysFromNow: daysFromNow, inLastNDays: inLastNDays,
    pad: pad,
    makeRng: makeRng, pick: pick, randInt: randInt, randFloat: randFloat, randBool: randBool
  };
  window.APP.U = U;
})();
