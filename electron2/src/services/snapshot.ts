// 花语时光机（v3.1 C4）——每周给花拍一张「定妆照」，统计页回看它这一年怎么长。
// 手账文化里最动人的不是今天那页，是翻回三月那页（书香 B4）。

import { getSnapshots, addSnapshot, uuid } from '../db'

/** ISO 周编号，如 2026-W34（同一周重复拍会被 weekKey UNIQUE 覆盖而不是叠加） */
export function weekKeyOf(ts: number): string {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  // ISO 8601：周四所在的年份决定周归属
  const t = new Date(d)
  t.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7))
  const week1 = new Date(t.getFullYear(), 0, 4)
  const week = 1 + Math.round(
    ((t.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7
  )
  return `${t.getFullYear()}-W${String(week).padStart(2, '0')}`
}

/**
 * 条件满足则拍一张：本周还没拍，且（今天是周日 / 还一张都没有 / 距上一张 ≥6 天）。
 * 「≥6 天」兜底给从不在周日打开应用的人——时光机不能因为作息就永远空着。
 * PNG 缩到一半尺寸落库，30 年也就几 MB。
 */
export async function maybeSnapshotFlower(canvas: HTMLCanvasElement): Promise<boolean> {
  try {
    const rows: { weekKey: string; takenAt: number }[] = await getSnapshots()
    const wk = weekKeyOf(Date.now())
    if (rows.some(r => r.weekKey === wk)) return false

    const isSunday = new Date().getDay() === 0
    const newest = rows.length ? Math.max(...rows.map(r => r.takenAt)) : 0
    const stale = Date.now() - newest >= 6 * 86400000
    if (!isSunday && rows.length > 0 && !stale) return false

    const w = Math.max(1, Math.round(canvas.width / 2))
    const h = Math.max(1, Math.round(canvas.height / 2))
    const off = document.createElement('canvas')
    off.width = w
    off.height = h
    const ctx = off.getContext('2d')
    if (!ctx) return false
    ctx.drawImage(canvas, 0, 0, w, h)

    await addSnapshot({ id: uuid(), weekKey: wk, takenAt: Date.now(), dataUrl: off.toDataURL('image/png') })
    return true
  } catch {
    return false // 拍不成不影响任何功能
  }
}
