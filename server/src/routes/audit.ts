import { FastifyInstance } from 'fastify'
import { prisma } from '../utils/prisma.js'
import { ok, fail } from '../utils/helper.js'

export default async function (fastify: FastifyInstance) {
  // 审计日志查询（仅管理员）
  // GET /api/audit?action=login_fail&username=admin&result=fail&limit=50&offset=0
  fastify.get('/', { preHandler: [fastify.authenticate] }, async (request: any, reply) => {
    if (request.user?.role !== 'admin') {
      return reply.code(403).send(fail('仅管理员可查看审计日志'))
    }
    const q = request.query || {}
    const where: any = {}
    if (q.action) where.action = String(q.action)
    if (q.username) where.username = String(q.username)
    if (q.result) where.result = String(q.result)

    const take = Math.min(Math.max(parseInt(String(q.limit ?? 50), 10) || 50, 1), 200)
    const skip = Math.max(parseInt(String(q.offset ?? 0), 10) || 0, 0)

    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, take, skip }),
      prisma.auditLog.count({ where }),
    ])
    return ok({ items, total, take, skip })
  })

  // 近 7 天审计统计（按动作/用户聚合，含失败次数）
  fastify.get('/stats', { preHandler: [fastify.authenticate] }, async (request: any, reply) => {
    if (request.user?.role !== 'admin') {
      return reply.code(403).send(fail('仅管理员可查看审计统计'))
    }
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000)
    const logs = await prisma.auditLog.findMany({
      where: { createdAt: { gte: since } },
      select: { action: true, result: true, username: true },
    })
    const byAction: Record<string, number> = {}
    const byUser: Record<string, number> = {}
    let fails = 0
    for (const l of logs) {
      byAction[l.action] = (byAction[l.action] || 0) + 1
      byUser[l.username] = (byUser[l.username] || 0) + 1
      if (l.result === 'fail') fails++
    }
    return ok({ since, total: logs.length, fails, byAction, byUser })
  })
}
