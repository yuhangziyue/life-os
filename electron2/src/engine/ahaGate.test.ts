// Aha 闸门与判据的单测（v3.6）。
//
// 这批断言守的是第五轮圆桌里**最容易被后人改坏**的几条纪律：
//   · 补记不许触发时刻类（老架）
//   · 同 kind 冷却是抗习惯化的全部目的（小艾），改短了 Aha 会重新变成噪声
//   · 样本地板：账太薄时名次变化只是分母噪声，早期就播会烧掉发现层可信度（小艾）
//   · 深夜与坏日子静音，且**不落事件行 ⇒ 不消耗冷却**（小艾三轮点名的实现陷阱）
// 每条断言都写清"为什么"，因为半年后看到失败的人需要知道这条纪律能不能让。

import { describe, expect, it } from 'vitest'
import {
  checkAhaGate, hasSampleFloor, isBackfill, isEarly, isNight, isRoughDay,
  DAILY_CAP, WEEKLY_CAP, FORM_COOLDOWN_DAYS, MOMENT_COOLDOWN_DAYS,
  EV_PLAYED, EV_KIND_PREFIX,
} from './ahaGate'
import type { Action } from '../models/action'
import type { Dimension } from '../models/dimension'

const DAY = 86400000
const at = (h: number, d = 15) => new Date(2026, 7, d, h, 30, 0).getTime()

function act(p: Partial<Action> = {}): Action {
  return {
    id: p.id ?? 'a1',
    date: p.date ?? new Date(2026, 7, 15).setHours(0, 0, 0, 0),
    descriptionText: '',
    impact: p.impact ?? 2,
    quality: p.quality ?? 'normal',
    isCompleted: p.isCompleted ?? true,
    mood: p.mood ?? '',
    createdAt: p.createdAt ?? at(14),
    updatedAt: 0,
    dimensionId: p.dimensionId ?? 'd1',
    branchId: null,
    goalId: null,
  } as Action
}

function dim(id: string, color = '#B8804D'): Dimension {
  return {
    id, name: id, icon: '', colorHex: color, sortOrder: 0, isEnabled: true,
    createdAt: 0, currentScore: 5, initialScore: 3, scoringMode: 'auto',
    identity: '', focusSince: null, targetScore: null, weeklyIntent: 0,
    pactTiming: '', pactAnchor: '', pactText: '',
  }
}

/** 假的 events 层：把 (name -> 时刻列表) 放内存，语义与 SQLite 侧对齐 */
function fakeDeps(rows: { name: string; at: number }[] = []) {
  return {
    rows,
    hasSince: async (name: string, since: number) => rows.some(r => r.name === name && r.at >= since),
    countSince: async (name: string, since: number) => rows.filter(r => r.name === name && r.at >= since).length,
  }
}

describe('isBackfill', () => {
  it('同一天提交不是补记', () => {
    expect(isBackfill(act({ date: new Date(2026, 7, 15).setHours(0, 0, 0, 0), createdAt: at(14) }))).toBe(false)
  })
  it('归属日早于提交日就是补记', () => {
    expect(isBackfill(act({ date: new Date(2026, 7, 10).setHours(0, 0, 0, 0), createdAt: at(14) }))).toBe(true)
  })
  it('跨月补记同样成立', () => {
    expect(isBackfill(act({ date: new Date(2026, 6, 28).setHours(0, 0, 0, 0), createdAt: at(14) }))).toBe(true)
  })
  it('归属日在未来不算补记（不该反向触发屏蔽）', () => {
    expect(isBackfill(act({ date: new Date(2026, 7, 20).setHours(0, 0, 0, 0), createdAt: at(14) }))).toBe(false)
  })
})

describe('时段判据用真实提交时刻', () => {
  it('22 点与 4 点都算深夜，5 点不算', () => {
    expect(isNight(at(22))).toBe(true)
    expect(isNight(at(4))).toBe(true)
    expect(isNight(at(5))).toBe(false)
    expect(isNight(at(14))).toBe(false)
  })
  it('清晨是 05:00–08:59', () => {
    expect(isEarly(at(5))).toBe(true)
    expect(isEarly(at(8))).toBe(true)
    expect(isEarly(at(9))).toBe(false)
    expect(isEarly(at(4))).toBe(false)
  })
})

describe('坏日子闸门（用用户自己给的情绪信号，不靠猜）', () => {
  const now = at(14)
  it('当日有 tired 就是坏日子', () => {
    expect(isRoughDay([act({ mood: 'tired' })], now)).toBe(true)
  })
  it('当日有 vexed 也是', () => {
    expect(isRoughDay([act({ mood: 'vexed' })], now)).toBe(true)
  })
  it('别的心情不算', () => {
    expect(isRoughDay([act({ mood: 'calm' })], now)).toBe(false)
  })
  it('昨天的坏心情不影响今天', () => {
    expect(isRoughDay([act({ mood: 'tired', date: new Date(2026, 7, 14).setHours(0, 0, 0, 0) })], now)).toBe(false)
  })
})

describe('样本地板', () => {
  const now = at(14)
  const dims = ['d1', 'd2', 'd3', 'd4', 'd5'].map(id => dim(id))
  it('参与分光的花瓣不足 4 片时不达标（名次变化只是分母噪声）', () => {
    const actions = [act({ id: 'x1', dimensionId: 'd1', impact: 5 }), act({ id: 'x2', dimensionId: 'd2', impact: 5 })]
    expect(hasSampleFloor(dims, actions, now)).toBe(false)
  })
  it('impact 总量不足 20 时不达标', () => {
    const actions = ['d1', 'd2', 'd3', 'd4'].map((d, i) => act({ id: `y${i}`, dimensionId: d, impact: 2 }))
    expect(hasSampleFloor(dims, actions, now)).toBe(false)
  })
  it('四片以上且总量够就达标', () => {
    const actions = ['d1', 'd2', 'd3', 'd4', 'd5'].map((d, i) => act({ id: `z${i}`, dimensionId: d, impact: 5 }))
    expect(hasSampleFloor(dims, actions, now)).toBe(true)
  })
})

describe('checkAhaGate', () => {
  const now = at(14)

  it('干净状态下放行', async () => {
    const r = await checkAhaGate('light_shift', fakeDeps(), { now, floorOk: true })
    expect(r.pass).toBe(true)
  })

  it('补记屏蔽时刻类，但不屏蔽形态类 —— 形状变化在补记后是真的', async () => {
    const moment = await checkAhaGate('daily_first', fakeDeps(), { now, backfill: true, floorOk: true })
    expect(moment).toEqual({ pass: false, reason: 'backfill_moment' })
    const form = await checkAhaGate('light_shift', fakeDeps(), { now, backfill: true, floorOk: true })
    expect(form.pass).toBe(true)
  })

  it('样本地板未达标时挡住占比类，但放行 first_ever / stage_up / awaken', async () => {
    expect(await checkAhaGate('light_shift', fakeDeps(), { now, floorOk: false }))
      .toEqual({ pass: false, reason: 'sample_floor' })
    expect((await checkAhaGate('first_ever', fakeDeps(), { now, floorOk: false })).pass).toBe(true)
    expect((await checkAhaGate('stage_up', fakeDeps(), { now, floorOk: false })).pass).toBe(true)
  })

  it('形态类同 kind 冷却 14 天：13 天前播过仍被挡', async () => {
    const deps = fakeDeps([{ name: `${EV_KIND_PREFIX}light_shift`, at: now - 13 * DAY }])
    expect(await checkAhaGate('light_shift', deps, { now, floorOk: true }))
      .toEqual({ pass: false, reason: 'kind_cooldown' })
  })

  it('形态类冷却满 14 天后放行（冷却是抗习惯化的全部目的，改短了 Aha 会重新变噪声）', async () => {
    const deps = fakeDeps([{ name: `${EV_KIND_PREFIX}light_shift`, at: now - (FORM_COOLDOWN_DAYS + 1) * DAY }])
    expect((await checkAhaGate('light_shift', deps, { now, floorOk: true })).pass).toBe(true)
  })

  it('时刻类冷却更长（30 天）—— 它的信息变化更慢，重复更廉价', async () => {
    const deps = fakeDeps([{ name: `${EV_KIND_PREFIX}night_owl`, at: now - 20 * DAY }])
    expect(await checkAhaGate('night_owl', deps, { now, floorOk: true }))
      .toEqual({ pass: false, reason: 'kind_cooldown' })
    const old = fakeDeps([{ name: `${EV_KIND_PREFIX}night_owl`, at: now - (MOMENT_COOLDOWN_DAYS + 1) * DAY }])
    expect((await checkAhaGate('night_owl', old, { now, floorOk: true })).pass).toBe(true)
  })

  it('当天已播过就挡住（每天上限 1 条）', async () => {
    const deps = fakeDeps([{ name: EV_PLAYED, at: at(9) }])
    expect(await checkAhaGate('light_shift', deps, { now, floorOk: true }))
      .toEqual({ pass: false, reason: 'daily_cap' })
    expect(DAILY_CAP).toBe(1)
  })

  it('一周内播满 3 条就挡住（稀有度硬顶）', async () => {
    const deps = fakeDeps([
      { name: EV_PLAYED, at: now - 1 * DAY },
      { name: EV_PLAYED, at: now - 3 * DAY },
      { name: EV_PLAYED, at: now - 5 * DAY },
    ])
    expect(await checkAhaGate('light_shift', deps, { now, floorOk: true }))
      .toEqual({ pass: false, reason: 'weekly_cap' })
    expect(WEEKLY_CAP).toBe(3)
  })

  it('八天前那次不计入本周额度', async () => {
    const deps = fakeDeps([
      { name: EV_PLAYED, at: now - 8 * DAY },
      { name: EV_PLAYED, at: now - 9 * DAY },
      { name: EV_PLAYED, at: now - 10 * DAY },
    ])
    expect((await checkAhaGate('light_shift', deps, { now, floorOk: true })).pass).toBe(true)
  })
})
