/**
 * 向「今日待办」新增真实业务待办任务
 *
 * 设计原则（与用户对数据真实性的硬性要求一致）：
 * - 任务关联的都是库中真实存在的企业（工商公示数据），不虚构企业名
 * - 任务标题与来源直接对应企业的真实风险事件 / 真实知识产权资产
 * - 幂等：按 title 查重，重复执行不会插入重复记录
 *
 * 用法：cd server && node --env-file=.env ../tools/add_today_todos.mjs
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

function today() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

const now = () => {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

// 两条任务的定义：企业 id 来自库中真实数据，风险/知产数字取企业真实字段
const DEFS = [
  {
    enterpriseId: 'E012', // 甘肃长庆桥陆港国际物流集团有限公司（宁县，红色风险）
    title: '甘肃长庆桥陆港国际物流集团 税务风险专项核查',
    type: 'risk',
    priority: 'high',
    status: 'pending',
    assignee: 'admin',
    source: '风险处置派单 · 税务风险（红色）',
    description:
      '该企业风险等级为红色，存在税务风险与司法风险两项待处置事件。' +
      '需现场核查纳税申报与实际经营匹配情况，核对涉诉案件的执行进展，' +
      '形成核查报告并明确整改时限。',
  },
  {
    enterpriseId: 'E006', // 庆阳长荣机械设备制造有限公司（庆城县，通用设备制造业）
    title: '庆阳长荣机械设备制造 高企认定与专利转化辅导',
    type: 'service',
    priority: 'normal',
    status: 'pending',
    assignee: 'admin',
    source: '企业服务主动派单 · 科创能力提升',
    description:
      '该企业为国标行业「通用设备制造业」规上企业，累计专利 24 项。' +
      '需辅导其对照高新技术企业认定条件梳理研发费用归集口径，' +
      '并推动专利成果与本地装备制造产业链对接。',
  },
]

async function main() {
  const dueDate = today()
  const createdAt = now()
  const created = []

  for (const def of DEFS) {
    // 1) 幂等检查
    const exists = await prisma.task.findFirst({ where: { title: def.title } })
    if (exists) {
      console.log(`[skip] 已存在：#${exists.id} ${def.title}`)
      created.push({ id: exists.id, title: def.title, skipped: true })
      continue
    }

    // 2) 企业必须真实存在，否则拒绝插入（不允许挂空企业）
    const ent = await prisma.enterprise.findUnique({
      where: { id: def.enterpriseId },
      select: { id: true, name: true, district: { select: { name: true } } },
    })
    if (!ent) {
      console.error(`[fail] 企业 ${def.enterpriseId} 不存在，跳过：${def.title}`)
      continue
    }

    const task = await prisma.task.create({
      data: {
        title: def.title,
        type: def.type,
        priority: def.priority,
        status: def.status,
        dueDate,
        createdAt,
        assignee: def.assignee,
        source: def.source,
        description: def.description,
        enterpriseId: def.enterpriseId,
      },
    })
    console.log(`[ok] #${task.id} ${task.title}`)
    console.log(`     关联企业：${ent.name}（${ent.district?.name || '-'}）`)
    console.log(`     类型/优先级/截止：${def.type} / ${def.priority} / ${dueDate}`)
    created.push({ id: task.id, title: task.title, enterprise: ent.name })
  }

  // 3) 校验今日待办口径（workbench 用 dueDate === today && status !== done，取前 5 条）
  const todayList = await prisma.task.findMany({
    where: { dueDate, status: { not: 'done' } },
    select: { id: true, title: true, priority: true, status: true, assignee: true },
    orderBy: { id: 'desc' },
  })
  console.log(`\n今日待办（${dueDate}，未完成）共 ${todayList.length} 条，页面显示前 5：`)
  todayList.slice(0, 5).forEach((t, i) =>
    console.log(`  ${i + 1}. #${t.id} [${t.priority}] ${t.status} ${t.title}`),
  )
  console.log(`\n本次写入 ${created.filter((c) => !c.skipped).length} 条，跳过 ${created.filter((c) => c.skipped).length} 条`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
