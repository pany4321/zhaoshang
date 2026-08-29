/* ============================================================
 * 页面：产业关系图谱
 * 维度：按行业（行业聚类着色）/ 按区县（区县着色）
 * 布局：力导向 / 环形 / 树形
 * 交互：搜索定位、双击隔离、风险透视、导出图片、节点显隐切换
 * ============================================================ */
(function () {
  "use strict";
  var U = APP.U;
  var state = APP.state;
  var C = APP.Components;
  var M = window.MOCK;
  var mkChart = APP.mkChart;

  var currentDim = "industry"; // industry / district
  var currentLayout = "force"; // force / circular / tree
  var riskMode = false; // 风险透视模式
  var isolateNodeId = null; // 双击隔离的节点 id（null=全部显示）
  var singleTimer = null; // 单击动作的延时句柄（用于区分单击/双击）
  var SINGLE_WAIT = 260; // 单击等待窗口：此时长内再来一次视为双击
  var focusNodeId = null; // 搜索聚焦的节点 id（null=无聚焦）
  var currentChart = null; // 当前图谱页的 ECharts 实例
  var boundChart = null; // 已绑定交互事件的实例（防止重复绑定）
  var graphZoom = 1;      // 图谱当前缩放比例（跨 render 保持，降低滚轮/双指灵敏度后手动维护）
  var ZOOM_STEP = 0.96;   // 滚轮每格缩放倍率（越接近 1 越慢；0.96 约为默认灵敏度的 1/3）
  var MIN_ZOOM = 0.3;
  var MAX_ZOOM = 5;
  // 节点类型显隐（图层开关）：政策节点连线最密，默认关闭避免过密
  var layerVisible = {
    enterprise: true,
    platform: true,
    market: true,
    gov: true,
    policy: false,
    lead: true,
  };
  var linkColorOn = true; // 连线按业务语义着色（关闭则统一浅灰）

  // —— 连线业务语义分类：颜色 × 线型（实线/虚线/点线）——
  var LINK_GROUPS = [
    { label: "政策服务", color: "#2563EB", type: "solid", rels: ["政策匹配"] },
    {
      label: "招商线索",
      color: "#22C55E",
      type: "solid",
      rels: ["招商洽谈", "平台对接"],
    },
    {
      label: "要素保障",
      color: "#2563EB",
      type: "dotted",
      rels: ["招商服务", "要素保障", "数字化赋能"],
    },
    {
      label: "政府监管",
      color: "#F59E0B",
      type: "dashed",
      rels: ["日常监管", "重点监管"],
    },
    { label: "同一法人", color: "#F97316", type: "dashed", rels: ["同一法人"] },
    {
      label: "投资合作",
      color: "#8B5CF6",
      type: "solid",
      rels: ["参股", "控股", "合作"],
    },
    {
      label: "市场协作",
      color: "#06B6D4",
      type: "solid",
      rels: ["服务", "供应", "出口", "物流配套"],
    },
    {
      label: "产业链",
      color: "#CBD5E1",
      type: "solid",
      rels: ["同产业", "供应链", "竞争"],
    },
  ];
  var LINK_REL_MAP = {};
  LINK_GROUPS.forEach(function (g) {
    g.rels.forEach(function (r) {
      LINK_REL_MAP[r] = g;
    });
  });
  function semanticOf(rel) {
    return (
      LINK_REL_MAP[rel] || {
        label: "产业关联",
        color: "#CBD5E1",
        type: "solid",
      }
    );
  }

  // 企业资源缺口映射（land=土地 / fund=资金），数据层确定性生成
  var GAP_MAP = {};
  (window.MOCK && window.MOCK.GRAPH ? window.MOCK.GRAPH.nodes : []).forEach(
    function (n) {
      if (n.gaps) GAP_MAP[n.id] = n.gaps;
    },
  );
  // 关系类型筛选：每类连线是否显示（与图层/区县筛选叠加；undefined 视为显示）
  var relVisible = {};
  LINK_GROUPS.forEach(function (g) {
    relVisible[g.label] = true;
  });

  // 路径分析状态
  var pathMode = false; // 选点模式开关
  var pathStart = null; // 起点节点 id
  var pathEnd = null; // 终点节点 id
  var pathResult = null; // 最短路径 { nodes:[id...], links:[{source,target,relation}] }
  var currentActiveLinks = null; // 最近一次渲染的有效连线集合（路径计算基准）

  var CAT_COLORS = [
    "#2563EB",
    "#F97316",
    "#22C55E",
    "#8B5CF6",
    "#EC4899",
    "#06B6D4",
    "#F59E0B",
    "#14B8A6",
    "#84CC16",
    "#DC2626",
    "#0EA5E9",
    "#64748B",
  ];
  var DIST_COLORS = {
    xf: "#2563EB",
    qc: "#0EA5E9",
    hj: "#F97316",
    hn: "#F59E0B",
    hy: "#22C55E",
    zq: "#84CC16",
    ning: "#8B5CF6",
    zx: "#EC4899",
  };
  var RISK_LABEL = {
    red: "重大风险",
    orange: "较高风险",
    yellow: "一般风险",
    blue: "关注",
  };

  // 图层类型映射：根据节点判断属于哪类
  // 注意：GV 前缀也是 G 开头，政府部门/政策判断必须在投资机构之前
  function nodeLayer(n) {
    if (n.aux === "政府部门" || (n.id && n.id.indexOf("GV") === 0))
      return "gov";
    if (n.aux === "政策" || (n.id && n.id.indexOf("PL") === 0)) return "policy";
    if (n.aux === "意向企业" || (n.id && n.id.indexOf("PRJ_") === 0))
      return "lead";
    if (n.aux === "投资机构" || (n.id && n.id.charAt(0) === "G"))
      return "platform";
    if (n.aux === "其他" || (n.id && n.id.charAt(0) === "M")) return "market";
    return "enterprise";
  }

  function renderGraph() {
    var G = M.GRAPH;
    var districts = M.DISTRICTS;

    var districtOpts =
      '<option value="all">全部区县</option>' +
      districts
        .map(function (d) {
          return '<option value="' + d.key + '">' + d.name + "</option>";
        })
        .join("");

    U.$("#content").innerHTML =
      // 顶部 KPI 概览卡
      '<div class="card">' +
      '<div class="card-title">' +
      "<span>图谱概览</span>" +
      '<span class="muted" id="gKpiScope" style="font-size:12px;font-weight:400;margin-left:8px;">全量企业关联关系总览</span>' +
      "</div>" +
      '<div class="kpi-row" id="gKpiRow"></div>' +
      "</div>" +
      // 主体：左右两列
      '<div class="row" style="margin-top:12px;">' +
      // 左侧控制
      '<div class="col card g-side">' +
      '<div class="card-title">图谱导航</div>' +
      // 区县筛选
      '<div style="margin-bottom:12px;">' +
      '<div style="font-size:12px;color:#475569;margin-bottom:6px;">区县筛选</div>' +
      '<select class="f-select" id="gDistrict" style="width:100%;">' +
      districtOpts +
      "</select>" +
      "</div>" +
      // 搜索定位
      '<div style="margin-bottom:12px;">' +
      '<div style="font-size:12px;color:#475569;margin-bottom:6px;">企业搜索</div>' +
      '<div style="display:flex;gap:6px;">' +
      '<input type="text" class="f-input" id="gSearch" placeholder="输入企业名称..." style="flex:1;" />' +
      '<button class="btn sm" id="gSearchBtn">定位</button>' +
      "</div>" +
      '<div id="gSearchResult" style="font-size:11px;color:#64748B;margin-top:4px;"></div>' +
      "</div>" +
      // 着色维度
      '<div style="margin-bottom:12px;">' +
      '<div style="font-size:12px;color:#475569;margin-bottom:6px;">着色维度</div>' +
      '<div class="seg" id="gDimSeg">' +
      '<span class="seg-item active" data-dim="industry">按行业</span>' +
      '<span class="seg-item" data-dim="district">按区县</span>' +
      "</div>" +
      "</div>" +
      // 布局切换
      '<div style="margin-bottom:12px;">' +
      '<div style="font-size:12px;color:#475569;margin-bottom:6px;">布局方式</div>' +
      '<div class="seg" id="gLayoutSeg">' +
      '<span class="seg-item active" data-layout="force">力导向</span>' +
      '<span class="seg-item" data-layout="circular">环形</span>' +
      '<span class="seg-item" data-layout="tree">树形</span>' +
      "</div>" +
      "</div>" +
      // 节点图层（可点击切换显隐）
      '<div style="margin-bottom:12px;">' +
      '<div style="font-size:12px;color:#475569;margin-bottom:6px;">节点图层 <span class="muted" style="font-size:11px;">（点击切换）</span></div>' +
      '<div id="gLayers" style="display:flex;flex-direction:column;gap:6px;"></div>' +
      "</div>" +
      // 连线样式（语义着色开关 + 关系类型筛选）
      '<div style="margin-bottom:12px;">' +
      '<div style="font-size:12px;color:#475569;margin-bottom:6px;">连线样式 <span class="muted" style="font-size:11px;">（勾选筛选）</span></div>' +
      '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12px;color:#334155;">' +
      '<input type="checkbox" id="gLinkColor" ' +
      (linkColorOn ? "checked" : "") +
      " /> 按业务语义着色" +
      "</label>" +
      '<div id="gLinkLegend" style="display:flex;flex-direction:column;gap:5px;margin-top:8px;"></div>' +
      "</div>" +
      // 图例
      '<div style="margin-bottom:12px;">' +
      '<div style="font-size:12px;color:#475569;margin-bottom:6px;">图例</div>' +
      '<div class="legend" id="gLegend"></div>' +
      "</div>" +
      // 操作说明
      '<div style="margin-top:12px;">' +
      '<div style="font-size:12px;color:#475569;margin-bottom:6px;">操作说明</div>' +
      '<div style="font-size:11px;color:#64748B;line-height:1.8;">' +
      '• 图标含义：节点大小 = 企业规模，🏗/💰 代表土地/资金缺口，<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#fff;border:2px solid #e03131;vertical-align:middle;"></span> 红边 = 风险，绿虚框 = 在谈线索<br/>' +
      "• 节点图层：可显示或隐藏对应图层<br/>" +
      "• 路径分析：开启后选择起止节点查看路径<br/>" +
      "• 鼠标悬停：查看节点/连线详情<br/>" +
      "• 鼠标操作：单击企业进入画像，双击节点仅看关联，双击空白恢复，滚轮可缩放图谱" +
      "</div>" +
      "</div>" +
      '<div style="margin-top:12px;font-size:11px;color:#94A3B8;" id="gStats"></div>' +
      "</div>" +
      // 右侧图谱主卡
      '<div class="col card">' +
      '<div class="card-title">' +
      "<span>企业关联关系图谱</span>" +
      '<span style="margin-left:auto;display:flex;align-items:center;gap:8px;">' +
      '<label class="g-head-toggle' +
      (riskMode ? " on" : "") +
      '" title="高亮红/橙风险企业及关联链路，⚠ 标注一级风险关联">' +
      '<input type="checkbox" id="gRiskMode" ' +
      (riskMode ? "checked" : "") +
      " /> 风险透视" +
      "</label>" +
      '<label class="g-head-toggle' +
      (pathMode ? " on" : "") +
      '" title="开启后依次点击两个节点，自动高亮最短关联路径">' +
      '<input type="checkbox" id="gPathMode" /> 路径分析' +
      "</label>" +
      '<button class="btn sm" id="gZoomOutBtn" title="缩小图谱" style="width:28px;height:28px;padding:0;line-height:1;display:inline-flex;align-items:center;justify-content:center;font-size:16px;">−</button>' +
      '<button class="btn sm" id="gZoomInBtn" title="放大图谱" style="width:28px;height:28px;padding:0;line-height:1;display:inline-flex;align-items:center;justify-content:center;font-size:16px;">＋</button>' +
      '<button class="btn sm" id="gResetBtn">重置视图</button>' +
      '<button class="btn sm" id="gExportBtn">导出图片</button>' +
      "</span>" +
      "</div>" +
      '<div id="c_graph" class="chart" style="height:660px;position:relative;"></div>' +
      "</div>" +
      "</div>";

    renderLayers();
    renderLinkLegend();

    // 渲染图谱（内部会联动刷新顶部 KPI）
    renderGraphChart();

    // —— 事件绑定 ——
    // 着色维度切换
    U.$("#gDimSeg").addEventListener("click", function (e) {
      var el = e.target.closest(".seg-item");
      if (!el) return;
      currentDim = el.dataset.dim;
      U.$$("#gDimSeg .seg-item").forEach(function (x) {
        x.classList.remove("active");
      });
      el.classList.add("active");
      renderGraphChart();
    });
    // 布局切换
    U.$("#gLayoutSeg").addEventListener("click", function (e) {
      var el = e.target.closest(".seg-item");
      if (!el) return;
      currentLayout = el.dataset.layout;
      U.$$("#gLayoutSeg .seg-item").forEach(function (x) {
        x.classList.remove("active");
      });
      el.classList.add("active");
      renderGraphChart();
    });
    // 区县筛选
    U.$("#gDistrict").addEventListener("change", function () {
      renderGraphChart();
    });
    // 风险透视
    U.$("#gRiskMode").addEventListener("change", function () {
      riskMode = this.checked;
      syncHeadToggles();
      renderGraphChart();
    });
    // 连线语义着色开关
    U.$("#gLinkColor").addEventListener("change", function () {
      linkColorOn = this.checked;
      renderGraphChart();
    });
    // 路径分析
    U.$("#gPathMode").addEventListener("change", function () {
      pathMode = this.checked;
      syncHeadToggles();
      if (pathMode) {
        focusNodeId = null; // 与聚焦互斥，避免视觉冲突
        closeRiskRadiusCard(true);
      }
      clearPathState(false);
      if (pathMode) C.toast("路径分析：请依次点击起点、终点节点", "info");
      renderGraphChart();
    });
    // 搜索
    U.$("#gSearchBtn").addEventListener("click", doSearch);
    U.$("#gSearch").addEventListener("keydown", function (e) {
      if (e.key === "Enter") doSearch();
    });
    // 放大/缩小：单击步进调整 graphZoom 并应用（与滚轮缩放同一套手动机制，跨重建保持）
    function stepZoom(multiplier) {
      if (!currentChart || currentChart.isDisposed()) return;
      graphZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, graphZoom * multiplier));
      try {
        currentChart.setOption({ series: [{ zoom: graphZoom }] });
      } catch (e) {}
      C.toast("图谱缩放 " + Math.round(graphZoom * 100) + "%", "info");
    }
    U.$("#gZoomInBtn").addEventListener("click", function () {
      stepZoom(1.18);
    });
    U.$("#gZoomOutBtn").addEventListener("click", function () {
      stepZoom(1 / 1.18);
    });
    // 重置视图：清空所有筛选/聚焦/隔离状态，回到默认
    U.$("#gResetBtn").addEventListener("click", function () {
      isolateNodeId = null;
      focusNodeId = null;
      riskMode = false;
      U.$("#gRiskMode").checked = false;
      linkColorOn = true;
      U.$("#gLinkColor").checked = true;
      // 关系类型筛选恢复全开
      relVisible = {};
      LINK_GROUPS.forEach(function (g) {
        relVisible[g.label] = true;
      });
      renderLinkLegend();
      // 路径分析状态清空
      pathMode = false;
      U.$("#gPathMode").checked = false;
      clearPathState(false);
      syncHeadToggles();
      // 图层恢复默认
      layerVisible = {
        enterprise: true,
        platform: true,
        market: true,
        gov: true,
        policy: false,
        lead: true,
      };
      renderLayers();
      // 区县筛选恢复全部
      var distSel = U.$("#gDistrict");
      if (distSel) distSel.value = "all";
      // 清空搜索
      var searchInput = U.$("#gSearch");
      if (searchInput) searchInput.value = "";
      var resultEl = U.$("#gSearchResult");
      if (resultEl) resultEl.textContent = "";
      // 关键：先 dispose 当前实例（ECharts init 在同一 DOM 上会复用旧实例，
      // 合并式 setOption 无法清除 roam 缩放/平移状态，必须销毁重建）
      if (currentChart && !currentChart.isDisposed()) {
        try {
          currentChart.dispose();
        } catch (e) {}
      }
      currentChart = null;
      boundChart = null;
      closeRiskRadiusCard(true);
      renderGraphChart();
      C.toast("视图已重置", "success");
    });
    // 导出图片
    U.$("#gExportBtn").addEventListener("click", function () {
      if (
        !currentChart ||
        !currentChart.getDataURL ||
        currentChart.isDisposed()
      ) {
        C.toast("导出失败：图表未就绪", "error");
        return;
      }
      try {
        var url = currentChart.getDataURL({
          type: "png",
          pixelRatio: 2,
          backgroundColor: "#fff",
        });
        var a = document.createElement("a");
        a.href = url;
        a.download = "企业关联关系图谱.png";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        C.toast("图片已导出", "success");
      } catch (e) {
        C.toast("导出失败：" + e.message, "error");
      }
    });
  }

  // 顶部 KPI 渲染（随区县筛选动态更新）
  function renderKpi(dist) {
    var G = M.GRAPH;

    // 范围内的企业节点（区县过滤）
    var entNodes = G.nodes.filter(function (n) {
      if (nodeLayer(n) !== "enterprise") return false;
      var e = M.entById(n.id);
      return e && (dist === "all" || e.district === dist);
    });
    var entIdSet = {};
    entNodes.forEach(function (n) {
      entIdSet[n.id] = true;
    });

    // 范围内的连线：两端都在范围内（辅助节点只要有一端是范围内企业即计入）
    var scopedLinks = G.links.filter(function (l) {
      return entIdSet[l.source] || entIdSet[l.target];
    });

    // 与范围内企业相连的投资平台 / 外部市场
    var auxLinked = {};
    scopedLinks.forEach(function (l) {
      if (!entIdSet[l.source]) auxLinked[l.source] = true;
      if (!entIdSet[l.target]) auxLinked[l.target] = true;
    });
    var platNodes = G.nodes.filter(function (n) {
      return nodeLayer(n) === "platform" && auxLinked[n.id];
    });
    var mktNodes = G.nodes.filter(function (n) {
      return nodeLayer(n) === "market" && auxLinked[n.id];
    });
    var govNodes = G.nodes.filter(function (n) {
      return nodeLayer(n) === "gov" && auxLinked[n.id];
    });
    var polNodes = G.nodes.filter(function (n) {
      return nodeLayer(n) === "policy" && auxLinked[n.id];
    });
    // 线索节点带 district 字段，需同时满足区县过滤。
    // 线索节点只连接市商务局/投资平台（非企业节点），故不依赖 auxLinked（后者只看两端含企业）。
    var leadNodes = G.nodes.filter(function (n) {
      return (
        nodeLayer(n) === "lead" &&
        (dist === "all" || !n.district || n.district === dist)
      );
    });

    var redCount = 0,
      orangeCount = 0,
      yellowCount = 0;
    var industrySet = {},
      districtSet = {};
    entNodes.forEach(function (n) {
      var e = M.entById(n.id);
      if (!e) return;
      if (e.riskLevel === "red") redCount++;
      else if (e.riskLevel === "orange") orangeCount++;
      else if (e.riskLevel === "yellow") yellowCount++;
      industrySet[e.industry] = true;
      districtSet[e.district] = true;
    });

    var avgLink = (scopedLinks.length / Math.max(1, entNodes.length)).toFixed(
      1,
    );
    var industryCnt = Object.keys(industrySet).length;
    var districtCnt = Object.keys(districtSet).length;

    var kpis = [
      {
        label: "企业节点",
        value: entNodes.length,
        sub: "家",
        color: "#2563EB",
      },
      {
        label: "投资平台",
        value: platNodes.length,
        sub: "个",
        color: "#8B5CF6",
      },
      {
        label: "政府部门",
        value: govNodes.length,
        sub: "个",
        color: "#0EA5E9",
      },
      {
        label: "匹配政策",
        value: polNodes.length,
        sub: "条",
        color: "#F59E0B",
      },
      {
        label: "招商线索",
        value: leadNodes.length,
        sub: "个",
        color: "#22C55E",
      },
      {
        label: "外部市场",
        value: mktNodes.length,
        sub: "个",
        color: "#06B6D4",
      },
      { label: "涉及行业", value: industryCnt, sub: "个", color: "#22C55E" },
      { label: "覆盖区县", value: districtCnt, sub: "个", color: "#F59E0B" },
      {
        label: "红橙风险",
        value:
          '<span style="color:#e03131;">' +
          redCount +
          '</span><span style="color:#94A3B8;">+</span><span style="color:#F97316;">' +
          orangeCount +
          "</span>",
        sub: "家",
        color: "#64748B",
      },
      { label: "平均关联", value: avgLink, sub: "条/家", color: "#64748B" },
    ];

    var html = kpis
      .map(function (k) {
        return (
          '<div class="kpi-item">' +
          '<div class="kpi-label">' +
          k.label +
          "</div>" +
          '<div><span class="kpi-value" style="color:' +
          k.color +
          ';">' +
          k.value +
          '</span> <span class="kpi-sub">' +
          k.sub +
          "</span></div>" +
          "</div>"
        );
      })
      .join("");
    U.$("#gKpiRow").innerHTML = html;

    // 副标题同步显示筛选范围
    var scopeEl = U.$("#gKpiScope");
    if (scopeEl) {
      if (dist === "all") {
        scopeEl.textContent = "全量企业关联关系总览";
      } else {
        var dName = dist;
        M.DISTRICTS.forEach(function (d) {
          if (d.key === dist) dName = d.name;
        });
        scopeEl.textContent = "当前范围：" + dName;
      }
    }
  }

  // 图层开关渲染
  function renderLayers() {
    var layers = [
      { key: "enterprise", label: "企业节点", color: "#2563EB" },
      { key: "platform", label: "投资平台", color: "#64748B" },
      { key: "gov", label: "政府部门", color: "#0EA5E9" },
      { key: "policy", label: "匹配政策", color: "#F59E0B" },
      { key: "lead", label: "招商线索", color: "#22C55E" },
      { key: "market", label: "外部市场", color: "#94A3B8" },
    ];
    var html = layers
      .map(function (l) {
        var checked = layerVisible[l.key] ? "checked" : "";
        var op = layerVisible[l.key] ? "1" : "0.4";
        return (
          '<label class="layer-item" data-layer="' +
          l.key +
          '" style="display:flex;align-items:center;gap:8px;cursor:pointer;opacity:' +
          op +
          ';">' +
          '<input type="checkbox" ' +
          checked +
          " />" +
          '<span class="lg-dot" style="background:' +
          l.color +
          '"></span>' +
          '<span style="font-size:12px;color:#334155;">' +
          l.label +
          "</span>" +
          "</label>"
        );
      })
      .join("");
    var el = U.$("#gLayers");
    if (!el) return;
    el.innerHTML = html;
    el.querySelectorAll(".layer-item").forEach(function (item) {
      item.addEventListener("click", function (e) {
        e.stopPropagation();
        var key = item.dataset.layer;
        layerVisible[key] = !layerVisible[key];
        renderLayers();
        renderGraphChart();
      });
    });
  }

  // 关系图例 + 关系类型筛选（勾选控制该类连线显隐）
  function renderLinkLegend() {
    var el = U.$("#gLinkLegend");
    if (!el) return;
    el.innerHTML = LINK_GROUPS.map(function (g) {
      var on = relVisible[g.label] !== false;
      var op = on ? "1" : "0.4";
      return (
        '<label class="layer-item" data-rel="' +
        U.esc(g.label) +
        '" style="display:flex;align-items:center;gap:6px;cursor:pointer;opacity:' +
        op +
        ';">' +
        '<input type="checkbox" ' +
        (on ? "checked" : "") +
        " />" +
        '<span style="display:inline-block;width:16px;height:0;border-top:2px ' +
        g.type +
        " " +
        g.color +
        ';"></span>' +
        '<span style="font-size:11px;color:#334155;">' +
        U.esc(g.label) +
        "</span>" +
        "</label>"
      );
    }).join("");
    el.querySelectorAll(".layer-item[data-rel]").forEach(function (item) {
      item.addEventListener("click", function (e) {
        e.stopPropagation();
        var key = item.dataset.rel;
        // 至少保留一类连线，避免出现空图
        var onCount = LINK_GROUPS.filter(function (g) {
          return relVisible[g.label] !== false;
        }).length;
        if (relVisible[key] !== false && onCount <= 1) {
          C.toast("至少保留一类连线", "warning");
          return;
        }
        relVisible[key] = relVisible[key] === false ? true : false;
        renderLinkLegend();
        renderGraphChart();
      });
    });
  }

  // 搜索定位
  function doSearch() {
    var kw = U.$("#gSearch").value.trim();
    var resultEl = U.$("#gSearchResult");
    if (!kw) {
      resultEl.textContent = "";
      return;
    }

    var G = M.GRAPH;
    var matched = G.nodes.filter(function (n) {
      return n.name && n.name.indexOf(kw) >= 0;
    });
    if (matched.length === 0) {
      resultEl.innerHTML =
        '<span style="color:#e03131;">未找到匹配的节点</span>';
      C.toast("未找到匹配的节点", "warning");
      return;
    }
    var target = matched[0];

    // 目标节点若被当前筛选（区县/图层）隐藏，先提示
    var tEnt = M.entById(target.id);
    var distSel = U.$("#gDistrict");
    var curDist = distSel ? distSel.value : "all";
    if (tEnt && curDist !== "all" && tEnt.district !== curDist) {
      resultEl.innerHTML =
        '<span style="color:#F97316;">该企业不在当前筛选区县内，请先将区县恢复为「全部区县」</span>';
      C.toast("「" + target.name + "」不在当前筛选区县内", "warning");
      return;
    }
    if (!layerVisible[nodeLayer(target)]) {
      resultEl.innerHTML =
        '<span style="color:#F97316;">该节点所在图层已关闭，请在左侧「节点图层」中开启</span>';
      C.toast("「" + target.name + "」所在图层已被关闭", "warning");
      return;
    }

    resultEl.innerHTML =
      "找到 " +
      matched.length +
      ' 个，已定位：<b style="color:#2563EB;">' +
      U.esc(target.name) +
      "</b>" +
      '<span style="color:#94A3B8;">（点击「重置视图」恢复全部）</span>';

    // 开启聚焦模式：暗化其他，放大目标 + 邻居；保持直到点击「重置视图」
    focusNodeId = target.id;
    renderGraphChart();

    C.toast("已定位到：" + target.name, "success");
  }

  // ============ 风险影响半径信息卡 ============
  // 浮动卡挂载到图谱画布容器内（右上角），拖动范围也限于画布区域
  function mountFloatingCard(card) {
    var host = U.$("#c_graph");
    if (!host) {
      document.body.appendChild(card);
      return document.body;
    }
    host.appendChild(card);
    card.style.top = "12px";
    card.style.right = "12px";
    card.style.left = "auto";
    return host;
  }

  // 浮动卡通用拖动：按住标题栏在 host 容器内移动（× 关闭按钮不触发拖动）。
  // 可贴边到容器四角；拖至视口上/下边缘时自动滚动页面，保证可达内容区顶部/底部。
  function makeCardDraggable(card, host) {
    if (!host) return;
    var headerEl =
      card.querySelector(".rr-header") || card.querySelector(".path-header");
    if (!headerEl) return;
    headerEl.style.cursor = "move";
    headerEl.addEventListener("mousedown", function (ev) {
      if (ev.target.id === "rrClose" || ev.target.id === "pathClose") return; // 点 × 不触发拖动
      // 找可滚动的祖先容器（内层滚动布局），没有则滚动窗口
      var scrollEl = null,
        p = host.parentNode;
      while (p && p !== document.body) {
        var st = window.getComputedStyle(p);
        if (
          (st.overflowY === "auto" || st.overflowY === "scroll") &&
          p.scrollHeight > p.clientHeight
        ) {
          scrollEl = p;
          break;
        }
        p = p.parentNode;
      }
      var rect = card.getBoundingClientRect();
      var ox = ev.clientX - rect.left;
      var oy = ev.clientY - rect.top;
      var lastX = ev.clientX,
        lastY = ev.clientY;
      var timer = null;

      function place(cx, cy) {
        var hr = host.getBoundingClientRect(); // 实时取，滚动后位置随之变化
        var nl = cx - ox - hr.left;
        var nt = cy - oy - hr.top;
        nl = Math.max(0, Math.min(nl, hr.width - rect.width));
        nt = Math.max(0, Math.min(nt, hr.height - rect.height));
        card.style.left = nl + "px";
        card.style.top = nt + "px";
        card.style.right = "auto";
      }
      function doScroll(dy) {
        if (scrollEl) scrollEl.scrollTop += dy;
        else window.scrollBy(0, dy);
        place(lastX, lastY);
      }
      function onMove(mv) {
        lastX = mv.clientX;
        lastY = mv.clientY;
        place(lastX, lastY);
      }
      function onUp() {
        if (timer) {
          clearInterval(timer);
          timer = null;
        }
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      }
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
      timer = setInterval(function () {
        var edge = 56,
          step = 12;
        if (lastY > window.innerHeight - edge) doScroll(step);
        else if (lastY < edge) doScroll(-step);
      }, 20);
      ev.preventDefault();
    });
  }

  // 计算某企业的 1/2 级关联（基于全量 GRAPH 数据）
  function calcRiskRadius(entId) {
    var G = M.GRAPH;
    var l1 = {}; // id -> { rel }
    var l1Set = {};
    l1Set[entId] = true;
    G.links.forEach(function (l) {
      var other =
        l.source === entId ? l.target : l.target === entId ? l.source : null;
      if (other && !l1Set[other]) {
        l1Set[other] = true;
        l1[other] = { id: other, rel: l.relation || "关联" };
      }
    });
    var l2Set = {};
    G.links.forEach(function (l) {
      ["source", "target"].forEach(function (side) {
        var me = l[side],
          other = side === "source" ? l.target : l.source;
        if (l1Set[me] && me !== entId && !l1Set[other] && other !== entId)
          l2Set[other] = true;
      });
    });
    var l2Count = Object.keys(l2Set).filter(function (id) {
      return id !== entId && !l1[id];
    }).length;
    return { l1: l1, l2Count: l2Count };
  }

  function showRiskRadiusCard(ent) {
    closeRiskRadiusCard();
    var G = M.GRAPH;
    var radius = calcRiskRadius(ent.id);

    // 一级关联明细（企业在前，按风险严重度排序；辅助节点附后）
    var RANK = { red: 0, orange: 1, yellow: 2, blue: 3 };
    var l1Rows = Object.keys(radius.l1)
      .map(function (id) {
        var e = M.entById(id);
        return {
          id: id,
          rel: radius.l1[id].rel,
          ent: e || null,
          name: e
            ? e.name
            : (function () {
                var nm = "";
                G.nodes.forEach(function (n) {
                  if (n.id === id) nm = n.name;
                });
                return nm;
              })(),
          rank: e ? RANK[e.riskLevel] : 4,
        };
      })
      .sort(function (a, b) {
        return a.rank - b.rank;
      });

    // 统计
    var entRows = l1Rows.filter(function (r) {
      return r.ent;
    });
    var cnt = { red: 0, orange: 0, yellow: 0 };
    var indSet = {},
      distSet = {};
    entRows.forEach(function (r) {
      if (cnt[r.ent.riskLevel] !== undefined) cnt[r.ent.riskLevel]++;
      indSet[r.ent.industryName] = true;
      distSet[r.ent.districtName] = true;
    });

    var lvlName = M.LEVELS[ent.riskLevel] ? M.LEVELS[ent.riskLevel].name : "";
    var measure =
      ent.riskLevel === "red"
        ? "建议列入重点监管名单，组织跨部门联合约谈，核查供应链与资金往来，启动风险应急预案。"
        : "建议加强经营数据监测频次，核实关联企业传导风险，限期提交整改方案并复查。";

    var rowsHtml = l1Rows
      .map(function (r) {
        var badge = r.ent
          ? C.lvlBadge(r.ent.riskLevel)
          : '<span class="muted" style="font-size:11px;">辅助节点</span>';
        var clickable = r.ent
          ? ' style="cursor:pointer;" data-jump="' + r.id + '"'
          : "";
        return (
          '<div class="rr-row"' +
          clickable +
          ">" +
          '<span class="rr-name">' +
          U.esc(r.name) +
          "</span>" +
          '<span class="rr-rel">' +
          U.esc(r.rel) +
          "</span>" +
          badge +
          "</div>"
        );
      })
      .join("");

    var card = U.el("div", {
      class: "risk-radius-card",
      id: "riskRadiusCard",
      html:
        '<div class="rr-header"><span>风险影响半径</span><span id="rrClose" title="关闭">×</span></div>' +
        '<div class="rr-ent">' +
        U.esc(ent.name) +
        "</div>" +
        '<div class="rr-meta">' +
        C.lvlBadge(ent.riskLevel) +
        ' <span style="margin-left:6px;">综合风险分 <b>' +
        ent.riskScore +
        '</b> 分</span><span style="margin-left:6px;color:#94A3B8;">' +
        U.esc(lvlName) +
        "</span></div>" +
        '<div class="rr-stats">' +
        '<div class="rr-stat"><div class="rr-num" style="color:#e03131;">' +
        entRows.length +
        '</div><div class="rr-lab">一级关联(家)</div></div>' +
        '<div class="rr-stat"><div class="rr-num" style="color:#F97316;">' +
        (cnt.red + cnt.orange) +
        '</div><div class="rr-lab">其中红/橙</div></div>' +
        '<div class="rr-stat"><div class="rr-num" style="color:#64748B;">' +
        radius.l2Count +
        '</div><div class="rr-lab">二级关联(家)</div></div>' +
        "</div>" +
        '<div class="rr-sec">关联明细（按风险排序）</div>' +
        '<div class="rr-list">' +
        (rowsHtml ||
          '<div class="muted" style="padding:8px;font-size:12px;">无直接关联</div>') +
        "</div>" +
        '<div class="rr-sec">分布</div>' +
        '<div class="rr-dist">行业 ' +
        Object.keys(indSet).length +
        " 类 · 区县 " +
        Object.keys(distSet).length +
        " 个" +
        (cnt.yellow ? " · 黄级 " + cnt.yellow + " 家" : "") +
        "</div>" +
        '<div class="rr-measure">' +
        measure +
        "</div>" +
        '<div style="display:flex;gap:8px;margin-top:10px;">' +
        '<button class="btn sm" id="rrCloseBtn" style="flex:1;">关闭</button>' +
        '<button class="btn sm primary" id="rrProfile" style="flex:1;">进入画像</button>' +
        "</div>",
    });
    var host = mountFloatingCard(card); // 挂载到图谱画布内右上角
    makeCardDraggable(card, host); // 可在画布范围内拖动

    // 关闭：清聚焦恢复（右上角 × 和底部按钮）
    U.$("#rrClose").addEventListener("click", function () {
      closeRiskRadiusCard();
    });
    U.$("#rrCloseBtn").addEventListener("click", function () {
      closeRiskRadiusCard();
    });
    // 进入画像
    U.$("#rrProfile").addEventListener("click", function () {
      focusNodeId = null;
      state.ent = ent.id;
      state.page = "profile";
      APP.render();
    });
    // 明细行跳转画像
    card.querySelectorAll(".rr-row[data-jump]").forEach(function (row) {
      row.addEventListener("click", function () {
        focusNodeId = null;
        state.ent = row.dataset.jump;
        state.page = "profile";
        APP.render();
      });
    });
  }

  function closeRiskRadiusCard(keepFocus) {
    var el = document.getElementById("riskRadiusCard");
    if (el) el.parentNode.removeChild(el);
    if (!keepFocus && focusNodeId) {
      focusNodeId = null;
      renderGraphChart();
    }
  }

  // ============ 路径分析 ============
  // BFS 最短路径（基于传入连线集合，无向图）
  function bfsPath(linksArr, s, e) {
    if (!s || !e || s === e) return null;
    var adj = {};
    linksArr.forEach(function (l) {
      if (!adj[l.source]) adj[l.source] = [];
      if (!adj[l.target]) adj[l.target] = [];
      adj[l.source].push({ to: l.target, rel: l.relation || "关联" });
      adj[l.target].push({ to: l.source, rel: l.relation || "关联" });
    });
    var prev = {};
    prev[s] = { node: null };
    var queue = [s];
    while (queue.length) {
      var cur = queue.shift();
      if (cur === e) break;
      (adj[cur] || []).forEach(function (nb) {
        if (!prev[nb.to]) {
          prev[nb.to] = { node: cur, rel: nb.rel };
          queue.push(nb.to);
        }
      });
    }
    if (!prev[e]) return null;
    var nodes = [],
      linksR = [];
    var cur = e;
    while (cur) {
      nodes.unshift(cur);
      var p = prev[cur];
      if (p && p.node)
        linksR.unshift({ source: p.node, target: cur, relation: p.rel });
      cur = p ? p.node : null;
    }
    return { nodes: nodes, links: linksR };
  }

  function graphNodeName(id) {
    var nm = "";
    M.GRAPH.nodes.forEach(function (n) {
      if (n.id === id) nm = n.name;
    });
    return nm;
  }

  // 标题栏开关胶囊高亮同步（风险透视 / 路径分析）
  function syncHeadToggles() {
    var rk = U.$("#gRiskMode"),
      pt = U.$("#gPathMode");
    if (rk && rk.parentNode) rk.parentNode.classList.toggle("on", riskMode);
    if (pt && pt.parentNode) pt.parentNode.classList.toggle("on", pathMode);
  }

  // 路径分析状态浮条：仅选点模式开启时显示在图谱左上角
  function updatePathStatus() {
    var host = U.$("#c_graph");
    var chip = document.getElementById("gPathChip");
    if (!pathMode || !host) {
      if (chip && chip.parentNode) chip.parentNode.removeChild(chip);
      return;
    }
    if (!chip) {
      chip = U.el("div", { id: "gPathChip", class: "path-chip" });
      host.appendChild(chip);
    }
    var sName = pathStart ? graphNodeName(pathStart) : "";
    var eName = pathEnd ? graphNodeName(pathEnd) : "";
    var msg;
    if (!pathStart) {
      msg = "请点击<b>起点</b>节点";
    } else if (!pathEnd) {
      msg = "起点：<b>" + U.esc(sName) + "</b> · 请点击<b>终点</b>节点";
    } else if (pathResult) {
      msg =
        "<b>" +
        U.esc(sName) +
        "</b> → <b>" +
        U.esc(eName) +
        "</b> · 最短 " +
        pathResult.links.length +
        " 步";
    } else {
      msg = '<span style="color:#e03131;">当前范围内无可达路径</span>';
    }
    chip.innerHTML =
      '<span class="pc-dot"></span><span class="pc-msg">' +
      msg +
      "</span>" +
      '<span class="pc-clear" id="pcClear">清除</span>';
    var clr = document.getElementById("pcClear");
    if (clr)
      clr.addEventListener("click", function () {
        clearPathState(true);
      });
  }

  function clearPathState(rerender) {
    pathStart = null;
    pathEnd = null;
    pathResult = null;
    closePathCard();
    updatePathStatus();
    if (rerender) renderGraphChart();
  }

  function handlePathPick(id) {
    if (!pathStart || (pathStart && pathEnd)) {
      // 新一轮选点
      pathStart = id;
      pathEnd = null;
      pathResult = null;
      closePathCard();
      C.toast(
        "已设起点：「" + graphNodeName(id) + "」，请点击终点节点",
        "info",
      );
    } else if (id === pathStart) {
      C.toast("起点与终点不能相同，请选择其他节点", "warning");
      return;
    } else {
      pathEnd = id;
      pathResult = bfsPath(currentActiveLinks || [], pathStart, pathEnd);
      if (!pathResult) {
        C.toast("两节点在当前筛选范围内无可达路径", "error");
        pathEnd = null;
        updatePathStatus();
        return;
      }
      C.toast("找到最短路径：" + pathResult.links.length + " 步", "success");
      showPathCard();
    }
    updatePathStatus();
    renderGraphChart();
  }

  function showPathCard() {
    closePathCard();
    if (!pathResult) return;
    var stepsHtml = "";
    pathResult.nodes.forEach(function (id, i) {
      var e = M.entById(id);
      var badge = e ? " " + C.lvlBadge(e.riskLevel) : "";
      stepsHtml +=
        '<div class="p-step"' +
        (e ? ' data-jump="' + id + '"' : "") +
        ">" +
        '<span class="p-idx">' +
        (i + 1) +
        "</span>" +
        '<span class="p-name">' +
        U.esc(graphNodeName(id)) +
        "</span>" +
        badge +
        "</div>";
      if (i < pathResult.links.length) {
        var rel = pathResult.links[i].relation;
        var sem = semanticOf(rel);
        stepsHtml +=
          '<div class="p-arrow">' +
          U.esc(rel) +
          ' <span style="color:' +
          sem.color +
          ';">(' +
          U.esc(sem.label) +
          ")</span></div>";
      }
    });
    var card = U.el("div", {
      class: "path-card",
      id: "pathCard",
      html:
        '<div class="path-header"><span>路径分析</span><span class="path-close" id="pathClose">×</span></div>' +
        '<div class="path-endpoints"><b>' +
        U.esc(graphNodeName(pathStart)) +
        "</b> → <b>" +
        U.esc(graphNodeName(pathEnd)) +
        "</b><br/>" +
        '<span style="color:#64748B;">共 ' +
        pathResult.links.length +
        " 步 · 经由 " +
        pathResult.nodes.length +
        " 个节点（当前筛选范围内的最短关联路径）</span></div>" +
        '<div class="path-steps">' +
        stepsHtml +
        "</div>" +
        '<div style="display:flex;gap:8px;margin-top:10px;">' +
        '<button class="btn sm" id="pathClearBtn" style="flex:1;">清除路径</button>' +
        "</div>",
    });
    var host = mountFloatingCard(card); // 挂载到图谱画布内右上角
    makeCardDraggable(card, host); // 可在画布范围内拖动
    U.$("#pathClose").addEventListener("click", function () {
      clearPathState(true);
    });
    U.$("#pathClearBtn").addEventListener("click", function () {
      clearPathState(true);
    });
    card.querySelectorAll(".p-step[data-jump]").forEach(function (row) {
      row.addEventListener("click", function () {
        state.ent = row.dataset.jump;
        state.page = "profile";
        APP.render();
      });
    });
  }

  function closePathCard() {
    var el = document.getElementById("pathCard");
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  function renderGraphChart() {
    var G = M.GRAPH;
    var distSel = U.$("#gDistrict");
    var dist = distSel ? distSel.value : "all";
    var byDistrict = currentDim === "district";

    // 顶部 KPI 随区县筛选联动
    renderKpi(dist);

    // 关系类型筛选后的有效连线集合（隔离/剪枝/风险链路/渲染均基于它，
    // 保证隐藏某类关系后辅助节点被正常剪除，不出现悬空节点）
    var activeLinks = G.links.filter(function (l) {
      return relVisible[semanticOf(l.relation).label] !== false;
    });
    currentActiveLinks = activeLinks;

    // 路径分析：随当前可见范围实时重算（筛选变化导致断路时自动失效）
    if (pathStart && pathEnd) {
      pathResult = bfsPath(activeLinks, pathStart, pathEnd);
      if (!pathResult) closePathCard();
      updatePathStatus();
    }

    // —— 1. 可见性：区县过滤 + 图层开关 + 双击隔离 + 孤立节点剪除 ——
    var visible = {};
    G.nodes.forEach(function (n) {
      // 图层开关
      var layer = nodeLayer(n);
      if (!layerVisible[layer]) {
        visible[n.id] = false;
        return;
      }
      // 区县过滤（企业 + 携带区县字段的招商线索节点）
      var e = M.entById(n.id);
      if (e && dist !== "all" && e.district !== dist) {
        visible[n.id] = false;
        return;
      }
      if (!e && n.district && dist !== "all" && n.district !== dist) {
        visible[n.id] = false;
        return;
      }
      visible[n.id] = true;
    });

    // 双击隔离模式：只保留该节点 + 直接邻居 + 之间的边
    if (isolateNodeId && visible[isolateNodeId]) {
      var neighborSet = {};
      neighborSet[isolateNodeId] = true;
      activeLinks.forEach(function (l) {
        if (l.source === isolateNodeId && visible[l.target])
          neighborSet[l.target] = true;
        if (l.target === isolateNodeId && visible[l.source])
          neighborSet[l.source] = true;
      });
      for (var id in visible) {
        if (visible[id] && !neighborSet[id]) visible[id] = false;
      }
    }

    // 剪除孤立的辅助节点（没和任何可见企业相连）
    var changed = true;
    while (changed) {
      changed = false;
      G.nodes.forEach(function (n) {
        if (!visible[n.id]) return;
        if (nodeLayer(n) === "enterprise") return; // 企业不剪
        var linked = activeLinks.some(function (l) {
          var other =
            l.source === n.id ? l.target : l.target === n.id ? l.source : null;
          return (
            other &&
            visible[other] &&
            nodeLayer(
              M.entById(other)
                ? { id: other }
                : G.nodes.find(function (x) {
                    return x.id === other;
                  }) || {},
            ) === "enterprise"
          );
        });
        // 简化：和任何可见节点有连接就算
        var hasLink = activeLinks.some(function (l) {
          var other =
            l.source === n.id ? l.target : l.target === n.id ? l.source : null;
          return other && visible[other];
        });
        if (!hasLink) {
          visible[n.id] = false;
          changed = true;
        }
      });
    }

    // —— 2. 分类体系：按行业 / 按区县 ——
    var AUX_CATS = G.auxCategories || ["其他"];
    // 辅助类别配色与 auxCategories 顺序一一对应：投资平台/外部市场/政府部门/政策/意向企业
    var PAL = CAT_COLORS.concat([
      "#64748B",
      "#94A3B8",
      "#0EA5E9",
      "#F59E0B",
      "#22C55E",
    ]);
    var cats, allCats, catIndex;
    if (byDistrict) {
      cats = M.DISTRICTS.map(function (d) {
        return d.name;
      });
      allCats = cats.concat(AUX_CATS);
      catIndex = function (n) {
        if (n.aux) {
          var gi = AUX_CATS.indexOf(n.aux);
          return gi >= 0 ? cats.length + gi : allCats.length - 1;
        }
        var e = M.entById(n.id);
        for (var i = 0; i < M.DISTRICTS.length; i++) {
          if (M.DISTRICTS[i].key === e.district) return i;
        }
        return allCats.length - 1;
      };
    } else {
      cats = G.categories.map(function (c) {
        return typeof c === "string" ? c : c.name;
      });
      allCats = cats.concat(AUX_CATS);
      catIndex = function (n) {
        if (n.aux) {
          var gi = AUX_CATS.indexOf(n.aux);
          return gi >= 0 ? cats.length + gi : allCats.length - 1;
        }
        return n.category;
      };
    }

    // —— 2.5 风险透视数据准备：风险企业集合 + 一级风险关联 ——
    var riskEntIds = {};
    var riskL1 = {}; // 红/橙企业的直接关联（非红/橙自身）
    if (riskMode) {
      G.nodes.forEach(function (n) {
        if (!visible[n.id]) return;
        var e = M.entById(n.id);
        if (e && (e.riskLevel === "red" || e.riskLevel === "orange"))
          riskEntIds[n.id] = true;
      });
      activeLinks.forEach(function (l) {
        if (!visible[l.source] || !visible[l.target]) return;
        var sRisk = riskEntIds[l.source],
          tRisk = riskEntIds[l.target];
        if (sRisk === tRisk) return; // 两端都不是风险，或都是风险
        var other = sRisk ? l.target : l.source;
        if (!riskEntIds[other] && !riskL1[other]) {
          var oe = M.entById(other);
          // 黄级已有黄色描边，不重复打 ⚠ 标
          if (!oe || oe.riskLevel !== "yellow") riskL1[other] = true;
        }
      });
    }

    // —— 3. 节点：大小 + 风险描边 + 暗化 + 聚焦放大 ——
    // 聚焦模式：计算目标节点的直接邻居
    var focusNeighbor = {};
    if (focusNodeId) {
      focusNeighbor[focusNodeId] = true;
      activeLinks.forEach(function (l) {
        if (l.source === focusNodeId) focusNeighbor[l.target] = true;
        if (l.target === focusNodeId) focusNeighbor[l.source] = true;
      });
    }

    // 路径高亮集合（节点 id + 无向连线索引）
    var pathNodes = {};
    var pathLinkKeys = {};
    if (pathResult) {
      pathResult.nodes.forEach(function (id) {
        pathNodes[id] = true;
      });
      pathResult.links.forEach(function (l) {
        pathLinkKeys[l.source + "|" + l.target] = true;
        pathLinkKeys[l.target + "|" + l.source] = true;
      });
    }

    var nodes = G.nodes
      .filter(function (n) {
        return visible[n.id];
      })
      .map(function (n) {
        var e = M.entById(n.id);
        var isRisk = e && (e.riskLevel === "red" || e.riskLevel === "orange");
        var isYellow = e && e.riskLevel === "yellow";
        var isFocus =
          focusNodeId && (n.id === focusNodeId || focusNeighbor[n.id]);
        var isFocusTarget = focusNodeId && n.id === focusNodeId;
        var onPath = !!(pathResult && pathNodes[n.id]);
        var isPathEnd = onPath && (n.id === pathStart || n.id === pathEnd);

        var itemStyle = {};
        if (onPath) {
          // 路径高亮：起终点强光晕，中间节点绿色描边
          itemStyle.borderColor = "#10B981";
          itemStyle.borderWidth = isPathEnd ? 3.5 : 2.5;
          itemStyle.shadowBlur = isPathEnd ? 16 : 6;
          itemStyle.shadowColor = "#10B981";
        } else if (isFocusTarget) {
          // 聚焦目标：粗描边 + 光晕（风险企业红色，普通蓝色）
          var glowColor = isRisk ? "#e03131" : "#2563EB";
          itemStyle.borderColor = glowColor;
          itemStyle.borderWidth = 3.5;
          itemStyle.shadowBlur = 16;
          itemStyle.shadowColor = glowColor;
        } else if (isRisk) {
          itemStyle.borderColor = "#e03131";
          itemStyle.borderWidth = 2.5;
        } else if (isYellow) {
          itemStyle.borderColor = "#f1b400";
          itemStyle.borderWidth = 2;
        } else if (riskMode && riskL1[n.id]) {
          // 风险一级关联：橙色虚线边 + ⚠ 角标
          itemStyle.borderColor = "#F97316";
          itemStyle.borderWidth = 2;
          itemStyle.borderType = "dashed";
        }

        // 招商线索节点：绿色虚线边框（在谈意向，区别于已落地企业）
        if (nodeLayer(n) === "lead") {
          itemStyle.borderType = "dashed";
          if (!itemStyle.borderWidth) itemStyle.borderWidth = 2;
        }

        // 透明度：路径分析 > 聚焦模式 > 风险透视模式
        var opacity = 1;
        if (pathResult && !onPath) {
          opacity = 0.12;
        } else if (focusNodeId && !isFocus) {
          opacity = 0.12;
        } else if (riskMode && e && !isRisk && !isYellow) {
          opacity = 0.25;
        } else if (riskMode && !e) {
          opacity = 0.3;
        }
        if (opacity < 1) {
          itemStyle.opacity = opacity;
        }

        // 节点大小：聚焦目标放大 2 倍，邻居放大 1.3 倍
        var baseSize = n.symbolSize || 30;
        var symSize = isFocusTarget
          ? baseSize * 2.2
          : isFocus
            ? baseSize * 1.3
            : baseSize;

        var labelOpacity = opacity;
        var labelFontSize = isFocusTarget ? 13 : isFocus ? 11 : 10;
        var labelWeight = isFocusTarget ? "bold" : "normal";
        var lbl = {
          opacity: labelOpacity,
          fontSize: labelFontSize,
          fontWeight: labelWeight,
        };
        // 标签前缀：⚠ 风险一级关联 / 🏗 土地缺口 / 💰 资金需求
        var pre = "";
        if (riskMode && riskL1[n.id]) pre += "⚠";
        if (n.gaps) {
          if (n.gaps.indexOf("land") >= 0) pre += "🏗";
          if (n.gaps.indexOf("fund") >= 0) pre += "💰";
        }
        if (pre) lbl.formatter = pre + " {b}";
        return {
          id: n.id,
          name: n.name,
          category: catIndex(n),
          symbolSize: symSize,
          value: n.value || "",
          desc: n.desc || "",
          itemStyle: itemStyle,
          label: lbl,
        };
      });
    var nameOf = {};
    nodes.forEach(function (n) {
      nameOf[n.id] = n.name;
    });

    // —— 4. 连线：业务语义着色（颜色×线型）+ 聚焦/风险透视叠加 ——
    var links = activeLinks
      .filter(function (l) {
        return visible[l.source] && visible[l.target];
      })
      .map(function (l) {
        var sem = semanticOf(l.relation);
        var isFocusLink =
          focusNodeId && (l.source === focusNodeId || l.target === focusNodeId);
        var isRiskLink =
          riskMode && (riskEntIds[l.source] || riskEntIds[l.target]);
        var isPathLink = !!(
          pathResult && pathLinkKeys[l.source + "|" + l.target]
        );
        // 基础样式：语义着色开启时按分类（颜色+线型），关闭则统一浅灰实线
        var color = linkColorOn ? sem.color : "#CBD5E1";
        var type = linkColorOn ? sem.type : "solid";
        var width = linkColorOn ? 1.1 : 1.2;
        var opacity = 0.6;

        if (isPathLink) {
          // 路径连线：绿色加粗
          color = "#10B981";
          type = "solid";
          width = 3;
          opacity = 0.95;
        } else if (isFocusLink) {
          color = "#2563EB";
          type = "solid";
          width = 2.5;
          opacity = 0.95;
        } else if (focusNodeId) {
          opacity = 0.08;
        } else if (isRiskLink) {
          color = "#e03131";
          type = "solid";
          width = 2;
          opacity = 0.9;
        } else if (riskMode) {
          opacity = 0.15;
        } else if (pathResult) {
          opacity = 0.08;
        }

        return {
          source: l.source,
          target: l.target,
          relation: l.relation || "关联",
          lineStyle: {
            color: color,
            width: width,
            opacity: opacity,
            type: type,
            curveness: 0.12,
          },
        };
      });

    // 可见连线的节点度数（辅助节点 tooltip 显示关联规模）
    var degreeCnt = {};
    links.forEach(function (l) {
      degreeCnt[l.source] = (degreeCnt[l.source] || 0) + 1;
      degreeCnt[l.target] = (degreeCnt[l.target] || 0) + 1;
    });

    // —— 5. 左侧图例与统计 ——
    // 辅助类别显示名映射（数据层保持不变）
    var AUX_DISPLAY = {
      投资机构: "投资平台",
      其他: "外部市场",
      意向企业: "招商线索",
    };
    var legendEl = U.$("#gLegend");
    if (legendEl) {
      var auxHtml = AUX_CATS.map(function (ac, i) {
        return (
          '<div class="lg-item"><span class="lg-dot" style="background:' +
          PAL[cats.length + i] +
          '"></span>' +
          U.esc(AUX_DISPLAY[ac] || ac) +
          "</div>"
        );
      }).join("");
      legendEl.innerHTML = byDistrict
        ? M.DISTRICTS.map(function (d, i) {
            return (
              '<div class="lg-item"><span class="lg-dot" style="background:' +
              CAT_COLORS[i % CAT_COLORS.length] +
              '"></span>' +
              U.esc(d.name) +
              "</div>"
            );
          }).join("") + auxHtml
        : cats
            .map(function (c, i) {
              return (
                '<div class="lg-item"><span class="lg-dot" style="background:' +
                PAL[i] +
                '"></span>' +
                U.esc(c) +
                "</div>"
              );
            })
            .join("") + auxHtml;
    }
    var statsEl = U.$("#gStats");
    if (statsEl) {
      var l1Cnt = Object.keys(riskL1).length;
      statsEl.textContent =
        "当前显示 " +
        nodes.length +
        " 个节点 / " +
        links.length +
        " 条关系" +
        (isolateNodeId ? "（聚焦模式）" : "") +
        (riskMode ? " · ⚠一级风险关联 " + l1Cnt + " 家" : "");
    }

    // —— 6. 不同布局的配置 ——
    // 图例高度约 30px，图谱内容从 top 开始；整体中心略下移更美观
    var seriesTop = 30;
    var seriesBottom = 32; // 底部留更多空间，中心自然下移
    var centerOffsetY = 20; // 环形/树形手动布局的额外下移量
    var seriesOpt = {
      type: "graph",
      layout: currentLayout === "tree" ? "force" : currentLayout,
      roam: "move",   // 内置只保留平移；缩放手写控制，以便调灵敏度
      draggable: true,
      top: seriesTop,
      bottom: seriesBottom,
      left: 24,
      right: 24,
      data: nodes,
      links: links,
      categories: allCats.map(function (c) {
        return { name: c };
      }),
      label: { show: true, fontSize: 10, position: "bottom", color: "#334155" },
      emphasis: { focus: "adjacency", lineStyle: { width: 3 } },
    };

    // 计算 series 区域中心点（用于 layout:none 时的坐标平移）
    var chartEl = U.$("#c_graph");
    var cw = chartEl ? chartEl.clientWidth : 800;
    var ch = chartEl ? chartEl.clientHeight : 560;
    // series 区域：left/right 各 24，top=seriesTop，bottom=seriesBottom
    var seriesW = cw - 48;
    var seriesH = ch - seriesTop - seriesBottom;
    var cx = seriesW / 2;
    var cy = seriesH / 2 + centerOffsetY;

    if (currentLayout === "force") {
      seriesOpt.force = {
        repulsion: 350,
        edgeLength: [80, 160],
        gravity: 0.06,
      };
    } else if (currentLayout === "circular") {
      seriesOpt.force = null;
      seriesOpt.circular = { rotateLabel: false };
      seriesOpt.layout = "none";
      // 环形坐标：半径自适应，中心为 series 区域中心
      var n = nodes.length;
      var maxR = Math.min(seriesW, seriesH) / 2 - 30;
      var r = Math.min(maxR, n > 20 ? 240 : n > 10 ? 180 : 120);
      nodes.forEach(function (nd, i) {
        var angle = (2 * Math.PI * i) / n - Math.PI / 2;
        nd.x = cx + r * Math.cos(angle);
        nd.y = cy + r * Math.sin(angle);
        nd.fixed = true;
      });
    } else if (currentLayout === "tree") {
      // 树形：放射状层次布局（BFS 分层 + 固定坐标 + layout:none）
      seriesOpt.force = null;
      seriesOpt.layout = "none";

      // 构建邻接表
      var adj = {};
      nodes.forEach(function (nd) {
        adj[nd.id] = [];
      });
      links.forEach(function (l) {
        if (adj[l.source]) adj[l.source].push(l.target);
        if (adj[l.target]) adj[l.target].push(l.source);
      });

      // 选根节点：优先"庆阳产业投资集团(G1)"，其次度数最大的节点
      var rootId = null;
      if (adj["G1"]) {
        rootId = "G1";
      } else {
        var maxDeg = -1;
        nodes.forEach(function (nd) {
          var deg = (adj[nd.id] || []).length;
          if (deg > maxDeg) {
            maxDeg = deg;
            rootId = nd.id;
          }
        });
      }

      // BFS 分层
      var layerOf = {};
      var layers = [];
      var queue = [rootId];
      layerOf[rootId] = 0;
      while (queue.length) {
        var id = queue.shift();
        var lv = layerOf[id];
        if (!layers[lv]) layers[lv] = [];
        layers[lv].push(id);
        (adj[id] || []).forEach(function (nid) {
          if (layerOf[nid] === undefined) {
            layerOf[nid] = lv + 1;
            queue.push(nid);
          }
        });
      }
      // 未访问到的节点（孤立或不连通）放到最外层
      var outerLv = layers.length;
      nodes.forEach(function (nd) {
        if (layerOf[nd.id] === undefined) {
          layerOf[nd.id] = outerLv;
          if (!layers[outerLv]) layers[outerLv] = [];
          layers[outerLv].push(nd.id);
        }
      });

      // 计算每层半径（自适应容器大小）
      var maxR = Math.min(seriesW, seriesH) / 2 - 20;
      var layerCount = layers.length;
      var stepR = Math.min(90, maxR / Math.max(1, layerCount));
      var layerRadius = [];
      for (var li = 0; li < layerCount; li++) {
        layerRadius[li] = li * stepR;
      }

      // 每层按角度均匀分布，中心为 series 区域中心
      var idMap = {};
      nodes.forEach(function (nd) {
        idMap[nd.id] = nd;
      });
      layers.forEach(function (layer, li) {
        var r = layerRadius[li];
        var count = layer.length;
        // 根节点（第 0 层只有 1 个）放在中心
        if (count === 1 && li === 0) {
          idMap[layer[0]].x = cx;
          idMap[layer[0]].y = cy;
          idMap[layer[0]].fixed = true;
          return;
        }
        layer.forEach(function (nid, i) {
          var angle = (2 * Math.PI * i) / count - Math.PI / 2;
          idMap[nid].x = cx + r * Math.cos(angle);
          idMap[nid].y = cy + r * Math.sin(angle);
          idMap[nid].fixed = true;
        });
      });
    }

    currentChart = mkChart(U.$("#c_graph"), {
      tooltip: {
        formatter: function (p) {
          if (p.dataType === "edge") {
            var rel = p.data.relation || "关联";
            if (
              riskMode &&
              (riskEntIds[p.data.source] || riskEntIds[p.data.target])
            ) {
              return (
                '<b style="color:#e03131;">风险传导路径</b><br/>' +
                nameOf[p.data.source] +
                " → " +
                nameOf[p.data.target] +
                "<br/>关系：" +
                rel
              );
            }
            var sem = semanticOf(rel);
            return (
              '<b style="color:' +
              sem.color +
              ';">' +
              sem.label +
              "</b>" +
              '<span style="color:#94A3B8;">（' +
              U.esc(rel) +
              "）</span><br/>" +
              nameOf[p.data.source] +
              ' <span style="color:#94A3B8;">→</span> ' +
              nameOf[p.data.target]
            );
          }
          var e = M.entById(p.data.id);
          if (e) {
            var gaps = GAP_MAP[p.data.id];
            var gapHtml = "";
            if (gaps && gaps.indexOf("land") >= 0)
              gapHtml += "<br/>🏗 土地缺口：待落实项目用地";
            if (gaps && gaps.indexOf("fund") >= 0)
              gapHtml += "<br/>💰 资金需求：融资对接中";
            return (
              "<b>" +
              U.esc(e.name) +
              "</b><br/>" +
              U.esc(e.industryName) +
              " · " +
              U.esc(e.districtName) +
              "<br/>营收 " +
              U.esc(e.overview.revenue) +
              " · " +
              (RISK_LABEL[e.riskLevel] || "正常") +
              gapHtml
            );
          }
          var degLine = degreeCnt[p.data.id]
            ? '<br/><span style="color:#94A3B8;">关联节点 ' +
              degreeCnt[p.data.id] +
              " 个</span>"
            : "";
          return (
            "<b>" +
            U.esc(p.data.name) +
            "</b>" +
            (p.data.desc ? "<br/>" + U.esc(p.data.desc) : "") +
            degLine
          );
        },
      },
      color: PAL,
      legend: [
        {
          data: cats,
          left: 12,
          right: 12,
          top: 4,
          itemWidth: 14,
          itemHeight: 9,
          itemGap: 10,
          textStyle: { fontSize: 11 },
        },
      ],
      series: [seriesOpt],
    });

    // —— 7. 交互事件（同一实例只绑定一次，避免重渲染叠加）——
    if (currentChart && currentChart.on && boundChart !== currentChart) {
      boundChart = currentChart;
      // 单击：路径模式选点；红/橙企业 → 风险影响半径；其他企业 → 跳转画像
      // 单击动作延时执行：同一节点快速连点两次（双击）时取消已排队的单击，
      // 交由双击进入隔离模式——否则双击企业会先被单击触发跳转画像而失效。
      currentChart.on("click", function (p) {
        if (p.dataType === "node" && p.data && p.data.id) {
          if (pathMode) {
            handlePathPick(p.data.id);
            return;
          }
          var nodeId = p.data.id;
          var nodeName = p.data.name,
            nodeDesc = p.data.desc;
          var e = M.entById(nodeId);
          clearTimeout(singleTimer);
          singleTimer = setTimeout(function () {
            singleTimer = null;
            if (!e) {
              // 线索节点 → 跳转到招商项目页（数据同源：线索节点 = 线索对接阶段项目）
              var n = M.GRAPH.nodes.find(function (x) {
                return x.id === nodeId;
              });
              if (n && n.projectId) {
                state.project = n.projectId;
                state.page = "project";
                APP.render();
                return;
              }
              C.toast(nodeName + (nodeDesc ? "：" + nodeDesc : ""), "info");
              return;
            }
            if (e.riskLevel === "red" || e.riskLevel === "orange") {
              // 聚焦 + 弹出风险影响半径卡
              focusNodeId = e.id;
              renderGraphChart();
              showRiskRadiusCard(e);
            } else {
              focusNodeId = null;
              closeRiskRadiusCard(true);
              state.ent = e.id;
              state.page = "profile";
              APP.render();
            }
          }, SINGLE_WAIT);
        }
      });
      // 双击节点：隔离模式（仅看该节点+邻居）；取消挂起的单击；路径选点模式下禁用
      currentChart.on("dblclick", function (p) {
        if (p.dataType === "node" && p.data && p.data.id) {
          if (pathMode) return;
          clearTimeout(singleTimer);
          singleTimer = null;
          if (isolateNodeId === p.data.id) {
            isolateNodeId = null; // 双击同一个 → 恢复
          } else {
            isolateNodeId = p.data.id;
          }
          renderGraphChart();
        }
      });

      // 恢复上次缩放比例（跨 renderGraphChart 保持）
      if (graphZoom !== 1 && currentChart.setOption) {
        try { currentChart.setOption({ series: [{ zoom: graphZoom }] }); } catch (e) {}
      }

      // ---- 滚轮 / 双指缩放灵敏度调低（默认 ECharts 每格约 10-15%，这里降到约 4%） ----
      // 思路：roam 已设为 'move'（仅保留平移），缩放完全自己控制，步长更小
      var dom = typeof currentChart.getDom === 'function' ? currentChart.getDom() : null;
      if (!dom) return;
      dom.addEventListener('wheel', function (e) {
        e.preventDefault();
        var factor = e.deltaY > 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
        graphZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, graphZoom * factor));
        currentChart.setOption({ series: [{ zoom: graphZoom }] });
      }, { passive: false });

      // 双指捏合缩放（移动端触控，同样降低灵敏度：距离比开 0.5 次方 = 阻尼一半）
      var touchStartDist = 0, touchStartZoom = 1;
      dom.addEventListener('touchstart', function (e) {
        if (e.touches.length === 2) {
          var dx = e.touches[0].clientX - e.touches[1].clientX;
          var dy = e.touches[0].clientY - e.touches[1].clientY;
          touchStartDist = Math.sqrt(dx * dx + dy * dy);
          touchStartZoom = graphZoom;
        }
      }, { passive: true });
      dom.addEventListener('touchmove', function (e) {
        if (e.touches.length === 2 && touchStartDist > 10) {
          e.preventDefault();
          var dx = e.touches[0].clientX - e.touches[1].clientX;
          var dy = e.touches[0].clientY - e.touches[1].clientY;
          var dist = Math.sqrt(dx * dx + dy * dy);
          var ratio = Math.pow(dist / touchStartDist, 0.5);
          graphZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, touchStartZoom * ratio));
          currentChart.setOption({ series: [{ zoom: graphZoom }] });
        }
      }, { passive: false });
    }
  }

  APP.registerRenderer("graph", renderGraph);
})();
