import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore, useCompanionDays, useEnabledDimensions } from '../stores/useStore'
import { downloadJSON, downloadCSV, pickAndImportJSON } from '../db/fileTransfer'
import { THEMES } from '../services/theme'
import { POSITIONING, APP_VERSION, ABOUT_PROMISES, ABOUT_PROMISES_WEB, ABOUT_DISCLAIMER } from '../content/about'
import { isWebBuild, webStorageStatus, storagePromiseLines } from '../services/storage'
import { PetalIntentEditor } from '../components/PetalIntentEditor'
import { AhaShowcase } from '../components/AhaShowcase'
import { gardenBirth } from '../engine/quarterly'

/** AI 配置入口开关：AI 能力达标（50 条 eval + ≥90% 准确率 + 建议式交互）前不对用户露出 */
const SHOW_AI_CONFIG = false

/**
 * 「我」—— 三入口之三（v3.5 M4）。
 *
 * 路由上仍是 /settings（也接 /me）—— 页面没有被替换，是被**重新分层**了：
 *   我是谁（陪伴天数 / 花园生日 / 八瓣身份宣言）
 *   → 偏好与设置（主题 / 氛围 / 重看引导）
 *   → 我的数据（导出 / 导入 / 🔴 存储真相 / 清除）
 *   → 关于（定位 / 承诺 / 不承诺疗效）
 *
 * 🔴 存储真相那一段是硬要求（v3.4 A3）：界面简化不能把「数据会丢」一起简化掉。
 * 网页版与桌面版的承诺**分开写** —— 桌面版说 sqlite 文件路径，网页版必须说清
 * 「浏览器清缓存会一并清掉」，否则就是照抄一句做不到的话。
 */
export function Settings() {
  const theme = useStore(s => s.theme)
  const setTheme = useStore(s => s.setTheme)
  const ambience = useStore(s => s.ambience)
  const setAmbience = useStore(s => s.setAmbience)
  const setOnboardingOpen = useStore(s => s.setOnboardingOpen)
  const aiConfig = useStore(s => s.aiConfig)
  const aiTestResult = useStore(s => s.aiTestResult)
  const isTestingAI = useStore(s => s.isTestingAI)
  const setAIConfig = useStore(s => s.setAIConfig)
  const saveAIConfig = useStore(s => s.saveAIConfig)
  const testAIConnection = useStore(s => s.testAIConnection)
  const loadData = useStore(s => s.loadData)

  const companionDays = useCompanionDays()
  const dimensions = useEnabledDimensions()
  const identities = dimensions
    .filter(d => (d.identity || '').trim())
    .map(d => ({ name: d.name, identity: d.identity as string, colorHex: d.colorHex }))
  const birthStr = new Date(gardenBirth(dimensions)).toLocaleDateString('zh-CN')
  const web = webStorageStatus()

  const [apiKeyInput, setApiKeyInput] = useState(aiConfig.apiKey)
  const [showKey, setShowKey] = useState(false)
  const [importMsg, setImportMsg] = useState('')

  // 「数据在哪」由主进程如实报，不在界面上硬写一句话
  const [dbPath, setDbPath] = useState('')
  useEffect(() => {
    window.electronAPI?.appDbPath?.().then(setDbPath).catch(() => setDbPath(''))
  }, [])

  const handleSaveAI = () => {
    setAIConfig({ apiKey: apiKeyInput, isEnabled: true })
    saveAIConfig()
  }

  const handleExportJSON = () => downloadJSON()
  const handleExportCSV = () => downloadCSV()

  const handleImport = async () => {
    const result = await pickAndImportJSON()
    if (!result) return
    setImportMsg(result.message)
    await loadData()
  }

  const handleClearData = async () => {
    if (confirm('确定要清除所有数据吗？此操作不可撤销！')) {
      if (confirm('再次确认：清除所有维度、行动、目标、回顾数据？')) {
        await window.electronAPI.dbClearAll()
        window.location.reload()
      }
    }
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="page-pad space-y-4">
        <div>
          <h1 className="text-2xl font-light tracking-wide">我</h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">偏好与设置 · 我的数据与承诺</p>
        </div>

        {/* 我是谁。没有头像、没有昵称 —— 没有账号就不假装有 */}
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
        </div>

        {/* 八片花瓣的现在 · 想要开到哪 · 约定（v3.6，子曰命题的第三个 tab 核心） */}
        <PetalIntentEditor />

        {/* Aha 展柜：只在网页演示版出现。
            正式版里「想看就能看」会毁掉稀有性，而稀有性是这套设计的根基 */}
        {isWebBuild() && <AhaShowcase />}

        {/* 花语：从导航栏降为一个条目 */}
        <Link to="/handbook" className="drawer-link" data-testid="link-handbook">
          <span>花语</span>
          <span className="drawer-hint">五章 · 这朵花是什么、它的语言、它的边界 ›</span>
        </Link>

        {/* 外观主题 */}
        <div className="card space-y-4" data-testid="theme-section">
          <h2 className="text-sm font-medium text-[var(--text-secondary)]">外观主题</h2>
          <div className="grid grid-cols-3 gap-3">
            {THEMES.map(t => {
              const preview = {
                night: { bg: '#0d0d0d', dots: ['#c9a96e', '#8FA876', '#9B7BB8', '#D89A9E'] },
                dawn: { bg: '#f2ecdc', dots: ['#ab8733', '#77864f', '#8d6e4a', '#3b2f1e'] },
                bloom: { bg: '#fbeef1', dots: ['#e75565', '#9b7bd8', '#4cae7c', '#eda23f'] },
              }[t.id]
              const active = theme === t.id
              return (
                <button
                  key={t.id}
                  className={`text-left rounded-xl border p-4 transition-all ${
                    active
                      ? 'border-[var(--accent)] ring-1 ring-[var(--accent)]'
                      : 'border-[var(--border)] hover:border-[var(--border-strong)]'
                  }`}
                  onClick={() => setTheme(t.id)}
                >
                  {/* 迷你色板预览 */}
                  <div
                    className="h-14 rounded-lg mb-3 flex items-center justify-center gap-1.5"
                    style={{ background: preview.bg, border: '1px solid rgba(128,128,128,0.2)' }}
                  >
                    {preview.dots.map(c => (
                      <span key={c} className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: c }} />
                    ))}
                  </div>
                  <div className="text-sm font-medium">{t.name}</div>
                  <div className="text-xs text-[var(--text-muted)] mt-0.5 leading-relaxed">{t.desc}</div>
                  {active && <div className="text-xs text-[var(--accent)] mt-1.5">正在使用 ✓</div>}
                </button>
              )
            })}
          </div>
        </div>

        {/* 氛围（v3.1 A3）：动效原则「一律可关」的落地 */}
        <div className="card space-y-4" data-testid="ambience-section">
          <h2 className="text-sm font-medium text-[var(--text-secondary)]">氛围</h2>
          <label className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm">主题化鼠标指针</div>
              <div className="text-xs text-[var(--text-muted)] mt-0.5">
                花瓣形状的指针，随主题换装；关闭后使用系统指针
              </div>
            </div>
            <input
              type="checkbox"
              className="w-4 h-4"
              checked={ambience.cursor}
              onChange={e => setAmbience({ cursor: e.target.checked })}
              data-testid="toggle-cursor"
            />
          </label>
          <label className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm">花瓣拖尾</div>
              <div className="text-xs text-[var(--text-muted)] mt-0.5">
                指针划过时洒落几片花瓣——暗夜会发光，茶室落桂瓣，花间是樱吹雪
              </div>
            </div>
            <input
              type="checkbox"
              className="w-4 h-4"
              checked={ambience.trail}
              onChange={e => setAmbience({ trail: e.target.checked })}
              data-testid="toggle-trail"
            />
          </label>
          <div className="pt-3 border-t border-[var(--border)]">
            <button
              className="btn btn-ghost text-sm"
              onClick={() => setOnboardingOpen(true)}
              data-testid="replay-onboarding"
            >
              重看初见引导
            </button>
            <p className="text-xs text-[var(--text-muted)] mt-1.5">
              重新走一遍第一次打开时的引导，也可以顺手重新打一遍初始分
            </p>
          </div>
        </div>

        {/* AI 配置 —— 2026-08-18 子曰要求先隐藏，不删除。
            AI 能力本身还没到可交付标准（圆桌定的硬条件：50 条 eval + 准确率 ≥90% + 建议式交互），
            设置项先不露出，代码整段保留在这里，达标后把 SHOW_AI_CONFIG 改回 true 即可。 */}
        {SHOW_AI_CONFIG && (
        <div className="card space-y-4">
          <h2 className="text-sm font-medium text-[var(--text-secondary)]">AI 配置</h2>
          <p className="text-xs text-[var(--text-muted)]">
            配置 OpenAI 兼容 API，用于 AI 辅助生成目标和评分建议。API Key 仅存储在本地。
          </p>

          <div>
            <label className="text-xs text-[var(--text-muted)] block mb-1">API 端点</label>
            <input
              className="input"
              value={aiConfig.endpoint}
              onChange={e => setAIConfig({ endpoint: e.target.value })}
              placeholder="https://api.openai.com/v1"
            />
          </div>

          <div>
            <label className="text-xs text-[var(--text-muted)] block mb-1">模型</label>
            <input
              className="input"
              value={aiConfig.model}
              onChange={e => setAIConfig({ model: e.target.value })}
              placeholder="gpt-4o"
            />
          </div>

          <div>
            <label className="text-xs text-[var(--text-muted)] block mb-1">API Key</label>
            <div className="flex gap-2">
              <input
                className="input flex-1"
                type={showKey ? 'text' : 'password'}
                value={apiKeyInput}
                onChange={e => setApiKeyInput(e.target.value)}
                placeholder="sk-..."
              />
              <button
                className="btn btn-ghost text-sm"
                onClick={() => setShowKey(!showKey)}
              >
                {showKey ? '隐藏' : '显示'}
              </button>
            </div>
          </div>

          <div className="flex gap-3">
            <button className="btn btn-primary text-sm" onClick={handleSaveAI}>
              保存配置
            </button>
            <button
              className="btn btn-ghost text-sm"
              onClick={testAIConnection}
              disabled={isTestingAI}
            >
              {isTestingAI ? '测试中...' : '测试连接'}
            </button>
          </div>

          {aiTestResult && (
            <div className={`p-3 rounded-lg text-sm ${
              aiTestResult.success
                ? 'bg-[var(--success)]/10 text-[var(--success)]'
                : 'bg-[var(--danger)]/10 text-[var(--danger)]'
            }`}>
              <div className="flex items-center gap-2">
                <span>{aiTestResult.success ? '✓' : '✗'}</span>
                <span>{aiTestResult.message}</span>
              </div>
              {aiTestResult.latencyMs > 0 && (
                <span className="text-xs text-[var(--text-muted)] mt-1 block">
                  延迟：{aiTestResult.latencyMs}ms
                </span>
              )}
            </div>
          )}
        </div>
        )}

        {/* 数据管理 */}
        <div className="card space-y-4">
          <h2 className="text-sm font-medium text-[var(--text-secondary)]">数据管理</h2>

          <div className="flex gap-3">
            <button className="btn text-sm" onClick={handleExportJSON}>
              导出 JSON
            </button>
            <button className="btn text-sm" onClick={handleExportCSV}>
              导出 CSV
            </button>
            <button className="btn text-sm" onClick={handleImport}>
              导入 JSON
            </button>
          </div>

          {importMsg && (
            <div className="p-3 rounded-lg text-sm bg-[var(--accent)]/10 text-[var(--accent)]">
              {importMsg}
            </div>
          )}

          {/* 🔴 存储真相（v3.4 A3）。网页版的说法与桌面版不同，绝不照抄 ——
              桌面版「就是一个 sqlite 文件」，网页版是「浏览器清缓存会清掉」。
              这不是坏消息，是信任设计：敢把局限写在脸上的工具比含糊承诺"绝对安全"的更可信。 */}
          {isWebBuild() && web && (
            <div className="storage-truth" data-testid="storage-truth">
              {storagePromiseLines(web).map(line => (
                <p key={line}>{line}</p>
              ))}
              <p className="storage-meta" data-testid="storage-meta">
                存储层 {web.kind}
                {' · '}持久化 {web.persisted === true ? '已获许可' : web.persisted === false ? '未获许可' : '无从得知'}
                {web.standalone ? ' · 已作为独立应用运行' : ''}
                {web.usageMB != null && web.quotaMB != null
                  ? ` · 已用 ${web.usageMB.toFixed(1)}MB / 可用 ${Math.round(web.quotaMB)}MB`
                  : ''}
              </p>
            </div>
          )}

          <div className="pt-4 border-t border-[var(--border)]">
            <button
              className="btn text-sm text-[var(--danger)]"
              onClick={handleClearData}
            >
              清除所有数据
            </button>
          </div>
        </div>

        {/* 关于（v3.2 B2）：版本 + 一句话定位 + 数据在哪 + 不联网承诺。
            这一屏是信任设计，不是功能——陌生人装完，第一个疑虑是「我的数据去哪了」。 */}
        <div className="card space-y-3" data-testid="about-section">
          <h2 className="text-sm font-medium text-[var(--text-secondary)]">关于</h2>

          <div className="text-sm leading-relaxed space-y-0.5">
            {POSITIONING.map(line => (
              <p key={line}>{line}</p>
            ))}
          </div>

          <p className="text-xs text-[var(--text-muted)]">
            生命之花 · Life-OS {APP_VERSION} · 暗夜花园 / 禅意茶室 / 花间集
          </p>

          <div className="space-y-1">
            {(isWebBuild() ? ABOUT_PROMISES_WEB : ABOUT_PROMISES).map(p => (
              <p key={p} className="text-xs text-[var(--text-muted)] leading-relaxed">· {p}</p>
            ))}
          </div>

          <div className="text-xs text-[var(--text-muted)] leading-relaxed">
            <span>{isWebBuild() ? '数据存放：' : '数据文件：'}</span>
            <code className="break-all opacity-80" data-testid="about-db-path">{dbPath || '读取中…'}</code>
          </div>

          <p className="text-xs text-[var(--text-muted)] leading-relaxed border-l-2 border-[var(--border)] pl-3">
            {ABOUT_DISCLAIMER}
          </p>
        </div>
      </div>
    </div>
  )
}
