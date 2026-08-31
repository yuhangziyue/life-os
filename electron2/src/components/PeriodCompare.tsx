import { useMemo, useState } from 'react'
import type { Action } from '../models/action'
import type { Dimension } from '../models/dimension'
import { lightShares } from '../engine/impression'
import { startOfWeek } from '../engine/streak'

/**
 * 周 / 月对比（v3.6，子曰命题「切换查看自己每周每月的对比数据」）。
 *
 * 口径全部来自第五轮圆桌：
 *   · **不说「进步」**（Lisa + 晓雅 + 小露一致否决）。八段之和恒为 100%，一片涨必有一片跌，
 *     不存在整体向好的方向 —— 写「进步」等于承认「八项全满才是好人生」，正是这产品要反驳的。
 *   · 说的是**位移**，而且**必须成对**：谁多了，就写清是谁让出来的。
 *     成对呈现天然消解方向感（Lisa），而「让出来的」这个动词给付方留了尊严。
 *   · **零箭头、零涨跌配色**（方向即评价）。
 *   · 这里是「对账档」——Lisa 二轮裁决：统计与数字上移到对账档，日常记录路径不给数字。
 *     所以这一屏允许出现百分比。
 *   · 重度使用下四舍五入后可能一格都没动（小艾指出的真实缺陷），
 *     那时候产品**不能沉默**，要如实说「分法没有变」。
 */

const DAY_MS = 24 * 60 * 60 * 1000
/** 至少让出/得到这么多个百分点才值得单独列出来。低于它属于噪声 */
const MIN_POINTS = 1

type Mode = 'week' | 'month'

interface Props {
  dimensions: Dimension[]
  actions: Action[]
}

function startOfMonth(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  d.setDate(1)
  return d.getTime()
}

function prevMonthStart(ts: number): number {
  const d = new Date(startOfMonth(ts))
  d.setMonth(d.getMonth() - 1)
  return d.getTime()
}

export function PeriodCompare({ dimensions, actions }: Props) {
  const [mode, setMode] = useState<Mode>('week')

  const view = useMemo(() => {
    const now = Date.now()
    const curStart = mode === 'week' ? startOfWeek(now) : startOfMonth(now)
    const prevStart = mode === 'week' ? curStart - 7 * DAY_MS : prevMonthStart(now)

    const cur = lightShares(dimensions, actions, curStart, now)
    const prev = lightShares(dimensions, actions, prevStart, curStart)

    const curMap = new Map(cur.map(s => [s.dimensionId, s.share]))
    const prevMap = new Map(prev.map(s => [s.dimensionId, s.share]))

    const rows = dimensions
      .map(d => {
        const from = Math.round((prevMap.get(d.id) ?? 0) * 100)
        const to = Math.round((curMap.get(d.id) ?? 0) * 100)
        return { name: d.name, colorHex: d.colorHex, from, to, delta: to - from }
      })
      .filter(r => r.from > 0 || r.to > 0)

    const gained = rows.filter(r => r.delta >= MIN_POINTS).sort((a, b) => b.delta - a.delta)
    const yielded = rows.filter(r => r.delta <= -MIN_POINTS).sort((a, b) => a.delta - b.delta)
    // 上一期有光、这一期一格没有的花瓣：这是账本里最该被说出来的一类
    const dropped = rows.filter(r => r.from > 0 && r.to === 0)

    return {
      empty: cur.length === 0 && prev.length === 0,
      noPrev: prev.length === 0 && cur.length > 0,
      gained, yielded, dropped, rows,
      periodWord: mode === 'week' ? '这一周' : '这个月',
      prevWord: mode === 'week' ? '上周' : '上个月',
      curWord: mode === 'week' ? '这周' : '这个月',
    }
  }, [dimensions, actions, mode])

  return (
    <div className="card space-y-3" data-testid="period-compare">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-[var(--text-secondary)]">光的去处</h2>
        <div className="seg" data-testid="compare-mode">
          <button
            className={`seg-btn${mode === 'week' ? ' is-on' : ''}`}
            data-mode="week"
            onClick={() => setMode('week')}
          >按周</button>
          <button
            className={`seg-btn${mode === 'month' ? ' is-on' : ''}`}
            data-mode="month"
            onClick={() => setMode('month')}
          >按月</button>
        </div>
      </div>

      {view.empty && (
        <p className="text-xs text-[var(--text-muted)]" data-testid="compare-empty">
          {view.periodWord}和上一期都还没有记录。账本空着，不要紧。
        </p>
      )}

      {view.noPrev && (
        <p className="text-xs text-[var(--text-muted)]">
          上一期没有记录，这一期的分法还没有可比的对象。
        </p>
      )}

      {!view.empty && !view.noPrev && (
        <div className="space-y-2" data-testid="compare-rows">
          {view.gained.length === 0 && view.yielded.length === 0 ? (
            <p className="text-xs text-[var(--text-secondary)]" data-testid="compare-nochange">
              {view.prevWord}和{view.curWord}，分法没有变。
            </p>
          ) : (
            <>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                {view.prevWord}和{view.curWord}，不一样的地方：
              </p>
              {view.gained.slice(0, 3).map(r => (
                <div key={r.name} className="compare-row" data-testid="compare-gained">
                  <span className="dot-sm" style={{ backgroundColor: r.colorHex }} />
                  <span className="compare-name">{r.name}</span>
                  <span className="compare-num">多了 {r.delta}</span>
                </div>
              ))}
              {view.yielded.slice(0, 3).map(r => (
                <div key={r.name} className="compare-row" data-testid="compare-yielded">
                  <span className="dot-sm" style={{ backgroundColor: r.colorHex }} />
                  <span className="compare-name">{r.name}</span>
                  <span className="compare-num">让出 {-r.delta}</span>
                </div>
              ))}
              {/* 成对那句：谁多了，是谁让出来的。不成对就只是涨跌表 */}
              {view.gained[0] && view.yielded[0] && (
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed pt-1">
                  {view.gained[0].name}多出来的这些，是{view.yielded[0].name}让出来的。
                </p>
              )}
            </>
          )}

          {view.dropped.length > 0 && (
            <p className="text-xs text-[var(--text-muted)] leading-relaxed" data-testid="compare-dropped">
              {view.curWord}的色带里没有{view.dropped.map(r => r.name).join('、')}。
            </p>
          )}
        </div>
      )}

      <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
        八片共享同一份光。这里不说涨跌，只说去处。
      </p>
    </div>
  )
}
