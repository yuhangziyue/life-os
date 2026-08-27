// 代价账本 —— 这座花园的第二语言。
//
// 花瓣的「舒展度」说的是「这一瓣长成什么样」（绝对量，会到顶）；
// 「光的分配」说的是「这些光是从哪里分出去的」（占比，恒等于 100%，天然没有顶、天然互斥）。
// 你给了职业，就必然没给家庭 —— 这份互斥性就是「代价可见」的数学表达。
//
// 口径铁律（2026-08-25 第四轮圆桌 · Lisa/小露/书香/苏姐）：
//   1. 只陈述事实与归因，不做褒贬。「均匀」不是成就，「合着」不是辜负。
//   2. 不催办。可以把问题摆在看得见的地方，但不要按钮、不要待办。
//   3. 分数一个字不动（不倒写历史、不做激励曲线），账本只做加法：新增占比通道。

import type { Dimension } from '../models/dimension'
import type { Action } from '../models/action'
import { calculateScoreInRange } from './scoring'

const DAY_MS = 24 * 60 * 60 * 1000

// ========== 第一份代价快照（首启第三幕 / 月度微校准共用） ==========

/** 判为「均匀」的极差阈值：八瓣最高与最低相差不到这个数，就不存在明显偏斜 */
const FLAT_SPREAD = 2

/**
 * 由八瓣分数的偏态，生成 1-2 句「代价快照」。
 *
 * 这是产品的 Aha 时刻：用户第一次看见的不是分数，是自己这一程的选择。
 * 文案口径见圆桌第一节——事实 + 归因 + 一个不必回答的问题，没有褒贬。
 */
export function composeFirstImpression(
  dimensions: Dimension[],
  scores: Record<string, number>,
): string[] {
  const scored = dimensions
    .map(d => ({ name: d.name, score: scores[d.id] ?? d.initialScore ?? 3 }))
    .sort((a, b) => b.score - a.score)

  if (scored.length < 2) return []

  const top = scored[0]
  const bottom = scored[scored.length - 1]
  const spread = top.score - bottom.score

  // 均匀：不夸奖。均匀往往意味着还没做过真正的选择（Lisa 的教练视角）
  if (spread < FLAT_SPREAD) {
    return ['八瓣的长短很接近。可能你确实照顾得很平均，也可能——你还没决定要先照顾谁。']
  }

  const lines: string[] = []

  // 高瓣：把「投入」还原成「选择」，不说「最丰盛」这类褒奖
  const highs = scored.filter(s => s.score >= top.score - 0.5).slice(0, 2)
  lines.push(
    `你的光大半给了${quoteList(highs.map(h => h.name))}。这不是错，这是你眼下的选择。`
  )

  // 低瓣：只在确实低的时候说；「不是被辜负，是没排在前面」——去掉道德重量
  if (bottom.score <= 4) {
    const lows = scored.filter(s => s.score <= bottom.score + 0.5).slice(-2)
    const petal = lows.length > 1 ? '这两瓣' : '这一瓣'
    lines.push(
      `${quoteList(lows.map(l => l.name))}${petal}还合着。它们不是被你辜负了，是这一程没排在前面。`
    )
  }

  return lines
}

// ========== 光的分配（占比通道） ==========

export interface LightShare {
  dimensionId: string
  name: string
  colorHex: string
  /** 该维度在区间内的行动贡献值合计 */
  weight: number
  /** 占全部光的比例 0-1 */
  share: number
}

/**
 * 区间内「光」的分配。权重用 impact（与评分同源），不用条数——
 * 一个里程碑和一件小事不该算作同样多的光。
 * 全区间零行动时返回空数组（调用方据此判断「还没有账可算」）。
 */
export function lightShares(
  dimensions: Dimension[],
  actions: Action[],
  since: number,
  until: number = Date.now(),
): LightShare[] {
  const weights = new Map<string, number>()
  let total = 0

  for (const a of actions) {
    if (!a.isCompleted) continue
    if (a.date < since || a.date > until) continue
    weights.set(a.dimensionId, (weights.get(a.dimensionId) ?? 0) + a.impact)
    total += a.impact
  }

  if (total === 0) return []

  return dimensions
    .map(d => {
      const weight = weights.get(d.id) ?? 0
      return {
        dimensionId: d.id,
        name: d.name,
        colorHex: d.colorHex,
        weight,
        share: weight / total,
      }
    })
    .filter(s => s.weight > 0)
    .sort((a, b) => b.share - a.share)
}

/** 把占比说成人话：「一半」「三分之一」这类，比百分数更像账本不像报表 */
export function shareInWords(share: number): string {
  if (share >= 0.75) return '大部分'
  if (share >= 0.55) return '一多半'
  if (share >= 0.45) return '一半'
  if (share >= 0.28) return '三成上下'
  if (share >= 0.18) return '两成上下'
  return '一小部分'
}

// ========== 今日账本一瞥（Dashboard 顶部，一天一条） ==========

export type GlanceKind = 'growth' | 'allocation' | 'companion'

export interface Glance {
  kind: GlanceKind
  /** 主句：事实 */
  text: string
  /** 副句：Lisa 的追问，或纪念语。可为空，永不是按钮 */
  aside?: string
  /** 用于染色的维度色，没有具体维度时为 undefined */
  colorHex?: string
}

/**
 * 生成今日那一条账本一瞥。
 *
 * 三类轮换，按天确定性挑选（同一天反复打开看到同一条，不闪烁）：
 *   growth     本周 vs 上周的形态变化 —— 生长感是最强的回来理由（小露）
 *   allocation 本周光的分配 + 「这是你想要的分法吗？」（Lisa）
 *   companion  陪伴天数的纪念
 *
 * 刻意不做的事：不指出沉睡维度并要求补记（那是催办，会被躲）。
 */
export function composeGlance(params: {
  dimensions: Dimension[]
  actions: Action[]
  companionDays: number
  now?: number
}): Glance | null {
  const { dimensions, actions, companionDays } = params
  const now = params.now ?? Date.now()

  const candidates: Glance[] = []

  // —— companion：里程碑当天优先级最高，不参与轮换
  if ([30, 90, 180, 365, 500, 730].includes(companionDays)) {
    return {
      kind: 'companion',
      text: `今天是你和这座花园的第 ${companionDays} 天`,
      aside: '这些天里的每一滴露水，都还在花瓣上',
    }
  }

  // —— growth：本周 vs 上周，同一维度的舒展变化
  const weekStart = now - 7 * DAY_MS
  const prevStart = now - 14 * DAY_MS
  let best: { name: string; delta: number; colorHex: string } | null = null
  for (const d of dimensions) {
    const after = calculateScoreInRange(d, actions, weekStart, now)
    const before = calculateScoreInRange(d, actions, prevStart, weekStart)
    const delta = after - before
    if (!best || Math.abs(delta) > Math.abs(best.delta)) {
      best = { name: d.name, delta, colorHex: d.colorHex }
    }
  }
  if (best && best.delta >= 0.5) {
    candidates.push({
      kind: 'growth',
      text: `「${best.name}」这周比上周舒展了一些`,
      colorHex: best.colorHex,
    })
  } else if (best && best.delta <= -0.5) {
    // 合拢也如实说，但不带责备——它同样是账本的一行
    candidates.push({
      kind: 'growth',
      text: `「${best.name}」这周比上周收了收`,
      aside: '光是有限的，收了收往往意味着它去了别处',
      colorHex: best.colorHex,
    })
  }

  // —— allocation：本周光的分配
  const shares = lightShares(dimensions, actions, weekStart, now)
  if (shares.length > 0 && shares[0].share >= 0.28) {
    candidates.push({
      kind: 'allocation',
      text: `这周你的光有${shareInWords(shares[0].share)}给了「${shares[0].name}」`,
      aside: '这是你想要的分法吗？',
      colorHex: shares[0].colorHex,
    })
  }

  // —— 兜底 companion：还没有账可算的新用户，也该有一句
  if (candidates.length === 0) {
    if (companionDays <= 1) return null
    return {
      kind: 'companion',
      text: `这朵花陪了你 ${companionDays} 天`,
      aside: '还没有太多记录，慢慢来就好',
    }
  }

  // 按天确定性轮换：同一天始终同一条
  const dayIndex = Math.floor(startOfDay(now) / DAY_MS)
  return candidates[dayIndex % candidates.length]
}

// ========== 月度微校准（v3.3 T9，报告 §6.2.1） ==========

/**
 * 为什么要有它（第四轮圆桌）：季度会谈是 84 天一次，而用户可能第 30 天就走了，
 * 根本等不到第一次结算。月度微校准是「结算」的轻量版 —— 让人在第 30 天
 * 就尝到回望的力量，为第 84 天的深谈做情感铺垫。
 *
 * 与季度会谈的分工（刻意做薄）：
 *   不打分、不选焦点、不写意图，只做两件事 —— 看两朵花的对比 + 回答一个问题。
 *   全程 2 分钟以内；答不答都可以，「继续照看花园」不留任何痕迹。
 */
export const MONTHLY_CYCLE_DAYS = 30

export interface MonthlyState {
  due: boolean
  /** 本期起点（上次月度校准之后，或花园生日） */
  periodStart: number
  /** 上一期起点，用于两朵花对照 */
  prevStart: number
  daysSince: number
}

export function monthlyState(params: {
  lastMonthlyAt: number | null
  gardenBirthAt: number
  now?: number
}): MonthlyState {
  const now = params.now ?? Date.now()
  const anchor = params.lastMonthlyAt ?? params.gardenBirthAt
  const daysSince = Math.floor((now - anchor) / DAY_MS)
  return {
    due: daysSince >= MONTHLY_CYCLE_DAYS,
    periodStart: anchor,
    prevStart: anchor - MONTHLY_CYCLE_DAYS * DAY_MS,
    daysSince,
  }
}

/** 月度微校准卡上的两句事实：照顾最多的 / 最安静的 */
export function composeMonthlyFacts(
  dimensions: Dimension[],
  actions: Action[],
  periodStart: number,
  now: number = Date.now(),
): string[] {
  const shares = lightShares(dimensions, actions, periodStart, now)
  if (shares.length === 0) return ['这个月还没有太多记录——花园会照常等着，什么都不必补。']

  const lines = [`这个月你照顾最多的花瓣：「${shares[0].name}」（${shareInWords(shares[0].share)}的光）`]

  const touched = new Set(shares.map(s => s.dimensionId))
  const quiet = dimensions.filter(d => !touched.has(d.id))
  if (quiet.length > 0) {
    lines.push(
      `最安静的：${quoteList(quiet.slice(0, 2).map(d => d.name))}${quiet.length > 2 ? ' 等' : ''}——它们只是这个月没排在前面。`
    )
  } else if (shares.length > 1) {
    lines.push(`最安静的：「${shares[shares.length - 1].name}」——它只是这个月没排在前面。`)
  }
  return lines
}

// ========== 工具 ==========

function quoteList(names: string[]): string {
  return names.map(n => `「${n}」`).join('和')
}

function startOfDay(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}
