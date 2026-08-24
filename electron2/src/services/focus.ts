import type { ThemeId } from './theme'

/**
 * 焦点维度金边的三主题色（v3.2，设计稿 §3.2 建议值，小露实现后出对比图供终选）。
 *
 * 金色这东西屏幕上差一档就俗，所以三套不是"同一个金换透明度"：
 *   night 暗底上金边必须比常规 accent(#c9a96e) 亮两档才读得出"镶了金"而不是"换了描边色"，柔光最强；
 *   dawn  宣纸浅底上浅金会发飘 → 更深的鎏金实描 + 墨色内衬，不发光（纸上金线的贵气在"实"不在"晕"）；
 *   bloom 正金在白粉花笺上老气 → 偏玫瑰的金，柔光收小，是"少女的细金链"不是"庙里的金箔"。
 *
 * 柔光实现：一道更宽更淡的同色描边，不用 shadowBlur（老架 J2：每帧 shadowBlur 是性能自杀；
 * 这里虽然只在数据变化时画一次，但同样禁用，避免以后有人把它挪进动画循环）。
 */
export interface FocusStyle {
  gold: string
  glow: boolean
  glowAlpha: number
  glowWidth: number
  /** 金线内衬（仅 dawn） */
  ink?: string
}

export const FOCUS_STYLES: Record<ThemeId, FocusStyle> = {
  night: { gold: '#E8C87E', glow: true, glowAlpha: 0.30, glowWidth: 7 },
  dawn: { gold: '#B8923F', glow: false, glowAlpha: 0, glowWidth: 0, ink: 'rgba(58, 52, 43, 0.4)' },
  bloom: { gold: '#D4975C', glow: true, glowAlpha: 0.22, glowWidth: 4.5 },
}

/** 维度卡片 / 侧栏 / 统计页共用的那枚小金瓣印记的颜色 */
export function focusGold(theme: ThemeId): string {
  return FOCUS_STYLES[theme].gold
}
