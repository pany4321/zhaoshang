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
import { readFileSync } from 'fs'
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
}

// 每次调用时重新读取：fixtures.json 更新后无需重启 server 即生效
function loadFixtures(): Fixtures {
  return JSON.parse(
    readFileSync(path.join(__dirname, 'demo-fixtures.json'), 'utf-8'),
  )
}

export async function seedDemoData(prisma: PrismaClient) {
  const fixtures = loadFixtures()
  console.log('🌱 开始填充演示数据（来源：demo mock fixtures，单一事实源）...')

  // 清库（按外键依赖倒序）
  await prisma.aiConversation.deleteMany()
  await prisma.riskEvent.deleteMany()
  await prisma.task.deleteMany()
  await prisma.project.deleteMany()
  await prisma.policy.deleteMany()
  await prisma.shareholder.deleteMany()
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
    { username: 'zhaoshang01', name: '李专员',     role: 'worker', password: '123456',   districtId: 'xf' },
    { username: 'zhaoshang02', name: '王专员',     role: 'worker', password: '123456',   districtId: 'qc' },
    { username: 'zhaoshang03', name: '张专员',     role: 'worker', password: '123456',   districtId: 'hj' },
    { username: 'invest_zhang', name: '张经理',    role: 'worker', password: '123456',   districtId: 'xf' },
    { username: 'invest_wang',  name: '王经理',    role: 'worker', password: '123456',   districtId: 'ning' },
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
  console.log(`  ✓ 用户 ${users.length} 个（默认密码：admin123 / leader123 / 123456）`)

  // 3. 企业 + 股东
  for (const ent of fixtures.enterprises) {
    const { shareholders, ...entData } = ent
    await prisma.enterprise.create({
      data: { ...entData, shareholders: { create: shareholders } },
    })
  }
  console.log(`  ✓ 企业 ${fixtures.enterprises.length} 家`)

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
  for (const t of fixtures.tasks) {
    const isRiskTask = t.type === 'risk' && !!t.source
    await prisma.task.create({
      data: { ...t, riskEvent: isRiskTask ? { connect: { id: t.source } } : undefined },
    })
  }
  console.log(`  ✓ 任务 ${fixtures.tasks.length} 条`)

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
    zhaoshang01 / 123456 （招商专员）
  `)
}
