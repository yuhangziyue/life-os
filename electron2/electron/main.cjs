const { app, BrowserWindow, Menu, Tray, nativeImage, ipcMain } = require('electron')
const path = require('path')
const db = require('./database.cjs')

// 调试日志开关。之前每次 IPC 都往终端打一行，正常开一次应用刷几十行，
// 真出问题时反而被淹没。默认静默，排查时用 LIFEOS_DEBUG=1 启动。
// console.error 不受此开关影响，错误永远打。
const DEBUG = process.env.LIFEOS_DEBUG === '1'
const log = DEBUG ? console.log.bind(console) : () => {}

log('[MAIN] Electron 主进程启动, __dirname:', __dirname, 'isPackaged:', app.isPackaged)

let mainWindow = null
let tray = null
// LIFEOS_FORCE_PROD=1 可以在未打包的情况下走 file:// 加载 dist/，
// 用来验证"打包后那条渲染路径"能不能跑通，不用真打一个包出来。
const isDev = !app.isPackaged && process.env.LIFEOS_FORCE_PROD !== '1'

function createWindow() {
  log('[MAIN] createWindow 开始')
  
  mainWindow = new BrowserWindow({
    width: 1100, height: 750, minWidth: 900, minHeight: 650,
    title: '生命之花',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#0d0d0d',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      // 窗口被完全遮挡时 macOS 会暂停渲染，e2e 截图会超时；
      // 单窗口应用关掉节流没有实际代价
      backgroundThrottling: false,
    },
  })

  log('[MAIN] preload 路径:', path.join(__dirname, 'preload.cjs'))
  log('[MAIN] isDev:', isDev)

  if (isDev) {
    log('[MAIN] 加载开发服务器: http://localhost:5173')
    mainWindow.loadURL('http://localhost:5173')
    // 只有显式开调试才自动弹 DevTools；否则每次 dev 启动都多一个抢焦点的窗口
    if (DEBUG) mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    const htmlPath = path.join(__dirname, '../dist/index.html')
    log('[MAIN] 加载文件:', htmlPath)
    mainWindow.loadFile(htmlPath)
  }

  mainWindow.webContents.on('did-finish-load', () => {
    log('[MAIN] webContents did-finish-load')
  })
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('[MAIN] webContents did-fail-load:', errorCode, errorDescription)
  })
  mainWindow.webContents.on('crashed', () => {
    console.error('[MAIN] webContents crashed!')
  })

  mainWindow.on('closed', () => { log('[MAIN] window closed'); mainWindow = null })
}

function createTray() {
  log('[MAIN] createTray')
  const icon = nativeImage.createEmpty()
  tray = new Tray(icon.resize({ width: 16, height: 16 }))
  tray.setTitle('🌸')
  tray.setToolTip('生命之花')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开主窗口', click: () => { mainWindow?.show(); mainWindow?.focus() } },
    { label: '快速记录', click: () => mainWindow?.webContents.send('quick-add') },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() },
  ]))
  tray.on('click', () => { mainWindow?.show(); mainWindow?.focus() })
}

function createMenu() {
  log('[MAIN] createMenu')
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: '生命之花', submenu: [
      { label: '关于', role: 'about' }, { type: 'separator' },
      { label: '设置', accelerator: 'Cmd+,', click: () => mainWindow?.webContents.send('navigate', '/settings') },
      { type: 'separator' }, { label: '退出', accelerator: 'Cmd+Q', role: 'quit' },
    ]},
    { label: '文件', submenu: [
      { label: '快速记录', accelerator: 'Cmd+Shift+L', click: () => mainWindow?.webContents.send('quick-add') },
      { type: 'separator' },
      { label: '导出 JSON', click: () => mainWindow?.webContents.send('export-json') },
      { label: '导出 CSV', click: () => mainWindow?.webContents.send('export-csv') },
      { label: '导入 JSON', click: () => mainWindow?.webContents.send('import-json') },
    ]},
    { label: '编辑', submenu: [
      { label: '撤销', accelerator: 'Cmd+Z', role: 'undo' },
      { label: '重做', accelerator: 'Shift+Cmd+Z', role: 'redo' },
      { type: 'separator' },
      { label: '剪切', accelerator: 'Cmd+X', role: 'cut' },
      { label: '复制', accelerator: 'Cmd+C', role: 'copy' },
      { label: '粘贴', accelerator: 'Cmd+V', role: 'paste' },
    ]},
    { label: '视图', submenu: [
      { label: '每日看板', accelerator: 'Cmd+1', click: () => mainWindow?.webContents.send('navigate', '/') },
      { label: '维度管理', accelerator: 'Cmd+2', click: () => mainWindow?.webContents.send('navigate', '/dimensions') },
      { label: '行动记录', accelerator: 'Cmd+3', click: () => mainWindow?.webContents.send('navigate', '/actions') },
      { label: '统计分析', accelerator: 'Cmd+4', click: () => mainWindow?.webContents.send('navigate', '/stats') },
      { label: '回顾反思', accelerator: 'Cmd+5', click: () => mainWindow?.webContents.send('navigate', '/review') },
    ]},
    { label: '窗口', submenu: [
      { label: '最小化', accelerator: 'Cmd+M', role: 'minimize' },
      { label: '关闭', accelerator: 'Cmd+W', role: 'close' },
    ]},
  ]))
}

function registerIPC() {
  log('[MAIN] registerIPC 开始')

  ipcMain.handle('db:dimensions:getAll', () => { log('[IPC] db:dimensions:getAll'); return db.getDimensions() })
  ipcMain.handle('db:dimensions:get', (_e, id) => { log('[IPC] db:dimensions:get', id); return db.getDimension(id) })
  ipcMain.handle('db:dimensions:add', (_e, row) => { log('[IPC] db:dimensions:add', row.name); db.addDimension(row); return true })
  ipcMain.handle('db:dimensions:update', (_e, id, data) => { log('[IPC] db:dimensions:update', id); db.updateDimension(id, data); return true })
  ipcMain.handle('db:dimensions:delete', (_e, id) => { log('[IPC] db:dimensions:delete', id); db.deleteDimension(id); return true })

  ipcMain.handle('db:rubrics:getAll', () => { log('[IPC] db:rubrics:getAll'); return db.getScoreRubrics() })
  ipcMain.handle('db:rubrics:getByDimension', (_e, dimId) => { log('[IPC] db:rubrics:getByDimension', dimId); return db.getScoreRubricsByDimension(dimId) })
  ipcMain.handle('db:rubrics:add', (_e, row) => { log('[IPC] db:rubrics:add'); db.addScoreRubric(row); return true })

  ipcMain.handle('db:branches:getAll', () => { log('[IPC] db:branches:getAll'); return db.getBranches() })
  ipcMain.handle('db:branches:getByDimension', (_e, dimId) => { log('[IPC] db:branches:getByDimension', dimId); return db.getBranchesByDimension(dimId) })
  ipcMain.handle('db:branches:add', (_e, row) => { log('[IPC] db:branches:add', row.name); db.addBranch(row); return true })
  ipcMain.handle('db:branches:update', (_e, id, data) => { log('[IPC] db:branches:update', id); db.updateBranch(id, data); return true })
  ipcMain.handle('db:branches:delete', (_e, id) => { log('[IPC] db:branches:delete', id); db.deleteBranch(id); return true })

  ipcMain.handle('db:goals:getAll', () => { log('[IPC] db:goals:getAll'); return db.getGoals() })
  ipcMain.handle('db:goals:getByDimension', (_e, dimId) => { log('[IPC] db:goals:getByDimension', dimId); return db.getGoalsByDimension(dimId) })
  ipcMain.handle('db:goals:add', (_e, row) => { log('[IPC] db:goals:add', row.title); db.addGoal(row); return true })
  ipcMain.handle('db:goals:update', (_e, id, data) => { log('[IPC] db:goals:update', id); db.updateGoal(id, data); return true })
  ipcMain.handle('db:goals:delete', (_e, id) => { log('[IPC] db:goals:delete', id); db.deleteGoal(id); return true })

  ipcMain.handle('db:actions:getAll', () => { log('[IPC] db:actions:getAll'); return db.getActions() })
  ipcMain.handle('db:actions:getByDimension', (_e, dimId) => { log('[IPC] db:actions:getByDimension', dimId); return db.getActionsByDimension(dimId) })
  ipcMain.handle('db:actions:add', (_e, row) => { log('[IPC] db:actions:add', row.description?.slice(0, 30)); db.addAction(row); return true })
  ipcMain.handle('db:actions:update', (_e, id, data) => { log('[IPC] db:actions:update', id); db.updateAction(id, data); return true })
  ipcMain.handle('db:actions:delete', (_e, id) => { log('[IPC] db:actions:delete', id); db.deleteAction(id); return true })

  ipcMain.handle('db:reviews:getAll', () => { log('[IPC] db:reviews:getAll'); return db.getReviews() })
  ipcMain.handle('db:reviews:add', (_e, row) => { log('[IPC] db:reviews:add', row.periodType); db.addReview(row); return true })
  ipcMain.handle('db:reviews:update', (_e, id, data) => { log('[IPC] db:reviews:update', id); db.updateReview(id, data); return true })
  ipcMain.handle('db:reviews:delete', (_e, id) => { log('[IPC] db:reviews:delete', id); db.deleteReview(id); return true })

  ipcMain.handle('db:settings:get', (_e, key) => { log('[IPC] db:settings:get', key); return db.getSetting(key) })
  ipcMain.handle('db:settings:set', (_e, key, value) => { log('[IPC] db:settings:set', key); db.setSetting(key, value); return true })
  ipcMain.handle('db:snapshots:getAll', () => { log('[IPC] db:snapshots:getAll'); return db.getSnapshots() })
  ipcMain.handle('db:snapshots:add', (_e, row) => { log('[IPC] db:snapshots:add', row.weekKey); db.addSnapshot(row); return true })
  ipcMain.handle('db:events:log', (_e, name) => { log('[IPC] db:events:log', name); db.logEvent(name); return true })

  // 关于面板要把「数据在哪」如实报出来 —— 承诺得能被用户当场核对，不能靠界面上硬写一句话
  ipcMain.handle('app:dbPath', () => path.join(app.getPath('userData'), 'life-os.sqlite'))

  ipcMain.handle('db:quarterly:getAll', () => { log('[IPC] db:quarterly:getAll'); return db.getQuarterlyReviews() })
  ipcMain.handle('db:quarterly:upsert', (_e, row) => { log('[IPC] db:quarterly:upsert', row.id); db.upsertQuarterlyReview(row); return true })
  ipcMain.handle('db:quarterly:delete', (_e, id) => { log('[IPC] db:quarterly:delete', id); db.deleteQuarterlyReview(id); return true })
  ipcMain.handle('db:focus:set', (_e, ids) => { log('[IPC] db:focus:set', ids); db.setFocusDimensions(ids); return true })

  ipcMain.handle('db:clearAll', () => { log('[IPC] db:clearAll'); db.clearAllData(); return true })

  log('[MAIN] registerIPC 完成')
}

app.whenReady().then(() => {
  log('[MAIN] ========================================')
  log('[MAIN] app.whenReady 触发')
  log('[MAIN] userData:', app.getPath('userData'))
  log('[MAIN] ========================================')
  
  try {
    db.initDatabase()
    log('[MAIN] 数据库初始化完成')
  } catch (e) {
    console.error('[MAIN] 数据库初始化失败:', e.message)
    console.error('[MAIN] stack:', e.stack)
  }
  
  registerIPC()
  createWindow()
  createTray()
  createMenu()

  app.on('activate', () => {
    log('[MAIN] activate')
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
    else mainWindow?.show()
  })
  app.on('before-quit', () => {
    log('[MAIN] before-quit')
    db.closeDatabase()
    tray?.destroy()
  })
})

app.on('window-all-closed', () => {
  log('[MAIN] window-all-closed')
  if (process.platform !== 'darwin') app.quit()
})
