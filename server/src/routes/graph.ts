import { FastifyInstance } from 'fastify'
import { prisma } from '../utils/prisma.js'
import { ok } from '../utils/helper.js'

export default async function (fastify: FastifyInstance) {
  // 产业关系图谱数据
  // 节点：企业 + 行业 + 区县；边：企业-行业、企业-区县、企业-企业（股权/合作）
  fastify.get('/', async (request: any) => {
    const { type = 'industry', districtId } = request.query as any

    const entWhere = districtId ? { districtId } : {}
    const enterprises = await prisma.enterprise.findMany({
      where: entWhere,
      include: { industry: true, district: true, shareholders: true },
      orderBy: { revenue: 'desc' },
      take: 30, // 演示取前 30 家
    })

    const nodes: any[] = []
    const links: any[] = []
    const idSet = new Set<string>()

    // 行业或区县节点
    if (type === 'industry') {
      const industries = [...new Set(enterprises.map(e => e.industryId))]
      for (const indId of industries) {
        const ind = enterprises.find(e => e.industryId === indId)!.industry
        nodes.push({
          id: `ind-${indId}`,
          name: ind.name,
          category: 0,
          symbolSize: 60,
          value: enterprises.filter(e => e.industryId === indId).length,
        })
        idSet.add(`ind-${indId}`)
      }
    } else {
      const districts = [...new Set(enterprises.map(e => e.districtId))]
      for (const dId of districts) {
        const d = enterprises.find(e => e.districtId === dId)!.district
        nodes.push({
          id: `dist-${dId}`,
          name: d.name,
          category: 0,
          symbolSize: 60,
          value: enterprises.filter(e => e.districtId === dId).length,
        })
        idSet.add(`dist-${dId}`)
      }
    }

    // 企业节点 + 边
    const colorMap: Record<string, string> = {
      red: '#EF4444', orange: '#F97316', yellow: '#EAB308', blue: '#60A5FA',
    }
    for (const ent of enterprises) {
      nodes.push({
        id: ent.id,
        name: ent.name,
        category: 1,
        symbolSize: Math.max(20, Math.min(80, 20 + Math.sqrt(ent.revenue) / 2)),
        value: ent.revenue,
        riskLevel: ent.riskLevel,
        itemStyle: { color: colorMap[ent.riskLevel] || '#60A5FA' },
      })
      idSet.add(ent.id)

      if (type === 'industry') {
        links.push({ source: `ind-${ent.industryId}`, target: ent.id, value: 1 })
      } else {
        links.push({ source: `dist-${ent.districtId}`, target: ent.id, value: 1 })
      }
    }

    // 企业之间的股权/合作关系（基于股东同名来构建演示关系）
    const shareholderMap = new Map<string, string[]>()
    for (const ent of enterprises) {
      for (const sh of ent.shareholders) {
        const key = sh.name
        if (!shareholderMap.has(key)) shareholderMap.set(key, [])
        shareholderMap.get(key)!.push(ent.id)
      }
    }
    for (const [, entIds] of shareholderMap) {
      if (entIds.length > 1) {
        for (let i = 0; i < entIds.length; i++) {
          for (let j = i + 1; j < entIds.length; j++) {
            links.push({ source: entIds[i], target: entIds[j], value: 2, lineStyle: { type: 'dashed' } })
          }
        }
      }
    }

    const categories = type === 'industry'
      ? [{ name: '行业' }, { name: '企业' }]
      : [{ name: '区县' }, { name: '企业' }]

    return ok({ nodes, links, categories })
  })

  // 节点详情（点击节点时）
  fastify.get('/node/:id', async (request: any, reply) => {
    const { id } = request.params
    if (id.startsWith('ind-')) {
      const industryId = id.slice(4)
      const industry = await prisma.industry.findUnique({ where: { id: industryId } })
      const count = await prisma.enterprise.count({ where: { industryId } })
      return ok({ type: 'industry', name: industry?.name, enterpriseCount: count })
    }
    if (id.startsWith('dist-')) {
      const districtId = id.slice(5)
      const district = await prisma.district.findUnique({ where: { id: districtId } })
      const count = await prisma.enterprise.count({ where: { districtId } })
      return ok({ type: 'district', name: district?.name, enterpriseCount: count })
    }
    // 企业节点
    const ent = await prisma.enterprise.findUnique({
      where: { id },
      include: { industry: true, district: true },
    })
    if (!ent) return reply.code(404).send({ code: 404, msg: '节点不存在' })
    return ok({ type: 'enterprise', ...ent })
  })
}
