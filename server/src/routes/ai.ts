import { FastifyInstance } from 'fastify'
import { prisma } from '../utils/prisma.js'
import { ok, fail } from '../utils/helper.js'

// 四个 AI 智能体的预脚本回复（与前端保持一致）
const SCRIPTED_REPLIES: Record<string, Record<string, string>> = {
  insight: {
    '你好': '您好！我是【产业洞察智能体】，可以为您分析产业结构、重点企业画像和经济运行趋势。请问需要查看哪个方面的分析？',
    '产业分析': '当前庆阳市六大重点产业分布情况：\n1. 石油化工：28家，规上占比 35%\n2. 现代农业：32家，规上占比 18%\n3. 数据信息：21家，增速最快（+27%）\n4. 文化旅游：15家，潜力巨大\n5. 装备制造：12家，龙头带动效应显现\n6. 新能源：12家，固投占比高\n\n建议重点关注数据信息和新能源产业的招商力度。',
    '重点企业': '全市重点企业共 25 家，其中：\n- 营收 10亿+：8 家\n- 纳税 5000万+：12 家\n- 上市/拟上市：5 家\n\n西峰区（10 家）、长庆桥园区（5 家）为主要集聚地。需要查看具体名单吗？',
    '趋势': '近 12 个月趋势摘要：\n· 新增企业数逐月增长，月均 +12 家\n· 招商项目转化率提升 8 个百分点\n· 风险预警总量下降 15%，企业经营整体向好\n· 数字经济类项目增长最快，建议加大招引力度',
  },
  risk: {
    '你好': '您好！我是【风险研判智能体】，可以帮助识别企业经营、财务、司法、信用等九大维度的风险。请问您想查询哪家企业或哪个区域的风险情况？',
    '红色预警': '当前全市红色预警企业共 2 家，均集中在：\n1. XX化工有限公司（财务风险 + 司法风险）\n2. XX贸易有限公司（信用风险 + 税务风险）\n\n建议立即启动专项核查，安排专人跟进。需要查看详细处置方案吗？',
    '财务风险': '财务风险高发信号包括：\n· 资产负债率 > 70%\n· 连续两年经营性现金流为负\n· 存货周转天数 > 180 天\n· 应收账款占营收比 > 40%\n\n平台已自动识别 12 家高财务风险企业，可一键导出清单。',
    '建议': '风险防控建议：\n1. 建立红黄蓝三色分级响应机制\n2. 红色预警 24 小时内派单核查\n3. 橙色预警 72 小时内约谈企业\n4. 黄色预警月度跟踪回访\n5. 蓝色关注季度常规巡检',
  },
  plan: {
    '你好': '您好！我是【招商方案智能体】，可以根据目标产业方向，为您定制招商路径、目标企业清单和招商话术。请问您想招引哪个产业方向？',
    '新能源': '【新能源产业招商方案】\n\n一、目标方向：光伏、风电、储能、氢能\n二、重点区域：长三角、珠三角、京津冀\n三、目标企业（示例）：\n   1. 头部新能源制造企业 5 家\n   2. 储能系统集成商 8 家\n   3. 氢能产业链关键企业 3 家\n四、招商策略：产业链招商 + 场景招商 + 基金招商\n五、政策配套：固投补贴 + 电价优惠 + 场景开放\n\n需要生成详细的目标企业名单吗？',
    '数据信息': '【数据信息产业招商方案】\n\n一、目标方向：算力中心、大数据、人工智能、信创\n二、重点区域：北京、上海、深圳、成都、西安\n三、目标企业：头部云厂商、AI 独角兽、信创企业\n四、招商策略：算力资源换产业 + 场景驱动 + 人才政策\n五、落地载体：大数据产业园、数字经济产业园\n\n建议从算力中心项目切入，带动上下游生态企业集聚。',
    '农业': '【现代农业招商方案】\n\n一、目标方向：农产品深加工、智慧农业、预制菜、种业\n二、重点区域：山东、河南、广东、福建\n三、目标企业：国家级农业龙头、预制菜头部品牌\n四、招商策略：资源禀赋招商 + 农业产业链招商\n五、特色优势：庆阳苹果、小杂粮、肉羊等特色农产品资源丰富',
  },
  service: {
    '你好': '您好！我是【企业服务智能体】，可以为企业提供政策匹配、办事指南、诉求响应等服务。请问有什么可以帮您？',
    '政策': '政策匹配流程：\n1. 告知企业所属行业、规模、核心业务\n2. 我将自动匹配国家、省、市、区县四级政策\n3. 生成申报建议清单，包含申报条件、材料、流程\n\n请简单介绍一下企业情况？',
    '补贴': '常见企业可申报补贴类型：\n· 研发费用加计扣除（国家级，按 100% 加计）\n· 高新技术企业认定（所得税减按 15%）\n· 专精特新中小企业奖励（省级 50-200 万）\n· 稳岗返还补贴（失业保险 30%-60% 返还）\n· 工业固投补贴（市级，按固投 3-5% 补助）\n\n具体能否申报需要结合企业实际情况判断。',
    '办事': '企业开办全流程服务：\n1. 工商注册（1 个工作日）\n2. 公章刻制（0.5 个工作日）\n3. 税务登记（即时办结）\n4. 银行开户（1-2 个工作日）\n5. 社保/公积金开户（即时办结）\n\n全程可在线办理，平台提供帮办代办服务。',
  },
}

const DEFAULT_REPLIES: Record<string, string> = {
  insight: '已记录您的查询。我将基于全市产业数据为您分析，请稍候...\n（演示模式：此为模拟智能体回复，真实系统将对接大模型 API）',
  risk: '正在识别相关风险点...\n（演示模式：此为模拟智能体回复，真实系统将对接风险模型和大模型）',
  plan: '正在生成招商方案...\n（演示模式：此为模拟智能体回复，真实系统将对接产业知识图谱）',
  service: '正在为您匹配相关服务...\n（演示模式：此为模拟智能体回复，真实系统将对接政务服务知识库）',
}

function getReply(agent: string, msg: string): string {
  const replies = SCRIPTED_REPLIES[agent] || {}
  // 关键词匹配
  for (const key of Object.keys(replies)) {
    if (msg.includes(key)) return replies[key]
  }
  return DEFAULT_REPLIES[agent] || DEFAULT_REPLIES.service
}

export default async function (fastify: FastifyInstance) {
  // 获取对话历史
  fastify.get('/history/:agentType', { preHandler: [fastify.authenticate] }, async (request: any) => {
    const { agentType } = request.params
    const username = request.user.username
    const conv = await prisma.aiConversation.findFirst({
      where: { agentType, username },
      orderBy: { updatedAt: 'desc' },
    })
    const messages = conv ? JSON.parse(conv.messages) : []
    return ok({ messages, agentType })
  })

  // 发送消息（模拟 AI 回复）
  fastify.post('/chat/:agentType', { preHandler: [fastify.authenticate] }, async (request: any) => {
    const { agentType } = request.params
    const { message } = request.body || {} as any
    const username = request.user.username

    if (!message) return fail('请输入消息内容')

    const aiReply = getReply(agentType, message)

    // 读取或创建会话
    let conv = await prisma.aiConversation.findFirst({
      where: { agentType, username },
      orderBy: { updatedAt: 'desc' },
    })

    const userMsg = { role: 'user', content: message, ts: Date.now() }
    const aiMsg = { role: 'assistant', content: aiReply, ts: Date.now() + 1 }

    if (conv) {
      const arr = JSON.parse(conv.messages)
      arr.push(userMsg, aiMsg)
      conv = await prisma.aiConversation.update({
        where: { id: conv.id },
        data: { messages: JSON.stringify(arr) },
      })
    } else {
      conv = await prisma.aiConversation.create({
        data: {
          agentType,
          username,
          messages: JSON.stringify([
            { role: 'assistant', content: `您好！我是【${agentType}智能体】，请问有什么可以帮您？`, ts: Date.now() },
            userMsg, aiMsg,
          ]),
        },
      })
    }

    return ok({ reply: aiReply, messages: JSON.parse(conv.messages) })
  })

  // 清空对话
  fastify.post('/clear/:agentType', { preHandler: [fastify.authenticate] }, async (request: any) => {
    const { agentType } = request.params
    const username = request.user.username
    await prisma.aiConversation.deleteMany({ where: { agentType, username } })
    return ok(null, '对话已清空')
  })

  // 前端会话整体同步（引擎层本地生成的预脚本对话持久化，供下次登录恢复）
  fastify.post('/sync/:agentType', { preHandler: [fastify.authenticate] }, async (request: any) => {
    const { agentType } = request.params
    const username = request.user.username
    const { messages } = request.body || {} as any
    if (!Array.isArray(messages)) return fail('messages 必须为数组')

    const conv = await prisma.aiConversation.findFirst({
      where: { agentType, username },
      orderBy: { updatedAt: 'desc' },
    })
    if (conv) {
      await prisma.aiConversation.update({
        where: { id: conv.id },
        data: { messages: JSON.stringify(messages) },
      })
    } else {
      await prisma.aiConversation.create({
        data: { agentType, username, messages: JSON.stringify(messages) },
      })
    }
    return ok(null, '会话已同步')
  })
}
