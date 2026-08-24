# 网页演示版

给别人看的那一份。和桌面版**同一套源码**，只换了数据后端。

```
npm run dev:web        本地开发（热更新）
npm run build:web      构建 → dist-web/（自带产物门禁）
npm run preview:web    预览构建产物
node e2e/web-verify.mjs   验收：22 项断言 + 七页截图（需先 build:web）
```

> ⚠️ 本机默认 `node` 是 v16，Vite 6 会挂在 `crypto.getRandomValues` 上；
> 且环境自带 `ELECTRON_RUN_AS_NODE=1`，会让验收脚本里的 Electron 永不开窗。
> 跑之前先：
> ```bash
> export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH"
> unset ELECTRON_RUN_AS_NODE
> ```

## 为什么不是「另写一个网页版」

渲染层对 Electron 的依赖只有 `window.electronAPI` 一个面（全工程 6 文件 8 处引用），
且没有任何 node / `process.env` 依赖，路由本来就是 `HashRouter`，`base` 本来就是相对路径。
所以只要在挂载 React **之前**把这个全局变量填上，上层 509 行的 store、8 个页面、
17 个组件一行都不用改。

```
                     ┌─ index.html      → main.tsx      → electronAPI = preload  → IPC → SQLite
共享 src/ 全部业务码 ─┤
                     └─ web/index.html  → web-main.tsx  → electronAPI = IndexedDB shim
```

fork 一份网页版代码是另一条路，但两份必然漂移——那是明确不走的路。

| 文件 | 职责 |
|---|---|
| `src/db/webAdapter.ts` | 用浏览器存储实现 `ElectronAPI` 全部接口；三级降级 |
| `src/db/demoSeed.ts` | 样板数据集（「已照顾三个月」的花园） |
| `src/web-main.tsx` | 装 shim → 挂 React → 挂演示浮标 |
| `web/index.html` | 演示版入口 HTML |
| `vite.web.config.ts` | 构建配置，产出 `dist-web/` |
| `scripts/finalize-web.mjs` | 构建后硬门禁 + 写 `.nojekyll` |
| `e2e/web-verify.mjs` | 验收脚本（真跑一遍浏览器） |

现有代码只动了两处，都无风险：`tailwind.config.ts` 的 content 多一行、`package.json` 多三条 script。

## 存储：三级降级

`IndexedDB → localStorage → 内存`，**每一级都要真写一次再读回来才算可用**。

不做 `'indexedDB' in window` 这种 feature detect：沙箱 iframe 里对象存在但 `open()`
会抛 SecurityError 甚至永不回调，光看属性在不在会误判成可用，然后白屏。
判据必须是结构性的——实际写进去再读出来。`open()` 另有 3 秒超时兜底。

整库当一个 JSON 快照全量读写，不建 IndexedDB 索引。数据量级几百 KB，全量写 <10ms，
为这个量级设计增量索引是过度设计。

**内存是权威源，持久层是异步镜像。** 必须如此：`loadData()` 里 8 个 `updateDimension`
是 `Promise.all` 并行发的，若每次都「读快照→改→写回」，8 个读到的都是同一份旧快照，
最后一个写入会覆盖前七个。改内存对象是同步的，天然没有这个竞态。

## 演示数据：改分数怎么改

`src/db/demoSeed.ts` 的 `DIMS` 数组。评分公式（`engine/scoring.ts`）是：

```
score = initialScore + Σ(近 30 天内 action.impact) × 0.2      clamp[0,10]
```

所以想让某片花瓣显示 7.4 分，就得让近 30 天的 impact 总和正好是 `(7.4 − 4.0) / 0.2 = 17`。
`planQualities()` 负责把这个 budget 精确拆成 N 条行动的质量等级
（minor 1 / normal 2 / major 3 / milestone 5），**拆完会自校验，凑不出就当场抛错**——
这类偏差在界面上只表现为「分数比设计的低一点」，肉眼极难发现，是典型的静默失败。

只改 `targetScore` 就行，budget 会自动重算；但要保证 `budget ∈ [N, 5N]`（N = `recentDays.length`），
否则 `planQualities` 会抛错告诉你区间。

**所有时间都相对「传入的 now」生成，绝不写死日期。** 写死的话 demo 挂上去一个月后，
30 天评分窗口滑走，分数全塌回 initialScore，且每片花瓣 `daysSinceLast > 3` → 整屏「沉睡」。

故意留的三处：
- **精神成长最后一次记录在 6 天前** → 显示「沉睡」，用来演示「断几天不扣分，只是安静地等你」
- **本周没有周复盘** → Review 页留白，现场能演示「写一条复盘」
- **`onboardingDone = '1'`** → 跳过首启引导，第一眼是那朵开好的花。想看引导走「设置 → 重新体验入园引导」

## 与桌面版的差异

| | 桌面版 | 演示版 |
|---|---|---|
| 数据 | 本地 SQLite 文件，可备份 | 浏览器 IndexedDB |
| 初始数据 | 空白骨架（8 维度分数全 3.0），走首启引导 | 样板数据（110 条行动 / 91 天陪伴） |
| 原生菜单、⌘1~5、托盘 | 有 | 无（shim 里是 no-op，`MenuBridge` 自然空转） |
| 导出 JSON/CSV、导入 | 有 | 有（走浏览器下载 / 文件选择器，本来就是 web API） |
| 清除数据 | 清空后灌空白种子 | 清空后**重灌样板数据**（= 重置演示） |
| AI 配置 | 入口默认关（`SHOW_AI_CONFIG = false`） | 同上；演示站不出网 |

## 部署

**线上地址：https://yuhangziyue.github.io/life-os/**

Pages 的 Source 是 **GitHub Actions**，发布权在 `.github/workflows/deploy-demo.yml` 手里。
推 main（且改动命中 workflow 的 paths）就自动构建部署，约 1~2 分钟上线。
`dist-web/` 不入库——编译产物入库必然与源码漂移。

手动触发：Actions 页面 → 「部署网页演示版」→ Run workflow。

### 判断 Source 是哪一种（踩过一次，记下来）

Pages 有两种发布源，**只有仓库 owner 能在 Settings 里改，API token 之外的手段都改不了**：

| Source | 谁负责发布 | 识别方法 |
|---|---|---|
| `GitHub Actions` | 本仓库的 workflow | 推 main 后**只有**自己的 workflow 跑 |
| `Deploy from a branch` | GitHub 内置 `pages build and deployment` | 推 main 后 Actions 里会多出这条内置记录 |

2026-08-24 在这里判断错过一次：看到线上是 README 的 Jekyll 渲染页，就认定
Source 是 `main/(root)`，于是把 workflow 改成「只校验不部署」+ 把产物同步进仓库根，
想蹭分支模式免设置发布。结果**没有任何东西负责发布**，线上停在旧版、`/assets/*.js` 全 404。

真相是 Source 已经被改成 `GitHub Actions`，判据是**内置部署对新提交完全不再触发**
（分支模式下它必触发）。教训：**改发布链之前先确认发布源是谁，别从页面长相反推。**

### 分支模式的后备工具

万一以后 Source 改回 `Deploy from a branch: main / (root)`，
仓库根目录必须真的有 `index.html`，用这条命令同步：

```bash
npm run deploy:pages     # 构建 + 把产物复制到仓库根，写 .pages-manifest
npm run check:pages      # 校验根目录产物与当前 src 一致（防「改了 src 忘同步」）
```

删除按 `.pages-manifest` 清单走，不按名字猜——猜的话哪天根目录多个同名 `assets/` 就会误删。
当前走 Actions 部署，所以根目录**不应该**有这些产物（有就是两份会漂移的副本）。
