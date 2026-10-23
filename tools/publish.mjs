#!/usr/bin/env node
/**
 * 前端产物发布：web/dist → server/public，并生成 .br/.gz 预压缩文件。
 *
 * 为什么必须走脚本而不是手敲 cp：
 *   预压缩文件是首屏体积从 2.2MB 降到 534KB 的关键（见 tools/precompress.mjs），
 *   漏跑一次就等于回到零压缩状态，且不会报错、只表现为「首屏又变慢了」。
 *   收进一条命令，避免流程靠人记。
 *
 * 用法：node tools/publish.mjs
 */
import { execSync } from 'child_process'
import { existsSync, rmSync, mkdirSync, cpSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(ROOT, 'web/dist')
const PUBLIC = join(ROOT, 'server/public')

if (!existsSync(DIST)) {
  console.error('[publish] web/dist 不存在，请先执行 cd web && npm run build')
  process.exit(1)
}

// 1) 清空旧的 public（避免上一版带 hash 的文件残留堆积）
rmSync(PUBLIC, { recursive: true, force: true })
mkdirSync(PUBLIC, { recursive: true })

// 2) 拷贝构建产物
cpSync(DIST, PUBLIC, { recursive: true })
console.log(`[publish] 已发布 ${readdirSync(PUBLIC).length} 个顶层条目 → server/public`)

// 2.5) 纯前端 demo 一并发布到 /demo/ 子路径
//   为什么需要：demo/ 是独立于 Vue 构建的纯前端原型（无构建步骤），但它要能被
//   同一个公网入口访问，否则只能走 GitHub Pages —— 而 Pages 站点不能携带
//   demo/assets/data/real-data.js（含真实企业数据）—— 该文件现已获授权公开并入库，
//   Pages 版同样带真实数据；挂到 ./demo/ 的作用是给部署机一个同域入口，
//   与 Vue 全栈版共用同一条隧道，容器重启后由 restart.sh 一并恢复。
//   .md 是演示手册，不随站点发布。
const DEMO = join(ROOT, 'demo')
if (existsSync(DEMO)) {
  cpSync(DEMO, join(PUBLIC, 'demo'), {
    recursive: true,
    filter: (src) => !src.endsWith('.md'),
  })
  const hasReal = existsSync(join(DEMO, 'assets/data/real-data.js'))
  console.log(`[publish] 已附带纯前端 demo → server/public/demo（访问 /demo/，真实数据集: ${hasReal ? '有' : '无→回落模拟数据'}）`)
}

// 3) 生成预压缩（供 @fastify/static 的 preCompressed 直接命中）
execSync('node tools/precompress.mjs server/public', { cwd: ROOT, stdio: 'inherit' })
