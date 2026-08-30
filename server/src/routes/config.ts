import { FastifyInstance } from 'fastify'
import { prisma } from '../utils/prisma.js'
import { ok, fail } from '../utils/helper.js'

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
    return ok(normalized, '风险权重配置已更新')
  })
}
