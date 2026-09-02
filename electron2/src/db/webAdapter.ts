// Web 版数据后端：把 window.electronAPI 整个接口用浏览器存储实现一遍。
//
// 为什么是「装 shim」而不是「另写一个网页版」：
// 渲染层对 Electron 的依赖只有 window.electronAPI 这一个面（全工程 6 文件 8 处引用），
// 且没有任何 node / process.env 依赖。所以只要在挂载 React 之前把这个全局变量填上，
// 上层 509 行的 store、8 个页面、17 个组件一行都不用改，Electron 版零回归风险。
// 反过来若 fork 一份网页版代码，两份必然漂移——那是我们明确禁止的做法。
//
// 存储策略：三级降级，且每一级都要「真跑一次读写」才算可用。
//   IndexedDB → localStorage → 内存
// 不做 feature detect（`'indexedDB' in window` 这种）：沙箱 iframe 里对象存在但
// open() 会抛 SecurityError 甚至永不回调，光看属性在不在会误判成可用，然后白屏。
// 判据必须是结构性的——实际写进去再读出来——不是「属性存在」。
//
// 数据模型：整库当成一个 JSON 快照全量读写，不建 IndexedDB 索引。
// 数据量级 8 维度 / 80 rubrics / 128 branches / ~200 actions ≈ 几百 KB，
// 全量写一次 <10ms。为这个量级设计增量索引是过度设计。

import type { ElectronAPI } from '../app/electron'

// ========== 快照结构（对应 SQLite 的十张表） ==========

export interface WebSnapshot {
  dimensions: any[]
  score_rubrics: any[]
  branches: any[]
  goals: any[]
  actions: any[]
  reviews: any[]
  settings: Record<string, string>
  flower_snapshots: any[]
  events: { id: number; name: string; at: number }[]
  /** 那些美妙时刻（v3.7）。与 SQLite 的 aha_moments 一一对应，只增不改 */
  aha_moments: { id: string; kind: string; at: number; headline: string; lines: string[]; colorHex: string }[]
  quarterly_reviews: any[]
}

export function emptySnapshot(): WebSnapshot {
  return {
    dimensions: [], score_rubrics: [], branches: [], goals: [], actions: [],
    reviews: [], settings: {}, flower_snapshots: [], events: [], quarterly_reviews: [],
    aha_moments: [],
  }
}

// ========== 持久层：三级降级 ==========

type PersistKind = 'indexeddb' | 'localstorage' | 'memory'

interface Persist {
  readonly kind: PersistKind
  load(): Promise<WebSnapshot | null>
  save(snap: WebSnapshot): Promise<void>
}

const IDB_NAME = 'life-os-web'
const IDB_STORE = 'kv'
const SNAPSHOT_KEY = 'snapshot'
const LS_KEY = 'life-os-web-snapshot'
/** open() 在 opaque origin 下可能既不 resolve 也不 reject，必须有超时兜底 */
const IDB_TIMEOUT_MS = 3000

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => {
      if (!settled) { settled = true; reject(new Error('indexedDB.open 超时未回调')) }
    }, IDB_TIMEOUT_MS)

    let req: IDBOpenDBRequest
    try {
      req = indexedDB.open(IDB_NAME, 1)
    } catch (e) {
      clearTimeout(timer)
      return reject(e)
    }
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE)
    }
    req.onsuccess = () => {
      if (settled) return
      settled = true; clearTimeout(timer); resolve(req.result)
    }
    req.onerror = () => {
      if (settled) return
      settled = true; clearTimeout(timer); reject(req.error ?? new Error('indexedDB.open 失败'))
    }
    req.onblocked = () => {
      if (settled) return
      settled = true; clearTimeout(timer); reject(new Error('indexedDB.open 被阻塞'))
    }
  })
}

function idbTx<T>(db: IDBDatabase, mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, mode)
    const req = fn(tx.objectStore(IDB_STORE))
    req.onsuccess = () => resolve(req.result as T)
    req.onerror = () => reject(req.error)
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB 事务被中止'))
  })
}

async function tryIndexedDb(): Promise<Persist | null> {
  try {
    const db = await openIdb()
    // 探针：真写一次再读回来。存在 API ≠ 能用（沙箱 iframe 常见）
    const probe = `__probe_${Date.now()}`
    await idbTx(db, 'readwrite', s => s.put(probe, '__probe__'))
    const back = await idbTx<string>(db, 'readonly', s => s.get('__probe__'))
    if (back !== probe) return null
    await idbTx(db, 'readwrite', s => s.delete('__probe__'))

    return {
      kind: 'indexeddb',
      async load() {
        const raw = await idbTx<string | undefined>(db, 'readonly', s => s.get(SNAPSHOT_KEY))
        return raw ? (JSON.parse(raw) as WebSnapshot) : null
      },
      async save(snap) {
        await idbTx(db, 'readwrite', s => s.put(JSON.stringify(snap), SNAPSHOT_KEY))
      },
    }
  } catch {
    return null
  }
}

function tryLocalStorage(): Persist | null {
  try {
    const probe = `__probe_${Date.now()}`
    localStorage.setItem('__probe__', probe)
    if (localStorage.getItem('__probe__') !== probe) return null
    localStorage.removeItem('__probe__')
    return {
      kind: 'localstorage',
      async load() {
        const raw = localStorage.getItem(LS_KEY)
        return raw ? (JSON.parse(raw) as WebSnapshot) : null
      },
      async save(snap) {
        // localStorage 约 5MB 上限：定妆照（dataUrl）多了会撑爆，撑爆就丢掉快照里最重的那部分
        try {
          localStorage.setItem(LS_KEY, JSON.stringify(snap))
        } catch {
          localStorage.setItem(LS_KEY, JSON.stringify({ ...snap, flower_snapshots: [] }))
        }
      },
    }
  } catch {
    return null
  }
}

function memoryPersist(): Persist {
  let held: WebSnapshot | null = null
  return {
    kind: 'memory',
    async load() { return held },
    async save(snap) { held = snap },
  }
}

async function pickPersist(): Promise<Persist> {
  return (await tryIndexedDb()) ?? tryLocalStorage() ?? memoryPersist()
}

// ========== 适配器本体 ==========

export interface WebBackend {
  api: ElectronAPI
  /**
   * 用另一套种子重灌整库（v3.6.2）。
   * 演示版的两条路径共用它：「恢复演示数据」灌 demoSeed，「种我自己的」灌空骨架。
   * 刻意不塞进 dbClearAll —— 那个接口在桌面版有自己的语义（清空后灌空白骨架），
   * 两边职责不同，混在一起迟早有人改错一边。
   */
  reseed: (seed: (now: number) => WebSnapshot) => Promise<void>
  /** 实际用上的存储层，界面上要如实报出来，不硬写「保存在本地」 */
  storageKind: PersistKind
  /** 强制落盘（页面隐藏前调一次，避免 debounce 还没跑就被关掉） */
  flush: () => Promise<void>
}

export interface WebBackendOptions {
  /** 空库时灌什么。web demo 灌样板数据，与 Electron 生产版的空白骨架种子是两回事 */
  seed: (now: number) => WebSnapshot
  /**
   * 当前演示数据的版本号（由调用方传入 —— 这一层不能反向引 demoSeed，会成环）。
   * 库里存的版本与它不一致时重灌演示数据。见下方那段安全边界注释。
   */
  seedVersion?: string
}

export async function createWebBackend(opts: WebBackendOptions): Promise<WebBackend> {
  const persist = await pickPersist()

  // 内存是权威源，持久层只是异步镜像。
  // 必须如此：loadData() 里 8 个 updateDimension 是 Promise.all 并行发的，
  // 若每次都「读快照→改→写回」，8 个读到的都是同一份旧快照，最后一个写入覆盖前七个。
  // 改内存对象是同步的，天然没有这个竞态。
  let db = (await persist.load()) ?? opts.seed(Date.now())
  // 老快照可能缺后加的表（比如以前存的没有 quarterly_reviews），补齐再用
  db = { ...emptySnapshot(), ...db }

  /*
   * 演示数据版本升级（v3.7）。
   *
   * 问题：演示数据改了（这一版加了「那些美妙时刻」），而老访客的 IndexedDB
   * 存着旧快照，上面那行只会把新表补成空数组 —— **新页面永远是空的**。
   *
   * 🔴 绝不能碰的边界：**用户点过「清空，种我自己的」之后，那份数据是他自己的，
   *   一次都不许被覆盖。** 判据是 `demoSeedVersion` 的**存在性** ——
   *   `emptySeed` 刻意不写它，所以：
   *     · key 不存在 ⇒ 这不是演示花园（或是版本号出现之前的老演示）⇒ **什么都不做**
   *     · key 存在但过期 ⇒ 确定是演示花园 ⇒ 重灌
   *   代价是版本号出现之前的老演示访客要手点一次「恢复演示数据」。
   *   这个代价有界，而反过来（误删用户自己的账）不可挽回。
   */
  const seedVer = (db.settings as Record<string, string>)?.demoSeedVersion
  if (opts.seedVersion && seedVer && seedVer !== opts.seedVersion) {
    db = { ...emptySnapshot(), ...opts.seed(Date.now()) }
    void persist.save(db)
  }

  let pending: Promise<void> | null = null
  let dirty = false

  function schedule() {
    dirty = true
    if (pending) return
    // 合并同一批 mutation：一次 loadData 会连发十几次写，攒到微任务末尾落一次盘
    pending = Promise.resolve().then(async () => {
      pending = null
      if (!dirty) return
      dirty = false
      try { await persist.save(db) } catch { /* 落盘失败不该让界面崩，内存里还是对的 */ }
    })
  }

  async function flush() {
    if (pending) await pending
    if (dirty) { dirty = false; try { await persist.save(db) } catch { /* 同上 */ } }
  }

  // ---- 通用小工具 ----
  const byId = (rows: any[], id: string) => rows.find(r => r.id === id)
  const ok = async () => { schedule(); return true }
  /** 返回深拷贝：上层 store 会 Object.assign / spread，别让它改到我们的权威对象 */
  const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v))

  function upd(rows: any[], id: string, data: any) {
    const row = byId(rows, id)
    if (row) Object.assign(row, data)
  }
  function del(rows: any[], pred: (r: any) => boolean) {
    for (let i = rows.length - 1; i >= 0; i--) if (pred(rows[i])) rows.splice(i, 1)
  }

  const noopSubscribe = (): (() => void) => () => {}

  const api: ElectronAPI = {
    ping: () => 'pong from web adapter',

    // 原生菜单在浏览器里不存在。返回反注册函数是接口约定的一部分，
    // MenuBridge 的 useEffect 清理时会调，返回 undefined 会在 StrictMode 双挂载时报错。
    onQuickAdd: noopSubscribe,
    onNavigate: noopSubscribe,
    onExportJSON: noopSubscribe,
    onExportCSV: noopSubscribe,
    onImportJSON: noopSubscribe,

    // ---- dimensions（排序对齐 SQLite: ORDER BY sortOrder） ----
    dbDimensionsGetAll: async () => clone([...db.dimensions].sort((a, b) => a.sortOrder - b.sortOrder)),
    dbDimensionsGet: async (id) => clone(byId(db.dimensions, id) ?? null),
    dbDimensionsAdd: async (row) => { db.dimensions.push({ ...row }); return ok() },
    dbDimensionsUpdate: async (id, data) => { upd(db.dimensions, id, data); return ok() },
    dbDimensionsDelete: async (id) => {
      // 级联，与主进程 deleteDimension 的事务同构
      del(db.score_rubrics, r => r.dimensionId === id)
      del(db.branches, r => r.dimensionId === id)
      del(db.goals, r => r.dimensionId === id)
      del(db.actions, r => r.dimensionId === id)
      del(db.dimensions, r => r.id === id)
      return ok()
    },

    // ---- score_rubrics（SQLite 无 ORDER BY，保持插入序） ----
    dbRubricsGetAll: async () => clone(db.score_rubrics),
    dbRubricsGetByDimension: async (dimId) => clone(db.score_rubrics.filter(r => r.dimensionId === dimId)),
    dbRubricsAdd: async (row) => { db.score_rubrics.push({ ...row }); return ok() },

    // ---- branches（ORDER BY sortOrder） ----
    dbBranchesGetAll: async () => clone([...db.branches].sort((a, b) => a.sortOrder - b.sortOrder)),
    dbBranchesGetByDimension: async (dimId) =>
      clone(db.branches.filter(b => b.dimensionId === dimId).sort((a, b) => a.sortOrder - b.sortOrder)),
    dbBranchesAdd: async (row) => { db.branches.push({ ...row }); return ok() },
    dbBranchesUpdate: async (id, data) => { upd(db.branches, id, data); return ok() },
    dbBranchesDelete: async (id) => {
      del(db.branches, b => b.parentId === id)   // 先删三度子分支
      del(db.branches, b => b.id === id)
      return ok()
    },

    // ---- goals ----
    dbGoalsGetAll: async () => clone(db.goals),
    dbGoalsGetByDimension: async (dimId) => clone(db.goals.filter(g => g.dimensionId === dimId)),
    dbGoalsAdd: async (row) => { db.goals.push({ ...row }); return ok() },
    dbGoalsUpdate: async (id, data) => { upd(db.goals, id, data); return ok() },
    dbGoalsDelete: async (id) => { del(db.goals, g => g.id === id); return ok() },

    // ---- actions（ORDER BY date DESC） ----
    dbActionsGetAll: async () => clone([...db.actions].sort((a, b) => b.date - a.date)),
    dbActionsGetByDimension: async (dimId) =>
      clone(db.actions.filter(a => a.dimensionId === dimId).sort((a, b) => b.date - a.date)),
    dbActionsAdd: async (row) => { db.actions.push({ ...row, mood: row.mood ?? '' }); return ok() },
    dbActionsUpdate: async (id, data) => { upd(db.actions, id, data); return ok() },
    dbActionsDelete: async (id) => { del(db.actions, a => a.id === id); return ok() },

    // ---- reviews（ORDER BY periodStart DESC） ----
    dbReviewsGetAll: async () => clone([...db.reviews].sort((a, b) => b.periodStart - a.periodStart)),
    dbReviewsAdd: async (row) => { db.reviews.push({ ...row }); return ok() },
    dbReviewsUpdate: async (id, data) => { upd(db.reviews, id, data); return ok() },
    dbReviewsDelete: async (id) => { del(db.reviews, r => r.id === id); return ok() },

    // ---- settings / snapshots / events ----
    dbSettingsGet: async (key) => (key in db.settings ? db.settings[key] : null),
    dbSettingsSet: async (key, value) => { db.settings[key] = String(value); return ok() },
    dbSettingsGetAll: async () => clone(db.settings),
    dbSnapshotsGetAll: async () => clone([...db.flower_snapshots].sort((a, b) => a.takenAt - b.takenAt)),
    dbSnapshotsAdd: async (row) => {
      // weekKey 在 SQLite 里是 UNIQUE + INSERT OR REPLACE：同一周重复拍只留最新一张
      del(db.flower_snapshots, s => s.weekKey === row.weekKey)
      db.flower_snapshots.push({ ...row })
      return ok()
    },
    dbEventsLog: async (name) => {
      const now = Date.now()
      // 与 SQLite 侧 v7 的 UNIQUE(name, at) + INSERT OR IGNORE 行为对齐：
      // 同名同毫秒的重复写入静默吞掉，两边口径必须一致，否则闸门在网页版会失效
      if (db.events.some(e => e.name === name && e.at === now)) return true
      const id = (db.events.at(-1)?.id ?? 0) + 1
      db.events.push({ id, name: String(name), at: now })
      return ok()
    },
    // 那些美妙时刻（v3.7）。只增不改 —— 主键重复静默吞掉，与 SQLite 的 INSERT OR IGNORE 对齐
    dbMomentsAdd: async (row) => {
      if (db.aha_moments.some(m => m.id === row.id)) return true
      db.aha_moments.push({ ...row, lines: [...(row.lines || [])] })
      return ok()
    },
    dbMomentsGetAll: async () => [...db.aha_moments].sort((a, b) => b.at - a.at),
    dbEventsHas: async (name) => db.events.some(e => e.name === name),
    dbEventsHasSince: async (name, since) => db.events.some(e => e.name === name && e.at >= since),
    dbEventsCountSince: async (name, since) => db.events.filter(e => e.name === name && e.at >= since).length,
    dbEventsClearPrefix: async (prefix) => {
      del(db.events as any[], e => String(e.name).startsWith(prefix))
      return ok()
    },

    appDbPath: async () => `浏览器本地存储（${storageLabel(persist.kind)}）· 不上传任何服务器`,

    // ---- quarterly / focus ----
    dbQuarterlyGetAll: async () => clone([...db.quarterly_reviews].sort((a, b) => b.startedAt - a.startedAt)),
    dbQuarterlyUpsert: async (row) => {
      const cur = byId(db.quarterly_reviews, row.id)
      if (cur) {
        // 对齐主进程 ON CONFLICT：id / startedAt 不动，其余覆盖
        Object.assign(cur, {
          completedAt: row.completedAt ?? null,
          actProgress: row.actProgress,
          scores: row.scores ?? '{}',
          reflections: row.reflections ?? '{}',
          focusDimensionIds: row.focusDimensionIds ?? '[]',
          intent: row.intent ?? '',
        })
      } else {
        db.quarterly_reviews.push({
          ...row,
          completedAt: row.completedAt ?? null,
          scores: row.scores ?? '{}',
          reflections: row.reflections ?? '{}',
          focusDimensionIds: row.focusDimensionIds ?? '[]',
          intent: row.intent ?? '',
        })
      }
      return ok()
    },
    dbQuarterlyDelete: async (id) => { del(db.quarterly_reviews, r => r.id === id); return ok() },
    dbFocusSet: async (ids) => {
      const now = Date.now()
      db.dimensions.forEach(d => { d.focusSince = null })
      ;(ids || []).slice(0, 2).forEach(id => { const d = byId(db.dimensions, id); if (d) d.focusSince = now })
      return ok()
    },

    // 清空后重新灌 demo 数据 —— 这就是演示版的「重置」。
    // Electron 版 clearAllData 之后灌的是空白骨架种子，两边职责不同，各自正确。
    dbClearAll: async () => {
      db = opts.seed(Date.now())
      return ok()
    },
  }

  async function reseed(seed: (now: number) => WebSnapshot) {
    db = seed(Date.now())
    schedule()
    await flush()
  }

  return { api, storageKind: persist.kind, flush, reseed }
}

export function storageLabel(kind: PersistKind): string {
  switch (kind) {
    case 'indexeddb': return 'IndexedDB'
    case 'localstorage': return 'localStorage · 降级'
    case 'memory': return '内存 · 刷新后重置'
  }
}
