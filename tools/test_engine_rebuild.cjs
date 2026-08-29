global.window = {};
require("D:/research/政府招商引资风险管理平台/web/public/engine/mock.js");
const M = global.window.MOCK;
console.log("engine?", typeof global.window.MOCK_ENGINE);
const ents = [{
  id: "E001", name: "测试企业甲有限公司", creditCode: "X1", legal: "张三", regCapital: 500,
  regCapitalFmt: "500万元", found: "2020-01-01", industry: "software", industryName: "软件与信息技术",
  scale: "大型企业", tags: ["高新技术企业"], district: "xf", districtName: "西峰区", address: "x",
  isDeep: true, signDaysAgo: 10,
  overview: { regCapital: "500万元", revenue: "1.0亿元", revenueWan: 10000, tax: "500万元", taxWan: 500, employees: 100, invest: "8000万元", investWan: 8000, profit: "1000万元",
    yearly: { years: [1,2,3,4,5], revenueWan: [1,2,3,4,10000], taxWan: [1,1,1,1,500], employees: [1,1,1,1,100], investWan: [1,1,1,1,8000] } },
  status: { biz: "正常", credit: "正常", performRate: 88 },
  operation: { revenue: [0.1,0.1,0.1,0.1,0.1,0.1], tax: [5,5,5,5,5,5], invest: [100,100,100,100,100,100], employees: [10,10,10,10,10,10] },
  commitments: [], dynamics: [], shareholders: [{ name: "a", ratio: 60 }, { name: "b", ratio: 40 }],
  risks: { operation: 30, finance: 20, judicial: 10, credit: 10, tender: 10, tax: 15, perform: 20, ip: 5 },
  riskScore: 18, riskLevel: "blue", policies: [], ai: null, landMu: 0
}];
const events = [{ id: "R001", time: "2026-08-01", timeHm: "09:00", entId: "E001", enterprise: "测试企业甲有限公司", enterpriseName: "测试企业甲有限公司", title: "经营异常：测试", finding: "测试", type: "经营异常", typeKey: "经营", dim: "operation", dimKey: "operation", dimName: "经营风险", level: "yellow", advice: "走访", suggestion: "走访", status: "已派发", basis: "b", detail: "d", daysAgo: 10 }];
global.window.MOCK_ENGINE.rebuild({ ENTERPRISES: ents, RISK_EVENTS: events, PROJECTS: [], TASKS: [], POLICY_LIB: M.POLICY_LIB.slice() });
console.log("ent0:", M.ENTERPRISES[0].name, "| policies:", M.ENTERPRISES[0].policies);
console.log("ai:", JSON.stringify(M.ENTERPRISES[0].ai).slice(0, 150));
console.log("landMu:", M.ENTERPRISES[0].landMu, "| overview total:", M.OVERVIEW.totalEnterprises);
console.log("graph nodes:", M.GRAPH.nodes.length, "links:", M.GRAPH.links.length);
console.log("aiDaily[0]:", M.AI_DAILY[0]);
console.log("policy0 redeem:", M.POLICY_LIB[0].planWan, M.POLICY_LIB[0].redeemRate, "| entCount:", M.POLICY_LIB[0].entCount);
console.log("investStats stages:", JSON.stringify(M.INVEST_STATS.stageCounts));
