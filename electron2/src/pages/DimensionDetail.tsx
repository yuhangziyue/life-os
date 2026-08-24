import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useStore, useDimension, useDimensionBranches, useDimensionGoals } from '../stores/useStore'
import { calculateScore, getRubric } from '../engine/scoring'
import { generateGoal } from '../services/ai'
import type { Goal } from '../models/goal'
import { v4 as uuid } from '../db/uuid'

export function DimensionDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const dim = useDimension(id!)
  const branches = useDimensionBranches(id!)
  const goals = useDimensionGoals(id!)
  const actions = useStore(s => s.actions)
  const scoreRubrics = useStore(s => s.scoreRubrics)
  const aiConfig = useStore(s => s.aiConfig)
  const updateDimension = useStore(s => s.updateDimension)
  const deleteDimension = useStore(s => s.deleteDimension)
  const addGoal = useStore(s => s.addGoal)
  const updateGoal = useStore(s => s.updateGoal)
  const deleteGoal = useStore(s => s.deleteGoal)
  const addBranch = useStore(s => s.addBranch)
  const deleteBranch = useStore(s => s.deleteBranch)
  const updateBranch = useStore(s => s.updateBranch)

  const [showAddGoal, setShowAddGoal] = useState(false)
  const [goalTitle, setGoalTitle] = useState('')
  const [goalDesc, setGoalDesc] = useState('')
  const [goalTarget, setGoalTarget] = useState('')
  const [goalUnit, setGoalUnit] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [showAddBranch, setShowAddBranch] = useState(false)
  const [newBranchName, setNewBranchName] = useState('')
  const [editingBranch, setEditingBranch] = useState<string | null>(null)
  const [editBranchName, setEditBranchName] = useState('')
  // 身份宣言（C2）：受控值跟随维度切换；null = 尚未编辑过（沿用库里的值）
  const [identityDraft, setIdentityDraft] = useState<string | null>(null)

  if (!dim) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-[var(--text-muted)]">维度不存在</p>
      </div>
    )
  }

  const score = calculateScore(dim, actions)
  const rubric = getRubric(score, scoreRubrics.filter(r => r.dimensionId === dim.id))
  const pct = Math.min(score / 10 * 100, 100)

  const dimRubrics = scoreRubrics.filter(r => r.dimensionId === dim.id)
  const secondLevel = branches.filter(b => b.level === 1)
  const thirdLevel = (parentId: string) => branches.filter(b => b.parentId === parentId)

  const handleGenerateGoal = async () => {
    if (!goalTitle.trim()) return
    setIsGenerating(true)
    try {
      const result = await generateGoal(aiConfig, dim.name, goalTitle)
      setGoalTitle(result.title)
      setGoalDesc(result.description)
      if (result.quantitativeTarget) setGoalTarget(String(result.quantitativeTarget))
      if (result.quantitativeUnit) setGoalUnit(result.quantitativeUnit)
    } finally {
      setIsGenerating(false)
    }
  }

  const handleSaveGoal = async () => {
    if (!goalTitle.trim()) return
    await addGoal({
      title: goalTitle.trim(),
      descriptionText: goalDesc.trim(),
      quantitativeTarget: goalTarget ? parseFloat(goalTarget) : null,
      currentValue: 0,
      unit: goalUnit || null,
      isActive: true,
      dimensionId: dim.id,
    })
    setGoalTitle('')
    setGoalDesc('')
    setGoalTarget('')
    setGoalUnit('')
    setShowAddGoal(false)
  }

  const handleAddBranch = async () => {
    if (!newBranchName.trim()) return
    await addBranch({
      name: newBranchName.trim(),
      level: 1,
      sortOrder: secondLevel.length,
      parentId: null,
      dimensionId: dim.id,
    })
    setNewBranchName('')
    setShowAddBranch(false)
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto p-8 space-y-8">
        {/* 返回 */}
        <button className="btn btn-ghost text-sm" onClick={() => navigate('/dimensions')}>
          ← 返回维度列表
        </button>

        {/* 标题 + 评分 */}
        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-4 h-4 rounded-full" style={{ backgroundColor: dim.colorHex }} />
            <h1 className="text-2xl font-light">{dim.name}</h1>
            <button
              className="btn btn-ghost text-xs py-1 px-2 ml-auto"
              title={dim.isEnabled ? '让这片花瓣先休息，不出现在花园里' : '把这片花瓣请回花园'}
              onClick={() => updateDimension(dim.id, { isEnabled: !dim.isEnabled })}
            >
              {dim.isEnabled ? '让它休息' : '请回花园'}
            </button>
          </div>

          {/* 身份宣言（C2）扉页位：《原子习惯》——每次行动都是给想成为的人投票 */}
          <div className="flex items-center gap-2 mb-4 text-sm" data-testid="identity-declaration">
            <span className="text-[var(--text-muted)] flex-shrink-0">在这片花瓣里，我想成为</span>
            <input
              className="input flex-1 !py-1.5 text-sm"
              style={{ maxWidth: 260 }}
              placeholder="（写不写都可以）"
              value={identityDraft ?? dim.identity}
              onChange={e => setIdentityDraft(e.target.value)}
              onBlur={e => {
                // 直接读 DOM 值，不读 draft state：同一 tick 内「输入+失焦」时
                // blur 回调闭包里的 state 还是旧渲染的值，会漏存
                const v = e.target.value.trim()
                if (v !== dim.identity) updateDimension(dim.id, { identity: v })
                setIdentityDraft(null)
              }}
              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
            />
            <span className="text-[var(--text-muted)] flex-shrink-0">的人</span>
          </div>

          <div className="flex items-end gap-4 mb-4">
            <span className="text-5xl font-light" style={{ color: dim.colorHex }}>
              {score.toFixed(1)}
            </span>
            <span className="text-sm text-[var(--text-secondary)] pb-1">
              {rubric?.label || '——'}
            </span>
          </div>

          {/* 评分条 */}
          <div className="h-2 bg-[var(--bg-hover)] rounded-full mb-4 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${pct}%`, backgroundColor: dim.colorHex }}
            />
          </div>

          {/* 初始分 */}
          <div className="flex items-center gap-4">
            <label className="text-sm text-[var(--text-muted)]">初始分</label>
            <input
              type="range"
              min="0"
              max="10"
              step="0.5"
              value={dim.initialScore}
              onChange={e => updateDimension(dim.id, { initialScore: parseFloat(e.target.value) })}
              className="flex-1"
            />
            <span className="text-sm w-8 text-right">{dim.initialScore.toFixed(1)}</span>
          </div>
        </div>

        {/* 评分标准 */}
        <div className="card">
          <h2 className="text-sm font-medium text-[var(--text-secondary)] mb-4">评分标准</h2>
          <div className="space-y-2">
            {dimRubrics.sort((a, b) => b.score - a.score).map(r => (
              <div
                key={r.id}
                className={`flex items-center gap-3 py-2 px-3 rounded-lg transition-colors ${
                  Math.round(score) === r.score ? 'bg-[var(--accent)]/10 border border-[var(--accent)]/20' : ''
                }`}
              >
                <span
                  className="text-xs font-mono w-6 text-center"
                  style={{ color: Math.round(score) === r.score ? dim.colorHex : 'var(--text-muted)' }}
                >
                  {r.score}
                </span>
                <span className="text-sm font-medium w-16">{r.label}</span>
                <span className="text-xs text-[var(--text-muted)]">{r.descriptionText}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 目标管理 */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-[var(--text-secondary)]">目标</h2>
            <button className="btn btn-ghost text-sm" onClick={() => setShowAddGoal(!showAddGoal)}>
              + 添加目标
            </button>
          </div>

          {showAddGoal && (
            <div className="mb-6 p-4 bg-[var(--bg-secondary)] rounded-lg space-y-3 animate-fade-in">
              <input
                className="input"
                placeholder="目标标题"
                value={goalTitle}
                onChange={e => setGoalTitle(e.target.value)}
              />
              <textarea
                className="input"
                placeholder="详细描述（可选）"
                value={goalDesc}
                onChange={e => setGoalDesc(e.target.value)}
                rows={2}
              />
              <div className="flex gap-2">
                <input
                  className="input flex-1"
                  placeholder="定量目标（如 10）"
                  type="number"
                  value={goalTarget}
                  onChange={e => setGoalTarget(e.target.value)}
                />
                <input
                  className="input w-24"
                  placeholder="单位（如 次）"
                  value={goalUnit}
                  onChange={e => setGoalUnit(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <button className="btn btn-primary text-sm" onClick={handleSaveGoal}>
                  保存
                </button>
                <button
                  className="btn btn-ghost text-sm"
                  onClick={handleGenerateGoal}
                  disabled={isGenerating || !goalTitle.trim()}
                >
                  {isGenerating ? 'AI 生成中...' : '🤖 AI 优化'}
                </button>
                <button className="btn btn-ghost text-sm" onClick={() => setShowAddGoal(false)}>
                  取消
                </button>
              </div>
            </div>
          )}

          {goals.length === 0 && !showAddGoal ? (
            <p className="text-sm text-[var(--text-muted)] text-center py-4">暂无目标</p>
          ) : (
            <div className="space-y-3">
              {goals.map(g => (
                <div key={g.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-[var(--bg-secondary)] group">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{g.title}</span>
                      {!g.isActive && (
                        <span className="text-[10px] text-[var(--text-muted)]">已归档</span>
                      )}
                    </div>
                    {g.descriptionText && (
                      <p className="text-xs text-[var(--text-muted)] mt-0.5">{g.descriptionText}</p>
                    )}
                    {g.quantitativeTarget && (
                      <div className="mt-1">
                        <div className="h-1 bg-[var(--bg-hover)] rounded-full overflow-hidden w-32">
                          <div
                            className="h-full bg-[var(--accent)] rounded-full"
                            style={{ width: `${Math.min(((g.currentValue || 0) / g.quantitativeTarget) * 100, 100)}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-[var(--text-muted)]">
                          {g.currentValue || 0}/{g.quantitativeTarget} {g.unit || ''}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      className="btn btn-ghost text-xs py-1 px-2"
                      onClick={() => updateGoal(g.id, { isActive: !g.isActive })}
                    >
                      {g.isActive ? '归档' : '激活'}
                    </button>
                    <button
                      className="btn btn-ghost text-xs py-1 px-2 text-[var(--danger)]"
                      onClick={() => deleteGoal(g.id)}
                    >
                      删除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 分支树 */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-[var(--text-secondary)]">分支结构</h2>
            <button className="btn btn-ghost text-sm" onClick={() => setShowAddBranch(!showAddBranch)}>
              + 添加分支
            </button>
          </div>

          {showAddBranch && (
            <div className="flex gap-2 mb-4 animate-fade-in">
              <input
                className="input flex-1"
                placeholder="新分支名称"
                value={newBranchName}
                onChange={e => setNewBranchName(e.target.value)}
                autoFocus
              />
              <button className="btn btn-primary text-sm" onClick={handleAddBranch}>添加</button>
              <button className="btn btn-ghost text-sm" onClick={() => setShowAddBranch(false)}>取消</button>
            </div>
          )}

          <div className="space-y-4" data-branch-tree>
            {secondLevel.map(b => (
              <div key={b.id}>
                <div className="flex items-center gap-2 mb-2">
                  {editingBranch === b.id ? (
                    <>
                      <input
                        className="input flex-1 text-sm py-1"
                        value={editBranchName}
                        onChange={e => setEditBranchName(e.target.value)}
                        autoFocus
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            updateBranch(b.id, { name: editBranchName })
                            setEditingBranch(null)
                          }
                        }}
                      />
                      <button
                        className="btn btn-ghost text-xs"
                        onClick={() => {
                          updateBranch(b.id, { name: editBranchName })
                          setEditingBranch(null)
                        }}
                      >
                        保存
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: dim.colorHex }} />
                      <span className="text-sm font-medium">{b.name}</span>
                      <div className="flex gap-1 ml-auto opacity-0 hover:opacity-100">
                        <button
                          className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                          onClick={() => {
                            setEditingBranch(b.id)
                            setEditBranchName(b.name)
                          }}
                        >
                          编辑
                        </button>
                        <button
                          className="text-[10px] text-[var(--danger)]"
                          onClick={() => deleteBranch(b.id)}
                        >
                          删除
                        </button>
                      </div>
                    </>
                  )}
                </div>

                {/* 三度分支 */}
                <div className="ml-6 space-y-1">
                  {thirdLevel(b.id).map(leaf => (
                    <div key={leaf.id} className="flex items-center gap-2 py-1 text-xs text-[var(--text-muted)]">
                      <span className="w-1 h-1 rounded-full bg-[var(--border)]" />
                      {editingBranch === leaf.id ? (
                        <>
                          <input
                            className="input flex-1 text-xs py-0.5"
                            value={editBranchName}
                            onChange={e => setEditBranchName(e.target.value)}
                            autoFocus
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                updateBranch(leaf.id, { name: editBranchName })
                                setEditingBranch(null)
                              }
                            }}
                          />
                          <button
                            className="btn btn-ghost text-[10px]"
                            onClick={() => {
                              updateBranch(leaf.id, { name: editBranchName })
                              setEditingBranch(null)
                            }}
                          >
                            保存
                          </button>
                        </>
                      ) : (
                        <>
                          <span>{leaf.name}</span>
                          <button
                            className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] opacity-0 hover:opacity-100 ml-auto"
                            onClick={() => {
                              setEditingBranch(leaf.id)
                              setEditBranchName(leaf.name)
                            }}
                          >
                            编辑
                          </button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 移除维度（不可逆，保留清晰的警示是对数据负责） */}
        <div className="card">
          <h2 className="text-sm font-medium text-[var(--text-secondary)] mb-2">移除这片花瓣</h2>
          <p className="text-xs text-[var(--text-muted)] mb-3 leading-relaxed">
            将删除「{dim.name}」以及它的全部分支、目标和 {actions.filter(a => a.dimensionId === dim.id).length} 条行动记录，无法恢复。
            如果只是暂时不想看到它，用上面的「让它休息」就够了。
          </p>
          <button
            className="btn text-sm text-[var(--danger)]"
            onClick={async () => {
              const count = actions.filter(a => a.dimensionId === dim.id).length
              if (!confirm(`确定删除「${dim.name}」？它的 ${count} 条行动记录会一起消失。`)) return
              if (!confirm('再确认一次：此操作无法恢复。')) return
              await deleteDimension(dim.id)
              navigate('/dimensions')
            }}
          >
            删除维度
          </button>
        </div>
      </div>
    </div>
  )
}
