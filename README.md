# 招商企业服务与智慧监管平台

[![CI](https://github.com/pany4321/zhaoshang/actions/workflows/ci.yml/badge.svg)](https://github.com/pany4321/zhaoshang/actions/workflows/ci.yml)
[![在线演示](https://img.shields.io/badge/在线演示-GitHub_Pages-2563EB)](https://pany4321.github.io/zhaoshang/)
[![License: MIT](https://img.shields.io/badge/License-MIT-22C55E)](LICENSE)

> 🖥️ **在线 demo（纯前端原型）**：<https://pany4321.github.io/zhaoshang/>（登录账号 admin / admin123）

本仓库包含平台的**两种交付形态**，共享同一套视觉设计与功能定义：

- **纯前端高保真原型（`demo/`）**——原版、风格与功能的唯一基准。无后端、无构建、无网络请求，数据全部由 `mock.js` 在浏览器内确定性生成，可直接打开运行，适合演示、评审与原型验证。
- **前后端分离部署版（`server/` + `web/`）**——在原型基础上叠加真实鉴权、后端 API、数据库持久化与工作流闭环，用于可上线部署。前端直接复用 `demo/` 的页面渲染引擎（`web/public/engine/`），保证视觉与交互 1:1 一致。

---

## 一、纯前端高保真原型（DEMO 目录 · 原版 / 视觉与功能基准）

### 1.1 📁 项目结构

```
demo/
├── index.html                 # 单页入口：按序加载全部脚本（经典 <script>，无打包 / 无模块）
├── DEMO操作说明.md            # 操作手册（逐页功能要点、演示模式、跨页闭环路径）
├── 汇报串联脚本.md            # 领导汇报用串联演示方案与脚本
└── assets/
    ├── css/
    │   └── style.css          # 现代 SaaS 设计系统（V3 设计语言，V4 功能）
    ├── data/
    │   └── mock.js            # 模拟数据层（V4）：唯一数据源 + 固定种子 + 派生引擎
    ├── vendor/                # 本地内置第三方库（无 CDN / 完全离线可用）
    │   ├── echarts.min.js                 # 图表
    │   ├── jspdf.umd.min.js               # PDF 生成
    │   ├── jspdf.plugin.autotable.min.js  # PDF 表格插件
    │   └── pdf-font-zh.js                 # 中文子集字体（报告导出）
    └── js/
        ├── app.js             # 引擎入口：路由桥接 + 全局搜索 / 演示模式 / 全屏 / 侧栏
        ├── common/
        │   ├── utils.js       # 工具函数（makeSeededR / mulberry32 等）
        │   ├── state.js       # 全局状态（window.MOCK / APP 命名空间挂载）
        │   ├── components.js  # 通用组件（Toast / 抽屉 / 确认框 / 分页 / 骨架屏）
        │   └── login.js       # 登录门禁（admin / admin123，localStorage 持久化）
        └── pages/             # 9 个页面渲染器（与 web/public/engine 同源）
            ├── dashboard.js   # 招商驾驶舱
            ├── enterprise.js  # 企业名录
            ├── profile.js     # 企业画像
            ├── risk.js        # 风险预警    
            ├── graph.js       # 关系图谱
            ├── workbench.js   # 我的工作台
            ├── project.js     # 项目管理
            ├── policy.js      # 政策服务
            └── aidemo.js      # 招商智能体
```

---

### 1.2 🏗️ 架构说明：纯前端单页原型

原型**不依赖任何后端**，全部逻辑在浏览器内完成：

- **唯一数据源**：`mock.js` 以 IIFE 挂载到 `window.MOCK`（Node 环境退化为 `global.MOCK`）。页面渲染器从 `MOCK` 读取数据，不发起任何 `fetch` / XHR。
- **固定种子可重现**：`SEED = 20260822` + `mulberry32` 伪随机，每次打开数据完全一致（确定性），便于演示与复现。
- **派生引擎**：`MOCK_ENGINE.enrich / deriveAll / rebuild(raw)` 在加载时一次性计算聚合、图谱、AI 日报、政策兑现等派生结构；前后端分离版复用同一引擎做「服务器数据 → MOCK 形状」的 rebuild。
- **视觉 1:1**：设计系统、DOM 结构、组件（Toast / 抽屉 / 确认框 / 分页 / 骨架屏）、图表配置全部内置，零外部依赖。
- **登录门禁**：`login.js` 以 `admin / admin123` 校验（与后端 `/auth/login` 一致），登录态写入 `localStorage('zs_token' / 'zs_user')`，刷新不丢失；仅作演示门禁，无真实权限隔离。
- **离线可用**：第三方库全部本地内置于 `assets/vendor/`，无需联网或安装依赖。

---

### 1.3 🚀 快速开始

#### 前置依赖

- **现代浏览器**（Chrome / Edge / Firefox 等）即可；
- 可选任意静态文件服务器（无需 Node 后端）。

#### 启动方式

- **方式 A（最简单）**：直接双击 `index.html` 用浏览器打开。经典脚本 + 本地 vendor，`file://` 即可运行。
- **方式 B（推荐）**：起一个静态服务器，规避个别浏览器对 `file://` 的限制：

```bash
cd demo
python3 -m http.server 8080    # 或：npx serve .
# 浏览器访问 http://localhost:8080
```

#### 演示账号

| 角色 | 用户名 | 密码 | 说明 |
| ------ | -------- | -------- | ------ |
| 管理员 | `admin` | `admin123` | 全部功能（演示门禁，单角色） |

> 登录页已预填 `admin / admin123`，直接点「登录」即可；登录后顶部左侧显示 `admin`，下方一行显示「系统管理员」。
> 顶部「▶ 演示模式」按钮按 **13 步**自动串接全过程，适合无人值守或标准化汇报；`ESC` 随时退出。

---

### 1.4 🗂️ 功能模块（与全栈版一致）

| 路由 | 页面 | 说明 |
| ------ | ------ | ------ |
| `/dashboard` | 招商驾驶舱 | 10 项 KPI、趋势、目标双环、漏斗、市州对标、区县业绩榜、热力地图、风险态势、产业环图、AI 日报、数据源 |
| `/enterprise` | 企业概况 | 组合筛选、排序、分页、CSV 导出、总览条 |
| `/profile` | 企业画像 | 企业库侧栏 + 六层页签（概况/经营状态/经营趋势/关系网络/企业风险/AI 综合研判）+ 文字版 PDF 报告导出 |
| `/risk` | 风险预警 | 双视图雷达（全市 vs 选中企业）、事件清单筛选、派发处置 |
| `/graph` | 关系图谱 | 力导向图、行业/区县视角、节点图层、招商线索、点击下钻 |
| `/workbench` | 我的工作台 | KPI、今日待办、任务清单（新建/批量完成/导出）、最近动态 |
| `/project` | 招商项目 | 阶段统计、月度趋势、漏斗、卡片网格、详情抽屉（时间线/对接记录/进展备注）、新建项目、AI 智能推荐 |
| `/policy` | 政策服务 | 政策同步、分类导航、卡片网格、详情（匹配企业/兑现进度） |
| `/aidemo` | 招商智能体 | 4 智能体独立会话、快捷问题、会话持久化（localStorage） |

---

### 1.5 🧱 技术栈

- **语言**：原生 JavaScript（经典脚本，无 TypeScript、无打包器）；IIFE + `window.APP` / `window.MOCK` 命名空间（与 `web/public/engine` 同源）。
- **图表**：ECharts 5（本地内置 `echarts.min.js`，以全局变量供引擎使用）。
- **PDF 导出**：jsPDF + autotable + 中文子集字体（`pdf-font-zh.js`），用于企业画像 / 研判报告导出。
- **设计系统**：自研 CSS（`assets/css/style.css`，现代 SaaS V3 设计语言）。
- **依赖分发**：全部第三方库本地内置于 `assets/vendor/`，**无 CDN、完全离线可用**。

---

### 1.6 📊 数据模型

核心实体均来自 `mock.js`，由固定种子确定性生成：

| 实体 | 说明 | 模拟数据量 |
| ------ | ------ | ----------- |
| `Enterprise` 企业 | overview / status / operation / commitments / dynamics / risks / riskScore / riskLevel / shareholders / policies / ai / landMu | 120 家（15 深度建档 + 105 轻量） |
| `RiskEvent` 风险事件 | 三态：待处置 / 已派发 / 已关闭（9 / 31 / 27） | 67 条 |
| `Task` 任务 | 与风险事件联动（待处置→已派发→已关闭）+ 常规任务 | 78 条 |
| `Policy` 政策 | 层级 / 类型 / 部门 / 兑现计划（`POLICY_REDEEM`） | 24 条 |
| `Project` 招商项目 | 6 阶段推进 | 19 个 |
| `Graph` 关系图谱 | 关系网络节点 / 边 | 46 节点 / 117 边 |

- **风险八维加权模型**（`RISK_DIMS`：operation 0.20 / finance 0.15 / judicial 0.15 / credit 0.15 / tender 0.10 / tax 0.10 / perform 0.10 / ip 0.05，合计 = 1）与等级阈值（红 ≥65 / 橙 ≥45 / 黄 ≥25 / 蓝）在 `mock.js` 固化。
- **派生量**：综合风险指数 = Σ(weight × risks[dim])；到位资金 = 协议额 × 进度；兑现率来自 `POLICY_REDEEM`。
- **一致性**：所有汇总 / 明细由同一份种子数据推导，天然对账；`tools/check_invariants.js` 校验风险三态与任务映射不变式。

---

### 1.7 🔧 常用命令

```bash
# 起静态服务器预览（任选其一）
cd demo && python3 -m http.server 8080
npx serve demo

# 校验数据不变式（风险三态 ↔ 任务映射一致性；Node 环境，加载 mock.js）
node tools/check_invariants.js
```

> 重新生成全栈版引擎 mock.js（demo 变更后）：`python tools/build_engine_mock.py`
> 引擎冒烟测试（验证 mock.js 双模式）：`node tools/test_engine_rebuild.cjs`

---

### 1.8 ⚠️ 说明

- 本原型为**演示用途**，数据均为模拟生成（固定种子），不代表任何真实企业。
- AI 智能体使用**预置脚本回复**（`generateReply` 确定性话术），未对接真实大模型；智能体话术中的「九维」为口语口径，实际风险模型为**八维**（见 `mock.js` 的 `RISK_DIMS`）。
- 纯前端**无后端、无鉴权、无持久化落库**：所有交互在内存中，刷新后回到种子初始态（仅登录态由 localStorage 保留）。
- 风险事件派发 / 任务办结等「闭环」为前端内存态演示，不落库；如需真实工作流闭环与落库，请使用前后端分离部署版（见第二部分）。
- 第三方库全部本地内置，**完全离线可用**，无需联网或安装依赖。

---

### 1.9 📝 更新历史（纯前端 DEMO）

- **V4 设计系统 + 功能定型**：9 大模块、八维风险模型、关系图谱、招商智能体（4 智能体 / 12 场景）、演示模式（13 步）、PDF 报告导出。
- 与全栈版（V5）保持**视觉 / 功能 1:1**：全栈版直接复用本目录的页面渲染引擎（`web/public/engine/` 同源）。

---

## 二、前后端分离部署版（server + web）

### 2.1 📁 项目结构

```
政府招商引资风险管理平台/
├── demo/                    # 纯前端高保真原型（原版，V4；风格与功能的唯一基准）
│   ├── index.html
│   └── assets/
├── server/                  # 后端服务（Fastify + Prisma + SQLite）
│   ├── prisma/
│   │   ├── schema.prisma    # 数据模型定义
│   │   └── seed.ts          # 演示数据生成脚本（与 demo mock.js 同源同种子）
│   ├── src/
│   │   ├── index.ts         # Fastify 入口
│   │   ├── routes/          # API 路由（auth/bootstrap/enterprise/risk/project/
│   │   │                    #   workbench/policy/graph/ai/dict/search/dashboard）
│   │   └── utils/           # 工具函数（Prisma、风险模型、helper）
│   ├── data/                # SQLite 数据库文件（git 忽略）
│   └── package.json
├── web/                     # 前端应用（Vue 3 + Vite + TypeScript）
│   ├── public/engine/       # ★ demo 引擎（与 demo 同源的设计系统与页面渲染器）
│   │   ├── style.css        #   设计系统（与 demo/assets/css/style.css 同一份）
│   │   ├── mock.js          #   可重算数据引擎（本地生成 + 服务器数据 rebuild 双模式）
│   │   ├── utils/state/components.js
│   │   ├── pages/           #   9 个页面渲染器（与 demo/assets/js/pages 同源）
│   │   ├── app-core.js      #   引擎入口（路由桥接 + 全局搜索/演示模式/全屏）
│   │   └── vendor/          #   jsPDF + autotable（报告导出）
│   ├── src/
│   │   ├── engine/          # 适配层：server 数据 → MOCK 形状 + 引擎装载器 + 动作同步
│   │   ├── views/engine/    # EngineHost（#content 宿主）
│   │   ├── views/login/     # 登录页
│   │   ├── layout/          # 主布局（复刻 demo 外壳 DOM）
│   │   ├── router/          # 路由（9 个引擎页面 + 登录）
│   │   ├── stores/          # Pinia（用户会话）
│   │   └── utils/           # axios 封装
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
└── README.md                # 本文件
```

---

### 2.2 🏗️ 架构说明：demo 引擎复刻

前端**不重新实现页面**，而是直接复用 demo 的页面渲染引擎（`web/public/engine/`），
Vue 壳只负责：登录鉴权、路由托管、数据下发与工作流动作持久化。

```
登录 → /api/bootstrap 一次性下发全部实体（企业/事件/项目/任务/政策/字典）
     → 适配层 (src/engine/adapter.ts) 映射为 demo 数据形状
     → MOCK_ENGINE.rebuild() 重算全部派生结构（聚合/图谱/AI日报/政策兑现…）
     → 引擎页面渲染器按 demo 原样渲染到 #content
```

- **视觉 1:1**：样式表、DOM 结构、组件（Toast/抽屉/确认框/分页/骨架屏）、
  图表配置全部来自 demo 原文件。
- **数据实时**：页面展示的每个数字都由服务器实体推导（与明细天然对账）。
- **工作流闭环持久化**：风险派发 → 服务端建任务；任务完成 → 服务端办结并联动
  事件闭环；新建项目/企业建档、项目进展备注、政策入库、AI 会话历史均同步后端。
- **离线降级**：`/api/bootstrap` 不可用时自动回退内置种子数据（与 demo 完全一致）。

---

### 2.3 🚀 快速开始

#### 前置依赖

- **Node.js** ≥ 18
- **npm**

#### 一键启动（推荐）

```bash
# 1. 安装后端依赖并初始化数据
cd server
npm install
npm run db:migrate    # 初始化数据库表
npm run db:seed       # 生成 120 家企业 + 67 条风险事件 + 19 个项目等演示数据
npm run dev           # 启动后端服务 (http://localhost:3000)

# 2. 新开一个终端，启动前端
cd web
npm install
npm run dev           # 启动前端开发服务器 (http://localhost:5173)
```

#### 访问地址

- 前端：<http://localhost:5173>
- 后端 API：<http://localhost:3000/api>
- 健康检查：<http://localhost:3000/api/health>

#### 演示账号

| 角色 | 用户名 | 密码 | 说明 |
| ------ | -------- | ------ | ------ |
| 管理员 | `admin` | `admin123` | 全部权限 |
| 领导 | `leader` | `leader123` | 查看驾驶舱、风险、图谱等 |
| 招商专员 | `zhaoshang01` | `123456` | 工作台、项目跟进、任务处理 |
| 招商专员 | `zhaoshang02` | `123456` | 庆城县专员 |
| 招商专员 | `invest_zhang` | `123456` | 西峰区 |

---

### 2.4 🗂️ 功能模块（与 demo 完全一致）

| 路由 | 页面 | 说明 |
| ------ | ------ | ------ |
| `/dashboard` | 招商驾驶舱 | 10 项 KPI、趋势、目标双环、漏斗、市州对标、区县业绩榜、热力地图、风险态势、产业环图、AI 日报、数据源 |
| `/enterprise` | 企业概况 | 组合筛选、排序、分页、CSV 导出、总览条 |
| `/profile` | 企业画像 | 企业库侧栏 + 六层页签（概况/经营状态/经营趋势/关系网络/企业风险/AI 综合研判）+ 文字版 PDF 报告导出 |
| `/risk` | 风险预警 | 双视图雷达（全市 vs 选中企业）、事件清单筛选、派发处置 |
| `/graph` | 关系图谱 | 力导向图、行业/区县视角、节点图层、招商线索、点击下钻 |
| `/workbench` | 我的工作台 | KPI、今日待办、任务清单（新建/批量完成/导出）、最近动态 |
| `/project` | 招商项目 | 阶段统计、月度趋势、漏斗、卡片网格、详情抽屉（时间线/对接记录/进展备注）、新建项目、AI 智能推荐 |
| `/policy` | 政策服务 | 政策同步、分类导航、卡片网格、详情（匹配企业/兑现进度） |
| `/aidemo` | 招商智能体 | 4 智能体独立会话、快捷问题、会话持久化 |

---

### 2.5 🧱 技术栈

#### 后端

- **Fastify** 4.28 — Web 框架
- **Prisma** 5.20 — ORM & 迁移
- **SQLite** — 嵌入式数据库（演示专用）
- **TypeScript** 5.5、**@fastify/jwt**、**@fastify/cors**、**bcryptjs**

#### 前端

- **Vue 3** + **TypeScript** + **Vite 5**
- **Vue Router 4** + **Pinia** + **Axios**
- **ECharts 5**（以全局变量供引擎使用）
- **demo 引擎**（`public/engine/`，原生 JS，IIFE + `window.APP` 命名空间，与 demo 同源）

#### 关键接口

| 接口 | 说明 |
| ------ | ------ |
| `GET /api/bootstrap` | 一次性聚合下发全部实体（前端引导数据源） |
| `POST /api/risk/:id/dispatch` | 风险事件派发（服务端生成任务、事件转在办） |
| `POST /api/workbench/tasks/:id/finish` | 任务办结（联动风险事件闭环） |
| `POST /api/workbench/tasks` | 新建任务 |
| `POST /api/enterprise` · `POST /api/project` | 招商建档（企业 + 项目） |
| `POST /api/project/:id/note` | 项目阶段进展备注 |
| `POST /api/policy` | 政策入库 |
| `GET/POST /api/ai/history·sync/:agentType` | AI 会话持久化 |

---

### 2.6 📊 数据模型

核心数据表：

| 表名 | 说明 | 演示数据量 |
| ------ | ------ | ----------- |
| `District` | 区县 | 8 个 |
| `Industry` | 行业 | 12 个 |
| `User` | 用户 | 7 个 |
| `Enterprise` | 企业 | 120 家（含股东） |
| `RiskEvent` | 风险事件 | 67 条 |
| `Task` | 任务 | 78 条 |
| `Project` | 招商项目 | 19 个 |
| `Policy` | 政策 | 24 条 |
| `AiConversation` | AI 对话 | 运行时生成 |

风险八维加权模型与等级阈值（红≥65 / 橙≥45 / 黄≥25 / 蓝）与 demo `mock.js` 同源。

---

### 2.7 🔧 常用命令

#### 后端 (`server/`)

```bash
cd server
npm run dev           # 开发模式（tsx watch）
npm run db:generate   # 生成 Prisma Client
npm run db:migrate    # 执行迁移
npm run db:seed       # 填充演示数据
npm run db:reset      # 清空 + 迁移 + 重新填充
npm run build && npm start   # 生产构建与启动
```

#### 前端 (`web/`)

```bash
cd web
npm run dev           # 开发模式
npm run build         # 类型检查 + 生产构建
npm run preview       # 本地预览生产构建
```

> 引擎冒烟测试（Node 环境，验证 mock.js 双模式）：`node tools/test_engine_rebuild.cjs`
> 重新生成引擎版 mock.js（demo 变更后）：`python tools/build_engine_mock.py`
> 全量测试套件（含接口回归，server 运行中时自动包含）：`node tools/run_all.cjs`

> **数据口径（单一事实源）**：server 演示数据由 `demo/assets/data/mock.js` 导出的
> `server/prisma/demo-fixtures.json` 驱动（`node tools/export_demo_fixtures.cjs` 重新导出），
> 与纯前端 demo 完全同口径（120 家企业 / 67 条风险事件 / 78 条任务 / 24 条政策 / 19 个项目）。
> 对账校验：`node tools/check_data_parity.cjs`。

---

### 2.8 🔄 数据重置

**自动重置（推荐）**：每次在登录页**单击"登 录"按钮**成功后，系统自动清空业务数据并按 demo 口径（demo-fixtures.json）重新填充（约 2–3 秒）——每场演示从干净态开始，无需手动操作。演示期间（派发、新建等）产生的数据只保留在当次会话，重新登录即消失。

**手动重置**（可选，如需在未登录状态下重建数据库）：

```bash
cd server
npm run db:reset
```

数据生成使用固定种子（SEED=20260822），每次重置后数据完全一致。

---

### 2.9 🏭 部署（生产环境）

#### 方式一：单服务部署（推荐）

```bash
cd web && npm run build
cp -r dist/* ../server/public/   # 后端静态托管前端（SPA 兜底已内置）
cd ../server && npm run build && npm start
```

访问 `http://服务器IP:3000` 即可。

#### 方式二：前后端分离部署

- 前端 dist 部署到 Nginx / OSS
- 后端独立运行，配置 Nginx 反向代理 `/api`

---

### 2.10 ⚠️ 说明

- 本系统为**演示用途**，数据均为模拟生成，不代表任何真实企业
- AI 智能体使用**预置脚本回复**，未对接真实大模型
- SQLite 适合单机演示，生产环境建议更换为 PostgreSQL / MySQL
- JWT 密钥请在部署时更换为安全随机字符串

---

### 2.11 📝 更新历史（V4 → V5 前后端分离版）

- ✅ 后端 API：Fastify + Prisma + SQLite（JWT 登录、bootstrap 聚合下发、工作流闭环接口）
- ✅ 前端重构：Vue 3 壳 + **demo 引擎复刻**（视觉、布局、交互与纯前端版 1:1，数据改为服务器实时推导）
- ✅ 登录鉴权：JWT + 多角色
- ✅ 数据持久化：SQLite（派发/办结/建档/备注/政策/AI 会话全部落库）
- ✅ 数据重置：一键 seed 脚本
- ✅ 9 大功能模块全部在线
