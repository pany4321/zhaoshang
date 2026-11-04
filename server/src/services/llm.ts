/* ============================================================
 * 大模型服务层（OpenAI 兼容协议）
 * 端点与凭据通过环境变量注入（server/.env），不落在代码里。
 * 四个招商智能体共用此客户端，各自 system prompt 与数据上下文不同。
 * ============================================================ */

const LLM_BASE_URL = (process.env.LLM_BASE_URL || '').replace(/\/+$/, '')
const LLM_API_KEY = process.env.LLM_API_KEY || ''
const LLM_MODEL = process.env.LLM_MODEL || 'deepseek-v4-flash'
const LLM_TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS) || 60000

export interface ChatMsg {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export function llmConfigured(): boolean {
  return Boolean(LLM_BASE_URL)
}

/** 调用大模型，返回纯文本回复；失败直接抛错，由调用方决定降级策略 */
export async function llmChat(
  messages: ChatMsg[],
  opts: { maxTokens?: number; temperature?: number } = {}
): Promise<string> {
  if (!LLM_BASE_URL) throw new Error('LLM_BASE_URL 未配置')

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), LLM_TIMEOUT_MS)
  try {
    const res = await fetch(`${LLM_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${LLM_API_KEY}`,
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        messages,
        max_tokens: opts.maxTokens ?? 900,
        temperature: opts.temperature ?? 0.55,
        stream: false,
      }),
      signal: ctrl.signal,
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`LLM HTTP ${res.status}: ${body.slice(0, 200)}`)
    }
    const data: any = await res.json()
    const msg = data?.choices?.[0]?.message || {}
    const content = msg?.content

    if (content && typeof content === 'string' && content.trim()) return content.trim()

    // 推理模型（deepseek-v4-flash 等）先产出 reasoning_content、再产出 content。
    // max_tokens 若被推理过程吃光，content 会为空；此时 reasoning 是自然语言思考过程，
    // 不能当答案返回（调用方正则提取 JSON 必然失败），直接报错让上游走降级更安全。
    const used = data?.usage?.completion_tokens
    const reasoningTokens = data?.usage?.completion_tokens_details?.reasoning_tokens
    const finish = data?.choices?.[0]?.finish_reason
    throw new Error(
      `LLM 返回内容为空（finish=${finish}，completion=${used}，reasoning=${reasoningTokens}），通常是 max_tokens 不足`
    )
  } finally {
    clearTimeout(timer)
  }
}

/* -------------------- Tool Calling（OpenAI 兼容 function calling）-------------------- */

export interface ToolDef {
  type: 'function'
  function: { name: string; description: string; parameters: Record<string, any> }
}

/** 一次带工具定义的调用，返回原始 assistant message（可能含 tool_calls） */
export async function llmChatWithTools(
  messages: any[],
  tools: ToolDef[],
  opts: { maxTokens?: number; temperature?: number; timeoutMs?: number } = {}
): Promise<any> {
  if (!LLM_BASE_URL) throw new Error('LLM_BASE_URL 未配置')

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? LLM_TIMEOUT_MS)
  try {
    const res = await fetch(`${LLM_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${LLM_API_KEY}`,
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        messages,
        tools,
        tool_choice: 'auto',
        max_tokens: opts.maxTokens ?? 900,
        temperature: opts.temperature ?? 0.55,
        stream: false,
      }),
      signal: ctrl.signal,
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`LLM HTTP ${res.status}: ${body.slice(0, 200)}`)
    }
    const data: any = await res.json()
    const msg = data?.choices?.[0]?.message
    if (!msg) throw new Error('LLM 返回消息为空')
    return msg
  } finally {
    clearTimeout(timer)
  }
}

/* -------------------- 强制技能协议 -------------------- */

/**
 * 《企业风险溯源报告》技能（enterprise-risk-tracing-report）的运行时协议。
 *
 * 触发条件：企业洞察 / 风险研判两个智能体，只要用户消息里给出了具体企业名称，
 *          就必须按本协议输出，不得退化成几百字的泛泛点评。
 *
 * 落地方式：平台侧无法直接调用外部 skill 运行时，因此把技能方法论固化为可执行协议，
 *          并在 routes/ai.ts 里对命中平台企业库的提问强制注入（不依赖模型自觉）。
 */
/* -------------------- 技能协议：企业详情查询（doris-daas-query 口径） -------------------- */

export const ENTERPRISE_PROFILE_SKILL = [
  '【强制技能 · 企业详情查询（doris-daas-query 口径）】',
  '触发：只要用户提到具体企业（全称、简称、曾用名均算）并要求「基本情况 / 概况 / 详细介绍 / 详细信息 / 档案 / 简介 / 是做什么的 / 规模多大 / 股东是谁 / 财务状况 / 有没有资质」等，本协议优先于上文所有字数与格式要求，必须完整执行。',
  '',
  '一、取数纪律',
  '1. 主体核验优先：以统一社会信用代码为唯一主键，先确认企业全称，避免同名企业混淆；简称、曾用名必须先还原为全称再取数。',
  '2. 取数优先级：平台已注入的主档数据（工商照面 / 股东 / 年报财务 / 司法 / 知产 / 招投标计数）→ doris_query 工具补充查询 → 两者都取不到才写「未获取」或「未公示」。禁止推测，禁止用行业均值或其他企业数据替代该企业事实。',
  '3. 平台主档未覆盖的维度（对外投资、资质证书、行政处罚、经营异常、纳税信用等级、招投标明细、工商变更记录），必须调用 doris_query 补齐；不确定表名或字段名时先调 doris_list_tables / doris_table_schema，不要猜表名。',
  '4. 单位统一：金额「万元」、面积「亩」、人数「人」，并注明报告年度；同一指标有多个年度时列示趋势，不要只挑最好的一年。',
  '',
  '二、必须按六部分输出（缺一节即视为未完成）',
  '第一部分 工商登记信息：企业全称、统一社会信用代码、法定代表人、成立日期、注册资本（含实缴）、企业类型、登记状态、注册地址、经营范围（超长时提炼主营业务，不整段复制）、登记机关、核准日期。',
  '第二部分 股权与治理：股东名称 + 持股比例 + 认缴出资额（合计标注是否 100%，不足或超出如实说明）、实际控制人识别与控制路径（股权分散时说明控制特征）、对外投资（被投企业名称 + 持股比例 + 经营状态）、主要人员（董监高名单）。',
  '第三部分 经营与财务：所属行业（国标门类 / 大类 / 中类）、从业人数（注明是否年报口径）、近三年营业收入、净利润、纳税总额、总资产、研发投入（有则列，无则写未获取），末尾给出「规模判断 + 成长性判断」。',
  '第四部分 司法与信用：司法案件数、被执行人、失信被执行、限制高消费、终本案件、行政处罚、经营异常、严重违法失信名单，并列出关键案件（时间 + 案由 + 涉案金额 + 企业身份：原告/被告/被执行人）。',
  '第五部分 知识产权与资质：专利（发明 / 实用新型 / 外观设计分列）、商标、软件著作权、资质证书、高新技术企业 / 专精特新 / 科技型中小企业等认定情况。',
  '第六部分 综合结论：一句话概括企业定位（做什么、在产业链哪个环节）；三条最值得关注的客观事实（必须带数据）；对招商引进 / 合作评估 / 日常监管的适用建议 2-3 条，每条注明依据。',
  '',
  '三、格式',
  '1. 首行「政信通团队 出品」，次行「数据来源：水滴企信 / 平台主档」。',
  '2. 章节用「第一部分 / 第二部分……」编号，股权结构、财务趋势优先用表格呈现。',
  '3. 本协议输出不受「400 字以内」限制，按六部分完整输出；宁可写「未获取」，也不要为凑篇幅编造。',
  '4. 若平台主档与 Doris 返回不一致，以 Doris（工商登记原始披露）为准，并注明差异。',
].join('\n')

/* -------------------- 技能协议：企业风险溯源报告 -------------------- */

export const RISK_TRACING_SKILL = [
  '【强制技能 · 企业风险溯源报告】',
  '触发：只要用户提到了具体企业（全称、简称、曾用名均算），本协议优先于上文所有格式与字数要求，必须完整执行。',
  '',
  '一、取数纪律',
  '1. 先确认主体：用工具核对全称与统一社会信用代码，避免同名误判；库内查不到时如实说明，不得张冠李戴。',
  '2. 只写工具返回的事实。任一维度取不到数据，写「未获取」或「未公示」，禁止推测、禁止用行业常识替代企业事实。',
  '',
  '二、判定理论：变化即风险',
  '1. 风险 = 对企业经营造成的损害（削弱经营能力、经济损失等）：显性为当期损害，隐性为预期损害。',
  '2. 只有「突变 / 恶化 / 集中 / 新增 / 缺失」五类变化才构成风险；长期稳定的基线事件不算风险。',
  '3. 正向信号不是风险（增资、A 级纳税人、高新技术企业等），只能作为结构特征写入结论，不得用来下调等级。',
  '4. 稳定项不构成风险缓释：专利持续、资本实缴这类「稳定」在终本/限高/欠税并存时不能减轻判定。',
  '',
  '三、必须按六部分输出（缺一节即视为未完成）',
  '第一部分 企业基本信息概述：工商登记要点；实控人识别与控制路径（无实控人须说明股权分散特征）；受益人（姓名+受益比例+身份类型，仅管理控制须注明「无持股受益权」）；稳定性判断（控制持续时长、有无控制权争夺、有无高管被查处）；股权结构表；高管信息。',
  '第二部分 风险清单：按监控清单口径逐类扫描（司法执行/失信/限高/终本/欠税/行政处罚/经营异常/资质/知识产权/招投标/纳税信用等），输出去重后的事件清单，来源统一标注「水滴企信」。',
  '第三部分 分类与评价：逐条定性为「需关注 / 中性 / 正向」。这是事件定性，不是风险结论。',
  '第四部分 风险突变时间线（必含）：按时间轴列关键突变事件，每条标注「年份 | 事件 | 变化识别 | 风险推断」；可按阶段归纳（如 治理突变期 → 信用崩塌期 → 持续恶化期）。',
  '第五部分 风险识别：逐条按 突变/恶化/集中/新增/缺失 判定并说明依据，给出 高风险 / 中高风险 / 中风险 / 低风险 分级。',
  '第六部分 六维风险总结：①公司治理（实控人+受益人+稳定性+股东高管变更频率+股权质押冻结）②企业经营（招投标本体与子公司分工+司法执行+行政处罚+关联传导+关联企业存活率）③企业财务（纳税信用含「A 级纳税人缺失即负面信号」+欠税+注册资本变化+质押冻结重叠+现金流推断）④企业科技投入（科创评分+五维+资质证书+知识产权+缺失含义）⑤政策与行业（行业政策+资质准入+投资组合质量+竞争格局）⑥舆情（整体画像+负面事件+正面信号缺失含义）。末附风险矩阵表与综合判定。',
  '',
  '四、格式',
  '1. 首行「政信通团队 出品」，次行「分析框架：公司治理 / 企业经营 / 企业财务 / 科技投入 / 政策与行业 / 舆情」。',
  '2. 章节用「第一部分/第二部分……」编号，风险突变时间线必须排在分类之后、风险识别之前。',
  '3. 本协议输出不受「400 字以内」限制，按六部分完整输出；宁可写「未获取」，也不要为凑篇幅编造。',
].join('\n')

/* -------------------- 四个智能体的角色设定 -------------------- */

export const AGENT_SYSTEM: Record<string, string> = {
  insight: [
    '你是【产业洞察智能体】，服务于庆阳市招商企业服务与智慧监管平台。',
    '职责：基于平台真实企业数据，分析产业结构、重点企业画像、经济运行趋势，为招商决策提供依据。',
    '要求：',
    '1. 结论先行，用数据说话，引用下方提供的真实统计数据，不要编造数字；',
    '2. 涉及具体企业时点明企业名称，涉及与数据无关的行业常识可合理补充但需标注"行业经验"；',
    '3. 输出用中文，结构清晰（可用简短小标题或序号），单次回复控制在 400 字以内；',
    '4. 不要输出"作为AI"之类的自我说明。',
  ].join('\n'),

  risk: [
    '你是【风险研判智能体】，服务于庆阳市招商企业服务与智慧监管平台。',
    '职责：基于平台八维加权风险模型（经营/财务/司法/信用/招投标/税务/招商履约/知识产权），研判企业风险并给出处置建议。',
    '要求：',
    '1. 严格基于下方提供的企业风险数据作答，不臆造企业的涉诉、财务等具体事实；',
    '2. 风险等级口径：综合分≥65 红色预警、≥45 橙色、≥25 黄色、<25 蓝色；',
    '3. 给出可执行的处置动作（谁在什么时限内做什么）；',
    '4. 输出中文，单次回复控制在 400 字以内。',
  ].join('\n'),

  plan: [
    '你是【招商方案智能体】，服务于庆阳市招商企业服务与智慧监管平台。',
    '职责：结合本地产业基础与企业格局，为目标产业方向定制招商路径、目标企业画像与招商话术。',
    '要求：',
    '1. 方案要贴合庆阳实际（能源化工、新能源、现代农业、数据信息、文旅等产业基础）；',
    '2. 结构建议：目标方向 / 现状基础 / 招引重点 / 招商策略 / 政策配套；',
    '3. 引用下方真实产业数据支撑判断，不编造具体企业名单；',
    '4. 输出中文，单次回复控制在 500 字以内。',
  ].join('\n'),

  service: [
    '你是【企业服务智能体】，服务于庆阳市招商企业服务与智慧监管平台。',
    '职责：为企业提供政策匹配、办事指引、诉求响应等政务服务。',
    '要求：',
    '1. 政策解答要具体（申报条件、支持方式、办理流程），优先引用下方政策库条目；',
    '2. 政策库未覆盖的，可给出一般性指引并提示"具体以主管部门最新口径为准"；',
    '3. 语气亲切专业，输出中文，单次回复控制在 400 字以内。',
  ].join('\n'),
}
