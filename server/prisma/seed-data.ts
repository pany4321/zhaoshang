/* ============================================================
 * 招商平台演示数据 seed（fixtures 驱动）
 * 数据唯一事实源：demo/assets/data/mock.js（唯一设计基准）。
 * 实体明细由 tools/export_demo_fixtures.cjs 导出为 demo-fixtures.json，
 * 本模块只负责清库入库——不再维护第二套数据生成逻辑。
 * 重新导出：node tools/export_demo_fixtures.cjs
 * 对账校验：node tools/check_data_parity.cjs
 * ============================================================ */
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { readFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

interface Fixtures {
  districts: { id: string; name: string; sort: number }[]
  industries: { id: string; name: string; sort: number }[]
  enterprises: Record<string, any>[]
  riskEvents: Record<string, any>[]
  projects: Record<string, any>[]
  tasks: Record<string, any>[]
  policies: Record<string, any>[]
  judicialCases?: Record<string, any>[]
}

// 每次调用时重新读取：fixtures.json 更新后无需重启 server 即生效
// 优先读取 real-fixtures.json（真实工商数据 + 规则推导），缺失时回退 demo-fixtures.json
function loadFixtures(): { fixtures: Fixtures; source: 'real' | 'demo' } {
  const realPath = path.join(__dirname, 'real-fixtures.json')
  const demoPath = path.join(__dirname, 'demo-fixtures.json')
  if (existsSync(realPath)) {
    return { fixtures: JSON.parse(readFileSync(realPath, 'utf-8')), source: 'real' }
  }
  return { fixtures: JSON.parse(readFileSync(demoPath, 'utf-8')), source: 'demo' }
}

/** 返回 real-fixtures.json 的生成时间戳（无该文件时返回 null），供启动同步判断使用 */
export function realFixturesStamp(): string | null {
  const realPath = path.join(__dirname, 'real-fixtures.json')
  if (!existsSync(realPath)) return null
  try {
    const raw = JSON.parse(readFileSync(realPath, 'utf-8'))
    return String(raw.generatedAt || '')
  } catch {
    return null
  }
}

// 引号感知的 CSV 解析：经营范围字段含逗号与换行，不能按行 split
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '"') {
      if (inQ && text[i + 1] === '"') { cur += '"'; i++ }
      else inQ = !inQ
    } else if (ch === ',' && !inQ) {
      row.push(cur); cur = ''
    } else if ((ch === '\n' || ch === '\r') && !inQ) {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cur); cur = ''
      if (row.some((c) => c !== '')) rows.push(row)
      row = []
    } else {
      cur += ch
    }
  }
  if (cur !== '' || row.length) { row.push(cur); if (row.some((c) => c !== '')) rows.push(row) }
  return rows
}

/** 演示「今日待办」任务标记：fixtures 里 source 以此前缀开头的任务，入库时截止日期滚动到当天 */
const TODAY_TAG = 'TODAY:'

/** 本地时区的 YYYY-MM-DD（不能用 toISOString，UTC 会差 8 小时导致日期错位） */
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export async function seedDemoData(prisma: PrismaClient) {
  const { fixtures, source } = loadFixtures()
  console.log(`🌱 开始填充数据（来源：${source === 'real' ? '真实企业工商数据' : 'demo 演示数据'}）...`)

  // 清库（按外键依赖倒序）
  await prisma.prospectEnterprise.deleteMany()
  await prisma.aiConversation.deleteMany()
  await prisma.systemConfig.deleteMany()
  await prisma.riskEvent.deleteMany()
  await prisma.task.deleteMany()
  await prisma.project.deleteMany()
  await prisma.policy.deleteMany()
  await prisma.shareholder.deleteMany()
  await prisma.judicialCase.deleteMany()
  await prisma.enterpriseRecord.deleteMany()
  await prisma.enterprise.deleteMany()
  await prisma.user.deleteMany()
  await prisma.district.deleteMany()
  await prisma.industry.deleteMany()

  // 1. 字典（区县 / 行业）
  for (const d of fixtures.districts) {
    await prisma.district.create({ data: d })
  }
  for (const ind of fixtures.industries) {
    await prisma.industry.create({ data: ind })
  }
  console.log(`  ✓ 区县 ${fixtures.districts.length} 个 / 行业 ${fixtures.industries.length} 个`)

  // 2. 用户（演示账号固定，不属于 fixtures 数据口径）
  const users = [
    { username: 'admin',       name: '系统管理员', role: 'admin',  password: 'admin123', districtId: undefined },
    { username: 'leader',      name: '局领导',     role: 'leader', password: 'leader123', districtId: undefined },
    { username: 'zhaoshang01', name: '李专员',     role: 'worker', password: 'NewPass123', districtId: 'xf' },
    { username: 'zhaoshang02', name: '王专员',     role: 'worker', password: 'NewPass123', districtId: 'qc' },
    { username: 'zhaoshang03', name: '张专员',     role: 'worker', password: 'NewPass123', districtId: 'hj' },
    { username: 'invest_zhang', name: '张经理',    role: 'worker', password: 'NewPass123', districtId: 'xf' },
    { username: 'invest_wang',  name: '王经理',    role: 'worker', password: 'NewPass123', districtId: 'ning' },
  ]
  for (const u of users) {
    await prisma.user.create({
      data: {
        username: u.username,
        name: u.name,
        role: u.role,
        password: bcrypt.hashSync(u.password, 8),
        districtId: u.districtId,
      },
    })
  }
  console.log(`  ✓ 用户 ${users.length} 个（默认密码：admin123 / leader123 / NewPass123）`)

  // 3. 企业 + 股东
  for (const ent of fixtures.enterprises) {
    const { shareholders, records, ...entData } = ent
    await prisma.enterprise.create({
      data: { ...entData, shareholders: { create: shareholders } },
    })
  }
  console.log(`  ✓ 企业 ${fixtures.enterprises.length} 家`)

  // 3.35 招商候选企业池（真实外部企业，项目页 AI 智能推荐的数据源）
  // 替代原 mock.js 中 18 家虚构招商线索；数据来自 Doris 官方工商+国标行业
  const prospectCsv = path.join(__dirname, '../../data-import/prospects/prospects.csv')
  if (existsSync(prospectCsv)) {
    const table = parseCsv(readFileSync(prospectCsv, 'utf-8'))
    const header = table.shift() || []
    const col = (n: string) => header.indexOf(n)
    const seen = new Set<string>()
    const prows: any[] = []
    for (const r of table) {
      const nm = (r[col('company_name')] || '').trim()
      const cc = (r[col('credit_no')] || '').trim()
      if (!nm || (cc && seen.has(cc))) continue
      if (cc) seen.add(cc)
      prows.push({
        name: nm,
        creditCode: cc || null,
        province: (r[col('province')] || '').trim(),
        city: (r[col('city')] || '').trim(),
        industryL1: (r[col('industry_l1_name')] || '').trim() || null,
        industryL2: (r[col('industry_l2_name')] || '').trim() || null,
        regCapital: Number(r[col('capital_num')]) || 0,
        foundDate: (r[col('establish_date')] || '').trim() || null,
        bizScope: (r[col('scope')] || '').trim() || null,
      })
    }
    if (prows.length) {
      await prisma.prospectEnterprise.createMany({ data: prows })
      console.log(`  ✓ 招商候选企业 ${prows.length} 家（真实外部企业池）`)
    }
  } else {
    console.log('  ⚠ 未找到 data-import/prospects/prospects.csv，跳过候选企业池')
  }

  // 3.4 企业档案记录（行政处罚/经营异常/股权出质/动产抵押/分支机构）
  let recN = 0
  for (const ent of fixtures.enterprises) {
    for (const r of (ent.records || [])) {
      recN++
      await prisma.enterpriseRecord.create({
        data: {
          id: `REC${String(recN).padStart(4, '0')}`,
          enterpriseId: ent.id,
          type: r.type,
          title: String(r.title || '').slice(0, 200),
          detail: r.detail || null,
          occurDate: r.occurDate || null,
          amount: (r.amount === null || r.amount === undefined) ? null : Number(r.amount),
        },
      })
    }
  }
  console.log(`  ✓ 企业档案记录 ${recN} 条`)

  // 3.5 司法案件明细（真实案号/案由/审判程序）
  const jcs = fixtures.judicialCases || []
  for (const jc of jcs) {
    await prisma.judicialCase.create({ data: jc })
  }
  console.log(`  ✓ 司法案件明细 ${jcs.length} 条`)

  // 4. 风险事件
  for (const ev of fixtures.riskEvents) {
    await prisma.riskEvent.create({ data: ev })
  }
  console.log(`  ✓ 风险事件 ${fixtures.riskEvents.length} 条`)

  // 5. 招商项目
  for (const proj of fixtures.projects) {
    await prisma.project.create({ data: proj })
  }
  console.log(`  ✓ 招商项目 ${fixtures.projects.length} 个`)

  // 6. 任务（风险处置任务按 source 关联风险事件，形成闭环）
  //    source 前缀 "TODAY:" 表示「演示今日待办」：入库时把截止日期滚动到当天，
  //    否则固定日期一过、今日待办就永远为空（演示时看不到任何待办）。
  const todayYmd = ymd(new Date())
  for (const t of fixtures.tasks) {
    const rawSource = String(t.source || '')
    const isTodayDemo = rawSource.startsWith(TODAY_TAG)
    const taskSource = isTodayDemo ? rawSource.slice(TODAY_TAG.length) : t.source
    const isRiskTask = t.type === 'risk' && !!taskSource
    // 显式逐字段构造（不用 spread）：fixtures 是 Record<string,any>，
    // spread 会把整个对象塞进 Prisma 的联合输入类型，类型检查无法收敛。
    await prisma.task.create({
      data: {
        id: t.id,
        title: t.title,
        type: t.type,
        priority: t.priority,
        status: t.status,
        // 演示今日待办：截止/创建日期滚动到当天，保证任何一天打开工作台都有待办
        dueDate: isTodayDemo ? todayYmd : t.dueDate,
        createdAt: isTodayDemo ? todayYmd : t.createdAt,
        finishedAt: isTodayDemo ? null : (t.finishedAt ?? null),
        description: t.description ?? null,
        processLog: isTodayDemo ? null : (t.processLog ?? null),
        enterpriseId: t.enterpriseId ?? null,
        projectId: t.projectId ?? null,
        assignee: t.assignee,
        source: taskSource ?? null,
        riskEvent: isRiskTask ? { connect: { id: taskSource } } : undefined,
      },
    })
  }
  console.log(`  ✓ 任务 ${fixtures.tasks.length} 条（其中今日待办 ${fixtures.tasks.filter((t) => String(t.source || '').startsWith(TODAY_TAG)).length} 条滚动到 ${todayYmd}）`)

  // 7. 政策
  for (const p of fixtures.policies) {
    await prisma.policy.create({ data: p })
  }
  console.log(`  ✓ 政策 ${fixtures.policies.length} 条`)

  console.log('🎉 数据填充完成！')
  console.log(`
  默认账号：
    admin / admin123    （管理员）
    leader / leader123   （领导）
    zhaoshang01 / NewPass123 （招商专员）
  `)
}
