import { useState } from 'react'
import { useStore, useEnabledDimensions } from '../stores/useStore'
import { QUALITY_IMPACT, QUALITY_LABELS, MOODS } from '../models/action'
import type { ActionQuality } from '../models/action'
import { startOfToday } from '../engine/scoring'

interface QuickAddPanelProps {
  open: boolean
  onClose: () => void
}

/**
 * 两击记录（P0-7）：选维度 → 回车即完成。
 * 描述可留空（自动落成分支名/一件小事）；质量默认「正常」；
 * 记录路径只到二度分支——三度分支留给维度详情页和盘点场景。
 */
export function QuickAddPanel({ open, onClose }: QuickAddPanelProps) {
  const dimensions = useEnabledDimensions()
  const branches = useStore(s => s.branches)
  const addAction = useStore(s => s.addAction)

  const [dimensionId, setDimensionId] = useState('')
  const [branchId, setBranchId] = useState('')
  const [description, setDescription] = useState('')
  const [quality, setQuality] = useState<ActionQuality>('normal')
  // 感受随手记（C1）：默认折叠、绝不强制——强制填心情是最快毁掉心情的方式
  const [moodOpen, setMoodOpen] = useState(false)
  const [mood, setMood] = useState('')

  // 只展示二度分支（level 1），96 个三度叶子不进入记录路径
  const dimBranches = branches.filter(
    b => b.dimensionId === dimensionId && b.level === 1
  )

  const handleSubmit = async () => {
    if (!dimensionId) return
    const dim = dimensions.find(d => d.id === dimensionId)
    const branch = dimBranches.find(b => b.id === branchId)
    const text = description.trim()
      || (branch ? branch.name : `为「${dim?.name ?? '这片花瓣'}」做了一件小事`)

    await addAction({
      date: startOfToday(),
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
    onClose()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      handleSubmit()
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]" onClick={onClose}>
      <div className="modal-overlay" />
      <div
        className="relative card w-full max-w-md mx-4 animate-fade-in p-6"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-4">快速记录</h3>

        {/* 维度选择。选中态用该维度自己的植物色实心填充——
            原来只是一圈 1px 描边 + 文字变色，在三套主题里都看不出选了哪片花瓣（子曰 2026-08-18） */}
        <div className="flex flex-wrap gap-2 mb-4">
          {dimensions.map(d => {
            const on = dimensionId === d.id
            return (
              <button
                key={d.id}
                className={`qa-chip qa-chip-dim ${on ? 'is-on' : ''}`}
                style={on ? { '--chip': d.colorHex } as React.CSSProperties : undefined}
                onClick={() => {
                  setDimensionId(d.id)
                  setBranchId('')
                }}
              >
                <span className="qa-chip-dot" style={{ backgroundColor: d.colorHex }} />
                {d.name}
              </button>
            )
          })}
        </div>

        {/* 二度分支（可选） */}
        {dimBranches.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
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

        {/* 描述（可留空） */}
        <input
          className="input mb-3"
          placeholder="做了什么？（可以留空，回车即记录）"
          value={description}
          onChange={e => setDescription(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
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
