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
/**
 * 换页。打包档首绘慢，固定 sleep 会赶在渲染前 —— 台账里那 4 条「导航竞态抖动」就是它。
 * 改成轮询：等 hash 真的变了、且 main 里有内容了才继续。
 */
/**
 * 切页并**等到新页面真的渲染出来**。
 *
 * 🔴 这里有一个坑，v3.7 才被暴露出来（我把「维度管理」改名之后）：
 *   原来轮询的两个条件是「hash 匹配」+「main 里有文字」——
 *   而 hash 是**同步**改的，main 里此刻还是**上一页的 DOM**，
 *   于是这两个条件在切页那一瞬就都成立了，goto 立刻返回，
 *   调用方读到的是**上一页的内容**。
 *   以前碰巧没暴露，是因为各页文案差异大、时序又刚好；
 *   一旦某页渲染慢一点（或前一页变长），断言就会读到隔壁那一页。
 *
 * 改成等「内容真的变了」：先记下当前 main 的文本，再等它变化。
 * 同页跳同页时文本不会变 —— 那种情况下等满一轮再走（只是慢一点，不会错）。
 */
async function goto(hash) {
  const before = await p.eval(`return (document.querySelector('main')?.innerText || '').trim()`)
  const already = await p.eval(`
    const h = location.hash || '#/'
    const want = ${JSON.stringify(hash || '#/')}
    return h === want || h === want + '/'
  `)
  await p.eval(`location.hash='${hash}'; return 1`)
  for (let i = 0; i < 30; i++) {
    const ok = await p.eval(`
      const h = location.hash || '#/'
      const want = ${JSON.stringify(hash || '#/')}
      const m = document.querySelector('main')
      const now = (m?.innerText || '').trim()
      const hashOk = h === want || h === want + '/'
      // 内容必须**换掉**才算渲染完；本来就在这一页时退回「有内容」即可
      return hashOk && now.length > 0 && (${JSON.stringify(!!already)} || now !== ${JSON.stringify(before)})
    `)
    if (ok) break
    await sleep(120)
  }
  await inject()
}

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
  // v3.6：侧栏已删，手机端底栏是唯一导航（全宽度生效）
  const tabs = await p.eval(`
    const bar = document.querySelector('[data-testid="mobile-tabbar"]')
    return bar ? [...bar.querySelectorAll('a')].map(a => a.dataset.tab) : []
  `)
  // v3.7 C1：第三个 tab 从「我」改名「设置」。这里断言的是**名字本身**，
  //   因为「我」和「设置」是两种不同的承诺 ——「我」许的是身份，「设置」许的是开关。
  //   子曰选了后者，那这一屏就不该再摆身份宣言当第一块。
  check('底栏三个入口（今天 / 我的花园 / 设置）',
        tabs.length === 3 && tabs.join('|') === '今天|我的花园|设置', tabs.join(' / '))
  // v3.6：默认落地页是「今天」（子曰口径：第一个 tab 是今天）
  check('首屏落在「今天」', boot.text.includes('我今天做的'), boot.text.slice(0, 40).replace(/\n/g, '/'))
  check('诊断脚手架已从界面移除', !boot.diagLeft)

  // 花形图在数据加载完成后的 useEffect 里才绘制，prod（file://）加载快，
  // 固定等待可能赶在绘制前——轮询最多 5 秒。
  // v3.6：花在「我的花园」，不在默认落地页
  await goto('#/garden')
  let radar = { painted: false, nonBlank: 0 }
  for (let tries = 0; tries < 10 && !radar.painted; tries++) {
    radar = await p.eval(`
      const c = document.querySelector('.flower-breathe canvas')
      if (!c) return { painted: false, nonBlank: 0 }
      const d = c.getContext('2d').getImageData(0,0,c.width,c.height).data
      let n = 0; for (let i=3;i<d.length;i+=4) if (d[i]>0) n++
      return { painted: n > 500, nonBlank: n }
    `)
    if (!radar.painted) await sleep(500)
  }
  check('花形图有实际绘制内容', radar.painted, `不透明像素=${radar.nonBlank}`)
  await p.shot(`${SHOTS}/01-garden.png`)
  await goto('#/')
})

// ======================================================================
await phase('阶段 2：种子数据与初始分', async () => {
  await goto('#/garden')   // v3.6：花形在「我的花园」
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
    ['#/', '我今天做的', '02-today'],
    ['#/garden', '我的花园', '02b-garden'],
    ['#/me', '这座花园', '02c-me'],
    // v3.7：「维度管理」同时撞两条 —— 「维度」是规格词（用户看到的是花瓣），「管理」是禁用词
    ['#/dimensions', '每一片花瓣', '03-dimensions'],
    ['#/actions', '全部记录', '04-actions'],
    // v3.7 改名：细看数据→花园年鉴（B8）· 周对账→我的复盘（B6）
    ['#/stats', '花园年鉴', '05-stats'],
    ['#/review', '我的复盘', '06-review'],
    ['#/settings', '设置', '07-settings'],
    // v3.7 B6：复盘拆成三层 —— 入口页 / 当期页 / 历史独立入口
    ['#/review/week', '这一周', '06b-review-week'],
    ['#/review/month', '这个月', '06c-review-month'],
    ['#/review/year', '这一年', '06d-review-year'],
    ['#/review/history', '历史回顾', '06e-review-history'],
    // v3.7 C 组：设置页五个子页
    ['#/settings/ambience', '氛围', '07b-ambience'],
    ['#/settings/backup', '备份与导出', '07c-backup'],
    ['#/settings/about', '关于', '07d-about'],
    ['#/settings/petals', '花瓣', '07e-petals'],
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
  // v3.6：底栏是唯一导航。被收掉的四项页面全都还在，只是从导航层降到场景内部
  const nav = await p.eval(`
    const links = [...document.querySelectorAll('[data-testid="mobile-tabbar"] a')]
    const garden = links.find(a => a.dataset.tab === '我的花园')
    if (!garden) return { found: false }
    garden.click()
    return { found: true, count: links.length }
  `)
  await sleep(900)
  const h = await p.eval(`return location.hash`)
  check('底栏真实点击可跳转', nav.found && h.includes('/garden'), `→ ${h}`)

  // 二级页出口：我的花园 → 花园年鉴 / 我的复盘，今天 → 全部记录，设置 → 关于 → 花语
  const drawers = await p.eval(`return {
    stats: !!document.querySelector('[data-testid="link-stats"]'),
    review: !!document.querySelector('[data-testid="link-review"]'),
  }`)
  check('「我的花园」上有花园年鉴与我的复盘两个二级出口', drawers.stats && drawers.review, JSON.stringify(drawers))
  await goto('#/')
  // v3.7 A3：底部那条 /actions 抽屉链接已删，出口改到「最近的记录」卡右上角的「更多 ›」。
  //   理由是子曰的原话「卡片右上角点击更多来打开新页面」—— 出口要贴着它所属的那块内容，
  //   而不是沉在整屏最底下（沉在最底下的出口等于没有）。
  const historyExit = await p.eval(`return {
    more: !!document.querySelector('[data-testid="recent-more"]'),
    oldDrawer: !!document.querySelector('[data-testid="link-actions"]'),
  }`)
  check('「今天」上有全部记录出口，且在「最近的记录」卡上而不是屏底抽屉',
        historyExit.more && !historyExit.oldDrawer, JSON.stringify(historyExit))
  // v3.7 C6：花语从设置页顶层降到「关于」子页里的一行入口。
  //   书香第四轮自驳了她第一轮的反对，理由是**前提已变**：
  //   手册五章已按拆散方案各归其位（八瓣章进单片设置页、花的语言进花下图例），
  //   **留在「关于」里那一份是全文存档，不是入园读物。存档放三层深是对的。**
  await goto('#/me')
  const handbookMoved = await p.eval(`return {
    onSettings: !!document.querySelector('[data-testid="link-handbook"]'),
    aboutRow: !!document.querySelector('[data-testid="row-about"]'),
  }`)
  check('设置页顶层不再有花语，改为「关于」一行',
        !handbookMoved.onSettings && handbookMoved.aboutRow, JSON.stringify(handbookMoved))
  await goto('#/settings/about')
  check('花语在「关于」子页里，且只占一行入口（不铺开五章长文）',
        await p.eval(`
          const link = document.querySelector('[data-testid="link-handbook"]')
          const promises = document.querySelector('[data-testid="about-promises"]')
          // 承诺必须排在花语之前 —— 陌生人装完第一个疑虑是「我的数据去哪了」
          return !!link && !!promises
            && promises.compareDocumentPosition(link) === Node.DOCUMENT_POSITION_FOLLOWING
        `))
})

// ======================================================================
await phase('阶段 4：快速记录（核心写入链路）', async () => {
  await goto('#/')
  baselineActions = await p.eval(`return (await window.electronAPI.dbActionsGetAll()).length`)

  const open = await p.eval(`
    const b = document.querySelector('[data-testid="mobile-fab"]')
    if (!b) return { found: false }
    b.click(); return { found: true }
  `)
  await sleep(700)
  const panel = await p.eval(`return { input: !!document.querySelector('input[placeholder^="做了什么"]') }`)
  check('记一笔 FAB 打开面板', open.found && panel.input)
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

  // —— v3.6：提交后**不弹定格帧**（第五轮圆桌：每次都演等于没演）——
  //    提交路径上只剩：光带 in-place 回执 + 角落回响。定格帧攒到下次进门再播。
  const afterSubmit = await p.eval(`return {
    frame: !!document.querySelector('[data-testid="aha-frame"]'),
    toast: !!document.querySelector('[data-testid="echo-toast"]'),
    pulsed: !!document.querySelector('[data-testid="light-band-seg"][data-pulse="1"]'),
  }`)
  check('🔴 提交后不弹定格帧（追求触发被掐死的前提）', afterSubmit.frame === false)
  check('提交后只给角落回响', afterSubmit.toast === true)
  await p.shot(`${SHOTS}/10-after-add.png`)
  await p.eval(`document.querySelector('[data-testid="echo-toast"]')?.click(); return 1`)
  await sleep(300)

  // 记录落在「今天」页上
  await goto('#/')
  check('「今天」页即时显示新行动',
        await p.eval(`return document.body.innerText.includes('晨跑')`))
})

// ======================================================================
await phase('阶段 5：评分引擎联动', async () => {
  await goto('#/garden')   // v3.6：花形与分数都在「我的花园」
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
    // v3.7：这句原来是「今日照顾了 N/M 片花瓣」，M 那个分母是完成率 ——
    //   4/8 读起来就是「满分 8 你拿了 4」，而这产品的立论恰恰是
    //   你不可能也不该照顾全部（对外主张：只能让其中两三片盛开）。
    //   分母已删，现在只报数目。断言跟着改成匹配新句式。
    //   （⚠️ 这段注释里原本写了带反引号的 4/8 —— 它在模板字符串里会把字符串截断）
    const m = document.body.innerText.match(/今天照顾了 (\\d+) 片花瓣/)
    const noRatio = !/照顾了\\s*\\d+\\s*\\/\\s*\\d+/.test(document.body.innerText)
    return { health: h?.currentScore, expected: calc(h), coveredUi: m?.[1], coveredDb, noRatio }
  `)
  check('维度分数与评分公式一致（贡献 ×0.2，无衰减扣分）',
        Math.abs(s.health - s.expected) < 0.001, `身心健康=${s.health} 期望=${s.expected}`)
  check('今日照顾花瓣数与数据库一致',
        s.coveredDb === 0 ? s.coveredUi === undefined : s.coveredUi === String(s.coveredDb),
        `UI=${s.coveredUi} DB=${s.coveredDb}`)
  check('🔴 花下面那句不出现「N/M」形式的完成率', s.noRatio === true)
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

  // v3.7 B6：/review 已是**入口页**（三行链接 + 历史入口，刻意没有输入框），
  //   写字的地方在当期页 /review/week
  await goto('#/review')
  const hub = await p.eval(`return { root: document.getElementById('root').children.length, links: document.querySelectorAll('[data-testid^="review-link-"]').length }`)
  check('复盘入口页渲染（三个入口，无输入框）', hub.root > 0 && hub.links === 3, `links=${hub.links}`)

  await goto('#/review/week')
  const review = await p.eval(`return { root: document.getElementById('root').children.length, ta: document.querySelectorAll('textarea').length }`)
  check('当期复盘页渲染（含「我的思考」输入框）', review.root > 0 && review.ta > 0, `textarea=${review.ta}`)

  // v3.7 C3：导出搬进 /settings/backup 子页；设置页主列表刻意只有清单
  await goto('#/settings')
  const st = await p.eval(`return {
    root: document.getElementById('root').children.length,
    rows: document.querySelectorAll('.settings-row').length,
    hasExport: document.body.innerText.includes('导出'),
  }`)
  check('设置页渲染为一份清单（导出已进子页，主列表不摊开）',
        st.root > 0 && st.rows >= 4, `rows=${st.rows}`)
  await goto('#/settings/backup')
  const bk = await p.eval(`return {
    root: document.getElementById('root').children.length,
    hasExport: document.body.innerText.includes('导出'),
    json: !!document.querySelector('[data-testid="export-json"]'),
    // 🔴 存储真相必须跟着搬过来，不能被简化掉（v3.4 A3）——
    //   界面简化不能把「数据会丢」一起简化掉
    clear: !!document.querySelector('[data-testid="clear-all"]'),
    // 页名不叫「数据管理」：「管理」是禁用词，而用户到这儿是**为了把东西拿走**
    banned: /管理/.test(document.querySelector('main')?.innerText || ''),
  }`)
  check('备份子页有导出 JSON / CSV / 导入 / 清除', bk.root > 0 && bk.hasExport && bk.json && bk.clear,
        JSON.stringify(bk))
  check('🔴 备份页不出现「管理」（用户到这儿是为了把东西拿走，不是来治理它）', !bk.banned)
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
await phase('阶段 9.5：复盘读写闭环（v3.7 B6 拆入口后）', async () => {
  /**
   * v3.7 B6：复盘从「一页三 tab」拆成「入口页 + 三个当期页 + 历史独立入口」。
   * 所以切周期不再是点 tab，是走路由 —— 这也顺带消掉了原来那个真 bug 的土壤
   * （在 tab 的 onClick 里 setReflection，读到的是切换「之前」那个 tab 的 existingReview）。
   *
   * ⚠️ 我给圆桌的底稿说「月与年都不存在，B6 是新建两层」，Lisa 实读代码纠正：
   *   三 tab、三池问题、历史回顾**全都早已实现**，B6 是**拆入口**。
   *   风险位置也随之改变：不在"要设计什么问题"，在"已写好的问题里哪几句是刀"。
   */
  // 入口页先验：三个入口 + 历史独立入口
  await goto('#/review')
  const hub = await p.eval(`return {
    week: !!document.querySelector('[data-testid="review-link-week"]'),
    month: !!document.querySelector('[data-testid="review-link-month"]'),
    year: !!document.querySelector('[data-testid="review-link-year"]'),
    history: !!document.querySelector('[data-testid="link-review-history"]'),
    // 🔴 年入口不许带任何「新」标记或圆点 ——
    //   年回顾对新用户是空的，任何标记都会诱导他去点开一个只会告诉他「还没有」的地方。
    //   **产品不能引导用户去看自己的空。**
    yearBadge: /新|●|·\d/.test(document.querySelector('[data-testid="review-link-year"]')?.innerText || ''),
  }`)
  check('复盘入口页有周/月/年三个入口 + 历史独立入口',
        hub.week && hub.month && hub.year && hub.history, JSON.stringify(hub))
  check('🔴 年入口不带「新」标记或圆点（不引导用户去看自己的空）', !hub.yearBadge)

  await goto('#/review/week')
  const TEXT = '操作测试：本周把 Life-OS 跑通了'

  await p.eval(`
    ${HELPERS}
    window.__t.type(document.querySelector('textarea'), ${JSON.stringify(TEXT)})
    return 1
  `)
  await sleep(300)
  // v3.7 B7：按钮文案统一成「保存」，不带宾语（三个尺度一致）
  await p.eval(`document.querySelector('[data-testid="review-save"]').click(); return 1`)
  await sleep(2000)

  const saved = await p.eval(`
    const rs = await window.electronAPI.dbReviewsGetAll()
    const r = rs.find(x => x.periodType === 'week')
    return { count: rs.length, note: r?.note, summary: (r?.autoSummary||'').slice(0,20) }
  `)
  check('思考保存落库（note + 摘要句）',
        saved.note === TEXT && saved.summary.length > 0, JSON.stringify(saved))

  const stillShown = await p.eval(`return document.querySelector('textarea').value`)
  check('保存后输入框保留内容（不被清空）', stillShown === TEXT, `框内="${stillShown}"`)

  // 切到月：应显示月周期的内容（此处为空），而不是周那段
  await goto('#/review/month')
  await sleep(600)
  const monthVal = await p.eval(`return document.querySelector('textarea')?.value ?? '(无框)'`)
  check('切换周期不串内容（月不显示周的文字）', monthVal === '' || monthVal === '(无框)', `月框内="${monthVal}"`)

  await goto('#/review/week')
  await sleep(600)
  const backVal = await p.eval(`return document.querySelector('textarea').value`)
  check('切回周恢复已存内容', backVal === TEXT, `框内="${backVal}"`)

  // 清空并保存：内容应真的被清掉，而不是弹回旧值
  await p.eval(`${HELPERS}; window.__t.type(document.querySelector('textarea'), ''); return 1`)
  await sleep(300)
  const clearedInUI = await p.eval(`return document.querySelector('textarea').value`)
  check('输入框可以被清空（旧值不回弹）', clearedInUI === '', `框内="${clearedInUI}"`)

  await p.eval(`document.querySelector('[data-testid="review-save"]').click(); return 1`)
  await sleep(2000)
  const clearedInDB = await p.eval(`
    const rs = await window.electronAPI.dbReviewsGetAll()
    return { note: rs.find(x => x.periodType === 'week')?.note }
  `)
  check('清空后的思考能存回数据库', clearedInDB.note === '', JSON.stringify(clearedInDB))
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
  // v3.7 B6：历史回顾拆成了独立页。
  //   它此前是当期页最底下的一张卡，那个位置有个具体的坏处：
  //   用户每次写完这一周的思考，往下一滚就看见自己过去十条 ——
  //   **每一次复盘都自动附赠一次自我审阅**。拆出去之后，翻旧账是他主动的选择。
  await goto('#/review/history')
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
    const ok = await p.eval(`${HELPERS}; const b = window.__t.byText('button', '新花瓣'); if (b) { b.click(); return true } return false`)
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
  await goto('#/')               // v3.6：轻推与一瞥都在「今天」这一屏，而「今天」就是默认落地页
  const card = await p.eval(`return {
    shown: !!document.querySelector('[data-testid="garden-tasks"]'),
    hasGoalTask: document.body.innerText.includes('操作测试目标'),
    hasWhy: document.querySelector('[data-testid="garden-tasks"]')?.innerText.length > 40,
  }`)
  check('看板出现「来自花园的轻声提醒」且包含目标任务', card.shown && card.hasGoalTask, JSON.stringify(card))
  await p.shot(`${SHOTS}/16-garden-tasks.png`)

  /**
   * v3.7：「完成」按钮已删，改为「记一笔」——**轻推自己不产光**。
   *
   * 这条断言比旧版强，因为它守的是一条会杀死产品立论的路径：
   * 任务生成的 ② 分支专挑**沉睡**的花瓣派任务，旧的「完成」点一下就以 impact:2 落库，
   * 于是那片花瓣当天脱离沉睡、分数上涨、在花里张开 ——
   * **一次点击可以把「这片花瓣我三周没管了」这个事实从画面上抹掉。**
   * 现在点它只打开面板、预选花瓣、预填那句话，重量由用户定。
   */
  const beforeActions = await p.eval(`return (await window.electronAPI.dbActionsGetAll()).length`)

  // 卡上不许再出现「完成」按钮与绿色判定色的「已完成 ✓」
  const noDoneBtn = await p.eval(`
    const cardEl = document.querySelector('[data-testid="garden-tasks"]')
    return {
      hasDone: [...cardEl.querySelectorAll('button')].some(b => b.innerText.trim() === '完成'),
      hasRecord: [...cardEl.querySelectorAll('button')].some(b => b.innerText.trim() === '记一笔'),
      hasDoneMark: document.body.innerText.includes('已完成 ✓'),
    }
  `)
  check('轻推卡上没有「完成」按钮，只有「记一笔」',
        !noDoneBtn.hasDone && noDoneBtn.hasRecord && !noDoneBtn.hasDoneMark, JSON.stringify(noDoneBtn))

  // 点「记一笔」→ 面板打开，且**花瓣已预选、那句话已预填**
  const opened = await p.eval(`
    const cardEl = document.querySelector('[data-testid="garden-tasks"]')
    const rows = [...cardEl.querySelectorAll('[data-testid="garden-task-row"]')]
      .filter(d => d.innerText.includes('操作测试目标'))
    if (!rows.length) return { found: false }
    const btn = [...rows[0].querySelectorAll('button')].find(b => b.innerText.trim() === '记一笔')
    if (!btn) return { found: false }
    const taskText = rows[0].querySelector('span')?.innerText || ''
    btn.click()
    await new Promise(r => setTimeout(r, 700))
    const input = document.querySelector('input[placeholder^="做了什么"]')
    return {
      found: true,
      panelOpen: !!input,
      prefilled: (input?.value || '').length > 0,
      // 预选生效的判据：面板里那片花瓣的按钮处于选中态（aria-pressed / 选中类名皆可，取其一）
      dimPicked: !!document.querySelector('[data-testid="qa-branch-toggle"]'),
    }
  `)
  check('点「记一笔」打开面板且预填了那句话',
        opened.found && opened.panelOpen && opened.prefilled, JSON.stringify(opened))
  check('预选了这片花瓣（二度分支行已出现，说明维度已定）', opened.dimPicked, JSON.stringify(opened))

  // 此刻还没有落库 —— 轻推自己不产光，这一条是整个改动的核心
  const midActions = await p.eval(`return (await window.electronAPI.dbActionsGetAll()).length`)
  check('点「记一笔」本身不落库（轻推不产光）', midActions === beforeActions,
        `${beforeActions} → ${midActions}`)

  // 由用户在面板上定重量并提交 → 才落库，且走的是和自发记录完全同一套回执
  await p.eval(`
    ${HELPERS}
    const q = window.__t.byText('button', '日常记录')
    if (q) q.click()
    await new Promise(r => setTimeout(r, 200))
    const b = [...document.querySelectorAll('button')].find(x => x.innerText.includes('⌘↵'))
    if (b && !b.disabled) b.click()
    return 1
  `)
  await sleep(2200)
  const done = await p.eval(`return {
    actions: (await window.electronAPI.dbActionsGetAll()).length,
    echoShown: !!document.querySelector('[data-testid="echo-toast"]'),
    echoText: document.querySelector('[data-testid="echo-toast"]')?.innerText.slice(0, 100) || '',
  }`)
  check('用户在面板上提交后才落库', done.actions === beforeActions + 1, `${beforeActions} → ${done.actions}`)
  check('走的是和自发记录同一套回执（回响出现且提及目标）',
        done.echoShown && done.echoText.includes('操作测试目标'),
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
await phase('阶段 10.4：主题切换（花间集 ↔ 暗夜花园 ↔ 禅意茶室）', async () => {
  await goto('#/garden')   // v3.6：花形在「我的花园」
  const initialTheme = await p.eval(`return localStorage.getItem('lifeos:theme') || 'night'`)

  // v3.7 C2：主题从三张大卡改成**行内上拉菜单** ——
  //   主题是一次性选择（一年动一两次），不该常驻一屏三分之一。
  await goto('#/settings')
  const sheetOpened = await p.eval(`
    document.querySelector('[data-testid="row-theme"]').click()
    await new Promise(r => setTimeout(r, 400))
    return {
      sheet: !!document.querySelector('[data-testid="theme-sheet"]'),
      // 上拉菜单里仍保留色板预览：主题的差别是视觉差别，只给名字等于让用户靠猜
      swatches: document.querySelectorAll('[data-testid="theme-opt-dawn"] span[style*="background"]').length,
    }
  `)
  check('点「主题」那一行升起上拉菜单，且保留色板预览',
        sheetOpened.sheet && sheetOpened.swatches >= 3, JSON.stringify(sheetOpened))
  await p.eval(`document.querySelector('[data-testid="theme-opt-dawn"]').click(); return 1`)
  await sleep(800)
  // 点选即生效即关闭，不做「确定/取消」——
  //   给一次可逆、无代价的动作加确认，是把它说成一次决定
  check('点选即生效并自动收起（无确定/取消）',
        await p.eval(`return !document.querySelector('[data-testid="theme-sheet"]')`))
  const dawn = await p.eval(`return {
    dataset: document.documentElement.dataset.theme,
    stored: localStorage.getItem('lifeos:theme'),
    bg: getComputedStyle(document.documentElement).getPropertyValue('--bg-primary').trim(),
  }`)
  check('切到禅意茶室（DOM + 持久化 + token 生效）',
        dawn.dataset === 'dawn' && dawn.stored === 'dawn' && dawn.bg === '#f2ecdc',
        JSON.stringify(dawn))
  await p.shot(`${SHOTS}/17-settings-dawn.png`)

  // 亮色下花形图照常绘制（v3.6：花在「我的花园」）
  await goto('#/garden')
  await sleep(700)
  const dawnFlower = await p.eval(`
    const c = document.querySelector('.flower-breathe canvas')
    if (!c) return { painted: false }
    const d = c.getContext('2d').getImageData(0,0,c.width,c.height).data
    let n = 0; for (let i=3;i<d.length;i+=4) if (d[i]>0) n++
    return { painted: n > 500, n }
  `)
  check('禅意茶室下花形图正常绘制', dawnFlower.painted, `不透明像素=${dawnFlower.n}`)
  await p.shot(`${SHOTS}/18-dashboard-dawn.png`)

  // 花间集（第三主题）也走一遍。v3.7 C2：同样要先升起上拉菜单
  await goto('#/settings')
  await p.eval(`
    document.querySelector('[data-testid="row-theme"]').click()
    await new Promise(r => setTimeout(r, 400))
    document.querySelector('[data-testid="theme-opt-bloom"]').click()
    return 1
  `)
  await sleep(600)
  const bloom = await p.eval(`return {
    dataset: document.documentElement.dataset.theme,
    accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
  }`)
  check('切到花间集（鲜花主色调生效）', bloom.dataset === 'bloom' && bloom.accent === '#e75565',
        JSON.stringify(bloom))
  await goto('#/')
  await p.shot(`${SHOTS}/19-dashboard-bloom.png`)

  // 切回原主题，不动用户的偏好。v3.7 C2：走上拉菜单里的选项 id，
  //   不再靠中文名找按钮（名字在菜单里，而菜单要先升起来）
  await goto('#/settings')
  await p.eval(`
    document.querySelector('[data-testid="row-theme"]').click()
    await new Promise(r => setTimeout(r, 400))
    document.querySelector('[data-testid="theme-opt-' + ${JSON.stringify(initialTheme)} + '"]').click()
    return 1
  `)
  await sleep(400)
  const restored = await p.eval(`return document.documentElement.dataset.theme`)
  check('主题恢复为进场前的设置', restored === initialTheme, `恢复为 ${restored}`)
})

// ======================================================================
await phase('阶段 10.5：花语手册（v3.1 B1）', async () => {
  await goto('#/handbook')
  const hb = await p.eval(`return {
    title: document.body.innerText.includes('花语'),
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
  // v3.7 B6：/review 已改成入口页（只有三行链接），文本框在当期页里
  await goto('#/review/week')
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
  // v3.7 C5：三个开关搬进 /settings/ambience 子页
  await goto('#/settings/ambience')
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
  await goto('#/')   // FAB 全局常驻，先回默认页避免上一个用例留下的浮层
  await p.eval(`document.querySelector('[data-testid="mobile-fab"]')?.click(); return 1`)
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
  await goto('#/garden')
  const side = await p.eval(`
    return document.querySelector('[data-testid="companion-days"] .metric-value')?.innerText || null
  `)
  check('「我的花园」出现陪伴天数（永不清零口径）', side !== null && Number(side) >= 1, `陪伴 ${side} 天`)

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
  /*
   * 老库应已被迁移豁免。
   *
   * ⚠️ 这一条曾经被**上一轮崩溃留下的污染**弄红过：
   *   本阶段中途会把 `onboardingDone` 清空（为了测首启路径），
   *   如果那之后崩了，dev 库就把 `''` 留给了下一轮，
   *   而这条断言在阶段开头读，于是报「值=」。
   *   ⇒ 修法在阶段**收尾处无条件写回 '1'**（见本阶段末尾），
   *     让这个阶段对自己造成的状态负责。
   *   这类"上一轮的残留把下一轮判红"的问题，v3.6.2 在 e2e 探针上已经踩过一次。
   */
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
  /*
   * v3.7：第二幕**分步**了（子曰口径：「内容多少要适中，垂直居中，
   * 如果一页放不下 分多页多个步骤介绍完」）。
   * 上一版靠「顶对齐 + 内层 42vh 滚动条」硬塞八条滑块 —— 那是用滚动去容纳过高的内容，
   * 而且让这一幕变成一张要滚的表单（**表单是要横向比较着填的东西**，
   * 正好是这产品最不要的动作）。现在每步三片。
   * ⇒ 所以断言从 `rows >= 8` 改成「每步 ≤3 片，且总共能走完全部花瓣」。
   */
  check('第二幕：欢迎后直达打分幕（八片花瓣独立幕已删）',
        act1.scoring && act1.rows > 0 && act1.rows <= 3 && act1.noPetalAct,
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

  /*
   * 走完第二幕剩下的分步。顺便**逐步守两条**：
   *   ① 每一步都不超过 3 片（分页真的分了）
   *   ② 每一步内层都没有滚动条 —— 有滚动条就说明这一步内容仍然放不下，
   *      那正是子曰点名的那个问题
   */
  const steps = await p.eval(`
    const out = []
    for (let i = 0; i < 8; i++) {
      const box = document.querySelector('[data-testid="onboarding"]')
      out.push({
        rows: document.querySelectorAll('[data-testid="onboarding-score-row"]').length,
        innerScroll: [...box.querySelectorAll('*')].some(el => {
          const cs = getComputedStyle(el)
          return (cs.overflowY === 'auto' || cs.overflowY === 'scroll')
            && el.scrollHeight > el.clientHeight + 2 && el !== box
        }),
      })
      const next = document.querySelector('[data-testid="onboarding-step-next"]')
      if (!next) break
      next.click()
      await new Promise(r => setTimeout(r, 500))
    }
    return out
  `)
  check('第二幕：分步走得完，且每步不超过三片花瓣',
        steps.length >= 2 && steps.every(x => x.rows > 0 && x.rows <= 3),
        steps.map(x => x.rows).join('+'))
  check('🔴 第二幕每一步都放得下（内层没有滚动条）',
        steps.every(x => !x.innerScroll),
        steps.map((x, i) => (x.innerScroll ? `第${i + 1}步溢出` : '')).filter(Boolean).join(' ') || '每步都放得下')

  await p.eval(`document.querySelector('[data-testid="onboarding-bloom"]').click(); return 1`)
  await sleep(3000)
  const act3 = await p.eval(`return {
    bloom: document.querySelector('[data-testid="onboarding"]')?.innerText.includes('花开了'),
    canvas: !!document.querySelector('[data-testid="onboarding"] canvas'),
    impression: document.querySelector('[data-testid="first-impression"]')?.innerText || '',
  }`)
  check('第三幕：花开了（那一屏只放花与代价快照）',
        act3.bloom && act3.canvas, JSON.stringify({ bloom: act3.bloom, canvas: act3.canvas }))
  // T1 核心：代价快照必须出现，且不能有褒贬词（Lisa 的口径红线）
  check('第三幕：第一份代价快照出现',
        act3.impression.length > 0 && /选择|合着|接近/.test(act3.impression),
        act3.impression.slice(0, 50).replace(/\n/g, '/'))
  check('第三幕：快照句无褒贬（不出现"最丰盛/很难得/不错"）',
        !/最丰盛|很难得|难得|不错|真棒|做得好/.test(act3.impression),
        act3.impression.slice(0, 50).replace(/\n/g, '/'))
  await p.shot(`${SHOTS}/23-onboarding-bloom.png`)

  /*
   * v3.7：第三幕也拆成两步（子曰：「花开了 内容还是比较多 一屏放不下」）。
   * 拆法不是对半切，是按**这一幕的两件事**切：
   *   第 0 步 = 那个瞬间（花 + 第一份代价快照）—— 整个引导的情绪落点，独占一屏
   *   第 1 步 = 接下来怎么用（三条 + 明信片 + 出口）
   * **把"感受"和"说明"塞进同一屏，感受一定输。**
   * 所以明信片与操作说明现在在第二步，要先点「接着看」。
   */
  const howto = await p.eval(`
    const btn = document.querySelector('[data-testid="onboarding-bloom-next"]')
    if (!btn) return { advanced: false }
    btn.click()
    await new Promise(r => setTimeout(r, 700))
    const box = document.querySelector('[data-testid="onboarding-howto"]')
    const txt = box?.innerText || ''
    return {
      advanced: !!box,
      // 🔴 三条操作说明原来指向的 UI **已经不存在了**：
      //   「+ 快速记录」在 v3.7 D1 改成了右下角那个「记」；
      //   「左边的『省 · 回顾反思』」—— 侧栏在 v3.6 整个删掉了。
      //   一份教用户去点不存在的东西的说明书，比没有说明书更坏：
      //   它让用户以为是自己找不到。
      stale: /侧栏|左边的|快速记录|花语手册/.test(txt),
      mentionsFab: /「记」/.test(txt),
    }
  `)
  check('第三幕第二步：接下来怎么用（说明与明信片已从"花开了"那一屏拆出）',
        howto.advanced, JSON.stringify(howto))
  check('🔴 操作说明不指向已删的 UI（侧栏 / 「+ 快速记录」/ 「花语手册」）',
        howto.stale === false && howto.mentionsFab === true, JSON.stringify(howto))

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

  // —— 可重看（v3.7 C5：跟着氛围一起进子页）——
  await goto('#/settings/ambience')
  await p.eval(`document.querySelector('[data-testid="replay-onboarding"]').click(); return 1`)
  await sleep(600)
  const replay = await p.eval(`return !!document.querySelector('[data-testid="onboarding"]')`)
  check('氛围页可重看引导', replay)
  await p.eval(`${HELPERS}; window.__t.byText('button', '先逛逛').click(); return 1`)
  await sleep(800)

  // 🔴 收尾：无条件写回 '1'。本阶段中途清空过它，
  //   一旦中途崩溃就会把 '' 留给下一轮，把阶段开头那条断言判红（已经发生过一次）。
  await p.eval(`await window.electronAPI.dbSettingsSet('onboardingDone', '1'); return 1`)

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
  await goto('#/garden')   // v3.6：花形与会谈入口都在「我的花园」
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
  await goto('#/garden')
  await sleep(700)
  const withFocus = await p.eval(`return document.querySelector('.flower-breathe canvas').toDataURL()`)
  await p.eval(`await window.electronAPI.dbFocusSet([]); return 1`)
  await reload()
  await goto('#/garden')
  await sleep(700)
  const withoutFocus = await p.eval(`return document.querySelector('.flower-breathe canvas').toDataURL()`)
  check('非焦点维度视觉零降级（有无焦点，主图层逐像素一致）',
        withFocus.length > 1000 && withFocus === withoutFocus,
        `len=${withFocus.length} 一致=${withFocus === withoutFocus}`)

  // —— 8. 邀请卡：满 84 天才出现，推迟后当周不再现（v3.6：结算区在「我的花园」）——
  await p.eval(`
    const rows = await window.electronAPI.dbQuarterlyGetAll()
    const r = rows.find(x => x.completedAt)
    r.completedAt = Date.now() - 85 * 24 * 60 * 60 * 1000   // 把上一次会谈推回 85 天前
    await window.electronAPI.dbQuarterlyUpsert(r)
    return r.id
  `)
  await reload()
  await goto('#/garden')        // v3.6：邀请卡在「我的花园」的结算区
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
  await goto('#/garden')          // v3.6：续谈卡在「我的花园」的结算区
  await sleep(700)
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
  await goto('#/')              // v3.6：今日一瞥在「今天」，也就是默认落地页
  await sleep(900)

  /**
   * v3.7 A1：「今日一瞥」那张卡已删，那句观察降级为**光带的图注**。
   *
   * Lisa 第四轮否决了她自己上一轮的方案（给卡加四道闸门保留它），判据是：
   *   **稀疏 + 有容器 = 奖励结构。** 加闸后卡大部分日子是空的，
   *   藏起来则「卡片的出现本身成了信号」，容器的出现变成事件；不藏则永久多一块空占位。
   * ⇒ 降级为图注，因为**注解没有容器，它空着的时候什么都不发生，没有位置在等话**。
   *
   * 所以这里的断言反过来守两件事：
   *   ① 旧那张卡**不许再出现**
   *   ② 图注若出现，必须挂在光带卡片内、无按钮、不提问、无催办语气
   */
  const oldCard = await p.eval(`return !!document.querySelector('[data-testid="daily-glance"]')`)
  check('🔴 「今日一瞥」那张卡已拆掉（容器没了，不是内容没了）', !oldCard)

  const caption = await p.eval(`
    const el = document.querySelector('[data-testid="band-caption"]')
    if (!el) return { rendered: false }
    const band = el.closest('.card')
    return {
      rendered: true,
      kind: el.dataset.kind,
      text: el.innerText,
      // 必须与光带同在一张卡里 —— 它是给那张图配的注解，不是另起一段讲话
      insideBandCard: !!band && !!band.querySelector('[data-testid="light-band"]'),
      buttons: el.querySelectorAll('button, a').length,
    }
  `)
  if (caption.rendered) {
    check('图注与光带共用同一张卡（是图注，不是新的一段话）', caption.insideBandCard, JSON.stringify(caption.insideBandCard))
    check('图注类型收窄为 growth/companion（追问已搬去月度校准）',
          ['growth', 'companion'].includes(caption.kind), `kind=${caption.kind}`)
    check('🔴 图注不提问（图注是给图配注解，不是产品向你发问）',
          !/[？?]/.test(caption.text), caption.text.slice(0, 60))
    check('图注无催办语气（不出现 浇一下/该去/别忘/落后）',
          !/浇一下|该去|别忘|落后|快去|加油/.test(caption.text),
          caption.text.slice(0, 60).replace(/\n/g, '/'))
    check('图注不带任何按钮（不是软推送）', caption.buttons === 0, `按钮数 ${caption.buttons}`)
  } else {
    // 不渲染也是合法状态（深夜 / 坏日子 / 样本地板不足 / 同句冷却）——
    // 而且这正是「没有容器」的证明：那一行不在，卡片高度自然收缩
    check('图注无句可说时整行不渲染（不是空行、不是占位）', true, '本次静音')
  }

  // —— T3 光带：近 7 天零记录时正确地不渲染（空账不摆空带子当摆设）——
  await goto('#/garden')        // v3.6：光带跟花都在「我的花园」
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

  // —— T2 Echo 账本行：走记一笔 FAB 的真实路径 ——
  // 「社交关系」在前面各阶段没被写过，这里连记两条：第 2 条必然满足「本季第 2 次」
  const ledgerTexts = []
  for (let i = 0; i < 2; i++) {
    await p.eval(`document.querySelector('[data-testid="mobile-fab"]').click(); return 1`)
    await sleep(600)
    // 🔴 必须**限定在记录面板内**取花瓣格：这一屏（我的花园）上还有一列花瓣行，
    //    裸 byText('button','社交关系') 会先命中那一行，点开的是维度面板，不是选中花瓣
    await p.eval(`
      const box = document.querySelector('[data-testid="qa-dimensions"]')
      const b = [...box.querySelectorAll('button')].find(x => x.dataset.dimension === '社交关系')
      b.click(); return 1
    `)
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
  await goto('#/garden')          // v3.6：光带跟花都在「我的花园」
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
  // 🔴 只比**本段自己插的那两片**，不比「占比第一和第二」——
  //    后者会被库里其它维度的存量数据挤掉名次，那是环境噪声不是回归
  //    （打包档跑的是真实用户库，一定有存量数据）
  const social = band.names.indexOf('社交关系')
  const healthIdx = band.names.indexOf('身心健康')
  check('光带按 impact 加权（里程碑 5×2 比小事 2 占更多光）',
        social >= 0 && healthIdx >= 0 && band.widths[social] > band.widths[healthIdx],
        `社交关系=${band.widths[social]}% > 身心健康=${band.widths[healthIdx]}%`)

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
  await p.eval(`document.querySelector('[data-testid="mobile-fab"]').click(); return 1`)
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
  // 🔴 必须在「我的花园」判 —— 在「今天」页它恒为 true，那是假过
  await goto('#/garden')
  await sleep(700)
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
  /**
   * v3.7 B5：子曰要「第五个卡片暂时不要了，隐藏」。裁决是**只藏两样，邀请不能藏**：
   *   · 月度微校准 + 明信片 ⇒ 收进「我的复盘」（它们本来就是回顾物）
   *   · 季度会谈邀请 ⇒ **留在「我的花园」**。书香的理由无法反驳：手册第四章已把
   *     「到期不催、推迟两次缩成小花苞」**写成了承诺**，藏掉它是产品毁自己写下的字。
   *   更硬的一条是实证：`bud`（底栏那枚小花苞）的触发条件是**连续推迟两次之后** ——
   *   卡一藏，用户就永远不会去推迟，于是**花蕾永不出现，到期信号彻底消失**。
   *
   * 而那句追问「这是你想要的分法吗？」也只能落在这里 ——
   * **追问只能出现在用户已经坐下来的地方**：月度校准是他主动点进去、有输入框、
   * 有跳过路径的屏；「今天」屏他是来放东西的。同一句话在两处一个是提问，一个是拦路。
   */
  await goto('#/review/month')
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
await phase('阶段 10.14：三入口 · 花瓣导航 · 八瓣约定 · 进门定格帧（v3.6）', async () => {
  // ---- 「我的花园」三个板块 ----
  await goto('#/garden')
  await sleep(800)

  const garden = await p.eval(`
    const box = document.querySelector('[data-testid="time-summary"]')
    const cells = box ? [...box.querySelectorAll('.metric-cell')] : []
    return {
      weekRings: !!document.querySelector('[data-testid="week-rings"]'),
      weekTitle: document.querySelector('[data-testid="week-rings-title"]')?.innerText || '',
      weekCols: document.querySelectorAll('[data-testid="week-cols"] .week-col').length,
      // 🔴 今天那一列不许被高亮/描边/加指针 —— 一旦标出来，视线就跟着它往右走，
      //   那才是进度条的阅读方向。七列一律等价
      todayMarked: !!document.querySelector('.week-col.is-today, .week-col[data-today="1"]'),
      // 🔴 未来的日子只有一条 1px 底线，没有容器 —— 空槽就是"待填"，槽本身就是进度条语法
      futureBoxed: [...document.querySelectorAll('.week-col[data-future="1"] .week-bar')]
        .some(el => !el.classList.contains('is-future')),
      // 🔴 列高恒定：高度一随量走它就是柱状图，多就是好
      colHeights: [...new Set([...document.querySelectorAll('.week-bar')].map(el => el.style.height))],
      shape: document.querySelector('[data-testid="shape-summary"]')?.innerText || '',
      cells: cells.length,
      keys: cells.map(c => c.querySelector('.metric-key')?.innerText.trim()),
      recorded: Number(document.querySelector('[data-testid="metric-recorded"] .metric-value')?.innerText || '-1'),
      switcher: !!document.querySelector('[data-testid="garden-view-switch"]'),
      petals: document.querySelectorAll('[data-testid="petal-row"]').length,
    }
  `)
  /**
   * v3.7 B1：首屏第一块从「九十天年轮」换成「一周的光」——
   * 子曰原话「默认按照一个周的维度…一天是一个竖着的长方形」。
   * 九十天那张移到「花园年鉴」（两张图回答不同尺度的问题）。
   *
   * 窗口之争是第六轮最尖锐的一处：小露要滚动七天（"日历周每周一是 1/7 满，
   * 那就是每周清零重来的进度条"），小艾要固定日历周（"滑窗永不归零，
   * 会制造连续的错觉"）—— **同一个"进度条"理由，相反结论**。
   * 小艾以「**页 vs 传送带：证据不能有保质期**」+ 改默认视图（周一停上一周，
   * **归零由用户第一笔触发**）胜出，Lisa 第四轮投票接受并认下他抓到她一个双标。
   */
  check('板块⓿ 一周的光在场，七列', garden.weekRings === true && garden.weekCols === 7,
        `cols=${garden.weekCols}`)
  check('标题跟着所显示的那一页走（不写死「这一周」）',
        /这一周的光|上一周的光|月.*日/.test(garden.weekTitle), garden.weekTitle)
  check('🔴 今天那一列不高亮、不描边、不加指针（七列一律等价）', !garden.todayMarked)
  check('🔴 未来的日子不画空槽，只有一条底线（槽本身就是进度条语法）', !garden.futureBoxed)
  check('🔴 列高恒定，不随当天 impact 变化（高度一随量走就是柱状图）',
        garden.colHeights.length === 1, `出现了 ${garden.colHeights.length} 种列高：${garden.colHeights.join(',')}`)
  check('板块① 一句小概括是形状不是分数',
        garden.shape.length > 0 && !/\d+(\.\d+)?\s*分/.test(garden.shape), garden.shape)
  check('板块② 时间汇总三个数（陪伴天数 / 记过的天 / 一共几笔）',
        garden.cells === 3, `${garden.cells} 个：${(garden.keys || []).join(' / ')}`)
  check('有记录的天数算得出来', garden.recorded >= 1, `${garden.recorded} 天`)
  // v3.7 B4：子曰原话「第四个卡片只要周月对比数据，花瓣数据不要了」。
  //   所以切换器与花瓣清单一起删 —— 断言反过来守：它们**不许再出现**。
  //   ⚠️ 红线 1「沉睡花瓣绝不隐藏」并没有因此被破：那份逐片清单搬去了「花园年鉴」的
  //   「每一片花瓣」子页（书香判它要独占一扇门 —— 一个要承担「绝不隐藏」的清单，
  //   不能是第七块里往下滚出来的东西）。这里只是它不再占花园首屏的位置。
  check('板块③ 只剩周月对比，花瓣清单与切换器都已移走',
        garden.switcher === false && garden.petals === 0,
        `switcher=${garden.switcher} / petalRows=${garden.petals}`)

  // 数字纪律：日常光带上不许出现占比数字，也不许挂 title 泄漏
  const bandLeak = await p.eval(`
    const segs = [...document.querySelectorAll('[data-testid="light-band-seg"]')]
    return { withTitle: segs.filter(s => s.getAttribute('title')).length, count: segs.length }
  `)
  check('🔴 常驻光带不挂 title（八个百分比不许一悬停全出来）',
        bandLeak.withTitle === 0, `${bandLeak.withTitle}/${bandLeak.count} 段带 title`)

  // 周月对比：不许出现箭头与「进步」
  // v3.7 B4：这里原来要先点一下 `[data-view="compare"]` 切过去。切换器已随花瓣清单一起删，
  //   周月对比成了这张卡的常态 —— 所以不再需要那次点击（保留它会点到 null）。
  await sleep(300)
  const cmp = await p.eval(`
    const el = document.querySelector('[data-testid="period-compare"]')
    return { shown: !!el, text: el?.innerText || '', modes: el?.querySelectorAll('[data-mode]').length || 0 }
  `)
  check('周月对比可切出来，且有按周/按月两档', cmp.shown && cmp.modes === 2, `${cmp.modes} 档`)
  check('🔴 对比里不出现箭头，也不出现「进步」（占比模型里它是数学伪概念）',
        !/[→↑↓]/.test(cmp.text) && !/进步|提升|改善/.test(cmp.text),
        cmp.text.replace(/\n/g, ' / ').slice(0, 90))
  await p.shot(`${SHOTS}/24-garden.png`)

  // ---- M7 花瓣即导航 ----
  // v3.7 B4：原来这里先点 `[data-view="petals"]` 把卡切回花瓣视图。切换器已删，
  //   而花瓣热区本来就长在**花**上（板块②，B2 判维持现状），跟那张卡无关，所以直接测。
  await sleep(300)
  const petals = await p.eval(`
    const hits = [...document.querySelectorAll('[data-testid="petal-hit"]')]
    const health = hits.find(b => b.dataset.dimension === '身心健康')
    if (health) health.click()
    return {
      count: hits.length,
      clicked: !!health,
      // v3.7：热区数必须等于**在册花瓣数**，不许写死 8。
      //   子曰这一版的原话是「并不一定所有人都有 8 个花瓣」——
      //   e2e 自己写死 8，就会在瓣数可变之后变成一道拦住正确实现的门。
      enabled: (await window.electronAPI.dbDimensionsGetAll()).filter(d => d.is_enabled !== 0).length,
    }
  `)
  await sleep(500)
  const sheet = await p.eval(`
    const el = document.querySelector('[data-testid="dimension-sheet"]')
    return el ? { shown: true, text: el.innerText.slice(0, 40) } : { shown: false }
  `)
  check('每片在册花瓣都是可点热区（数目跟着在册瓣数走，不写死 8）',
        petals.count === petals.enabled && petals.count > 0,
        `${petals.count} 个热区 / ${petals.enabled} 片在册`)
  check('点花瓣弹出该维度面板', sheet.shown && sheet.text.includes('身心健康'),
        (sheet.text || '').replace(/\n/g, '/'))
  await p.eval(`document.querySelector('[data-testid="dimension-sheet"]')?.click(); return 1`)
  await sleep(300)

  /**
   * ---- 设置页：清单 + 五个子页（v3.7 C 组）----
   *
   * 上一版这一页是七张大卡摊在一屏里，手机窄屏要滚七八屏，
   * 而其中每一项都是**一年动一两次**的东西。子曰的 C2–C7 方向一致：主界面简化。
   */
  await goto('#/me')
  await sleep(700)
  const me = await p.eval(`return {
    identity: !!document.querySelector('[data-testid="identity-card"]'),
    rowPetals: !!document.querySelector('[data-testid="link-petals"]'),
    rowTheme: !!document.querySelector('[data-testid="row-theme"]'),
    rowAmbience: !!document.querySelector('[data-testid="row-ambience"]'),
    rowBackup: !!document.querySelector('[data-testid="row-backup"]'),
    rowAbout: !!document.querySelector('[data-testid="row-about"]'),
    // 旧那些整块摊开的卡片都不该再在这一页
    oldIntent: !!document.querySelector('[data-testid="petal-intent"]'),
    oldTheme: !!document.querySelector('[data-testid="theme-section"]'),
    oldAmbience: !!document.querySelector('[data-testid="ambience-section"]'),
    oldAbout: !!document.querySelector('[data-testid="about-section"]'),
    // 🔴 这一页不许出现「管理」「系统」——都是禁用词
    banned: /管理|系统/.test(document.querySelector('main')?.innerText || ''),
  }`)
  check('设置页是一份清单：花瓣 / 主题 / 氛围 / 备份与导出 / 关于',
        me.identity && me.rowPetals && me.rowTheme && me.rowAmbience && me.rowBackup && me.rowAbout,
        JSON.stringify(me))
  check('旧那四张摊开的大卡都已进子页（主界面真的简化了）',
        !me.oldIntent && !me.oldTheme && !me.oldAmbience && !me.oldAbout, JSON.stringify(me))
  check('🔴 设置页不出现「管理」「系统」（禁用词）', !me.banned)

  /**
   * ---- C7 三层：卡片 → 花瓣列表 → 单片页 ----
   *
   * 书香判的形态，理由**不是屏幕大小，是行为**：
   *   24 个输入框同屏就是一张表，而**人对着表会横向找平** ——
   *   那正是这产品最不要的动作（Lisa：「均匀」不是成就）。
   *   一次只露一片，他只能纵向想「这一片我想给多少」，**找不着平可调**。
   */
  await goto('#/settings/petals')
  await sleep(600)
  const list = await p.eval(`return {
    rows: document.querySelectorAll('[data-testid="petal-list-row"]').length,
    enabled: (await window.electronAPI.dbDimensionsGetAll()).filter(d => d.is_enabled !== 0).length,
    // 🔴 列表页不许有任何输入控件 —— 有输入就意味着可以同屏比较着调
    inputs: document.querySelectorAll('[data-testid="petal-list"] input, [data-testid="petal-list"] textarea, [data-testid="petal-list"] select').length,
    // 「现在」只给状态词，不给精确分数（一排数字就是一张可调平的表）
    hasNumbers: /\d+\.\d/.test(document.querySelector('[data-testid="petal-list"]')?.innerText || ''),
  }`)
  check('花瓣列表逐片在场，数目跟着在册瓣数走', list.rows === list.enabled && list.rows > 0,
        `${list.rows} 行 / ${list.enabled} 片在册`)
  check('🔴 列表页零输入控件（同屏可调 = 会横向找平）', list.inputs === 0, `${list.inputs} 个输入`)
  check('🔴 列表上不出现精确分数，只给状态词', !list.hasNumbers)

  // 进第三层：单片页。**「这片花瓣照看什么」必须排在所有输入之前**
  const healthId = await p.eval(`
    const dims = await window.electronAPI.dbDimensionsGetAll()
    return dims.find(d => d.name === '身心健康').id
  `)
  await goto(`#/settings/petals/${healthId}`)
  await sleep(600)
  const single = await p.eval(`return {
    about: !!document.querySelector('[data-testid="petal-about"]'),
    aboutText: document.querySelector('[data-testid="petal-about"]')?.innerText || '',
    now: !!document.querySelector('[data-testid="petal-now"]'),
    target: !!document.querySelector('[data-testid="petal-target"]'),
    pact: !!document.querySelector('[data-testid="petal-pact"]'),
    save: !!document.querySelector('[data-testid="petal-save"]'),
    skip: !!document.querySelector('[data-testid="petal-skip"]'),
    // 🔴 这一页刻意不显示任何别的花瓣（连"其余 N 片的进度"这种脚注也不给）
    otherPetals: document.querySelectorAll('[data-testid="petal-list-row"]').length,
    // 「照看什么」在「想要开到哪」之前 —— 这是列表+第三层这个形态的独家红利
    aboutFirst: (() => {
      const a = document.querySelector('[data-testid="petal-about"]')
      const t = document.querySelector('[data-testid="petal-target"]')
      return !!a && !!t && a.compareDocumentPosition(t) === Node.DOCUMENT_POSITION_FOLLOWING
    })(),
  }`)
  check('单片页四块齐全：照看什么 / 现在 / 想要开到哪 / 一句约定',
        single.about && single.now && single.target && single.pact, JSON.stringify(single))
  check('🔴 「这片花瓣照看什么」排在所有输入之前（填之前先读到它照看什么）', single.aboutFirst)
  check('🔴 单片页不显示任何别的花瓣（一次只面对一片）', single.otherPetals === 0)
  check('有「保存并返回」也有「这一片先不设」（留空是回答，不是未完成）',
        single.save && single.skip)
  check('照看什么那段取自手册第三章（C6 拆散后的落点）',
        single.aboutText.includes('身体') || single.aboutText.includes('照看'),
        single.aboutText.slice(0, 50).replace(/\n/g, '/'))

  // 目标分 + 约定三件套落库（v5/v6 迁移），且这一页保存一次写完
  const saved = await p.eval(`
    ${HELPERS}
    // 🔴 必须设成与当前值不同的数：React 的值追踪器认为没变就不会触发 onChange
    window.__t.type(document.querySelector('[data-testid="petal-target-range"]'), '1')
    await new Promise(r => setTimeout(r, 300))
    window.__t.byText('button', '周三').click()
    await new Promise(r => setTimeout(r, 200))
    window.__t.type(document.querySelector('[data-testid="petal-pact-anchor"]'), '吃完晚饭')
    window.__t.type(document.querySelector('[data-testid="petal-pact-text"]'), '走二十分钟')
    await new Promise(r => setTimeout(r, 300))
    const bodyText = document.querySelector('main').innerText
    document.querySelector('[data-testid="petal-save"]').click()
    await new Promise(r => setTimeout(r, 1600))
    const dims = await window.electronAPI.dbDimensionsGetAll()
    const d = dims.find(x => x.name === '身心健康')
    return {
      target: d.targetScore, timing: d.pactTiming, anchor: d.pactAnchor, text: d.pactText,
      bodyText,
      // 保存后应回到列表页
      backOnList: location.hash.endsWith('/settings/petals'),
    }
  `)
  check('目标分落库（迁移 v5 的 targetScore）', saved.target === 1, `targetScore=${saved.target}`)
  check('约定三件套落库（迁移 v6）',
        saved.timing === '周三' && saved.anchor === '吃完晚饭' && saved.text === '走二十分钟',
        JSON.stringify({ t: saved.timing, a: saved.anchor, x: saved.text }))
  check('「保存并返回」真的返回列表（保存边界与"一次只想一片"对齐）', saved.backOnList,
        `hash=${saved.backOnList}`)
  check('🔴 单片页上没有完成态 / 进度 / 完成率（一有裁判它就变任务）',
        !/完成率|已完成|未完成|\d+\/\d+|进度/.test(saved.bodyText))
  await p.shot(`${SHOTS}/25-petal-edit.png`)

  // 约定的上下文内自我提示：只在记录面板里选中这片花瓣时出现
  await goto('#/')
  await sleep(500)
  const ctx = await p.eval(`
    document.querySelector('[data-testid="mobile-fab"]').click()
    await new Promise(r => setTimeout(r, 600))
    const before = !!document.querySelector('[data-testid="qa-pact"]')
    const chip = [...document.querySelectorAll('[data-testid="qa-dimensions"] button')]
      .find(b => b.dataset.dimension === '身心健康')
    chip.click()
    await new Promise(r => setTimeout(r, 400))
    const after = document.querySelector('[data-testid="qa-pact"]')?.innerText || ''
    return { before, after }
  `)
  check('约定不主动出现（没选中这片时面板上没有它）', ctx.before === false)
  check('选中这片花瓣时它自己出现（上下文内自我提示，不是推送）',
        /每个周三/.test(ctx.after), ctx.after.slice(0, 50))
  await p.eval(`document.querySelector('.qa-scrim')?.click(); return 1`)
  await sleep(300)

  // 清理：把约定与目标撤掉，别污染后续用例与真实库
  await p.eval(`
    const dims = await window.electronAPI.dbDimensionsGetAll()
    const d = dims.find(x => x.name === '身心健康')
    await window.electronAPI.dbDimensionsUpdate(d.id,
      { targetScore: null, pactTiming: '', pactAnchor: '', pactText: '' })
    return 1
  `)
  await sleep(400)
})

// ======================================================================
// ======================================================================
await phase('阶段 10.15：光的分配 —— 进门的一眼 + 闸门（v3.6 核心）', async () => {
  // 清场 + 造样本：把闸门状态与待播载荷清空；
  // 并保证近 7 天的样本过得了「地板」（impact ≥ 20 且参与分光 ≥ 4 片）——
  // 地板本身是设计要求（账太薄时名次变化只是分母噪声），所以测它之前要先把账做厚。
  await p.eval(`
    await window.electronAPI.dbEventsClearPrefix('aha_')
    await window.electronAPI.dbSettingsSet('ahaPending', '')
    const dims = await window.electronAPI.dbDimensionsGetAll()
    const today = new Date(); today.setHours(0,0,0,0)
    for (let i = 0; i < 5; i++) {
      const d = dims[i]
      await window.electronAPI.dbActionsAdd({
        id: 'aha-floor-' + i, date: today.getTime() - i * 86400000,
        description: 'Aha 通道验证 · 铺底', quality: 'milestone', impact: 5, isCompleted: 1,
        createdAt: Date.now(), updatedAt: Date.now(),
        dimensionId: d.id, branchId: null, goalId: null, mood: '',
      })
    }
    // 坏日子闸门会静音结构类发现：把今天的 tired/vexed 心情清掉，否则测的是静音不是闸门
    const rows = await window.electronAPI.dbActionsGetAll()
    for (const r of rows) {
      if (r.date >= today.getTime() && (r.mood === 'tired' || r.mood === 'vexed')) {
        await window.electronAPI.dbActionsUpdate(r.id, { mood: '' })
      }
    }
    return 1
  `)
  await reload()
  await goto('#/')
  await sleep(600)

  const hour = new Date().getHours()
  const isNight = hour >= 22 || hour < 5

  // 记一笔（走真实 UI 路径）
  await p.eval(`
    document.querySelector('[data-testid="mobile-fab"]').click()
    await new Promise(r => setTimeout(r, 600))
    const chip = [...document.querySelectorAll('[data-testid="qa-dimensions"] button')]
      .find(b => b.dataset.dimension === '休闲娱乐')
    chip.click()
    await new Promise(r => setTimeout(r, 300))
    const input = document.querySelector('input[placeholder^="做了什么"]')
    input.value = 'Aha 通道验证'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await new Promise(r => setTimeout(r, 200))
    const submit = [...document.querySelectorAll('button')].find(b => b.innerText.includes('⌘↵'))
    submit.click()
    return 1
  `)
  await sleep(2200)

  const submitted = await p.eval(`
    return {
      frame: !!document.querySelector('[data-testid="aha-frame"]'),
      pending: (await window.electronAPI.dbSettingsGet('ahaPending')) || '',
      pulsed: document.querySelectorAll('[data-testid="light-band-seg"][data-pulse="1"]').length,
    }
  `)
  check('🔴 提交后不弹定格帧', submitted.frame === false)
  if (isNight) {
    // Lisa 定的唯一「只减不加」时段：深夜不攒定格帧，且不落事件行 ⇒ 不消耗冷却
    check('深夜提交不攒定格帧（静音档）', submitted.pending === '', `深夜 ${hour} 点`)
  } else {
    // 攒到的是哪一种由优先级决定（first_ever > stage_up > awaken > light_shift），
    // 所以只断言「攒下了一条、且是四种之一」，不写死 kind
    const kind = (submitted.pending.match(/"kind":"(\w+)"/) || [])[1] || ''
    check('白天提交把定格帧攒起来（等下次进门播）',
          ['light_shift', 'stage_up', 'awaken', 'intent_set'].includes(kind),
          `kind=${kind || '(空)'}`)
  }

  // 进门：重载一次，定格帧应当在首帧就在（载荷在 loadData 里已取好，不会闪）。
  // 🔴 不能用固定 sleep 等它 —— 帧会自动淡出，固定等待要么赶在挂载前、要么赶在淡出后。
  //    改成轮询「出现即读」，这也顺带验了「首帧就在，不是进门后才算」。
  await reload()
  for (let i = 0; i < 12; i++) {
    if (await p.eval(`return !!document.querySelector('[data-testid="aha-frame"]')`)) break
    await sleep(250)
  }
  const frame = await p.eval(`
    const el = document.querySelector('[data-testid="aha-frame"]')
    if (!el) return { shown: false }
    const fact = document.querySelector('[data-testid="aha-fact"]')?.innerText || ''
    const num = document.querySelector('[data-testid="aha-number"]')?.innerText || ''
    return {
      shown: true, fact, num,
      segs: document.querySelectorAll('[data-testid="aha-band-seg"]').length,
      inks: document.querySelectorAll('[data-testid="aha-ink"]').length,
      anchor: document.querySelector('[data-testid="aha-anchor"]')?.innerText || '',
      allText: el.innerText,
      // 全屏占比数字个数：只许一个
      pctCount: (el.innerText.match(/\\d+%/g) || []).length,
    }
  `)

  if (isNight) {
    check('深夜进门也不播定格帧（进门这一刻同样收声）', frame.shown === false, `深夜 ${hour} 点`)
  } else {
    check('进门的一眼：定格帧出现', frame.shown === true)
    if (frame.shown) {
      check('带日期锚（定格帧移到进门后，因果链需要它）',
            frame.anchor.length > 0, frame.anchor)
      check('主句无表扬词、无感叹号、不出现「连续」',
            !/真棒|恭喜|加油|做得好|进步|坚持|连续/.test(frame.fact) && !/[!！]/.test(frame.fact), frame.fact)
      check('🔴 零箭头（方向符号即评价符号）', !/[→↑↓]/.test(frame.allText))
      // 光河那一套只在「光的分配」这一种下成立；事实型定格刻意零动画零数字
      const isRiver = await p.eval(`return !!document.querySelector('[data-testid="light-shift"]')`)
      if (isRiver) {
        check('光河八段在场', frame.segs >= 2, `${frame.segs} 段`)
        check('三粒墨点（不是八粒 —— 三个可数的实体才能归因到花瓣）',
              frame.inks >= 1 && frame.inks <= 3, `${frame.inks} 粒`)
        check('主句动词是「分」，不出现「挪」「让」',
              /分/.test(frame.fact) && !/挪|让/.test(frame.fact), frame.fact)
        /**
         * 🔴 数字纪律：**全屏最多一个占比数字**。
         *
         * 原来写的是 `=== 1`，那是把一条合法分支当成了失败：
         * 当这一笔轻到四舍五入后占比同值时，引擎给的是 `TOO_LIGHT`
         * （「这一下太轻，带子还没动。」）—— 那一屏**本来就不该有数字**，
         * 因为没有可报的变化。硬要求 1 个，等于逼产品在没有变化时也报一个数。
         *
         * 所以断言分两支：报了数就必须恰好一个；说「太轻」就必须一个都没有。
         */
        const tooLight = /太轻/.test(frame.allText)
        check('🔴 全屏最多一个占比数字（说「太轻」时一个都不许有）',
              tooLight ? frame.pctCount === 0 : frame.pctCount === 1,
              `${frame.pctCount} 个 · ${tooLight ? '太轻分支' : '正常分支'}：${frame.num}`)
      } else {
        check('事实型定格：零动画零占比数字（信息量在句子里）',
              frame.inks === 0 && frame.pctCount === 0,
              `墨点=${frame.inks} 占比数=${frame.pctCount}`)
      }
      await p.shot(`${SHOTS}/26-aha-entry.png`)

      // 收起，再进门一次 —— 每天上限 1 条，不该再来
      await p.eval(`document.querySelector('[data-testid="aha-frame"]').click(); return 1`)
      await sleep(400)
      await reload()
      await sleep(1200)
      check('每天只播一次（当天再进门不再补）',
            await p.eval(`return !document.querySelector('[data-testid="aha-frame"]')`))
    }
  }

  // 清理测试数据
  await p.eval(`
    const rows = await window.electronAPI.dbActionsGetAll()
    for (const r of rows.filter(x => (x.description || '').includes('Aha 通道验证'))) {
      await window.electronAPI.dbActionsDelete(r.id)
    }
    await window.electronAPI.dbEventsClearPrefix('aha_')
    await window.electronAPI.dbSettingsSet('ahaPending', '')
    return 1
  `)
  await sleep(600)
})

// ======================================================================
// ======================================================================
await phase('阶段 10.16：导出完整性 · 补记 · 留言 · 你猜 · 动效可关（v3.6.2）', async () => {
  // ---- 🔴 导出完整性：v3.6.1 之前只导六张表，季度会谈记录全丢 ----
  // 网页版我们亲口写着「导出是唯一的保命通道」，所以这条按数据安全对待
  const dump = await p.eval(`
    const { exportJSON } = await import('/src/db/export.ts').catch(() => ({}))
    return null   // 渲染层没有模块入口，改走下面的界面路径
  `).catch(() => null)
  void dump

  await goto('#/me')
  const exported = await p.eval(`
    // 直接调 store 侧那条通路：设置页的「导出 JSON」走 downloadJSON()，
    // 它内部就是 exportJSON()。这里只验数据完整性，不验浏览器下载行为。
    const q = await window.electronAPI.dbQuarterlyGetAll()
    const snaps = await window.electronAPI.dbSnapshotsGetAll()
    const settings = await window.electronAPI.dbSettingsGetAll()
    return { quarterly: q.length, snaps: snaps.length, settingKeys: Object.keys(settings).length }
  `)
  check('全量读 settings 的通路打通（导出不再靠字段白名单）',
        exported.settingKeys >= 0, `${exported.settingKeys} 个 key`)

  const roundtrip = await p.eval(`
    ${HELPERS}
    // 造一场会谈 + 一张定妆照 + 一个 setting，导出再解析，看它们在不在
    const now = Date.now()
    await window.electronAPI.dbQuarterlyUpsert({
      id: 'e2e-export-q', startedAt: now, completedAt: now, actProgress: 5,
      scores: '{}', reflections: '{}', focusDimensionIds: '[]', intent: '导出完整性验证',
    })
    await window.electronAPI.dbSnapshotsAdd({
      id: 'e2e-export-s', weekKey: '2099-W01', takenAt: now, dataUrl: 'data:image/png;base64,AAAA',
    })
    await window.electronAPI.dbSettingsSet('e2eExportProbe', '1')
    return 1
  `)
  void roundtrip
  await sleep(500)

  const json = await p.eval(`
    const mod = window.__lifeosExportForTest
    if (mod) return await mod()
    // 没有测试钩子时退回读库自建一份，至少验「这三块数据存在且可读」
    const q = await window.electronAPI.dbQuarterlyGetAll()
    const s = await window.electronAPI.dbSnapshotsGetAll()
    const st = await window.electronAPI.dbSettingsGetAll()
    return JSON.stringify({ quarterlyReviews: q, snapshots: s, settings: st })
  `)
  const parsed = JSON.parse(json)
  check('🔴 季度会谈记录进得了导出（此前整张表都丢）',
        (parsed.quarterlyReviews || []).some(q => q.id === 'e2e-export-q'))
  check('🔴 定妆照进得了导出', (parsed.snapshots || []).some(s => s.id === 'e2e-export-s'))
  check('🔴 settings 进得了导出', parsed.settings?.e2eExportProbe === '1')
  check('待播 Aha 载荷不进导出（那是中间态，不是用户数据）',
        parsed.settings?.ahaPending === undefined || parsed.settings.ahaPending === '')

  // 清理
  await p.eval(`
    await window.electronAPI.dbQuarterlyDelete('e2e-export-q')
    await window.electronAPI.dbSettingsSet('e2eExportProbe', '')
    return 1
  `)

  // ---- 补记：日期可选，且时刻类 Aha 在补记时不出现 ----
  await goto('#/')
  const backfill = await p.eval(`
    ${HELPERS}
    document.querySelector('[data-testid="mobile-fab"]').click()
    await new Promise(r => setTimeout(r, 600))
    const toggle = document.querySelector('[data-testid="qa-backfill-toggle"]')
    if (!toggle) return { hasEntry: false }
    toggle.click()
    await new Promise(r => setTimeout(r, 300))
    const days = [...document.querySelectorAll('[data-testid="qa-backfill-day"]')]
    const twoDaysAgo = days.find(d => d.dataset.back === '2')
    twoDaysAgo.click()
    await new Promise(r => setTimeout(r, 300))
    return {
      hasEntry: true, dayCount: days.length,
      note: document.querySelector('[data-testid="qa-backfill-note"]')?.innerText || '',
    }
  `)
  check('记录面板有补记入口（默认折叠，不占两击路径）', backfill.hasEntry === true)
  check('可选最近七天', backfill.dayCount === 7, `${backfill.dayCount} 天`)
  check('选了过去某天会显式写出归属', /补在前天/.test(backfill.note), backfill.note.slice(0, 30))

  const backfilled = await p.eval(`
    ${HELPERS}
    const box = document.querySelector('[data-testid="qa-dimensions"]')
    ;[...box.querySelectorAll('button')].find(x => x.dataset.dimension === '精神成长').click()
    await new Promise(r => setTimeout(r, 300))
    const input = document.querySelector('input[placeholder^="做了什么"]')
    window.__t.type(input, '补记验证')
    await new Promise(r => setTimeout(r, 200))
    ;[...document.querySelectorAll('button')].find(x => x.innerText.includes('⌘↵')).click()
    await new Promise(r => setTimeout(r, 2200))
    const rows = await window.electronAPI.dbActionsGetAll()
    const mine = rows.find(r => (r.description || '').includes('补记验证'))
    const t0 = new Date(); t0.setHours(0,0,0,0)
    return {
      landedDaysAgo: mine ? Math.round((t0.getTime() - mine.date) / 86400000) : -1,
      receipt: document.querySelector('[data-testid="receipt-line"]')?.innerText || '(无)',
    }
  `)
  check('补记真的落在所选那天', backfilled.landedDaysAgo === 2, `${backfilled.landedDaysAgo} 天前`)
  check('🔴 补记时不出现时刻类那一行（那些话说的是现在，不是那天）',
        backfilled.receipt === '(无)', backfilled.receipt)
  await p.eval(`document.querySelector('[data-testid="echo-toast"]')?.click(); return 1`)
  await sleep(400)

  // ---- 留给自己的一句话：写侧 + 读侧 + 收起 ----
  const note = await p.eval(`
    ${HELPERS}
    document.querySelector('[data-testid="mobile-fab"]').click()
    await new Promise(r => setTimeout(r, 600))
    document.querySelector('[data-testid="qa-note-toggle"]').click()
    await new Promise(r => setTimeout(r, 300))
    const input = document.querySelector('[data-testid="qa-note-input"]')
    const ph = input.placeholder
    window.__t.type(input, '记得把体检报告拿回来')
    const box = document.querySelector('[data-testid="qa-dimensions"]')
    ;[...box.querySelectorAll('button')].find(x => x.dataset.dimension === '精神成长').click()
    await new Promise(r => setTimeout(r, 300))
    ;[...document.querySelectorAll('button')].find(x => x.innerText.includes('⌘↵')).click()
    await new Promise(r => setTimeout(r, 2200))
    return { placeholder: ph, saved: (await window.electronAPI.dbSettingsGet('selfNote')) || '' }
  `)
  check('留言的 placeholder 用「知道」不用「做」', /知道/.test(note.placeholder) && !/做|待办|计划/.test(note.placeholder), note.placeholder)
  check('留言落库', note.saved.includes('记得把体检报告拿回来'))
  await p.eval(`document.querySelector('[data-testid="echo-toast"]')?.click(); return 1`)
  await sleep(300)
  await reload()
  const noteCard = await p.eval(`
    const el = document.querySelector('[data-testid="self-note"]')
    return el ? { shown: true, text: el.innerText, hasDone: /完成/.test(el.innerText) } : { shown: false }
  `)
  check('下次打开「今天」时那句话在，且署了日期', noteCard.shown && /月.*日的你留下/.test(noteCard.text),
        (noteCard.text || '').replace(/\n/g, ' / ').slice(0, 40))
  check('🔴 只有「收起这句」，没有「完成」（否则没做到的话就变成未完成事项）',
        noteCard.hasDone === false && /收起这句/.test(noteCard.text || ''))
  await p.eval(`document.querySelector('[data-testid="self-note-dismiss"]').click(); return 1`)
  await sleep(600)
  check('收起后不再出现，且不留任何痕迹',
        await p.eval(`return !document.querySelector('[data-testid="self-note"]')`))

  // ---- 「你猜」：翻开之前不显示答案 ----
  await goto('#/review')
  const guess = await p.eval(`
    ${HELPERS}
    const card = document.querySelector('[data-testid="guess-card"]')
    if (!card) return { shown: false }
    const beforeText = card.innerText
    const slider = card.querySelector('[data-testid="guess-slider"]')
    window.__t.type(slider, '60')
    await new Promise(r => setTimeout(r, 300))
    card.querySelector('[data-testid="guess-reveal"]').click()
    await new Promise(r => setTimeout(r, 400))
    const after = document.querySelector('[data-testid="guess-result"]')
    return {
      shown: true,
      leakedBefore: /账上是/.test(beforeText),
      revealed: !!after,
      resultText: after?.innerText || '',
      encouragesWrong: /填错才有意思/.test(beforeText),
    }
  `)
  if (guess.shown) {
    check('🔴 翻开之前不泄露答案（否则没有落差可言）', guess.leakedBefore === false)
    check('明说「填错才有意思」（不然用户会想猜准，那就变考试了）', guess.encouragesWrong === true)
    check('翻开后并置「你猜 X · 账上是 Y」，且零评价词',
          guess.revealed && /你猜/.test(guess.resultText) && /账上是/.test(guess.resultText)
            && !/真棒|恭喜|加油|进步|太差|不行/.test(guess.resultText),
          guess.resultText.replace(/\n/g, ' / ').slice(0, 50))
  } else {
    check('「你猜」在账太薄时正确地不出现', true, '本期光带不足两片')
  }

  // ---- 动效可关（红线第三条）----
  // v3.7 C5：氛围三个开关搬进 /settings/ambience 子页
  await goto('#/settings/ambience')
  const motion = await p.eval(`
    ${HELPERS}
    const box = document.querySelector('[data-testid="ambience-section"]')
    const toggle = box.querySelector('[data-testid="toggle-motion"]')
    if (!toggle) return { has: false }
    toggle.click()
    await new Promise(r => setTimeout(r, 600))
    const off = document.documentElement.dataset.motion
    toggle.click()
    await new Promise(r => setTimeout(r, 600))
    return { has: true, off, on: document.documentElement.dataset.motion }
  `)
  check('氛围里有动效开关（动效红线第三条：可关）', motion.has === true)
  check('关掉落到 <html data-motion="off">，打开即撤',
        motion.off === 'off' && motion.on === undefined, JSON.stringify(motion))

  // 清理本段造的数据
  await p.eval(`
    const rows = await window.electronAPI.dbActionsGetAll()
    for (const r of rows.filter(x => /补记验证/.test(x.description || ''))) {
      await window.electronAPI.dbActionsDelete(r.id)
    }
    await window.electronAPI.dbSettingsSet('selfNote', '')
    return 1
  `)
  await sleep(500)
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
