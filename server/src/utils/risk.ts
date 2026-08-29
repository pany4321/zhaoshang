// 风险维度定义 — 与前端 mock.js 保持一致

export interface RiskDim {
  key: string
  name: string
  weight: number
  desc: string
}

export const RISK_DIMS: RiskDim[] = [
  { key: 'op',     name: '经营风险', weight: 0.15, desc: '产能利用率、订单饱和度、市场变化' },
  { key: 'fin',    name: '财务风险', weight: 0.18, desc: '负债水平、现金流、盈利能力' },
  { key: 'legal',  name: '司法风险', weight: 0.12, desc: '诉讼、被执行、失信信息' },
  { key: 'credit', name: '信用风险', weight: 0.10, desc: '行政处罚、经营异常、黑名单' },
  { key: 'tender', name: '招投标风险', weight: 0.08, desc: '围标串标、虚假资质、履约记录' },
  { key: 'tax',    name: '税务风险', weight: 0.12, desc: '欠税、发票异常、申报不实' },
  { key: 'commit', name: '招商履约风险', weight: 0.15, desc: '投资强度、建设进度、税收承诺' },
  { key: 'ip',     name: '知识产权风险', weight: 0.05, desc: '专利侵权、商标纠纷' },
  { key: 'env',    name: '安全环保风险', weight: 0.05, desc: '环保处罚、安全事故' },
]

export const LEVELS = {
  red:    { name: '红色预警', color: '#EF4444', bg: '#FEE2E2' },
  orange: { name: '橙色预警', color: '#F97316', bg: '#FFEDD5' },
  yellow: { name: '黄色预警', color: '#EAB308', bg: '#FEF9C3' },
  blue:   { name: '蓝色关注', color: '#3B82F6', bg: '#DBEAFE' },
}

export type RiskLevel = keyof typeof LEVELS

// 加权计算综合风险分
export function calcRiskScore(scores: Record<string, number>): number {
  let total = 0
  for (const d of RISK_DIMS) {
    total += (scores[d.key] || 0) * d.weight
  }
  return Math.round(total)
}

// 分数→等级：红≥65，橙≥45，黄≥25，蓝<25
export function scoreToLevel(score: number): RiskLevel {
  if (score >= 65) return 'red'
  if (score >= 45) return 'orange'
  if (score >= 25) return 'yellow'
  return 'blue'
}
