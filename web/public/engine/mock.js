/* ============================================================
 * 招商企业服务与智慧监管平台 —— DEMO 模拟数据层 V4
 * 数据引擎：种子随机生成 + 全局聚合推导，所有汇总数与明细天然对账
 * 约束：不依赖任何外部库，纯 IIFE，挂 window.MOCK
 * ============================================================ */
(function (global) {
  "use strict";

  // ============================================================
  // 一、基础常量
  // ============================================================
  var TODAY = new Date();
  var pad = function (n) {
    return n < 10 ? "0" + n : "" + n;
  };
  var fmtDate = function (d) {
    return (
      d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate())
    );
  };
  var fmtDateShort = function (d) {
    return d.getMonth() + 1 + "月" + d.getDate() + "日";
  };
  var daysAgo = function (n) {
    var d = new Date();
    d.setDate(d.getDate() - n);
    return d;
  };
  var daysLater = function (n) {
    var d = new Date();
    d.setDate(d.getDate() + n);
    return d;
  };

  // 月份序列（今年 1 月至当月，用于"本年度"趋势）
  var MONTHS = [];
  for (var m = 0; m <= TODAY.getMonth(); m++) {
    var d = new Date(TODAY.getFullYear(), m, 1);
    MONTHS.push(pad(d.getMonth() + 1) + "月");
  }
  // 近 6 个月（含当月），保留兼容
  var MONTHS_6 = [];
  for (var m6 = 5; m6 >= 0; m6--) {
    var d6 = new Date(TODAY.getFullYear(), TODAY.getMonth() - m6, 1);
    MONTHS_6.push(pad(d6.getMonth() + 1) + "月");
  }
  // 年份序列（近 5 年）
  var YEARS_5 = [];
  for (var yy = 4; yy >= 0; yy--) {
    YEARS_5.push(TODAY.getFullYear() - yy + "年");
  }

  // 风险维度（权重合计 1）
  var RISK_DIMS = [
    { key: "operation", name: "经营风险", weight: 0.2 },
    { key: "finance", name: "财务风险", weight: 0.15 },
    { key: "judicial", name: "司法风险", weight: 0.15 },
    { key: "credit", name: "信用风险", weight: 0.15 },
    { key: "tender", name: "招投标风险", weight: 0.1 },
    { key: "tax", name: "税务风险", weight: 0.1 },
    { key: "perform", name: "招商履约风险", weight: 0.1 },
    { key: "ip", name: "知识产权风险", weight: 0.05 },
  ];

  var LEVELS = {
    red: { name: "重大风险", color: "#e03131", bg: "rgba(224,49,49,.12)" },
    orange: { name: "较高风险", color: "#F97316", bg: "rgba(240,140,0,.12)" },
    yellow: { name: "一般风险", color: "#f1b400", bg: "rgba(241,180,0,.14)" },
    blue: { name: "关注风险", color: "#1c7ed6", bg: "rgba(28,126,214,.12)" },
  };

  // customDims：传入外部维度权重数组时按其计算，否则用当前 RISK_DIMS
  function calcRiskScore(risks, customDims) {
    var dims = customDims || RISK_DIMS;
    var s = 0;
    dims.forEach(function (d) {
      if (d.weight > 0 && risks[d.key] != null) s += d.weight * risks[d.key];
    });
    return Math.round(s);
  }
  function scoreToLevel(score) {
    if (score >= 65) return "red";
    if (score >= 45) return "orange";
    if (score >= 25) return "yellow";
    return "blue";
  }

  // 动态调整八大风险维度权重并全量热重算：
  // 更新 RISK_DIMS 闭包权重 → 重算 120 家企业 score/level → 重算派生结构并回写 global.MOCK。
  // newWeights: [{ key, name, weight }]（8 维，weight 合计≈1.0）
  function applyRiskWeights(newWeights) {
    if (!newWeights || !newWeights.length) return false;
    var applied = false;
    newWeights.forEach(function (nw) {
      for (var i = 0; i < RISK_DIMS.length; i++) {
        if (RISK_DIMS[i].key === nw.key && typeof nw.weight === "number") {
          RISK_DIMS[i].weight = nw.weight;
          if (nw.name) RISK_DIMS[i].name = nw.name;
          applied = true;
        }
      }
    });
    if (!applied) return false;
    ENTERPRISES.forEach(function (e) {
      if (e.risks) {
        e.riskScore = calcRiskScore(e.risks);
        e.riskLevel = scoreToLevel(e.riskScore);
      }
    });
    // 重算派生结构（聚合/日报/图谱等），回写导出对象
    var d = deriveAll(ENTERPRISES, RISK_EVENTS, PROJECTS, TASKS, POLICY_LIB, LR);
    var M = global.MOCK || {};
    M.RISK_DIMS = RISK_DIMS;
    M.DISTRICT_DATA = d.DISTRICT_DATA;
    M.INDUSTRIES = d.INDUSTRIES;
    M.OVERVIEW = d.OVERVIEW;
    M.riskStats = d.riskStats;
    M.AI_DAILY = d.AI_DAILY;
    M.GRAPH = d.GRAPH;
    return true;
  }

  // 区县
  var DISTRICTS = [
    { key: "xf", name: "西峰区" },
    { key: "qc", name: "庆城县" },
    { key: "hj", name: "环县" },
    { key: "hn", name: "华池县" },
    { key: "hy", name: "合水县" },
    { key: "zq", name: "正宁县" },
    { key: "ning", name: "宁县" },
    { key: "zx", name: "镇原县" },
  ];

  // 产业大类（与企业 industry 对应，用于统计）
  var INDUSTRIES_META = [
    { key: "software", name: "软件与信息技术", color: "#2563EB" },
    { key: "neequip", name: "新能源装备制造", color: "#3B82F6" },
    { key: "chemical", name: "化学原料制造", color: "#F97316" },
    { key: "agrifood", name: "农副食品加工", color: "#22C55E" },
    { key: "genequip", name: "通用设备制造", color: "#6366F1" },
    { key: "biomed", name: "生物医药", color: "#8B5CF6" },
    { key: "culture", name: "文旅创意", color: "#EC4899" },
    { key: "logistics", name: "道路运输与物流", color: "#0EA5E9" },
    { key: "wholesale", name: "批发与跨境贸易", color: "#14B8A6" },
    { key: "building", name: "建材与非金属制品", color: "#64748B" },
    { key: "agriequip", name: "农业机械装备", color: "#84CC16" },
    { key: "oilgas", name: "石油化工与能源", color: "#DC2626" },
  ];

  // 规模
  var SCALES = ["大型企业", "中型企业", "小型企业", "微型企业"];

  // ============================================================
  // 二、伪随机（种子固定 => 数据稳定）
  // ============================================================
  var SEED = 20260822;
  function mulberry32(a) {
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  var RNG = mulberry32(SEED);
  function rint(a, b) {
    return a + Math.floor(RNG() * (b - a + 1));
  }
  function rfloat(a, b, d) {
    var v = a + RNG() * (b - a);
    return d == null ? v : Number(v.toFixed(d));
  }
  function rpick(arr) {
    return arr[Math.floor(RNG() * arr.length)];
  }
  function rbool(p) {
    return RNG() < p;
  }

  // ============================================================
  // 三、企业名称生成（庆阳本地化、贴合真实产业）
  // ============================================================
  var FIRST_NAMES = [
    "庆阳",
    "陇东",
    "西峰",
    "环江",
    "子午线",
    "新飞腾",
    "长庆",
    "南山",
    "千川汇",
    "西梁",
    "万顺达",
    "信安通",
    "和盛",
    "路达",
    "聚元",
    "平泉",
    "新国信",
    "云智",
    "燧原",
    "环球",
  ];
  var COMPANY_TYPES = [
    { suffix: "科技有限公司", industry: "software", tag: "高新技术企业" },
    { suffix: "信息技术有限公司", industry: "software", tag: "专精特新" },
    { suffix: "装备制造有限公司", industry: "neequip", tag: "新能源产业链" },
    { suffix: "新材料股份有限公司", industry: "chemical", tag: "高新技术企业" },
    { suffix: "食品有限公司", industry: "agrifood", tag: "乡村振兴" },
    { suffix: "网络有限公司", industry: "genequip", tag: "专精特新小巨人" },
    { suffix: "药业有限公司", industry: "biomed", tag: "生物医药" },
    { suffix: "文化传播有限公司", industry: "culture", tag: "文旅融合" },
    { suffix: "智慧物流有限公司", industry: "logistics", tag: "智慧物流" },
    { suffix: "电子商务有限公司", industry: "wholesale", tag: "跨境电子商务" },
    { suffix: "半导体材料有限公司", industry: "building", tag: "半导体材料" },
    { suffix: "农机装备有限公司", industry: "agriequip", tag: "乡村振兴" },
    { suffix: "能源化工有限公司", industry: "oilgas", tag: "传统产业升级" },
    { suffix: "智能科技有限公司", industry: "software", tag: "信创" },
    { suffix: "数据服务有限公司", industry: "software", tag: "数据要素" },
  ];
  // 名称去重：120 家企业从「前缀 × 类型」组合中取名，随机抽取存在撞名可能；
  // 撞名时按确定性顺序轮换前缀（不消耗随机数，保证其余模拟数据完全稳定），确保全市企业名称唯一
  var _usedEntNames = {};
  function generateEnterpriseName(id) {
    var first = rpick(FIRST_NAMES);
    var type = rpick(COMPANY_TYPES);
    function pickUnique(suffix, startIdx) {
      for (var i = 0; i < FIRST_NAMES.length; i++) {
        var nm = FIRST_NAMES[(startIdx + i) % FIRST_NAMES.length] + suffix;
        if (!_usedEntNames[nm]) return nm;
      }
      return null;
    }
    var name = first + type.suffix;
    if (_usedEntNames[name]) {
      var alt = pickUnique(type.suffix, FIRST_NAMES.indexOf(first) + 1);
      if (!alt) {
        // 极端情况：该后缀下 20 个前缀全部用尽，插入中间字扩展组合
        var mids = ["华", "源", "通", "达", "诚", "瑞", "恒", "泰"];
        for (var mi = 0; mi < mids.length && !alt; mi++) {
          alt = pickUnique(mids[mi] + type.suffix, FIRST_NAMES.indexOf(first));
        }
      }
      name = alt || name;
    }
    _usedEntNames[name] = true;
    return { name: name, industry: type.industry, baseTag: type.tag };
  }
  function industryName(key) {
    var m = INDUSTRIES_META.filter(function (x) {
      return x.key === key;
    })[0];
    return m ? m.name : key;
  }

  // ============================================================
  // 四、生成 120 家企业
  // ============================================================

  // 先预分配到区县（与 DISTRICT_DATA 企业数比例一致）
  // 120 家按比例分配：西峰区最多，依次递减
  var DISTRICT_COUNT = {
    xf: 35,
    qc: 16,
    hj: 14,
    hn: 7,
    hy: 8,
    zq: 9,
    ning: 13,
    zx: 18,
  };
  // 核验总数
  var _chk = 0;
  for (var k in DISTRICT_COUNT) _chk += DISTRICT_COUNT[k]; // 120

  var ENTERPRISES = [];
  var entIdCounter = 0;

  function generateEnterprise(id, districtKey, isDeep) {
    var info = generateEnterpriseName(id);
    var indKey = info.industry;

    // 规模与基期营收（万元）
    var scale, baseRevenue;
    var r = RNG();
    if (isDeep || r < 0.12) {
      scale = "大型企业";
      baseRevenue = rfloat(15000, 80000, 0);
    } else if (r < 0.42) {
      scale = "中型企业";
      baseRevenue = rfloat(5000, 15000, 0);
    } else if (r < 0.8) {
      scale = "小型企业";
      baseRevenue = rfloat(1000, 5000, 0);
    } else {
      scale = "微型企业";
      baseRevenue = rfloat(200, 1000, 0);
    }

    // 年增长率（用于生成 5 年历史）
    var yearGrowth = rfloat(-0.03, 0.18, 3); // -3% ~ +18%
    // 大型企业/高技术产业增长率更高
    if (indKey === "software" || indKey === "biomed" || indKey === "neequip") {
      yearGrowth = Math.max(0.03, yearGrowth + 0.06);
    }
    // 风险高的增长率更低（反向相关，合理）

    // 5 年年度历史（从远到近：year-4 → 今年）
    // 以 baseRevenue 为今年参考值，倒推前 4 年
    var yearlyHistory = { years: [], revenue: [] };
    var curYear = TODAY.getFullYear();
    for (var y = 0; y < 5; y++) {
      yearlyHistory.years.push(curYear - 4 + y);
      // y=0 是 4 年前 → /(1+g)^4；y=4 是今年 → baseRevenue
      var factor = Math.pow(1 + yearGrowth, y - 4);
      yearlyHistory.revenue.push(Math.round(baseRevenue * factor));
    }
    yearlyHistory.revenue[4] = Math.round(baseRevenue);

    // 生成今年以来的月度数据（1 月→当月，单位：万元）
    var growthArr = [];
    var currentMonth = TODAY.getMonth(); // 0-based
    var monthsThisYear = currentMonth + 1;
    var yearRevenue = yearlyHistory.revenue[4];
    for (var m = 0; m < monthsThisYear; m++) {
      // 季节性因子：Q1 略低，Q4 略高
      var season = 1 + 0.1 * Math.sin((m / 12) * Math.PI * 2 - Math.PI / 2);
      var monthRev = Math.round(
        (yearRevenue / 12) * season * (1 + rfloat(-0.05, 0.05, 3)),
      );
      growthArr.push(monthRev);
    }
    // 不足 6 个月时补前一年最后几个月（兼容年初场景）
    while (growthArr.length < 6) {
      var prevDec = Math.round((yearlyHistory.revenue[3] / 12) * 1.15);
      growthArr.unshift(prevDec);
    }
    // currentRevenue 保持"年度营收"含义（与历史逻辑一致，用于 overview.revenueWan 等）
    var currentRevenue = Math.round(baseRevenue);

    // 纳税率（营收的 5%~8%）
    var taxRate = rfloat(0.04, 0.09, 3);
    var taxArr = growthArr.map(function (v) {
      return Math.round(v * taxRate);
    });
    var currentTax = Math.round(currentRevenue * taxRate);

    // 投资（承诺投资额，万元）
    var investTotal = Math.round(currentRevenue * rfloat(0.8, 2.0, 2));
    var investArr = growthArr.map(function (v, i) {
      return Math.round(investTotal * (0.6 + (0.4 * i) / 5));
    });
    var currentInvest = investArr[investArr.length - 1];

    // 员工数（营收 / 人均营收，人均 30~120 万）
    var revPerEmp = rfloat(30, 120, 0); // 万元/人
    var employees = Math.max(10, Math.round(currentRevenue / revPerEmp));
    var empArr = growthArr.map(function (v) {
      return Math.max(8, Math.round(v / revPerEmp));
    });

    // 注册资本
    var regCapital = Math.round(investTotal * rfloat(0.5, 1.2, 2));

    // 成立时间
    var foundYears = rint(1, 10);
    var found = new Date(
      TODAY.getFullYear() - foundYears,
      rint(0, 11),
      rint(1, 28),
    );

    // 九维风险（根据增长率反向推导 + 随机）
    // 增长差 => 经营/财务/履约风险高
    var growthRisk = Math.max(
      0,
      Math.min(100, Math.round((0.1 - yearGrowth) * 800 + rfloat(-10, 10, 0))),
    );
    // 经营风险
    var opRisk = Math.max(0, Math.min(100, growthRisk + rint(-15, 15)));
    var finRisk = Math.max(0, Math.min(100, growthRisk - 5 + rint(-15, 15)));
    var judicialRisk = rint(0, 60);
    if (scale === "大型企业") judicialRisk = Math.max(0, judicialRisk - 15);
    var creditRisk = Math.max(0, judicialRisk - 10 + rint(-10, 10));
    var tenderRisk = rint(5, 50);
    var taxRisk = Math.max(0, Math.round(finRisk * 0.7 + rint(-10, 10)));
    var performRisk = Math.max(
      0,
      Math.min(
        100,
        Math.round((1 - currentInvest / investTotal) * 80 + rint(-10, 10)),
      ),
    );
    var ipRisk = rint(0, 30);

    var risks = {
      operation: opRisk,
      finance: finRisk,
      judicial: judicialRisk,
      credit: creditRisk,
      tender: tenderRisk,
      tax: taxRisk,
      perform: performRisk,
      ip: ipRisk,
    };
    var riskScore = calcRiskScore(risks);
    var riskLevel = scoreToLevel(riskScore);

    // 履约率（投资完成率，0~100 之间）
    var performRate = Math.min(
      100,
      Math.max(0, Math.round((currentInvest / investTotal) * 100)),
    );
    var bizStatus = opRisk < 50 ? "正常" : opRisk < 70 ? "关注" : "异常";
    var creditStatus =
      creditRisk < 30 ? "正常" : creditRisk < 60 ? "关注" : "异常";

    // 标签
    var tags = [info.baseTag];
    if (scale === "大型企业") tags.push("重点招商企业");
    if (rbool(0.3)) tags.push("高新技术企业");
    if (rbool(0.2)) tags.push("专精特新");

    // 地址
    var distName =
      (
        DISTRICTS.filter(function (d) {
          return d.key === districtKey;
        })[0] || {}
      ).name || "";
    var address =
      distName +
      (rbool(0.5) ? "工业园区" : "产业园区") +
      (rbool(0.5) ? " A 座" : " B 区");

    // 法定代表人
    var surnames = [
      "王",
      "李",
      "张",
      "刘",
      "陈",
      "杨",
      "黄",
      "赵",
      "周",
      "吴",
      "徐",
      "孙",
      "马",
      "朱",
      "胡",
      "郭",
      "何",
      "高",
      "林",
      "罗",
    ];
    var givenNames = [
      "建国",
      "志强",
      "文博",
      "明",
      "丽",
      "敏",
      "凯",
      "涛",
      "晓彤",
      "雅",
      "建军",
      "俊才",
      "慧敏",
      "思远",
      "伟",
      "芳",
    ];
    var legal = rpick(surnames) + rpick(givenNames);

    // 统一社会信用代码（演示用，格式近似）
    var creditCode =
      "9162" +
      (100000 + rint(0, 99999)) +
      "MA" +
      String.fromCharCode(65 + rint(0, 25)) +
      String.fromCharCode(65 + rint(0, 25)) +
      (1000 + rint(0, 8999));

    // 股东结构（2~4 个）
    var shCount = rint(2, 4);
    var shareholders = [];
    var remaining = 100;
    var shNames = [
      info.baseTag + "产业基金",
      "庆阳产业投资集团",
      "陇东资本",
      "国信产业基金",
      "员工持股平台",
      legal,
    ];
    for (var si = 0; si < shCount; si++) {
      var ratio =
        si === shCount - 1
          ? remaining
          : Math.round(remaining * rfloat(0.3, 0.7, 2));
      if (ratio > remaining) ratio = remaining;
      remaining -= ratio;
      shareholders.push({
        name: shNames[si % shNames.length] || "股东" + (si + 1),
        ratio: ratio,
      });
    }

    // 动态（2~6 条）
    var dynamics = [];
    var dynCount = rint(2, 6);
    var dynTypes = [
      {
        type: "经营",
        pool: [
          "上半年营收同比增长，保持良好势头",
          "经营指标平稳，订单量稳步增加",
          "市场拓展取得新突破，进入新区域市场",
        ],
      },
      {
        type: "创新",
        pool: [
          "新增发明专利授权",
          "通过省级技术中心认定",
          "研发投入同比增长，新产品上市",
        ],
      },
      {
        type: "招投标",
        pool: ["中标政府项目", "入围省级采购目录", "签订重要合作协议"],
      },
      {
        type: "招商",
        pool: ["二期项目签约", "落地新投资计划", "纳入重点培育企业库"],
      },
      {
        type: "风险",
        pool: ["出现经营异常提醒", "环保整改通知", "信用等级下调预警"],
      },
      {
        type: "司法",
        pool: ["新增合同纠纷", "被列为被执行人", "涉诉案件开庭"],
      },
    ];
    // 风险高的企业更多风险动态
    var riskDynCount = riskLevel === "red" ? 2 : riskLevel === "orange" ? 1 : 0;
    for (var di = 0; di < dynCount; di++) {
      var typePool;
      if (di < riskDynCount) {
        typePool = dynTypes.filter(function (t) {
          return t.type === "风险" || t.type === "司法";
        })[0];
      } else {
        typePool = rpick(dynTypes);
      }
      var dy = daysAgo(rint(1, 180));
      dynamics.push({
        date: fmtDate(dy),
        type: typePool.type,
        text: rpick(typePool.pool),
      });
    }
    dynamics.sort(function (a, b) {
      return new Date(b.date) - new Date(a.date);
    });

    // 招商承诺（4~5 项）
    var commitments = [
      {
        name: "注册资本",
        promise: regCapital,
        actual: Math.round(regCapital * rfloat(0.9, 1.0, 2)),
        unit: "万元",
      },
      {
        name: "实际投资",
        promise: investTotal,
        actual: currentInvest,
        unit: "万元",
      },
      {
        name: "年营收",
        promise: Math.round(baseRevenue * 1.2),
        actual: currentRevenue,
        unit: "万元",
      },
      {
        name: "年纳税",
        promise: Math.round(baseRevenue * taxRate * 1.1),
        actual: currentTax,
        unit: "万元",
      },
      {
        name: "就业岗位",
        promise: Math.round(employees * 1.15),
        actual: employees,
        unit: "人",
      },
    ];

    // 确保有足够的高风险企业（演示更真实）：
    // 如果是深度企业且当前分数偏低，按概率拉高到橙/红级
    if (isDeep && riskScore < 50 && RNG() < 0.2) {
      // 拉高 2~3 个维度，把综合分提到 55~75 之间
      var targetScore = rint(55, 75);
      var diff = targetScore - riskScore;
      var dims = ["operation", "judicial", "perform", "finance", "credit"];
      for (var di = 0; di < 2 && diff > 0; di++) {
        var dk = rpick(dims);
        var add = Math.min(diff * 2, rint(20, 40));
        risks[dk] = Math.min(100, risks[dk] + add);
      }
      riskScore = calcRiskScore(risks);
      riskLevel = scoreToLevel(riskScore);
    }

    var e = {
      id: id,
      name: info.name,
      creditCode: creditCode,
      legal: legal,
      regCapital: regCapital,
      regCapitalFmt:
        regCapital >= 10000
          ? (regCapital / 10000).toFixed(1) + "亿元"
          : regCapital + "万元",
      found: fmtDate(found),
      industry: indKey,
      industryName: industryName(indKey),
      scale: scale,
      tags: tags,
      district: districtKey,
      districtName: distName,
      address: address,
      isDeep: !!isDeep,
      signDaysAgo: rint(1, 180), // 招商签约/落地天数
      overview: {
        regCapital:
          regCapital >= 10000
            ? (regCapital / 10000).toFixed(1) + "亿元"
            : regCapital + "万元",
        revenue:
          currentRevenue >= 10000
            ? (currentRevenue / 10000).toFixed(1) + "亿元"
            : currentRevenue + "万元",
        revenueWan: currentRevenue,
        tax: currentTax + "万元",
        taxWan: currentTax,
        employees: employees,
        invest:
          currentInvest >= 10000
            ? (currentInvest / 10000).toFixed(1) + "亿元"
            : currentInvest + "万元",
        investWan: currentInvest,
        profit: Math.round(currentRevenue * rfloat(0.05, 0.2, 2)) + "万元",
        // 近 5 年年度历史数据（万 / 人）
        yearly: {
          years: yearlyHistory.years,
          revenueWan: yearlyHistory.revenue,
          taxWan: yearlyHistory.revenue.map(function (v) {
            return Math.round(v * taxRate);
          }),
          employees: yearlyHistory.revenue.map(function (v) {
            return Math.max(5, Math.round(v / revPerEmp));
          }),
          investWan: yearlyHistory.revenue.map(function (v, i) {
            return Math.round(investTotal * (0.4 + (0.6 * i) / 4));
          }),
        },
      },
      status: {
        biz: bizStatus,
        credit: creditStatus,
        performRate: performRate,
      },
      operation: {
        revenue: growthArr.map(function (v) {
          return +(v / 10000).toFixed(2);
        }), // 亿
        tax: growthArr.map(function (v, i) {
          return taxArr[i];
        }),
        invest: investArr,
        employees: empArr,
      },
      commitments: commitments,
      dynamics: dynamics,
      risks: risks,
      riskScore: riskScore,
      riskLevel: scoreToLevel(riskScore),
      shareholders: shareholders,
      policies: [], // 稍后分配
      ai: null, // 深度企业才生成
    };
    return e;
  }

  // 生成 15 家深度企业（每个区县 1~3 家，西峰区最多）
  var deepPerDistrict = {
    xf: 4,
    qc: 2,
    hj: 2,
    hn: 1,
    hy: 1,
    zq: 1,
    ning: 2,
    zx: 2,
  };
  var deepIds = [];
  var deepIndex = 0;
  DISTRICTS.forEach(function (d) {
    var n = deepPerDistrict[d.key];
    for (var i = 0; i < n; i++) {
      entIdCounter++;
      var id =
        "E" +
        (entIdCounter < 10 ? "00" : entIdCounter < 100 ? "0" : "") +
        entIdCounter;
      var e = generateEnterprise(id, d.key, true);
      deepIndex++;
      // 人为制造 2 家红色风险企业（西峰区前 2 家深度企业），保证演示有冲击力
      if (d.key === "xf" && deepIndex <= 2) {
        e.risks.operation = rint(75, 92);
        e.risks.finance = rint(70, 88);
        e.risks.judicial = rint(68, 85);
        e.risks.credit = rint(60, 78);
        e.risks.tax = rint(62, 80);
        e.risks.perform = rint(65, 82);
        e.riskScore = calcRiskScore(e.risks);
        e.riskLevel = scoreToLevel(e.riskScore);
        e.status.biz = "异常";
        e.status.credit = "关注";
        e.status.performRate = rint(40, 60);
      }
      ENTERPRISES.push(e);
      deepIds.push(id);
    }
  });

  // 生成其余 105 家轻量企业
  DISTRICTS.forEach(function (d) {
    var total = DISTRICT_COUNT[d.key];
    var deep = deepPerDistrict[d.key];
    var light = total - deep;
    for (var i = 0; i < light; i++) {
      entIdCounter++;
      var id = "E" + (entIdCounter < 100 ? "0" : "") + entIdCounter;
      var e = generateEnterprise(id, d.key, false);
      ENTERPRISES.push(e);
    }
  });

  // ============================================================
  // 五、政策库（20+ 条，覆盖所有标签）
  // ============================================================
  var POLICY_LIB = [
    {
      code: "P01",
      name: "高新技术企业税收优惠",
      dept: "税务局",
      type: "税收",
      level: "国家级",
      apply: "高新技术企业减按15%税率征收企业所得税。",
      tag: "高新技术企业",
    },
    {
      code: "P02",
      name: "东数西算电价优惠政策",
      dept: "发改委",
      type: "要素",
      level: "省级",
      apply: "数据中心企业执行大工业电价，支持直供电试点。",
      tag: "数据要素",
    },
    {
      code: "P03",
      name: "专精特新企业奖励资金",
      dept: "工信局",
      type: "资金",
      level: "省级",
      apply: "省级专精特新奖励50万元，国家级小巨人奖励100万元。",
      tag: "专精特新",
    },
    {
      code: "P04",
      name: "研发费用加计扣除",
      dept: "税务局",
      type: "税收",
      level: "国家级",
      apply: "企业研发费用按100%加计扣除。",
      tag: "高新技术企业",
    },
    {
      code: "P05",
      name: "乡村振兴产业扶持资金",
      dept: "农业农村局",
      type: "资金",
      level: "市级",
      apply: "乡村振兴重点产业项目给予贷款贴息与设备补贴。",
      tag: "乡村振兴",
    },
    {
      code: "P06",
      name: "首台套保险补偿政策",
      dept: "工信局",
      type: "资金",
      level: "省级",
      apply: "首台套重大技术装备给予保费80%补偿。",
      tag: "新能源产业链",
    },
    {
      code: "P07",
      name: "高层次人才引进安家补贴",
      dept: "人社局",
      type: "人才",
      level: "市级",
      apply: "高层次人才安家补贴最高50万元，购房补贴最高30万元。",
      tag: "高新技术企业",
    },
    {
      code: "P08",
      name: "工业用地出让金优惠",
      dept: "自然资源局",
      type: "要素",
      level: "市级",
      apply: "重点招商项目工业用地可按不低于等别最低价标准的70%执行。",
      tag: "重点招商企业",
    },
    {
      code: "P09",
      name: "跨境电商综合试验区扶持",
      dept: "商务局",
      type: "资金",
      level: "国家级",
      apply: "海外仓建设、品牌培育、市场拓展给予资金支持。",
      tag: "跨境电子商务",
    },
    {
      code: "P10",
      name: "数据要素试点企业扶持",
      dept: "大数据局",
      type: "资金",
      level: "省级",
      apply: "公共数据授权运营试点企业给予最高200万元启动资金。",
      tag: "数据要素",
    },
    {
      code: "P11",
      name: "专精特新小巨人奖励",
      dept: "工信局",
      type: "资金",
      level: "国家级",
      apply: '国家级专精特新"小巨人"企业奖励300万元。',
      tag: "专精特新小巨人",
    },
    {
      code: "P12",
      name: "绿色建材产品认证补贴",
      dept: "住建局",
      type: "资金",
      level: "省级",
      apply: "通过绿色建材产品三星认证的企业给予50万元补贴。",
      tag: "绿色建材",
    },
    {
      code: "P13",
      name: "软件企业增值税即征即退",
      dept: "税务局",
      type: "税收",
      level: "国家级",
      apply: "软件产品增值税税负超3%部分即征即退。",
      tag: "信创",
    },
    {
      code: "P14",
      name: "信创产业发展扶持资金",
      dept: "工信局",
      type: "资金",
      level: "省级",
      apply: "信创适配认证企业最高给予200万元研发补贴。",
      tag: "信创",
    },
    {
      code: "P15",
      name: "物流枢纽建设补贴",
      dept: "交通局",
      type: "资金",
      level: "省级",
      apply: "多式联运示范工程给予最高1000万元补贴。",
      tag: "多式联运",
    },
    {
      code: "P16",
      name: "生物医药产业园区补贴",
      dept: "科技局",
      type: "资金",
      level: "市级",
      apply: "生物医药园区入驻企业给予房租减免与研发补贴。",
      tag: "生物医药",
    },
    {
      code: "P17",
      name: "文旅产业发展专项资金",
      dept: "文旅局",
      type: "资金",
      level: "市级",
      apply: "文化产业项目最高给予100万元扶持。",
      tag: "文旅融合",
    },
    {
      code: "P18",
      name: "农业产业化龙头企业奖励",
      dept: "农业农村局",
      type: "资金",
      level: "省级",
      apply: "省级农业产业化龙头企业奖励30万元。",
      tag: "乡村振兴",
    },
    {
      code: "P19",
      name: "工业技改补贴政策",
      dept: "工信局",
      type: "资金",
      level: "市级",
      apply: "技术改造项目按设备投资额的10%给予补贴，最高500万元。",
      tag: "传统产业升级",
    },
    {
      code: "P20",
      name: "新能源装备首台套补贴",
      dept: "工信局",
      type: "资金",
      level: "省级",
      apply: "新能源装备首台套产品按销售金额的30%给予补贴。",
      tag: "新能源产业链",
    },
    {
      code: "P21",
      name: "算力产业招商扶持办法",
      dept: "招商局",
      type: "资金",
      level: "市级",
      apply: "算力企业落地最高给予500万元开办补贴与三年房租减免。",
      tag: "数据要素",
    },
    {
      code: "P22",
      name: "农机购置补贴政策",
      dept: "农业农村局",
      type: "资金",
      level: "国家级",
      apply: "农业机械购置按销售额的30%给予补贴，单台最高10万元。",
      tag: "乡村振兴",
    },
    {
      code: "P23",
      name: "科技企业孵化器扶持",
      dept: "科技局",
      type: "资金",
      level: "省级",
      apply: "省级科技企业孵化器给予运营补贴100万元/年。",
      tag: "生物医药",
    },
    {
      code: "P24",
      name: "安全生产标准化奖励",
      dept: "应急管理局",
      type: "资金",
      level: "市级",
      apply: "通过二级以上安全生产标准化企业奖励10万元。",
      tag: "传统产业升级",
    },
  ];

  // 待同步政策候选池（同步功能按顺序从这里取 1-2 条加入 POLICY_LIB）
  var POLICY_PENDING_POOL = [
    {
      name: "庆阳市数字经济发展三年行动方案",
      dept: "大数据局",
      type: "资金",
      level: "市级",
      apply: "对数字经济核心产业企业给予最高300万元研发补贴与三年房租减免。",
      tag: "数据要素",
      date: "2026-08-20",
      brief: "加快数字产业化和产业数字化，推动数字经济高质量发展。",
      support: "研发补贴、房租减免、项目扶持、人才引育",
      materials:
        "1. 企业营业执照副本<br/>2. 项目申报书<br/>3. 上年度财务审计报告<br/>4. 相关资质证明",
    },
    {
      name: "甘肃省先进制造业集群培育办法",
      dept: "工信厅",
      type: "资金",
      level: "省级",
      apply: "省级先进制造业集群给予5000万元专项资金支持。",
      tag: "新能源产业链",
      date: "2026-08-18",
      brief: "培育具有国际竞争力的先进制造业集群，提升产业链现代化水平。",
      support: "专项资金、产业链协同、公共服务平台建设",
      materials:
        "1. 集群发展规划<br/>2. 龙头企业证明<br/>3. 产业链配套情况说明",
    },
    {
      name: "庆阳市招商引资奖励办法（修订）",
      dept: "招商局",
      type: "资金",
      level: "市级",
      apply: "引荐重大产业项目的机构或个人最高奖励500万元。",
      tag: "重点招商企业",
      date: "2026-08-15",
      brief: "进一步加大招商引资力度，鼓励社会各界参与招商引资工作。",
      support: "现金奖励、项目服务绿色通道、子女入学保障",
      materials: "1. 项目引荐证明<br/>2. 项目落地相关材料<br/>3. 投资方确认函",
    },
    {
      name: "国家级经济技术开发区扩区升级方案",
      dept: "商务部",
      type: "要素",
      level: "国家级",
      apply: "国家级经开区扩区给予土地指标倾斜与基础设施建设补助。",
      tag: "重点招商企业",
      date: "2026-08-12",
      brief: "推动国家级经济技术开发区创新提升，打造改革开放新高地。",
      support: "土地指标、财政补助、项目审批绿色通道",
      materials:
        "1. 扩区升级实施方案<br/>2. 产业发展规划<br/>3. 土地利用总体规划",
    },
    {
      name: "庆阳市科技型中小企业入库补贴",
      dept: "科技局",
      type: "资金",
      level: "市级",
      apply: "入库科技型中小企业给予10万元研发补贴，优先推荐省级项目。",
      tag: "生物医药",
      date: "2026-08-10",
      brief: "培育壮大科技型中小企业队伍，强化企业科技创新主体地位。",
      support: "研发补贴、项目推荐、科技金融对接",
      materials:
        "1. 企业营业执照<br/>2. 科技型中小企业入库证明<br/>3. 研发投入证明",
    },
    {
      name: "甘肃省工业互联网试点示范奖励",
      dept: "工信厅",
      type: "资金",
      level: "省级",
      apply: "省级工业互联网试点示范企业奖励200万元。",
      tag: "传统产业升级",
      date: "2026-08-08",
      brief: "加快工业互联网创新发展，推动制造业数字化转型。",
      support: "资金奖励、试点示范授牌、宣传推广",
      materials:
        "1. 试点示范申报书<br/>2. 平台建设情况报告<br/>3. 应用成效证明",
    },
  ];


  // ============================================================
  // 实体富化（政策匹配 / 政策日期 / AI 研判）
  // 本地生成路径与服务器数据重建路径共用；R 为随机源（保持各路径确定性）
  // ============================================================
  function enrich(ENTERPRISES, POLICY_LIB, R) {
  // 为每家企业分配匹配政策（根据标签匹配，2~5 条）
  ENTERPRISES.forEach(function (e) {
    var matched = [];
    POLICY_LIB.forEach(function (p) {
      if (e.tags.indexOf(p.tag) >= 0) matched.push(p.name);
    });
    // 再加几条随机匹配
    var extras = POLICY_LIB.filter(function (p) {
      return matched.indexOf(p.name) < 0;
    });
    var extraCount = R.rint(0, 2);
    for (var i = 0; i < extraCount && extras.length; i++) {
      var idx = R.rint(0, extras.length - 1);
      matched.push(extras[idx].name);
      extras.splice(idx, 1);
    }
    e.policies = matched.slice(0, 5);
  });

  // 为政策补充发布日期（按层级分布：国家级最早、省级次之、市级最新，跨度约 2 年）
  POLICY_LIB.forEach(function (p) {
    if (p.date) return; // 已有日期的跳过（如候选池同步过来的）
    var n;
    if (p.level === "国家级") {
      n = R.rint(300, 720); // 1~2 年前
    } else if (p.level === "省级") {
      n = R.rint(120, 400); // 4~13 个月前
    } else if (p.level === "市级") {
      n = R.rint(30, 180); // 1~6 个月前
    } else {
      n = R.rint(10, 90); // 区县级：1~3 个月前
    }
    p.date = fmtDate(daysAgo(n));
  });

  // ============================================================
  // 六、为深度企业生成 AI 研判（动态模板 + 真实数据）
  // ============================================================
  ENTERPRISES.forEach(function (e) {
    if (!e.isDeep) {
      e.ai = null;
      return;
    }
    var score = e.riskScore;
    var level = e.riskLevel;
    var strengths = [];
    var risks = [];

    // 优势：根据标签和指标
    if (e.tags.indexOf("高新技术企业") >= 0)
      strengths.push("高新技术企业资质，享受税收优惠");
    if (
      e.tags.indexOf("专精特新") >= 0 ||
      e.tags.indexOf("专精特新小巨人") >= 0
    )
      strengths.push("专精特新资质，技术能力突出");
    if (e.tags.indexOf("数据要素") >= 0)
      strengths.push("赛道高度契合国家战略（东数西算+数据要素）");
    if (e.tags.indexOf("新能源产业链") >= 0)
      strengths.push("新能源赛道景气度高，市场需求旺盛");
    if (e.operation.revenue[5] > e.operation.revenue[0] * 1.1)
      strengths.push(
        "营收增长态势良好（近6个月+" +
          Math.round(
            (e.operation.revenue[5] / e.operation.revenue[0] - 1) * 100,
          ) +
          "%）",
      );
    if (e.status.performRate >= 85)
      strengths.push("招商履约情况良好，完成率 " + e.status.performRate + "%");

    // 风险：根据各维度分
    if (e.risks.operation >= 50) risks.push("经营风险偏高 — 营收增长承压");
    if (e.risks.judicial >= 40)
      risks.push("司法风险需关注 — 涉诉或被执行记录增加");
    if (e.risks.perform >= 40)
      risks.push("招商履约进度偏慢 — 投资完成率 " + e.status.performRate + "%");
    if (e.risks.credit >= 35) risks.push("信用状况下降 — 需持续跟踪");
    if (e.risks.tax >= 40) risks.push("税务波动较大 — 纳税同比下滑明显");
    if (risks.length === 0) risks.push("整体风险可控，需关注行业周期性波动");

    // 数据来源（根据风险维度 + 基础项）
    var sources = [
      "工商注册信息（市监局）",
      "纳税申报数据（税务局）",
      "社保缴费数据（人社局）",
      "招商履约台账（招商局）",
      "水滴信用（第三方企业信用数据库）",
    ];
    if (e.risks.judicial > 20) sources.push("司法文书/被执行人（法院）");
    if (e.risks.tender > 20) sources.push("招投标数据（公共资源交易中心）");
    if (e.tags.indexOf("高新技术企业") >= 0 || e.risks.ip > 15)
      sources.push("专利数据（知识产权局）");
    if (e.industry === "chemical" || e.industry === "building")
      sources.push("生态环境局处罚信息");
    if (e.industry === "oilgas" || e.industry === "chemical")
      sources.push("应急管理局安全生产记录");

    // 置信度（数据来源越多越高）
    var confidence = 75 + Math.min(20, sources.length * 2);

    // 上次研判分（本次±3~8）
    var prevDelta = R.rint(-8, 5);
    var prevScore = Math.max(0, Math.min(100, score + prevDelta));

    var summary =
      level === "red"
        ? "企业多项风险叠加，经营下行压力较大，建议启动专项核查。"
        : level === "orange"
          ? "企业存在较高风险因素，部分指标持续恶化，需重点关注并跟进。"
          : level === "yellow"
            ? "企业整体平稳，但部分维度存在风险信号，建议持续监测。"
            : "企业经营状态良好，各项指标稳定，成长性较好。";

    e.ai = {
      summary: summary,
      strengths: strengths.slice(0, 4),
      risks: risks.slice(0, 4),
      confidence: confidence,
      sources: sources,
      lastJudge: fmtDate(daysAgo(R.rint(25, 35))),
      prevScore: prevScore,
    };
  });

  }

  var LR = { rand: function () { return RNG(); }, rint: rint, rfloat: rfloat, rpick: rpick, rbool: rbool };
  enrich(ENTERPRISES, POLICY_LIB, LR);

  // ============================================================
  // 七、风险事件（30+ 条，从企业风险衍生）
  // ============================================================
  var RISK_EVENTS = [];
  var eventIdCounter = 0;
  var eventTypes = [
    { key: "经营", dim: "operation", label: "经营异常" },
    { key: "司法", dim: "judicial", label: "司法涉诉" },
    { key: "信用", dim: "credit", label: "信用降档" },
    { key: "税务", dim: "tax", label: "纳税异常" },
    { key: "履约", dim: "perform", label: "履约滞后" },
    { key: "招投标", dim: "tender", label: "招投标异常" },
  ];
  var findingTemplates = {
    operation: [
      "营收连续下滑，环比下降",
      "经营指标异常波动，需关注",
      "社保参保人数减少，人员流失风险",
    ],
    judicial: ["新增被执行人记录", "新增合同纠纷案件", "涉诉金额较大，需核实"],
    credit: ["信用等级下调", "出现经营异常名录记录", "失信被执行人预警"],
    tax: ["纳税同比大幅下降", "申报数据异常，需核实", "欠税记录新增"],
    perform: [
      "投资到位率偏低，履约进度滞后",
      "承诺指标完成率不足70%",
      "实际投资与承诺差距较大",
    ],
    tender: ["中标金额大幅波动", "围标串标风险预警", "投标异常活跃"],
    // 以下两类仅由"维度覆盖保障"补齐时使用
    finance: [
      "经营现金流持续紧张，短期偿债压力上升",
      "资产负债率攀升，超过行业警戒线",
      "应收账款占比过高，资金周转放缓",
    ],
    ip: [
      "核心专利即将到期，技术壁垒减弱",
      "新增知识产权纠纷预警",
      "核心商标遭异地企业抢注",
    ],
  };
  var adviceTemplates = {
    operation: ["现场走访核实经营状况", "约谈企业负责人了解原因"],
    judicial: ["核查涉诉详情，评估影响", "协同法务部门跟进处置"],
    credit: ["纳入重点监测名单", "约谈企业，督促信用修复"],
    tax: ["税务部门核实申报情况", "评估纳税异常原因"],
    perform: ["跟进投资到位计划", "启动履约督办程序"],
    tender: ["核查招投标详情", "纳入异常投标监测"],
    finance: ["核查财务报表与银行流水", "协调金融机构评估续贷支持"],
    ip: ["梳理核心专利与商标布局", "对接知识产权维权援助资源"],
  };
  var basisTemplates = {
    operation: "经营指标连续走弱，营收与纳税同步下滑，社保人数减少。",
    judicial: "司法系统新增记录，需进一步核查案件详情与影响范围。",
    credit: "信用平台等级发生变化，可能影响企业经营活动。",
    tax: "纳税申报数据出现异常波动，需核实具体原因。",
    perform: "招商承诺投资与实际到位资金存在较大差距。",
    tender: "招投标行为模式异常，存在潜在风险。",
    finance: "财务指标出现连续恶化趋势，需核实企业真实偿债能力。",
    ip: "知识产权监测发现权属或纠纷信号，需进一步核实。",
  };

  // 为每家高风险企业生成事件
  ENTERPRISES.forEach(function (e) {
    // 风险越高事件越多
    var count =
      e.riskLevel === "red"
        ? rint(2, 4)
        : e.riskLevel === "orange"
          ? rint(1, 3)
          : e.riskLevel === "yellow"
            ? rint(0, 2)
            : rbool(0.3)
              ? 1
              : 0;
    if (count === 0) return;

    // 找最高分的几个维度
    var dims = RISK_DIMS.slice().sort(function (a, b) {
      return e.risks[b.key] - e.risks[a.key];
    });

    for (var i = 0; i < count; i++) {
      var dim = dims[i % dims.length];
      var score = e.risks[dim.key];
      // 只有分数 > 25 才生成事件
      if (score < 20) continue;
      var level;
      if (score >= 70) level = "red";
      else if (score >= 50) level = "orange";
      else if (score >= 30) level = "yellow";
      else level = "blue";

      var days = rint(0, 45); // 近 45 天内
      var evDate = daysAgo(days);
      var et = eventTypes.filter(function (t) {
        return t.dim === dim.key;
      })[0];
      if (!et) continue;

      var findings = findingTemplates[dim.key] || ["风险预警"];
      var advices = adviceTemplates[dim.key] || ["关注跟进"];
      // 三态模型：待处置（新发现未派发）→ 已派发（在办，对应未完成任务）→ 已关闭（办结，对应已完成任务）
      var status;
      if (days < 4) status = "待处置";
      else if (days < 24) status = "已派发";
      else status = "已关闭";

      var finding = rpick(findings);
      var advice = rpick(advices);
      var basis = basisTemplates[dim.key] || "监测指标异常，需进一步核实。";

      eventIdCounter++;
      RISK_EVENTS.push({
        id: "R" + (eventIdCounter < 100 ? "0" : "") + eventIdCounter,
        time: fmtDate(evDate),
        timeHm: pad(rint(8, 17)) + ":" + pad(rint(0, 59)),
        entId: e.id,
        enterprise: e.name,
        enterpriseName: e.name,
        title: et.label + "：" + finding,
        finding: finding,
        type: et.label,
        typeKey: et.key,
        dim: dim.key,
        dimKey: dim.key,
        dimName: dim.name,
        level: level,
        advice: advice,
        suggestion: advice,
        status: status,
        basis: basis,
        detail: finding + "。" + basis,
        daysAgo: days,
      });
    }
  });
  // 按时间倒序
  RISK_EVENTS.sort(function (a, b) {
    return new Date(b.time) - new Date(a.time);
  });

  // 维度覆盖保障：为尚无事件的维度确定性改派少量既有事件（不消耗随机数，不影响其他数据生成）
  (function ensureEventDimCoverage() {
    var EXTRA_TYPES = {
      finance: { key: "财务", dim: "finance", label: "财务指标异常" },
      ip: { key: "知识产权", dim: "ip", label: "知识产权预警" },
    };
    function entOf(ev) {
      for (var i = 0; i < ENTERPRISES.length; i++)
        if (ENTERPRISES[i].id === ev.entId) return ENTERPRISES[i];
      return null;
    }
    function reassign(ev, d) {
      var et =
        EXTRA_TYPES[d.key] ||
        eventTypes.filter(function (t) {
          return t.dim === d.key;
        })[0];
      var fs = findingTemplates[d.key] || ["风险预警"];
      var as = adviceTemplates[d.key] || ["关注跟进"];
      var bs = basisTemplates[d.key] || "监测指标异常，需进一步核实。";
      var pick = ev.id.charCodeAt(ev.id.length - 1);
      var ent = entOf(ev);
      var sc = ent ? ent.risks[d.key] || 0 : 0;
      ev.dim = ev.dimKey = d.key;
      ev.dimName = d.name;
      ev.type = et.label;
      ev.typeKey = et.key;
      ev.finding = fs[pick % fs.length];
      ev.title = et.label + "：" + ev.finding;
      ev.advice = ev.suggestion = as[pick % as.length];
      ev.basis = bs;
      ev.detail = ev.finding + "。" + bs;
      ev.level =
        sc >= 70 ? "red" : sc >= 50 ? "orange" : sc >= 30 ? "yellow" : "blue";
    }
    for (var pass = 0; pass < RISK_DIMS.length; pass++) {
      var cnt = {};
      RISK_DIMS.forEach(function (d) {
        cnt[d.key] = 0;
      });
      RISK_EVENTS.forEach(function (ev) {
        cnt[ev.dim]++;
      });
      var missing = RISK_DIMS.filter(function (d) {
        return cnt[d.key] === 0;
      });
      if (!missing.length) break;
      missing.forEach(function (d) {
        // 从事件数最多的维度挪出一条（取该维度在数组中的最后一条），改派给缺失维度
        var richKey = null,
          richMax = 0;
        Object.keys(cnt).forEach(function (k) {
          if (cnt[k] > richMax) {
            richMax = cnt[k];
            richKey = k;
          }
        });
        if (!richKey) return;
        for (var i = RISK_EVENTS.length - 1; i >= 0; i--) {
          if (RISK_EVENTS[i].dim === richKey) {
            reassign(RISK_EVENTS[i], d);
            cnt[richKey]--;
            cnt[d.key] = 1;
            break;
          }
        }
      });
    }
  })();

  // ============================================================
  // 八、项目（20 个，覆盖六阶段）
  // ============================================================
  var PROJECT_STAGES = [
    { key: "lead", name: "线索对接", order: 1 },
    { key: "talk", name: "深度洽谈", order: 2 },
    { key: "sign", name: "签约落地", order: 3 },
    { key: "build", name: "建设推进", order: 4 },
    { key: "operate", name: "投产运营", order: 5 },
    { key: "reach", name: "达产评价", order: 6 },
  ];
  var stageProgressMap = {
    lead: [5, 15],
    talk: [15, 30],
    sign: [30, 45],
    build: [45, 75],
    operate: [75, 92],
    reach: [92, 100],
  };
  var OWNERS = ["招商一组", "招商二组", "招商三组", "产业招商科", "园区招商部"];
  var CONTACTS = [
    "张建国 138****2101",
    "王海涛 139****5566",
    "刘志强 136****7722",
    "陈晓峰 137****8833",
    "赵明 135****3344",
    "孙丽 138****9900",
    "周伟 139****1122",
    "吴敏 137****6677",
  ];

  var PROJECTS = [];
  var projIdCounter = 0;
  ENTERPRISES.filter(function (e) {
    return e.isDeep;
  }).forEach(function (e, idx) {
    // 每家深度企业 1~2 个项目
    var n = rbool(0.5) ? 2 : 1;
    for (var i = 0; i < n; i++) {
      projIdCounter++;
      // 已落地（深度）企业的招商项目从"深度洽谈"起，不含"线索对接"——
      // 线索对接阶段专属于未落地/意向企业，避免已落地企业节点与招商线索节点在图谱中重复
      var stage = rpick(
        PROJECT_STAGES.filter(function (s) {
          return s.order > 1;
        }),
      ).key;
      var pRange = stageProgressMap[stage];
      var progress = rint(pRange[0], pRange[1]);
      var amount = Math.round(e.overview.investWan * rfloat(0.6, 1.5, 2));
      var risk =
        e.riskLevel === "red"
          ? "重大风险"
          : e.riskLevel === "orange"
            ? "关注"
            : "正常";
      var owner = rpick(OWNERS);
      var contact = rpick(CONTACTS);

      // 时间线
      var stageObj = PROJECT_STAGES.filter(function (s) {
        return s.key === stage;
      })[0];
      var timeline = [];
      var curOrder = stageObj.order;
      // 已完成的阶段（阶段越靠后日期越近：线索对接最旧、当前阶段最近，保证时间线时序正确）
      PROJECT_STAGES.forEach(function (s, si) {
        if (s.order > curOrder) return;
        var daysA = rint(190 - si * 30, 210 - si * 30);
        timeline.push({
          date: fmtDate(daysAgo(daysA)),
          stage: s.name,
          note: e.name + "项目" + s.name + "阶段",
        });
      });
      // 未来的计划
      if (curOrder < 6) {
        PROJECT_STAGES.forEach(function (s, si) {
          if (s.order <= curOrder) return;
          var daysL = rint(si * 60, si * 120);
          timeline.push({
            date: fmtDate(daysLater(daysL)) + "（计划）",
            stage: s.name,
            note: s.name + "阶段计划完成",
          });
        });
      }

      // 对接记录
      var records = [];
      var recCount = rint(2, 5);
      for (var ri = 0; ri < recCount; ri++) {
        records.push({
          date: fmtDate(daysAgo(rint(1, 120))),
          person: contact.split(" ")[0],
          content: rpick([
            "企业反映电力增容审批进度偏慢，已协调供电公司加快。",
            "现场巡检：施工进度符合预期，安全措施到位。",
            "企业反映用地指标尚未落实，建议加快审批。",
            "企业订单饱满，正申请扩产用地，需协调自然资源局。",
            "正在推进用地规划调整，预计下月完成。",
            "企业经营持续下滑，环保整改未完成，已上报风险监管部门。",
            "接入东西部协作电商渠道，月订单增长明显。",
          ]),
        });
      }
      records.sort(function (a, b) {
        return new Date(b.date) - new Date(a.date);
      });

      var promises = [
        "投资 " +
          (amount >= 10000
            ? (amount / 10000).toFixed(1) + "亿"
            : amount + "万") +
          "元",
        "就业 " + Math.round(e.overview.employees * 1.1) + " 人",
        "达产营收 " + e.overview.revenue,
        "税收 " + e.overview.tax,
      ];

      PROJECTS.push({
        id: "P" + (projIdCounter < 10 ? "0" : "") + projIdCounter,
        name: e.name + "项目",
        shortName: e.name,
        enterprise: e.id,
        enterpriseName: e.name,
        stage: stage,
        stageName: stageObj.name,
        amount:
          amount >= 10000 ? (amount / 10000).toFixed(1) + "亿" : amount + "万",
        amountWan: amount,
        owner: owner,
        contact: contact,
        progress: progress,
        risk: risk,
        riskLevel: e.riskLevel,
        district: e.district,
        districtName: e.districtName,
        timeline: timeline,
        records: records,
        promises: promises,
      });
    }
  });

  // —— 口径修正：每家企业仅保留一个招商项目（保留先出现者），
  //     保证"招商项目总数 = 涉及企业数 ≤ 全部企业数"，且项目总数少于负责企业数量 ——
  (function oneProjectPerEnterprise() {
    var seen = {};
    PROJECTS = PROJECTS.filter(function (p) {
      if (seen[p.enterprise]) return false;
      seen[p.enterprise] = true;
      return true;
    });
  })();

  // —— 口径修正：保证每个区县至少有 1 个"签约落地"及以后阶段的项目。
  //     纯确定性调整（不消耗随机数），被提升项目的进度与时间线同步重建，保证详情页自洽 ——
  (function ensureSignedPerDistrict() {
    var stageOrderMap = {};
    PROJECT_STAGES.forEach(function (s) {
      stageOrderMap[s.key] = s.order;
    });
    function rebuildTimeline(p, ord) {
      var tl = [];
      PROJECT_STAGES.forEach(function (s) {
        if (s.order > ord) return;
        tl.push({
          date: fmtDate(daysAgo(20 + (ord - s.order) * 45)),
          stage: s.name,
          note: p.enterpriseName + "项目" + s.name + "阶段",
        });
      });
      PROJECT_STAGES.forEach(function (s) {
        if (s.order <= ord) return;
        tl.push({
          date: fmtDate(daysLater((s.order - ord) * 60)) + "（计划）",
          stage: s.name,
          note: s.name + "阶段计划完成",
        });
      });
      p.timeline = tl;
    }
    DISTRICTS.forEach(function (d, di) {
      var has = PROJECTS.some(function (p) {
        return p.district === d.key && stageOrderMap[p.stage] >= 3;
      });
      if (has) return;
      var cand = PROJECTS.filter(function (p) {
        return p.district === d.key;
      }).sort(function (a, b) {
        return stageOrderMap[a.stage] - stageOrderMap[b.stage];
      })[0];
      if (!cand) return;
      cand.stage = "sign";
      cand.stageName = "签约落地";
      cand.progress = 30 + ((di * 7) % 16); // 30–45
      rebuildTimeline(cand, 3);
    });
  })();

  // —— 口径修正：保证"线索对接"阶段有代表性项目（凑够 4 个，区县分散），
  //     与图谱招商线索节点打通。线索(在谈)项目应指向"未落地/未进入图谱"的浅层企业——
  //     浅层企业不作为图谱企业节点绘制，故线索节点与已落地企业节点不会在图谱中重复。
  //     纯确定性构造，不消耗随机数；从浅层企业中按意向投资规模降序挑选，区县去重。——
  (function ensureLeadProjects() {
    // 已有线索项目的企业，避免重复
    var alreadyLead = {};
    PROJECTS.forEach(function (p) {
      if (p.stage === "lead") alreadyLead[p.enterprise] = true;
    });
    // 当前最大项目编号，用于为新线索项目续号
    var maxSeq = 0;
    PROJECTS.forEach(function (p) {
      var n = parseInt(String(p.id).replace(/\D/g, ""), 10);
      if (n > maxSeq) maxSeq = n;
    });
    // 候选：浅层(未落地)企业，且具备投资基数、尚无线索项目
    var candidates = ENTERPRISES.filter(function (e) {
      return (
        !e.isDeep &&
        !alreadyLead[e.id] &&
        e.overview &&
        e.overview.investWan > 0
      );
    }).sort(function (a, b) {
      return b.overview.investWan - a.overview.investWan;
    });
    var owners = ["招商一组", "招商三组", "产业招商科", "园区招商部"];
    var tookDistrict = {};
    var leadIdx = 0;
    var target = 4;
    candidates.forEach(function (e) {
      if (leadIdx >= target) return;
      if (tookDistrict[e.district]) return; // 区县分散
      tookDistrict[e.district] = true;
      leadIdx++;
      maxSeq++;
      var amount = Math.round(e.overview.investWan || 0);
      var amountStr =
        amount >= 10000 ? (amount / 10000).toFixed(1) + "亿" : amount + "万";
      var leadDay = 10 + leadIdx * 5;
      // 时间线：线索对接为当前阶段，其余为计划
      var tl = [
        {
          date: fmtDate(daysAgo(leadDay)),
          stage: "线索对接",
          note: e.name + "项目线索对接阶段",
        },
      ];
      PROJECT_STAGES.forEach(function (s) {
        if (s.order <= 1) return;
        tl.push({
          date:
            fmtDate(daysLater((s.order - 1) * 60 + leadIdx * 10)) + "（计划）",
          stage: s.name,
          note: s.name + "阶段计划完成",
        });
      });
      PROJECTS.push({
        id: "P" + (maxSeq < 10 ? "0" : "") + maxSeq,
        name: e.name + "项目",
        shortName: e.name,
        enterprise: e.id,
        enterpriseName: e.name,
        stage: "lead",
        stageName: "线索对接",
        amount: amountStr,
        amountWan: amount,
        owner: owners[(leadIdx - 1) % owners.length],
        contact: "招商专班 139****000" + leadIdx,
        progress: 5 + ((leadIdx * 3) % 8), // 5–12
        risk: "正常",
        riskLevel: e.riskLevel || "blue",
        district: e.district,
        districtName: e.districtName,
        timeline: tl,
        records: [
          {
            date: fmtDate(daysAgo(2 + leadIdx)),
            person: "招商专班",
            content:
              "存量推介线索，意向投资 " + amountStr + "元，进入线索对接阶段。",
          },
        ],
        promises: [
          "投资 " + amountStr + "元",
          "就业 " + Math.round((e.overview.employees || 0) * 1.1) + " 人",
          "达产营收 " + (e.overview.revenue || "—"),
          "税收 " + (e.overview.tax || "—"),
        ],
      });
    });
  })();

  // —— 进展情况：为每个项目已到达的阶段生成确定性示例文本（不消耗随机数）。
  //     历史阶段=办结情况；当前阶段=阶段性进展（可在详情中编辑）；未来阶段无记录 ——
  (function seedStageNotes() {
    var TPL_DONE = {
      lead: [
        "与企业高层完成首轮对接，重点推介庆阳区位与算力产业配套优势，企业投资意向明确，已约定来庆实地考察。",
        "通过省级招商平台获取线索并快速响应，线上推介园区载体与电价政策，企业已提交初步投资意向书。",
      ],
      talk: [
        "围绕用地、电价、用工开展两轮深度洽谈，核心条款达成共识，协议文本进入法务审核环节。",
        "双方就投资规模与建设周期反复磋商，专班协调自然资源、发改等部门预审要件，洽谈进展顺利。",
      ],
      sign: [
        "投资协议正式签约，明确固定资产投资与达产期限；注册登记与立项手续同步启动。",
        "举行签约仪式并纳入市级重点项目库，首笔注册资本已到位，专班代办开工前审批事项。",
      ],
      build: [
        "项目开工奠基，厂房基础施工过半，水电路气配套按计划推进，暂无重大堵点问题。",
        "主体厂房封顶，设备陆续进场安装，专班每周调度进度，安全文明施工检查达标。",
      ],
      operate: [
        "生产线正式投产，产能爬坡符合预期，首批订单如期交付，本地用工占比稳步提升。",
        "投产运营总体平稳，主要产品良率达到设计水平，正拓展东部市场订单渠道。",
      ],
      reach: [
        "达产评价通过核验：投资强度、亩均税收与带动就业指标均达标，转入常态化服务监管。",
        "完成达产评价，各项招商承诺兑现情况良好，企业已提出二期扩产初步意向。",
      ],
    };
    var TPL_CUR = [
      "阶段小结：整体推进有序，正协调解决要素保障等具体事项，下一步按计划节点推进。",
      "阶段性进展正常，近期重点攻坚关键审批事项，专班持续跟踪督办。",
    ];
    var ordMap = {};
    PROJECT_STAGES.forEach(function (s) {
      ordMap[s.key] = s.order;
    });
    PROJECTS.forEach(function (p, idx) {
      p.stageNotes = {};
      var curOrd = ordMap[p.stage] || 1;
      PROJECT_STAGES.forEach(function (s) {
        if (s.order < curOrd) {
          var arr = TPL_DONE[s.key];
          p.stageNotes[s.key] = arr[idx % arr.length];
        }
      });
      p.stageNotes[p.stage] = TPL_CUR[idx % TPL_CUR.length];
    });
  })();

  // ============================================================
  // AI 招商推荐候选企业池（外部潜在企业，尚未进入招商流程）
  // 与现有 ENTERPRISES 不重复，供 AI 智能推荐功能使用
  // ============================================================
  var PROSPECT_ENTERPRISES = [
    {
      name: "华为数字能源技术有限公司",
      industry: "新能源",
      scale: "大型企业",
      investWan: 150000,
      employees: 2000,
      revenue: "25亿元",
      tax: "1.2亿元",
      district: "xifeng",
      districtName: "西峰区",
      tags: ["新能源产业链", "重点招商企业"],
      contact: "李建华 139****8822",
      source: "产业链招商",
      strength: "全球领先的新能源解决方案提供商，技术实力雄厚",
    },
    {
      name: "比亚迪电池科技（甘肃）有限公司",
      industry: "新能源",
      scale: "大型企业",
      investWan: 200000,
      employees: 3500,
      revenue: "40亿元",
      tax: "1.8亿元",
      district: "ningxian",
      districtName: "宁县",
      tags: ["新能源产业链", "专精特新"],
      contact: "王志强 138****5566",
      source: "以商招商",
      strength: "国内动力电池龙头企业，产业链带动效应显著",
    },
    {
      name: "中电建数据科技有限公司",
      industry: "数据要素",
      scale: "大型企业",
      investWan: 80000,
      employees: 800,
      revenue: "12亿元",
      tax: "6000万元",
      district: "qingcheng",
      districtName: "庆城县",
      tags: ["数据要素", "重点招商企业"],
      contact: "张伟 137****3344",
      source: "央企对接",
      strength: "央企背景，算力基础设施建设经验丰富",
    },
    {
      name: "阿里云创新中心（庆阳）",
      industry: "数字经济",
      scale: "大型企业",
      investWan: 60000,
      employees: 500,
      revenue: "8亿元",
      tax: "4000万元",
      district: "xifeng",
      districtName: "西峰区",
      tags: ["数据要素", "信创"],
      contact: "陈昊 136****7788",
      source: "互联网头部企业招商",
      strength: "阿里生态资源导入，数字经济孵化能力强",
    },
    {
      name: "宁德时代新能源科技有限公司",
      industry: "新能源",
      scale: "大型企业",
      investWan: 250000,
      employees: 4000,
      revenue: "50亿元",
      tax: "2.5亿元",
      district: "ningxian",
      districtName: "宁县",
      tags: ["新能源产业链", "重点招商企业"],
      contact: "刘芳 135****9900",
      source: "产业链招商",
      strength: "全球动力电池领军企业，产业集聚效应明显",
    },
    {
      name: "京东方显示技术（甘肃）有限公司",
      industry: "电子信息",
      scale: "大型企业",
      investWan: 120000,
      employees: 2500,
      revenue: "20亿元",
      tax: "9000万元",
      district: "zhenyuan",
      districtName: "镇原县",
      tags: ["信创", "重点招商企业"],
      contact: "赵鹏 138****1122",
      source: "高新技术招商",
      strength: "国内显示面板龙头，技术积累深厚",
    },
    {
      name: "隆基绿能科技股份有限公司",
      industry: "新能源",
      scale: "大型企业",
      investWan: 180000,
      employees: 2800,
      revenue: "35亿元",
      tax: "1.5亿元",
      district: "huanxian",
      districtName: "环县",
      tags: ["新能源产业链", "专精特新小巨人"],
      contact: "孙磊 139****4455",
      source: "光伏产业招商",
      strength: "全球光伏组件龙头，绿电一体化解决方案",
    },
    {
      name: "北京同仁堂甘肃药业有限公司",
      industry: "生物医药",
      scale: "中型企业",
      investWan: 30000,
      employees: 600,
      revenue: "5亿元",
      tax: "3000万元",
      district: "hechuan",
      districtName: "合水县",
      tags: ["生物医药", "乡村振兴"],
      contact: "周敏 137****6677",
      source: "中医药产业招商",
      strength: "百年老字号品牌，中药全产业链优势",
    },
    {
      name: "小米智能制造（庆阳）产业园",
      industry: "智能制造",
      scale: "大型企业",
      investWan: 100000,
      employees: 1500,
      revenue: "18亿元",
      tax: "8000万元",
      district: "xifeng",
      districtName: "西峰区",
      tags: ["信创", "重点招商企业"],
      contact: "吴涛 136****2233",
      source: "消费电子招商",
      strength: "小米生态链企业集聚，智能制造标杆",
    },
    {
      name: "东方希望集团畜牧科技有限公司",
      industry: "现代农业",
      scale: "大型企业",
      investWan: 25000,
      employees: 1200,
      revenue: "6亿元",
      tax: "2000万元",
      district: "zhengning",
      districtName: "正宁县",
      tags: ["乡村振兴", "传统产业升级"],
      contact: "郑华 135****8899",
      source: "农业产业化招商",
      strength: "国内农牧龙头，全产业链运营能力",
    },
    {
      name: "科大讯飞西北AI研发中心",
      industry: "人工智能",
      scale: "中型企业",
      investWan: 20000,
      employees: 300,
      revenue: "3亿元",
      tax: "1500万元",
      district: "xifeng",
      districtName: "西峰区",
      tags: ["信创", "专精特新"],
      contact: "钱宇 139****7766",
      source: "AI产业招商",
      strength: "国内AI语音龙头，教育/政务场景成熟",
    },
    {
      name: "美团优选西北区域总部",
      industry: "电子商务",
      scale: "中型企业",
      investWan: 15000,
      employees: 400,
      revenue: "4亿元",
      tax: "1200万元",
      district: "xifeng",
      districtName: "西峰区",
      tags: ["跨境电子商务", "重点招商企业"],
      contact: "冯凯 138****3344",
      source: "电商平台招商",
      strength: "社区团购龙头，下沉市场渠道优势",
    },
    {
      name: "中车集团风电装备制造基地",
      industry: "新能源",
      scale: "大型企业",
      investWan: 90000,
      employees: 1200,
      revenue: "15亿元",
      tax: "7000万元",
      district: "huanxian",
      districtName: "环县",
      tags: ["新能源产业链", "重点招商企业"],
      contact: "韩磊 137****5566",
      source: "央企招商",
      strength: "风电装备央企背景，整机制造能力强",
    },
    {
      name: "顺丰速运（庆阳）智慧物流园",
      industry: "现代物流",
      scale: "中型企业",
      investWan: 28000,
      employees: 800,
      revenue: "7亿元",
      tax: "2500万元",
      district: "ningxian",
      districtName: "宁县",
      tags: ["多式联运", "重点招商企业"],
      contact: "杨峰 136****9988",
      source: "物流枢纽招商",
      strength: "快递龙头企业，智慧物流技术领先",
    },
    {
      name: "太极集团甘肃中药产业园",
      industry: "生物医药",
      scale: "中型企业",
      investWan: 22000,
      employees: 500,
      revenue: "3.5亿元",
      tax: "2000万元",
      district: "hechuan",
      districtName: "合水县",
      tags: ["生物医药", "乡村振兴"],
      contact: "朱琳 135****1122",
      source: "中医药产业招商",
      strength: "国内中药50强，道地药材深加工优势",
    },
    {
      name: "360数字安全产业基地",
      industry: "网络安全",
      scale: "中型企业",
      investWan: 18000,
      employees: 280,
      revenue: "2.8亿元",
      tax: "1400万元",
      district: "xifeng",
      districtName: "西峰区",
      tags: ["信创", "专精特新"],
      contact: "秦波 139****4433",
      source: "数字安全招商",
      strength: "网络安全龙头，政企安全服务经验丰富",
    },
    {
      name: "温氏股份庆阳生猪养殖基地",
      industry: "现代农业",
      scale: "大型企业",
      investWan: 35000,
      employees: 1500,
      revenue: "8亿元",
      tax: "3000万元",
      district: "zhenyuan",
      districtName: "镇原县",
      tags: ["乡村振兴", "传统产业升级"],
      contact: "许强 138****7766",
      source: "农业产业化招商",
      strength: "生猪养殖龙头，全产业链一体化",
    },
    {
      name: "京东云西北算力中心",
      industry: "数据要素",
      scale: "大型企业",
      investWan: 70000,
      employees: 600,
      revenue: "10亿元",
      tax: "5000万元",
      district: "qingcheng",
      districtName: "庆城县",
      tags: ["数据要素", "重点招商企业"],
      contact: "何静 137****2255",
      source: "云服务招商",
      strength: "京东云全栈技术能力，电商+物流生态",
    },
  ];

  // ============================================================
  // 九、任务（从风险事件 + 项目 推导）
  // ============================================================
  var TASKS = [];
  var taskIdCounter = 0;

  // 风险处置任务：与风险事件状态严格一一对应（逻辑自洽）
  //   已派发事件 ↔ 未完成任务（待处理/进行中/已逾期）
  //   已关闭事件 ↔ 已完成任务（含完成时间，晚于事件发现日）
  //   待处置事件尚未派发，不生成任务
  RISK_EVENTS.forEach(function (ev, i) {
    if (ev.status === "待处置") return;
    taskIdCounter++;
    var dueDate;
    var status;
    var completeTime;
    var createDays;

    if (ev.status === "已关闭") {
      // 历史办结：创建 → 截止 → 办结 时序均在过去，且全部晚于事件发现日
      status = "已完成";
      var cd = rint(2, Math.max(3, ev.daysAgo - 12)); // 办结于 2 ~ (发现日-12) 天前
      var dueOff = cd + rint(1, 3); // 截止早于办结 1~3 天
      completeTime =
        fmtDate(daysAgo(cd)) +
        " " +
        ["09:42", "10:15", "11:03", "14:27", "15:50", "16:12"][i % 6];
      dueDate = daysAgo(dueOff);
      createDays = Math.min(ev.daysAgo - 1, dueOff + rint(0, 2)); // 创建晚于事件发现、不晚于截止
    } else {
      // 已派发在办：未完成任务；高风险允许部分已逾期
      var dueOffset =
        ev.level === "red"
          ? rint(1, 3)
          : ev.level === "orange"
            ? rint(3, 7)
            : rint(7, 14);
      var isOverdue = ev.level === "red" && i % 4 === 0;
      if (isOverdue) {
        status = "已逾期";
        dueDate = daysAgo(dueOffset);
      } else {
        status = i % 3 === 0 ? "进行中" : "待处理";
        dueDate = daysLater(dueOffset);
      }
      createDays = isOverdue
        ? Math.min(ev.daysAgo - 1, dueOffset + rint(1, 3)) // 逾期任务尽量创建于原截止日之前
        : Math.min(ev.daysAgo - 1, rint(0, 10)); // 创建晚于事件发现日
    }

    TASKS.push({
      id: "T" + (taskIdCounter < 100 ? "0" : "") + taskIdCounter,
      title: "【风险处置】" + ev.finding,
      enterprise: ev.entId,
      enterpriseName: ev.enterpriseName,
      due: fmtDate(dueDate),
      priority: ev.level === "red" ? "高" : ev.level === "orange" ? "中" : "低",
      status: status,
      completeTime: completeTime,
      source: ev.id,
      type: "风险处置",
      createTime: fmtDate(daysAgo(createDays)),
    });
  });

  // 常规招商任务
  var routineTaskTitles = [
    "政策匹配与申报辅导",
    "企业季度走访",
    "投资到位跟进",
    "诉求协调与反馈",
    "招商履约核查",
    "安全生产检查",
    "人才政策宣贯",
    "银企对接会筹备",
    "数据更新与核验",
  ];
  // 任务类型与工作台筛选项对齐（中文标签）
  var taskTypeByTitle = {
    政策匹配与申报辅导: "政策推送",
    企业季度走访: "企业服务",
    投资到位跟进: "项目跟进",
    诉求协调与反馈: "企业服务",
    招商履约核查: "项目跟进",
    安全生产检查: "日常巡检",
    人才政策宣贯: "政策推送",
    银企对接会筹备: "企业服务",
    数据更新与核验: "日常巡检",
  };
  for (var ti = 0; ti < 10; ti++) {
    taskIdCounter++;
    var e = rpick(ENTERPRISES);
    var dueOffset = rint(1, 20);
    var isOverdue = ti < 2;
    var dueD = isOverdue ? daysAgo(rint(1, 4)) : daysLater(dueOffset);
    var tTitle = rpick(routineTaskTitles);
    TASKS.push({
      id: "T" + (taskIdCounter < 100 ? "0" : "") + taskIdCounter,
      title: tTitle,
      enterprise: e.id,
      enterpriseName: e.name,
      due: fmtDate(dueD),
      priority: rpick(["高", "中", "低"]),
      status: isOverdue ? "已逾期" : ti % 3 === 0 ? "进行中" : "待处理",
      source: "",
      type: taskTypeByTitle[tTitle] || "企业服务",
      createTime: fmtDate(daysAgo(rint(2, 15))),
    });
  }
  // —— 补充任务：覆盖全部五种任务类型，并与具体项目/政策/企业/风险事件形成业务关联；
  //     含数条"今日到期"任务供今日待办展示。纯确定性构造，不消耗随机数 ——
  (function supplementTasks() {
    function entByTag(tag) {
      for (var i = 0; i < ENTERPRISES.length; i++) {
        if (ENTERPRISES[i].tags && ENTERPRISES[i].tags.indexOf(tag) >= 0)
          return ENTERPRISES[i];
      }
      return ENTERPRISES[0];
    }
    function policyByCode(code) {
      for (var i = 0; i < POLICY_LIB.length; i++)
        if (POLICY_LIB[i].code === code) return POLICY_LIB[i];
      return POLICY_LIB[0];
    }
    function add(t) {
      taskIdCounter++;
      TASKS.push({
        id: "TS" + (taskIdCounter < 100 ? "0" : "") + taskIdCounter,
        title: t.title,
        enterprise: t.ent ? t.ent.id : "",
        enterpriseName: t.ent ? t.ent.name : "",
        due: t.days === 0 ? fmtDate(TODAY) : fmtDate(daysLater(t.days)),
        priority: t.pri,
        status: t.status || "待处理",
        source: t.src || "",
        type: t.type,
        createTime: fmtDate(daysAgo(1)),
      });
    }

    // 项目跟进 ×3（关联真实项目的企业、编号）
    var p1 = PROJECTS[0],
      p2 = PROJECTS[1] || p1;
    if (p1) {
      add({
        type: "项目跟进",
        title: "【项目跟进】" + p1.shortName + " 投资到位月度核查",
        ent: { id: p1.enterprise, name: p1.enterpriseName },
        days: 0,
        pri: "高",
        src: p1.id,
      });
      add({
        type: "项目跟进",
        title: "【项目跟进】" + p1.shortName + " 建设阶段推进协调会",
        ent: { id: p1.enterprise, name: p1.enterpriseName },
        days: 3,
        pri: "中",
        status: "进行中",
        src: p1.id,
      });
    }
    if (p2 && p2 !== p1) {
      add({
        type: "项目跟进",
        title: "【项目跟进】" + p2.shortName + " 签约条款确认与会签",
        ent: { id: p2.enterprise, name: p2.enterpriseName },
        days: 5,
        pri: "中",
        src: p2.id,
      });
    }

    // 政策推送 ×3（按政策适用标签锁定目标企业，一条今日到期）
    [
      ["P03", "专精特新", 0, "高"],
      ["P09", "跨境电子商务", 2, "中"],
      ["P21", "数据要素", 4, "中"],
    ].forEach(function (cfg) {
      var pol = policyByCode(cfg[0]);
      var ent = entByTag(cfg[1]);
      add({
        type: "政策推送",
        title: "【政策推送】" + pol.name + " 申报辅导",
        ent: { id: ent.id, name: ent.name },
        days: cfg[2],
        pri: cfg[3],
        src: pol.code,
      });
    });

    // 企业服务 ×2（重点企业诉求跟进，一条今日到期）
    var keyEnt = entByTag("重点招商企业");
    add({
      type: "企业服务",
      title: "企业诉求协调：电力增容审批跟进",
      ent: { id: keyEnt.id, name: keyEnt.name },
      days: 0,
      pri: "高",
      status: "进行中",
    });
    add({
      type: "企业服务",
      title: "银企对接会一对一洽谈安排",
      ent: { id: keyEnt.id, name: keyEnt.name },
      days: 6,
      pri: "低",
    });

    // 日常巡检 ×2
    add({
      type: "日常巡检",
      title: "园区安全生产日常巡检（第三片区）",
      days: 1,
      pri: "中",
    });
    add({
      type: "日常巡检",
      title: "企业基础数据季度核验与更新",
      days: 8,
      pri: "低",
    });

    // 风险处置类任务已由事件一一对应生成（见上方风险处置任务段），此处不再补充，
    // 以保证「已派发事件数 ≡ 未完成风险处置任务数、已关闭事件数 ≡ 已完成风险处置任务数」恒成立。
  })();

  // —— 口径修正：将部分常规任务确定为"已完成"，避免工作台完成率恒为 0；
  //     纯确定性挑选（不消耗随机数）：跳过风险处置任务（保持与风险事件闭环联动）、
  //     跳过今日到期任务（保留今日待办展示），并补记完成时间供"最近动态"使用 ——
  (function markCompletedTasks() {
    var doneTimeSlots = [
      "09:42",
      "10:15",
      "11:03",
      "14:27",
      "15:50",
      "16:12",
      "09:20",
      "17:35",
    ];
    var doneDate = fmtDate(daysAgo(1));
    var picked = 0;
    for (var i = 0; i < TASKS.length && picked < doneTimeSlots.length; i++) {
      var t = TASKS[i];
      if (t.status !== "待处理") continue; // 只翻待处理
      if (t.type === "风险处置") continue; // 风险处置与事件状态联动，不动
      if (t.due === fmtDate(TODAY)) continue; // 今日到期留给今日待办
      if (i % 2 !== 0) continue; // 每隔 1 条取 1 条
      t.status = "已完成";
      t.completeTime = doneDate + " " + doneTimeSlots[picked];
      picked++;
    }
  })();

  // —— 处理过程记录：为已开始（进行中/已逾期）与已完成任务补充确定性示例记录；
  //     纯公式派生（不消耗随机数），待处理任务留空 ——
  (function seedProcessNotes() {
    var notesByType = {
      风险处置: [
        "已联系企业财务负责人核实情况，企业说明系订单回款周期延长所致，已要求提交书面说明与还款计划。",
        "会同相关部门完成现场核查，风险事项基本属实，已下达整改提示函，约定下周复查验收。",
        "已完成首轮约谈，企业启动内部自查，暂未发现重大违规，持续跟踪后续整改进度。",
      ],
      项目跟进: [
        "项目本周完成场地平整，首笔投资款已到账，下一步协调供电方案评审。",
        "与企业召开推进协调会，能评、环评材料已受理，预计下月完成批复。",
        "签约条款双方法务已完成会审，待用章确认后进入建设准备阶段。",
      ],
      企业服务: [
        "已收集企业诉求明细，与相关部门初步对接，正在梳理办理路径与时限。",
        "组织银企专场对接，企业已与两家银行达成初步授信意向。",
      ],
      政策推送: [
        "已向企业宣贯申报要点，申报材料准备中，计划本周内提交。",
        "辅导企业完成线上申报填表，等待主管部门受理反馈。",
      ],
      日常巡检: [
        "完成片区巡查，发现 2 处一般隐患，已现场督促整改并登记台账。",
        "季度数据核验完成，更新 8 家企业基础信息，异常数据已标注复核。",
      ],
    };
    var timeSlots = ["09:35", "11:20", "14:05", "16:40", "10:12", "15:28"];
    var noteDate = fmtDate(daysAgo(1));
    var counters = {};
    var slotIdx = 0;
    TASKS.forEach(function (t) {
      if (t.status === "待处理") return;
      var pool = notesByType[t.type] || [
        "已按任务要求推进相关工作，具体情况持续更新中。",
      ];
      var i = (counters[t.type] = (counters[t.type] || 0) + 1);
      var note = pool[(i - 1) % pool.length];
      if (t.status === "已完成") note = "任务办结。" + note;
      t.processNote = note;
      t.processNoteTime =
        noteDate + " " + timeSlots[slotIdx++ % timeSlots.length];
    });
  })();

  // 按状态+优先级排序：待处理 > 进行中 > 已逾期 > 已完成；同状态高优先级在前
  var statusOrder = { 待处理: 0, 进行中: 1, 已逾期: 2, 已完成: 3 };
  var prioOrder = { 高: 0, 中: 1, 低: 2 };
  TASKS.sort(function (a, b) {
    if (statusOrder[a.status] !== statusOrder[b.status])
      return statusOrder[a.status] - statusOrder[b.status];
    return prioOrder[a.priority] - prioOrder[b.priority];
  });


  // ============================================================
  // 聚合统计与派生结构（全部从明细推导，天然对账）
  // 本地生成与服务器数据重建共用；R 为随机源
  // ============================================================
  function deriveAll(ENTERPRISES, RISK_EVENTS, PROJECTS, TASKS, POLICY_LIB, R) {
  // ============================================================
  // 十、聚合统计（全部从明细推导，天然对账）
  // ============================================================

  // 全市合计
  var totalRevenue = 0,
    totalTax = 0,
    totalInvest = 0,
    totalEmployees = 0;
  var riskCounts = { red: 0, orange: 0, yellow: 0, blue: 0 };
  var districtAgg = {};
  DISTRICTS.forEach(function (d) {
    districtAgg[d.key] = {
      enterprises: 0,
      key: 0,
      riskCount: 0,
      revenue: 0,
      tax: 0,
      invest: 0,
    };
  });
  var industryAgg = {};
  INDUSTRIES_META.forEach(function (ind) {
    industryAgg[ind.key] = {
      key: ind.key,
      name: ind.name,
      color: ind.color,
      count: 0,
      revenue: 0,
      tax: 0,
      invest: 0,
    };
  });

  ENTERPRISES.forEach(function (e) {
    totalRevenue += e.overview.revenueWan;
    totalTax += e.overview.taxWan;
    totalInvest += e.overview.investWan;
    totalEmployees += e.overview.employees;
    riskCounts[e.riskLevel]++;

    var da = districtAgg[e.district];
    if (da) {
      da.enterprises++;
      if (e.scale === "大型企业") da.key++;
      if (e.riskLevel === "red" || e.riskLevel === "orange") da.riskCount++;
      da.revenue += e.overview.revenueWan;
      da.tax += e.overview.taxWan;
      da.invest += e.overview.investWan;
    }
    var ia = industryAgg[e.industry];
    if (ia) {
      ia.count++;
      ia.revenue += e.overview.revenueWan;
      ia.tax += e.overview.taxWan;
      ia.invest += e.overview.investWan;
    }
  });

  // 区县数据（转成展示单位：企业数/营收亿/税亿/投资亿）
  var DISTRICT_DATA = {};
  DISTRICTS.forEach(function (d) {
    var da = districtAgg[d.key];
    DISTRICT_DATA[d.key] = {
      enterprises: da.enterprises,
      key: da.key,
      riskCount: da.riskCount,
      revenue: +(da.revenue / 10000).toFixed(1),
      tax: +(da.tax / 10000).toFixed(2),
      invest: +(da.invest / 10000).toFixed(1),
      name: d.name,
    };
  });

  // 产业数据（过滤掉 count=0 的，转展示单位）
  var INDUSTRIES = INDUSTRIES_META.filter(function (ind) {
    return industryAgg[ind.key].count > 0;
  })
    .map(function (ind) {
      var ia = industryAgg[ind.key];
      return {
        key: ind.key,
        name: ind.name,
        color: ind.color,
        count: ia.count,
        revenue: +(ia.revenue / 10000).toFixed(1),
        tax: +(ia.tax / 10000).toFixed(2),
        invest: +(ia.invest / 10000).toFixed(1),
        growth: R.rfloat(5, 35, 0),
      };
    })
    .sort(function (a, b) {
      return b.revenue - a.revenue;
    });

  // 总体态势（驾驶舱顶部）
  var keyEnterprises = ENTERPRISES.filter(function (e) {
    return e.scale === "大型企业";
  }).length;
  var newThisMonth = ENTERPRISES.filter(function (e) {
    // 注册时间在近 90 天内的算"本月新增"（近似）
    var diffDays = Math.floor((TODAY - new Date(e.found)) / 86400000);
    return diffDays <= 90;
  }).length;
  var newEnterprises = Math.max(newThisMonth, R.rint(15, 30));

  var OVERVIEW = {
    totalEnterprises: ENTERPRISES.length,
    keyEnterprises: keyEnterprises,
    newEnterprises: newEnterprises,
    revenue: (totalRevenue / 10000).toFixed(1) + "亿元",
    revenueWan: totalRevenue,
    tax: (totalTax / 10000).toFixed(2) + "亿元",
    taxWan: totalTax,
    invest: (totalInvest / 10000).toFixed(1) + "亿元",
    investWan: totalInvest,
    employment: totalEmployees,
    riskEnterprises: riskCounts.red + riskCounts.orange + riskCounts.yellow,
    riskCounts: riskCounts,
    mom: {
      totalEnterprises: +R.rfloat(1.5, 3.5, 1),
      keyEnterprises: +R.rfloat(2.0, 5.0, 1),
      newEnterprises: +R.rfloat(5.0, 12.0, 1),
      revenue: +R.rfloat(4.0, 9.0, 1),
      tax: +R.rfloat(4.0, 8.0, 1),
      invest: +R.rfloat(5.0, 10.0, 1),
      employment: +R.rfloat(2.0, 5.0, 1),
      riskEnterprises: +R.rfloat(-6.0, -1.0, 1),
    },
    updateTime: fmtDate(TODAY) + " 08:00",
  };

  // 风险等级汇总
  function riskStats() {
    return {
      red: riskCounts.red,
      orange: riskCounts.orange,
      yellow: riskCounts.yellow,
      blue: riskCounts.blue,
    };
  }

  // ============================================================
  // 十一、庆阳市行政区划 geoJSON（参照《庆阳市行政区域界线标准画法图》绘制）
  // 相对位置与真实区划图一致：环县占西北大部、华池东北、庆城居中、
  // 合水在庆城东侧、西峰区小且位于中心偏南、镇原西南大块、
  // 宁县南部大块、正宁东南角。
  // 平面剖分：相邻区县共享完全相同的边界顶点，零缝隙零重叠，
  // hover 置顶重绘时不会遮挡邻县；cp 为标签锚点。
  // ============================================================
  var GEO_QINGYANG = {"type":"FeatureCollection","features":[{"type":"Feature","properties":{"name":"环县","adcode":"hj","cp":[107.12,36.78]},"geometry":{"type":"Polygon","coordinates":[[[106.82,37.08],[106.85947127153798,37.1129425170841],[106.90841465395913,37.13049285398308],[106.95,37.16],[107.0016929610386,37.14423240259649],[107.0505751082387,37.12143777059677],[107.1,37.1],[107.13128882312135,37.13826677941102],[107.18259847629892,37.142212135868505],[107.22,37.17],[107.26563930163066,37.14708053181649],[107.30384459223286,37.112080795711755],[107.35,37.09],[107.39408812977508,37.10470419591812],[107.43734336215456,37.1215739250648],[107.48,37.14],[107.51184546002094,37.098760105573],[107.54990903329092,37.06270197218688],[107.58,37.02],[107.54957790804589,36.94125180842915],[107.53028561254955,36.85879368470571],[107.5,36.78],[107.52842770806589,36.69941039052471],[107.56,36.62],[107.52,36.52],[107.50266652754934,36.459111157483555],[107.47997496180798,36.400008346064006],[107.46,36.34],[107.4212467373186,36.28301107186003],[107.39717695628045,36.21786465391827],[107.36,36.16],[107.30409557147674,36.116271727836114],[107.25461592392976,36.065200848842174],[107.2,36.02],[107.16018363590182,36.070146908721455],[107.12,36.12],[107.06893777393597,36.15487184736974],[107.02775968543645,36.20127518856474],[106.98,36.24],[106.94850062302054,36.28772270679375],[106.91101422306262,36.33078884015982],[106.87666448192441,36.37629459705232],[106.84,36.42],[106.80846396021298,36.474456641799776],[106.77806121061543,36.52962158996798],[106.74,36.58],[106.77071470228722,36.63462549327762],[106.82989150399393,36.66485490133853],[106.86,36.72],[106.82426987887861,36.7718353409658],[106.79145142497136,36.825490473940434],[106.76,36.88],[106.81630226713203,36.90875846612374],[106.85017420428085,36.96368565056124],[106.9,37.0],[106.86105155662759,37.04105155662759],[106.82,37.08],[106.82,37.08]]]}},{"type":"Feature","properties":{"name":"华池县","adcode":"hn","cp":[108.06,36.52]},"geometry":{"type":"Polygon","coordinates":[[[107.52,36.52],[107.56,36.62],[107.52842770806589,36.69941039052471],[107.5,36.78],[107.53028561254955,36.85879368470571],[107.54957790804589,36.94125180842915],[107.58,37.02],[107.63704587312489,37.00107441829828],[107.69298285084535,36.97900696628406],[107.75,36.96],[107.80628915318351,36.96987553127355],[107.86224476204447,36.98258618928866],[107.92,36.98],[107.96428299397715,36.94790122550362],[108.00063335193369,36.905490024180466],[108.05,36.88],[108.10941557636147,36.865507282039225],[108.16831221036716,36.84952260480561],[108.2251707507323,36.82767840835536],[108.28,36.8],[108.29078390480355,36.75090395769046],[108.31753448662441,36.70890421627751],[108.33598211993376,36.663214275526116],[108.36,36.62],[108.33654239702572,36.57786062420507],[108.31941541200472,36.5315008364413],[108.28,36.5],[108.33003272001802,36.46392706224324],[108.36860247354792,36.41448066358369],[108.42,36.38],[108.38504016125125,36.330813252707706],[108.3719143206021,36.27070950636562],[108.34,36.22],[108.37582292962881,36.16764216296257],[108.37560853775494,36.09832558639448],[108.42,36.05],[108.34779968024525,36.02834807358755],[108.27412804455906,36.013169937273496],[108.2,36.0],[108.10974894825456,36.018870267145545],[108.02,36.04],[107.95004806121516,36.02966357149387],[107.88,36.02],[107.82885892303214,36.062923008487296],[107.77053111053148,36.09626370293087],[107.72,36.14],[107.67905542188082,36.192624899743954],[107.64049373912782,36.247036971012534],[107.6,36.3],[107.57315905381408,36.3732699589627],[107.54941414025805,36.44766574797262],[107.52,36.52],[107.58,37.02],[107.54957790804589,36.94125180842915],[107.53028561254955,36.85879368470571],[107.5,36.78],[107.52842770806589,36.69941039052471],[107.56,36.62],[107.52,36.52],[107.52,36.52]]]}},{"type":"Feature","properties":{"name":"庆城县","adcode":"qc","cp":[107.66,35.92]},"geometry":{"type":"Polygon","coordinates":[[[107.52,36.52],[107.54941414025805,36.44766574797262],[107.57315905381408,36.3732699589627],[107.6,36.3],[107.64049373912782,36.247036971012534],[107.67905542188082,36.192624899743954],[107.72,36.14],[107.77053111053148,36.09626370293087],[107.82885892303214,36.062923008487296],[107.88,36.02],[107.88313609964075,35.96],[107.88,35.9],[107.86901606867235,35.840163988554615],[107.86,35.78],[107.86,35.72],[107.76978004213471,35.728020379212346],[107.68,35.74],[107.61527509470025,35.751788115551534],[107.55,35.76],[107.48459850586366,35.76739028811374],[107.42,35.78],[107.41392008117074,35.860048895653115],[107.40696317164937,35.94002470874856],[107.4,36.02],[107.44,35.94],[107.42706980830319,36.0296744231448],[107.42,36.12],[107.2,36.02],[107.25461592392976,36.065200848842174],[107.30409557147674,36.116271727836114],[107.36,36.16],[107.39717695628045,36.21786465391827],[107.4212467373186,36.28301107186003],[107.46,36.34],[107.47997496180798,36.400008346064006],[107.50266652754934,36.459111157483555],[107.52,36.52],[107.52,36.52]]]}},{"type":"Feature","properties":{"name":"镇原县","adcode":"zx","cp":[107.02,35.62]},"geometry":{"type":"Polygon","coordinates":[[[106.84,36.42],[106.87666448192441,36.37629459705232],[106.91101422306262,36.33078884015982],[106.94850062302054,36.28772270679375],[106.98,36.24],[107.02775968543645,36.20127518856474],[107.06893777393597,36.15487184736974],[107.12,36.12],[107.16018363590182,36.070146908721455],[107.2,36.02],[107.42,36.12],[107.42706980830319,36.0296744231448],[107.44,35.94],[107.4,36.02],[107.40696317164937,35.94002470874856],[107.41392008117074,35.860048895653115],[107.42,35.78],[107.43471361358715,35.72078560226452],[107.44,35.66],[107.46,35.58],[107.48,35.52],[107.44632779328569,35.466878462529785],[107.41116132119467,35.414690840919995],[107.38,35.36],[107.33967444207373,35.28016277896314],[107.3,35.2],[107.34,35.1],[107.28246336366466,35.11071877313755],[107.22429496006511,35.112276920944005],[107.16602441447283,35.11235400985609],[107.1080896031914,35.11729924627534],[107.05,35.12],[107.0195535965524,35.16648315306562],[106.98459297825151,35.20970603984831],[106.95281555066201,35.25522789770034],[106.92,35.3],[106.90209082204602,35.35292359458208],[106.87322751181456,35.40058920567099],[106.84865477866163,35.45031429375758],[106.82696320301726,35.50142233744828],[106.8,35.55],[106.77143853586223,35.59657541434488],[106.76398073747629,35.651592294990515],[106.73903095798579,35.69961238319432],[106.72,35.75],[106.74107805116388,35.806286178020585],[106.77316474381982,35.85868695316164],[106.78,35.92],[106.7488149518524,35.97107414259287],[106.72919035498477,36.02792851082571],[106.7,36.08],[106.73877761458638,36.12277789434305],[106.76306657326583,36.17590482861964],[106.8,36.22],[106.81650504861196,36.268698990277606],[106.82762543324809,36.31847491335038],[106.82296003168786,36.37140799366244],[106.84,36.42],[106.84,36.42]]]}},{"type":"Feature","properties":{"name":"西峰区","adcode":"xf","cp":[107.63,35.63]},"geometry":{"type":"Polygon","coordinates":[[[107.42,35.78],[107.48459850586366,35.76739028811374],[107.55,35.76],[107.61527509470025,35.751788115551534],[107.68,35.74],[107.76978004213471,35.728020379212346],[107.86,35.72],[107.88,35.62],[107.9,35.52],[107.83297432728311,35.51692339383563],[107.76668349241292,35.50649840920413],[107.7,35.5],[107.6408254657293,35.514952794375844],[107.58,35.52],[107.48,35.52],[107.46,35.58],[107.44,35.66],[107.43471361358715,35.72078560226452],[107.42,35.78],[107.42,35.78]]]}},{"type":"Feature","properties":{"name":"合水县","adcode":"hy","cp":[108.16,35.74]},"geometry":{"type":"Polygon","coordinates":[[[107.88,36.02],[107.95004806121516,36.02966357149387],[108.02,36.04],[108.10974894825456,36.018870267145545],[108.2,36.0],[108.27412804455906,36.013169937273496],[108.34779968024525,36.02834807358755],[108.42,36.05],[108.43752394658611,36.00310232152125],[108.46442726295905,35.96172191938768],[108.49284130828492,35.921230181344065],[108.52,35.88],[108.49642633634316,35.82800679053798],[108.47342164952462,35.775800214761595],[108.46,35.72],[108.49372596921849,35.67361378753702],[108.51898672250266,35.6211809922638],[108.56,35.58],[108.5225906844149,35.54740931558511],[108.48657613560735,35.51342386439266],[108.45182735277004,35.47817264722995],[108.42,35.44],[108.3501581746221,35.47036907411824],[108.28,35.5],[108.19861379545006,35.46277240909988],[108.12,35.42],[107.9,35.52],[107.98,35.48],[108.04936607898314,35.448520850960634],[108.12,35.42],[107.9,35.52],[107.88,35.62],[107.86,35.72],[107.86,35.78],[107.86901606867235,35.840163988554615],[107.88,35.9],[107.88313609964075,35.96],[107.88,36.02],[107.88,36.02]]]}},{"type":"Feature","properties":{"name":"宁县","adcode":"ning","cp":[107.74,35.24]},"geometry":{"type":"Polygon","coordinates":[[[107.9,35.52],[107.98,35.48],[108.04936607898314,35.448520850960634],[108.12,35.42],[108.13144704593768,35.35020672084824],[108.14,35.28],[108.12623180834547,35.21342030499757],[108.11464114497764,35.1464051043378],[108.1,35.08],[107.52,35.14],[107.57691297260158,35.120492611869814],[107.62722485446783,35.087783042269],[107.68,35.06],[107.7348422730302,35.04442166777734],[107.79244818080716,35.038976662959556],[107.84348209143924,35.00943433527722],[107.9,35.0],[107.95120206436398,35.01699483909004],[108.00138985200715,35.03652536998213],[108.05113680459966,35.05715798850083],[108.1,35.08],[107.52,35.14],[107.43,35.120000000000005],[107.34,35.1],[107.3,35.2],[107.33967444207373,35.28016277896314],[107.38,35.36],[107.41116132119467,35.414690840919995],[107.44632779328569,35.466878462529785],[107.48,35.52],[107.58,35.52],[107.6408254657293,35.514952794375844],[107.7,35.5],[107.76668349241292,35.50649840920413],[107.83297432728311,35.51692339383563],[107.9,35.52],[107.9,35.52]]]}},{"type":"Feature","properties":{"name":"正宁县","adcode":"zq","cp":[108.38,35.24]},"geometry":{"type":"Polygon","coordinates":[[[108.12,35.42],[108.19861379545006,35.46277240909988],[108.28,35.5],[108.3501581746221,35.47036907411824],[108.42,35.44],[108.48128476382573,35.423854291477156],[108.53942486177134,35.398274585314034],[108.6,35.38],[108.63137332421036,35.33602285192973],[108.65374364128535,35.286901128353534],[108.68,35.24],[108.62904428659475,35.20636530486467],[108.58284240204472,35.16593942565043],[108.53015756307066,35.13477490989906],[108.48,35.1],[108.42872793365714,35.089240221142866],[108.3809564067992,35.066811977335995],[108.33103075975033,35.05156413416554],[108.28,35.04],[108.22050491646645,35.05560545743236],[108.16014068746298,35.0672997602501],[108.1,35.08],[108.11464114497764,35.1464051043378],[108.12623180834547,35.21342030499757],[108.14,35.28],[108.13144704593768,35.35020672084824],[108.12,35.42],[108.12,35.42]]]}}]};

  // ============================================================
  // 十二、其他数据
  // ============================================================

  // 数据来源（11 类）
  var DATA_SOURCES = [
    {
      name: "市监局（工商）",
      count: ENTERPRISES.length,
      update: "T+1",
      color: "#2563EB",
    },
    {
      name: "税务局（纳税）",
      count: ENTERPRISES.length,
      update: "T+1",
      color: "#3B82F6",
    },
    {
      name: "人社局（社保）",
      count: Math.round(ENTERPRISES.length * 0.98),
      update: "T+1",
      color: "#0EA5E9",
    },
    {
      name: "法院（司法）",
      count: ENTERPRISES.length,
      update: "T+0",
      color: "#e03131",
    },
    {
      name: "公共资源交易中心",
      count: Math.round(ENTERPRISES.length * 0.88),
      update: "T+1",
      color: "#F97316",
    },
    {
      name: "知识产权局",
      count: Math.round(ENTERPRISES.length * 0.62),
      update: "T+3",
      color: "#8B5CF6",
    },
    {
      name: "生态环境局",
      count: Math.round(ENTERPRISES.length * 0.24),
      update: "T+1",
      color: "#22C55E",
    },
    {
      name: "应急管理局",
      count: Math.round(ENTERPRISES.length * 0.22),
      update: "T+1",
      color: "#6366F1",
    },
    {
      name: "住建局",
      count: Math.round(ENTERPRISES.length * 0.2),
      update: "T+7",
      color: "#94A3B8",
    },
    {
      name: "招商局（履约）",
      count: keyEnterprises,
      update: "T+7",
      color: "#2563EB",
    },
    {
      name: "水滴信用（第三方）",
      count: Math.round(ENTERPRISES.length * 0.88),
      update: "T+1",
      color: "#8B5CF6",
    },
  ];

  // AI 今日摘要（运行时从数据生成，保证一致）
  function generateAIDaily() {
    var topEnt = ENTERPRISES.slice().sort(function (a, b) {
      return b.overview.revenueWan - a.overview.revenueWan;
    })[0];
    var redEnts = ENTERPRISES.filter(function (e) {
      return e.riskLevel === "red";
    });
    var redNames = redEnts
      .slice(0, 3)
      .map(function (e) {
        return e.name;
      })
      .join("、");
    var newRisks = RISK_EVENTS.filter(function (ev) {
      return ev.daysAgo <= 1;
    }).length;

    return [
      "今日重点变化：" +
        topEnt.name +
        "持续领跑，" +
        topEnt.industryName +
        "产业增长动能强劲，建议纳入标杆企业培育。",
      "重大风险提示：" +
        (redEnts.length > 0
          ? redNames + "等" + redEnts.length + "家企业"
          : "重点风险企业") +
        "出现多项风险叠加信号，已生成专项核查任务。",
      "招商项目进展：全市在库项目 " +
        PROJECTS.length +
        " 个，其中建设推进及投产运营阶段 " +
        PROJECTS.filter(function (p) {
          return p.stage === "build" || p.stage === "operate";
        }).length +
        " 个。",
      "风险事件动态：今日新增风险预警 " +
        newRisks +
        " 条，待处置 " +
        RISK_EVENTS.filter(function (ev) {
          return ev.status === "待处置";
        }).length +
        " 条，事件办结关闭率持续提升。",
      "需关注事项：" +
        (redEnts.length > 1
          ? redEnts[0].name + "、" + redEnts[1].name
          : "部分企业") +
        "经营下行压力较大，建议专题研究风险处置与低效用地盘活机制。",
    ];
  }
  var AI_DAILY = generateAIDaily();

  // 图谱（25 个节点 + 35 条边，含重点企业、国资平台、产业关联）
  var GRAPH = buildGraph();
  function buildGraph() {
    var deepEnts = ENTERPRISES.filter(function (e) {
      return e.isDeep;
    });
    var nodes = [];
    var links = [];
    var catSet = {};
    var cats = [];
    function addCat(name) {
      if (!catSet[name]) {
        catSet[name] = cats.length;
        cats.push(name);
      }
      return catSet[name];
    }
    // 企业节点（深度企业）；按确定性规则标注资源缺口（land=土地 / fund=资金），不消耗随机种子
    deepEnts.forEach(function (e, ei) {
      var catIdx = addCat(e.industryName);
      var gaps = [];
      if (ei % 5 === 0) gaps.push("land");
      if (ei % 7 === 3) gaps.push("fund");
      var nd = {
        id: e.id,
        name: e.name,
        category: catIdx,
        symbolSize: 24 + Math.min(40, e.overview.revenueWan / 2000),
        value: e.scale,
        desc: e.industryName + " · " + e.overview.revenue,
        riskLevel: e.riskLevel,
      };
      if (gaps.length) nd.gaps = gaps;
      nodes.push(nd);
    });
    // 国资/基金/平台节点（辅助节点，行业类别统一为"投资机构"，不计入产业行业分类）
    var platformNodes = [
      {
        id: "G1",
        name: "庆阳产业投资集团",
        value: "国资平台",
        desc: "市级国有资本投资运营平台。",
      },
      {
        id: "G2",
        name: "陇东产业引导基金",
        value: "产业基金",
        desc: "市级产业发展引导基金。",
      },
      {
        id: "G3",
        name: "国信高地股权投资",
        value: "投资机构",
        desc: "省属股权投资机构。",
      },
      {
        id: "G4",
        name: "庆阳市高开投",
        value: "园区平台",
        desc: "高新区开发建设与招商平台。",
      },
      {
        id: "G5",
        name: "农投集团",
        value: "农业投资",
        desc: "农业农村发展投资集团。",
      },
      {
        id: "G6",
        name: "交投集团",
        value: "交通投资",
        desc: "交通基础设施投资集团。",
      },
    ];
    platformNodes.forEach(function (n) {
      nodes.push({
        id: n.id,
        name: n.name,
        aux: "投资机构",
        symbolSize: 26,
        value: n.value,
        desc: n.desc,
      });
    });
    // 外部市场节点（辅助节点，行业类别为"其他"，不计入产业行业分类）
    var marketNodes = [
      {
        id: "M1",
        name: "东部算力市场",
        value: "客户市场",
        desc: "长三角、粤港澳大湾区算力需求。",
      },
      {
        id: "M2",
        name: "中亚外贸市场",
        value: "客户市场",
        desc: "中亚五国贸易与跨境电商。",
      },
      {
        id: "M3",
        name: "新能源大基地",
        value: "下游客户",
        desc: "河西走廊风光储大基地项目。",
      },
    ];
    marketNodes.forEach(function (n) {
      nodes.push({
        id: n.id,
        name: n.name,
        aux: "其他",
        symbolSize: 22,
        value: n.value,
        desc: n.desc,
      });
    });

    // —— 政府服务与监管节点：部门按职能与企业轮转建边（确定性规则，不消耗随机种子）——
    var govNodes = [
      {
        id: "GV1",
        name: "市商务局",
        desc: "招商引资主管部门，统筹项目洽谈与落地服务。",
      },
      {
        id: "GV2",
        name: "市发展改革委",
        desc: "项目立项审批、要素协调与营商环境建设。",
      },
      { id: "GV3", name: "市自然资源局", desc: "工业用地供给与规划许可。" },
      { id: "GV4", name: "市税务局", desc: "税收征管与税费优惠政策落实。" },
      { id: "GV5", name: "市市场监管局", desc: "市场主体登记与经营行为监管。" },
      { id: "GV6", name: "市生态环境局", desc: "环评审批与污染排放监管。" },
      { id: "GV7", name: "市人社局", desc: "用工保障、社保与人才政策。" },
      {
        id: "GV8",
        name: "市政府金融办",
        desc: "融资协调、上市培育与金融风险处置。",
      },
    ];
    govNodes.forEach(function (n) {
      nodes.push({
        id: n.id,
        name: n.name,
        aux: "政府部门",
        symbolSize: 24,
        value: "政府部门",
        desc: n.desc,
      });
    });
    // 服务保障类：商务·发改·自然资源·金融办 轮转；监管类：税务·市监·生态·人社 轮转
    var svcDepts = ["GV1", "GV2", "GV3", "GV8"];
    var monDepts = ["GV4", "GV5", "GV6", "GV7"];
    deepEnts.forEach(function (e, ei) {
      links.push({
        source: svcDepts[ei % svcDepts.length],
        target: e.id,
        relation: ei % 2 === 0 ? "招商服务" : "要素保障",
      });
      links.push({
        source: monDepts[ei % monDepts.length],
        target: e.id,
        relation: ei % 3 === 0 ? "重点监管" : "日常监管",
      });
    });

    // —— 政策节点：取深度企业实际匹配的政策，政策 ↔ 企业 按 e.policies 建边 ——
    var polByEnt = {}; // 政策名 -> [企业id...]（每条政策最多连6家）
    deepEnts.forEach(function (e) {
      (e.policies || []).forEach(function (pn) {
        if (!polByEnt[pn]) polByEnt[pn] = [];
        if (polByEnt[pn].length < 6) polByEnt[pn].push(e.id);
      });
    });
    var polByName = {};
    POLICY_LIB.forEach(function (p) {
      polByName[p.name] = p;
    });
    Object.keys(polByEnt).forEach(function (pn, pi) {
      var p = polByName[pn];
      if (!p) return;
      if (pi >= 10) return; // 最多展示 10 个政策节点，控制图密度
      var nid = "PL" + p.code;
      nodes.push({
        id: nid,
        name: p.name,
        aux: "政策",
        symbolSize: 20,
        value: p.type + " · " + p.level,
        desc: p.dept + "：" + p.apply,
      });
      polByEnt[pn].forEach(function (eid) {
        links.push({ source: eid, target: nid, relation: "政策匹配" });
      });
    });

    // 建边：企业与产业内同行（供应链/竞争）
    var byIndustry = {};
    deepEnts.forEach(function (e) {
      if (!byIndustry[e.industry]) byIndustry[e.industry] = [];
      byIndustry[e.industry].push(e);
    });
    for (var k in byIndustry) {
      var arr = byIndustry[k];
      for (var i = 0; i < arr.length - 1; i++) {
        for (var j = i + 1; j < arr.length; j++) {
          if (R.rand() < 0.6) {
            links.push({
              source: arr[i].id,
              target: arr[j].id,
              relation: R.rpick(["同产业", "供应链", "竞争"]),
            });
          }
        }
      }
    }
    // 企业与国资（随机持股/合作）
    deepEnts.forEach(function (e, ei) {
      var platCount = R.rint(1, 2);
      for (var pi = 0; pi < platCount; pi++) {
        var pn = platformNodes[(ei + pi) % platformNodes.length];
        links.push({
          source: pn.id,
          target: e.id,
          relation: R.rpick(["参股", "控股", "合作"]),
        });
      }
    });
    // 企业与市场
    deepEnts.slice(0, 6).forEach(function (e, i) {
      var mn = marketNodes[i % marketNodes.length];
      links.push({
        source: e.id,
        target: mn.id,
        relation: R.rpick(["服务", "供应", "出口"]),
      });
    });
    // 跨产业上下游（数字经济 ↔ 新能源 ↔ 物流 ↔ 农业）
    var sw = deepEnts.filter(function (e) {
      return e.industry === "software";
    });
    var ne = deepEnts.filter(function (e) {
      return e.industry === "neequip";
    });
    var logis = deepEnts.filter(function (e) {
      return e.industry === "logistics";
    });
    var agri = deepEnts.filter(function (e) {
      return e.industry === "agrifood" || e.industry === "agriequip";
    });
    if (sw.length && ne.length)
      links.push({
        source: sw[0].id,
        target: ne[0].id,
        relation: "数字化赋能",
      });
    if (ne.length && logis.length)
      links.push({
        source: ne[0].id,
        target: logis[0].id,
        relation: "物流配套",
      });
    if (agri.length && logis.length)
      links.push({
        source: agri[0].id,
        target: logis[0].id,
        relation: "供应链",
      });

    // —— 同一法人/关联企业：同区县深度企业两两结对（确定性规则，不消耗随机种子）——
    var entByDist = {};
    deepEnts.forEach(function (e) {
      if (!entByDist[e.district]) entByDist[e.district] = [];
      entByDist[e.district].push(e.id);
    });
    Object.keys(entByDist).forEach(function (k) {
      var arr = entByDist[k];
      if (arr.length >= 2) {
        links.push({ source: arr[0], target: arr[1], relation: "同一法人" });
      }
    });

    // —— 招商线索：取自 PROJECTS 中"线索对接"阶段的项目（与项目页打通，点击即跳项目详情）。
    //     线索目标为未落地的浅层企业，其企业实体不在图谱中绘制，故不做"项目意向"连边——
    //     仅在市商务局（招商洽谈）与投资平台（平台对接）之间建线。——
    var leadProjects = PROJECTS.filter(function (p) {
      return p.stage === "lead";
    });
    var leadPlatforms = ["G1", "G2", "G3", "G2"];
    leadProjects.forEach(function (p, i) {
      nodes.push({
        id: "PRJ_" + p.id,
        name: p.enterpriseName + "（在谈）",
        aux: "意向企业",
        projectId: p.id,
        district: p.district,
        symbolSize: 20,
        value: "线索对接 · 意向投资 " + p.amount,
        desc:
          p.owner +
          " · 对接人 " +
          p.contact +
          "。项目处于线索对接阶段，意向投资 " +
          p.amount +
          "元。",
      });
      // 线索关联：市商务局招商洽谈 + 投资平台对接
      links.push({
        source: "GV1",
        target: "PRJ_" + p.id,
        relation: "招商洽谈",
      });
      links.push({
        source: leadPlatforms[i % leadPlatforms.length],
        target: "PRJ_" + p.id,
        relation: "平台对接",
      });
    });

    // categories 仅含产业行业分类；国资平台节点 aux="投资机构"，外部市场节点 aux="其他"
    return {
      nodes: nodes,
      links: links,
      categories: cats,
      auxCategories: ["投资机构", "其他", "政府部门", "政策", "意向企业"],
    };
  }

  // ============================================================
  // 十二点五、驾驶舱招商成效增强数据
  // 全部为常量或从明细确定性推导，不消耗随机数种子（避免全局数据漂移）
  // ============================================================

  // —— 年度招商引资目标（协议投资额，亿元；市政府分解到各区县）——
  var INVEST_TARGETS = {
    year: YEARS_5[4],
    total: 180,
    byDistrict: {
      xf: 55,
      qc: 32,
      hj: 8,
      hn: 16,
      hy: 11,
      zq: 18,
      ning: 9,
      zx: 31,
    },
  };

  // —— 招商项目口径汇总：签约落地（order>=3）起计入"已签约"；
  //     到位资金 = 协议额 × 项目进度；签约前计为"在谈储备" ——
  function projStageOrder(key) {
    for (var i = 0; i < PROJECT_STAGES.length; i++) {
      if (PROJECT_STAGES[i].key === key) return PROJECT_STAGES[i].order;
    }
    return 1;
  }
  var INVEST_STATS = (function () {
    var agreedWan = 0,
      arrivedWan = 0,
      pipelineWan = 0;
    var stageCounts = {},
      byDistrict = {};
    PROJECT_STAGES.forEach(function (s) {
      stageCounts[s.key] = 0;
    });
    DISTRICTS.forEach(function (d) {
      byDistrict[d.key] = { agreedWan: 0, count: 0, arrivedWan: 0 };
    });
    PROJECTS.forEach(function (p) {
      stageCounts[p.stage]++;
      var bd = byDistrict[p.district];
      if (projStageOrder(p.stage) >= 3) {
        agreedWan += p.amountWan;
        arrivedWan += Math.round((p.amountWan * p.progress) / 100);
        if (bd) {
          bd.agreedWan += p.amountWan;
          bd.arrivedWan += Math.round((p.amountWan * p.progress) / 100);
        }
      } else {
        pipelineWan += p.amountWan;
      }
      if (bd) bd.count++;
    });
    return {
      agreedWan: agreedWan,
      arrivedWan: arrivedWan,
      pipelineWan: pipelineWan,
      stageCounts: stageCounts,
      byDistrict: byDistrict,
    };
  })();

  // —— 全省 14 个市州实际到位资金对标（亿元）：以庆阳推导值为基准按倍数构造，
  //     既保证与本地项目数据对账，又保持"全省第3"的排名稳定 ——
  var PROVINCE_COMPARE = (function () {
    var qyYi = Math.max(1, Math.round(INVEST_STATS.arrivedWan / 10000));
    function pc(name, mult) {
      return { name: name, amount: Math.max(1, Math.round(qyYi * mult)) };
    }
    var arr = [
      pc("兰州市", 4.2),
      pc("天水市", 1.18),
      { name: "庆阳市", amount: qyYi, self: true },
      pc("酒泉市", 0.9),
      pc("张掖市", 0.78),
      pc("白银市", 0.75),
      pc("平凉市", 0.68),
      pc("武威市", 0.62),
      pc("金昌市", 0.55),
      pc("定西市", 0.5),
      pc("陇南市", 0.46),
      pc("嘉峪关市", 0.4),
      pc("临夏州", 0.36),
      pc("甘南州", 0.25),
    ];
    arr.sort(function (a, b) {
      return b.amount - a.amount;
    });
    return arr;
  })();

  // —— 政策兑现统计：年度安排/已兑现金额按序号确定性推导，惠企企业数从企业匹配政策真实计数 ——
  var POLICY_REDEEM = (function () {
    var planWan = 0,
      redeemedWan = 0,
      helpedSet = {};
    POLICY_LIB.forEach(function (p, idx) {
      var plan = (((idx * 97 + 61) % 19) + 6) * 100; // 年度安排 600–2400 万
      var rate = (((idx * 37 + 53) % 40) + 55) / 100; // 兑现率 55%–94%
      p.planWan = plan;
      p.redeemedWan = Math.round(plan * rate);
      p.redeemRate = Math.round(rate * 100);
      p.entCount = ENTERPRISES.filter(function (e) {
        return e.policies.indexOf(p.name) >= 0;
      }).length;
      planWan += plan;
      redeemedWan += p.redeemedWan;
      ENTERPRISES.forEach(function (e) {
        if (e.policies.indexOf(p.name) >= 0) helpedSet[e.id] = 1;
      });
    });
    return {
      planWan: planWan,
      redeemedWan: redeemedWan,
      rate: Math.round((redeemedWan / planWan) * 100),
      entsHelped: Object.keys(helpedSet).length,
    };
  })();

  // —— 企业用地（亩）：由投资规模确定性推导（约 90 万元/亩），供亩均税收口径使用 ——
  ENTERPRISES.forEach(function (e) {
    e.landMu = Math.max(15, Math.round(e.overview.investWan / 90));
  });

  // 产业链缺口
  var INDUSTRY_GAP = [
    {
      chain: "算力/数字经济",
      gap: "上游：芯片与服务器制造缺位；下游：行业大模型应用企业偏少",
      target: "引进服务器制造、行业大模型应用、数据安全企业",
      level: "高",
    },
    {
      chain: "新能源装备",
      gap: "上游：电芯/储能材料配套不足；下游：运维服务体系待完善",
      target: "补强储能电芯与运维服务企业",
      level: "中",
    },
    {
      chain: "生物医药",
      gap: "中试与CXO平台薄弱，研发转化环节缺失",
      target: "引入药物中试与CXO服务平台",
      level: "中",
    },
    {
      chain: "石油化工",
      gap: "下游精细化工与新材料延伸不够，附加值偏低",
      target: "引进精细化工与新材料深加工企业",
      level: "中",
    },
    {
      chain: "现代农业",
      gap: "精深加工与品牌渠道不足，电商渗透率偏低",
      target: "引进农产品精深加工与电商品牌企业",
      level: "低",
    },
  ];


    return {
      DISTRICT_DATA: DISTRICT_DATA,
      INDUSTRIES: INDUSTRIES,
      OVERVIEW: OVERVIEW,
      riskStats: riskStats,
      GEO_QINGYANG: GEO_QINGYANG,
      DATA_SOURCES: DATA_SOURCES,
      AI_DAILY: AI_DAILY,
      GRAPH: GRAPH,
      INDUSTRY_GAP: INDUSTRY_GAP,
      INVEST_TARGETS: INVEST_TARGETS,
      INVEST_STATS: INVEST_STATS,
      PROVINCE_COMPARE: PROVINCE_COMPARE,
      POLICY_REDEEM: POLICY_REDEEM
    };
  }

  var _D = deriveAll(ENTERPRISES, RISK_EVENTS, PROJECTS, TASKS, POLICY_LIB, LR);

  // AI 能力话术
  var AI_CAPS = {
    see: "AI 看企业：自动汇聚工商、经营、纳税、招投标、知识产权、信用、司法与招商履约数据，生成企业画像与经营分析，识别成长性、优势与潜在风险。",
    risk: "AI 找风险：持续扫描企业数据变化，主动识别经营下行、履约滞后、司法信用异常等信号，形成风险事件并给出处置建议，而非仅做风险展示。",
    invest:
      "AI 做招商：基于本地产业基础与企业结构，分析产业链缺口、技术空白与招商方向，推荐潜在目标企业并解释依据。",
    serve:
      "AI 帮服务：根据企业画像自动匹配政策、识别并分派企业诉求、生成跟进任务与各类报告，形成服务闭环。",
  };

  // 一键演示脚本（待第二批补完后再调整）
  var DEMO_SCRIPT = [
    {
      page: "dashboard",
      title: "招商驾驶舱",
      highlight: ".kpi-grid",
      desc: "招商驾驶舱：顶部指标体系一屏联动，呈现全市招商目标、企业经营与风险等核心体征，供领导总览全局。",
      delay: 6000,
    },
    {
      page: "dashboard",
      highlight: ".target-wrap",
      desc: "年度招商目标完成度：协议投资额与到位资金双口径对标，并自动比对时序进度，标出超前或滞后幅度。",
      delay: 6000,
    },
    {
      page: "dashboard",
      highlight: ".map-area",
      desc: "企业分布热力图：以颜色深浅映射企业数量，点击区县即可下钻至对应视角；数据均由企业库实时聚合和动态更新。",
      delay: 6000,
    },
    {
      page: "enterprise",
      title: "企业概况",
      highlight: ".filter-card",
      desc: "企业概况：支持按名称、行业、区县、规模、风险等级等条件组合筛选；列表支持排序、分页与 CSV 导出。",
      delay: 7000,
    },
    {
      page: "profile",
      title: "企业画像",
      highlight: ".six-layer-tabs",
      desc: "企业画像：以六层视角呈现企业全貌——概况、经营状态、经营趋势、关系网络、企业风险、AI 综合研判。",
      delay: 7000,
    },
    {
      page: "profile",
      title: "AI综合研判",
      tab: 5,
      highlight: ".ai-panel",
      desc: "AI综合研判：不仅给出结论，更展示数据来源、置信度与历史研判对比，做到结论可解释、可追溯、可审计。",
      delay: 7000,
    },
    {
      page: "risk",
      title: "风险预警",
      highlight: ".row",
      desc: "风险预警双视图：左侧为全市企业加权平均的风险态势，右侧为选中企业的逐维度对比，并对差异进行标注。",
      delay: 7000,
    },
    {
      page: "risk",
      highlight: ".filter-card",
      desc: "风险事件清单支持按等级、维度、状态、区县等条件组合筛选；每起事件均可派发处置，自动生成任务并实现闭环。",
      delay: 7000,
    },
    {
      page: "workbench",
      title: "我的工作台",
      highlight: ".today-list",
      desc: "招商专员工作台：风险任务派发后即时落至个人待办，呈现今日需办事项，逾期项自动高亮提醒。",
      delay: 6000,
    },
    {
      page: "project",
      title: "招商项目",
      highlight: ".funnel",
      desc: "招商项目管理：自意向接洽至稳产达效共六个阶段，漏斗直观呈现各阶段项目转化与分布；项目详情可随时查阅。",
      delay: 6000,
    },
    {
      page: "graph",
      title: "关系图谱",
      highlight: "#c_graph",
      desc: "产业关系图谱：揭示企业间的股权、供应链、市场等关联，可拖拽、缩放、点击节点下钻，发现隐性关联。",
      delay: 6000,
    },
    {
      page: "policy",
      title: "政策服务",
      highlight: ".policy-grid",
      desc: "政策服务：按类型、层级、部门多维分类沉淀，AI智能体依据企业画像自动匹配和推送适配政策。",
      delay: 6000,
    },
    {
      page: "aidemo",
      title: "招商智能体",
      highlight: ".ai-main",
      desc: "招商智能体：企业洞察、风险研判、招商谋划、企业服务四大智能体，以对话方式交互、有问必答。",
      delay: 7000,
    },
  ];

  // ============================================================
  // 十三、工具函数
  // ============================================================
  function entById(id) {
    for (var i = 0; i < ENTERPRISES.length; i++) {
      if (ENTERPRISES[i].id === id) return ENTERPRISES[i];
    }
    return null;
  }

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
