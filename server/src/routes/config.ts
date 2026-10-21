import { FastifyInstance } from 'fastify'
import { prisma } from '../utils/prisma.js'
import { ok, fail } from '../utils/helper.js'
import { audit, auditCtx } from '../utils/audit.js'
import { seedDemoData, realFixturesStamp } from '../../prisma/seed-data.js'

export const DEFAULT_RISK_WEIGHTS = [
  { key: 'operation', name: '经营风险', weight: 0.20 },
  { key: 'finance', name: '财务风险', weight: 0.15 },
  { key: 'judicial', name: '司法风险', weight: 0.15 },
  { key: 'credit', name: '信用风险', weight: 0.15 },
  { key: 'tender', name: '招投标风险', weight: 0.10 },
  { key: 'tax', name: '税务风险', weight: 0.10 },
  { key: 'perform', name: '招商履约风险', weight: 0.10 },
  { key: 'ip', name: '知识产权风险', weight: 0.05 },
]

const VALID_KEYS = DEFAULT_RISK_WEIGHTS.map(w => w.key)

export default async function (fastify: FastifyInstance) {
  // 读取当前风险权重（未配置时返回默认 8 维基线）
  fastify.get('/risk-weights', async () => {
    const config = await prisma.systemConfig.findUnique({ where: { key: 'risk_weights' } })
    const weights = config ? JSON.parse(config.value) : DEFAULT_RISK_WEIGHTS
    return ok(weights)
  })

  // 更新风险权重（需鉴权，校验 8 维 key 合法且权重总和为 100%）
  fastify.put('/risk-weights', { preHandler: [fastify.authenticate] }, async (request: any, reply) => {
    const weights = request.body
    if (!Array.isArray(weights) || weights.length !== 8) {
      return reply.code(400).send(fail('权重数组格式错误，需包含 8 个维度'))
    }
    for (const w of weights) {
      if (!VALID_KEYS.includes(w.key) || typeof Number(w.weight) !== 'number' || Number(w.weight) < 0) {
        return reply.code(400).send(fail('维度 key 非法或权重为非数值'))
      }
    }
    const sum = weights.reduce((acc: number, w: any) => acc + Number(w.weight), 0)
    if (Math.abs(sum - 1.0) > 0.001) {
      return reply.code(400).send(fail('权重总和必须等于 100%（当前为 ' + Math.round(sum * 100) + '%）'))
    }

    const normalized = DEFAULT_RISK_WEIGHTS.map(d => {
      const hit = weights.find((w: any) => w.key === d.key)
      return { key: d.key, name: d.name, weight: Number(hit.weight) }
    })

    await prisma.systemConfig.upsert({
      where: { key: 'risk_weights' },
      update: { value: JSON.stringify(normalized) },
      create: { key: 'risk_weights', value: JSON.stringify(normalized) },
    })
    await audit('update_risk_weights', 'SystemConfig:risk_weights',
      { weights: normalized }, auditCtx(request))
    return ok(normalized, '风险权重配置已更新')
  })

  // 数据同步：重新导入 real-fixtures.json 并记录同步时间戳（仅管理员）
  // 供外部定时任务（每日）在更新 fixtures 后触发，避免每次登录都做全量同步。
  fastify.post('/sync-data', { preHandler: [fastify.authenticate] }, async (request: any, reply) => {
    if (request.user?.role !== 'admin') {
      return reply.code(403).send(fail('仅管理员可执行数据同步'))
    }
    const stamp = realFixturesStamp()
    await seedDemoData(prisma)
    const payload = JSON.stringify({ fixturesGeneratedAt: stamp, syncedAt: new Date().toISOString() })
    await prisma.systemConfig.upsert({
      where: { key: 'data_sync' },
      update: { value: payload },
      create: { key: 'data_sync', value: payload },
    })
    const [enterprises, riskEvents, projects, tasks, policies] = await Promise.all([
      prisma.enterprise.count(), prisma.riskEvent.count(), prisma.project.count(),
      prisma.task.count(), prisma.policy.count(),
    ])
    await audit('sync_data', 'SystemConfig:data_sync',
      { enterprises, riskEvents, projects, tasks, policies, fixturesGeneratedAt: stamp }, auditCtx(request))
    return ok(
      { enterprises, riskEvents, projects, tasks, policies, fixturesGeneratedAt: stamp, syncedAt: new Date().toISOString() },
      '数据同步完成'
    )
  })

  // 查询数据同步状态
  fastify.get('/sync-status', async () => {
    const cfg = await prisma.systemConfig.findUnique({ where: { key: 'data_sync' } })
    const enterprises = await prisma.enterprise.count()
    return ok({
      enterprises,
      fixturesGeneratedAt: realFixturesStamp(),
      lastSync: cfg ? JSON.parse(cfg.value) : null,
    })
  })
}
