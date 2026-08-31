import { useEffect, useState } from 'react'

/**
 * 花形尺寸：跟视口挂钩，不写死（v3.6.1）。
 *
 * 为什么需要它：季度会谈五幕与月度微校准里的 `size` 原本是硬编码的 200~280px，
 * 那是桌面弹窗时代的数。390px 屏减掉浮层内边距只剩约 300px，
 * 280 的花贴边、两朵 150 的花并排会挤到重叠 —— 而这两个恰恰是「回顾重」的核心场景。
 *
 * 口径：base 是上限（宽屏拿到的就是它），窄屏按可用宽度收，但不低于 `min`。
 * 只在挂载与 resize 时算 —— 花形本身只在数据/主题变化时重绘，这里不引入额外重绘压力。
 */
export function useFlowerSize(base: number, opts: { inset?: number; min?: number } = {}): number {
  const inset = opts.inset ?? 88   // 浮层左右内边距 + 卡片内边距的经验值
  const min = opts.min ?? 150

  const calc = () => {
    if (typeof window === 'undefined') return base
    return Math.max(min, Math.min(base, window.innerWidth - inset))
  }

  const [size, setSize] = useState(calc)
  useEffect(() => {
    const onResize = () => setSize(calc())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, inset, min])

  return size
}

/**
 * 并排两朵花时每朵的尺寸（月度微校准 / 季度会谈第三幕）。
 * 窄屏下两朵仍然并排 —— 「并排」本身就是那一屏的全部信息（本月 vs 上月），
 * 改成上下堆叠就读不出对照了。所以是把每朵收小，不是改布局。
 */
export function usePairFlowerSize(base: number): number {
  return useFlowerSize(base, { inset: 120, min: 108 })
}
