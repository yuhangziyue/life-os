import { useEffect, useRef, useState } from 'react'
import { HANDBOOK } from '../content/handbook'
import { logEvent } from '../db'
import { SubPageHeader } from '../components/SubPageHeader'

/**
 * 花语手册（v3.1 B1，v3.7 改版为「书架 + 翻章」）——「这座花园是什么」的常驻答案。
 * 手册是产品宣言不是说明书（苏姐 S2）：第一章讲为什么，操作说明在第四章。
 * 内容全部本地（content/handbook.ts），零网络依赖；永不强制阅读。
 *
 * ============ v3.7 为什么重做这一屏的导航 ============
 * 原来是五枚横排的印章标签（`flex flex-wrap`）。子曰实拍指出它丑，问题是具体的：
 *   五枚标签在 390px 上**折成两到三行，且每行数量不等**（3 + 2 或 2 + 2 + 1），
 *   于是它既不像一排 tab，也不像一个列表 —— **一个折行不规律的横排是没有形状的**。
 *   更根本的一层：`flex-wrap` 的折行位置由文字长度决定，
 *   而章节标题长度不齐（「序」两字 vs 「边界与承诺」五字），所以每次都折得不一样。
 *
 * 改成**书脊排一行**（子曰给的两个方向里选了「书的章节」）：
 *   · 五道竖排书脊等宽平铺，**永不折行** —— 横向排布的形状由容器决定，不由文字长度决定
 *   · 选中那一道**被抽出来一点**（往上位移 + 描边 + 印章翻实心），
 *     这是书架上取书的真实动作，不需要额外的选中态说明
 *   · 正文页左侧留一道装订边，配合书脊构成「翻开的书」这个整体
 *   · 底部给「上一章 / 下一章」—— **这是书给的东西，标签给不了**：
 *     标签让你跳，书让你读下去。这一屏是宣言，读下去比跳着挑更对。
 *
 * 🔴 刻意不做的两件事：
 *   · **不做阅读进度**（「3/5 章」「已读完」）—— 那是完成率，而手册永不强制阅读
 *   · **不记住上次读到哪** —— 这一屏每次都从第一章开始。
 *     第一章讲的是「这座花园为什么存在」，那句话每次重读都成立；
 *     而一个记住进度的宣言，读起来就像一门待完成的课程。
 */
export function Handbook() {
  const [idx, setIdx] = useState(0)
  const pageRef = useRef<HTMLDivElement>(null)

  useEffect(() => { logEvent('handbook_open') }, [])

  const active = HANDBOOK[idx] ?? HANDBOOK[0]

  /** 翻章之后把正文顶端带回视野 —— 否则从长章跳到短章会停在页面中段，看着像没反应 */
  const go = (next: number) => {
    if (next < 0 || next >= HANDBOOK.length) return
    setIdx(next)
    requestAnimationFrame(() => {
      pageRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    })
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="page-pad space-y-4">
        {/* v3.7 C6：花语搬进了「关于」的子页，所以退路是那一页而不是设置页顶层 */}
        <SubPageHeader title="花语" subtitle="这座花园是什么，以及它对你的承诺" fallback="/settings/about" />

        {/* 书架：五道竖排书脊等宽平铺，永不折行 */}
        <div className="hb-shelf" data-testid="handbook-nav">
          {HANDBOOK.map((c, i) => (
            <button
              key={c.id}
              className={`hb-spine${i === idx ? ' is-active' : ''}`}
              onClick={() => go(i)}
              aria-current={i === idx ? 'true' : undefined}
              data-testid="handbook-spine"
              data-chapter={c.id}
            >
              <span className="hb-spine-seal">{c.seal}</span>
              <span className="hb-spine-title">{c.title}</span>
            </button>
          ))}
        </div>

        {/* 正文页：左侧一道装订边，与书脊构成「翻开的书」 */}
        {active && (
          <div className="hb-page" ref={pageRef} data-testid="handbook-chapter" data-chapter={active.id}>
            <h2 className="hb-page-title">{active.title}</h2>
            {active.sections.map((sec, i) => (
              <section key={i} className="space-y-2">
                {sec.heading && <h3 className="hb-heading">{sec.heading}</h3>}
                {sec.body.map((para, j) => (
                  <p
                    key={j}
                    /* 引文（以「——」起头）排成一格气口：缩进 + 斜体 + 弱一档。
                       它们在原文里就是气口，排版上不区分等于把气口读成了正文 */
                    className={para.startsWith('——') ? 'hb-quote' : 'hb-para'}
                  >
                    {para}
                  </p>
                ))}
              </section>
            ))}

            {/* 翻章。这是书给的东西，标签给不了 —— 标签让你跳，书让你读下去 */}
            <nav className="hb-turn">
              <button
                className="hb-turn-btn"
                onClick={() => go(idx - 1)}
                disabled={idx === 0}
                data-testid="handbook-prev"
              >
                {idx > 0 ? `‹ ${HANDBOOK[idx - 1].title}` : '‹ 已是第一章'}
              </button>
              <button
                className="hb-turn-btn is-next"
                onClick={() => go(idx + 1)}
                disabled={idx >= HANDBOOK.length - 1}
                data-testid="handbook-next"
              >
                {idx < HANDBOOK.length - 1 ? `${HANDBOOK[idx + 1].title} ›` : '读完了 ·'}
              </button>
            </nav>
          </div>
        )}
      </div>
    </div>
  )
}
