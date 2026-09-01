import { useState, useMemo, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useStore, useEnabledDimensions, useCompanionDays } from '../stores/useStore'
import { calculateScoreInRange, dimensionVitality } from '../engine/scoring'
import { pickReviewQuestions } from '../content/reviewQuestions'
import {
  composeReviewSummary, summaryTitle, yearOpeningLine, emptyPeriodLines,
  THINKING_PLACEHOLDER, type ReviewPeriod,
} from '../engine/reviewSummary'
import { MOODS } from '../models/action'
import { SubPageHeader } from '../components/SubPageHeader'
import { GuessCard } from '../components/GuessCard'
import { MonthlyCheckin } from '../components/MonthlyCheckin'

/**
 * 当期复盘（v3.7 B6）—— `/review/week` `/review/month` `/review/year`。
 * 「默认只显示当前周月年度的」：这一页永远只有当期，翻旧账走「历史回顾」那个独立入口。
 *
 * ============ 四把「库外的刀」，Lisa 第四轮主动提的，子曰和我都没问到 ============
 * 问题库里的刀好找（改文案就行），这四把长在**结构**上：
 *
 * 1. **开放式总结框 = 请你写判决书。**
 *    年回顾不给自由总结框，只给带框架的问句；`placeholder` 用「知道」不用「做」——
 *    **「知道」是无法失败的动词**，这是全产品最重要的一个词性选择。
 *
 * 2. **年度总量计数是最锋利的刀。**
 *    "记录 428 条""覆盖 6 片""最长连续 23 天"—— 年尺度的数字既能跟别人比、
 *    也能跟一个想象中的自己比。所以**年页只显示占比与去处，不显示总量**。
 *    理由：**占比的总和恒为一，所以无法被读成不足。**
 *
 * 3. **十二格月历视图不做。** 五个月是空的，那张图就是一张缺席表。
 *    **按时间必然产生空格、空格必然被读成缺席；按花瓣产生的是「这片多那片少」，那是分配。**
 *    同一份数据换一个轴，评价就消失了。
 *
 * 4. **「你猜」机制在年尺度必须关掉。**
 *    猜错一周的分配是有趣；**猜错自己的一整年，是一种很深的失控感**
 *    （"我连我这一年过成什么样都不知道"）。落差在年尺度上不是洞察，是眩晕。
 *
 * 另外两处按子曰的原话改名，但没有照抄他给的字（理由见方案结论 7）：
 *   「系统摘要」→「这一周你记下的」·「我的反思」→「我的思考」（这个一字不改）
 *   「维度评分」→「光的去处」——「评分」是判分，和红线 3 正面撞；
 *   同一份数字换个名字，就从成绩单变成分配表。
 */

const VALID: ReviewPeriod[] = ['week', 'month', 'year']

/** 年度那几问在年中问出来是无法回答的，而无法回答的题会让人合上页面 */
const YEAR_QUESTIONS_FROM_MONTH = 10 // 十一月起（getMonth() 从 0 数）

export function ReviewPage() {
  const params = useParams<{ period?: string }>()
  const period: ReviewPeriod = VALID.includes(params.period as ReviewPeriod)
    ? (params.period as ReviewPeriod)
    : 'week'

  const dimensions = useEnabledDimensions()
  const actions = useStore(s => s.actions)
  const reviews = useStore(s => s.reviews)
  const addReview = useStore(s => s.addReview)
  const updateReview = useStore(s => s.updateReview)
  const companionDays = useCompanionDays()

  const [reflection, setReflection] = useState('')

  // 不要把 new Date() 放进依赖数组——每次渲染都是新对象，useMemo 等于没写
  const rangeOf = useMemo(() => {
    const d = new Date()
    switch (period) {
      case 'week': {
        const day = d.getDay() || 7
        const start = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day + 1)
        const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6, 23, 59, 59)
        return { start: start.getTime(), end: end.getTime() }
      }
      case 'month': {
        const start = new Date(d.getFullYear(), d.getMonth(), 1)
        return { start: start.getTime(), end: new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59).getTime() }
      }
      case 'year':
        return {
          start: new Date(d.getFullYear(), 0, 1).getTime(),
          end: new Date(d.getFullYear(), 11, 31, 23, 59, 59).getTime(),
        }
    }
  }, [period])

  const existingReview = useMemo(
    () => reviews.find(r => r.periodType === period && r.periodStart === rangeOf.start),
    [reviews, period, rangeOf.start],
  )

  // 切换周期或已存思考变化时同步输入框。原来是在 tab 的 onClick 里 set，
  // 读到的是切换「之前」那个 tab 的 existingReview——切到月却填进了周的文字
  useEffect(() => {
    setReflection(existingReview?.reflectionText ?? '')
  }, [period, existingReview?.id, existingReview?.reflectionText])

  const summary = useMemo(
    () => composeReviewSummary(period, dimensions, actions, rangeOf.start, rangeOf.end),
    [period, dimensions, actions, rangeOf],
  )

  const periodActions = useMemo(
    () => actions.filter(a => a.isCompleted && a.date >= rangeOf.start && a.date <= rangeOf.end),
    [actions, rangeOf],
  )

  const moodSummary = useMemo(() => {
    const withMood = actions.filter(a => a.date >= rangeOf.start && a.date <= rangeOf.end && a.mood)
    return MOODS
      .map(m => ({ ...m, count: withMood.filter(a => a.mood === m.key).length }))
      .filter(m => m.count > 0)
  }, [actions, rangeOf])

  /**
   * 「光的去处」的行序：分数降序，**沉睡的排最后但绝不隐藏**（红线 1）。
   * 原来按 `dimensions` 原序渲染，没排 —— 于是零分那片可能出现在第一行，
   * 而第一行是这张卡最重的位置。
   */
  const rows = useMemo(() => {
    return dimensions
      .map(d => ({
        dim: d,
        score: calculateScoreInRange(d, actions, rangeOf.start, rangeOf.end),
        dormant: dimensionVitality(d, actions).dormant,
      }))
      .sort((a, b) => (a.dormant === b.dormant ? b.score - a.score : a.dormant ? 1 : -1))
  }, [dimensions, actions, rangeOf])

  const handleSave = async () => {
    if (existingReview) {
      await updateReview(existingReview.id, { reflectionText: reflection })
    } else {
      await addReview({
        periodType: period,
        periodStart: rangeOf.start,
        periodEnd: rangeOf.end,
        reflectionText: reflection,
        autoSummary: summary.text,
      })
    }
    // 保存后不清空：清空会让刚写完的思考从界面上消失，看着像没存上
  }

  const title = period === 'week' ? '这一周' : period === 'month' ? '这个月' : '这一年'
  const isYear = period === 'year'
  const isEmpty = periodActions.length === 0
  const monthNow = new Date().getMonth()
  const yearTooEarly = isYear && monthNow < YEAR_QUESTIONS_FROM_MONTH

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="page-pad space-y-4">
        <SubPageHeader title={title} fallback="/review" />

        {/* 年回顾的开场：**先给一个他不可能失败的数，再谈分配**。
            陪伴天数是全产品唯一只增不减、无法被读成不足的数，
            也是「日期可给，天数不给」这条口径的唯一豁免。 */}
        {isYear && !isEmpty && (
          <div className="card text-center py-5" data-testid="year-opening">
            <p className="text-base font-light tracking-wide text-[var(--text-secondary)]">
              {yearOpeningLine(companionDays)}
            </p>
          </div>
        )}

        {/* 年中打开年回顾：说清现在看到的是到今天为止的部分。
            不说这一句，用户会以为这就是他这一年的全貌，然后拿一个残缺的账给自己下判决。 */}
        {isYear && !isEmpty && yearTooEarly && (
          <p className="text-xs text-[var(--text-muted)] leading-relaxed px-1" data-testid="year-partial">
            这一年还在走 —— 现在看到的是到今天为止的部分。
          </p>
        )}

        {isEmpty ? (
          /* 空态：不写「数据不足」（系统语言，且暗示他不够）、不给空图、
             **更不能拦住不让进** —— 拦住等于说「你还不够资格」 */
          <div className="card space-y-2 py-7 text-center" data-testid="review-empty">
            {emptyPeriodLines(period).map((line, i) => (
              <p key={i} className="text-sm text-[var(--text-muted)] leading-relaxed">{line}</p>
            ))}
            {period === 'year' && (
              <Link to="/review/week" className="btn btn-ghost text-xs mt-2 inline-block">
                这一周 ›
              </Link>
            )}
          </div>
        ) : (
          <>
            {/* 「你猜」必须在看到账之前问，否则没有落差可言。
                🔴 年尺度关掉 —— 猜错自己的一整年是失控感，不是洞察 */}
            {!isYear && (
              <GuessCard
                dimensions={dimensions}
                actions={actions}
                periodStart={rangeOf.start}
                periodEnd={rangeOf.end}
                periodWord={title}
              />
            )}

            {/* B7 改名。原句那三处红线（「最需要关注」/ 精确分数 / 「完成 N 条」）
                已在 engine/reviewSummary.ts 里整句重写，并有 16 条单测守着 */}
            <div className="card" data-testid="review-summary">
              <h2 className="text-sm font-medium text-[var(--text-secondary)] mb-3">
                {summaryTitle(period)}
              </h2>
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{summary.text}</p>
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

            {/* 原「维度评分」。改名的理由不是好听：**「评分」是判分，和红线 3 正面撞**。
                同一份数字换个名字，就从成绩单变成分配表。 */}
            <div className="card" data-testid="light-destination">
              <h2 className="text-sm font-medium text-[var(--text-secondary)] mb-4">光的去处</h2>
              <div className="space-y-2">
                {rows.map(({ dim, score, dormant }) => {
                  const pct = Math.min((score / 10) * 100, 100)
                  return (
                    <div key={dim.id} className="flex items-center gap-3" data-dormant={dormant ? '1' : '0'}>
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: dim.colorHex }} />
                      <span className="text-sm w-20 truncate">{dim.name}</span>
                      <div className="flex-1 h-1.5 bg-[var(--bg-hover)] rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: dim.colorHex }} />
                      </div>
                      {/* 🔴 零分不显示「0.0」，显示「—」：**0.0 是一个分数，「—」是一个事实**。
                          那个 0.0 会自己说话，卡名改得再好也盖不住它。 */}
                      <span className="text-xs text-[var(--text-muted)] w-8 text-right tabular-nums">
                        {score > 0 ? score.toFixed(1) : '—'}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* 引导问题。空白框是世界上最难回答的问题，先递三个问题过去。
                🔴 年度那几问在年中不递 —— 三月问「今年你花掉的时间里哪一段最不后悔」
                是无法回答的题，而无法回答的题会让人合上页面 */}
            {!yearTooEarly && (
              <div className="card" data-testid="review-questions">
                <h2 className="text-sm font-medium text-[var(--text-secondary)] mb-3">
                  引导问题 · 回答其中一个就够了
                </h2>
                <div className="space-y-2">
                  {pickReviewQuestions(period, rangeOf.start).map(q => (
                    <button
                      key={q}
                      className="w-full text-left text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] py-1.5 px-2 rounded-lg hover:bg-[var(--bg-hover)] transition-colors leading-relaxed"
                      title="点击把问题放进下面的框里"
                      onClick={() => setReflection(r => (r ? r + '\n\n' : '') + `【${q}】\n`)}
                    >
                      🌿 {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* B7 改名：「我的反思」→「我的思考」。这一条一字不改照做 ——
                「反思」在中文产品语境里是「检讨」，它把一个法官请进这个框；
                「思考」不预设有东西要改。 */}
            <div className="card" data-testid="my-thinking">
              <h2 className="text-sm font-medium text-[var(--text-secondary)] mb-3">我的思考</h2>
              {/* value 直接绑 reflection。曾经写成 reflection || existingReview?.reflectionText，
                  空串是 falsy，用户一清空输入框旧内容就弹回来，根本删不掉 */}
              <textarea
                className="input mb-3"
                rows={4}
                placeholder={THINKING_PLACEHOLDER[period]}
                value={reflection}
                onChange={e => setReflection(e.target.value)}
              />
              {/* 按钮文案不带宾语，三个尺度一致 */}
              <button className="btn btn-primary text-sm" onClick={handleSave} data-testid="review-save">
                保存
              </button>
            </div>

            {/* 月度微校准从「我的花园」搬来这里（v3.7 B5）——
                它本来就是回顾物，而且那句追问只能出现在**用户已经坐下来的地方**：
                这一页他是主动点进来的、有输入框、有跳过路径。
                「今天」屏他是来放东西的，同一句话在那儿是拦路。 */}
            {period === 'month' && <MonthlyCheckin />}
          </>
        )}
      </div>
    </div>
  )
}
