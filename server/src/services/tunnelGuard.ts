/* ============================================================
 * 隧道守护（进程内自愈）
 *
 * 两条运行模式，按优先级自动选择：
 *   1. Named Tunnel（生产）—— 存在 tunnel token 文件时启用，
 *      公网地址固定为 https://<CF_TUNNEL_DOMAIN>，无随机 URL、无丢包。
 *   2. Quick Tunnel（降级）—— 无 token 时回退 trycloudflare，
 *      地址随机且约 20~40% 丢包，仅用于临时调试。
 *
 * 背景：cloudflared 进程一旦退出，公网立即不可达。本模块随 server
 * 启动，定时检查存活，缺失则自动拉起。
 *
 * 设计取舍：
 *   - 放在 server 进程内，不依赖外部 cron
 *   - server 自身崩溃不在本模块职责内（此时需 restart.sh 介入）
 * ============================================================ */
import { execFile, spawn } from 'child_process'
import { promisify } from 'util'
import { existsSync, readFileSync } from 'fs'

const exec = promisify(execFile)

const WS = '/home/pingan/.xiatang/profiles/org21_13701171956/workspace'
const CF_BIN = process.env.CF_BIN || `${WS}/bin/cloudflared`
const CF_LOG = process.env.CF_LOG || `${WS}/cf-named.log`
const CF_URL_FILE = process.env.CF_URL_FILE || `${WS}/current_url.txt`
const TUNNEL_TOKEN_FILE = process.env.CF_TUNNEL_TOKEN_FILE || `${WS}/.cloudflared/tunnel_token`
const TUNNEL_DOMAIN = process.env.CF_TUNNEL_DOMAIN || ''
const CHECK_INTERVAL_MS = Number(process.env.TUNNEL_GUARD_INTERVAL_MS) || 5 * 60 * 1000

/** 是否具备 Named Tunnel 条件 */
function hasNamedTunnel(): boolean {
  return existsSync(TUNNEL_TOKEN_FILE) && !!TUNNEL_DOMAIN
}

/** 当前公网地址（供接口展示 / 排查） */
export function currentPublicUrl(): string | null {
  if (hasNamedTunnel()) return `https://${TUNNEL_DOMAIN}`
  try {
    if (existsSync(CF_LOG)) {
      const txt = readFileSync(CF_LOG, 'utf-8')
      const m = txt.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/g)
      if (m && m.length) return m[m.length - 1]
    }
    if (existsSync(CF_URL_FILE)) {
      return readFileSync(CF_URL_FILE, 'utf-8').trim() || null
    }
  } catch { /* 忽略读取异常 */ }
  return null
}

/** 当前模式标识，供 /api/system/tunnel 返回 */
export function tunnelMode(): 'named' | 'quick' {
  return hasNamedTunnel() ? 'named' : 'quick'
}

async function cloudflaredAlive(): Promise<boolean> {
  try {
    // -x 精确匹配进程名，避免 pgrep -f 误匹配到包含该字符串的 shell
    const { stdout } = await exec('pgrep', ['-xc', 'cloudflared'], { timeout: 5000 })
    return parseInt(String(stdout).trim() || '0', 10) > 0
  } catch {
    return false // pgrep 无匹配时返回退出码 1
  }
}

async function ensureTunnel(port: number) {
  if (await cloudflaredAlive()) return false

  if (!existsSync(CF_BIN)) {
    console.warn(`[guard] 未找到 cloudflared 可执行文件：${CF_BIN}，跳过自动拉起`)
    return false
  }

  const named = hasNamedTunnel()
  const args = named
    ? ['tunnel', '--no-autoupdate', '--logfile', CF_LOG, 'run', '--token-file', TUNNEL_TOKEN_FILE]
    : ['tunnel', '--url', `http://127.0.0.1:${port}`, '--protocol', 'http2',
       '--no-autoupdate', '--logfile', CF_LOG]

  console.log(`[guard] cloudflared 未运行，按 ${named ? 'Named' : 'Quick'} 模式自动拉起…`)
  const child = spawn(CF_BIN, args, { detached: true, stdio: 'ignore' })
  child.unref()
  console.log(`[guard] 已拉起 cloudflared，PID ${child.pid}`)
  return true
}

export function startTunnelGuard(port: number, intervalMs = CHECK_INTERVAL_MS) {
  if (process.env.DISABLE_TUNNEL_GUARD === '1') {
    console.log('[guard] 隧道守护已通过环境变量禁用')
    return
  }
  // 启动 30 秒后做首次检查（等 server 自身就绪），之后按间隔轮询
  setTimeout(() => { ensureTunnel(port).catch(e => console.warn('[guard]', e?.message)) }, 30_000)
  setInterval(() => { ensureTunnel(port).catch(e => console.warn('[guard]', e?.message)) }, intervalMs)
  console.log(
    `[guard] 隧道守护已启用：${hasNamedTunnel() ? `Named Tunnel（${TUNNEL_DOMAIN}）` : 'Quick Tunnel（临时地址）'}，每 ${Math.round(intervalMs / 60000)} 分钟检查一次`
  )
}
