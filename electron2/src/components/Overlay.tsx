import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * 弹层的传送门（v3.7）—— 所有全屏浮层都必须经过它。
 *
 * ============ 它解决的是一个实测到的 bug ============
 * 子曰报「网页版主题设置点击之后没有反应」。实测下来不是没反应，是**弹层被定位错了容器**：
 *
 * `main > div` 上的 `pageIn` 动画写着 `animation-fill-mode: both`，
 * 于是动画结束后永久保持最后一帧 `transform: translateY(0)` ——
 * 一个恒等变换，但**它照样让那个滚动容器成为 `position: fixed` 的包含块**。
 * 弹层于是相对容器定位而不是相对视口：
 *   实测 rect 从 `0,0,390×844` 变成 `30,0,386×814`；
 *   而页面一旦往下滚，弹层就渲染在容器顶部 —— **在视口外面**。
 *
 * fill-mode 已经改掉了（见 globals.css），但那只是治了这一次。
 * **真正的护栏是这里**：portal 到 `document.body` 之后，
 * 无论谁给哪个祖先加 transform / filter / perspective / will-change / contain，
 * 弹层都不会再被捕获。
 *
 * ============ 为什么不用 `<dialog>` ============
 * `<dialog>` 的 top-layer 能一次性解决这件事，但它自带的关闭语义（Esc 关闭、
 * ::backdrop、focus trap）与这产品已有的三种浮层各自的规则冲突
 * （比如 Aha 定格帧刻意**不允许**点背景关闭）。portal 只解决定位，不带来别的行为。
 */
export function Overlay({ children }: { children: ReactNode }) {
  const [host] = useState(() => (typeof document === 'undefined' ? null : document.createElement('div')))

  useEffect(() => {
    if (!host) return
    // 一个专用挂载点，不直接往 body 里塞 —— 这样 React 卸载时不会与别的库抢 body 的子节点
    host.setAttribute('data-overlay-host', '')
    document.body.appendChild(host)

    /*
     * 浮层期间给 <html> 打一个标记，让**演示版浮标**让位（见 web-main.tsx 的样式）。
     *
     * 实测到的问题：引导第二幕的「← 上一步」按钮在左下角，
     * 而演示浮标在窄屏也被钉在左下 —— **浮标正好压住那个按钮**。
     * 这与 v3.6.2 修过的「浮标盖住第三个 tab」是同一类命中问题，
     * 只是这次被盖的是浮层里的按钮。
     *
     * 用计数而不是布尔：季度会谈五幕之间会短暂同时存在两个 Overlay，
     * 布尔会被先卸载的那个提前清掉。
     */
    const root = document.documentElement
    const n = Number(root.dataset.overlayOpen || 0) + 1
    root.dataset.overlayOpen = String(n)

    return () => {
      host.remove()
      const left = Number(root.dataset.overlayOpen || 1) - 1
      if (left > 0) root.dataset.overlayOpen = String(left)
      else delete root.dataset.overlayOpen
    }
  }, [host])

  if (!host) return null
  return createPortal(children, host)
}
