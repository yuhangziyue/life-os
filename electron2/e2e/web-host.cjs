// 网页演示版的验证宿主：用 Electron 的 Chromium 当浏览器打开 dist-web。
//
// 为什么不用 electron/main.cjs：那个会挂 preload、开 SQLite，测出来的是桌面版。
// 这里刻意**不挂 preload、不开 node 集成** —— 页面拿到的环境和真实浏览器一致，
// window.electronAPI 必须由 web-main.tsx 自己装的 IndexedDB shim 提供，
// 装不上就该当场白屏，这正是要验的东西。
//
// 本机陷阱：外部环境常带 ELECTRON_RUN_AS_NODE=1，那样 Electron 退化成纯 Node、
// 永不开窗且不报错。启动方必须 `env -u ELECTRON_RUN_AS_NODE`（见 web-verify.mjs）。

const { app, BrowserWindow } = require('electron')

const url = process.env.WEB_URL || 'http://127.0.0.1:4180/'

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    show: true,
    backgroundColor: '#0d0d0d',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      // 窗口被其它窗口遮住时 Chromium 会节流渲染，Page.captureScreenshot 就会一直不回调
      // （v3.3 排查过一次同样的现象）。验收脚本必须能在后台稳定截图。
      backgroundThrottling: false,
      // 没有 preload —— 就是一个干净的网页环境
    },
  })
  win.loadURL(url)
})

app.on('window-all-closed', () => app.quit())
