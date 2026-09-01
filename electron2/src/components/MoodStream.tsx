import { useMemo } from 'react'
import { useStore } from '../stores/useStore'
import { MOODS } from '../models/action'
import { startOfDay } from '../engine/ahaGate'

/**
 * 感受流（v3.6.2，销报告台账 R3）。
 *
 * 报告原方案：连记 3 天感受 → 第 4 天给一张「情绪趋势」微卡。
 * 08-25 圆桌判「需情绪数据积累」进停车场；08-27 台账复核发现**前置早就写好了**
 * （`Review.tsx` 的 `moodSummary`），差的只是把它做成一张触发式微卡。
 *
 * ============ 🔴 只呈现，不解读 ============
 * 这是这张卡唯一的红线，也是它与所有情绪追踪 App 的分界：
 *   · 不算「情绪均值」「好心情占比」—— 那是给感受打分，而感受不是绩效
 *   · 不说「你最近有点累」—— 那是产品替用户下诊断，越权
 *   · 不给建议、不给按钮、不问「要不要休息一下」—— 关心一旦变成指令，
 *     用户做不到就是又一笔欠账（Lisa 一轮对「深夜关心式文案」的裁决同源）
 * 它只做一件事：**把他自己写下的那几个表情按天摆出来，让他自己看一眼。**
 *
 * 触发条件：近 7 天里**至少 3 天**记过感受。不到就不出现 —— 一两天的样本摆出来
 * 只会诱导过度解读，而过度解读的方向永远是自我批评。
 */

const DAY_MS = 24 * 60 * 60 * 1000
const WINDOW_DAYS = 7
export const MOOD_STREAM_MIN_DAYS = 3

export function MoodStream() {
  const actions = useStore(s => s.actions)

  const view = useMemo(() => {
    const today = startOfDay(Date.now())
    const from = today - (WINDOW_DAYS - 1) * DAY_MS

    // 按天收集感受（同一天可能记了好几条，各自的表情都留着）
    const byDay = new Map<number, string[]>()
    for (const a of actions) {
      if (!a.mood) continue
      const d = startOfDay(a.date)
      if (d < from || d > today) continue
      const row = byDay.get(d) ?? []
      row.push(a.mood)
      byDay.set(d, row)
    }
    if (byDay.size < MOOD_STREAM_MIN_DAYS) return null

    const days: { date: number; moods: string[] }[] = []
    for (let i = 0; i < WINDOW_DAYS; i++) {
      const d = from + i * DAY_MS
      days.push({ date: d, moods: byDay.get(d) ?? [] })
    }
    return { days, daysWithMood: byDay.size }
  }, [actions])

  if (!view) return null

  const emojiOf = (key: string) => MOODS.find(m => m.key === key)?.emoji ?? ''

  return (
    <div className="card space-y-2" data-testid="mood-stream">
      <h2 className="text-sm font-medium text-[var(--text-secondary)]">这七天记下的感受</h2>
      <div className="mood-stream">
        {view.days.map(d => (
          <div key={d.date} className="mood-day" data-testid="mood-day">
            <div className="mood-day-marks">
              {d.moods.length === 0
                ? <span className="mood-blank" />
                : d.moods.slice(0, 3).map((m, i) => (
                    <span key={i} className="mood-mark">{emojiOf(m)}</span>
                  ))}
            </div>
            <span className="mood-day-label">
              {new Date(d.date).toLocaleDateString('zh-CN', { day: 'numeric' })}
            </span>
          </div>
        ))}
      </div>
      {/* 唯一一句说明，且它说的是「我们不做什么」 */}
      <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
        这里不算平均、不分好坏，也不会因为哪个表情多就给你建议。它只是你写下的那几笔。
      </p>
    </div>
  )
}
