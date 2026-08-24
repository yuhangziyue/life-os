import { QUALITY_LABELS, moodEmoji } from '../models/action'
import type { Action } from '../models/action'
import { useStore } from '../stores/useStore'

interface ActionRowProps {
  action: Action
}

export function ActionRow({ action }: ActionRowProps) {
  const dimensions = useStore(s => s.dimensions)
  const branches = useStore(s => s.branches)
  const deleteAction = useStore(s => s.deleteAction)
  const updateAction = useStore(s => s.updateAction)

  const dim = dimensions.find(d => d.id === action.dimensionId)
  const branch = branches.find(b => b.id === action.branchId)

  const qualityColors: Record<string, string> = {
    minor: 'var(--text-muted)',
    normal: 'var(--text-secondary)',
    major: 'var(--accent)',
    milestone: 'var(--success)',
  }

  return (
    <div className="flex items-center gap-3 py-3 px-2 border-b border-[var(--border)] group hover:bg-[var(--bg-hover)]/50 rounded-lg transition-colors">
      {/* 维度颜色点 */}
      <div
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ backgroundColor: dim?.colorHex || '#666' }}
      />

      {/* 内容 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm truncate">{action.descriptionText || '无描述'}</span>
          {action.mood && (
            <span className="text-sm flex-shrink-0" title="当时的感受">{moodEmoji(action.mood)}</span>
          )}
          {!action.isCompleted && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--warning)]/20 text-[var(--warning)]">
              未完成
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[11px]" style={{ color: dim?.colorHex }}>
            {dim?.name}
          </span>
          {branch && (
            <span className="text-[11px] text-[var(--text-muted)]">
              · {branch.name}
            </span>
          )}
          <span
            className="text-[10px] px-1 rounded"
            style={{ color: qualityColors[action.quality] || qualityColors.normal }}
          >
            {QUALITY_LABELS[action.quality]}
          </span>
        </div>
      </div>

      {/* 操作 */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          className="btn btn-ghost text-xs py-1 px-2"
          onClick={() => updateAction(action.id, { isCompleted: !action.isCompleted })}
          title={action.isCompleted ? '标记未完成' : '标记完成'}
        >
          {action.isCompleted ? '✓' : '○'}
        </button>
        <button
          className="btn btn-ghost text-xs py-1 px-2 text-[var(--danger)]"
          onClick={() => { if (confirm('删除这条记录？')) deleteAction(action.id) }}
        >
          ×
        </button>
      </div>
    </div>
  )
}
