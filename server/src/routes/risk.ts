import { FastifyInstance } from 'fastify'
import { prisma } from '../utils/prisma.js'
import { ok, parsePagination, fail } from '../utils/helper.js'
import { RISK_DIMS } from '../utils/risk.js'

export default async function (fastify: FastifyInstance) {
  // 风险事件列表 + 筛选
  fastify.get('/', async (request: any) => {
    const { page, pageSize, skip } = parsePagination(request.query)
    const {
      keyword, districtId, level, dimension, status, enterpriseId,
    } = request.query as any

    const where: any = {}
    if (keyword) where.title = { contains: keyword }
    if (districtId) where.districtId = districtId
    if (level) where.level = level
    if (dimension) where.dimension = dimension
    if (status) where.status = status
    if (enterpriseId) where.enterpriseId = enterpriseId

    const [list, total] = await Promise.all([
      prisma.riskEvent.findMany({
        where,
        skip, take: pageSize,
        orderBy: [
          { status: 'asc' },
          { foundDate: 'desc' },
        ],
        include: {
          enterprise: { select: { id: true, name: true, riskLevel: true } },
          district: { select: { id: true, name: true } },
        },
      }),
      prisma.riskEvent.count({ where }),
    ])
    return ok({ list, total, page, pageSize })
  })

  // 风险事件详情
  fastify.get('/:id', async (request: any, reply) => {
    const { id } = request.params
    const item = await prisma.riskEvent.findUnique({
      where: { id },
      include: {
        enterprise: true,
        district: true,
        task: true,
      },
    })
    if (!item) return reply.code(404).send(fail('风险事件不存在'))
    return ok(item)
  })

  // 风险事件统计（按等级 / 维度 / 状态）
  fastify.get('/stats', async (request: any) => {
    const { districtId } = request.query as any
    const where = districtId ? { districtId } : {}

    const [byLevel, byDim, byStatus, total] = await Promise.all([
      prisma.riskEvent.groupBy({ by: ['level'], where, _count: true }),
      prisma.riskEvent.groupBy({ by: ['dimension'], where, _count: true }),
      prisma.riskEvent.groupBy({ by: ['status'], where, _count: true }),
      prisma.riskEvent.count({ where }),
    ])

    const levelMap: Record<string, number> = { red: 0, orange: 0, yellow: 0, blue: 0 }
    byLevel.forEach(r => { levelMap[r.level] = r._count })

    const dimMap: Record<string, number> = {}
    byDim.forEach(r => { dimMap[r.dimension] = r._count })

    const statusMap: Record<string, number> = { pending: 0, doing: 0, done: 0 }
    byStatus.forEach(r => { statusMap[r.status] = r._count })

    return ok({
      total,
      byLevel: levelMap,
      byDimension: dimMap,
      byStatus: statusMap,
      dims: RISK_DIMS,
    })
  })

  // 派单 / 分派任务
  fastify.post('/:id/dispatch', { preHandler: [fastify.authenticate] }, async (request: any, reply) => {
    const { id } = request.params
    const { assignee, dueDate, note } = request.body || {} as any
    if (!assignee) return reply.code(400).send(fail('请指定处理人'))

    const event = await prisma.riskEvent.findUnique({ where: { id } })
    if (!event) return reply.code(404).send(fail('风险事件不存在'))
    if (event.status === 'done') return reply.code(400).send(fail('已闭环事件不能重复派单'))

    // 创建任务
    const task = await prisma.task.create({
      data: {
        title: `【风险处置】${event.title}`,
        type: 'risk',
        priority: event.level === 'red' ? 'high' : event.level === 'orange' ? 'high' : 'normal',
        status: 'pending',
        dueDate: dueDate || new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
        createdAt: new Date().toISOString().slice(0, 10),
        description: note || event.suggestion,
        enterpriseId: event.enterpriseId,
        assignee,
        source: `风险事件 ${id}`,
        riskEvent: { connect: { id } },
      },
    })

    // 更新事件状态
    const updated = await prisma.riskEvent.update({
      where: { id },
      data: { status: 'doing', taskId: task.id },
    })

    return ok({ event: updated, task }, '已分派处置任务')
  })

  // 更新事件状态（闭环）
  fastify.post('/:id/status', { preHandler: [fastify.authenticate] }, async (request: any) => {
    const { id } = request.params
    const { status } = request.body || {} as any
    const updated = await prisma.riskEvent.update({
      where: { id },
      data: { status },
    })
    return ok(updated, '状态已更新')
  })
}
