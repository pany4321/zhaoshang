import '@fastify/jwt'
import type { FastifyInstance } from 'fastify'

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: number; username: string; role: string }
    user: {
      sub: number
      username: string
      role: string
    }
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: any, reply: any) => Promise<void>
  }
}
