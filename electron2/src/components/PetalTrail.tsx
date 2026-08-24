import { useEffect, useRef } from 'react'
import { useStore } from '../stores/useStore'
import { cssVar } from '../services/theme'
import type { ThemeId } from '../services/theme'

/**
 * 鼠标运动轨迹特效（v3.1 A2：三主题人格分化，2026-08-18 圆桌拍板）——
 * - night 暗夜花园：发光花瓣 + 熄灭前一粒金色余烬（两段式）
 * - dawn 禅意茶室：细长桂瓣，落得更慢，偶发一粒墨点晕开即逝（枯山水的「少」）
 * - bloom 花间集：带缺口的樱瓣，左右摇曳，密度略高（樱吹雪）
 *
 * 工程纪律（老架）：
 * - rAF 循环只在有粒子存活时运行，静止时零开销
 * - 粒子上限 36；spawn 按移动距离节流（profile.spawnDist）
 * - 发光走【离屏预渲染 sprite】，每帧只 drawImage——禁止每帧 shadowBlur
 *   （那是性能自杀：36 粒子能把一帧画到 8ms+）
 * - prefers-reduced-motion 时整个特效不启用；设置页「氛围 → 花瓣拖尾」可关
 * - 画布 pointer-events:none，z 层在弹窗之下，永不挡操作
 */

type PetalShape = 'leaf' | 'osmanthus' | 'sakura'

interface TrailProfile {
  shape: PetalShape
  /** [CSS 变量名, 兜底色] —— 换主题后用新 token 重建 */
  colors: [string, string][]
  gravity: number
  drag: number
  sway: number          // 横向摇曳振幅（px/帧）；0 = 不摇
  spawnDist: number     // 每移动多少 px 洒一片
  ttl: [number, number] // [基础帧数, 随机追加]
  size: [number, number]
  glow: boolean         // 花瓣带光晕（离屏 sprite）
  ember: boolean        // 熄灭前留一粒余烬
  inkChance: number     // 偶发墨点概率（dawn 专属）
  alphaPeak: number
}

const PROFILES: Record<ThemeId, TrailProfile> = {
  night: {
    shape: 'leaf',
    colors: [['--accent', '#c9a96e'], ['--accent-hover', '#d4b87a'], ['--accent-dim', '#8b7355']],
    gravity: 0.018, drag: 0.99, sway: 0, spawnDist: 28,
    ttl: [65, 45], size: [7, 7],
    glow: true, ember: true, inkChance: 0, alphaPeak: 0.55,
  },
  dawn: {
    shape: 'osmanthus',
    colors: [['--accent', '#ab8733'], ['--success', '#77864f'], ['--border-strong', '#c4b58e']],
    gravity: 0.008, drag: 0.995, sway: 0, spawnDist: 34,
    ttl: [90, 60], size: [7, 6],
    glow: false, ember: false, inkChance: 0.07, alphaPeak: 0.42,
  },
  bloom: {
    shape: 'sakura',
    colors: [['--accent', '#e75565'], ['--accent-hover', '#ee6b76'], ['--accent-dim', '#f8ccd4']],
    gravity: 0.02, drag: 0.99, sway: 0.55, spawnDist: 22,
    ttl: [70, 50], size: [7, 7],
    glow: false, ember: false, inkChance: 0, alphaPeak: 0.5,
  },
}

const EMBER_TTL = 26 // 余烬独立寿命（帧）

interface Petal {
  kind: 'petal' | 'ink'
  x: number; y: number
  vx: number; vy: number
  rot: number; vr: number
  phase: number          // 摇曳相位
  life: number; ttl: number
  size: number
  color: string          // 'r, g, b'
  colorIdx: number       // 对应 glow sprite
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return [201, 169, 110]
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** 每个主色预渲染一张 64px 光晕 sprite，运行期零边际成本 */
function makeGlowSprite(rgb: [number, number, number]): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = 64; c.height = 64
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.5)`)
  grad.addColorStop(0.4, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.16)`)
  grad.addColorStop(1, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0)`)
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  return c
}

function tracePetalPath(ctx: CanvasRenderingContext2D, shape: PetalShape, s: number) {
  ctx.beginPath()
  ctx.moveTo(0, 0)
  if (shape === 'osmanthus') {
    // 细长桂瓣：更窄、略长
    const w = s * 0.22
    const l = s * 1.15
    ctx.bezierCurveTo(l * 0.3, -w, l * 0.8, -w * 0.9, l, 0)
    ctx.bezierCurveTo(l * 0.8, w * 0.9, l * 0.3, w, 0, 0)
  } else if (shape === 'sakura') {
    // 樱瓣：顶端一个小缺口
    const w = s * 0.5
    ctx.bezierCurveTo(s * 0.35, -w, s * 0.9, -w * 0.9, s, -w * 0.28)
    ctx.quadraticCurveTo(s * 0.8, 0, s, w * 0.28)
    ctx.bezierCurveTo(s * 0.9, w * 0.9, s * 0.35, w, 0, 0)
  } else {
    // leaf：暗夜花园的圆润花瓣（v3 原形状）
    const w = s * 0.42
    ctx.bezierCurveTo(s * 0.3, -w, s * 0.78, -w * 0.8, s, 0)
    ctx.bezierCurveTo(s * 0.78, w * 0.8, s * 0.3, w, 0, 0)
  }
  ctx.closePath()
}

export function PetalTrail() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const theme = useStore(s => s.theme)          // 换主题 → 用新 profile/token 重建
  const enabled = useStore(s => s.ambience.trail)

  useEffect(() => {
    if (!enabled) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const profile = PROFILES[theme] ?? PROFILES.night
    // e2e 探针：断言「换主题真的换了人格」，而不是一套粒子换色
    ;(window as any).__trailProfile = profile.shape

    const dpr = window.devicePixelRatio || 1
    const resize = () => {
      canvas.width = window.innerWidth * dpr
      canvas.height = window.innerHeight * dpr
      canvas.style.width = `${window.innerWidth}px`
      canvas.style.height = `${window.innerHeight}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const palette = profile.colors.map(([v, fb]) => hexToRgb(cssVar(v, fb)))
    const glowSprites = profile.glow ? palette.map(makeGlowSprite) : []
    const emberRgb = hexToRgb(cssVar('--accent-hover', '#d4b87a'))
    const inkRgb = hexToRgb(cssVar('--text-secondary', '#6b5c41'))

    const petals: Petal[] = []
    let raf = 0
    let running = false
    let lastX = -1
    let lastY = -1
    let travelled = 0

    const drawPetal = (p: Petal, alpha: number) => {
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate(p.rot)
      tracePetalPath(ctx, profile.shape, p.size)
      ctx.fillStyle = `rgba(${p.color}, ${alpha})`
      ctx.fill()
      ctx.restore()
    }

    const tick = () => {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight)
      for (let i = petals.length - 1; i >= 0; i--) {
        const p = petals[i]
        p.life++

        if (p.kind === 'ink') {
          // 墨点：原地晕开、即逝
          const t = p.life / p.ttl
          if (t >= 1) { petals.splice(i, 1); continue }
          const r = p.size * (0.5 + t * 1.6)
          ctx.beginPath()
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(${p.color}, ${0.16 * (1 - t)})`
          ctx.fill()
          continue
        }

        p.x += p.vx
        p.y += p.vy
        p.vy += profile.gravity
        p.vx *= profile.drag
        p.rot += p.vr
        if (profile.sway > 0) {
          p.x += Math.sin(p.life * 0.11 + p.phase) * profile.sway
        }

        const total = p.ttl + (profile.ember ? EMBER_TTL : 0)
        if (p.life >= total) { petals.splice(i, 1); continue }

        if (p.life < p.ttl) {
          // 第一段：花瓣（+ 光晕）
          const t = p.life / p.ttl
          const alpha = t < 0.15
            ? (t / 0.15) * profile.alphaPeak
            : profile.alphaPeak * (1 - (t - 0.15) / 0.85)
          if (profile.glow) {
            const sprite = glowSprites[p.colorIdx]
            const r = p.size * 1.7
            ctx.globalAlpha = alpha * 0.9
            ctx.drawImage(sprite, p.x - r, p.y - r, r * 2, r * 2)
            ctx.globalAlpha = 1
          }
          drawPetal(p, alpha)
        } else {
          // 第二段：花瓣已尽，余烬缓缓熄灭（night 专属）
          const t = (p.life - p.ttl) / EMBER_TTL
          ctx.beginPath()
          ctx.arc(p.x, p.y, 1.3, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(${emberRgb[0]}, ${emberRgb[1]}, ${emberRgb[2]}, ${0.5 * (1 - t)})`
          ctx.fill()
        }
      }
      if (petals.length > 0) {
        raf = requestAnimationFrame(tick)
      } else {
        running = false
        ctx.clearRect(0, 0, window.innerWidth, window.innerHeight)
      }
    }

    const spawn = (x: number, y: number) => {
      if (petals.length >= 36) return
      const idx = Math.floor(Math.random() * palette.length)
      const c = palette[idx]
      petals.push({
        kind: 'petal',
        x: x + (Math.random() - 0.5) * 8,
        y: y + (Math.random() - 0.5) * 8,
        vx: (Math.random() - 0.5) * 0.9,
        vy: 0.25 + Math.random() * 0.5,
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.05,
        phase: Math.random() * Math.PI * 2,
        life: 0,
        ttl: profile.ttl[0] + Math.random() * profile.ttl[1],
        size: profile.size[0] + Math.random() * profile.size[1],
        color: `${c[0]}, ${c[1]}, ${c[2]}`,
        colorIdx: idx,
      })
      if (profile.inkChance > 0 && Math.random() < profile.inkChance && petals.length < 36) {
        petals.push({
          kind: 'ink',
          x: x + (Math.random() - 0.5) * 14,
          y: y + (Math.random() - 0.5) * 14,
          vx: 0, vy: 0, rot: 0, vr: 0, phase: 0,
          life: 0, ttl: 45 + Math.random() * 20,
          size: 2.2 + Math.random() * 1.6,
          color: `${inkRgb[0]}, ${inkRgb[1]}, ${inkRgb[2]}`,
          colorIdx: 0,
        })
      }
      if (!running) {
        running = true
        raf = requestAnimationFrame(tick)
      }
    }

    const onMove = (e: MouseEvent) => {
      if (lastX >= 0) {
        travelled += Math.hypot(e.clientX - lastX, e.clientY - lastY)
        if (travelled >= profile.spawnDist) {
          travelled = 0
          spawn(e.clientX, e.clientY)
        }
      }
      lastX = e.clientX
      lastY = e.clientY
    }

    window.addEventListener('mousemove', onMove, { passive: true })
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('resize', resize)
      cancelAnimationFrame(raf)
      delete (window as any).__trailProfile
    }
  }, [theme, enabled])

  if (!enabled) return null

  return (
    <canvas
      ref={canvasRef}
      data-testid="petal-trail"
      aria-hidden="true"
      style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 40 }}
    />
  )
}
