import { FastifyInstance } from 'fastify'
import { prisma } from '../utils/prisma.js'
import bcrypt from 'bcryptjs'
import { ok, fail, sanitizeUser } from '../utils/helper.js'
import { seedDemoData } from '../../prisma/seed-data.js'

// 重置进行中的共享 Promise（并发登录时复用同一次重置，避免数据竞争）
let resetting: Promise<void> | null = null

export default async function (fastify: FastifyInstance) {
  // 登录
  fastify.post('/login', async (request: any, reply) => {
    const { username, password } = request.body || {} as any
    if (!username || !password) {
      return reply.code(400).send(fail('用户名和密码不能为空'))
    }
    const user = await prisma.user.findUnique({ where: { username } })
    if (!user) {
      return reply.code(401).send(fail('用户名或密码错误'))
    }
    const match = bcrypt.compareSync(password, user.password)
    if (!match) {
      return reply.code(401).send(fail('用户名或密码错误'))
    }
    const token = fastify.jwt.sign(
      { sub: user.id, username: user.username, role: user.role },
      { expiresIn: '7d' }
    )
    return ok({ token, user: sanitizeUser(user) }, '登录成功')
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

  // 重置演示数据：清空业务表并按固定种子重新填充，回到干净演示态。
  // 前端在"单击登录按钮"成功后自动调用（等待完成再进入平台）；
  // 需鉴权，并发登录复用同一次重置。
  fastify.post('/reset-demo', { preHandler: [fastify.authenticate] }, async (_request: any, reply) => {
    if (resetting) {
      await resetting
      return ok(null, '演示数据已重置')
    }
    resetting = seedDemoData(prisma)
    try {
      await resetting
    } catch (e: any) {
      return reply.code(500).send(fail('演示数据重置失败：' + (e?.message || e)))
    } finally {
      resetting = null
    }
    return ok(null, '演示数据已重置')
  })
}
