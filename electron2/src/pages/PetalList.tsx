import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useStore, useEnabledDimensions } from '../stores/useStore'
import { scoreStage, dimensionStage, dimensionVitality } from '../engine/scoring'
import { SubPageHeader } from '../components/SubPageHeader'

/**
 * 花瓣列表（v3.7 C7 第二层）—— 从设置页「这座花园」那张卡的「修改 ›」进来。
 *
 * ============ 为什么是列表点进第三层，不是手风琴、更不是整页表格 ============
 * 子曰要的是「按照现在的把片花瓣的那个卡片支持每个花瓣单独设置，保存之后返回」。
 * 书香判了形态，理由**不是屏幕大小，是行为**：
 *
 * > 24 个输入框同屏就是一张表，而**人对着表会横向比较** ——
 * > 他会盯着几行数字互相调平。**那正是这产品最不要的动作**（Lisa：「均匀」不是成就）。
 * > 一次只露一片，他只能纵向想「这一片我想给多少」，**找不着平可调**。
 *
 * 手风琴同样坏：展开一片时其余各行仍在视野里，比较照旧发生，
 * 而且「保存」的边界会含糊（改了三片才存一次？）。
 *
 * 列表方案还有一个独家红利：**第三层单片页放得下这片花瓣自己的那段文字**
 * （手册八瓣章那一段 + 引言，正是 C6 拆散后的落点）——
 * **填「想给多少」之前先读到「这片花瓣照看什么」**。手风琴里没有这个位置。
 *
 * ============ 空态：不是文案告诉他先填哪一片，是他自己的记录告诉他 ============
 * 不该让他从一张空列表里自己选。空列表 +「请选择」等于要他当场给人生排优先级，
 * **而排优先级正是这软件要帮他看清的事 —— 现在就问，是在问它本来要回答的问题。**
 * ⇒ 所以按**最近记录最多的那一片**推一片，只推一片，不排榜。
 *
 * 🔴 沉睡的花瓣排最后但**绝不隐藏**（红线 1）。
 */
export function PetalList() {
  const dimensions = useEnabledDimensions()
  const actions = useStore(s => s.actions)

  const rows = useMemo(() => {
    return dimensions
      .map(d => {
        const v = dimensionVitality(d, actions)
        return { dim: d, dormant: v.dormant, recent: v.recentCount }
      })
      .sort((a, b) => (a.dormant === b.dormant ? b.recent - a.recent : a.dormant ? 1 : -1))
  }, [dimensions, actions])

  const withTarget = dimensions.filter(d => d.targetScore != null).length
  /** 推荐先设的那一片：近 7 天记得最多的。没有记录就不推 —— 零催办 */
  const suggested = rows.find(r => r.recent > 0)?.dim ?? null

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="page-pad space-y-4">
        <SubPageHeader
          title="花瓣"
          subtitle="每片花瓣的现在、想要，和一句约定"
          fallback="/settings"
        />

        {withTarget === 0 && (
          <div className="card space-y-2" data-testid="petal-list-empty">
            {suggested ? (
              <>
                <p className="text-sm text-[var(--text-secondary)]">还没有一片花瓣设过想要。</p>
                <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                  不必一次设完 —— 从你最近常记的那片开始就好。
                </p>
                <Link
                  to={`/settings/petals/${suggested.id}`}
                  className="drawer-link mt-1"
                  data-testid="petal-suggested"
                >
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: suggested.colorHex }} />
                    {suggested.name}
                  </span>
                  <span className="drawer-hint">›</span>
                </Link>
              </>
            ) : (
              /* 连记录都还没有（真正的第一天）：不问、不推、不留待办痕迹 */
              <p className="text-sm text-[var(--text-muted)] leading-relaxed">
                花园才刚开。先随手记两三笔，回来时这里就知道该从哪片问起。
              </p>
            )}
          </div>
        )}

        <div className="card settings-group" data-testid="petal-list">
          {rows.map(({ dim, dormant }) => {
            const hasPact = !!(dim.pactTiming && dim.pactText)
            return (
              <Link
                key={dim.id}
                to={`/settings/petals/${dim.id}`}
                className="settings-row"
                data-testid="petal-list-row"
                data-dormant={dormant ? '1' : '0'}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: dim.colorHex, opacity: dormant ? 0.45 : 1 }}
                />
                <span className="settings-row-main">
                  <span className="settings-row-name">{dim.name}</span>
                  <span className="settings-row-sub">
                    {/* 🔴 「现在」与「想要」都只给**状态词**，不给精确分数：
                        一排数字就是一张可调平的表，那正是这一页要避开的东西。
                        两处共用 `scoreStage` 这一套词 —— 自己另发明一套档位词，
                        下次改档位阈值时必然漂移（这一版就差点犯）。 */}
                    现在 {dimensionStage(dim, actions, dim.currentScore)}
                    {dim.targetScore != null ? ` · 想要 ${scoreStage(dim.targetScore)}` : ' · 还没设想要'}
                    {dormant ? ' · 合着' : ''}
                  </span>
                </span>
                {/* 有约定的加一枚小标记。不用数字、不用勾 —— 系统永不裁判约定 */}
                {hasPact && <span className="text-[var(--accent)] text-xs flex-shrink-0" title="有一句约定">·约</span>}
                <span className="settings-row-chev">›</span>
              </Link>
            )
          })}
        </div>

        <p className="text-[11px] text-[var(--text-muted)] leading-relaxed px-1">
          不是每一片都要有想要。留空也是一种回答。
        </p>
      </div>
    </div>
  )
}
