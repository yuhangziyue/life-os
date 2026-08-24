import { useEffect, useState } from 'react'
import { useStore } from '../stores/useStore'
import { downloadJSON, downloadCSV, pickAndImportJSON } from '../db/fileTransfer'
import { THEMES } from '../services/theme'
import { POSITIONING, APP_VERSION, ABOUT_PROMISES, ABOUT_DISCLAIMER } from '../content/about'

/** AI 配置入口开关：AI 能力达标（50 条 eval + ≥90% 准确率 + 建议式交互）前不对用户露出 */
const SHOW_AI_CONFIG = false

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
      <div className="max-w-2xl mx-auto p-8 space-y-8">
        <div>
          <h1 className="text-2xl font-light tracking-wide">设置</h1>
        </div>

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
            {ABOUT_PROMISES.map(p => (
              <p key={p} className="text-xs text-[var(--text-muted)] leading-relaxed">· {p}</p>
            ))}
          </div>

          <div className="text-xs text-[var(--text-muted)] leading-relaxed">
            <span>数据文件：</span>
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
