import { FastifyInstance } from 'fastify'
import { prisma } from '../utils/prisma.js'
import { ok, parsePagination, fail } from '../utils/helper.js'
import { RISK_DIMS } from '../utils/risk.js'

export default async function (fastify: FastifyInstance) {
  // 企业列表 + 筛选 + 分页 + 排序
  fastify.get('/', async (request: any) => {
    const { page, pageSize, skip } = parsePagination(request.query)
    const {
      keyword, districtId, industryId, riskLevel, scale,
      creditStatus, bizStatus, isKey, isNew,
      sortBy = 'riskScore', sortOrder = 'desc',
    } = request.query as any

    const where: any = {}
    if (keyword) where.name = { contains: keyword }
    if (districtId) where.districtId = districtId
    if (industryId) where.industryId = industryId
    if (riskLevel) where.riskLevel = riskLevel
    if (scale) where.scale = scale
    if (creditStatus) where.creditStatus = creditStatus
    if (bizStatus) where.bizStatus = bizStatus
    if (isKey === 'true' || isKey === '1') where.isKey = true
    if (isNew === 'true' || isNew === '1') where.isNew = true

    const orderBy: any = {}
    const validSort = ['name', 'riskScore', 'revenue', 'tax', 'employees', 'found', 'regCapital']
    if (validSort.includes(sortBy)) {
      orderBy[sortBy] = sortOrder === 'asc' ? 'asc' : 'desc'
    } else {
      orderBy.riskScore = 'desc'
    }

    const [list, total] = await Promise.all([
      prisma.enterprise.findMany({
        where,
        skip,
        take: pageSize,
        orderBy,
        include: {
          district: { select: { id: true, name: true } },
          industry: { select: { id: true, name: true } },
        },
      }),
      prisma.enterprise.count({ where }),
    ])

    return ok({ list, total, page, pageSize })
  })

  // 企业详情（360 画像基础信息）
  fastify.get('/:id', async (request: any, reply) => {
    const { id } = request.params
    const ent = await prisma.enterprise.findUnique({
      where: { id },
      include: {
        district: true,
        industry: true,
        shareholders: { orderBy: { sort: 'asc' } },
        riskEvents: {
          orderBy: { foundDate: 'desc' },
          take: 10,
        },
      },
    })
    if (!ent) return reply.code(404).send({ code: 404, msg: '企业不存在' })
    return ok(ent)
  })

  // 企业风险雷达（单个企业）
  fastify.get('/:id/risk-radar', async (request: any, reply) => {
    const { id } = request.params
    const ent = await prisma.enterprise.findUnique({
      where: { id },
      select: {
        riskOp: true, riskFin: true, riskLegal: true, riskCredit: true,
        riskTender: true, riskTax: true, riskCommit: true, riskIp: true,
        riskScore: true, riskLevel: true,
      },
    })
    if (!ent) return reply.code(404).send({ code: 404, msg: '企业不存在' })
    const scores = {
      op: ent.riskOp, fin: ent.riskFin, legal: ent.riskLegal,
      credit: ent.riskCredit, tender: ent.riskTender, tax: ent.riskTax,
      commit: ent.riskCommit, ip: ent.riskIp, env: Math.round(ent.riskCommit * 0.6),
    }
    return ok({ dims: RISK_DIMS, scores, riskScore: ent.riskScore, riskLevel: ent.riskLevel })
  })

  // 企业风险事件列表
  fastify.get('/:id/risk-events', async (request: any) => {
    const { id } = request.params
    const { page, pageSize, skip } = parsePagination(request.query)
    const where = { enterpriseId: id }
    const [list, total] = await Promise.all([
      prisma.riskEvent.findMany({
        where,
        skip, take: pageSize,
        orderBy: { foundDate: 'desc' },
      }),
      prisma.riskEvent.count({ where }),
    ])
    return ok({ list, total, page, pageSize })
  })

  // 企业匹配政策
  fastify.get('/:id/policies', async (request: any) => {
    const { id } = request.params
    const ent = await prisma.enterprise.findUnique({ where: { id } })
    if (!ent) return ok({ list: [] })
    // 按行业 + 规模 简单匹配
    const list = await prisma.policy.findMany({
      where: {
        OR: [
          { industryId: ent.industryId },
          { target: { contains: ent.scale } },
        ],
      },
      take: 10,
      orderBy: { hot: 'desc' },
    })
    return ok({ list, total: list.length })
  })

  // 企业项目
  fastify.get('/:id/project', async (request: any) => {
    const { id } = request.params
    const project = await prisma.project.findFirst({
      where: { enterpriseId: id },
      include: { district: true, industry: true, tasks: true },
    })
    return ok(project)
  })

  // AI 综合研判（生成文本）
  fastify.get('/:id/ai-analysis', async (request: any, reply) => {
    const { id } = request.params
    const ent = await prisma.enterprise.findUnique({
      where: { id },
      include: { district: true, industry: true },
    })
    if (!ent) return reply.code(404).send({ code: 404, msg: '企业不存在' })

    const levelText: Record<string, string> = {
      red: '高风险企业', orange: '中高风险企业',
      yellow: '中低风险企业', blue: '低风险企业',
    }
    const dimScores = [
      ['经营风险', ent.riskOp], ['财务风险', ent.riskFin], ['司法风险', ent.riskLegal],
      ['信用风险', ent.riskCredit], ['税务风险', ent.riskTax],
      ['招商履约风险', ent.riskCommit],
    ] as [string, number][]
    dimScores.sort((a, b) => b[1] - a[1])
    const top3 = dimScores.slice(0, 3)

    const analysis = [
      `【AI 综合研判报告 — ${ent.name}】`,
      ``,
      `一、企业概况`,
      `  ${ent.name}（统一社会信用代码：${ent.creditCode}），`,
      `  成立于 ${ent.found}，法定代表人 ${ent.legal}，注册资本 ${ent.regCapital}，`,
      `  位于 ${ent.district.name}，属于 ${ent.industry.name} 行业，企业规模：${ent.scale}。`,
      ``,
      `二、风险综合评估`,
      `  综合风险得分 ${ent.riskScore} 分，属于【${levelText[ent.riskLevel]}】。`,
      `  三大主要风险维度：`,
      ...top3.map(([n, v]) => `    · ${n}：${v} 分`),
      ``,
      `三、经营与履约`,
      `  年营收 ${ent.revenue} 万元，年纳税 ${ent.tax} 万元，`,
      `  固定资产投资 ${ent.investment} 万元，员工 ${ent.employees} 人，`,
      `  履约率 ${ent.performRate}%，整体经营状况${ent.performRate >= 90 ? '良好' : '需关注'}。`,
      ``,
      `四、监管建议`,
      `  1. 建立常态化走访机制，重点关注${top3[0][0]}；`,
      `  2. 匹配相关惠企政策，协助企业纾困解难；`,
      `  3. 督促企业按承诺推进投资进度，确保达产达效。`,
    ].join('\n')

    return ok({ analysis, riskScore: ent.riskScore, riskLevel: ent.riskLevel })
  })

  // 经营画像：近 12 个月经营数据趋势（营收/纳税/员工）
  fastify.get('/:id/business-trend', async (request: any, reply) => {
    const { id } = request.params
    const ent = await prisma.enterprise.findUnique({ where: { id } })
    if (!ent) return reply.code(404).send({ code: 404, msg: '企业不存在' })

    // 基于企业ID生成稳定随机
    let h = 2166136261
    const seedStr = 'biz-' + id
    for (let i = 0; i < seedStr.length; i++) {
      h ^= seedStr.charCodeAt(i)
      h = Math.imul(h, 16777619)
    }
    const rand = () => {
      h += 0x6D2B79F5
      let t = h
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }

    const now = new Date()
    const months: string[] = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }

    const monthlyBase = ent.revenue / 12
    const revenue = months.map(() => Math.round(monthlyBase * (0.8 + rand() * 0.4)))
    const tax = revenue.map(r => Math.round(r * (0.08 + rand() * 0.07)))
    const employees = months.map(() => Math.round(ent.employees * (0.9 + rand() * 0.2)))

    return ok({ months, revenue, tax, employees, yearlyRevenue: ent.revenue, yearlyTax: ent.tax, yearlyEmployees: ent.employees })
  })

  // 企业侧边栏列表（画像页快速切换用）
  fastify.get('/sidebar/list', async (request: any) => {
    const { page = 1, pageSize = 30, keyword, districtId, industryId, riskLevel, sortBy = 'riskScore', sortOrder = 'desc' } = request.query as any
    const where: any = {}
    if (keyword) where.name = { contains: keyword }
    if (districtId) where.districtId = districtId
    if (industryId) where.industryId = industryId
    if (riskLevel) where.riskLevel = riskLevel

    const orderBy: any = {}
    const validSort = ['name', 'riskScore', 'revenue', 'tax']
    if (validSort.includes(sortBy)) orderBy[sortBy] = sortOrder
    else orderBy.riskScore = 'desc'

    const n = Math.min(Number(pageSize), 100)
    const list = await prisma.enterprise.findMany({
      where,
      take: n,
      skip: (Number(page) - 1) * n,
      orderBy,
      select: {
        id: true, name: true, riskLevel: true, riskScore: true,
        industry: { select: { name: true } },
      },
    })
    const total = await prisma.enterprise.count({ where })
    return ok({ list, total })
  })

  // 新建企业（招商新引进，风险/指标从零开始）
  fastify.post('/', { preHandler: [fastify.authenticate] }, async (request: any, reply) => {
    const { name, districtId, industryId, investment = 0 } = request.body || {} as any
    if (!name || !districtId || !industryId) {
      return reply.code(400).send(fail('请填写企业名称、区县与行业'))
    }
    const dup = await prisma.enterprise.findUnique({ where: { creditCode: `NEW-${name}` } })
      .catch(() => null)
    if (dup) return reply.code(400).send(fail('企业已存在'))

    const cnt = await prisma.enterprise.count()
    const ent = await prisma.enterprise.create({
      data: {
        id: `E${String(cnt + 1).padStart(3, '0')}`,
        name,
        creditCode: `NEW-${name}`,
        legal: '待补充',
        found: new Date().toISOString().slice(0, 10),
        scale: '小型企业',
        bizStatus: '在营',
        creditStatus: '良好',
        regCapital: `${Math.round(investment)}万元`,
        districtId,
        industryId,
        isNew: true,
        newDate: new Date().toISOString().slice(0, 10),
        investment: Math.round(investment),
      },
      include: {
        district: true,
        industry: true,
        shareholders: { orderBy: { sort: 'asc' } },
      },
    })
    return ok(ent, '企业已建档')
  })
}
