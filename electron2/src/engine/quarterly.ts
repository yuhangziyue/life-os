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

/**
 * 这一程的锚点（v3.7）—— 84 天会谈与 30 天微校准都从它起算。
 *
 * ============ 这不是数据损坏，是查询错误（Lisa 第六轮实证）============
 * `gardenBirth()` 本身没错，错在**三个调用方全传的是 enabled 维度**。
 * 于是用户「让最早那片花瓣休息」之后，`min(createdAt)` 跳到第二早的那片，
 * **第 84 天和第 30 天一起被推后**，「陪你走过的时间」也会缩短。
 *
 * 真值一直在库里，没丢过：
 *   · `createdAt` **只在 `addDimension` 写入一次**，`updateDimension` 从不触碰它
 *     ⇒ 「让它休息」只改 `isEnabled`，`createdAt` 分毫未动 —— **不可变确证**
 *   · 而 `useCompanionDays` 那处算"花园诞生"用的就是**全量** `s.dimensions`
 *     ⇒ **同一个仓库里两处口径不一致，正确的那一处一直在**
 *
 * ============ 一个必须堵的边界 ============
 * `deleteDimension` 是**硬删**，没有软删标记。所以用户一旦**删除**（不是休息）
 * 最早那片花瓣，全量 `min` 也会跳。⇒ 所以真值必须**落库固化一次**，
 * 而且要在**首次进门时立即写**，不能懒加载到"用户第一次打开花园页"——
 * 懒加载会撞上"先去设置页删了一片瓣、再打开花园"这条完全正常的路径，
 * 然后把错值固化成权威源。写入点在 `loadData`（每次启动都跑，且在任何删除动作之前）。
 *
 * ============ 迁移对用户静默 ============
 * 写进去的是真值，他看到的天数不会变，没有任何可见变化。
 * 说了反而制造"我的数据出过问题"的不安，而这产品最不能让用户怀疑的就是账的可信度。
 * 口径：**沉默在用户没有损失的时候是尊重。只有当修正会让可见数字改变时，产品才必须开口。**
 *
 * @param allDimensions **全量**维度，不许过滤 isEnabled —— 过滤就是这个 bug 本身
 * @param storedAnchor  已固化的锚点（settings 里的 seasonAnchorAt）。有就用它，它是权威源
 */
export function seasonAnchor(
  allDimensions: Dimension[],
  lastCompletedAt: number | null,
  storedAnchor: number | null,
): number {
  // 完成过季度会谈的用户，锚点本就该是那次会谈 —— **显式事件，永不漂移**
  if (lastCompletedAt != null) return lastCompletedAt
  if (storedAnchor != null && storedAnchor > 0) return storedAnchor
  return gardenBirth(allDimensions)
}

export function quarterlyState(
  reviews: QuarterlyReview[],
  /** ⚠️ 传**全量**维度，不是 enabled —— 过滤会让锚点随「让它休息」漂移（见 seasonAnchor） */
  dimensions: Dimension[],
  defer: { until: number; count: number },
  now = Date.now(),
  /** 固化的这一程起点（store 的 seasonAnchorAt）。0/null = 还没固化，退回全量 min */
  storedAnchor: number | null = null,
): QuarterlyState {
  const completed = reviews
    .filter(r => r.completedAt != null)
    .sort((a, b) => (b.completedAt as number) - (a.completedAt as number))
  const lastCompleted = completed[0] ?? null
  const draft = reviews.find(r => r.completedAt == null) ?? null

  const anchor = seasonAnchor(dimensions, lastCompleted?.completedAt ?? null, storedAnchor ?? null)
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
