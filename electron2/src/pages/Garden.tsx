import { useEffect, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import {
  useStore, useOverallScore, useCoveredCount, useEnabledDimensions,
  useCompanionDays, useRecordedDays,
} from '../stores/useStore'
import { FlowerChart } from '../components/FlowerChart'
import { LightBand } from '../components/LightBand'
import { WeekRings } from '../components/WeekRings'
import { PeriodCompare } from '../components/PeriodCompare'
import { QuarterlyInvite } from '../components/QuarterlyInvite'
import { DimensionSheet } from '../components/DimensionSheet'
import { scoreStage, dimensionVitality } from '../engine/scoring'
import { lightShares } from '../engine/impression'
import { shapeSummary } from '../engine/shape'
import { maybeSnapshotFlower } from '../services/snapshot'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * 「我的花园」—— 三入口之二（v3.6，按子曰 2026-08-27 口径重排）。
 *
 * 四个板块，顺序是刻意的：由「时间」走到「此刻」，再走到「逐片细看」。
 *   ⓿ 光的年轮（最近九十天）—— 这一屏唯一的时间维，40px，扁到不抢形态的戏（小露二轮定位）
 *   ① 花的形态 + 一句小概括 —— 概括用形状句，不用分数（「六片让给了两片」这类）
 *   ② 时间汇总 —— 总时间 / 记录时间 / 记录数量
 *   ③ 逐片花瓣 ⇄ 周月对比（切换）
 *
 * 🔴 数字纪律（第五轮圆桌 Lisa + 小艾 + 小露三方共识）：
 *   日常记录路径**零数字**；这一屏是「对账档」，所以允许出现数字，
 *   但一律不带箭头、不带涨跌配色、不说「进步」——
 *   八段之和恒为 100%，一片涨必有一片跌，「进步」在这个模型里是数学上的伪概念。
 */
export function Garden() {
  const dimensions = useEnabledDimensions()
  const actions = useStore(s => s.actions)
  const score = useOverallScore()
  const covered = useCoveredCount()
  const companionDays = useCompanionDays()
  const recordedDays = useRecordedDays()

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

  // 一句小概括：形状，不是分数。样本太薄时它会自己说「账还薄，先攒着」
  const shape = useMemo(() => {
    const shares = lightShares(dimensions, actions, Date.now() - 7 * DAY_MS)
    // 第四参必须传 —— 不传则「有几片没被点到」那一支永远算成 0（见 shape.ts 顶部注释）
    return shapeSummary(shares, '这一周', null, dimensions.length)
  }, [dimensions, actions])

  const totalRecords = actions.filter(a => a.isCompleted).length

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="page-pad space-y-4">
        <div>
          <h1 className="text-2xl font-light tracking-wide">我的花园</h1>
        </div>

        {/* ⓿ 一周的光（v3.7 B1）：子曰要「默认按照一个周的维度，一天是一个竖着的长方形」。
            九十天那张年轮移到「花园年鉴」——两张图回答的是不同尺度的问题，
            首屏这一张答「最近这几天我的光怎么分的」，年鉴那一张答「这一季的走势」。 */}
        <WeekRings dimensions={dimensions} actions={actions} />

        {/* ① 形态 + 一句小概括。花瓣可点 —— 主视觉同时是导航 */}
        <div ref={flowerCardRef} className="card flex flex-col items-center gap-3 py-5">
          <FlowerChart dimensions={dimensions} actions={actions} size={300} petalLinkable />
          <div className="text-center space-y-1.5">
            <div className="text-2xl font-light tracking-wide text-[var(--accent)]">{stage}</div>
            {shape && (
              <div className="text-sm text-[var(--text-secondary)]" data-testid="shape-summary">
                {shape.text}
              </div>
            )}
            {/* 简约收口（v3.6.1）：这里原本是四行文字（状态词/今日照顾/形状句/沉睡各一行）。
                合并成一行小字 —— 花下面的字越多，花本身越不像第一语言 */}
            <div className="text-xs text-[var(--text-muted)] leading-relaxed px-2">
              今日照顾了 {covered}/{dimensions.length} 片花瓣
              {dormantDims.length > 0 && ` · 有 ${dormantDims.length} 片合着，在安静地等你`}
            </div>
          </div>
          <div className="w-full px-1">
            <LightBand dimensions={dimensions} actions={actions} />
          </div>
        </div>

        {/* ② 时间汇总。三个数都不可能归零 —— 这是它们能被显示出来的前提 */}
        <div className="card space-y-3" data-testid="time-summary">
          <h2 className="text-sm font-medium text-[var(--text-secondary)]">陪你走过的时间</h2>
          <div className="metric-row">
            <div className="metric-cell" data-testid="companion-days">
              <div className="metric-value">{companionDays}</div>
              <div className="metric-key">陪伴天数</div>
            </div>
            <div className="metric-cell is-star" data-testid="metric-recorded">
              <div className="metric-value">{recordedDays}</div>
              <div className="metric-key">记过的天</div>
            </div>
            <div className="metric-cell">
              <div className="metric-value">{totalRecords}</div>
              <div className="metric-key">一共几笔</div>
            </div>
          </div>
          <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
            三个数都不会退。它们记的是在场，不是表现。
          </p>
        </div>

        {/* ③ 周月对比（v3.7 B4：花瓣逐片列表撤掉 —— 逐片入口已经在花上，
            点那片花瓣就能看它的近况，再列一遍是重复） */}
        <PeriodCompare dimensions={dimensions} actions={actions} />

        {/*
          结算区（v3.7 B5）——「暂时不要了，隐藏，以后可能需要」，但**只藏两样，邀请不能藏**。
          书香的理由无法反驳：手册第四章已经把「到期不催、推迟两次缩成小花苞」**写成了承诺**，
          藏掉它是产品毁自己写下的字。
          更硬的一条是实证：`bud`（底栏那枚小花苞）的触发条件是**连续推迟两次之后**——
          而卡一藏，用户就永远不会去推迟，于是**花蕾永不出现，到期信号彻底消失**。
          藏掉邀请不是"以后再打开"，是把 84 天那场结算变成一件不会发生的事。
          ⇒ 月度微校准与明信片收进「我的复盘」（它们本来就是回顾物），季度会谈邀请留在这里。
        */}
        <QuarterlyInvite />

        {/* v3.7 B6/B8：两个改名。为什么不照抄子曰给的字，见方案结论 7 */}
        <Link to="/review" className="drawer-link" data-testid="link-review">
          <span>我的复盘</span>
          <span className="drawer-hint">这一周 · 这个月 · 这一年 ›</span>
        </Link>
        <Link to="/stats" className="drawer-link" data-testid="link-stats">
          <span>花园年鉴</span>
          <span className="drawer-hint">光去了哪 · 花长成什么样 · 每一片花瓣 ›</span>
        </Link>
      </div>

      <DimensionSheet />
    </div>
  )
}
