import { useState } from 'react'
import { useFlowerSize, usePairFlowerSize } from '../hooks/useFlowerSize'
import { useStore, useEnabledDimensions, useCompanionDays } from '../stores/useStore'
import { FlowerChart } from './FlowerChart'
import { PetalScoreRow } from './PetalScoreRow'
import { shapeDelta } from '../engine/quarterly'
import { MAX_FOCUS } from '../models/quarterly'
import {
  QUARTERLY_OPENING, QUARTERLY_ACTS, QUARTERLY_CLOSING, ACT2_MAIN_QUESTION,
  UNSELECTED_PROMISE, SECOND_FOCUS_HINT, INTENT_STARTERS, SKIP_ACT_LABEL,
  lastIntentQuestion,
} from '../content/quarterly'

/**
 * 季度校准会谈 · 五幕（v3.2，照 design-focus-quarterly.md §2 开发）
 *
 *   一 回望上季 → 二 逐瓣重新打分 → 三 对照差异 → 四 选下季焦点 → 五 写一句季度意图
 *
 * 三条边界（稿 §5，写死）：
 *   1. 每一幕都可跳过，跳过的幕留空不留罪；全跳过走到尾也算一次完成的会谈。
 *   2. 任何时刻关窗自动落草稿，不弹「确定要放弃吗」式挽留；草稿永不过期、不催办。
 *   3. AI 入口本轮不实现（v3.2 圆桌交锋 2 裁决，设计稿不改，排 v3.3 首位）。
 *
 * 会谈期间整屏接管：仪式需要一个不被待办事项张望的房间（小露）。
 */

export function QuarterlyTalk() {
  // 花形尺寸跟视口挂钩，不写死（v3.6.1：窄屏下 280 的花会贴边）
  const flowerLg = useFlowerSize(280)
  const flowerMd = useFlowerSize(260)
  const flowerSm = useFlowerSize(220)
  const flowerPair = usePairFlowerSize(200)
  const session = useStore(s => s.quarterlySession)
  const dimensions = useEnabledDimensions()
  const actions = useStore(s => s.actions)
  const reviews = useStore(s => s.quarterlyReviews)
  const companionDays = useCompanionDays()
  const saveDraft = useStore(s => s.saveQuarterlyDraft)
  const closeTalk = useStore(s => s.closeQuarterly)
  const complete = useStore(s => s.completeQuarterly)

  const [act, setAct] = useState(() => Math.min(Math.max(session?.actProgress ?? 1, 1), 5))
  const [petalIdx, setPetalIdx] = useState(0)
  const [done, setDone] = useState(false)
  const [intent, setIntent] = useState(session?.intent ?? '')

  if (!session) return null

  const lastCompleted = reviews
    .filter(r => r.completedAt != null && r.id !== session.id)
    .sort((a, b) => (b.completedAt as number) - (a.completedAt as number))[0] ?? null

  const scores = session.scores
  const focusIds = session.focusDimensionIds
  const copy = QUARTERLY_ACTS[act - 1]

  const goto = (next: number) => {
    if (next > 5) return
    setAct(next)
    setPetalIdx(0)
    saveDraft({ actProgress: Math.max(next, session.actProgress) })
  }

  const writeReflection = (value: string) =>
    saveDraft({ reflections: { ...session.reflections, [String(act)]: value } })

  const setScore = (dimId: string, n: number) =>
    saveDraft({ scores: { ...scores, [dimId]: n } })

  const toggleFocus = (dimId: string) => {
    const has = focusIds.includes(dimId)
    const next = has ? focusIds.filter(id => id !== dimId) : [...focusIds, dimId].slice(-MAX_FOCUS)
    saveDraft({ focusDimensionIds: next })
  }

  const finish = async () => {
    await saveDraft({ intent })   // 先把没落焦的那句意图收进来，再封存
    await complete()
    setDone(true)
  }

  // 会谈结束的收尾屏
  if (done) {
    return (
      <Shell testId="quarterly-closing">
        <div className="text-center space-y-6 animate-fade-in">
          <div className="flex justify-center animate-bloom">
            <FlowerChart dimensions={dimensions} actions={actions} size={flowerMd} />
          </div>
          <h2 className="text-2xl font-light tracking-wide">{QUARTERLY_CLOSING.title}</h2>
          <p className="text-xs text-[var(--text-muted)]">{QUARTERLY_CLOSING.note}</p>
          <button className="btn btn-primary" onClick={closeTalk}>回到花园</button>
        </div>
      </Shell>
    )
  }

  return (
    <Shell testId="quarterly-talk">
      {/* 幕头：第几幕 / 时长预期 / 这幕先往后走 */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="text-xs text-[var(--text-muted)] tracking-widest mb-1">
            {QUARTERLY_OPENING.title} · 第 {'一二三四五'[act - 1]} 幕 · {copy.minutes}
          </div>
          <h2 className="text-2xl font-light tracking-wide">{copy.title}</h2>
          <p className="text-sm text-[var(--text-muted)] mt-1">{copy.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn btn-ghost text-xs" data-testid="quarterly-skip-act" onClick={() => goto(act + 1)}>
            {SKIP_ACT_LABEL}
          </button>
          {/* 关窗即存草稿，不挽留 */}
          <button className="btn btn-ghost text-xs" data-testid="quarterly-close" onClick={closeTalk}>
            先停在这里
          </button>
        </div>
      </div>

      {act === 1 && (
        <div className="grid md:grid-cols-2 gap-6" data-testid="quarterly-act-1">
          <div className="space-y-4">
            <div className="card p-5 flex flex-col items-center gap-3">
              <div className="text-xs text-[var(--text-muted)]">上一季的花</div>
              {lastCompleted ? (
                <FlowerChart
                  dimensions={dimensions}
                  actions={actions}
                  size={flowerSm}
                  scoreOverride={lastCompleted.scores}
                  focusPreview={lastCompleted.focusDimensionIds}
                />
              ) : (
                <p className="text-sm text-[var(--text-muted)] py-8 text-center leading-relaxed">
                  这是第一次会谈，还没有上一季。<br />那就从今天这一朵开始记起。
                </p>
              )}
            </div>
            <div className="card p-4 text-sm text-[var(--text-secondary)] leading-relaxed">
              你照顾了这朵花 {companionDays} 天。
              {lastCompleted?.intent && (
                <div className="mt-2 text-[var(--text-muted)]">上一季你写下：「{lastCompleted.intent}」</div>
              )}
            </div>
          </div>
          <div className="space-y-3">
            {copy.questions.map(q => (
              <p key={q} className="text-sm leading-relaxed">{q}</p>
            ))}
            {lastCompleted?.intent && (
              <p className="text-sm leading-relaxed">{lastIntentQuestion(lastCompleted.intent)}</p>
            )}
            <WriteBox
              defaultValue={session.reflections['1'] ?? ''}
              onCommit={writeReflection}
              placeholder="想写就写，不写也没关系"
            />
            <NextButton onClick={() => goto(2)} />
          </div>
        </div>
      )}

      {act === 2 && (() => {
        const dim = dimensions[Math.min(petalIdx, dimensions.length - 1)]
        if (!dim) return null
        const val = scores[dim.id] ?? (Math.round(dim.currentScore) || 3)
        const scored = scores[dim.id] !== undefined
        return (
          <div className="grid md:grid-cols-2 gap-6 items-center" data-testid="quarterly-act-2">
            <div className="flex justify-center">
              <FlowerChart
                dimensions={dimensions}
                actions={actions}
                size={flowerLg}
                spotlightId={dim.id}
                scoreOverride={scores}
              />
            </div>
            <div className="space-y-4">
              <div className="text-xs text-[var(--text-muted)]">
                第 {petalIdx + 1} / {dimensions.length} 片
              </div>
              <p className="text-base leading-relaxed">{ACT2_MAIN_QUESTION}</p>
              <PetalScoreRow
                dimension={dim}
                value={val}
                onChange={n => setScore(dim.id, n)}
                testId="quarterly-score-row"
              />
              {scored && (
                <p className="text-sm text-[var(--text-muted)] leading-relaxed animate-fade-in">
                  {copy.questions[0]}
                </p>
              )}
              <div className="flex items-center justify-between pt-1">
                <button
                  className="btn btn-ghost text-sm"
                  disabled={petalIdx === 0}
                  onClick={() => setPetalIdx(i => Math.max(0, i - 1))}
                >
                  ← 上一片
                </button>
                {petalIdx < dimensions.length - 1 ? (
                  <button
                    className="btn btn-primary"
                    data-testid="quarterly-next-petal"
                    onClick={() => setPetalIdx(i => i + 1)}
                  >
                    下一片 →
                  </button>
                ) : (
                  <NextButton onClick={() => goto(3)} />
                )}
              </div>
            </div>
          </div>
        )
      })()}

      {act === 3 && (
        <div className="space-y-5" data-testid="quarterly-act-3">
          {/* 并排优于叠加：叠加的视觉语义是「偏差」，并排的语义是「两张不同时间的照片」（小露） */}
          <div className="grid grid-cols-2 gap-4 narrow-one-col">
            <div className="card p-4 flex flex-col items-center gap-2">
              <div className="text-xs text-[var(--text-muted)]">上一季</div>
              <FlowerChart
                dimensions={dimensions}
                actions={actions}
                size={flowerPair}
                scoreOverride={lastCompleted?.scores ?? {}}
                focusPreview={lastCompleted?.focusDimensionIds ?? []}
              />
            </div>
            <div className="card p-4 flex flex-col items-center gap-2">
              <div className="text-xs text-[var(--text-muted)]">此刻</div>
              <FlowerChart
                dimensions={dimensions}
                actions={actions}
                size={flowerPair}
                scoreOverride={scores}
                focusPreview={[]}
              />
            </div>
          </div>
          {/* 只用形态词，禁用涨跌语义：没有箭头，没有红绿，没有百分比 */}
          <div className="card p-4 grid grid-cols-2 gap-x-6 gap-y-2 narrow-one-col" data-testid="quarterly-delta-list">
            {dimensions.map(d => {
              const before = lastCompleted?.scores[d.id]
              const after = scores[d.id] ?? d.currentScore
              return (
                <div key={d.id} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.colorHex }} />
                    {d.name}
                  </span>
                  <span className="text-[var(--text-muted)]">{shapeDelta(before, after)}</span>
                </div>
              )
            })}
          </div>
          <div className="space-y-2">
            {copy.questions.map(q => (
              <p key={q} className="text-sm leading-relaxed">{q}</p>
            ))}
          </div>
          <WriteBox
            defaultValue={session.reflections['3'] ?? ''}
            onCommit={writeReflection}
            placeholder="想写就写，不写也没关系"
          />
          <NextButton onClick={() => goto(4)} />
        </div>
      )}

      {act === 4 && (
        <div className="grid md:grid-cols-2 gap-6 items-center" data-testid="quarterly-act-4">
          <div className="flex justify-center">
            {/* 轻点花瓣即预览金边——让用户看见自己的选择长什么样 */}
            <FlowerChart
              dimensions={dimensions}
              actions={actions}
              size={flowerLg}
              focusPreview={focusIds}
              scoreOverride={scores}
            />
          </div>
          <div className="space-y-3">
            <p className="text-base leading-relaxed">{copy.questions[0]}</p>
            <div className="grid grid-cols-2 gap-2 narrow-one-col">
              {dimensions.map(d => {
                const on = focusIds.includes(d.id)
                return (
                  <button
                    key={d.id}
                    data-testid="quarterly-focus-option"
                    data-on={on ? '1' : '0'}
                    className="card px-3 py-2 text-sm flex items-center gap-2 text-left"
                    style={on ? { borderColor: 'var(--accent)' } : undefined}
                    onClick={() => toggleFocus(d.id)}
                  >
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: d.colorHex }} />
                    <span className="flex-1">{d.name}</span>
                    {on && <span className="text-xs text-[var(--accent)]">这一季的光</span>}
                  </button>
                )
              })}
            </div>
            {focusIds.length >= MAX_FOCUS && (
              <p className="text-xs text-[var(--accent)] leading-relaxed">{SECOND_FOCUS_HINT}</p>
            )}
            {focusIds.length > 0 && (
              <>
                <p className="text-sm text-[var(--text-muted)] leading-relaxed">{copy.questions[1]}</p>
                <WriteBox
                  defaultValue={session.reflections['4'] ?? ''}
                  onCommit={writeReflection}
                  placeholder="想写就写，不写也没关系"
                />
              </>
            )}
            {/* 去惩罚化的关键落点：没被选中的花瓣必须被体面对待 */}
            <p className="text-xs text-[var(--text-muted)] leading-relaxed border-l-2 border-[var(--border)] pl-3">
              {UNSELECTED_PROMISE}
            </p>
            <NextButton onClick={() => goto(5)} />
          </div>
        </div>
      )}

      {act === 5 && (
        <div className="max-w-lg mx-auto space-y-4" data-testid="quarterly-act-5">
          {/* 三个可选句式：点一下填入开头，也可以完全自由写。不是 SMART 目标，不是 OKR */}
          <div className="flex flex-wrap gap-2">
            {INTENT_STARTERS.map(s => (
              <button
                key={s}
                className="btn btn-ghost text-xs"
                onClick={() => { setIntent(s); saveDraft({ intent: s }) }}
              >
                {s}…
              </button>
            ))}
          </div>
          <textarea
            className="input w-full"
            rows={3}
            data-testid="quarterly-intent"
            value={intent}
            placeholder="一句话就好；不写也能完成会谈"
            onChange={e => setIntent(e.target.value)}
            onBlur={() => saveDraft({ intent })}
          />
          <div className="flex justify-end">
            <button className="btn btn-primary" data-testid="quarterly-finish" onClick={finish}>
              结束这场会谈
            </button>
          </div>
        </div>
      )}
    </Shell>
  )
}

/** 会谈的花笺容器：全屏居中，四周留白吃掉整个界面 */
function Shell({ children, testId }: { children: React.ReactNode; testId: string }) {
  return (
    <div
      className="fixed inset-0 z-[75] overflow-y-auto quarterly-stage"
      data-testid={testId}
      style={{ background: 'var(--bg-primary)' }}
    >
      {/* v3.6.1：窄屏下不再上下居中（内容一长就把顶部顶出视口），改成顶对齐 + 手机宽列 */}
      <div className="min-h-full flex items-start justify-center quarterly-stage-inner">
        <div className="w-full animate-fade-in">{children}</div>
      </div>
    </div>
  )
}

function NextButton({ onClick }: { onClick: () => void }) {
  return (
    <div className="flex justify-end">
      <button className="btn btn-primary" data-testid="quarterly-next" onClick={onClick}>
        接着走 →
      </button>
    </div>
  )
}

/** 书写区：全部可选。落焦才写库（saveDraft 每次都过 IPC，逐字符写没必要） */
function WriteBox({
  defaultValue, onCommit, placeholder,
}: { defaultValue: string; onCommit: (v: string) => void; placeholder: string }) {
  const [text, setText] = useState(defaultValue)
  return (
    <textarea
      className="input w-full"
      rows={4}
      value={text}
      placeholder={placeholder}
      onChange={e => setText(e.target.value)}
      onBlur={() => onCommit(text)}
    />
  )
}
