import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore, useCompanionDays, useEnabledDimensions } from '../stores/useStore'
import { THEMES } from '../services/theme'
import { isWebBuild } from '../services/storage'
import { AhaShowcase } from '../components/AhaShowcase'
import { DemoGardenSwitch } from '../components/DemoGardenSwitch'
import { ThemeSheet } from '../components/ThemeSheet'
import { seasonAnchor } from '../engine/quarterly'

/**
 * 「设置」—— 三入口之三（v3.7 C 组重构）。
 *
 * ============ 这一页从「什么都摊开」改成「一份清单」============
 * 上一版这一页是七张大卡片摊在一屏里：身份卡 / 花瓣意图（八片 × 三个输入）/
 * Aha 展柜 / 花语入口 / 主题（三张带色板的大卡）/ 氛围（三个开关 + 重看引导）/
 * AI 配置 / 数据管理（含存储真相）/ 关于（定位 + 四条承诺 + 数据路径 + 分寸）。
 * 手机窄屏上要滚七八屏，而其中**每一项都是一年动一两次的东西**。
 *
 * 子曰的五条改造单（C2–C7）方向一致：**主界面简化，点进去看具体的**。照做。
 *
 * ============ 分组头与副文本的写法 ============
 * 四个分组头都是人话：「这座花园」「看起来」「你的数据」「这个软件」——
 * 没有一个是后台词（禁用词表里「管理」「系统」都不许出现在这一页）。
 *
 * 每一行的副文本**一律是清单**（"这里面有什么"），不是介绍。
 * 一个不说明内容的入口，用户只会点一次；而说明了内容，他就知道什么时候该回来。
 *
 * 「备份与导出」不写「数据备份」，因为**「导出」是他真正会用的那个动作**，
 * 而「可带走」是我们写在承诺里的话。
 *
 * ============ 唯一不进子页的是主题（C2）============
 * 它改成**行内上拉菜单**：主题能立刻看见结果、也能立刻改回来，
 * 为它单开一页反而多一次往返。
 *
 * ============ 「这座花园」为什么还是这一页的第一块 ============
 * 书香有一条保留意见（记录在案）：**花瓣是这产品的内容，不是偏好项**，
 * 这一整块该待在「我的花园」底部。骨架在两个位置都成立，
 * 本版按子曰的原话放在设置页（「这座花园默认是现在的卡片，然后点击修改…」）。
 */

/** AI 配置入口开关：AI 能力达标（50 条 eval + ≥90% 准确率 + 建议式交互）前不对用户露出 */
const SHOW_AI_CONFIG = false

export function Settings() {
  const theme = useStore(s => s.theme)
  const companionDays = useCompanionDays()
  const dimensions = useEnabledDimensions()
  const [themeOpen, setThemeOpen] = useState(false)

  const identities = dimensions
    .filter(d => (d.identity || '').trim())
    .map(d => ({ name: d.name, identity: d.identity as string, colorHex: d.colorHex }))
  // ⚠️ 「花园生日」也走全量 + 固化锚点。原来传 enabled ⇒ 休息掉最早那片，
  //   这里显示的生日会**往后跳**，而生日是不该会变的东西
  const allDimensions = useStore(s => s.dimensions)
  const seasonAnchorAt = useStore(s => s.seasonAnchorAt)
  const birthStr = new Date(seasonAnchor(allDimensions, null, seasonAnchorAt || null))
    .toLocaleDateString('zh-CN')
  const themeName = THEMES.find(t => t.id === theme)?.name ?? ''

  const withTarget = dimensions.filter(d => d.targetScore != null).length
  const withPact = dimensions.filter(d => d.pactTiming && d.pactText).length

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="page-pad space-y-4">
        <div>
          <h1 className="text-2xl font-light tracking-wide">设置</h1>
        </div>

        {/* 演示版的出口放第一张卡（A5）：藏起来的出口等于没有 */}
        {isWebBuild() && <DemoGardenSwitch />}

        {/* ===== 这座花园 =====
            子曰要「默认是现在的卡片，然后点击修改 可以新的子页面」。
            所以这里保留卡片形态（陪伴天数 + 花园生日 + 身份宣言），
            只把那八片 × 三个输入搬进子页 */}
        <div className="card space-y-3" data-testid="identity-card">
          <h2 className="text-sm font-medium text-[var(--text-secondary)]">这座花园</h2>
          <div className="flex items-baseline gap-6">
            <div>
              <div className="text-2xl font-light text-[var(--accent)]">{companionDays}</div>
              <div className="text-xs text-[var(--text-muted)] mt-0.5 whitespace-nowrap">陪伴天数</div>
            </div>
            <div className="text-xs text-[var(--text-muted)] leading-relaxed">
              花园生日 {birthStr}
              <br />
              这个数字永不清零 —— 我们庆祝在场，不惩罚缺席
            </div>
          </div>

          {identities.length > 0 && (
            <div className="pt-3 border-t border-[var(--border)] space-y-1" data-testid="identity-lines">
              <p className="text-[11px] text-[var(--text-muted)] tracking-wide">我想成为的样子</p>
              {identities.map(({ name, identity, colorHex }) => (
                <p key={name} className="text-xs text-[var(--text-secondary)] flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: colorHex }} />
                  成为{identity}的人
                  <span className="text-[var(--text-muted)]">· {name}</span>
                </p>
              ))}
            </div>
          )}

          {/* C7 的入口。子曰的原话就是「点击修改」 */}
          <Link
            to="/settings/petals"
            className="settings-row border-b-0 pt-3 border-t border-[var(--border)]"
            data-testid="link-petals"
          >
            <span className="settings-row-main">
              <span className="settings-row-name">花瓣</span>
              <span className="settings-row-sub">
                每片花瓣的现在、想要，和一句约定
                {withTarget > 0 || withPact > 0 ? ` · 已设 ${withTarget} 片想要、${withPact} 句约定` : ''}
              </span>
            </span>
            <span className="settings-row-value">修改</span>
            <span className="settings-row-chev">›</span>
          </Link>
        </div>

        {/* Aha 展柜：只在网页演示版出现。
            正式版里「想看就能看」会毁掉稀有性，而稀有性是这套设计的根基 */}
        {isWebBuild() && <AhaShowcase />}

        {/* ===== 看起来 ===== */}
        <div className="card">
          <p className="settings-group-head">看起来</p>
          <div className="settings-group">
            {/* C2：主题是唯一不进子页的一项 —— 行内上拉菜单 */}
            <button className="settings-row" onClick={() => setThemeOpen(true)} data-testid="row-theme">
              <span className="settings-row-main">
                <span className="settings-row-name">主题</span>
              </span>
              <span className="settings-row-value" data-testid="theme-current">{themeName}</span>
              <span className="settings-row-chev">⌃</span>
            </button>
            {/* C5 */}
            <Link to="/settings/ambience" className="settings-row" data-testid="row-ambience">
              <span className="settings-row-main">
                <span className="settings-row-name">氛围</span>
                <span className="settings-row-sub">动效的快慢、指针与拖尾、深夜静音</span>
              </span>
              <span className="settings-row-chev">›</span>
            </Link>
          </div>
        </div>

        {/* ===== 你的数据 ===== */}
        <div className="card">
          <p className="settings-group-head">你的数据</p>
          <div className="settings-group">
            {/* C3 */}
            <Link to="/settings/backup" className="settings-row" data-testid="row-backup">
              <span className="settings-row-main">
                <span className="settings-row-name">备份与导出</span>
                <span className="settings-row-sub">导出 JSON / CSV、导入、数据存放在哪</span>
              </span>
              <span className="settings-row-chev">›</span>
            </Link>
          </div>
        </div>

        {/* ===== 这个软件 ===== */}
        <div className="card">
          <p className="settings-group-head">这个软件</p>
          <div className="settings-group">
            {/* C4 + C6：花语收进这一页的子页 */}
            <Link to="/settings/about" className="settings-row" data-testid="row-about">
              <span className="settings-row-main">
                <span className="settings-row-name">关于</span>
                <span className="settings-row-sub">它是什么、承诺了什么，以及花语全文</span>
              </span>
              <span className="settings-row-chev">›</span>
            </Link>
            {SHOW_AI_CONFIG && (
              <Link to="/settings/ai" className="settings-row" data-testid="row-ai">
                <span className="settings-row-main">
                  <span className="settings-row-name">AI</span>
                  <span className="settings-row-sub">只有你主动点，才会有一次外发请求</span>
                </span>
                <span className="settings-row-chev">›</span>
              </Link>
            )}
          </div>
        </div>
      </div>

      <ThemeSheet open={themeOpen} onClose={() => setThemeOpen(false)} />
    </div>
  )
}
