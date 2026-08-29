import { FastifyInstance } from 'fastify'
import { prisma } from '../utils/prisma.js'
import { ok } from '../utils/helper.js'

export default async function (fastify: FastifyInstance) {
  // 全局搜索：企业 + 项目 + 政策 三合一
  fastify.get('/', async (request: any) => {
    const { q, limit = '5' } = request.query as any
    const keyword = (q || '').trim()
    if (!keyword) return ok({ enterprises: [], projects: [], policies: [] })

    const n = Math.min(parseInt(limit) || 5, 20)

    const [enterprises, projects, policies] = await Promise.all([
      prisma.enterprise.findMany({
        where: {
          OR: [
            { name: { contains: keyword } },
            { creditCode: { contains: keyword } },
            { legal: { contains: keyword } },
          ],
        },
        take: n,
        select: {
          id: true, name: true, riskLevel: true, riskScore: true,
          district: { select: { name: true } },
          industry: { select: { name: true } },
        },
        orderBy: { riskScore: 'desc' },
      }),
      prisma.project.findMany({
        where: {
          OR: [
            { name: { contains: keyword } },
            { enterprise: { is: { name: { contains: keyword } } } },
          ],
        },
        take: n,
        select: {
          id: true, name: true, stage: true, stageName: true,
          investment: true, district: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.policy.findMany({
        where: {
          OR: [
            { title: { contains: keyword } },
            { dept: { contains: keyword } },
          ],
        },
        take: n,
        select: { id: true, title: true, category: true, level: true, publishDate: true },
        orderBy: { hot: 'desc' },
      }),
    ])

    return ok({ enterprises, projects, policies })
  })
}
