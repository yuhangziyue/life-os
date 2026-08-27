import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore, useEnabledDimensions, useCompanionDays } from '../stores/useStore'
import { getSetting, setSetting } from '../db'
import { renderPostcard } from '../services/postcard'
import { lightShares } from '../engine/impression'
import { pickWarmWord } from '../content/warmWords'

/** 值得留一张明信片的陪伴里程碑 */
const MILESTONES = [30, 90, 180, 365, 500, 730]
const DAY_MS = 24 * 60 * 60 * 1000

interface Props {
  /** 花所在的容器，从里面取 canvas 画卡面 */
  flowerHost: React.RefObject<HTMLDivElement | null>
}

/**
 * 花的明信片入口（v3.3 T4）。
 *
 * 触发点只有两个（Lisa 把报告的四个砍到两个）：
 *   ① 季度会谈完成当天 —— 这是结算凭证
 *   ② 陪伴里程碑 30/90/180/365/500/730 天 —— 这是纪念
 * 周回顾不触发：每周都发的东西没人看第二次。首启也不触发：第一天的人还没有故事可讲。
 *
 * 每个节点只邀请一次（落 settings，不重复弹）；用户不理它就自然消失，不追。
 * 全程本地：只在内存画图、只交给用户自己保存，不联网不上传。
 */
export function PostcardCard({ flowerHost }: Props) {
  const dimensions = useEnabledDimensions()
  const actions = useStore(s => s.actions)
  const quarterlyReviews = useStore(s => s.quarterlyReviews)
  const companionDays = useCompanionDays()
  const theme = useStore(s => s.theme)

  const [dismissed, setDismissed] = useState(false)
  const [checked, setChecked] = useState(false)
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const busy = useRef(false)

  // 今天是否落在一个还没邀请过的节点上
  const occasion = useMemo(() => {
    const startOfToday = new Date().setHours(0, 0, 0, 0)
    const doneToday = quarterlyReviews.find(
      r => r.completedAt != null && r.completedAt >= startOfToday
    )
    if (doneToday) {
      return { key: `quarterly:${doneToday.id}`, title: '这一季', since: doneToday.startedAt }
    }
    if (MILESTONES.includes(companionDays)) {
      return {
        key: `companion:${companionDays}`,
        title: `第 ${companionDays} 天`,
        since: Date.now() - 84 * DAY_MS,
      }
    }
    return null
  }, [quarterlyReviews, companionDays])

  // 这个节点是否已经邀请过
  useEffect(() => {
    if (!occasion) { setChecked(false); return }
    let alive = true
    void getSetting(`postcard:${occasion.key}`).then(v => {
      if (alive) { setChecked(true); if (v === '1') setDismissed(true) }
    })
    return () => { alive = false }
  }, [occasion])

  if (!occasion || !checked || dismissed) return null

  const shares = lightShares(dimensions, actions, occasion.since)
  const topName = shares[0]?.name ?? dimensions[0]?.name ?? ''

  const make = () => {
    if (busy.current) return
    busy.current = true
    try {
      const canvas = flowerHost.current?.querySelector('canvas')
      if (!canvas) return
      const styles = getComputedStyle(document.documentElement)
      const url = renderPostcard(
        {
          dimensions,
          actions,
          flowerCanvas: canvas,
          title: occasion.title,
          since: occasion.since,
          quote: topName ? pickWarmWord(topName, occasion.key).quote : undefined,
        },
        {
          bg: styles.getPropertyValue('--bg-primary').trim() || '#0d0d0d',
          text: styles.getPropertyValue('--text-primary').trim() || '#e8e3d8',
          muted: styles.getPropertyValue('--text-muted').trim() || '#6b6458',
          accent: styles.getPropertyValue('--accent').trim() || '#c9a96e',
        },
      )
      setDataUrl(url)
    } finally {
      busy.current = false
    }
  }

  const dismiss = () => {
    setDismissed(true)
    void setSetting(`postcard:${occasion.key}`, '1')
  }

  return (
    <div className="card space-y-3" data-testid="postcard-card" data-occasion={occasion.key}>
      <div className="text-sm text-[var(--text-primary)]">
        {occasion.key.startsWith('quarterly')
          ? '这一季谈完了。想把这朵花留成一张明信片吗？'
          : `今天是第 ${companionDays} 天。想把这朵花留成一张明信片吗？`}
      </div>
      <p className="text-xs text-[var(--text-muted)] leading-relaxed">
        卡面上会写清这段时间的光分给了谁——{theme === 'night' ? '暗底暖金' : '按当前花园的颜色'}。
        图只存在你自己电脑上，要不要给别人看由你决定。
      </p>

      {dataUrl ? (
        <div className="space-y-3">
          <img
            src={dataUrl}
            alt="花的明信片"
            data-testid="postcard-image"
            className="w-full max-w-xs mx-auto rounded-lg"
            style={{ boxShadow: 'var(--card-shadow)' }}
          />
          <div className="flex items-center gap-3">
            <a
              className="btn btn-primary text-sm"
              href={dataUrl}
              download={`life-flower-${occasion.key.replace(':', '-')}.png`}
              data-testid="postcard-save"
              onClick={dismiss}
            >
              保存这张明信片
            </a>
            <button className="btn btn-ghost text-sm" onClick={dismiss}>先不用</button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <button className="btn btn-primary text-sm" onClick={make} data-testid="postcard-make">
            做一张
          </button>
          <button className="btn btn-ghost text-sm" onClick={dismiss}>先不用</button>
        </div>
      )}
    </div>
  )
}
