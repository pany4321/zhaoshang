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
