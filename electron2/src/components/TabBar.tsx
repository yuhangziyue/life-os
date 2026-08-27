import { NavLink } from 'react-router-dom'
import { useStore, useEnabledDimensions } from '../stores/useStore'
import { quarterlyState } from '../engine/quarterly'

/**
 * 底部三入口 + 记一笔（v3.5 M1，窄屏形态）。
 *
 * v3.5.1 起这是**唯一的导航**：侧栏已删，宽屏只是把内容收进一条居中的手机宽列。
 * 两套形态要养两套设计决策，而这产品的主战场（小红书导流 + 添加到主屏）是手机。
 *
 * 设计口径（v3.5 设计稿第四节）：
 *   · 图标沿用禅意菜单的单字小印，不引线性图标库
 *   · v3.5.1：全宽度生效（手机端是唯一形态），侧栏已删
 *   · 记一笔是 FAB 不占 tab 位 —— 记录是唯一的高频动作，不该藏在任何一栏里
 *   · 不做左右滑切 tab：与花瓣点击、光带触摸冲突，三个 tab 不值得付这个冲突成本
 *   · 底栏留 env(safe-area-inset-bottom)，iPhone 小横条不压住第三个入口
 */
const TABS = [
  { to: '/', icon: '今', label: '今天' },
  { to: '/garden', icon: '花', label: '我的花园' },
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
            {/* 连续推迟两次后邀请卡收起，只在「我的花园」入口上留一枚静态小花苞。
                静态、不闪烁、不带数字 —— 它是一句「我还在这儿」，不是一条未读提醒。 */}
            {t.to === '/garden' && bud && (
              <span className="mobile-tab-bud" data-testid="quarterly-bud" title="有一场季度会谈在等你">🌷</span>
            )}
          </NavLink>
        ))}
      </nav>
    </>
  )
}
