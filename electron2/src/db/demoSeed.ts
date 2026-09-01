// 演示版样板数据：一个「已经照顾了三个月」的花园。
//
// 为什么不复用 Electron 版的种子（electron/database.cjs 的 DIMENSION_DEFS）：
// 那份种子的职责是「空白骨架，等你自己填」——8 维度分数全 3.0、零行动记录、首启走引导。
// 演示版的职责正相反：别人点开第一眼就得看到花开着、曲线有起伏、统计页有数。
// 两者不是同一份数据的两个副本，是两个不同职责的数据集，各自正确，不存在漂移问题。
// 真正共享的产品定义（八维颜色）来自 models/dimension.ts 的 DIMENSION_COLORS，那才是单一权威源。
//
// ⚠️ 一切时间都相对「传入的 now」生成，绝不写死日期。
// 写死的话 demo 挂上去一个月后，evaluate 出来的分数会因为 30 天窗口滑走而全部塌回 initialScore，
// 且每片花瓣 daysSinceLast > 3 → 整屏「沉睡」。演示页必须永远是刚照顾过的样子。

import type { ActionQuality } from '../models/action'
import { QUALITY_IMPACT } from '../models/action'
import { DEFAULT_RUBRICS } from '../models/dimension'
import { emptySnapshot, type WebSnapshot } from './webAdapter'

const DAY = 24 * 60 * 60 * 1000
/** 与 engine/scoring.ts 的 IMPACT_MULTIPLIER 必须一致，改了那边这里要跟着改 */
const IMPACT_MULTIPLIER = 0.2
/** 与 engine/scoring.ts 的 SCORE_WINDOW_DAYS 一致。只有 offset ≤ 29 的行动算进当前分 */
const SCORE_WINDOW_DAYS = 30
/** 花园开园于 90 天前 —— 决定统计页「这朵花陪了你 N 天」 */
const GARDEN_AGE_DAYS = 90

// ========== 维度定义 ==========
//
// targetScore 是「希望别人在首页看到的分数」，反推出近 30 天需要多少 impact：
//   score = initialScore + Σimpact × 0.2  ⇒  budget = (target − initial) / 0.2
// recentDays 是近 30 天里哪几天有记录（0 = 今天），决定连续照顾天数与沉睡状态。

interface DimDef {
  key: string
  name: string
  icon: string
  colorHex: string
  initialScore: number
  targetScore: number
  identity: string
  /** 演示用：目标分（null = 这片没定目标） */
  demoTarget?: number | null
  /** 演示用：计划节奏（希望每周几次；0 = 没立计划） */
  demoWeekly?: number
  /** 近 30 天的记录日（0 = 今天）。条数 × 质量凑出 budget */
  recentDays: number[]
  /** 31~89 天前的历史记录条数，只影响趋势图与「浇过水的日子」，不进当前分 */
  historyCount: number
  branches: { name: string; children: string[] }[]
  /** 行动文案池，按二级分支下标对应 */
  logs: string[][]
  goals: { title: string; description: string; target: number | null; unit: string | null }[]
}

const DIMS: DimDef[] = [
  {
    key: 'career', name: '职业发展', icon: 'Briefcase', colorHex: '#B8804D',
    initialScore: 4, targetScore: 7.4,
    identity: '把复杂系统讲清楚',
    recentDays: [0, 1, 3, 6, 8, 12, 17, 24], historyCount: 8,
    branches: [
      { name: '技能成长', children: ['技术深度', '技术广度', '软技能'] },
      { name: '项目成果', children: ['主导项目交付', '技术债务治理', '开源贡献'] },
      { name: '晋升/转型', children: ['述职准备', '影响力建设', '内部 visibility'] },
      { name: '副业探索', children: ['产品 idea 验证', '技术储备', '商业化探索'] },
    ],
    logs: [
      ['读完《数据密集型应用系统设计》第 6 章，分区那节终于想通了', '把 Rust 的所有权模型给组里讲了一遍，讲的过程比自己看懂多', '给新同事做 code review，忍住没有直接改，改成问问题'],
      ['支付重构上线，灰度到 30% 没有告警', '清掉三个陈年 TODO，删了 400 行没人调用的代码', '给开源项目提了个修文档的 PR，被合了'],
      ['整理这半年的技术产出，发现能拿出手的只有两件事', '在部门周会讲了一次架构演进，有两个人来问细节'],
      ['花两小时验证了那个 idea，结论是市场太小，及时收手'],
    ],
    goals: [
      { title: '主导一次架构升级', description: '不只是参与，是从方案到落地全程负责，并且能把决策讲清楚', target: 1, unit: '次' },
      { title: '技术输出', description: '每月至少一篇有深度的技术文章或内部分享', target: 12, unit: '篇' },
    ],
  },
  {
    key: 'finance', name: '财务状况', icon: 'DollarSign', colorHex: '#7A9E7E',
    initialScore: 3, targetScore: 5.2,
    identity: '',
    recentDays: [2, 5, 11, 16, 21, 26], historyCount: 6,
    branches: [
      { name: '收入', children: ['主业薪资', '副业/投资收入', '被动收入'] },
      { name: '支出管理', children: ['日常消费', '大额支出', '订阅服务'] },
      { name: '储蓄', children: ['应急基金', '目标储蓄', '退休账户'] },
      { name: '投资', children: ['理财学习', '资产配置', '投资复盘'] },
    ],
    logs: [
      ['把副业那笔钱结了，比预期少但按时到账'],
      ['退了四个已经不用的订阅，一年省下小两千', '记了一周的账，发现打车占了比想象中大的比例'],
      ['应急基金补到六个月开销，这件事拖了半年终于做完'],
      ['读完一本讲资产配置的书，把仓位重新算了一遍', '季度复盘：去年那笔追高的确实错了，认了'],
    ],
    goals: [
      { title: '应急基金满 6 个月', description: '在任何时候失业都能从容找下一份工作，不必被迫接受第一个 offer', target: 6, unit: '个月' },
    ],
  },
  {
    key: 'growth', name: '个人成长', icon: 'Brain', colorHex: '#9B7BB8',
    demoTarget: 8, demoWeekly: 4,
    initialScore: 4, targetScore: 8.0,
    identity: '一直在学新东西的人',
    recentDays: [0, 1, 2, 4, 5, 7, 10, 14, 19, 25], historyCount: 9,
    branches: [
      { name: '阅读', children: ['专业书籍', '思维/哲学', '文学/传记'] },
      { name: '课程学习', children: ['在线课程', '线下培训', '认证考试'] },
      { name: '思维训练', children: ['写作输出', '思考复盘', '辩论/讨论'] },
      { name: '创作', children: ['博客/文章', '视频/播客', '代码/作品'] },
    ],
    logs: [
      ['《人类简史》读到农业革命那章，作者说那是史上最大骗局，先记着不急着同意', '晚上读了 30 页，比刷手机舒服', '把《穷查理宝典》里的逆向思维那节抄了下来'],
      ['分布式系统课程第 4 周作业交了，被扣了分但知道错在哪'],
      ['写了一篇复盘：为什么上季度那个决定是错的', '和朋友争论了两小时 AI 会不会取代程序员，被问住一次', '写日记，第 60 天'],
      ['博客那篇写完了，两千字，改了四遍', '给小工具加了个功能，自己每天在用'],
    ],
    goals: [
      { title: '读完 24 本书', description: '一年 24 本，专业和非专业各一半，不为数量为吸收', target: 24, unit: '本' },
      { title: '持续写作', description: '每周至少写一次，写给自己看也算', target: 52, unit: '周' },
    ],
  },
  {
    key: 'health', name: '身心健康', icon: 'Heart', colorHex: '#D89A9E',
    demoTarget: 7, demoWeekly: 3,
    initialScore: 3, targetScore: 6.6,
    identity: '能跑十公里的人',
    recentDays: [0, 1, 2, 3, 5, 6, 8, 11, 15, 20, 26], historyCount: 12,
    branches: [
      { name: '运动', children: ['有氧运动', '力量训练', '柔韧性/拉伸'] },
      { name: '饮食', children: ['营养均衡', '饮水充足', '减少垃圾食品'] },
      { name: '睡眠', children: ['入睡时间', '睡眠时长', '睡眠质量'] },
      { name: '心理健康', children: ['冥想/正念', '情绪日记', '心理咨询'] },
    ],
    logs: [
      ['跑了 5 公里，配速比上周快了 15 秒', '力量训练，深蹲加到 60 公斤', '拉伸 15 分钟，肩颈松了不少', '游泳 1000 米，久违了'],
      ['一整天没喝饮料，只喝水', '自己做了晚饭，比外卖清淡'],
      ['十一点半躺下，虽然还是刷了会手机', '连续三天睡够七小时'],
      ['冥想 10 分钟，中间跑神了五六次，也算', '写了情绪日记：今天烦躁的真正原因不是那封邮件'],
    ],
    goals: [
      { title: '每周运动 3 次', description: '不追求强度，追求不断档。断了一周就重新开始，不清零', target: 3, unit: '次/周' },
      { title: '十一点前睡', description: '把入睡时间从一点挪到十一点，这是最难但收益最大的一件事', target: null, unit: null },
    ],
  },
  {
    key: 'family', name: '家庭关系', icon: 'Home', colorHex: '#E0B77E',
    demoTarget: 6, demoWeekly: 2,
    initialScore: 4, targetScore: 6.0,
    identity: '',
    recentDays: [1, 4, 9, 13, 18, 23], historyCount: 7,
    branches: [
      { name: '父母', children: ['定期通话', '回家探望', '关心健康'] },
      { name: '伴侣', children: ['深度对话', '共同活动', '未来规划'] },
      { name: '子女关系', children: ['陪伴时间', '教育引导', '成长记录'] },
      { name: '家庭仪式', children: ['家庭聚餐', '节日庆祝', '家庭旅行'] },
    ],
    logs: [
      ['给妈打电话聊了 40 分钟，大部分时间在听', '陪爸去医院复查，指标稳住了'],
      ['和她认真聊了一次明年的打算，比想象中容易', '一起看了部电影，两个人都没看手机'],
      ['周末带孩子去了公园，回来累但值得'],
      ['一家人吃了顿饭，没人提工作'],
    ],
    goals: [
      { title: '每周给父母打一次电话', description: '不为汇报，就是聊天。他们不会主动打过来', target: 52, unit: '次' },
    ],
  },
  {
    key: 'social', name: '社交关系', icon: 'Users', colorHex: '#A8B8C8',
    initialScore: 3, targetScore: 4.4,
    identity: '',
    recentDays: [2, 8, 16, 22], historyCount: 5,
    branches: [
      { name: '挚友维护', children: ['定期联系', '深度交流', '互相帮助'] },
      { name: '社群参与', children: ['线上社群', '线下活动', '行业圈子'] },
      { name: '人脉拓展', children: ['新人结识', '关系维护', '价值交换'] },
      { name: '社交能量', children: ['社交节奏', '独处充电', '边界管理'] },
    ],
    logs: [
      ['和老同学吃饭，四年没见，还是能聊', '给一个朋友介绍了工作机会'],
      ['去了一次线下技术沙龙，认识两个人'],
      ['拒了一个不想去的饭局，没有内疚'],
    ],
    goals: [
      { title: '每月见一个老朋友', description: '线上点赞不算见面。关系是会因为不见而变淡的', target: 12, unit: '次' },
    ],
  },
  {
    key: 'leisure', name: '休闲娱乐', icon: 'Gamepad2', colorHex: '#6E8CAF',
    initialScore: 5, targetScore: 6.4,
    identity: '',
    recentDays: [0, 3, 7, 13, 20], historyCount: 6,
    branches: [
      { name: '影音娱乐', children: ['电影/剧集', '音乐/播客', '游戏'] },
      { name: '兴趣爱好', children: ['摄影/绘画', '手工/DIY', '乐器/才艺'] },
      { name: '旅行', children: ['短途出行', '长途旅行', '旅行规划'] },
      { name: '放松', children: ['发呆放空', '按摩/SPA', '自然接触'] },
    ],
    logs: [
      ['看了《瞬息全宇宙》，后半段哭了', '通关了一个小体量的独立游戏'],
      ['拍了一组街头照片，有两张能看', '吉他重新捡起来，手指还记得'],
      ['订了下个月的机票，两天一夜就够'],
      ['在公园坐了一小时什么都没干'],
    ],
    goals: [
      { title: '每月一次纯玩', description: '不带电脑，不回消息，一整天属于自己', target: 12, unit: '次' },
    ],
  },
  {
    key: 'spirit', name: '精神成长', icon: 'Sparkles', colorHex: '#8FA876',
    initialScore: 3, targetScore: 4.0,
    identity: '',
    // 最近一次是 6 天前 → daysSinceLast > DORMANT_AFTER_DAYS(3) → 这片花瓣显示「沉睡」。
    // 故意留一片沉睡的：演示版要能展示「断了几天不扣分、只是安静地等你」这条产品主张。
    recentDays: [6, 14, 25], historyCount: 4,
    branches: [
      { name: '冥想/正念', children: ['每日冥想', '正念练习', '呼吸练习'] },
      { name: '感恩/反思', children: ['感恩日记', '人生复盘', '价值观梳理'] },
      { name: '利他/贡献', children: ['志愿服务', '知识分享', '帮助他人'] },
      { name: '人生意义', children: ['使命探索', '长期愿景', '哲学思考'] },
    ],
    logs: [
      ['静坐 20 分钟，什么都没想成，但坐住了'],
      ['写了三件值得感谢的小事，最后一件是今天的天气'],
      ['给一个陌生人回了长长一条技术解答'],
    ],
    goals: [
      { title: '想清楚「够了」是什么', description: '不是赚多少、爬多高，是知道什么时候可以停下来。这个问题没有截止日期', target: null, unit: null },
    ],
  },
]

// ========== impact 分配器 ==========

/**
 * 把 budget 精确拆成 n 条行动的质量等级。
 * 每条最低 minor(1)，在此基础上按 milestone(+4) → major(+2) → normal(+1) 贪心补齐差额。
 * 这三个增量能凑出任意非负整数，所以只要 budget ∈ [n, 5n] 就必然精确命中。
 */
function planQualities(budget: number, n: number): ActionQuality[] {
  if (n <= 0) return []
  if (budget < n || budget > 5 * n) {
    throw new Error(`demoSeed: budget ${budget} 无法用 ${n} 条行动凑出（可行区间 [${n}, ${5 * n}]）`)
  }
  const q: ActionQuality[] = new Array(n).fill('minor')
  let need = budget - n
  let i = 0
  while (need >= 4 && i < n) { q[i] = 'milestone'; need -= 4; i++ }
  while (need >= 2 && i < n) { q[i] = 'major'; need -= 2; i++ }
  while (need >= 1 && i < n) { q[i] = 'normal'; need -= 1; i++ }

  // 自校验：分配器写错了要当场炸，不能让它静默产出一个「差不多」的分数。
  // 这类偏差在界面上表现为「分数比设计稿低一点」，肉眼极难发现，是典型的静默失败。
  const got = q.reduce((s, k) => s + QUALITY_IMPACT[k], 0)
  if (got !== budget) throw new Error(`demoSeed: impact 分配失败，期望 ${budget} 实得 ${got}`)
  return q
}

// ========== 确定性伪随机（历史数据用） ==========
//
// 不用 Math.random：同一份 demo 每次构建应当一模一样，
// 否则「换个浏览器打开分数不一样」这种事排查起来毫无线索。
function lcg(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0x100000000
  }
}

const MOODS_POOL = ['calm', 'happy', 'tired', 'vexed', 'touched', '', '', '']

// ========== 主生成器 ==========

export function buildDemoSnapshot(now: number): WebSnapshot {
  const snap = emptySnapshot()
  const today = startOfDay(now)
  const gardenBorn = today - GARDEN_AGE_DAYS * DAY
  const rand = lcg(20260824)

  DIMS.forEach((def, di) => {
    const dimId = `dim-${def.key}`

    // ---- 维度本体 ----
    snap.dimensions.push({
      id: dimId,
      name: def.name,
      icon: def.icon,
      colorHex: def.colorHex,
      sortOrder: di,
      isEnabled: 1,
      createdAt: gardenBorn,
      // currentScore 存了也会在首次 loadData 时被 calculateScore 重算覆盖，
      // 这里填 target 只是让「万一还没 load 完」的一帧不至于是 0。
      currentScore: def.targetScore,
      initialScore: def.initialScore,
      scoringMode: 'auto',
      identity: def.identity,
      focusSince: null, // 焦点在下面按季度会谈统一落
      // v3.5：目标分与计划节奏。演示花园刻意只给三片立了计划 ——
      // 「八片都有计划」正是这产品要反驳的那套叙事，样板数据不能自己先违反它。
      targetScore: def.demoTarget ?? null,
      weeklyIntent: def.demoWeekly ?? 0,
    })

    // ---- 评分标准（复用 models/dimension.ts 的权威定义） ----
    DEFAULT_RUBRICS.forEach((r, ri) => {
      snap.score_rubrics.push({
        id: `rb-${def.key}-${ri}`,
        score: r.score, label: r.label, descriptionText: r.descriptionText,
        dimensionId: dimId,
      })
    })

    // ---- 分支树（二度 + 三度） ----
    const l1Ids: string[] = []
    def.branches.forEach((b, bi) => {
      const bid = `br-${def.key}-${bi}`
      l1Ids.push(bid)
      snap.branches.push({
        id: bid, name: b.name, level: 1, sortOrder: bi,
        createdAt: gardenBorn, parentId: null, dimensionId: dimId,
      })
      b.children.forEach((c, ci) => {
        snap.branches.push({
          id: `br-${def.key}-${bi}-${ci}`, name: c, level: 2, sortOrder: ci,
          createdAt: gardenBorn, parentId: bid, dimensionId: dimId,
        })
      })
    })

    // ---- 目标 ----
    def.goals.forEach((g, gi) => {
      snap.goals.push({
        id: `goal-${def.key}-${gi}`,
        title: g.title,
        description: g.description,
        quantitativeTarget: g.target,
        quantitativeUnit: g.unit,
        isActive: 1,
        createdAt: gardenBorn + 2 * DAY,
        updatedAt: today - 5 * DAY,
        dimensionId: dimId,
      })
    })

    // ---- 近 30 天行动：按 budget 精确配平，决定首页那朵花的形状 ----
    const flatLogs = def.logs.flat()
    const budget = Math.round((def.targetScore - def.initialScore) / IMPACT_MULTIPLIER)
    const qualities = planQualities(budget, def.recentDays.length)

    def.recentDays.forEach((off, ai) => {
      if (off >= SCORE_WINDOW_DAYS) {
        throw new Error(`demoSeed: ${def.name} 的 recentDays 含 ${off}，已滑出 ${SCORE_WINDOW_DAYS} 天评分窗口`)
      }
      const date = today - off * DAY
      const q = qualities[ai]
      snap.actions.push({
        id: `act-${def.key}-r${ai}`,
        date,
        description: flatLogs[ai % flatLogs.length],
        quality: q,
        impact: QUALITY_IMPACT[q],
        isCompleted: 1,
        createdAt: date + 20 * 60 * 60 * 1000,
        updatedAt: date + 20 * 60 * 60 * 1000,
        dimensionId: dimId,
        branchId: l1Ids[ai % l1Ids.length],
        goalId: null,
        mood: MOODS_POOL[Math.floor(rand() * MOODS_POOL.length)],
      })
    })

    // ---- 31~89 天前的历史：只喂趋势图和「浇过水的日子」，不进当前分 ----
    // 密度前疏后密，让统计页的曲线是往上走的——这是一个「越来越上手」的花园。
    for (let hi = 0; hi < def.historyCount; hi++) {
      const span = GARDEN_AGE_DAYS - 1 - SCORE_WINDOW_DAYS       // 59 天可用
      const ratio = (hi + 1) / (def.historyCount + 1)
      const off = SCORE_WINDOW_DAYS + Math.round(span * (1 - ratio * ratio)) // 平方分布 → 近期更密
      const date = today - off * DAY
      const q: ActionQuality = rand() < 0.15 ? 'major' : rand() < 0.5 ? 'normal' : 'minor'
      snap.actions.push({
        id: `act-${def.key}-h${hi}`,
        date,
        description: flatLogs[(hi + 3) % flatLogs.length],
        quality: q,
        impact: QUALITY_IMPACT[q],
        isCompleted: 1,
        createdAt: date + 21 * 60 * 60 * 1000,
        updatedAt: date + 21 * 60 * 60 * 1000,
        dimensionId: dimId,
        branchId: l1Ids[hi % l1Ids.length],
        goalId: null,
        mood: MOODS_POOL[Math.floor(rand() * MOODS_POOL.length)],
      })
    }
  })

  // ========== 复盘记录 ==========
  // 故意不给「本周」造复盘：留白才能现场演示「写一条周复盘」，
  // 否则 Review 页一进去就是已填状态，最想看的那个交互反而看不到。
  const weekStart = (offsetWeeks: number) => startOfWeek(today) - offsetWeeks * 7 * DAY
  const REVIEWS = [
    { period: 'week' as const, off: 1, score: 6.2, note: '这周把重构收了尾，睡眠还是不行。下周先把睡觉这件事当成正事。', summary: '记录 14 条 · 覆盖 6 片花瓣 · 贡献 27' },
    { period: 'week' as const, off: 2, score: 5.8, note: '出差打断了节奏，回来花了两天才捡回来。以后出差前先把预期降下来。', summary: '记录 9 条 · 覆盖 5 片花瓣 · 贡献 18' },
    { period: 'week' as const, off: 3, score: 6.0, note: '运动终于连上三天。发现只要早上先跑，一天都顺。', summary: '记录 12 条 · 覆盖 6 片花瓣 · 贡献 23' },
    { period: 'week' as const, off: 5, score: 5.1, note: '这周基本荒废，只有工作。写下来不是为了自责，是为了看见。', summary: '记录 5 条 · 覆盖 3 片花瓣 · 贡献 9' },
  ]
  REVIEWS.forEach((r, i) => {
    const start = weekStart(r.off)
    snap.reviews.push({
      id: `rev-w-${i}`,
      periodType: r.period,
      periodStart: start,
      periodEnd: start + 7 * DAY - 1,
      score: r.score,
      note: r.note,
      autoSummary: r.summary,
      createdAt: start + 7 * DAY,
      dimensionId: null,
    })
  })
  // 两条月复盘
  const monthStart = (back: number) => {
    const d = new Date(today)
    d.setMonth(d.getMonth() - back, 1)
    d.setHours(0, 0, 0, 0)
    return d.getTime()
  }
  ;[
    { back: 1, score: 5.9, note: '这个月最大的收获不是某件事做成了，是终于愿意每天记一笔。看得见，才改得动。', summary: '记录 48 条 · 每一片花瓣都有记录' },
    { back: 2, score: 5.2, note: '刚开始用，前两周三天打鱼。后半个月才有点样子。', summary: '记录 31 条 · 覆盖 7 片花瓣' },
  ].forEach((m, i) => {
    const start = monthStart(m.back)
    const end = monthStart(m.back - 1) - 1
    snap.reviews.push({
      id: `rev-m-${i}`,
      periodType: 'month',
      periodStart: start,
      periodEnd: end,
      score: m.score,
      note: m.note,
      autoSummary: m.summary,
      createdAt: end + 1,
      dimensionId: null,
    })
  })

  // ========== 季度校准会谈：一场已完成的会谈 + 两片焦点花瓣 ==========
  const talkAt = today - 41 * DAY
  const focusIds = ['dim-growth', 'dim-health']
  snap.quarterly_reviews.push({
    id: 'q-1',
    startedAt: talkAt,
    completedAt: talkAt + 52 * 60 * 1000,
    actProgress: 5,
    scores: JSON.stringify(
      Object.fromEntries(DIMS.map(d => [`dim-${d.key}`, d.initialScore]))
    ),
    reflections: JSON.stringify({
      '1': '回头看这十二周，真正推动我的不是计划表，是那些随手记下来的小事累起来的。',
      '3': '最想留住的是每天早上那半小时——安静，没人找我，能想清楚事。',
      '4': '选个人成长和身心健康。前者是我真正想要的，后者是别的都撑不住的地基。',
    }),
    focusDimensionIds: JSON.stringify(focusIds),
    intent: '这一季，先把身体和脑子的地基打稳，别急着开花。',
  })
  focusIds.forEach(id => {
    const d = snap.dimensions.find(x => x.id === id)
    if (d) d.focusSince = talkAt + 52 * 60 * 1000
  })

  // ========== 花语时光机：近 6 周的定妆照 ==========
  for (let w = 5; w >= 0; w--) {
    const takenAt = startOfWeek(today) - w * 7 * DAY + 6 * DAY   // 那一周的周日
    // 越近的一张花瓣越长，直观看出「花在长」
    const grow = (6 - w) / 6
    snap.flower_snapshots.push({
      id: `snap-${w}`,
      weekKey: weekKeyOf(takenAt),
      takenAt,
      dataUrl: flowerSvgDataUrl(grow),
    })
  }

  // ========== 设置 ==========
  // 跳过首启引导：演示页的第一眼必须是那朵开好的花，不是一个空白问卷。
  // 想看引导流程走「设置 → 重新体验入园引导」，那个入口本来就有。
  snap.settings.onboardingDone = '1'
  snap.settings.quarterlyDeferUntil = '0'
  snap.settings.quarterlyDeferCount = '0'

  return snap
}

// ========== 工具 ==========

function startOfDay(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** 周一为一周之始，与 Review 页的周期口径一致 */
function startOfWeek(ts: number): number {
  const d = new Date(startOfDay(ts))
  const wd = d.getDay()               // 0=周日
  const back = wd === 0 ? 6 : wd - 1
  return d.getTime() - back * DAY
}

function weekKeyOf(ts: number): string {
  const d = new Date(ts)
  const jan1 = new Date(d.getFullYear(), 0, 1)
  const week = Math.ceil(((d.getTime() - jan1.getTime()) / DAY + jan1.getDay() + 1) / 7)
  return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`
}

/**
 * 生成一张八瓣花的 SVG 定妆照。
 * 用 SVG data URL 而不是 PNG base64：一张约 900 字节，六张不到 6KB，
 * localStorage 降级档也塞得下（PNG 截图动辄几十 KB，六张就把 5MB 配额吃掉一块）。
 */
function flowerSvgDataUrl(grow: number): string {
  const colors = DIMS.map(d => d.colorHex)
  const petals = colors.map((c, i) => {
    const angle = (i / 8) * 360
    const len = 26 + grow * 34 + (i % 3) * 4
    return `<ellipse cx="60" cy="${60 - len / 2}" rx="9" ry="${len / 2}" fill="${c}" opacity="0.8" transform="rotate(${angle} 60 60)"/>`
  }).join('')
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">` +
    `<rect width="120" height="120" fill="#14120f"/>${petals}` +
    `<circle cx="60" cy="60" r="7" fill="#E8D9A8" opacity="0.9"/></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

// ========== 供构建期自检使用 ==========

/** 每个维度设计好的目标分数，check 脚本用它核对实际算出来的分 */
export const DEMO_EXPECTED_SCORES: { name: string; expected: number }[] =
  DIMS.map(d => ({ name: d.name, expected: d.targetScore }))
