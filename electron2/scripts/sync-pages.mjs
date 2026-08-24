// 把 dist-web/ 的构建产物同步到仓库根目录，供 GitHub Pages 的
// 「Deploy from a branch: main / (root)」直接发布。
//
// 为什么产物要入库(平时明确反对的做法)：
// Pages 的发布源只能由仓库 owner 在 Settings 里指定，SSH key 改不了。
// 当前选的是 main + 根目录，那么让页面可访问的唯一免设置路径，
// 就是让根目录真的有一个 index.html。这是权衡的结果，不是忘了原则。
//
// 漂移风险(改了 src 但忘了同步 ⇒ 线上是旧版)由 CI 门禁兜住：
// .github/workflows/deploy-demo.yml 会重新构建并逐字节比对根目录产物，
// 不一致就让流水线红掉。产物入库本身不可怕，可怕的是入库了又没人核对。
//
//   node scripts/sync-pages.mjs          同步（需先 npm run build:web）
//   node scripts/sync-pages.mjs --check  只校验，不写入（CI 用）

import { createHash } from 'node:crypto'
import {
  cpSync, existsSync, mkdirSync, readFileSync, readdirSync,
  rmSync, statSync, writeFileSync,
} from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))       // electron2/scripts
const pkgRoot = dirname(here)                              // electron2
const repoRoot = dirname(pkgRoot)                          // 仓库根
const DIST = join(pkgRoot, 'dist-web')
// 清单：记录上次同步进根目录的文件。删除按清单走，绝不按名字猜 ——
// 猜的话哪天根目录多个同名 assets/ 就会被误删。
const MANIFEST = join(repoRoot, '.pages-manifest')
const checkOnly = process.argv.includes('--check')

const fail = msg => { console.error(`\n✗ ${msg}\n`); process.exit(1) }

if (!existsSync(join(DIST, 'index.html'))) {
  fail(`dist-web/index.html 不存在，先跑 npm run build:web`)
}

/** 列出目录下所有文件的仓库相对路径 */
function walk(dir, base = dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, base, out)
    else out.push(relative(base, p))
  }
  return out
}

const sha = p => createHash('sha256').update(readFileSync(p)).digest('hex').slice(0, 16)

const files = walk(DIST).sort()
const built = new Map(files.map(f => [f, sha(join(DIST, f))]))

// ---- 校验模式：比对根目录现有产物与刚构建出来的是否逐字节一致 ----
if (checkOnly) {
  const drift = []
  for (const [f, hash] of built) {
    const target = join(repoRoot, f)
    if (!existsSync(target)) { drift.push(`缺失 ${f}`); continue }
    if (sha(target) !== hash) drift.push(`内容不一致 ${f}`)
  }
  // 反向：清单里有、但新构建没有的(比如换了 hash 文件名的旧 chunk)
  if (existsSync(MANIFEST)) {
    for (const line of readFileSync(MANIFEST, 'utf8').split('\n')) {
      const f = line.trim()
      if (f && !f.startsWith('#') && !built.has(f) && existsSync(join(repoRoot, f))) {
        drift.push(`残留旧产物 ${f}`)
      }
    }
  }
  if (drift.length) {
    console.error(`\n✗ 根目录产物与 src 不一致 —— 线上发布的是旧版本：`)
    drift.forEach(d => console.error(`    ${d}`))
    console.error(`\n  修：npm run deploy:pages 然后提交推送\n`)
    process.exit(1)
  }
  console.log(`✓ 根目录产物与当前 src 构建结果一致（${built.size} 个文件）`)
  process.exit(0)
}

// ---- 同步模式 ----

// 1. 按上次清单清掉旧产物
let removed = 0
if (existsSync(MANIFEST)) {
  const old = readFileSync(MANIFEST, 'utf8').split('\n')
    .map(s => s.trim()).filter(s => s && !s.startsWith('#'))
  for (const f of old) {
    const p = join(repoRoot, f)
    // 双保险：只删仓库根之内、且确实是文件的路径
    if (p.startsWith(repoRoot) && existsSync(p) && statSync(p).isFile()) {
      rmSync(p); removed++
    }
  }
  // 清掉可能空掉的 assets/ 目录
  const assetsDir = join(repoRoot, 'assets')
  if (existsSync(assetsDir) && readdirSync(assetsDir).length === 0) rmSync(assetsDir, { recursive: true })
}

// 2. 复制新产物
for (const f of files) {
  const src = join(DIST, f)
  const dst = join(repoRoot, f)
  mkdirSync(dirname(dst), { recursive: true })
  cpSync(src, dst)
}

// 3. 写清单
writeFileSync(MANIFEST, [
  '# GitHub Pages 发布产物清单 —— 由 electron2/scripts/sync-pages.mjs 生成，不要手改。',
  '# 这些文件是 electron2/dist-web/ 的副本，放在仓库根供 Pages(main/root) 直接发布。',
  '# 改了 src 之后要重新 npm run deploy:pages，否则 CI 会因产物漂移而红。',
  ...files,
  '',
].join('\n'))

console.log(`\n✓ 已同步到仓库根目录`)
console.log(`  清理旧产物  ${removed} 个`)
files.forEach(f => console.log(`  + ${f}  (${(statSync(join(repoRoot, f)).size / 1024).toFixed(1)}KB)`))
console.log(`  清单        .pages-manifest`)
console.log(`\n  下一步：git add -A && git commit && git push —— 推上去约 1 分钟后生效\n`)
