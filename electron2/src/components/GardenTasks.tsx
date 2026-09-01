import { useMemo, useState } from 'react'
import { useStore, useEnabledDimensions } from '../stores/useStore'
import { generateGardenTasks } from '../content/taskSuggestions'

/**
 * 今日花园任务（v3.7 重做交互）——
 * 基于「进行中的目标 + 沉睡维度 + 轮值」生成 3 条提醒。
 * 语气红线（晓雅）：邀请不催办；整卡可关闭，当日不再出现。
 *
 * ============ v3.7 最重要的一处改动：「完成」→「记一笔」 ============
 * 子曰原本要的是「任务完成时弹一个居中的带遮罩的友好弹窗」（A2）。
 * 第六轮四个人全票否决了那个弹窗，但**都指出他的判断是准的**——这一屏确实不友好。
 * 书香给了最锋利的证据：
 *   「**我写不出那个弹窗的关闭按钮文案。**『好』『知道了』是让用户对系统的表扬点头，
 *     『收下』把一次点击当礼物，『完成』重复他刚做过的事。
 *     一个我写不出标签的控件，是这个控件本身错了。」
 *
 * 而真正的病根在别处，是小艾实读代码挖出来的：
 *   任务生成的 ② 分支**专挑沉睡的花瓣**派任务，而旧的「完成」按钮点一下就以
 *   `impact: 2` 落库 ⇒ `daysSinceLast` 归零 ⇒ 那片花瓣**当天脱离沉睡、分数上涨、在花里张开**。
 *   他的原话：**「一次点击，可以把『这片花瓣我三周没管了』这个事实从画面上抹掉。」**
 *   这不是回执够不够响的问题，是**代价本身可以被一键消除**——而「代价可见」是这产品的全部立论。
 *
 * ⇒ 所以按钮改成「记一笔」：**轻推降级为入口，它自己一行代码都不产光。**
 *   点它打开记录面板、预选这片花瓣、预填这句话，**重量与质地由用户定**。
 *   于是：
 *     · 花园不能再替用户给自己的花瓣输光，沉睡只能由他真的做了一件事来解除
 *     · 既然轻推不产出光，就没有任何东西值得庆祝 ⇒ A2 那个弹窗失去动机，争论消解
 *     · 那一笔走的是和「自己记一笔」**完全同一套**回执（光带 240ms 饱和度脉冲 + 角落回响）。
 *       Lisa 立的约束：任务完成与自发记录必须共享同一套回应，一帧都不能多 ——
 *       一旦产品派的活得到的回应更漂亮，用户就学会了等派活。
 *
 * 连带删掉的东西（都是旧「完成」路径的附属品）：
 *   · `doneIds` 那个 `useState` —— 完成态只存在内存里，刷新即丢。
 *     现在没有「完成」这个状态了：记没记，看下面「我今天做的」那张卡，由数据库回答。
 *   · `已完成 ✓` 那个 `var(--success)` 绿色 —— 绿色是判定色（红线 3 不评判）。
 *   · `impact: 2` 这个由产品替用户拍的重量。
 */

const DISMISS_KEY = 'lifeos:garden-dismissed'
const SHUFFLE_KEY = 'lifeos:garden-shuffle'

/**
 * 一天最多换几批。
 *
 * 原来 `handleShuffle` 无上限，而任务生成会排除「今天已照顾过的花瓣」——
 * 于是「换一批」几乎必给新花瓣，配上旧的一键「完成」就是一条刷光的路。
 * 现在轻推已经不产光，这条路本身断了；但上限仍然留着，理由换成了别的：
 * **一直换下去说明这三条都没说到他心里去，那不是应该继续换，是今天不必看。**
 */
const SHUFFLE_MAX = 3

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

export function GardenTasks() {
  const dimensions = useEnabledDimensions()
  const branches = useStore(s => s.branches)
  const goals = useStore(s => s.goals)
  const actions = useStore(s => s.actions)
  const openQuickAddWith = useStore(s => s.openQuickAddWith)

  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === todayStr())
  const [shuffle, setShuffle] = useState(() => Number(localStorage.getItem(`${SHUFFLE_KEY}:${todayStr()}`) || 0))

  const tasks = useMemo(
    () => generateGardenTasks(dimensions, branches, goals, actions, shuffle),
    [dimensions, branches, goals, actions, shuffle]
  )

  if (dismissed || tasks.length === 0) return null

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, todayStr())
    setDismissed(true)
  }

  const canShuffle = shuffle < SHUFFLE_MAX
  const handleShuffle = () => {
    if (!canShuffle) return
    const next = shuffle + 1
    localStorage.setItem(`${SHUFFLE_KEY}:${todayStr()}`, String(next))
    setShuffle(next)
  }

  return (
    <div className="card" data-testid="garden-tasks">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium text-[var(--text-secondary)]">
          来自花园的轻声提醒
        </h2>
        <div className="flex gap-1">
          {/* 换到上限就不再显示这个按钮 —— 一个点了没反应的按钮比没有按钮更差 */}
          {canShuffle && (
            <button
              className="btn btn-ghost text-xs py-1 px-2"
              data-testid="garden-shuffle"
              onClick={handleShuffle}
            >
              换一批
            </button>
          )}
          <button className="btn btn-ghost text-xs py-1 px-2" onClick={handleDismiss}>
            今天先不看
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {tasks.map(task => (
          <div
            key={task.id}
            className="flex items-start gap-3 py-2.5 px-3 rounded-lg bg-[var(--bg-secondary)]"
            data-testid="garden-task-row"
          >
            <div
              className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5"
              style={{ backgroundColor: task.color }}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm">{task.text}</span>
                <span className="text-[11px] flex-shrink-0" style={{ color: task.color }}>
                  {task.dimensionName}
                </span>
              </div>
              <p className="text-xs text-[var(--text-muted)] mt-0.5 leading-relaxed">{task.why}</p>
            </div>
            <button
              className="btn btn-ghost text-xs py-1 px-2.5 flex-shrink-0"
              data-testid="garden-task-record"
              onClick={() => openQuickAddWith(task.dimensionId, task.text)}
            >
              记一笔
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
