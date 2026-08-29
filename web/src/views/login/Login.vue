<template>
  <div class="login-page">
    <!-- 登录页背景插画：星河 · 数据网络 · 波澜（呼应七星星标与"企业如星、AI 点亮"的平台意象） -->
    <svg
      class="login-bg"
      viewBox="0 0 1440 900"
      preserveAspectRatio="xMidYMid slice"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="lg-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#E9F0FF" />
          <stop offset="0.55" stop-color="#F4F7FE" />
          <stop offset="1" stop-color="#ECF3FF" />
        </linearGradient>
        <linearGradient id="lg-blob" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#2563EB" stop-opacity="0.15" />
          <stop offset="1" stop-color="#6366F1" stop-opacity="0.04" />
        </linearGradient>
        <linearGradient id="lg-wave" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#2563EB" stop-opacity="0.09" />
          <stop offset="0.5" stop-color="#6366F1" stop-opacity="0.11" />
          <stop offset="1" stop-color="#0EA5E9" stop-opacity="0.07" />
        </linearGradient>
        <radialGradient id="lg-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stop-color="#2563EB" stop-opacity="0.32" />
          <stop offset="1" stop-color="#2563EB" stop-opacity="0" />
        </radialGradient>
        <path id="lg-star" d="M0 -10 L2 -2 L10 0 L2 2 L0 10 L-2 2 L-10 0 L-2 -2 Z" />
      </defs>

      <rect width="1440" height="900" fill="url(#lg-sky)" />

      <!-- 柔光晕 -->
      <circle cx="1185" cy="150" r="380" fill="url(#lg-blob)" />
      <circle cx="150" cy="770" r="430" fill="url(#lg-blob)" />

      <!-- 数据网络：政企数据联动 -->
      <g stroke="#2563EB" stroke-opacity="0.13" fill="none" stroke-width="1.2">
        <path d="M110 216 L318 138 L512 232 L742 152" />
        <path d="M318 138 L426 322 L636 376 L742 152" />
        <path d="M636 376 L872 316 L972 258 L1176 208 L1326 326" />
        <path d="M972 258 L1054 424 L1226 516 L1326 326" />
        <path d="M426 322 L560 512 L806 552 L1054 424" />
        <path d="M806 552 L962 668 L1226 516" />
      </g>
      <g fill="#2563EB">
        <circle cx="110" cy="216" r="5" opacity="0.32" />
        <circle cx="318" cy="138" r="6.5" opacity="0.4" />
        <circle cx="512" cy="232" r="4.5" opacity="0.3" />
        <circle cx="742" cy="152" r="7" opacity="0.42" />
        <circle cx="426" cy="322" r="5.5" opacity="0.34" />
        <circle cx="636" cy="376" r="4.5" opacity="0.3" />
        <circle cx="872" cy="316" r="4.5" opacity="0.3" />
        <circle cx="972" cy="258" r="6" opacity="0.38" />
        <circle cx="1176" cy="208" r="5" opacity="0.32" />
        <circle cx="1326" cy="326" r="6.5" opacity="0.4" />
        <circle cx="1054" cy="424" r="5" opacity="0.32" />
        <circle cx="1226" cy="516" r="5.5" opacity="0.34" />
        <circle cx="560" cy="512" r="5" opacity="0.3" />
        <circle cx="806" cy="552" r="6" opacity="0.36" />
        <circle cx="962" cy="668" r="4.5" opacity="0.28" />
      </g>

      <!-- 七星星河（大小不一，自左下向右上，呼应平台标识） -->
      <g fill="#2563EB">
        <circle cx="140" cy="318" r="34" fill="url(#lg-glow)" />
        <circle cx="248" cy="268" r="26" fill="url(#lg-glow)" />
        <circle cx="352" cy="224" r="30" fill="url(#lg-glow)" />
        <circle cx="452" cy="182" r="26" fill="url(#lg-glow)" />
        <circle cx="544" cy="146" r="30" fill="url(#lg-glow)" />
        <circle cx="630" cy="112" r="26" fill="url(#lg-glow)" />
        <circle cx="710" cy="84" r="34" fill="url(#lg-glow)" />
        <use href="#lg-star" transform="translate(140 318) scale(0.62)" opacity="0.5" />
        <use href="#lg-star" transform="translate(248 268) scale(0.44)" opacity="0.55" />
        <use href="#lg-star" transform="translate(352 224) scale(0.55)" opacity="0.6" />
        <use href="#lg-star" transform="translate(452 182) scale(0.4)" opacity="0.6" />
        <use href="#lg-star" transform="translate(544 146) scale(0.52)" opacity="0.68" />
        <use href="#lg-star" transform="translate(630 112) scale(0.4)" opacity="0.72" />
        <use href="#lg-star" transform="translate(710 84) scale(0.68)" opacity="0.85" />
      </g>

      <!-- 底部波澜 -->
      <path
        d="M0 716 C 240 656 480 776 760 726 C 1020 681 1240 756 1440 696 L1440 900 L0 900 Z"
        fill="url(#lg-wave)"
      />
      <path
        d="M0 806 C 260 754 520 854 820 802 C 1100 757 1280 834 1440 782 L1440 900 L0 900 Z"
        fill="#2563EB"
        opacity="0.05"
      />
    </svg>

    <div class="login-card">
      <!-- 上半：品牌区（标识 / 标题 / 星饰 / 副题） -->
      <div class="login-brand">
        <div class="login-logo">
          <svg width="34" height="34" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <path id="lg-st" d="M0 -10 L2 -2 L10 0 L2 2 L0 10 L-2 2 L-10 0 L-2 -2 Z" />
            </defs>
            <use href="#lg-st" transform="translate(52 14) scale(1.05)" fill="#fff" />
            <use href="#lg-st" transform="translate(38 23) scale(0.78)" fill="#fff" />
            <use href="#lg-st" transform="translate(27 33) scale(0.6)" fill="#fff" />
            <use href="#lg-st" transform="translate(17 45) scale(0.48)" fill="#fff" />
            <use href="#lg-st" transform="translate(52 47) scale(0.4)" fill="#fff" />
            <use href="#lg-st" transform="translate(13 23) scale(0.34)" fill="#fff" />
            <use href="#lg-st" transform="translate(34 54) scale(0.28)" fill="#fff" />
          </svg>
        </div>
        <h1 class="login-title">招商企业服务与智慧监管平台</h1>
        <div class="login-stars">
          <span v-for="n in 7" :key="n">✦</span>
        </div>
        <p class="login-sub">Enterprise Full-Lifecycle Service &amp; AI Supervision</p>
      </div>

      <!-- 下半：登录表单（用户名 / 密码 / 登录按钮） -->
      <div class="login-form">
        <div class="field">
          <label>用户名</label>
          <input v-model.trim="username" type="text" placeholder="请输入用户名" @keyup.enter="submit" />
        </div>
        <div class="field">
          <label>密码</label>
          <input v-model.trim="password" type="password" placeholder="请输入密码" @keyup.enter="submit" />
        </div>

        <button class="login-btn" :disabled="loading" @click="submit">
          {{ loading ? '登录中…' : '登 录' }}
        </button>

        <div class="login-error" :class="{ on: !!error }">{{ error }}</div>

        <div class="login-hint">演示账号：<b>admin</b><span class="hint-sep">/</span>admin123</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRoute } from 'vue-router'
import { useUserStore } from '@/stores/user'
import request from '@/utils/request'

const route = useRoute()
const userStore = useUserStore()

const username = ref('admin')
const password = ref('admin123')
const loading = ref(false)
const error = ref('')

async function submit() {
  if (!username.value || !password.value) {
    error.value = '请输入用户名和密码'
    return
  }
  loading.value = true
  error.value = ''
  try {
    await userStore.login(username.value, password.value)
    // 登录成功即重置演示数据：每场演示从干净态开始。
    // 等待重置完成再进入平台，避免 bootstrap 拉到半程数据；失败不阻断进入。
    try {
      // 传 {} 保证 axios 设置 application/json 头（null body 会触发 Fastify 415）
      await request.post('/auth/reset-demo', {}, { timeout: 60000 })
    } catch { /* 重置失败不阻断进入 */ }
    // 整页跳转（而非 router.push）：确保引擎以重置后的干净数据重新引导
    const redirect = String(route.query.redirect || '/')
    window.location.href = redirect.startsWith('/') ? redirect : '/'
  } catch (e: any) {
    error.value = e?.response?.data?.msg || e?.message || '登录失败，请检查用户名与密码'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-page {
  position: relative;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  overflow: hidden;
  background: #f4f7fe;
}
.login-bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
}

/* 登录窗口：固定尺寸，不随视口缩放；上 50% 品牌区 + 下 50% 表单区 */
.login-card {
  position: relative;
  z-index: 1;
  width: min(346px, calc(100vw - 32px));
  height: 512px;
  flex: none;
  display: flex;
  flex-direction: column;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.94);
  backdrop-filter: blur(10px);
  box-shadow:
    0 24px 60px rgba(15, 23, 42, 0.16),
    0 8px 20px rgba(15, 23, 42, 0.06);
  overflow: hidden;
}

/* —— 上半：品牌区（50%） —— */
.login-brand {
  flex: 0 0 50%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 16px 14px 10px;
  text-align: center;
}
.login-logo {
  width: 64px;
  height: 64px;
  border-radius: 18px;
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 45%, #4f46e5 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.35),
    inset 0 -2px 6px rgba(15, 23, 42, 0.18),
    0 10px 26px rgba(37, 99, 235, 0.42);
  margin-bottom: 4px;
}
.login-title {
  margin: 0;
  font-size: 21px;
  line-height: 1.5;
  font-weight: 800;
  letter-spacing: 0.5px;
  white-space: nowrap;
  background: linear-gradient(135deg, #1d4ed8, #6366f1);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.login-stars {
  display: flex;
  gap: 10px;
  font-size: 11px;
  color: #93b4fb;
}
.login-stars span:nth-child(2n) {
  font-size: 8px;
  opacity: 0.75;
  transform: translateY(-1px);
}
.login-stars span:nth-child(4) {
  color: #6366f1;
}
.login-sub {
  margin: 0;
  font-size: 10.5px;
  letter-spacing: 0.6px;
  color: #9aa8c4;
  text-transform: uppercase;
}

/* 分界线：渐变细线 */
.login-card > .login-form {
  border-top: 1px solid #eef2f7;
  position: relative;
}

/* —— 下半：表单区（50%） —— */
.login-form {
  flex: 0 0 50%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 10px;
  padding: 2px 36px 34px;
  background: linear-gradient(180deg, #fbfcff 0%, #f5f8fd 100%);
}
.field label {
  display: block;
  font-size: 12px;
  color: #64748b;
  margin-bottom: 6px;
  font-weight: 600;
}
.field input {
  width: 100%;
  box-sizing: border-box;
  height: 34px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 0 12px;
  font-size: 14px;
  color: #0f172a;
  outline: none;
  background: #fff;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.field input:focus {
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
}
/* 错误提示：固定占位一行，出现/消失都不挤压上下布局 */
.login-error {
  min-height: 18px;
  line-height: 18px;
  font-size: 12px;
  color: #ef4444;
  text-align: center;
  visibility: hidden;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.login-error.on {
  visibility: visible;
}
.login-btn {
  width: 200px;
  height: 46px;
  margin: 2px auto 0;
  display: block;
  border: none;
  border-radius: 23px;
  background: linear-gradient(135deg, #2563eb, #6366f1);
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 6px;
  text-indent: 6px;
  cursor: pointer;
  box-shadow: 0 6px 16px rgba(37, 99, 235, 0.32);
  transition: opacity 0.15s, transform 0.05s, box-shadow 0.15s;
}
.login-btn:hover {
  opacity: 0.93;
  box-shadow: 0 8px 20px rgba(37, 99, 235, 0.4);
}
.login-btn:active {
  transform: translateY(1px);
}
.login-btn:disabled {
  opacity: 0.6;
  cursor: default;
}
.login-hint {
  text-align: center;
  color: #94a3b8;
  font-size: 12px;
}
.login-hint b {
  color: #2563eb;
  font-weight: 700;
}
.hint-sep {
  margin: 0 6px;
  color: #cbd5e1;
}
</style>
