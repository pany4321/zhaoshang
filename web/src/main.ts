import { createApp } from 'vue'
import { createPinia } from 'pinia'

// ============================================================
// ECharts 按需引入
//
// 原来 `import * as echarts from 'echarts'` 全量打包 = 1.04MB（br 后 280KB），
// 占首屏压缩后体积的一半以上，而实际只用到 7 种图表 + 6 个组件。
//
// 清单依据：对 web/public/engine/ 全量统计所得 ——
//   series: bar 12 / line 8 / pie 3 / radar 2 / map 1 / graph 1 / funnel 1
//   组件:   grid 12 / tooltip 18 / legend 8 / title 50 / visualMap 1 / axisPointer 5
//   未使用: dataZoom / geo / toolbox / brush / timeline / markLine / markPoint / dataset
//   顶层 API: echarts.init / echarts.registerMap / echarts.graphic.LinearGradient
//
// ⚠️ 引擎新增图表类型或组件时，必须在此处补进 use([...])，
//    否则该图表静默渲染为空白（控制台不报错，只表现为「图没了」）。
//    回归手段：npm test 的 9 页渲染 + 浏览器逐页检查 canvas 数量。
// ============================================================
import * as echarts from 'echarts/core'
import {
  BarChart,
  LineChart,
  PieChart,
  RadarChart,
  MapChart,
  GraphChart,
  FunnelChart,
} from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
  VisualMapComponent,
  AxisPointerComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([
  BarChart,
  LineChart,
  PieChart,
  RadarChart,
  MapChart,
  GraphChart,
  FunnelChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
  VisualMapComponent,
  AxisPointerComponent,
  CanvasRenderer,
])

import App from './App.vue'
import router from './router'
import './styles/global.css'

// demo 引擎以全局 echarts 变量绘图（与纯前端版一致）
;(window as any).echarts = echarts

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')
