<template>
  <div class="app">
    <!-- 全宽顶部栏（与 demo/index.html 同构，增加侧栏折叠开关） -->
    <header class="app-header">
      <button class="nav-toggle" id="navToggle" aria-label="打开导航">☰</button>
      <button
        class="side-toggle"
        type="button"
        :title="sideCollapsed ? '展开菜单' : '收起菜单'"
        @click="toggleSide"
      >{{ sideCollapsed ? '»' : '«' }}</button>
      <div class="brand">
        <span class="logo-mark">
          <svg width="30" height="30" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
            <g fill="#fff" opacity="0.16">
              <circle cx="11" cy="30" r="1.5"/>
              <circle cx="30" cy="51" r="1.5"/>
              <circle cx="55" cy="37" r="1.5"/>
              <circle cx="21" cy="12" r="1.5"/>
            </g>
            <defs>
              <path id="st" d="M0 -10 L2 -2 L10 0 L2 2 L0 10 L-2 2 L-10 0 L-2 -2 Z"/>
            </defs>
            <use href="#st" transform="translate(52 14) scale(1.05)" fill="#fff"/>
            <use href="#st" transform="translate(38 23) scale(0.78)" fill="#fff"/>
            <use href="#st" transform="translate(27 33) scale(0.60)" fill="#fff"/>
            <use href="#st" transform="translate(17 45) scale(0.48)" fill="#fff"/>
            <use href="#st" transform="translate(52 47) scale(0.40)" fill="#fff"/>
            <use href="#st" transform="translate(13 23) scale(0.34)" fill="#fff"/>
            <use href="#st" transform="translate(34 54) scale(0.28)" fill="#fff"/>
          </svg>
        </span>
        <span class="brand-name">招商企业服务与智慧监管平台</span>
      </div>
      <div class="header-search">
        <span class="hs-icon">⌕</span>
        <input type="text" id="globalSearch" placeholder="搜索企业、政策、项目…" />
      </div>
      <div class="spacer"></div>
      <!-- 数据来源角标：服务端不可达、引擎回退内置演示数据时可见 -->
      <span v-if="engineSource === 'local'" class="source-badge" title="服务端未连接，当前展示内置演示数据（非服务器数据）">
        ⚠ 本地演示数据
      </span>
      <button class="demo-btn" id="demoBtn">▶ 演示模式</button>
      <button class="header-fullscreen-btn" id="fullscreenBtn">全屏</button>
      <div class="header-divider"></div>
      <div class="user-area" title="点击退出登录" @click="onLogout">
        <div class="user-avatar">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="8" r="4" fill="#fff"/>
            <path d="M4 20.5C4 16.4 7.6 13.8 12 13.8C16.4 13.8 20 16.4 20 20.5V21H4V20.5Z" fill="#fff"/>
          </svg>
        </div>
        <div class="user-meta">
          <div class="user-name">{{ userName }}</div>
          <div class="user-role">{{ userRole }}</div>
        </div>
      </div>
    </header>

    <!-- 顶栏下方：侧边导航 + 主区域 -->
    <div class="app-body">
      <div class="sidebar-mask" id="sidebarMask"></div>
      <aside class="sidebar" :class="{ collapsed: sideCollapsed }">
        <nav class="nav" id="nav">
          <div class="nav-group">招商总览</div>
          <div class="nav-item" data-page="dashboard" title="招商驾驶舱"><span class="ico">⌂</span><span class="tx">招商驾驶舱</span></div>
          <div class="nav-group">企业监管</div>
          <div class="nav-item" data-page="enterprise" title="企业概况"><span class="ico">◫</span><span class="tx">企业概况</span></div>
          <div class="nav-item" data-page="profile" title="企业画像"><span class="ico">◉</span><span class="tx">企业画像</span></div>
          <div class="nav-item" data-page="risk" title="风险预警"><span class="ico">⚠</span><span class="tx">风险预警</span></div>
          <div class="nav-item" data-page="graph" title="关系图谱"><span class="ico">⌬</span><span class="tx">关系图谱</span></div>
          <div class="nav-group">招商引资</div>
          <div class="nav-item" data-page="workbench" title="我的工作台"><span class="ico">☰</span><span class="tx">我的工作台</span></div>
          <div class="nav-item" data-page="project" title="招商项目"><span class="ico">❖</span><span class="tx">招商项目</span></div>
          <div class="nav-item" data-page="policy" title="政策服务"><span class="ico">✎</span><span class="tx">政策服务</span></div>
          <div class="nav-group">智能应用</div>
          <div class="nav-item" data-page="aidemo" title="招商智能体"><span class="ico">✦</span><span class="tx">招商智能体</span></div>
        </nav>
      </aside>

      <!-- 主区域：页面标题 + 引擎渲染的内容区 -->
      <section class="main">
        <div class="page-head">
          <span class="page-title" id="pageTitle">招商驾驶舱</span>
        </div>
        <router-view />
      </section>
    </div>

    <!-- 抽屉容器与演示提示（引擎动态填充） -->
    <div id="drawerWrap"></div>
    <div id="demoTipWrap"></div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { engineSource } from '@/engine/engine'

const router = useRouter()
const userStore = useUserStore()
// 顶栏显示登录账号（如 admin）+ 角色
const userName = computed(() => userStore.userInfo?.username || userStore.userInfo?.name || '未登录')
const ROLE_TEXT: Record<string, string> = {
  admin: '平台管理员',
  leader: '局领导',
  worker: '招商专员',
}
const userRole = computed(() => {
  const role = userStore.userInfo?.role || ''
  return ROLE_TEXT[role] || '招商专员'
})

// —— 侧边栏折叠/展开（仅收起为图标，扩大右侧可视区域；状态持久化） ——
const SIDE_KEY = 'zs_sidebar_collapsed'
const sideCollapsed = ref(localStorage.getItem(SIDE_KEY) === '1')
function toggleSide() {
  sideCollapsed.value = !sideCollapsed.value
  localStorage.setItem(SIDE_KEY, sideCollapsed.value ? '1' : '0')
}

function onLogout() {
  const doLogout = () => {
    userStore.logout()
    router.push('/login')
  }
  const APP = (window as any).APP
  if (APP?.Components?.confirm) {
    APP.Components.confirm('退出登录', '确定退出当前账号吗？', doLogout)
  } else if (window.confirm('确定退出当前账号吗？')) {
    doLogout()
  }
}
</script>

<style>
/* ===== 壳层扩展样式（侧栏折叠 / 用户角色 / 折叠开关） ===== */

/* 数据来源角标（服务端不可达时显示） */
.source-badge {
  display: inline-flex;
  align-items: center;
  height: 24px;
  padding: 0 10px;
  border-radius: 12px;
  background: #FFF7ED;
  border: 1px solid #FDBA74;
  color: #C2410C;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  cursor: help;
  flex-shrink: 0;
}

/* 顶栏折叠开关（桌面端显示；小屏抽屉导航由 .nav-toggle 承担） */
.side-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: 1px solid var(--c-border-light, #EEF2F7);
  border-radius: 8px;
  background: #fff;
  color: #64748B;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  flex-shrink: 0;
  transition: all .18s;
}
.side-toggle:hover {
  color: #2563EB;
  border-color: #C7D7FE;
  background: #EFF4FE;
}

/* 用户区：姓名 + 角色 */
.user-area .user-role {
  font-size: 10px;
  color: #94A3B8;
  white-space: nowrap;
  margin-top: 1px;
}

/* ----- 侧边栏折叠态：仅显示图标 ----- */
.sidebar { transition: width .22s ease; overflow: hidden; }
.sidebar.collapsed { width: 60px; }
.sidebar.collapsed .nav { padding: 10px 8px; }
/* 隐藏菜单文字（文字为裸文本节点，用 font-size:0 收起；图标单独恢复字号） */
.sidebar.collapsed .nav-item { font-size: 0; gap: 0; padding: 11px 0; justify-content: center; border-radius: 8px; }
.sidebar.collapsed .nav-item .ico { font-size: 15px; width: 100%; }
.sidebar.collapsed .nav-item .tx { display: none; }
/* 分组标题收起为分隔线 */
.sidebar.collapsed .nav-group {
  font-size: 0;
  letter-spacing: 0;
  padding: 0;
  margin: 8px 6px;
  height: 1px;
  background: #EEF2F7;
  overflow: hidden;
}

/* 小屏（≤1024px）侧栏为抽屉式，折叠开关无意义，隐藏 */
@media (max-width: 1024px) {
  .side-toggle { display: none; }
  .sidebar.collapsed { width: 184px; }
  .sidebar.collapsed .nav-item { font-size: var(--fs-sm, 13px); gap: 10px; padding: 12px; justify-content: flex-start; }
  .sidebar.collapsed .nav-item .ico { font-size: 14px; width: 18px; }
  .sidebar.collapsed .nav-item .tx { display: inline; }
  .sidebar.collapsed .nav-group { font-size: 11px; letter-spacing: 1.5px; padding: 14px 10px 6px; margin: 0; height: auto; background: none; }
}
</style>
