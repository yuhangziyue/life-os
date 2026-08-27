// 花的明信片（v3.3 T4）—— 把一次结算画成一张可以带走的图。
//
// 为什么要有它（2026-08-25 第四轮圆桌第三节）：
//   这朵花画了 14 轮，此前只有一个人看得见。它是这个产品最强的传播资产，
//   却完全没有出口。
//
// 两条来自圆桌的硬口径：
//   1. 卡面展示**占比**，不展示模糊形态词（小露推翻报告原方案）。
//      日常界面用形态词，是因为日常不该被数字压；但明信片是拿出去的东西，
//      拿出去的东西必须具体才有分量。「我的花开得还不错」没人看，
//      「这一季我 62% 的光给了工作」有人会转。
//   2. 触发点只留两个（Lisa 把报告的四个砍到两个）：季度会谈完成 / 陪伴里程碑。
//      周回顾太频繁 —— 每周都发的东西没人看第二次；首启那次也砍掉，
//      第一天的人还没有故事可讲。
//
// 本地优先不破：只在内存里画、只交给用户自己保存，不联网、不上传、不带二维码。

import type { Dimension } from '../models/dimension'
import type { Action } from '../models/action'
import { lightShares } from '../engine/impression'

export interface PostcardInput {
  dimensions: Dimension[]
  actions: Action[]
  /** 花的 canvas（Dashboard / 会谈里那一个），只读不改 */
  flowerCanvas: HTMLCanvasElement
  /** 卡面主标题，如「第 90 天」「这一季」 */
  title: string
  /** 统计区间起点；季度会谈传本季起点，里程碑传近 84 天 */
  since: number
  /** 书香供的那一句，按最丰盛的那瓣取 */
  quote?: string
  /**
   * 是否画「光的分配」。默认 true。
   * 首启那张传 false —— 第一天他一条记录都没有，占比是空的，
   * 画出来就是编的。宁可少说一句，不说没依据的话。（v3.4 A4 折中方案）
   */
  showShares?: boolean
}

const W = 900
const H = 1200

/**
 * 画一张明信片，返回 PNG dataURL。
 * 纯 Canvas 合成，不引依赖；取色全部从传入值来，调用方负责按主题传。
 */
export function renderPostcard(
  input: PostcardInput,
  palette: { bg: string; text: string; muted: string; accent: string },
): string | null {
  const { dimensions, actions, flowerCanvas, title, since, quote, showShares = true } = input

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  // 底
  ctx.fillStyle = palette.bg
  ctx.fillRect(0, 0, W, H)

  // 花：等比放到卡面上部
  const flowerSize = 560
  const fx = (W - flowerSize) / 2
  const fy = 120
  ctx.drawImage(flowerCanvas, fx, fy, flowerSize, flowerSize)

  // 标题
  ctx.textAlign = 'center'
  ctx.fillStyle = palette.accent
  ctx.font = '300 34px "PingFang SC", "Hiragino Sans GB", sans-serif'
  ctx.fillText('生命之花', W / 2, 82)

  ctx.fillStyle = palette.muted
  ctx.font = '300 24px "PingFang SC", "Hiragino Sans GB", sans-serif'
  ctx.fillText(title, W / 2, 730)

  // 光的分配：明信片的正文就是这张账单
  const shares = showShares ? lightShares(dimensions, actions, since) : []
  let y = 800
  if (shares.length > 0) {
    // 光带
    const bandW = 620
    const bandX = (W - bandW) / 2
    let x = bandX
    for (const s of shares) {
      const segW = bandW * s.share
      ctx.fillStyle = s.colorHex
      ctx.globalAlpha = 0.8
      ctx.fillRect(x, y, segW, 10)
      x += segW
    }
    ctx.globalAlpha = 1
    y += 52

    // 前两瓣写清楚占比 —— 具体才有分量
    ctx.fillStyle = palette.text
    ctx.font = '300 30px "PingFang SC", "Hiragino Sans GB", sans-serif'
    for (const s of shares.slice(0, 2)) {
      ctx.fillText(`${Math.round(s.share * 100)}% 的光给了「${s.name}」`, W / 2, y)
      y += 46
    }
  }

  // 那一句：有账时是书香的语录，首启那张是代价快照本身
  if (quote) {
    y += shares.length > 0 ? 24 : 8
    ctx.fillStyle = shares.length > 0 ? palette.muted : palette.text
    ctx.font = `300 ${shares.length > 0 ? 22 : 27}px "PingFang SC", "Hiragino Sans GB", sans-serif`
    for (const line of wrap(ctx, quote, 640)) {
      ctx.fillText(line, W / 2, y)
      y += shares.length > 0 ? 34 : 42
    }
  }

  // 落款：只有产品名，不放二维码不放下载链接（克制，不让分享变成广告）
  ctx.fillStyle = palette.muted
  ctx.font = '300 18px "PingFang SC", "Hiragino Sans GB", sans-serif'
  ctx.globalAlpha = 0.7
  ctx.fillText('生命之花 · 一座只属于你的花园', W / 2, H - 56)
  ctx.globalAlpha = 1

  return canvas.toDataURL('image/png')
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = []
  let cur = ''
  for (const ch of text) {
    if (ctx.measureText(cur + ch).width > maxWidth && cur) {
      lines.push(cur)
      cur = ch
    } else {
      cur += ch
    }
  }
  if (cur) lines.push(cur)
  return lines
}
