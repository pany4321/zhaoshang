/* ============================================================
 * 审计日志服务
 * 记录关键业务操作与安全事件，满足政务系统操作留痕要求。
 * 原则：审计写入失败不得阻断业务主流程。
 * ============================================================ */
import { prisma } from './prisma.js'

export type AuditAction =
  | 'login' | 'login_fail' | 'logout' | 'change_password'
  | 'dispatch_risk' | 'task_start' | 'task_finish' | 'task_create' | 'task_delete'
  | 'create_enterprise' | 'create_project' | 'project_note' | 'create_policy'
  | 'update_risk_weights' | 'sync_data'

export interface AuditCtx {
  username: string
  ip: string | null
  userAgent: string | null
}

/** 从 Fastify 请求构造审计上下文 */
export function auditCtx(request: any, usernameOverride?: string): AuditCtx {
  const fwd = request?.headers?.['x-forwarded-for']
  const ip = (Array.isArray(fwd) ? fwd[0] : String(fwd || '').split(',')[0].trim())
    || request?.ip
    || request?.socket?.remoteAddress
    || ''
  return {
    username: usernameOverride || request?.user?.username || 'anonymous',
    ip: ip ? String(ip).slice(0, 64) : null,
    userAgent: request?.headers?.['user-agent'] ? String(request.headers['user-agent']).slice(0, 200) : null,
  }
}

/** 写入一条审计记录 */
export async function audit(
  action: AuditAction,
  target: string | null,
  detail: Record<string, any> | null,
  ctx: AuditCtx,
  result: 'success' | 'fail' = 'success'
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        username: ctx.username || 'anonymous',
        action,
        target: target || null,
        detail: detail ? JSON.stringify(detail).slice(0, 4000) : null,
        result,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      },
    })
  } catch (e: any) {
    // 审计失败只记控制台，不阻断业务
    console.error('[audit] 写入失败:', action, e?.message || e)
  }
}
