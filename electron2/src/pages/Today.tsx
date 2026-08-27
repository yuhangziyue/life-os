import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useStore, useTodayActions } from '../stores/useStore'
import { DailyGlance } from '../components/DailyGlance'
import { GardenTasks } from '../components/GardenTasks'
import { ActionRow } from '../components/ActionRow'
import { startOfToday } from '../engine/scoring'

const DAY_MS = 24 * 60 * 60 * 1000
/** 「更早」往回看多少天。再往前请走「全部记录」——这一屏是今天，不是档案馆 */
const EARLIER_DAYS = 14

/**
 * 「今天」—— 三入口之二（v3.5 M3）。
 *
 * 它把原来的「每日看板」和「行动记录」两栏合成一屏：
 *   推给你的（今日一瞥 / 花园轻推） + 你记下的（今天 / 更早）。
 *
 * 红线不变（v3.3 T3）：一瞥一天只出一条、零按钮、零催办；轻推可以整片无视。
 * 空态写「花在等你，不在催你」—— 不写「快去记录」。
 */
export function Today() {
  const actions = useStore(s => s.actions)
  const todayActions = useTodayActions()
  const setQuickAddOpen = useStore(s => s.setQuickAddOpen)

  const today = startOfToday()
  const earlier = useMemo(() => {
    const from = today - EARLIER_DAYS * DAY_MS
    const rows = actions
      .filter(a => a.date < today && a.date >= from)
      .sort((a, b) => b.date - a.date)
    // 按天分组：一屏里同一天的记录挨在一起，比一条长列表好读
    const groups: { date: number; rows: typeof rows }[] = []
    for (const a of rows) {
      const g = groups.find(x => x.date === a.date)
      if (g) g.rows.push(a)
      else groups.push({ date: a.date, rows: [a] })
    }
    return groups
  }, [actions, today])

  const dayLabel = (ts: number) => {
    const diff = Math.round((today - ts) / DAY_MS)
    if (diff === 1) return '昨天'
    if (diff === 2) return '前天'
    return new Date(ts).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="page-pad max-w-3xl mx-auto space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-light tracking-wide">今天</h1>
            <p className="text-sm text-[var(--text-muted)] mt-1">
              {new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
            </p>
          </div>
          <button className="btn btn-primary desktop-only" onClick={() => setQuickAddOpen(true)}>
            + 快速记录
          </button>
        </div>

        {/* 推给你的 */}
        <DailyGlance />
        <GardenTasks />

        {/* 你记下的 · 今天 */}
        <div className="card">
          <h2 className="text-sm font-medium text-[var(--text-secondary)] mb-4">
            今天记了什么 · {todayActions.filter(a => a.isCompleted).length}/{todayActions.length}
          </h2>

          {todayActions.length === 0 ? (
            <div className="text-center py-8 text-[var(--text-muted)] text-sm" data-testid="today-empty">
              <p className="mb-2">今天还没记 —— 不要紧，花在等你，不在催你</p>
              <button className="btn btn-ghost text-sm" onClick={() => setQuickAddOpen(true)}>
                + 记下第一件小事
              </button>
            </div>
          ) : (
            <div className="space-y-0">
              {todayActions.map(a => <ActionRow key={a.id} action={a} />)}
            </div>
          )}
        </div>

        {/* 你记下的 · 更早 */}
        {earlier.length > 0 && (
          <div className="card space-y-4" data-testid="earlier-actions">
            <h2 className="text-sm font-medium text-[var(--text-secondary)]">更早</h2>
            {earlier.map(g => (
              <div key={g.date}>
                <p className="text-[11px] text-[var(--text-muted)] tracking-wide mb-1">{dayLabel(g.date)}</p>
                <div className="space-y-0">
                  {g.rows.map(a => <ActionRow key={a.id} action={a} />)}
                </div>
              </div>
            ))}
          </div>
        )}

        <Link to="/actions" className="drawer-link" data-testid="link-actions">
          <span>全部记录</span>
          <span className="drawer-hint">按维度筛选 · 完整历史 ›</span>
        </Link>
      </div>
    </div>
  )
}
