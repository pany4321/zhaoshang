import { FastifyInstance } from 'fastify'
import { prisma } from '../utils/prisma.js'
import { ok, parsePagination, fail } from '../utils/helper.js'

const CATEGORIES = [
  { key: 'all', name: '全部' },
  { key: '产业', name: '产业扶持' },
  { key: '财税', name: '财税支持' },
  { key: '人才', name: '人才政策' },
  { key: '科技', name: '科技创新' },
  { key: '金融', name: '金融服务' },
  { key: '用地', name: '用地保障' },
]

export default async function (fastify: FastifyInstance) {
  // 政策列表
  fastify.get('/', async (request: any) => {
    const { page, pageSize, skip } = parsePagination(request.query)
    const { keyword, category, level, industryId } = request.query as any

    const where: any = {}
    if (keyword) {
      where.OR = [
        { title: { contains: keyword } },
        { summary: { contains: keyword } },
      ]
    }
    if (category && category !== 'all') where.category = category
    if (level) where.level = level
    if (industryId) where.industryId = industryId

    const [list, total] = await Promise.all([
      prisma.policy.findMany({
        where,
        skip, take: pageSize,
        orderBy: [{ hot: 'desc' }, { publishDate: 'desc' }],
        include: { industry: { select: { name: true } } },
      }),
      prisma.policy.count({ where }),
    ])
    return ok({ list, total, page, pageSize, categories: CATEGORIES })
  })

  // 政策分类
  fastify.get('/categories', async () => ok(CATEGORIES))

  // 政策详情
  fastify.get('/:id', async (request: any, reply) => {
    const { id } = request.params
    const p = await prisma.policy.findUnique({
      where: { id },
      include: { industry: { select: { name: true } } },
    })
    if (!p) return reply.code(404).send({ code: 404, msg: '政策不存在' })

    // 热度 +1
    await prisma.policy.update({ where: { id }, data: { hot: { increment: 1 } } })

    // 匹配企业
    let matched: any[] = []
    if (p.industryId) {
      matched = await prisma.enterprise.findMany({
        where: { industryId: p.industryId },
        take: 10,
        orderBy: { revenue: 'desc' },
        select: { id: true, name: true, scale: true, district: { select: { name: true } } },
      })
    }

    return ok({ ...p, matchedEnterprises: matched })
  })

  // 新建政策（政策同步入库）
  fastify.post('/', async (request: any, reply) => {
    const {
      title, category, level, dept, publishDate, summary,
      target, support, materials,
    } = request.body || {} as any
    if (!title) return reply.code(400).send(fail('请填写政策名称'))

    const cnt = await prisma.policy.count()
    const p = await prisma.policy.create({
      data: {
        id: `POL${String(cnt + 1).padStart(3, '0')}`,
        title,
        category: category || '产业',
        level: level || 'municipal',
        dept: dept || '',
        publishDate: publishDate || new Date().toISOString().slice(0, 10),
        summary: summary || '',
        target: target || '',
        support: support || '',
        materials: materials || '',
        hot: 0,
      },
    })
    return ok(p, '政策已入库')
  })
}
