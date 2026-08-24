import { useState, useMemo } from 'react'
import { useStore, useTodayActions } from '../stores/useStore'
import { ActionRow } from '../components/ActionRow'
import { Select } from '../components/ui/Select'
import { QUALITY_LABELS } from '../models/action'
import type { ActionQuality } from '../models/action'

export function Actions() {
  const actions = useStore(s => s.actions)
  const dimensions = useStore(s => s.dimensions)
  const setQuickAddOpen = useStore(s => s.setQuickAddOpen)

  const [filterDim, setFilterDim] = useState('')
  const [filterQuality, setFilterQuality] = useState('')

  const filtered = useMemo(() => {
    return actions.filter(a => {
      if (filterDim && a.dimensionId !== filterDim) return false
      if (filterQuality && a.quality !== filterQuality) return false
      return true
    })
  }, [actions, filterDim, filterQuality])

  // 按天分组
  const grouped = useMemo(() => {
    const map = new Map<string, typeof actions>()
    for (const a of filtered) {
      const key = new Date(a.date).toLocaleDateString('zh-CN', {
        month: 'long', day: 'numeric', weekday: 'short',
      })
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(a)
    }
    return map
  }, [filtered])

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-light tracking-wide">行动记录</h1>
            <p className="text-sm text-[var(--text-muted)] mt-1">
              共 {filtered.length} 条记录
            </p>
          </div>
          <button className="btn btn-primary" onClick={() => setQuickAddOpen(true)}>
            + 快速记录
          </button>
        </div>

        {/* 筛选 */}
        <div className="flex gap-3 flex-wrap">
          <Select
            testId="filter-dimension"
            value={filterDim}
            onChange={setFilterDim}
            placeholder="全部维度"
            options={dimensions
              .filter(d => d.isEnabled)
              .map(d => ({ value: d.id, label: d.name, colorHex: d.colorHex }))}
          />

          <Select
            testId="filter-quality"
            value={filterQuality}
            onChange={setFilterQuality}
            placeholder="全部质量"
            options={(Object.keys(QUALITY_LABELS) as ActionQuality[])
              .map(q => ({ value: q, label: QUALITY_LABELS[q] }))}
          />

          {(filterDim || filterQuality) && (
            <button
              className="btn btn-ghost text-sm"
              onClick={() => { setFilterDim(''); setFilterQuality('') }}
            >
              清除筛选
            </button>
          )}
        </div>

        {/* 时间线 */}
        {grouped.size === 0 ? (
          <div className="card text-center py-12 text-[var(--text-muted)] text-sm">
            <p className="mb-2">暂无记录</p>
            <button className="btn btn-ghost text-sm" onClick={() => setQuickAddOpen(true)}>
              + 记录第一条
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {Array.from(grouped.entries()).map(([dateStr, dayActions]) => (
              <div key={dateStr}>
                <h3 className="text-xs font-medium text-[var(--text-muted)] mb-2 uppercase tracking-wider">
                  {dateStr}
                </h3>
                <div className="card">
                  {dayActions.map(a => (
                    <ActionRow key={a.id} action={a} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
