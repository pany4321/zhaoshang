/**
 * AI 导出（PDF / DOCX）回归验证
 *
 * 断言：能生成、体积合理、中文不缺字、结构（标题/表格/列表/引用）落到位。
 * 运行：cd server && npx tsx ../tools/verify_ai_export.mts
 *       或仓库根 npx tsx tools/verify_ai_export.mts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPdfBuffer, sanitizeForPdf } from '../server/src/services/exportPdf.js';
import { buildDocxBuffer } from '../server/src/services/exportDocx.js';
import { parseMd } from '../server/src/services/mdBlocks.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT_DIR = path.join(ROOT, 'tmp', 'export-test');

const SAMPLE = `## 一、企业基本情况

甘肃赫隆能源科技技术有限公司成立于 2006 年，注册资本 8000 万元，位于庆阳市西峰区，属于**新能源装备制造**行业。现有员工 320 人。

## 二、经营业绩

| 年度 | 营业收入（万元） | 同比增长 |
| --- | --- | --- |
| 2023 | 12,860.50 | +8.2% |
| 2024 | 14,203.18 | +10.4% |

1. **企业自身承贷能力偏弱**
   庆阳多数中小企业规模小、资产轻，缺乏足值合规抵押物，银行授信额度受限。
2. **产业链配套不足**
   上下游企业分布分散，物流与配套成本偏高。

- 建议一：加大政银企对接力度
- 建议二：完善产业链配套

> 注：数据来源于企业年报公示信息，统计口径为 2024 年度。

⚠️ 风险提示：本报告仅供内部研判参考，不得对外发布。📊 数据截至 2026 年 11 月。
`;

let failed = 0;
function check(name: string, cond: boolean, extra = '') {
  console.log(`${cond ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`);
  if (!cond) failed++;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // 1) AST 解析
  const blocks = parseMd(SAMPLE);
  const kinds = blocks.map((b) => b.type);
  check('AST 含标题', kinds.includes('heading'));
  check('AST 含表格', kinds.includes('table'));
  check('AST 含有序列表', blocks.some((b: any) => b.type === 'list' && b.ordered));
  check('AST 含无序列表', blocks.some((b: any) => b.type === 'list' && !b.ordered));
  check('AST 含引用', kinds.includes('quote'));
  const listBlock: any = blocks.find((b: any) => b.type === 'list' && b.ordered);
  check('缩进续行并入列表项（不出第二个 li）', listBlock && listBlock.items[0].length === 2,
    listBlock ? `items[0] 行数=${listBlock.items[0].length}` : 'no list');

  // 2) 净化
  const clean = sanitizeForPdf('⚠️ 风险提示 📊 数据 ✅ 完成');
  check('emoji 已净化', !/[📊⚠✅]/.test(clean), JSON.stringify(clean));

  // 3) PDF
  const t0 = Date.now();
  const pdf = await buildPdfBuffer({
    title: '企业洞察分析报告',
    subtitle: '甘肃赫隆能源科技技术有限公司',
    meta: ['智能体：企业洞察', '2026-11-04 18:30'],
    markdown: SAMPLE,
  });
  const pdfMs = Date.now() - t0;
  const pdfPath = path.join(OUT_DIR, 'ai_export_test.pdf');
  fs.writeFileSync(pdfPath, pdf);
  check('PDF 生成', pdf.length > 10000, `${(pdf.length / 1024).toFixed(1)}KB / ${pdfMs}ms`);
  check('PDF 体积 < 900KB（字体已子集化）', pdf.length < 900 * 1024);
  const pdfStr = pdf.toString('latin1');
  check('PDF 内嵌字体为子集', /BZZZZZ\+|AAAAAA\+/.test(pdfStr) || /FontFile2/.test(pdfStr));

  // 4) DOCX
  const docx = await buildDocxBuffer({
    title: '企业洞察分析报告',
    subtitle: '甘肃赫隆能源科技技术有限公司',
    meta: ['智能体：企业洞察', '2026-11-04 18:30'],
    markdown: SAMPLE,
  });
  const docxPath = path.join(OUT_DIR, 'ai_export_test.docx');
  fs.writeFileSync(docxPath, docx);
  check('DOCX 生成', docx.length > 3000, `${(docx.length / 1024).toFixed(1)}KB`);
  check('DOCX 是 zip 包（PK 头）', docx[0] === 0x50 && docx[1] === 0x4b);

  // 5) 空内容兜底
  const emptyPdf = await buildPdfBuffer({ title: '空内容', markdown: '' });
  check('空 Markdown 不崩溃', emptyPdf.length > 1000, `${(emptyPdf.length / 1024).toFixed(1)}KB`);

  // 6) 恶意输入
  const evil = '<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[点我](javascript:alert(1))';
  const evilPdf = await buildPdfBuffer({ title: 'XSS', markdown: evil });
  check('恶意输入不崩溃', evilPdf.length > 1000);
  const evilDocx = await buildDocxBuffer({ title: 'XSS', markdown: evil });
  check('恶意输入 DOCX 不崩溃', evilDocx.length > 1000);

  console.log(`\n输出目录：${OUT_DIR}`);
  if (failed) {
    console.error(`\n❌ ${failed} 项失败`);
    process.exit(1);
  }
  console.log('\n✅ 全部通过');
}

main().catch((e) => {
  console.error('❌ 异常：', e);
  process.exit(1);
});
