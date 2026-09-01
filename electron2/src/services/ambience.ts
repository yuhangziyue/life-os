// 氛围开关（A3）——主题化指针 / 花瓣拖尾，动效原则「一律可关」的落地。
// 与主题一样存 localStorage（纯外观偏好，跟设备走，不进数据库）。

export interface Ambience {
  cursor: boolean   // 主题化鼠标指针
  trail: boolean    // 花瓣拖尾
  /**
   * 页面过渡与氛围动效（v3.6.2）。
   * 动效红线是三条：慢 ≥400ms / 微 / **可关** ——
   * 前两条一直在守，第三条此前只覆盖了指针与拖尾，换页入场没有开关。
   * 「唯一允许抢注意力的 Aha」也归它管：关掉之后走与 reduced-motion 相同的降级路径。
   */
  motion: boolean
}

const KEY = 'lifeos:ambience'

export const DEFAULT_AMBIENCE: Ambience = { cursor: true, trail: true, motion: true }

export function loadAmbience(): Ambience {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULT_AMBIENCE }
    const parsed = JSON.parse(raw)
    return {
      cursor: parsed.cursor !== false,
      trail: parsed.trail !== false,
      motion: parsed.motion !== false,
    }
  } catch {
    return { ...DEFAULT_AMBIENCE }
  }
}

export function saveAmbience(a: Ambience) {
  try { localStorage.setItem(KEY, JSON.stringify(a)) } catch { /* 忽略 */ }
}

/**
 * 指针开关落到 <html data-cursor>。
 * CSS 里自定义指针只在 html:not([data-cursor='off']) 下生效——
 * 关掉即整站回系统指针，不需要动任何组件。
 */
export function applyCursorSetting(enabled: boolean) {
  if (enabled) delete document.documentElement.dataset.cursor
  else document.documentElement.dataset.cursor = 'off'
}

/**
 * 动效开关落到 <html data-motion>。
 * 与指针同一套做法：CSS 里判 `html[data-motion='off']`，关掉即整站停，
 * 组件一行都不用改。Aha 那一屏也读它 —— 见 LightShiftAha 的 reduced 判据。
 */
export function applyMotionSetting(enabled: boolean) {
  if (enabled) delete document.documentElement.dataset.motion
  else document.documentElement.dataset.motion = 'off'
}
