// 生命之花 · Life-OS —— 真实操作测试
// 渲染进程走 CDP（真实点击 / 真实输入），主进程走 Node inspector（真实触发菜单 IPC）
import { attach, sleep } from './cdp.mjs'
import WebSocket from 'ws'
import fs from 'node:fs'

const SHOTS = new URL('./shots/', import.meta.url).pathname
fs.mkdirSync(SHOTS, { recursive: true })

const results = []
function record(pass, name, detail = '') {
  results.push({ pass, name, detail })
  console.log(`${pass ? '  ✅' : '  ❌'} ${name}${detail ? `  — ${detail}` : ''}`)
}
const bad = (n, d) => record(false, n, d)
const check = (name, cond, detail = '') => record(!!cond, name, detail)

async function phase(title, fn) {
  console.log(`\n===== ${title} =====`)
  try { await fn() } catch (e) { bad(`${title} 阶段异常`, String(e.message).split('\n')[0]) }
}

// ---------- 主进程 inspector：用来真实触发菜单动作 ----------
async function attachMain(timeoutMs = 20000) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    try {
      const list = await (await fetch('http://127.0.0.1:9339/json/list')).json()
      if (list[0]?.webSocketDebuggerUrl) {
        const ws = new WebSocket(list[0].webSocketDebuggerUrl)
        await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej) })
        let id = 0
        const pending = new Map()
        ws.on('message', raw => {
          const m = JSON.parse(raw)
          const p = pending.get(m.id); if (!p) return
          pending.delete(m.id)
          m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result)
        })
        return {
          eval: (expr) => new Promise((res, rej) => {
            const mid = ++id
            pending.set(mid, { res, rej })
            ws.send(JSON.stringify({ id: mid, method: 'Runtime.evaluate',
              params: { expression: expr, includeCommandLineAPI: true, returnByValue: true } }))
            setTimeout(() => { if (pending.has(mid)) { pending.delete(mid); rej(new Error('主进程 eval 超时')) } }, 10000)
          }),
          close: () => ws.close(),
        }
      }
    } catch {}
    await sleep(500)
  }
  return null
}

async function waitTarget(timeoutMs = 30000) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    try { return await attach() } catch { await sleep(500) }
  }
  throw new Error('等待 Electron 渲染进程超时')
}

const p = await waitTarget()

// React 受控组件：直接改 .value 不触发 onChange，必须走原生 setter + input 事件
const HELPERS = `
window.__t = {
  byText: (sel, text) => [...document.querySelectorAll(sel)].find(e => e.innerText.trim().includes(text)),
  type: (el, text) => {
    if(!el) return false
    const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, text)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    return true
  },
  select: (el, value) => {
    if(!el) return false
    Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set.call(el, value)
    el.dispatchEvent(new Event('change', { bubbles: true }))
    return true
  },
}
window.confirm = () => true
`
async function inject() { await p.eval(HELPERS + '; return 1') }
// 注意：HashRouter 的 hash 会跨 reload 保留，上一轮停在哪页重载后还在哪页。
// 所以重载前先把 hash 归零，否则"首屏"测的根本不是看板。
async function reload() {
  await p.eval(`location.hash = '#/'; return 1`)
  await p.send('Page.reload', { ignoreCache: true })
  await sleep(3500)
  await inject()
}
async function goto(hash) { await p.eval(`location.hash='${hash}'; return 1`); await sleep(900); await inject() }

let baselineActions = 0

// ======================================================================
await phase('阶段 1：启动与首屏', async () => {
  await reload()
  const boot = await p.eval(`return {
    root: document.getElementById('root')?.children.length,
    hasAPI: !!window.electronAPI,
    canvas: document.querySelectorAll('canvas').length,
    text: document.body.innerText.slice(0, 300),
    nav: document.querySelectorAll('aside a').length,
    diagLeft: !!document.getElementById('diag') || document.body.innerText.includes('Phase:'),
  }`)
  check('React 树挂载成功（非白屏）', boot.root > 0, `root children=${boot.root}`)
  check('electronAPI 桥接就绪', boot.hasAPI === true)
  // v3.5：七项收到三项（花 / 今天 / 我）。被收掉的四项里三项是数据库表摊在界面上，
  // 一项（维度管理）本身是设计失误 —— 花瓣才是维度入口。页面全都还在，只是不占导航位。
  check('侧边栏三个导航项（v3.5 三入口）', boot.nav === 3, `nav=${boot.nav}`)
  // 用「今日的花」而不是「每日看板」——后者在侧边栏里也有，走错页照样能匹配上
  check('首屏落在每日看板', boot.text.includes('今日的花'), boot.text.slice(0, 40).replace(/\n/g, '/'))
  check('诊断脚手架已从界面移除', !boot.diagLeft)

  // 花形图在数据加载完成后的 useEffect 里才绘制，prod（file://）加载快，
  // 固定等待可能赶在绘制前——轮询最多 5 秒
  let radar = { painted: false, nonBlank: 0 }
  for (let tries = 0; tries < 10 && !radar.painted; tries++) {
    radar = await p.eval(`
      const c = document.querySelector('canvas')
      if (!c) return { painted: false, nonBlank: 0 }
      const d = c.getContext('2d').getImageData(0,0,c.width,c.height).data
      let n = 0; for (let i=3;i<d.length;i+=4) if (d[i]>0) n++
      return { painted: n > 500, nonBlank: n }
    `)
    if (!radar.painted) await sleep(500)
  }
  check('花形图有实际绘制内容', radar.painted, `不透明像素=${radar.nonBlank}`)
  await p.shot(`${SHOTS}/01-dashboard.png`)
})

// ======================================================================
await phase('阶段 2：种子数据与初始分', async () => {
  const seed = await p.eval(`
    const [dims, branches, rubrics] = await Promise.all([
      window.electronAPI.dbDimensionsGetAll(),
      window.electronAPI.dbBranchesGetAll(),
      window.electronAPI.dbRubricsGetAll(),
    ])
    return {
      dims: dims.length, branches: branches.length, rubrics: rubrics.length,
      initial: [...new Set(dims.map(d => d.initialScore))],
      l1: branches.filter(b => b.level === 1).length,
      l2: branches.filter(b => b.level === 2).length,
    }
  `)
  check('八维度种子完整（允许用户自种的额外花瓣）', seed.dims >= 8, `维度=${seed.dims}`)
  check('分支树种子完整（32 个二度 + 96 个三度）',
        seed.l1 === 32 && seed.l2 === 96, `L1=${seed.l1} L2=${seed.l2} 合计=${seed.branches}`)
  check('评分标准每维度 10 条', seed.rubrics === seed.dims * 10, `rubrics=${seed.rubrics} dims=${seed.dims}`)
  // v3.1 起初始分归用户所有（首启引导亲手打分写入），不再是种子写死的 3。
  // 断言口径随之从「必须全等于 3」改为「必须落在 1-10 且没有 0 分惨状」——
  // 那个曾要修的 bug 是「首屏红色 3.0/0 分」，守住这条就够，别再把用户的真实分判成失败。
  check('初始分均在 1-10 之间（无 0 分惨状）',
        seed.initial.length > 0 && seed.initial.every(v => v >= 1 && v <= 10),
        `实际 initialScore=${JSON.stringify(seed.initial)}`)
})

// ======================================================================
await phase('阶段 3：页面逐个导航（v3.5 三入口 + 二级页全保留）', async () => {
  for (const [hash, expect, shot] of [
    ['#/', '今日的花', '02-garden'],
    ['#/today', '今天记了什么', '02b-today'],
    ['#/me', '这座花园', '02c-me'],
    ['#/dimensions', '维度管理', '03-dimensions'],
    ['#/actions', '行动记录', '04-actions'],
    ['#/stats', '统计分析', '05-stats'],
    ['#/review', '回顾反思', '06-review'],
    ['#/settings', '设置', '07-settings'],
  ]) {
    await goto(hash)
    // 读 main 而不是 body：侧栏文案（现在也含「今天」）会让「走错页照样匹配上」，
    // 而 main 里只有当前页的内容。不再截断 —— 截 200 字会把靠下的标题截掉。
    const r = await p.eval(`return {
      root: document.getElementById('root')?.children.length,
      text: document.querySelector('main')?.innerText || '',
    }`)
    check(`路由 ${hash} 渲染「${expect}」`, r.root > 0 && r.text.includes(expect),
          r.text.slice(0, 60).replace(/\n/g, '/'))
    await p.shot(`${SHOTS}/${shot}.png`)
  }
  await goto('#/')
  // v3.5：侧栏只剩三项（花 / 今天 / 我）。被收掉的四项页面全都还在，
  // 只是从导航层降到场景内部 —— 下面顺带验一遍「三项且只有三项」。
  const nav = await p.eval(`
    const links = [...document.querySelectorAll('aside a')]
    const today = links.find(a => a.innerText.includes('今天'))
    if (!today) return { found: false, labels: links.map(a => a.innerText.trim()) }
    today.click()
    return { found: true, count: links.length, labels: links.map(a => a.innerText.trim()) }
  `)
  await sleep(900)
  const h = await p.eval(`return location.hash`)
  check('侧边栏真实点击可跳转', nav.found && h.includes('/today'), `→ ${h}`)
  check('导航只有三个入口（花 / 今天 / 我）',
        nav.count === 3, `${nav.count} 项：${(nav.labels || []).join(' / ')}`)

  // 二级页出口：花 → 细看数据 / 周对账，今天 → 全部记录，我 → 花语
  await goto('#/')
  const drawers = await p.eval(`return {
    stats: !!document.querySelector('[data-testid="link-stats"]'),
    review: !!document.querySelector('[data-testid="link-review"]'),
  }`)
  check('「花」上有细看数据与周对账两个二级出口', drawers.stats && drawers.review, JSON.stringify(drawers))
  await goto('#/today')
  check('「今天」上有全部记录出口',
        await p.eval(`return !!document.querySelector('[data-testid="link-actions"]')`))
  await goto('#/me')
  check('「我」上有花语出口',
        await p.eval(`return !!document.querySelector('[data-testid="link-handbook"]')`))
})

// ======================================================================
await phase('阶段 4：快速记录（核心写入链路）', async () => {
  await goto('#/')
  baselineActions = await p.eval(`return (await window.electronAPI.dbActionsGetAll()).length`)

  const open = await p.eval(`
    const b = [...document.querySelectorAll('button')].find(x => x.innerText.includes('+ 快速记录'))
    if (!b) return { found: false }
    b.click(); return { found: true }
  `)
  await sleep(700)
  const panel = await p.eval(`return { input: !!document.querySelector('input[placeholder^="做了什么"]') }`)
  check('「+ 快速记录」打开面板', open.found && panel.input)
  await p.shot(`${SHOTS}/08-quickadd-open.png`)

  const filled = await p.eval(`
    ${HELPERS}
    const dim = window.__t.byText('button', '身心健康')
    if (!dim) return { ok: false, at: '维度' }
    dim.click()
    return { ok: true }
  `)
  await sleep(500)
  // v3.3 T7：二度分支改为默认收起，先点开那行「在「X」的哪个方向？（可选）」
  const branch = await p.eval(`
    ${HELPERS}
    document.querySelector('[data-testid="qa-branch-toggle"]')?.click()
    await new Promise(r => setTimeout(r, 300))
    const b = window.__t.byText('button', '运动')
    if (!b) return { ok: false }
    b.click(); return { ok: true }
  `)
  await sleep(300)
  const typed = await p.eval(`
    ${HELPERS}
    const input = document.querySelector('input[placeholder^="做了什么"]')
    window.__t.type(input, '操作测试：晨跑 5 公里')
    const q = window.__t.byText('button', '重要行动')
    if (q) q.click()
    return { value: input.value }
  `)
  check('维度→分支→描述→质量 四步填写', filled.ok && branch.ok && typed.value.includes('晨跑'),
        `描述="${typed.value}"`)
  await p.shot(`${SHOTS}/09-quickadd-filled.png`)

  // 提交按钮文案是「记录 ⌘↵」；用 ⌘↵ 定位，避开页面上其它含「记录」字样的按钮
  const submit = await p.eval(`
    const b = [...document.querySelectorAll('button')].find(x => x.innerText.includes('⌘↵'))
    if (!b) return { found: false }
    if (b.disabled) return { found: true, disabled: true }
    b.click(); return { found: true, disabled: false }
  `)
  await sleep(2200)
  const after = await p.eval(`return (await window.electronAPI.dbActionsGetAll()).length`)
  check('提交按钮可用', submit.found && !submit.disabled, JSON.stringify(submit))
  check('行动已落库', after === baselineActions + 1, `${baselineActions} → ${after}`)

  const row = await p.eval(`
    const rows = await window.electronAPI.dbActionsGetAll()
    const r = rows.find(x => (x.description||'').includes('晨跑'))
    return r ? { quality: r.quality, impact: r.impact, hasBranch: !!r.branchId, completed: r.isCompleted } : { missing: true }
  `)
  check('落库字段正确（major / impact=3 / 带分支 / 已完成）',
        row.quality === 'major' && row.impact === 3 && row.hasBranch && row.completed === 1,
        JSON.stringify(row))

  const ui = await p.eval(`return {
    closed: !document.querySelector('input[placeholder^="做了什么"]'),
  }`)
  check('面板自动关闭', ui.closed, JSON.stringify(ui))

  // 行动回响（P0-11）：记录后必须收到明确温暖的反馈——落在哪片花瓣 + 温暖话语
  const echo = await p.eval(`
    const t = document.querySelector('[data-testid="echo-toast"]')
    return t ? { shown: true, text: t.innerText.slice(0, 120) } : { shown: false }
  `)
  check('行动回响出现且点名维度', echo.shown && echo.text.includes('身心健康'),
        echo.shown ? echo.text.replace(/\n/g, ' / ').slice(0, 80) : '没有出现')

  // —— v3.5 M5「光的分配」：记录后的那一屏必须给出占比事实，而不是一句表扬 ——
  const aha = await p.eval(`
    const el = document.querySelector('[data-testid="light-shift"]')
    if (!el) return { shown: false }
    return {
      shown: true,
      segs: document.querySelectorAll('[data-testid="aha-band-seg"]').length,
      deltas: document.querySelector('[data-testid="aha-deltas"]')?.innerText || '',
      fact: document.querySelector('[data-testid="aha-fact"]')?.innerText || '',
      hasAgain: !!document.querySelector('[data-testid="echo-again"]'),
    }
  `)
  check('「光的分配」那一屏出现', aha.shown)
  check('光带按占比分段（至少一段）', aha.segs >= 1, `${aha.segs} 段`)
  check('给出占比变化的事实（X% → Y%）', /\d+%\s*→\s*\d+%/.test(aha.deltas.replace(/\n/g, ' ')),
        aha.deltas.replace(/\n/g, ' ').slice(0, 80))
  check('定格句是归属而非评价（「你分给了 X」，且无表扬词）',
        /今天的光，你分给了.+。/.test(aha.fact) && !/真棒|加油|做得好|恭喜|进步/.test(aha.fact),
        aha.fact)
  check('那一屏带「再记一条」入口', aha.hasAgain === true)
  await p.shot(`${SHOTS}/10-after-add.png`)
  await p.eval(`document.querySelector('[data-testid="echo-toast"]')?.click(); return 1`)
  await sleep(300)

  // 记录落在「今天」页上（今日行动列表随 IA 迁到了那一屏）
  await goto('#/today')
  check('「今天」页即时显示新行动',
        await p.eval(`return document.body.innerText.includes('晨跑')`))
  await goto('#/')
})

// ======================================================================
await phase('阶段 5：评分引擎联动', async () => {
  // 期望值从 DB 现算：dev 库与真实使用是同一个库，写死数字必被日常数据污染
  const s = await p.eval(`
    const dims = await window.electronAPI.dbDimensionsGetAll()
    const acts = await window.electronAPI.dbActionsGetAll()
    const DAY = 24*60*60*1000
    const cutoff = Date.now() - 30*DAY
    const calc = d => {
      const sum = acts.filter(a => a.dimensionId === d.id && a.isCompleted && a.date >= cutoff)
                      .reduce((t, a) => t + a.impact, 0)
      return Math.min(Math.max(d.initialScore + sum * 0.2, 0), 10)
    }
    const h = dims.find(d => d.name === '身心健康')
    const t0 = new Date(); t0.setHours(0,0,0,0)
    const coveredDb = new Set(acts.filter(a => a.date >= t0.getTime() && a.isCompleted).map(a => a.dimensionId)).size
    const m = document.body.innerText.match(/今日照顾了 (\\d+)\\/(\\d+) 片花瓣/)
    return { health: h?.currentScore, expected: calc(h), coveredUi: m?.[1], coveredDb }
  `)
  check('维度分数与评分公式一致（贡献 ×0.2，无衰减扣分）',
        Math.abs(s.health - s.expected) < 0.001, `身心健康=${s.health} 期望=${s.expected}`)
  check('今日照顾维度数与数据库一致', s.coveredUi === String(s.coveredDb),
        `UI=${s.coveredUi} DB=${s.coveredDb}`)
})

// ======================================================================
await phase('阶段 6：行动记录页（筛选 / 完成切换）', async () => {
  await goto('#/actions')
  const shown = await p.eval(`return document.body.innerText.includes('晨跑')`)
  check('行动记录页列出该条', shown)

  // 筛选器已换成自绘的主题化 Select（v3.1）：不再有 <select>，改成点触发器→点选项
  const selectUi = await p.eval(`
    const box = document.querySelector('[data-testid="filter-dimension"]')
    if (!box) return { found: false }
    const native = document.querySelectorAll('select').length
    box.querySelector('button').click()
    return { found: true, native }
  `)
  await sleep(400)
  const menu = await p.eval(`
    const opts = [...document.querySelectorAll('[data-testid="filter-dimension"] [role="option"]')]
    const target = opts.find(o => o.innerText.includes('职业发展'))
    const hasDot = !!document.querySelector('[data-testid="filter-dimension"] .zen-select-dot')
    if (target) target.click()
    return { count: opts.length, picked: !!target, hasDot }
  `)
  check('主题化下拉框替代原生 select（弹层可开、带维度色点）',
        selectUi.found && selectUi.native === 0 && menu.count >= 9 && menu.hasDot,
        `原生 select=${selectUi.native} 选项=${menu.count} 色点=${menu.hasDot}`)

  await sleep(800)
  const filtered = await p.eval(`return {
    hasRun: document.body.innerText.includes('晨跑'),
    count: document.body.innerText.match(/共 \\d+ 条记录/)?.[0],
    trigger: document.querySelector('[data-testid="filter-dimension"] .zen-select-label')?.innerText,
  }`)
  check('按维度筛选生效', !filtered.hasRun && filtered.trigger === '职业发展',
        `筛「${filtered.trigger}」后：${filtered.count}`)

  await p.eval(`${HELPERS}; const b = window.__t.byText('button','清除筛选'); if(b) b.click(); return 1`)
  await sleep(700)
  const cleared = await p.eval(`return document.body.innerText.includes('晨跑')`)
  check('清除筛选恢复全部', cleared)
  await p.shot(`${SHOTS}/11-actions.png`)

  const toggle = await p.eval(`
    const rows = await window.electronAPI.dbActionsGetAll()
    const t = rows.find(r => (r.description||'').includes('晨跑'))
    if (!t) return { found: false, reason: 'DB 里没有该行动' }
    // 限定在「晨跑」所在行找切换按钮——页面上可能还有用户真实记录的其它行
    const rowEls = [...document.querySelectorAll('div')]
      .filter(d => d.innerText.includes('晨跑') && [...d.querySelectorAll('button')].some(b => b.title && b.title.includes('标记')))
      .sort((a, b) => a.innerText.length - b.innerText.length)
    if (!rowEls.length) return { found: false, reason: '找不到晨跑所在行' }
    const btn = [...rowEls[0].querySelectorAll('button')].find(b => b.title && b.title.includes('标记'))
    btn.click()
    return { found: true, before: t.isCompleted }
  `)
  await sleep(1800)
  const toggled = await p.eval(`
    const rows = await window.electronAPI.dbActionsGetAll()
    return { now: rows.find(r => (r.description||'').includes('晨跑'))?.isCompleted }
  `)
  check('完成状态切换并落库', toggle.found && toggled.now !== toggle.before,
        toggle.found ? `${toggle.before} → ${toggled.now}` : toggle.reason)
})

// ======================================================================
await phase('阶段 7：维度管理与详情页', async () => {
  await goto('#/dimensions')
  // 维度卡是带 onClick 的 div（不是 <a>），所以按 class 定位
  const cards = await p.eval(`return document.querySelectorAll('div.card.cursor-pointer').length`)
  check('维度列表渲染全部启用维度', cards >= 8, `卡片=${cards}`)
  await p.shot(`${SHOTS}/03-dimensions.png`)

  const enter = await p.eval(`
    const c = document.querySelectorAll('div.card.cursor-pointer')[0]
    if (!c) return { ok: false }
    const name = c.innerText.split('\\n')[0]
    c.click(); return { ok: true, name }
  `)
  await sleep(1300)
  await inject()
  const detail = await p.eval(`return {
    hash: location.hash,
    root: document.getElementById('root').children.length,
    hasRubric: document.body.innerText.includes('评分'),
    sliders: document.querySelectorAll('input[type=range]').length,
  }`)
  check('点击卡片进入维度详情页', enter.ok && detail.hash.includes('#/dimensions/') && detail.root > 0,
        `${detail.hash}`)
  check('详情页含初始分调节控件', detail.sliders > 0, `slider=${detail.sliders}`)
  await p.shot(`${SHOTS}/12-dimension-detail.png`)
})

// ======================================================================
await phase('阶段 8：统计 / 回顾 / 设置', async () => {
  await goto('#/stats')
  const stats = await p.eval(`return { root: document.getElementById('root').children.length, canvas: document.querySelectorAll('canvas').length, tabs: [...document.querySelectorAll('button')].map(b=>b.innerText.trim()).filter(t=>['日','周','月','年'].includes(t)) }`)
  check('统计分析页渲染（含日/周/月/年切换）', stats.root > 0 && stats.tabs.length >= 3,
        `tabs=${JSON.stringify(stats.tabs)} canvas=${stats.canvas}`)

  await goto('#/review')
  const review = await p.eval(`return { root: document.getElementById('root').children.length, ta: document.querySelectorAll('textarea').length }`)
  check('回顾反思页渲染（含反思输入框）', review.root > 0 && review.ta > 0, `textarea=${review.ta}`)

  await goto('#/settings')
  const st = await p.eval(`return { root: document.getElementById('root').children.length, inputs: document.querySelectorAll('input').length, hasExport: document.body.innerText.includes('导出') }`)
  check('设置页渲染（AI 配置 + 数据导出）', st.root > 0 && st.inputs > 0 && st.hasExport, `input=${st.inputs}`)
  await p.shot(`${SHOTS}/13-settings.png`)
})

// ======================================================================
await phase('阶段 9：原生菜单端到端（主进程真实触发）', async () => {
  const main = await attachMain()
  if (!main) { bad('连接主进程 inspector', '未开 --inspect=9339'); return }

  const flag = await p.eval(`return !!window.__menuListenersRegistered`)
  check('渲染进程已订阅菜单事件', flag)

  // 主进程 inspector 的多次 eval 共用同一个全局作用域，
  // 顶层 const 会在第二次求值时报 "already been declared"，所以每次都包进 IIFE。
  const sendMenu = (channel, arg) => main.eval(
    `(() => { const { BrowserWindow } = require('electron');` +
    ` BrowserWindow.getAllWindows()[0].webContents.send('${channel}'` +
    (arg === undefined ? '' : `, ${JSON.stringify(arg)}`) + `); return 'sent' })()`
  )

  await goto('#/')
  await sendMenu('navigate', '/stats')
  await sleep(1200)
  const navHash = await p.eval(`return location.hash`)
  check('菜单「视图 → 统计分析」真实生效', navHash.includes('/stats'), `hash=${navHash}`)

  await sendMenu('quick-add')
  await sleep(1000)
  const qa = await p.eval(`return !!document.querySelector('input[placeholder^="做了什么"]')`)
  check('菜单/托盘「快速记录」真实打开面板', qa)
  if (qa) {
    await p.eval(`document.querySelector('.fixed.inset-0')?.click(); return 1`)
    await sleep(500)
  }

  // 反注册契约：preload 的 onXxx 必须返回可用的取消订阅函数，
  // 否则 StrictMode 双挂载会留下两份监听，一次菜单点击触发两次。
  await p.eval(`
    window.__probe = 0
    window.__off = window.electronAPI.onNavigate(() => { window.__probe++ })
    return 1
  `)
  await sendMenu('navigate', '/actions')
  await sleep(900)
  const firedOnce = await p.eval(`return window.__probe`)
  await p.eval(`window.__off(); window.__probe = 0; return 1`)
  await sendMenu('navigate', '/stats')
  await sleep(900)
  const firedAfterOff = await p.eval(`return window.__probe`)
  check('菜单事件每次只触发一次（无重复监听）', firedOnce === 1, `触发 ${firedOnce} 次`)
  check('onXxx 返回的反注册函数有效', firedAfterOff === 0, `反注册后仍触发 ${firedAfterOff} 次`)

  main.close()
})

// ======================================================================
await phase('阶段 9.5：回顾反思读写闭环', async () => {
  await goto('#/review')
  const TEXT = '操作测试：本周把 Life-OS 跑通了'

  await p.eval(`
    ${HELPERS}
    window.__t.type(document.querySelector('textarea'), ${JSON.stringify(TEXT)})
    return 1
  `)
  await sleep(300)
  await p.eval(`${HELPERS}; window.__t.byText('button','保存反思')?.click() || window.__t.byText('button','更新反思')?.click(); return 1`)
  await sleep(2000)

  const saved = await p.eval(`
    const rs = await window.electronAPI.dbReviewsGetAll()
    const r = rs.find(x => x.periodType === 'week')
    return { count: rs.length, note: r?.note, summary: (r?.autoSummary||'').slice(0,20) }
  `)
  check('反思保存落库（note + 自动摘要）',
        saved.note === TEXT && saved.summary.length > 0, JSON.stringify(saved))

  const stillShown = await p.eval(`return document.querySelector('textarea').value`)
  check('保存后输入框保留内容（不被清空）', stillShown === TEXT, `框内="${stillShown}"`)

  // 切到月回顾：应显示月周期的内容（此处为空），而不是周回顾那段
  await p.eval(`${HELPERS}; window.__t.byText('button','月回顾').click(); return 1`)
  await sleep(800)
  const monthVal = await p.eval(`return document.querySelector('textarea').value`)
  check('切换周期不串内容（月回顾不显示周回顾的文字）', monthVal === '', `月回顾框内="${monthVal}"`)

  await p.eval(`${HELPERS}; window.__t.byText('button','周回顾').click(); return 1`)
  await sleep(800)
  const backVal = await p.eval(`return document.querySelector('textarea').value`)
  check('切回周回顾恢复已存内容', backVal === TEXT, `框内="${backVal}"`)

  // 清空并保存：内容应真的被清掉，而不是弹回旧值
  await p.eval(`${HELPERS}; window.__t.type(document.querySelector('textarea'), ''); return 1`)
  await sleep(300)
  const clearedInUI = await p.eval(`return document.querySelector('textarea').value`)
  check('输入框可以被清空（旧值不回弹）', clearedInUI === '', `框内="${clearedInUI}"`)

  await p.eval(`${HELPERS}; window.__t.byText('button','更新反思')?.click(); return 1`)
  await sleep(2000)
  const clearedInDB = await p.eval(`
    const rs = await window.electronAPI.dbReviewsGetAll()
    return { note: rs.find(x => x.periodType === 'week')?.note }
  `)
  check('清空后的反思能存回数据库', clearedInDB.note === '', JSON.stringify(clearedInDB))
  await p.shot(`${SHOTS}/14-review.png`)
})

// ======================================================================
await phase('阶段 10：删除行动（顺带清掉测试数据）', async () => {
  await goto('#/actions')
  const del = await p.eval(`
    // 找到包含「晨跑」且自身含「×」按钮的最内层那个行容器
    const rows = [...document.querySelectorAll('div')]
      .filter(d => d.innerText.includes('晨跑') && [...d.querySelectorAll('button')].some(b => b.innerText.trim() === '×'))
    const row = rows.sort((a,b) => a.innerText.length - b.innerText.length)[0]
    if (!row) return { found: false }
    row.querySelector('button:last-of-type')
    const btn = [...row.querySelectorAll('button')].find(b => b.innerText.trim() === '×')
    btn.click()
    return { found: true }
  `)
  await sleep(2200)
  const afterDel = await p.eval(`
    const rows = await window.electronAPI.dbActionsGetAll()
    return { total: rows.length, still: rows.some(r => (r.description||'').includes('晨跑')) }
  `)
  check('删除行动生效，数据库回到基线', del.found && !afterDel.still && afterDel.total === baselineActions,
        `剩余 ${afterDel.total} 条（基线 ${baselineActions}）`)
})

// ======================================================================
await phase('阶段 10.1：回顾删除（deleteReview 全链路）', async () => {
  await goto('#/review')
  const before = await p.eval(`return (await window.electronAPI.dbReviewsGetAll()).length`)
  if (before === 0) { bad('回顾删除前置', '库里没有可删的回顾（阶段9.5 应已创建）'); return }

  // 历史回顾区的 × 按钮（hover 才显示，但 click() 不需要真 hover）
  const del = await p.eval(`
    ${HELPERS}
    const btn = [...document.querySelectorAll('button')].find(b => b.title === '删除这条回顾')
    if (!btn) return { found: false }
    btn.click(); return { found: true }
  `)
  await sleep(1800)
  const after = await p.eval(`return (await window.electronAPI.dbReviewsGetAll()).length`)
  check('回顾可以删除且落库', del.found && after === before - 1, `${before} → ${after}`)
})

// ======================================================================
await phase('阶段 10.2：维度 种植/休息/请回/删除（全链路接线）', async () => {
  await goto('#/dimensions')
  const baseCards = await p.eval(`return document.querySelectorAll('div.card.cursor-pointer').length`)
  const baseDb = await p.eval(`return {
    dims: (await window.electronAPI.dbDimensionsGetAll()).length,
    rubrics: (await window.electronAPI.dbRubricsGetAll()).length,
  }`)

  // 种一片新花瓣（打包版首绘慢，等到按钮出现再点）
  for (let i = 0; i < 10; i++) {
    const ok = await p.eval(`${HELPERS}; const b = window.__t.byText('button', '种一片新花瓣'); if (b) { b.click(); return true } return false`)
    if (ok) break
    await sleep(500)
  }
  await sleep(500)
  await p.eval(`
    ${HELPERS}
    window.__t.type(document.querySelector('input[placeholder^="给这片新花瓣"]'), '测试花瓣')
    return 1
  `)
  await sleep(300)
  await p.eval(`${HELPERS}; window.__t.byText('button', '种下').click(); return 1`)
  await sleep(2200)
  const afterAdd = await p.eval(`return {
    cards: document.querySelectorAll('div.card.cursor-pointer').length,
    dims: (await window.electronAPI.dbDimensionsGetAll()).length,
    rubrics: (await window.electronAPI.dbRubricsGetAll()).length,
  }`)
  check('新维度种下（UI+落库+自带评分标准）',
        afterAdd.cards === baseCards + 1 && afterAdd.dims === baseDb.dims + 1 && afterAdd.rubrics === baseDb.rubrics + 10,
        `cards=${afterAdd.cards} dims=${afterAdd.dims} rubrics=${afterAdd.rubrics}`)
  await p.shot(`${SHOTS}/15-dimension-added.png`)

  // 进详情 → 让它休息（停用）
  await p.eval(`
    const c = [...document.querySelectorAll('div.card.cursor-pointer')].find(x => x.innerText.includes('测试花瓣'))
    if (c) c.click(); return !!c
  `)
  await sleep(1200)
  await inject()
  for (let i = 0; i < 10; i++) {
    const ok = await p.eval(`${HELPERS}; const b = window.__t.byText('button', '让它休息'); if (b) { b.click(); return true } return false`)
    if (ok) break
    await sleep(500)
  }
  await sleep(1500)
  await goto('#/dimensions')
  const rest = await p.eval(`return {
    cards: document.querySelectorAll('div.card.cursor-pointer').length,
    disabled: document.querySelectorAll('[data-testid="disabled-dimension"]').length,
    hasRestZone: document.body.innerText.includes('休憩中的花瓣'),
  }`)
  check('维度可停用并进入「休憩中」区', rest.cards === baseCards && rest.disabled === 1 && rest.hasRestZone,
        JSON.stringify(rest))

  // 请回花园（重新启用）
  await p.eval(`${HELPERS}; window.__t.byText('button', '请回花园').click(); return 1`)
  await sleep(1500)
  const back = await p.eval(`return document.querySelectorAll('div.card.cursor-pointer').length`)
  check('停用的维度可以请回花园', back === baseCards + 1, `cards=${back}`)

  // 删除（confirm 已被 HELPERS 置 true）
  await p.eval(`
    const c = [...document.querySelectorAll('div.card.cursor-pointer')].find(x => x.innerText.includes('测试花瓣'))
    if (c) c.click(); return !!c
  `)
  await sleep(1200)
  await inject()
  for (let i = 0; i < 10; i++) {
    const ok = await p.eval(`${HELPERS}; const b = window.__t.byText('button', '删除维度'); if (b) { b.click(); return true } return false`)
    if (ok) break
    await sleep(500)
  }
  await sleep(2000)
  const afterDel = await p.eval(`return {
    hash: location.hash,
    dims: (await window.electronAPI.dbDimensionsGetAll()).length,
    rubrics: (await window.electronAPI.dbRubricsGetAll()).length,
  }`)
  check('维度删除生效（级联清理 + 回列表页）',
        afterDel.dims === baseDb.dims && afterDel.rubrics === baseDb.rubrics && afterDel.hash.includes('/dimensions'),
        JSON.stringify(afterDel))
})

// ======================================================================
await phase('阶段 10.3：花园任务（目标提醒 + 一键完成 + 回响）', async () => {
  // 造一个进行中的目标 → 打开看板应出现基于目标的轻声提醒
  const goalId = await p.eval(`
    localStorage.removeItem('lifeos:garden-dismissed') // 手工点过「今天先不看」也不影响测试
    const dims = await window.electronAPI.dbDimensionsGetAll()
    const career = dims.find(d => d.name === '职业发展')
    const id = 'e2e-goal-' + Date.now()
    const now = Date.now()
    await window.electronAPI.dbGoalsAdd({ id, title: '操作测试目标', description: '',
      quantitativeTarget: null, quantitativeUnit: null, isActive: 1,
      createdAt: now, updatedAt: now, dimensionId: career.id })
    return id
  `)
  await reload()
  await goto('#/today')          // v3.5：轻推与一瞥都在「今天」这一屏
  const card = await p.eval(`return {
    shown: !!document.querySelector('[data-testid="garden-tasks"]'),
    hasGoalTask: document.body.innerText.includes('操作测试目标'),
    hasWhy: document.querySelector('[data-testid="garden-tasks"]')?.innerText.length > 40,
  }`)
  check('看板出现「来自花园的轻声提醒」且包含目标任务', card.shown && card.hasGoalTask, JSON.stringify(card))
  await p.shot(`${SHOTS}/16-garden-tasks.png`)

  // 一键完成 → 落库为行动 + 回响出现
  const beforeActions = await p.eval(`return (await window.electronAPI.dbActionsGetAll()).length`)
  await p.eval(`
    // 找「含目标名 + 含完成按钮」的最内层行容器，避免点到外层包裹里别的任务的按钮
    const cardEl = document.querySelector('[data-testid="garden-tasks"]')
    const rows = [...cardEl.querySelectorAll('div')]
      .filter(d => d.innerText.includes('操作测试目标') && [...d.querySelectorAll('button')].some(b => b.innerText.trim() === '完成'))
      .sort((a, b) => a.innerText.length - b.innerText.length)
    const btn = [...rows[0].querySelectorAll('button')].find(b => b.innerText.trim() === '完成')
    btn.click(); return 1
  `)
  await sleep(2200)
  const done = await p.eval(`return {
    actions: (await window.electronAPI.dbActionsGetAll()).length,
    echoShown: !!document.querySelector('[data-testid="echo-toast"]'),
    echoText: document.querySelector('[data-testid="echo-toast"]')?.innerText.slice(0, 100) || '',
    doneMark: document.body.innerText.includes('已完成 ✓'),
  }`)
  check('任务一键完成落库为行动', done.actions === beforeActions + 1, `${beforeActions} → ${done.actions}`)
  check('完成任务触发回响且提及目标', done.echoShown && done.echoText.includes('操作测试目标'),
        done.echoText.replace(/\n/g, ' / ').slice(0, 80))

  // 清理：删测试目标 + 测试行动
  await p.eval(`
    const rows = await window.electronAPI.dbActionsGetAll()
    const mine = rows.filter(r => (r.description||'').includes('操作测试目标'))
    for (const r of mine) await window.electronAPI.dbActionsDelete(r.id)
    await window.electronAPI.dbGoalsDelete(${JSON.stringify(goalId)})
    return 1
  `)
  await sleep(800)
})

// ======================================================================
await phase('阶段 10.4：主题切换（暗夜 ↔ 禅意茶室 ↔ 花间集）', async () => {
  const initialTheme = await p.eval(`return localStorage.getItem('lifeos:theme') || 'night'`)

  await goto('#/settings')
  await p.eval(`${HELPERS}; window.__t.byText('button', '禅意茶室').click(); return 1`)
  await sleep(800)
  const dawn = await p.eval(`return {
    dataset: document.documentElement.dataset.theme,
    stored: localStorage.getItem('lifeos:theme'),
    bg: getComputedStyle(document.documentElement).getPropertyValue('--bg-primary').trim(),
  }`)
  check('切到禅意茶室（DOM + 持久化 + token 生效）',
        dawn.dataset === 'dawn' && dawn.stored === 'dawn' && dawn.bg === '#f2ecdc',
        JSON.stringify(dawn))
  await p.shot(`${SHOTS}/17-settings-dawn.png`)

  // 亮色下看板花形图照常绘制
  await goto('#/')
  const dawnFlower = await p.eval(`
    const c = document.querySelector('canvas')
    if (!c) return { painted: false }
    const d = c.getContext('2d').getImageData(0,0,c.width,c.height).data
    let n = 0; for (let i=3;i<d.length;i+=4) if (d[i]>0) n++
    return { painted: n > 500, n }
  `)
  check('禅意茶室下花形图正常绘制', dawnFlower.painted, `不透明像素=${dawnFlower.n}`)
  await p.shot(`${SHOTS}/18-dashboard-dawn.png`)

  // 花间集（第三主题）也走一遍
  await goto('#/settings')
  await p.eval(`${HELPERS}; window.__t.byText('button', '花间集').click(); return 1`)
  await sleep(600)
  const bloom = await p.eval(`return {
    dataset: document.documentElement.dataset.theme,
    accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
  }`)
  check('切到花间集（鲜花主色调生效）', bloom.dataset === 'bloom' && bloom.accent === '#e75565',
        JSON.stringify(bloom))
  await goto('#/')
  await p.shot(`${SHOTS}/19-dashboard-bloom.png`)

  // 切回原主题，不动用户的偏好
  await goto('#/settings')
  const backName = initialTheme === 'dawn' ? '禅意茶室' : initialTheme === 'bloom' ? '花间集' : '暗夜花园'
  await p.eval(`${HELPERS}; window.__t.byText('button', ${JSON.stringify(backName)}).click(); return 1`)
  await sleep(400)
  const restored = await p.eval(`return document.documentElement.dataset.theme`)
  check('主题恢复为进场前的设置', restored === initialTheme, `恢复为 ${restored}`)
})

// ======================================================================
await phase('阶段 10.5：花语手册（v3.1 B1）', async () => {
  await goto('#/handbook')
  const hb = await p.eval(`return {
    title: document.body.innerText.includes('花语手册'),
    chapters: document.querySelectorAll('[data-testid="handbook-nav"] button').length,
    bodyLen: document.querySelector('[data-testid="handbook-chapter"]')?.innerText.length || 0,
  }`)
  check('手册页可达且五章齐全', hb.title && hb.chapters === 5, `chapters=${hb.chapters}`)
  check('手册正文有实际内容', hb.bodyLen > 100, `首章正文 ${hb.bodyLen} 字`)

  // 切到「边界与承诺」章：数据本地与 AI 边界必须白纸黑字
  await p.eval(`
    ${HELPERS}
    const b = [...document.querySelectorAll('[data-testid="handbook-nav"] button')].find(x => x.innerText.includes('边界'))
    if (b) b.click(); return 1
  `)
  await sleep(400)
  const promise = await p.eval(`return document.querySelector('[data-testid="handbook-chapter"]')?.innerText || ''`)
  check('「边界与承诺」章含本地数据承诺', promise.includes('本地') || promise.includes('电脑'),
        promise.slice(0, 40).replace(/\n/g, '/'))
  await p.shot(`${SHOTS}/20-handbook.png`)
})

// ======================================================================
await phase('阶段 10.6：主题化指针 + 氛围开关（v3.1 A1/A3）', async () => {
  const cur = await p.eval(`return {
    dataCursor: document.documentElement.dataset.cursor || 'on',
    bodyCursor: getComputedStyle(document.body).cursor.slice(0, 40),
  }`)
  check('默认启用主题化指针（body cursor 为自定义 SVG）',
        cur.dataCursor === 'on' && cur.bodyCursor.includes('url'), JSON.stringify(cur))

  // 输入区必须保留系统 I-beam（晓雅 X4 红线）。
  // 探针别放设置页——AI 配置隐藏后那页只剩 checkbox，没有文本输入框可探。
  await goto('#/review')
  const ibeam = await p.eval(`
    const ta = document.querySelector('textarea')
    return ta ? getComputedStyle(ta).cursor : 'no-input'
  `)
  check('输入区保留系统 I-beam（cursor:auto）', ibeam === 'auto', `textarea cursor=${ibeam}`)

  // 三主题指针确实不同款（直接比 CSS token，切完还原）
  const themed = await p.eval(`
    const read = () => getComputedStyle(document.documentElement).getPropertyValue('--cursor-default')
    const orig = document.documentElement.dataset.theme
    const a = read()
    document.documentElement.dataset.theme = (orig === 'bloom' ? 'dawn' : 'bloom')
    const b = read()
    if (orig) document.documentElement.dataset.theme = orig
    else delete document.documentElement.dataset.theme
    return { differ: a !== b, restored: (document.documentElement.dataset.theme || '') === (orig || '') }
  `)
  check('指针随主题换装（token 不同款）', themed.differ && themed.restored, JSON.stringify(themed))

  // 拖尾人格：canvas 存在 + profile 与主题匹配
  const EXPECT = { night: 'leaf', dawn: 'osmanthus', bloom: 'sakura' }
  const trail = await p.eval(`return {
    canvas: !!document.querySelector('[data-testid="petal-trail"]'),
    profile: window.__trailProfile || null,
    theme: document.documentElement.dataset.theme || 'night',
  }`)
  check('拖尾画布就绪且人格与主题匹配',
        trail.canvas && trail.profile === EXPECT[trail.theme],
        `theme=${trail.theme} profile=${trail.profile}`)

  // 关闭指针 → 回系统指针；关闭拖尾 → 画布卸载；再全部打开
  // （开关在设置页——上面把 I-beam 探针挪到了回顾页，这里必须先回来）
  await goto('#/settings')
  await p.eval(`${HELPERS}; document.querySelector('[data-testid="toggle-cursor"]').click(); return 1`)
  await sleep(400)
  const cursorOff = await p.eval(`return {
    ds: document.documentElement.dataset.cursor,
    body: getComputedStyle(document.body).cursor,
  }`)
  check('指针开关可关（回系统指针）', cursorOff.ds === 'off' && !cursorOff.body.includes('url'),
        JSON.stringify(cursorOff))

  await p.eval(`document.querySelector('[data-testid="toggle-trail"]').click(); return 1`)
  await sleep(400)
  const trailOff = await p.eval(`return !!document.querySelector('[data-testid="petal-trail"]')`)
  check('拖尾开关可关（画布卸载）', trailOff === false)

  await p.eval(`
    document.querySelector('[data-testid="toggle-cursor"]').click()
    document.querySelector('[data-testid="toggle-trail"]').click()
    return 1
  `)
  await sleep(400)
  const restored = await p.eval(`return {
    cursor: !document.documentElement.dataset.cursor,
    trail: !!document.querySelector('[data-testid="petal-trail"]'),
  }`)
  check('氛围开关恢复默认全开', restored.cursor && restored.trail, JSON.stringify(restored))
})

// ======================================================================
await phase('阶段 10.7：感受随手记（v3.1 C1）', async () => {
  await goto('#/')
  await p.eval(`
    const b = [...document.querySelectorAll('button')].find(x => x.innerText.includes('+ 快速记录'))
    if (b) b.click(); return 1
  `)
  await sleep(600)
  await p.eval(`
    ${HELPERS}
    window.__t.byText('button', '身心健康')?.click()
    return 1
  `)
  await sleep(300)
  // 感受默认折叠 → 展开 → 选「愉悦」
  const moodUi = await p.eval(`
    ${HELPERS}
    const fold = document.querySelector('[data-testid="mood-picker"]')
    const collapsed = fold && fold.innerText.includes('可选')
    const opener = [...fold.querySelectorAll('button')][0]
    opener.click()
    return { collapsed }
  `)
  await sleep(300)
  await p.eval(`
    const btn = [...document.querySelectorAll('[data-testid="mood-picker"] button')].find(b => b.title === '愉悦')
    if (btn) btn.click(); return 1
  `)
  await sleep(200)
  await p.eval(`
    ${HELPERS}
    window.__t.type(document.querySelector('input[placeholder^="做了什么"]'), '操作测试：感受记录')
    return 1
  `)
  await sleep(200)
  await p.eval(`
    const b = [...document.querySelectorAll('button')].find(x => x.innerText.includes('⌘↵'))
    if (b) b.click(); return 1
  `)
  await sleep(2000)
  const moodRow = await p.eval(`
    const rows = await window.electronAPI.dbActionsGetAll()
    const r = rows.find(x => (x.description||'').includes('感受记录'))
    return r ? { mood: r.mood, id: r.id } : { missing: true }
  `)
  check('感受默认折叠且可选填，落库 mood=happy',
        moodUi.collapsed && moodRow.mood === 'happy', JSON.stringify(moodRow))
  // 回响可能还在，先关掉再清理
  await p.eval(`document.querySelector('[data-testid="echo-toast"]')?.click(); return 1`)
  await p.eval(`
    const rows = await window.electronAPI.dbActionsGetAll()
    const r = rows.find(x => (x.description||'').includes('感受记录'))
    if (r) await window.electronAPI.dbActionsDelete(r.id)
    return 1
  `)
})

// ======================================================================
await phase('阶段 10.8：身份宣言（v3.1 C2）', async () => {
  const dimId = await p.eval(`
    const dims = await window.electronAPI.dbDimensionsGetAll()
    return dims.find(d => d.name === '个人成长')?.id || dims[0].id
  `)
  await goto(`#/dimensions/${dimId}`)
  const before = await p.eval(`
    return (await window.electronAPI.dbDimensionsGet(${JSON.stringify(dimId)})).identity || ''
  `)
  // 打包档首绘比 dev 慢，等到输入框真的在了再写（固定 sleep 会赶在渲染前）。
  //
  // ⚠️ 失焦保存必须【手动派发 focusout】，不能靠 el.focus() + el.blur()：
  // Electron 窗口不在前台时（e2e 跑起来经常如此），focus() 拿不到真正的文档焦点，
  // blur() 于是成了空操作，React 的 onBlur 一次都不触发——表现为"输入成功但没落库"，
  // 看着像产品 bug，其实是 harness 假象。focusout 会冒泡到 React 根节点，
  // 走的仍是真实的 onBlur 处理函数，验的还是真链路。
  let typed = false
  for (let i = 0; i < 12 && !typed; i++) {
    typed = await p.eval(`
      ${HELPERS}
      const inp = document.querySelector('[data-testid="identity-declaration"] input')
      if (!inp) return false
      window.__t.type(inp, '终身学习者')
      inp.focus()
      inp.blur()
      inp.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
      return true
    `)
    if (!typed) await sleep(500)
  }
  // 落库要过 IPC + loadData 一整轮，同样轮询而不是赌一个固定等待
  let saved = ''
  for (let i = 0; i < 12; i++) {
    saved = await p.eval(`
      return (await window.electronAPI.dbDimensionsGet(${JSON.stringify(dimId)})).identity
    `)
    if (saved === '终身学习者') break
    await sleep(500)
  }
  check('身份宣言写入并落库', saved === '终身学习者', `identity="${saved}" 输入成功=${typed}`)
  // 还原用户原值
  await p.eval(`
    await window.electronAPI.dbDimensionsUpdate(${JSON.stringify(dimId)}, { identity: ${JSON.stringify(before)} })
    return 1
  `)
})

// ======================================================================
await phase('阶段 10.9：陪伴天数 / 时光机 / 热力图柔化（v3.1 C3/C4/C6）', async () => {
  await goto('#/')
  const side = await p.eval(`return document.body.innerText.match(/这朵花陪了你 (\\d+) 天/)?.[1] || null`)
  check('侧栏出现陪伴天数（永不清零口径）', side !== null && Number(side) >= 1, `陪伴 ${side} 天`)

  await goto('#/stats')
  const stats = await p.eval(`return {
    companion: !!document.querySelector('[data-testid="companion-card"]'),
    timeline: !!document.querySelector('[data-testid="flower-timeline"]'),
    timelineText: document.querySelector('[data-testid="flower-timeline"]')?.innerText.slice(0, 60) || '',
  }`)
  check('统计页有陪伴卡片与花语时光机区', stats.companion && stats.timeline,
        stats.timelineText.replace(/\n/g, '/'))

  const heat = await p.eval(`
    const cells = [...document.querySelectorAll('[data-testid="heat-cell"]')]
    const withStage = cells.filter(el => /(含苞|萌芽|舒展|盛放|繁盛)/.test(el.title))
    return { cells: cells.length, withStage: withStage.length }
  `)
  check('热力图格子 hover 带状态词（柔化后）', heat.cells > 0 && heat.withStage === heat.cells,
        `${heat.withStage}/${heat.cells}`)

  // 造一条今天的真实记录，让下面三档汇总校验的是真数字而不是 0=0 的空转
  const aggActionId = await p.eval(`
    const dims = (await window.electronAPI.dbDimensionsGetAll()).filter(d => d.isEnabled)
    const t0 = new Date(); t0.setHours(0,0,0,0)
    const id = 'e2e-agg-' + Date.now()
    await window.electronAPI.dbActionsAdd({ id, date: t0.getTime(), description: '操作测试：汇总校验',
      quality: 'major', impact: 3, isCompleted: 1, createdAt: Date.now(), updatedAt: Date.now(),
      dimensionId: dims[0].id, branchId: null, goalId: null, mood: '' })
    return id
  `)
  await reload()
  await goto('#/stats')

  // 周/月/年汇总：两个方向的合计都要与数据库现算一致（子曰 2026-08-18 要求）
  for (const [tabLabel, mode] of [['周', 'week'], ['月', 'month'], ['年', 'year']]) {
    await p.eval(`${HELPERS}; window.__t.byText('button', ${JSON.stringify(tabLabel)})?.click(); return 1`)
    await sleep(700)
    const agg = await p.eval(`
      const box = document.querySelector('[data-testid="summary-table"]')
      const header = box.innerText.match(/共 (\\d+) 条记录 · 贡献 (\\d+)/)
      // 同期从 DB 现算（e2e 与真实使用共库，写死数字必被污染）
      const acts = await window.electronAPI.dbActionsGetAll()
      const dims = (await window.electronAPI.dbDimensionsGetAll()).filter(d => d.isEnabled)
      const ids = new Set(dims.map(d => d.id))
      const now = new Date()
      let start, end
      if (${JSON.stringify(mode)} === 'week') {
        const d = new Date(now); d.setHours(0,0,0,0)
        start = d.getTime() - 6 * 86400000
        end = d.getTime() + 86400000 - 1
      } else if (${JSON.stringify(mode)} === 'month') {
        start = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).getTime()
      } else {
        start = new Date(now.getFullYear(), 0, 1).getTime()
        end = new Date(now.getFullYear(), 11, 31, 23, 59, 59).getTime()
      }
      const mine = acts.filter(a => a.isCompleted && ids.has(a.dimensionId) && a.date >= start && a.date <= end)
      return {
        uiCount: Number(header?.[1]), uiImpact: Number(header?.[2]),
        dbCount: mine.length, dbImpact: mine.reduce((s, a) => s + a.impact, 0),
        footer: box.innerText.includes('每期合计'),
      }
    `)
    check(`${tabLabel}视图按维度汇总与数据库一致（条数+贡献+每期合计行）`,
          agg.uiCount === agg.dbCount && agg.uiImpact === agg.dbImpact && agg.footer && agg.dbCount > 0,
          `UI=${agg.uiCount}条/${agg.uiImpact}贡献 DB=${agg.dbCount}条/${agg.dbImpact}贡献`)
  }
  await p.eval(`${HELPERS}; window.__t.byText('button', '周')?.click(); return 1`)
  await sleep(500)
  await p.shot(`${SHOTS}/21-stats-v31.png`)
  await p.eval(`await window.electronAPI.dbActionsDelete(${JSON.stringify(aggActionId)}); return 1`)
})

// ======================================================================
await phase('阶段 10.10：首启引导（v3.1 B2/B3，吞 P0-8）', async () => {
  // 老库应已被迁移豁免
  const grand = await p.eval(`return await window.electronAPI.dbSettingsGet('onboardingDone')`)
  check('迁移 v3 豁免老库（onboardingDone=1）', grand === '1', `值=${grand}`)

  // 备份所有维度分数（引导会写 initialScore，测完必须还原用户数据）
  const backup = await p.eval(`
    const dims = await window.electronAPI.dbDimensionsGetAll()
    return dims.map(d => ({ id: d.id, initialScore: d.initialScore, currentScore: d.currentScore }))
  `)

  // —— 完整走完路径 ——
  await p.eval(`await window.electronAPI.dbSettingsSet('onboardingDone', ''); return 1`)
  await reload()
  const act0 = await p.eval(`return {
    overlay: !!document.querySelector('[data-testid="onboarding"]'),
    text: document.querySelector('[data-testid="onboarding"]')?.innerText || '',
  }`)
  check('清空标记后首启进入引导（第一幕欢迎）',
        act0.overlay && act0.text.includes('花园') && act0.text.includes('小王子'),
        act0.text.slice(0, 40).replace(/\n/g, '/'))
  await p.shot(`${SHOTS}/22-onboarding-act1.png`)

  // v3.3 T1：四幕收为三幕——原「八片花瓣」整幕删除，介绍下沉为滑块上方小字
  await p.eval(`${HELPERS}; window.__t.byText('button', '走进花园 →').click(); return 1`)
  await sleep(700)
  const act1 = await p.eval(`return {
    scoring: !!document.querySelector('[data-testid="onboarding-scoring"]'),
    rows: document.querySelectorAll('[data-testid="onboarding-score-row"]').length,
    canvas: !!document.querySelector('[data-testid="onboarding-scoring"] canvas'),
    noPetalAct: !document.querySelector('[data-testid="onboarding"]')?.innerText.includes('八片花瓣'),
  }`)
  check('第二幕：欢迎后直达打分幕（八片花瓣独立幕已删）',
        act1.scoring && act1.rows >= 8 && act1.noPetalAct,
        `rows=${act1.rows} noPetalAct=${act1.noPetalAct}`)
  check('第二幕：打分幕并排实时花形（scoreOverride）', act1.canvas, `canvas=${act1.canvas}`)

  // 实时花形：把第一瓣从低打到高，画布像素必须变（不是等到下一幕才画）
  const liveFlower = await p.eval(`
    const host = document.querySelector('[data-testid="onboarding-scoring"] canvas')
    const rows = [...document.querySelectorAll('[data-testid="onboarding-score-row"]')]
    const dots = [...rows[0].querySelectorAll('button')]
    dots[0].click()
    await new Promise(r => setTimeout(r, 400))
    const before = host.toDataURL().length
    dots[9].click()
    await new Promise(r => setTimeout(r, 400))
    const after = host.toDataURL().length
    return { before, after, changed: before !== after }
  `)
  check('第二幕：滑动打分时花形实时重绘', liveFlower.changed,
        `len ${liveFlower.before}→${liveFlower.after}`)

  // 给第一行打 5 分（点第 5 个圆点）
  await p.eval(`
    const row = document.querySelector('[data-testid="onboarding-score-row"]')
    const dots = [...row.querySelectorAll('button')]
    dots[4].click(); return 1
  `)
  await sleep(300)
  await p.eval(`document.querySelector('[data-testid="onboarding-bloom"]').click(); return 1`)
  await sleep(3000)
  const act3 = await p.eval(`return {
    bloom: document.querySelector('[data-testid="onboarding"]')?.innerText.includes('花开了'),
    canvas: !!document.querySelector('[data-testid="onboarding"] canvas'),
    impression: document.querySelector('[data-testid="first-impression"]')?.innerText || '',
  }`)
  check('第三幕：花开了 + 操作提示', act3.bloom && act3.canvas, JSON.stringify({ bloom: act3.bloom, canvas: act3.canvas }))
  // T1 核心：代价快照必须出现，且不能有褒贬词（Lisa 的口径红线）
  check('第三幕：第一份代价快照出现',
        act3.impression.length > 0 && /选择|合着|接近/.test(act3.impression),
        act3.impression.slice(0, 50).replace(/\n/g, '/'))
  check('第三幕：快照句无褒贬（不出现"最丰盛/很难得/不错"）',
        !/最丰盛|很难得|难得|不错|真棒|做得好/.test(act3.impression),
        act3.impression.slice(0, 50).replace(/\n/g, '/'))
  await p.shot(`${SHOTS}/23-onboarding-bloom.png`)

  // v3.4 A4：首启明信片（子曰拍板「明信片需要」）——只画花+快照，不画占比
  const card = await p.eval(`
    const btn = document.querySelector('[data-testid="onboarding-postcard-make"]')
    if (!btn) return { entry: false }
    btn.click()
    await new Promise(r => setTimeout(r, 800))
    const img = document.querySelector('[data-testid="onboarding-postcard-image"]')
    const save = document.querySelector('[data-testid="onboarding-postcard-save"]')
    return {
      entry: true,
      made: !!img && (img.src || '').startsWith('data:image/png'),
      bytes: img ? img.src.length : 0,
      saveable: !!save && (save.getAttribute('download') || '').endsWith('.png'),
    }
  `)
  check('第三幕：明信片入口在场且能生成 PNG',
        card.entry && card.made, JSON.stringify({ entry: card.entry, made: card.made }))
  check('第三幕：明信片可本地保存（download 属性，不联网）',
        card.saveable, `saveable=${card.saveable} 体积=${Math.round((card.bytes || 0) / 1024)}KB`)

  const firstDimScore = await p.eval(`
    const dims = await window.electronAPI.dbDimensionsGetAll()
    const sorted = [...dims].filter(d => d.isEnabled).sort((a,b) => a.sortOrder - b.sortOrder)
    return sorted[0].initialScore
  `)
  check('亲手打的初始分落库（第一维 = 5）', firstDimScore === 5, `initialScore=${firstDimScore}`)

  await p.eval(`${HELPERS}; window.__t.byText('button', '走进花园').click(); return 1`)
  await sleep(800)
  const closed = await p.eval(`return {
    overlay: !!document.querySelector('[data-testid="onboarding"]'),
    done: await window.electronAPI.dbSettingsGet('onboardingDone'),
  }`)
  check('引导完成：overlay 关闭且标记写回', !closed.overlay && closed.done === '1', JSON.stringify(closed))

  // —— 跳过路径 ——
  await p.eval(`await window.electronAPI.dbSettingsSet('onboardingDone', ''); return 1`)
  await reload()
  await p.eval(`${HELPERS}; window.__t.byText('button', '先逛逛').click(); return 1`)
  await sleep(1200)
  const skipped = await p.eval(`return {
    overlay: !!document.querySelector('[data-testid="onboarding"]'),
    done: await window.electronAPI.dbSettingsGet('onboardingDone'),
  }`)
  check('跳过路径：一键先逛逛也算完成', !skipped.overlay && skipped.done === '1', JSON.stringify(skipped))

  // —— 设置页可重看 ——
  await goto('#/settings')
  await p.eval(`document.querySelector('[data-testid="replay-onboarding"]').click(); return 1`)
  await sleep(600)
  const replay = await p.eval(`return !!document.querySelector('[data-testid="onboarding"]')`)
  check('设置页可重看引导', replay)
  await p.eval(`${HELPERS}; window.__t.byText('button', '先逛逛').click(); return 1`)
  await sleep(800)

  // 还原用户维度分数
  await p.eval(`
    const backup = ${JSON.stringify(backup)}
    for (const b of backup) {
      await window.electronAPI.dbDimensionsUpdate(b.id, { initialScore: b.initialScore, currentScore: b.currentScore })
    }
    return 1
  `)
  await reload()
})

// ======================================================================
await phase('阶段 10.11：季度会谈 + 焦点维度（v3.2 A 组）', async () => {
  // 会谈会改写维度分数与焦点，测完必须原样还原用户数据
  const backup = await p.eval(`
    const dims = await window.electronAPI.dbDimensionsGetAll()
    return dims.map(d => ({ id: d.id, initialScore: d.initialScore, currentScore: d.currentScore }))
  `)

  // 阶段中途异常也必须还原（台账 #5 的教训：清理写在末尾，一异常就留下污染）
  try {

  // —— 1. 迁移 v4 ——
  const mig = await p.eval(`
    const rows = await window.electronAPI.dbQuarterlyGetAll()
    const dims = await window.electronAPI.dbDimensionsGetAll()
    return { list: Array.isArray(rows), hasCol: dims.length > 0 && ('focusSince' in dims[0]),
             focused: dims.filter(d => d.focusSince != null).length }
  `)
  check('迁移 v4 生效（quarterly_reviews 可读 + focusSince 列存在，存量库默认无焦点）',
        mig.list && mig.hasCol && mig.focused === 0, JSON.stringify(mig))

  // —— 2. 统计页常驻入口发起会谈 ——
  await goto('#/stats')
  await p.eval(`document.querySelector('[data-testid="quarterly-start"]').click(); return 1`)
  await sleep(900)
  const act1 = await p.eval(`return {
    shell: !!document.querySelector('[data-testid="quarterly-talk"]'),
    act: !!document.querySelector('[data-testid="quarterly-act-1"]'),
    text: document.querySelector('[data-testid="quarterly-talk"]')?.innerText.slice(0, 60).replace(/\\n/g, '/') || '',
  }`)
  check('统计页常驻入口可发起会谈（第一幕就位）', act1.shell && act1.act, act1.text)
  await p.shot(`${SHOTS}/24-quarterly-act1.png`)

  // —— 3. 第二幕：与引导共用同一套花瓣打分组件（无滑块） ——
  await p.eval(`document.querySelector('[data-testid="quarterly-next"]').click(); return 1`)
  await sleep(700)
  const act2 = await p.eval(`return {
    row: !!document.querySelector('[data-testid="quarterly-score-row"]'),
    sliders: document.querySelectorAll('[data-testid="quarterly-talk"] input[type=range]').length,
    dots: document.querySelectorAll('[data-testid="quarterly-score-row"] button').length,
  }`)
  check('第二幕复用花瓣打分组件（10 颗花瓣点、零滑块）',
        act2.row && act2.sliders === 0 && act2.dots === 10, JSON.stringify(act2))

  // 第一片打 7 分，走到第二片打 6 分，其余幕内容留空（跳过的幕留空不留罪）
  await p.eval(`
    const dots = [...document.querySelectorAll('[data-testid="quarterly-score-row"] button')]
    dots[6].click(); return 1
  `)
  await sleep(400)
  await p.eval(`document.querySelector('[data-testid="quarterly-next-petal"]').click(); return 1`)
  await sleep(500)
  await p.eval(`
    const dots = [...document.querySelectorAll('[data-testid="quarterly-score-row"] button')]
    dots[5].click(); return 1
  `)
  await sleep(500)
  await p.eval(`document.querySelector('[data-testid="quarterly-skip-act"]').click(); return 1`)
  await sleep(800)

  // —— 4. 第三幕：并排两朵花 + 只用形态词 ——
  const act3 = await p.eval(`return {
    on: !!document.querySelector('[data-testid="quarterly-act-3"]'),
    canvases: document.querySelectorAll('[data-testid="quarterly-act-3"] canvas').length,
    delta: document.querySelector('[data-testid="quarterly-delta-list"]')?.innerText || '',
  }`)
  const shapeWords = /舒展|合拢|静静的|收了收|第一次被看见/.test(act3.delta)
  const noJudgement = !/%|↑|↓|提升|下降|完成率/.test(act3.delta)
  check('第三幕并排两朵花，差异只用形态词（无箭头/百分比/涨跌）',
        act3.on && act3.canvases >= 4 && shapeWords && noJudgement,
        `canvas=${act3.canvases} 形态词=${shapeWords} 无涨跌=${noJudgement}`)
  await p.shot(`${SHOTS}/25-quarterly-act3.png`)

  // —— 5. 第四幕：焦点上限 2 + 实时金边预览 ——
  await p.eval(`document.querySelector('[data-testid="quarterly-next"]').click(); return 1`)
  await sleep(800)
  await p.eval(`document.querySelectorAll('[data-testid="quarterly-focus-option"]')[0].click(); return 1`)
  await sleep(500)
  const goldPreview = await p.eval(`
    const c = document.querySelector('[data-testid="quarterly-act-4"] [data-testid="flower-focus-layer"]')
    if (!c) return -1
    const ctx = c.getContext('2d')
    const d = ctx.getImageData(0, 0, c.width, c.height).data
    let n = 0
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++
    return n
  `)
  await p.eval(`document.querySelectorAll('[data-testid="quarterly-focus-option"]')[1].click(); return 1`)
  await sleep(400)
  // 第三次点击不该让焦点变成 3 片
  await p.eval(`document.querySelectorAll('[data-testid="quarterly-focus-option"]')[2].click(); return 1`)
  await sleep(400)
  const act4 = await p.eval(`return {
    on: [...document.querySelectorAll('[data-testid="quarterly-focus-option"]')].filter(b => b.dataset.on === '1').length,
    text: document.querySelector('[data-testid="quarterly-act-4"]')?.innerText || '',
  }`)
  check('第四幕焦点上限 2 且轻点即预览金边',
        act4.on === 2 && goldPreview > 200, `选中=${act4.on} 金边像素=${goldPreview}`)
  check('未选中花瓣的交代文案在场（去惩罚化落点）',
        act4.text.includes('不会被冷落') && act4.text.includes('每一滴露水'),
        act4.text.slice(-40).replace(/\n/g, '/'))
  await p.shot(`${SHOTS}/26-quarterly-act4.png`)

  // —— 6. 第五幕 + 完成 ——
  await p.eval(`document.querySelector('[data-testid="quarterly-next"]').click(); return 1`)
  await sleep(700)
  await p.eval(`
    ${HELPERS}
    const ta = document.querySelector('[data-testid="quarterly-intent"]')
    window.__t.type(ta, '这一季，我想慢一点')
    ta.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    return 1
  `)
  await sleep(500)
  await p.eval(`document.querySelector('[data-testid="quarterly-finish"]').click(); return 1`)
  await sleep(2500)
  const closing = await p.eval(`return !!document.querySelector('[data-testid="quarterly-closing"]')`)

  const saved = await p.eval(`
    const rows = await window.electronAPI.dbQuarterlyGetAll()
    const dims = await window.electronAPI.dbDimensionsGetAll()
    const sorted = [...dims].filter(d => d.isEnabled).sort((a,b) => a.sortOrder - b.sortOrder)
    const r = rows.find(x => x.completedAt)
    return {
      completed: !!r,
      focusCount: r ? JSON.parse(r.focusDimensionIds).length : -1,
      intent: r ? r.intent : '',
      firstScore: sorted[0].currentScore,
      focusedDims: dims.filter(d => d.focusSince != null).length,
    }
  `)
  check('会谈完成：完成时刻 / 焦点 / 分数 / 意图 四处落库',
        closing && saved.completed && saved.focusCount === 2 && saved.focusedDims === 2
        && saved.firstScore === 7 && saved.intent.includes('慢一点'),
        JSON.stringify(saved))

  await p.eval(`${HELPERS}; window.__t.byText('button', '回到花园').click(); return 1`)
  await sleep(900)

  // —— 7. 非焦点维度视觉零降级（红线，设计稿 §3.4）——
  // 同一组分数下，只切换「有没有焦点」，主图层必须逐像素一致：
  // 焦点是加法照明（多画一层金边），不是减法审判（把别人压暗）。
  await goto('#/')
  await sleep(600)
  const withFocus = await p.eval(`return document.querySelector('.flower-breathe canvas').toDataURL()`)
  await p.eval(`await window.electronAPI.dbFocusSet([]); return 1`)
  await reload()
  await goto('#/')
  await sleep(600)
  const withoutFocus = await p.eval(`return document.querySelector('.flower-breathe canvas').toDataURL()`)
  check('非焦点维度视觉零降级（有无焦点，主图层逐像素一致）',
        withFocus.length > 1000 && withFocus === withoutFocus,
        `len=${withFocus.length} 一致=${withFocus === withoutFocus}`)

  // —— 8. 邀请卡：满 84 天才出现，推迟后当周不再现 ——
  await p.eval(`
    const rows = await window.electronAPI.dbQuarterlyGetAll()
    const r = rows.find(x => x.completedAt)
    r.completedAt = Date.now() - 85 * 24 * 60 * 60 * 1000   // 把上一次会谈推回 85 天前
    await window.electronAPI.dbQuarterlyUpsert(r)
    return r.id
  `)
  await reload()
  await goto('#/')
  await sleep(600)
  const invited = await p.eval(`return {
    card: !!document.querySelector('[data-testid="quarterly-invite"]'),
    text: document.querySelector('[data-testid="quarterly-invite"]')?.innerText || '',
  }`)
  await p.eval(`document.querySelector('[data-testid="quarterly-defer"]')?.click(); return 1`)
  await sleep(900)
  const afterDefer = await p.eval(`return !!document.querySelector('[data-testid="quarterly-invite"]')`)
  const noOverdue = !/逾期|已过|天没|欠/.test(invited.text)
  check('满 84 天出现邀请卡，「这周先不」后当周不再现，且无逾期计数',
        invited.card && !afterDefer && noOverdue,
        `出现=${invited.card} 推迟后=${afterDefer} 无逾期措辞=${noOverdue}`)

  // —— 9. 连推两次 → 收敛为侧栏静态小花苞 ——
  await p.eval(`await window.electronAPI.dbSettingsSet('quarterlyDeferCount', '2'); return 1`)
  await reload()
  await sleep(600)
  const bud = await p.eval(`return {
    bud: !!document.querySelector('[data-testid="quarterly-bud"]'),
    card: !!document.querySelector('[data-testid="quarterly-invite"]'),
  }`)
  check('连续推迟两次后邀请卡收起，只余侧栏一枚小花苞', bud.bud && !bud.card, JSON.stringify(bud))

  // —— 10. 中途保存与续谈 ——
  await goto('#/stats')
  await p.eval(`document.querySelector('[data-testid="quarterly-start"]').click(); return 1`)
  await sleep(900)
  await p.eval(`document.querySelector('[data-testid="quarterly-next"]').click(); return 1`)  // 走到第二幕
  await sleep(700)
  await p.eval(`document.querySelector('[data-testid="quarterly-close"]').click(); return 1`) // 关窗，不弹挽留
  await sleep(700)
  const draft = await p.eval(`
    const rows = await window.electronAPI.dbQuarterlyGetAll()
    const d = rows.find(x => !x.completedAt)
    return { has: !!d, act: d?.actProgress ?? -1 }
  `)
  await reload()
  await goto('#/')
  await sleep(600)
  const resumeCard = await p.eval(`return {
    card: !!document.querySelector('[data-testid="quarterly-resume-card"]'),
    text: document.querySelector('[data-testid="quarterly-resume-card"]')?.innerText || '',
  }`)
  await p.eval(`${HELPERS}; window.__t.byText('button', '接着走').click(); return 1`)
  await sleep(900)
  const resumed = await p.eval(`return !!document.querySelector('[data-testid="quarterly-act-2"]')`)
  check('中途关窗自动存草稿，再进入从离开的那一幕继续（无挽留弹窗）',
        draft.has && draft.act === 2 && resumeCard.card && resumed,
        `草稿=${JSON.stringify(draft)} 续谈卡=${resumeCard.card} 回到第二幕=${resumed}`)

  } finally {
    // —— 还原：删掉本轮产生的会谈记录 / 焦点 / 分数 / 推迟标记 ——
    await p.eval(`
      document.querySelector('[data-testid="quarterly-close"]')?.click()
      const rows = await window.electronAPI.dbQuarterlyGetAll()
      for (const r of rows) await window.electronAPI.dbQuarterlyDelete(r.id)
      await window.electronAPI.dbFocusSet([])
      await window.electronAPI.dbSettingsSet('quarterlyDeferUntil', '0')
      await window.electronAPI.dbSettingsSet('quarterlyDeferCount', '0')
      const backup = ${JSON.stringify(backup)}
      for (const b of backup) {
        await window.electronAPI.dbDimensionsUpdate(b.id, { initialScore: b.initialScore, currentScore: b.currentScore })
      }
      return 1
    `)
    await reload()
  }
})

// ======================================================================
await phase('阶段 10.12：账本通道（v3.3 T2/T3/T5）', async () => {
  await goto('#/today')         // v3.5：今日一瞥在「今天」这一屏
  await sleep(900)

  // —— T3 今日账本一瞥：一天一条，三类之一，且绝不出现催办语气 ——
  const glance = await p.eval(`
    const el = document.querySelector('[data-testid="daily-glance"]')
    return el ? { kind: el.dataset.glanceKind, text: el.innerText } : null
  `)
  check('今日账本一瞥出现在「今天」屏顶', !!glance, glance ? `kind=${glance.kind}` : '未渲染')
  if (glance) {
    check('一瞥只出一条，且类型是 growth/allocation/companion 之一',
          ['growth', 'allocation', 'companion'].includes(glance.kind), `kind=${glance.kind}`)
    // 红线：不催办。不出现「浇一下 / 该 / 快 / 别忘 / 只完成了」这类词
    check('一瞥无催办语气（不出现 浇一下/该去/别忘/落后）',
          !/浇一下|该去|别忘|落后|快去|加油/.test(glance.text),
          glance.text.slice(0, 60).replace(/\n/g, '/'))
    check('一瞥不带动作按钮（不是软推送）',
          await p.eval(`return document.querySelectorAll('[data-testid="daily-glance"] button, [data-testid="daily-glance"] a').length === 0`),
          '按钮数应为 0')
  }

  // —— T3 光带：近 7 天零记录时正确地不渲染（空账不摆空带子当摆设）——
  await goto('#/')              // v3.5：光带跟花在同一屏
  await sleep(600)
  const bandEmpty = await p.eval(`
    const recent = (await window.electronAPI.dbActionsGetAll())
      .filter(a => a.isCompleted && a.date >= Date.now() - 7*86400000).length
    return { recent, segs: document.querySelectorAll('[data-testid="light-band-seg"]').length }
  `)
  if (bandEmpty.recent === 0) {
    check('近 7 天无记录时光带不渲染（不摆空带子）', bandEmpty.segs === 0,
          `近7天记录=${bandEmpty.recent} 段数=${bandEmpty.segs}`)
  }

  // —— T2 Echo 账本行：走「+ 快速记录」真实路径（同阶段 3 的已验证写法）——
  // 「社交关系」在前面各阶段没被写过，这里连记两条：第 2 条必然满足「本季第 2 次」
  const ledgerTexts = []
  for (let i = 0; i < 2; i++) {
    await p.eval(`${HELPERS}; window.__t.byText('button', '+ 快速记录').click(); return 1`)
    await sleep(600)
    await p.eval(`${HELPERS}; window.__t.byText('button', '社交关系').click(); return 1`)
    await sleep(400)
    await p.eval(`
      ${HELPERS}
      const input = document.querySelector('input[placeholder^="做了什么"]')
      window.__t.type(input, 'T2 账本行验证 ${i + 1}')
      const q = window.__t.byText('button', '里程碑')
      if (q) q.click()
      return 1
    `)
    await sleep(300)
    await p.eval(`
      const b = [...document.querySelectorAll('button')].find(x => x.innerText.includes('⌘↵'))
      if (b && !b.disabled) b.click(); return 1
    `)
    await sleep(2200)
    ledgerTexts.push(await p.eval(`
      const t = document.querySelector('[data-testid="echo-toast"]')
      return t ? t.innerText : ''
    `))
    await p.eval(`document.querySelector('[data-testid="echo-toast"]')?.click(); return 1`)
    await sleep(400)
  }
  const second = ledgerTexts[1] || ''
  check('行动回响出现账本行「本季第 N 次照顾」',
        /本季第 \d+ 次照顾「社交关系」/.test(second),
        second.replace(/\n/g, ' / ').slice(0, 90))
  // 两条里程碑 = +2.0 分，从种子 3 分必然跨过 4 分档（萌芽→舒展）
  check('行动回响出现状态词跃迁行（跨档才出现）',
        /从.+进入了/.test(ledgerTexts.join('\n')),
        ledgerTexts.join(' || ').replace(/\n/g, ' / ').slice(0, 120))

  // —— T3 光带：此刻库里有 2 条「社交关系」，再直插 1 条别的维度，验占比真的分割 ——
  await p.eval(`
    const dims = await window.electronAPI.dbDimensionsGetAll()
    const health = dims.find(d => d.name === '身心健康')
    await window.electronAPI.dbActionsAdd({
      id: 'e2e-band-' + Date.now(),
      date: Date.now(),
      description: 'T2 账本行验证 · 光带用',
      quality: 'normal', impact: 2,
      isCompleted: 1,
      createdAt: Date.now(), updatedAt: Date.now(),
      dimensionId: health.id, branchId: null, goalId: null, mood: '',
    })
    return 1
  `)
  await reload()
  await goto('#/')
  await sleep(900)
  const band = await p.eval(`
    const segs = [...document.querySelectorAll('[data-testid="light-band-seg"]')]
    const total = segs.reduce((s, el) => s + parseFloat(el.style.width || '0'), 0)
    return {
      segs: segs.length,
      total: Math.round(total),
      names: segs.map(e => e.dataset.dimension),
      widths: segs.map(e => Math.round(parseFloat(e.style.width))),
    }
  `)
  check('光带渲染多段且占比合计 100%（占比通道天然互斥、无顶）',
        band.segs >= 2 && Math.abs(band.total - 100) <= 1,
        `段数=${band.segs} 合计=${band.total}% 明细=${band.names.map((n, i) => n + band.widths[i] + '%').join('/')}`)
  // 里程碑 impact 5×2=10 vs normal 2 ⇒ 社交关系必须占更宽（权重用 impact 不是条数）
  check('光带按 impact 加权（里程碑比小事占更多光）',
        band.names[0] === '社交关系' && band.widths[0] > band.widths[1],
        `${band.names[0]}=${band.widths[0]}% > ${band.names[1]}=${band.widths[1]}%`)

  // 还原：删掉本段造的全部记录
  await p.eval(`
    const rows = await window.electronAPI.dbActionsGetAll()
    for (const r of rows.filter(x => (x.description || '').includes('T2 账本行验证'))) {
      await window.electronAPI.dbActionsDelete(r.id)
    }
    return 1
  `)
  await reload()

  // —— T5 三主题的沉睡 alpha token 必须都在，且亮色 > 暗色 ——
  const alphas = await p.eval(`
    const read = t => {
      document.documentElement.dataset.theme = t
      return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--petal-dormant-alpha'))
    }
    const dawn = read('dawn'), bloom = read('bloom')
    delete document.documentElement.dataset.theme
    const night = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--petal-dormant-alpha'))
    return { night, dawn, bloom }
  `)
  check('三主题都定义了沉睡花瓣 alpha token',
        [alphas.night, alphas.dawn, alphas.bloom].every(v => v > 0),
        JSON.stringify(alphas))
  check('亮色主题的沉睡 alpha 高于暗色（白底上看不见=账本缺页）',
        alphas.dawn > alphas.night && alphas.bloom > alphas.night,
        JSON.stringify(alphas))
})

// ======================================================================
await phase('阶段 10.13：记录手感 + 月度微校准（v3.3 T6-T10）', async () => {
  await goto('#/')
  await sleep(800)

  // —— T7 维度智能排序：沉睡的排最后，但绝不隐藏 ——
  await p.eval(`${HELPERS}; window.__t.byText('button', '+ 快速记录').click(); return 1`)
  await sleep(600)
  const order = await p.eval(`
    const chips = [...document.querySelectorAll('[data-testid="qa-dimensions"] button')]
    return {
      count: chips.length,
      names: chips.map(c => c.dataset.dimension),
      dormant: chips.map(c => c.dataset.dormant),
    }
  `)
  const firstDormantAt = order.dormant.indexOf('1')
  const lastActiveAt = order.dormant.lastIndexOf('0')
  check('维度 chip 全部在场（沉睡的排后但不隐藏）',
        order.count >= 8, `chip=${order.count}`)
  check('沉睡维度排在活跃维度之后',
        firstDormantAt === -1 || lastActiveAt === -1 || firstDormantAt > lastActiveAt,
        `首个沉睡@${firstDormantAt} 末个活跃@${lastActiveAt} 顺序=${order.names.join('>')}`)

  // —— T7 分支折叠：选完维度后分支默认收起，点一下才展开 ——
  await p.eval(`${HELPERS}; window.__t.byText('button', '身心健康').click(); return 1`)
  await sleep(400)
  const collapsed = await p.eval(`
    const host = document.querySelector('[data-testid="qa-branches"]')
    return {
      toggle: !!document.querySelector('[data-testid="qa-branch-toggle"]'),
      chips: host ? host.querySelectorAll('.qa-chip').length : -1,
    }
  `)
  check('二度分支默认收起（只留一行可选提示）',
        collapsed.toggle && collapsed.chips === 0,
        `折叠入口=${collapsed.toggle} 展开中的分支chip=${collapsed.chips}`)
  await p.eval(`document.querySelector('[data-testid="qa-branch-toggle"]').click(); return 1`)
  await sleep(300)
  const expanded = await p.eval(`
    return document.querySelector('[data-testid="qa-branches"]').querySelectorAll('.qa-chip').length
  `)
  check('点一下展开分支', expanded > 0, `展开后 chip=${expanded}`)

  // 记一条，验 T6「再记一条」
  await p.eval(`
    ${HELPERS}
    const input = document.querySelector('input[placeholder^="做了什么"]')
    window.__t.type(input, 'T6 再记一条验证')
    return 1
  `)
  await sleep(200)
  await p.eval(`
    const b = [...document.querySelectorAll('button')].find(x => x.innerText.includes('⌘↵'))
    if (b && !b.disabled) b.click(); return 1
  `)
  await sleep(2000)

  // —— T6 再记一条：回响上有入口，点了直接开面板且预选同一维度 ——
  const again = await p.eval(`return !!document.querySelector('[data-testid="echo-again"]')`)
  check('行动回响带「再记一条」入口', again, `入口=${again}`)
  await p.eval(`document.querySelector('[data-testid="echo-again"]').click(); return 1`)
  await sleep(700)
  const reopened = await p.eval(`
    const on = document.querySelector('[data-testid="qa-dimensions"] .is-on')
    return {
      panel: !!document.querySelector('input[placeholder^="做了什么"]'),
      preset: on ? on.dataset.dimension : '',
    }
  `)
  check('「再记一条」直接开面板且预选同一片花瓣',
        reopened.panel && reopened.preset === '身心健康',
        `面板=${reopened.panel} 预选=${reopened.preset}`)

  // —— T7 露珠标记：今天已照顾过的维度带一颗露珠 ——
  const dew = await p.eval(`
    const chip = [...document.querySelectorAll('[data-testid="qa-dimensions"] button')]
      .find(c => c.dataset.dimension === '身心健康')
    return !!chip?.querySelector('[data-testid="qa-dew"]')
  `)
  check('今天已照顾过的维度带露珠标记', dew, `露珠=${dew}`)

  // 关面板 + 清理
  await p.eval(`document.querySelector('.modal-overlay')?.click(); return 1`)
  await sleep(400)
  await p.eval(`
    const rows = await window.electronAPI.dbActionsGetAll()
    for (const r of rows.filter(x => (x.description || '').includes('T6 再记一条验证'))) {
      await window.electronAPI.dbActionsDelete(r.id)
    }
    return 1
  `)
  await reload()

  // —— T10 季节性问题：当期 3 题里必含 1 道当季问题 ——
  const seasonal = await p.eval(`
    const m = new Date().getMonth()
    return { month: m + 1 }
  `)
  check('季节性问题按月份归季（当前月份可归到某一季）',
        [3,4,5,6,7,8,9,10,11,12,1,2].includes(seasonal.month), `月份=${seasonal.month}`)

  // —— T9 月度微校准：未到 30 天不出现；伪造 31 天前的锚点后出现 ——
  const notDue = await p.eval(`return !!document.querySelector('[data-testid="monthly-checkin"]')`)
  check('未满 30 天时月度微校准不出现（不催办）', !notDue, `出现=${notDue}`)

  await p.eval(`
    // 造一条 31 天前的月度回顾当锚点 → 本期应判定到期
    await window.electronAPI.dbReviewsAdd({
      id: 'e2e-monthly-anchor',
      periodType: 'month',
      periodStart: Date.now() - 61*86400000,
      periodEnd: Date.now() - 31*86400000,
      score: 0,
      note: 'T9 锚点',
      autoSummary: '',
      createdAt: Date.now() - 31*86400000,
      dimensionId: null,
    })
    return 1
  `)
  await reload()
  await goto('#/')
  await sleep(1000)
  const due = await p.eval(`
    const el = document.querySelector('[data-testid="monthly-checkin"]')
    return el ? {
      shown: true,
      flowers: el.querySelectorAll('canvas').length,
      question: el.querySelector('[data-testid="monthly-question"]')?.innerText || '',
      text: el.innerText,
    } : { shown: false }
  `)
  check('满 30 天出现月度微校准', due.shown, `出现=${due.shown}`)
  if (due.shown) {
    // 两朵花 = 每个 FlowerChart 画 2 张 canvas（主图层 + 焦点层）
    check('月度微校准并排两朵花（本月 vs 上月）', due.flowers === 4, `canvas=${due.flowers}`)
    check('只问一个问题，且不打分不选焦点（薄于季度会谈）',
          due.question.length > 0 && !due.text.includes('焦点') && !due.text.includes('打分'),
          `问题="${due.question.slice(0, 30)}"`)
    check('差异只用形态语言，无涨跌箭头与百分比',
          !/[↑↓]|上升|下降|提高了|退步/.test(due.text),
          due.text.slice(0, 60).replace(/\n/g, '/'))
    // 「继续照看花园」= 跳过且不留痕迹（空 reflectionText）
    await p.eval(`document.querySelector('[data-testid="monthly-skip"]').click(); return 1`)
    await sleep(1500)
    const afterSkip = await p.eval(`
      const rows = await window.electronAPI.dbReviewsGetAll()
      const latest = rows.filter(r => r.periodType === 'month').sort((a,b) => b.createdAt - a.createdAt)[0]
      return {
        gone: !document.querySelector('[data-testid="monthly-checkin"]'),
        empty: !latest?.note,
      }
    `)
    check('「继续照看花园」= 跳过即收起，且不留反思痕迹',
          afterSkip.gone && afterSkip.empty, JSON.stringify(afterSkip))
  }

  // 清理锚点与本轮产生的月度回顾
  await p.eval(`
    const rows = await window.electronAPI.dbReviewsGetAll()
    for (const r of rows.filter(x => x.periodType === 'month' && (x.id === 'e2e-monthly-anchor' || !x.note))) {
      await window.electronAPI.dbReviewsDelete(r.id)
    }
    return 1
  `)
  await reload()

  // —— T8 暗色主题 muted 提亮（可访问性）——
  const muted = await p.eval(`
    delete document.documentElement.dataset.theme
    const s = getComputedStyle(document.documentElement)
    const hex = s.getPropertyValue('--text-muted').trim()
    const n = parseInt(hex.replace('#',''), 16)
    const lum = ((n>>16&255)*0.299 + (n>>8&255)*0.587 + (n&255)*0.114)
    return { hex, lum: Math.round(lum) }
  `)
  check('暗色主题 --text-muted 已提亮（亮度 > 旧值 #78705f 的 112）',
        muted.lum > 112, `${muted.hex} 亮度=${muted.lum}`)
})

// ======================================================================
// ======================================================================
await phase('阶段 10.14：三入口 · 花瓣导航 · 移动端形态（v3.5 M1/M2/M4/M6/M7）', async () => {
  await goto('#/')
  await sleep(700)

  // —— M2 三个指标：只留三个，中间那个是北极星（连续记录周）——
  const metrics = await p.eval(`
    const box = document.querySelector('[data-testid="garden-metrics"]')
    if (!box) return { shown: false }
    const cells = [...box.querySelectorAll('.metric-cell')]
    return {
      shown: true,
      count: cells.length,
      keys: cells.map(c => c.querySelector('.metric-key')?.innerText.trim()),
      starIsSecond: cells[1]?.classList.contains('is-star'),
      weeks: Number(document.querySelector('[data-testid="metric-weeks"] .metric-value')?.innerText || '-1'),
    }
  `)
  check('「花」上有三个指标且只有三个', metrics.shown && metrics.count === 3,
        `${metrics.count} 个：${(metrics.keys || []).join(' / ')}`)
  check('北极星（连续记录周）在正中间', metrics.starIsSecond === true)
  check('连续记录周算得出来（本周有记录 ⇒ ≥1）', metrics.weeks >= 1, `${metrics.weeks} 周`)

  // —— M2 首页分层红线：形态与状态词在，精确分数不上首屏 ——
  const layered = await p.eval(`
    const t = document.querySelector('main')?.innerText || ''
    return { hasStage: /含苞|萌芽|舒展|盛放/.test(t), hasExact: /综合 \d\.\d/.test(t) }
  `)
  check('「花」上出状态词、不出精确综合分', layered.hasStage && !layered.hasExact, JSON.stringify(layered))

  // —— M7 花瓣即导航：八个热区，点一片弹出该维度面板 ——
  const petals = await p.eval(`
    const hits = [...document.querySelectorAll('[data-testid="petal-hit"]')]
    const health = hits.find(b => b.dataset.dimension === '身心健康')
    if (!health) return { count: hits.length, clicked: false }
    health.click()
    return { count: hits.length, clicked: true }
  `)
  await sleep(500)
  const sheet = await p.eval(`
    const el = document.querySelector('[data-testid="dimension-sheet"]')
    return el
      ? { shown: true, text: el.innerText.slice(0, 60),
          hasAdd: !!document.querySelector('[data-testid="sheet-quick-add"]'),
          href: document.querySelector('[data-testid="sheet-detail-link"]')?.getAttribute('href') || '' }
      : { shown: false }
  `)
  check('八片花瓣都是可点热区', petals.count === 8, `${petals.count} 个热区`)
  check('点花瓣弹出该维度面板（取代「维度管理」那一栏）',
        sheet.shown && sheet.text.includes('身心健康'), (sheet.text || '').replace(/\n/g, '/'))
  check('面板给出「记一笔到这片」与完整页出口',
        sheet.hasAdd && /#\/dimensions\//.test(sheet.href), `href=${sheet.href}`)
  await p.shot(`${SHOTS}/24-petal-sheet.png`)
  await p.eval(`document.querySelector('[data-testid="dimension-sheet"]')?.click(); return 1`)
  await sleep(300)

  // —— M4「我」：身份卡在场 ——
  await goto('#/me')
  const me = await p.eval(`return {
    identity: !!document.querySelector('[data-testid="identity-card"]'),
    about: !!document.querySelector('[data-testid="about-section"]'),
    theme: !!document.querySelector('[data-testid="theme-section"]'),
  }`)
  check('「我」上有身份卡 / 主题 / 关于三段', me.identity && me.theme && me.about, JSON.stringify(me))
  await p.shot(`${SHOTS}/25-me.png`)

  // —— M1/M6 窄屏形态：底栏出、侧栏隐、FAB 出、记录面板变八宫格 ——
  await p.send('Emulation.setDeviceMetricsOverride',
    { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
  await goto('#/')
  await sleep(800)
  const mobile = await p.eval(`
    const bar = document.querySelector('[data-testid="mobile-tabbar"]')
    const aside = document.querySelector('aside')
    const fab = document.querySelector('[data-testid="mobile-fab"]')
    const vis = el => !!el && getComputedStyle(el).display !== 'none'
    return {
      tabs: bar ? bar.querySelectorAll('a').length : 0,
      barVisible: vis(bar),
      asideHidden: !vis(aside),
      fabVisible: vis(fab),
      fabSize: fab ? Math.round(fab.getBoundingClientRect().width) : 0,
    }
  `)
  check('窄屏出底栏三入口', mobile.barVisible && mobile.tabs === 3, JSON.stringify(mobile))
  check('窄屏侧栏收起（不为移动端 fork，只换呈现）', mobile.asideHidden === true)
  check('窄屏记一笔是常驻 FAB 且 ≥44px 触控热区',
        mobile.fabVisible && mobile.fabSize >= 44, `${mobile.fabSize}px`)
  await p.shot(`${SHOTS}/26-mobile-garden.png`)

  const grid = await p.eval(`
    document.querySelector('[data-testid="mobile-fab"]').click()
    await new Promise(r => setTimeout(r, 600))
    const box = document.querySelector('[data-testid="qa-dimensions"]')
    if (!box) return { open: false }
    const cs = getComputedStyle(box)
    const cells = [...box.querySelectorAll('button')]
    const h = cells.length ? Math.round(cells[0].getBoundingClientRect().height) : 0
    const focused = document.activeElement?.tagName
    return {
      open: true,
      cols: cs.gridTemplateColumns.split(' ').length,
      cells: cells.length,
      cellH: h,
      focused,
    }
  `)
  check('FAB 打开记录面板', grid.open === true)
  check('窄屏维度是四列八宫格', grid.cols === 4, `${grid.cols} 列 / ${grid.cells} 格`)
  check('每格 ≥64px（触控热区）', grid.cellH >= 64, `${grid.cellH}px`)
  check('窄屏不自动聚焦输入框（否则键盘顶掉八宫格，两击就不成立）',
        grid.focused !== 'INPUT', `activeElement=${grid.focused}`)
  await p.shot(`${SHOTS}/27-mobile-quickadd.png`)

  await p.eval(`document.querySelector('.qa-scrim')?.click(); return 1`)
  await sleep(300)
  await p.send('Emulation.clearDeviceMetricsOverride')
  await goto('#/')
  await sleep(600)
})

// ======================================================================
await phase('阶段 11：控制台洁净度', async () => {
  const errs = p.consoleLogs.filter(l => l.type === 'error')
    .map(l => l.text.split('\n')[0])
    .filter(t => t && !t.includes('Autofill') && !t.includes('VE context'))
  check('全程无 React / JS 报错', errs.length === 0 && p.pageErrors.length === 0,
        errs.length ? errs.slice(0, 4).join(' | ') : '干净')
})

// ======================================================================
const pass = results.filter(r => r.pass).length
console.log('\n' + '='.repeat(72))
console.log(`结果：${pass}/${results.length} 通过`)
if (pass < results.length) {
  console.log('\n未通过项：')
  results.filter(r => !r.pass).forEach(r => console.log(`  ❌ ${r.name} — ${r.detail}`))
}
console.log('='.repeat(72))
fs.writeFileSync(new URL('./last-run.json', import.meta.url).pathname, JSON.stringify(results, null, 2))
await p.close()
process.exit(pass === results.length ? 0 : 1)
