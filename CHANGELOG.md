# 更新日志

> 仓库性质：《招商企业服务与智慧监管平台》（庆阳市）提案交付物，非生产应用。
> 版本号对应根 `package.json` 的 `version` 与 git tag；日期为交付日期。

---

## v5.1.1 — 2026-10-22 · 数据口径修复：样本回归「全真实财务」

### 一、问题（严重，线上可见）

- 10-22 02:00 的每日同步任务按「8 区县各 15 家**注册资本最大**」重取企业并覆盖 `enterprises.csv`，
  但**未同步更新** `annual_report.csv` / `id_map.csv`。原 88 家有年报财务的企业中 **62 家被挤掉**，
  新进的 73 家没有年报记录，`gen_real_fixtures.py` 遂用 `build_ops()` 推导营收/纳税/投资额填充。
- 结果：线上 **120 家企业中仅 25 家有真实年报财务，95 家为推导值**——违反「所有企业必须有真实财务数据」的硬性要求。

### 二、修复

- 按 `annual_report.csv` 中已确认「营业收入 > 0」的 88 个信用代码，从 Doris **精确回捞**企业基础信息
  （`credit_no IN (...)`，避免大表 JOIN 超时），重建 `enterprises.csv` 为 88 家。
- `gen_real_fixtures.py`：`load_financials()` 改为「**只在与营收记录的年份里取最近一年**」，
  修复 9 家「早年有营收、最新年报未公示」被误判为无财务的问题。
- `gen_real_fixtures.py` 新增**硬断言**：任一企业 `finYear` 为空即 `exit(1)` 拒绝生成并列出企业名。
  凑数从此会让构建直接失败，不可能再静默上线。
- 补齐 9 家缺失的国标行业（Doris `company_industry` → 本地快照 `data-import/national/company_industry.csv`），
  覆盖率恢复 88/88 = 100%，服务自检的 ≥95% 基线重新满足。
- 重写每日同步任务：删除「按注册资本排名每区县取 15 家」的逻辑，改为从年报名单锚点刷新；
  明确写入「宁可样本少，不许推导值凑数」「企业总数不写死 120」。

### 三、结果

| 指标 | 修复前 | 修复后 |
|---|---|---|
| 企业总数 | 120 | 88 |
| 有真实年报财务 | 25 | **88** |
| 推导值企业 | **95** | **0** |
| 国标行业覆盖 | 79/88（89.8%） | **88/88（100%）** |
| 营收合计 | 98.3 亿（含推导） | 91.7 亿（全真实） |
| 纳税合计 | — | 6.84 亿（全真实） |

区县分布：镇原 14、环县 14、正宁 13、合水 13、宁县 11、庆城 9、西峰 8、华池 6。

### 四、顺带修复

- **Prisma Client 路径污染**：`.prisma/client` 内烧录的 schema 路径曾指向已删除的临时副本
  （此前复现 CI 时产生），会导致任何新进程及服务重启后无法打开数据库。已重新 `prisma generate` 修正。
- 三个定时任务（数据同步 / 备份 / 巡检）的投递目标由飞书改为微信——飞书机器人已被移出会话，长期投递失败。

### 五、已知项（不掩盖）

- 样本量随每日同步变动，一切以 `python3 tools/gen_real_fixtures.py` 的输出为准；本文数字核对于 2026-10-22。
- 固定资产投资 / 带动就业 / 占地 / 亩均税收仍为推导值（年报无对应口径），本次未真实化。
- 知识产权覆盖率 26/88（29.5%），为样本特征（能源/基建类居多），非取数遗漏。

---

## v5.1.0 — 2026-10-21 · 真实数据接入与上线加固

本次为**重要版本变化**：系统从「纯演示原型」升级为「接真实数据仓库、接真实大模型、具备上线加固能力」的单体部署版。原有 9 个页面与交互全部保留，页面无破坏性变更。

### 一、数据：从演示数据到数据仓库直连

- **接入水滴信用数据仓库（Doris `daas` 库）**，经 MCP 查询接口取数，新增 `server/src/services/mcpClient.ts`、`dorisTools.ts`。系统内事实数据不再由前端 mock 生成。
- **样本 79 家企业全部为真实工商公示数据**：工商照面、年报财务（营收/纳税/资产/净利润）覆盖 79/79，股东与持股比例 79/79（174 条），国标行业三分类 79/79。另有专利 237 项、商标 125 件、司法案件 427 件、行政处罚 38 条、经营异常 16 条、股权出质 18 条、动产抵押 2 条、分支机构 125 条。
- **样本口径**：庆阳 8 区县、存续、公司制、**必须在工商年报中公示了数值型财务数据**。79 家不是庆阳全部企业，而是定向样本——详见 `docs/数据口径说明.md`。
- **两套行业口径并存**：`industryId`（招商 12 重点产业，规则推导，C 类）与 `nationalIndustry`（2017 国标，官方公示，A 类，100% 覆盖）。对外引用须先确认用哪一套。
- **招商候选池** 325 家真实外部企业（线索池，含准入校验 `tools/verify_ai_lead_admission.js`）。
- 数据模型扩展 **9 个 Prisma migration**：企业深度、司法案件、审计日志与登录安全、财务、企业记录、AI 分析、国标行业、候选池、线索允许空地理。

### 二、AI：接入真实大模型

- 新增 `server/src/services/llm.ts`（OpenAI 兼容协议）与 `aiTools.ts`，AI 日报、风险研判、企业画像、政策匹配四个按钮走真实模型，非模板拼装。
- AI 分析结果落库（`add_ai_analysis` 迁移），支持复用与降级统计；模型不可用时按降级处理并在 `/api/system/metrics` 暴露 AI 降级率。
- 大模型接入参数**仅本地 `.env` 保存**，仓库只提交 `.env.example` 占位模板。

### 三、上线加固（P0，原 4 项 + 本次新增 6 项）

新增：接口限流（登录 10 次/分、全局 300 次/分）、500 错误脱敏（统一文案 + `requestId`）、优雅退出（SIGTERM 释放端口）、生产可观测（`logger.level=warn`、慢请求 >1s 打 `[SLOW]`）、启动自检 8 项（`GET /api/system/selfcheck`）、安全响应头。原已有：审计日志、账号安全（错 5 次锁定／改密复杂度）、数据备份（进程内 03:00，保留 14 份）、全局鉴权收口。

### 四、可靠性（P1，新增 4 项 + 修复 1 项）

- 新增 `services/dailySync.ts`：进程内每 30 分钟检查，**仅在数据版本变化时重建**。修复了首版「距上次同步超 24h 无条件重跑」会把用户新建任务/项目/政策清空的隐患。
- 新增 `GET /api/system/metrics`（uptime/RSS/heap/库体积/备份份数/AI 降级率/自检结论）、前端产物就绪校验、请求与连接超时。

### 五、性能

- 新增 `tools/precompress.mjs` + `publish.mjs`：为 `server/public` 文本资源生成 `.br`/`.gz`，配合 `@fastify/static { preCompressed: true }`。首屏传输 1.84MB → 444KB（br），为主要收益来源。
- `tools/measure_first_screen.py`：冷启动首屏体积核算工具。

### 六、运维工具链（新增 15 个脚本）

`backup_db.mjs` / `restore_db.mjs`（备份与还原）、`health_check.sh`、`presence_check.sh`（体检）、`tunnel_check.sh` / `tunnel_guard.sh`（Cloudflare Named Tunnel 探测与自愈）、`keepalive.sh` / `zhaoshang_watchdog.sh`（保活）、`cf_setup.py` / `cf_set_ingress.py`（隧道与 DNS 配置，凭据从环境变量读）、`pre-commit-check.sh`（提交前凭据泄漏拦截）、`gen_real_fixtures.py`（真实数据生成）、`verify_ai_lead_admission.js`。

### 七、文档

- 新增 `docs/数据口径说明.md`：数据可信度四层（A 事实／B 聚合／C 推导／D 演示）、逐字段来源与覆盖率、已知缺口、对外引用建议。**界面按需求不标注数据来源，本文为唯一口径依据。**
- 新增 `docs/上线加固与运维说明.md`：P0/P1 修复记录与实测证据、明确未做/做不了的项及原因。

### 八、前端

- `web/src/engine/engine.ts` 引入 `ENGINE_VER` 缓存失效机制；`index.html` 中 `style.css` 链接同步带 `?v=`（因 Cloudflare 会覆写源站 Cache-Control）。
- `EngineHost.vue`、`adapter.ts`、`main.ts` 适配真实数据形状；API 不可达时回退内置演示数据并显示「⚠ 本地演示数据」角标。

### 九、已知项（不掩盖）

| 项 | 说明 |
|---|---|
| 外部告警通道（短信/钉钉/企微/邮件） | **未做**。无第三方告警凭据，以启动自检 + `/api/system/selfcheck` 主动拉取替代 |
| MFA / 二次验证 | **未做**。需求未提出，需单独立项 |
| 备份恢复演练 | **未做**。工具具备，需维护窗口停服验证 |
| `tsc` 类型债 | **未清理**。既存问题，不影响产物与运行 |
| 首屏 1.09s 公网实测 | **仍是估算值**。本地压缩比已实测，公网测速需额外凭据 |
| 运维脚本内绝对路径 | `restart.sh`、`tools/*.sh|py`、`tunnelGuard.ts` 共 11 处硬编码部署路径，含环境标识；不影响功能，后续版本抽为配置 |
| 真实企业名硬编码 | `demo/assets/js/pages/aidemo.js`、`web/public/engine/pages/aidemo.js`、`server/scripts/add_today_todos.mjs` 共 6 处示例文案使用真实企业名（企业信息本身为公开工商公示数据） |

### 十、本次未展开但已归档

`qingyang1.0` 分支与 `qingyang-v1.0` tag 为早期交付线，保留供追溯，不再合入。

---

## v5.0.0 — 2026-09-09 · 基线

V5 全栈版：`server/`（Fastify + Prisma + SQLite）+ `web/`（Vue 3 + Vite），1:1 复刻 9 个 demo 页面，`GET /api/bootstrap` 一次下发全部实体，`web/src/engine/adapter.ts` 映射为 demo MOCK 形状并由 `MOCK_ENGINE.rebuild()` 重算派生结构。数据由 `demo/` 单一事实源经 `tools/export_demo_fixtures.cjs` 导出、`check_data_parity.cjs` 对账。本版本数据全部为演示数据（D 类）。
