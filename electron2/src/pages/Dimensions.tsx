import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore, useEnabledDimensions } from '../stores/useStore'
import { calculateScore, dimensionStage } from '../engine/scoring'
import { focusGold } from '../services/focus'
import { PLANT_PALETTE } from '../models/dimension'
import { SubPageHeader } from '../components/SubPageHeader'

export function Dimensions() {
  const dimensions = useEnabledDimensions()
  const theme = useStore(s => s.theme)
  const allDimensions = useStore(s => s.dimensions)
  const actions = useStore(s => s.actions)
  const addDimension = useStore(s => s.addDimension)
  const updateDimension = useStore(s => s.updateDimension)
  const navigate = useNavigate()

  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(PLANT_PALETTE[0].hex)
  const [saving, setSaving] = useState(false)

  const disabledDims = allDimensions.filter(d => !d.isEnabled)

  const handleAdd = async () => {
    const name = newName.trim()
    if (!name || saving) return
    setSaving(true)
    try {
      await addDimension({
        name,
        icon: 'Sparkles',
        colorHex: newColor,
        sortOrder: allDimensions.length,
        isEnabled: true,
        currentScore: 3,
        initialScore: 3,
        scoringMode: 'auto',
        identity: '',
        focusSince: null,   // 新种的花瓣默认不是焦点；焦点只在季度会谈里选
        // v3.5/v3.6：新种的花瓣不预设目标、不预设约定 ——
        // 「八片都该有目标」正是这产品要反驳的那套叙事
        targetScore: null,
        weeklyIntent: 0,
        pactTiming: '',
        pactAnchor: '',
        pactText: '',
      })
      setNewName('')
      setNewColor(PLANT_PALETTE[0].hex)
      setShowAdd(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="page-pad space-y-4">
        <SubPageHeader
          // v3.7：这个页名同时撞两条 —— 「维度」是规格词（用户看到的是花瓣），
          //   「管理」是晓雅立的禁用词（这产品不管理人生，它只把账摊开）
          title="每一片花瓣"
          subtitle="生命之花的每一片花瓣"
          fallback="/garden"
          right={
            <button className="btn btn-ghost text-xs" onClick={() => setShowAdd(!showAdd)}>
              + 新花瓣
            </button>
          }
        />

        {/* 新维度表单 */}
        {showAdd && (
          <div className="card space-y-3 animate-fade-in" data-testid="add-dimension-form">
            <input
              className="input"
              placeholder="给这片新花瓣起个名字"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleAdd() }}
              autoFocus
            />
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--text-muted)]">花色</span>
              {PLANT_PALETTE.map(c => (
                <button
                  key={c.hex}
                  title={c.name}
                  className={`w-6 h-6 rounded-full transition-transform ${
                    newColor === c.hex ? 'ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--bg-card)] scale-110' : ''
                  }`}
                  style={{ backgroundColor: c.hex }}
                  onClick={() => setNewColor(c.hex)}
                />
              ))}
            </div>
            <div className="flex gap-2">
              <button className="btn btn-primary text-sm" disabled={!newName.trim() || saving} onClick={handleAdd}>
                种下
              </button>
              <button className="btn btn-ghost text-sm" onClick={() => setShowAdd(false)}>
                取消
              </button>
            </div>
          </div>
        )}

        {/* 启用中的维度 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {dimensions.map(dim => {
            const score = calculateScore(dim, actions)
            const stage = dimensionStage(dim, actions, score)
            const pct = Math.min(score / 10 * 100, 100)

            return (
              <div
                key={dim.id}
                className="card cursor-pointer group"
                onClick={() => navigate(`/dimensions/${dim.id}`)}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: dim.colorHex }}
                    />
                    <span className="font-medium">{dim.name}</span>
                    {/* 焦点维度的小金瓣印记（v3.2）：不用角标、不用「焦点」二字的标签块——
                        职场词汇留在设计稿里，界面上只有花园的语言 */}
                    {dim.focusSince != null && (
                      <span
                        data-testid="focus-mark"
                        title="这一季的光在这里"
                        className="text-[11px]"
                        style={{ color: focusGold(theme) }}
                      >
                        ❉
                      </span>
                    )}
                  </div>
                  <span className="text-sm text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity">
                    详情 →
                  </span>
                </div>

                {/* 评分条 */}
                <div className="h-1.5 bg-[var(--bg-hover)] rounded-full mb-2 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: dim.colorHex,
                    }}
                  />
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-[var(--text-secondary)]">{stage}</span>
                  <span style={{ color: dim.colorHex }} className="font-medium">
                    {score.toFixed(1)}
                  </span>
                </div>
              </div>
            )
          })}
        </div>

        {/* 休憩中的维度（停用） */}
        {disabledDims.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm text-[var(--text-muted)]">休憩中的花瓣（已停用，随时可以请回来）</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {disabledDims.map(dim => (
                <div key={dim.id} className="card opacity-60" data-testid="disabled-dimension">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: dim.colorHex }} />
                      <span className="font-medium">{dim.name}</span>
                    </div>
                    <button
                      className="btn btn-ghost text-xs py-1 px-2"
                      onClick={() => updateDimension(dim.id, { isEnabled: true })}
                    >
                      请回花园
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
