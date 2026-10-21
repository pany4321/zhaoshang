#!/usr/bin/env node
/* ============================================================
 * SQLite 数据库在线备份
 * 用 VACUUM INTO 生成一致性快照（无需停服，不受写入影响）
 * 保留最近 N 份，自动清理过期备份
 *
 * 用法：node tools/backup_db.mjs [保留份数，默认 14]
 * ============================================================ */
import { createRequire } from 'module'
import { mkdirSync, readdirSync, statSync, unlinkSync, existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT = path.resolve(__dirname, '..')
const SERVER = path.join(PROJECT, 'server')
const BACKUP_DIR = path.join(SERVER, 'data', 'backups')
const KEEP = Number(process.argv[2]) || 14

// 从 server 目录解析依赖（tools/ 下没有 node_modules）
const require = createRequire(path.join(SERVER, 'package.json'))
const { PrismaClient } = require('@prisma/client')

mkdirSync(BACKUP_DIR, { recursive: true })

const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14) // YYYYMMDDHHmmss
const target = path.join(BACKUP_DIR, `demo_${stamp}.db`)

if (existsSync(target)) {
  console.error(`[backup] 目标文件已存在，跳过：${target}`)
  process.exit(1)
}

const prisma = new PrismaClient()
let ok = false
try {
  // VACUUM INTO 生成一致性快照（在线安全）
  await prisma.$executeRawUnsafe(`VACUUM INTO '${target.replace(/'/g, "''")}'`)
  const size = (statSync(target).size / 1024).toFixed(0)
  console.log(`[backup] ✅ 备份完成：${target}（${size} KB）`)
  ok = true
} catch (e) {
  console.error(`[backup] ❌ 备份失败：${e?.message || e}`)
} finally {
  await prisma.$disconnect()
}

if (!ok) process.exit(1)

// 清理旧备份（保留最近 KEEP 份）
const files = readdirSync(BACKUP_DIR)
  .filter(f => /^demo_\d{14}\.db$/.test(f))
  .map(f => ({ f, t: statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
  .sort((a, b) => b.t - a.t)

for (const x of files.slice(KEEP)) {
  try {
    unlinkSync(path.join(BACKUP_DIR, x.f))
    console.log(`[backup] 清理旧备份：${x.f}`)
  } catch (e) {
    console.error(`[backup] 清理失败 ${x.f}: ${e?.message || e}`)
  }
}
console.log(`[backup] 当前保留 ${Math.min(files.length, KEEP)} 份备份于 ${BACKUP_DIR}`)
