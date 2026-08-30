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
  // 出厂权重快照（与初始 RISK_DIMS 严格同源）："默认权重"预设与恢复出厂的基准，运行时勿改
  var RISK_DIMS_DEFAULT = RISK_DIMS.map(function (d) {
    return { key: d.key, name: d.name, weight: d.weight };
  });

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
  var GEO_QINGYANG = {"type":"FeatureCollection","features":[{"type":"Feature","properties":{"name":"西峰区","adcode":"xf","cp":[107.63882,35.73371]},"geometry":{"type":"MultiPolygon","coordinates":[[[[107.60207,35.48744],[107.59702,35.48492],[107.6048,35.47995],[107.5973,35.47684],[107.59455,35.47361],[107.59725,35.47219],[107.59467,35.46136],[107.5989,35.45737],[107.60785,35.45478],[107.61335,35.46027],[107.61761,35.46213],[107.62699,35.45588],[107.62389,35.45108],[107.63625,35.4443],[107.63296,35.43645],[107.63501,35.43186],[107.64255,35.42895],[107.6454,35.42566],[107.65012,35.43093],[107.65631,35.42907],[107.66124,35.43031],[107.66594,35.42773],[107.6687,35.43331],[107.6742,35.43137],[107.67427,35.43503],[107.67855,35.43455],[107.68007,35.43778],[107.6852,35.44053],[107.68929,35.44682],[107.69246,35.44862],[107.69684,35.45789],[107.69728,35.46381],[107.70194,35.47328],[107.71033,35.48483],[107.70998,35.49052],[107.71306,35.49543],[107.71322,35.50999],[107.70579,35.51717],[107.70018,35.52924],[107.69902,35.53504],[107.69312,35.54869],[107.69493,35.55106],[107.70643,35.54565],[107.71172,35.54039],[107.71581,35.53032],[107.71999,35.52833],[107.72392,35.53007],[107.72763,35.54956],[107.7364,35.55874],[107.74084,35.55835],[107.74884,35.56415],[107.75754,35.56502],[107.76978,35.57061],[107.77524,35.57006],[107.78725,35.57234],[107.79207,35.57716],[107.80007,35.57841],[107.81481,35.58375],[107.81937,35.58417],[107.82395,35.58912],[107.83434,35.58858],[107.84163,35.5902],[107.84508,35.58802],[107.84828,35.59501],[107.844,35.60121],[107.84534,35.60318],[107.8641,35.60834],[107.87043,35.60909],[107.86678,35.62064],[107.8654,35.63252],[107.86648,35.63951],[107.86413,35.64739],[107.86533,35.64944],[107.87736,35.65538],[107.87732,35.66096],[107.88282,35.67783],[107.88714,35.69387],[107.88218,35.70867],[107.87576,35.70898],[107.87414,35.71289],[107.86815,35.70898],[107.86363,35.71598],[107.85207,35.71793],[107.85376,35.72341],[107.8511,35.72381],[107.84831,35.73058],[107.84379,35.72846],[107.84123,35.73172],[107.84229,35.73731],[107.8394,35.73615],[107.84097,35.74111],[107.83523,35.74188],[107.8331,35.73818],[107.829,35.74073],[107.82851,35.74522],[107.82376,35.74798],[107.81328,35.75779],[107.80409,35.75449],[107.79108,35.76014],[107.78714,35.763],[107.78652,35.77119],[107.77616,35.78214],[107.76819,35.78175],[107.7605,35.78422],[107.74623,35.78463],[107.74099,35.78114],[107.74129,35.77896],[107.73436,35.7799],[107.73165,35.77667],[107.72745,35.77823],[107.7206,35.77695],[107.71228,35.7804],[107.71122,35.78268],[107.69731,35.79517],[107.69068,35.80372],[107.6923,35.80569],[107.68781,35.80885],[107.6824,35.82997],[107.6785,35.83503],[107.67601,35.83494],[107.66785,35.85054],[107.65391,35.85695],[107.63153,35.86263],[107.61223,35.85745],[107.60546,35.86174],[107.59793,35.86186],[107.59159,35.85564],[107.5901,35.84803],[107.58016,35.83929],[107.57308,35.83571],[107.55945,35.83744],[107.54915,35.83361],[107.53639,35.83362],[107.53074,35.83043],[107.52242,35.82917],[107.51911,35.82671],[107.51328,35.82721],[107.50032,35.82546],[107.4806,35.81569],[107.47225,35.8155],[107.47089,35.81197],[107.47051,35.81062],[107.47743,35.80282],[107.47416,35.79814],[107.47458,35.79137],[107.47987,35.78455],[107.4838,35.77287],[107.48612,35.77077],[107.48765,35.75876],[107.49508,35.75064],[107.50143,35.74628],[107.50538,35.73103],[107.50272,35.72746],[107.50141,35.71662],[107.50347,35.71162],[107.5031,35.70415],[107.50782,35.69688],[107.50611,35.68972],[107.50651,35.68075],[107.50876,35.67799],[107.50183,35.67324],[107.50611,35.67214],[107.51391,35.65693],[107.52007,35.65662],[107.52365,35.65347],[107.52672,35.6439],[107.52473,35.6416],[107.52456,35.62999],[107.52839,35.62758],[107.52623,35.6223],[107.5346,35.6201],[107.53615,35.60735],[107.54196,35.60569],[107.54791,35.59756],[107.55073,35.58819],[107.55658,35.57843],[107.55625,35.57501],[107.56044,35.5709],[107.55715,35.5661],[107.55693,35.56084],[107.56337,35.56106],[107.56561,35.55889],[107.5637,35.55476],[107.57083,35.55033],[107.56711,35.54401],[107.56728,35.54086],[107.57696,35.53237],[107.57913,35.52228],[107.58651,35.52125],[107.59246,35.51125],[107.5965,35.507],[107.60579,35.49297],[107.60593,35.48974],[107.60207,35.48744]]]]}},{"type":"Feature","properties":{"name":"庆城县","adcode":"qc","cp":[107.88566,36.0135]},"geometry":{"type":"MultiPolygon","coordinates":[[[[108.08431,36.14687],[108.06986,36.14372],[108.06097,36.14623],[108.06052,36.15845],[108.05831,36.15903],[108.0443,36.15467],[108.0369,36.15091],[108.02606,36.13651],[108.02025,36.13152],[108.01066,36.13612],[108.00415,36.14228],[108.00013,36.15489],[107.99914,36.16129],[107.99601,36.16548],[107.9892,36.16737],[107.98374,36.17794],[107.98139,36.18021],[107.9742,36.17227],[107.96665,36.17135],[107.95875,36.17854],[107.95071,36.18767],[107.94954,36.19102],[107.94502,36.191],[107.93214,36.1993],[107.92483,36.19277],[107.92485,36.18655],[107.91159,36.18554],[107.89826,36.19426],[107.8922,36.20107],[107.89041,36.21401],[107.8863,36.22856],[107.88145,36.23304],[107.87642,36.23394],[107.87233,36.23155],[107.86765,36.2372],[107.86138,36.239],[107.85421,36.23613],[107.84979,36.24107],[107.84396,36.2441],[107.84424,36.25234],[107.84008,36.25609],[107.82954,36.24895],[107.82726,36.24364],[107.83114,36.23977],[107.833,36.23038],[107.82992,36.22756],[107.8338,36.21896],[107.8319,36.21447],[107.83871,36.21355],[107.84936,36.21594],[107.85338,36.21481],[107.84885,36.20475],[107.84342,36.20149],[107.83284,36.19884],[107.83063,36.19687],[107.82002,36.1972],[107.81462,36.19535],[107.80843,36.19898],[107.80187,36.19923],[107.80272,36.19175],[107.79884,36.1916],[107.79952,36.18828],[107.79522,36.18851],[107.79536,36.19154],[107.78939,36.19248],[107.78528,36.19069],[107.78688,36.18767],[107.78533,36.1809],[107.79031,36.17562],[107.78702,36.17301],[107.78006,36.17825],[107.77891,36.1823],[107.77298,36.17919],[107.77221,36.17547],[107.76261,36.17938],[107.76019,36.17829],[107.76344,36.16962],[107.75979,36.17054],[107.75655,36.16674],[107.74853,36.16609],[107.74567,36.17384],[107.74635,36.18141],[107.74188,36.19029],[107.73607,36.19639],[107.73274,36.20529],[107.73791,36.21316],[107.74068,36.21483],[107.74385,36.22384],[107.74263,36.22725],[107.73358,36.23812],[107.729,36.24056],[107.72848,36.24973],[107.72425,36.26044],[107.72385,36.26456],[107.70725,36.27138],[107.69766,36.26983],[107.68854,36.27148],[107.68452,36.27416],[107.68125,36.28006],[107.6674,36.28852],[107.65466,36.28782],[107.6449,36.28257],[107.63256,36.27797],[107.62245,36.27619],[107.62046,36.28127],[107.61284,36.28619],[107.60668,36.28684],[107.60487,36.28276],[107.60148,36.28795],[107.59384,36.28653],[107.58705,36.28866],[107.57631,36.28692],[107.5626,36.28678],[107.56072,36.28046],[107.55573,36.27313],[107.54635,36.27372],[107.54252,36.26755],[107.53338,36.26527],[107.52562,36.25971],[107.5193,36.26357],[107.51212,36.26401],[107.50674,36.26857],[107.50406,36.26542],[107.49268,36.26376],[107.48772,36.25746],[107.48102,36.2604],[107.47877,36.25734],[107.47468,36.2604],[107.47065,36.26014],[107.47098,36.24845],[107.46856,36.24255],[107.45996,36.23912],[107.45994,36.23076],[107.44929,36.23078],[107.4403,36.22936],[107.43299,36.22241],[107.41882,36.22819],[107.41306,36.22794],[107.41428,36.23709],[107.40664,36.23607],[107.40003,36.24385],[107.39559,36.24099],[107.39289,36.2308],[107.37989,36.23047],[107.375,36.22461],[107.36263,36.22256],[107.35927,36.22369],[107.36167,36.23295],[107.35877,36.23494],[107.34921,36.23314],[107.33574,36.22871],[107.33082,36.22285],[107.3288,36.20559],[107.32478,36.18897],[107.3237,36.17884],[107.32093,36.16776],[107.32114,36.15124],[107.32647,36.14403],[107.3363,36.13758],[107.33792,36.13253],[107.33132,36.12449],[107.32586,36.11589],[107.32528,36.10701],[107.32212,36.09639],[107.32558,36.08952],[107.33103,36.0726],[107.33103,36.06745],[107.3186,36.06052],[107.3134,36.05512],[107.30844,36.04169],[107.29887,36.0314],[107.29645,36.01802],[107.29384,36.01176],[107.30066,36.00691],[107.30774,36.00678],[107.3064,36.00205],[107.31018,35.99284],[107.31587,35.98881],[107.31928,35.98408],[107.32967,35.97758],[107.33425,35.97292],[107.34594,35.96562],[107.35546,35.96477],[107.36028,35.9686],[107.36719,35.96602],[107.38522,35.96787],[107.39282,35.95983],[107.39098,35.95689],[107.39604,35.95087],[107.39484,35.94413],[107.3966,35.94065],[107.40283,35.94154],[107.40457,35.93856],[107.39921,35.92613],[107.40229,35.91751],[107.40692,35.91166],[107.41484,35.91227],[107.42521,35.907],[107.42881,35.90281],[107.4356,35.90175],[107.44936,35.88925],[107.44689,35.8805],[107.44929,35.87603],[107.45803,35.8732],[107.46464,35.87389],[107.46492,35.86827],[107.46182,35.86036],[107.46276,35.84185],[107.4617,35.83865],[107.46821,35.83091],[107.47089,35.81197],[107.47225,35.8155],[107.4806,35.81569],[107.50032,35.82546],[107.51328,35.82721],[107.51911,35.82671],[107.52242,35.82917],[107.53074,35.83043],[107.53639,35.83362],[107.54915,35.83361],[107.55945,35.83744],[107.57308,35.83571],[107.58016,35.83929],[107.5901,35.84803],[107.59159,35.85564],[107.59793,35.86186],[107.60546,35.86174],[107.61223,35.85745],[107.63153,35.86263],[107.65391,35.85695],[107.66785,35.85054],[107.67601,35.83494],[107.6785,35.83503],[107.6824,35.82997],[107.68781,35.80885],[107.6923,35.80569],[107.69068,35.80372],[107.69731,35.79517],[107.71122,35.78268],[107.71228,35.7804],[107.7206,35.77695],[107.72745,35.77823],[107.73165,35.77667],[107.73436,35.7799],[107.74129,35.77896],[107.74099,35.78114],[107.74623,35.78463],[107.7605,35.78422],[107.76819,35.78175],[107.77616,35.78214],[107.78652,35.77119],[107.78714,35.763],[107.79108,35.76014],[107.80409,35.75449],[107.81328,35.75779],[107.82376,35.74798],[107.82851,35.74522],[107.829,35.74073],[107.8331,35.73818],[107.83523,35.74188],[107.84097,35.74111],[107.8394,35.73615],[107.84229,35.73731],[107.84123,35.73172],[107.84379,35.72846],[107.84831,35.73058],[107.8511,35.72381],[107.85376,35.72341],[107.85207,35.71793],[107.86363,35.71598],[107.86815,35.70898],[107.87414,35.71289],[107.87158,35.7203],[107.86406,35.7317],[107.8607,35.74298],[107.85369,35.75758],[107.85002,35.7629],[107.84781,35.7726],[107.8503,35.77616],[107.86413,35.78019],[107.8591,35.78823],[107.85381,35.7901],[107.84845,35.79841],[107.85329,35.80305],[107.85247,35.80964],[107.85787,35.81118],[107.86366,35.82014],[107.87146,35.82611],[107.8732,35.82941],[107.86608,35.83938],[107.86911,35.84358],[107.87757,35.84447],[107.88583,35.84826],[107.89159,35.85789],[107.89925,35.86419],[107.9068,35.87638],[107.91545,35.87984],[107.92215,35.87976],[107.93411,35.87355],[107.94013,35.87162],[107.94862,35.8717],[107.95682,35.87345],[107.96388,35.87137],[107.96665,35.87917],[107.96096,35.8841],[107.95748,35.89093],[107.95666,35.90009],[107.95318,35.90219],[107.95734,35.90598],[107.95776,35.91181],[107.9553,35.91857],[107.95645,35.92193],[107.9532,35.93124],[107.95473,35.93548],[107.96456,35.93213],[107.97756,35.93942],[107.97732,35.94638],[107.98445,35.95044],[107.98151,35.95833],[107.9884,35.96439],[107.99192,35.96475],[107.99176,35.97066],[107.99691,35.96687],[108.00069,35.96843],[108.00789,35.98333],[108.01136,35.99607],[108.0254,36.00501],[108.02895,36.01012],[108.03184,36.02146],[108.03027,36.02638],[108.03151,36.03482],[108.03485,36.03741],[108.05175,36.04277],[108.06725,36.04496],[108.07209,36.04861],[108.07345,36.05499],[108.06908,36.06419],[108.06574,36.06826],[108.05558,36.0727],[108.04623,36.08007],[108.04581,36.08539],[108.04802,36.09148],[108.05192,36.09405],[108.06579,36.09011],[108.08678,36.08648],[108.09489,36.08858],[108.09513,36.09478],[108.08568,36.10426],[108.08723,36.1129],[108.09047,36.11111],[108.10105,36.11539],[108.09705,36.12227],[108.08953,36.13073],[108.08427,36.13929],[108.08431,36.14687]]]]}},{"type":"Feature","properties":{"name":"环县","adcode":"hj","cp":[107.30875,36.56932]},"geometry":{"type":"MultiPolygon","coordinates":[[[[106.83398,36.22921],[106.82947,36.23576],[106.83417,36.23686],[106.83824,36.2349],[106.83838,36.2431],[106.84423,36.24674],[106.84578,36.24274],[106.84997,36.24266],[106.85053,36.23965],[106.86026,36.24094],[106.8605,36.24613],[106.86753,36.24561],[106.8857,36.23256],[106.8901,36.22653],[106.89372,36.23392],[106.89621,36.23157],[106.89315,36.22844],[106.89054,36.22104],[106.89254,36.21811],[106.8996,36.21731],[106.9014,36.2189],[106.90303,36.22944],[106.91027,36.23228],[106.91368,36.22798],[106.91154,36.2189],[106.92541,36.2183],[106.93293,36.21428],[106.93399,36.20649],[106.93695,36.20337],[106.94614,36.20563],[106.94386,36.2095],[106.94358,36.21886],[106.94161,36.22206],[106.94619,36.23143],[106.95298,36.23107],[106.95555,36.23377],[106.95261,36.2376],[106.94791,36.24301],[106.95049,36.24801],[106.95355,36.24605],[106.96147,36.25132],[106.9614,36.26],[106.96432,36.26196],[106.9618,36.26949],[106.96239,36.27598],[106.97071,36.26973],[106.9772,36.26209],[106.98211,36.26039],[106.98947,36.26671],[106.99121,36.255],[107.00273,36.25454],[107.00278,36.24636],[107.00659,36.24027],[107.00433,36.23726],[107.00571,36.23086],[107.00602,36.22704],[107.01519,36.22869],[107.01239,36.21767],[107.00715,36.21652],[107.00753,36.21286],[107.01416,36.2101],[107.02328,36.20975],[107.02967,36.20318],[107.02833,36.19305],[107.01505,36.19986],[107.01517,36.19116],[107.00661,36.18502],[107.00428,36.18789],[107.00252,36.18262],[106.99967,36.15556],[107.00205,36.1361],[107.01277,36.12996],[107.01775,36.12875],[107.02763,36.12221],[107.02619,36.13106],[107.03376,36.13288],[107.03973,36.13226],[107.03823,36.12726],[107.04119,36.11716],[107.04375,36.11532],[107.05306,36.1147],[107.05334,36.10712],[107.0636,36.11292],[107.07723,36.11543],[107.07185,36.1096],[107.06381,36.10444],[107.06609,36.10023],[107.06329,36.09628],[107.06853,36.09382],[107.07058,36.08994],[107.07596,36.09284],[107.07728,36.09616],[107.08656,36.09232],[107.09799,36.09695],[107.10612,36.0985],[107.11837,36.09533],[107.12648,36.08885],[107.14346,36.08693],[107.15843,36.09411],[107.16666,36.10048],[107.17453,36.1011],[107.18138,36.09825],[107.19261,36.09067],[107.19362,36.08564],[107.20002,36.0798],[107.21415,36.07871],[107.22673,36.08086],[107.22524,36.07508],[107.22969,36.06569],[107.23342,36.06962],[107.23368,36.064],[107.23766,36.06114],[107.2425,36.06523],[107.24365,36.05941],[107.24241,36.0548],[107.24685,36.05802],[107.24812,36.05305],[107.25357,36.0512],[107.26283,36.05115],[107.26208,36.04809],[107.2669,36.03209],[107.25947,36.02559],[107.26032,36.02152],[107.27358,36.02677],[107.28209,36.01372],[107.28585,36.01372],[107.29008,36.00982],[107.29394,36.01008],[107.30066,36.00691],[107.29384,36.01176],[107.29645,36.01802],[107.29887,36.0314],[107.30844,36.04169],[107.3134,36.05512],[107.3186,36.06052],[107.33103,36.06745],[107.33103,36.0726],[107.32558,36.08952],[107.32212,36.09639],[107.32528,36.10701],[107.32586,36.11589],[107.33132,36.12449],[107.33792,36.13253],[107.3363,36.13758],[107.32647,36.14403],[107.32114,36.15124],[107.32093,36.16776],[107.3237,36.17884],[107.32478,36.18897],[107.3288,36.20559],[107.33082,36.22285],[107.33574,36.22871],[107.34921,36.23314],[107.35877,36.23494],[107.36167,36.23295],[107.35927,36.22369],[107.36263,36.22256],[107.375,36.22461],[107.37989,36.23047],[107.39289,36.2308],[107.39559,36.24099],[107.40003,36.24385],[107.40664,36.23607],[107.41428,36.23709],[107.41306,36.22794],[107.41882,36.22819],[107.43299,36.22241],[107.4403,36.22936],[107.44929,36.23078],[107.45994,36.23076],[107.45996,36.23912],[107.46856,36.24255],[107.47098,36.24845],[107.47065,36.26014],[107.47468,36.2604],[107.47877,36.25734],[107.48102,36.2604],[107.48772,36.25746],[107.49268,36.26376],[107.50406,36.26542],[107.50674,36.26857],[107.51212,36.26401],[107.5193,36.26357],[107.52562,36.25971],[107.53338,36.26527],[107.54252,36.26755],[107.54635,36.27372],[107.55573,36.27313],[107.56072,36.28046],[107.5626,36.28678],[107.57631,36.28692],[107.58705,36.28866],[107.59384,36.28653],[107.60148,36.28795],[107.60487,36.28276],[107.60668,36.28684],[107.61284,36.28619],[107.62046,36.28127],[107.62245,36.27619],[107.63256,36.27797],[107.6449,36.28257],[107.65466,36.28782],[107.6674,36.28852],[107.66865,36.29544],[107.67171,36.29756],[107.68012,36.30957],[107.67822,36.31939],[107.67916,36.33082],[107.6852,36.34066],[107.68901,36.34479],[107.68901,36.34954],[107.6852,36.36],[107.6852,36.3676],[107.67918,36.38376],[107.67664,36.39423],[107.67345,36.40056],[107.67314,36.40786],[107.66872,36.42056],[107.66517,36.42492],[107.66106,36.42144],[107.65158,36.42041],[107.65045,36.43119],[107.65212,36.43639],[107.65652,36.43788],[107.66247,36.43637],[107.66841,36.43874],[107.67396,36.44329],[107.67998,36.43969],[107.68332,36.43547],[107.68844,36.4378],[107.68948,36.44761],[107.6848,36.44787],[107.6832,36.45215],[107.68734,36.45835],[107.69714,36.46154],[107.69442,36.46536],[107.69608,36.4799],[107.70271,36.48049],[107.70323,36.47852],[107.71139,36.47778],[107.7127,36.48196],[107.72086,36.47677],[107.7254,36.4777],[107.73149,36.48265],[107.73342,36.49128],[107.73934,36.49119],[107.74012,36.48703],[107.7487,36.49155],[107.74827,36.49509],[107.74322,36.49379],[107.74477,36.50534],[107.74378,36.51491],[107.74585,36.51686],[107.74444,36.52509],[107.742,36.52734],[107.73671,36.52459],[107.72787,36.52736],[107.72514,36.51967],[107.71649,36.52644],[107.71336,36.52572],[107.70758,36.53036],[107.70417,36.53028],[107.70224,36.53763],[107.70789,36.53847],[107.70894,36.54317],[107.71517,36.54364],[107.71842,36.5478],[107.72246,36.54794],[107.72408,36.55248],[107.72225,36.55725],[107.71618,36.56105],[107.69293,36.5691],[107.68407,36.57078],[107.67351,36.58252],[107.66954,36.59301],[107.66689,36.59641],[107.66404,36.61838],[107.66127,36.62568],[107.65048,36.62547],[107.63647,36.62726],[107.62701,36.62938],[107.62351,36.633],[107.62276,36.6401],[107.62847,36.64986],[107.63677,36.65851],[107.63964,36.66798],[107.64895,36.6817],[107.65292,36.69327],[107.65017,36.70011],[107.64939,36.7079],[107.64495,36.71401],[107.63395,36.7207],[107.62732,36.72287],[107.61949,36.72822],[107.61712,36.7314],[107.61373,36.74121],[107.60999,36.75731],[107.61326,36.75973],[107.61124,36.76569],[107.60517,36.76477],[107.6008,36.76793],[107.59384,36.76586],[107.58073,36.76609],[107.57772,36.77349],[107.56627,36.7563],[107.56852,36.74844],[107.56157,36.74254],[107.55277,36.74637],[107.54983,36.74998],[107.54553,36.77126],[107.54252,36.77766],[107.54057,36.78636],[107.53578,36.79524],[107.52689,36.80888],[107.50305,36.82847],[107.49583,36.83226],[107.48516,36.84513],[107.48361,36.85298],[107.48871,36.85739],[107.52466,36.85357],[107.52851,36.85374],[107.53347,36.86023],[107.53368,36.86722],[107.52089,36.8761],[107.49828,36.89337],[107.48857,36.90492],[107.47794,36.90844],[107.46494,36.90637],[107.44722,36.89942],[107.43671,36.89831],[107.43034,36.90234],[107.41576,36.90367],[107.40149,36.90362],[107.36545,36.9054],[107.35936,36.90827],[107.35668,36.91165],[107.3438,36.9217],[107.33623,36.9259],[107.3328,36.92559],[107.31169,36.91306],[107.30713,36.91361],[107.30604,36.9229],[107.30297,36.92759],[107.29483,36.92943],[107.29934,36.9335],[107.29681,36.93446],[107.30188,36.94176],[107.30407,36.94164],[107.30167,36.94977],[107.30433,36.95182],[107.30019,36.95645],[107.30113,36.95987],[107.29643,36.96399],[107.29845,36.96944],[107.29467,36.9723],[107.29147,36.97815],[107.28742,36.99235],[107.28891,37.00269],[107.28533,37.01563],[107.28439,37.02479],[107.28073,37.02764],[107.28341,37.03234],[107.28023,37.03852],[107.27553,37.04017],[107.27993,37.04198],[107.2862,37.05559],[107.28176,37.06479],[107.27569,37.07017],[107.27983,37.07514],[107.27671,37.08183],[107.27732,37.08494],[107.2744,37.08983],[107.27464,37.09383],[107.26869,37.09945],[107.24972,37.1063],[107.24198,37.09927],[107.23545,37.09622],[107.23152,37.103],[107.22329,37.11045],[107.21986,37.11128],[107.19969,37.12903],[107.18866,37.13551],[107.18149,37.14356],[107.17014,37.14002],[107.15124,37.1386],[107.14529,37.13649],[107.1341,37.13473],[107.12138,37.12746],[107.11567,37.12744],[107.10695,37.12464],[107.09923,37.11639],[107.09554,37.11569],[107.08682,37.126],[107.07827,37.12915],[107.0695,37.12848],[107.06181,37.12418],[107.05248,37.12822],[107.04923,37.13092],[107.04519,37.12994],[107.0359,37.13852],[107.03056,37.14079],[107.02582,37.13276],[107.03134,37.11655],[107.03066,37.10779],[107.02753,37.11082],[107.01176,37.1159],[107.00611,37.11439],[107.00207,37.11852],[106.99469,37.1217],[106.98907,37.11827],[107.00029,37.10899],[106.9981,37.10654],[106.98477,37.10751],[106.9737,37.11107],[106.96093,37.11389],[106.95952,37.11988],[106.95244,37.12877],[106.94245,37.13579],[106.93688,37.1378],[106.92995,37.14343],[106.92249,37.14718],[106.91739,37.14684],[106.90568,37.1514],[106.89868,37.14879],[106.89927,37.14515],[106.8913,37.14123],[106.89292,37.13816],[106.90166,37.13346],[106.91342,37.13244],[106.91622,37.12289],[106.90757,37.12267],[106.90707,37.11513],[106.91184,37.11026],[106.90195,37.10919],[106.89525,37.1044],[106.89522,37.09858],[106.89219,37.09794],[106.87094,37.11585],[106.85883,37.11371],[106.85154,37.11621],[106.84068,37.12575],[106.83471,37.12683],[106.8269,37.13185],[106.81851,37.14187],[106.81254,37.14498],[106.80325,37.14519],[106.79211,37.15178],[106.79049,37.15509],[106.78073,37.15865],[106.7758,37.15659],[106.78189,37.15129],[106.77859,37.14738],[106.77605,37.15221],[106.77236,37.15047],[106.77027,37.14168],[106.76705,37.14093],[106.76719,37.13225],[106.77323,37.12299],[106.77156,37.11852],[106.76545,37.11082],[106.75988,37.10719],[106.75661,37.10218],[106.75816,37.09923],[106.76482,37.09542],[106.76176,37.09002],[106.76096,37.08103],[106.75255,37.08681],[106.749,37.09387],[106.74876,37.10031],[106.73661,37.1009],[106.7371,37.10611],[106.73409,37.10444],[106.7269,37.10901],[106.72661,37.11532],[106.72847,37.12143],[106.71399,37.11977],[106.70877,37.12126],[106.69833,37.11838],[106.69067,37.12447],[106.68775,37.12994],[106.68072,37.12314],[106.67647,37.11424],[106.67297,37.11145],[106.66841,37.11209],[106.66432,37.12473],[106.66081,37.12608],[106.64802,37.12231],[106.6402,37.11899],[106.63589,37.12858],[106.63018,37.12805],[106.62421,37.13231],[106.61692,37.13515],[106.60648,37.12951],[106.60552,37.12672],[106.60973,37.12187],[106.61281,37.11158],[106.61718,37.1051],[106.6208,37.09576],[106.62524,37.09123],[106.62844,37.08492],[106.63446,37.08338],[106.64095,37.07464],[106.64551,37.06505],[106.64391,37.05923],[106.64692,37.05269],[106.64748,37.04412],[106.65101,37.04025],[106.65183,37.03392],[106.65797,37.02963],[106.65806,37.02403],[106.66676,37.01677],[106.65733,37.00772],[106.64878,37.01219],[106.64158,37.01202],[106.64654,36.99834],[106.64306,36.99341],[106.64118,36.9858],[106.64306,36.9813],[106.63949,36.97377],[106.64316,36.96312],[106.6362,36.96295],[106.62294,36.95932],[106.62104,36.96126],[106.60684,36.96222],[106.59541,36.96904],[106.59054,36.96296],[106.58993,36.95573],[106.59221,36.95197],[106.59301,36.94445],[106.59562,36.94109],[106.59113,36.94035],[106.58377,36.93562],[106.57992,36.9348],[106.57482,36.93744],[106.56849,36.94616],[106.57505,36.94637],[106.57693,36.94434],[106.58046,36.94741],[106.57023,36.95725],[106.57077,36.96023],[106.56374,36.96274],[106.55041,36.97363],[106.5459,36.98299],[106.54233,36.98523],[106.53889,36.98105],[106.54165,36.97029],[106.55521,36.95273],[106.55093,36.94815],[106.54914,36.94261],[106.55161,36.93896],[106.55949,36.93703],[106.56337,36.93224],[106.57164,36.93051],[106.57921,36.93086],[106.58906,36.92157],[106.60199,36.91811],[106.60898,36.90969],[106.61029,36.90434],[106.60482,36.89909],[106.60747,36.89246],[106.60143,36.89581],[106.60058,36.8914],[106.61036,36.88005],[106.61711,36.88488],[106.61805,36.88847],[106.62703,36.89248],[106.63274,36.88896],[106.64006,36.88155],[106.63545,36.88142],[106.63093,36.87796],[106.63921,36.86916],[106.63733,36.86677],[106.63185,36.8695],[106.6334,36.86631],[106.62691,36.86203],[106.62814,36.85886],[106.64184,36.85359],[106.64292,36.84722],[106.64067,36.83401],[106.63749,36.83114],[106.6457,36.83045],[106.65042,36.82437],[106.65752,36.8206],[106.65571,36.81613],[106.65802,36.81225],[106.6566,36.80919],[106.65115,36.80736],[106.64652,36.80934],[106.64704,36.80584],[106.64172,36.80209],[106.64518,36.79789],[106.64422,36.79159],[106.63808,36.787],[106.63709,36.7812],[106.63954,36.77143],[106.63721,36.76626],[106.63733,36.76062],[106.63425,36.75415],[106.62752,36.75231],[106.6319,36.74389],[106.63194,36.73508],[106.63883,36.72814],[106.64255,36.72769],[106.64541,36.72317],[106.63716,36.72502],[106.63303,36.72298],[106.6212,36.73256],[106.6161,36.73776],[106.61135,36.73024],[106.60387,36.74027],[106.60049,36.74113],[106.59551,36.7465],[106.59487,36.74962],[106.58932,36.75008],[106.58671,36.74479],[106.58241,36.74416],[106.57413,36.74679],[106.5712,36.74003],[106.57277,36.73401],[106.56826,36.73237],[106.55385,36.73786],[106.55091,36.73197],[106.54183,36.73138],[106.54085,36.7267],[106.53128,36.72929],[106.53161,36.72552],[106.5246,36.71978],[106.51745,36.71866],[106.51447,36.71521],[106.52272,36.70706],[106.52444,36.70133],[106.53067,36.68993],[106.52333,36.6918],[106.51901,36.68749],[106.51358,36.69251],[106.50469,36.6918],[106.49105,36.68574],[106.4912,36.67515],[106.49432,36.66732],[106.49258,36.65954],[106.49672,36.65373],[106.49858,36.64639],[106.49505,36.64641],[106.49131,36.62877],[106.48318,36.6273],[106.46853,36.62044],[106.45925,36.62101],[106.45638,36.62318],[106.44469,36.62494],[106.44702,36.61521],[106.44491,36.61027],[106.44429,36.60085],[106.4482,36.59635],[106.45391,36.5961],[106.45925,36.59267],[106.46096,36.58784],[106.46581,36.58588],[106.46566,36.58322],[106.47166,36.58132],[106.45635,36.57777],[106.44977,36.57763],[106.45915,36.56868],[106.45593,36.55992],[106.44782,36.55977],[106.44488,36.55723],[106.43884,36.55979],[106.43028,36.55928],[106.41836,36.56271],[106.41747,36.56477],[106.40741,36.57263],[106.39622,36.5774],[106.39754,36.57437],[106.39349,36.56412],[106.39532,36.55968],[106.39206,36.55651],[106.38376,36.56361],[106.38216,36.56296],[106.37753,36.56958],[106.36429,36.57763],[106.36229,36.57107],[106.37146,36.55769],[106.37179,36.54891],[106.38411,36.5455],[106.39502,36.54859],[106.40156,36.54633],[106.40684,36.53956],[106.40689,36.53687],[106.41486,36.53301],[106.41832,36.52784],[106.41091,36.51938],[106.42093,36.5146],[106.4273,36.51527],[106.43329,36.51808],[106.44187,36.5084],[106.45386,36.49788],[106.45805,36.49726],[106.46277,36.49956],[106.46679,36.49562],[106.469,36.49709],[106.47707,36.49463],[106.4781,36.48752],[106.48374,36.48093],[106.49101,36.48244],[106.49021,36.48559],[106.49237,36.49346],[106.49477,36.49444],[106.5026,36.48529],[106.51811,36.48091],[106.52159,36.47721],[106.52004,36.47189],[106.52324,36.46847],[106.51976,36.45632],[106.51583,36.45122],[106.51028,36.44944],[106.5034,36.44172],[106.50046,36.43295],[106.50469,36.43218],[106.50986,36.42712],[106.51045,36.4231],[106.50587,36.41951],[106.50464,36.41465],[106.49902,36.41723],[106.49839,36.42285],[106.4927,36.42295],[106.49286,36.41247],[106.4916,36.40539],[106.48793,36.40289],[106.49244,36.39926],[106.50467,36.40138],[106.50866,36.39964],[106.51414,36.39145],[106.51854,36.39474],[106.52698,36.39017],[106.52498,36.38275],[106.53102,36.37898],[106.52996,36.37288],[106.52512,36.37273],[106.51033,36.37885],[106.50652,36.37738],[106.5076,36.36706],[106.50636,36.32823],[106.49959,36.32261],[106.50243,36.31418],[106.49752,36.31353],[106.50175,36.30888],[106.50979,36.30358],[106.51003,36.29335],[106.512,36.28895],[106.5104,36.28611],[106.50577,36.29274],[106.49959,36.29619],[106.49712,36.30298],[106.48762,36.31196],[106.48671,36.31556],[106.48022,36.31608],[106.47081,36.31286],[106.47074,36.30633],[106.47836,36.29823],[106.48739,36.28217],[106.49181,36.28096],[106.49813,36.27562],[106.50471,36.26609],[106.50993,36.27169],[106.51889,36.27048],[106.52463,36.26454],[106.53502,36.26056],[106.53929,36.25439],[106.54221,36.25454],[106.54567,36.25937],[106.55157,36.2574],[106.55625,36.26064],[106.55972,36.26659],[106.56151,36.27406],[106.55904,36.27822],[106.55759,36.28592],[106.55961,36.29224],[106.57799,36.28611],[106.58192,36.28906],[106.58671,36.27782],[106.59071,36.27726],[106.59431,36.27039],[106.59652,36.27496],[106.59931,36.2742],[106.5979,36.28247],[106.60007,36.29239],[106.60625,36.29517],[106.60909,36.29034],[106.60963,36.27571],[106.61236,36.27253],[106.61582,36.27707],[106.61906,36.27659],[106.62144,36.27127],[106.63484,36.26541],[106.63803,36.26596],[106.64043,36.28029],[106.64377,36.28487],[106.64866,36.2824],[106.64551,36.27945],[106.64671,36.26776],[106.64572,36.26276],[106.64826,36.25914],[106.65376,36.25701],[106.65677,36.26646],[106.66345,36.26284],[106.67062,36.26864],[106.68023,36.27121],[106.68343,36.2736],[106.68787,36.27004],[106.69069,36.26017],[106.69775,36.25125],[106.6988,36.24307],[106.70325,36.23906],[106.70868,36.24015],[106.71065,36.23576],[106.71655,36.23199],[106.7193,36.23695],[106.72967,36.23214],[106.73609,36.2373],[106.74096,36.22886],[106.74483,36.2303],[106.74958,36.22344],[106.76294,36.21516],[106.76752,36.2169],[106.7722,36.21249],[106.77368,36.22158],[106.77605,36.2234],[106.78391,36.21773],[106.78663,36.22539],[106.78913,36.22626],[106.79543,36.22308],[106.79945,36.21616],[106.80845,36.21117],[106.81061,36.21834],[106.81795,36.22218],[106.82162,36.22097],[106.82735,36.21524],[106.83111,36.22737],[106.83398,36.22921]]],[[[106.97593,36.23187],[106.97616,36.2391],[106.98127,36.23975],[106.98204,36.25109],[106.97934,36.25117],[106.97776,36.24515],[106.97276,36.24793],[106.96596,36.24782],[106.96316,36.23952],[106.96387,36.23553],[106.95839,36.22804],[106.95994,36.22026],[106.96333,36.22225],[106.97019,36.21936],[106.9709,36.22534],[106.97572,36.2289],[106.97593,36.23187]]]]}},{"type":"Feature","properties":{"name":"华池县","adcode":"hn","cp":[107.98629,36.4573]},"geometry":{"type":"MultiPolygon","coordinates":[[[[108.56261,36.4386],[108.55377,36.4481],[108.54293,36.45082],[108.53303,36.45464],[108.5276,36.46179],[108.51065,36.47445],[108.50764,36.46916],[108.50973,36.45644],[108.51385,36.45013],[108.51467,36.44556],[108.50853,36.436],[108.4968,36.42272],[108.49426,36.42276],[108.48554,36.42945],[108.4763,36.42752],[108.47153,36.42306],[108.46055,36.42308],[108.45566,36.43067],[108.43197,36.43602],[108.41897,36.4486],[108.41114,36.44871],[108.40749,36.44636],[108.40143,36.44701],[108.40256,36.45347],[108.40803,36.45963],[108.40571,36.47772],[108.39887,36.48013],[108.39929,36.48492],[108.39362,36.49279],[108.39163,36.50544],[108.38363,36.50584],[108.37672,36.51468],[108.36929,36.51682],[108.36544,36.51967],[108.36706,36.53375],[108.3645,36.54057],[108.35963,36.54727],[108.34839,36.55617],[108.34063,36.55888],[108.30643,36.56118],[108.29763,36.55767],[108.29392,36.55345],[108.28741,36.5533],[108.28134,36.56218],[108.27572,36.56361],[108.27022,36.56744],[108.26359,36.5641],[108.26244,36.54933],[108.25917,36.54884],[108.24784,36.56132],[108.24813,36.56638],[108.24549,36.57101],[108.23886,36.57187],[108.22337,36.57029],[108.21662,36.57135],[108.21058,36.57744],[108.20727,36.59148],[108.20477,36.59663],[108.20468,36.60636],[108.20905,36.60989],[108.21815,36.62265],[108.2229,36.63094],[108.21138,36.63516],[108.20419,36.63419],[108.19784,36.62993],[108.19072,36.61605],[108.1823,36.59007],[108.17539,36.57729],[108.16587,36.56531],[108.15228,36.56115],[108.14146,36.56262],[108.13911,36.57674],[108.13784,36.57817],[108.1263,36.58111],[108.11563,36.5866],[108.10566,36.58811],[108.09287,36.58736],[108.09249,36.59847],[108.09494,36.60451],[108.09193,36.60762],[108.08666,36.60856],[108.08422,36.61439],[108.08121,36.61525],[108.0806,36.60903],[108.0766,36.60192],[108.07143,36.60711],[108.06908,36.60674],[108.06572,36.59782],[108.06217,36.59261],[108.05575,36.59681],[108.04618,36.59623],[108.04557,36.5998],[108.04075,36.60648],[108.03831,36.60503],[108.03121,36.60755],[108.03132,36.61693],[108.02187,36.62164],[108.0183,36.62082],[108.01616,36.61664],[108.00777,36.61651],[108.00561,36.62564],[108.0127,36.627],[108.01195,36.63382],[108.0021,36.63739],[108.00238,36.64515],[108.00516,36.64761],[108.01473,36.64406],[108.02319,36.64808],[108.02288,36.65451],[108.02065,36.65849],[108.02563,36.66095],[108.02333,36.6697],[108.01461,36.67423],[108.01492,36.67911],[108.00692,36.68325],[107.99272,36.67656],[107.98597,36.67488],[107.98727,36.66865],[107.98442,36.66695],[107.98807,36.66137],[107.98539,36.65192],[107.98078,36.6534],[107.97697,36.65863],[107.97728,36.66402],[107.97443,36.6661],[107.96498,36.66097],[107.96258,36.66472],[107.95732,36.66063],[107.9544,36.664],[107.94646,36.6542],[107.94448,36.65914],[107.93931,36.65542],[107.93745,36.65824],[107.94093,36.66924],[107.93879,36.67416],[107.94171,36.68075],[107.94096,36.69487],[107.93287,36.71098],[107.93066,36.70973],[107.92415,36.71199],[107.9236,36.71717],[107.91423,36.72104],[107.91399,36.73064],[107.90905,36.73806],[107.90553,36.7406],[107.90668,36.75236],[107.8984,36.74722],[107.89457,36.75002],[107.88188,36.74715],[107.87755,36.75588],[107.87233,36.75733],[107.86671,36.75602],[107.8666,36.76673],[107.85616,36.77085],[107.85044,36.76961],[107.8456,36.77212],[107.84175,36.78028],[107.83714,36.78027],[107.83342,36.78472],[107.8267,36.78546],[107.81998,36.77684],[107.81295,36.7799],[107.80524,36.77848],[107.79842,36.78181],[107.79369,36.78767],[107.78996,36.78521],[107.77872,36.78896],[107.77524,36.79811],[107.7707,36.79817],[107.76821,36.79296],[107.75512,36.80279],[107.75342,36.80631],[107.74592,36.80658],[107.74489,36.8112],[107.72982,36.81259],[107.73008,36.80649],[107.72493,36.80647],[107.72126,36.80222],[107.71583,36.8065],[107.70965,36.8055],[107.70412,36.81269],[107.69246,36.82187],[107.67711,36.82819],[107.67069,36.83292],[107.64032,36.81875],[107.63245,36.8178],[107.63082,36.81396],[107.62937,36.81822],[107.61521,36.82305],[107.60358,36.82583],[107.60113,36.8303],[107.59076,36.83623],[107.57522,36.83728],[107.56824,36.83642],[107.55545,36.82653],[107.5456,36.82659],[107.54008,36.82861],[107.53234,36.845],[107.53178,36.84798],[107.52466,36.85357],[107.48871,36.85739],[107.48361,36.85298],[107.48516,36.84513],[107.49583,36.83226],[107.50305,36.82847],[107.52689,36.80888],[107.53578,36.79524],[107.54057,36.78636],[107.54252,36.77766],[107.54553,36.77126],[107.54983,36.74998],[107.55277,36.74637],[107.56157,36.74254],[107.56852,36.74844],[107.56627,36.7563],[107.57772,36.77349],[107.58073,36.76609],[107.59384,36.76586],[107.6008,36.76793],[107.60517,36.76477],[107.61124,36.76569],[107.61326,36.75973],[107.60999,36.75731],[107.61373,36.74121],[107.61712,36.7314],[107.61949,36.72822],[107.62732,36.72287],[107.63395,36.7207],[107.64495,36.71401],[107.64939,36.7079],[107.65017,36.70011],[107.65292,36.69327],[107.64895,36.6817],[107.63964,36.66798],[107.63677,36.65851],[107.62847,36.64986],[107.62276,36.6401],[107.62351,36.633],[107.62701,36.62938],[107.63647,36.62726],[107.65048,36.62547],[107.66127,36.62568],[107.66404,36.61838],[107.66689,36.59641],[107.66954,36.59301],[107.67351,36.58252],[107.68407,36.57078],[107.69293,36.5691],[107.71618,36.56105],[107.72225,36.55725],[107.72408,36.55248],[107.72246,36.54794],[107.71842,36.5478],[107.71517,36.54364],[107.70894,36.54317],[107.70789,36.53847],[107.70224,36.53763],[107.70417,36.53028],[107.70758,36.53036],[107.71336,36.52572],[107.71649,36.52644],[107.72514,36.51967],[107.72787,36.52736],[107.73671,36.52459],[107.742,36.52734],[107.74444,36.52509],[107.74585,36.51686],[107.74378,36.51491],[107.74477,36.50534],[107.74322,36.49379],[107.74827,36.49509],[107.7487,36.49155],[107.74012,36.48703],[107.73934,36.49119],[107.73342,36.49128],[107.73149,36.48265],[107.7254,36.4777],[107.72086,36.47677],[107.7127,36.48196],[107.71139,36.47778],[107.70323,36.47852],[107.70271,36.48049],[107.69608,36.4799],[107.69442,36.46536],[107.69714,36.46154],[107.68734,36.45835],[107.6832,36.45215],[107.6848,36.44787],[107.68948,36.44761],[107.68844,36.4378],[107.68332,36.43547],[107.67998,36.43969],[107.67396,36.44329],[107.66841,36.43874],[107.66247,36.43637],[107.65652,36.43788],[107.65212,36.43639],[107.65045,36.43119],[107.65158,36.42041],[107.66106,36.42144],[107.66517,36.42492],[107.66872,36.42056],[107.67314,36.40786],[107.67345,36.40056],[107.67664,36.39423],[107.67918,36.38376],[107.6852,36.3676],[107.6852,36.36],[107.68901,36.34954],[107.68901,36.34479],[107.6852,36.34066],[107.67916,36.33082],[107.67822,36.31939],[107.68012,36.30957],[107.67171,36.29756],[107.66865,36.29544],[107.6674,36.28852],[107.68125,36.28006],[107.68452,36.27416],[107.68854,36.27148],[107.69766,36.26983],[107.70725,36.27138],[107.72385,36.26456],[107.72425,36.26044],[107.72848,36.24973],[107.729,36.24056],[107.73358,36.23812],[107.74263,36.22725],[107.74385,36.22384],[107.74068,36.21483],[107.73791,36.21316],[107.73274,36.20529],[107.73607,36.19639],[107.74188,36.19029],[107.74635,36.18141],[107.74567,36.17384],[107.74853,36.16609],[107.75655,36.16674],[107.75979,36.17054],[107.76344,36.16962],[107.76019,36.17829],[107.76261,36.17938],[107.77221,36.17547],[107.77298,36.17919],[107.77891,36.1823],[107.78006,36.17825],[107.78702,36.17301],[107.79031,36.17562],[107.78533,36.1809],[107.78688,36.18767],[107.78528,36.19069],[107.78939,36.19248],[107.79536,36.19154],[107.79522,36.18851],[107.79952,36.18828],[107.79884,36.1916],[107.80272,36.19175],[107.80187,36.19923],[107.80843,36.19898],[107.81462,36.19535],[107.82002,36.1972],[107.83063,36.19687],[107.83284,36.19884],[107.84342,36.20149],[107.84885,36.20475],[107.85338,36.21481],[107.84936,36.21594],[107.83871,36.21355],[107.8319,36.21447],[107.8338,36.21896],[107.82992,36.22756],[107.833,36.23038],[107.83114,36.23977],[107.82726,36.24364],[107.82954,36.24895],[107.84008,36.25609],[107.84424,36.25234],[107.84396,36.2441],[107.84979,36.24107],[107.85421,36.23613],[107.86138,36.239],[107.86765,36.2372],[107.87233,36.23155],[107.87642,36.23394],[107.88145,36.23304],[107.8863,36.22856],[107.89041,36.21401],[107.8922,36.20107],[107.89826,36.19426],[107.91159,36.18554],[107.92485,36.18655],[107.92483,36.19277],[107.93214,36.1993],[107.94502,36.191],[107.94954,36.19102],[107.95071,36.18767],[107.95875,36.17854],[107.96665,36.17135],[107.9742,36.17227],[107.98139,36.18021],[107.98374,36.17794],[107.9892,36.16737],[107.99601,36.16548],[107.99914,36.16129],[108.00013,36.15489],[108.00415,36.14228],[108.01066,36.13612],[108.02025,36.13152],[108.02606,36.13651],[108.0369,36.15091],[108.0443,36.15467],[108.05831,36.15903],[108.06052,36.15845],[108.06097,36.14623],[108.06986,36.14372],[108.08431,36.14687],[108.09003,36.1507],[108.11391,36.1584],[108.1303,36.16141],[108.15171,36.16344],[108.15971,36.16781],[108.16185,36.17645],[108.16356,36.19037],[108.16864,36.20389],[108.17529,36.21617],[108.18822,36.22856],[108.19763,36.23262],[108.20247,36.23281],[108.20731,36.22978],[108.21864,36.22961],[108.23195,36.21575],[108.24396,36.21324],[108.25083,36.20711],[108.25616,36.19302],[108.2773,36.17069],[108.2935,36.16039],[108.31144,36.15391],[108.31705,36.14971],[108.32089,36.14466],[108.32307,36.13697],[108.32674,36.1301],[108.33793,36.13132],[108.34748,36.12645],[108.35241,36.12779],[108.36294,36.13779],[108.36908,36.14644],[108.38006,36.15182],[108.38838,36.15297],[108.3959,36.15784],[108.40347,36.17006],[108.40458,36.17967],[108.41154,36.18458],[108.42585,36.19273],[108.42893,36.199],[108.43429,36.21524],[108.43803,36.22239],[108.44431,36.22938],[108.45804,36.23065],[108.48703,36.23835],[108.4921,36.24149],[108.50033,36.25136],[108.50169,36.25726],[108.50219,36.27288],[108.50774,36.2845],[108.51587,36.29],[108.52151,36.29634],[108.52857,36.31223],[108.53346,36.32921],[108.53578,36.34632],[108.53559,36.35392],[108.54175,36.37887],[108.54135,36.3874],[108.55135,36.39761],[108.55936,36.40819],[108.56148,36.41612],[108.56261,36.4386]]]]}},{"type":"Feature","properties":{"name":"合水县","adcode":"hy","cp":[108.01986,35.819]},"geometry":{"type":"MultiPolygon","coordinates":[[[[107.87414,35.71289],[107.87576,35.70898],[107.88218,35.70867],[107.88714,35.69387],[107.89488,35.68671],[107.90767,35.68642],[107.91383,35.68165],[107.91991,35.6799],[107.92299,35.67681],[107.92777,35.68026],[107.93552,35.68175],[107.94006,35.68775],[107.95619,35.68605],[107.97154,35.68266],[107.98052,35.67986],[107.98529,35.67698],[107.99931,35.68364],[108.00363,35.68416],[108.01082,35.68075],[108.0093,35.66349],[108.00883,35.64743],[108.01066,35.64063],[108.01372,35.63663],[108.03074,35.64044],[108.04773,35.64081],[108.11537,35.67306],[108.12148,35.67924],[108.12661,35.68792],[108.13223,35.70761],[108.13709,35.71581],[108.14948,35.7252],[108.15338,35.73085],[108.15576,35.73851],[108.15395,35.75058],[108.15094,35.75413],[108.14325,35.75592],[108.13107,35.76211],[108.12745,35.76745],[108.12698,35.7719],[108.13401,35.78252],[108.14273,35.78979],[108.1511,35.79862],[108.15769,35.80295],[108.17341,35.80249],[108.17623,35.80411],[108.17605,35.81904],[108.18103,35.82413],[108.19081,35.82879],[108.19819,35.82867],[108.21418,35.82424],[108.22222,35.82001],[108.23092,35.81887],[108.23661,35.82187],[108.25189,35.83582],[108.26352,35.8389],[108.27591,35.83434],[108.28696,35.82902],[108.30039,35.82632],[108.31576,35.8244],[108.33487,35.81552],[108.34961,35.81424],[108.36271,35.81995],[108.36844,35.83037],[108.37068,35.84599],[108.36906,35.85277],[108.37404,35.85412],[108.40072,35.85716],[108.41325,35.85991],[108.42454,35.86032],[108.44036,35.85949],[108.45183,35.86057],[108.47052,35.85868],[108.48837,35.86155],[108.49852,35.86623],[108.5016,35.86997],[108.49833,35.87611],[108.50104,35.88502],[108.51439,35.89815],[108.51867,35.90548],[108.53273,35.90864],[108.56303,35.92126],[108.56573,35.93353],[108.56931,35.93965],[108.58073,35.94781],[108.59383,35.95079],[108.61341,35.9494],[108.62063,35.94669],[108.63377,35.94471],[108.65222,35.94825],[108.65653,35.95298],[108.6589,35.96704],[108.65876,35.98419],[108.66177,35.9939],[108.67733,36.00908],[108.68406,36.01447],[108.68861,36.0211],[108.68633,36.0401],[108.68255,36.05505],[108.68382,36.06922],[108.69087,36.08877],[108.70747,36.10977],[108.7062,36.11207],[108.69764,36.11731],[108.70199,36.12703],[108.70888,36.13645],[108.71234,36.13873],[108.70839,36.14997],[108.70282,36.16078],[108.69017,36.18023],[108.68391,36.18818],[108.67364,36.20371],[108.66494,36.2148],[108.66085,36.22331],[108.655,36.23197],[108.64606,36.25414],[108.64651,36.25985],[108.65194,36.27029],[108.65507,36.27401],[108.65102,36.28123],[108.64498,36.29825],[108.64216,36.31118],[108.64409,36.33197],[108.64155,36.3409],[108.64162,36.35914],[108.64566,36.37236],[108.65126,36.38472],[108.64148,36.39394],[108.63701,36.40056],[108.63142,36.39899],[108.6305,36.40151],[108.6336,36.40731],[108.63144,36.41035],[108.62911,36.42077],[108.62239,36.42658],[108.61893,36.4339],[108.60408,36.43088],[108.59357,36.43149],[108.58334,36.43807],[108.57549,36.43944],[108.56261,36.4386],[108.56148,36.41612],[108.55936,36.40819],[108.55135,36.39761],[108.54135,36.3874],[108.54175,36.37887],[108.53559,36.35392],[108.53578,36.34632],[108.53346,36.32921],[108.52857,36.31223],[108.52151,36.29634],[108.51587,36.29],[108.50774,36.2845],[108.50219,36.27288],[108.50169,36.25726],[108.50033,36.25136],[108.4921,36.24149],[108.48703,36.23835],[108.45804,36.23065],[108.44431,36.22938],[108.43803,36.22239],[108.43429,36.21524],[108.42893,36.199],[108.42585,36.19273],[108.41154,36.18458],[108.40458,36.17967],[108.40347,36.17006],[108.3959,36.15784],[108.38838,36.15297],[108.38006,36.15182],[108.36908,36.14644],[108.36294,36.13779],[108.35241,36.12779],[108.34748,36.12645],[108.33793,36.13132],[108.32674,36.1301],[108.32307,36.13697],[108.32089,36.14466],[108.31705,36.14971],[108.31144,36.15391],[108.2935,36.16039],[108.2773,36.17069],[108.25616,36.19302],[108.25083,36.20711],[108.24396,36.21324],[108.23195,36.21575],[108.21864,36.22961],[108.20731,36.22978],[108.20247,36.23281],[108.19763,36.23262],[108.18822,36.22856],[108.17529,36.21617],[108.16864,36.20389],[108.16356,36.19037],[108.16185,36.17645],[108.15971,36.16781],[108.15171,36.16344],[108.1303,36.16141],[108.11391,36.1584],[108.09003,36.1507],[108.08431,36.14687],[108.08427,36.13929],[108.08953,36.13073],[108.09705,36.12227],[108.10105,36.11539],[108.09047,36.11111],[108.08723,36.1129],[108.08568,36.10426],[108.09513,36.09478],[108.09489,36.08858],[108.08678,36.08648],[108.06579,36.09011],[108.05192,36.09405],[108.04802,36.09148],[108.04581,36.08539],[108.04623,36.08007],[108.05558,36.0727],[108.06574,36.06826],[108.06908,36.06419],[108.07345,36.05499],[108.07209,36.04861],[108.06725,36.04496],[108.05175,36.04277],[108.03485,36.03741],[108.03151,36.03482],[108.03027,36.02638],[108.03184,36.02146],[108.02895,36.01012],[108.0254,36.00501],[108.01136,35.99607],[108.00789,35.98333],[108.00069,35.96843],[107.99691,35.96687],[107.99176,35.97066],[107.99192,35.96475],[107.9884,35.96439],[107.98151,35.95833],[107.98445,35.95044],[107.97732,35.94638],[107.97756,35.93942],[107.96456,35.93213],[107.95473,35.93548],[107.9532,35.93124],[107.95645,35.92193],[107.9553,35.91857],[107.95776,35.91181],[107.95734,35.90598],[107.95318,35.90219],[107.95666,35.90009],[107.95748,35.89093],[107.96096,35.8841],[107.96665,35.87917],[107.96388,35.87137],[107.95682,35.87345],[107.94862,35.8717],[107.94013,35.87162],[107.93411,35.87355],[107.92215,35.87976],[107.91545,35.87984],[107.9068,35.87638],[107.89925,35.86419],[107.89159,35.85789],[107.88583,35.84826],[107.87757,35.84447],[107.86911,35.84358],[107.86608,35.83938],[107.8732,35.82941],[107.87146,35.82611],[107.86366,35.82014],[107.85787,35.81118],[107.85247,35.80964],[107.85329,35.80305],[107.84845,35.79841],[107.85381,35.7901],[107.8591,35.78823],[107.86413,35.78019],[107.8503,35.77616],[107.84781,35.7726],[107.85002,35.7629],[107.85369,35.75758],[107.8607,35.74298],[107.86406,35.7317],[107.87158,35.7203],[107.87414,35.71289]]]]}},{"type":"Feature","properties":{"name":"正宁县","adcode":"zq","cp":[108.36107,35.49064]},"geometry":{"type":"MultiPolygon","coordinates":[[[[107.94747,35.26768],[107.95565,35.26704],[107.96035,35.26325],[107.9583,35.25495],[107.95374,35.2513],[107.94977,35.24527],[107.9616,35.24232],[107.96966,35.24154],[107.97913,35.24546],[107.98609,35.24379],[108.01454,35.24927],[108.01672,35.24841],[108.02606,35.25121],[108.03633,35.25192],[108.0412,35.25382],[108.04891,35.2539],[108.05347,35.25786],[108.06003,35.25864],[108.06327,35.26192],[108.06767,35.26213],[108.07634,35.26644],[108.07832,35.27078],[108.09193,35.27732],[108.09367,35.27953],[108.10336,35.27939],[108.1058,35.28108],[108.12393,35.28182],[108.12665,35.28626],[108.13422,35.29091],[108.14142,35.28944],[108.14461,35.28556],[108.14915,35.29107],[108.16521,35.30092],[108.17466,35.30511],[108.18007,35.30189],[108.19111,35.30344],[108.19375,35.30664],[108.22147,35.29685],[108.2257,35.2888],[108.23183,35.28748],[108.23327,35.2844],[108.22838,35.28128],[108.22697,35.27689],[108.24034,35.256],[108.24589,35.25947],[108.25436,35.26149],[108.25694,35.2674],[108.26395,35.26931],[108.26865,35.26876],[108.27394,35.26424],[108.28203,35.26465],[108.28981,35.26834],[108.29806,35.26841],[108.30104,35.2734],[108.31144,35.27914],[108.32072,35.28191],[108.32404,35.28556],[108.33363,35.29016],[108.34536,35.30065],[108.34959,35.3022],[108.35116,35.29764],[108.35829,35.29429],[108.35281,35.28577],[108.36323,35.27957],[108.36746,35.28416],[108.37272,35.28325],[108.3786,35.28674],[108.38062,35.28238],[108.40016,35.28279],[108.40234,35.27809],[108.41187,35.27772],[108.41629,35.27582],[108.42324,35.27707],[108.44908,35.27373],[108.4599,35.27602],[108.47431,35.27691],[108.47891,35.2748],[108.48914,35.2753],[108.49807,35.2816],[108.50705,35.28511],[108.51707,35.28574],[108.52504,35.28897],[108.53726,35.29764],[108.54347,35.30391],[108.54827,35.30509],[108.55417,35.30282],[108.55885,35.29683],[108.56825,35.29091],[108.57965,35.29163],[108.58289,35.29481],[108.5867,35.30517],[108.59679,35.30724],[108.60295,35.31232],[108.60913,35.32434],[108.61538,35.33169],[108.61231,35.33539],[108.61056,35.35516],[108.61376,35.36343],[108.61922,35.37188],[108.62213,35.38069],[108.62086,35.39441],[108.62928,35.40549],[108.63114,35.41864],[108.62721,35.42926],[108.61945,35.44297],[108.61773,35.45484],[108.61743,35.47132],[108.61656,35.47726],[108.60986,35.48734],[108.60596,35.50278],[108.61019,35.51371],[108.62136,35.52626],[108.6257,35.53709],[108.62063,35.54318],[108.62129,35.55089],[108.61849,35.55696],[108.61231,35.5593],[108.60948,35.56328],[108.60119,35.56411],[108.59606,35.56711],[108.58692,35.57754],[108.57986,35.57982],[108.57549,35.58363],[108.56766,35.58546],[108.56538,35.5952],[108.56115,35.59381],[108.5461,35.59474],[108.53983,35.59401],[108.52596,35.59673],[108.5209,35.59567],[108.5043,35.59822],[108.49852,35.59752],[108.48587,35.59907],[108.47428,35.60465],[108.45752,35.59855],[108.43876,35.59586],[108.43126,35.59663],[108.42233,35.59536],[108.41466,35.59248],[108.41121,35.59304],[108.40427,35.58991],[108.40462,35.58017],[108.41194,35.57986],[108.41368,35.57414],[108.40966,35.57101],[108.40773,35.56459],[108.40148,35.55806],[108.38081,35.55452],[108.36713,35.55659],[108.35037,35.55735],[108.34258,35.55348],[108.34049,35.55827],[108.33534,35.55854],[108.33149,35.55568],[108.3155,35.5559],[108.31158,35.54855],[108.32011,35.52641],[108.31741,35.51438],[108.31752,35.50752],[108.32274,35.50473],[108.331,35.50323],[108.33591,35.50065],[108.33819,35.49526],[108.33353,35.48634],[108.30629,35.48512],[108.29249,35.48537],[108.28419,35.48258],[108.27652,35.47846],[108.2564,35.46341],[108.24627,35.45828],[108.2319,35.44731],[108.22849,35.44194],[108.22285,35.4372],[108.19323,35.42349],[108.18554,35.42051],[108.16754,35.41106],[108.15881,35.40576],[108.14755,35.40154],[108.12435,35.39441],[108.10535,35.38765],[108.08866,35.37932],[108.06393,35.37988],[108.05768,35.37918],[108.04842,35.35783],[107.99634,35.30571],[107.98221,35.29592],[107.94286,35.27414],[107.94747,35.26768]]]]}},{"type":"Feature","properties":{"name":"宁县","adcode":"ning","cp":[107.92118,35.50201]},"geometry":{"type":"MultiPolygon","coordinates":[[[[107.67855,35.43455],[107.67982,35.42955],[107.68673,35.42979],[107.6947,35.42574],[107.70057,35.42456],[107.6982,35.4179],[107.69063,35.40723],[107.69049,35.40173],[107.6954,35.39569],[107.69938,35.38647],[107.70772,35.3712],[107.71426,35.36332],[107.72077,35.35894],[107.72077,35.35522],[107.72509,35.35252],[107.73257,35.35537],[107.73682,35.35363],[107.74402,35.34213],[107.74385,35.33717],[107.7372,35.32676],[107.73911,35.31973],[107.74496,35.31498],[107.74893,35.30662],[107.757,35.3061],[107.76358,35.3017],[107.77016,35.30305],[107.77613,35.30119],[107.77933,35.29662],[107.79141,35.29586],[107.7972,35.28579],[107.80806,35.28731],[107.81328,35.28393],[107.81558,35.27996],[107.8204,35.2771],[107.82804,35.27751],[107.83114,35.27276],[107.83822,35.27383],[107.84184,35.27641],[107.84687,35.27293],[107.84652,35.26863],[107.86025,35.2674],[107.8607,35.26256],[107.86554,35.25693],[107.86864,35.25639],[107.87543,35.25986],[107.89814,35.26021],[107.90252,35.26174],[107.90912,35.25856],[107.91296,35.25382],[107.91886,35.25398],[107.92537,35.25815],[107.92911,35.25086],[107.93557,35.25283],[107.93489,35.26459],[107.93903,35.26743],[107.94747,35.26768],[107.94286,35.27414],[107.98221,35.29592],[107.99634,35.30571],[108.04842,35.35783],[108.05768,35.37918],[108.06393,35.37988],[108.08866,35.37932],[108.10535,35.38765],[108.12435,35.39441],[108.14755,35.40154],[108.15881,35.40576],[108.16754,35.41106],[108.18554,35.42051],[108.19323,35.42349],[108.22285,35.4372],[108.22849,35.44194],[108.2319,35.44731],[108.24627,35.45828],[108.2564,35.46341],[108.27652,35.47846],[108.28419,35.48258],[108.29249,35.48537],[108.30629,35.48512],[108.33353,35.48634],[108.33819,35.49526],[108.33591,35.50065],[108.331,35.50323],[108.32274,35.50473],[108.31752,35.50752],[108.31741,35.51438],[108.32011,35.52641],[108.31158,35.54855],[108.3155,35.5559],[108.33149,35.55568],[108.33534,35.55854],[108.34049,35.55827],[108.34258,35.55348],[108.35037,35.55735],[108.36713,35.55659],[108.38081,35.55452],[108.40148,35.55806],[108.40773,35.56459],[108.40966,35.57101],[108.41368,35.57414],[108.41194,35.57986],[108.40462,35.58017],[108.40427,35.58991],[108.41121,35.59304],[108.41466,35.59248],[108.42233,35.59536],[108.43126,35.59663],[108.43876,35.59586],[108.45752,35.59855],[108.47428,35.60465],[108.48587,35.59907],[108.49852,35.59752],[108.5043,35.59822],[108.5209,35.59567],[108.52596,35.59673],[108.53983,35.59401],[108.5461,35.59474],[108.56115,35.59381],[108.56538,35.5952],[108.56049,35.5998],[108.55069,35.59974],[108.53973,35.60562],[108.53729,35.62084],[108.53216,35.62744],[108.52605,35.64588],[108.526,35.65183],[108.52328,35.66114],[108.52751,35.67573],[108.53035,35.6805],[108.52774,35.68661],[108.52165,35.68995],[108.51829,35.6958],[108.51813,35.69979],[108.52295,35.70454],[108.5248,35.71137],[108.51705,35.71602],[108.51568,35.72088],[108.52128,35.72408],[108.52972,35.73621],[108.5299,35.74308],[108.53388,35.74622],[108.52497,35.757],[108.52074,35.76446],[108.51989,35.77081],[108.52483,35.77485],[108.52617,35.78657],[108.52784,35.8242],[108.52447,35.83967],[108.51893,35.84911],[108.5016,35.86997],[108.49852,35.86623],[108.48837,35.86155],[108.47052,35.85868],[108.45183,35.86057],[108.44036,35.85949],[108.42454,35.86032],[108.41325,35.85991],[108.40072,35.85716],[108.37404,35.85412],[108.36906,35.85277],[108.37068,35.84599],[108.36844,35.83037],[108.36271,35.81995],[108.34961,35.81424],[108.33487,35.81552],[108.31576,35.8244],[108.30039,35.82632],[108.28696,35.82902],[108.27591,35.83434],[108.26352,35.8389],[108.25189,35.83582],[108.23661,35.82187],[108.23092,35.81887],[108.22222,35.82001],[108.21418,35.82424],[108.19819,35.82867],[108.19081,35.82879],[108.18103,35.82413],[108.17605,35.81904],[108.17623,35.80411],[108.17341,35.80249],[108.15769,35.80295],[108.1511,35.79862],[108.14273,35.78979],[108.13401,35.78252],[108.12698,35.7719],[108.12745,35.76745],[108.13107,35.76211],[108.14325,35.75592],[108.15094,35.75413],[108.15395,35.75058],[108.15576,35.73851],[108.15338,35.73085],[108.14948,35.7252],[108.13709,35.71581],[108.13223,35.70761],[108.12661,35.68792],[108.12148,35.67924],[108.11537,35.67306],[108.04773,35.64081],[108.03074,35.64044],[108.01372,35.63663],[108.01066,35.64063],[108.00883,35.64743],[108.0093,35.66349],[108.01082,35.68075],[108.00363,35.68416],[107.99931,35.68364],[107.98529,35.67698],[107.98052,35.67986],[107.97154,35.68266],[107.95619,35.68605],[107.94006,35.68775],[107.93552,35.68175],[107.92777,35.68026],[107.92299,35.67681],[107.91991,35.6799],[107.91383,35.68165],[107.90767,35.68642],[107.89488,35.68671],[107.88714,35.69387],[107.88282,35.67783],[107.87732,35.66096],[107.87736,35.65538],[107.86533,35.64944],[107.86413,35.64739],[107.86648,35.63951],[107.8654,35.63252],[107.86678,35.62064],[107.87043,35.60909],[107.8641,35.60834],[107.84534,35.60318],[107.844,35.60121],[107.84828,35.59501],[107.84508,35.58802],[107.84163,35.5902],[107.83434,35.58858],[107.82395,35.58912],[107.81937,35.58417],[107.81481,35.58375],[107.80007,35.57841],[107.79207,35.57716],[107.78725,35.57234],[107.77524,35.57006],[107.76978,35.57061],[107.75754,35.56502],[107.74884,35.56415],[107.74084,35.55835],[107.7364,35.55874],[107.72763,35.54956],[107.72392,35.53007],[107.71999,35.52833],[107.71581,35.53032],[107.71172,35.54039],[107.70643,35.54565],[107.69493,35.55106],[107.69312,35.54869],[107.69902,35.53504],[107.70018,35.52924],[107.70579,35.51717],[107.71322,35.50999],[107.71306,35.49543],[107.70998,35.49052],[107.71033,35.48483],[107.70194,35.47328],[107.69728,35.46381],[107.69684,35.45789],[107.69246,35.44862],[107.68929,35.44682],[107.6852,35.44053],[107.68007,35.43778],[107.67855,35.43455]]]]}},{"type":"Feature","properties":{"name":"镇原县","adcode":"zx","cp":[107.19571,35.67781]},"geometry":{"type":"MultiPolygon","coordinates":[[[[107.60207,35.48744],[107.60593,35.48974],[107.60579,35.49297],[107.5965,35.507],[107.59246,35.51125],[107.58651,35.52125],[107.57913,35.52228],[107.57696,35.53237],[107.56728,35.54086],[107.56711,35.54401],[107.57083,35.55033],[107.5637,35.55476],[107.56561,35.55889],[107.56337,35.56106],[107.55693,35.56084],[107.55715,35.5661],[107.56044,35.5709],[107.55625,35.57501],[107.55658,35.57843],[107.55073,35.58819],[107.54791,35.59756],[107.54196,35.60569],[107.53615,35.60735],[107.5346,35.6201],[107.52623,35.6223],[107.52839,35.62758],[107.52456,35.62999],[107.52473,35.6416],[107.52672,35.6439],[107.52365,35.65347],[107.52007,35.65662],[107.51391,35.65693],[107.50611,35.67214],[107.50183,35.67324],[107.50876,35.67799],[107.50651,35.68075],[107.50611,35.68972],[107.50782,35.69688],[107.5031,35.70415],[107.50347,35.71162],[107.50141,35.71662],[107.50272,35.72746],[107.50538,35.73103],[107.50143,35.74628],[107.49508,35.75064],[107.48765,35.75876],[107.48612,35.77077],[107.4838,35.77287],[107.47987,35.78455],[107.47458,35.79137],[107.47416,35.79814],[107.47743,35.80282],[107.47051,35.81062],[107.47089,35.81197],[107.46821,35.83091],[107.4617,35.83865],[107.46276,35.84185],[107.46182,35.86036],[107.46492,35.86827],[107.46464,35.87389],[107.45803,35.8732],[107.44929,35.87603],[107.44689,35.8805],[107.44936,35.88925],[107.4356,35.90175],[107.42881,35.90281],[107.42521,35.907],[107.41484,35.91227],[107.40692,35.91166],[107.40229,35.91751],[107.39921,35.92613],[107.40457,35.93856],[107.40283,35.94154],[107.3966,35.94065],[107.39484,35.94413],[107.39604,35.95087],[107.39098,35.95689],[107.39282,35.95983],[107.38522,35.96787],[107.36719,35.96602],[107.36028,35.9686],[107.35546,35.96477],[107.34594,35.96562],[107.33425,35.97292],[107.32967,35.97758],[107.31928,35.98408],[107.31587,35.98881],[107.31018,35.99284],[107.3064,36.00205],[107.30774,36.00678],[107.30066,36.00691],[107.29394,36.01008],[107.29008,36.00982],[107.28585,36.01372],[107.28209,36.01372],[107.27358,36.02677],[107.26032,36.02152],[107.25947,36.02559],[107.2669,36.03209],[107.26208,36.04809],[107.26283,36.05115],[107.25357,36.0512],[107.24812,36.05305],[107.24685,36.05802],[107.24241,36.0548],[107.24365,36.05941],[107.2425,36.06523],[107.23766,36.06114],[107.23368,36.064],[107.23342,36.06962],[107.22969,36.06569],[107.22524,36.07508],[107.22673,36.08086],[107.21415,36.07871],[107.20002,36.0798],[107.19362,36.08564],[107.19261,36.09067],[107.18138,36.09825],[107.17453,36.1011],[107.16666,36.10048],[107.15843,36.09411],[107.14346,36.08693],[107.12648,36.08885],[107.11837,36.09533],[107.10612,36.0985],[107.09799,36.09695],[107.08656,36.09232],[107.07728,36.09616],[107.07596,36.09284],[107.07058,36.08994],[107.06853,36.09382],[107.06329,36.09628],[107.06609,36.10023],[107.06381,36.10444],[107.07185,36.1096],[107.07723,36.11543],[107.0636,36.11292],[107.05334,36.10712],[107.05306,36.1147],[107.04375,36.11532],[107.04119,36.11716],[107.03823,36.12726],[107.03973,36.13226],[107.03376,36.13288],[107.02619,36.13106],[107.02763,36.12221],[107.01775,36.12875],[107.01277,36.12996],[107.00205,36.1361],[106.99967,36.15556],[107.00252,36.18262],[107.00428,36.18789],[107.00661,36.18502],[107.01517,36.19116],[107.01505,36.19986],[107.02833,36.19305],[107.02967,36.20318],[107.02328,36.20975],[107.01416,36.2101],[107.00753,36.21286],[107.00715,36.21652],[107.01239,36.21767],[107.01519,36.22869],[107.00602,36.22704],[107.00571,36.23086],[106.97593,36.23187],[106.97572,36.2289],[106.9709,36.22534],[106.97019,36.21936],[106.96333,36.22225],[106.95994,36.22026],[106.95839,36.22804],[106.96387,36.23553],[106.96316,36.23952],[106.95261,36.2376],[106.95555,36.23377],[106.95298,36.23107],[106.94619,36.23143],[106.94161,36.22206],[106.94358,36.21886],[106.94386,36.2095],[106.94614,36.20563],[106.93695,36.20337],[106.93399,36.20649],[106.93293,36.21428],[106.92541,36.2183],[106.91154,36.2189],[106.91368,36.22798],[106.91027,36.23228],[106.90303,36.22944],[106.9014,36.2189],[106.8996,36.21731],[106.89254,36.21811],[106.89054,36.22104],[106.89315,36.22844],[106.89621,36.23157],[106.89372,36.23392],[106.8901,36.22653],[106.8857,36.23256],[106.86753,36.24561],[106.8605,36.24613],[106.86026,36.24094],[106.85053,36.23965],[106.84997,36.24266],[106.84578,36.24274],[106.84423,36.24674],[106.83838,36.2431],[106.83824,36.2349],[106.83417,36.23686],[106.82947,36.23576],[106.83398,36.22921],[106.8388,36.22177],[106.84132,36.20647],[106.84407,36.20291],[106.84865,36.20151],[106.85197,36.2077],[106.85937,36.20739],[106.85787,36.20329],[106.8657,36.19342],[106.86713,36.18552],[106.87461,36.17689],[106.87844,36.17932],[106.88326,36.17568],[106.88869,36.1664],[106.89823,36.16933],[106.90517,36.15765],[106.91253,36.15356],[106.90813,36.14525],[106.90947,36.14355],[106.90721,36.13518],[106.90947,36.13088],[106.91264,36.13336],[106.91394,36.13012],[106.91838,36.12929],[106.92033,36.12035],[106.92087,36.1296],[106.92571,36.1357],[106.93049,36.13839],[106.92966,36.13079],[106.92567,36.1161],[106.92931,36.11313],[106.93312,36.11445],[106.937,36.12296],[106.94045,36.12656],[106.94664,36.12198],[106.94257,36.11877],[106.94074,36.10822],[106.93554,36.10728],[106.9441,36.09964],[106.95059,36.09944],[106.95157,36.09057],[106.95291,36.09363],[106.95757,36.09157],[106.95524,36.08307],[106.95783,36.08122],[106.95882,36.07514],[106.94793,36.07754],[106.95052,36.07087],[106.94953,36.06795],[106.93975,36.06423],[106.93763,36.05741],[106.93895,36.05526],[106.94795,36.05503],[106.94276,36.0518],[106.94156,36.04483],[106.9421,36.03249],[106.93089,36.02903],[106.92889,36.02229],[106.92844,36.01137],[106.93291,36.00749],[106.94198,36.00601],[106.94537,36.00357],[106.95122,36.00451],[106.94906,35.99907],[106.94929,35.99204],[106.94426,35.98425],[106.93484,35.98123],[106.93152,35.97477],[106.92757,35.97633],[106.92557,35.97035],[106.92042,35.96733],[106.91767,35.96121],[106.91758,35.9466],[106.91622,35.94467],[106.91053,35.95014],[106.91255,35.95679],[106.90771,35.96329],[106.89858,35.96044],[106.89962,35.96491],[106.89186,35.96614],[106.89673,35.9501],[106.90253,35.94356],[106.91897,35.94048],[106.92226,35.94856],[106.92752,35.95183],[106.93512,35.95085],[106.93836,35.95314],[106.94478,35.94027],[106.94052,35.93105],[106.93448,35.93344],[106.92513,35.92622],[106.91293,35.93223],[106.90488,35.92486],[106.90545,35.91268],[106.90211,35.91248],[106.89221,35.91828],[106.88598,35.91747],[106.87931,35.91304],[106.8727,35.9059],[106.86518,35.90639],[106.86177,35.90904],[106.85935,35.90448],[106.86327,35.89803],[106.86247,35.89536],[106.85013,35.88756],[106.85291,35.88338],[106.8731,35.87828],[106.87517,35.88265],[106.88079,35.88086],[106.88361,35.869],[106.87397,35.87476],[106.86925,35.87049],[106.87348,35.86667],[106.87794,35.85277],[106.87982,35.85853],[106.88295,35.85687],[106.88234,35.84909],[106.89322,35.83449],[106.8999,35.82727],[106.91128,35.83124],[106.91452,35.82865],[106.91922,35.81923],[106.9172,35.8129],[106.92628,35.8117],[106.92522,35.80503],[106.91944,35.80365],[106.91473,35.80681],[106.90848,35.80584],[106.90235,35.80912],[106.89769,35.80848],[106.89901,35.80328],[106.90409,35.80392],[106.90528,35.79388],[106.91163,35.7939],[106.91433,35.79137],[106.91445,35.78542],[106.91194,35.78328],[106.91514,35.77792],[106.91123,35.77763],[106.91288,35.7719],[106.90893,35.76772],[106.90206,35.77495],[106.89851,35.77242],[106.89666,35.7641],[106.8976,35.75982],[106.88554,35.7617],[106.88716,35.76606],[106.8853,35.77185],[106.87599,35.77659],[106.87138,35.77697],[106.86899,35.77416],[106.86908,35.76408],[106.86753,35.75812],[106.8687,35.74441],[106.86706,35.73864],[106.86085,35.73924],[106.85427,35.74399],[106.85046,35.74472],[106.84306,35.74285],[106.83603,35.74383],[106.83447,35.73806],[106.8278,35.7453],[106.82152,35.74551],[106.81785,35.74281],[106.81811,35.73947],[106.82326,35.73103],[106.81722,35.72939],[106.81966,35.72427],[106.8164,35.7176],[106.80626,35.70965],[106.79752,35.71434],[106.79625,35.71978],[106.79155,35.71768],[106.78823,35.72125],[106.7845,35.72065],[106.78247,35.72371],[106.77721,35.72209],[106.77354,35.72526],[106.76872,35.72279],[106.76893,35.72763],[106.76439,35.72813],[106.75694,35.72306],[106.75154,35.72609],[106.7494,35.70873],[106.75132,35.70583],[106.74465,35.70043],[106.74613,35.69821],[106.75349,35.69925],[106.75468,35.69123],[106.82378,35.66164],[106.82874,35.65598],[106.84204,35.65179],[106.86621,35.63914],[106.88836,35.62373],[106.90364,35.61089],[106.90465,35.60446],[106.91062,35.6005],[106.91116,35.5964],[106.91979,35.58631],[106.92052,35.58295],[106.92604,35.57911],[106.93387,35.5777],[106.93857,35.57151],[106.94476,35.56896],[106.94817,35.56392],[106.95498,35.56353],[106.95877,35.56023],[106.96126,35.56133],[106.97026,35.55],[106.97287,35.55089],[106.97576,35.5466],[106.9866,35.53954],[106.98959,35.53898],[106.99027,35.53221],[106.99446,35.53225],[106.99756,35.52531],[107.00184,35.52429],[107.00332,35.52048],[107.01133,35.518],[107.01538,35.51315],[107.0218,35.51001],[107.02678,35.51007],[107.03661,35.50075],[107.04474,35.49756],[107.04775,35.49322],[107.05231,35.49108],[107.05626,35.48256],[107.05657,35.47751],[107.05436,35.47024],[107.05649,35.46548],[107.06009,35.46892],[107.06458,35.47893],[107.07225,35.47984],[107.07763,35.47792],[107.08816,35.46788],[107.0966,35.4666],[107.10408,35.47928],[107.11223,35.48342],[107.11811,35.48951],[107.12644,35.49313],[107.1373,35.48955],[107.14889,35.47953],[107.157,35.4785],[107.1712,35.4744],[107.17597,35.47525],[107.17827,35.47844],[107.17686,35.49359],[107.17839,35.50044],[107.18678,35.51498],[107.19134,35.51906],[107.19501,35.51659],[107.19872,35.50955],[107.20343,35.50907],[107.21805,35.51108],[107.22162,35.5128],[107.23404,35.51353],[107.23368,35.50798],[107.23914,35.50241],[107.24415,35.50411],[107.24918,35.5029],[107.24953,35.4992],[107.25672,35.49992],[107.25877,35.50408],[107.2558,35.50769],[107.25503,35.52214],[107.25745,35.52278],[107.26307,35.51906],[107.27055,35.51723],[107.28087,35.5197],[107.29067,35.51821],[107.29539,35.51471],[107.31084,35.49963],[107.33256,35.48883],[107.34465,35.48802],[107.35229,35.4909],[107.36155,35.48918],[107.37321,35.48332],[107.38386,35.48111],[107.39178,35.48467],[107.39867,35.491],[107.40532,35.50054],[107.41409,35.50408],[107.42359,35.50212],[107.44103,35.49245],[107.45182,35.48539],[107.4613,35.48456],[107.47002,35.48601],[107.48288,35.48601],[107.48667,35.47949],[107.47858,35.46867],[107.47952,35.46165],[107.48984,35.45907],[107.50075,35.46002],[107.50677,35.46534],[107.50446,35.48011],[107.51582,35.48419],[107.51911,35.49317],[107.53011,35.498],[107.54292,35.49526],[107.55658,35.48034],[107.56309,35.4713],[107.57054,35.46341],[107.57097,35.45778],[107.58893,35.46391],[107.59279,35.46716],[107.5842,35.47494],[107.585,35.48247],[107.59464,35.48698],[107.60207,35.48744]]],[[[106.95261,36.2376],[106.96316,36.23952],[106.96596,36.24782],[106.97276,36.24793],[106.97776,36.24515],[106.97934,36.25117],[106.98204,36.25109],[106.98127,36.23975],[106.97616,36.2391],[106.97593,36.23187],[107.00571,36.23086],[107.00433,36.23726],[107.00659,36.24027],[107.00278,36.24636],[107.00273,36.25454],[106.99121,36.255],[106.98947,36.26671],[106.98211,36.26039],[106.9772,36.26209],[106.97071,36.26973],[106.96239,36.27598],[106.9618,36.26949],[106.96432,36.26196],[106.9614,36.26],[106.96147,36.25132],[106.95355,36.24605],[106.95049,36.24801],[106.94791,36.24301],[106.95261,36.2376]]]]}}]};

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
    defaultRiskWeights: function () {
      return RISK_DIMS_DEFAULT.map(function (d) {
        return { key: d.key, name: d.name, weight: d.weight };
      });
    },
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
