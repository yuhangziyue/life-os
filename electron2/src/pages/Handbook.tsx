import { useEffect, useState } from 'react'
import { HANDBOOK } from '../content/handbook'
import { logEvent } from '../db'
import { SubPageHeader } from '../components/SubPageHeader'

/**
 * 花语手册（v3.1 B1）——「这座花园是什么」的常驻答案。
 * 手册是产品宣言不是说明书（苏姐 S2）：第一章讲为什么，操作说明在第四章。
 * 内容全部本地（content/handbook.ts），零网络依赖；永不强制阅读。
 */
export function Handbook() {
  const [activeId, setActiveId] = useState(HANDBOOK[0]?.id ?? '')

  useEffect(() => { logEvent('handbook_open') }, [])

  const active = HANDBOOK.find(c => c.id === activeId) ?? HANDBOOK[0]

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="page-pad space-y-4">
        <SubPageHeader title="花语" subtitle="这座花园是什么，以及它对你的承诺" fallback="/me" />

        {/* 章节印章导航。选中态要一眼看得出（子曰 2026-08-18）：
            印章变实心 accent、文字提到主文字色、底色加深并描边、整枚微微抬起 */}
        <div className="flex gap-2 flex-wrap" data-testid="handbook-nav">
          {HANDBOOK.map(c => (
            <button
              key={c.id}
              className={`hb-tab ${c.id === active?.id ? 'is-active' : ''}`}
              onClick={() => setActiveId(c.id)}
            >
              <span className="zen-icon">{c.seal}</span>
              <span className="text-sm">{c.title}</span>
            </button>
          ))}
        </div>

        {/* 正文 */}
        {active && (
          <div className="card space-y-6" data-testid="handbook-chapter">
            <h2 className="text-lg font-light tracking-wide">{active.title}</h2>
            {active.sections.map((sec, i) => (
              <div key={i} className="space-y-2">
                {sec.heading && (
                  <h3 className="text-sm font-medium text-[var(--accent)]">{sec.heading}</h3>
                )}
                {sec.body.map((para, j) => (
                  <p key={j} className="text-sm text-[var(--text-secondary)] leading-loose">
                    {para}
                  </p>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
