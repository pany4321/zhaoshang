# AI 技能装配说明

> 适用版本：v5.1.25 及以后 · 最后核对：2026-11-05（实测四大智能体对话 + 技能触发）
> 一句话结论：**本平台没有技能描述文件**（无 `skills/` 目录、无 YAML frontmatter、无技能注册表）。技能 = 硬编码在 TypeScript 里的提示词协议常量，由路由层按意图正则强制注入。

---

## 一、五个装配点（改技能只看这张表）

| # | 位置 | 作用 | 能否手改 |
|---|---|---|---|
| 1 | `server/src/services/llm.ts` — `ENTERPRISE_PROFILE_SKILL` | 企业详情技能协议（doris-daas-query 口径，六部分） | ✅ **真源，改这里** |
| 2 | `server/src/services/llm.ts` — `RISK_TRACING_SKILL` | 企业风险溯源技能协议（enterprise-risk-tracing-report，六部分） | ✅ **真源，改这里** |
| 3 | `server/src/services/llm.ts` — `AGENT_SYSTEM` | 四大智能体人设提示词（insight / risk / plan / service） | ✅ 改这里 |
| 4 | `server/src/routes/ai.ts` — `SKILL_AGENTS` + 意图正则 + 装配流程 | 决定「谁触发、触发哪个、拼什么 prompt」 | ✅ 改这里 |
| 5 | `server/src/services/dorisPrefetch.ts` | 技能要求的事实预取（并发于主档查询） | ✅ 改这里 |
| 6 | `server/dist/src/services/llm.js` | **线上实际执行的编译产物** | ❌ 由 `npm run build` 生成 |
| 7 | `demo/assets/js/pages/aidemo.js`（约 L666 / L679） | 前端演示态（无后端时）的技能文案 | ✅ 改 `demo/` 后跑 `npm run sync` |
| 8 | `web/public/engine/pages/aidemo.js`、`web/dist/engine/pages/aidemo.js`、`server/public/engine/pages/aidemo.js`、`server/public/demo/assets/js/pages/aidemo.js` | 上面那份的同步副本 | ❌ **禁止直改**，`sync_engine.py` 会覆盖 |

行号会随迭代漂移，定位永远用常量名：

```bash
grep -n "ENTERPRISE_PROFILE_SKILL\|RISK_TRACING_SKILL\|AGENT_SYSTEM" server/src/services/llm.ts
grep -n "SKILL_AGENTS\|detectEnterpriseIntent\|RISK_INTENT_RE" server/src/routes/ai.ts
```

---

## 二、运行时决策链（`POST /api/ai/chat/:agentType`）

```
用户消息
  ↓
agentType ∈ SKILL_AGENTS ? （当前 = insight/risk/plan/service，四个全覆盖）
  ↓ 是
detectEnterprise(message)      → 是否命中平台 88 家样本库（简称/核心词/前后缀别名匹配）
detectEnterpriseIntent(text)   → 'risk' | 'profile' | 'none'
  ↓
并发预取（Promise.all，两路互不阻塞）
  ├─ buildEnterpriseDossier(id)                 平台主档（工商/股东/风险摘要）
  └─ prefetchCompanyFacts({creditCode,name})    Doris 实时取数（任意企业，含库外）
  ↓
组装 systemPrompt（四种分支）
```

### 四种分支

| 命中平台库 | 意图 | systemPrompt 组成 | 说明 |
|---|---|---|---|
| ✅ | `risk` | 人设 + `RISK_TRACING_SKILL` + 锁定主体 + Doris 事实 | 输出六部分溯源报告 |
| ✅ | `profile` | 人设 + `ENTERPRISE_PROFILE_SKILL` + 锁定主体 + Doris 事实 | 输出六部分企业详情 |
| ✅ | `none` | 人设 + **仅企业上下文**（不套技能） | 只提了企业名、问的是政策/服务等本职问题，不强行变成报告 |
| ❌（像公司名） | 任意 | 人设 + 技能协议 + 「外部企业检索」提示 | 未预取到时要求模型自己调 `doris_query` |
| ❌（不像公司名） | — | 仅人设 | 普通问答 |

意图正则（改动需回归全部四个智能体）：

- `RISK_INTENT_RE`：风险|隐患|预警|异常|涉诉|诉讼|被执行|失信|限高|终本|欠税|处罚|违法|违约|纠纷|黑名单|尽调|能不能合作|是否稳定 …
- `PROFILE_INTENT_RE`：基本|概况|详情|介绍|档案|做什么|主营|股东|股权|法人|注册资本|成立|地址|经营范围|财务|营收|利润|纳税|从业|专利|商标|资质|实力|背景 …

正则只做**路由**，不判断答案；命中后由协议约束模型输出结构。

---

## 三、上下文与预算

| 项 | 值 | 位置 |
|---|---|---|
| 多轮历史 | 最近 8 条，每条截断 600 字 | `routes/ai.ts` chat 处理器 |
| 软预算（含企业主体） | `SOFT_BUDGET_MS = 40000`，工具轮按剩余时间动态分配，下限 8s | 同上 |
| 软预算（无主体） | `SOFT_BUDGET_MS = 25000` | 同上 |
| `maxTokens` | 技能/外部企业 9000，普通 6000 | 同上 |
| 模型配置 | `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL` / `LLM_TIMEOUT_MS`，**只从 `server/.env` 读取，不入库不入 Git** | `services/llm.ts` |

工具集（`tool_choice` 自动，MCP 未配置时静默降级）：

| 来源 | 工具 | 命中条件 |
|---|---|---|
| 本地 `AI_TOOLS` | `query_enterprises`、`get_enterprise_detail` | 恒可用（查 SQLite 88 家） |
| Doris `DORIS_TOOLS` | `doris_query`、`doris_list_tables`、`doris_table_schema` | `toolsAvailable()` 为真 |
| 无 | ~~联网搜索~~ | **平台未接入 web 搜索**，只有企业数据 |

---

## 四、新增第 3 个技能（SOP）

以新增「政策匹配报告」技能为例：

1. **写协议常量** — `server/src/services/llm.ts` 里照 `RISK_TRACING_SKILL` 的形状加 `export const POLICY_MATCH_SKILL = [ ... ].join('\n')`。协议必须自洽：取数纪律 / 判定口径 / 必出章节（缺一节算未完成）/ 格式与落款。
2. **加意图识别** — `server/src/routes/ai.ts` 里加 `POLICY_INTENT_RE`，并把 `detectEnterpriseIntent` 的返回类型扩展为 `'risk' | 'profile' | 'policy' | 'none'`（注意：**所有调用点都要改**，TypeScript 会报出来）。
3. **加装配分支** — 在 `skillName` / `skillProto` 的三元表达式处改为查表（技能多了别再堆三元），并在 systemPrompt 组装处加对应分支。
4. **决定是否要预取** — 需要新数据源时，在 `dorisPrefetch.ts` 加取数函数，并入 `Promise.all`（保持并发，不要串行 await）。
5. **编译 + 重启**（**最容易漏**）：

   ```bash
   cd server && npm run build          # 生成 dist/src/services/llm.js ← 线上跑的是这个
   cd .. && bash restart.sh            # 端口 5443 + Named Tunnel，自带健康检查
   ```

6. **验证三件事**（缺一不可）：

   ```bash
   # ① 技能真的被选中（返回体含 skill / skillIntent / skillSubject）
   curl -s -X POST http://127.0.0.1:5443/api/ai/chat/insight \
     -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
     -d '{"message":"XX公司有什么风险，能不能合作"}'
   # ② 服务端日志出现 [ai] 强制技能 ... → 企业名
   grep "强制技能" server.log | tail -5
   # ③ 输出真的按六部分（长度 + 段落数，不只看 HTTP 200）
   ```

7. **前端演示版同步**（仅当要改演示态文案）：改 `demo/assets/js/pages/aidemo.js` → `npm run sync` → `npm test` → `npm run build:web`。

---

## 五、坑（都是踩过的）

| 坑 | 后果 | 对策 |
|---|---|---|
| 只改 `src/` 不跑 `npm run build` | 线上毫无变化，日志也没有新协议 | 改完必 build；`restart.sh` 不负责编译 |
| 直改 `web/public/engine/**` 或 `server/public/**` 的 aidemo.js | 下次 `sync` 被覆盖，或与 demo 漂移导致 `npm test` 失败 | 只改 `demo/`，跑 `npm run sync` |
| 靠模型自己判断要不要出报告 | 退化成几百字泛评 | 代码层强制注入（`SKILL_AGENTS` + 正则），已在实测中验证有效 |
| 预取串行 `await` | 单轮从 9s 涨到 60s+ | `Promise.all` 并发；模型已拿到事实就明确写「不要再调 doris_query」 |
| 强制六部分但数据取不到 | 模型编造或用别家企业数据顶替 | 协议里写死「任一维度取不到写『未获取』，不得用其他企业数据顶替，不得编造」 |
| 对外承诺「能联网查实时信息」 | 模型诚实拒答，用户觉得是缺陷 | 见第三节：本平台**没有** web 搜索，需求要单独立项 |

---

## 六、实测基线（2026-11-05，88 家真实样本库）

| 场景 | agentType | 耗时 | 输出 | 技能标记 |
|---|---|---|---|---|
| 产业结构提问 | insight | 6.7s | 680 字 | `doris-daas-query` |
| 高风险企业统计 | risk | 9.2s | 950 字（红5/橙16/黄39/蓝28） | — |
| 招商方向建议 | plan | 8.6s | 802 字 | — |
| 专精特新申报材料 | service | 7.7s | 631 字 | — |
| 「圣越农牧有什么风险，能不能合作」 | risk | **68.4s** | **6,021 字六部分报告** | `enterprise-risk-tracing-report`，主体自动锁定 E049 / 91621027571648601F |

技能类问答请按「耗时 × 1.5」设前端轮询/超时上限，否则会像项目页导出那次一样误判为「按钮点了没反应」。

---

## 七、与其他"技能"体系的区别

| | 本平台 | Hermes 类 Agent 框架 |
|---|---|---|
| 载体 | TS 常量（内置） | `SKILL.md` 文件（可插拔） |
| 加载 | 意图命中 → 代码注入 | 扫描目录 / 显式 `skill_view` |
| 扩展 | 改代码 + 重新构建 | 放文件即可 |
| 优势 | 触发可靠、可并发预取、不会被模型忽略 | 可热加载、可版本管理、非技术人员可维护 |

若后续要做成可配置技能库：把协议文本外置为 `server/data/skills/*.md` + 启动时加载 + 数据库存触发词，可保留「代码强制注入」这条可靠性优势，同时获得热更新能力。工作量约 1–1.5 人天。
