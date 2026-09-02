const { contextBridge, ipcRenderer } = require('electron')

console.log('[PRELOAD] preload.cjs 开始执行')

/**
 * 订阅主进程事件，返回反注册函数。
 * contextBridge 只能传结构化克隆得了的值和函数，返回函数是允许的。
 */
function subscribe(channel, handler) {
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

try {
  contextBridge.exposeInMainWorld('electronAPI', {
    // 诊断方法
    ping: () => 'pong from preload',

    // 菜单事件订阅。一律返回反注册函数——渲染侧 useEffect 必须能清理，
    // 否则 React StrictMode 的双挂载会留下两份监听，一次菜单点击触发两次动作。
    onQuickAdd: (callback) => subscribe('quick-add', () => callback()),
    onNavigate: (callback) => subscribe('navigate', (_e, path) => callback(path)),
    onExportJSON: (callback) => subscribe('export-json', () => callback()),
    onExportCSV: (callback) => subscribe('export-csv', () => callback()),
    onImportJSON: (callback) => subscribe('import-json', () => callback()),

    dbDimensionsGetAll: () => ipcRenderer.invoke('db:dimensions:getAll'),
    dbDimensionsGet: (id) => ipcRenderer.invoke('db:dimensions:get', id),
    dbDimensionsAdd: (row) => ipcRenderer.invoke('db:dimensions:add', row),
    dbDimensionsUpdate: (id, data) => ipcRenderer.invoke('db:dimensions:update', id, data),
    dbDimensionsDelete: (id) => ipcRenderer.invoke('db:dimensions:delete', id),

    dbRubricsGetAll: () => ipcRenderer.invoke('db:rubrics:getAll'),
    dbRubricsGetByDimension: (dimId) => ipcRenderer.invoke('db:rubrics:getByDimension', dimId),
    dbRubricsAdd: (row) => ipcRenderer.invoke('db:rubrics:add', row),

    dbBranchesGetAll: () => ipcRenderer.invoke('db:branches:getAll'),
    dbBranchesGetByDimension: (dimId) => ipcRenderer.invoke('db:branches:getByDimension', dimId),
    dbBranchesAdd: (row) => ipcRenderer.invoke('db:branches:add', row),
    dbBranchesUpdate: (id, data) => ipcRenderer.invoke('db:branches:update', id, data),
    dbBranchesDelete: (id) => ipcRenderer.invoke('db:branches:delete', id),

    dbGoalsGetAll: () => ipcRenderer.invoke('db:goals:getAll'),
    dbGoalsGetByDimension: (dimId) => ipcRenderer.invoke('db:goals:getByDimension', dimId),
    dbGoalsAdd: (row) => ipcRenderer.invoke('db:goals:add', row),
    dbGoalsUpdate: (id, data) => ipcRenderer.invoke('db:goals:update', id, data),
    dbGoalsDelete: (id) => ipcRenderer.invoke('db:goals:delete', id),

    dbActionsGetAll: () => ipcRenderer.invoke('db:actions:getAll'),
    dbActionsGetByDimension: (dimId) => ipcRenderer.invoke('db:actions:getByDimension', dimId),
    dbActionsAdd: (row) => ipcRenderer.invoke('db:actions:add', row),
    dbActionsUpdate: (id, data) => ipcRenderer.invoke('db:actions:update', id, data),
    dbActionsDelete: (id) => ipcRenderer.invoke('db:actions:delete', id),

    dbReviewsGetAll: () => ipcRenderer.invoke('db:reviews:getAll'),
    dbReviewsAdd: (row) => ipcRenderer.invoke('db:reviews:add', row),
    dbReviewsUpdate: (id, data) => ipcRenderer.invoke('db:reviews:update', id, data),
    dbReviewsDelete: (id) => ipcRenderer.invoke('db:reviews:delete', id),

    dbSettingsGet: (key) => ipcRenderer.invoke('db:settings:get', key),
    dbSettingsSet: (key, value) => ipcRenderer.invoke('db:settings:set', key, value),
    dbSnapshotsGetAll: () => ipcRenderer.invoke('db:snapshots:getAll'),
    dbSnapshotsAdd: (row) => ipcRenderer.invoke('db:snapshots:add', row),
    dbEventsLog: (name) => ipcRenderer.invoke('db:events:log', name),
    dbMomentsAdd: (row) => ipcRenderer.invoke('db:moments:add', row),
    dbMomentsGetAll: () => ipcRenderer.invoke('db:moments:getAll'),
    dbSettingsGetAll: () => ipcRenderer.invoke('db:settings:getAll'),
    dbEventsHas: (name) => ipcRenderer.invoke('db:events:has', name),
    dbEventsHasSince: (name, since) => ipcRenderer.invoke('db:events:hasSince', name, since),
    dbEventsCountSince: (name, since) => ipcRenderer.invoke('db:events:countSince', name, since),
    dbEventsClearPrefix: (prefix) => ipcRenderer.invoke('db:events:clearPrefix', prefix),

    appDbPath: () => ipcRenderer.invoke('app:dbPath'),

    dbQuarterlyGetAll: () => ipcRenderer.invoke('db:quarterly:getAll'),
    dbQuarterlyUpsert: (row) => ipcRenderer.invoke('db:quarterly:upsert', row),
    dbQuarterlyDelete: (id) => ipcRenderer.invoke('db:quarterly:delete', id),
    dbFocusSet: (ids) => ipcRenderer.invoke('db:focus:set', ids),

    dbClearAll: () => ipcRenderer.invoke('db:clearAll'),
  })

  console.log('[PRELOAD] contextBridge.exposeInMainWorld 完成')
} catch (e) {
  console.error('[PRELOAD] 暴露 API 失败:', e.message)
}
