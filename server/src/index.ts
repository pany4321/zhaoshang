import fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import fastifyStatic from '@fastify/static'
import { fileURLToPath } from 'url'
import path from 'path'
import { prisma } from './utils/prisma.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = fastify({
  logger: process.env.NODE_ENV !== 'production',
  bodyLimit: 5 * 1024 * 1024,
})

// CORS
await app.register(cors, {
  origin: true,
  credentials: true,
})

// JWT
await app.register(jwt, {
  secret: process.env.JWT_SECRET || 'zhaoshang-demo-secret-2026',
})

// JWT 验证装饰器
app.decorate('authenticate', async (request: any, reply: any) => {
  try {
    await request.jwtVerify()
  } catch (err) {
    reply.code(401).send({ code: 401, msg: '未登录或登录已过期' })
  }
})

// 静态文件 — 前端构建产物
// 在 dev 模式下，前端由 vite 单独启动；部署时将 web/dist 拷到 server/public
const publicDir = path.resolve(__dirname, '../public')
app.register(fastifyStatic, {
  root: publicDir,
  prefix: '/',
  decorateReply: false,
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

app.register(authRoutes,       { prefix: '/api/auth' })
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

// 兜底 SPA（生产环境）
app.setNotFoundHandler(async (request, reply) => {
  // 非 /api 前缀的 GET，返回 index.html（SPA）
  if (request.method === 'GET' && !request.url.startsWith('/api')) {
    return reply.sendFile('index.html')
  }
  reply.code(404).send({ code: 404, msg: 'Not Found' })
})

// 全局错误处理
app.setErrorHandler((error, _request, reply) => {
  console.error('[ERROR]', error.message)
  reply.code(error.statusCode || 500).send({
    code: error.statusCode || 500,
    msg: error.message || '服务器内部错误',
  })
})

const PORT = Number(process.env.PORT) || 3000
const HOST = process.env.HOST || '0.0.0.0'

const start = async () => {
  try {
    await app.listen({ port: PORT, host: HOST })
    console.log(`🚀 招商平台 API 服务已启动: http://${HOST}:${PORT}`)
    console.log(`   数据库: SQLite (./data/demo.db)`)
  } catch (err) {
    console.error(err)
    await prisma.$disconnect()
    process.exit(1)
  }
}

start()
