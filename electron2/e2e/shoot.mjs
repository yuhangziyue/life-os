// 逐屏实拍：手机尺寸（390×844）把每一屏拍下来。
//
// ============ 这个脚本为什么是常驻纪律，不是一次性工具 ============
// v3.7 那次：方案定稿、二十条实施完、**四档验证全绿**
// （单测 96 · e2e 221/225/225 · web-verify 72）之后拍了一遍图，
// **第一屏就看出三处红线违规** —— 两处是「完成率」形态的数字，就长在首屏第一眼上，
// 而产品的红线明文禁止它。
//
//   🔴 **全绿的自动化验证，一次都没看过屏幕长什么样。**
//   🔴 **红线写进文档不等于红线被守住 —— 断言只守它被写去守的那几行。**
//
// ⇒ 所以它不叫 shoot-v37：**版本命名的工具下个版本必然被复制成 shoot-v38，然后两份开始漂移。**
//   每个版本收口前跑一次 `npm run shoot`，逐屏看一遍，再说完成。
//
// 复用 web-verify 的宿主与 CDP 连法，不自己另写一套。
//
// 用法：npm run shoot            → 输出到 /tmp/shots/latest
//      SHOOT_OUT=<dir> npm run shoot
import { spawn } from 'node:child_process'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { attach, sleep } from './cdp.mjs'

const OUT = process.env.SHOOT_OUT || '/tmp/shots/latest'
fs.mkdirSync(OUT, { recursive: true })

const ROOT = path.resolve('dist-web')
const PORT = 4186
const CDP_PORT = process.env.CDP_PORT || 9333
const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon','.webmanifest':'application/manifest+json' }

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0])
  if (p === '/' || !path.extname(p)) p = '/index.html'
  const f = path.join(ROOT, p)
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' })
  fs.createReadStream(f).pipe(res)
})
await new Promise(r => server.listen(PORT, '127.0.0.1', r))

const ELECTRON = path.resolve('node_modules/.bin/electron')
const child = spawn(ELECTRON, ['e2e/web-host.cjs', `--remote-debugging-port=${CDP_PORT}`], {
  env: { ...process.env, WEB_URL: `http://127.0.0.1:${PORT}/`, ELECTRON_RUN_AS_NODE: '' },
  stdio: 'ignore',
})
await sleep(4200)

const p = await attach({ urlMatch: `127.0.0.1:${PORT}` })
await p.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
await sleep(1500)

const top = () => p.eval(`
  window.scrollTo(0, 0)
  document.querySelectorAll('.overflow-y-auto').forEach(el => el.scrollTo(0, 0))
  return 1
`)

const SHOTS = [
  ['',                    'tab1-today',     '① 今天'],
  ['#/history',           'history',        '全部记录（从「最近的记录」右上角「更多」进）'],
  ['#/garden',            'tab2-garden',    '② 我的花园'],
  ['#/review',            'review-hub',     '我的复盘 · 入口页'],
  ['#/review/week',       'review-week',    '这一周'],
  ['#/review/year',       'review-year',    '这一年'],
  ['#/stats',             'stats',          '花园年鉴'],
  ['#/me',                'tab3-settings',  '③ 设置'],
  ['#/settings/petals',   'petals',         '花瓣列表'],
  ['#/settings/ambience', 'ambience',       '氛围'],
  ['#/settings/backup',   'backup',         '备份与导出'],
  ['#/settings/about',    'about',          '关于（花语收在这里）'],
  ['#/handbook',          'handbook',       '花语 · 书架'],
  ['#/moments',           'moments',        '那些美妙时刻'],
]

for (const [hash, file, label] of SHOTS) {
  await p.eval(`location.hash = ${JSON.stringify(hash)}; return 1`)
  await sleep(1200)
  await top()
  await sleep(400)
  await p.shot(path.join(OUT, `${file}.png`))
  console.log(`✓ ${label}`)
}

// 主题上拉菜单（C2）
await p.eval(`location.hash = '#/me'; return 1`); await sleep(1100)
await p.eval(`document.querySelector('[data-testid="row-theme"]').click(); return 1`); await sleep(800)
await p.shot(path.join(OUT, 'theme-sheet.png')); console.log('✓ 主题上拉菜单')

// 单片花瓣页（C7 第三层）
const pid = await p.eval(`
  const d = await window.electronAPI.dbDimensionsGetAll()
  return d.find(x => x.name === '身心健康').id
`)
await p.eval(`location.hash = '#/settings/petals/${pid}'; return 1`); await sleep(1300)
await top(); await sleep(300)
await p.shot(path.join(OUT, 'petal-edit.png')); console.log('✓ 单片花瓣页')

// 引导三幕（窄屏）
await p.eval(`await window.electronAPI.dbSettingsSet('onboardingDone', ''); return 1`)
await p.eval(`location.reload(); return 1`); await sleep(2800)
// 引导：第二幕现在分步（每步三片花瓣），逐步拍
const names = ['onb1-welcome', 'onb2-scoring-step1', 'onb2-scoring-step2', 'onb2-scoring-step3', 'onb3-bloom', 'onb4-howto']
for (let i = 0; i < 7; i++) {
  const shot = names[Math.min(i, names.length - 1)]
  await p.shot(path.join(OUT, `${shot}.png`))
  console.log(`✓ 引导 ${shot}`)
  const ok = await p.eval(`
    const b = [...document.querySelectorAll('[data-testid="onboarding"] button')]
      .find(x => /走进花园|接着看|让花开/.test(x.innerText))
    if (!b) return false
    b.click(); return true
  `)
  if (!ok) break
  await sleep(2200)
}
await p.eval(`await window.electronAPI.dbSettingsSet('onboardingDone', '1'); return 1`)

await p.close(); child.kill(); server.close()
console.log(`\n共 ${fs.readdirSync(OUT).filter(f => f.endsWith('.png')).length} 张 → ${OUT}`)
process.exit(0)
