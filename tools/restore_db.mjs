#!/usr/bin/env node
/* ============================================================
 * SQLite 数据库恢复
 * 把指定备份（或最新备份）替换回 data/demo.db
 *
 * 用法：
 *   node tools/restore_db.mjs            # 恢复最新一份
 *   node tools/restore_db.mjs latest     # 同上
 *   node tools/restore_db.mjs demo_20261021082613.db
 *   node tools/restore_db.mjs --list     # 只列备份，不恢复
 *
 * 安全设计：
 *   1. 执行前检查 5443 端口是否有服务在跑 —— 有则拒绝，避免写到被占用文件
 *   2. 覆盖前先把当前库另存为 pre_restore_<时间戳>.db，操作可回滚
 * ============================================================ */
import { readdirSync, statSync, copyFileSync, existsSync, mkdirSync } from 'fs'
import { createConnection } from 'net'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT = path.resolve(__dirname, '..')
const SERVER = path.join(PROJECT, 'server')
const DB = path.join(SERVER, 'data', 'demo.db')
const BACKUP_DIR = path.join(SERVER, 'data', 'backups')
const PORT = 5443

function listBackups() {
  if (!existsSync(BACKUP_DIR)) return []
  return readdirSync(BACKUP_DIR)
    .filter(f => f.endsWith('.db'))
    .map(f => ({ name: f, path: path.join(BACKUP_DIR, f), mtime: statSync(path.join(BACKUP_DIR, f)).mtime, size: statSync(path.join(BACKUP_DIR, f)).size }))
    .sort((a, b) => b.mtime - a.mtime)
}

function portInUse(port) {
  return new Promise(resolve => {
    const sock = createConnection({ host: '127.0.0.1', port }, () => { sock.destroy(); resolve(true) })
    sock.on('error', () => resolve(false))
    sock.setTimeout(1500, () => { sock.destroy(); resolve(false) })
  })
}

const arg = process.argv[2]

const backups = listBackups()
if (!backups.length) {
  console.error('[restore] ❌ 备份目录为空，无可恢复文件')
  process.exit(1)
}

if (arg === '--list') {
  console.log(`[restore] 共 ${backups.length} 份备份：`)
  for (const b of backups) {
    console.log(`  ${b.name}  ${(b.size / 1024).toFixed(0)} KB  ${b.mtime.toISOString().replace('T', ' ').slice(0, 19)}`)
  }
  process.exit(0)
}

const target = (!arg || arg === 'latest')
  ? backups[0]
  : backups.find(b => b.name === arg) || backups.find(b => b.name === `${arg}.db`)

if (!target) {
  console.error(`[restore] ❌ 找不到备份：${arg}`)
  console.error('[restore] 可用备份：')
  for (const b of backups) console.error(`  ${b.name}`)
  process.exit(1)
}

const running = await portInUse(PORT)
if (running) {
  console.error(`[restore] ❌ 检测到端口 ${PORT} 有服务在运行，恢复会损坏数据库文件。`)
  console.error('[restore]    请先停止服务：pkill -f "node --env-file=.env dist/index.js"')
  console.error('[restore]    恢复完成后用 bash restart.sh 重新启动。')
  process.exit(1)
}

console.log(`[restore] 目标备份：${target.name}（${(target.size / 1024).toFixed(0)} KB）`)

// 覆盖前先保住当前库，确保可回滚
if (existsSync(DB)) {
  mkdirSync(BACKUP_DIR, { recursive: true })
  const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
  const pre = path.join(BACKUP_DIR, `pre_restore_${ts}.db`)
  copyFileSync(DB, pre)
  console.log(`[restore] 当前库已另存：${path.basename(pre)}`)
}

copyFileSync(target.path, DB)
console.log(`[restore] ✅ 已恢复至 ${DB}`)
console.log('[restore] 下一步：bash restart.sh')
