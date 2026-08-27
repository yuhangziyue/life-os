// 网页演示版验收：起静态服务 → 用 Electron 的 Chromium 当浏览器打开 dist-web → 断言 + 截图。
//
//   node e2e/web-verify.mjs        （需先 npm run build:web）
//
// 验的四件事，缺一件这个 demo 就不能交：
//   1. IndexedDB shim 装上了，且用的是 IndexedDB 主路径而不是悄悄降级到内存
//   2. 八个维度的分数命中 demoSeed 里设计的目标值 —— 证明 impact 配平算对了
//   3. 写入真的落盘：写一条 → reload → 还在（内存档会在这一步露馅）
//   4. 三入口 + 五个二级页都渲染出内容且零控制台错误
//   5. v3.4/v3.5：持久化申请（A1）/ 存储真相（A3）/ manifest（A2）/ 窄屏三入口形态

import { spawn } from 'node:child_process'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { attach, sleep } from './cdp.mjs'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const OUT = path.join(root, 'dist-web')
const SHOTS = path.join(root, 'e2e', 'shots-web')
const PORT = 4180
// cdp.mjs 在模块顶层就把 PORT 定成 `process.env.CDP_PORT || 9333` 了 ——
// ESM import 是静态提升的，本文件没机会在它求值前改 env，所以只能跟它对齐，
// 不能在这里自选端口（第一版选了 9334，结果 attach 一直连 9333 空端口）。
const CDP_PORT = Number(process.env.CDP_PORT || 9333)

if (!fs.existsSync(path.join(OUT, 'index.html'))) {
  console.error('✗ dist-web/index.html 不存在，先跑 npm run build:web')
  process.exit(1)
}
fs.mkdirSync(SHOTS, { recursive: true })

// ---- 极简静态服务器（不引依赖：vite preview 会多一个进程要收） ----
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json',
  '.woff2': 'font/woff2', '.ico': 'image/x-icon',
}
const server = http.createServer((req, res) => {
  const clean = decodeURIComponent((req.url || '/').split('?')[0])
  let file = path.join(OUT, clean === '/' ? 'index.html' : clean)
  if (!file.startsWith(OUT)) { res.writeHead(403).end(); return }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(OUT, 'index.html')
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' })
  fs.createReadStream(file).pipe(res)
})
await new Promise(r => server.listen(PORT, '127.0.0.1', r))
console.log(`[web-verify] 静态服务 http://127.0.0.1:${PORT}/`)

// ---- 启 Electron 当浏览器 ----
const ELECTRON = path.join(root, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron')
const env = { ...process.env, WEB_URL: `http://127.0.0.1:${PORT}/` }
delete env.ELECTRON_RUN_AS_NODE          // 记忆里的老坑：留着它 Electron 永不开窗且不报错
const child = spawn(ELECTRON, ['e2e/web-host.cjs', `--remote-debugging-port=${CDP_PORT}`], {
  cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'],
})
child.stderr.on('data', d => {
  const s = String(d)
  if (!/DevTools listening|Secure coding|IMKClient|IMKInputSession/.test(s)) process.stderr.write(`[electron] ${s}`)
})

const results = []
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail })
  console.log(`  ${pass ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

let page
try {
  // 等 CDP 起来
  for (let i = 0; i < 40; i++) {
    try { page = await attach({ urlMatch: `127.0.0.1:${PORT}` }); break } catch { await sleep(500) }
  }
  if (!page) throw new Error(`CDP 连接失败：${CDP_PORT} 端口上没有匹配页面`)

  // 等 React 挂载 + loadData 完成（loading 态的文案消失即算就绪）
  let ready = false
  for (let i = 0; i < 40; i++) {
    const n = await page.eval('return document.querySelectorAll("aside, nav, [data-testid]").length')
    if (n > 0) { ready = true; break }
    await sleep(500)
  }
  check('React 挂载 + 首屏渲染', ready)

  // 幂等清场：IndexedDB 是**真的持久**的，上一轮留下的持久化探针会一直躺在库里，
  // 每轮把「职业发展」顶高 0.2 分 —— 于是「分数命中 demoSeed 设计值」会随运行次数漂移失败。
  // 这不是产品 bug，是这个脚本自己造的垃圾没收。清掉后重载，让 loadData 重算一遍分数。
  const stale = await page.eval(`
    const a = window.electronAPI
    const rows = await a.dbActionsGetAll()
    const junk = rows.filter(r => r.id === 'verify-persist-probe' || String(r.description || '').includes('持久化探针'))
    for (const r of junk) await a.dbActionsDelete(r.id)
    return junk.length`)
  if (stale > 0) {
    await sleep(400)
    await page.send('Page.reload', { ignoreCache: false })
    await sleep(2500)
    for (let i = 0; i < 30; i++) {
      if (await page.eval('return !!window.electronAPI')) break
      await sleep(200)
    }
  }
  check('清掉上一轮遗留的探针（保证本轮可重复）', true, stale > 0 ? `清了 ${stale} 条` : '无遗留')

  // ---- 1. shim 装上了，且没有悄悄降级 ----
  const ping = await page.eval('return window.electronAPI?.ping?.() ?? "(缺失)"')
  check('window.electronAPI 由 web shim 提供', ping === 'pong from web adapter', ping)

  const dbPath = await page.eval('return await window.electronAPI.appDbPath()')
  check('走 IndexedDB 主路径（非降级）', dbPath.includes('IndexedDB'), dbPath)

  // ---- 2. 分数命中设计值 ----
  // 读的是 loadData() 用 calculateScore 算完写回库的 currentScore，
  // 是真实链路的产物，不是这个脚本重算一遍公式自己验自己。
  const EXPECT = {
    职业发展: 7.4, 财务状况: 5.2, 个人成长: 8.0, 身心健康: 6.6,
    家庭关系: 6.0, 社交关系: 4.4, 休闲娱乐: 6.4, 精神成长: 4.0,
  }
  const dims = await page.eval('return await window.electronAPI.dbDimensionsGetAll()')
  check('八个维度都在', dims.length === 8, `实得 ${dims.length}`)
  const bad = dims
    .map(d => ({ name: d.name, got: Math.round(d.currentScore * 100) / 100, want: EXPECT[d.name] }))
    .filter(x => x.want == null || Math.abs(x.got - x.want) > 0.001)
  check('分数命中 demoSeed 设计值', bad.length === 0,
    bad.length ? bad.map(b => `${b.name} 期望${b.want} 实得${b.got}`).join('；')
               : dims.map(d => `${d.name}${d.currentScore.toFixed(1)}`).join(' '))

  const overall = dims.reduce((s, d) => s + d.currentScore, 0) / dims.length
  check('综合分在「舒展~盛放」区间', overall >= 5.5 && overall <= 7, overall.toFixed(2))

  // ---- 数据规模 ----
  const counts = await page.eval(`
    const a = window.electronAPI
    return {
      actions: (await a.dbActionsGetAll()).length,
      rubrics: (await a.dbRubricsGetAll()).length,
      branches: (await a.dbBranchesGetAll()).length,
      goals: (await a.dbGoalsGetAll()).length,
      reviews: (await a.dbReviewsGetAll()).length,
      quarterly: (await a.dbQuarterlyGetAll()).length,
      snapshots: (await a.dbSnapshotsGetAll()).length,
      focus: (await a.dbDimensionsGetAll()).filter(d => d.focusSince != null).length,
    }`)
  check('行动记录够撑起图表', counts.actions >= 80, `${counts.actions} 条`)
  check('分支树完整（8×16）', counts.branches === 128, `${counts.branches} 条`)
  check('评分标准完整（8×10）', counts.rubrics === 80, `${counts.rubrics} 条`)
  check('目标 / 复盘 / 会谈 / 定妆照都有', counts.goals > 0 && counts.reviews > 0 && counts.quarterly > 0 && counts.snapshots > 0,
    `goals ${counts.goals} · reviews ${counts.reviews} · 会谈 ${counts.quarterly} · 定妆照 ${counts.snapshots}`)
  check('焦点维度是 2 片', counts.focus === 2, `${counts.focus} 片`)

  // 沉睡机制有样本可看
  const dormant = await page.eval(`
    const a = window.electronAPI
    const acts = await a.dbActionsGetAll()
    const dims = await a.dbDimensionsGetAll()
    const DAY = 864e5, today = new Date(); today.setHours(0,0,0,0)
    return dims.filter(d => {
      const mine = acts.filter(x => x.dimensionId === d.id)
      if (!mine.length) return false
      const last = Math.max(...mine.map(x => x.date))
      return Math.floor((today.getTime() - last) / DAY) > 3
    }).map(d => d.name)`)
  check('留了沉睡花瓣做演示', dormant.length >= 1, dormant.join(',') || '(无)')

  // ---- 4. 七个页面逐个渲染 + 截图 ----
  const PAGES = [
    ['', '花'], ['#/today', '今天'], ['#/me', '我'],
    ['#/dimensions', '维度列表'], ['#/actions', '行动记录'],
    ['#/stats', '细看数据'], ['#/review', '周对账'], ['#/handbook', '花语'],
  ]
  for (const [hash, label] of PAGES) {
    await page.eval(`location.hash = ${JSON.stringify(hash)}; return 1`)
    await sleep(900)
    const info = await page.eval(`
      const m = document.querySelector('main')
      return { text: (m?.innerText || '').trim().length, h1: document.querySelector('h1')?.innerText || '' }`)
    check(`${label} 渲染出内容`, info.text > 120, `${info.text} 字符 · h1「${info.h1}」`)
    await page.shot(path.join(SHOTS, `${label}.png`))
  }

  // ---- 3. 持久化：写一条 → reload → 还在 ----
  await page.eval(`
    const a = window.electronAPI
    const today = new Date(); today.setHours(0,0,0,0)
    await a.dbActionsAdd({
      id: 'verify-persist-probe', date: today.getTime(), description: '持久化探针',
      quality: 'minor', impact: 1, isCompleted: 1,
      createdAt: Date.now(), updatedAt: Date.now(),
      dimensionId: (await a.dbDimensionsGetAll())[0].id, branchId: null, goalId: null, mood: '',
    })
    return 1`)
  await sleep(400)                                    // 让 debounce 落盘跑完
  await page.send('Page.reload', { ignoreCache: false })
  await sleep(2500)
  const survived = await page.eval(`
    for (let i = 0; i < 30; i++) {
      if (window.electronAPI) break
      await new Promise(r => setTimeout(r, 200))
    }
    const rows = await window.electronAPI.dbActionsGetAll()
    return rows.some(r => r.id === 'verify-persist-probe')`)
  check('写入刷新后仍在（IndexedDB 真落盘）', survived === true, survived ? '' : '刷新后丢失 —— 疑似降级到内存档')

  // 收自己的垃圾：探针留在库里会把下一轮的分数断言顶偏
  await page.eval(`
    const rows = await window.electronAPI.dbActionsGetAll()
    for (const r of rows.filter(x => x.id === 'verify-persist-probe')) {
      await window.electronAPI.dbActionsDelete(r.id)
    }
    return 1`)
  await sleep(400)

  // ---- v3.5 / v3.4：三入口 · 存储真相 · PWA ----
  //
  // 网页版是本轮的分发主线，所以这三件事在这里必须被真的验一遍：
  //   ① 三入口在窄屏成立（小红书来的人 90% 用手机）
  //   ② 存储真相如实呈现（A3）—— 账本会丢这件事不许含糊
  //   ③ 持久化申请真的发了（A1）+ manifest 真的能被解析（A2）
  await page.eval(`location.hash = ''; return 1`)
  await sleep(900)

  const persisted = await page.eval(`
    const w = window.__lifeosWeb
    if (!w) return { present: false }
    const api = !!(navigator.storage && navigator.storage.persist)
    return { present: true, kind: w.kind, persisted: w.persisted, api, standalone: w.standalone }
  `)
  check('存储状态已初始化并挂在 window.__lifeosWeb（A1）', persisted.present === true, JSON.stringify(persisted))
  check('走 IndexedDB 且已发出持久化申请', persisted.kind === 'indexeddb' && persisted.persisted !== null,
        `kind=${persisted.kind} persisted=${persisted.persisted}`)

  const truth = await page.eval(`
    location.hash = '#/me'
    await new Promise(r => setTimeout(r, 900))
    const el = document.querySelector('[data-testid="storage-truth"]')
    const about = document.querySelector('[data-testid="about-section"]')?.innerText || ''
    return {
      shown: !!el,
      text: el?.innerText || '',
      meta: document.querySelector('[data-testid="storage-meta"]')?.innerText || '',
      aboutMentionsSqlite: /SQLite/i.test(about),
    }
  `)
  check('「我」页给出存储真相（A3）', truth.shown === true)
  check('明说「清缓存会一并清掉」——不承诺做不到的事',
        /清缓存|清理缓存/.test(truth.text) && /清掉/.test(truth.text),
        truth.text.replace(/\n/g, ' / ').slice(0, 100))
  check('如实报出存储层与持久化状态', /IndexedDB|indexeddb/.test(truth.meta), truth.meta)
  check('网页版「关于」不再照抄桌面版的 SQLite 承诺', truth.aboutMentionsSqlite === false,
        truth.aboutMentionsSqlite ? '仍在承诺 SQLite 文件' : '')
  await page.shot(path.join(SHOTS, '我-存储真相.png'))

  const pwa = await page.eval(`
    const link = document.querySelector('link[rel="manifest"]')
    if (!link) return { linked: false }
    const res = await fetch(link.getAttribute('href'))
    const mf = await res.json()
    return { linked: true, ok: res.ok, name: mf.name, display: mf.display, icons: (mf.icons||[]).length, start: mf.start_url }
  `)
  check('manifest 被引用且可解析（A2）', pwa.linked && pwa.ok && pwa.display === 'standalone',
        JSON.stringify(pwa))

  // 窄屏形态：底栏三入口 + FAB
  await page.send('Emulation.setDeviceMetricsOverride',
    { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
  await page.eval(`location.hash = ''; return 1`)
  await sleep(1000)
  const mobile = await page.eval(`
    const vis = el => !!el && getComputedStyle(el).display !== 'none'
    const bar = document.querySelector('[data-testid="mobile-tabbar"]')
    return {
      tabs: bar ? bar.querySelectorAll('a').length : 0,
      barVisible: vis(bar),
      fabVisible: vis(document.querySelector('[data-testid="mobile-fab"]')),
      asideHidden: !vis(document.querySelector('aside')),
      noSideScroll: document.documentElement.scrollWidth <= window.innerWidth + 1,
    }
  `)
  check('手机尺寸下出底栏三入口 + FAB', mobile.barVisible && mobile.tabs === 3 && mobile.fabVisible,
        JSON.stringify(mobile))
  check('手机尺寸下侧栏收起且页面不横向溢出', mobile.asideHidden && mobile.noSideScroll, JSON.stringify(mobile))
  await page.shot(path.join(SHOTS, '手机-花.png'))
  await page.eval(`location.hash = '#/today'; return 1`)
  await sleep(900)
  await page.shot(path.join(SHOTS, '手机-今天.png'))
  await page.eval(`location.hash = '#/me'; return 1`)
  await sleep(900)
  await page.shot(path.join(SHOTS, '手机-我.png'))
  await page.send('Emulation.clearDeviceMetricsOverride')
  await page.eval(`location.hash = ''; return 1`)
  await sleep(700)

  // ---- 演示浮标在位 ----
  const badge = await page.eval(`
    return { toggle: !!document.querySelector('#demo-badge-toggle'),
             reset: (document.querySelector('#demo-badge-toggle')?.click(), !!document.querySelector('#demo-reset')) }`)
  check('演示浮标 + 重置入口在位', badge.toggle && badge.reset, JSON.stringify(badge))
  await sleep(300)
  await page.shot(path.join(SHOTS, '演示浮标.png'))

  // ---- 零控制台错误 ----
  const errs = page.consoleLogs.filter(l => l.type === 'error').map(l => l.text)
  const fatal = [...page.pageErrors, ...errs].filter(t =>
    // 探针本身不算，DevTools 的 autofill 噪声也不算
    !/verify-persist-probe|Autofill\.enable|Request Autofill/.test(t))
  check('无控制台错误 / 未捕获异常', fatal.length === 0, fatal.slice(0, 3).join(' | '))

} catch (e) {
  check('脚本执行', false, e.message)
} finally {
  try { await page?.close() } catch {}
  child.kill('SIGTERM')
  server.close()
}

const failed = results.filter(r => !r.pass)
console.log(`\n${'─'.repeat(64)}`)
console.log(`通过 ${results.length - failed.length}/${results.length}   截图 → e2e/shots-web/`)
if (failed.length) {
  console.log(`\n未通过：`)
  failed.forEach(f => console.log(`  ✗ ${f.name}${f.detail ? ` — ${f.detail}` : ''}`))
}
console.log(`${'─'.repeat(64)}\n`)
process.exit(failed.length ? 1 : 0)
