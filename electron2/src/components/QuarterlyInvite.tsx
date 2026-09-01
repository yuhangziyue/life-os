import { useStore } from '../stores/useStore'
import { quarterlyState } from '../engine/quarterly'
import { QUARTERLY_INVITE, resumeQuestion } from '../content/quarterly'

/**
 * 季度会谈的到期邀请卡（v3.2，设计稿 §2.1）。
 *
 * 形制复用今日轻推卡：非弹窗、非红点、无角标数字。
 * 红线：**永远不出现「已逾期 N 天」类计数——会谈是赴约，不是欠账。**
 * 推迟一次本周不再出现，下周温和地再来一次；连推两次后整卡收起（转为侧栏一枚静态小花苞）。
 */

export function QuarterlyInvite() {
  // ⚠️ 锚点算的是 min(createdAt)，必须用**全量**维度：
  //   过滤 enabled 会让「让它休息」把第 84 天整体推后（v3.7 修的漂移）
  const dimensions = useStore(s => s.dimensions)
  const seasonAnchorAt = useStore(s => s.seasonAnchorAt)
  const reviews = useStore(s => s.quarterlyReviews)
  const defer = useStore(s => s.quarterlyDefer)
  const start = useStore(s => s.startQuarterly)
  const deferQuarterly = useStore(s => s.deferQuarterly)

  const state = quarterlyState(reviews, dimensions, defer, Date.now(), seasonAnchorAt)

  // 有草稿时优先请人回来接着走（不催办，只是把门留着）
  if (state.draft) {
    return (
      <div className="card p-5 space-y-3" data-testid="quarterly-resume-card">
        <p className="text-sm leading-relaxed">{resumeQuestion(state.draft.actProgress)}</p>
        <div className="flex items-center gap-3">
          <button className="btn btn-primary text-sm" onClick={() => start(true)}>接着走</button>
          <button className="btn btn-ghost text-sm" onClick={() => start(false)}>重新开始</button>
        </div>
      </div>
    )
  }

  if (state.invite !== 'card') return null

  return (
    <div className="card p-5 space-y-3" data-testid="quarterly-invite">
      <div className="text-sm font-medium">{QUARTERLY_INVITE.title}</div>
      <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{QUARTERLY_INVITE.body}</p>
      <div className="flex items-center gap-3">
        <button className="btn btn-primary text-sm" data-testid="quarterly-accept" onClick={() => start(true)}>
          {QUARTERLY_INVITE.accept}
        </button>
        <button className="btn btn-ghost text-sm" data-testid="quarterly-defer" onClick={() => deferQuarterly()}>
          {QUARTERLY_INVITE.defer}
        </button>
      </div>
    </div>
  )
}
