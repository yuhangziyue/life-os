// 主题系统。
//
// v3.5.1 起**默认且唯一投入的主题是「花间集」(bloom)** —— 子曰 2026-08-27 拍板
// 「后面只关注一个花间主题」。night / dawn 两套仍然可选、仍然全绿，但不再为它们做新设计；
// 新增视觉一律以 bloom 为准。删掉它们没有收益（token 已经全落在 CSS 变量上，
// 留着零维护成本），但**新功能的配色决策不再需要三套都成立**——这是本次收敛真正省下的东西。
// token 全部落在 globals.css 的 CSS 变量上；Canvas 组件通过 cssVar() 读同一套 token，
// 保证切主题时花形图/雷达图与 DOM 同步换装。

export type ThemeId = 'night' | 'dawn' | 'bloom'

const KEY = 'lifeos:theme'

export const THEMES: { id: ThemeId; name: string; desc: string }[] = [
  { id: 'bloom', name: '花间集', desc: '白粉花笺与珊瑚玫瑰，鲜亮而不过曝' },
  { id: 'night', name: '暗夜花园', desc: '安静的深夜，花瓣自己会发一点点光' },
  { id: 'dawn', name: '禅意茶室', desc: '深木色静室，宣纸、鎏金与一点橄榄绿' },
]

export function loadTheme(): ThemeId {
  try {
    const t = localStorage.getItem(KEY)
    // 只认显式存过的三个值；没存过 = 新用户 ⇒ 花间集
    if (t === 'night' || t === 'dawn' || t === 'bloom') return t
    return 'bloom'
  } catch {
    return 'bloom'
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
