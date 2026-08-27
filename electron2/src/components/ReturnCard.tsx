import { useMemo } from 'react'
import { useStore } from '../stores/useStore'

/**
 * 中断回归卡（v3.6，小艾提案 C，Lisa 二轮改写文案）。
 *
 * ============ 为什么这一条对留存的杠杆最大 ============
 * 留存曲线上最大的流失量不在首日，在**「中断后回归失败」**。
 * 所有打卡类工具在这一刻把用户永久赶走：你断了 15 天，打开只会看到自己的失败，于是你不打开了。
 *
 * 而这个产品手里有一张竞品没有的牌：**光带之和恒为 100%，所以「没记录」不产生空洞，
 * 只产生"形状没变"。缺席在这个数学模型里是无痕的。** 这件事必须被说出来，
 * 因为用户自己想不到。
 *
 * ============ 三条分寸（Lisa 二轮） ============
 *   · **主语是账本，不是你。** 不说「你断了 15 天」，说「光带停在你上次离开时的形状」。
 *   · **日期可给，天数不给。** 通则：位置不产生账，计量会被读成账。
 *     唯一豁免是陪伴天数（只增不减，不可能成为赤字）。
 *   · **禁「欢迎回来」。** 它宣告了"你曾经离开"这件事被我们记录并正在结案，
 *     而那是我们此刻还没资格给的热情。
 *
 * 另外：一个 15 天没来的人点开，是带着**预期羞耻**点开的 ——
 * 此刻我们能给的最有治疗性的东西，就是那个预期没有被满足。
 * 所以这里没有任何行动号召，不加「要不要记一笔」。
 */

const DAY_MS = 24 * 60 * 60 * 1000
const BREAK_DAYS = 5
const SEEN_KEY = 'returnCardSeenAt'

export function ReturnCard() {
  const actions = useStore(s => s.actions)
  const dismissedAt = useStore(s => s.returnCardDismissedAt)
  const dismissReturnCard = useStore(s => s.dismissReturnCard)

  const info = useMemo(() => {
    if (actions.length === 0) return null
    // 用 createdAt 不用 date：问的是「上次坐下来记录是什么时候」，
    // 不是「最后一条记录关于哪天的事」（老架二轮）
    const lastAt = Math.max(...actions.map(a => a.createdAt))
    const days = Math.floor((Date.now() - lastAt) / DAY_MS)
    if (days < BREAK_DAYS) return null
    // 同一次中断只出现一次：以「上次记录时刻」为键
    if (dismissedAt === lastAt) return null
    return { lastAt }
  }, [actions, dismissedAt])

  if (!info) return null

  return (
    <div className="return-card" data-testid="return-card">
      <p>光带停在你上次离开时的形状。这里没有变。</p>
      <p className="return-card-date">
        上一笔光记在 {new Date(info.lastAt).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })}。
      </p>
      <button
        className="return-card-close"
        data-testid="return-card-close"
        onClick={() => dismissReturnCard(info.lastAt)}
      >
        收起
      </button>
    </div>
  )
}

export { SEEN_KEY as RETURN_CARD_SEEN_KEY }
