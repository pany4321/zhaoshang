import { FastifyInstance } from 'fastify'

// 统一响应格式
export function ok(data: any = null, msg = 'ok') {
  return { code: 0, msg, data }
}

export function fail(msg: string, code = 1) {
  return { code, msg }
}

// 分页参数解析
export function parsePagination(query: any) {
  const page = Math.max(1, parseInt(query.page) || 1)
  const pageSize = Math.min(200, Math.max(1, parseInt(query.pageSize) || 20))
  return { page, pageSize, skip: (page - 1) * pageSize }
}

// 安全返回用户信息（去掉密码）
export function sanitizeUser(u: any) {
  const { password, ...rest } = u
  return rest
}

export default function register(_fastify: FastifyInstance, _opts: any, done: () => void) {
  done()
}
