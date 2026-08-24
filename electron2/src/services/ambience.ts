// 氛围开关（A3）——主题化指针 / 花瓣拖尾，动效原则「一律可关」的落地。
// 与主题一样存 localStorage（纯外观偏好，跟设备走，不进数据库）。

export interface Ambience {
  cursor: boolean   // 主题化鼠标指针
  trail: boolean    // 花瓣拖尾
}

const KEY = 'lifeos:ambience'

export const DEFAULT_AMBIENCE: Ambience = { cursor: true, trail: true }

export function loadAmbience(): Ambience {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULT_AMBIENCE }
    const parsed = JSON.parse(raw)
    return {
      cursor: parsed.cursor !== false,
      trail: parsed.trail !== false,
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
