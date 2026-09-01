import { describe, it, expect } from 'vitest'
import {
  composeReviewSummary, summaryTitle, yearOpeningLine, emptyPeriodLines, THINKING_PLACEHOLDER,
} from './reviewSummary'
import type { Action } from '../models/action'
import type { Dimension } from '../models/dimension'

const DAY = 24 * 60 * 60 * 1000
const T0 = new Date(2026, 0, 1).getTime()

const dim = (id: string, name: string): Dimension => ({
  id, name, colorHex: '#888', currentScore: 3, initialScore: 3,
  isEnabled: true, createdAt: T0, sortOrder: 0, description: '',
  icon: '', scoringMode: 'action', identity: '',
  focusSince: null, targetScore: null, weeklyIntent: 0,
  pactTiming: '', pactAnchor: '', pactText: '',
} as unknown as Dimension)

const act = (dimensionId: string, date: number, impact = 2): Action => ({
  id: `${dimensionId}-${date}-${Math.floor(impact * 100)}`,
  dimensionId, date, impact, quality: 'normal', isCompleted: true,
  descriptionText: 'x', mood: '', createdAt: date, updatedAt: date,
  branchId: null, goalId: null,
} as unknown as Action)

const DIMS = [dim('a', '身心健康'), dim('b', '职业发展'), dim('c', '家庭关系')]

describe('复盘摘要 · 红线', () => {
  const many = [
    ...Array.from({ length: 6 }, (_, i) => act('b', T0 + i * DAY, 3)),
    ...Array.from({ length: 3 }, (_, i) => act('a', T0 + i * DAY, 2)),
    act('c', T0, 1),
  ]

  it('🔴 不出现「最需要关注」—— 那是系统在给合着的那片下判决', () => {
    for (const p of ['week', 'month', 'year'] as const) {
      const s = composeReviewSummary(p, DIMS, many, T0, T0 + 300 * DAY)
      expect(s.text).not.toContain('最需要关注')
    }
  })

  it('🔴 不出现精确分数（括号里的 7.8 vs 2.1 并置就是成绩单）', () => {
    for (const p of ['week', 'month', 'year'] as const) {
      const s = composeReviewSummary(p, DIMS, many, T0, T0 + 300 * DAY)
      expect(s.text).not.toMatch(/\d+\.\d/)
      expect(s.text).not.toMatch(/[（(]\s*\d/)
    }
  })

  it('🔴 不出现「完成 N 条」—— 「完成」把记录变成待办清单的勾', () => {
    for (const p of ['week', 'month', 'year'] as const) {
      const s = composeReviewSummary(p, DIMS, many, T0, T0 + 300 * DAY)
      expect(s.text).not.toContain('完成')
    }
  })

  it('🔴 年摘要不出现连击（「最长连着记了 N 天」是红线 6，年度总结最容易溜进它）', () => {
    const s = composeReviewSummary('year', DIMS, many, T0, T0 + 300 * DAY)
    expect(s.text).not.toMatch(/连[着续]|连[续着]?\s*\d+\s*天|最长/)
  })

  it('🔴 全产品禁用词一个都不许出现', () => {
    const banned = ['恭喜', '真棒', '进步', '坚持', '难得', '加油', '别忘', '该去', '落后', '快去', '管理']
    for (const p of ['week', 'month', 'year'] as const) {
      const texts = [
        composeReviewSummary(p, DIMS, many, T0, T0 + 300 * DAY).text,
        composeReviewSummary(p, DIMS, [], T0, T0 + 300 * DAY).text,
        summaryTitle(p), THINKING_PLACEHOLDER[p], ...emptyPeriodLines(p),
      ]
      for (const t of texts) for (const b of banned) expect(t).not.toContain(b)
    }
  })

  it('🔴 没有一句用感叹号', () => {
    const all = (['week', 'month', 'year'] as const).flatMap(p => [
      composeReviewSummary(p, DIMS, many, T0, T0 + 300 * DAY).text,
      THINKING_PLACEHOLDER[p], ...emptyPeriodLines(p),
    ])
    for (const t of all) expect(t).not.toMatch(/[!！]/)
  })
})

describe('复盘摘要 · 样本地板', () => {
  it('一条记录时不报数，改用汉字数词，且不排序', () => {
    const s = composeReviewSummary('week', DIMS, [act('a', T0)], T0, T0 + 7 * DAY)
    expect(s.kind).toBe('single')
    expect(s.text).toBe('这一周你记下了一条，落在「身心健康」。')
    // 「1 条」是计量，「一条」是叙述 —— 孤单感来自前者
    expect(s.text).not.toContain('1 条')
    expect(s.text).not.toContain('最多')
  })

  it('少于三条时只报事实与落点，不做最多/最少的排序', () => {
    const s = composeReviewSummary('week', DIMS, [act('a', T0), act('b', T0 + DAY)], T0, T0 + 7 * DAY)
    expect(s.kind).toBe('thin')
    expect(s.text).not.toContain('最多')
    expect(s.text).not.toContain('最少')
    // 两条记录谈最多最少，那是在挑剔
    expect(s.text).toContain('两条')
  })

  it('零条时不说「没有数据」，说清空着也是一种记录', () => {
    const s = composeReviewSummary('week', DIMS, [], T0, T0 + 7 * DAY)
    expect(s.kind).toBe('empty')
    expect(s.text).toContain('空着也是一种记录')
    expect(s.text).not.toContain('数据不足')
  })
})

describe('复盘摘要 · 三个尺度报的不是同一件事', () => {
  const many = [
    ...Array.from({ length: 6 }, (_, i) => act('b', T0 + i * DAY, 3)),
    ...Array.from({ length: 3 }, (_, i) => act('a', T0 + i * DAY, 2)),
    act('c', T0, 1),
  ]

  it('周报动作：记了多少 + 光最多/最少落在哪', () => {
    const s = composeReviewSummary('week', DIMS, many, T0, T0 + 7 * DAY)
    expect(s.text).toContain('你记下')
    expect(s.text).toContain('光最多落在')
  })

  it('月报铺展：落在几片花瓣上 —— 单月总量没意义，铺开的宽度才有', () => {
    const s = composeReviewSummary('month', DIMS, many, T0, T0 + 30 * DAY)
    expect(s.text).toContain('片花瓣上')
  })

  it('年报变化：上下半年重心换没换 —— 年尺度上重心迁移才是代价可见的正脸', () => {
    const h1 = Array.from({ length: 8 }, (_, i) => act('b', T0 + i * DAY, 3))
    const h2 = Array.from({ length: 8 }, (_, i) => act('c', T0 + 200 * DAY + i * DAY, 3))
    const s = composeReviewSummary('year', DIMS, [...h1, ...h2], T0, T0 + 364 * DAY)
    expect(s.text).toContain('上半年')
    expect(s.text).toContain('下半年')
    expect(s.text).toContain('「职业发展」')
    expect(s.text).toContain('「家庭关系」')
    // 年尺度不报总量
    expect(s.text).not.toMatch(/记下\s*\d+\s*条/)
  })

  it('年内重心没换时说「上下半年都是它」，不硬凑一个不存在的对比', () => {
    const all = Array.from({ length: 16 }, (_, i) => act('b', T0 + i * 20 * DAY, 3))
    const s = composeReviewSummary('year', DIMS, all, T0, T0 + 364 * DAY)
    expect(s.text).toContain('上下半年都是它')
  })
})

describe('年回顾的开场：先给一个不可能失败的数', () => {
  it('用汉字数词而不是阿拉伯数字（324 是计量，三百二十四 是叙述）', () => {
    expect(yearOpeningLine(324)).toBe('这一年，这朵花陪了你 三百二十四 天。')
    expect(yearOpeningLine(7)).toBe('这一年，这朵花陪了你 七 天。')
    expect(yearOpeningLine(10)).toBe('这一年，这朵花陪了你 十 天。')
    expect(yearOpeningLine(15)).toBe('这一年，这朵花陪了你 十五 天。')
    expect(yearOpeningLine(100)).toBe('这一年，这朵花陪了你 一百 天。')
    expect(yearOpeningLine(105)).toBe('这一年，这朵花陪了你 一百零五 天。')
    expect(yearOpeningLine(120)).toBe('这一年，这朵花陪了你 一百二十 天。')
  })
})

describe('空态：不拦住、不写数据不足、出口是「去看」不是「去记」', () => {
  it('年空态给横向出口，且是导航不是催办', () => {
    const lines = emptyPeriodLines('year')
    expect(lines).toHaveLength(3)
    // 主语是「这一年」不是「你」—— 说人不说你，就不会被读成评价
    expect(lines[0]).toBe('这一年才刚开始记。')
    expect(lines[2]).toBe('先去看看这一周吧。')
    // 🔴 出口必须是「去看」：「记几笔就有了」是催办
    expect(lines.join('')).not.toMatch(/记几笔|去记|多记/)
    // 🔴 不带日期承诺
    expect(lines.join('')).not.toMatch(/\d+\s*[天周月]后/)
  })

  it('月空态不给第三行 —— 它离「这一周」太近，指过去显得多余', () => {
    expect(emptyPeriodLines('month')).toHaveLength(2)
  })
})

// ============================================================
// 这一程的锚点（v3.7）—— 与摘要无关，放在这里是因为它同属「复盘/结算」这条线
// ============================================================
describe('季度锚点：让一片花瓣休息，不许把第 84 天推后', () => {
  const early = { ...dim('a', '最早那片'), createdAt: T0 }
  const later = { ...dim('b', '晚一些那片'), createdAt: T0 + 40 * DAY }

  it('🔴 全量 vs enabled：这就是那个漂移 bug', async () => {
    const { gardenBirth, seasonAnchor } = await import('./quarterly')
    const all = [early, later]
    const enabledOnly = [later]   // 用户把「最早那片」请去休息了

    // 旧行为：调用方传 enabled ⇒ 锚点整体后移 40 天 ⇒ 第 84 天和第 30 天一起被推后
    expect(gardenBirth(enabledOnly)).toBe(T0 + 40 * DAY)
    // 新行为：传全量 ⇒ 锚点不动。createdAt 不可变，真值一直在库里
    expect(seasonAnchor(all, null, null)).toBe(T0)
  })

  it('固化值是权威源，即使最早那片被硬删也不漂移', async () => {
    const { seasonAnchor } = await import('./quarterly')
    // deleteDimension 是硬删，没有软删标记 ⇒ 真值从库里消失了
    const afterHardDelete = [later]
    expect(seasonAnchor(afterHardDelete, null, T0)).toBe(T0)
  })

  it('完成过季度会谈的用户，锚点是那次会谈 —— 显式事件永不漂移', async () => {
    const { seasonAnchor } = await import('./quarterly')
    const talkAt = T0 + 84 * DAY
    expect(seasonAnchor([early, later], talkAt, T0)).toBe(talkAt)
  })
})
