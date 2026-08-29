import { FastifyInstance } from 'fastify'
import { prisma } from '../utils/prisma.js'
import { ok } from '../utils/helper.js'

export default async function (fastify: FastifyInstance) {
  // 区县列表
  fastify.get('/districts', async () => {
    const list = await prisma.district.findMany({ orderBy: { sort: 'asc' } })
    return ok(list)
  })

  // 行业列表
  fastify.get('/industries', async () => {
    const list = await prisma.industry.findMany({ orderBy: { sort: 'asc' } })
    return ok(list)
  })

  // 风险等级字典
  fastify.get('/risk-levels', async () => {
    return ok([
      { key: 'red',    name: '红色预警', color: '#EF4444' },
      { key: 'orange', name: '橙色预警', color: '#F97316' },
      { key: 'yellow', name: '黄色预警', color: '#EAB308' },
      { key: 'blue',   name: '蓝色关注', color: '#3B82F6' },
    ])
  })

  // 风险维度
  fastify.get('/risk-dims', async () => {
    const { RISK_DIMS } = await import('../utils/risk.js')
    return ok(RISK_DIMS)
  })

  // 项目阶段
  fastify.get('/project-stages', async () => {
    return ok([
      { key: 0, name: '线索对接' },
      { key: 1, name: '深度洽谈' },
      { key: 2, name: '签约落地' },
      { key: 3, name: '建设推进' },
      { key: 4, name: '投产运营' },
      { key: 5, name: '达产评价' },
    ])
  })
}
