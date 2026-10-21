/* ============================================================
 * 每日数据备份调度（进程内）
 *
 * 为什么要放在进程内：容器重启后外部 cron 不一定存活，
 * 而 server 每天必然被拉起，随进程调度最稳。
 *
 * 策略：
 *   - 每天 03:00（低峰）执行一次 SQLite 在线备份（VACUUM INTO）
 *   - 默认保留 14 份，超出自动清理
 *   - 备份失败只告警，不影响主服务
 * ============================================================ */
import { spawn } from 'child_process'
import { existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SERVER_DIR = path.resolve(__dirname, '..', '..')
const PROJECT_DIR = path.resolve(SERVER_DIR, '..')
const BACKUP_SCRIPT = path.join(PROJECT_DIR, 'tools', 'backup_db.mjs')

const KEEP = Number(process.env.BACKUP_KEEP) || 14
const HOUR = Number(process.env.BACKUP_HOUR ?? 3) // 每天几点备份，默认 3 点

/** 执行一次备份，返回是否成功 */
function runBackup(): Promise<boolean> {
  return new Promise(resolve => {
    if (!existsSync(BACKUP_SCRIPT)) {
      console.warn(`[backup] 未找到备份脚本：${BACKUP_SCRIPT}`)
      return resolve(false)
    }
    const child = spawn(process.execPath, [BACKUP_SCRIPT, String(KEEP)], {
      cwd: PROJECT_DIR,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let out = ''
    child.stdout.on('data', d => { out += d.toString() })
    child.stderr.on('data', d => { out += d.toString() })
    child.on('close', code => {
      const line = out.split('\n').filter(Boolean).slice(-1)[0] || ''
      if (code === 0) {
        console.log(`[backup] 每日备份完成：${line.trim()}`)
        resolve(true)
      } else {
        console.warn(`[backup] ❌ 备份失败（退出码 ${code}）：${out.trim().slice(0, 300)}`)
        resolve(false)
      }
    })
    child.on('error', err => {
      console.warn(`[backup] ❌ 备份进程启动失败：${err.message}`)
      resolve(false)
    })
  })
}

/** 距下一个 HOUR:00 的毫秒数 */
function msUntilNextRun(): number {
  const now = new Date()
  const next = new Date(now)
  next.setHours(HOUR, 0, 0, 0)
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1)
  return next.getTime() - now.getTime()
}

export function startBackupScheduler() {
  if (process.env.DISABLE_AUTO_BACKUP === '1') {
    console.log('[backup] 自动备份已通过环境变量禁用')
    return
  }

  const delay = msUntilNextRun()
  console.log(
    `[backup] 每日备份已启用：每天 ${String(HOUR).padStart(2, '0')}:00 执行，保留 ${KEEP} 份（首次 ${Math.round(delay / 60000)} 分钟后）`
  )

  const scheduleNext = () => {
    setTimeout(async () => {
      await runBackup()
      scheduleNext() // 递归排下一次，避免 setInterval 累积漂移
    }, msUntilNextRun())
  }
  scheduleNext()
}
