import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useStore, useEnabledDimensions } from '../stores/useStore'
import { PACT_TIMINGS } from '../models/dimension'
import { scoreStage, dimensionStage } from '../engine/scoring'
import { petalNote } from '../content/handbook'
import { SubPageHeader } from '../components/SubPageHeader'

/**
 * 单片花瓣设置（v3.7 C7 第三层）—— 子曰原话「支持每个花瓣单独设置，保存之后返回」。
 *
 * ============ 一页只面对一片，这是整个 C7 的要点 ============
 * 书香判的形态，理由**不是屏幕大小，是行为**：24 个输入框同屏就是一张表，
 * **而人对着表会横向找平** —— 那正是这产品最不要的动作（「均匀」不是成就）。
 * 一次只露一片，他只能纵向想「这一片我想给多少」，**找不着平可调**。
 *
 * ⇒ 所以这一页**刻意不显示任何别的花瓣**，连"其余 7 片的进度"这种脚注也不给。
 *
 * ============ 「这片花瓣照看什么」排在最上面，是这个形态的独家红利 ============
 * **填「想给多少」之前先读到这片花瓣照看什么。** 手风琴形态里没有这个位置。
 * 它同时是 C6「花语拆散」的落点之一 —— 手册八瓣章那一段各归其位，
 * 留在「关于」里那一份只作全文存档。
 *
 * ============ 三个字段的措辞，第五轮圆桌定的（不重开） ============
 *   · **不叫「目标」，叫「想要开到哪」**：目标预设了达成/未达成两态。允许留空 ——
 *     「每一片都该有目标」正是这产品要反驳的那套叙事。
 *   · **不叫「计划」也不叫「提醒」，叫「约定」**（小艾）：它是执行意图 ——
 *     挂在你本来就会做的事后面，而不是挑一个时刻打断你。
 *     **定时提醒挑中的那一刻，往往正是你已经决定今天不做这件事的时刻。**
 *   · **系统永不裁判约定**：没有完成态、没有进度、没有「2/4 次」。
 *   · **「现在」是只读的**：分数由记录算出来，不许手改 —— 能手改的账本不是账本。
 *
 * ============ 保存的边界与「一次只想一片」对齐 ============
 * 每片单独保存、单独返回。原来那个手风琴形态里「保存」的边界是含糊的
 * （改了三片才存一次？），这里没有这个问题。
 * 「这一片先不设」也是一个正当出口 —— **留空是一种回答，不是一次未完成。**
 */
export function PetalEdit() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const dimensions = useEnabledDimensions()
  const actions = useStore(s => s.actions)
  const updateDimension = useStore(s => s.updateDimension)

  const dim = dimensions.find(d => d.id === id)
  /** 这片花瓣在手册第三章里那一段。自种的花瓣取不到，走下面那句兜底 */
  const note = dim ? petalNote(dim.name) : null

  // 草稿态：文本框每敲一个字都落库会连带触发一次全量 loadData（全维度重算 + 写回），
  // 打字明显卡。所以这一页**全部字段走草稿，点「保存并返回」才写一次**。
  const [target, setTarget] = useState<number | null>(null)
  const [timing, setTiming] = useState('')
  const [anchor, setAnchor] = useState('')
  const [text, setText] = useState('')

  useEffect(() => {
    if (!dim) return
    setTarget(dim.targetScore ?? null)
    setTiming(dim.pactTiming || '')
    setAnchor(dim.pactAnchor || '')
    setText(dim.pactText || '')
  }, [dim?.id, dim?.targetScore, dim?.pactTiming, dim?.pactAnchor, dim?.pactText])

  if (!dim) {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="page-pad space-y-4">
          <SubPageHeader title="花瓣" fallback="/settings/petals" />
          <div className="card text-center py-8 text-sm text-[var(--text-muted)]">
            没有找到这片花瓣。它可能已经被请去休息了。
          </div>
        </div>
      </div>
    )
  }

  const handleSave = async () => {
    await updateDimension(dim.id, {
      targetScore: target,
      pactTiming: timing,
      pactAnchor: anchor,
      pactText: text,
    })
    navigate('/settings/petals')
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="page-pad space-y-4">
        <SubPageHeader title={dim.name} fallback="/settings/petals" />

        {/* ① 这片花瓣照看什么。**排在所有输入之前** —— 见文件头部 */}
        <div className="card space-y-2" data-testid="petal-about">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: dim.colorHex }} />
            <h2 className="text-sm font-medium text-[var(--text-secondary)]">这片花瓣照看什么</h2>
          </div>
          {note ? (
            <>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{note.body}</p>
              {note.quote && (
                <p className="text-xs text-[var(--text-muted)] leading-relaxed italic pt-1">{note.quote}</p>
              )}
            </>
          ) : (
            /* 自种花瓣没有内置介绍。**引言位留空** —— 不给它硬配一句名人名言，
               那会一眼看出是模板（书香供稿）。 */
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              这片花瓣是你种下的 —— 它照看什么，你比谁都清楚。
            </p>
          )}
        </div>

        {/* ② 现在。只读 */}
        <div className="card space-y-1" data-testid="petal-now">
          <h2 className="text-sm font-medium text-[var(--text-secondary)]">现在</h2>
          <p className="text-lg font-light text-[var(--accent)]">
            {dimensionStage(dim, actions, dim.currentScore)}
          </p>
          <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
            这一栏由你的记录算出来，改不动 —— 能手改的账本不是账本。
          </p>
        </div>

        {/* ③ 想给多少。允许留空 */}
        <div className="card space-y-3" data-testid="petal-target">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-medium text-[var(--text-secondary)]">想要开到哪</h2>
            <span className="text-xs text-[var(--text-secondary)]">
              {target != null ? scoreStage(target) : '还没设'}
            </span>
          </div>
          <input
            type="range"
            min={1}
            max={10}
            step={1}
            value={target ?? 5}
            className="w-full"
            data-testid="petal-target-range"
            onChange={e => setTarget(Number(e.target.value))}
          />
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-[var(--text-muted)] leading-relaxed pr-3">
              不是每一片都要有想要。留空也是一种回答。
            </p>
            {target != null && (
              <button
                className="btn btn-ghost text-xs flex-shrink-0"
                data-testid="petal-target-clear"
                onClick={() => setTarget(null)}
              >
                清掉
              </button>
            )}
          </div>
        </div>

        {/* ④ 一句约定。执行意图，不是提醒 */}
        <div className="card space-y-3" data-testid="petal-pact">
          <h2 className="text-sm font-medium text-[var(--text-secondary)]">一句约定</h2>
          <div className="flex flex-wrap gap-1.5">
            {PACT_TIMINGS.map(t => (
              <button
                key={t}
                className={`btn text-xs py-1 px-2.5 ${timing === t ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setTiming(timing === t ? '' : t)}
              >
                {t}
              </button>
            ))}
          </div>
          <input
            className="input"
            placeholder="接在什么之后（比如：吃完晚饭）"
            value={anchor}
            onChange={e => setAnchor(e.target.value)}
            data-testid="petal-pact-anchor"
          />
          <input
            className="input"
            placeholder="想对这片花瓣说的一句话，可以不写"
            value={text}
            onChange={e => setText(e.target.value)}
            data-testid="petal-pact-text"
          />
          <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
            它挂在你本来就会做的事后面，不挑时刻打断你。
            没有完成态、没有次数 —— 这一句只在你自己走进来时出现。
          </p>
        </div>

        <div className="flex gap-3">
          <button className="btn btn-primary text-sm flex-1" onClick={handleSave} data-testid="petal-save">
            保存并返回
          </button>
          {/* 「这一片先不设」是正当出口，不是取消 ——
              留空是一种回答，不是一次未完成 */}
          <button
            className="btn btn-ghost text-sm"
            onClick={() => navigate('/settings/petals')}
            data-testid="petal-skip"
          >
            这一片先不设
          </button>
        </div>
      </div>
    </div>
  )
}
