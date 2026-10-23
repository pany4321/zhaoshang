#!/usr/bin/env node
/**
 * 生成 demo 静态页真实数据集：demo/assets/data/real-data.js
 *
 * 数据源与全栈版（web + server）完全同源：
 *   server/prisma/real-fixtures.json  →  web/src/engine/adapter.ts (mapBootstrap)  →  MOCK_ENGINE.rebuild
 *
 * 做法：在 Node 里模拟浏览器环境（window.MOCK 由 demo mock.js 提供），
 * 用 esbuild 现编 adapter.ts，跑与线上完全相同的映射函数，输出 window.MOCK_REAL。
 * 这样 demo 静态页与分层部署版用的是同一份数据、同一套映射、同一套派生算法。
 */
import { build } from '../web/node_modules/esbuild/lib/main.js'
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import vm from 'node:vm'

const ROOT = path.resolve(import.meta.dirname, '..')
const FIXTURES = path.join(ROOT, 'server/prisma/real-fixtures.json')
const MOCK_JS = path.join(ROOT, 'demo/assets/data/mock.js')
const OUT = path.join(ROOT, 'demo/assets/data/real-data.js')

// —— 1. 浏览器环境替身：mock.js 是 IIFE(window)，挂 window.MOCK ——
const sandbox = { console, Date, Math, JSON, parseInt, parseFloat, isNaN, Array, Object, String, Number }
sandbox.window = sandbox
sandbox.global = sandbox
vm.createContext(sandbox)
// adapter.ts 里直接读全局 window.MOCK，需要挂到 Node 全局
globalThis.window = sandbox
vm.runInContext(readFileSync(MOCK_JS, 'utf-8'), sandbox, { filename: 'mock.js' })
if (!sandbox.MOCK || !sandbox.MOCK_ENGINE) throw new Error('mock.js 未导出 MOCK / MOCK_ENGINE')

// —— 2. 现编 adapter.ts（与线上同一份源码）——
const tmp = mkdtempSync(path.join(tmpdir(), 'zs-adapter-'))
const outfile = path.join(tmp, 'adapter.cjs')
await build({
  entryPoints: [path.join(ROOT, 'web/src/engine/adapter.ts')],
  bundle: true, platform: 'node', format: 'cjs', outfile, logLevel: 'error',
})
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const adapter = require(outfile)

// —— 3. 映射 + 统计 ——
const fixtures = JSON.parse(readFileSync(FIXTURES, 'utf-8'))
// —— 3. 关联回填（等价于 Prisma 的 include），必须在 mapBootstrap 之前 ——
// fixtures 是扁平表结构：企业只有 industryId / districtId，没有嵌套关联对象。
// 线上 /api/bootstrap 走 Prisma 查询，industry / district 是 include 出来的，
// adapter.mapEnterprise 靠 e.industry?.name 取中文名。若直接喂 fixtures：
//   industryName → 退化成英文 key（chemical / software）
//   districtName → 退化成英文 id（xf / qc）
//   address      → 全部变成「省外线索 · 待落地核实」
// 这次就是漏了这一步，导致产业分布图、区县列、企业地址全部走样。
const idx = (arr) => Object.fromEntries((arr || []).map((x) => [x.id, x]))
const DIX = idx(fixtures.districts)
const IIX = idx(fixtures.industries)
const EIX = idx(fixtures.enterprises)
const PIX = idx(fixtures.projects)
for (const e of fixtures.enterprises) {
  e.district = e.districtId ? DIX[e.districtId] || null : null
  e.industry = e.industryId ? IIX[e.industryId] || null : null
}
for (const ev of fixtures.riskEvents || []) ev.enterprise = EIX[ev.enterpriseId] || null
for (const p of fixtures.projects || []) {
  p.enterprise = EIX[p.enterpriseId] || null
  p.district = p.districtId ? DIX[p.districtId] || null : null
  p.industry = p.industryId ? IIX[p.industryId] || null : null
}
for (const t of fixtures.tasks || []) {
  t.enterprise = t.enterpriseId ? EIX[t.enterpriseId] || null : null
  t.project = t.projectId ? PIX[t.projectId] || null : null
}
for (const pc of fixtures.policies || []) {
  pc.industry = pc.industryId ? IIX[pc.industryId] || null : null
}

const raw = adapter.mapBootstrap(fixtures)

// —— 3.5 演示日期滚动标记（与 server/prisma/seed-data.ts 的 "TODAY:" 机制等价）——
// real-fixtures 里的日期是固定字面量（任务截止日集中在 11 月），demo 静态页没有 seed 层，
// 直接装载会导致「今日待办」「本周新增」永远为空。这里只打标记、不改数值：
// 装载时由 real-data.js 尾部按**本地时区**把截止/创建日期滚动到当天。
// 选取规则固定（按 id 排序取前 N 条），保证每次生成结果完全一致。
const entOf = t => t.enterprise || t.enterpriseName || ''
const pending = raw.TASKS.filter(t => t.status === '待处理').slice().sort((a, b) => String(a.id).localeCompare(String(b.id)))
const TODAY_TASKS = pending.filter((t, i, arr) => arr.findIndex(x => entOf(x) === entOf(t)) === i).slice(0, 2)
const recentPool = raw.TASKS.filter(t => !TODAY_TASKS.includes(t) && t.assignee)
const RECENT_TASKS = recentPool.slice(0, 3)
TODAY_TASKS.forEach(t => { t.__TODAY__ = true })
RECENT_TASKS.forEach((t, i) => { t.__RECENT_DAYS__ = i })

const payload = {
  _source: 'server/prisma/real-fixtures.json → adapter.mapBootstrap（与全栈版同源）',
  _fixturesGeneratedAt: fixtures.generatedAt,
  _builtAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
  ...raw,
}

const js = `/* ============================================================
 * 招商企业服务与智慧监管平台 —— DEMO 静态版真实数据集（自动生成，勿手改）
 * 生成脚本：tools/gen_demo_real_data.mjs
 * 来源：${payload._source}
 * 说明：真实工商/财务数据来自数据仓库；派生结构（风险分、项目节点、任务等）
 *      由 MOCK_ENGINE.rebuild 以固定种子重算，每次打开/登录结果完全一致。
 * 打开 demo 时由 real-data.js 末尾调用 MOCK_ENGINE.rebuild(window.MOCK_REAL) 装载。
 * 移除本文件的 <script> 引用即回落到内置 120 家模拟数据。
 * ============================================================ */
window.MOCK_REAL = ${JSON.stringify(payload)};

(function (global) {
  var raw = global.MOCK_REAL;
  if (!raw || !global.MOCK_ENGINE) return;

  // —— 演示日期滚动（等价于 server/prisma/seed-data.ts 的 "TODAY:" 机制）——
  // real-fixtures 的日期是固定字面量，任务截止日集中在 11 月；不滚动的话
  // 工作台「今日待办」「本周新增」永远为空。只滚动被标记的少量任务，
  // 其余日期保持固定，保证数据可对账、每次打开结果一致（同一天内）。
  // 必须用本地时区拼接，不能用 toISOString（东八区凌晨会退到前一天）。
  function ymd(d) {
    var p = function (n) { return n < 10 ? '0' + n : '' + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  var now = new Date();
  (raw.TASKS || []).forEach(function (t) {
    if (t.__TODAY__) {
      t.due = ymd(now);
      t.createTime = ymd(now);
    } else if (typeof t.__RECENT_DAYS__ === 'number') {
      var d = new Date(now.getTime() - t.__RECENT_DAYS__ * 86400000);
      t.createTime = ymd(d);
    }
    delete t.__TODAY__;
    delete t.__RECENT_DAYS__;
  });

  try {
    global.MOCK_ENGINE.rebuild(raw);
    global.MOCK.__REAL_DATA__ = true;
  } catch (e) {
    global.MOCK.__REAL_DATA__ = false;
    if (global.console && global.console.warn) {
      global.console.warn('[demo] 真实数据集装载失败，已回落内置模拟数据：', e && e.message);
    }
  }
})(typeof window !== 'undefined' ? window : this);
`

writeFileSync(OUT, js, 'utf-8')
rmSync(tmp, { recursive: true, force: true })

// —— 4. 自检：端到端在沙箱里加载 real-data.js，断言装载结果 ——
vm.runInContext(readFileSync(OUT, 'utf-8'), sandbox, { filename: 'real-data.js' })
const M = sandbox.MOCK
const sum = (arr, f) => arr.reduce((s, x) => s + (Number(f(x)) || 0), 0)
const today = new Date()
const pad = n => (n < 10 ? '0' + n : '' + n)
const todayStr = today.getFullYear() + '-' + pad(today.getMonth() + 1) + '-' + pad(today.getDate())
const weekAgo = today.getTime() - 7 * 86400000
const todayCnt = M.TASKS.filter(t => t.due === todayStr && t.status !== '已完成').length
const weekCnt = M.TASKS.filter(t => {
  if (!t.createTime) return false
  const d = new Date(String(t.createTime).replace(/-/g, '/'))
  return !isNaN(d.getTime()) && d.getTime() >= weekAgo
}).length

console.log('写入:', path.relative(ROOT, OUT), (Buffer.byteLength(js) / 1024).toFixed(0) + 'KB')
console.log('真实数据装载:', M.__REAL_DATA__ === true ? '✓' : '✗ 失败')
console.log('企业:', M.ENTERPRISES.length, '| 风险事件:', M.RISK_EVENTS.length,
  '| 项目:', M.PROJECTS.length, '| 任务:', M.TASKS.length, '| 政策:', M.POLICY_LIB.length)
console.log('营收合计(万元):', sum(M.ENTERPRISES, e => e.overview && e.overview.revenueWan).toFixed(1))
console.log('风险分布:', JSON.stringify(M.ENTERPRISES.reduce((a, e) => (a[e.riskLevel] = (a[e.riskLevel] || 0) + 1, a), {})))
console.log('有真实年报财务(finYear):', M.ENTERPRISES.filter(e => e.finYear).length,
  '| 股东条数:', sum(M.ENTERPRISES, e => (e.shareholders || []).length),
  '| 司法案件:', sum(M.ENTERPRISES, e => (e.judicialCases || []).length))
console.log('今日待办(今日到期未完成):', todayCnt, '| 本周新增(近7天创建):', weekCnt)
if (M.__REAL_DATA__ !== true) process.exit(1)
