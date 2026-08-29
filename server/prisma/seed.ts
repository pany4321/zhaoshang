/* ============================================================
 * 招商平台演示数据 seed 脚本（薄壳）
 * 数据生成逻辑在 seed-data.ts（可被服务端重置接口复用）：
 *   import { seedDemoData } from './seed-data.js'
 * ============================================================ */
import { PrismaClient } from '@prisma/client'
import { seedDemoData } from './seed-data.js'

const prisma = new PrismaClient()

seedDemoData(prisma)
  .then(() => {
    console.log('🎉 数据填充完成！')
  })
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
