import type { Dimension, ScoreRubric } from '../models/dimension'
import type { Action } from '../models/action'

// ========== 配置 ==========

export const DORMANT_AFTER_DAYS = 3  // 连续 N 天无行动进入「沉睡」（只改状态，不扣分）
const SCORE_WINDOW_DAYS = 30         // 评分计算窗口（最近 30 天）
export const IMPACT_MULTIPLIER = 0.2 // 行动贡献值乘数
const DAY_MS = 24 * 60 * 60 * 1000

// ========== 核心计算 ==========

/**
 * 计算维度当前分数（基于最近 30 天行动）
 */
export function calculateScore(dimension: Dimension, actions: Action[]): number {
  const dimActions = actions.filter(a => a.dimensionId === dimension.id && a.isCompleted)
  const cutoff = Date.now() - SCORE_WINDOW_DAYS * 24 * 60 * 60 * 1000
  const recentActions = dimActions.filter(a => a.date >= cutoff)
  return computeScore(dimension.initialScore, recentActions, Date.now())
}

/**
 * 计算维度在指定时间范围内的分数
 */
export function calculateScoreInRange(
  dimension: Dimension,
  actions: Action[],
  startDate: number,
  endDate: number,
): number {
  const dimActions = actions.filter(
    a => a.dimensionId === dimension.id && a.isCompleted && a.date >= startDate && a.date <= endDate
  )
  return computeScore(dimension.initialScore, dimActions, endDate)
}

/**
 * 计算截止到某天的分数
 */
export function calculateScoreUpTo(
  dimension: Dimension,
  actions: Action[],
  upToDate: number,
): number {
  const dimActions = actions.filter(
    a => a.dimensionId === dimension.id && a.isCompleted && a.date <= upToDate
  )
  return computeScore(dimension.initialScore, dimActions, upToDate)
}

// ========== 内部计算 ==========

function computeScore(initialScore: number, actions: Action[], upToDate: number): number {
  let score = initialScore

  // 累加最近 30 天行动贡献
  const cutoff = upToDate - SCORE_WINDOW_DAYS * DAY_MS
  const recentActions = actions.filter(a => a.date >= cutoff)
  const totalImpact = recentActions.reduce((sum, a) => sum + a.impact, 0)
  score += totalImpact * IMPACT_MULTIPLIER

  // v3 起没有衰减扣分：几天没照顾，花瓣进入「沉睡」（见 dimensionVitality），
  // 分数冻结在原处。花不会因为你三天没浇水就惩罚你，它只是安静地等你。
  return Math.min(Math.max(score, 0), 10)
}

// ========== 生机状态（休眠机制） ==========

export interface DimensionVitality {
  /** 曾照顾过、但已连续 3 天以上没有行动 */
  dormant: boolean
  /** 距最近一次行动的天数；从未行动过为 null */
  daysSinceLast: number | null
  /** 今天是否已有行动 */
  hasToday: boolean
  /** 最近 7 天的行动数（驱动花瓣的饱满度） */
  recentCount: number
}

export function dimensionVitality(
  dimension: Dimension,
  actions: Action[],
  now: number = Date.now(),
): DimensionVitality {
  const dimActions = actions.filter(a => a.dimensionId === dimension.id && a.isCompleted)
  if (dimActions.length === 0) {
    return { dormant: false, daysSinceLast: null, hasToday: false, recentCount: 0 }
  }
  const today = startOfDay(now)
  const last = startOfDay(Math.max(...dimActions.map(a => a.date)))
  const daysSinceLast = Math.floor((today - last) / DAY_MS)
  const recentCount = dimActions.filter(a => a.date >= now - 7 * DAY_MS).length
  return {
    dormant: daysSinceLast > DORMANT_AFTER_DAYS,
    daysSinceLast,
    hasToday: daysSinceLast === 0,
    recentCount,
  }
}

/** 连续照顾天数（截止今天，含今天；今天还没记录则从昨天起算） */
export function careStreak(dimensionId: string, actions: Action[], now: number = Date.now()): number {
  const days = new Set(
    actions
      .filter(a => a.dimensionId === dimensionId && a.isCompleted)
      .map(a => startOfDay(a.date))
  )
  let streak = 0
  let cursor = startOfDay(now)
  if (!days.has(cursor)) cursor -= DAY_MS // 今天还没记录，从昨天开始数
  while (days.has(cursor)) {
    streak++
    cursor -= DAY_MS
  }
  return streak
}

/**
 * 加一条今天的行动之后，这个维度会变成几分。
 *
 * 给行动回响判断「状态词是否跨档」用（v3.3 T2）。今天的行动必然落在 30 天窗口内，
 * 所以就是当前分数加上这条的贡献，再夹到 [0,10] —— 与 computeScore 同一口径。
 */
export function scoreAfterAdding(
  dimension: Dimension,
  actions: Action[],
  impact: number,
): number {
  const current = calculateScore(dimension, actions)
  return Math.min(Math.max(current + impact * IMPACT_MULTIPLIER, 0), 10)
}

// ========== 状态词（首页第一语言；精确数字留给统计页） ==========

export function scoreStage(score: number): string {
  if (score < 2) return '含苞'
  if (score < 4) return '萌芽'
  if (score < 6) return '舒展'
  if (score < 8) return '盛放'
  return '繁盛'
}

/** 维度在首页的状态词：沉睡优先于分数档位 */
export function dimensionStage(dimension: Dimension, actions: Action[], score: number): string {
  return dimensionVitality(dimension, actions).dormant ? '沉睡' : scoreStage(score)
}

// ========== 工具函数 ==========

function startOfDay(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function startOfToday(): number {
  return startOfDay(Date.now())
}

/**
 * 获取某个分数对应的评分标准
 */
export function getRubric(score: number, rubrics: ScoreRubric[]): ScoreRubric | undefined {
  const rounded = Math.round(score)
  return rubrics.find(r => r.score === rounded)
}

/**
 * 计算所有维度的综合总分
 */
export function overallScore(dimensions: Dimension[], actions: Action[]): number {
  const scores = dimensions
    .filter(d => d.isEnabled)
    .map(d => calculateScore(d, actions))
  if (scores.length === 0) return 0
  return scores.reduce((a, b) => a + b, 0) / scores.length
}

/**
 * 获取覆盖的维度数（有行动的维度）
 */
export function coveredDimensions(dimensions: Dimension[], actions: Action[]): number {
  const today = startOfToday()
  const dimIds = new Set(
    actions
      .filter(a => a.date >= today && a.isCompleted)
      .map(a => a.dimensionId)
  )
  return dimensions.filter(d => d.isEnabled && dimIds.has(d.id)).length
}
