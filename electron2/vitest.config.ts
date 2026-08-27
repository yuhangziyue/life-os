// engine 层单测（v3.6，老架第三轮要求引入）。
//
// 为什么现在必须引：本轮的 Aha 逻辑（闸门 / 补记判据 / firstEver / 占比边界 / 形状句）
// 全是纯函数，不需要 Electron 启动；而 e2e 已经 157 条，packaged 档跑一轮几十分钟。
// 「改一处坏三处」的风险最高的正是这批纯函数 —— 没有单测护栏，e2e 会先绿再红，
// 问题定位从秒级退化到分钟级。
//
// 只跑 src/engine：UI 与 IPC 归 e2e，这条边界不要模糊。
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/engine/**/*.test.ts'],
    reporters: 'default',
  },
})
