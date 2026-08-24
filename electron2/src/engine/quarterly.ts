import type { Dimension } from '../models/dimension'
import { QUARTER_MS, type QuarterlyReview } from '../models/quarterly'

/**
 * 季度会谈的节律（设计稿 §2.1）。
 *
 * 周期锚点是滚动十二周，不绑日历季度：
 *   首个周期从「花园诞生日」（首次盘点那天，用最早的维度创建时刻代表）起算；
 *   此后每次从「上一次会谈完成日」起算 84 天。
 *
 * 红线：这里永远不计算、不返回「逾期几天」。会谈是赴约，不是欠账。
 */

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

/** 邀请的呈现形态：卡片 → （连推两次后）侧栏小花苞 → 无 */
export type InviteForm = 'card' | 'bud' | 'none'

export interface QuarterlyState {
  /** 已满 84 天 */
  due: boolean
  /** 下一次到期时刻 */
  dueAt: number
  /** 距离到期还有几天（未到期时为正；到期后不再对外暴露天数） */
  daysUntilDue: number
  /** 未完成的草稿（completedAt 为空的最新一条） */
  draft: QuarterlyReview | null
  /** 最近一次完成的会谈 */
  lastCompleted: QuarterlyReview | null
  invite: InviteForm
}

export function gardenBirth(dimensions: Dimension[]): number {
  if (dimensions.length === 0) return Date.now()
  return Math.min(...dimensions.map(d => d.createdAt))
}

export function quarterlyState(
  reviews: QuarterlyReview[],
  dimensions: Dimension[],
  defer: { until: number; count: number },
  now = Date.now(),
): QuarterlyState {
  const completed = reviews
    .filter(r => r.completedAt != null)
    .sort((a, b) => (b.completedAt as number) - (a.completedAt as number))
  const lastCompleted = completed[0] ?? null
  const draft = reviews.find(r => r.completedAt == null) ?? null

  const anchor = lastCompleted?.completedAt ?? gardenBirth(dimensions)
  const dueAt = anchor + QUARTER_MS
  const due = now >= dueAt

  let invite: InviteForm = 'none'
  if (due) {
    // 连续推迟两次后，邀请卡收起，转为侧栏入口上的一枚静态小花苞
    if (defer.count >= 2) invite = 'bud'
    else if (now >= defer.until) invite = 'card'
    else invite = 'bud'
  }

  return {
    due,
    dueAt,
    daysUntilDue: Math.max(0, Math.ceil((dueAt - now) / (24 * 60 * 60 * 1000))),
    draft,
    lastCompleted,
    invite,
  }
}

/** 点「这周先不」：本周不再出现，下周温和地再来一次 */
export function nextDeferUntil(now = Date.now()): number {
  return now + WEEK_MS
}

/** 差异的呈现语言：只用形态词，禁用涨跌语义（设计稿 §2.3 第三幕） */
export function shapeDelta(before: number | undefined, after: number): string {
  if (before === undefined) return '第一次被看见'
  const d = after - before
  if (d >= 1.5) return '舒展了许多'
  if (d >= 0.5) return '舒展了'
  if (d <= -1.5) return '合拢了些'
  if (d <= -0.5) return '收了收'
  return '静静的'
}
