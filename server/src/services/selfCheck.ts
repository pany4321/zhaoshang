/**
 * 启动自检（P0：可观测性 / 上线前体检）
 *
 * 目的：服务每次启动时把「上线必须成立的前提」逐条验一遍，任何一条不成立
 * 就在日志里明确标红。没有外部告警通道时，这是最低成本的可用性保障——
 * 演示前只要看启动日志就知道系统是否处于可交付状态。
 *
 * 同时暴露 GET /api/system/selfcheck 供人工/脚本拉取，避免每次都去翻日志。
 */

import * as fs from 'fs'
import * as path from 'path'
import { prisma } from '../utils/prisma.js'
import { llmConfigured } from './llm.js'

export interface CheckItem {
  key: string
  label: string
  ok: boolean
  detail: string
  level: 'fatal' | 'warn' | 'info'
}

export interface SelfCheckReport {
  at: string
  ok: boolean
  fatal: number
  warn: number
  items: CheckItem[]
}

let lastReport: SelfCheckReport | null = null

const MIN_ENTERPRISES = 60 // 79 家基线，低于 60 视为数据缺失

export async function runSelfCheck(): Promise<SelfCheckReport> {
  const items: CheckItem[] = []

  // 1. 数据库连通 + 企业数
  try {
    const [entCount, withIndustry, riskCount, taskCount, policyCount, prospectCount] = await Promise.all([
      prisma.enterprise.count(),
      prisma.enterprise.count({ where: { nationalIndustry: { not: null } } }),
      prisma.riskEvent.count(),
      prisma.task.count(),
      prisma.policy.count(),
      prisma.prospectEnterprise.count(),
    ])
    items.push({
      key: 'db_enterprise',
      label: '企业数据',
      ok: entCount >= MIN_ENTERPRISES,
      detail: `${entCount} 家（基线 ≥${MIN_ENTERPRISES}）`,
      level: 'fatal',
    })
    const industryRate = entCount > 0 ? (withIndustry / entCount) * 100 : 0
    items.push({
      key: 'db_national_industry',
      label: '国标行业覆盖',
      ok: industryRate >= 95,
      detail: `${withIndustry}/${entCount} = ${industryRate.toFixed(1)}%（基线 ≥95%）`,
      level: 'warn',
    })
    items.push({
      key: 'db_business',
      label: '业务数据',
      ok: riskCount > 0 && taskCount > 0 && policyCount > 0,
      detail: `风险 ${riskCount} / 任务 ${taskCount} / 政策 ${policyCount}`,
      level: 'fatal',
    })
    items.push({
      key: 'db_prospect',
      label: '招商候选池',
      ok: prospectCount >= 100,
      detail: `${prospectCount} 家真实外部企业（基线 ≥100）`,
      level: 'warn',
    })
  } catch (err: any) {
    items.push({
      key: 'db_conn',
      label: '数据库连通',
      ok: false,
      detail: `连接失败: ${err?.message || err}`,
      level: 'fatal',
    })
  }

  // 2. 大模型配置（AI 按钮能否真实工作）
  const llmOk = llmConfigured()
  items.push({
    key: 'llm_config',
    label: '大模型接入',
    ok: llmOk,
    detail: llmOk ? '已配置（AI 四按钮走真实模型）' : '未配置，AI 功能将降级为规则兜底',
    level: llmOk ? 'info' : 'warn',
  })

  // 3. JWT 密钥（生产必须显式设置）
  const jwtOk = !!process.env.JWT_SECRET
  items.push({
    key: 'jwt_secret',
    label: 'JWT 密钥',
    ok: jwtOk,
    detail: jwtOk ? '已设置' : '未设置（仅允许开发环境）',
    level: jwtOk ? 'info' : 'fatal',
  })

  // 4. 数据备份
  try {
    const backupDir = path.resolve(process.cwd(), 'data/backups')
    const files = fs.existsSync(backupDir)
      ? fs.readdirSync(backupDir).filter((f) => f.endsWith('.db')).sort()
      : []
    const latest = files.length ? files[files.length - 1] : null
    const latestSize = latest ? fs.statSync(path.join(backupDir, latest)).size : 0
    items.push({
      key: 'backup',
      label: '数据备份',
      ok: files.length > 0 && latestSize > 1024,
      detail: files.length
        ? `${files.length} 份，最新 ${latest}（${(latestSize / 1024 / 1024).toFixed(2)}MB）`
        : '尚无备份文件',
      level: 'warn',
    })
  } catch (err: any) {
    items.push({ key: 'backup', label: '数据备份', ok: false, detail: `检查失败: ${err?.message || err}`, level: 'warn' })
  }

  // 5. 前端构建产物（单体部署下 API 活着但静态资源缺失 = 白屏）
  try {
    const indexPath = path.resolve(process.cwd(), 'public/index.html')
    const exists = fs.existsSync(indexPath)
    items.push({
      key: 'static_build',
      label: '前端产物',
      ok: exists,
      detail: exists ? 'public/index.html 就绪' : 'public/index.html 缺失（界面会白屏）',
      level: 'fatal',
    })
  } catch (err: any) {
    items.push({ key: 'static_build', label: '前端产物', ok: false, detail: `检查失败: ${err?.message || err}`, level: 'fatal' })
  }

  const fatal = items.filter((i) => i.level === 'fatal' && !i.ok).length
  const warn = items.filter((i) => i.level === 'warn' && !i.ok).length
  const report: SelfCheckReport = {
    at: new Date().toISOString(),
    ok: fatal === 0,
    fatal,
    warn,
    items,
  }
  lastReport = report
  return report
}

export function getLastReport(): SelfCheckReport | null {
  return lastReport
}

/** 把自检结果打到启动日志（fatal 用 error 级别，便于日志系统抓取） */
export function printSelfCheck(report: SelfCheckReport) {
  console.log('')
  console.log('┌─ 启动自检 ─────────────────────────────────────────')
  for (const it of report.items) {
    const mark = it.ok ? '✓' : it.level === 'fatal' ? '✗' : '!'
    const line = `│ ${mark} ${it.label.padEnd(12, '　')} ${it.detail}`
    if (!it.ok && it.level === 'fatal') console.error(line)
    else if (!it.ok) console.warn(line)
    else console.log(line)
  }
  console.log(`└─ 结论：${report.ok ? '可交付' : `存在 ${report.fatal} 项致命问题`}　告警 ${report.warn} 项 ────`)
  console.log('')
}
