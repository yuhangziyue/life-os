import { useState, useMemo, useEffect } from 'react'
import { useStore, useEnabledDimensions, useCompanionDays, useRecordedDays, useFocusDimensions } from '../stores/useStore'
import { calculateScoreInRange, scoreStage, startOfToday } from '../engine/scoring'
import { quarterlyState } from '../engine/quarterly'
import { RadarChart } from '../components/RadarChart'
import { hexToRgba } from '../services/theme'
import { focusGold } from '../services/focus'
import { getSnapshots } from '../db'

type ViewMode = 'day' | 'week' | 'month' | 'year'

interface SnapshotRow { id: string; weekKey: string; takenAt: number; dataUrl: string }

export function Stats() {
  const dimensions = useEnabledDimensions()
  const actions = useStore(s => s.actions)
  const [mode, setMode] = useState<ViewMode>('week')
  const companionDays = useCompanionDays()
  const recordedDays = useRecordedDays()

  // 季度会谈（v3.2）
  const theme = useStore(s => s.theme)
  const quarterlyReviews = useStore(s => s.quarterlyReviews)
  const quarterlyDefer = useStore(s => s.quarterlyDefer)
  const startQuarterly = useStore(s => s.startQuarterly)
  const focusDims = useFocusDimensions()
  const qState = quarterlyState(quarterlyReviews, dimensions, quarterlyDefer)
  const completedTalks = quarterlyReviews.filter(r => r.completedAt != null)

  // 花语时光机（C4）：只在统计页用，不进全局 store
  const [snapshots, setSnapshots] = useState<SnapshotRow[]>([])
  useEffect(() => {
    getSnapshots().then(rows => setSnapshots(rows as SnapshotRow[])).catch(() => {})
  }, [])

  const today = startOfToday()

  // new Date() 不能进依赖数组：每次渲染都是新对象引用，useMemo 会次次重算，等于白写
  const ranges = useMemo(() => {
    const now = new Date()
    switch (mode) {
      case 'day': {
        return [{ label: '今天', start: today, end: today + 24 * 60 * 60 * 1000 - 1 }]
      }
      case 'week': {
        const result = []
        for (let i = 6; i >= 0; i--) {
          const d = new Date(now)
          d.setDate(d.getDate() - i)
          const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
          result.push({
            label: d.toLocaleDateString('zh-CN', { weekday: 'short', month: 'numeric', day: 'numeric' }),
            start,
            end: start + 24 * 60 * 60 * 1000 - 1,
          })
        }
        return result
      }
      case 'month': {
        const result = []
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
        for (let i = 1; i <= daysInMonth; i++) {
          const start = new Date(now.getFullYear(), now.getMonth(), i).getTime()
          result.push({
            label: `${i}`,
            start,
            end: start + 24 * 60 * 60 * 1000 - 1,
          })
        }
        return result
      }
      case 'year': {
        const result = []
        for (let i = 0; i < 12; i++) {
          const start = new Date(now.getFullYear(), i, 1).getTime()
          const end = new Date(now.getFullYear(), i + 1, 0, 23, 59, 59).getTime()
          result.push({
            label: `${i + 1}月`,
            start,
            end,
          })
        }
        return result
      }
    }
  }, [mode, today])

  // 每个维度在每个时间段的分数
  /**
   * 周/月/年汇总（2026-08-18 子曰要求）——
   * 每个格子不再只放一个「初始分 + 区间贡献」的分数：那个数被初始分主导，
   * 月/年视图里满屏都是 3.0，看不出任何真实活动，等于没汇总。
   * 现在每格按「该时段 × 该维度」真汇总：条数 count / 贡献 impact / 该时段分数 score，
   * 再补两个方向的合计：每维度横向合计、每时段纵向合计。
   */
  const summary = useMemo(() => {
    const rows = dimensions.map(dim => {
      const cells = ranges.map(r => {
        const inRange = actions.filter(
          a => a.dimensionId === dim.id && a.isCompleted && a.date >= r.start && a.date <= r.end
        )
        return {
          count: inRange.length,
          impact: inRange.reduce((s, a) => s + a.impact, 0),
          score: calculateScoreInRange(dim, actions, r.start, r.end),
        }
      })
      const count = cells.reduce((s, c) => s + c.count, 0)
      const impact = cells.reduce((s, c) => s + c.impact, 0)
      const avgScore = cells.reduce((s, c) => s + c.score, 0) / (cells.length || 1)
      const activeSlots = cells.filter(c => c.count > 0).length
      return { dim, cells, count, impact, avgScore, activeSlots }
    })

    // 纵向：每个时段所有维度的合计 + 覆盖了几片花瓣
    const perRange = ranges.map((_, i) => {
      const col = rows.map(r => r.cells[i])
      return {
        count: col.reduce((s, c) => s + c.count, 0),
        impact: col.reduce((s, c) => s + c.impact, 0),
        covered: col.filter(c => c.count > 0).length,
      }
    })

    const totalCount = rows.reduce((s, r) => s + r.count, 0)
    const totalImpact = rows.reduce((s, r) => s + r.impact, 0)
    const maxCellImpact = Math.max(1, ...rows.flatMap(r => r.cells.map(c => c.impact)))

    return { rows, perRange, totalCount, totalImpact, maxCellImpact }
  }, [dimensions, actions, ranges])

  // 热力图柔化（C6）：每行用自己的植物色做透明度渐变，深浅表示「这段时间这片花瓣被照顾了多少」，
  // 以本视图内最忙的一格为满格（相对色阶，切周/月/年都有区分度）；没有活动的格子留白不留红
  const cellColor = (impact: number, colorHex: string) => {
    if (impact <= 0) return 'var(--bg-hover)'
    const alpha = 0.16 + (impact / summary.maxCellImpact) * 0.56
    return hexToRgba(colorHex, alpha)
  }

  const tabs: { key: ViewMode; label: string }[] = [
    { key: 'day', label: '日' },
    { key: 'week', label: '周' },
    { key: 'month', label: '月' },
    { key: 'year', label: '年' },
  ]

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto p-8 space-y-6">
        <div>
          <h1 className="text-2xl font-light tracking-wide">统计分析</h1>
        </div>

        {/* 陪伴（C3）：不是 streak，永不清零，没有里程碑弹窗 */}
        <div className="card flex items-center gap-8" data-testid="companion-card">
          <div>
            <div className="text-xs text-[var(--text-muted)] mb-1">这朵花陪了你</div>
            <div className="text-2xl font-light text-[var(--accent)]">{companionDays} 天</div>
          </div>
          <div>
            <div className="text-xs text-[var(--text-muted)] mb-1">其中来浇过水的日子</div>
            <div className="text-2xl font-light">{recordedDays} 天</div>
          </div>
          <p className="text-xs text-[var(--text-muted)] leading-relaxed ml-auto max-w-[200px]">
            断了几天也不要紧，这两个数字只会往上长
          </p>
        </div>

        {/* 季度校准会谈（v3.2）：常驻入口，随时可主动发起，不必等满 84 天
            —— 生活出现大变动时，用户有权提前校准（设计稿 §2.1） */}
        <div className="card space-y-4" data-testid="quarterly-section">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-medium text-[var(--text-secondary)]">季度校准会谈</h2>
              <p className="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
                每十二周一次，回望、重新打分、选下一程的焦点。约一小时，可随时停下。
              </p>
            </div>
            <button
              className="btn btn-ghost text-sm flex-shrink-0"
              data-testid="quarterly-start"
              onClick={() => startQuarterly(true)}
            >
              {qState.draft ? '接着上次的会谈' : '发起一场会谈'}
            </button>
          </div>

          {focusDims.length > 0 && (
            <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]" data-testid="focus-summary">
              <span>这一季的光在</span>
              {focusDims.map(d => (
                <span key={d.id} className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: focusGold(theme) }} />
                  {d.name}
                </span>
              ))}
            </div>
          )}

          {/* 会谈时间轴：每季一个节点，显示当季焦点色点与那句意图 */}
          {completedTalks.length > 0 ? (
            <div className="space-y-2" data-testid="quarterly-timeline">
              {completedTalks.map(r => (
                <div key={r.id} className="flex items-start gap-3 text-xs">
                  <span className="text-[var(--text-muted)] w-20 flex-shrink-0">
                    {new Date(r.completedAt as number).toLocaleDateString('zh-CN')}
                  </span>
                  <span className="flex items-center gap-1 flex-shrink-0 pt-1">
                    {r.focusDimensionIds.map(id => {
                      const d = dimensions.find(x => x.id === id)
                      return d ? (
                        <span key={id} className="w-2 h-2 rounded-full" style={{ backgroundColor: d.colorHex }} />
                      ) : null
                    })}
                  </span>
                  <span className="text-[var(--text-secondary)] leading-relaxed">
                    {r.intent || '（那一季没有写下意图，也很好）'}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-[var(--text-muted)]">
              还没有会谈记录。第一次会在花园满十二周时被邀请，也可以现在就开始。
            </p>
          )}
        </div>

        {/* 模式切换 */}
        <div className="seg w-fit">
          {tabs.map(t => (
            <button
              key={t.key}
              className={`seg-item ${mode === t.key ? 'is-on' : ''}`}
              onClick={() => setMode(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* 雷达图（仅周/月模式） */}
        {(mode === 'week' || mode === 'month') && (
          <div className="card flex items-center justify-center py-8">
            <RadarChart dimensions={dimensions} />
          </div>
        )}

        {/* 汇总表：行 = 统计维度，列 = 该视图的时段，末列/末行是两个方向的合计 */}
        <div className="card overflow-x-auto" data-testid="summary-table">
          <div className="flex items-baseline gap-3 mb-1">
            <h2 className="text-sm font-medium text-[var(--text-secondary)]">
              {mode === 'week' ? '本周汇总' : mode === 'month' ? '本月汇总' : mode === 'year' ? '年度汇总' : '今日汇总'}
            </h2>
            <span className="text-xs text-[var(--text-muted)]">
              共 {summary.totalCount} 条记录 · 贡献 {summary.totalImpact}
            </span>
          </div>
          <p className="text-[11px] text-[var(--text-muted)] mb-4">
            格子里是那段时间在这片花瓣上的记录条数，颜色深浅按贡献值——鼠标停上去看明细
          </p>

          <div className="min-w-fit">
            {/* 表头 */}
            <div className="flex mb-1">
              <div className="w-20 flex-shrink-0" />
              {ranges.map((r, i) => (
                <div
                  key={i}
                  className="flex-1 min-w-[28px] text-center text-[10px] text-[var(--text-muted)]"
                  title={r.label}
                >
                  {mode === 'month' ? r.label : mode === 'year' ? r.label : r.label.slice(0, 3)}
                </div>
              ))}
              <div className="w-24 flex-shrink-0 text-center text-[10px] text-[var(--text-secondary)]">
                合计 / 均分
              </div>
            </div>

            {/* 每个维度一行 */}
            {summary.rows.map(({ dim, cells, count, impact, avgScore, activeSlots }) => (
              <div key={dim.id} className="flex items-center mb-1">
                <div className="w-20 flex-shrink-0 text-xs text-[var(--text-secondary)] truncate pr-2">
                  {dim.name}
                </div>
                {cells.map((c, i) => (
                  <div
                    key={i}
                    data-testid="heat-cell"
                    className="flex-1 min-w-[28px] h-6 rounded-md m-[1px] flex items-center justify-center text-[10px]"
                    style={{ backgroundColor: cellColor(c.impact, dim.colorHex) }}
                    title={`${ranges[i].label} · ${dim.name}：${c.count} 条 · 贡献 ${c.impact} · 分数 ${c.score.toFixed(1)} · ${scoreStage(c.score)}`}
                  >
                    {c.count > 0 ? c.count : ''}
                  </div>
                ))}
                <div
                  className="w-24 flex-shrink-0 text-center text-[11px] text-[var(--text-secondary)]"
                  title={`${dim.name}：${count} 条 · 贡献 ${impact} · 有记录的时段 ${activeSlots}/${cells.length} · 均分 ${avgScore.toFixed(1)}`}
                >
                  {count} 条 · {avgScore.toFixed(1)}
                </div>
              </div>
            ))}

            {/* 末行：每个时段的纵向合计 */}
            <div className="flex items-center mt-2 pt-2 border-t border-[var(--border)]">
              <div className="w-20 flex-shrink-0 text-xs text-[var(--text-muted)] pr-2">每期合计</div>
              {summary.perRange.map((col, i) => (
                <div
                  key={i}
                  className="flex-1 min-w-[28px] text-center text-[10px] text-[var(--text-muted)]"
                  title={`${ranges[i].label}：${col.count} 条 · 贡献 ${col.impact} · 照顾了 ${col.covered} 片花瓣`}
                >
                  {col.count > 0 ? col.count : '·'}
                </div>
              ))}
              <div className="w-24 flex-shrink-0 text-center text-[11px] text-[var(--accent)]">
                {summary.totalCount} 条
              </div>
            </div>
          </div>
        </div>

        {/* 花语时光机（C4）：每周一张定妆照，看花这一年怎么长 */}
        <div className="card" data-testid="flower-timeline">
          <h2 className="text-sm font-medium text-[var(--text-secondary)] mb-4">花语时光机</h2>
          {snapshots.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)] py-4 text-center">
              还没有定妆照——每逢周日，花园会自己拍下这一周的花
            </p>
          ) : (
            <div className="flex gap-4 overflow-x-auto pb-2">
              {snapshots.map(s => (
                <div key={s.id} className="flex-shrink-0 text-center">
                  <img
                    src={s.dataUrl}
                    alt={`第 ${s.weekKey} 周的花`}
                    className="w-28 h-28 object-contain rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)]"
                  />
                  <div className="text-[10px] text-[var(--text-muted)] mt-1.5">
                    {new Date(s.takenAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })} · {s.weekKey.split('-')[1]}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 维度排名（按本视图时段的均分排，条形下方带该时段真实活动量） */}
        <div className="card">
          <h2 className="text-sm font-medium text-[var(--text-secondary)] mb-4">维度排名</h2>
          <div className="space-y-2">
            {[...summary.rows]
              .sort((a, b) => b.avgScore - a.avgScore)
              .map(({ dim, avgScore, count }) => {
                const avg = avgScore
                const pct = Math.min(avg / 10 * 100, 100)
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
                    <span className="text-xs text-[var(--text-muted)] w-12 text-right">{count} 条</span>
                    <span className="text-xs text-[var(--text-muted)] w-8 text-right">{avg.toFixed(1)}</span>
                  </div>
                )
              })}
          </div>
        </div>
      </div>
    </div>
  )
}
