import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../stores/useStore'
import type { Dimension } from '../models/dimension'
import type { Action } from '../models/action'
import { lightShares } from '../engine/impression'

const DAY_MS = 24 * 60 * 60 * 1000

interface Props {
  dimensions: Dimension[]
  actions: Action[]
  /** 统计区间长度（天）。首页用 7 天，统计页可传 84 */
  days?: number
  label?: string
}

/**
 * 光带（v3.3 T3，小露定形 / 书香命名）——
 * 一条细横带，八段按占比分宽，用各瓣的植物色。
 *
 * 「花瓣告诉你每一瓣长成什么样，光带告诉你这些光是从哪里分出去的。」
 *
 * 为什么需要它（第四轮圆桌第四节）：
 *   分数是绝对量，绝对量必然到顶 —— 每天 0.6 条 normal 就能把一瓣顶到 10 分，
 *   顶部分辨率就死了。而占比之和恒等于 100%，天然没有顶、天然互斥：
 *   你给了职业，就必然没给家庭。「代价可见」的数学表达是占比，不是分数。
 *
 * 视觉红线（小露）：不能是八个百分比数字的列表 —— 那又变回报表了。
 *   一眼是一条光的分布带，不用读数字。
 */
export function LightBand({ dimensions, actions, days = 7, label = '这周的光' }: Props) {
  /**
   * 回执层（v3.6）：刚拿到光的那一段做一次饱和度脉冲，然后停在 1.06 —— 它不是一次动画，
   * 是一个**状态标记**。状态标记不会习惯化，因为它不是事件，是环境（小露二轮）。
   * 通道必须是饱和度不是宽度：240ms 内 1px 的宽度变化人眼没有知觉。
   */
  const pulseDimId = useStore(s => s.pulseDimId)
  const [pulsing, setPulsing] = useState(false)
  useEffect(() => {
    if (!pulseDimId) return
    setPulsing(true)
    const t = setTimeout(() => setPulsing(false), 240)
    return () => clearTimeout(t)
  }, [pulseDimId])

  const shares = useMemo(
    () => lightShares(dimensions, actions, Date.now() - days * DAY_MS),
    [dimensions, actions, days],
  )

  // 还没有账可算的时候，不摆一条空带子在那里当摆设
  if (shares.length === 0) return null

  return (
    <div className="space-y-1.5" data-testid="light-band">
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-[var(--text-muted)] tracking-wide">{label}</span>
        {/* 右上角原来写「首位花瓣 NN%」，v3.6 撤掉：日常路径零占比数字。
            这里改成只报名字 —— 谁在最前面是形状，不是刻度 */}
        <span className="text-xs text-[var(--text-muted)]">{shares[0].name} 最多</span>
      </div>
      {/* 🔴 不再给每段挂 title —— 鼠标一悬停八个百分比全出来，那是数字纪律的一个泄漏口
          （小露二轮点名要删）。日常路径上一个占比数字都不许出现。 */}
      <div className="light-band-track">
        {shares.map(s => {
          const isPulse = s.dimensionId === pulseDimId
          return (
            <div
              key={s.dimensionId}
              data-testid="light-band-seg"
              data-dimension={s.name}
              data-pulse={isPulse ? '1' : '0'}
              className={isPulse ? (pulsing ? 'is-pulsing' : 'is-marked') : ''}
              style={{ width: `${s.share * 100}%`, backgroundColor: s.colorHex }}
            />
          )
        })}
      </div>
    </div>
  )
}
