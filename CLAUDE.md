# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

Deliverables folder for the《招商企业服务与智慧监管平台》(Enterprise Service & Smart Supervision Platform, targeting Qingyang City 庆阳市) proposal — not a production application:

- `招商企业服务与智慧监管平台_系统需求分析说明书_V5.0_深化版.md` — the requirements spec (V5.0 深化版, **current source of truth**). Supersedes the older V3.1 / V4.0 / V5.0 drafts. Authoritative for business logic: an **8-dimension** weighted risk model and its weights, red/orange/yellow/blue risk levels, user roles, AI capability matrix, data architecture. (The earlier V3.1 draft described a "nine-dimension" model; the shipped demo/engine uses 8 dimensions — see `RISK_DIMS` in `demo/assets/data/mock.js`.)
- `demo/` — pure-frontend high-fidelity interactive prototype (multi-file; design-system V4, feature set aligned to V5.0 深化版). **The design & behavior baseline.**
- `server/` — Backend (Fastify + Prisma + SQLite + TypeScript), part of the V5 full-stack rewrite.
- `web/` — Frontend (Vue 3 + Vite + Pinia shell) that **vendors the demo engine** under `web/public/engine/` (same style.css, page renderers, components as `demo/`) and replays server data through it. Do NOT rewrite pages in Vue — extend the engine.
- `README.md` — Quick-start guide for the V5 full-stack version.

The V5 full-stack version (`server/` + `web/`) replicates all 9 demo pages 1:1: `GET /api/bootstrap` ships all entities once, `web/src/engine/adapter.ts` maps them to the demo MOCK shapes, and `MOCK_ENGINE.rebuild()` (in `web/public/engine/mock.js`) recomputes every derived structure (aggregates, graph, AI daily, policy redemption) so all page numbers reconcile with server data. **Server data is fixtures-driven**: `tools/export_demo_fixtures.cjs` exports the demo MOCK entities (demo 口径: 120 enterprises / 67 risk events / 78 tasks / 24 policies / 19 projects) to `server/prisma/demo-fixtures.json`, and `server/prisma/seed-data.ts` just persists that JSON — demo is the single source of truth; `tools/check_data_parity.cjs` (in run_all) fails on any drift. Workflow actions (risk dispatch, task finish, enterprise/project creation, stage notes, policy intake, AI conversations) persist to the backend via `APP.sync` hooks (`web/src/engine/engine.ts`). If the API is unreachable the engine falls back to the built-in seeded demo data and `MainLayout` shows a "⚠ 本地演示数据" badge (via `engineSource` ref from `engine.ts`). A successful login (`POST /api/auth/login` → frontend calls `POST /api/auth/reset-demo`) resets all demo data back to the seeded state, so every demo session starts clean; the frontend then does a full-page navigation so the engine re-boots on fresh data.

- `demo/DEMO操作说明.md`, `demo/汇报串联脚本.md` — demo manual and presentation script.
- `系统原型改进大纲_V4.md` — V4 improvement roadmap and status.
- `tools/make_pdf_font.py` — generates the Chinese font subset for text-mode PDF export.
- `tools/verify_pdf_export.js` — JSDOM-based smoke test for text-mode PDF export.
- `tools/sync_engine.py` — syncs shared engine files (`utils/state/components/pages/*.js`) from `demo/` to `web/public/engine/` and re-runs the mock generator; `--check` verifies only (exit 1 on drift). Not synced (intentionally diverged/generated): `mock.js` (generated), `app-core.js` (Vue-Router-hosted rewrite of demo `app.js`), `style.css` (shell styles live in MainLayout.vue), `vendor/`. Run after any demo engine change.
- `tools/export_demo_fixtures.cjs` — exports demo MOCK entities to `server/prisma/demo-fixtures.json` (server-shaped: reverse dimension/status/type maps, 9 risk dims). Run after any demo mock.js change, before `npm run db:seed`.
- `tools/check_data_parity.cjs` — parity check: demo MOCK vs `demo-fixtures.json` (entity counts, ID sets, name order, risk distributions, referential integrity). Offline; in run_all.
- `tools/verify_web_api.cjs` — web API regression against a running server (login → bootstrap-vs-fixtures counts → dirty task → reset-demo restores baseline → 401 without auth). Requires `cd server && npm run dev`; run_all skips it when the server is down.
- `tools/build_engine_mock.py` — regenerates `web/public/engine/mock.js` from `demo/assets/data/mock.js`: copies it verbatim (demo mock.js is already the injectable-RNG shape: `enrich`/`deriveAll` take `R`, bodies use `R.*`, own `return`), strips the old export block, and appends the unified export + `MOCK_ENGINE` (`rebuild` replaces the closure arrays **in place** so `entById` etc. stay in sync with `global.MOCK`). Self-checks `R.R.` double-prefix and brace balance.
- `tools/run_all.cjs` — unified test entry: runs the whole suite below plus the API regression (skipped when server is down) and exits non-zero on any failure (`npm test`).
- `tools/test_engine_rebuild.cjs` — Node smoke test for the engine mock (local generation output + server-data rebuild path).
- `tools/smoke_test.js` — JSDOM smoke test: loads the demo's JS files, renders all 9 pages, asserts `#content` is non-trivial. Must be run from the repo root (path joins `../demo`).
- `tools/smoke_interaction.js` — JSDOM interaction smoke test: data reconciliation + full drill-down chain (dispatch → task → complete → closed loop). Exits non-zero when any assertion prints ❌.
- `tools/check_invariants.js` — risk-event three-state-model invariant check (status legality, event↔task mapping, count conservation, temporal consistency).
- `.workbuddy/memory/` — work logs from prior development sessions.

Hosted on GitHub (`pany4321/zhaoshang`, branch `master`): CI (`.github/workflows/ci.yml`) runs `npm test` + `npm run build:web` on every push/PR; `deploy-demo.yml` publishes `demo/` to GitHub Pages at https://pany4321.github.io/zhaoshang/ on demo changes. MIT LICENSE. The root `package.json` exists **only** as the workflow entry point (sync / fixtures / parity / test / build scripts — see the mandatory tooling workflow above); the demo itself still has no build step. All UI text and docs are Chinese (zh-CN).

## Running the demo

Open `demo/index.html` directly in a browser (Chrome/Edge). ECharts is vendored at `demo/assets/vendor/echarts.min.js`, so it runs fully offline. If the environment restricts local-file script loading: `python -m http.server 8080` from `demo/`, then visit `http://localhost:8080`.

## Mandatory tooling workflow (tools/ 触发矩阵)

**完成定义**：任何代码改动，其"改动对象"在下方触发矩阵中对应的必跑命令全部通过、且 `npm test` 全绿，才算完成。根目录 `package.json` 是统一入口（`sync` / `sync:check` / `fixtures` / `parity` / `test` / `test:api` / `build:web` / `seed`），不要手敲长命令。

### 触发矩阵（改动对象 → 必跑，按序执行）

| 改动对象 | 必跑命令（按序） |
| --- | --- |
| `demo/assets/js/**`（页面与公共模块） | `npm run sync` → `npm test` → `npm run build:web` |
| `demo/assets/data/mock.js` | `npm run sync`（内含 mock.js 再生）→ `npm run fixtures` → `npm test` → `npm run build:web` |
| `demo/assets/css/style.css` | 手工同步 web 壳层样式（两版有意分化，无自动同步）→ `npm test` → `npm run build:web` |
| `demo/index.html`、`demo/assets/js/common/login.js` | `npm test`（verify_login 覆盖登录门禁） |
| 区划地图边界重绘（GEO_QINGYANG） | `python tools/update_geo.py` 或 `update_geo_dense.py`（写 demo mock.js）→ 按 mock.js 行全链 |
| PDF 字体子集来源或字符集变化 | `python tools/make_pdf_font.py` → `node tools/verify_pdf_export.js` → `npm test` |
| `web/public/engine/**` | **原则上禁止直改**——回 demo 改后走 sync（仅 `app-core.js`、`style.css`、`vendor/` 属分化例外；直改后 `npm test` + `npm run build:web`） |
| `web/src/**`（壳层 / engine.ts / adapter.ts） | `npm run build:web` → `npm test`（server 运行时自动含接口回归）；adapter 字段映射变更时另跑 `npm run fixtures` → `npm run parity` |
| `server/prisma/schema.prisma` | `db:migrate` → 对照 `export_demo_fixtures.cjs` 的字段映射 → `npm run fixtures` → `npm run seed` → `npm run test:api` |
| `server/src/**`（接口/服务） | `npm test`（server 运行时 verify_web_api 自动包含；未运行则 `npm run test:api`） |
| `tools/export_demo_fixtures.cjs` 映射逻辑 | `npm run fixtures` → `npm run parity` → `npm run test:api` |
| 需求说明书 / DEMO 文档 | 无自动校验；一切数据底数以 `npm run parity` 的输出为准，不得写入与 demo/server 冲突的数字 |

### 工具速览（tools/ 全部 20 个，各自归位）

**同步/生成（demo 是唯一基准，改 demo 后必跑）**
- `sync_engine.py` — demo 引擎文件 → `web/public/engine/`（内含 mock.js 再生）；`--check` 仅校验。`run_all` 首步自动执行该校验。
- `build_engine_mock.py` — demo mock.js → web mock.js（由 sync_engine 代跑，含 `R.R.`/括号自检）。
- `export_demo_fixtures.cjs` — demo mock → `server/prisma/demo-fixtures.json`（server seed 的唯一数据源）。
- `make_pdf_font.py` — 生成 PDF 中文子集 `demo/assets/vendor/pdf-font-zh.js`（仅字体来源或字符集变化时）。
- `update_geo.py` / `update_geo_dense.py` — 按区划图重构 mock.js 的 GEO_QINGYANG 边界（仅地图重绘时）。

**测试/校验（由 run_all 编排，一般不单独跑）**
- `run_all.cjs` — 统一入口：首步引擎一致性前置检查（漂移即失败）→ 9 个静态脚本 → server 在跑时追加接口回归（未运行 SKIP 并提示启动命令）。`npm test` 即它。
- `smoke_test.js`（9 页渲染）、`smoke_interaction.js`（数据对账+下钻链路，失败即非零退出）、`check_invariants.js`（风险三态不变量）、`check_data_parity.cjs`（fixtures 对账）、`test_engine_rebuild.cjs`（web mock rebuild）、`verify_login.cjs`（demo 登录门禁）、`verify_industry_responsive.cjs`、`verify_profile_responsive.cjs`、`verify_policy_jump.cjs`（专项回归）、`verify_web_api.cjs`（server 接口链路，需运行中 server）、`verify_pdf_export.js`（PDF 导出全流程）。

**诊断（按需，不进 run_all）**
- `scan_balance.py` / `trace_depth.py` — mock.js 括号配平与结构标记定位（排查生成产物时用）。

### 强制规则

1. `npm test` 的首步就是引擎一致性前置检查——"改了 demo 忘了同步 web"在这一步被拦截，不得绕过。
2. AI 协作与会话工作流：任何改动的收尾必须包含 `npm test` 全绿（涉 web 另加 build），否则不得声称完成。
3. `verify_web_api` 会重置演示数据库（固定种子 fixtures，无真实数据），依赖运行中的 server；未运行时 run_all 显示 `[SKIP]` 并给出启动命令。
4. smoke_test.js 逐文件加载 demo JS 到 JSDOM（runScripts: 'outside-only'），stub `window.echarts` 的 `init()`（`{setOption, dispose, resize, on}`）**和** `echarts.graphic.LinearGradient`/`RadialGradient`（含 `addColorStop`）；结尾 `process.exit(0)`（app.js 的 `setInterval` 时钟否则让 node 永不退出）。

## V4 Demo architecture

### Module layout & load order

Load order matters (`index.html`):

```
echarts.min.js → jspdf.umd.min.js → jspdf.plugin.autotable.min.js → mock.js → utils.js → state.js → components.js → pages/*.js → app.js
```

All modules use IIFE + `window.APP.*` namespace (not ES modules). Pages self-register via `APP.registerRenderer(key, fn)`.

- `pdf-font-zh.js` is **not** loaded statically — it's lazy-loaded by profile.js only when the user clicks "导出报告" (text-mode PDF export).

**`assets/data/mock.js`** — IIFE exporting everything as `window.MOCK`:

- 120 enterprises (`ENTERPRISES`, 15 deep + 105 light), 8 districts, 12 industries
- 8-dimension weighted risk model (`RISK_DIMS` — 8 entries, `calcRiskScore`, `scoreToLevel`, `LEVELS`)
- All aggregates (district totals, industry totals, city totals, risk counts) derived from enterprise data via reduce — **naturally reconciled**
- **67** risk events (`RISK_EVENTS`: 待处置 9 / 已派发 31 / 已关闭 27); **19** projects (`PROJECTS`, across 6 stages); **78** tasks (`TASKS`: 风险处置 58 / 政策推送 8 / 企业服务 5 / 项目跟进 4 / 日常巡检 3)
- 24-policy library (`POLICY_LIB`), relationship graph (`GRAPH` with **46 nodes / 117 links**)
- `AI_DAILY` generated from live data, `DEMO_SCRIPT` for one-click demo
- Seeded PRNG (mulberry32, SEED=20260822) for stable demo data
- Risk thresholds: red ≥65, orange ≥45, yellow ≥25, blue below. Enterprise risk-level distribution: 红 2 / 橙 7 / 黄 29 / 蓝 82 (total 120).
- No DEMO_NOW — uses `new Date()` (system clock) for all "today/recent/overdue"

**`assets/js/common/utils.js`** — `window.APP.U`: DOM helpers (`$`, `$$`, `el`), HTML escape, number formatting (`fmtNum`, `fmtWan`), date utilities (`fmtDate`, `fmtDateTime`, `daysAgo`, `daysFromNow`, `inLastNDays`), seeded PRNG (`makeRng`, `pick`, `randInt`, `randFloat`, `randBool`).

**`assets/js/common/state.js`** — `window.APP.state`: global state object (page, ent, district, dispatched, filter per-page), `liveCharts` array, `renderers` map, `registerRenderer()`, `mkChart()`, `disposeCharts()`.

**`assets/js/common/components.js`** — `window.APP.Components`: Toast (4 types), Confirm Modal, Drawer, Empty state, Pagination, Table sort, Skeleton, `lvlBadge()`, CSV export with UTF-8 BOM (data URI, stable Chinese filenames). All floating layers (toast/confirm/drawer) append to `.app` (not `body`) so they remain visible in fullscreen mode.

**`assets/js/pages/*.js`** — 9 page modules, each self-registering a renderer:

- `dashboard.js` — 领导智能驾驶舱 (8+ KPIs, trend, TOP5, map, risk bar, industry pie, AI daily)
- `enterprise.js` — 企业档案库 (multi-filter, sort, pagination, CSV export)
- `profile.js` — 企业 360° 画像 (6 tabs, risk matrix, AI analysis, policy matching, text-mode PDF export)
- `risk.js` — 风险预警中心 (dual-view radar + event list with filters)
- `graph.js` — 产业关系图谱 (ECharts graph, by industry/district toggle, manual zoom for reduced sensitivity)
- `workbench.js` — 招商专员工作台 (KPIs, task list with filters, today's todos, activity feed)
- `project.js` — 招商项目全生命周期 (funnel, card grid, 6-stage timeline, detail drawer)
- `policy.js` — 政策服务 (category sidebar, search, card grid, detail with matched enterprises)
- `aidemo.js` — AI 智能体 (4 agents, independent conversation contexts, pre-scripted replies)

**`assets/js/app.js`** — entry point: `render()`, `viewEnterprise()`, `goRisk()`, `handleDispatch()`, `goDispatch()`, one-click demo, global bindings (nav, fullscreen, district, clock, ESC).

- Fullscreen button is global in the header (all pages), targets `.app` element.
- Demo mode auto-returns to dashboard on stop (manual or end-of-script).

### Key cross-page patterns

- **Router**: `state.page` + `APP.renderers[page]()`. `render()` disposes all live charts, closes drawers, clears demo highlights, then calls the page renderer.
- **State persistence across renders**: MOCK data is mutated in place (risk event status changes, new tasks, etc.).
- **Closed-loop workflow**: risk event → `handleDispatch` changes status (待处置→已派发) + pushes task → workbench shows it → task completion → risk event status → "已关闭" (closed loop; `check_invariants.js` enforces the three-state model: 待处置 / 已派发 / 已关闭).
- **Dual risk view**: Risk page shows both platform-wide average radar (left) and selected-enterprise radar with platform-average overlay (right), with per-dimension diff indicators.
- **PDF export dual-track**: Default "导出报告" generates text-mode PDF (jsPDF + autotable + embedded Chinese font subset, ~200KB, selectable/searchable); if jspdf or the font fails to load, silently falls back to a print view (`printReportView`) that the user can "Save as PDF" from.

### Design system (V4)

Modern SaaS — white sidebar, blue→indigo gradient (`#2563EB`→`#6366F1`, `--grad-main`), 12px-radius cards, soft shadows, pill badges. Risk semantics: red/orange/yellow/blue. Earlier dark-blue government styling (#1B3A6B etc.) was deliberately removed — don't reintroduce it.

### Mobile adaptation

Fully responsive (desktop + mobile browsers):

- **≤1024px**: Sidebar becomes an off-canvas drawer (`body.nav-open` class, `transform` translateX, mask).
- **≤900px**: Header wraps, global search moves to its own second row and aligns with the product icon left edge (with matching right-side breathing room). Demo / fullscreen / user area are hidden in mobile. KPI grids drop to 3 columns, two-column layouts stack to single column, `.profile-wrap` / `.ai-wrap` / workbench grid all go single-column. Wide tables inside tab-panes/modals/ai-sections get horizontal scroll (not ideal but functional).
- **≤560px**: Further compression — KPI grid 2 columns, brand name 15px, overview-strip 2 cols, agent list 1 col, touch targets enlarged, inputs ≥16px to avoid iOS auto-zoom.
- **Touch (pointer: coarse)**: Nav item padding increased to 12px.
- Charts auto-resize on window resize / orientation change.
- Graph zoom sensitivity: ECharts default zoom is too sensitive for pinch-zoom; roam is set to `'move'` (pan only) and zoom is handled manually with reduced step (0.96 per wheel tick, 0.5 power damping for pinch).

### Packaging

The `demo/` folder is directly zip-packable and sendable for offline demonstration: all dependencies are vendored (ECharts, jsPDF, jspdf-autotable), no CDN, no build step, works with `file://` protocol.

## Conventions from user feedback

- No subtitle/explanatory text under headings — titles stay bare (explicitly requested).
- Header holds only: brand, global search, demo button, fullscreen button, district selector, clock, user avatar. No role switcher, no AI badge, no breadcrumbs.
- All data must remain clearly fictional/simulated; when pages change significantly, update `DEMO操作说明.md` and `汇报串联脚本.md` to match.
- No `DEMO_NOW` fixed clock — use the system's real date for all "today/recent/overdue" calculations.
- Product logo is 7 stars of varying sizes (not a shield/checkmark shape).
- All list/export buttons say "⬇ 导出报表" uniformly across list pages.
- PDF export is text-mode by default; print view is a silent fallback, not a separate button.
