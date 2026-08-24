import { useState, useMemo, useEffect } from 'react'
import { useStore, useEnabledDimensions } from '../stores/useStore'
import { calculateScoreInRange } from '../engine/scoring'
import { pickReviewQuestions } from '../content/reviewQuestions'
import { MOODS } from '../models/action'

export function ReviewPage() {
  const dimensions = useEnabledDimensions()
  const actions = useStore(s => s.actions)
  const reviews = useStore(s => s.reviews)
  const addReview = useStore(s => s.addReview)
  const updateReview = useStore(s => s.updateReview)
  const deleteReview = useStore(s => s.deleteReview)

  const [activeTab, setActiveTab] = useState<'week' | 'month' | 'year'>('week')
  const [reflection, setReflection] = useState('')

  // 不要把 new Date() 放进依赖数组——每次渲染都是新对象，useMemo 等于没写
  const period = useMemo(() => {
    const d = new Date()
    switch (activeTab) {
      case 'week': {
        const day = d.getDay() || 7
        const start = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day + 1)
        const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6, 23, 59, 59)
        return { start: start.getTime(), end: end.getTime() }
      }
      case 'month': {
        const start = new Date(d.getFullYear(), d.getMonth(), 1)
        const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59)
        return { start: start.getTime(), end: end.getTime() }
      }
      case 'year': {
        const start = new Date(d.getFullYear(), 0, 1)
        const end = new Date(d.getFullYear(), 11, 31, 23, 59, 59)
        return { start: start.getTime(), end: end.getTime() }
      }
    }
  }, [activeTab])

  const existingReview = useMemo(() => {
    return reviews.find(r => r.periodType === activeTab && r.periodStart === period.start)
  }, [reviews, activeTab, period.start])

  // 切换周/月/年，或已存反思发生变化时，把输入框同步成该周期的内容。
  // 原来是在 tab 的 onClick 里 setReflection(existingReview?.…)，读到的是切换「之前」
  // 那个 tab 的 existingReview——切到月回顾却填进了周回顾的文字。
  useEffect(() => {
    setReflection(existingReview?.reflectionText ?? '')
  }, [activeTab, existingReview?.id, existingReview?.reflectionText])

  // 自动摘要
  const autoSummary = useMemo(() => {
    const periodActions = actions.filter(a => a.date >= period.start && a.date <= period.end)
    const totalActions = periodActions.length
    const completedActions = periodActions.filter(a => a.isCompleted).length
    const dimScores = dimensions.map(d => ({
      name: d.name,
      score: calculateScoreInRange(d, actions, period.start, period.end),
    }))
    const topDim = [...dimScores].sort((a, b) => b.score - a.score)[0]
    const bottomDim = [...dimScores].sort((a, b) => a.score - b.score)[0]

    return `共记录 ${totalActions} 条行动，完成 ${completedActions} 条。得分最高的维度是「${topDim?.name || '——'}」(${topDim?.score.toFixed(1) || '0'})，最需要关注的是「${bottomDim?.name || '——'}」(${bottomDim?.score.toFixed(1) || '0'})。`
  }, [dimensions, actions, period])

  // 行动-感受关联（C1）：这段时间记下的感受分布——只呈现，不解读，不评判
  const moodSummary = useMemo(() => {
    const periodActions = actions.filter(a => a.date >= period.start && a.date <= period.end && a.mood)
    return MOODS
      .map(m => ({ ...m, count: periodActions.filter(a => a.mood === m.key).length }))
      .filter(m => m.count > 0)
  }, [actions, period])

  const handleSave = async () => {
    if (existingReview) {
      await updateReview(existingReview.id, { reflectionText: reflection })
    } else {
      await addReview({
        periodType: activeTab,
        periodStart: period.start,
        periodEnd: period.end,
        reflectionText: reflection,
        autoSummary,
      })
    }
    // 保存后不清空：清空会让刚写完的反思从界面上消失，看着像没存上
  }

  const tabs = [
    { key: 'week' as const, label: '周回顾' },
    { key: 'month' as const, label: '月回顾' },
    { key: 'year' as const, label: '年回顾' },
  ]

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto p-8 space-y-6">
        <div>
          <h1 className="text-2xl font-light tracking-wide">回顾反思</h1>
        </div>

        {/* 标签切换 */}
        <div className="seg w-fit">
          {tabs.map(t => (
            <button
              key={t.key}
              className={`seg-item ${activeTab === t.key ? 'is-on' : ''}`}
              onClick={() => setActiveTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* 自动摘要 */}
        <div className="card">
          <h2 className="text-sm font-medium text-[var(--text-secondary)] mb-3">系统摘要</h2>
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{autoSummary}</p>
          {moodSummary.length > 0 && (
            <div className="flex items-center gap-3 mt-3 pt-3 border-t border-[var(--border)]" data-testid="mood-summary">
              <span className="text-xs text-[var(--text-muted)]">这段时间的感受</span>
              {moodSummary.map(m => (
                <span key={m.key} className="text-sm" title={m.label}>
                  {m.emoji}<span className="text-xs text-[var(--text-muted)] ml-0.5">×{m.count}</span>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* 维度评分 */}
        <div className="card">
          <h2 className="text-sm font-medium text-[var(--text-secondary)] mb-4">维度评分</h2>
          <div className="space-y-2">
            {dimensions.map(dim => {
              const score = calculateScoreInRange(dim, actions, period.start, period.end)
              const pct = Math.min(score / 10 * 100, 100)
              return (
                <div key={dim.id} className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: dim.colorHex }} />
                  <span className="text-sm w-20">{dim.name}</span>
                  <div className="flex-1 h-1.5 bg-[var(--bg-hover)] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${pct}%`, backgroundColor: dim.colorHex }}
                    />
                  </div>
                  <span className="text-xs text-[var(--text-muted)] w-8 text-right">{score.toFixed(1)}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* 引导问题（P0-6）：空白框是世界上最难回答的问题，先递三个问题过去 */}
        <div className="card" data-testid="review-questions">
          <h2 className="text-sm font-medium text-[var(--text-secondary)] mb-3">
            引导问题 · 回答其中一个就够了
          </h2>
          <div className="space-y-2">
            {pickReviewQuestions(activeTab, period.start).map(q => (
              <button
                key={q}
                className="w-full text-left text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] py-1.5 px-2 rounded-lg hover:bg-[var(--bg-hover)] transition-colors leading-relaxed"
                title="点击把问题放进反思框"
                onClick={() => setReflection(r => (r ? r + '\n\n' : '') + `【${q}】\n`)}
              >
                🌿 {q}
              </button>
            ))}
          </div>
        </div>

        {/* 反思 */}
        <div className="card">
          <h2 className="text-sm font-medium text-[var(--text-secondary)] mb-3">
            我的反思
          </h2>
          {/* value 直接绑 reflection。曾经写成 reflection || existingReview?.reflectionText，
              空串是 falsy，用户一清空输入框旧内容就弹回来，反思根本删不掉。
              周期切换时的回填交给上面那个 useEffect。 */}
          <textarea
            className="input mb-3"
            rows={4}
            placeholder="这个周期做得好的地方？需要改进的地方？下一步计划？"
            value={reflection}
            onChange={e => setReflection(e.target.value)}
          />
          <button className="btn btn-primary text-sm" onClick={handleSave}>
            {existingReview ? '更新反思' : '保存反思'}
          </button>
        </div>

        {/* 历史回顾 */}
        {reviews.length > 0 && (
          <div className="card">
            <h2 className="text-sm font-medium text-[var(--text-secondary)] mb-4">历史回顾</h2>
            <div className="space-y-4">
              {reviews.slice(0, 10).map(r => (
                <div key={r.id} className="pb-4 border-b border-[var(--border)] last:border-0 group">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs text-[var(--text-muted)]">
                      {r.periodType === 'week' ? '周' : r.periodType === 'month' ? '月' : '年'}
                    </span>
                    <span className="text-xs text-[var(--text-secondary)]">
                      {new Date(r.periodStart).toLocaleDateString('zh-CN')} - {new Date(r.periodEnd).toLocaleDateString('zh-CN')}
                    </span>
                    <button
                      className="btn btn-ghost text-xs py-0.5 px-2 ml-auto opacity-0 group-hover:opacity-100 transition-opacity text-[var(--danger)]"
                      title="删除这条回顾"
                      onClick={() => { if (confirm('删除这条回顾？')) deleteReview(r.id) }}
                    >
                      ×
                    </button>
                  </div>
                  <p className="text-sm text-[var(--text-muted)]">{r.autoSummary}</p>
                  {r.reflectionText && (
                    <p className="text-sm text-[var(--text-secondary)] mt-2 italic">"{r.reflectionText}"</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
