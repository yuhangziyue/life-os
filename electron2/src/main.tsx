import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/globals.css'

// 渲染进程的兜底日志。React 树内部的错误由 App 的 error 态接管，
// 这里只负责把逃出去的异常写进控制台，方便打包后从 DevTools 回溯。
window.addEventListener('error', e => console.error('[未捕获错误]', e.message, e.error))
window.addEventListener('unhandledrejection', e => console.error('[未处理的 Promise]', e.reason))

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('#root 未找到，index.html 可能被改坏了')

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
