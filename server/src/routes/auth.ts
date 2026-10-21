import { FastifyInstance } from 'fastify'
import { prisma } from '../utils/prisma.js'
import bcrypt from 'bcryptjs'
import { ok, fail, sanitizeUser } from '../utils/helper.js'
import { audit, auditCtx } from '../utils/audit.js'
import { seedDemoData } from '../../prisma/seed-data.js'

// 登录安全策略
const MAX_FAILED_ATTEMPTS = 5      // 连续失败达此次数即锁定
const LOCK_MINUTES = 15            // 锁定时长（分钟）

// 密码复杂度：至少 8 位，且同时包含字母与数字
const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d)[\x20-\x7E]{8,64}$/

// 重置进行中的共享 Promise（并发登录时复用同一次重置，避免数据竞争）
let resetting: Promise<void> | null = null

export default async function (fastify: FastifyInstance) {
  // 登录（含失败计数、账号锁定、审计留痕）
  // P0：登录接口按 IP 单独收紧限流（全局 300/min 对撞库太宽松）。
  // 与账号锁定形成两层：同 IP 连续试错 10 次/分钟被挡，同一账号错 5 次被锁 15 分钟。
  fastify.post('/login', {
    config: {
      rateLimit: {
        max: Number(process.env.LOGIN_RATE_LIMIT_MAX) || 10,
        timeWindow: '1 minute',
      },
    },
  }, async (request: any, reply) => {
    const { username, password } = request.body || {} as any
    if (!username || !password) {
      return reply.code(400).send(fail('用户名和密码不能为空'))
    }
    const ctx = auditCtx(request, String(username))

    const user = await prisma.user.findUnique({ where: { username } })
    if (!user) {
      await audit('login_fail', null, { username, reason: 'user_not_found' }, ctx, 'fail')
      return reply.code(401).send(fail('用户名或密码错误'))
    }

    // 锁定检查
    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      const mins = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000)
      await audit('login_fail', `User:${user.id}`, { reason: 'account_locked', remainMinutes: mins }, ctx, 'fail')
      return reply.code(423).send(fail(`账号已锁定，请 ${mins} 分钟后再试`))
    }

    const match = bcrypt.compareSync(password, user.password)
    if (!match) {
      const attempts = user.failedAttempts + 1
      const shouldLock = attempts >= MAX_FAILED_ATTEMPTS
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedAttempts: attempts,
          lockedUntil: shouldLock ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000) : null,
        },
      })
      await audit('login_fail', `User:${user.id}`,
        { reason: 'bad_password', attempts, locked: shouldLock }, ctx, 'fail')
      return reply.code(401).send(fail(
        shouldLock
          ? `密码错误次数过多，账号已锁定 ${LOCK_MINUTES} 分钟`
          : `用户名或密码错误（还可尝试 ${MAX_FAILED_ATTEMPTS - attempts} 次）`
      ))
    }

    // 登录成功：清零失败计数
    await prisma.user.update({
      where: { id: user.id },
      data: { failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
    })

    const token = fastify.jwt.sign(
      { sub: user.id, username: user.username, role: user.role },
      { expiresIn: '7d' }
    )
    await audit('login', `User:${user.id}`, { role: user.role }, ctx)
    return ok({ token, user: sanitizeUser(user) }, '登录成功')
  })

  // 修改密码（含复杂度校验与审计）
  fastify.post('/change-password', { preHandler: [fastify.authenticate] }, async (request: any, reply) => {
    const { oldPassword, newPassword } = request.body || {} as any
    const ctx = auditCtx(request)

    if (!oldPassword || !newPassword) {
      return reply.code(400).send(fail('原密码与新密码不能为空'))
    }
    if (!PASSWORD_RULE.test(String(newPassword))) {
      return reply.code(400).send(fail('新密码至少 8 位，且需同时包含字母和数字'))
    }
    if (oldPassword === newPassword) {
      return reply.code(400).send(fail('新密码不能与原密码相同'))
    }

    const user = await prisma.user.findUnique({ where: { username: request.user.username } })
    if (!user) return reply.code(404).send(fail('用户不存在'))

    if (!bcrypt.compareSync(String(oldPassword), user.password)) {
      await audit('change_password', `User:${user.id}`, { reason: 'old_password_wrong' }, ctx, 'fail')
      return reply.code(401).send(fail('原密码错误'))
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: bcrypt.hashSync(String(newPassword), 10),
        passwordChangedAt: new Date(),
        failedAttempts: 0,
        lockedUntil: null,
      },
    })
    await audit('change_password', `User:${user.id}`, null, ctx)
    return ok(null, '密码修改成功')
  })

  // 获取当前用户信息
  fastify.get('/me', { preHandler: [fastify.authenticate] }, async (request: any, reply) => {
    const user = await prisma.user.findUnique({
      where: { username: request.user.username },
      include: { district: true },
    })
    if (!user) return reply.code(404).send(fail('用户不存在'))
    return ok(sanitizeUser(user))
  })

  // 登出（前端删 token 即可，这里保留接口）
  fastify.post('/logout', async () => ok(null, '已退出'))

  // 数据初始化（原 reset-demo）：上线版不再清库重置，避免登录即抹掉业务数据。
  // 仅在业务表为空时做一次种子初始化；已有数据直接返回就绪。
  // 保留原接口路径与返回契约，前端 Login.vue 无需改动。
  fastify.post('/reset-demo', { preHandler: [fastify.authenticate] }, async (_request: any, reply) => {
    const count = await prisma.enterprise.count()
    if (count > 0) {
      return ok(null, '数据已就绪')
    }
    if (resetting) {
      await resetting
      return ok(null, '初始化完成')
    }
    resetting = seedDemoData(prisma)
    try {
      await resetting
    } catch (e: any) {
      return reply.code(500).send(fail('数据初始化失败：' + (e?.message || e)))
    } finally {
      resetting = null
    }
    return ok(null, '初始化完成')
  })
}
