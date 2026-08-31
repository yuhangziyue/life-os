// 除「光的分配」之外那几种 Aha 的判据与文案纪律（v3.6.1）。
//
// 这批断言守的是「子曰点名的三条到底兑现了没有」，以及兑现的方式没有偷偷违反红线：
//   ② 状态跃迁 —— 必须**同屏带上「谁在合」**（「合着不是辜负」不能只写在设计文档里）
//   ③ 第一条 / 花瓣唤醒 —— 唤醒**给日期不给天数**（位置不产生账，计量会被读成账）
//   ④ 立下意图 —— **当场必须显示代价**，否则计划就退化成待办清单

import { describe, expect, it } from 'vitest'
import {
  detectStageShift, detectAwaken, isDailyFirst,
  stageShiftLines, awakenLine, composeIntentSet, intentSetLines,
  AWAKEN_AFTER_DAYS,
  DAILY_FIRST_LINE, PETAL_FIRST_LINE, NIGHT_LINE, EARLY_LINE,
} from './ahaMoments'
import type { Action } from '../models/action'
import type { Dimension } from '../models/dimension'

const DAY = 86400000
const NOW = new Date(2026, 7, 20, 14, 0, 0).getTime()
const day = (offset: number) => new Date(2026, 7, 20 - offset).setHours(0, 0, 0, 0)

function dim(over: Partial<Dimension> = {}): Dimension {
  return {
    id: 'd1', name: '身心健康', icon: '', colorHex: '#D89A9E', sortOrder: 0, isEnabled: true,
    createdAt: 0, currentScore: 3.8, initialScore: 3, scoringMode: 'auto',
    identity: '', focusSince: null, targetScore: null, weeklyIntent: 0,
    pactTiming: '', pactAnchor: '', pactText: '', ...over,
  }
}
function act(over: Partial<Action> = {}): Action {
  return {
    id: 'a1', date: day(0), descriptionText: '', impact: 2, quality: 'normal',
    isCompleted: true, mood: '', createdAt: NOW, updatedAt: 0,
    dimensionId: 'd1', branchId: null, goalId: null, ...over,
  } as Action
}

describe('② 状态跃迁', () => {
  // initialScore 3 + 近 30 天 impact 合计 4 × 0.2 = 3.8（萌芽）；
  // 再加一条 normal（impact 2 → +0.4）= 4.2，跨过 4 分那条档线进「舒展」
  const nearEdge = [act({ id: 'e1', impact: 2, date: day(2) }), act({ id: 'e2', impact: 2, date: day(3) })]

  it('跨档才有，不跨档返回 null', () => {
    expect(detectStageShift({ dimension: dim(), actionsBefore: nearEdge, impact: 2 })).not.toBeNull()
    // 同样的账再加一条随手（impact 1 → +0.2）= 4.0…… 4.0 已跨；用 3.8 → 3.9 才是同档内
    expect(detectStageShift({ dimension: dim(), actionsBefore: [act({ id: 'x', impact: 1 })], impact: 1 })).toBeNull()
  })

  it('🔴 同屏必须带上「谁在合」，而且平铺直叙不带惋惜', () => {
    const shift = detectStageShift({ dimension: dim(), actionsBefore: nearEdge, impact: 2 })!
    const lines = stageShiftLines(shift, ['家庭关系', '社交关系'])
    expect(lines).toHaveLength(2)
    expect(lines[1]).toContain('家庭关系')
    expect(lines[1]).toContain('一直合着')
    // 「可惜 / 遗憾 / 只有」这类叹息就是评判的软形态
    expect(lines.join(' ')).not.toMatch(/可惜|遗憾|终于|只有|但是/)
  })

  it('没有合着的花瓣时只出一行，不硬凑', () => {
    const shift = detectStageShift({ dimension: dim(), actionsBefore: nearEdge, impact: 2 })!
    expect(stageShiftLines(shift, [])).toHaveLength(1)
  })

  it('文案零评价词、零感叹号', () => {
    const shift = detectStageShift({ dimension: dim(), actionsBefore: nearEdge, impact: 2 })!
    const all = stageShiftLines(shift, ['家庭关系']).join(' ')
    expect(all).not.toMatch(/恭喜|真棒|进步|坚持|加油|难得|不错/)
    expect(all).not.toMatch(/[!！]/)
  })
})

describe('③ 花瓣唤醒', () => {
  const before = [act({ id: 'old', date: day(AWAKEN_AFTER_DAYS + 5) })]

  it('合拢满 14 天以上才算唤醒', () => {
    expect(detectAwaken({ dimension: dim(), actionsBefore: before, now: NOW })).not.toBeNull()
    const recent = [act({ id: 'r', date: day(3) })]
    expect(detectAwaken({ dimension: dim(), actionsBefore: recent, now: NOW })).toBeNull()
  })

  it('从没记过 ⇒ 那是「第一次」不是「唤醒」', () => {
    expect(detectAwaken({ dimension: dim(), actionsBefore: [], now: NOW })).toBeNull()
  })

  it('🔴 给日期，不给天数 —— 位置不产生账，计量会被读成账', () => {
    const a = detectAwaken({ dimension: dim(), actionsBefore: before, now: NOW })!
    const line = awakenLine(a)
    expect(line).toMatch(/\d+月\d+日/)
    expect(line).not.toMatch(/\d+\s*天/)
    // 「回来了 / 久违 / 终于」都是评价
    expect(line).not.toMatch(/回来了|久违|终于|欢迎/)
  })
})

describe('③ 当天第一条', () => {
  it('今天没有已完成记录时成立', () => {
    expect(isDailyFirst([], NOW)).toBe(true)
    expect(isDailyFirst([act({ date: day(1) })], NOW)).toBe(true)
  })
  it('今天已经记过就不成立', () => {
    expect(isDailyFirst([act({ date: day(0) })], NOW)).toBe(false)
  })
  it('未完成的记录不算数', () => {
    expect(isDailyFirst([act({ date: day(0), isCompleted: false })], NOW)).toBe(true)
  })
  it('🔴 不写「今天的第一条」——「第一」暗示还有第二，暗示今天还不够', () => {
    expect(DAILY_FIRST_LINE).not.toContain('第一')
    expect(DAILY_FIRST_LINE).toBe('今天的账，开了。')
  })
  it('深夜那句是全产品最短的一行（认出了这是什么时刻，于是收声）', () => {
    expect(NIGHT_LINE.length).toBeLessThanOrEqual(5)
    // 绝不出现作息评价：「这么晚」「早点休息」「还在」
    expect(NIGHT_LINE).not.toMatch(/晚|休息|还在|早点/)
  })
  it('清晨与某片首条同样零评价', () => {
    const all = [EARLY_LINE, PETAL_FIRST_LINE('社交关系')].join(' ')
    expect(all).not.toMatch(/恭喜|真棒|坚持|加油|难得|[!！]/)
  })
})

describe('④ 立下意图', () => {
  it('🔴 写了目标时必须当场显示代价 —— 不显示，计划就退化成待办清单', () => {
    const info = composeIntentSet(dim({ targetScore: 7 }))
    const lines = intentSetLines(info)
    expect(lines[0]).toContain('7')
    // 第二行是这条 Aha 存在的全部理由
    expect(lines[1]).toContain('别处少一些')
    expect(lines[1]).toContain('本来就是这样')
  })

  it('受损方不具名 —— 因果归因需要两个具名端点才闭环', () => {
    const lines = intentSetLines(composeIntentSet(dim({ targetScore: 7 })))
    expect(lines[1]).toContain('别处')
  })

  it('有约定时把约定原文放进来，并声明它不会主动来找你', () => {
    const info = composeIntentSet(dim({ pactTiming: '周三', pactAnchor: '吃完晚饭', pactText: '走二十分钟' }))
    const lines = intentSetLines(info)
    expect(lines.some(l => l.includes('每个周三，吃完晚饭之后，我去走二十分钟。'))).toBe(true)
    expect(lines[lines.length - 1]).toContain('不会主动来找你')
  })

  it('🔴 全程不出现完成态语汇（一有裁判，约定就变任务）', () => {
    const all = intentSetLines(composeIntentSet(dim({
      targetScore: 7, pactTiming: '周三', pactAnchor: '吃完晚饭', pactText: '走二十分钟',
    }))).join(' ')
    expect(all).not.toMatch(/完成|未完成|完成率|进度|提醒|打卡|坚持/)
    expect(all).not.toMatch(/[!！]/)
  })

  it('只立了约定没写目标时，不编造一个目标出来', () => {
    const lines = intentSetLines(composeIntentSet(dim({ pactTiming: '周三', pactText: '走二十分钟' })))
    expect(lines[0]).not.toMatch(/\d/)
  })
})
