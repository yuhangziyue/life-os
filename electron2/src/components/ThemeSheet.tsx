import { useEffect } from 'react'
import { useStore } from '../stores/useStore'
import { THEMES } from '../services/theme'

/**
 * 主题选择（v3.7 C2）—— 子曰原话「主题的设置部分要更精简，变为上拉菜单选择」。
 *
 * 原来是三张带迷你色板预览的大卡片（`grid-cols-3`，每张 14px 高的色板 + 名字 + 描述），
 * 在手机窄屏上三列挤成一坨，而且它占的高度比它承担的决策重要性大得多 ——
 * **主题是一次性选择，一个人一年动它一两次。** 一次性选择不该常驻一屏三分之一。
 *
 * 改成：设置页主列表里一行「主题　花间集　⌃」，点开从底部升起一张选择表。
 *
 * 🔴 上拉菜单里仍然保留**色板预览**（不是只有名字）：
 *   主题的差别是视觉差别，只给名字等于让用户靠猜。
 *   但预览缩成一行三个色点，不再是 14px 的大色块 —— 够用来分辨，不够占地方。
 *
 * 🔴 **点选即生效、即关闭**，不做「确定/取消」：
 *   主题是可以立刻看见结果、也可以立刻改回来的东西。
 *   给它加一道确认，是把一次可逆的、无代价的动作说成一次决定。
 */
export function ThemeSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const theme = useStore(s => s.theme)
  const setTheme = useStore(s => s.setTheme)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="sheet-scrim"
      data-testid="theme-sheet"
      onClick={onClose}
    >
      {/* 复用已有的 .sheet-body（维度面板与窄屏记录面板共用的那一套）——
          它已经处理好了宽屏居中、safe-area、reduced-motion 降级。
          另造一套 .sheet-panel 只会多出一份会漂移的样式。 */}
      <div className="sheet-body" onClick={e => e.stopPropagation()}>
        <div className="sheet-grip" aria-hidden="true" />
        <h2 className="text-sm font-medium text-[var(--text-secondary)] px-1 pb-1">主题</h2>
        {THEMES.map(t => {
          const preview = {
            night: ['#c9a96e', '#8FA876', '#9B7BB8', '#D89A9E'],
            dawn: ['#ab8733', '#77864f', '#8d6e4a', '#3b2f1e'],
            bloom: ['#e75565', '#9b7bd8', '#4cae7c', '#eda23f'],
          }[t.id]
          const active = theme === t.id
          return (
            <button
              key={t.id}
              className={`sheet-row${active ? ' is-on' : ''}`}
              data-testid={`theme-opt-${t.id}`}
              onClick={() => { setTheme(t.id); onClose() }}
            >
              <span className="flex items-center gap-1">
                {preview.map(c => (
                  <span key={c} className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c }} />
                ))}
              </span>
              <span className="flex-1 text-left">
                <span className="text-sm">{t.name}</span>
                <span className="block text-[11px] text-[var(--text-muted)] leading-snug">{t.desc}</span>
              </span>
              {/* 选中态用一个「·」而不是「✓」：勾是完成，点是所在 */}
              {active && <span className="text-[var(--accent)] text-lg leading-none">·</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
