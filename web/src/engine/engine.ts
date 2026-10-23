// ============================================================
// demo 引擎装载器：按 demo 的加载顺序注入脚本 → 拉取服务器数据重建 MOCK
// → 接管 Vue Router 与引擎之间的导航桥 → 提供工作流动作的服务端同步。
// 引擎文件全部位于 /engine（public 目录，浏览器直接加载，不经打包）。
// ============================================================
import { ref } from 'vue'
import { fetchBootstrap, dispatchRisk, startTask, finishTask, createTask, createEnterprise, createProject, saveProjectNote, createPolicy, fetchAiHistory, syncAiConversation, updateRiskWeights } from './api'
import { mapBootstrap } from './adapter'

declare global {
  interface Window {
    MOCK: any
    MOCK_ENGINE: any
    APP: any
    PDF_FONT_ZH: string
    jspdf: any
  }
}

// 脚本加载批次：批次边界由依赖关系决定，批内并行、批间串行。
// 原实现 18 个脚本逐个 await，公网 RTT 约 200ms 时仅网络等待就 3.6s；分 4 批后降到约 0.8s。
// 依赖依据（已逐文件核对）：
//   · mock.js 只挂 window.MOCK，不读其它模块
//   · utils.js / state.js 用 `window.APP = window.APP || {}` 幂等写法，顶层不读 MOCK
//   · components.js 顶层读 APP.state → 必须等批 1
//   · 页面渲染器顶层读公共模块，彼此靠 APP.registerRenderer 自注册、互不依赖
//   · app-core 需全部页面注册完毕
const SCRIPT_BATCHES: string[][] = [
  // 批 1：数据层 + 工具 + 状态，三者顶层互不依赖，可并行
  ['/engine/mock.js', '/engine/utils.js', '/engine/state.js'],
  // 批 2：公共组件，顶层依赖 APP.state
  ['/engine/components.js'],
  // 批 3：9 个页面渲染器，各自 APP.registerRenderer 自注册，互不依赖
  [
    '/engine/pages/dashboard.js',
    '/engine/pages/enterprise.js',
    '/engine/pages/profile.js',
    '/engine/pages/risk.js',
    '/engine/pages/graph.js',
    '/engine/pages/workbench.js',
    '/engine/pages/project.js',
    '/engine/pages/policy.js',
    '/engine/pages/aidemo.js',
  ],
  // 批 4：应用核心，需页面全部注册完毕
  ['/engine/app-core.js'],
]

// —— PDF 导出依赖：按需加载，不进首屏关键路径 ——
// jspdf(364KB) + autotable(39KB) + 中文字体子集(410KB) 合计约 813KB，
// 首屏与 8 个页面都不使用，只有画像页点「导出报告」才需要。
// 原先在引导阶段加载，等于白占 31% 首屏流量和 3 次 RTT。
let pdfLibPromise: Promise<void> | null = null
export function ensurePdfLibs(): Promise<void> {
  if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve()
  if (pdfLibPromise) return pdfLibPromise
  pdfLibPromise = (async () => {
    // autotable 必须挂在 jspdf 之后，否则注册不到 jsPDF 原型
    await loadScript('/engine/vendor/jspdf.umd.min.js')
    await loadScript('/engine/vendor/jspdf.plugin.autotable.min.js')
    // 字体缺失不阻断（导出时会降级为打印视图），故单独吞掉错误
    await loadScript('/fonts/pdf-font-zh.js').catch(() => {})
    if (!window.jspdf || !window.jspdf.jsPDF) throw new Error('jsPDF 初始化失败')
  })().catch((e) => {
    pdfLibPromise = null   // 失败不粘住，下次导出可重试
    throw e
  })
  return pdfLibPromise
}

export async function loadEngineScripts() {
  if (window.APP && window.MOCK) return
  for (const batch of SCRIPT_BATCHES) {
    await Promise.all(batch.map((src) => loadScript(src)))
  }
}

export const PAGE_KEYS = [
  'dashboard', 'enterprise', 'profile', 'risk',
  'graph', 'workbench', 'project', 'policy', 'aidemo',
]

// 引擎脚本版本号：每次改动 demo/web 前端引擎后递增，
// 用于给脚本 URL 加 ?v=xxx 强制浏览器与 CDN 重新取（Cloudflare 的
// Browser Cache TTL 会覆盖源站 Cache-Control，改头无效，只能改 URL）
const ENGINE_VER = '20261023b'

function withVer(src: string): string {
  return src + (src.indexOf('?') >= 0 ? '&' : '?') + 'v=' + ENGINE_VER
}

function loadScript(src: string, retries = 2): Promise<void> {
  return new Promise((resolve, reject) => {
    const attempt = (left: number) => {
      const s = document.createElement('script')
      s.src = withVer(src)
      s.onload = () => resolve()
      s.onerror = () => {
        // 移除失败的标签，避免残留；公网/弱网环境下单次抖动不应导致整页卡死
        s.remove()
        if (left > 0) {
          setTimeout(() => attempt(left - 1), 250)
        } else {
          reject(new Error('引擎脚本加载失败: ' + src))
        }
      }
      document.head.appendChild(s)
    }
    attempt(retries)
  })
}

// —— 用户上下文（由 Vue 壳注入，供后端同步接口使用） ——
let currentUser: { username: string; name: string; role: string } | null = null
export function setEngineUser(u: { username: string; name: string; role: string } | null) {
  currentUser = u
}

// AI 会话同步（每个智能体独立防抖）
const aiSyncTimers: Record<string, ReturnType<typeof setTimeout>> = {}
function queueAiSync(agent: string, msgs: any[]) {
  clearTimeout(aiSyncTimers[agent])
  aiSyncTimers[agent] = setTimeout(() => {
    syncAiConversation(agent, msgs).catch(() => {})
  }, 800)
}

// —— 工作流动作的服务端同步（尽力而为，不阻断本地演示闭环） ——
function installSync() {
  const APP = window.APP
  // 供引擎（profile.js 的导出报告）按需拉取 813KB 的 PDF 依赖
  APP.ensurePdfLibs = ensurePdfLibs
  APP.sync = {
    dispatch(ev: any) {
      dispatchRisk(ev.id, currentUser?.username || 'admin').catch(() => {})
    },
    taskDone(t: any) {
      if (t && t._sid != null) finishTask(t._sid, t.processNote || '已完成').catch(() => {})
    },
    taskStarted(t: any) {
      if (t && t._sid != null) startTask(t._sid).catch(() => {})
    },
    taskCreated(t: any) {
      createTask({
        title: t.title,
        type: ({ 风险处置: 'risk', 项目跟进: 'project', 企业服务: 'service', 政策推送: 'policy', 日常巡检: 'patrol' } as Record<string, string>)[t.type] || 'service',
        priority: ({ 高: 'high', 中: 'normal', 低: 'low' } as Record<string, string>)[t.priority] || 'normal',
        dueDate: t.due,
        description: null,
        enterpriseId: t.enterprise || null,
        projectId: null,
        assignee: currentUser?.username || 'admin',
        source: t.source || '手动创建',
      }).catch(() => {})
    },
    enterpriseCreated(ent: any, d: any) {
      createEnterprise({
        name: ent.name,
        // 空字符串 → null：外省招商线索落地前无庆阳辖区，不得顶替为某个区县
        districtId: d.district || null,
        industryId: d.industry || null,
        investment: Math.round(d.amountWan || 0),
        // 真实工商注册资本（万元）；未提供时后端退回投资额
        regCapital: d.regCapitalWan || undefined,
      }).catch(() => {})
    },
    projectCreated(p: any, d: any) {
      createProject({
        name: p.name,
        enterpriseId: p.enterprise,
        investment: p.amountWan,
        districtId: p.district || null,
        industryId: d.industry || null,
        org: p.owner,
        contact: p.contact,
        note: d.note || '',
      }).catch(() => {})
    },
    projectNote(p: any, note: string) {
      if (p && p._sid) saveProjectNote(p._sid, note).catch(() => {})
    },
    policyCreated(p: any) {
      createPolicy({
        title: p.name,
        category: ({ 税收: '财税', 人才: '人才', 要素: '用地' } as Record<string, string>)[p.type] || '产业',
        level: ({ 国家级: 'national', 省级: 'provincial', 市级: 'municipal' } as Record<string, string>)[p.level] || 'municipal',
        dept: p.dept,
        publishDate: p.date,
        summary: p.apply,
        support: p.support || '',
        materials: (p.materials || '').replace(/<br\/>/g, '\n'),
      }).catch(() => {})
    },
    aiConversation(agent: string, msgs: any[]) {
      queueAiSync(agent, msgs)
    },
    riskWeightsUpdated(weights: { key: string; name: string; weight: number }[]) {
      updateRiskWeights(weights).catch(() => {})
    },
  }
}

// —— Vue Router 桥：导航互同步（带防环比较） ——
export function wireRouterBridge(router: any) {
  const APP = window.APP
  APP.navigate = (page: string) => {
    const target = '/' + page
    if (router.currentRoute.value.path !== target) router.push(target)
  }
  APP.onRouteRendered = (page: string) => {
    const target = '/' + page
    if (router.currentRoute.value.path !== target) router.push(target)
  }
}

// 引擎侧响应路由变化（由 EngineHost 的 watcher 调用）
export function setPageFromRoute(page: string) {
  window.APP.setPage(page)
}

async function restoreAiHistory() {
  const agents = ['insight', 'risk', 'plan', 'service']
  const convs = window.APP.aiConversations
  if (!convs) return
  await Promise.all(agents.map(async (a) => {
    try {
      const res = await fetchAiHistory(a)
      const msgs = res?.messages
      if (Array.isArray(msgs) && msgs.length) {
        convs[a] = msgs.map((m: any) => ({
          role: m.role || 'assistant',
          type: 'text',
          content: m.content || '',
        }))
      }
    } catch { /* 未登录或失败时保留默认开场白 */ }
  }))
}

export interface BootResult { source: 'server' | 'local' }

// 引擎当前数据来源（'local' = 服务端不可达，已回退内置演示数据）；
// 供 MainLayout 顶栏渲染可见提示，避免演示时静默降级不被察觉。
export const engineSource = ref<'server' | 'local' | null>(null)

// 完整引导：脚本 → 数据 → 桥接
export async function bootEngine(router: any): Promise<BootResult> {
  await loadEngineScripts()

  let source: 'server' | 'local' = 'local'
  try {
    const raw = await fetchBootstrap()
    const mapped = mapBootstrap(raw)
    window.MOCK_ENGINE.rebuild(mapped)
    source = 'server'
  } catch (e) {
    console.warn('[engine] 服务器数据不可用，回退到内置演示数据', e)
  }
  engineSource.value = source

  installSync()
  wireRouterBridge(router)
  restoreAiHistory().catch(() => {})

  return { source }
}
