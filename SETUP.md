# 生命之花 · Life-OS — 启动指南

## 环境要求

- macOS 14 Sonoma 或更高版本
- Xcode 16.0 或更高版本（App Store 下载）

## 5 分钟启动

### 1. 创建 Xcode 项目

```
打开 Xcode → File → New → Project...
选择 macOS → App → Next
```

填写：
| 字段 | 值 |
|------|-----|
| Product Name | `LifeOS` |
| Team | 你的 Apple ID |
| Organization Identifier | `com.lifeos` |
| Interface | **SwiftUI** |
| Language | **Swift** |
| Storage | **None**（我们手动添加 SwiftData） |

保存到 `/Users/robin/Documents/Codex/life-os/` 目录下。

### 2. 添加 SwiftData

在 Xcode 中，点击项目 → Target `LifeOS` → `Build Phases` → `Link Binary With Libraries`，点击 `+`，搜索 `SwiftData`，添加。

或者：在 Target → General → Frameworks and Libraries 中添加。

### 3. 导入源文件

在 Xcode 左侧项目导航中：

1. 右键 `LifeOS` 文件夹 → `Add Files to "LifeOS"...`
2. 选择以下目录下的所有 `.swift` 文件：
   - `LifeOS/App/`
   - `LifeOS/Models/`
   - `LifeOS/Data/`
   - `LifeOS/ViewModels/`
   - `LifeOS/Views/`（含所有子目录）
   - `LifeOS/Components/`
   - `LifeOS/Extensions/`
   - `LifeOS/Utilities/`
3. 勾选 `Copy items if needed` → **取消勾选**（文件已在项目目录中）
4. 勾选 `Create groups`
5. 点击 `Add`

### 4. 添加测试文件

同样方式，添加：
- `LifeOSTests/` 下的所有 `.swift` 文件

### 5. 运行

按 `⌘R` 编译运行。

## 项目结构

```
life-os/
├── SETUP.md                ← 本文件
├── LifeOS/                 ← 主应用代码（35 个 Swift 文件）
│   ├── App/                ← 入口 + 菜单栏
│   ├── Models/             ← 5 个数据模型
│   ├── Data/               ← 数据库配置 + 种子数据 + 导出服务
│   ├── ViewModels/         ← 统计引擎 + 回顾引擎
│   ├── Views/              ← 所有界面
│   │   ├── Dashboard/      ← 每日看板 + 雷达图
│   │   ├── Dimensions/     ← 维度管理
│   │   ├── Actions/        ← 行动记录 + 快速添加
│   │   ├── Stats/          ← 日/周/月/年统计
│   │   ├── Review/         ← 周/月/年回顾
│   │   ├── Settings/       ← 设置
│   │   └── Sidebar/        ← 侧边栏导航
│   ├── Components/         ← 可复用组件
│   ├── Extensions/         ← Color/Date 扩展
│   └── Utilities/          ← 常量
└── LifeOSTests/            ← 单元测试
```

## 功能清单

| 模块 | 文件 | 完成 |
|------|------|------|
| 数据模型 | Dimension, Branch, Goal, Action, Review | ✅ |
| 种子数据 | 8 维度 × 96 分支 | ✅ |
| 每日看板 | 雷达图 + 评分卡 + 行动流 | ✅ |
| 快速添加 | 维度→分支→评分→描述 | ✅ |
| 行动记录 | 时间线 + 维度筛选 | ✅ |
| 维度管理 | 列表 + 详情 + 分支树 + 目标编辑 | ✅ |
| 统计分析 | 日/周/月/年四视图 | ✅ |
| 回顾反思 | 自动摘要 + 引导式反思 | ✅ |
| 设置 | 评分/通知/数据管理 | ✅ |
| 数据导出 | JSON + CSV | ✅ |
| 数据导入 | JSON 恢复 | ✅ |
| 单元测试 | StatsViewModel + SeedData + Export | ✅ |

## 尚未实现（v2.0）

- iCloud 同步
- AI 洞察生成
- iPhone/iPad 端
- Widget 桌面小组件
- 暗色模式独立适配（SwiftUI 自带基础支持）
- 多语言（当前仅中文）

## 常见问题

**Q: 编译报错 "No such module 'SwiftData'"**
A: 需要在 Target → Build Phases 中手动添加 SwiftData framework。

**Q: 雷达图不显示**
A: 需要先有数据。App 启动时自动播种初始维度，但需要手动添加行动记录后雷达图才会显示数据。

**Q: 如何修改预设维度**
A: 编辑 `LifeOS/Data/SeedData.swift` 中的 `dimensionDefs`，删除 App 数据后重新运行即可。
