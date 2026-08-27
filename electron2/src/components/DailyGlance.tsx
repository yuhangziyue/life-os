import { useMemo } from 'react'
import { useStore, useEnabledDimensions, useCompanionDays } from '../stores/useStore'
import { composeGlance } from '../engine/impression'

/**
 * 今日账本一瞥（v3.3 T3）—— Dashboard 顶部那一行，一天一条。
 *
 * 为什么是这个形态（2026-08-25 第四轮圆桌）：
 *   报告原方案是「『休闲娱乐』沉睡 5 天了，也许今天浇一滴水？[浇一下][今天先不]」。
 *   否掉了 —— 加「也许」不改变本质，它仍是指出你的欠缺并索要一个动作，
 *   带「今天先不」按钮的卡片就是软推送，用户第五次看到会开始躲。
 *
 *   这里给的理由不是「你该做点什么」，是「你想看看账本」。
 *   前者是义务，义务会累；后者是好奇，好奇会自己回来。（小露：人一天看几次自己种的花，
 *   不是因为花需要他，是因为他想知道花有没有长。）
 *
 * 红线：没有按钮、没有待办、不点名沉睡维度要求补记。
 *       副句可以是一个问题（Lisa），但永不是一个要求 —— 摆在看得见的地方就够了。
 */
export function DailyGlance() {
  const dimensions = useEnabledDimensions()
  const actions = useStore(s => s.actions)
  const companionDays = useCompanionDays()

  const glance = useMemo(
    () => composeGlance({ dimensions, actions, companionDays }),
    [dimensions, actions, companionDays],
  )

  if (!glance) return null

  return (
    <div
      className="card flex items-start gap-3 py-4"
      data-testid="daily-glance"
      data-glance-kind={glance.kind}
    >
      <span
        className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-2"
        style={{ backgroundColor: glance.colorHex ?? 'var(--accent)' }}
      />
      <div className="space-y-1">
        <p className="text-sm text-[var(--text-primary)] leading-relaxed">{glance.text}</p>
        {glance.aside && (
          <p className="text-xs text-[var(--text-muted)] leading-relaxed">{glance.aside}</p>
        )}
      </div>
    </div>
  )
}
