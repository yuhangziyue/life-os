import { useEffect, useState } from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import { useStore } from './stores/useStore'
import { applyTheme } from './services/theme'
import { applyCursorSetting } from './services/ambience'
import { getSetting } from './db'
import { TabBar } from './components/TabBar'
import { QuickAddPanel } from './components/QuickAddPanel'
import { MenuBridge } from './components/MenuBridge'
import { EchoToast } from './components/EchoToast'
import { LightShiftAha } from './components/LightShiftAha'
import { PetalBackdrop } from './components/PetalBackdrop'
import { PetalTrail } from './components/PetalTrail'
import { Onboarding } from './components/Onboarding'
import { QuarterlyTalk } from './components/QuarterlyTalk'
import { Garden } from './pages/Garden'
import { Today } from './pages/Today'
import { Dimensions } from './pages/Dimensions'
import { DimensionDetail } from './pages/DimensionDetail'
import { Actions } from './pages/Actions'
import { Stats } from './pages/Stats'
import { ReviewPage } from './pages/Review'
import { Settings } from './pages/Settings'
import { Handbook } from './pages/Handbook'

type AppPhase = 'loading' | 'error' | 'ready'

/**
 * 顶部拖拽条。窗口是 titleBarStyle: 'hiddenInset'，红绿灯浮在内容上方
 * （main.cjs 里 trafficLightPosition y=16），所以顶部要留出 TITLEBAR_H 并且可拖拽，
 * 否则窗口只能靠边框拖动。
 *
 * ⚠️ 原来是在最外层容器上 paddingTop=30 整体下推 —— 那 30px 露出的是 body 底色，
 * 于是侧栏（深木 / 近白）上方永远顶着一条主体色，界面顶部一道明显的分割线。
 * 现在改成：不下推，侧栏与主面板各自顶到天花板，各在自己内部放一条同色拖拽带
 * （Sidebar 里的 .zen-drag-strip 吃侧栏渐变，main 里的 <header> 吃主面板底色），
 * 缝就消失了。别再改回 paddingTop。
 */
const TITLEBAR_H = 30
const TitleBar = () => (
  <div
    style={{
      position: 'fixed', top: 0, left: 0, right: 0, height: TITLEBAR_H, zIndex: 40,
      WebkitAppRegion: 'drag',
    } as React.CSSProperties}
  />
)

/** 进门的一眼。载荷在 loadData 里就已经取好，所以这里渲染即播，不会闪 */
function EntryAha() {
  const aha = useStore(s => s.aha)
  const stampedAt = useStore(s => s.ahaStampedAt)
  const clearAha = useStore(s => s.clearAha)
  if (!aha) return null
  return <LightShiftAha payload={aha} stampedAt={stampedAt ?? undefined} onClose={clearAha} />
}

export default function App() {
  const [phase, setPhase] = useState<AppPhase>('loading')
  const [errorMsg, setErrorMsg] = useState('')

  const loadData = useStore(s => s.loadData)
  const loadError = useStore(s => s.loadError)
  const quickAddOpen = useStore(s => s.quickAddOpen)
  const setQuickAddOpen = useStore(s => s.setQuickAddOpen)
  const theme = useStore(s => s.theme)
  const cursorEnabled = useStore(s => s.ambience.cursor)
  const onboardingOpen = useStore(s => s.onboardingOpen)
  const setOnboardingOpen = useStore(s => s.setOnboardingOpen)
  const quarterlySession = useStore(s => s.quarterlySession)

  // 主题落到 <html data-theme> + localStorage；首帧就要生效，避免闪色
  useEffect(() => { applyTheme(theme) }, [theme])
  // 主题化指针开关落到 <html data-cursor>
  useEffect(() => { applyCursorSetting(cursorEnabled) }, [cursorEnabled])

  const runLoad = () => {
    setPhase('loading')
    setErrorMsg('')
    loadData()
      .then(async () => {
        setPhase('ready')
        // 首启引导：全新库（没有 onboardingDone）才进；老库在迁移 v3 里已豁免
        try {
          const done = await getSetting('onboardingDone')
          if (done !== '1') setOnboardingOpen(true)
        } catch { /* 读不到就当作已完成，不挡使用 */ }
      })
      .catch((e: any) => {
        setPhase('error')
        setErrorMsg(e?.message || String(e))
      })
  }

  useEffect(runLoad, [])

  // store 内部捕获的错误也要能翻到界面上
  useEffect(() => {
    if (loadError) {
      setPhase('error')
      setErrorMsg(loadError)
    }
  }, [loadError])

  // 全局快捷键：⌘⇧L 快速记录（菜单栏那条走 MenuBridge，这里管窗口内直接按键）
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'l') {
        e.preventDefault()
        setQuickAddOpen(true)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [setQuickAddOpen])

  if (phase === 'loading') {
    return (
      <>
        <TitleBar />
        <div className="h-screen flex items-center justify-center" style={{ paddingTop: TITLEBAR_H }}>
          <div className="text-center">
            <div className="text-5xl mb-4 animate-pulse">🌸</div>
            <div className="text-lg font-light text-[var(--text-primary)] mb-1">生命之花</div>
            <div className="text-sm text-[var(--text-muted)]">正在加载数据…</div>
          </div>
        </div>
      </>
    )
  }

  if (phase === 'error') {
    return (
      <>
        <TitleBar />
        <div className="h-screen flex items-center justify-center" style={{ paddingTop: TITLEBAR_H }}>
          <div className="text-center max-w-md px-6">
            <div className="text-5xl mb-4">⚠️</div>
            <div className="text-lg font-light mb-3">数据加载失败</div>
            <div className="text-sm text-[var(--danger)] bg-[var(--bg-card)] border border-[var(--border)] rounded-lg px-4 py-3 mb-5 text-left break-words">
              {errorMsg}
            </div>
            <button className="btn btn-primary" onClick={runLoad}>重试加载</button>
          </div>
        </div>
      </>
    )
  }

  return (
    <HashRouter>
      <MenuBridge />
      <div className="h-screen flex">
        <main className="flex-1 flex flex-col min-w-0">
          {/* 主面板自己的拖拽带：吃主面板底色，与侧栏那条各自同色，顶部不再有缝。
              用 <header> 而不是 <div>——`main > div` 挂着 pageIn 入场动画，别让拖拽带跟着抖。 */}
          <header
            className="flex-shrink-0"
            style={{ height: TITLEBAR_H, WebkitAppRegion: 'drag', zIndex: 2 } as React.CSSProperties}
          />
          <PetalBackdrop />
          <Routes>
            {/* 三入口（v3.5）：花 / 今天 / 我。
                其余路由全部保留，只是从导航层降到场景内部：
                  今天(默认) → 全部记录(/actions)
                  我的花园 → 细看数据(/stats) · 周对账(/review) · 点花瓣(/dimensions/:id)
                  我 → 花语(/handbook)
                /settings 与 /me 是同一页 —— 菜单桥与既有 e2e 都还指着 /settings。 */}
            <Route path="/" element={<Today />} />
            <Route path="/garden" element={<Garden />} />
            <Route path="/me" element={<Settings />} />
            <Route path="/dimensions" element={<Dimensions />} />
            <Route path="/dimensions/:id" element={<DimensionDetail />} />
            <Route path="/actions" element={<Actions />} />
            <Route path="/stats" element={<Stats />} />
            <Route path="/review" element={<ReviewPage />} />
            <Route path="/handbook" element={<Handbook />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
        {/* 底栏三入口 + 记一笔 FAB：全宽度生效（v3.5.1 起手机端是唯一形态） */}
        <TabBar />
        <QuickAddPanel open={quickAddOpen} onClose={() => setQuickAddOpen(false)} />
        <EchoToast />
        {/* 「光的分配」定格帧：不在提交后播，在这里 —— 进门的一眼（v3.6） */}
        <EntryAha />
        <PetalTrail />
        {onboardingOpen && <Onboarding />}
        {/* 会谈期间整屏接管：仪式需要一个不被待办事项张望的房间 */}
        {quarterlySession && <QuarterlyTalk />}
      </div>
    </HashRouter>
  )
}
