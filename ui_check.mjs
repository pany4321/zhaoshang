// 真实浏览器渲染验证（Playwright + Chromium headless）
// 用途：确认 SPA 能在真实引擎下渲染，并截图关键页面
import { chromium } from 'playwright'
import fs from 'fs'

const BASE = process.argv[2] || 'https://served-species-campus-geneva.trycloudflare.com'
const OUT = 'reports'
fs.mkdirSync(OUT, { recursive: true })

const errors = []
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 })

page.on('console', m => { if (m.type() === 'error') errors.push('[console] ' + m.text().slice(0, 200)) })
page.on('pageerror', e => errors.push('[pageerror] ' + String(e.message).slice(0, 200)))
page.on('requestfailed', r => errors.push('[reqfail] ' + r.url().slice(0, 120) + ' ' + (r.failure()?.errorText || '')))

function log(s) { console.log(s) }

// ---------- 1. 登录页 ----------
log('== 1. 加载登录页 ==')
await page.goto(BASE + '/login', { waitUntil: 'networkidle', timeout: 60000 })
await page.waitForTimeout(2500)

const probe = await page.evaluate(() => {
  const app = document.getElementById('app')
  return {
    appLen: app ? app.innerHTML.length : -1,
    inputs: [...document.querySelectorAll('input')].map(i => ({
      type: i.type, name: i.name, id: i.id, ph: i.placeholder,
    })),
    buttons: [...document.querySelectorAll('button')].map(b => (b.textContent || '').trim().slice(0, 20)),
    text: (document.body.innerText || '').slice(0, 300),
  }
})
log(`  app 内容长度: ${probe.appLen}`)
log(`  输入框: ${JSON.stringify(probe.inputs)}`)
log(`  按钮: ${JSON.stringify(probe.buttons)}`)
log(`  可见文本: ${probe.text.replace(/\n/g, ' / ').slice(0, 160)}`)

if (probe.appLen <= 0) {
  log('  ❌ SPA 未渲染')
  await page.screenshot({ path: `${OUT}/p0_登录页_空白.png` })
  log(`  错误: ${errors.join(' | ') || '(无)'}`)
  await browser.close()
  process.exit(1)
}

await page.screenshot({ path: `${OUT}/p0_登录页.png` })
log('  ✅ 登录页已渲染，截图 reports/p0_登录页.png')

// ---------- 2. 登录 ----------
log('== 2. 执行登录 ==')
const userSel = 'input[type="text"], input[name="username"], input:not([type="password"]):not([type="hidden"])'
await page.fill(userSel, 'admin')
await page.fill('input[type="password"]', 'admin123')
await page.keyboard.press('Enter')
await page.waitForTimeout(4000)

const afterLogin = await page.evaluate(() => ({
  url: location.href,
  appLen: document.getElementById('app')?.innerHTML.length || 0,
  text: (document.body.innerText || '').slice(0, 200),
}))
log(`  URL: ${afterLogin.url}`)
log(`  app 内容长度: ${afterLogin.appLen}`)
log(`  可见文本: ${afterLogin.text.replace(/\n/g, ' / ').slice(0, 160)}`)

if (afterLogin.appLen > 0) {
  await page.screenshot({ path: `${OUT}/p0_仪表盘.png` })
  log('  ✅ 登录成功，截图 reports/p0_仪表盘.png')
} else {
  log('  ❌ 登录后未渲染')
}

// ---------- 3. 关键页面巡检 ----------
const routes = [
  ['/enterprises', '企业库'],
  ['/risk', '风险中心'],
  ['/projects', '项目库'],
  ['/workbench', '工作台'],
  ['/policies', '政策库'],
]
log('== 3. 页面巡检 ==')
for (const [path, name] of routes) {
  try {
    await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 45000 })
    await page.waitForTimeout(2200)
    const r = await page.evaluate(() => ({
      len: document.getElementById('app')?.innerHTML.length || 0,
      text: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 90),
    }))
    const okMark = r.len > 1000 ? '✅' : '⚠️'
    log(`  ${okMark} ${name} (${path}) app=${r.len} | ${r.text.slice(0, 60)}`)
    if (r.len > 1000) {
      await page.screenshot({ path: `${OUT}/p0_${name}.png` })
    }
  } catch (e) {
    log(`  ❌ ${name} (${path}) 失败: ${String(e.message).slice(0, 100)}`)
  }
}

// ---------- 4. 企业画像（含新增的六宫格与司法明细）----------
log('== 4. 企业画像下钻 ==')
try {
  await page.goto(BASE + '/enterprises', { waitUntil: 'networkidle', timeout: 45000 })
  await page.waitForTimeout(2000)
  // 点击第一家企业行
  const clicked = await page.evaluate(() => {
    const cand = [...document.querySelectorAll('tr, .ent-row, [data-id]')]
      .find(el => (el.innerText || '').includes('华能陇东') || (el.innerText || '').includes('有限'))
    if (cand) { cand.click(); return (cand.innerText || '').slice(0, 40) }
    return null
  })
  await page.waitForTimeout(3000)
  const detail = await page.evaluate(() => ({
    url: location.href,
    len: document.getElementById('app')?.innerHTML.length || 0,
    hasPatent: (document.body.innerText || '').includes('专利'),
    hasJudicial: (document.body.innerText || '').includes('司法案件'),
    hasCredit: (document.body.innerText || '').includes('失信'),
  }))
  log(`  点击: ${clicked || '(未找到行)'}`)
  log(`  URL: ${detail.url}`)
  log(`  app=${detail.len} 专利:${detail.hasPatent} 司法案件:${detail.hasJudicial} 失信:${detail.hasCredit}`)
  await page.screenshot({ path: `${OUT}/p0_企业画像.png`, fullPage: true })
  log('  ✅ 截图 reports/p0_企业画像.png')
} catch (e) {
  log(`  ❌ 画像下钻失败: ${String(e.message).slice(0, 120)}`)
}

// ---------- 5. 汇总 ----------
log('== 5. 浏览器错误汇总 ==')
if (errors.length === 0) {
  log('  ✅ 无 JS 错误')
} else {
  const uniq = [...new Set(errors)]
  log(`  ⚠️ ${uniq.length} 类错误：`)
  for (const e of uniq.slice(0, 8)) log(`    ${e}`)
}

await browser.close()
log('== 验证结束 ==')
