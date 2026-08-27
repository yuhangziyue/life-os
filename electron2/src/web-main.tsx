// 演示版（纯浏览器）入口。
//
// 与 main.tsx 的唯一区别：挂 React 之前先把 window.electronAPI 用 IndexedDB 后端填上。
// 顺序不能反 —— App 的第一个 useEffect 就会 loadData()，那时 shim 必须已经在位。
// 业务代码（stores / pages / components）一行都没有为此改动。

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/globals.css'
import { createWebBackend, storageLabel } from './db/webAdapter'
import { buildDemoSnapshot } from './db/demoSeed'
import { initWebStorageStatus } from './services/storage'

window.addEventListener('error', e => console.error('[未捕获错误]', e.message, e.error))
window.addEventListener('unhandledrejection', e => console.error('[未处理的 Promise]', e.reason))

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('#root 未找到，index.web.html 可能被改坏了')

async function boot() {
  const backend = await createWebBackend({ seed: buildDemoSnapshot })
  window.electronAPI = backend.api

  // 存储持久化（v3.4 A1）—— 必须在挂 React 之前拿到结果：
  // 「我」页要如实显示是否获批，界面上不许出现「读取中…」这种含糊态。
  // 一个 API 调用换来 Chrome/Edge 的持久配额（不再被存储压力驱逐）；
  // Safari 上必然 false，那里唯一的办法是「添加到主屏幕」，文案会照实说。
  await initWebStorageStatus(backend.storageKind)

  // 页面隐藏时强制落盘：写入是攒到微任务末尾批量做的，
  // 用户点完「记一笔」立刻关标签页的话，不 flush 就丢那一笔。
  // 用 pagehide 而不是 beforeunload —— 后者在移动端 Safari 基本不触发。
  window.addEventListener('pagehide', () => { void backend.flush() })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void backend.flush()
  })

  ReactDOM.createRoot(rootEl!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )

  mountDemoBadge(backend.storageKind)
}

/**
 * 演示版浮标。挂在 React 树外面的独立 DOM —— 这样 App.tsx 一个字都不用改，
 * 也不会跟着路由切换重挂。做三件事：说明这是演示、如实报数据存哪、给一键重置。
 */
function mountDemoBadge(kind: Parameters<typeof storageLabel>[0]) {
  const wrap = document.createElement('div')
  wrap.id = 'demo-badge'
  wrap.innerHTML = `
    <button id="demo-badge-toggle" title="关于这个演示">🌸 演示版</button>
    <div id="demo-badge-panel" hidden>
      <p><strong>生命之花 · Life-OS</strong> 的网页演示版。</p>
      <p>数据只存在你这台设备的浏览器里（${storageLabel(kind)}），
         不上传任何服务器，随便点、随便改。</p>
      <p><strong>浏览器清缓存会一并清掉它</strong>——
         想留着就去「我 → 我的数据」导出一份，那里也写清了怎么让它更稳。</p>
      <button id="demo-reset">恢复演示数据</button>
    </div>`
  document.body.appendChild(wrap)

  const style = document.createElement('style')
  style.textContent = `
    #demo-badge { position: fixed; right: 14px; bottom: 14px; z-index: 9999;
      font: 12px/1.6 system-ui, -apple-system, "PingFang SC", sans-serif; }
    #demo-badge-toggle { background: rgba(0,0,0,.55); color: #f2ece1; border: 1px solid rgba(242,236,225,.22);
      border-radius: 999px; padding: 5px 12px; cursor: pointer; backdrop-filter: blur(8px); }
    #demo-badge-toggle:hover { background: rgba(0,0,0,.75); }
    #demo-badge-panel { position: absolute; right: 0; bottom: 34px; width: 258px;
      background: rgba(20,18,15,.94); color: #ded6c8; border: 1px solid rgba(242,236,225,.16);
      border-radius: 12px; padding: 13px 14px; backdrop-filter: blur(10px);
      box-shadow: 0 10px 34px rgba(0,0,0,.45); }
    #demo-badge-panel p { margin: 0 0 8px; }
    #demo-badge-panel strong { color: #f2ece1; font-weight: 500; }
    #demo-reset { width: 100%; margin-top: 4px; padding: 6px; cursor: pointer;
      background: rgba(242,236,225,.09); color: #f2ece1;
      border: 1px solid rgba(242,236,225,.22); border-radius: 8px; }
    #demo-reset:hover { background: rgba(242,236,225,.16); }
    @media (max-width: 640px) { #demo-badge-panel { width: min(258px, calc(100vw - 40px)); } }
    /* 🔴 窄屏（860px 断点，与 globals.css 一致）：右下角是底栏第三个入口「我」+ FAB 的地盘。
       浮标原来钉死在 right/bottom 14px，实机截图里它正好盖住「我」——第三个入口点不到，
       而且跟 FAB 叠在一起。挪到左下、抬到底栏之上；面板改为向上展开。 */
    @media (max-width: 860px) {
      #demo-badge { right: auto; left: 12px;
        bottom: calc(70px + env(safe-area-inset-bottom)); }
      #demo-badge-panel { right: auto; left: 0; }
    }`
  document.head.appendChild(style)

  const panel = wrap.querySelector<HTMLDivElement>('#demo-badge-panel')!
  wrap.querySelector('#demo-badge-toggle')!.addEventListener('click', () => {
    panel.hidden = !panel.hidden
  })
  wrap.querySelector('#demo-reset')!.addEventListener('click', async () => {
    // 走 shim 的 dbClearAll —— 演示版把它实现成「清库 + 重灌样板数据」
    await window.electronAPI.dbClearAll()
    location.reload()
  })
}

void boot()
