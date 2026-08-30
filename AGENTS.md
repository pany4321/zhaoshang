# AGENTS.md

本文件为 AI 编码代理（Claude Code、Codex、Cursor、ZCode 等）在本仓库工作时提供指南。内容与根目录 `CLAUDE.md` 保持同步——修改任一文件时请同步另一份。

## 仓库定位

《招商企业服务与智慧监管平台》（Enterprise Service & Smart Supervision Platform，面向庆阳市）提案交付物仓库——**不是生产应用**：

- `招商企业服务与智慧监管平台_系统需求分析说明书_V5.0_深化版.md` — 需求说明书（V5.0 深化版，**现行唯一权威**）。取代已归档的 V3.1 / V4.0 / V5.0 旧版（见 `docs/archive/`）。业务逻辑权威口径：**八维**加权风险模型及其权重、红/橙/黄/蓝四级风险、用户角色、AI 能力矩阵、数据架构。（V3.1 旧稿描述"九维"模型；实际 demo/引擎为八维——见 `demo/assets/data/mock.js` 的 `RISK_DIMS`。）
- `demo/` — 纯前端高保真交互原型（多文件；设计系统 V4，功能集对齐 V5.0 深化版）。**设计 & 行为唯一基准**。
- `server/` — 后端（Fastify + Prisma + SQLite + TypeScript），V5 全栈版组成部分。
- `web/` — 前端（Vue 3 + Vite + Pinia 壳；构建经 manualChunks 分包 echarts/vue），在 `web/public/engine/` **vendor 了 demo 引擎**（与 `demo/` 相同的 style.css、页面渲染器、components），并回放服务器数据。**不要用 Vue 重写页面——扩展引擎**。
- `README.md` — V5 全栈版快速上手指南。

V5 全栈版（`server/` + `web/`）1:1 复刻全部 9 个 demo 页面：`GET /api/bootstrap` 一次性下发全部实体，`web/src/engine/adapter.ts` 映射为 demo MOCK 形状，`MOCK_ENGINE.rebuild()`（`web/public/engine/mock.js`）重算全部派生结构（聚合、图谱、AI 日报、政策兑现），保证页页数字对账。**服务器数据由 fixtures 驱动**：`tools/export_demo_fixtures.cjs` 将 demo MOCK 实体导出为 `server/prisma/demo-fixtures.json`（demo 口径：120 企业 / 67 风险事件 / 78 任务 / 24 政策 / 19 项目），`server/prisma/seed-data.ts` 只负责入库——demo 是单一事实源；`tools/check_data_parity.cjs`（run_all 内）对任何漂移报失败。工作流动作（风险派发、任务办结、企业/项目建档、阶段备注、政策入库、AI 会话）经 `APP.sync` 钩子（`web/src/engine/engine.ts`）落库。API 不可达时引擎回退内置演示数据，`MainLayout` 显示「⚠ 本地演示数据」角标（`engine.ts` 的 `engineSource` ref）。登录成功（`POST /api/auth/login` → 前端调 `POST /api/auth/reset-demo`）会重置全部演示数据到种子态，每场演示从干净态开始；随后前端整页跳转，引擎以新数据重新引导。

- `demo/DEMO操作说明.md`、`demo/汇报串联脚本.md` — 演示手册与汇报串联脚本。
- `docs/archive/` — 仅作参考的历史文档（V4 改进大纲与已被取代的 V3.1 / V4.0 / V5.0 需求草稿）。现行权威为根目录《系统需求分析说明书_V5.0_深化版》。
- `tools/make_pdf_font.py` — 生成文字版 PDF 导出的中文字体子集。
- `tools/verify_pdf_export.js` — 文字版 PDF 导出的 JSDOM 冒烟测试。
- `tools/sync_engine.py` — 将共享引擎文件（`utils/state/components/pages/*.js`、`style.css`）从 `demo/` 同步到 `web/public/engine/` 并代跑 mock 生成器；`--check` 仅校验（漂移时退出码 1）。不同步（有意分化/生成物）：`mock.js`（生成）、`app-core.js`（demo `app.js` 的 Vue-Router 托管改写）、`vendor/`。改 demo 引擎后必跑。
- `tools/export_demo_fixtures.cjs` — 将 demo MOCK 实体导出为 `server/prisma/demo-fixtures.json`（server 形状：维度/状态/类型反向映射、9 风险维）。改 demo mock.js 后、`npm run db:seed` 前必跑。
- `tools/check_data_parity.cjs` — 对账：demo MOCK vs `demo-fixtures.json`（实体计数、ID 集合、名称顺序、风险分布、引用完整性）。离线可跑；在 run_all 内。
- `tools/verify_web_api.cjs` — 面向运行中 server 的接口回归（登录 → bootstrap 与 fixtures 计数对账 → 脏任务 → reset-demo 恢复基线 → 未鉴权 401 → 权重配置读写/拦截）。需 `cd server && npm run dev`；server 未运行时 run_all 自动 SKIP。
- `tools/build_engine_mock.py` — 从 `demo/assets/data/mock.js` 再生 `web/public/engine/mock.js`：原样拷贝（demo mock.js 已是可注入 RNG 形态：`enrich`/`deriveAll` 接收 `R`、体内 `R.*`、自带 `return`），裁掉旧导出块，追加统一导出 + `MOCK_ENGINE`（`rebuild` **原地**替换闭包数组，使 `entById` 等与 `global.MOCK` 保持同步）。自检 `R.R.` 双重前缀与括号配平。
- `tools/run_all.cjs` — 统一测试入口：首步引擎一致性前置检查 → 下方全部脚本 + 接口回归（server 未运行时 SKIP），任一失败退出码非零（`npm test`）。
- `tools/test_engine_rebuild.cjs` — 引擎 mock 冒烟（本地生成输出 + server 数据 rebuild 路径）。
- `tools/smoke_test.js` — JSDOM 冒烟：逐文件加载 demo JS，渲染 9 个页面，断言 `#content` 非空。必须从仓库根运行（路径拼 `../demo`）。
- `tools/smoke_interaction.js` — JSDOM 交互冒烟：数据对账 + 完整下钻链路（派发 → 任务 → 办结 → 闭环）。任一断言打印 ❌ 即非零退出。
- `tools/check_invariants.js` — 风险事件三态模型不变量校验（状态合法性、事件↔任务映射、数量守恒、时序一致性）。
- `.workbuddy/memory/` — 历史开发会话工作日志。

托管于 GitHub（`pany4321/zhaoshang`，分支 `master`）：CI（`.github/workflows/ci.yml`）在每次 push/PR 运行 `npm test` + `npm run build:web`（完整构建，含 vue-tsc 类型检查）；`deploy-demo.yml` 在 demo 变更时将 `demo/` 发布到 GitHub Pages https://pany4321.github.io/zhaoshang/ 。MIT LICENSE。根目录 `package.json` **仅**作为工作流入口（sync / fixtures / parity / test / build 脚本——见下方强制工作流）；demo 本身仍无构建步骤。所有 UI 文案与文档为中文（zh-CN）。

## 运行 demo

浏览器直接打开 `demo/index.html`（Chrome/Edge）。ECharts 已本地化于 `demo/assets/vendor/echarts.min.js`，完全离线可跑。若环境限制本地文件加载脚本：在 `demo/` 目录 `python -m http.server 8080`，访问 `http://localhost:8080`。

## 强制工具工作流（tools/ 触发矩阵）

**完成定义**：任何代码改动，其"改动对象"在下方触发矩阵中对应的必跑命令全部通过、且 `npm test` 全绿，才算完成。根目录 `package.json` 是统一入口（`sync` / `sync:check` / `fixtures` / `parity` / `test` / `test:api` / `build:web` / `seed`），不要手敲长命令。

### 触发矩阵（改动对象 → 必跑，按序执行）

| 改动对象 | 必跑命令（按序） |
| --- | --- |
| `demo/assets/js/**`（页面与公共模块） | `npm run sync` → `npm test` → `npm run build:web` |
| `demo/assets/data/mock.js` | `npm run sync`（内含 mock.js 再生）→ `npm run fixtures` → `npm test` → `npm run build:web` |
| `demo/assets/css/style.css` | `npm run sync`（已纳入直拷）→ `npm test` → `npm run build:web` |
| `demo/index.html`、`demo/assets/js/common/login.js` | `npm test`（verify_login 覆盖登录门禁） |
| 区划地图边界更新（GEO_QINGYANG） | `python tools/update_geo_real.py`（拉取 DataV 官方 GeoJSON，写 demo mock.js）→ 按 mock.js 行全链。历史手绘工具 update_geo*.py 已被取代 |
| PDF 字体子集来源或字符集变化 | `python tools/make_pdf_font.py` → `node tools/verify_pdf_export.js` → `npm test` |
| `web/public/engine/**` | **原则上禁止直改**——回 demo 改后走 sync（仅 `app-core.js`、`vendor/` 属分化例外；直改后 `npm test` + `npm run build:web`） |
| `web/src/**`（壳层 / engine.ts / adapter.ts） | `npm run build:web` → `npm test`（server 运行时自动含接口回归）；adapter 字段映射变更时另跑 `npm run fixtures` → `npm run parity` |
| `server/prisma/schema.prisma` | `db:migrate` → 对照 `export_demo_fixtures.cjs` 的字段映射 → `npm run fixtures` → `npm run seed` → `npm run test:api` |
| `server/src/**`（接口/服务） | `npm test`（server 运行时 verify_web_api 自动包含；未运行则 `npm run test:api`） |
| `tools/export_demo_fixtures.cjs` 映射逻辑 | `npm run fixtures` → `npm run parity` → `npm run test:api` |
| 需求说明书 / DEMO 文档 | 无自动校验；一切数据底数以 `npm run parity` 的输出为准，不得写入与 demo/server 冲突的数字 |

### 工具速览（tools/ 全部 20 个，各自归位）

**同步/生成（demo 是唯一基准，改 demo 后必跑）**
- `sync_engine.py` — demo 引擎文件（含 style.css）→ `web/public/engine/`（内含 mock.js 再生）；`--check` 仅校验。`run_all` 首步自动执行该校验。
- `build_engine_mock.py` — demo mock.js → web mock.js（由 sync_engine 代跑，含 `R.R.`/括号自检）。
- `export_demo_fixtures.cjs` — demo mock → `server/prisma/demo-fixtures.json`（server seed 的唯一数据源）。
- `make_pdf_font.py` — 生成 PDF 中文子集 `demo/assets/vendor/pdf-font-zh.js`（仅字体来源或字符集变化时）。
- `update_geo_real.py` — 拉取阿里云 DataV GeoAtlas 官方行政边界（庆阳 621000_full，8 区县）替换 mock.js 的 GEO_QINGYANG（地图精度基准；免费公开数据，一次拉取离线内置）。
- `update_geo.py` / `update_geo_dense.py` — （已废弃）历史手绘估算边界工具，被 update_geo_real.py 取代。

**测试/校验（由 run_all 编排，一般不单独跑）**
- `run_all.cjs` — 统一入口：首步引擎一致性前置检查（漂移即失败）→ 静态脚本 → server 在跑时追加接口回归（未运行 SKIP 并提示启动命令）。`npm test` 即它。
- `smoke_test.js`（9 页渲染）、`smoke_interaction.js`（数据对账+下钻链路，失败即非零退出）、`check_invariants.js`（风险三态不变量）、`check_data_parity.cjs`（fixtures 对账）、`test_engine_rebuild.cjs`（web mock rebuild）、`verify_login.cjs`（demo 登录门禁）、`verify_industry_responsive.cjs`、`verify_profile_responsive.cjs`、`verify_policy_jump.cjs`（专项回归）、`verify_web_api.cjs`（server 接口链路，需运行中 server）。
- 游离脚本：`verify_pdf_export.js`（PDF 导出全流程，改字体/导出链路时手动跑）。

**诊断（按需，不进 run_all）**
- `scan_balance.py` / `trace_depth.py` — mock.js 括号配平与结构标记定位（排查生成产物时用）。

### 强制规则

1. `npm test` 的首步就是引擎一致性前置检查——"改了 demo 忘了同步 web"在这一步被拦截，不得绕过。
2. AI 协作与会话工作流：任何改动的收尾必须包含 `npm test` 全绿（涉 web 另加 build），否则不得声称完成。
3. `verify_web_api` 会重置演示数据库（固定种子 fixtures，无真实数据），依赖运行中的 server；未运行时 run_all 显示 `[SKIP]` 并给出启动命令。
4. smoke_test.js 逐文件加载 demo JS 到 JSDOM（runScripts: 'outside-only'），stub `window.echarts` 的 `init()`（`{setOption, dispose, resize, on}`）**和** `echarts.graphic.LinearGradient`/`RadialGradient`（含 `addColorStop`）；结尾 `process.exit(0)`（app.js 的 `setInterval` 时钟否则让 node 永不退出）。

## V4 Demo 架构

### 模块布局与加载顺序

加载顺序至关重要（`index.html`）：

```
echarts.min.js → jspdf.umd.min.js → jspdf.plugin.autotable.min.js → mock.js → utils.js → state.js → components.js → pages/*.js → app.js
```

全部模块使用 IIFE + `window.APP.*` 命名空间（非 ES modules）。页面经 `APP.registerRenderer(key, fn)` 自注册。

- `pdf-font-zh.js` **非静态加载**——由 profile.js 在用户点击「导出报告」（文字版 PDF 导出）时懒加载。

**`assets/data/mock.js`** — IIFE，全部导出挂 `window.MOCK`：

- 120 家企业（`ENTERPRISES`，15 深度 + 105 轻量）、8 区县、12 行业
- 八维加权风险模型（`RISK_DIMS` — 8 条，`calcRiskScore`，`scoreToLevel`，`LEVELS`；`applyRiskWeights` 支持运行时改权重热重算，`defaultRiskWeights` 返回出厂快照）
- 全部聚合（区县/行业/全市汇总、风险计数）由企业数据 reduce 推导——**天然对账**
- **67** 条风险事件（`RISK_EVENTS`：待处置 9 / 已派发 31 / 已关闭 27）；**19** 个项目（`PROJECTS`，跨 6 阶段）；**78** 条任务（`TASKS`：风险处置 58 / 政策推送 8 / 企业服务 5 / 项目跟进 4 / 日常巡检 3）
- 24 条政策库（`POLICY_LIB`），关系图谱（`GRAPH`，**46 节点 / 117 边**）
- `AI_DAILY` 由实时数据生成，`DEMO_SCRIPT` 一键演示
- 种子 PRNG（mulberry32，SEED=20260822）保证演示数据稳定
- 风险阈值：红 ≥65、橙 ≥45、黄 ≥25、蓝以下。企业风险等级分布：红 2 / 橙 7 / 黄 29 / 蓝 82（共 120）。
- 无 DEMO_NOW——所有"今日/近期/逾期"用系统真实时间

**`assets/js/common/utils.js`** — `window.APP.U`：DOM 助手（`$`、`$$`、`el`）、HTML 转义、数字格式化（`fmtNum`、`fmtWan`）、日期工具（`fmtDate`、`fmtDateTime`、`daysAgo`、`daysFromNow`、`inLastNDays`）、种子 PRNG（`makeRng`、`pick`、`randInt`、`randFloat`、`randBool`）。

**`assets/js/common/state.js`** — `window.APP.state`：全局状态对象（page、ent、district、dispatched、每页 filter）、`liveCharts` 数组、`renderers` 映射、`registerRenderer()`、`mkChart()`、`disposeCharts()`。

**`assets/js/common/components.js`** — `window.APP.Components`：Toast（4 类）、Confirm、Drawer（`openDrawer`/`closeDrawer`，**没有 modal 原语**）、空态、分页、表格排序、骨架、`lvlBadge()`、UTF-8 BOM 的 CSV 导出（data URI，中文文件名稳定）。所有浮层（toast/confirm/drawer）append 到 `.app`（非 body）以保证全屏可见。

**`assets/js/pages/*.js`** — 9 个页面模块，各自自注册渲染器：

- `dashboard.js` — 领导智能驾驶舱（10+ KPI、趋势、TOP5、地图、风险柱、产业环图、AI 日报）
- `enterprise.js` — 企业档案库（多条件筛选、排序、分页、CSV 导出、对比浮窗）
- `profile.js` — 企业 360° 画像（6 页签、风险矩阵、AI 研判、政策匹配、文字版 PDF 导出）
- `risk.js` — 风险预警中心（双视图雷达 + 事件清单筛选 + 权重配置抽屉）
- `graph.js` — 产业关系图谱（ECharts graph，行业/区县着色切换，手动缩放降低灵敏度）
- `workbench.js` — 招商专员工作台（KPI、任务清单筛选、今日待办、动态流）
- `project.js` — 招商项目全生命周期（漏斗、卡片网格、6 阶段时间线、详情抽屉、AI 智能推荐）
- `policy.js` — 政策服务（分类侧栏、搜索、卡片网格、详情含匹配企业、同步政策、AI 智能匹配）
- `aidemo.js` — AI 智能体（4 智能体，独立会话上下文，预脚本回复）

**`assets/js/app.js`** — 入口：`render()`、`viewEnterprise()`、`goRisk()`、`handleDispatch()`、`goDispatch()`、一键演示、全局绑定（导航、全屏、区县、时钟、ESC）。

- 全屏按钮在顶栏全局（所有页面），作用于 `.app` 元素；全屏时给 `.app` 切换 `is-fullscreen` class（驱动大屏投影样式）。
- 演示模式停止时（手动或脚本结束）自动回到驾驶舱。

### 关键跨页模式

- **路由**：`state.page` + `APP.renderers[page]()`。`render()` 先销毁全部存活图表、关闭抽屉、清除演示高亮，再调用页面渲染器。
- **渲染间状态持久化**：MOCK 数据原地变更（风险事件状态、新任务等）。
- **闭环工作流**：风险事件 → `handleDispatch` 状态变更（待处置→已派发）+ 生成任务 → 工作台展示 → 任务办结 → 事件状态 → 「已关闭」（闭环；`check_invariants.js` 强制三态模型：待处置 / 已派发 / 已关闭）。
- **双风险视图**：风险页左侧全市平均雷达 + 右侧选中企业雷达叠加平台均值虚线，逐维差值指示。
- **PDF 导出双轨**：默认「导出报告」生成文字版 PDF（jsPDF + autotable + 内嵌中文子集，约 200KB，可选中/可检索）；jspdf 或字体加载失败时静默回退打印视图（`printReportView`）供"另存为 PDF"。

### 设计系统（V4）

现代 SaaS——白色侧栏、蓝→靛渐变（`#2563EB`→`#6366F1`、`--grad-main`）、12px 圆角卡片、柔和阴影、胶囊徽标。风险语义：红/橙/黄/蓝。早期深蓝政务风（#1B3A6B 等）已被有意移除——不要重新引入。

### 移动端适配

完全响应式（桌面 + 移动浏览器）：

- **≤1024px**：侧栏变 off-canvas 抽屉（`body.nav-open`，transform translateX，遮罩）。
- **≤900px**：顶栏换行，全局搜索独占第二行并与产品图标左缘对齐（右侧留白匹配）。演示/全屏/用户区隐藏。KPI 网格降 3 列，双栏布局堆叠单列，`.profile-wrap` / `.ai-wrap` / 工作台网格单列。页签/弹窗/AI 区的宽表格横向滚动（不理想但可用）。
- **≤560px**：进一步压缩——KPI 网格 2 列、品牌名 15px、overview-strip 2 列、智能体列表 1 列、触控目标加大、输入框 ≥16px 防 iOS 自动放大。
- **触控（pointer: coarse）**：导航项 padding 增至 12px。
- 图表随窗口 resize / 屏幕旋转自动 resize。
- 图谱缩放灵敏度：ECharts 默认对双指缩放过敏；roam 设为 `'move'`（仅平移），缩放手动（每滚轮格 0.96，0.5 次幂阻尼）。

### 打包

`demo/` 目录可直接 zip 打包离线演示：全部依赖本地化（ECharts、jsPDF、jspdf-autotable），无 CDN、无构建步骤，支持 `file://` 协议。

## 用户反馈形成的约定

- 标题下不加副标题/说明文字——标题保持裸标题（明确要求）。
- 顶栏仅含：品牌、全局搜索、演示按钮、全屏按钮、用户区。无角色切换器、无 AI 徽章、无面包屑。
- 所有数据保持明确的虚构/模拟性质；页面显著变化时同步更新 `DEMO操作说明.md` 与 `汇报串联脚本.md`。
- 不用 `DEMO_NOW` 固定时钟——所有"今日/近期/逾期"计算使用系统真实日期。
- 产品 LOGO 为大小不一的七颗星（非盾形/对勾形状）。
- 所有列表/导出按钮在列表页统一为「⬇ 导出报表」。
- PDF 导出默认文字版；打印视图是静默兜底，不是独立按钮。
