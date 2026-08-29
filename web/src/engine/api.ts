import request from '@/utils/request'
import type { BootstrapData } from './adapter'

// 一次性聚合下发（企业/事件/项目/任务/政策/字典）
export function fetchBootstrap() {
  return request.get<any, BootstrapData>('/bootstrap')
}

// 风险事件派发（服务端生成任务并置为在办）
export function dispatchRisk(eventId: string, assignee: string) {
  return request.post(`/risk/${eventId}/dispatch`, { assignee })
}

// 任务操作
export function startTask(id: string | number) {
  return request.post(`/workbench/tasks/${id}/start`)
}
export function finishTask(id: string | number, result?: string) {
  return request.post(`/workbench/tasks/${id}/finish`, { result })
}
export function createTask(d: Record<string, unknown>) {
  return request.post('/workbench/tasks', d)
}

// 企业建档
export function createEnterprise(d: Record<string, unknown>) {
  return request.post('/enterprise', d)
}

// 项目建档 / 阶段备注
export function createProject(d: Record<string, unknown>) {
  return request.post('/project', d)
}
export function saveProjectNote(id: string, note: string) {
  return request.post(`/project/${id}/note`, { note })
}

// 政策入库
export function createPolicy(d: Record<string, unknown>) {
  return request.post('/policy', d)
}

// AI 会话持久化
export function fetchAiHistory(agentType: string) {
  return request.get<any, { messages: any[] }>(`/ai/history/${agentType}`)
}
export function syncAiConversation(agentType: string, messages: any[]) {
  return request.post(`/ai/sync/${agentType}`, { messages })
}
