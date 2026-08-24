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
}

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
  '精神/意义': '#8FA876', // 苔绿
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
