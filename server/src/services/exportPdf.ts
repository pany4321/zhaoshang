/**
 * AI 回答 → 格式化 PDF（服务端渲染）
 *
 * 为什么放服务端：字体子集化只有在服务端才划算。前端 jsPDF 会把整个 TTF 塞进每份
 * PDF（3.4MB 字体 = 3.4MB 文件）；pdfmake/pdfkit 只嵌入实际用到的字形，实测同一份
 * 两页中文报告 49.8KB、生成 388ms。
 *
 * 字体：server/assets/fonts/NotoSansSC-SC.ttf（由 tools/make_server_font.py 生成，
 * 覆盖 GB2312 全集 + 项目语料字符）。同目录 .ranges.json 记录覆盖码位，用于缺字兜底。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { parseMd, type MdBlock, type MdRun } from './mdBlocks.js';

const require_ = createRequire(import.meta.url);
// pdfmake 0.2.x 是 CJS，且没有随包类型定义 —— 走 createRequire，避免 TS 报错
const PdfPrinter = require_('pdfmake');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FONT_FILE = 'NotoSansSC-SC.ttf';
const FONT_FILE_BOLD = 'NotoSansSC-SC-Bold.ttf';
const RANGES_FILE = 'NotoSansSC-SC.ranges.json';

/** 字体路径：环境变量 → 运行时 cwd（server/ 或仓库根）→ 编译产物相对路径 */
function resolveFontDir(): string | null {
  const cands: string[] = [];
  if (process.env.PDF_FONT_DIR) cands.push(process.env.PDF_FONT_DIR);
  cands.push(
    path.resolve(process.cwd(), 'assets/fonts'),
    path.resolve(process.cwd(), 'server/assets/fonts'),
    path.resolve(HERE, '../../assets/fonts'),      // dist/src/services → dist/assets（不存在时跳过）
    path.resolve(HERE, '../../../server/assets/fonts'),
    path.resolve(HERE, '../../../assets/fonts'),
  );
  for (const d of cands) {
    try {
      if (fs.existsSync(path.join(d, FONT_FILE))) return d;
    } catch { /* ignore */ }
  }
  return null;
}

let fontDir: string | null | undefined;
function getFontDir(): string | null {
  if (fontDir === undefined) fontDir = resolveFontDir();
  return fontDir;
}

export function pdfFontAvailable(): boolean {
  return !!getFontDir();
}

/* ---------------- 字符覆盖 & 净化 ---------------- */

let rangeCache: [number, number][] | null = null;
function loadRanges(): [number, number][] {
  if (rangeCache) return rangeCache;
  const dir = getFontDir();
  if (!dir) return (rangeCache = []);
  try {
    const j = JSON.parse(fs.readFileSync(path.join(dir, RANGES_FILE), 'utf8'));
    rangeCache = (j.ranges || []) as [number, number][];
  } catch {
    rangeCache = [];
  }
  return rangeCache;
}

function covered(cp: number): boolean {
  const rs = loadRanges();
  if (!rs.length) return true;          // 拿不到覆盖表就不做剔除，宁可多显示
  let lo = 0, hi = rs.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const [a, b] = rs[mid];
    if (cp < a) hi = mid - 1;
    else if (cp > b) lo = mid + 1;
    else return true;
  }
  return false;
}

/** emoji → 可用符号。模型爱在标题前加 📊💰⚠️，字体里没有这些字形，不处理就是空白方框 */
const EMOJI_MAP: Record<string, string> = {
  '🔴': '●', '🟠': '○', '🟡': '○', '🔵': '●', '🔹': '·', '▪': '·',
  '⚠️': '注意：', '⚠': '注意：', '✅': '√', '✓': '√', '✕': '×', '✗': '×',
  '✦': '◆', '⬇️': '↓', '⬇': '↓', '➡️': '→', '➡': '→', '⬆': '↑',
  '⏳': '', '⚖': '', '⚙': '', '⚡': '', '✎': '', '⟳': '', '▢': '',
  '﹝': '（', '﹞': '）',
};

let warnedMissing = false;

/** 把模型文本净化成「字体一定能画出来」的文本 */
export function sanitizeForPdf(input: string): string {
  let s = String(input == null ? '' : input);
  s = s.replace(/[\uFE0F\u200D\u20E3]/g, '');
  let out = '';
  for (const ch of s) {
    if (EMOJI_MAP[ch] !== undefined) { out += EMOJI_MAP[ch]; continue; }
    const cp = ch.codePointAt(0) || 0;
    if (cp >= 0x1F000 && cp <= 0x1FAFF) continue;        // emoji 区整体剔除
    if (cp > 0x2000 && !covered(cp)) {
      if (cp >= 0x3400 && cp <= 0x9FFF) out += '□';      // 汉字缺字：显式方框，不静默吞掉
      if (cp >= 0x3400 && cp <= 0x9FFF && !warnedMissing) {
        warnedMissing = true;
        console.warn(`[pdf] 字体缺少汉字 U+${cp.toString(16).toUpperCase()}（${ch}），已用 □ 代替；如需支持请扩充 tools/make_server_font.py 字符集`);
      }
      continue;
    }
    out += ch;
  }
  return out;
}

/* ---------------- 排版 ---------------- */

const C = {
  ink: '#0f172a',
  body: '#1f2937',
  muted: '#64748b',
  accent: '#2563eb',
  line: '#cbd5e1',
  headBg: '#eff6ff',
  headInk: '#1e3a8a',
  quoteBg: '#f8fafc',
};

function runsToText(runs: MdRun[]) {
  // pdfmake 的富文本：数组里每项是 {text, bold}。斜体/等宽在单字体下退化为普通文本
  return sanitizeForPdf(runs.map((r) => r.text).join('')).trim();
}

function runsToRich(runs: MdRun[], base: any = {}) {
  const arr = runs
    .map((r) => {
      const t = sanitizeForPdf(r.text);
      if (!t) return null;
      return { text: t, bold: !!r.bold, italics: !!r.italic, ...base };
    })
    .filter(Boolean);
  return arr.length ? arr : [{ text: '', ...base }];
}

function linesToRich(lines: MdRun[][], base: any = {}) {
  const out: any[] = [];
  lines.forEach((ln, i) => {
    if (i > 0) out.push({ text: '\n', ...base });
    out.push(...runsToRich(ln, base));
  });
  return out;
}

function blocksToContent(blocks: MdBlock[]): any[] {
  const out: any[] = [];

  for (const b of blocks) {
    if (b.type === 'heading') {
      const text = sanitizeForPdf(b.runs.map((r) => r.text).join(''));
      if (!text.trim()) continue;
      if (b.level <= 2) {
        out.push({
          columns: [
            { width: 3, canvas: [{ type: 'rect', x: 0, y: 1.5, w: 3, h: 12, color: C.accent }] },
            { width: '*', text, fontSize: 12.5, bold: true, color: C.ink, margin: [7, 0, 0, 0] },
          ],
          columnGap: 0,
          margin: [0, 12, 0, 5],
        });
      } else if (b.level === 3) {
        out.push({ text, fontSize: 11.3, bold: true, color: C.ink, margin: [0, 9, 0, 4] });
      } else {
        out.push({ text, fontSize: 10.8, bold: true, color: C.ink, margin: [0, 7, 0, 3] });
      }
      continue;
    }

    if (b.type === 'para') {
      const rich = linesToRich(b.lines, { fontSize: 10.4, color: C.body, lineHeight: 1.55 });
      out.push({ text: rich, alignment: 'justify', margin: [0, 0, 0, 6] });
      continue;
    }

    if (b.type === 'list') {
      // 不用 pdfmake 内建的 ol/ul：它把编号与正文的间距压得太窄，且悬挂缩进靠估算。
      // 改用两列表格（标记列固定宽度 + 内容列），中文条目换行后正文能严格对齐。
      const markerW = b.ordered ? 16 : 12;
      const body = b.items.map((it, i) => [
        {
          text: b.ordered ? `${i + 1}.` : '•',
          fontSize: 10.4,
          color: C.accent,
          width: markerW,
          margin: [0, i === 0 ? 0 : 3.5, 0, 0],
        },
        {
          text: linesToRich(it, { fontSize: 10.4, color: C.body, lineHeight: 1.5 }),
          margin: [0, i === 0 ? 0 : 3.5, 0, 0],
        },
      ]);
      out.push({
        table: { widths: [markerW, '*'], body },
        layout: 'noBorders',
        margin: [2, 0, 0, 7],
      });
      continue;
    }

    if (b.type === 'table') {
      const head = b.head.map((h) => ({
        text: sanitizeForPdf(h),
        bold: true,
        fontSize: 9.2,
        color: C.headInk,
        fillColor: C.headBg,
        alignment: 'center',
        margin: [3, 2, 3, 2],
      }));
      const body = b.rows.map((r) =>
        b.head.map((_, ci) => ({
          text: sanitizeForPdf(r[ci] || ''),
          fontSize: 9.2,
          color: C.body,
          margin: [3, 2, 3, 2],
        })),
      );
      if (head.length) {
        out.push({
          table: { headerRows: 1, widths: new Array(head.length).fill('*'), body: [head, ...body] },
          layout: {
            hLineWidth: () => 0.5,
            vLineWidth: () => 0.5,
            hLineColor: () => '#CBD5E1',
            vLineColor: () => '#CBD5E1',
            paddingLeft: () => 4,
            paddingRight: () => 4,
            paddingTop: () => 3,
            paddingBottom: () => 3,
            fillColor: (rowIdx: number) => (rowIdx === 0 ? C.headBg : null),
          },
          margin: [0, 2, 0, 9],
        });
      }
      continue;
    }

    if (b.type === 'quote') {
      out.push({
        table: {
          widths: [3, '*'],
          body: [[
            { text: '', fillColor: C.line },
            {
              text: linesToRich(b.lines, { fontSize: 9.6, color: C.muted, lineHeight: 1.45 }),
              fillColor: C.quoteBg,
              margin: [8, 5, 8, 5],
            },
          ]],
        },
        layout: 'noBorders',
        margin: [0, 2, 0, 8],
      });
      continue;
    }

    if (b.type === 'hr') {
      out.push({
        canvas: [{ type: 'line', x1: 0, y1: 0, x2: 500, y2: 0, lineWidth: 0.7, lineColor: C.line }],
        margin: [0, 6, 0, 10],
      });
    }
  }
  return out;
}

export type PdfExportOptions = {
  title: string;
  subtitle?: string;
  markdown: string;
  meta?: string[];
};

let printer: any = null;
function getPrinter() {
  if (printer) return printer;
  const dir = getFontDir();
  if (!dir) throw new Error('PDF 字体未安装（server/assets/fonts 缺失），请运行 python tools/make_server_font.py');
  const f = path.join(dir, FONT_FILE);
  // 粗体是同一字符集的独立子集（tools/make_server_font.py 一并生成）：
  // 字符集刻意与常规一致，避免生僻字加粗时缺字形直接消失。缺粗体文件时退回常规。
  const fb = fs.existsSync(path.join(dir, FONT_FILE_BOLD)) ? path.join(dir, FONT_FILE_BOLD) : f;
  printer = new PdfPrinter({
    Zh: { normal: f, bold: fb, italics: f, bolditalics: fb },
  });
  return printer;
}

export async function buildPdfBuffer(opts: PdfExportOptions): Promise<Buffer> {
  const blocks = parseMd(opts.markdown || '');
  const metaLine = (opts.meta || []).filter(Boolean).join('　　');
  const title = sanitizeForPdf(opts.title || 'AI 分析报告');
  const subtitle = sanitizeForPdf(opts.subtitle || '');

  const content: any[] = [
    { text: title, fontSize: 19, bold: true, color: C.ink, alignment: 'center', margin: [0, 2, 0, 3] },
  ];
  if (subtitle) {
    content.push({ text: subtitle, fontSize: 11, color: '#475569', alignment: 'center', margin: [0, 0, 0, 4] });
  }
  if (metaLine) {
    content.push({ text: metaLine, fontSize: 8.6, color: C.muted, alignment: 'center', margin: [0, 0, 0, 6] });
  }
  content.push({
    canvas: [{ type: 'line', x1: 0, y1: 0, x2: 500, y2: 0, lineWidth: 1.6, lineColor: C.accent }],
    margin: [0, 0, 0, 12],
  });
  content.push(...blocksToContent(blocks));

  const docDef: any = {
    pageSize: 'A4',
    pageMargins: [46, 56, 46, 58],
    defaultStyle: { font: 'Zh', fontSize: 10.4, color: C.body, lineHeight: 1.5 },
    info: {
      title,
      subject: subtitle || title,
      creator: '招商企业服务与智慧监管平台',
      producer: '招商企业服务与智慧监管平台',
    },
    footer: (cur: number, total: number) => ({
      margin: [46, 8, 46, 0],
      columns: [
        { text: '招商企业服务与智慧监管平台 · AI 分析导出', fontSize: 8, color: '#94a3b8' },
        { text: `${cur} / ${total}`, fontSize: 8, color: '#94a3b8', alignment: 'right' },
      ],
    }),
    header: (cur: number) =>
      cur === 1
        ? undefined
        : {
            margin: [46, 22, 46, 0],
            columns: [
              { text: title, fontSize: 8.4, color: '#94a3b8' },
              { text: subtitle, fontSize: 8.4, color: '#cbd5e1', alignment: 'right' },
            ],
          },
    content,
  };

  const doc = getPrinter().createPdfKitDocument(docDef);
  return await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}
