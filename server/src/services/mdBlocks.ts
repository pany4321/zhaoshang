/**
 * Markdown 子集 → 块级 AST
 *
 * 与前端 `demo/assets/js/common/utils.js` 的 U.md() 同源同逻辑（同样的判定顺序、
 * 同样的「缩进续行归并」），区别只在于输出 AST 而不是 HTML —— PDF / DOCX 导出
 * 需要结构化数据，不能塞 DOM 字符串（pdfmake 会把标签原样打出来）。
 *
 * 覆盖：ATX 标题 / 整行加粗中文序号小标题 / 中文序号短行 / 有序列表 / 无序列表 /
 *       表格 / 引用 / 分隔线 / 空行分段 / 缩进续行 / 行内粗体·斜体·代码·链接。
 * 不做：代码块高亮、公式、脚注、任务列表、嵌套超过两级（模型在政务问答里不用）。
 */

export type MdRun = { text: string; bold?: boolean; italic?: boolean; mono?: boolean };

export type MdBlock =
  | { type: 'heading'; level: number; runs: MdRun[] }
  | { type: 'para'; lines: MdRun[][] }          // 每个元素是一行（原 Markdown 硬换行）
  | { type: 'list'; ordered: boolean; items: MdRun[][][] }   // items[i] = 该项的多行
  | { type: 'table'; head: string[]; rows: string[][] }
  | { type: 'quote'; lines: MdRun[][] }
  | { type: 'hr' };

const MD_LINK = /\[([^\]\n]+)\]\(([^)\s]+)\)/g;
const MD_CN_NUM = /^[（(]?[一二三四五六七八九十百]+[)）]?[、.．]/;
const MD_PROTO_BAD = /^\s*(javascript|data|vbscript):/i;

/** 行内标记 → runs。链接只保留文字（PDF/DOCX 里不做可点击跳转，避免危险协议残留） */
export function inlineRuns(src: string): MdRun[] {
  let s = String(src == null ? '' : src);
  s = s.replace(MD_LINK, (_m, text: string, url: string) => (MD_PROTO_BAD.test(url) ? text : `${text} (${url})`));

  const runs: MdRun[] = [];
  // 先切出粗体与代码，其余按普通文本分段
  const re = /(\*\*[^*\n]+\*\*|__[^_\n]+__|`[^`\n]+`|\*[^*\n]+\*(?![*\w]))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    if (m.index > last) runs.push({ text: s.slice(last, m.index) });
    const tok = m[0];
    if (tok.startsWith('**') || tok.startsWith('__')) runs.push({ text: tok.slice(2, -2), bold: true });
    else if (tok.startsWith('`')) runs.push({ text: tok.slice(1, -1), mono: true });
    else runs.push({ text: tok.slice(1, -1), italic: true });
    last = m.index + tok.length;
  }
  if (last < s.length) runs.push({ text: s.slice(last) });

  // 残留未闭合标记（流式/模型笔误）直接抹掉，不要落到 PDF 里
  return runs
    .map((r) => ({ ...r, text: r.text.replace(/\*\*/g, '').replace(/__/g, '').replace(/~~/g, '') }))
    .filter((r) => r.text.length > 0);
}

function splitRow(line: string): string[] {
  return line.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
}

export function parseMd(raw: string): MdBlock[] {
  const text = String(raw == null ? '' : raw).replace(/\r\n?/g, '\n');
  const L = text.split('\n');
  const out: MdBlock[] = [];
  let para: MdRun[][] = [];
  let list: { ordered: boolean; items: MdRun[][][] } | null = null;
  let quote: MdRun[][] = [];

  const flushPara = () => {
    if (!para.length) return;
    out.push({ type: 'para', lines: para });
    para = [];
  };
  const flushList = () => {
    if (!list) return;
    out.push({ type: 'list', ordered: list.ordered, items: list.items });
    list = null;
  };
  const flushQuote = () => {
    if (!quote.length) return;
    out.push({ type: 'quote', lines: quote });
    quote = [];
  };
  const flushAll = () => { flushPara(); flushList(); flushQuote(); };

  for (let i = 0; i < L.length; i++) {
    const rawLine = L[i];
    const noTail = rawLine.replace(/[ \t]+$/, '');
    const t = noTail.trim();
    const indent = noTail.length - noTail.replace(/^[ \t]+/, '').length;

    if (!t) { flushAll(); continue; }
    if (quote.length && !t.startsWith('>')) flushQuote();

    // 引用
    if (t.startsWith('>')) {
      flushPara(); flushList();
      quote.push(inlineRuns(t.replace(/^>\s?/, '')));
      continue;
    }

    // 缩进续行 → 并入上方列表项 / 段落 / 引用（模型写条目正文的常规手法）
    if (indent >= 2) {
      if (list && list.items.length) { list.items[list.items.length - 1].push(inlineRuns(t)); continue; }
      if (para.length) { para.push(inlineRuns(t)); continue; }
      if (quote.length) { quote.push(inlineRuns(t)); continue; }
    }

    // 表格
    if (/^\|.*\|$/.test(t)) {
      const nx = (L[i + 1] || '').trim();
      if (/^\|[\s:|-]*$/.test(nx) && nx.indexOf('-') > -1) {
        flushPara(); flushList();
        const head = splitRow(t);
        i += 2;
        const rows: string[][] = [];
        while (i < L.length && /^\|.*\|$/.test(L[i].trim())) { rows.push(splitRow(L[i].trim())); i++; }
        i--;
        out.push({ type: 'table', head, rows });
        continue;
      }
    }

    // ATX 标题
    const hm = t.match(/^(#{1,6})\s+(.+)$/);
    if (hm) {
      flushPara(); flushList();
      out.push({ type: 'heading', level: hm[1].length, runs: inlineRuns(hm[2]) });
      continue;
    }

    // 分隔线
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) {
      flushPara(); flushList();
      out.push({ type: 'hr' });
      continue;
    }

    // 整行加粗且中文序号开头 → 小标题
    const bm = t.match(/^\*\*([^*\n]{1,40})\*\*[：:]?$/);
    if (bm && MD_CN_NUM.test(bm[1])) {
      flushPara(); flushList();
      out.push({ type: 'heading', level: 4, runs: inlineRuns(bm[1]) });
      continue;
    }

    const ulm = t.match(/^[-*+]\s+(.+)$/);
    const olm = t.match(/^\d{1,2}[.、)](?!\d)\s*(.+)$/) || t.match(/^[（(]\d{1,2}[)）]\s*(.+)$/);

    if (ulm) {
      flushPara();
      if (!list || list.ordered) { flushList(); list = { ordered: false, items: [] }; }
      list.items.push([inlineRuns(ulm[1])]);
      continue;
    }
    if (olm) {
      flushPara();
      if (!list || !list.ordered) { flushList(); list = { ordered: true, items: [] }; }
      list.items.push([inlineRuns(olm[1])]);
      continue;
    }

    // 中文序号短行 → 小标题
    if (MD_CN_NUM.test(t) && t.length <= 32) {
      flushPara(); flushList();
      out.push({ type: 'heading', level: 4, runs: inlineRuns(t.replace(/[：:]$/, '')) });
      continue;
    }

    // 纯标记行（模型输出了半个语法）
    if (/^#{1,6}$/.test(t) || /^\|[\s:|-]*$/.test(t) || /^[-*_]{1,2}$/.test(t)) continue;

    // 半截表格行 → 按段落渲染，竖线换成间隔符
    if (t.charAt(0) === '|') {
      flushList();
      para.push(inlineRuns(t.replace(/^\|/, '').replace(/\|$/, '').replace(/\s*\|\s*/g, ' · ')));
      continue;
    }

    flushList();
    para.push(inlineRuns(t));
  }
  flushAll();
  return out;
}
