import { useState } from 'react'
import { useStore } from '../stores/useStore'

/**
 * 「这是别人的花园」出口（v3.6.2，销 v3.4 的 A5）—— 只在网页演示版出现。
 *
 * A5 是这样一个岔路口：陌生人从小红书点进来，第一眼是**演示花园**（80+ 条记录、
 * 三个月曲线、已经开好的花）。这一眼很值 —— 它一秒说明"这产品是什么"，
 * 换成空白问卷会劝退。所以默认不改。
 *
 * 但演示数据同时挡住了这产品最贵的那一分钟：**首启三幕的第三幕会当场给出
 * 「第一份代价快照」**，那是「价值在第 1 天兑现」的全部实现。
 *
 * ⇒ 所以给一个出口，并且**放在「我」页的第一张卡，不藏在角落浮标里**。
 *   藏起来的出口等于没有 —— 这一条是这个组件存在的全部理由。
 *
 * 文案纪律：不说「开始你的旅程」（口号）、不说「立即体验」（祈使 + 营销腔）。
 * 只陈述事实：现在看的是别人的账本；想看自己的，这里可以清空。
 */
export function DemoGardenSwitch() {
  const actions = useStore(s => s.actions)
  const [confirming, setConfirming] = useState(false)
  const [working, setWorking] = useState(false)

  // 已经在自己的花园里（记录很少、且没有演示数据的规模）就不必再出现这张卡
  const looksLikeDemo = actions.length > 40

  const start = async () => {
    setWorking(true)
    await window.__lifeosDemo?.startMyGarden()
  }

  if (!looksLikeDemo) {
    return (
      <div className="card space-y-2" data-testid="demo-switch">
        <h2 className="text-sm font-medium text-[var(--text-secondary)]">这是你自己的花园</h2>
        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
          演示数据已经清掉了，现在这里记的是你。想再看一遍那个开好的样板花园，可以随时恢复。
        </p>
        <button
          className="btn btn-ghost text-xs"
          data-testid="demo-restore"
          onClick={() => void window.__lifeosDemo?.restoreDemo()}
        >
          恢复演示数据
        </button>
      </div>
    )
  }

  return (
    <div className="card space-y-2" data-testid="demo-switch">
      <h2 className="text-sm font-medium text-[var(--text-secondary)]">这是别人的花园</h2>
      <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
        你现在看到的是一份样板数据 —— 一个已经照顾了三个月的花园。
        它能让你一眼看懂这朵花在说什么，但它不是你的账。
      </p>
      <p className="text-xs text-[var(--text-muted)] leading-relaxed">
        清空之后会走一遍三幕的开场，第三幕会给你第一份属于你的代价快照。大约一分钟。
      </p>

      {!confirming ? (
        <button
          className="btn btn-primary text-sm"
          data-testid="demo-start-mine"
          onClick={() => setConfirming(true)}
        >
          清空，种我自己的
        </button>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
            这会清掉这台设备浏览器里的全部演示数据。样板数据随时可以再恢复，
            但如果你已经在这里记过自己的东西，先去上面导出一份。
          </p>
          <div className="flex gap-2">
            <button
              className="btn btn-primary text-sm"
              data-testid="demo-start-confirm"
              disabled={working}
              onClick={start}
            >
              {working ? '正在清空…' : '确认，开始'}
            </button>
            <button className="btn text-sm" onClick={() => setConfirming(false)}>
              先不
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
