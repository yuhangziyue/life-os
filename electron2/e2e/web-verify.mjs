// 网页演示版验收：起静态服务 → 用 Electron 的 Chromium 当浏览器打开 dist-web → 断言 + 截图。
//
//   node e2e/web-verify.mjs        （需先 npm run build:web）
//
// 验的四件事，缺一件这个 demo 就不能交：
//   1. IndexedDB shim 装上了，且用的是 IndexedDB 主路径而不是悄悄降级到内存
//   2. 八个维度的分数命中 demoSeed 里设计的目标值 —— 证明 impact 配平算对了
//   3. 写入真的落盘：写一条 → reload → 还在（内存档会在这一步露馅）
//   4. 七个页面都渲染出内容且零控制台错误

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
    ['', '首页-仪表盘'], ['#/dimensions', '维度列表'], ['#/actions', '行动记录'],
    ['#/stats', '统计分析'], ['#/review', '复盘'], ['#/handbook', '手册'], ['#/settings', '设置'],
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
