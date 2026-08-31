import { useMemo, useState } from 'react'
import { useStore, useEnabledDimensions } from '../stores/useStore'
import { LightShiftAha } from './LightShiftAha'
import { composeLightShift, type AhaPayload } from '../engine/lightShift'
import {
  awakenLine, stageShiftLines, composeIntentSet, intentSetLines,
  DAILY_FIRST_LINE, PETAL_FIRST_LINE, NIGHT_LINE, EARLY_LINE,
} from '../engine/ahaMoments'
import { lightShares } from '../engine/impression'
import { scoreStage } from '../engine/scoring'
import type { Action } from '../models/action'

/**
 * Aha 展柜 —— **只在网页演示版出现**（v3.6.1）。
 *
 * 为什么需要它：这套 Aha 是刻意做稀有的（同类冷却 14/30 天、每天 1 条、每周 3 条、
 * 样本地板、深夜静音）。稀有是产品上的正确选择，但对**演示**是致命的 ——
 * 一个来看三分钟的陌生人，正常路径下一条 Aha 都碰不到。
 *
 * 所以演示版给一个展柜，把每一种都能当场演一遍。三条硬约束：
 *   1. **只在演示版出现**（`isWebBuild()` 判据），桌面正式版一个字都不露 ——
 *      正式版里"想看就能看"会毁掉稀有性，那是这套设计的根基
 *   2. **零副作用**：不写 events、不写 settings、不碰闸门、不占当天额度。
 *      载荷是当场用真实演示数据合成的，播完即弃
 *   3. **如实标注**：展柜里说清「正常使用时它们是稀有的」，
 *      否则演示会给人"这 App 天天弹窗"的错觉 —— 那正好是我们花一整轮赶走的东西
 */

const DAY_MS = 24 * 60 * 60 * 1000

interface Row {
  key: string
  title: string
  when: string
  /** null = 这一条是「回执那一行字」，不弹层，只展示文案 */
  payload: AhaPayload | null
  line?: string
}

export function AhaShowcase() {
  const dimensions = useEnabledDimensions()
  const actions = useStore(s => s.actions)
  const [playing, setPlaying] = useState<AhaPayload | null>(null)

  const rows = useMemo<Row[]>(() => {
    if (dimensions.length === 0) return []
    const now = Date.now()

    // 挑一片「近 7 天拿光最少」的花瓣当受光方 —— 这样光河上真的能看出三粒墨点从别处飞来
    const shares = lightShares(dimensions, actions, now - 7 * DAY_MS, now)
    const shareOf = new Map(shares.map(s => [s.dimensionId, s.share]))
    const target = [...dimensions].sort(
      (a, b) => (shareOf.get(a.id) ?? 0) - (shareOf.get(b.id) ?? 0),
    )[0]
    const rich = [...dimensions].sort(
      (a, b) => (shareOf.get(b.id) ?? 0) - (shareOf.get(a.id) ?? 0),
    )[0]

    const synthetic: Action = {
      id: 'showcase-synthetic',
      date: now,
      descriptionText: '演示用的一笔',
      impact: 3,
      quality: 'major',
      isCompleted: true,
      mood: '',
      createdAt: now,
      updatedAt: now,
      dimensionId: target.id,
      branchId: null,
      goalId: null,
    } as Action

    const shift = composeLightShift({ dimensions, actionsBefore: actions, added: synthetic, now })

    const stage = stageShiftLines(
      {
        dimensionId: target.id, name: target.name, colorHex: target.colorHex,
        from: scoreStage(Math.max(0, target.currentScore - 1.5)),
        to: scoreStage(target.currentScore),
        direction: 'up',
      },
      dimensions.filter(d => d.id !== target.id).slice(0, 2).map(d => d.name),
    )

    const intent = intentSetLines(composeIntentSet({
      ...target,
      targetScore: Math.min(10, Math.ceil(target.currentScore) + 2),
      pactTiming: '周三', pactAnchor: '吃完晚饭', pactText: '走二十分钟',
    }))

    const out: Row[] = [
      {
        key: 'light_shift',
        title: '光的分配',
        when: '记一笔之后，下次打开时',
        payload: shift ? { kind: 'light_shift', at: now, shift } : null,
      },
      {
        key: 'stage_up',
        title: '状态跃迁',
        when: '某片花瓣跨过一档时（每片每档一辈子一次）',
        payload: { kind: 'stage_up', at: now, headline: stage[0], lines: stage.slice(1), colorHex: target.colorHex },
      },
      {
        key: 'awaken',
        title: '花瓣醒来',
        when: '合拢十四天以上的花瓣重新拿到光',
        payload: {
          kind: 'awaken', at: now, colorHex: rich.colorHex, lines: [],
          headline: awakenLine({
            dimensionId: rich.id, name: rich.name, colorHex: rich.colorHex,
            lastAt: now - 26 * DAY_MS,
          }),
        },
      },
      {
        key: 'intent_set',
        title: '立下意图',
        when: '第一次给某片写「想给多少」或定下约定',
        payload: { kind: 'intent_set', at: now, headline: intent[0], lines: intent.slice(1), colorHex: target.colorHex },
      },
      // 以下四条是「回执那一行字」，不弹层
      { key: 'daily_first', title: '今天的第一笔', when: '当天首条记录', payload: null, line: DAILY_FIRST_LINE },
      { key: 'petal_first', title: '这片的第一笔', when: '某片花瓣有史以来第一条', payload: null, line: PETAL_FIRST_LINE(target.name) },
      { key: 'early_bird', title: '清晨', when: '05:00–08:59 记录', payload: null, line: EARLY_LINE },
      { key: 'night_owl', title: '深夜', when: '22:00–05:00 记录 · 唯一只减不加的时段', payload: null, line: NIGHT_LINE },
    ]
    return out
  }, [dimensions, actions])

  if (rows.length === 0) return null

  return (
    <div className="card space-y-3" data-testid="aha-showcase">
      <div>
        <h2 className="text-sm font-medium text-[var(--text-secondary)]">看一遍所有 Aha</h2>
        <p className="text-[11px] text-[var(--text-muted)] leading-relaxed mt-1">
          真实使用时它们是稀有的 —— 同类要隔十四天以上、每天最多一次、深夜与心情不好的日子一律不出现。
          这个展柜只在演示版里有，方便你一次看全。点开不会留下任何记录。
        </p>
      </div>

      <div className="space-y-1">
        {rows.map(r => (
          <div key={r.key} className="showcase-row" data-testid="showcase-row" data-kind={r.key}>
            <div className="showcase-meta">
              <span className="showcase-title">{r.title}</span>
              <span className="showcase-when">{r.when}</span>
            </div>
            {r.payload ? (
              <button
                className="showcase-play"
                data-testid="showcase-play"
                onClick={() => setPlaying(r.payload)}
              >
                演一遍
              </button>
            ) : (
              <span className="showcase-line">「{r.line}」</span>
            )}
          </div>
        ))}
      </div>

      {playing && (
        <LightShiftAha payload={playing} stampedAt={playing.at} onClose={() => setPlaying(null)} />
      )}
    </div>
  )
}
