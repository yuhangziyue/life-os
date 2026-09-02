// Aha 闸门（v3.6，第五轮圆桌五人共识）。
//
// ============ 为什么需要一道闸门 ============
// v3.5 上线一周，子曰的反馈是「Aha 时刻还不够明显」。
// 五个人独立诊断，全部指向同一个根因，而且没有一个人认为该把动效做得更响：
//
//   小艾（行为设计）：习惯化对刺激的**绝对强度**不敏感，对**可预测性**敏感。
//     一个每次提交都出现的定格，重复 5–8 次后神经反应基本归零 ——
//     跟它多大多亮多久无关。把 600ms 拉到 1200ms，第 8 次一样麻木，
//     但每天都多付 600ms 的记录成本。**「不够明显 ⇒ 做得更明显」这个方向是净负。**
//   老架（工程）：只要 composeLightShift 不返回 null 就 set aha ——
//     它是"记录后反馈"，不是"洞察时刻"。**24 条记录演 24 次 Aha 等于 0 次。**
//   小露（设计）：一个 2 击 3 秒的轻动作换回一屏要阅读的卡，
//     动作与回应的重量严重不匹配，于是用户学会了「记完就点关掉」。
//   Lisa（心理）：**Aha 不要调音量，要调分辨率。**
//
// ⇒ 所以第一动作不是加特效，是**减少触发次数**。
//
// ============ 最终执行流（三层，从弱到强）============
//   ① 每次记录：回执层（光带 in-place 240ms）+ 行动回响 Echo —— **提交后永不弹层**
//   ② 命中形态类发现且过闸门：**不当场播**，写一条待播事件，
//      **下次打开 app 时作为"进门的一眼"播**（小露那一刀）。
//      这样"追求触发"被彻底掐死 —— 提交后什么都不会来，就没有东西可追。
//   ③ 时刻类（深夜 / 清晨 / 当天首条）：不弹层，只改回执的手感与那一行字。
//
// ============ 闸门参数（小艾的语义 + 老架的存储）============
//   · 全部状态走 events 表，不另存 settings —— 两套记账迟早漂移（老架）
//   · 同 kind 冷却：形态 14 天 / 时刻 30 天 —— 抗习惯化是这条的全部目的（小艾）
//   · 每天上限 1 条，每周上限 3 条
//   · 样本地板：近 7 天 total impact ≥ 20 且参与分光 ≥ 4 片。
//     未达标只放行 first_ever / stage_up / awaken / week_light（这四类不看名次）
//     —— **前期分母太小，名次每天都在换，
//     那是分母噪声不是真事件，早期就播会把发现层的可信度一次性烧掉**（小艾）
//   · 静音（深夜 / 当日有 tired·vexed 心情）**不落任何事件行** ⇒ 不消耗冷却
//     （小艾要求这条必须在代码里写死一套，否则半年后没人记得那行算不算"播过了"）
//   · 补记（date 早于 createdAt）屏蔽**时刻类**，形态类允许 —— 形状变化在补记后是真的（老架）

import type { Action } from '../models/action'
import type { Dimension } from '../models/dimension'
import { lightShares } from './impression'

const DAY_MS = 24 * 60 * 60 * 1000

export type AhaKind =
  // 形态类：结构变了。允许在补记后触发
  | 'first_ever' | 'stage_up' | 'light_shift' | 'rank_swap' | 'awaken' | 'week_light'
  // 时刻类：此刻发生的事。补记时一律屏蔽
  | 'daily_first' | 'night_owl' | 'early_bird' | 'intent_set' | 'return_after_break'

/**
 * 每一类的人话名字（v3.7）—— 「那些美妙时刻」时间轴上给每条打一个标。
 *
 * 刻意都是**名词短语，不是评价**：写「花瓣醒来」不写「久违的坚持」，
 * 写「一周的光」不写「第一周达成」。标签是分类，不是奖状。
 */
export const AHA_LABEL: Record<string, string> = {
  first_ever: '第一笔光',
  stage_up: '状态跃迁',
  light_shift: '光的分配',
  rank_swap: '重心换了地方',
  awaken: '花瓣醒来',
  week_light: '一周的光',
  daily_first: '今天的第一笔',
  night_owl: '深夜',
  early_bird: '清晨',
  intent_set: '立下意图',
  return_after_break: '回来了',
}

const MOMENT_KINDS = new Set<AhaKind>([
  'daily_first', 'night_owl', 'early_bird', 'intent_set', 'return_after_break',
])
/** 样本地板未达标时仍然放行的四类（它们不看名次，所以与占比样本无关） */
const FLOOR_EXEMPT = new Set<AhaKind>(['first_ever', 'stage_up', 'awaken', 'week_light'])

export const FORM_COOLDOWN_DAYS = 14
export const MOMENT_COOLDOWN_DAYS = 30
export const DAILY_CAP = 1
export const WEEKLY_CAP = 3
/** 样本地板：近 7 天的 impact 总量与参与分光的花瓣数 */
export const FLOOR_IMPACT = 20
/**
 * 参与分光的花瓣数下限。
 * 🔴 必须是**相对值**（v3.7 修，小艾实测发现）：写成绝对 4 的话，
 * 一个只留 3 片花瓣的用户 `shares.length` 最大就是 3 ⇒ 地板恒为 false ⇒
 * 除豁免的那几类外全被挡掉，**连「今天第一笔」都永远拿不到**。
 * 8 片⇒4 · 5 片⇒4 · 4 片⇒3 · 3 片⇒2，向后完全兼容。
 */
export const FLOOR_PETALS = 4
export const floorPetalsFor = (dimCount: number) => Math.max(2, Math.min(FLOOR_PETALS, dimCount - 1))

export const EV_PLAYED = 'aha_played'
export const EV_KIND_PREFIX = 'aha_kind:'
export const EV_PENDING_PREFIX = 'aha_pending:'

export function startOfDay(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** 这条记录是不是补记：归属日早于真实提交日 */
export function isBackfill(action: Pick<Action, 'date' | 'createdAt'>): boolean {
  return startOfDay(action.date) < startOfDay(action.createdAt)
}

/**
 * 深夜（22:00–05:00）。判据用**真实时刻**，不用归属日 ——
 * 我们说的是「你此刻还坐在这里记」，不是「你记的那件事发生在深夜」。
 */
export function isNight(ts: number): boolean {
  const h = new Date(ts).getHours()
  return h >= 22 || h < 5
}

/** 清晨（05:00–08:59）。同一个事实，早晨是开阔，晚上就是指责 —— 分寸取决于几点 */
export function isEarly(ts: number): boolean {
  const h = new Date(ts).getHours()
  return h >= 5 && h < 9
}

/** 当日有 tired / vexed 心情的记录 ⇒ 坏日子，结构类发现全部静音（小艾的坏日子闸门） */
export function isRoughDay(actions: Action[], now = Date.now()): boolean {
  const t0 = startOfDay(now)
  return actions.some(a => a.date >= t0 && (a.mood === 'tired' || a.mood === 'vexed'))
}

/** 样本地板：账太薄的时候，名次变化只是分母噪声 */
export function hasSampleFloor(dimensions: Dimension[], actions: Action[], now = Date.now()): boolean {
  const shares = lightShares(dimensions, actions, now - 7 * DAY_MS, now)
  if (shares.length < floorPetalsFor(dimensions.length)) return false
  const total = shares.reduce((s, x) => s + x.weight, 0)
  return total >= FLOOR_IMPACT
}

export interface GateDeps {
  hasSince: (name: string, since: number) => Promise<boolean>
  countSince: (name: string, since: number) => Promise<number>
}

export type GateResult =
  | { pass: true }
  | { pass: false; reason: 'backfill_moment' | 'kind_cooldown' | 'daily_cap' | 'weekly_cap' | 'sample_floor' }

/**
 * 闸门。按「最便宜的判据先跑」排序，避免为一个必然被挡掉的 Aha 查三次库。
 *
 * @param opts.backfill  这次触发是否来自补记
 * @param opts.floorOk   样本地板是否达标（调用方先算好传进来，避免这里重复遍历 actions）
 */
export async function checkAhaGate(
  kind: AhaKind,
  deps: GateDeps,
  opts: { backfill?: boolean; floorOk?: boolean; now?: number } = {},
): Promise<GateResult> {
  const now = opts.now ?? Date.now()

  if (opts.backfill && MOMENT_KINDS.has(kind)) return { pass: false, reason: 'backfill_moment' }
  // 样本地板只管**形态类**：时刻类压根不依赖占比统计
  //（night_owl 只看几点、daily_first 只看今天有没有记过），
  // 拿占比样本去挡它们是判据错配（v3.7 修，与 C7 无关，本来就该这样）
  if (opts.floorOk === false && !FLOOR_EXEMPT.has(kind) && !MOMENT_KINDS.has(kind)) {
    return { pass: false, reason: 'sample_floor' }
  }

  const cooldownDays = MOMENT_KINDS.has(kind) ? MOMENT_COOLDOWN_DAYS : FORM_COOLDOWN_DAYS
  if (await deps.hasSince(`${EV_KIND_PREFIX}${kind}`, now - cooldownDays * DAY_MS)) {
    return { pass: false, reason: 'kind_cooldown' }
  }
  if (await deps.hasSince(EV_PLAYED, startOfDay(now))) return { pass: false, reason: 'daily_cap' }
  if (await deps.countSince(EV_PLAYED, now - 7 * DAY_MS) >= WEEKLY_CAP) {
    return { pass: false, reason: 'weekly_cap' }
  }
  return { pass: true }
}

/** 待播事件名。payload 指纹让"同一件事攒两次"只算一次 */
export function pendingKey(kind: AhaKind, fingerprint: string): string {
  return `${EV_PENDING_PREFIX}${kind}:${fingerprint}`
}
