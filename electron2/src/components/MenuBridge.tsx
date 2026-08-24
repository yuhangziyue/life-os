import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../stores/useStore'
import { downloadJSON, downloadCSV, pickAndImportJSON } from '../db/fileTransfer'

/**
 * 把原生菜单 / 托盘的动作接到渲染进程。
 *
 * 背景：main.cjs 的菜单一直在往渲染进程 send('navigate' | 'quick-add' | 'export-json' | ...)，
 * preload 也如数暴露了 onXxx，但渲染侧从来没有人订阅——菜单栏「视图 Cmd+1~5」、
 * 「文件 → 导出/导入」、托盘「快速记录」全是死按钮。这个组件就是那根缺失的线。
 *
 * 必须挂在 <HashRouter> 内部（用了 useNavigate），且必须在数据加载完成后才挂载。
 */
export function MenuBridge() {
  const navigate = useNavigate()
  const setQuickAddOpen = useStore(s => s.setQuickAddOpen)
  const loadData = useStore(s => s.loadData)

  useEffect(() => {
    const api = window.electronAPI
    if (!api) return

    // 每个 onXxx 返回反注册函数，StrictMode 双挂载时不会留下重复监听
    const disposers = [
      api.onNavigate(path => navigate(path)),
      api.onQuickAdd(() => setQuickAddOpen(true)),
      api.onExportJSON(() => { void downloadJSON() }),
      api.onExportCSV(() => { void downloadCSV() }),
      api.onImportJSON(() => {
        void pickAndImportJSON().then(r => { if (r) return loadData() })
      }),
    ]

    // 供 E2E 断言：菜单线确实接上了
    ;(window as any).__menuListenersRegistered = true

    return () => {
      disposers.forEach(off => off?.())
      ;(window as any).__menuListenersRegistered = false
    }
  }, [navigate, setQuickAddOpen, loadData])

  return null
}
