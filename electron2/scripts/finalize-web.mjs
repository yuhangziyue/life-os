// build:web 的收尾 + 硬门禁。
//
// 为什么要门禁：vite build 会在「入口 HTML 存在但脚本全被摇掉」这类情况下依然退出码 0。
// 那样产出的 dist-web 是个能打开、但永远停在 #root 空白的壳子，
// 推上线才发现，而且现象是「白屏」——最难查的一类。所以构建完必须核一遍产物是真的。

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const out = join(root, 'dist-web')
const fail = msg => { console.error(`\n✗ build:web 门禁未过：${msg}\n`); process.exit(1) }

if (!existsSync(out)) fail(`产物目录不存在：${out}`)

const indexPath = join(out, 'index.html')
if (!existsSync(indexPath)) fail('缺少 index.html')
const html = readFileSync(indexPath, 'utf8')

if (!html.includes('<div id="root">')) fail('index.html 里没有 #root 挂载点')

// 入口脚本必须被真的注入，且是相对路径（base: './'），否则 GitHub Pages 子路径下会 404
const scriptSrcs = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m => m[1])
if (scriptSrcs.length === 0) fail('index.html 里没有任何 <script src>，入口没被打进去')
const absolute = scriptSrcs.filter(s => s.startsWith('/'))
if (absolute.length) fail(`入口脚本是绝对路径 ${absolute.join(', ')}，子路径托管会 404（检查 base 配置）`)

const assetsDir = join(out, 'assets')
if (!existsSync(assetsDir)) fail('缺少 assets/ 目录')
const assets = readdirSync(assetsDir)
const js = assets.filter(f => f.endsWith('.js'))
const css = assets.filter(f => f.endsWith('.css'))
if (js.length === 0) fail('assets/ 里没有 js 产物')
if (css.length === 0) fail('assets/ 里没有 css 产物 —— tailwind 没跑起来，整站会没有样式')

const jsBytes = js.reduce((s, f) => s + statSync(join(assetsDir, f)).size, 0)
const cssBytes = css.reduce((s, f) => s + statSync(join(assetsDir, f)).size, 0)
// 主 bundle 至少得有 React + recharts + 业务代码。低于 200KB 说明多半被摇秃了。
if (jsBytes < 200 * 1024) fail(`js 产物只有 ${(jsBytes / 1024).toFixed(0)}KB，明显偏小，疑似 tree-shaking 摇掉了入口`)
if (cssBytes < 5 * 1024) fail(`css 产物只有 ${(cssBytes / 1024).toFixed(0)}KB，tailwind 可能没扫到 src/`)

// GitHub Pages 默认走 Jekyll，会吞掉下划线开头的文件/目录。Vite 偶尔会产出这种名字。
writeFileSync(join(out, '.nojekyll'), '')

const totalKB = (jsBytes + cssBytes) / 1024
console.log(`\n✓ dist-web 门禁通过`)
console.log(`  index.html   ${(html.length / 1024).toFixed(1)}KB`)
console.log(`  js  × ${js.length}      ${(jsBytes / 1024).toFixed(0)}KB`)
console.log(`  css × ${css.length}      ${(cssBytes / 1024).toFixed(0)}KB`)
console.log(`  合计         ${totalKB.toFixed(0)}KB`)
console.log(`  .nojekyll    已写入\n`)
