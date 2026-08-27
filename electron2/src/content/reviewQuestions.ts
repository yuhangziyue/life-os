// 引导式回顾问题库 —— 空白框是世界上最难回答的问题（晓雅 X4）。
// 周回顾用「例外问题」（叙事疗法：找做对的时刻），月回顾用「叙事重构」，年回顾看主线。
// 本地内置、零 AI 依赖；每期按周期序号轮换 3 题，答其中一个就够了。

export type PeriodType = 'week' | 'month' | 'year'

const QUESTIONS: Record<PeriodType, string[]> = {
  week: [
    '这周哪个时刻，你觉得「这才是我想要的生活」？',
    '有没有一件小事，做完之后心里松了一口气？',
    '这周你在哪片花瓣上花的心思最多？它回应你了吗？',
    '如果重来一次，这周你会少做什么？',
    '这周有没有一个瞬间，你为自己感到骄傲——哪怕很小？',
    '下周只做一件事的话，你想把水浇在哪片花瓣上？',
  ],
  month: [
    '如果这个月是一章书，你会给它起什么标题？',
    '有什么是月初的你不知道、现在的你知道的？',
    '这个月最出乎意料的一件事是什么？它带来了什么？',
    '哪片花瓣这个月悄悄长大了？你是怎么做到的？',
    '这个月你放下了什么？放下之后感觉如何？',
    '如果下个月只许一个愿望，你许什么？',
  ],
  year: [
    '今年的你和去年的你，最大的不同是什么？',
    '如果今年是一本书，封面上会画什么？',
    '今年哪个决定，现在回头看特别庆幸？',
    '今年你最想感谢谁——包括你自己？',
    '有什么事今年没做成，但你已经不打算责怪自己了？',
    '明年这朵花，你最想看到哪片花瓣盛放？',
  ],
}

/**
 * 季节性问题（v3.3 T10，报告 §9.2.2，书香供稿）——
 * 同样是回顾，八月和十二月该问的不是同一件事。每季 3 题，并入当期问题池。
 * 仍是本地内置、零 AI；语气红线不变：只有邀请，没有评判与催促。
 */
const SEASONAL: { months: number[]; questions: string[] }[] = [
  {
    months: [2, 3, 4], // 春 3-5 月
    questions: [
      '春天到了，有什么是你想重新开始的？',
      '如果这个春天只种一样东西，你想种什么？',
      '去年这个时候的你，会羡慕现在的你哪一点？',
    ],
  },
  {
    months: [5, 6, 7], // 夏 6-8 月
    questions: [
      '夏天的光很长，你最想把多出来的时间给谁？',
      '这个夏天有没有一个瞬间，你希望它慢一点过去？',
      '天热的时候你更容易对自己失去耐心吗？那时你需要什么？',
    ],
  },
  {
    months: [8, 9, 10], // 秋 9-11 月
    questions: [
      '秋天适合收获，这一季你最满意的一件事是什么？',
      '有什么是你今年种下、现在才看出结果的？',
      '如果要给这一年做减法，你最先放下哪一样？',
    ],
  },
  {
    months: [11, 0, 1], // 冬 12-2 月
    questions: [
      '冬天适合向内看，有什么是你想放下的？',
      '这一年里，哪片花瓣其实一直在安静地等你？',
      '如果可以给年初的自己带一句话，你会说什么？',
    ],
  },
]

function seasonalPool(at: number): string[] {
  const m = new Date(at).getMonth()
  return SEASONAL.find(s => s.months.includes(m))?.questions ?? []
}

/** 取本期的 3 个引导问题：按周期序号轮换，同一期内稳定；每期含 1 道当季问题 */
export function pickReviewQuestions(period: PeriodType, periodStart: number): string[] {
  const pool = QUESTIONS[period]
  const idx = Math.floor(periodStart / (24 * 60 * 60 * 1000)) % pool.length
  const base = [0, 1].map(i => pool[(idx + i) % pool.length])

  const seasonal = seasonalPool(periodStart)
  if (seasonal.length === 0) return [...base, pool[(idx + 2) % pool.length]]
  return [...base, seasonal[idx % seasonal.length]]
}
