import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useStore, useTodayActions, useEnabledDimensions } from '../stores/useStore'
import { BandCaption } from '../components/BandCaption'
import { LightBand } from '../components/LightBand'
import { GardenTasks } from '../components/GardenTasks'
import { ActionRow } from '../components/ActionRow'
import { ReturnCard } from '../components/ReturnCard'
import { MoodStream } from '../components/MoodStream'
import { SelfNoteCard } from '../components/SelfNoteCard'
import { startOfToday } from '../engine/scoring'
import { isEarly, isNight } from '../engine/ahaGate'

const DAY_MS = 24 * 60 * 60 * 1000
/**
 * 「最近的记录」在这一屏**最多只露三条**（v3.7 A3）。
 * 原来挂 14 天，越用越长 —— 而这一屏的职责是**今天**，不是档案馆。
 * 全部历史走右上角「更多」→ /history，那一页按天分组。
 */
const RECENT_MAX = 3
const RECENT_DAYS = 14

/**
 * 「今天」—— 三入口之一，默认落地页（v3.6，按子曰 2026-08-27 口径）。
 *
 * 三块，顺序就是子曰给的顺序：
 *   ① 推荐我做的 —— 今日一瞥（一天一条、零按钮）+ 花园轻推（可整片无视）
 *   ② 我今天做的
 *   ③ 最近的记录（按日分组，回看 14 天）
 *
 * 屏顶那句问候按时段变（小露一轮的时间上下文，去掉了任何作息评价）：
 *   清晨说「今天的光还没分出去」是开阔；同一句话放到深夜说就是指责 ——
 *   **分寸就是这个东西：句子对不对，取决于几点。**
 */
export function Today() {
  const actions = useStore(s => s.actions)
  const todayActions = useTodayActions()
  const dimensions = useEnabledDimensions()
  const setQuickAddOpen = useStore(s => s.setQuickAddOpen)

  const today = startOfToday()
  const recent = useMemo(() => {
    const from = today - RECENT_DAYS * DAY_MS
    const rows = actions
      .filter(a => a.date < today && a.date >= from)
      .sort((a, b) => b.date - a.date)
      .slice(0, RECENT_MAX)
    const groups: { date: number; rows: typeof rows }[] = []
    for (const a of rows) {
      const g = groups.find(x => x.date === a.date)
      if (g) g.rows.push(a)
      else groups.push({ date: a.date, rows: [a] })
    }
    return groups
  }, [actions, today])

  const dayLabel = (ts: number) => {
    const diff = Math.round((today - ts) / DAY_MS)
    if (diff === 1) return '昨天'
    if (diff === 2) return '前天'
    return new Date(ts).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })
  }

  // 有约定的花瓣：这一屏是它唯一合法的露面处之一（另一处是记录面板里选中它时）
  const pacts = dimensions.filter(d => d.pactTiming && d.pactText)

  const now = Date.now()
  const greeting = isNight(now)
    ? '夜深了。这里什么都不着急。'
    : isEarly(now)
      ? '今天的光还没分出去。'
      : '今天的账，还在记。'

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="page-pad space-y-4">
        <div>
          <h1 className="text-2xl font-light tracking-wide">今天</h1>
          <p className="text-sm text-[var(--text-muted)] mt-1" data-testid="today-greeting">{greeting}</p>
        </div>

        {/* 断记 5 天以上回来时才出现。它不催你记，只告诉你账本没变 */}
        <ReturnCard />

        {/*
          回执层的落点（v3.6.1 补漏）。
          🔴 这是上一轮的漏项：圆桌定的三层反馈里，第一层是「每次记录后，光带里那段做
             240ms 饱和度脉冲 + 一粒墨点落下」。但光带此前只在「我的花园」，
             而默认落地页是这里 —— 于是从最常用的那一页记一笔，第一层反馈在屏幕上**没有承载体**。
          它同时兼一个常驻职责：今天的光已经分出去多少。零数字、零 title，
          一眼是一条光的分布带，不用读数（小露的老红线）。
        */}
        <div className="card py-3">
          <LightBand dimensions={dimensions} actions={actions} label="这周的光" />
          {/* v3.7 A1：原来的「今日一瞥」那张卡降级成这一行图注，与光带共用容器。
              无句可说时它整个不渲染，卡片高度自然收缩 —— **注解没有容器**，
              所以没有一个位置在等话。见 BandCaption 顶部。 */}
          <BandCaption />
        </div>

        {/* 几天前的自己留下的那句话。**不置顶** —— 置顶就是待办位（小艾的"退一步"） */}
        <SelfNoteCard />

        {/* ① 推荐我做的 */}
        <GardenTasks />

        {/* 有约定的话，在这里安静地列一行。零按钮、不判定做了没做 */}
        {pacts.length > 0 && (
          <div className="card space-y-2" data-testid="pact-list">
            <h2 className="text-sm font-medium text-[var(--text-secondary)]">你和花瓣的约定</h2>
            {pacts.map(d => (
              <p key={d.id} className="text-xs text-[var(--text-secondary)] leading-relaxed flex gap-2">
                <span className="dot-sm mt-1.5" style={{ backgroundColor: d.colorHex }} />
                <span>每个{d.pactTiming}，{d.pactAnchor}之后，我去{d.pactText}。</span>
              </p>
            ))}
            <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
              这是你写给自己的话，不是一件待办。没做到的那天，这里也不会有任何变化。
            </p>
          </div>
        )}

        {/* ② 我今天做的 */}
        <div className="card">
          <h2 className="text-sm font-medium text-[var(--text-secondary)] mb-3">
            我今天做的 · {todayActions.filter(a => a.isCompleted).length}/{todayActions.length}
          </h2>
          {todayActions.length === 0 ? (
            <div className="text-center py-7 text-[var(--text-muted)] text-sm" data-testid="today-empty">
              <p className="mb-2">今天还没记 —— 不要紧，花在等你，不在催你</p>
              <button className="btn btn-ghost text-sm" onClick={() => setQuickAddOpen(true)}>
                + 记下第一件小事
              </button>
            </div>
          ) : (
            <div className="space-y-0">
              {todayActions.map(a => <ActionRow key={a.id} action={a} />)}
            </div>
          )}
        </div>

        {/* 感受流（R3）：近 7 天至少 3 天记过感受才出现。只呈现，不解读 */}
        <MoodStream />

        {/* ③ 最近的记录 */}
        {recent.length > 0 && (
          <div className="card space-y-3" data-testid="recent-actions">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-medium text-[var(--text-secondary)]">最近的记录</h2>
              <Link
                to="/history"
                className="text-[11px] text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
                data-testid="recent-more"
              >
                更多 ›
              </Link>
            </div>
            {recent.map(g => (
              <div key={g.date}>
                <p className="text-[11px] text-[var(--text-muted)] tracking-wide mb-1">{dayLabel(g.date)}</p>
                <div className="space-y-0">
                  {g.rows.map(a => <ActionRow key={a.id} action={a} />)}
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  )
}
