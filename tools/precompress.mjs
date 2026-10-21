#!/usr/bin/env node
/**
 * 构建期静态资源预压缩 —— 为 server/public 下的文本类资源生成 .br / .gz 兄弟文件。
 *
 * 为什么要预压缩而不是运行时动态压缩：
 *   echarts 单文件 1.04MB，brotli 动态压缩一次约 30-80ms CPU；并发首屏请求会把 CPU 打满，
 *   反而拖长首屏。预压缩把这份成本前移到构建期，运行时只是读文件（@fastify/static 的
 *   preCompressed 选项会自动按 Accept-Encoding 返回 .br/.gz）。
 *
 * 用法：node tools/precompress.mjs [目标目录]
 *   默认目标 server/public
 */
import { readdirSync, statSync, readFileSync, writeFileSync, existsSync } from 'fs'
import { join, extname } from 'path'
import { brotliCompressSync, gzipSync, constants } from 'zlib'

const ROOT = process.argv[2] || 'server/public'

// 只压缩文本类资源；图片/字体二进制压缩收益低甚至为负
const COMPRESSIBLE = new Set(['.js', '.mjs', '.css', '.html', '.json', '.svg', '.woff', '.ttf', '.map'])
// 小于此体积不压（HTTP 头开销大于收益）
const MIN_SIZE = 1024

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) walk(full, out)
    else out.push({ full, size: st.size })
  }
  return out
}

function kb(n) { return (n / 1024).toFixed(1) + 'KB' }

if (!existsSync(ROOT)) {
  console.error(`[precompress] 目录不存在: ${ROOT}`)
  process.exit(1)
}

const files = walk(ROOT).filter(f => COMPRESSIBLE.has(extname(f.full)) && f.size >= MIN_SIZE)
let rawTotal = 0, brTotal = 0, gzTotal = 0, count = 0

for (const f of files) {
  const buf = readFileSync(f.full)

  const br = brotliCompressSync(buf, {
    params: {
      [constants.BROTLI_PARAM_QUALITY]: 11,      // 构建期离线压缩，用最高质量
      [constants.BROTLI_PARAM_LGWIN]: 22,
    },
  })
  const gz = gzipSync(buf, { level: 9 })

  // 只在压缩确实有收益时写盘
  if (br.length < buf.length) writeFileSync(f.full + '.br', br)
  if (gz.length < buf.length) writeFileSync(f.full + '.gz', gz)

  rawTotal += buf.length
  brTotal += br.length
  gzTotal += gz.length
  count++
}

const pct = rawTotal > 0 ? ((1 - brTotal / rawTotal) * 100).toFixed(1) : '0'
console.log(`[precompress] ${count} 个文件：原始 ${kb(rawTotal)} → br ${kb(brTotal)}（省 ${pct}%）/ gz ${kb(gzTotal)}`)

// 列出收益最大的 5 个，便于确认优化重点
const ranked = files
  .map(f => ({ name: f.full.replace(ROOT + '/', ''), size: f.size }))
  .sort((a, b) => b.size - a.size)
  .slice(0, 5)
for (const r of ranked) console.log(`  · ${r.name}  ${kb(r.size)}`)
