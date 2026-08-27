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
  /**
   * 这是不是这座花园的**第一笔光**。
   *
   * 🔴 v3.5 的判据是 `before.size === 0`，那判的是「近 7 天窗口内没有光」——
   *   于是**用户断记 7 天后回来的第一条，会被告知「这是这座花园的第一笔光」**。
   *   Lisa 把它定级为 P0：产品说的实际内容是「我不记得你」，
   *   而这个产品对他的全部承诺就是"我在替你攒证据、陪伴天数永不清零"，
   *   这一句正面推翻了那个承诺，伤害等级高于任何一句用词不当。
   */
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
    // 判据必须是全库、且看写入前的那一份
    firstEver: actionsBefore.filter(a => a.isCompleted).length === 0,
  }
}

/** 占比写成整数百分比。四舍五入到个位 —— 账本不需要小数点 */
export const pct = (share: number) => Math.round(share * 100)

/**
 * 定格那一句（v3.6 第五轮圆桌定稿，三轮才收敛）。
 *
 * 演进过程值得留档，因为它是这套文案纪律的由来：
 *   v3.5：「今天的光，你分给了休闲娱乐。」
 *     → 晓雅判定为**安全句子**并推翻：只写了收方，代价缺席，
 *       而「代价可见」是这个产品全部的立论。
 *   一轮：「今天这点光，你从职业发展那边挪给了休闲娱乐。」
 *     → Lisa 反对：「挪」+ 人称主语 +「给」+ 同屏下降箭头，四者叠加 = 挪用，
 *       产品在无意中做了**记账式的道德归因**（我玩了一会儿，事业掉了 1 个点）。
 *   二轮：小露改用「让开」，Lisa 批准「让」句式。
 *   三轮：晓雅**驳回「让开」并自我撤回一轮的「让出来的」**——
 *       「让 = 美德，一旦让是好事，没让的就成了不好」，道德还在，只是换了方向。
 *       Lisa 接受并撤回自己批准过的「让」句式：
 *       「我 R2 想护的是付方尊严，但代价是给八片排了德性次序，这个代价更大。」
 *
 * ⇒ 最终动词是**「分」**：中性、公平、零偷意。
 * ⇒ 受损方**默认不具名**（用「别处」）：因果归因需要两个具名端点才能闭环，
 *    只有一端具名时，剩下的只是一句守恒陈述 —— 代价还在，罪名没了（晓雅红线 v2）。
 * ⇒ **唯一例外**：付方正是本季焦点那片时具名 ——
 *    焦点是用户自己写下的宣称，指名它是**引用他**，不是指控他。
 */
export function shiftFact(shift: LightShift, focusYieldName?: string | null): string {
  if (focusYieldName) {
    return `今天的光落在${shift.gained.name}。${focusYieldName}这次分得少。`
  }
  return `今天的光偏向了${shift.gained.name}，别处就分得少。`
}

/**
 * 首次达成时才说的那一句。说一次就够，说第二次是说教。
 * 末句「这条带子本来就是这样」是晓雅改的指代：
 * 把守恒从「你的行为后果」彻底还给世界 —— 没有这句，守恒就是他造成的。
 */
export const LIGHT_LAW =
  '一天的光只有一份。给了谁多一点，就是别处少一点 —— 这条带子本来就是这样。'

/**
 * 占比变化的三种边界（老架给判据，晓雅给边界句）。
 *   unchanged：值压根没动 ⇒ 不该演
 *   sub_pct  ：动了，但四舍五入后同值 ⇒「这一下太轻，带子还没动。」
 *   moved    ：跨过了整数边界
 * 🔴 unchanged 与 sub_pct 必须分开，语义不同不能合并（老架三轮强调）。
 * 判据只能用 Math.round —— floor 会让 12.9 显示成 12，用户读到「从 12 到 12」以为没动，其实动了。
 */
export function shareDelta(from: number, to: number): {
  fromPct: number; toPct: number; kind: 'unchanged' | 'sub_pct' | 'moved'
} {
  const fromPct = Math.round(from * 100)
  const toPct = Math.round(to * 100)
  if (fromPct !== toPct) return { fromPct, toPct, kind: 'moved' }
  return { fromPct, toPct, kind: to > from ? 'sub_pct' : 'unchanged' }
}

/** 这一下太轻的那句。它是全产品最便宜的一次教学：让人第一次知道一条随手记的重量 */
export const TOO_LIGHT = '这一下太轻，带子还没动。'

/** 记住「已经说过了」的 settings key */
export const LIGHT_LAW_SEEN_KEY = 'ahaLightExplained'
