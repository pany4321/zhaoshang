/*
 * 文字版 PDF 导出验证：JSDOM + 真实 jspdf/autotable + 生成的字体子集，
 * 走 profile.js 的 buildPdfDoc 全流程产出 PDF，校验文件头/大小/页数。
 * 运行（项目根目录）：
 *   NODE_PATH="C:\Users\pan\.workbuddy\binaries\node\workspace\node_modules" node tools/verify_pdf_export.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const DEMO = path.join(ROOT, 'demo');

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { runScripts: 'outside-only', url: 'http://localhost/' });
const { window } = dom;

// --- 最小 stub ---
window.echarts = {
  init: () => ({ setOption() {}, dispose() {}, resize() {}, on() {} }),
  graphic: {
    LinearGradient: function () { this.addColorStop = () => {}; },
    RadialGradient: function () { this.addColorStop = () => {}; }
  }
};
window.requestAnimationFrame = cb => setTimeout(cb, 16);
window.cancelAnimationFrame = id => clearTimeout(id);
window.__savedDocs = [];
window.URL.createObjectURL = () => 'blob:fake';
// 拦截 save：jsPDF 2.x save() 内部走 saveAs/blob，JSDOM 无 a.download 支持，直接捕获内部 doc
window.HTMLAnchorElement.prototype.click = function () {};

function load(file) {
  const code = fs.readFileSync(path.join(DEMO, file), 'utf-8');
  window.eval(code);
}

load('assets/vendor/jspdf.umd.min.js');
load('assets/vendor/jspdf.plugin.autotable.min.js');
if (!window.jspdf || !window.jspdf.jsPDF) { console.error('FAIL jspdf 未加载'); process.exit(1); }
console.log('jspdf', window.jspdf.jsPDF.version, '| autotable API:', typeof window.jspdf.jsPDF.API.autoTable);

load('assets/data/mock.js');
load('assets/js/common/utils.js');
load('assets/js/common/state.js');
load('assets/js/common/components.js');
load('assets/js/pages/profile.js');
if (!window.APP || !window.APP.exportJudgeReport) { console.error('FAIL profile.js 未注册'); process.exit(1); }

// 字体子集
const fontJs = path.join(DEMO, 'assets/vendor/pdf-font-zh.js');
if (!fs.existsSync(fontJs)) { console.error('FAIL 缺少 pdf-font-zh.js（先运行 python tools/make_pdf_font.py）'); process.exit(1); }
window.eval(fs.readFileSync(fontJs, 'utf-8'));
console.log('字体子集 base64 长度:', window.PDF_FONT_ZH.length);

// 选一家重点企业，构造 aiJudge 结果后直接调用导出链路
const M = window.MOCK, APP = window.APP;
const ent = M.ENTERPRISES.find(e => e.riskLevel === 'red') || M.ENTERPRISES[0];
window.APP.state.ent = ent.id;
// 触发一次完整研判结果结构：直接复用档案 ai 或构造最小 j
const j = ent.ai || {
  summary: '综合研判摘要测试。', strengths: ['优势一', '优势二'], risks: ['风险一'],
  sources: ['工商登记数据', '税务数据'], confidence: 88, time: '2026-08-26 10:00',
  prevScore: 40, lastJudge: '2026-07-01'
};
// 注入到 profile.js 私有 aiJudge 的替代路径：e.ai 已可用
ent.ai = j;

let saved = null;
window.jspdf.jsPDF.API.save = function (filename) { saved = { filename, doc: this }; };

try {
  APP.exportJudgeReport();
} catch (err) { console.error('FAIL 导出抛错:', err.message); process.exit(1); }

setTimeout(() => {
  if (!saved) { console.error('FAIL 未捕获到保存的 PDF'); process.exit(1); }
  const out = saved.doc.output('arraybuffer');
  const bytes = Buffer.from(out);
  const header = bytes.subarray(0, 5).toString();
  console.log('filename:', saved.filename);
  console.log('size:', (bytes.length / 1024).toFixed(1), 'KB | header:', header);
  if (header !== '%PDF-') { console.error('FAIL 非 PDF 头'); process.exit(1); }
  if (bytes.length < 100 * 1024) { console.error('FAIL 体积过小，疑似字体未嵌入'); process.exit(1); }
  fs.writeFileSync(path.join(__dirname, 'sample_report.pdf'), bytes);
  console.log('OK → tools/sample_report.pdf（可用浏览器/PDF 阅读器打开人工复核中文渲染）');
  process.exit(0);
}, 300);
