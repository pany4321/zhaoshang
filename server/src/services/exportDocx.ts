/**
 * AI 回答 → Word (.docx)
 *
 * 与 exportPdf 共用 mdBlocks 的 AST 与 emoji 净化逻辑，保证 PDF / Word / 页面
 * 三处看到的是同一套结构。字体交给 Word 本机（微软雅黑），不需要内嵌字体文件。
 */
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType,
  AlignmentType, BorderStyle, Footer, PageNumber, ShadingType, VerticalAlign,
} from 'docx';
import { parseMd, type MdBlock, type MdRun } from './mdBlocks.js';
import { sanitizeForPdf } from './exportPdf.js';

const FONT = { ascii: 'Microsoft YaHei', eastAsia: '微软雅黑', hAnsi: 'Microsoft YaHei' };
const INK = '0F172A';
const BODY = '1F2937';
const MUTED = '64748B';

type Size = 'body' | 'h1' | 'h2' | 'h3';
const SIZE: Record<Size, number> = { h1: 34, h2: 26, h3: 22, body: 21 }; // 半磅

function richRuns(runs: MdRun[], size: Size = 'body', color = BODY): TextRun[] {
  const out: TextRun[] = [];
  for (const r of runs) {
    const t = sanitizeForPdf(r.text);
    if (!t) continue;
    out.push(new TextRun({ text: t, bold: !!r.bold, italics: !!r.italic, size: SIZE[size], color, font: FONT }));
  }
  return out.length ? out : [new TextRun({ text: '', size: SIZE[size], font: FONT })];
}

function richWithBreaks(lines: MdRun[][], size: Size = 'body', color = BODY): TextRun[] {
  const out: TextRun[] = [];
  lines.forEach((ln, i) => {
    if (i > 0) out.push(new TextRun({ text: '', break: 1, size: SIZE[size], font: FONT }));
    out.push(...richRuns(ln, size, color));
  });
  return out;
}

function cellParagraph(text: string, opts: { bold?: boolean; align?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {}) {
  return new Paragraph({
    alignment: opts.align || AlignmentType.LEFT,
    spacing: { before: 40, after: 40 },
    children: [new TextRun({
      text: sanitizeForPdf(text),
      size: 18,
      bold: !!opts.bold,
      color: opts.bold ? '1E3A8A' : BODY,
      font: FONT,
    })],
  });
}

const THIN_BORDER = {
  top: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
  left: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
  right: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
};

function blocksToDoc(blocks: MdBlock[]): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];

  for (const b of blocks) {
    if (b.type === 'heading') {
      const text = sanitizeForPdf(b.runs.map((r) => r.text).join(''));
      if (!text.trim()) continue;
      const size: Size = b.level <= 2 ? 'h2' : 'h3';
      out.push(new Paragraph({
        spacing: { before: b.level <= 2 ? 260 : 180, after: 90 },
        children: richRuns(b.runs, size, INK),
        border: b.level <= 2
          ? { left: { style: BorderStyle.SINGLE, size: 12, color: '2563EB', space: 8 } }
          : undefined,
      }));
      continue;
    }

    if (b.type === 'para') {
      out.push(new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        spacing: { after: 110, line: 320 },
        children: richWithBreaks(b.lines),
      }));
      continue;
    }

    if (b.type === 'list') {
      b.items.forEach((it, i) => {
        out.push(new Paragraph({
          spacing: { after: 70, line: 300 },
          indent: { left: 340, hanging: b.ordered ? 220 : 0 },
          bullet: b.ordered ? undefined : { level: 0 },
          children: b.ordered
            ? [new TextRun({ text: `${i + 1}. `, size: SIZE.body, color: '2563EB', font: FONT }), ...richWithBreaks(it)]
            : richWithBreaks(it),
        }));
      });
      continue;
    }

    if (b.type === 'table' && b.head.length) {
      const rows: TableRow[] = [];
      rows.push(new TableRow({
        tableHeader: true,
        children: b.head.map((h) => new TableCell({
          shading: { type: ShadingType.CLEAR, fill: 'EFF6FF' },
          borders: THIN_BORDER,
          verticalAlign: VerticalAlign.CENTER,
          margins: { top: 60, bottom: 60, left: 90, right: 90 },
          children: [cellParagraph(h, { bold: true, align: AlignmentType.CENTER })],
        })),
      }));
      for (const r of b.rows) {
        rows.push(new TableRow({
          children: b.head.map((_, ci) => new TableCell({
            borders: THIN_BORDER,
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 50, bottom: 50, left: 90, right: 90 },
            children: [cellParagraph(r[ci] || '')],
          })),
        }));
      }
      out.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows,
      }));
      out.push(new Paragraph({ spacing: { after: 120 }, children: [] }));
      continue;
    }

    if (b.type === 'quote') {
      out.push(new Paragraph({
        spacing: { before: 80, after: 140, line: 280 },
        indent: { left: 240 },
        border: { left: { style: BorderStyle.SINGLE, size: 12, color: 'CBD5E1', space: 10 } },
        children: richWithBreaks(b.lines, 'body', MUTED),
      }));
      continue;
    }

    if (b.type === 'hr') {
      out.push(new Paragraph({
        spacing: { before: 120, after: 160 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'CBD5E1', space: 1 } },
        children: [],
      }));
    }
  }
  return out;
}

export type DocxExportOptions = {
  title: string;
  subtitle?: string;
  markdown: string;
  meta?: string[];
};

export async function buildDocxBuffer(opts: DocxExportOptions): Promise<Buffer> {
  const blocks = parseMd(opts.markdown || '');
  const title = sanitizeForPdf(opts.title || 'AI 分析报告');
  const subtitle = sanitizeForPdf(opts.subtitle || '');
  const meta = (opts.meta || []).filter(Boolean).join('　　');

  const head: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
      children: [new TextRun({ text: title, bold: true, size: SIZE.h1, color: INK, font: FONT })],
    }),
  ];
  if (subtitle) {
    head.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [new TextRun({ text: subtitle, size: 22, color: '475569', font: FONT })],
    }));
  }
  if (meta) {
    head.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: '2563EB', space: 8 } },
      children: [new TextRun({ text: meta, size: 16, color: MUTED, font: FONT })],
    }));
  }

  const doc = new Document({
    creator: '招商企业服务与智慧监管平台',
    title,
    description: subtitle || title,
    styles: {
      default: {
        document: { run: { font: FONT, size: SIZE.body, color: BODY } },
      },
    },
    sections: [{
      properties: {
        page: { margin: { top: 1100, bottom: 1000, left: 1000, right: 1000 } },
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: '招商企业服务与智慧监管平台 · AI 分析导出　　第 ', size: 15, color: MUTED, font: FONT }),
              new TextRun({ children: [PageNumber.CURRENT], size: 15, color: MUTED, font: FONT }),
              new TextRun({ text: ' 页', size: 15, color: MUTED, font: FONT }),
            ],
          })],
        }),
      },
      children: [...head, ...blocksToDoc(blocks)],
    }],
  });

  return await Packer.toBuffer(doc) as Buffer;
}
