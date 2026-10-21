/**
 * 每日数据同步（进程内调度）
 *
 * 背景：原先依赖 Hermes cron 的 `0 2 * * *` 任务，但该任务在容器环境下
 * 从未真正执行过（last_run_at 恒为 null）——容器被周期性回收，宿主侧的
 * cron 无法穿透进来。因此把调度搬进服务进程内，与 tunnelGuard /
 * backupScheduler 保持同一套「进程活着就一定会跑」的机制。
 *
 * 语义：只做「检查 fixtures 版本是否变化 → 变化才重新导入」，
 * 不做无条件重建，避免每日覆盖掉业务侧新增的任务/项目/政策数据。
 */

import { prisma } from '../utils/prisma.js'
import { realFixturesStamp, seedDemoData } from '../../prisma/seed-data.js'

const CHECK_INTERVAL_MS = 30 * 60 * 1000 // 每 30 分钟看一次，够日级精度
let timer: NodeJS.Timeout | null = null

/** 读取上次同步记录 */
async function lastSynced(): Promise<{ fixturesGeneratedAt: string | null; syncedAt: string | null }> {
  const cfg = await prisma.systemConfig.findUnique({ where: { key: 'data_sync' } })
  if (!cfg) return { fixturesGeneratedAt: null, syncedAt: null }
  try {
    const v = JSON.parse(cfg.value)
    return { fixturesGeneratedAt: v.fixturesGeneratedAt ?? null, syncedAt: v.syncedAt ?? null }
  } catch {
    return { fixturesGeneratedAt: null, syncedAt: null }
  }
}

export async function runDailySync(reason: 'schedule' | 'manual'): Promise<{ ran: boolean; reason: string; durationMs: number }> {
  const t0 = Date.now()
  const stamp = realFixturesStamp()
  if (!stamp) return { ran: false, reason: '未发现 real-fixtures.json', durationMs: 0 }

  const prev = await lastSynced()

  // 关键：只在 fixtures 版本变化时重建。绝不能因为「超过 24 小时」就重跑 seedDemoData——
  // seedDemoData 会 deleteMany 全部业务表，每日无条件重建会把用户在系统里新建的
  // 任务 / 项目 / 政策 / 风险记录全部清掉（原 Hermes cron 方案没跑过，所以这个坑没暴露）。
  if (prev.fixturesGeneratedAt === stamp) {
    return {
      ran: false,
      reason: `fixtures 未变化（${stamp}），跳过重建以保护业务数据`,
      durationMs: Date.now() - t0,
    }
  }

  console.log(`[dailySync] 数据版本变化（${reason}）：${prev.fixturesGeneratedAt || '(无记录)'} → ${stamp}，开始重建`)
  await seedDemoData(prisma)
  const payload = JSON.stringify({ fixturesGeneratedAt: stamp, syncedAt: new Date().toISOString() })
  await prisma.systemConfig.upsert({
    where: { key: 'data_sync' },
    update: { value: payload },
    create: { key: 'data_sync', value: payload },
  })
  const durationMs = Date.now() - t0
  console.log(`[dailySync] 同步完成，耗时 ${(durationMs / 1000).toFixed(1)}s`)
  return { ran: true, reason: 'ok', durationMs }
}

export function startDailySync() {
  if (timer) return
  const tick = async () => {
    try {
      await runDailySync('schedule')
    } catch (err: any) {
      // 同步失败不能影响主服务，也不能静默——记日志等下一轮
      console.error('[dailySync] 失败:', err?.message || err)
    }
  }
  // 启动后延迟 2 分钟跑第一轮，避开启动同步（syncDataOnBoot）的临界期
  setTimeout(tick, 2 * 60 * 1000).unref?.()
  timer = setInterval(tick, CHECK_INTERVAL_MS)
  timer.unref?.()
  console.log(`[dailySync] 进程内每日同步已启动（检查间隔 ${CHECK_INTERVAL_MS / 60000} 分钟）`)
}
