// 连续记录周数 —— 这个产品唯一的北极星指标（v3 圆桌拍板：成功 = 连续使用周数）。
//
// 为什么是「周」而不是「天」：
//   天粒度就是 streak，streak 必然带来断签焦虑，而去惩罚化是这产品的准入条件。
//   周粒度容得下「这周忙，只记了一条」——**一条也算这周在场**。
//   我们庆祝在场，不惩罚缺席。
//
// 为什么本周没记也不算断：
//   周一早上打开，本周当然还没有记录。让它当场归零是纯粹的设计事故。
//   所以本周无记录时，从上一周开始数；只有上一周也空了，才真的是 0。

import type { Action } from '../models/action'

const DAY_MS = 24 * 60 * 60 * 1000
const WEEK_MS = 7 * DAY_MS

/** 周一为一周之始，与 Review 页、demoSeed 的周期口径一致 */
export function startOfWeek(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  const wd = d.getDay()                 // 0 = 周日
  const back = wd === 0 ? 6 : wd - 1
  return d.getTime() - back * DAY_MS
}

/**
 * 连续有记录的周数（含本周；本周还空着则从上周起算）。
 * 只算已完成的记录 —— 与光带、评分同一条口径。
 */
export function consecutiveWeeks(actions: Action[], now: number = Date.now()): number {
  const weeks = new Set<number>()
  for (const a of actions) {
    if (!a.isCompleted) continue
    weeks.add(startOfWeek(a.date))
  }
  if (weeks.size === 0) return 0

  const thisWeek = startOfWeek(now)
  // 本周还没记 ⇒ 不算断，从上周开始数
  let cursor = weeks.has(thisWeek) ? thisWeek : thisWeek - WEEK_MS
  let n = 0
  while (weeks.has(cursor)) {
    n++
    cursor -= WEEK_MS
  }
  return n
}
