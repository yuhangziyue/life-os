import { useEffect, useRef } from 'react'
import type { Dimension } from '../models/dimension'
import type { Action } from '../models/action'
import { dimensionVitality } from '../engine/scoring'
import { cssVar, hexToRgba } from '../services/theme'
import { useStore } from '../stores/useStore'
import { FOCUS_STYLES } from '../services/focus'

/**
 * 生命之花的主视觉 —— 一朵真正的花，不是雷达图（小露 R1）。
 *
 * 形态语言（圆桌拍板）：
 *   花瓣长度   = 分数（0-10，含苞 → 盛放，差异要够大，1 秒读出哪片最弱）
 *   花瓣饱满度 = 近 7 天活跃度（透明度）
 *   合拢变淡   = 沉睡（收窄 + 降透明，不是惩罚，是安静地等你）
 *   花瓣露珠   = 今天照顾过
 *   花蕊微光   = 整体状态
 *   金边       = 这一季的焦点（v3.2，画在独立图层上）
 * 只在数据/主题变化时重绘；呼吸动效交给 CSS 合成层（.flower-breathe / .focus-breathe），
 * Canvas 不做常驻动画、不做每帧 shadowBlur（老架 J2）。
 */

interface FlowerChartProps {
  dimensions: Dimension[]
  actions: Action[]
  size?: number
  /** 预览用：覆盖 focusSince 的判定（第四幕实时预览金边，未落库） */
  focusPreview?: string[]
  /** 会谈第二幕：只画这一片，其余退为剪影 */
  spotlightId?: string
  /** 覆盖分数（会谈/引导打分预览用） */
  scoreOverride?: Record<string, number>
  /**
   * 花瓣可点（v3.5 M7）：点一片花瓣 → 该维度面板。
   * 主视觉同时是导航 —— 这是「维度管理」那一栏能被删掉的原因。
   * 用真实 <button> 叠在 canvas 上而不是做 canvas 命中测试：可聚焦、可读屏、可键盘操作。
   */
  petalLinkable?: boolean
}

/** 花瓣路径：两段三次贝塞尔围成的闭合叶形（沿 +x 方向），与金边共用同一条形状 */
function petalPath(ctx: CanvasRenderingContext2D, len: number, halfW: number) {
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.bezierCurveTo(len * 0.28, -halfW, len * 0.78, -halfW * 0.86, len, 0)
  ctx.bezierCurveTo(len * 0.78, halfW * 0.86, len * 0.28, halfW, 0, 0)
  ctx.closePath()
}

export function FlowerChart({
  dimensions, actions, size = 340, focusPreview, spotlightId, scoreOverride, petalLinkable,
}: FlowerChartProps) {
  const openDimensionSheet = useStore(s => s.openDimensionSheet)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const focusRef = useRef<HTMLCanvasElement>(null)
  const theme = useStore(s => s.theme) // 依赖主题：切主题时用新 token 重绘

  const focusIds = focusPreview ?? dimensions.filter(d => d.focusSince != null).map(d => d.id)
  const focusKey = focusIds.join(',')
  const overrideKey = scoreOverride ? JSON.stringify(scoreOverride) : ''

  useEffect(() => {
    const canvas = canvasRef.current
    const focusCanvas = focusRef.current
    if (!canvas || !focusCanvas) return
    const ctx = canvas.getContext('2d')
    const fctx = focusCanvas.getContext('2d')
    if (!ctx || !fctx) return

    const dpr = window.devicePixelRatio || 1
    for (const [c, cc] of [[canvas, ctx], [focusCanvas, fctx]] as const) {
      c.width = size * dpr
      c.height = size * dpr
      c.style.width = `${size}px`
      c.style.height = `${size}px`
      cc.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const count = dimensions.length
    ctx.clearRect(0, 0, size, size)
    fctx.clearRect(0, 0, size, size)
    if (count === 0) return

    const cx = size / 2
    const cy = size / 2
    const maxLen = size * 0.36      // 满分花瓣长度
    const minLen = maxLen * 0.18    // 含苞底长（0 分也不是"没有"，是花苞）

    const textSecondary = cssVar('--text-secondary', '#9c9588')
    const textMuted = cssVar('--text-muted', '#6b6458')
    const accent = cssVar('--accent', '#c9a96e')
    const dew = cssVar('--dew', '#f5f0e6')
    const focusStyle = FOCUS_STYLES[theme]
    const dormantAlpha = parseFloat(cssVar('--petal-dormant-alpha', '0.15')) || 0.15

    // 花瓣从竖直向上开始，顺时针排布
    dimensions.forEach((dim, i) => {
      const angle = (Math.PI * 2 * i) / count - Math.PI / 2
      const v = dimensionVitality(dim, actions)
      const raw = scoreOverride?.[dim.id] ?? dim.currentScore
      const score = Math.min(Math.max(raw, 0), 10)
      const len = minLen + (maxLen - minLen) * (score / 10)

      // 饱满度：基础 0.32，近 7 天每条行动 +0.09（封顶 0.8）；沉睡降到主题给的下限。
      // ⚠️ 红线（设计稿 §3.4）：这里绝不因为"别人是焦点"而给非焦点花瓣降一个字节的饱和度。
      // 焦点是加法照明（多一道金边），不是减法审判（把别人变灰）。e2e 有取色断言守这条。
      // 沉睡 alpha 走 CSS token（v3.3 T5）：暗底 0.15 够看，白底(bloom)必须提到 0.24——
      // 看不见的花瓣等于账本缺页，那是功能性失效，不是美化问题。
      // 活跃上限 0.8 → 0.9（v3.6.2，报告台账 R2 的前一半）：
      // 原来 6 条记录就到顶（0.32 + 6×0.09 = 0.86 → 截到 0.8），顶部分辨率浪费了。
      // 🔴 R2 的后一半「这片花瓣在慢慢合拢……」提示**按圆桌裁决砍掉** ——
      //    它离催办只有一步，而写不出不催办的版本就不该上（台账原话）。
      //    「合着」这个状态已经由花瓣形态本身说清了，不需要再补一句话去提醒。
      let alpha = v.dormant ? dormantAlpha : Math.min(0.32 + v.recentCount * 0.09, 0.9)
      const widthFactor = v.dormant ? 0.5 : 1
      // 聚光（仅会谈第二幕逐瓣打分时）：这是临时的镜头语言，不是常态视觉
      if (spotlightId && dim.id !== spotlightId) alpha *= 0.35
      const halfW = len * 0.36 * widthFactor

      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate(angle)

      petalPath(ctx, len, halfW)
      ctx.fillStyle = hexToRgba(dim.colorHex, alpha)
      ctx.fill()
      ctx.strokeStyle = hexToRgba(dim.colorHex, Math.min(alpha + 0.22, 0.95))
      ctx.lineWidth = 1.2
      ctx.stroke()

      // 花瓣中脉，给一点手绘感
      ctx.beginPath()
      ctx.moveTo(len * 0.1, 0)
      ctx.lineTo(len * 0.86, 0)
      ctx.strokeStyle = hexToRgba(dim.colorHex, v.dormant ? 0.12 : 0.3)
      ctx.lineWidth = 0.6
      ctx.stroke()

      // 露珠：今天照顾过的花瓣，瓣尖挂一滴
      if (v.hasToday) {
        ctx.beginPath()
        ctx.arc(len * 0.86, 0, 3.2, 0, Math.PI * 2)
        ctx.fillStyle = dew
        ctx.fill()
        ctx.strokeStyle = hexToRgba(dim.colorHex, 0.9)
        ctx.lineWidth = 1
        ctx.stroke()
      }

      ctx.restore()

      // ---- 金边：焦点维度（画在独立图层，呼吸交给 CSS）----
      if (focusIds.includes(dim.id)) {
        fctx.save()
        fctx.translate(cx, cy)
        fctx.rotate(angle)
        // 瓣根两端各留 8% 不闭合 —— 手工描金留的笔触气口，避免"电子边框"感（稿 §3.1）。
        // 做法：整条瓣形描边，再用一段透明擦口把瓣根抹掉，比重算路径省事且形状严格一致。
        fctx.beginPath()
        fctx.moveTo(len * 0.08, -halfW * 0.08)
        fctx.bezierCurveTo(len * 0.28, -halfW, len * 0.78, -halfW * 0.86, len, 0)
        fctx.bezierCurveTo(len * 0.78, halfW * 0.86, len * 0.28, halfW, len * 0.08, halfW * 0.08)
        // 柔光：不用 shadowBlur，用一道更宽更淡的同色描边代替（一次性绘制，零帧成本）
        if (focusStyle.glow) {
          fctx.strokeStyle = hexToRgba(focusStyle.gold, focusStyle.glowAlpha)
          fctx.lineWidth = focusStyle.glowWidth
          fctx.lineCap = 'round'
          fctx.stroke()
        }
        if (focusStyle.ink) {
          // 禅意茶室：宣纸浅底上金线会发飘，内衬一道墨色让它立住（稿 §3.2）
          fctx.strokeStyle = focusStyle.ink
          fctx.lineWidth = 2.4
          fctx.stroke()
        }
        fctx.strokeStyle = focusStyle.gold
        fctx.lineWidth = 1.5
        fctx.lineCap = 'round'
        fctx.stroke()
        fctx.restore()
      }

      // 标签（不随花瓣旋转）
      const labelR = maxLen + 26
      ctx.font = '11px -apple-system, "PingFang SC", sans-serif'
      ctx.textAlign = 'center'
      ctx.fillStyle = v.dormant ? textMuted : textSecondary
      const label = dim.name.slice(0, 4)
      // 左右两侧的标签会被画布边缘切掉半个字（「休闲娱乐」变「闲娱乐」）——
      // 把落点夹回画布内，宁可离花瓣近一点，也不要缺字。
      const halfText = ctx.measureText(label).width / 2
      const lx = Math.min(Math.max(cx + labelR * Math.cos(angle), halfText + 2), size - halfText - 2)
      const ly = cy + labelR * Math.sin(angle)
      ctx.fillText(label, lx, ly + 4)
    })

    // 花蕊：柔光 + 实心
    const glowR = maxLen * 0.30
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR)
    glow.addColorStop(0, hexToRgba(accent, 0.5))
    glow.addColorStop(1, hexToRgba(accent, 0))
    ctx.beginPath()
    ctx.arc(cx, cy, glowR, 0, Math.PI * 2)
    ctx.fillStyle = glow
    ctx.fill()

    ctx.beginPath()
    ctx.arc(cx, cy, 5, 0, Math.PI * 2)
    ctx.fillStyle = accent
    ctx.fill()
  }, [dimensions, actions, size, theme, focusKey, spotlightId, overrideKey])

  return (
    <div className="flower-breathe" style={{ width: size, height: size, position: 'relative' }}>
      <canvas ref={canvasRef} style={{ width: size, height: size }} />
      <canvas
        ref={focusRef}
        data-testid="flower-focus-layer"
        className="focus-breathe"
        style={{ width: size, height: size, position: 'absolute', inset: 0, pointerEvents: 'none' }}
      />
      {petalLinkable && dimensions.map((dim, i) => {
        // 与绘制用的同一条角度公式（(2πi)/count − π/2，花瓣从竖直向上开始顺时针）。
        // 半径取花瓣中段，热区 44px —— 触控下限。
        const angle = (Math.PI * 2 * i) / dimensions.length - Math.PI / 2
        const r = size * 0.24
        return (
          <button
            key={dim.id}
            className="petal-hit"
            data-testid="petal-hit"
            data-dimension={dim.name}
            title={`看看「${dim.name}」`}
            aria-label={`看看「${dim.name}」`}
            style={{
              left: size / 2 + r * Math.cos(angle) - 22,
              top: size / 2 + r * Math.sin(angle) - 22,
            }}
            onClick={() => openDimensionSheet(dim.id)}
          />
        )
      })}
    </div>
  )
}
