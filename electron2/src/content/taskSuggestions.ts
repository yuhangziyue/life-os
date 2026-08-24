// 花园任务生成 —— 「今日轻推」的具体形态。
// 打开看板时，基于「进行中的目标 + 沉睡的维度 + 轮值维度」生成 3 条可一键完成的小任务。
// 原则（圆桌拍板）：邀请不催办；任务要小到 15 分钟内能完成；同一天内结果稳定（按日期作种子）。

import type { Dimension } from '../models/dimension'
import type { Branch } from '../models/branch'
import type { Goal } from '../models/goal'
import type { Action } from '../models/action'
import { dimensionVitality } from '../engine/scoring'
import { pickWarmWord, warmHash } from './warmWords'

export interface GardenTask {
  id: string               // 当日稳定 id（用于本地完成态）
  dimensionId: string
  dimensionName: string
  color: string
  branchId: string | null
  text: string             // 任务本身（做什么）
  why: string              // 这有什么用（温暖话语 benefit）
  quote?: string
  quoteSource?: string
  goalTitle?: string       // 来自目标的任务带上目标名
}

// 32 个种子二度分支的微任务模板（用户改名后自动回退到通用模板）
const TASK_TEMPLATES: Record<string, string[]> = {
  '技能成长': ['学 25 分钟一个具体的技术点', '把最近学的东西讲给自己听 10 分钟'],
  '项目成果': ['为手头项目往前推一小步', '花 15 分钟清一件拖着的小事'],
  '晋升/转型': ['给本月的亮点记一笔素材', '花 10 分钟更新一次成果清单'],
  '副业探索': ['为副业想法写下 3 行笔记', '花 15 分钟验证一个小假设'],
  '收入': ['花 10 分钟看一眼本月收入构成', '记录一个可能的开源节流点'],
  '支出管理': ['花 5 分钟记今天的支出', '取消一个不再需要的订阅'],
  '储蓄': ['给储蓄目标转一笔小钱', '看一眼应急基金还差多少'],
  '投资': ['读 15 分钟理财内容', '写 3 行本周投资观察'],
  '阅读': ['读 20 分钟书', '把最近读到的一句话抄下来'],
  '课程学习': ['推进 20 分钟课程', '整理一页学习笔记'],
  '思维训练': ['写 200 字想法', '复盘今天做对的一个决定'],
  '创作': ['为作品添 15 分钟砖', '记录一个突然冒出来的灵感'],
  '运动': ['快走或拉伸 20 分钟', '做 3 组你喜欢的力量动作'],
  '饮食': ['认真吃一顿不看手机的饭', '今天多喝两杯水'],
  '睡眠': ['今晚提前 30 分钟放下手机', '睡前做 5 分钟呼吸放松'],
  '心理健康': ['写 3 行情绪日记', '冥想 10 分钟'],
  '父母': ['给父母打个电话', '给爸妈发张今天的照片'],
  '伴侣': ['和 TA 认真聊 15 分钟', '为 TA 做一件小事'],
  '子女关系': ['专心陪孩子玩 20 分钟', '记录孩子今天的一个瞬间'],
  '家庭仪式': ['安排一次家庭晚餐', '计划一个周末小活动'],
  '挚友维护': ['给一位老朋友发条消息', '约一位朋友下周见面'],
  '社群参与': ['在社群里认真回复一次', '看看本周有什么线下活动'],
  '人脉拓展': ['认识或问候一位同行', '给帮过你的人道一次谢'],
  '社交能量': ['给自己留 30 分钟独处', '拒绝一件不想去的事'],
  '影音娱乐': ['看一集喜欢的剧/纪录片', '听 20 分钟喜欢的音乐或播客'],
  '兴趣爱好': ['给爱好留 20 分钟', '拍一张今天觉得美的照片'],
  '旅行': ['为下次出行收集一个灵感', '规划一次周末短途'],
  '放松': ['出门晒 15 分钟太阳', '什么都不做，发呆 10 分钟'],
  '冥想/正念': ['静坐 10 分钟', '专注地喝一杯茶'],
  '感恩/反思': ['写下今天感恩的 3 件事', '花 5 分钟回顾今天'],
  '利他/贡献': ['帮一个人解决一个小问题', '分享一条对别人有用的经验'],
  '人生意义': ['写 3 行关于"我想要的生活"', '重读一遍自己的年度愿望'],
}

const GENERIC_TASKS = ['为它投入 15 分钟', '为它做一件 10 分钟内能完成的小事']

function pick<T>(arr: T[], seed: number): T {
  // warmHash 是 32 位无符号数，调用方若做过有符号位移可能传进负数——归一化后再取模
  const idx = ((seed % arr.length) + arr.length) % arr.length
  return arr[idx]
}

function todaySeedStr(offset: number): string {
  const d = new Date()
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}#${offset}`
}

function buildTask(
  dim: Dimension,
  branches: Branch[],
  seedStr: string,
  goal?: Goal,
): GardenTask {
  const seed = warmHash(seedStr + dim.id)
  const dimBranches = branches.filter(b => b.dimensionId === dim.id && b.level === 1)
  const branch = dimBranches.length > 0 ? pick(dimBranches, seed) : null

  let text: string
  if (goal) {
    text = `为「${goal.title}」往前挪一小步`
  } else if (branch) {
    const templates = TASK_TEMPLATES[branch.name]
    text = templates ? pick(templates, seed >>> 3) : `在「${branch.name}」上${pick(GENERIC_TASKS, seed >>> 3)}`
  } else {
    text = `为「${dim.name}」${pick(GENERIC_TASKS, seed >>> 3)}`
  }

  const word = pickWarmWord(dim.name, seedStr + dim.id + text)
  return {
    id: `${seedStr}:${dim.id}`,
    dimensionId: dim.id,
    dimensionName: dim.name,
    color: dim.colorHex,
    branchId: goal ? null : branch?.id ?? null,
    text,
    why: word.benefit,
    quote: word.quote,
    quoteSource: word.source,
    goalTitle: goal?.title,
  }
}

/**
 * 生成今日花园任务（最多 3 条）。
 * 优先级：① 有进行中目标、且今天还没照顾的维度  ② 沉睡的维度  ③ 按日期轮值补齐。
 * shuffleOffset 由「换一批」递增，换任务但同一批内保持稳定。
 */
export function generateGardenTasks(
  dimensions: Dimension[],
  branches: Branch[],
  goals: Goal[],
  actions: Action[],
  shuffleOffset = 0,
): GardenTask[] {
  const enabled = dimensions.filter(d => d.isEnabled)
  if (enabled.length === 0) return []
  const seedStr = todaySeedStr(shuffleOffset)
  const seed = warmHash(seedStr)

  const tasks: GardenTask[] = []
  const used = new Set<string>()

  // ① 目标驱动：今天还没照顾的目标维度
  const activeGoals = goals.filter(g => g.isActive)
  const goalCandidates = activeGoals
    .map(g => ({ goal: g, dim: enabled.find(d => d.id === g.dimensionId) }))
    .filter((x): x is { goal: Goal; dim: Dimension } => !!x.dim)
    .filter(x => !dimensionVitality(x.dim, actions).hasToday)
  for (let i = 0; i < goalCandidates.length && tasks.length < 2; i++) {
    const { goal, dim } = goalCandidates[(seed + i) % goalCandidates.length]
    if (used.has(dim.id)) continue
    used.add(dim.id)
    tasks.push(buildTask(dim, branches, seedStr, goal))
  }

  // ② 沉睡的维度（睡得最久的优先）
  const dormant = enabled
    .filter(d => !used.has(d.id))
    .map(d => ({ dim: d, v: dimensionVitality(d, actions) }))
    .filter(x => x.v.dormant)
    .sort((a, b) => (b.v.daysSinceLast ?? 0) - (a.v.daysSinceLast ?? 0))
  for (const { dim } of dormant) {
    if (tasks.length >= 3) break
    used.add(dim.id)
    tasks.push(buildTask(dim, branches, seedStr))
  }

  // ③ 轮值补齐：今天还没照顾的维度里按日期轮换
  const rest = enabled.filter(d => !used.has(d.id) && !dimensionVitality(d, actions).hasToday)
  for (let i = 0; rest.length > 0 && tasks.length < 3; i++) {
    const dim = rest[(seed + i) % rest.length]
    if (used.has(dim.id)) { if (i > rest.length) break; continue }
    used.add(dim.id)
    tasks.push(buildTask(dim, branches, seedStr))
  }

  return tasks
}
