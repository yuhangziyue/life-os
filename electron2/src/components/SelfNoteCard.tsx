import { useEffect, useState } from 'react'
import { getSetting, setSetting } from '../db'
import { parseSelfNote, selfNoteLead, type SelfNote } from '../engine/ahaMoments'

/**
 * 「留给自己的一句话」的读侧（v3.6.2）。
 * 写侧在记录面板底部；这里只负责把它安静地摆出来。
 *
 * 四条硬约束（Lisa 三轮）全部在这里体现：
 *   · 只有「收起这句」，**没有「完成」** —— 收起没有完成语义，所以一句没做到的话
 *     不会变成一件未完成事项
 *   · 7 天自动过期（判据在 parseSelfNote 里，过期就是真的不再出现）
 *   · 永远只显示一条，不显示条数、不显示「已过 X 天」、不显示角标
 *   · 不置顶（小艾的"退一步"）—— 置顶就是待办位
 */
export function SelfNoteCard() {
  const [note, setNote] = useState<SelfNote | null>(null)

  useEffect(() => {
    let alive = true
    getSetting('selfNote')
      .then(raw => { if (alive) setNote(parseSelfNote(raw)) })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  if (!note) return null

  const dismiss = async () => {
    setNote(null)
    try { await setSetting('selfNote', '') } catch { /* 收不起来下次还在，无害 */ }
  }

  return (
    <div className="card space-y-1.5" data-testid="self-note">
      <p className="text-[11px] text-[var(--text-muted)]">{selfNoteLead(note)}</p>
      <p className="text-sm text-[var(--text-primary)] leading-relaxed">{note.text}</p>
      <button
        className="text-[11px] text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
        data-testid="self-note-dismiss"
        onClick={dismiss}
      >
        收起这句
      </button>
    </div>
  )
}
