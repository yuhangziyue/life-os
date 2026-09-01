// 生命之花的八个维度

export interface Dimension {
  id: string
  name: string
  icon: string          // lucide-react 图标名
  colorHex: string      // 主题色
  sortOrder: number
  isEnabled: boolean
  createdAt: number     // timestamp

  // 评分机制
  currentScore: number  // 0-10，系统自动计算
  initialScore: number  // 用户设定的初始分值
  scoringMode: 'auto' | 'manual'

  /** 身份宣言（C2，可选）：「我想成为___的人」的空格部分；空串 = 没写 */
  identity: string

  /**
   * 焦点维度起始时刻（v3.2）：null = 非焦点。
   * 这是渲染缓存，权威源是 quarterly_reviews 的最新一条完成记录（设计稿 §4.3）。
   * 不叫 focusQuarter：周期是「完成日 + 84 天」的滚动十二周，不绑日历季度。
   */
  focusSince: number | null

  /**
   * 目标分（v3.5，迁移 v5）：这片花瓣你想让它开到什么程度。
   * null = 没定过 —— 刻意允许留空，「八片都该有目标」正是这产品要反驳的那套叙事。
   */
  targetScore: number | null

  /**
   * 计划节奏（v3.5，迁移 v5）：希望每周照顾几次。0 = 不为这片立计划。
   * 🔴 只用于给「今天」页的轻推排序与「我的花园」里的节奏对照，
   *    绝不产生红点 / 未读数 / 催办文案。计划是给自己看的意图，不是待办债务。
   */
  weeklyIntent: number

  /**
   * 「约定」（v3.6，迁移 v6）—— 执行意图，不是计划也不是提醒。
   *   pactTiming：时机，枚举（'每天' / '工作日' / '周末' / '周一'…'周日'），'' = 没有约定
   *   pactAnchor：锚点，用户自己已有的日常行为（「吃完晚饭」「关掉电脑」「孩子睡了」）
   *   pactText  ：那件具体的事（「打电话回家 20 分钟」）
   *
   * 🔴 三个字段，没有第四个：**没有完成态、没有进度、没有计数**。
   *   系统永不裁判约定 —— 一旦裁判，约定就变成任务，任务就有失败，失败就是惩罚。
   *   它只在两个时刻被重新看到：① 记录面板里选中这片花瓣时（上下文内自我提示）
   *   ② 月度微校准里与该片占比变化并列。**绝不按时间主动出现。**
   */
  pactTiming: string
  pactAnchor: string
  pactText: string
}

/** 约定的时机枚举。刻意不给自由填 —— 自由文本一定会写成愿望，愿望没有 if-then 结构 */
export const PACT_TIMINGS = ['每天', '工作日', '周末', '周一', '周二', '周三', '周四', '周五', '周六', '周日'] as const

export interface ScoreRubric {
  id: string
  score: number         // 1-10
  label: string         // 如 "入门"
  descriptionText: string
  dimensionId: string
}

// 通用 1-10 分标准
export const DEFAULT_RUBRICS: Omit<ScoreRubric, 'id' | 'dimensionId'>[] = [
  { score: 1,  label: '未启动', descriptionText: '几乎没有任何行动或关注，这个维度处于被忽视状态' },
  { score: 2,  label: '萌芽',   descriptionText: '偶尔想到但很少行动，开始有意识但尚未形成习惯' },
  { score: 3,  label: '起步',   descriptionText: '有零星行动但缺乏持续性，效果不明显' },
  { score: 4,  label: '探索',   descriptionText: '开始规律投入，但方法和效果还在摸索中' },
  { score: 5,  label: '及格线', descriptionText: '有稳定投入，能维持基本水平，但谈不上优秀' },
  { score: 6,  label: '稳定',   descriptionText: '持续投入并有一定成果，这个维度不再是短板' },
  { score: 7,  label: '良好',   descriptionText: '有明显进步和成果，能感受到正向反馈' },
  { score: 8,  label: '优秀',   descriptionText: '这个维度是你的优势领域，成果显著，他人可见' },
  { score: 9,  label: '卓越',   descriptionText: '在这个维度上已经超越了大多数人，有独特见解或成就' },
  { score: 10, label: '大师级', descriptionText: '这个维度是你人生的核心支柱，已达到极高的水准' },
]

// 八维植物色系（暗夜花园 · 2026-08-18 圆桌拍板，替换原数据图表色）
export const DIMENSION_COLORS: Record<string, string> = {
  '职业发展': '#B8804D', // 赭石
  '财务状况': '#7A9E7E', // 竹青
  '个人成长': '#9B7BB8', // 绛紫
  '身心健康': '#D89A9E', // 藕粉
  '家庭关系': '#E0B77E', // 暖杏
  '社交关系': '#A8B8C8', // 月白
  '休闲娱乐': '#6E8CAF', // 黛蓝
  // 名字必须与种子和手册一致（v3.7 修）：这里原本写「精神/意义」，
  // 而三份种子与手册都写「精神成长」⇒ 颜色查表落到默认值。
  // 一片花瓣两个名字是静默失败，最难查的那一类。别名保留一期做兼容。
  '精神成长': '#8FA876', // 苔绿
  '精神/意义': '#8FA876', // 旧名，兼容一期
}

// 新维度可选的植物色盘（种一片新花瓣时用）
export const PLANT_PALETTE: { name: string; hex: string }[] = [
  { name: '赭石', hex: '#B8804D' },
  { name: '竹青', hex: '#7A9E7E' },
  { name: '绛紫', hex: '#9B7BB8' },
  { name: '藕粉', hex: '#D89A9E' },
  { name: '暖杏', hex: '#E0B77E' },
  { name: '月白', hex: '#A8B8C8' },
  { name: '黛蓝', hex: '#6E8CAF' },
  { name: '苔绿', hex: '#8FA876' },
]
