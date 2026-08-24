// 周/月/年回顾

export type ReviewPeriodType = 'week' | 'month' | 'year'

export interface Review {
  id: string
  periodType: ReviewPeriodType
  periodStart: number    // timestamp
  periodEnd: number      // timestamp
  reflectionText: string // 用户反思
  autoSummary: string    // 系统自动摘要
  createdAt: number
}
