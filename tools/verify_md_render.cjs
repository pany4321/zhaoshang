#!/usr/bin/env node
/**
 * 大模型输出渲染回归：APP.U.md() / APP.U.mdPlain()
 *
 * 覆盖：标题 / 有序列表 / 无序列表 / 缩进续行 / 表格 / 引用 / 分隔线 /
 *       未闭合标记（流式宽容）/ XSS 三类向量 / 危险协议链接 /
 *       「1.5亿元」不被误判为列表 / 5000 字单行性能 /
 *       流式前缀缓存最终结果 == 全量渲染 / mdPlain 剥标记
 *
 * 用法：node tools/verify_md_render.cjs
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const utilsSrc = fs.readFileSync(path.join(__dirname, '..', 'demo/assets/js/common/utils.js'), 'utf-8');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { runScripts: 'outside-only' });
dom.window.eval(utilsSrc);
const U = dom.window.APP.U;

let fail = 0;
function ok(name, cond, extra) {
  if (cond) { console.log('✅ ' + name); }
  else { fail++; console.log('❌ ' + name + (extra ? '  → ' + extra : '')); }
}

if (!U || typeof U.md !== 'function') {
  console.log('❌ APP.U.md 未注册');
  process.exit(1);
}
const md = U.md;

// ---------- 1. 空值与纯文本 ----------
ok('空字符串 → 空', md('') === '');
ok('null → 空', md(null) === '');
ok('undefined → 空', md(undefined) === '');
ok('纯短句包段落', /^<p class="md-p">经营稳健。<\/p>$/.test(md('经营稳健。')), md('经营稳健。'));

// ---------- 2. 标题 ----------
const h2 = md('## 一、主要原因');
ok('## 标题 → md-h2', /class="md-h md-h2"[^>]*>一、主要原因</.test(h2), h2);
ok('### 标题 → md-h3', /md-h3/.test(md('### 小标题')));
const bh = md('**一、企业结构（平台样本88家）**');
ok('整行加粗中文序号 → 小标题（不留 **）', /md-h4/.test(bh) && bh.indexOf('**') < 0, bh);

// ---------- 3. 列表 ----------
const ol = md('1. 第一项\n2. 第二项\n3. 第三项');
ok('有序列表 → <ol class="md-list"> 3 项', /<ol class="md-list">/.test(ol) && (ol.match(/<li>/g) || []).length === 3, ol);
const ul = md('- 甲\n- 乙\n* 丙');
ok('无序列表 → <ul class="md-list"> 3 项', /<ul class="md-list">/.test(ul) && (ul.match(/<li>/g) || []).length === 3, ul);
ok('（1）中文括号序号也是有序列表', /<ol class="md-list">/.test(md('（1）甲\n（2）乙')));

// ---------- 4. 缩进续行（模型高频写法） ----------
const cont = md('1. **企业自身承贷能力偏弱**  \n   庆阳多数中小企业规模小、资产轻。\n2. **产业错配**  \n   应收账款账期长。');
ok('缩进续行并入上一条目（1 项 1 个 li、含 <br/>）',
  (cont.match(/<li>/g) || []).length === 2 && cont.indexOf('<br/>') > -1 && cont.indexOf('资产轻') > -1, cont);
ok('列表项内粗体正常', /<li><strong>企业自身承贷能力偏弱<\/strong>/.test(cont), cont);

// ---------- 5. 表格 ----------
const tbl = md('| 类型 | 难点 | 方式 |\n|---|---|---|\n| 工矿类 | 账期长 | 供应链金融 |\n| 农业类 | 抵押难 | 政银担 |');
ok('表格 → md-table，2 行 3 列',
  /<table class="md-table">/.test(tbl) && (tbl.match(/<tr>/g) || []).length === 3 && (tbl.match(/<th>/g) || []).length === 3, tbl);
ok('表格单元格内粗体被解析', /<td><strong>重点<\/strong><\/td>/.test(md('| A |\n|---|\n| **重点** |')));
ok('表格外竖线文本不当表格', md('a | b 不是表格').indexOf('md-table') < 0);

// ---------- 6. 引用 / 分隔线 ----------
ok('> 引用 → blockquote', /<blockquote class="md-quote">注：口径为2025年<\/blockquote>/.test(md('> 注：口径为2025年')));
ok('--- → hr', /<hr class="md-hr"\/>/.test(md('甲\n\n---\n\n乙')));

// ---------- 7. 流式宽容：未闭合标记 ----------
ok('未闭合 ** 被抹掉', md('**一、企业结构（平台').indexOf('**') < 0, md('**一、企业结构（平台'));
ok('未闭合 ` 被抹掉', md('共计 `123').indexOf('`') < 0);
ok('成对 ** 正常出 strong', /<strong>粗<\/strong>/.test(md('**粗**')));

// ---------- 8. XSS ----------
const x1 = md('<script>alert(1)</script>');
ok('script 标签被转义', x1.indexOf('<script') < 0 && x1.indexOf('&lt;script&gt;') > -1, x1);
const x2 = md('<img src=x onerror=alert(1)>');
ok('img/onerror 被转义', x2.indexOf('<img') < 0 && x2.indexOf('onerror') > -1 && x2.indexOf('&lt;img') > -1, x2);
const x3 = md('[点我](javascript:alert(1))');
ok('javascript: 链接降级为纯文本', x3.indexOf('javascript:') < 0 && x3.indexOf('<a ') < 0, x3);
const x4 = md('[官网](https://example.com/a?b=1&c=2)');
ok('正常链接保留并带 rel=noopener', /<a href="https:\/\/example\.com\/a\?b=1&amp;c=2"[^>]*rel="noopener noreferrer"/.test(x4), x4);

// ---------- 9. 误判防护 ----------
ok('「1.5亿元」不当列表', md('营收 1.5亿元').indexOf('md-list') < 0, md('营收 1.5亿元'));
ok('金额与百分比保留', md('营收1.5亿元，增长12.3%').indexOf('1.5亿元') > -1);

// ---------- 10. 性能：5000 字单行 ----------
const big = new Array(5001).join('庆');
const t0 = Date.now();
const bigOut = md(big);
const dt = Date.now() - t0;
ok('5000 字单行 < 200ms（实测 ' + dt + 'ms）', dt < 200 && bigOut.length > 5000);

// ---------- 11. 流式前缀缓存 == 全量渲染 ----------
const sample = [
  '## 一、主要原因',
  '',
  '1. **承贷能力偏弱**  ',
  '   规模小、资产轻。',
  '2. **产业错配**  ',
  '   账期长。',
  '',
  '## 二、对比',
  '',
  '| 类型 | 难点 |',
  '|---|---|',
  '| 工矿 | 账期长 |',
  '| 农业 | 抵押难 |',
].join('\n');
function streamRender(text) {
  const cut = text.lastIndexOf('\n\n');
  if (cut < 0) return md(text);
  return md(text.slice(0, cut)) + md(text.slice(cut));
}
const full = md(sample);
let streamOk = true;
for (let k = 1; k <= sample.length; k += 7) {
  const partial = sample.slice(0, k);
  const got = streamRender(partial);
  if (got.indexOf('**') > -1 || got.indexOf('##') > -1 || got.indexOf('|---') > -1) {
    streamOk = false;
    console.log('   流式中途露出标记：k=' + k + ' → ' + JSON.stringify(got.slice(0, 120)));
    break;
  }
}
const tail = sample.length;
ok('流式逐段渲染全程不露 ** / ## / |---', streamOk);
ok('流式末帧与全量渲染一致', streamRender(sample.slice(0, tail)) === full);

// ---------- 12. mdPlain（PDF 通道） ----------
const plain = U.mdPlain('## 一、摘要\n\n**重点**：营收 1.5亿元。\n\n1. 甲\n2. 乙\n\n| A |\n|---|');
ok('mdPlain 剥掉标题/粗体/竖线', plain.indexOf('#') < 0 && plain.indexOf('**') < 0 && plain.indexOf('|') < 0, JSON.stringify(plain));
ok('mdPlain 保留正文', plain.indexOf('重点：营收 1.5亿元。') > -1, JSON.stringify(plain));

// ---------- 汇总 ----------
console.log('\n' + (fail === 0 ? '全部通过 ✅' : fail + ' 项失败 ❌'));
process.exit(fail === 0 ? 0 : 1);
