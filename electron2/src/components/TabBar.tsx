import type { ReactElement } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useStore } from '../stores/useStore'
import { quarterlyState } from '../engine/quarterly'

/**
 * 底部三入口 + 记（v3.7）。
 *
 * 三处与上一版不同：
 *   1. **图标改成 SVG**（原来是单字印章）。三个图案靠剪影分辨，不靠细节：
 *      今天 = 尖头水滴 / 我的花园 = 五片宽瓣的圆 / 设置 = 六根细刺的圆
 *   2. **二级页要高亮它所属的那个 tab**。NavLink 自带的 isActive 只认精确路由，
 *      而「全部记录」「我的复盘」「花园印象」「关于」这些都是二级页 ——
 *      进去之后底栏一片灰，用户会以为自己掉出了导航。所以自己做分组匹配。
 *   3. FAB 文案「记一笔」→「记」。一个字，圆里放得开，也不必再折行。
 */

/** 二级页归属哪个 tab。前缀匹配，越长的规则写在前面 */
const TAB_GROUPS: { to: string; label: string; owns: string[] }[] = [
  { to: '/', label: '今天', owns: ['/history', '/actions'] },
  {
    to: '/garden',
    label: '我的花园',
    // /review 的三层（hub / 当期 / 历史）靠前缀匹配一并覆盖，不必逐条列
    owns: ['/garden', '/stats', '/review', '/dimensions'],
  },
  // /handbook 必须挂上 —— 小露实读路由表发现它此前不属于任何分组，
  // 进花语页底栏整片变灰，用户会以为自己掉出了导航。C6 把它搬进「关于」之后更要挂。
  // v3.7 C 组新增的五个子页（/settings/ambience|backup|about|petals|petals/:id）
  // 同样靠 '/settings' 前缀覆盖 —— 这就是当初把匹配写成前缀而不是白名单的原因
  { to: '/me', label: '设置', owns: ['/me', '/settings', '/handbook'] },
]

/**
 * 三个图标（小露第六轮定稿）。
 *
 * 🔴 通则：**全部纯描边，`fill="none"`，stroke-width 1.6，圆头圆角，20×20 渲染。
 *   唯一允许的填充是实心；半透明填充一律非法。**
 *   实证理由：底栏选中态是 `background: --accent` + 白色 currentColor，
 *   而**半透明白落在珊瑚红上等于没有**，0.55 的高光点还会读成一个洞。
 *   这跟白底那条「线可见，团不可见」是同一条原理。
 *
 * 🔴 三个图标靠**剪影**区分，不靠细节（20px 下细节全糊）：
 *   尖头水滴 / 五片宽瓣的圆 / 六根细刺的圆。
 */
const SVG = {
  width: 20, height: 20, viewBox: '0 0 24 24',
  fill: 'none' as const, stroke: 'currentColor',
  strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
}

function DewIcon() {
  return (
    <svg {...SVG} aria-hidden="true">
      {/* 一滴露水。内部高光圆已删 —— 它在翻白态下会变成一个洞 */}
      <path d="M12 4.2C12 4.2 6.6 10.3 6.6 13.9A5.4 5.4 0 0 0 17.4 13.9C17.4 10.3 12 4.2 12 4.2Z" />
    </svg>
  )
}

function FlowerIcon() {
  return (
    <svg {...SVG} aria-hidden="true">
      {/* 五瓣而不是四瓣：四瓣在 20px 下中心交叠成一团八条线的结，翻白后更糊。
          五瓣内缘留出约 1.5px 空隙 */}
      {[-90, -18, 54, 126, 198].map(deg => {
        const rad = (deg * Math.PI) / 180
        return (
          <ellipse
            key={deg}
            cx={12 + 5.4 * Math.cos(rad)}
            cy={12 + 5.4 * Math.sin(rad)}
            rx={2.4}
            ry={3.9}
            transform={`rotate(${deg + 90} ${12 + 5.4 * Math.cos(rad)} ${12 + 5.4 * Math.sin(rad)})`}
          />
        )
      })}
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  )
}

function GearFlowerIcon() {
  return (
    <svg {...SVG} aria-hidden="true">
      {/* 齿改成六根径向短辐，不用圆瓣 —— 圆瓣齿轮与五瓣花在 20px 下轮廓几乎一样 */}
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3.2" />
      {[0, 60, 120, 180, 240, 300].map(deg => {
        const rad = (deg * Math.PI) / 180
        return (
          <line
            key={deg}
            x1={12 + 8 * Math.cos(rad)} y1={12 + 8 * Math.sin(rad)}
            x2={12 + 10.4 * Math.cos(rad)} y2={12 + 10.4 * Math.sin(rad)}
          />
        )
      })}
    </svg>
  )
}

const ICONS: Record<string, () => ReactElement> = {
  '/': DewIcon,
  '/garden': FlowerIcon,
  '/me': GearFlowerIcon,
}

export function TabBar() {
  const setQuickAddOpen = useStore(s => s.setQuickAddOpen)
  // ⚠️ 这里必须是**全量** dimensions，不是 useEnabledDimensions()：
  //   锚点 = min(createdAt)，过滤掉「让它休息」的那片会把第 84 天整体推后（v3.7 修）
  const dimensions = useStore(s => s.dimensions)
  const quarterlyReviews = useStore(s => s.quarterlyReviews)
  const quarterlyDefer = useStore(s => s.quarterlyDefer)
  const seasonAnchorAt = useStore(s => s.seasonAnchorAt)
  const bud = quarterlyState(quarterlyReviews, dimensions, quarterlyDefer, Date.now(), seasonAnchorAt)
    .invite === 'bud'
  const { pathname } = useLocation()

  /** 当前路径归属哪个 tab。'/' 只在精确匹配或它自己的二级页下才算 */
  const activeTo = (() => {
    for (const g of TAB_GROUPS) {
      if (g.to !== '/' && g.owns.some(p => pathname === p || pathname.startsWith(p + '/'))) return g.to
    }
    const todayGroup = TAB_GROUPS[0]
    if (pathname === '/' || todayGroup.owns.some(p => pathname === p || pathname.startsWith(p + '/'))) return '/'
    return ''
  })()

  return (
    <>
      <button
        className="mobile-fab"
        data-testid="mobile-fab"
        onClick={() => setQuickAddOpen(true)}
        aria-label="记一笔"
      >
        记
      </button>

      <nav className="mobile-tabbar" data-testid="mobile-tabbar">
        {TAB_GROUPS.map(t => {
          const Icon = ICONS[t.to]
          const on = activeTo === t.to
          return (
            <NavLink
              key={t.to}
              to={t.to}
              className={`mobile-tab${on ? ' is-on' : ''}`}
              data-tab={t.label}
              data-active={on ? '1' : '0'}
            >
              <span className="mobile-tab-seal"><Icon /></span>
              <span className="mobile-tab-label">{t.label}</span>
              {/* 连续推迟两次后邀请卡收起，只在「我的花园」入口上留一枚静态小花苞。
                  静态、不闪烁、不带数字 —— 它是一句「我还在这儿」，不是一条未读提醒。 */}
              {t.to === '/garden' && bud && (
                <span className="mobile-tab-bud" data-testid="quarterly-bud" title="有一场季度会谈在等你">🌷</span>
              )}
            </NavLink>
          )
        })}
      </nav>
    </>
  )
}
