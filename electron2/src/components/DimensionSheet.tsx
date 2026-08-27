import { Link } from 'react-router-dom'
import { useStore } from '../stores/useStore'
import { dimensionVitality, scoreStage } from '../engine/scoring'
import { QUALITY_LABELS } from '../models/action'

/**
 * 花瓣面板（v3.5 M7）—— 点一片花瓣，从底部升起这一片的近况。
 *
 * 它取代了「维度管理」那一栏：八片花瓣是产品定义不是用户配置项，
 * 要看某一维度，正确入口是点那片花瓣，而不是去菜单里找一个列表。
 *
 * 刻意做薄：状态 + 近况 + 最近三条 + 两个出口。
 * 编辑维度、改评分标准、管分支这些低频重活仍在完整维度页里（这里给一个入口）。
 */
export function DimensionSheet() {
  const id = useStore(s => s.dimensionSheetId)
  const close = useStore(s => s.closeDimensionSheet)
  const dimensions = useStore(s => s.dimensions)
  const actions = useStore(s => s.actions)
  const goals = useStore(s => s.goals)
  const openQuickAddWith = useStore(s => s.openQuickAddWith)

  const dim = dimensions.find(d => d.id === id)
  if (!dim) return null

  const v = dimensionVitality(dim, actions)
  const mine = actions
    .filter(a => a.dimensionId === dim.id)
    .sort((a, b) => b.date - a.date)
  const openGoals = goals.filter(g => g.dimensionId === dim.id && g.isActive)

  return (
    <div className="sheet-scrim" onClick={close} data-testid="dimension-sheet">
      <div className="sheet-body" onClick={e => e.stopPropagation()}>
        <div className="sheet-grip" />

        <div className="flex items-center gap-2.5">
          <span className="w-3 h-3 rounded-full" style={{ backgroundColor: dim.colorHex }} />
          <h3 className="text-lg font-light tracking-wide">{dim.name}</h3>
          <span className="ml-auto text-sm text-[var(--accent)]">{scoreStage(dim.currentScore)}</span>
        </div>

        {dim.identity && (
          <p className="text-xs text-[var(--text-muted)] mt-1">成为{dim.identity}的人</p>
        )}

        <p className="text-sm text-[var(--text-secondary)] mt-3 leading-relaxed">
          {v.dormant
            ? `已经 ${v.daysSinceLast} 天没有照顾它了，花瓣合着，在安静地等你。`
            : `近 7 天照顾了 ${v.recentCount} 次${v.hasToday ? '，包括今天' : ''}。`}
        </p>

        {openGoals.length > 0 && (
          <p className="text-xs text-[var(--text-muted)] mt-2">
            在意的事：{openGoals.slice(0, 2).map(g => g.title).join(' · ')}
          </p>
        )}

        {mine.length > 0 && (
          <div className="mt-4 space-y-1.5" data-testid="sheet-recent">
            <p className="text-[11px] text-[var(--text-muted)] tracking-wide">最近</p>
            {mine.slice(0, 3).map(a => (
              <div key={a.id} className="flex items-baseline gap-2 text-xs">
                <span className="text-[var(--text-secondary)] truncate">{a.descriptionText}</span>
                <span className="ml-auto flex-shrink-0 text-[var(--text-muted)]">
                  {QUALITY_LABELS[a.quality]} · {new Date(a.date).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 mt-5">
          <button
            className="btn btn-primary text-sm flex-1"
            data-testid="sheet-quick-add"
            onClick={() => { close(); openQuickAddWith(dim.id) }}
          >
            记一笔到这片
          </button>
          <Link
            to={`/dimensions/${dim.id}`}
            className="btn text-sm"
            data-testid="sheet-detail-link"
            onClick={close}
          >
            完整页
          </Link>
        </div>
      </div>
    </div>
  )
}
