import { useMemo } from 'react'
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
        <span className="text-xs text-[var(--text-muted)]">
          {shares[0].name} {Math.round(shares[0].share * 100)}%
        </span>
      </div>
      <div className="flex h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-hover)' }}>
        {shares.map(s => (
          <div
            key={s.dimensionId}
            title={`${s.name} ${Math.round(s.share * 100)}%`}
            data-testid="light-band-seg"
            data-dimension={s.name}
            style={{
              width: `${s.share * 100}%`,
              backgroundColor: s.colorHex,
              opacity: 0.75,
            }}
          />
        ))}
      </div>
    </div>
  )
}
