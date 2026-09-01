import type { Action } from '../models/action'
import type { Dimension } from '../models/dimension'
import { lightShares } from './impression'

/**
 * 复盘摘要句（v3.7 B6，书香供稿）—— 替换原来那句 `autoSummary`。
 *
 * ============ 原来那一句为什么必须整句重写 ============
 * ```
 * 共记录 12 条行动，完成 5 条。得分最高的维度是「职业发展」(7.8)，
 * 最需要关注的是「休闲娱乐」(2.1)。
 * ```
 * 三处都撞红线，而且是最硬的那几条：
 *   ① **「最需要关注」** —— 这是**系统在下判决**，而且判的正是那片合着的花瓣。
 *      子曰给这张卡改名的理由就是「『系统』这个词不对，这卡里是我的记录，不是系统的结论」。
 *      书香判定：**那句「最需要关注」才是「系统在下结论」的真身**，改名不改它等于没改。
 *   ② **括号里的精确分数** —— 复盘页可以有量（红线 4 管的是首屏），
 *      但「7.8 vs 2.1」并置就是成绩单，而这两个数在占比模型里必然一个高一个低。
 *   ③ **「完成 5 条」** —— 「完成」这个词把记录变成了待办清单的勾。
 *
 * ============ 三个尺度报的不是同一件事 ============
 * 三版不是同一句换时间词（那样做等于只有一句）：
 *   · 周报**动作**：记了多少、其中几条来自花园的提醒
 *   · 月报**铺展**：落在几片花瓣上 —— 单月的总量没有意义，铺开的宽度才有
 *   · 年报**变化**：上半年重心 vs 下半年重心 ——
 *     年尺度上总量没有信息量，**重心迁移才是「代价可见」的正脸**
 *
 * ============ 两条硬约束 ============
 * 🔴 **样本地板：少于 3 条时只报事实与落点，不做「最多/最少」的排序。**
 *    两条记录谈最多最少，那是在挑剔。（与 `shape.ts` 的 `thin` 分支同一条逻辑）
 * 🔴 **只有一条时不报数，改用汉字数词，且不排序。**
 *    「1 条」是计量，「一条」是叙述 —— 孤单感来自前者。
 *
 * 🔴 年摘要里**绝不出现「最长连着记了 N 天」** —— 那是连击（红线 6 已判死），
 *    而年度总结是它最容易溜进来的地方。
 */

export type ReviewPeriod = 'week' | 'month' | 'year'

const PERIOD_WORD: Record<ReviewPeriod, string> = {
  week: '这一周',
  month: '这个月',
  year: '这一年',
}

/** 卡片标题。子曰给的是「记录数据摘要」，这里把作者归还给用户 —— 见方案结论 7 */
export const summaryTitle = (period: ReviewPeriod) => `${PERIOD_WORD[period]}你记下的`

const CN_NUM = ['零', '一', '两', '三', '四', '五', '六', '七', '八', '九', '十']

/** 少量计数用汉字数词。超过十就回到阿拉伯数字 —— 汉字数词到「十几」会变啰嗦 */
const cn = (n: number) => (n >= 0 && n <= 10 ? CN_NUM[n] : String(n))

export interface ReviewSummary {
  text: string
  /** 命中的哪一支，e2e 与埋点用 */
  kind: 'empty' | 'single' | 'thin' | 'full'
}

export function composeReviewSummary(
  period: ReviewPeriod,
  dimensions: Dimension[],
  actions: Action[],
  periodStart: number,
  periodEnd: number,
): ReviewSummary {
  const rows = actions.filter(a => a.isCompleted && a.date >= periodStart && a.date <= periodEnd)
  const word = PERIOD_WORD[period]

  if (rows.length === 0) {
    return {
      kind: 'empty',
      // 「空着也是一种记录」这半句是必要的：一张说「没有记录」就收尾的卡，
      //   会让用户觉得这一周作废了。而它其实说明时间去了别处 —— 那也是账。
      text: `${word}还没有记录。空着也是一种记录 —— 它说明${word}的时间去了别处。`,
    }
  }

  const shares = lightShares(dimensions, actions, periodStart, periodEnd)

  if (rows.length === 1) {
    const only = shares[0]
    return {
      kind: 'single',
      text: only
        ? `${word}你记下了一条，落在「${only.name}」。`
        : `${word}你记下了一条。`,
    }
  }

  // 样本地板：少于 3 条不排序，只报事实与落点
  if (rows.length < 3 || shares.length === 0) {
    const names = shares.map(s => `「${s.name}」`).join('、')
    return {
      kind: 'thin',
      text: names
        ? `${word}你记下了${cn(rows.length)}条，落在${names}。`
        : `${word}你记下了${cn(rows.length)}条。`,
    }
  }

  const top = shares[0]
  const bottom = shares[shares.length - 1]

  if (period === 'year') {
    // 年报变化：上下半年重心换没换。这是年尺度唯一有信息量的东西
    const mid = periodStart + (periodEnd - periodStart) / 2
    const h1 = lightShares(dimensions, actions, periodStart, mid)
    const h2 = lightShares(dimensions, actions, mid, periodEnd)
    if (h1.length > 0 && h2.length > 0) {
      return h1[0].name === h2[0].name
        ? { kind: 'full', text: `这一年，光最多落在「${h1[0].name}」，上下半年都是它。` }
        : { kind: 'full', text: `这一年，上半年光最多落在「${h1[0].name}」，下半年是「${h2[0].name}」。` }
    }
    // 某半年无数据 ⇒ 退回月版句式（不硬凑一个不存在的对比）
    return { kind: 'full', text: `这一年，你的光落在${cn(shares.length)}片花瓣上，最多的是「${top.name}」。` }
  }

  if (period === 'month') {
    // 月报铺展：落在几片上
    return {
      kind: 'full',
      text: `${word}你记下${rows.length}条，落在${cn(shares.length)}片花瓣上。`
        + `光最多的是「${top.name}」，最少的是「${bottom.name}」。`,
    }
  }

  // 周报动作。「其中 N 条来自花园的提醒」这一句刻意不做 ——
  //   `Action` 没有来源字段，而**猜出来的数比没有更坏**（它会被当真且用户无法证伪）。
  //   见 v3.7 方案停车场。
  return {
    kind: 'full',
    text: `${word}你记下${rows.length}条。光最多落在「${top.name}」，最少落在「${bottom.name}」。`,
  }
}

/**
 * 年回顾的开场句 —— **先给一个他不可能失败的数，再谈分配**（Lisa 第四轮）。
 *
 * 陪伴天数是全产品唯一只增不减、无法被读成不足的数，
 * 也是「日期可给，天数不给」这条口径的**唯一豁免**。
 * 用汉字数词而不是阿拉伯数字：`324` 是计量，「三百二十四」是叙述。
 */
export function yearOpeningLine(companionDays: number): string {
  return `这一年，这朵花陪了你 ${cnBig(companionDays)} 天。`
}

/** 汉字数词（到千位就够 —— 再多说明这产品活过了三年，那时再说） */
function cnBig(n: number): string {
  if (n <= 10) return CN_NUM[n]
  const digits = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九']
  const out: string[] = []
  const h = Math.floor(n / 100)
  const t = Math.floor((n % 100) / 10)
  const o = n % 10
  if (h > 0) out.push(digits[h], '百')
  if (t > 0) out.push(t === 1 && h === 0 ? '' : digits[t], '十')
  else if (h > 0 && o > 0) out.push('零')
  if (o > 0) out.push(digits[o])
  return out.join('')
}

/**
 * 空态（还没到这个尺度就点进来的人看到什么）。
 *
 * 三条都不能做：不能写"数据不足"（系统语言，且暗示他不够）、不能给空图、
 * **更不能拦住不让进** —— 拦住等于说「你还不够资格」。
 *
 * 三行分工（Lisa 定稿）：
 *   ① 主语是「这一年」不是「你」 —— 说人不说你，就不会被读成评价
 *   ② 说清这里以后会有什么。是信息，不是承诺，**不带日期**
 *   ③ 给横向出口，而且必须是「去看」不是「去记」——
 *      `先去看看这一周吧` 是导航；「记几笔就有了」是催办。
 *      **这条界限就是零催办在空态里的具体形态。**
 */
export function emptyPeriodLines(period: ReviewPeriod): string[] {
  if (period === 'year') {
    return [
      '这一年才刚开始记。',
      '等记录多一些，这里会有你这一年的分配。',
      '先去看看这一周吧。',
    ]
  }
  if (period === 'month') {
    // 月不给第三行 —— 它离「这一周」太近，指过去显得多余
    return ['这个月才刚开始记。', '等记录多一些，这里会有这个月的分配。']
  }
  return ['这一周还没有记录。', '空着也是一种记录 —— 它说明这一周的时间去了别处。']
}

/** 「我的思考」占位。三句各治一件事：周治门槛 · 月治叙事压力 · 年治瘫住和下判决 */
export const THINKING_PLACEHOLDER: Record<ReviewPeriod, string> = {
  week: '随手写，不用写成总结。一句也算，也可以只留一个词。',
  month: '一个月的事，想到哪写到哪，不用理顺。',
  year: '不必写完一年。写你现在想得起来的那几件就好。',
}
