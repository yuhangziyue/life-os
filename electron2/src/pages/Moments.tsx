import { useEffect, useMemo, useState } from 'react'
import { getMoments } from '../db'
import type { AhaMomentRow } from '../app/electron'
import { SubPageHeader } from '../components/SubPageHeader'
import { AHA_LABEL } from '../engine/ahaGate'

/**
 * 那些美妙时刻（v3.7，子曰点名）—— 从「陪你走过的时间」卡片右上角进来。
 * 竖直时间轴，把每一次播过的定格帧连内容带时间点摊开。
 *
 * ============ 为什么这一页有存在的必要 ============
 * 这套定格帧是**刻意做稀有的**：同类冷却 14/30 天 · 每天最多 1 条 · 每周最多 3 条 ·
 * 样本地板 · 深夜与坏日子静音。一个用户一年也就撞上十几次。
 * 稀有是产品上的正确选择 —— 但它带来一个副作用：
 * **稀有 + 看过就没了 = 那些话等于没说过。**
 *
 * 所以这一页不是「再看一遍动画」，是**账的一部分**：那些话什么时候说的、说了什么。
 *
 * ============ 三条约束 ============
 * 🔴 **只读，不重播。** 这里不给「再演一遍」按钮 ——
 *   定格帧的力量来自它撞上你的那一刻（第五轮的结论：每次都演等于没演）。
 *   给一个重播按钮，等于把稀有性交给用户自己去消耗掉。
 *   演示版另有一个「展柜」承担「想看就能看」，那是刻意只在演示版里的东西。
 *
 * 🔴 **日期可给，天数不给。** 每条只写日期，绝不写「23 天前」——
 *   日期是位置，天数是计量，而计量会被读成账（Lisa 二轮通则）。
 *
 * 🔴 **不统计、不排名、不给总数的"里程碑"。**
 *   顶上那句只说这是什么，不说「你已经收集了 12 个时刻」——
 *   一旦有了可数的收藏进度，它就变成了徽章墙，而徽章是奖励（红线 6）。
 *   唯一的例外是空态需要一句交代，见下。
 */

const DAY_MS = 24 * 60 * 60 * 1000

export function Moments() {
  const [rows, setRows] = useState<AhaMomentRow[] | null>(null)

  useEffect(() => {
    let alive = true
    void getMoments().then(r => { if (alive) setRows(r) })
    return () => { alive = false }
  }, [])

  /** 按月分组 —— 时间轴上给出「刻度」，否则一长串日期读不出节奏 */
  const groups = useMemo(() => {
    if (!rows) return []
    const out: { key: string; label: string; items: AhaMomentRow[] }[] = []
    for (const r of rows) {
      const d = new Date(r.at)
      const key = `${d.getFullYear()}-${d.getMonth()}`
      const label = `${d.getFullYear()} 年 ${d.getMonth() + 1} 月`
      const g = out.find(x => x.key === key)
      if (g) g.items.push(r)
      else out.push({ key, label, items: [r] })
    }
    return out
  }, [rows])

  const dayLabel = (ts: number) => {
    const d = new Date(ts)
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const that = new Date(ts); that.setHours(0, 0, 0, 0)
    const diff = Math.round((today.getTime() - that.getTime()) / DAY_MS)
    if (diff === 0) return '今天'
    if (diff === 1) return '昨天'
    // 🔴 只给日期，不给「N 天前」—— 天数是计量，会被读成账
    return `${d.getMonth() + 1}月${d.getDate()}日`
  }

  const timeLabel = (ts: number) => {
    const d = new Date(ts)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="page-pad space-y-4">
        <SubPageHeader
          title="那些美妙时刻"
          subtitle="花园在你面前停下来说过的那些话"
          fallback="/garden"
        />

        {rows === null ? (
          <div className="card text-center py-8 text-sm text-[var(--text-muted)]">读取中…</div>
        ) : rows.length === 0 ? (
          /*
           * 空态。这一页的空态比大多数空态难写，因为它的空**不是用户的问题**：
           * 定格帧本来就稀有，新用户没有是正常的。
           * 所以这三行说的是**这些时刻是什么**，一个字不提"你还没有"。
           * 也绝不写「多记几笔就会有」—— 那是把稀有性当成可兑换的奖励在叫卖。
           */
          <div className="card space-y-2 py-8 text-center" data-testid="moments-empty">
            <p className="text-sm text-[var(--text-secondary)]">还没有这样的时刻。</p>
            <p className="text-xs text-[var(--text-muted)] leading-relaxed px-4">
              它们很少出现 —— 花园只在你的账真的变了形状时才停下来说一句。
              <br />
              出现过的都会留在这里。
            </p>
          </div>
        ) : (
          groups.map(g => (
            <div key={g.key} className="space-y-0" data-testid="moments-month">
              <p className="text-[11px] text-[var(--text-muted)] tracking-wide pl-1 pb-2">{g.label}</p>
              <div className="moments-track">
                {g.items.map(m => (
                  <article className="moment" key={m.id} data-kind={m.kind} data-testid="moment">
                    {/* 时间轴上的那个点：用那片花瓣自己的颜色 —— 颜色是这产品的第一语言 */}
                    <span
                      className="moment-dot"
                      style={{ backgroundColor: m.colorHex || 'var(--accent)' }}
                      aria-hidden="true"
                    />
                    <div className="moment-body">
                      <div className="moment-meta">
                        <span className="moment-date">{dayLabel(m.at)}</span>
                        <span className="moment-time">{timeLabel(m.at)}</span>
                        <span className="moment-kind">{AHA_LABEL[m.kind] ?? '一件事'}</span>
                      </div>
                      <p className="moment-headline">{m.headline}</p>
                      {m.lines.filter(Boolean).map(l => (
                        <p className="moment-line" key={l}>{l}</p>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ))
        )}

        {rows !== null && rows.length > 0 && (
          <p className="text-[11px] text-[var(--text-muted)] leading-relaxed px-1">
            这些话只在当时说过一次。这里留着原话与时间，不重播。
          </p>
        )}
      </div>
    </div>
  )
}
