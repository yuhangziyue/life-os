import { useMemo, useState } from 'react'
import { useStore, useEnabledDimensions } from '../stores/useStore'
import { SubPageHeader } from '../components/SubPageHeader'
import { ActionRow } from '../components/ActionRow'
import { startOfToday } from '../engine/scoring'

const DAY_MS = 24 * 60 * 60 * 1000
/** 一次渲染多少天。往下点「再往前」继续加 —— 不做无限滚动，账本不需要瀑布流 */
const PAGE_DAYS = 30

/**
 * 全部历史记录（v3.7 A3）—— 从「今天」的「最近的记录」右上角「更多」进来。
 *
 * 为什么把它单独拆出来：「今天」那一屏原本挂着 14 天的记录流，越用越长，
 * 而那一屏的职责是**今天**，不是档案馆。现在首屏只留最近三条，
 * 全部历史进这一页，**按天分组**（子曰口径：按每一天看所有历史记录）。
 *
 * 与老的「行动记录」页（/actions，带维度筛选）的分工：
 *   这一页是**时间轴**（我哪天做了什么），/actions 是**筛选器**（某一片花瓣都记过什么）。
 *   两条路径服务两种问题，都保留；这一页从「今天」进，那一页从花瓣详情进。
 */
export function History() {
  const actions = useStore(s => s.actions)
  const dimensions = useEnabledDimensions()
  const [daysBack, setDaysBack] = useState(PAGE_DAYS)

  const groups = useMemo(() => {
    const today = startOfToday()
    const from = today - (daysBack - 1) * DAY_MS
    const rows = actions
      .filter(a => a.date >= from)
      .sort((a, b) => b.date - a.date)
    const out: { date: number; rows: typeof rows }[] = []
    for (const a of rows) {
      const g = out.find(x => x.date === a.date)
      if (g) g.rows.push(a)
      else out.push({ date: a.date, rows: [a] })
    }
    return out
  }, [actions, daysBack])

  const oldest = useMemo(
    () => (actions.length ? Math.min(...actions.map(a => a.date)) : startOfToday()),
    [actions],
  )
  const hasMore = oldest < startOfToday() - (daysBack - 1) * DAY_MS

  const dayLabel = (ts: number) => {
    const diff = Math.round((startOfToday() - ts) / DAY_MS)
    if (diff === 0) return '今天'
    if (diff === 1) return '昨天'
    if (diff === 2) return '前天'
    return new Date(ts).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' })
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="page-pad space-y-4">
        <SubPageHeader
          title="全部记录"
          subtitle={`共 ${actions.length} 条`}
          fallback="/"
        />

        {groups.length === 0 ? (
          <div className="card text-center py-8 text-sm text-[var(--text-muted)]">
            还没有记录。花在等你，不在催你。
          </div>
        ) : (
          groups.map(g => (
            <div key={g.date} className="card space-y-1" data-testid="history-day">
              <div className="flex items-baseline justify-between">
                <h2 className="text-sm font-medium text-[var(--text-secondary)]">{dayLabel(g.date)}</h2>
                {/* 那一天的光分给了哪几片：只用色点，不写数字 */}
                <div className="flex items-center gap-1">
                  {[...new Set(g.rows.map(r => r.dimensionId))].slice(0, 8).map(id => {
                    const d = dimensions.find(x => x.id === id)
                    return d ? (
                      <span key={id} className="dot-sm" style={{ backgroundColor: d.colorHex }} title={d.name} />
                    ) : null
                  })}
                </div>
              </div>
              <div className="space-y-0">
                {g.rows.map(a => <ActionRow key={a.id} action={a} />)}
              </div>
            </div>
          ))
        )}

        {hasMore && (
          <button
            className="drawer-link w-full"
            data-testid="history-more"
            onClick={() => setDaysBack(d => d + PAGE_DAYS)}
          >
            <span>再往前</span>
            <span className="drawer-hint">继续加载三十天 ›</span>
          </button>
        )}
      </div>
    </div>
  )
}
