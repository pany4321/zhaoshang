import { FastifyInstance } from 'fastify'
import { prisma } from '../utils/prisma.js'
import { ok, parsePagination, fail } from '../utils/helper.js'

export default async function (fastify: FastifyInstance) {
  // 工作台 KPI（按当前用户）
  fastify.get('/kpi', { preHandler: [fastify.authenticate] }, async (request: any) => {
    const username = request.user.username
    const where = { assignee: username }

    const [total, pending, doing, done, overdue, today] = await Promise.all([
      prisma.task.count({ where }),
      prisma.task.count({ where: { ...where, status: 'pending' } }),
      prisma.task.count({ where: { ...where, status: 'doing' } }),
      prisma.task.count({ where: { ...where, status: 'done' } }),
      prisma.task.count({ where: { ...where, status: 'overdue' } }),
      prisma.task.count({
        where: {
          ...where,
          dueDate: new Date().toISOString().slice(0, 10),
          status: { in: ['pending', 'doing'] },
        },
      }),
    ])

    // 负责的企业数、项目数（通过任务关联）
    const entList = await prisma.task.findMany({
      where,
      select: { enterpriseId: true, projectId: true },
      distinct: ['enterpriseId'],
    })
    const projList = await prisma.task.findMany({
      where,
      select: { projectId: true },
      distinct: ['projectId'],
    })

    return ok({
      total,
      pending,
      doing,
      done,
      overdue,
      today,
      enterprises: entList.filter(t => t.enterpriseId).length,
      projects: projList.filter(t => t.projectId).length,
    })
  })

  // 任务列表
  fastify.get('/tasks', { preHandler: [fastify.authenticate] }, async (request: any) => {
    const username = request.user.username
    const { page, pageSize, skip } = parsePagination(request.query)
    const { status, type, priority, keyword } = request.query as any

    const where: any = { assignee: username }
    if (status) where.status = status
    if (type) where.type = type
    if (priority) where.priority = priority
    if (keyword) where.title = { contains: keyword }

    const [list, total] = await Promise.all([
      prisma.task.findMany({
        where,
        skip, take: pageSize,
        orderBy: [
          { priority: 'desc' },
          { dueDate: 'asc' },
          { id: 'desc' },
        ],
        include: {
          enterprise: { select: { id: true, name: true } },
          project: { select: { id: true, name: true } },
          riskEvent: { select: { id: true, title: true, level: true } },
        },
      }),
      prisma.task.count({ where }),
    ])
    return ok({ list, total, page, pageSize })
  })

  // 今日待办
  fastify.get('/today', { preHandler: [fastify.authenticate] }, async (request: any) => {
    const username = request.user.username
    const today = new Date().toISOString().slice(0, 10)
    const list = await prisma.task.findMany({
      where: {
        assignee: username,
        dueDate: today,
        status: { in: ['pending', 'doing'] },
      },
      orderBy: { priority: 'desc' },
      take: 10,
      include: { enterprise: { select: { id: true, name: true } } },
    })
    return ok(list)
  })

  // 动态（最近处理记录，演示用：按最近完成的任务 + 新派单）
  fastify.get('/activities', { preHandler: [fastify.authenticate] }, async (request: any) => {
    const username = request.user.username
    const tasks = await prisma.task.findMany({
      where: { assignee: username },
      orderBy: { id: 'desc' },
      take: 20,
      include: { enterprise: { select: { name: true } } },
    })
    const activities = tasks.map(t => ({
      id: t.id,
      type: t.type,
      title: t.title,
      status: t.status,
      time: t.finishedAt || t.createdAt,
      enterpriseName: t.enterprise?.name,
    }))
    return ok(activities)
  })

  // 开始任务
  fastify.post('/tasks/:id/start', { preHandler: [fastify.authenticate] }, async (request: any) => {
    const { id } = request.params
    const task = await prisma.task.update({
      where: { id: Number(id) },
      data: { status: 'doing' },
    })
    return ok(task, '任务已开始')
  })

  // 完成任务
  fastify.post('/tasks/:id/finish', { preHandler: [fastify.authenticate] }, async (request: any) => {
    const { id } = request.params
    const { result } = request.body || {} as any
    const today = new Date().toISOString().slice(0, 10)
    const task = await prisma.task.update({
      where: { id: Number(id) },
      data: {
        status: 'done',
        finishedAt: today,
        processLog: result || '已完成',
      },
      include: { riskEvent: true },
    })
    // 如果是风险事件任务，同步更新事件状态
    if (task.riskEvent) {
      await prisma.riskEvent.update({
        where: { id: task.riskEvent.id },
        data: { status: 'done' },
      })
    }
    return ok(task, '任务已完成')
  })

  // 创建任务
  fastify.post('/tasks', { preHandler: [fastify.authenticate] }, async (request: any, reply) => {
    const body = request.body || {} as any
    if (!body.title || !body.assignee || !body.dueDate) {
      return reply.code(400).send(fail('请填写必填项'))
    }
    const task = await prisma.task.create({
      data: {
        title: body.title,
        type: body.type || 'service',
        priority: body.priority || 'normal',
        status: 'pending',
        dueDate: body.dueDate,
        createdAt: new Date().toISOString().slice(0, 10),
        description: body.description,
        enterpriseId: body.enterpriseId,
        projectId: body.projectId,
        assignee: body.assignee,
        source: body.source || '手动创建',
      },
    })
    return ok(task, '任务已创建')
  })
}
