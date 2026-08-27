import { useEffect, useRef, useState } from 'react'
import type { Action } from '../models/action'
import type { Dimension } from '../models/dimension'

/**
 * 光的年轮（v3.6，小露第五轮提案三，二轮改稿）——
 * 最近九十天，每天一列，列内按当天八段占比堆叠。
 *
 * 为什么它能替掉「连续多少天」：
 *   连续天数是一个**可以被打断的数字**，断了就归零，归零的痛感远大于坚持的收益
 *   （Lisa：这是打卡类工具最大的流失口，而我们的用户一定会断）。
 *   年轮不计数、不归零，它只是把「光那些天去了哪儿」摊开——
 *   哪三个月全是赭石（在拼职业）、哪两周突然多了藕粉（生病了），一眼可见。
 *   这是「攒证据」唯一诚实的图形。
 *
 * 🔴 空列的画法是这个组件全部的分寸所在（小露二轮改稿）：
 *   没记录的那天**不画单一色块**，画的是「前一次有光那天的配色，透明度压到 0.10」——
 *   一段余影。理由：**缺口是靠边界被识别的**。17 个纯色空列会连成一条有明确边界的横杠，
 *   读作「我空了 17 天」；而渐渐褪色的余影没有边界，读作「那段时间我在别处」。
 *
 * 另外三条硬约束（同上）：
 *   · 空列**占满整高**，不画成低矮小块 —— 矮 = 少 = 欠
 *   · 横轴**零刻度、零日期**；长按某列才浮出那天的日期（静态事实，不写「N 天前」）
 *   · 窗口**固定 90 天，永不横向增长** —— 长度一旦随使用天数变长，它就是进度条
 */

const DAYS = 90
const COL_W = 3
const H = 40
const DAY_MS = 24 * 60 * 60 * 1000

interface Props {
  dimensions: Dimension[]
  actions: Action[]
}

function startOfDay(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function LightRings({ dimensions, actions }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  /** 长按浮出的那一天。null = 没在看 */
  const [peek, setPeek] = useState<{ label: string; x: number } | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const w = DAYS * COL_W
    const dpr = window.devicePixelRatio || 1
    canvas.width = w * dpr
    canvas.height = H * dpr
    canvas.style.width = `${w}px`
    canvas.style.height = `${H}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, H)

    // 每天每维度的 impact 权重
    const today = startOfDay(Date.now())
    const byDay = new Map<number, Map<string, number>>()
    for (const a of actions) {
      if (!a.isCompleted) continue
      const d = startOfDay(a.date)
      if (d > today || d < today - (DAYS - 1) * DAY_MS) continue
      let row = byDay.get(d)
      if (!row) { row = new Map(); byDay.set(d, row) }
      row.set(a.dimensionId, (row.get(a.dimensionId) ?? 0) + a.impact)
    }

    // 从左（最老）到右（今天）画。空列用「上一次有光那天」的配色画余影
    let lastShape: { colorHex: string; share: number }[] | null = null
    for (let i = 0; i < DAYS; i++) {
      const day = today - (DAYS - 1 - i) * DAY_MS
      const row = byDay.get(day)
      const x = i * COL_W

      if (row && row.size > 0) {
        const total = [...row.values()].reduce((s, v) => s + v, 0)
        const shape = dimensions
          .filter(d => (row.get(d.id) ?? 0) > 0)
          .map(d => ({ colorHex: d.colorHex, share: (row.get(d.id) as number) / total }))
        lastShape = shape
        let y = 0
        ctx.globalAlpha = 0.9
        for (const seg of shape) {
          const h = seg.share * H
          ctx.fillStyle = seg.colorHex
          ctx.fillRect(x, y, COL_W, Math.ceil(h))
          y += h
        }
      } else if (lastShape) {
        // 余影：前一次有光那天的形状，压到 0.10。不留边界，所以读不出「缺口」
        let y = 0
        ctx.globalAlpha = 0.1
        for (const seg of lastShape) {
          const h = seg.share * H
          ctx.fillStyle = seg.colorHex
          ctx.fillRect(x, y, COL_W, Math.ceil(h))
          y += h
        }
      }
      // 花园开园之前那些列什么都不画（那不是缺席，是还没开始）
    }
    ctx.globalAlpha = 1
  }, [dimensions, actions])

  const onPeek = (clientX: number, rect: DOMRect) => {
    const i = Math.floor((clientX - rect.left) / COL_W)
    if (i < 0 || i >= DAYS) return
    const day = startOfDay(Date.now()) - (DAYS - 1 - i) * DAY_MS
    setPeek({
      // 只给日期，不给「N 天前」——日期是位置，天数是计量，计量会被读成账（Lisa 二轮通则）
      label: new Date(day).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' }),
      x: i * COL_W,
    })
  }

  return (
    <div className="rings-wrap" data-testid="light-rings">
      <div className="rings-head">
        <span>最近九十天</span>
        {peek && <span className="rings-peek" data-testid="rings-peek">{peek.label}</span>}
      </div>
      <div className="rings-canvas-wrap">
        <canvas
          ref={canvasRef}
          onMouseMove={e => onPeek(e.clientX, e.currentTarget.getBoundingClientRect())}
          onMouseLeave={() => setPeek(null)}
          onTouchStart={e => onPeek(e.touches[0].clientX, e.currentTarget.getBoundingClientRect())}
          onTouchEnd={() => setPeek(null)}
        />
      </div>
    </div>
  )
}
