/* ============================================================
 * MCP HTTP 客户端（MCP Streamable HTTP transport）
 *
 * 直连 doris-pingan MCP，让网页智能体具备数据仓库深度查询能力。
 * 端点与凭据只从环境变量读取（server/.env），不落在代码里。
 *
 * 握手流程（实测必需）：
 *   1. POST initialize            → 响应头返回 Mcp-Session-Id
 *   2. POST notifications/initialized
 *   3. POST tools/call             → 带 Mcp-Session-Id
 * ============================================================ */

const MCP_URL = process.env.MCP_DORIS_URL || ''
const MCP_AUTH = process.env.MCP_DORIS_AUTH || ''
const MCP_TIMEOUT_MS = Number(process.env.MCP_TIMEOUT_MS) || 28000

let sessionId: string | null = null
let initInFlight: Promise<void> | null = null

export function mcpConfigured(): boolean {
  return Boolean(MCP_URL)
}

async function rpc(payload: any, useSession = true): Promise<any> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
  }
  if (MCP_AUTH) headers['Authorization'] = MCP_AUTH
  if (useSession && sessionId) headers['Mcp-Session-Id'] = sessionId

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), MCP_TIMEOUT_MS)
  try {
    const res = await fetch(MCP_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    })
    const sid = res.headers.get('mcp-session-id')
    if (sid) sessionId = sid

    const text = await res.text()
    if (!res.ok) {
      // session 失效时清空，让下次调用重新握手
      if (res.status === 400 || res.status === 404) sessionId = null
      throw new Error(`MCP HTTP ${res.status}: ${text.slice(0, 200)}`)
    }
    // 响应可能是纯 JSON，也可能是 SSE（data: {...}），统一取最后一个 JSON 对象
    const lines = text.split('\n').map(l => l.trim())
    for (let i = lines.length - 1; i >= 0; i--) {
      let line = lines[i]
      if (line.startsWith('data:')) line = line.slice(5).trim()
      if (line.startsWith('{')) {
        try {
          return JSON.parse(line)
        } catch {
          /* 继续找上一条 */
        }
      }
    }
    return {}
  } finally {
    clearTimeout(timer)
  }
}

async function ensureInit(): Promise<void> {
  if (sessionId) return
  if (initInFlight) return initInFlight
  initInFlight = (async () => {
    await rpc(
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'zhaoshang-web', version: '1.0' },
        },
      },
      false
    )
    await rpc({ jsonrpc: '2.0', method: 'notifications/initialized' })
  })()
  try {
    await initInFlight
  } finally {
    initInFlight = null
  }
}

/** 调用 MCP 工具，返回文本内容（失败抛错，由调用方决定降级） */
export async function mcpCallTool(name: string, args: Record<string, any>): Promise<string> {
  if (!MCP_URL) throw new Error('MCP_DORIS_URL 未配置')

  const run = async () => {
    await ensureInit()
    return rpc({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: { name, arguments: args },
    })
  }

  let r: any
  try {
    r = await run()
  } catch (e: any) {
    // 会话过期：重连一次
    sessionId = null
    r = await run()
  }

  if (r?.error) throw new Error(`MCP 错误：${JSON.stringify(r.error).slice(0, 200)}`)
  const content = r?.result?.content || []
  const texts = content.filter((c: any) => c?.type === 'text').map((c: any) => String(c.text || ''))
  if (r?.result?.isError) throw new Error(texts.join('\n').slice(0, 300) || 'MCP 工具执行失败')
  return texts.join('\n')
}
