import { FastifyInstance } from 'fastify'
import { prisma } from '../utils/prisma.js'
import { ok } from '../utils/helper.js'
import { RISK_DIMS } from '../utils/risk.js'

export default async function (fastify: FastifyInstance) {
  // 驾驶舱总览数据
  fastify.get('/overview', async (request: any) => {
    const { districtId } = request.query as any

    const districtFilter = districtId ? { districtId } : {}

    // 企业总数
    const [totalEnt, totalInv, totalTax, totalEmp] = await Promise.all([
      prisma.enterprise.count({ where: districtFilter }),
      prisma.enterprise.aggregate({
        where: districtFilter,
        _sum: { investment: true },
      }),
      prisma.enterprise.aggregate({
        where: districtFilter,
        _sum: { tax: true },
      }),
      prisma.enterprise.aggregate({
        where: districtFilter,
        _sum: { employees: true },
      }),
    ])

    // 风险等级分布
    const riskCounts = await prisma.enterprise.groupBy({
      by: ['riskLevel'],
      where: districtFilter,
      _count: true,
    })
    const riskMap: Record<string, number> = { red: 0, orange: 0, yellow: 0, blue: 0 }
    riskCounts.forEach(r => { riskMap[r.riskLevel] = r._count })

    // 项目数 & 在库
    const [totalProject, keyEnt] = await Promise.all([
      prisma.project.count({ where: districtFilter }),
      prisma.enterprise.count({ where: { ...districtFilter, isKey: true } }),
    ])

    // 风险事件待处理
    const pendingRisk = await prisma.riskEvent.count({
      where: { ...districtFilter, status: { in: ['pending', 'doing'] } },
    })

    return ok({
      totalEnt,
      totalInvestment: totalInv._sum.investment || 0,
      totalTax: totalTax._sum.tax || 0,
      totalEmployees: totalEmp._sum.employees || 0,
      totalProject,
      keyEnterprises: keyEnt,
      pendingRisk,
      riskDistribution: riskMap,
    })
  })

  // 风险维度平均雷达（全平台或指定区县）
  fastify.get('/risk-radar', async (request: any) => {
    const { districtId } = request.query as any
    const where = districtId ? { districtId } : {}
    const ents = await prisma.enterprise.findMany({
      where,
      select: {
        riskOp: true, riskFin: true, riskLegal: true, riskCredit: true,
        riskTender: true, riskTax: true, riskCommit: true, riskIp: true,
      },
    })
    const n = Math.max(1, ents.length)
    const avg = {
      op:     Math.round(ents.reduce((s, e) => s + e.riskOp, 0) / n),
      fin:    Math.round(ents.reduce((s, e) => s + e.riskFin, 0) / n),
      legal:  Math.round(ents.reduce((s, e) => s + e.riskLegal, 0) / n),
      credit: Math.round(ents.reduce((s, e) => s + e.riskCredit, 0) / n),
      tender: Math.round(ents.reduce((s, e) => s + e.riskTender, 0) / n),
      tax:    Math.round(ents.reduce((s, e) => s + e.riskTax, 0) / n),
      commit: Math.round(ents.reduce((s, e) => s + e.riskCommit, 0) / n),
      ip:     Math.round(ents.reduce((s, e) => s + e.riskIp, 0) / n),
      // env 维度暂时用 commit 近似（演示数据）
      env:    Math.round(ents.reduce((s, e) => s + e.riskCommit * 0.6, 0) / n),
    }
    return ok({ dims: RISK_DIMS, avg })
  })

  // 企业风险 TOP
  fastify.get('/top-risk', async (request: any) => {
    const { districtId, limit = 5 } = request.query as any
    const where = districtId ? { districtId } : {}
    const list = await prisma.enterprise.findMany({
      where,
      orderBy: { riskScore: 'desc' },
      take: Number(limit),
      select: {
        id: true, name: true, riskScore: true, riskLevel: true,
        industry: { select: { name: true } },
        district: { select: { name: true } },
      },
    })
    return ok(list)
  })

  // 行业分布饼图
  fastify.get('/industry-dist', async (request: any) => {
    const { districtId } = request.query as any
    const where = districtId ? { districtId } : {}
    const rows = await prisma.enterprise.groupBy({
      by: ['industryId'],
      where,
      _count: true,
      orderBy: { _count: { id: 'desc' } as any },
    })
    const ids = rows.map(r => r.industryId)
    const industries = await prisma.industry.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    })
    const idMap = new Map(industries.map(i => [i.id, i.name]))
    const data = rows.map(r => ({
      name: idMap.get(r.industryId) || r.industryId,
      value: r._count,
    }))
    return ok(data)
  })

  // 各区县企业 & 风险分布
  fastify.get('/district-dist', async () => {
    const districts = await prisma.district.findMany({
      orderBy: { sort: 'asc' },
      include: {
        _count: { select: { enterprises: true, riskEvents: true, projects: true } },
      },
    })
    const list = await Promise.all(districts.map(async d => {
      const riskByLevel = await prisma.enterprise.groupBy({
        by: ['riskLevel'],
        where: { districtId: d.id },
        _count: true,
      })
      const m: Record<string, number> = { red: 0, orange: 0, yellow: 0, blue: 0 }
      riskByLevel.forEach(r => { m[r.riskLevel] = r._count })
      return {
        id: d.id,
        name: d.name,
        enterpriseCount: d._count.enterprises,
        projectCount: d._count.projects,
        riskEventCount: d._count.riskEvents,
        riskDistribution: m,
      }
    }))
    return ok(list)
  })

  // 趋势（近 12 个月：新增企业数、风险事件数、项目数）
  fastify.get('/trend', async (request: any) => {
    const { districtId } = request.query as any
    // 简化：基于 mock 数据生成趋势；演示系统直接返回固定曲线
    const months: string[] = []
    const now = new Date()
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }
    // 生成稳定随机（基于月份字符串）
    const hash = (s: string) => {
      let h = 0
      for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0x7fffffff
      return h
    }
    const newEnt = months.map(m => 5 + (hash(m + districtId) % 18))
    const newProj = months.map(m => 2 + (hash(m + 'p' + districtId) % 8))
    const newRisk = months.map(m => 3 + (hash(m + 'r' + districtId) % 12))
    return ok({ months, newEnterprises: newEnt, newProjects: newProj, newRiskEvents: newRisk })
  })

  // AI 日报（基于当日数据生成摘要）
  fastify.get('/ai-daily', async (request: any) => {
    const { districtId } = request.query as any
    const where = districtId ? { districtId } : {}
    const [totalEnt, newEnt, riskCount, projectCount] = await Promise.all([
      prisma.enterprise.count({ where }),
      prisma.enterprise.count({ where: { ...where, isNew: true } }),
      prisma.riskEvent.count({ where: { ...where, status: { in: ['pending', 'doing'] } } }),
      prisma.project.count({ where }),
    ])
    const today = new Date().toLocaleDateString('zh-CN')
    const summary = [
      `【${today} 招商日报】`,
      `全市在库企业 ${totalEnt} 家，本月新增 ${newEnt} 家；`,
      `在库招商项目 ${projectCount} 个；`,
      `待处理风险预警 ${riskCount} 条，其中高风险需重点关注。`,
      `建议今日优先处理红色 / 橙色预警事项，跟进即将到期的招商项目。`,
    ].join('')
    return ok({
      date: today,
      summary,
      highlights: [
        { type: 'new',    text: `本月新增企业 ${newEnt} 家` },
        { type: 'risk',   text: `待处理风险 ${riskCount} 条` },
        { type: 'project', text: `在库项目 ${projectCount} 个` },
      ],
    })
  })

  // ============ 扩充接口 ============

  // 稳定伪随机（基于种子字符串）
  function seededRand(seed: string) {
    let h = 2166136261
    for (let i = 0; i < seed.length; i++) {
      h ^= seed.charCodeAt(i)
      h = Math.imul(h, 16777619)
    }
    return () => {
      h += 0x6D2B79F5
      let t = h
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }

  // 扩充 KPI：10 个指标 + 环比
  fastify.get('/overview-full', async (request: any) => {
    const { districtId } = request.query as any
    const districtFilter = districtId ? { districtId } : {}

    const [totalEnt, keyEnt, newEnt, newEntYear, riskEnt, totalRev, totalInv, totalEmp, totalTax, muTax] = await Promise.all([
      prisma.enterprise.count({ where: districtFilter }),
      prisma.enterprise.count({ where: { ...districtFilter, isKey: true } }),
      prisma.enterprise.count({ where: { ...districtFilter, isNew: true } }),
      // 本年新增：简化用 isNew * 3 模拟
      Promise.resolve(0),
      prisma.enterprise.count({ where: { ...districtFilter, riskLevel: { in: ['red', 'orange'] } } }),
      prisma.enterprise.aggregate({ where: districtFilter, _sum: { revenue: true } }),
      prisma.enterprise.aggregate({ where: districtFilter, _sum: { investment: true } }),
      prisma.enterprise.aggregate({ where: districtFilter, _sum: { employees: true } }),
      prisma.enterprise.aggregate({ where: districtFilter, _sum: { tax: true } }),
      // 亩均税收 = 总纳税 / 总用地 * 系数
      prisma.enterprise.aggregate({ where: districtFilter, _sum: { landMu: true } }),
    ])

    const totalTaxVal = totalTax._sum.tax || 0
    const totalLand = muTax._sum.landMu || 1
    const muTaxVal = Math.round(totalTaxVal / totalLand * 10) / 10

    // 环比（模拟，基于种子稳定）
    const rand = seededRand('kpi-mom-' + (districtId || 'all'))
    const mom = (base: number, range = 0.15) => Math.round(base * ((rand() - 0.5) * range))

    const kpis = {
      totalEnterprises: { value: totalEnt, mom: mom(totalEnt) },
      keyEnterprises: { value: keyEnt, mom: mom(keyEnt) },
      newThisMonth: { value: newEnt, mom: mom(newEnt) },
      newThisYear: { value: Math.round(newEnt * 8.5), mom: 23 },
      riskEnterprises: { value: riskEnt, mom: mom(riskEnt) },
      totalRevenue: { value: totalRev._sum.revenue || 0, mom: mom(totalRev._sum.revenue || 0) },
      totalInvestment: { value: totalInv._sum.investment || 0, mom: mom(totalInv._sum.investment || 0) },
      totalEmployees: { value: totalEmp._sum.employees || 0, mom: mom(totalEmp._sum.employees || 0) },
      totalTax: { value: totalTaxVal, mom: mom(totalTaxVal) },
      taxPerMu: { value: muTaxVal, mom: Math.round(muTaxVal * (rand() - 0.45) * 0.1 * 10) / 10 },
    }
    return ok(kpis)
  })

  // 年度目标完成度（双环：协议投资 + 到位资金）
  fastify.get('/goal-completion', async (request: any) => {
    const { districtId } = request.query as any
    const rand = seededRand('goal-' + (districtId || 'all'))
    const totalInvestment = 5200000 // 总目标 520 亿（演示值）
    const totalFunds = 2800000     // 到位资金目标 280 亿
    const investmentDone = Math.round(totalInvestment * (0.58 + rand() * 0.15))
    const fundsDone = Math.round(totalFunds * (0.52 + rand() * 0.15))
    const schedule = Math.min(100, Math.round(((new Date().getMonth() + 1) / 12) * 100))
    return ok({
      totalInvestment,
      investmentDone,
      investmentRate: Math.round(investmentDone / totalInvestment * 1000) / 10,
      totalFunds,
      fundsDone,
      fundsRate: Math.round(fundsDone / totalFunds * 1000) / 10,
      schedule,
      investmentDiff: Math.round(investmentDone / totalInvestment * 100 - schedule), // 超/欠百分点
      fundsDiff: Math.round(fundsDone / totalFunds * 100 - schedule),
    })
  })

  // 区县业绩榜（按协议投资排名）
  fastify.get('/district-ranking', async () => {
    const districts = await prisma.district.findMany({
      orderBy: { sort: 'asc' },
      select: { id: true, name: true },
    })
    const list = await Promise.all(districts.map(async d => {
      const projInv = await prisma.project.aggregate({
        where: { districtId: d.id },
        _sum: { investment: true },
      })
      const inv = projInv._sum.investment || 0
      const target = 500000 + Math.floor(seededRand('target-' + d.id)() * 1500000)
      const rate = Math.round(inv / target * 1000) / 10
      const projCount = await prisma.project.count({ where: { districtId: d.id } })
      const entCount = await prisma.enterprise.count({ where: { districtId: d.id } })
      return {
        id: d.id,
        name: d.name,
        investment: inv,
        target,
        completionRate: rate,
        projectCount: projCount,
        enterpriseCount: entCount,
      }
    }))
    list.sort((a, b) => b.investment - a.investment)
    return ok(list)
  })

  // 重大项目 TOP5
  fastify.get('/top-projects', async (request: any) => {
    const { districtId, limit = 5 } = request.query as any
    const where = districtId ? { districtId } : {}
    const list = await prisma.project.findMany({
      where,
      orderBy: { investment: 'desc' },
      take: Number(limit),
      select: {
        id: true, name: true, investment: true, stage: true, stageName: true,
        enterprise: { select: { name: true } },
        district: { select: { name: true } },
        industry: { select: { name: true } },
      },
    })
    return ok(list)
  })

  // 风险处置指标（待处置/处置中/已处置/闭环率）
  fastify.get('/risk-disposal', async (request: any) => {
    const { districtId } = request.query as any
    const where = districtId ? { districtId } : {}
    const [pending, doing, done, total] = await Promise.all([
      prisma.riskEvent.count({ where: { ...where, status: 'pending' } }),
      prisma.riskEvent.count({ where: { ...where, status: 'doing' } }),
      prisma.riskEvent.count({ where: { ...where, status: 'done' } }),
      prisma.riskEvent.count({ where }),
    ])
    return ok({
      pending,
      doing,
      done,
      total,
      closureRate: total > 0 ? Math.round(done / total * 100) : 0,
    })
  })

  // 迷你趋势：近 6 个月预警走势
  fastify.get('/mini-trend', async (request: any) => {
    const { districtId } = request.query as any
    const now = new Date()
    const months: string[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      months.push(`${d.getMonth() + 1}月`)
    }
    const rand = seededRand('mini-trend-' + (districtId || 'all'))
    const red = months.map(() => Math.floor(rand() * 3))
    const orange = months.map(() => Math.floor(3 + rand() * 6))
    const yellow = months.map(() => Math.floor(5 + rand() * 10))
    return ok({ months, red, orange, yellow })
  })

  // 年度趋势（近 5 年）
  fastify.get('/trend-yearly', async (request: any) => {
    const { districtId } = request.query as any
    const now = new Date()
    const years: string[] = []
    for (let i = 4; i >= 0; i--) {
      years.push(String(now.getFullYear() - i))
    }
    const rand = seededRand('yearly-' + (districtId || 'all'))
    const enterprises = years.map((_, i) => 40 + i * 18 + Math.floor(rand() * 15))
    const projects = years.map((_, i) => 10 + i * 5 + Math.floor(rand() * 6))
    const investment = years.map((_, i) => 1200000 + i * 500000 + Math.floor(rand() * 300000))
    const tax = years.map((_, i) => 80000 + i * 25000 + Math.floor(rand() * 20000))
    return ok({ years, enterprises, projects, investment, tax })
  })

  // 今日行动项
  fastify.get('/actions', async (request: any) => {
    const { districtId } = request.query as any
    const where = districtId ? { districtId } : {}
    const [pendingRisk, todayTasks, upcomingProj] = await Promise.all([
      prisma.riskEvent.count({ where: { ...where, status: 'pending', level: { in: ['red', 'orange'] } } }),
      prisma.task.count({ where: { ...where, status: 'pending', dueDate: new Date().toISOString().slice(0, 10) } }),
      prisma.project.count({ where: { ...where, stage: { gte: 2, lte: 4 } } }),
    ])
    return ok([
      { type: 'risk',   text: `${pendingRisk} 条高风险预警待处置`, level: 'high' },
      { type: 'task',   text: `${todayTasks} 个任务今日到期`, level: pendingRisk > 5 ? 'high' : 'normal' },
      { type: 'project', text: `${upcomingProj} 个项目进入关键阶段`, level: 'normal' },
      { type: 'policy', text: '3 项政策申报即将截止', level: 'normal' },
    ])
  })

  // 全省市州对标（模拟数据）
  fastify.get('/province-compare', async () => {
    const cities = [
      '兰州市', '嘉峪关市', '金昌市', '白银市', '天水市', '武威市',
      '张掖市', '平凉市', '酒泉市', '庆阳市', '定西市', '陇南市', '临夏州', '甘南州',
    ]
    const rand = seededRand('province')
    const list = cities.map((name, i) => {
      const inv = Math.floor(200 + rand() * 800) // 亿元
      const rank = 0
      return { name, investment: inv, rank: 0, growth: Math.round((rand() - 0.3) * 30 * 10) / 10 }
    })
    list.sort((a, b) => b.investment - a.investment)
    list.forEach((c, i) => c.rank = i + 1)
    return ok(list)
  })

  // 政策兑现服务
  fastify.get('/policy-cash', async (request: any) => {
    const { districtId } = request.query as any
    const where = districtId ? { districtId } : {}
    const rand = seededRand('policy-cash-' + (districtId || 'all'))
    const totalCash = Math.floor(50000 + rand() * 80000) // 万元
    const cashRate = Math.round(70 + rand() * 20)
    const benefitEnt = Math.floor(30 + rand() * 60)
    // TOP3 进度
    const policies = await prisma.policy.findMany({ take: 3, orderBy: { hot: 'desc' } })
    const top3 = policies.map((p, i) => ({
      id: p.id,
      title: p.title,
      progress: Math.floor(40 + rand() * 50),
      enterpriseCount: Math.floor(5 + rand() * 15),
    }))
    return ok({ totalCash, cashRate, benefitEnt, top3 })
  })

  // 数据来源
  fastify.get('/data-sources', async () => {
    return ok([
      { name: '市场监管局', count: 120, type: 'enterprise' },
      { name: '税务局', count: 115, type: 'tax' },
      { name: '法院', count: 23, type: 'legal' },
      { name: '自然资源局', count: 45, type: 'land' },
      { name: '人社局', count: 98, type: 'labor' },
      { name: '生态环境局', count: 32, type: 'env' },
      { name: '发改委', count: 31, type: 'project' },
      { name: '金融办', count: 28, type: 'finance' },
    ])
  })
}
