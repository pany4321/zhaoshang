import fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import fastifyStatic from '@fastify/static'
import compress from '@fastify/compress'
import rateLimit from '@fastify/rate-limit'
import { fileURLToPath } from 'url'
import * as fs from 'fs'
import path from 'path'
import { prisma } from './utils/prisma.js'
import { seedDemoData, realFixturesStamp } from '../prisma/seed-data.js'
import { startTunnelGuard, currentPublicUrl } from './services/tunnelGuard.js'
import { startBackupScheduler } from './services/backupScheduler.js'
import { startDailySync } from './services/dailySync.js'
import { runSelfCheck, printSelfCheck, getLastReport } from './services/selfCheck.js'
import { llmConfigured } from './services/llm.js'
import { toolsAvailable } from './services/dorisTools.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = fastify({
  // P0：生产环境不能关日志——关掉后线上出错只剩"白屏/500"，无从排障。
  // 降到 warn 级别（不打印每请求 info），错误与慢请求仍会落日志。
  logger:
    process.env.NODE_ENV === 'production'
      ? { level: process.env.LOG_LEVEL || 'warn' }
      : { level: process.env.LOG_LEVEL || 'info' },
  bodyLimit: 5 * 1024 * 1024,
  // 请求超时：避免慢客户端占住连接（Node 默认无限）
  connectionTimeout: 30_000,
  requestTimeout: 60_000,
})

// CORS —— 单体部署下前后端同源，无需跨域；仅开发模式放开
await app.register(cors, {
  origin: process.env.NODE_ENV === 'production' ? false : true,
  credentials: true,
})

// JWT —— 生产环境必须显式提供密钥，缺失直接拒绝启动（不允许硬编码兜底）
const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET && process.env.NODE_ENV === 'production') {
  console.error('[FATAL] 生产环境未设置 JWT_SECRET，拒绝启动')
  process.exit(1)
}
await app.register(jwt, {
  secret: JWT_SECRET || 'zhaoshang-dev-only-do-not-use-in-production',
})

// JWT 验证装饰器
app.decorate('authenticate', async (request: any, reply: any) => {
  try {
    await request.jwtVerify()
  } catch (err) {
    reply.code(401).send({ code: 401, msg: '未登录或登录已过期' })
  }
})

// ===== 全局鉴权钩子 =====
// 单一收口：所有 /api/* 默认要求登录，仅登录/健康检查/登出放行。
// 避免逐路由挂 preHandler 时的遗漏（原有 31 个接口裸露，公网暴露前必须收口）。
const AUTH_WHITELIST = ['/api/auth/login', '/api/auth/logout', '/api/health']
app.addHook('onRequest', async (request: any, reply: any) => {
  const url = request.url.split('?')[0]
  if (!url.startsWith('/api')) return                       // 静态资源与 SPA 放行
  if (AUTH_WHITELIST.includes(url)) return                  // 白名单放行
  try {
    await request.jwtVerify()
  } catch {
    return reply.code(401).send({ code: 401, msg: '未登录或登录已过期' })
  }
})

// 传输压缩 —— 首屏静态资源 2.6MB + bootstrap 350KB，压缩后约 1/4。
// 静态资源优先返回构建期预压缩的 .br/.gz（见 tools/precompress.mjs），零运行时 CPU 开销；
// API 的 JSON 响应走动态压缩（体积小、命中率高，CPU 可忽略）。
await app.register(compress, {
  global: true,
  threshold: 512,
  encodings: ['br', 'gzip'],
})

// ===== P0：接口限流 =====
// 公网暴露后最大的现实风险不是黑客而是「登录接口被撞库」与「AI 接口被刷」。
// 分两档：登录/改密按 IP 严格限制（5 次/分钟），其余接口宽松（300 次/分钟）。
// 注意：@fastify/rate-limit 必须 v9（依赖 fastify-plugin@^4）——v10 是 Fastify 5 专属，
// 装在 Fastify 4 上会静默失效（与 @fastify/compress v9 是同一个坑）。
await app.register(rateLimit, {
  global: true,
  max: Number(process.env.RATE_LIMIT_MAX) || 300,
  timeWindow: '1 minute',
  allowList: (req: any) => req.url === '/api/health',
  keyGenerator: (req: any) =>
    // 走 Cloudflare 隧道时真实客户端 IP 在 CF-Connecting-IP，直连时用 socket 地址
    (req.headers['cf-connecting-ip'] as string) || req.ip,
  errorResponseBuilder: (_req: any, ctx: any) => ({
    // 必须带 statusCode：否则会被全局 setErrorHandler 当作无状态码异常 → 返回 500
    statusCode: 429,
    code: 429,
    msg: `请求过于频繁，请 ${Math.ceil(ctx.ttl / 1000)} 秒后重试`,
  }),
})

// ===== P0：安全响应头 =====
// 不引入 @fastify/helmet，因为页面大量内联脚本/样式，CSP 直接加上会打白屏；
// 这里只加无副作用的几项。
app.addHook('onSend', async (_request: any, reply: any, payload: any) => {
  reply.header('X-Content-Type-Options', 'nosniff')
  reply.header('X-Frame-Options', 'SAMEORIGIN')
  reply.header('Referrer-Policy', 'strict-origin-when-cross-origin')
  reply.header('X-DNS-Prefetch-Control', 'off')
  // 移除暴露技术栈的响应头
  reply.removeHeader('x-powered-by')
  return payload
})

// ===== P1：请求耗时日志（慢请求告警） =====
// 没有外部 APM，慢接口只能靠日志发现。阈值默认 1000ms，超过打 warn 便于日志系统抓取。
const SLOW_MS = Number(process.env.SLOW_REQUEST_MS) || 1000
app.addHook('onResponse', async (request: any, reply: any) => {
  const ms = Math.round(reply.elapsedTime)
  const line = `${request.method} ${request.url.split('?')[0]} ${reply.statusCode} ${ms}ms`
  if (reply.statusCode >= 500) request.log.error(line)
  else if (ms >= SLOW_MS) request.log.warn(`[SLOW] ${line}`)
  else if (reply.statusCode >= 400) request.log.warn(line)
  else request.log.info(line)
})

// 静态文件 — 前端构建产物
// 生产部署：web/dist/* 拷到 server/public，与 API 同进程同端口（单体部署）
const publicDir = path.resolve(__dirname, '../public')
app.register(fastifyStatic, {
  root: publicDir,
  prefix: '/',
  preCompressed: true,
  // 缓存策略：
  //   /assets/**  文件名带内容 hash，可长期强缓存（1 年 immutable）
  //   其它（/engine/**、index.html）文件名无 hash，必须每次协商校验，
  //   否则改完前端代码用户浏览器会继续用旧 JS（表现为"改了没生效"）
  setHeaders(res, filePath) {
    if (filePath.includes('/assets/')) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    } else {
      res.setHeader('Cache-Control', 'no-cache')
    }
  },
})

// ===== API 路由注册 =====

import authRoutes from './routes/auth.js'
import dashboardRoutes from './routes/dashboard.js'
import enterpriseRoutes from './routes/enterprise.js'
import riskRoutes from './routes/risk.js'
import projectRoutes from './routes/project.js'
import workbenchRoutes from './routes/workbench.js'
import policyRoutes from './routes/policy.js'
import graphRoutes from './routes/graph.js'
import aiRoutes from './routes/ai.js'
import dictRoutes from './routes/dict.js'
import searchRoutes from './routes/search.js'
import bootstrapRoutes from './routes/bootstrap.js'
import configRoutes from './routes/config.js'
import auditRoutes from './routes/audit.js'

app.register(authRoutes,       { prefix: '/api/auth' })
app.register(configRoutes,     { prefix: '/api/config' })
app.register(auditRoutes,      { prefix: '/api/audit' })
app.register(dictRoutes,       { prefix: '/api/dict' })
app.register(bootstrapRoutes,  { prefix: '/api/bootstrap' })
app.register(dashboardRoutes,  { prefix: '/api/dashboard' })
app.register(enterpriseRoutes, { prefix: '/api/enterprise' })
app.register(riskRoutes,       { prefix: '/api/risk' })
app.register(projectRoutes,    { prefix: '/api/project' })
app.register(workbenchRoutes,  { prefix: '/api/workbench' })
app.register(policyRoutes,     { prefix: '/api/policy' })
app.register(graphRoutes,      { prefix: '/api/graph' })
app.register(aiRoutes,         { prefix: '/api/ai' })
app.register(searchRoutes,     { prefix: '/api/search' })

// 健康检查
app.get('/api/health', async () => ({ ok: true, ts: Date.now() }))

// 探针端点（发布验证契约，见技能 local-app-publish §8）：
// 返回各依赖的连通状态，供 verify-site.sh / 外部监控判断「应用真的能用」。
// 字段语义：deps 是可用性，probed 标注该值来自真探(live)还是仅配置(config)。
app.get('/__health', async () => {
  const deps: Record<string, boolean> = {}
  const probed: Record<string, string> = {}

  // 数据库：真探（一次 SELECT 1，成本可接受）
  try {
    await prisma.$queryRaw`SELECT 1`
    deps.db = true
  } catch {
    deps.db = false
  }
  probed.db = 'live'

  // 大模型网关 / 数据仓库 MCP：此处只检查配置是否就位；
  // 真实调用成本高（token / 查询），放到发布验证阶段由 verify-site.sh 单独实证。
  deps.llm = llmConfigured()
  probed.llm = 'config'
  deps.mcp = toolsAvailable()
  probed.mcp = 'config'

  return { ok: deps.db && deps.llm && deps.mcp, deps, probed, ts: Date.now() }
})

// 当前公网访问地址（排查用；需登录）
app.get('/api/system/tunnel', async () => ({
  url: currentPublicUrl(),
  guard: process.env.DISABLE_TUNNEL_GUARD === '1' ? 'disabled' : 'enabled',
}))

// 上线自检报告（需登录）——演示前/交付前用它确认系统处于可交付状态
app.get('/api/system/selfcheck', async (_request, reply) => {
  try {
    const report = await runSelfCheck()
    return report
  } catch (err: any) {
    reply.code(500)
    return { ok: false, msg: '自检执行失败', detail: err?.message || String(err) }
  }
})

// 轻量运行时指标（需登录）：内存、数据库体积、备份数、AI 降级率
app.get('/api/system/metrics', async () => {
  const mem = process.memoryUsage()
  let dbBytes = 0
  try {
    const dbPath = path.resolve(process.cwd(), 'data/demo.db')
    dbBytes = fs.existsSync(dbPath) ? fs.statSync(dbPath).size : 0
  } catch { /* 忽略 */ }
  let backupCount = 0
  try {
    const dir = path.resolve(process.cwd(), 'data/backups')
    backupCount = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.db')).length : 0
  } catch { /* 忽略 */ }
  const [aiTotal, aiDegraded] = await Promise.all([
    prisma.aiAnalysis.count(),
    prisma.aiAnalysis.count({ where: { degraded: true } }),
  ])
  return {
    uptimeSec: Math.round(process.uptime()),
    rssMB: +(mem.rss / 1024 / 1024).toFixed(1),
    heapUsedMB: +(mem.heapUsed / 1024 / 1024).toFixed(1),
    dbMB: +(dbBytes / 1024 / 1024).toFixed(2),
    backupCount,
    ai: { total: aiTotal, degraded: aiDegraded, degradedRate: aiTotal ? +((aiDegraded / aiTotal) * 100).toFixed(1) : 0 },
    selfCheck: getLastReport()?.ok ?? null,
  }
})

// 兜底 SPA（生产环境）
app.setNotFoundHandler(async (request, reply) => {
  // 非 /api 前缀的 GET，返回 index.html（SPA）
  if (request.method === 'GET' && !request.url.startsWith('/api')) {
    return reply.sendFile('index.html')
  }
  reply.code(404).send({ code: 404, msg: 'Not Found' })
})

// 全局错误处理
// P0：500 类错误绝不能把 error.message 原样回传——Prisma/SQLite 的报错会带上
// 表名、字段名、SQL 片段甚至查询参数，等于对外泄漏数据模型。生产环境统一回通用
// 文案 + requestId，真实原因只进服务端日志（用 requestId 关联）。
app.setErrorHandler((error, request, reply) => {
  // 只透传明确的 4xx 语义码；其余（Prisma 异常、内部错误、无状态码对象）一律按 500 处理。
  // 注意：@fastify/rate-limit 的 errorResponseBuilder 返回值也走这里，靠它带的 statusCode 识别。
  const raw = Number((error as any).statusCode) || Number((error as any).code)
  const status = raw >= 400 && raw < 500 ? raw : 500
  const rid = request.id
  const log = request.log as any // Fastify 4 的 FastifyBaseLogger 类型未导出 level 方法，运行时 pino 具备
  if (status >= 500) {
    log.error({ err: error, reqId: rid }, '[500]')
    reply.code(status).send({
      code: status,
      msg: '服务器内部错误，请稍后重试或联系管理员',
      requestId: rid,
    })
    return
  }
  // 4xx 是客户端可自助修正的错误（参数校验、未授权等），保留可读文案
  const clientMsg = (error as any).msg || error.message || '请求有误'
  log.warn({ reqId: rid, msg: clientMsg }, '[4xx]')
  reply.code(status).send({
    code: status,
    msg: clientMsg,
    requestId: rid,
  })
})

const PORT = Number(process.env.PORT) || 5443
const HOST = process.env.HOST || '0.0.0.0'

/**
 * 启动同步：每次服务启动时比对 real-fixtures.json 的生成时间与库中记录，
 * 不一致（或库为空）则重新导入。业务要求：仅在重启与每日定时任务时同步，
 * 不在每次登录时同步。
 */
async function syncDataOnBoot() {
  const stamp = realFixturesStamp()
  if (!stamp) {
    console.log('[sync] 未发现 real-fixtures.json，跳过启动同步（沿用现有数据）')
    return
  }
  const [count, cfg] = await Promise.all([
    prisma.enterprise.count(),
    prisma.systemConfig.findUnique({ where: { key: 'data_sync' } }),
  ])
  let last: string | null = null
  try {
    last = cfg ? (JSON.parse(cfg.value).fixturesGeneratedAt ?? null) : null
  } catch {
    last = null
  }

  if (count > 0 && last === stamp) {
    console.log(`[sync] 数据已是最新（fixtures ${stamp}，${count} 家企业），跳过同步`)
    return
  }

  console.log(`[sync] 数据版本变化：${last || '(无记录)'} → ${stamp}，开始导入真实企业数据...`)
  const t0 = Date.now()
  await seedDemoData(prisma)
  const payload = JSON.stringify({ fixturesGeneratedAt: stamp, syncedAt: new Date().toISOString() })
  await prisma.systemConfig.upsert({
    where: { key: 'data_sync' },
    update: { value: payload },
    create: { key: 'data_sync', value: payload },
  })
  console.log(`[sync] 导入完成，耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s`)
}

const start = async () => {
  try {
    await syncDataOnBoot()
    await app.listen({ port: PORT, host: HOST })
    console.log(`🚀 招商平台 API 服务已启动: http://${HOST}:${PORT}`)
    console.log(`   数据库: SQLite (./data/demo.db)`)
    // 隧道守护：cloudflared 退出时自动拉起（免费隧道易断，见 services/tunnelGuard.ts）
    startTunnelGuard(PORT)
    // 每日数据备份：默认 03:00，保留 14 份（见 services/backupScheduler.ts）
    startBackupScheduler()
    // 每日数据同步（进程内）——原 Hermes cron 在容器环境从未执行过，见 services/dailySync.ts
    startDailySync()
    // 启动自检：把「上线必须成立的前提」逐条验一遍并打日志
    try {
      const report = await runSelfCheck()
      printSelfCheck(report)
    } catch (err: any) {
      console.error('[selfcheck] 自检执行失败:', err?.message || err)
    }
  } catch (err) {
    console.error(err)
    await prisma.$disconnect()
    process.exit(1)
  }
}

// ===== P0：优雅退出 =====
// 容器被回收/重启时会给 SIGTERM。原实现没有处理函数，进程被直接掐断，
// SQLite 的 WAL / 事务可能在半写状态被丢弃（表现为重启后数据比预期少）。
// 这里确保：停止接收新请求 → 等待在途请求 → 关闭数据库 → 退出。
let shuttingDown = false
async function shutdown(signal: string) {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`[shutdown] 收到 ${signal}，开始优雅退出...`)
  const force = setTimeout(() => {
    console.error('[shutdown] 超时 10s，强制退出')
    process.exit(1)
  }, 10_000)
  force.unref?.()
  try {
    await app.close()
    await prisma.$disconnect()
    console.log('[shutdown] 已完成，退出')
    clearTimeout(force)
    // stdout 在容器里是管道，process.exit 会丢未 flush 的日志——给一次 flush 机会
    await new Promise((r) => setTimeout(r, 50))
    process.exit(0)
  } catch (err: any) {
    console.error('[shutdown] 退出异常:', err?.message || err)
    process.exit(1)
  }
}
process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))

// 未捕获异常不能静默退出——记下来再退，否则容器里只剩「服务莫名其妙没了」
process.on('unhandledRejection', (reason: any) => {
  console.error('[unhandledRejection]', reason?.stack || reason)
})
process.on('uncaughtException', (err: any) => {
  console.error('[uncaughtException]', err?.stack || err)
})

start()
