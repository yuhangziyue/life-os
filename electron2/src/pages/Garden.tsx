import { useEffect, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import {
  useStore, useOverallScore, useCoveredCount, useEnabledDimensions, useCompanionDays,
} from '../stores/useStore'
import { FlowerChart } from '../components/FlowerChart'
import { LightBand } from '../components/LightBand'
import { MonthlyCheckin } from '../components/MonthlyCheckin'
import { PostcardCard } from '../components/PostcardCard'
import { QuarterlyInvite } from '../components/QuarterlyInvite'
import { DimensionSheet } from '../components/DimensionSheet'
import { scoreStage, dimensionVitality } from '../engine/scoring'
import { consecutiveWeeks } from '../engine/streak'
import { gardenBirth } from '../engine/quarterly'
import { maybeSnapshotFlower } from '../services/snapshot'

/**
 * 「花」—— 三入口之一，默认落地页（v3.5 M2）。
 *
 * 为什么默认落地在这里，而不是落在待办流（这是 v3.5 唯一被拍板的分歧）：
 *   花是这个产品的第一语言。落地在待办流会把产品打回 v3 明确废掉的「人生 KPI 看板」。
 *   打卡不会因此变远 —— 记一笔 FAB 三个 tab 常驻，⌘⇧L 全局可用。
 *
 * 屏内顺序是刻意的：形状 → 光的分配 → 三个指标 → 结算 → 细看。
 *   由「一眼能读的」走到「要坐下来读的」，越往下越慢。
 *   精确分数不在这一屏出现（首页分层红线），它在「细看数据」里。
 */
export function Garden() {
  const dimensions = useEnabledDimensions()
  const actions = useStore(s => s.actions)
  const quarterlyReviews = useStore(s => s.quarterlyReviews)
  const score = useOverallScore()
  const covered = useCoveredCount()
  const companionDays = useCompanionDays()
  const setQuickAddOpen = useStore(s => s.setQuickAddOpen)

  const flowerCardRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (dimensions.length === 0) return
    const timer = setTimeout(() => {
      const canvas = flowerCardRef.current?.querySelector('canvas')
      if (canvas) maybeSnapshotFlower(canvas)
    }, 1600)
    return () => clearTimeout(timer)
  }, [dimensions.length])

  const stage = scoreStage(score)
  const dormantDims = dimensions.filter(d => dimensionVitality(d, actions).dormant)
  const bloomCount = dimensions.filter(d => d.currentScore >= 6).length

  // 三个指标：只留三个。中间那个是北极星，所以放中间
  const weeks = useMemo(() => consecutiveWeeks(actions), [actions])
  const seasonStart = useMemo(() => {
    const done = quarterlyReviews.filter(r => r.completedAt != null)
    return done.length ? Math.max(...done.map(r => r.completedAt as number)) : gardenBirth(dimensions)
  }, [quarterlyReviews, dimensions])
  const seasonCount = actions.filter(a => a.isCompleted && a.date >= seasonStart).length

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="page-pad max-w-3xl mx-auto space-y-5">
        {/* 头部。窄屏隐藏「+ 快速记录」——那里有 FAB，两个入口挨着是重复 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-light tracking-wide">我的花园</h1>
            <p className="text-sm text-[var(--text-muted)] mt-1">
              {new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })}
            </p>
          </div>
          <button className="btn btn-primary desktop-only" onClick={() => setQuickAddOpen(true)}>
            + 快速记录
          </button>
        </div>

        {/* ① 一朵大花 + 状态词。花瓣可点 —— 主视觉同时是导航（M7） */}
        <div ref={flowerCardRef} className="card flex flex-col items-center gap-3 py-6">
          <FlowerChart dimensions={dimensions} actions={actions} size={340} petalLinkable />
          <div className="text-center space-y-1">
            <div className="text-xs text-[var(--text-muted)] uppercase tracking-widest">今日的花</div>
            <div className="text-3xl font-light tracking-wide text-[var(--accent)]">{stage}</div>
            <div className="text-sm text-[var(--text-secondary)]">
              {bloomCount} 片盛开 · 今日照顾了 {covered}/{dimensions.length} 片花瓣
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

        {/* ② 光带：花瓣说「长成什么样」，光带说「光是从哪儿分出去的」 */}
        <div className="card">
          <LightBand dimensions={dimensions} actions={actions} />
        </div>

        {/* ③ 三个指标。连续记录周是北极星指标（v3 圆桌：成功 = 连续使用周数） */}
        <div className="metric-row" data-testid="garden-metrics">
          <div className="metric-cell">
            <div className="metric-value">{companionDays}</div>
            <div className="metric-key">陪伴天数</div>
          </div>
          <div className="metric-cell is-star" data-testid="metric-weeks">
            <div className="metric-value">{weeks}</div>
            <div className="metric-key">连续记录周</div>
          </div>
          <div className="metric-cell">
            <div className="metric-value">{seasonCount}</div>
            <div className="metric-key">本季条数</div>
          </div>
        </div>

        {/* ④ 结算区。这是未来付费墙的位置，视觉权重要够 */}
        <PostcardCard flowerHost={flowerCardRef} />
        <QuarterlyInvite />
        <MonthlyCheckin />

        <Link to="/review" className="drawer-link" data-testid="link-review">
          <span>周对账</span>
          <span className="drawer-hint">五分钟看一眼形状有没有偏出你的意图 ›</span>
        </Link>

        {/* ⑤ 细看数据：深度用户要的东西一样不少，只是不再占导航位 */}
        <Link to="/stats" className="drawer-link" data-testid="link-stats">
          <span>细看数据</span>
          <span className="drawer-hint">季度会谈 · 热力图 · 花语时光机 · 维度排名 ›</span>
        </Link>
      </div>

      {/* 点花瓣弹出的维度面板（M7） */}
      <DimensionSheet />
    </div>
  )
}
