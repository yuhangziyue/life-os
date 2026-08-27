import { NavLink } from 'react-router-dom'
import { useStore, useEnabledDimensions } from '../stores/useStore'
import { quarterlyState } from '../engine/quarterly'

/**
 * 底部三入口 + 记一笔（v3.5 M1，窄屏形态）。
 *
 * 与侧栏是同一套 IA 的两种呈现，不是两套导航：窄屏出底栏、宽屏出侧栏，
 * 路由与顺序完全一致。**不为移动端 fork 代码**——与网页版走 shim 不 fork 同一条原则。
 *
 * 设计口径（v3.5 设计稿第四节）：
 *   · 图标沿用禅意菜单的单字小印，不引线性图标库
 *   · 记一笔是 FAB 不占 tab 位 —— 记录是唯一的高频动作，不该藏在任何一栏里
 *   · 不做左右滑切 tab：与花瓣点击、光带触摸冲突，三个 tab 不值得付这个冲突成本
 *   · 底栏留 env(safe-area-inset-bottom)，iPhone 小横条不压住第三个入口
 */
const TABS = [
  { to: '/', icon: '花', label: '花' },
  { to: '/today', icon: '今', label: '今天' },
  { to: '/me', icon: '我', label: '我' },
]

export function TabBar() {
  const setQuickAddOpen = useStore(s => s.setQuickAddOpen)
  const dimensions = useEnabledDimensions()
  const quarterlyReviews = useStore(s => s.quarterlyReviews)
  const quarterlyDefer = useStore(s => s.quarterlyDefer)
  const bud = quarterlyState(quarterlyReviews, dimensions, quarterlyDefer).invite === 'bud'

  return (
    <>
      <button
        className="mobile-fab"
        data-testid="mobile-fab"
        onClick={() => setQuickAddOpen(true)}
        aria-label="记一笔"
      >
        记<br />一笔
      </button>

      <nav className="mobile-tabbar" data-testid="mobile-tabbar">
        {TABS.map(t => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.to === '/'}
            className={({ isActive }) => `mobile-tab${isActive ? ' is-on' : ''}`}
            data-tab={t.label}
          >
            <span className="mobile-tab-seal">{t.icon}</span>
            <span className="mobile-tab-label">{t.label}</span>
            {t.to === '/' && bud && <span className="mobile-tab-bud" title="有一场季度会谈在等你">🌷</span>}
          </NavLink>
        ))}
      </nav>
    </>
  )
}
