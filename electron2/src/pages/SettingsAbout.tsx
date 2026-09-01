import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  POSITIONING, APP_VERSION, ABOUT_PROMISES, ABOUT_PROMISES_WEB, ABOUT_DISCLAIMER, CLAIM,
} from '../content/about'
import { isWebBuild } from '../services/storage'
import { SubPageHeader } from '../components/SubPageHeader'

/**
 * 关于（v3.7 C4 + C6）—— 子曰原话「关于也是变为一个 listitem 然后点击打开新页面查看介绍」
 * 「花语的部分放到关于的子页面里」。
 *
 * ============ 章节顺序不是排版问题，是信任问题 ============
 * `about.ts` 顶上那行注释是书香自己写的：**「陌生人装完第一个疑虑是『我的数据去哪了』，
 * 这一屏就是答案」**。所以承诺必须在前，花语必须在后。
 *
 * ============ 花语在这一页只占一行入口，不铺开 ============
 * 花语是五章长文。同页铺开的话两头都伤：
 *   · 放在承诺前面 ⇒ 让一个正担心隐私的人先读散文
 *   · 放在承诺后面 ⇒ 整页变成长文的附录，承诺被顶成了序言
 * 所以只给一行入口，进第三层。
 *
 * ⚠️ 这等于把花语放到了三层深，**正是书香第一轮反对的位置**。她第四轮自己改了口，
 * 用的是她自己那条判据反过来打自己：**前提变了**——手册五章已按拆散方案各归其位
 * （八瓣章进花瓣页、花的语言进花下图例、节奏进复盘引言与会谈邀请卡），
 * **留在「关于」里那一份是全文存档，不是入园读物。存档放三层深是对的。**
 *
 * ============ 这里是 CLAIM 唯一合法的界面落点 ============
 * Lisa 给那句主张画了围栏：它只能出现在**介绍这个产品是什么**的位置，
 * **不得出现在任何以用户当前花园为语境的界面里** —— 一进那种语境，修辞就变成数据。
 * 「关于」页顶部正是前者，所以这一句在这里出现是对的，而且是全产品仅此一处。
 */
export function SettingsAbout() {
  const [dbPath, setDbPath] = useState('')
  useEffect(() => {
    window.electronAPI?.appDbPath?.().then(setDbPath).catch(() => setDbPath(''))
  }, [])

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="page-pad space-y-4">
        <SubPageHeader title="关于" fallback="/settings" />

        {/* ① 那句主张 + 定位三句。一行三句，不分段占屏 */}
        <div className="card space-y-3" data-testid="about-claim">
          <p className="text-sm leading-relaxed text-[var(--text-secondary)]">{CLAIM}</p>
          <div className="text-sm leading-relaxed space-y-0.5 pt-2 border-t border-[var(--border)]">
            {POSITIONING.map(line => (
              <p key={line}>{line}</p>
            ))}
          </div>
        </div>

        {/* ② 我们守住的边界。这一段是这一页存在的理由，所以排在花语之前 */}
        <div className="card space-y-2" data-testid="about-promises">
          <h2 className="text-sm font-medium text-[var(--text-secondary)]">我们守住的边界</h2>
          <div className="space-y-1">
            {(isWebBuild() ? ABOUT_PROMISES_WEB : ABOUT_PROMISES).map(p => (
              <p key={p} className="text-xs text-[var(--text-muted)] leading-relaxed">· {p}</p>
            ))}
          </div>
          <div className="text-xs text-[var(--text-muted)] leading-relaxed pt-2 border-t border-[var(--border)]">
            <span>{isWebBuild() ? '数据存放：' : '数据文件：'}</span>
            <code className="break-all opacity-80" data-testid="about-db-path">{dbPath || '读取中…'}</code>
          </div>
        </div>

        {/* ③ 那句分寸：不承诺疗效 */}
        <div className="card">
          <p className="text-xs text-[var(--text-muted)] leading-relaxed border-l-2 border-[var(--border)] pl-3">
            {ABOUT_DISCLAIMER}
          </p>
        </div>

        {/* ④ 花语：一行入口，进第三层。C6 落地 */}
        <Link to="/handbook" className="drawer-link" data-testid="link-handbook">
          <span>花语 · 全文</span>
          <span className="drawer-hint">五章 · 这朵花是什么、它的语言、它的边界 ›</span>
        </Link>

        {/* ⑤ 版本号：页脚，最小字号 */}
        <p className="text-[11px] text-[var(--text-muted)] text-center pt-2">
          生命之花 · Life-OS {APP_VERSION}
        </p>
      </div>
    </div>
  )
}
