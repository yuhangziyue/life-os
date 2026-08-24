import { useEffect, useRef } from 'react'
import type { Dimension } from '../models/dimension'
import { cssVar, hexToRgba } from '../services/theme'
import { useStore } from '../stores/useStore'

interface RadarChartProps {
  dimensions: Dimension[]
  size?: number
}

export function RadarChart({ dimensions, size = 280 }: RadarChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const theme = useStore(s => s.theme) // 切主题时用新 token 重绘

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = size * dpr
    canvas.height = size * dpr
    canvas.style.width = `${size}px`
    canvas.style.height = `${size}px`
    ctx.scale(dpr, dpr)

    const cx = size / 2
    const cy = size / 2
    const radius = size * 0.35
    const levels = 5
    const count = dimensions.length

    if (count === 0) return

    ctx.clearRect(0, 0, size, size)

    const gridColor = cssVar('--border', '#2a2a2a')
    const gridFaint = cssVar('--bg-hover', '#1f1f1f')
    const labelColor = cssVar('--text-secondary', '#9c9588')
    const accent = cssVar('--accent', '#c9a96e')

    // 背景网格
    for (let level = 1; level <= levels; level++) {
      ctx.beginPath()
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count - Math.PI / 2
        const r = (radius * level) / levels
        const x = cx + r * Math.cos(angle)
        const y = cy + r * Math.sin(angle)
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.closePath()
      ctx.strokeStyle = level === levels ? gridColor : gridFaint
      ctx.lineWidth = 0.5
      ctx.stroke()
    }

    // 轴线
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count - Math.PI / 2
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(cx + radius * Math.cos(angle), cy + radius * Math.sin(angle))
      ctx.strokeStyle = gridFaint
      ctx.lineWidth = 0.5
      ctx.stroke()
    }

    // 数据区域
    ctx.beginPath()
    for (let i = 0; i < count; i++) {
      const score = Math.min(dimensions[i].currentScore, 10) / 10
      const angle = (Math.PI * 2 * i) / count - Math.PI / 2
      const r = radius * score
      const x = cx + r * Math.cos(angle)
      const y = cy + r * Math.sin(angle)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.closePath()
    ctx.fillStyle = hexToRgba(accent, 0.15)
    ctx.fill()
    ctx.strokeStyle = hexToRgba(accent, 0.6)
    ctx.lineWidth = 1.5
    ctx.stroke()

    // 数据点
    for (let i = 0; i < count; i++) {
      const score = Math.min(dimensions[i].currentScore, 10) / 10
      const angle = (Math.PI * 2 * i) / count - Math.PI / 2
      const r = radius * score
      const x = cx + r * Math.cos(angle)
      const y = cy + r * Math.sin(angle)

      ctx.beginPath()
      ctx.arc(x, y, 3, 0, Math.PI * 2)
      ctx.fillStyle = dimensions[i].colorHex || accent
      ctx.fill()
    }

    // 标签
    ctx.font = '11px -apple-system, sans-serif'
    ctx.fillStyle = labelColor
    ctx.textAlign = 'center'
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count - Math.PI / 2
      const labelR = radius + 24
      const x = cx + labelR * Math.cos(angle)
      const y = cy + labelR * Math.sin(angle) + 4
      ctx.fillText(dimensions[i].name.slice(0, 4), x, y)
    }
  }, [dimensions, size, theme])

  return (
    <canvas
      ref={canvasRef}
      className="mx-auto"
      style={{ width: size, height: size }}
    />
  )
}
