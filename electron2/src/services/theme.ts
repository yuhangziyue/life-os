// 主题系统 —— 「暗夜花园」(night, 默认) 与 「晨曦花园」(dawn, 亮色温暖版)。
// token 全部落在 globals.css 的 CSS 变量上；Canvas 组件通过 cssVar() 读同一套 token，
// 保证切主题时花形图/雷达图与 DOM 同步换装。

export type ThemeId = 'night' | 'dawn' | 'bloom'

const KEY = 'lifeos:theme'

export const THEMES: { id: ThemeId; name: string; desc: string }[] = [
  { id: 'night', name: '暗夜花园', desc: '安静的深夜，花瓣自己会发一点点光' },
  { id: 'dawn', name: '禅意茶室', desc: '深木色静室，宣纸、鎏金与一点橄榄绿' },
  { id: 'bloom', name: '花间集', desc: '白粉花笺与珊瑚玫瑰，鲜亮而不过曝' },
]

export function loadTheme(): ThemeId {
  try {
    const t = localStorage.getItem(KEY)
    return t === 'dawn' || t === 'bloom' ? t : 'night'
  } catch {
    return 'night'
  }
}

export function applyTheme(theme: ThemeId) {
  document.documentElement.dataset.theme = theme
  try { localStorage.setItem(KEY, theme) } catch { /* 忽略 */ }
}

/** 读当前生效的 CSS 变量（Canvas 绘制用，与 DOM 共享同一套 token） */
export function cssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

/** #rrggbb → rgba()，Canvas 半透明填充用 */
export function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return hex
  const n = parseInt(m[1], 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}
