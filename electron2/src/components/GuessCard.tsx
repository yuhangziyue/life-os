import { useMemo, useState } from 'react'
import type { Action } from '../models/action'
import type { Dimension } from '../models/dimension'
import { lightShares } from '../engine/impression'

/**
 * 「你猜」（v3.6.2，晓雅第一轮提案 1 —— 她自己标为「本轮最想推的一个」）。
 *
 * ============ 它为什么是这套 Aha 里最特别的一条 ============
 * 定位 v2.0 写死了一条定性：**人对自己过去三个月时间分配的记忆完全不可靠**
 * ——「我挺顾家的」经不起花瓣形状的对质。这是「记录=攒证据」的全部理由。
 *
 * 但那条定性此前只写在文档里，从来没被做成一次交互。「你猜」把它做成了：
 * **在翻开账本之前，先让用户凭印象填一个数。**
 *
 * 于是落差不是产品说的，是他自己造成的 ——
 *   · 产品全程零评价：它只显示「你猜 X · 账上是 Y」，一个形容词都没有
 *   · 它天然规避红线 3（不评判），因为**下判断的人是他自己**
 *   · 冲击力比任何定格句都大，而且**猜错才有意思**（所以文案要明说这一点，
 *     否则用户会想"猜准一点"，那就变成考试了）
 *
 * 位置：周对账页。它属于「对账档」—— Lisa 二轮裁决过：统计与数字上移到对账档，
 * 日常记录路径不给数字。而这里是用户**自己主动打开**的一屏，给精确数字是尊重。
 */

interface Props {
  dimensions: Dimension[]
  actions: Action[]
  /** 这一期的区间。周对账传本周，月同理 */
  periodStart: number
  periodEnd: number
  periodWord: string
}

/** 差多少个百分点才值得追一句「原来差了这么多」 */
const BIG_GAP = 15

export function GuessCard({ dimensions, actions, periodStart, periodEnd, periodWord }: Props) {
  const [guess, setGuess] = useState<number | null>(null)
  const [revealed, setRevealed] = useState(false)

  const target = useMemo(() => {
    const shares = lightShares(dimensions, actions, periodStart, periodEnd)
    if (shares.length < 2) return null
    // 挑首位那片来问 —— 它的占比最有信息量，也最容易被记忆美化
    const top = shares[0]
    return { name: top.name, colorHex: top.colorHex, pct: Math.round(top.share * 100) }
  }, [dimensions, actions, periodStart, periodEnd])

  // 账太薄就不玩这个 —— 两三条记录的占比没有"记忆偏差"可谈
  if (!target) return null

  const gap = guess == null ? 0 : Math.abs(guess - target.pct)

  return (
    <div className="card space-y-3" data-testid="guess-card">
      <div>
        <h2 className="text-sm font-medium text-[var(--text-secondary)]">先别看账</h2>
        <p className="text-xs text-[var(--text-secondary)] leading-relaxed mt-1">
          {periodWord}拿到光最多的是
          <span className="mx-1" style={{ color: target.colorHex }}>{target.name}</span>
          。你觉得它占了多少？
        </p>
        <p className="text-[11px] text-[var(--text-muted)] mt-1">凭印象填，填错才有意思。</p>
      </div>

      {!revealed ? (
        <div className="space-y-3">
          <div className="guess-slider">
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={guess ?? 25}
              data-testid="guess-slider"
              onChange={e => setGuess(Number(e.target.value))}
            />
            <span className="guess-num">{guess == null ? '—' : `${guess}%`}</span>
          </div>
          <button
            className="btn btn-primary text-sm"
            disabled={guess == null}
            data-testid="guess-reveal"
            onClick={() => setRevealed(true)}
          >
            翻开账本
          </button>
        </div>
      ) : (
        <div className="space-y-2" data-testid="guess-result">
          <div className="guess-compare">
            <span>你猜 <b>{guess}%</b></span>
            <span className="guess-sep">·</span>
            <span>账上是 <b style={{ color: target.colorHex }}>{target.pct}%</b></span>
          </div>
          {/* 差得多才追一句，而且这一句仍然是事实，不是评价 */}
          {gap >= BIG_GAP && (
            <p className="text-xs text-[var(--text-secondary)]" data-testid="guess-gap">
              原来差了这么多。
            </p>
          )}
          {gap < BIG_GAP && (
            <p className="text-xs text-[var(--text-muted)]">这一期你记得挺准。</p>
          )}
          <button
            className="text-[11px] text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
            data-testid="guess-again"
            onClick={() => { setRevealed(false); setGuess(null) }}
          >
            再猜一次
          </button>
        </div>
      )}
    </div>
  )
}
