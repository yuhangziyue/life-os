import { useMemo, useState } from 'react'
import { useStore, useEnabledDimensions } from '../stores/useStore'
import { generateGardenTasks } from '../content/taskSuggestions'
import { startOfToday } from '../engine/scoring'

/**
 * 今日花园任务（P0-10 今日轻推 + 任务生成）——
 * 打开看板时，基于「进行中的目标 + 沉睡维度 + 轮值」生成 3 条可一键完成的小任务。
 * 语气红线（晓雅）：邀请不催办；整卡可关闭，当日不再出现。
 */

const DISMISS_KEY = 'lifeos:garden-dismissed'
const SHUFFLE_KEY = 'lifeos:garden-shuffle'

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

export function GardenTasks() {
  const dimensions = useEnabledDimensions()
  const branches = useStore(s => s.branches)
  const goals = useStore(s => s.goals)
  const actions = useStore(s => s.actions)
  const addAction = useStore(s => s.addAction)

  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === todayStr())
  const [shuffle, setShuffle] = useState(() => Number(localStorage.getItem(`${SHUFFLE_KEY}:${todayStr()}`) || 0))
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set())
  const [busyId, setBusyId] = useState<string | null>(null)

  const tasks = useMemo(
    () => generateGardenTasks(dimensions, branches, goals, actions, shuffle),
    [dimensions, branches, goals, actions, shuffle]
  )

  if (dismissed || tasks.length === 0) return null

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, todayStr())
    setDismissed(true)
  }

  const handleShuffle = () => {
    const next = shuffle + 1
    localStorage.setItem(`${SHUFFLE_KEY}:${todayStr()}`, String(next))
    setShuffle(next)
    setDoneIds(new Set())
  }

  const handleDone = async (taskId: string) => {
    const task = tasks.find(t => t.id === taskId)
    if (!task || busyId) return
    setBusyId(taskId)
    try {
      await addAction({
        date: startOfToday(),
        descriptionText: task.text,
        impact: 2,
        quality: 'normal',
        isCompleted: true,
        mood: '',
        dimensionId: task.dimensionId,
        branchId: task.branchId,
      })
      setDoneIds(prev => new Set(prev).add(taskId))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="card" data-testid="garden-tasks">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium text-[var(--text-secondary)]">
          来自花园的轻声提醒
        </h2>
        <div className="flex gap-1">
          <button className="btn btn-ghost text-xs py-1 px-2" onClick={handleShuffle} title="换一批">
            换一批
          </button>
          <button className="btn btn-ghost text-xs py-1 px-2" onClick={handleDismiss} title="今天先不看">
            今天先不看
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {tasks.map(task => {
          const done = doneIds.has(task.id)
          return (
            <div
              key={task.id}
              className={`flex items-start gap-3 py-2.5 px-3 rounded-lg bg-[var(--bg-secondary)] transition-opacity ${done ? 'opacity-55' : ''}`}
            >
              <div
                className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5"
                style={{ backgroundColor: task.color }}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-sm ${done ? 'line-through' : ''}`}>{task.text}</span>
                  <span className="text-[11px] flex-shrink-0" style={{ color: task.color }}>
                    {task.dimensionName}
                  </span>
                </div>
                <p className="text-xs text-[var(--text-muted)] mt-0.5 leading-relaxed">{task.why}</p>
              </div>
              {done ? (
                <span className="text-xs text-[var(--success)] flex-shrink-0 mt-1">已完成 ✓</span>
              ) : (
                <button
                  className="btn btn-ghost text-xs py-1 px-2.5 flex-shrink-0"
                  disabled={busyId === task.id}
                  onClick={() => handleDone(task.id)}
                >
                  完成
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
