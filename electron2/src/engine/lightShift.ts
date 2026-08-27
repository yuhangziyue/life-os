// 「光的分配」（v3.5 M5）—— 全产品唯一的 Aha 时刻背后的那点算术。
//
// 为什么它是唯一合法的 Aha：
//   定位 v2.0 第四节把这件事说透了 —— 真需求发作在「结算时刻」（体检报告、伴侣一句话、
//   离职前夜），不在今天；而记录必须天天做。低频需求 + 高频动作 = 天然的留存断层。
//   解法不能是提醒（违反去惩罚化定性），只能是**让每次记录当场给出一点账本感**。
//
// 这个模块算的就是那点账本感：一条记录落下去之后，八段光的占比各自动了多少。
//   八段之和恒为 100% ⇒ 你这段变宽，其余必然被挤窄。
//   「代价」在数学上就是这句话，不需要任何文案去渲染。
//
// 红线：这里只产出**事实**（谁从多少变成多少），不产出评价。
//   没有「进步」「上涨」「加油」，也没有分数增量 —— 分数是绝对量会到顶，占比才互斥。

import type { Action } from '../models/action'
import type { Dimension } from '../models/dimension'
import { lightShares } from './impression'
import { scoreAfterAdding } from './scoring'

const DAY_MS = 24 * 60 * 60 * 1000
/** 与 LightBand 首页口径一致：近 7 天。改这里要连带改 LightBand 的 days 默认值 */
export const LIGHT_WINDOW_DAYS = 7

export interface LightSegment {
  dimensionId: string
  name: string
  colorHex: string
  /** 记录前的占比（0–1） */
  from: number
  /** 记录后的占比（0–1） */
  to: number
}

export interface LightShift {
  /** 每次都换，让 React 重放动画 */
  key: string
  /** 全部参与分光的花瓣，按「记录后占比」降序 —— 与光带的呈现顺序一致 */
  segments: LightSegment[]
  /** 这次得到光的那一片 */
  gained: LightSegment
  /** 被挤窄的花瓣，按让出的幅度降序（可能为空：首条记录时无人可让） */
  yielded: LightSegment[]
  /** 花瓣补间用：维度 id → 分数。before/after 只有 gained 那片不同 */
  scoresBefore: Record<string, number>
  scoresAfter: Record<string, number>
  /** 这是不是这个花园的第一笔光（首条记录没有「从别人那里挪」这回事） */
  firstEver: boolean
}

/**
 * 算出一条记录带来的光的重新分配。
 *
 * @param actionsBefore 写入**之前**的全量行动（store 在 addAction 里持有的那份）
 * @param added         刚写进去的那条
 */
export function composeLightShift(params: {
  dimensions: Dimension[]
  actionsBefore: Action[]
  added: Action
  now?: number
  days?: number
}): LightShift | null {
  const { dimensions, actionsBefore, added } = params
  const now = params.now ?? Date.now()
  const days = params.days ?? LIGHT_WINDOW_DAYS
  const since = now - days * DAY_MS

  const dim = dimensions.find(d => d.id === added.dimensionId)
  if (!dim) return null
  // 未完成的记录不参与分光（lightShares 只算 isCompleted），那就没有 Aha 可演
  if (!added.isCompleted) return null

  const before = new Map(
    lightShares(dimensions, actionsBefore, since, now).map(s => [s.dimensionId, s.share]),
  )
  const afterList = lightShares(dimensions, [...actionsBefore, added], since, now)
  const after = new Map(afterList.map(s => [s.dimensionId, s.share]))

  // 参与者 = 前后任一时刻有光的花瓣。只出现在 before 的（占比被挤到 0 是不可能的，
  // 但窗口边界滑走时会发生）也要留着，否则光带会凭空少一段。
  const ids = new Set<string>([...before.keys(), ...after.keys()])
  const segments: LightSegment[] = dimensions
    .filter(d => ids.has(d.id))
    .map(d => ({
      dimensionId: d.id,
      name: d.name,
      colorHex: d.colorHex,
      from: before.get(d.id) ?? 0,
      to: after.get(d.id) ?? 0,
    }))
    .sort((a, b) => b.to - a.to)

  const gained = segments.find(s => s.dimensionId === dim.id)
  if (!gained) return null

  const yielded = segments
    .filter(s => s.dimensionId !== dim.id && s.from - s.to > 0.0001)
    .sort((a, b) => (b.from - b.to) - (a.from - a.to))

  const scoresBefore: Record<string, number> = {}
  const scoresAfter: Record<string, number> = {}
  for (const d of dimensions) {
    scoresBefore[d.id] = d.currentScore
    scoresAfter[d.id] = d.currentScore
  }
  scoresAfter[dim.id] = scoreAfterAdding(dim, actionsBefore, added.impact)

  return {
    key: added.id,
    segments,
    gained,
    yielded,
    scoresBefore,
    scoresAfter,
    firstEver: before.size === 0,
  }
}

/** 占比写成整数百分比。四舍五入到个位 —— 账本不需要小数点 */
export const pct = (share: number) => Math.round(share * 100)

/**
 * 定格那句话。两行都是事实：
 *   第一行是占比变化（由组件按段渲染），第二行是**归属**，不是评价。
 * 「你分给了 X」——分配是一个中性动作，它既不是成就也不是辜负。
 */
export function shiftFact(shift: LightShift): string {
  return `今天的光，你分给了${shift.gained.name}。`
}

/** 首次达成时才说的那一句。说一次就够，说第二次是说教 */
export const LIGHT_LAW =
  '这条色带的总和永远是 100%。你给谁多一点，就是从别人那里挪。'

/** 记住「已经说过了」的 settings key */
export const LIGHT_LAW_SEEN_KEY = 'ahaLightExplained'
