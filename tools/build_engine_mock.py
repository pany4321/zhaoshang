# -*- coding: utf-8 -*-
"""Assemble web/public/engine/mock.js from demo/assets/data/mock.js.

2026-08 起的结构约定：demo mock.js 的 enrich / deriveAll 已是"函数自带 R 参数、
体内统一 R.* 调用、自带 return"的可注入形态，**无需再包装改写**。生成器只做：

1. 原样拷贝 demo mock.js（保留一段防御性 R.* 改写，当前应为恒等；若出现
   R.R. 双重前缀则以非零退出，防止坏产物静默落盘）；
2. 裁掉 demo 旧的导出块（global.MOCK = {...} 与 IIFE 闭合）；
3. 追加 engine_tail：统一导出 + MOCK_ENGINE（enrich / deriveAll / rebuild）+ 闭合。
   rebuild() 以服务器实体数据**原地**重建闭包数组（entById 等闭包函数因此与
   global.MOCK 指向同一份数据，避免企业 policies 与政策库名称错位）。

用法：python tools/build_engine_mock.py（也可由 tools/sync_engine.py 代跑）
"""
import io
import sys

SRC = r"D:\research\政府招商引资风险管理平台\demo\assets\data\mock.js"
DST = r"D:\research\政府招商引资风险管理平台\web\public\engine\mock.js"

s = io.open(SRC, encoding="utf-8").read()

# demo mock.js 现结构：enrich / deriveAll 自带 R 参数与 return（体内 R.* 调用），
# 其余段落使用顶层裸工具（rpick 等，不可改写为 R.*）。因此**原样拷贝**，
# 不再做任何 RNG 改写（历史上的 rerw 改写已被 demo 侧重构吸收，属恒等/有害）。
out = s

# —— 裁掉旧导出块：从第一组“分隔线 + // 导出”起，替换为 engine_tail ——
EXP_ANCHOR = "\n  // ============================================================\n  // 导出"
i = out.find(EXP_ANCHOR)
if i <= 0:
    sys.exit("ERROR: demo mock.js 中未找到旧导出块锚点（// 导出），生成器锚点需更新")
head = out[:i]

engine_tail = """
  // ============================================================
  // 导出
  // ============================================================
  global.MOCK = {
    MONTHS: MONTHS,
    YEARS_5: YEARS_5,
    MONTHS_6: MONTHS_6,
    RISK_DIMS: RISK_DIMS,
    LEVELS: LEVELS,
    DISTRICTS: DISTRICTS,
    ENTERPRISES: ENTERPRISES,
    DISTRICT_DATA: _D.DISTRICT_DATA,
    GEO_QINGYANG: _D.GEO_QINGYANG,
    DATA_SOURCES: _D.DATA_SOURCES,
    INDUSTRIES: _D.INDUSTRIES,
    INDUSTRIES_META: INDUSTRIES_META,
    OVERVIEW: _D.OVERVIEW,
    riskStats: _D.riskStats,
    RISK_EVENTS: RISK_EVENTS,
    PROJECT_STAGES: PROJECT_STAGES,
    PROJECTS: PROJECTS,
    PROSPECT_ENTERPRISES: PROSPECT_ENTERPRISES,
    TASKS: TASKS,
    AI_DAILY: _D.AI_DAILY,
    GRAPH: _D.GRAPH,
    INDUSTRY_GAP: _D.INDUSTRY_GAP,
    AI_CAPS: AI_CAPS,
    DEMO_SCRIPT: DEMO_SCRIPT,
    POLICY_LIB: POLICY_LIB,
    POLICY_PENDING_POOL: POLICY_PENDING_POOL,
    INVEST_TARGETS: _D.INVEST_TARGETS,
    INVEST_STATS: _D.INVEST_STATS,
    PROVINCE_COMPARE: _D.PROVINCE_COMPARE,
    POLICY_REDEEM: _D.POLICY_REDEEM,
    calcRiskScore: calcRiskScore,
    scoreToLevel: scoreToLevel,
    applyRiskWeights: applyRiskWeights,
    entById: entById,
    industryName: industryName
  };

  // ============================================================
  // 可重算引擎（前后端分离版）：以服务器实体数据重建全部派生结构。
  // enrich：企业政策匹配 / 政策日期 / AI 研判；deriveAll：聚合、图谱、日报等。
  // 重建使用固定种子随机，保证同一份数据多次重建结果完全一致。
  // ============================================================
  function strRng(seedStr) {
    var h = 2166136261;
    var s = String(seedStr || "");
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i)
      h = Math.imul(h, 16777619)
    }
    var st = h >>> 0;
    return function () {
      st = (st + 0x6d2b79f5) >>> 0;
      var t = st;
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    };
  }
  function makeSeededR(seedStr) {
    var rng = strRng(seedStr);
    return {
      rand: rng,
      rint: function (a, b) { return a + Math.floor(rng() * (b - a + 1)); },
      rfloat: function (a, b, d) {
        var v = a + rng() * (b - a);
        return d == null ? v : Number(v.toFixed(d));
      },
      rpick: function (arr) { return arr[Math.floor(rng() * arr.length)]; },
      rbool: function (p) { return rng() < p; }
    };
  }

  global.MOCK_ENGINE = {
    enrich: enrich,
    deriveAll: deriveAll,
    rebuild: function (raw) {
      raw = raw || {};
      // 原地替换闭包数组：entById 等内部函数捕获的是闭包变量，
      // 仅给 global.MOCK 换引用会使两份数据分叉（企业 policies 与政策库
      // 名称错位 → 画像页政策匹配失败、无法下钻政策详情）。
      function replaceInPlace(arr, next) {
        if (!next) return arr;
        arr.length = 0;
        for (var i = 0; i < next.length; i++) arr.push(next[i]);
        return arr;
      }
      replaceInPlace(ENTERPRISES, raw.ENTERPRISES);
      replaceInPlace(RISK_EVENTS, raw.RISK_EVENTS);
      replaceInPlace(PROJECTS, raw.PROJECTS);
      replaceInPlace(TASKS, raw.TASKS);
      replaceInPlace(POLICY_LIB, raw.POLICY_LIB);
      // 服务端下发的自定义风险权重：更新维度权重后再 enrich/deriveAll
      if (Array.isArray(raw.riskWeights) && raw.riskWeights.length) {
        raw.riskWeights.forEach(function (nw) {
          for (var wi = 0; wi < RISK_DIMS.length; wi++) {
            if (RISK_DIMS[wi].key === nw.key && typeof nw.weight === "number") {
              RISK_DIMS[wi].weight = nw.weight;
            }
          }
        });
      }
      var E = ENTERPRISES;
      var EV = RISK_EVENTS;
      var PJ = PROJECTS;
      var TK = TASKS;
      var PL = POLICY_LIB;
      var R = makeSeededR("zs-rebuild-v1");
      enrich(E, PL, R);
      var d = deriveAll(E, EV, PJ, TK, PL, R);
      var M = global.MOCK;
      M.ENTERPRISES = E;
      M.RISK_EVENTS = EV;
      M.PROJECTS = PJ;
      M.TASKS = TK;
      M.POLICY_LIB = PL;
      M.RISK_DIMS = RISK_DIMS;
      M.DISTRICT_DATA = d.DISTRICT_DATA;
      M.GEO_QINGYANG = d.GEO_QINGYANG;
      M.DATA_SOURCES = d.DATA_SOURCES;
      M.INDUSTRIES = d.INDUSTRIES;
      M.OVERVIEW = d.OVERVIEW;
      M.riskStats = d.riskStats;
      M.AI_DAILY = d.AI_DAILY;
      M.GRAPH = d.GRAPH;
      M.INDUSTRY_GAP = d.INDUSTRY_GAP;
      M.INVEST_TARGETS = d.INVEST_TARGETS;
      M.INVEST_STATS = d.INVEST_STATS;
      M.PROVINCE_COMPARE = d.PROVINCE_COMPARE;
      M.POLICY_REDEEM = d.POLICY_REDEEM;
      return M;
    }
  };
})(window);
"""

out = head + engine_tail

with io.open(DST, "w", encoding="utf-8") as f:
    f.write(out)

print("written", DST, len(out), "chars")
print("braces", out.count("{") - out.count("}"), "parens", out.count("(") - out.count(")"))

# 生成后自检：RNG 双重前缀、括号失配或关键标记缺失时以非零退出
if "R.R." in out:
    sys.exit("ERROR: generated mock.js contains double-prefixed 'R.R.' calls — rerw rewrite bug")
if out.count("{") != out.count("}") or out.count("(") != out.count(")"):
    sys.exit("ERROR: generated mock.js braces/parens unbalanced")
for marker in ("MOCK_ENGINE", "replaceInPlace", "global.MOCK = {"):
    if marker not in out:
        sys.exit("ERROR: generated mock.js missing marker: " + marker)
