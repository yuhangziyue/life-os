import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore, useEnabledDimensions } from '../stores/useStore'
import { FlowerChart } from './FlowerChart'
import { LIGHT_LAW, pct, shiftFact, type LightShift } from '../engine/lightShift'
import type { Echo } from '../engine/echo'

/**
 * 「光的分配」—— 全产品唯一的 Aha 时刻（v3.5 M5）。
 *
 * 它不是奖励。没有礼花、没有 +1、没有连击、没有「你真棒」。
 * 奖励是惩罚的孪生兄弟，而去惩罚化是这个产品的准入条件（v3 定性第一条）。
 *
 * 它交付的是价值主张本身：**八片花瓣共享同一份光，你给谁多一点，就是从别人那里挪。**
 * 三帧：
 *   1. 240ms  面板已收起，花升到中央并放大（是「收起」不是「消失」——动作与结果不断线）
 *   2. 600ms  花瓣补间长出 + 八段光带同时重排（这 600ms 是全产品最重要的 600ms：
 *             这一段变宽，其余按比例被挤窄，「互斥」在这里被演出来而不是被说出来）
 *   3. 定格   两行字：占比变化的**事实** + 归属（「你分给了 X」），都不是评价
 *
 * 🔴 reduced-motion 下不做补间，直接给终态 + 两行数字。
 *    这既是无障碍要求，也是设计质量的试纸 ——
 *    如果去掉动画这个 Aha 就没了，说明它本来只是特效，不是洞察。
 */

const RISE_MS = 240
const GROW_MS = 600

interface Props {
  shift: LightShift
  echo: Echo | null
  onClose: () => void
}

export function LightShiftAha({ shift, echo, onClose }: Props) {
  const dimensions = useEnabledDimensions()
  const actions = useStore(s => s.actions)
  const openQuickAddWith = useStore(s => s.openQuickAddWith)
  const lawSeen = useStore(s => s.ahaLawSeen)
  const markAhaLawSeen = useStore(s => s.markAhaLawSeen)

  const reduced = useMemo(
    () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  )

  // 0 = 记录前的形状，1 = 记录后的形状
  const [t, setT] = useState(reduced ? 1 : 0)
  const rafRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    if (reduced) return
    timerRef.current = setTimeout(() => {
      const t0 = performance.now()
      const tick = (now: number) => {
        const p = Math.min(1, (now - t0) / GROW_MS)
        setT(1 - Math.pow(1 - p, 3))          // ease-out cubic，与花瓣「长出来」的手感一致
        if (p < 1) rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)
    }, RISE_MS)
    return () => {
      clearTimeout(timerRef.current)
      cancelAnimationFrame(rafRef.current)
    }
  }, [reduced, shift.key])

  // 这一句只说一次 —— 说第二次是说教
  const showLaw = !lawSeen && !shift.firstEver
  useEffect(() => {
    if (showLaw) void markAhaLawSeen()
  }, [showLaw, markAhaLawSeen])

  // Esc 收起。记录路径永远可以被打断，Aha 也不例外
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // 花瓣补间：只有得光那一片在动，其余保持原状（别让整朵花一起晃）
  const scoreOverride = useMemo(() => {
    const out: Record<string, number> = {}
    for (const id of Object.keys(shift.scoresBefore)) {
      const a = shift.scoresBefore[id]
      const b = shift.scoresAfter[id]
      out[id] = a + (b - a) * t
    }
    return out
  }, [shift, t])

  const flowerSize = Math.min(300, Math.max(200, (typeof window !== 'undefined' ? window.innerWidth : 360) - 120))

  // 占比补间跟花瓣同一条时间轴，两者必须同时动 —— 分开动就看不出「挪」这件事
  const segs = shift.segments.map(s => ({ ...s, now: s.from + (s.to - s.from) * t }))
  const total = segs.reduce((sum, s) => sum + s.now, 0) || 1

  const gainedTo = pct(shift.gained.to)
  const gainedFrom = pct(shift.gained.from)
  const yieldedShown = shift.yielded.filter(y => pct(y.from) !== pct(y.to)).slice(0, 2)

  return (
    <div
      className="aha-scrim"
      data-testid="echo-toast"
      onClick={onClose}
      role="dialog"
      aria-label="光的分配"
    >
      <div className="aha-sheet-body" data-testid="light-shift" onClick={e => e.stopPropagation()}>
        <div className="aha-flower" data-grown={t >= 1 ? '1' : '0'}>
          <FlowerChart
            dimensions={dimensions}
            actions={actions}
            size={flowerSize}
            scoreOverride={scoreOverride}
          />
        </div>

        {/* 光带：八段按占比分宽，之和恒为 100%。
            testid 刻意与首页 LightBand 的 light-band-seg 区分开 —— 否则计数会串。 */}
        <div className="aha-band" data-testid="aha-band">
          {segs.map(s => (
            <span
              key={s.dimensionId}
              data-testid="aha-band-seg"
              data-dimension={s.name}
              style={{
                flex: `0 0 ${(s.now / total) * 100}%`,
                backgroundColor: s.colorHex,
                opacity: s.dimensionId === shift.gained.dimensionId ? 1 : 0.62,
              }}
            />
          ))}
        </div>

        {/* 第一行：占比变化的事实。不写「上涨」「进步」，只写从多少到多少 */}
        <div className="aha-deltas" data-testid="aha-deltas">
          <span className="aha-delta is-gained">
            {shift.gained.name}
            <i>{gainedFrom}% →</i>
            <b>{gainedTo}%</b>
          </span>
          {yieldedShown.map(y => (
            <span className="aha-delta" key={y.dimensionId}>
              {y.name}
              <i>{pct(y.from)}% →</i>
              <b>{pct(y.to)}%</b>
            </span>
          ))}
        </div>

        {/* 第二行：归属，不是评价。分配是中性动作，既不是成就也不是辜负 */}
        <p className="aha-fact" data-testid="aha-fact">{shiftFact(shift)}</p>

        {shift.firstEver && (
          <p className="aha-law">这是这座花园的第一笔光。它现在全在这一片上。</p>
        )}
        {showLaw && (
          <p className="aha-law" data-testid="aha-law">{LIGHT_LAW}</p>
        )}

        {/* 行动回响（P0-11）：这个 Aha 把回响吸收进来，不再另开一个角落的 toast ——
            一次操作只该有一个反馈面 */}
        {echo && (
          <div className="aha-echo">
            {echo.lines.map((line, i) => (
              <p key={i} className={i === 0 ? 'aha-echo-lead' : 'aha-echo-line'}>{line}</p>
            ))}
            <p className="aha-echo-line">{echo.word.benefit}</p>
            {echo.word.quote && (
              <p className="aha-echo-quote">
                「{echo.word.quote}」
                {echo.word.source && <span> —— {echo.word.source}</span>}
              </p>
            )}
          </div>
        )}

        <div className="aha-acts">
          <button
            className="aha-act is-primary"
            data-testid="echo-again"
            onClick={() => {
              const dim = dimensions.find(d => d.name === (echo?.dimensionName ?? shift.gained.name))
              onClose()
              if (dim) openQuickAddWith(dim.id)
            }}
          >
            再记一条
          </button>
          <button className="aha-act" data-testid="aha-close" onClick={onClose}>
            回到花园
          </button>
        </div>
      </div>
    </div>
  )
}
