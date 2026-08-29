import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { PAGE_KEYS } from '@/engine/engine'

// 九个业务页面全部由 demo 引擎渲染（EngineHost 承载 #content）
const enginePageRoutes: RouteRecordRaw[] = PAGE_KEYS.map((key) => ({
  path: key === 'dashboard' ? '/' : '/' + key,
  name: 'Engine-' + key,
  component: () => import('@/views/engine/EngineHost.vue'),
  meta: { title: key, engine: true },
}))

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/login/Login.vue'),
    meta: { title: '登录', noAuth: true },
  },
  {
    path: '/',
    component: () => import('@/layout/MainLayout.vue'),
    children: enginePageRoutes,
  },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach((to, _from, next) => {
  const userStore = useUserStore()
  userStore.loadFromStorage()

  if (to.meta.noAuth) {
    next()
    return
  }
  if (!userStore.isLoggedIn) {
    next({ path: '/login', query: { redirect: to.fullPath } })
    return
  }
  next()
})

router.afterEach((to) => {
  const key = to.meta?.engine ? String(to.meta.title) : ''
  const titles: Record<string, string> = {
    dashboard: '招商驾驶舱',
    enterprise: '企业概况',
    profile: '企业画像',
    risk: '风险预警',
    graph: '关系图谱',
    workbench: '我的工作台',
    project: '招商项目',
    policy: '政策服务',
    aidemo: '招商智能体',
  }
  document.title = (titles[key] ? titles[key] + ' · ' : '') + '招商企业服务与智慧监管平台'
})

export default router
