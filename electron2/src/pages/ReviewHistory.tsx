import { useStore } from '../stores/useStore'
import { SubPageHeader } from '../components/SubPageHeader'

/**
 * 历史回顾（v3.7 B6）—— 从「我的复盘」的独立入口进来。
 *
 * 它此前是当期复盘页最底下的一张卡。那个位置有个具体的坏处：
 * 用户每次写完这一周的思考，往下一滚就看见自己过去十条，
 * 于是**每一次复盘都自动附赠一次自我审阅**。拆出去之后，翻旧账是他主动的选择。
 *
 * 另一处改动：原来只显示 `slice(0, 10)`，且**没有任何地方说明被截断了**。
 * 「静默截断」在账本类产品里是最不该有的东西 —— 用户以为自己只写过十篇。
 * 现在全量列出（按时间倒序），并按周期分组标注。
 */
export function ReviewHistory() {
  const reviews = useStore(s => s.reviews)
  const deleteReview = useStore(s => s.deleteReview)

  const sorted = [...reviews].sort((a, b) => b.periodStart - a.periodStart)

  const label = (t: string) => (t === 'week' ? '周' : t === 'month' ? '月' : '年')
  const dateRange = (start: number, end: number) => {
    const f = (ts: number) => new Date(ts).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
    return `${new Date(start).getFullYear()}年 ${f(start)} – ${f(end)}`
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="page-pad space-y-4">
        <SubPageHeader
          title="历史回顾"
          subtitle={sorted.length > 0 ? `一共 ${sorted.length} 篇` : undefined}
          fallback="/review"
        />

        {sorted.length === 0 ? (
          <div className="card text-center py-8 text-sm text-[var(--text-muted)] leading-relaxed">
            还没有写下的回顾。
            <br />
            {/* 出口是「去看」不是「去写」—— 同一条口径：导航不是催办 */}
            写不写都不影响什么，账一直在那儿。
          </div>
        ) : (
          sorted.map(r => (
            <div key={r.id} className="card space-y-2 group" data-testid="history-review">
              <div className="flex items-center gap-2">
                <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--bg-secondary)] text-[var(--text-muted)]">
                  {label(r.periodType)}
                </span>
                <span className="text-xs text-[var(--text-secondary)]">
                  {dateRange(r.periodStart, r.periodEnd)}
                </span>
                <button
                  className="btn btn-ghost text-xs py-0.5 px-2 ml-auto opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity text-[var(--danger)]"
                  title="删除这条回顾"
                  onClick={() => { if (confirm('删除这条回顾？')) deleteReview(r.id) }}
                >
                  ×
                </button>
              </div>
              {r.autoSummary && (
                <p className="text-sm text-[var(--text-muted)] leading-relaxed">{r.autoSummary}</p>
              )}
              {r.reflectionText && (
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">
                  {r.reflectionText}
                </p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
