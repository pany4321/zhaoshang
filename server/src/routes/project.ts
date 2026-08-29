import { FastifyInstance } from 'fastify'
import { prisma } from '../utils/prisma.js'
import { ok, parsePagination, fail } from '../utils/helper.js'

const STAGES = ['线索对接', '深度洽谈', '签约落地', '建设推进', '投产运营', '达产评价']

export default async function (fastify: FastifyInstance) {
  // 项目列表
  fastify.get('/', async (request: any) => {
    const { page, pageSize, skip } = parsePagination(request.query)
    const { keyword, districtId, industryId, stage, riskLevel } = request.query as any

    const where: any = {}
    if (keyword) where.name = { contains: keyword }
    if (districtId) where.districtId = districtId
    if (industryId) where.industryId = industryId
    if (stage !== undefined && stage !== '') where.stage = Number(stage)
    if (riskLevel) where.riskLevel = riskLevel

    const [list, total] = await Promise.all([
      prisma.project.findMany({
        where,
        skip, take: pageSize,
        orderBy: [{ stage: 'asc' }, { updatedAt: 'desc' }],
        include: {
          enterprise: { select: { id: true, name: true } },
          district: { select: { id: true, name: true } },
          industry: { select: { id: true, name: true } },
        },
      }),
      prisma.project.count({ where }),
    ])
    return ok({ list, total, page, pageSize, stages: STAGES })
  })

  // 项目漏斗（按阶段统计）
  fastify.get('/funnel', async (request: any) => {
    const { districtId } = request.query as any
    const where = districtId ? { districtId } : {}
    const groups = await prisma.project.groupBy({
      by: ['stage'],
      where,
      _count: true,
      _sum: { investment: true },
      orderBy: { stage: 'asc' },
    })
    const data = STAGES.map((name, idx) => {
      const g = groups.find(x => x.stage === idx)
      return {
        stage: idx,
        name,
        count: g?._count || 0,
        investment: g?._sum.investment || 0,
      }
    })
    return ok(data)
  })

  // 项目详情
  fastify.get('/:id', async (request: any, reply) => {
    const { id } = request.params
    const p = await prisma.project.findUnique({
      where: { id },
      include: {
        enterprise: true,
        district: true,
        industry: true,
        tasks: { orderBy: { id: 'desc' } },
      },
    })
    if (!p) return reply.code(404).send(fail('项目不存在'))
    return ok(p)
  })

  // 推进项目阶段
  fastify.post('/:id/advance', { preHandler: [fastify.authenticate] }, async (request: any, reply) => {
    const { id } = request.params
    const { note } = request.body || {} as any
    const p = await prisma.project.findUnique({ where: { id } })
    if (!p) return reply.code(404).send(fail('项目不存在'))
    if (p.stage >= 5) return reply.code(400).send(fail('已达最终阶段'))

    const nextStage = p.stage + 1
    const detailField = `stage${nextStage + 1}Detail` as keyof typeof p
    const updateData: any = {
      stage: nextStage,
      stageName: STAGES[nextStage],
      progress: Math.min(100, p.progress + 15 + Math.floor(Math.random() * 10)),
      lastContact: new Date().toISOString().slice(0, 10),
    }
    if (note) updateData[detailField] = note

    const updated = await prisma.project.update({
      where: { id },
      data: updateData,
    })
    return ok(updated, `已推进至「${STAGES[nextStage]}」阶段`)
  })

  // 保存当前阶段进展情况（不推进阶段）
  fastify.post('/:id/note', { preHandler: [fastify.authenticate] }, async (request: any, reply) => {
    const { id } = request.params
    const { note } = request.body || {} as any
    const p = await prisma.project.findUnique({ where: { id } })
    if (!p) return reply.code(404).send(fail('项目不存在'))
    const detailField = `stage${p.stage + 1}Detail`
    const updated = await prisma.project.update({
      where: { id },
      data: {
        [detailField]: note || '',
        lastContact: new Date().toISOString().slice(0, 10),
      } as any,
    })
    return ok(updated, '进展情况已保存')
  })

  // 新建招商项目（线索对接阶段，企业需先建档）
  fastify.post('/', { preHandler: [fastify.authenticate] }, async (request: any, reply) => {
    const {
      name, enterpriseId, investment = 0, districtId, industryId,
      org = '', contact = '', note = '',
    } = request.body || {} as any
    if (!name || !enterpriseId || !districtId || !industryId) {
      return reply.code(400).send(fail('请填写项目名称、企业、区县与行业'))
    }
    const exists = await prisma.project.findUnique({ where: { enterpriseId } })
    if (exists) return reply.code(400).send(fail('该企业已有招商项目'))

    const cnt = await prisma.project.count()
    const p = await prisma.project.create({
      data: {
        id: `P${String(cnt + 1).padStart(3, '0')}`,
        name,
        enterpriseId,
        stage: 0,
        stageName: STAGES[0],
        progress: 5,
        investment: Math.round(investment),
        districtId,
        industryId,
        org,
        contact,
        riskLevel: 'blue',
        startDate: new Date().toISOString().slice(0, 10),
        stage1Detail: note,
        lastContact: new Date().toISOString().slice(0, 10),
      },
      include: {
        enterprise: true,
        district: true,
        industry: true,
      },
    })
    return ok(p, '项目已建档')
  })
}
