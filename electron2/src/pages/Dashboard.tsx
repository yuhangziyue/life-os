import { useEffect, useRef } from 'react'
import { useStore, useTodayActions, useOverallScore, useCoveredCount, useEnabledDimensions } from '../stores/useStore'
import { FlowerChart } from '../components/FlowerChart'
import { GardenTasks } from '../components/GardenTasks'
import { QuarterlyInvite } from '../components/QuarterlyInvite'
import { ActionRow } from '../components/ActionRow'
import { scoreStage, dimensionVitality } from '../engine/scoring'
import { maybeSnapshotFlower } from '../services/snapshot'

export function Dashboard() {
  const dimensions = useEnabledDimensions()
  const actions = useStore(s => s.actions)
  const todayActions = useTodayActions()
  const score = useOverallScore()
  const covered = useCoveredCount()
  const setQuickAddOpen = useStore(s => s.setQuickAddOpen)

  const now = new Date()
  const dateStr = now.toLocaleDateString('zh-CN', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
  })

  // 花语时光机（C4）：花形绘制完成后（useEffect 里画的，等一拍）看看这周该不该拍定妆照
  const flowerCardRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (dimensions.length === 0) return
    const timer = setTimeout(() => {
      const canvas = flowerCardRef.current?.querySelector('canvas')
      if (canvas) maybeSnapshotFlower(canvas)
    }, 1600)
    return () => clearTimeout(timer)
  }, [dimensions.length])

  // 首页第一语言是形态和状态词；精确数字降级为次要信息（圆桌拍板：分层，不消灭）
  const stage = scoreStage(score)
  const dormantDims = dimensions.filter(d => dimensionVitality(d, actions).dormant)

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto p-8 space-y-6">
        {/* 头部 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-light tracking-wide">每日看板</h1>
            <p className="text-sm text-[var(--text-muted)] mt-1">{dateStr}</p>
          </div>
          <button
            className="btn btn-primary"
            onClick={() => setQuickAddOpen(true)}
          >
            + 快速记录
          </button>
        </div>

        {/* 今日的花 + 状态 */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
          <div ref={flowerCardRef} className="card md:col-span-3 flex items-center justify-center py-6">
            <FlowerChart dimensions={dimensions} actions={actions} />
          </div>

          <div className="card md:col-span-2 flex flex-col items-center justify-center gap-3 py-8 text-center">
            <div className="text-xs text-[var(--text-muted)] uppercase tracking-widest">
              今日的花
            </div>
            <div className="text-4xl font-light tracking-wide text-[var(--accent)]">
              {stage}
            </div>
            <div className="text-sm text-[var(--text-secondary)]">
              今日照顾了 {covered}/{dimensions.length} 片花瓣
            </div>
            <div className="text-xs text-[var(--text-muted)]">
              综合 {score.toFixed(1)}
            </div>
            {dormantDims.length > 0 && (
              <div className="text-xs text-[var(--text-muted)] leading-relaxed px-4">
                有 {dormantDims.length} 片花瓣在沉睡（
                {dormantDims.slice(0, 3).map(d => d.name).join('、')}
                {dormantDims.length > 3 ? '…' : ''}
                ），它们在安静地等你
              </div>
            )}
          </div>
        </div>

        {/* 季度会谈到期邀请（满 84 天才出现，可推迟） */}
        <QuarterlyInvite />

        {/* 花园任务（今日轻推） */}
        <GardenTasks />

        {/* 今日行动 */}
        <div className="card">
          <h2 className="text-sm font-medium text-[var(--text-secondary)] mb-4">
            今日行动 · {todayActions.filter(a => a.isCompleted).length}/{todayActions.length}
          </h2>

          {todayActions.length === 0 ? (
            <div className="text-center py-8 text-[var(--text-muted)] text-sm">
              <p className="mb-2">今天还没浇水，随时可以来</p>
              <button
                className="btn btn-ghost text-sm"
                onClick={() => setQuickAddOpen(true)}
              >
                + 记下第一件小事
              </button>
            </div>
          ) : (
            <div className="space-y-0">
              {todayActions.map(a => (
                <ActionRow key={a.id} action={a} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
