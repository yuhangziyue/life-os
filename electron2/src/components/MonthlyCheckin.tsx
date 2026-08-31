import { useMemo, useState } from 'react'
import { useStore, useEnabledDimensions } from '../stores/useStore'
import { monthlyState, composeMonthlyFacts, MONTHLY_CYCLE_DAYS } from '../engine/impression'
import { calculateScoreInRange } from '../engine/scoring'
import { gardenBirth } from '../engine/quarterly'
import { pickReviewQuestions } from '../content/reviewQuestions'
import { FlowerChart } from './FlowerChart'
import { usePairFlowerSize } from '../hooks/useFlowerSize'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * 月度微校准（v3.3 T9，报告 §6.2.1）—— 结算的轻量版，一幕，两分钟。
 *
 * 报告原话：「用户可能在第 30 天就流失了，根本等不到第一次会谈。」这条判断是对的，
 * 84 天对新用户是个太远的地平线。所以在第 30 天先给一次小的回望。
 *
 * 刻意做薄（圆桌定）：不打分、不选焦点、不写意图 —— 那三件事是季度会谈的分量，
 * 挪到月度会把两个仪式都稀释掉。这里只做两件事：看两朵花 + 回答一个问题。
 *
 * 红线：
 *   - 「继续照看花园」= 完全跳过，且不留任何痕迹、不记未完成、不再追问
 *   - 两朵花的差异只用形态词，不出现涨跌箭头与百分比（沿用季度会谈第三幕的口径）
 *   - 答案可空；空答案也算走完，下一期照常从今天起算
 */
export function MonthlyCheckin() {
  // 并排两朵花：窄屏收小，不改布局 —— 「并排」本身就是这一屏的全部信息
  const pairSize = usePairFlowerSize(150)
  const dimensions = useEnabledDimensions()
  const actions = useStore(s => s.actions)
  const reviews = useStore(s => s.reviews)
  const addReview = useStore(s => s.addReview)

  const [text, setText] = useState('')
  const [writing, setWriting] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [saving, setSaving] = useState(false)

  const state = useMemo(() => {
    const lastMonthly = reviews
      .filter(r => r.periodType === 'month')
      .reduce<number | null>((max, r) => (max == null || r.createdAt > max ? r.createdAt : max), null)
    return monthlyState({ lastMonthlyAt: lastMonthly, gardenBirthAt: gardenBirth(dimensions) })
  }, [reviews, dimensions])

  const facts = useMemo(
    () => composeMonthlyFacts(dimensions, actions, state.periodStart),
    [dimensions, actions, state.periodStart],
  )

  // 两朵花：本期 vs 上一期，各自用区间内的分数重绘
  const thisMonthScores = useMemo(
    () => Object.fromEntries(
      dimensions.map(d => [d.id, calculateScoreInRange(d, actions, state.periodStart, Date.now())])
    ),
    [dimensions, actions, state.periodStart],
  )
  const lastMonthScores = useMemo(
    () => Object.fromEntries(
      dimensions.map(d => [d.id, calculateScoreInRange(d, actions, state.prevStart, state.periodStart)])
    ),
    [dimensions, actions, state.prevStart, state.periodStart],
  )

  const question = useMemo(
    () => pickReviewQuestions('month', state.periodStart)[0],
    [state.periodStart],
  )

  if (!state.due || dismissed || dimensions.length === 0) return null

  const finish = async () => {
    if (saving) return
    setSaving(true)
    try {
      await addReview({
        periodType: 'month',
        periodStart: state.periodStart,
        periodEnd: Date.now(),
        reflectionText: text.trim(),
        autoSummary: facts.join('\n'),
      })
      setDismissed(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card space-y-4" data-testid="monthly-checkin">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-medium text-[var(--text-secondary)]">月度微校准</h2>
        <span className="text-xs text-[var(--text-muted)]">
          距上次回望 {state.daysSince} 天 · 大约两分钟
        </span>
      </div>

      {/* 两朵花并排：差异只用形态语言，不出现涨跌 */}
      <div className="flex items-end justify-center gap-8">
        <div className="text-center space-y-1">
          <FlowerChart
            dimensions={dimensions}
            actions={actions}
            size={pairSize}
            scoreOverride={lastMonthScores}
          />
          <div className="text-xs text-[var(--text-muted)]">上一个月</div>
        </div>
        <div className="text-center space-y-1">
          <FlowerChart
            dimensions={dimensions}
            actions={actions}
            size={pairSize}
            scoreOverride={thisMonthScores}
          />
          <div className="text-xs text-[var(--text-secondary)]">这个月</div>
        </div>
      </div>

      <div className="space-y-1.5 text-sm text-[var(--text-secondary)] leading-relaxed">
        {facts.map((f, i) => <p key={i}>{f}</p>)}
      </div>

      <div className="pt-1 space-y-2">
        <div className="text-xs text-[var(--text-muted)] tracking-wide">花园想问你一句话</div>
        <p className="text-sm text-[var(--text-primary)] leading-relaxed" data-testid="monthly-question">
          {question}
        </p>
      </div>

      {writing && (
        <textarea
          className="input w-full min-h-[88px] leading-relaxed"
          placeholder="想到什么写什么，一两句就够；不想写也可以直接走。"
          value={text}
          onChange={e => setText(e.target.value)}
          data-testid="monthly-input"
          autoFocus
        />
      )}

      <div className="flex items-center gap-3">
        {writing ? (
          <button className="btn btn-primary text-sm" disabled={saving} onClick={finish} data-testid="monthly-save">
            {saving ? '收好了…' : '写好了'}
          </button>
        ) : (
          <button className="btn btn-primary text-sm" onClick={() => setWriting(true)} data-testid="monthly-write">
            写两句
          </button>
        )}
        {/* 跳过 = 什么都不记，下次到期再来。不记未完成、不追问 */}
        <button className="btn btn-ghost text-sm" onClick={finish} data-testid="monthly-skip">
          继续照看花园
        </button>
      </div>

      <p className="text-[11px] text-[var(--text-muted)]">
        每 {MONTHLY_CYCLE_DAYS} 天来一次；第 84 天会有一场更长的季度会谈。
      </p>
    </div>
  )
}
