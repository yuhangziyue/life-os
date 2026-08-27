import { useState } from 'react'
import { useStore, useEnabledDimensions } from '../stores/useStore'
import { PACT_TIMINGS } from '../models/dimension'
import { dimensionStage, dimensionVitality } from '../engine/scoring'

/**
 * 八片花瓣的「现在 · 想要 · 约定」（v3.6，「我」页核心板块）。
 *
 * 子曰的原话是「设置八个花瓣的现在、目标，以及希望建立一个怎样的计划来提醒你完成某些事」。
 * 第五轮圆桌把后半句整个换掉了，理由与替代方案：
 *
 *   · **不叫「目标」，叫「想要开到哪」**。目标预设了达成/未达成两态，
 *     而且允许留空 —— 「八片都该有目标」正是这产品要反驳的那套叙事。
 *   · **不叫「计划」，也不叫「提醒」，叫「约定」**（小艾）。它是执行意图：
 *     把这件事挂在你本来就会做的事后面，而不是挑一个时刻打断你。
 *     定时提醒挑中的那一刻，往往正是你已经决定今天不做这件事的时刻。
 *   · **系统永不裁判约定**：没有完成态、没有进度、没有「2/4 次」。
 *     它只在你自己走进来时出现（记录面板选中这片花瓣），绝不按时间主动弹出。
 *   · 现在这一栏是**只读**的：分数由记录算出来，不许手改 ——
 *     能手改的账本不是账本（这条是我加的，不在圆桌记录里）。
 */
export function PetalIntentEditor() {
  const dimensions = useEnabledDimensions()
  const actions = useStore(s => s.actions)
  const updateDimension = useStore(s => s.updateDimension)
  const [openId, setOpenId] = useState<string | null>(null)
  /**
   * 草稿态：文本框每敲一个字都落库的话，会连带触发一次全量 loadData（八维度重算 + 写回），
   * 打字会明显卡。所以文本走「本地草稿 + 失焦提交」，滑块与下拉这种离散控件才即时落库。
   */
  const [draft, setDraft] = useState<Record<string, string>>({})
  const draftOf = (id: string, field: 'pactAnchor' | 'pactText', fallback: string) =>
    draft[`${id}:${field}`] ?? fallback
  const setDraftVal = (id: string, field: 'pactAnchor' | 'pactText', v: string) =>
    setDraft(prev => ({ ...prev, [`${id}:${field}`]: v }))
  const commit = (id: string, field: 'pactAnchor' | 'pactText', current: string) => {
    const v = draft[`${id}:${field}`]
    if (v === undefined || v === current) return
    void updateDimension(id, { [field]: v })
  }

  const withPact = dimensions.filter(d => d.pactTiming && d.pactText).length
  const withTarget = dimensions.filter(d => d.targetScore != null).length

  return (
    <div className="card space-y-3" data-testid="petal-intent">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-medium text-[var(--text-secondary)]">八片花瓣</h2>
        <span className="text-[11px] text-[var(--text-muted)]">
          {withTarget === 0 && withPact === 0
            ? '还没有写过想要开到哪'
            : `${withTarget} 片写了想要 · ${withPact} 片有约定`}
        </span>
      </div>

      <div className="space-y-1">
        {dimensions.map(d => {
          const open = openId === d.id
          const v = dimensionVitality(d, actions)
          const anchorVal = draftOf(d.id, 'pactAnchor', d.pactAnchor)
          const textVal = draftOf(d.id, 'pactText', d.pactText)
          const hasPact = !!(d.pactTiming && textVal)
          return (
            <div key={d.id} className="intent-item" data-testid="intent-item" data-dimension={d.name}>
              <button
                className="intent-head"
                onClick={() => setOpenId(open ? null : d.id)}
                aria-expanded={open}
              >
                <span className="dot-sm" style={{ backgroundColor: d.colorHex }} />
                <span className="intent-name">{d.name}</span>
                <span className="intent-now">{dimensionStage(d, actions, d.currentScore)}</span>
                {d.targetScore != null && (
                  <span className="intent-want" data-testid="intent-want">
                    想到 {d.targetScore.toFixed(0)}
                  </span>
                )}
                {hasPact && <span className="intent-pact-dot" title="有一个约定" />}
                <span className="intent-caret">{open ? '收起' : '展开'}</span>
              </button>

              {open && (
                <div className="intent-body">
                  {/* 现在：只读。分数由记录算出来 */}
                  <div className="intent-row">
                    <span className="intent-label">现在</span>
                    <span className="intent-value">
                      {dimensionStage(d, actions, d.currentScore)} · {d.currentScore.toFixed(1)}
                      <span className="intent-sub">
                        {v.dormant ? ` · 合着 ${v.daysSinceLast} 天` : ` · 近 7 天 ${v.recentCount} 次`}
                      </span>
                    </span>
                  </div>

                  {/* 想要开到哪：可留空，可调低 */}
                  <div className="intent-row">
                    <span className="intent-label">想要开到哪</span>
                    <div className="intent-slider">
                      <input
                        type="range"
                        min={1}
                        max={10}
                        step={1}
                        value={d.targetScore ?? Math.ceil(d.currentScore)}
                        data-testid="target-slider"
                        onChange={e => updateDimension(d.id, { targetScore: Number(e.target.value) })}
                      />
                      <span className="intent-slider-num">
                        {d.targetScore != null ? d.targetScore.toFixed(0) : '—'}
                      </span>
                      {d.targetScore != null && (
                        <button
                          className="intent-clear"
                          data-testid="target-clear"
                          onClick={() => updateDimension(d.id, { targetScore: null })}
                        >
                          不写了
                        </button>
                      )}
                    </div>
                  </div>
                  {d.targetScore != null && d.targetScore < d.currentScore && (
                    <p className="intent-hint" data-testid="target-lower">
                      写得比现在低不是认输，是把光让给别处。这也是一次分配。
                    </p>
                  )}

                  {/* 约定：执行意图填空。不给自由文本，因为自由文本一定会写成愿望 */}
                  <div className="intent-row is-col">
                    <span className="intent-label">和这片的约定</span>
                    <div className="pact-form" data-testid="pact-form">
                      <div className="pact-line">
                        <span>每个</span>
                        <select
                          value={d.pactTiming}
                          data-testid="pact-timing"
                          onChange={e => updateDimension(d.id, { pactTiming: e.target.value })}
                        >
                          <option value="">（还没有）</option>
                          {PACT_TIMINGS.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                      <div className="pact-line">
                        <input
                          className="input"
                          placeholder="吃完晚饭 / 关掉电脑 / 孩子睡了"
                          value={draftOf(d.id, 'pactAnchor', d.pactAnchor)}
                          data-testid="pact-anchor"
                          onChange={e => setDraftVal(d.id, 'pactAnchor', e.target.value)}
                          onBlur={() => commit(d.id, 'pactAnchor', d.pactAnchor)}
                        />
                        <span>之后</span>
                      </div>
                      <div className="pact-line">
                        <span>我去</span>
                        <input
                          className="input"
                          placeholder="打电话回家 20 分钟"
                          value={draftOf(d.id, 'pactText', d.pactText)}
                          data-testid="pact-text"
                          onChange={e => setDraftVal(d.id, 'pactText', e.target.value)}
                          onBlur={() => commit(d.id, 'pactText', d.pactText)}
                        />
                      </div>
                      {hasPact ? (
                        <p className="intent-hint" data-testid="pact-preview">
                          每个{d.pactTiming}，{anchorVal || '（还没写锚点）'}之后，我去{textVal}。
                          <br />
                          <span className="intent-sub">
                            它不会主动来找你。你在记一笔时选到这片花瓣，它会自己出现。
                          </span>
                        </p>
                      ) : (
                        <p className="intent-hint">
                          挂在一件你本来就会做的事后面 —— 那件事会替你记得，不需要谁来提醒。
                        </p>
                      )}
                      {hasPact && (
                        <button
                          className="intent-clear"
                          data-testid="pact-clear"
                          onClick={() => {
                            setDraft(prev => ({ ...prev, [`${d.id}:pactAnchor`]: '', [`${d.id}:pactText`]: '' }))
                            void updateDimension(d.id, { pactTiming: '', pactAnchor: '', pactText: '' })
                          }}
                        >
                          撤掉这个约定
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
        写多少片都可以，一片都不写也可以。这里没有完成率，也不会有谁来问你做到了没有。
      </p>
    </div>
  )
}
