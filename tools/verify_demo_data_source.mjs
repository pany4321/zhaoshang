/**
 * demo 静态页数据源校验：真实数据装载 / 确定性 / 兜底回落 / 页面渲染
 *
 * 三条断言（任一失败即非零退出）：
 *  A. 装载：demo 载入 real-data.js 后 MOCK 为企业「真实工商数据」口径（与全栈版同源同数量）
 *  B. 确定性：连续两次从头装载，MOCK 的 JSON 完全一致（除时钟漂移的日界外）
 *  C. 兜底：real-data.js 缺失时回落到 mock.js 内置模拟数据，企业详情可查、页面不报错
 *
 * 用法：node tools/verify_demo_data_source.mjs
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { JSDOM } = require('jsdom')
const ROOT = path.resolve(import.meta.dirname, '..')
const DEMO = path.join(ROOT, 'demo')
const html = readFileSync(path.join(DEMO, 'index.html'), 'utf-8')

let fails = 0
const ok = (cond, msg, extra) => {
  if (cond) console.log('  ✓ ' + msg)
  else { fails++; console.log('  ✗ ' + msg + (extra ? ' — ' + extra : '')) }
}

const stubEcharts = {
  init: () => ({ setOption() {}, dispose() {}, resize() {}, on() {} }),
  registerMap() {},
  graphic: {
    LinearGradient: function () { return { addColorStop() {} } },
    RadialGradient: function () { return { addColorStop() {} } },
  },
}

const JS_ORDER = [
  'assets/data/mock.js',
  'assets/data/real-data.js',
  'assets/js/common/utils.js',
  'assets/js/common/state.js',
  'assets/js/common/components.js',
  ...readdirSync(path.join(DEMO, 'assets/js/pages')).filter(f => f.endsWith('.js')).map(f => 'assets/js/pages/' + f),
  // login.js 是登录门禁，会拦截 APP 初始化；渲染断言不需要它，故不加载（同 smoke_test.js）
  'assets/js/app.js',
]

function boot({ withReal }) {
  const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/' })
  const w = dom.window
  w.echarts = stubEcharts
  w.requestAnimationFrame = cb => setTimeout(cb, 16)
  w.cancelAnimationFrame = () => {}
  w.console = console
  w.matchMedia = w.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {} }))
  const errors = []
  w.addEventListener('error', e => errors.push(String(e.message || e.error)))
  w.eval('window.APP = {};')
  for (const rel of JS_ORDER) {
    if (rel === 'assets/data/real-data.js' && !withReal) continue
    if (rel === 'assets/data/real-data.js' && !existsSync(path.join(DEMO, rel))) continue
    try {
      w.eval(readFileSync(path.join(DEMO, rel), 'utf-8'))
    } catch (e) {
      errors.push(rel + ': ' + e.message)
    }
  }
  return { w, errors }
}

console.log('[1] 真实数据装载（real-data.js 存在时）')
const hasReal = existsSync(path.join(DEMO, 'assets/data/real-data.js'))
const real = boot({ withReal: true })
const M = real.w.MOCK
if (!hasReal) {
  console.log('  ! 未找到 demo/assets/data/real-data.js，跳过装载断言（先跑 node tools/gen_demo_real_data.mjs）')
} else {
  ok(M.__REAL_DATA__ === true, 'MOCK.__REAL_DATA__ 标记为真（真实数据集已生效）')
  ok(M.ENTERPRISES.length === 88, `企业数 = 88（实际 ${M.ENTERPRISES.length}）`)
  ok(M.ENTERPRISES.every(e => e.finYear), '全部企业带真实年报年度 finYear')
  const rev = M.ENTERPRISES.reduce((s, e) => s + (e.overview?.revenueWan || 0), 0)
  ok(Math.abs(rev - 917467.4) < 1, `营收合计 = 91.75 亿元（实际 ${(rev / 10000).toFixed(2)} 亿元）`)
  ok(M.ENTERPRISES.every(e => /^9\d{5}[A-Z0-9]{10,}$/.test(e.creditCode || '')), '每家都有形态合法的统一社会信用代码')
  const e1 = M.ENTERPRISES[0]
  ok(M.entById(e1.id) && M.entById(e1.id).name === e1.name, 'entById 与 global.MOCK 指向同一份数据（闭包已原地替换）')
  ok(M.RISK_EVENTS.length === 67 && M.PROJECTS.length === 19 && M.TASKS.length === 78 && M.POLICY_LIB.length === 24,
    `明细数对齐后端（事件 67 / 项目 19 / 任务 78 / 政策 24，实际 ${M.RISK_EVENTS.length}/${M.PROJECTS.length}/${M.TASKS.length}/${M.POLICY_LIB.length}）`)
  const sumRisk = M.ENTERPRISES.reduce((a, e) => (a[e.riskLevel] = (a[e.riskLevel] || 0) + 1, a), {})
  ok(sumRisk.red + sumRisk.orange + sumRisk.yellow + sumRisk.blue === 88, '四级风险分布覆盖全部企业：' + JSON.stringify(sumRisk))
  ok(M.OVERVIEW && M.OVERVIEW.totalEnterprises === 88, `OVERVIEW 企业数 = 88（实际 ${M.OVERVIEW && M.OVERVIEW.totalEnterprises}）`)
  // 文案层断言：光数字对不算通过 —— 关联对象缺失时数量照样是 88，
  // 但产业名会变成英文 key、区县名变成英文 id、地址全变「省外线索」。
  const enKey = M.ENTERPRISES.filter(e => /^[a-z]+$/.test(String(e.industryName || '')))
  ok(enKey.length === 0, `产业名均为中文（英文 key ${enKey.length} 家${enKey.length ? '：' + enKey.slice(0, 3).map(e => e.name + '→' + e.industryName).join('、') : ''}）`)
  const dKey = M.ENTERPRISES.filter(e => /^[a-z]{2,5}$/.test(String(e.districtName || '')))
  ok(dKey.length === 0, `区县名均为中文（英文 id ${dKey.length} 家${dKey.length ? '：' + dKey.slice(0, 3).map(e => e.name + '→' + e.districtName).join('、') : ''}）`)
  const outProv = M.ENTERPRISES.filter(e => String(e.address || '').includes('省外线索'))
  ok(outProv.length === 0, `企业地址按区县生成（「省外线索」占位 ${outProv.length} 家）`)
  const indNames = (M.INDUSTRIES || []).map(x => x.name)
  ok(indNames.length > 0 && indNames.every(n => /[\u4e00-\u9fa5]/.test(String(n))), `产业分布图分类名均为中文：${indNames.slice(0, 4).join('/')}…`)
  const pad = n => (n < 10 ? '0' + n : '' + n)
  const now = new Date()
  const todayStr = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate())
  const todayCnt = M.TASKS.filter(t => t.due === todayStr && t.status !== '已完成').length
  const weekCnt = M.TASKS.filter(t => {
    if (!t.createTime) return false
    const d = new Date(String(t.createTime).replace(/-/g, '/'))
    return !isNaN(d.getTime()) && d.getTime() >= now.getTime() - 7 * 86400000
  }).length
  ok(todayCnt > 0, `今日待办非空（今日到期未完成 ${todayCnt} 件，日期已滚动到 ${todayStr}）`)
  ok(weekCnt > 0, `本周新增非空（近 7 天创建 ${weekCnt} 件）`)
  ok(real.errors.length === 0, '装载期无 JS 异常', real.errors.slice(0, 3).join(' | '))
}

console.log('[2] 确定性（两次独立装载结果必须一致）')
if (hasReal) {
  const snapshot = w => {
    const m = w.MOCK
    return JSON.stringify({
      E: m.ENTERPRISES.map(e => [e.id, e.name, e.riskScore, e.riskLevel, e.overview?.revenueWan, e.overview?.taxWan,
        e.risks, (e.policies || []).map(p => p.code || p.id), (e.ai && [e.ai.summary, e.ai.confidence]) || null]),
      R: m.RISK_EVENTS.map(x => [x.id, x.title, x.level, x.status]),
      P: m.PROJECTS.map(x => [x.id, x.stage, x.progress]),
      T: m.TASKS.map(x => [x.id, x.status, x.due]),
      O: m.OVERVIEW,
    })
  }
  const a = snapshot(real.w)
  const b = snapshot(boot({ withReal: true }).w)
  ok(a === b, '两次装载的全部实体与聚合指标完全一致（' + (a.length / 1024).toFixed(0) + 'KB 快照逐字节相同）')
}

console.log('[3] 兜底回落（无 real-data.js 时用内置模拟数据）')
const mockOnly = boot({ withReal: false })
const MM = mockOnly.w.MOCK
ok(!MM.__REAL_DATA__, '无真实数据集时 __REAL_DATA__ 不为真')
ok(MM.ENTERPRISES.length === 120, `回落内置 120 家模拟企业（实际 ${MM.ENTERPRISES.length}）`)
ok(MM.entById(MM.ENTERPRISES[0].id) !== null, '回落态 entById 正常')
ok(mockOnly.errors.length === 0, '回落态无 JS 异常', mockOnly.errors.slice(0, 3).join(' | '))

console.log('[4] 页面渲染（真实数据态，逐页断言 #content 有内容）')
const pages = ['dashboard', 'enterprise', 'profile', 'risk', 'graph', 'workbench', 'project', 'policy', 'aidemo']
for (const p of pages) {
  const w = real.w
  try {
    if (!w.APP || !w.APP.render) {
      ok(false, `${p} 页渲染`, 'APP.render 不存在')
      continue
    }
    w.APP.state.page = p
    w.APP.render()
    const c = w.document.getElementById('content')
    const text = ((c && c.innerHTML) || '').replace(/\s/g, '')
    ok(text.length > 100, `${p} 页渲染 ${text.length} 字符`)
  } catch (e) { ok(false, `${p} 页渲染异常`, e.message) }
}

console.log(fails === 0 ? '\n✅ 全部通过' : `\n❌ ${fails} 项失败`)
process.exit(fails === 0 ? 0 : 1)
