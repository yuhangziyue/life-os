// 「光的分配」算术与文案纪律的单测（v3.6）。
//
// 这里守两件事：
//   ① firstEver 的判据 —— 它曾经是 P0 失忆 bug（断记 7 天回来被告知「这是第一笔光」，
//      产品说的实际内容是「我不记得你」，而它对用户的全部承诺是"我在替你攒证据"）
//   ② 定格主句的文案纪律 —— 三轮圆桌才收敛的东西，用正则钉死，防后人改回去

import { describe, expect, it } from 'vitest'
import { composeLightShift, shareDelta, shiftFact, LIGHT_LAW, TOO_LIGHT } from './lightShift'
import type { Action } from '../models/action'
import type { Dimension } from '../models/dimension'

const DAY = 86400000
const NOW = new Date(2026, 7, 15, 14, 0, 0).getTime()

function dim(id: string, score = 5): Dimension {
  return {
    id, name: id, icon: '', colorHex: '#B8804D', sortOrder: 0, isEnabled: true,
    createdAt: 0, currentScore: score, initialScore: 3, scoringMode: 'auto',
    identity: '', focusSince: null, targetScore: null, weeklyIntent: 0,
    pactTiming: '', pactAnchor: '', pactText: '',
  }
}
function act(id: string, dimensionId: string, impact = 2, dayOffset = 0): Action {
  return {
    id, date: NOW - dayOffset * DAY, descriptionText: '', impact,
    quality: 'normal', isCompleted: true, mood: '',
    createdAt: NOW - dayOffset * DAY, updatedAt: 0,
    dimensionId, branchId: null, goalId: null,
  } as Action
}

const dims = ['career', 'family', 'health'].map(id => dim(id))

describe('composeLightShift · firstEver（曾经的 P0 失忆 bug）', () => {
  it('全库真的没有记录时才是第一笔光', () => {
    const s = composeLightShift({ dimensions: dims, actionsBefore: [], added: act('n', 'career'), now: NOW })
    expect(s?.firstEver).toBe(true)
  })

  it('🔴 断记 7 天以上回来的第一条**不是**第一笔光 —— 旧判据在这里会误报', () => {
    // 库里有一条 30 天前的记录：近 7 天窗口内确实"没有光"，
    // 但这个花园显然不是空的。旧判据 before.size === 0 会在这里返回 true。
    const old = [act('old', 'family', 2, 30)]
    const s = composeLightShift({ dimensions: dims, actionsBefore: old, added: act('n', 'career'), now: NOW })
    expect(s?.firstEver).toBe(false)
  })

  it('未完成的记录不算数（它不参与分光）', () => {
    const pending = [{ ...act('p', 'family'), isCompleted: false } as Action]
    const s = composeLightShift({ dimensions: dims, actionsBefore: pending, added: act('n', 'career'), now: NOW })
    expect(s?.firstEver).toBe(true)
  })

  it('未完成的新记录不产生 Aha', () => {
    const added = { ...act('n', 'career'), isCompleted: false } as Action
    expect(composeLightShift({ dimensions: dims, actionsBefore: [], added, now: NOW })).toBeNull()
  })
})

describe('composeLightShift · 谁让开了', () => {
  it('占比之和恒为 100% ⇒ 一片多必有别处少', () => {
    const before = [act('a', 'career', 5), act('b', 'family', 5)]
    const s = composeLightShift({ dimensions: dims, actionsBefore: before, added: act('n', 'health', 5), now: NOW })!
    const sum = s.segments.reduce((t, x) => t + x.to, 0)
    expect(sum).toBeCloseTo(1, 6)
    expect(s.gained.dimensionId).toBe('health')
    // career 与 family 都必然被挤窄
    expect(s.yielded.map(y => y.dimensionId).sort()).toEqual(['career', 'family'])
  })

  it('让出最多的排在最前 —— 三粒墨点就是从这里取源的', () => {
    const before = [act('a', 'career', 10), act('b', 'family', 2)]
    const s = composeLightShift({ dimensions: dims, actionsBefore: before, added: act('n', 'health', 4), now: NOW })!
    expect(s.yielded[0].dimensionId).toBe('career')
  })

  it('段按记录后占比降序 —— 与光河的呈现顺序一致', () => {
    const before = [act('a', 'career', 8), act('b', 'family', 4)]
    const s = composeLightShift({ dimensions: dims, actionsBefore: before, added: act('n', 'health', 2), now: NOW })!
    const tos = s.segments.map(x => x.to)
    expect([...tos].sort((a, b) => b - a)).toEqual(tos)
  })
})

describe('shareDelta · 三种边界必须分开', () => {
  it('值压根没动 = unchanged（这种压根不该演）', () => {
    expect(shareDelta(0.12, 0.12).kind).toBe('unchanged')
  })
  it('动了但四舍五入后同值 = sub_pct（「这一下太轻」）', () => {
    // 12.1 与 12.4 都 round 成 12 —— 真的动了，但带子上看不出来
    expect(shareDelta(0.121, 0.124).kind).toBe('sub_pct')
  })
  it('跨过整数边界 = moved', () => {
    expect(shareDelta(0.124, 0.132)).toEqual({ fromPct: 12, toPct: 13, kind: 'moved' })
  })
  it('从 0 涨到不足半格仍是 sub_pct', () => {
    expect(shareDelta(0, 0.004).kind).toBe('sub_pct')
  })
  it('从 0 涨到 0.8 格已经跨界', () => {
    expect(shareDelta(0, 0.008).kind).toBe('moved')
  })
  it('用 round 不用 floor —— floor 会让 12.9 显示成 12，用户以为没动其实动了', () => {
    expect(shareDelta(0.129, 0.129).fromPct).toBe(13)
  })
})

describe('定格主句的文案纪律（三轮圆桌才收敛，用正则钉死）', () => {
  const s = composeLightShift({
    dimensions: dims,
    actionsBefore: [act('a', 'career', 5)],
    added: act('n', 'health', 5),
    now: NOW,
  })!

  it('日常版受损方不具名（用「别处」）—— 因果归因需要两个具名端点才闭环', () => {
    const line = shiftFact(s)
    expect(line).toContain('别处')
    expect(line).not.toContain('career')
  })

  it('付方是本季焦点时才具名 —— 那是引用他自己写下的宣称，不是指控', () => {
    const line = shiftFact(s, 'career')
    expect(line).toContain('career')
  })

  it('动词是「分」，绝不出现「挪」或「让」', () => {
    for (const line of [shiftFact(s), shiftFact(s, 'career')]) {
      expect(line).toContain('分')
      expect(line).not.toMatch(/挪|让/)
    }
  })

  it('全部文案零禁词：进步 / 坚持 / 恭喜 / 加油 / 完成率 / 连续 / 难得', () => {
    const all = [shiftFact(s), shiftFact(s, 'career'), LIGHT_LAW, TOO_LIGHT].join(' ')
    expect(all).not.toMatch(/进步|坚持|恭喜|加油|完成率|连续|难得|真棒/)
  })

  it('全产品不用感叹号', () => {
    const all = [shiftFact(s), shiftFact(s, 'career'), LIGHT_LAW, TOO_LIGHT].join(' ')
    expect(all).not.toMatch(/[!！]/)
  })

  it('守恒那句把主语交给世界，不交给用户（末句「本来就是这样」）', () => {
    expect(LIGHT_LAW).toContain('本来就是这样')
    expect(LIGHT_LAW).not.toContain('你给')
  })
})
