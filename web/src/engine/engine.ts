// ============================================================
// demo 引擎装载器：按 demo 的加载顺序注入脚本 → 拉取服务器数据重建 MOCK
// → 接管 Vue Router 与引擎之间的导航桥 → 提供工作流动作的服务端同步。
// 引擎文件全部位于 /engine（public 目录，浏览器直接加载，不经打包）。
// ============================================================
import { ref } from 'vue'
import { fetchBootstrap, dispatchRisk, startTask, finishTask, createTask, createEnterprise, createProject, saveProjectNote, createPolicy, fetchAiHistory, syncAiConversation } from './api'
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

const ENGINE_SCRIPTS = [
  '/engine/mock.js',
  '/engine/utils.js',
  '/engine/state.js',
  '/engine/components.js',
  '/engine/pages/dashboard.js',
  '/engine/pages/enterprise.js',
  '/engine/pages/profile.js',
  '/engine/pages/risk.js',
  '/engine/pages/graph.js',
  '/engine/pages/workbench.js',
  '/engine/pages/project.js',
  '/engine/pages/policy.js',
  '/engine/pages/aidemo.js',
  '/engine/app-core.js',
]

// PDF 导出依赖（jsPDF UMD + autotable，与纯前端版同一份构建产物）
// 注意：autotable 必须在 jspdf 之后顺序加载，否则插件注册不到 jsPDF 原型上
const VENDOR_SCRIPTS = [
  '/engine/vendor/jspdf.umd.min.js',
  '/engine/vendor/jspdf.plugin.autotable.min.js',
]

export const PAGE_KEYS = [
  'dashboard', 'enterprise', 'profile', 'risk',
  'graph', 'workbench', 'project', 'policy', 'aidemo',
]

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = src
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('引擎脚本加载失败: ' + src))
    document.head.appendChild(s)
  })
}

export async function loadEngineScripts() {
  if (window.APP && window.MOCK) return
  for (const src of ENGINE_SCRIPTS) {
    await loadScript(src)
  }
  // jsPDF → autotable 顺序加载（注册依赖前者），字体子集并行；失败静默（导出时回退打印视图）
  for (const src of VENDOR_SCRIPTS) {
    await loadScript(src).catch(() => {})
  }
  loadScript('/fonts/pdf-font-zh.js').catch(() => {})
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
        districtId: d.district,
        industryId: d.industry,
        investment: Math.round(d.amountWan || 0),
      }).catch(() => {})
    },
    projectCreated(p: any, d: any) {
      createProject({
        name: p.name,
        enterpriseId: p.enterprise,
        investment: p.amountWan,
        districtId: p.district,
        industryId: d.industry,
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
