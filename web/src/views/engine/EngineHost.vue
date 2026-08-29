<template>
  <div class="content" id="content"></div>
</template>

<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { bootEngine, setPageFromRoute, PAGE_KEYS, setEngineUser } from '@/engine/engine'
import { useUserStore } from '@/stores/user'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

// 引擎引导单例（多路由复用同一组件实例时只引导一次）
let bootPromise: Promise<void> | null = null

function routePage(): string {
  const key = String(route.meta?.title || '')
  return PAGE_KEYS.includes(key) ? key : 'dashboard'
}

onMounted(async () => {
  const APP = (window as any).APP
  const content = document.getElementById('content')
  if (content && !APP) {
    content.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:center;height:60vh;color:#94A3B8;font-size:13px;">平台数据加载中…</div>'
  }

  if (!APP) {
    if (!bootPromise) {
      bootPromise = (async () => {
        setEngineUser(
          userStore.userInfo
            ? { username: userStore.userInfo.username, name: userStore.userInfo.name, role: userStore.userInfo.role }
            : null
        )
        await bootEngine(router)
      })()
    }
    await bootPromise
  }
  setPageFromRoute(routePage())
})

// 路由变化 → 引擎切页（引擎内部下钻触发的路由变化由桥接层去重，不会形成回路）
watch(
  () => route.meta?.title,
  () => {
    const APP = (window as any).APP
    if (!APP) return
    const page = routePage()
    if (APP.state.page !== page) setPageFromRoute(page)
  }
)
</script>
