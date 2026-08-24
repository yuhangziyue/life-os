import { NavLink } from 'react-router-dom'
import { useStore, useCompanionDays, useEnabledDimensions } from '../stores/useStore'
import { quarterlyState } from '../engine/quarterly'
import { FlowerLogo } from './FlowerLogo'

/**
 * 侧边栏 · 禅意版——
 * 花瓣 Logo 落座左上角；图标是单字小印（宋体）；菜单字号 20；
 * 无分隔硬边框，与主面板同一片底色自然过渡；底部每天换一句禅语。
 */
const navItems = [
  { to: '/', icon: '今', label: '每日看板' },
  { to: '/dimensions', icon: '花', label: '维度管理' },
  { to: '/actions', icon: '行', label: '行动记录' },
  { to: '/stats', icon: '观', label: '统计分析' },
  { to: '/review', icon: '省', label: '回顾反思' },
  { to: '/handbook', icon: '语', label: '花语手册' },
  { to: '/settings', icon: '调', label: '设置' },
]

// 每日一句，按日期轮换。都是「等花开」的语气，没有一句是催促。
const ZEN_LINES = [
  '花开有时，不必催促',
  '一日一事，如浇一瓢水',
  '心安之处，皆是花园',
  '慢慢来，比较快',
  '草木不言，自有枯荣',
  '今日事，今日毕，亦可明日',
  '守一朵花开，胜过万事忙',
]

function todayZenLine(): string {
  const dayIndex = Math.floor(Date.now() / (24 * 60 * 60 * 1000))
  return ZEN_LINES[dayIndex % ZEN_LINES.length]
}

export function Sidebar() {
  const collapsed = useStore(s => s.sidebarCollapsed)
  const toggleSidebar = useStore(s => s.toggleSidebar)
  // 陪伴天数（C3）：不是 streak，永不清零——我们庆祝在场，不惩罚缺席
  const companionDays = useCompanionDays()

  const dimensions = useEnabledDimensions()
  const quarterlyReviews = useStore(s => s.quarterlyReviews)
  const quarterlyDefer = useStore(s => s.quarterlyDefer)
  const bud = quarterlyState(quarterlyReviews, dimensions, quarterlyDefer).invite === 'bud'

  return (
    <aside
      className={`zen-aside flex flex-col transition-all duration-200 ${
        collapsed ? 'w-16' : 'w-56'
      }`}
    >
      {/* 侧栏自己的拖拽带：吃侧栏那套渐变/深木色，红绿灯浮在它上面。
          与 App 里 main 的 <header> 成对出现——顶部两段各自同色，中间没有缝。 */}
      <div className="zen-drag-strip" style={{ height: 30, WebkitAppRegion: 'drag' } as React.CSSProperties} />

      {/* Logo */}
      <div className="h-14 flex items-center px-4">
        <button
          className="flex items-center gap-2.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          onClick={toggleSidebar}
          title={collapsed ? '展开侧边栏' : '收起侧边栏'}
        >
          <FlowerLogo size={24} />
          {!collapsed && <span className="text-[17px] zen-logo">生命之花</span>}
        </button>
      </div>

      {/* 导航 */}
      <nav className="zen-nav flex-1 py-4 px-2 space-y-1.5">
        {navItems.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
                isActive
                  ? 'zen-active bg-[var(--accent)]/10 text-[var(--accent)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
              }`
            }
          >
            <span className="zen-icon">{item.icon}</span>
            {!collapsed && <span className="zen-nav-label">{item.label}</span>}
            {/* 连续推迟两次后，季度会谈的邀请卡收起，只在入口上留一枚静态小花苞。
                静态、不闪烁、不带数字——它是一句「我还在这儿」，不是一条未读提醒。 */}
            {item.to === '/stats' && bud && (
              <span
                data-testid="quarterly-bud"
                title="有一场季度会谈在等你"
                className="ml-auto text-[10px] opacity-70"
              >
                🌷
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* 底部：每日禅语 + 陪伴天数 + 版本 */}
      {!collapsed && (
        <div className="p-4 space-y-2">
          <p className="text-[12px] text-[var(--text-muted)] zen-line">{todayZenLine()}</p>
          <p className="text-[11px] text-[var(--text-muted)] opacity-80" data-testid="companion-days">
            这朵花陪了你 {companionDays} 天
          </p>
          <p className="text-[10px] text-[var(--text-muted)] opacity-60">Life-OS v3.2</p>
        </div>
      )}
    </aside>
  )
}
