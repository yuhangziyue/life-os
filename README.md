# 生命之花 · Life-OS

> 把人生的八个维度，画成一朵会呼吸的花。
> 记录只要 10 秒，回顾才是主角。数据只存在你自己的电脑里。

一个装在自己电脑里的 macOS 桌面应用：职业 / 财务 / 成长 / 健康 / 家庭 / 社交 / 休闲 / 精神
八个维度不是八根进度条，而是一朵花的八片花瓣——你为哪片花瓣花了时间，它就为你舒展一点。

## 它和打卡类工具的区别

- **去惩罚化**：分数不会掉，没有红色警告，没有「连续 X 天中断」。三天没来，花瓣只是合拢变淡（休眠），回来记一条就重新舒展。
- **记录轻，回顾重**：记一条约 10 秒（⌘⇧L → 选维度 → 回车，描述可留空）；每周五分钟引导式回顾；每十二周一场约一小时的「季度校准会谈」。
- **陪伴而非考核**：只有「陪伴第 N 天」这种只增不减的数字，没有 streak 清零，没有里程碑弹窗。
- **本地优先**：没有账号、不联网、无埋点回传，数据是一个 SQLite 文件，随时导出 JSON / CSV 带走，每日自动备份保留 30 份。

AI 有三条永久边界：只出现在回顾 / 盘点场景，永不评判，每日记录路径零 AI、零网络依赖。

## 技术栈

Electron 33 + React 19 + TypeScript + Tailwind + better-sqlite3（原生模块，asar 需解包）。
花形主视觉是参数化 Canvas，读 CSS 变量随主题重绘；三套主题：暗夜花园 / 禅意茶室 / 花间集。

## 跑起来

```bash
cd electron2
npm install
npm run dev          # vite + electron
npm run typecheck    # tsc --noEmit
npm run e2e          # 100 条真实操作测试（改完代码至少跑这个）
npm run build:dir    # 打包成 .app（不出 dmg，快）
npm run e2e:packaged # 对打包产物再跑一遍同一套用例
```

⚠️ 若你的终端里有 `ELECTRON_RUN_AS_NODE=1`，Electron 会退化成纯 Node、**永远不开窗口**且不报错。
`e2e/run.sh` 已用 `env -u` 摘除；手工启动时注意这一条。

数据库位置：`~/Library/Application Support/life-os/life-os.sqlite`（dev 与打包版共用同一个库）。

## 测试

e2e 走 CDP 驱动真实点击 / 真实输入，主进程走 Node inspector 真实触发菜单 IPC，
**同一套用例在三档跑**：dev（vite dev server）/ prod（`file://` 加载 `dist/`）/ packaged（真实 .app）。
当前 100/100 三档全绿。细节见 [electron2/e2e/README.md](electron2/e2e/README.md)。

## 安装（给非开发者）

见 [electron2/INSTALL.md](electron2/INSTALL.md)。
**未做 Apple 公证**（需开发者账号），首次打开需右键 →「打开」。

## 目录

```
electron2/          唯一活线：Electron + React 实现
  electron/         主进程：窗口、菜单、SQLite、迁移与备份
  src/              渲染进程：页面 / 组件 / 引擎 / 内容文案
  e2e/              三档操作测试
  web/              网页演示版入口（见 electron2/WEB-DEMO.md）
LifeOSTests/        早期 SwiftUI 方案遗留，已放弃，未构建成功过
```

产品设计文档不在本仓库，维护在作者本机的需求中央源里。

## 状态

个人项目，非商业发行。当前 v3.2，仅 macOS（Apple Silicon）。
