import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import request from '@/utils/request'

export interface UserInfo {
  id: number
  username: string
  name: string
  role: string
  districtId?: string
  district?: { id: string; name: string }
}

export const useUserStore = defineStore('user', () => {
  const token = ref<string>(localStorage.getItem('zs_token') || '')
  const userInfo = ref<UserInfo | null>(null)

  const isLoggedIn = computed(() => !!token.value)
  const isAdmin = computed(() => userInfo.value?.role === 'admin')
  const isLeader = computed(() => userInfo.value?.role === 'leader')

  async function login(username: string, password: string) {
    const res: any = await request.post('/auth/login', { username, password })
    token.value = res.token
    userInfo.value = res.user
    localStorage.setItem('zs_token', res.token)
    localStorage.setItem('zs_user', JSON.stringify(res.user))
    return res
  }

  function loadFromStorage() {
    const u = localStorage.getItem('zs_user')
    if (u && token.value) {
      try {
        userInfo.value = JSON.parse(u)
      } catch { /* ignore */ }
    }
  }

  async function fetchUserInfo() {
    try {
      const res: any = await request.get('/auth/me')
      userInfo.value = res
      localStorage.setItem('zs_user', JSON.stringify(res))
      return res
    } catch {
      logout()
    }
  }

  function logout() {
    token.value = ''
    userInfo.value = null
    localStorage.removeItem('zs_token')
    localStorage.removeItem('zs_user')
  }

  return { token, userInfo, isLoggedIn, isAdmin, isLeader, login, loadFromStorage, fetchUserInfo, logout }
})
