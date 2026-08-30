import { FastifyInstance } from 'fastify'
import { prisma } from '../utils/prisma.js'
import { ok } from '../utils/helper.js'

// 一次性聚合下发全部演示数据，供前端引擎引导时适配为统一数据结构。
// 相比逐页多次请求，单一接口可保证同一时刻的数据一致性（聚合/汇总与明细天然对账）。
export default async function (fastify: FastifyInstance) {
  fastify.get('/', async () => {
    const [districts, industries, enterprises, riskEvents, projects, tasks, policies, weightCfg] =
      await Promise.all([
        prisma.district.findMany({ orderBy: { sort: 'asc' } }),
        prisma.industry.findMany({ orderBy: { sort: 'asc' } }),
        prisma.enterprise.findMany({
          include: {
            shareholders: { orderBy: { sort: 'asc' } },
            district: true,
            industry: true,
          },
        }),
        prisma.riskEvent.findMany({
          include: { enterprise: { select: { id: true, name: true } } },
          orderBy: { foundDate: 'desc' },
        }),
        prisma.project.findMany({
          include: {
            enterprise: true,
            district: true,
            industry: true,
          },
        }),
        prisma.task.findMany({
          include: {
            enterprise: { select: { id: true, name: true } },
            project: { select: { id: true, name: true, stageName: true } },
            riskEvent: { select: { id: true } },
          },
          orderBy: { id: 'desc' },
        }),
        prisma.policy.findMany({
          include: { industry: { select: { id: true, name: true } } },
          orderBy: { id: 'asc' },
        }),
        prisma.systemConfig.findUnique({ where: { key: 'risk_weights' } }),
      ])

    return ok({
      districts,
      industries,
      enterprises,
      riskEvents,
      projects,
      tasks,
      policies,
      riskWeights: weightCfg ? JSON.parse(weightCfg.value) : null,
    })
  })
}
