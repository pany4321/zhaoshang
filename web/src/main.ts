import { createApp } from 'vue'
import { createPinia } from 'pinia'
import * as echarts from 'echarts'

import App from './App.vue'
import router from './router'
import './styles/global.css'

// demo 引擎以全局 echarts 变量绘图（与纯前端版一致）
;(window as any).echarts = echarts

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')
