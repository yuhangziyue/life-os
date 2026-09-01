// 除「光的分配」之外的 Aha 判据与文案（v3.6.1）。
//
// 上一轮把闸门（ahaGate）与主通道（lightShift）做完了，但闸门枚举的 10 种 kind 里
// **只有 light_shift 真的接了线**。子曰点名的三条因此还没兑现：
//   ② 某个花瓣达到某状态  → stage_up（形态类）
//   ③ 每天的 / 每片的第一条 → daily_first（时刻类，走回执文案）· awaken（形态类）
//   ④ 设好目标并定好计划   → intent_set（时刻类，但值得一屏定格）
// 这个文件补上判据与文案；接线在 store 的 addAction / updateDimension 里。
//
// ============ 分档纪律（第五轮圆桌）============
// **形态类**（结构变了）：攒起来，下次进门作为一屏定格播。补记也允许触发。
// **时刻类**（此刻发生的事）：不弹层，只改回执那一行字。补记一律屏蔽。
//   例外：intent_set 是时刻类里唯一值得一屏定格的 —— 它不是"记了一笔"，
//   是"你刚为一片花瓣定了意图"，而定格帧要做的正是把那份意图的代价当场画出来。
//
// ============ 文案纪律 ============
// 全部句子过晓雅的禁词表与 Lisa 的六问表：
//   零评价词（恭喜/真棒/进步/坚持/加油/难得）· 零感叹号 · 零方向箭头 ·
//   不出现「连续」· 状态跃迁**升降双向都报**（只报升档就是奖励机制）·
//   给日期不给天数（位置不产生账，计量会被读成账）。

import type { Action } from '../models/action'
import type { Dimension } from '../models/dimension'
import { scoreAfterAdding, scoreStage } from './scoring'
import { startOfDay } from './ahaGate'

const DAY_MS = 24 * 60 * 60 * 1000
/** 合拢多少天以上再拿到光，才算「唤醒」而不是「隔了两天」 */
export const AWAKEN_AFTER_DAYS = 14

// ========== ② 状态跃迁（stage_up）==========

export interface StageShift {
  dimensionId: string
  name: string
  colorHex: string
  from: string
  to: string
  /** 升档 or 降档。降档也必须报 —— 只报升档就是奖励机制（小露一轮坚持） */
  direction: 'up' | 'down'
}

/**
 * 这一条记录会不会让某片花瓣跨档。
 *
 * 🔴 before 与 after 必须来自**同一个基准**：都用 `scoreAfterAdding(…, impact)`，
 *   before 传 impact = 0。
 *   曾经写成 `scoreStage(dimension.currentScore)` vs 现算的 after —— 那是两个基准：
 *   `currentScore` 是上一次 loadData 写回的缓存，一旦陈旧（刚导入、刚迁移、
 *   或任何一次没走 loadData 的写入）就会凭空报出一次跨档，或者漏掉一次真的跨档。
 */
export function detectStageShift(params: {
  dimension: Dimension
  actionsBefore: Action[]
  impact: number
}): StageShift | null {
  const { dimension, actionsBefore, impact } = params
  const before = scoreStage(scoreAfterAdding(dimension, actionsBefore, 0))
  const after = scoreStage(scoreAfterAdding(dimension, actionsBefore, impact))
  if (before === after) return null
  return {
    dimensionId: dimension.id,
    name: dimension.name,
    colorHex: dimension.colorHex,
    from: before,
    to: after,
    direction: 'up',   // 记录只会加分，降档由休眠造成，不走这条路径
  }
}

/**
 * 状态跃迁那句。只报形态与事实，不加语气、不加庆祝。
 * 第二行是硬性要求（Lisa 一轮）：**同一屏必须带上「谁在合」，并且不带惋惜** ——
 * 「合着不是辜负」不能只写在设计文档里，它必须每次都在场。
 */
export function stageShiftLines(shift: StageShift, dormantNames: string[]): string[] {
  const lines = [`${shift.name}从${shift.from}去到了${shift.to}。`]
  if (dormantNames.length > 0) {
    lines.push(`同一段时间，${dormantNames.slice(0, 2).join('、')}一直合着。`)
  }
  return lines
}

// ========== ③-b 花瓣唤醒（awaken）==========

export interface Awaken {
  dimensionId: string
  name: string
  colorHex: string
  /** 上一次拿到光的那天。**给日期不给天数** */
  lastAt: number
}

export function detectAwaken(params: {
  dimension: Dimension
  actionsBefore: Action[]
  now?: number
}): Awaken | null {
  const { dimension, actionsBefore } = params
  const now = params.now ?? Date.now()
  const mine = actionsBefore.filter(a => a.isCompleted && a.dimensionId === dimension.id)
  if (mine.length === 0) return null              // 从没记过 ⇒ 那是「第一次」不是「唤醒」
  const lastAt = Math.max(...mine.map(a => a.date))
  if (startOfDay(now) - startOfDay(lastAt) < AWAKEN_AFTER_DAYS * DAY_MS) return null
  return { dimensionId: dimension.id, name: dimension.name, colorHex: dimension.colorHex, lastAt }
}

/** 「回来了 / 久违 / 终于」都是评价，一个都不用。给日期，让他自己算（小艾一轮） */
export function awakenLine(a: Awaken): string {
  const d = new Date(a.lastAt).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })
  return `${a.name}上一次拿到光，是 ${d}。`
}

// ========== ③-a 当天第一条（daily_first，时刻类 → 回执文案）==========

export function isDailyFirst(actionsBefore: Action[], now = Date.now()): boolean {
  const t0 = startOfDay(now)
  return !actionsBefore.some(a => a.isCompleted && a.date >= t0)
}

/**
 * 时刻类的回执那一行。**不写「今天的第一条」** ——
 * 「第一」暗示还有第二，暗示今天还不够（Lisa 一轮）。改成把它当当天光带的开场。
 */
export const DAILY_FIRST_LINE = '今天的账，开了。'
export const PETAL_FIRST_LINE = (name: string) => `${name}以前是空的。从今天起不是了。`
/** 深夜：全产品最短的一行。产品认出了这是什么时刻，于是它收声 */
export const NIGHT_LINE = '记下了。'
export const EARLY_LINE = '天刚亮，今天的账就开了。'

// ========== ④ 立了约定（intent_set）==========

export interface IntentSet {
  dimensionId: string
  name: string
  colorHex: string
  /** 想要开到哪。null = 只立了约定没写目标 */
  target: number | null
  /** 现在的状态词 */
  nowStage: string
  pactLine: string | null
}

export function composeIntentSet(dimension: Dimension): IntentSet {
  return {
    dimensionId: dimension.id,
    name: dimension.name,
    colorHex: dimension.colorHex,
    target: dimension.targetScore,
    nowStage: scoreStage(dimension.currentScore),
    pactLine: dimension.pactTiming && dimension.pactText
      ? `每个${dimension.pactTiming}，${dimension.pactAnchor}之后，我去${dimension.pactText}。`
      : null,
  }
}

/**
 * 立约定那一屏的两行。
 * 🔴 第二行是这条 Aha 存在的全部理由（晓雅一轮）：**设定计划的当场必须显示代价** ——
 *   你说要给这片多一些，那些光眼下在别处。不显示这个，计划就退化成待办清单。
 * 受损方仍然不具名（红线 v2）：只有一端具名时，剩下的是守恒陈述，不是道德归因。
 */
export function intentSetLines(i: IntentSet): string[] {
  const lines: string[] = []
  if (i.target != null) {
    lines.push(`你想让${i.name}开到 ${i.target.toFixed(0)}。它现在是${i.nowStage}。`)
    lines.push('多给它一些，就是别处少一些。这条带子本来就是这样。')
  } else {
    lines.push(`你和${i.name}有了一个约定。`)
  }
  if (i.pactLine) lines.push(i.pactLine)
  lines.push('它不会主动来找你。你在记一笔时选到这片花瓣，它会自己出现。')
  return lines
}

// ========== 第 7 天「一周的光」（week_light，形态类）==========
//
// 四个 Aha 是一条递进线（v3.5 设计稿第四节）：
//   第 1 天一张快照 → 每次记录一次分配 → **第 7 天一段趋势** → 第 84 天一次结算。
// 这一条是那条线上唯一还缺的一环，也是「连续证据」第一次真正生效的时刻：
// 攒了七天，形状第一次不是一天的偶然，而是一周的事实。
//
// 🔴 它只在**花园生日满 7 天、且这七天里至少 4 天有记录**时出现一次（终身一次）。
//   四天是「一周的形状」成立的最低样本 —— 两三天的形状还是偶然，说它是趋势就是过度解读。

export const WEEK_LIGHT_MIN_DAYS = 4
export const WEEK_LIGHT_SEEN_KEY = 'ahaWeekLightSeen'

export function detectWeekLight(params: {
  actions: Action[]
  gardenBornAt: number
  now?: number
}): { daysWithRecord: number } | null {
  const { actions, gardenBornAt } = params
  const now = params.now ?? Date.now()
  if (startOfDay(now) - startOfDay(gardenBornAt) < 7 * DAY_MS) return null

  const days = new Set<number>()
  for (const a of actions) {
    if (!a.isCompleted) continue
    const d = startOfDay(a.date)
    if (d > startOfDay(now) || d < startOfDay(now) - 6 * DAY_MS) continue
    days.add(d)
  }
  if (days.size < WEEK_LIGHT_MIN_DAYS) return null
  return { daysWithRecord: days.size }
}

/**
 * 那两行。第一行是事实（七天的形状第一次成立），第二行把它接回产品的立论。
 * 不出现「坚持」「连续」「不错」—— 它报告的是**证据够了**，不是**你做到了**。
 */
export function weekLightLines(info: { daysWithRecord: number }): string[] {
  return [
    `这七天里有 ${info.daysWithRecord} 天留下了记录。`,
    '够画出一个形状了 —— 从这里开始，光的去处不再是某一天的偶然。',
  ]
}

// ========== 「留给自己的一句话」（v3.6.2，小艾提案 F + Lisa 三轮四条改造）==========
//
// 断层的本质是零催办把外部 prompt 砍掉了，只剩两条路：上下文触发（约定）与内部触发（这条）。
// 形态：记录面板底部一行可选输入；下次打开「今天」时**署上日期**显示出来。
//
// ============ 为什么它不是催办 ============
// 系统一个字都没说，说话的是几天前的他自己。承诺一致性在这里是**用户对自己**生效的，
// 产品只是信箱。蔡格尼克在这里的正确用法不是「任务未完成」的红点张力（那是催办），
// 而是**一句没有回音的话** —— 人对自己留给自己的话有回复冲动，而这种冲动不产生愧疚，
// 因为没人在等。
//
// ============ Lisa 三轮的四条硬约束（缺一条它就变成钉在首屏的指控）============
//   a) placeholder 把动词从「做」移到「知道」：「想让下次的自己知道什么」——
//      「知道」不构成任务。这是零校验的软引导，比任何输入限制都有效。
//      🔴 她**明确拒绝对输入做句式约束**：「约束用户能对自己说什么话，是产品越权。」
//   b) 读侧的动作只有「收起这句」，**永不出现「完成」** ——
//      一条他没做到的「一定要去体检」不会因此变成一件未完成事项
//   c) **会过期**：最多显示 7 天。「如果它永远挂在那里，那句没做到的话
//      就变成一枚钉在首屏上的指控。时间是唯一的解药：它必须会自己走。」
//   d) 永远只显示一条，不显示条数、不显示「已过 X 天」、不显示角标
//
// 另加小艾的「退一步」形态：**不置顶** —— 置顶就是待办位。它混在「今天」的内容流里，
// 与其他卡片同级。

export const NOTE_KEY = 'selfNote'
export const NOTE_TTL_DAYS = 7
export const NOTE_PLACEHOLDER = '想让下次的自己知道什么'

export interface SelfNote {
  text: string
  at: number
}

export function parseSelfNote(raw: string | null, now = Date.now()): SelfNote | null {
  if (!raw) return null
  try {
    const n = JSON.parse(raw) as SelfNote
    if (!n?.text) return null
    // 过期即消失（约束 c）。不是"标记为过期"，是真的不再出现
    if (startOfDay(now) - startOfDay(n.at) >= NOTE_TTL_DAYS * DAY_MS) return null
    return n
  } catch {
    return null
  }
}

/** 「8 月 24 日的你留下：……」—— 署上日期，它就从一条待办变回一封来自过去的自己的短信 */
export function selfNoteLead(n: SelfNote): string {
  return `${new Date(n.at).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })}的你留下`
}
