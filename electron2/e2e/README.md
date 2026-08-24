# 操作测试（E2E）

真实驱动 Electron 应用做点击 / 输入 / 读库校验，不是单元测试。

- **渲染进程**走 CDP（`--remote-debugging-port=9333`）：真实 `click()`、真实输入事件、截图、读 canvas 像素
- **主进程**走 Node inspector（`--inspect=9339`）：从主进程真发菜单 IPC，验证「原生菜单 → 渲染进程」整条链路

## 跑

```bash
npm run e2e            # 开发模式：vite dev server + Electron
npm run e2e:prod       # 生产渲染路径：vite build 后走 file:// 加载 dist/
npm run e2e:packaged   # 打包产物：release/mac-arm64/生命之花.app（需先 npm run build:dir）
```

三档跑的是同一套用例。**改完代码至少跑 `npm run e2e`；动了打包/加载相关的东西，三档都要过。**

产物：截图落在 `e2e/shots/`，结构化结果落在 `e2e/last-run.json`（都已 gitignore）。

⚠️ **用例会留下一条空的周回顾**：行动能通过 UI 删掉（阶段 10 就在做这件事），
但**应用目前没有"删除回顾"的能力**（`deleteReview` 在主进程 / preload / store 三层都不存在），
所以这条清不掉。等 `deleteReview` 补上后，在阶段 9.5 末尾加一步删除即可。
临时清理：
```bash
sqlite3 ~/Library/Application\ Support/life-os/life-os.sqlite \
  "DELETE FROM reviews WHERE note='' AND autoSummary LIKE '共记录%';"
```

## 覆盖范围（49 条）

| 阶段 | 验什么 |
|---|---|
| 1 启动与首屏 | React 挂载、preload 桥接、雷达图**真的画了像素**、诊断脚手架已清除 |
| 2 种子数据 | 8 维度 / 32 二度 + 96 三度分支 / 80 条评分标准 / 初始分=3 |
| 3 路由导航 | 六个页面逐个渲染 + 侧边栏真实点击 |
| 4 快速记录 | 维度→分支→描述→质量→提交，落库字段逐项核对 |
| 5 评分引擎 | `初始分 + Σ(贡献 × 0.2)` 精确到小数点、未触碰维度保持初始分 |
| 6 行动记录 | 维度筛选、清除筛选、完成状态切换并落库 |
| 7 维度管理 | 8 张卡、点卡进详情、初始分滑块 |
| 8 统计/回顾/设置 | 三页渲染 + 日/周/月/年切换 |
| 9 原生菜单 | 主进程真发 IPC → 导航生效 / 面板打开；**监听不重复 + 反注册有效** |
| 9.5 回顾读写 | 保存落库、切周期不串内容、可清空、清空能存回 |
| 10 删除行动 | 删除生效且数据库回到基线（测试不留脏数据） |
| 11 控制台 | 全程零 React / JS 报错 |

## 写用例时的三个坑

1. **React 受控组件**：直接改 `el.value` 不会触发 `onChange`，必须走原生 setter + `dispatchEvent(new Event('input',{bubbles:true}))`。见 `HELPERS.type()`。
2. **HashRouter 的 hash 跨 reload 保留**：上一轮停在哪页，重载后还在哪页。断言"首屏"前必须先把 hash 归零，否则测的根本不是看板。
3. **主进程 inspector 的多次 `Runtime.evaluate` 共用同一个全局作用域**：顶层 `const` 第二次求值就报 `already been declared`。每段都要包进 IIFE。

## 环境

`ELECTRON_RUN_AS_NODE=1` 会让 Electron 退化成纯 Node、永远不开窗口。
`run.sh` 每处启动都用 `env -u` 摘掉它——某些终端/CI 环境会带上这个变量。
