/**
 * AI 回答导出：统一的「生成文件 → 登记下载令牌」层
 *
 * PDF / DOCX 两种格式共用这里，好处是：
 *   - 文件名、MIME、时间戳只有一份实现，前端不用猜
 *   - 附件不落盘：进程内存登记 + 10 分钟 TTL，重启即失效（演示场景够用，也不留垃圾文件）
 *   - 对话接口（chat）与显式导出接口（export）走同一条生成路径，行为一致
 */
import { randomBytes } from 'node:crypto';
import { buildPdfBuffer, pdfFontAvailable } from './exportPdf.js';
import { buildDocxBuffer } from './exportDocx.js';

export type ExportFormat = 'pdf' | 'docx';

type Stored = { name: string; mime: string; buf: Buffer; exp: number };

const store = new Map<string, Stored>();
const TTL_MS = 10 * 60 * 1000;

export function putExport(name: string, mime: string, buf: Buffer): string {
  const now = Date.now();
  for (const [k, v] of store) if (v.exp < now) store.delete(k);   // 顺手清理过期项
  const token = randomBytes(12).toString('hex');
  store.set(token, { name, mime, buf, exp: now + TTL_MS });
  return token;
}

export function getExport(token: string): Stored | null {
  const v = store.get(token);
  if (!v) return null;
  if (v.exp < Date.now()) { store.delete(token); return null; }
  return v;
}

export function safeFileBase(s: string): string {
  return String(s || 'AI分析报告')
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 58) || 'AI分析报告';
}

export function stamp(d = new Date()): string {
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

/**
 * 意图识别：只有「动作词 + 文件类型词」同时出现才生成附件，
 * 避免用户随口说「报告」就收到一个文件。
 */
export function detectExportIntent(message: string): ExportFormat | null {
  const m = String(message || '').toLowerCase();
  const action = /(导出|下载|生成|保存|打包|另存|给我一?[份个]|输出)/.test(m);
  const fileWord = /(word|docx|文档|pdf|文件|报告|附件)/.test(m);
  if (!action || !fileWord) return null;
  if (/(word|docx)/.test(m)) return 'docx';
  return 'pdf';
}

export type AnswerFileOpts = {
  format: ExportFormat;
  title: string;
  subtitle?: string;
  meta?: string[];
  markdown: string;
};

/** 生成文件并返回可下载的附件描述（url 由调用方拼前缀） */
export async function buildAnswerFile(opts: AnswerFileOpts): Promise<{ name: string; mime: string; size: number; token: string; buf: Buffer }> {
  const base = safeFileBase(opts.title || opts.subtitle || 'AI分析报告');
  if (opts.format === 'docx') {
    const buf = await buildDocxBuffer(opts);
    const name = `${base}-${stamp()}.docx`;
    const token = putExport(name, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buf);
    return { name, mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: buf.length, token, buf };
  }
  if (!pdfFontAvailable()) throw new Error('PDF 字体未安装，请在服务器执行 python tools/make_server_font.py');
  const buf = await buildPdfBuffer(opts);
  const name = `${base}-${stamp()}.pdf`;
  const token = putExport(name, 'application/pdf', buf);
  return { name, mime: 'application/pdf', size: buf.length, token, buf };
}

export function exportsReady(): boolean {
  return pdfFontAvailable();
}
