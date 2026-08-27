import { useEffect, useMemo, useState } from 'react'
import { useStore, useEnabledDimensions } from '../stores/useStore'
import { QUALITY_IMPACT, QUALITY_LABELS, MOODS } from '../models/action'
import type { ActionQuality } from '../models/action'
import { startOfToday, dimensionVitality } from '../engine/scoring'

interface QuickAddPanelProps {
  open: boolean
  onClose: () => void
}

/** 与 globals.css 的 860px 断点一致。窄屏下面板变成底部半屏 sheet，且不自动聚焦输入框 */
const NARROW_PX = 860

/**
 * 两击记录（P0-7 / v3.5 M6）：选维度 → 回车即完成。
 * 描述可留空（自动落成分支名/一件小事）；质量默认「正常」；
 * 记录路径只到二度分支——三度分支留给维度详情页和盘点场景。
 */
export function QuickAddPanel({ open, onClose }: QuickAddPanelProps) {
  const dimensions = useEnabledDimensions()
  const branches = useStore(s => s.branches)
  const actions = useStore(s => s.actions)
  const addAction = useStore(s => s.addAction)
  const quickAddPreset = useStore(s => s.quickAddPreset)

  const [dimensionId, setDimensionId] = useState('')
  const [branchId, setBranchId] = useState('')
  const [description, setDescription] = useState('')
  const [quality, setQuality] = useState<ActionQuality>('normal')
  // 感受随手记（C1）：默认折叠、绝不强制——强制填心情是最快毁掉心情的方式
  const [moodOpen, setMoodOpen] = useState(false)
  const [mood, setMood] = useState('')
  // 二度分支（v3.3 T7，报告 §4.2.2）：默认收起。分支是可选的，
  // 却和维度选择占一样的视觉权重，让面板看起来比实际复杂
  const [branchOpen, setBranchOpen] = useState(false)

  /**
   * 窄屏形态（v3.5 M6）：底部半屏 sheet + 八宫格，**不自动聚焦输入框**。
   * 自动弹起键盘会把八宫格顶出视野，「两击完成」当场变成「先收键盘再点」——
   * 定位 v2.0 的原话：两击记录不是体验优化项，是这产品能否存在的前提。
   */
  const narrow = typeof window !== 'undefined' && window.innerWidth <= NARROW_PX

  /**
   * 跨零点归属（v3.6，Lisa 二轮）：00:00–04:00 提交的记录默认归**前一天**。
   * 深夜三点提交的人，心理上还在昨天没结束的那件事里 ——
   * 这一个字段级的决定，比任何一句温柔的话都得体。
   * 🔴 但**归属可以默认，不能隐藏**（小艾）：静默改归属会让用户日后对不上账，
   *    而这个产品全部的价值就建立在账本可信上。所以面板上明写一行。
   */
  const nowHour = new Date().getHours()
  const belongsToYesterday = nowHour >= 0 && nowHour < 4

  // 「再记一条」带过来的预选维度
  useEffect(() => {
    if (open && quickAddPreset) {
      setDimensionId(quickAddPreset)
      setBranchOpen(false)
    }
  }, [open, quickAddPreset])

  /**
   * 维度排序（v3.3 T7，报告 §4.2.1）：
   *   近 7 天记得多的排前面（形成习惯后 80% 的记录集中在 2-3 个维度）；
   *   沉睡的排最后 —— 但绝不隐藏，去惩罚化的底线是「不把谁扫到看不见的地方」。
   */
  const sortedDimensions = useMemo(() => {
    return [...dimensions]
      .map(d => {
        const v = dimensionVitality(d, actions)
        return { d, v, rank: v.dormant ? -1 : v.recentCount }
      })
      .sort((a, b) => b.rank - a.rank)
  }, [dimensions, actions])

  // 只展示二度分支（level 1），96 个三度叶子不进入记录路径
  const dimBranches = branches.filter(
    b => b.dimensionId === dimensionId && b.level === 1
  )
  const currentDim = dimensions.find(d => d.id === dimensionId)

  const handleSubmit = async () => {
    if (!dimensionId) return
    const dim = dimensions.find(d => d.id === dimensionId)
    const branch = dimBranches.find(b => b.id === branchId)
    const text = description.trim()
      || (branch ? branch.name : `为「${dim?.name ?? '这片花瓣'}」做了一件小事`)

    await addAction({
      date: belongsToYesterday ? startOfToday() - 86400000 : startOfToday(),
      descriptionText: text,
      impact: QUALITY_IMPACT[quality],
      quality,
      isCompleted: true,
      mood,
      dimensionId,
      branchId: branchId || null,
    })

    setDescription('')
    setBranchId('')
    setQuality('normal')
    setMood('')
    setMoodOpen(false)
    setBranchOpen(false)
    onClose()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      handleSubmit()
    }
  }

  if (!open) return null

  return (
    <div className="qa-scrim" onClick={onClose}>
      <div className="modal-overlay" />
      <div className="qa-panel card animate-fade-in" onClick={e => e.stopPropagation()}>
        <div className="sheet-grip qa-grip" />
        <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-4">快速记录</h3>
        {belongsToYesterday && (
          <p className="qa-belongs" data-testid="qa-belongs">
            已经是新的一天了，这条记在昨天。
          </p>
        )}

        {/* 维度选择。选中态用该维度自己的植物色实心填充——
            原来只是一圈 1px 描边 + 文字变色，在三套主题里都看不出选了哪片花瓣（子曰 2026-08-18） */}
        <div className="qa-dim-grid mb-4" data-testid="qa-dimensions">
          {sortedDimensions.map(({ d, v }) => {
            const on = dimensionId === d.id
            return (
              <button
                key={d.id}
                className={`qa-chip qa-chip-dim ${on ? 'is-on' : ''}`}
                style={on ? { '--chip': d.colorHex } as React.CSSProperties : undefined}
                data-dimension={d.name}
                data-dormant={v.dormant ? '1' : '0'}
                onClick={() => {
                  setDimensionId(d.id)
                  setBranchId('')
                  setBranchOpen(false)
                }}
              >
                <span className="qa-chip-dot" style={{ backgroundColor: d.colorHex }} />
                {d.name}
                {/* 今天已照顾过：沿用花瓣上的露珠概念，一个点就够，不写字 */}
                {v.hasToday && <span className="qa-chip-dew" data-testid="qa-dew" title="今天已经照顾过" />}
              </button>
            )
          })}
        </div>

        {/* 约定的上下文内自我提示（v3.6）：
            🔴 它**只在用户自己选到这片花瓣时**出现 —— 系统没有拉他，是他自己走进来的。
            这是「约定」与「定时提醒」的全部差别，也是它能在零催办红线下存活的原因。
            不判定做了没做，不出现完成率。 */}
        {currentDim?.pactTiming && currentDim?.pactText && (
          <p className="qa-pact" data-testid="qa-pact">
            你和这片的约定：每个{currentDim.pactTiming}，{currentDim.pactAnchor}之后，我去{currentDim.pactText}。
          </p>
        )}

        {/* 二度分支（可选，默认收起）——不点就直接跳到描述输入 */}
        {dimBranches.length > 0 && (
          <div className="mb-4" data-testid="qa-branches">
            {!branchOpen && !branchId ? (
              <button
                className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
                data-testid="qa-branch-toggle"
                onClick={() => setBranchOpen(true)}
              >
                + 在「{currentDim?.name}」的哪个方向？（可选）
              </button>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {dimBranches.map(b => (
                  <button
                    key={b.id}
                    className={`qa-chip qa-chip-sm ${branchId === b.id ? 'is-on' : ''}`}
                    onClick={() => setBranchId(branchId === b.id ? '' : b.id)}
                  >
                    {branchId === b.id && <span className="qa-chip-check">✓</span>}
                    {b.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 描述（可留空） */}
        <input
          className="input mb-3"
          placeholder="做了什么？（可以留空，回车即记录）"
          value={description}
          onChange={e => setDescription(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus={!narrow}
        />

        {/* 感受随手记（可选，默认折叠） */}
        <div className="mb-3" data-testid="mood-picker">
          {!moodOpen ? (
            <button
              className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
              onClick={() => setMoodOpen(true)}
            >
              + 记一下此刻的感受（可选）
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              {MOODS.map(m => (
                <button
                  key={m.key}
                  title={m.label}
                  className={`text-lg px-1.5 py-0.5 rounded-lg transition-all ${
                    mood === m.key ? 'bg-[var(--accent)]/20 scale-110' : 'opacity-60 hover:opacity-100'
                  }`}
                  onClick={() => setMood(mood === m.key ? '' : m.key)}
                >
                  {m.emoji}
                </button>
              ))}
              <span className="text-[10px] text-[var(--text-muted)] ml-1">
                {mood ? MOODS.find(m => m.key === mood)?.label : '不填也完全可以'}
              </span>
            </div>
          )}
        </div>

        {/* 质量 + 提交 */}
        <div className="flex items-center justify-between">
          <div className="flex gap-1">
            {(Object.keys(QUALITY_LABELS) as ActionQuality[]).map(q => (
              <button
                key={q}
                className={`qa-chip qa-chip-sm ${quality === q ? 'is-on' : ''}`}
                onClick={() => setQuality(q)}
              >
                {QUALITY_LABELS[q]}
              </button>
            ))}
          </div>
          <button
            className="btn btn-primary text-sm"
            disabled={!dimensionId}
            onClick={handleSubmit}
          >
            记录 ⌘↵
          </button>
        </div>
      </div>
    </div>
  )
}
