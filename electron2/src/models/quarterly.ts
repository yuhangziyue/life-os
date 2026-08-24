// 季度校准会谈（v3.2）——设计稿 design-focus-quarterly.md §4
//
// 会谈是史料，焦点是状态。这张表存的是「那个傍晚我认真回答了什么」，
// 十二周后第一幕要把它原样读出来——产品对用户的守约（书香 B3）。

/** 一次会谈的五幕；0 = 尚未开始 */
export type QuarterlyAct = 0 | 1 | 2 | 3 | 4 | 5

export interface QuarterlyReview {
  id: string
  startedAt: number
  /** null = 草稿（中途保存态）。草稿永不过期、不催办 */
  completedAt: number | null
  /** 走到第几幕（1-5），断点续谈用 */
  actProgress: number
  /** 第二幕留档：{dimensionId: score} */
  scores: Record<string, number>
  /** 各幕的自由书写，全部可空：{actNo: text} */
  reflections: Record<string, string>
  /** 第四幕：0-2 个焦点维度 id */
  focusDimensionIds: string[]
  /** 第五幕一句话，可空 */
  intent: string
}

/** 一个周期 = 滚动十二周。不绑日历季度：用户的季度从 TA 开始照顾花园那天长出来 */
export const QUARTER_DAYS = 84
export const QUARTER_MS = QUARTER_DAYS * 24 * 60 * 60 * 1000
/** 焦点上限。选 0 个也是合法答案——「这一季我想均匀地陪着它们」 */
export const MAX_FOCUS = 2

export function parseQuarterlyRow(row: any): QuarterlyReview {
  const safeParse = (raw: any, fallback: any) => {
    try { return raw ? JSON.parse(raw) : fallback } catch { return fallback }
  }
  return {
    id: row.id,
    startedAt: row.startedAt,
    completedAt: row.completedAt ?? null,
    actProgress: row.actProgress ?? 0,
    scores: safeParse(row.scores, {}),
    reflections: safeParse(row.reflections, {}),
    focusDimensionIds: safeParse(row.focusDimensionIds, []),
    intent: row.intent ?? '',
  }
}

export function toQuarterlyRow(r: QuarterlyReview) {
  return {
    id: r.id,
    startedAt: r.startedAt,
    completedAt: r.completedAt,
    actProgress: r.actProgress,
    scores: JSON.stringify(r.scores),
    reflections: JSON.stringify(r.reflections),
    focusDimensionIds: JSON.stringify(r.focusDimensionIds),
    intent: r.intent,
  }
}
