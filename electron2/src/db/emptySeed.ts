import { buildDemoSnapshot } from './demoSeed'
import { emptySnapshot, type WebSnapshot } from './webAdapter'

/**
 * 空花园种子（v3.6.2，销 v3.4 的 A5）—— 网页版「清空，种我自己的」用。
 *
 * ============ A5 这个岔路口为什么必须定 ============
 * 陌生人从小红书点进来，第一眼是**别人的花园**：80+ 条演示记录、三个月的曲线、
 * 已经开好的花。它一眼能说明"这产品是什么"，所以默认保留 —— 换成空白问卷会劝退。
 *
 * 但演示数据同时**挡住了这产品最贵的那一分钟**：
 * 首启三幕的第三幕会当场给出「第一份代价快照」，那是「价值在第 1 天兑现」的全部实现
 * （定位 v2.0 第八条：v1.0 说"价值兑现太晚"是设计懒惰，不是产品宿命）。
 * demoSeed 里写死了 `onboardingDone = '1'` 来跳过引导 —— 对演示是对的，
 * 对"想真用一下"的人就是把最好的一幕关在门外。
 *
 * ⇒ 所以不是二选一，是**给一个显眼的出口**：默认逛演示，一键清空进自己的花园，
 *   清空后走完整三幕。出口放在「我」页的第一张卡，不藏在角落浮标里 ——
 *   藏起来的出口等于没有。
 *
 * ============ 为什么从 demoSnapshot 派生而不是另写一份 ============
 * 八维度的名字、颜色、80 条评分标准、128 条分支是**产品定义**，不是演示数据。
 * 另写一份骨架必然与 demoSeed 漂移（改了一处忘了另一处），
 * 而漂移在这里的后果是"我的花园"和"演示花园"结构不一样 —— 那是最难查的一类问题。
 */
export function buildEmptySnapshot(now: number): WebSnapshot {
  const demo = buildDemoSnapshot(now)
  const snap = emptySnapshot()

  // 只保留结构：维度骨架 + 评分标准 + 分支树
  snap.dimensions = demo.dimensions.map(d => ({
    ...d,
    // 🔴 初始分必须与**桌面版全新库**一致（electron/database.cjs 的种子写死 3/3）。
    //   不能沿用 demoSeed 的 initialScore —— 那是为了让样板花园好看而调过的（3/4/5），
    //   照搬会让「网页版空花园」和「桌面版空花园」从第一天起就不是同一个起点。
    currentScore: 3,
    initialScore: 3,
    focusSince: null,
    // 身份宣言是演示角色的话，不是这个人的话
    identity: '',
    // 目标与约定同理：一片都不预设 ——「八片都该有目标」正是这产品要反驳的那套叙事
    targetScore: null,
    weeklyIntent: 0,
    pactTiming: '',
    pactAnchor: '',
    pactText: '',
    createdAt: now,           // 花园生日 = 此刻，不是演示花园的九十天前
  }))
  snap.score_rubrics = demo.score_rubrics
  snap.branches = demo.branches

  // 其余全空：没有记录、没有目标、没有复盘、没有会谈、没有定妆照
  // settings 也留空 —— 尤其**不写 onboardingDone**，这样首启三幕会跑起来，
  // 第三幕那份「第一份代价快照」才是这条路径存在的理由
  return snap
}
