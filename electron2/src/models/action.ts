// 行动记录：某天在某个维度某个分支上做了什么

export type ActionQuality = 'minor' | 'normal' | 'major' | 'milestone'

export interface Action {
  id: string
  date: number          // 所属日期（归一化到当天 00:00 的 timestamp）
  descriptionText: string
  createdAt: number
  updatedAt: number

  // 评分机制
  impact: number         // 贡献值（1-5，由 quality 决定）
  quality: ActionQuality // 行动质量等级
  isCompleted: boolean

  /** 感受随手记（C1，可选）：5 个心情之一的 key，空串 = 没填。绝不强制。 */
  mood: string

  dimensionId: string
  branchId: string | null
}

// 感受随手记的 5 个心情（晓雅 X2：能命名情绪本身就是调节；最多 5 个，不再加）
export const MOODS: { key: string; emoji: string; label: string }[] = [
  { key: 'calm',    emoji: '😌', label: '平静' },
  { key: 'happy',   emoji: '😊', label: '愉悦' },
  { key: 'tired',   emoji: '😮‍💨', label: '疲惫' },
  { key: 'vexed',   emoji: '😤', label: '烦躁' },
  { key: 'touched', emoji: '🥹', label: '感动' },
]

export function moodEmoji(key: string): string {
  return MOODS.find(m => m.key === key)?.emoji ?? ''
}

// 质量等级 → 贡献值映射
export const QUALITY_IMPACT: Record<ActionQuality, number> = {
  minor: 1,
  normal: 2,
  major: 3,
  milestone: 5,
}

export const QUALITY_LABELS: Record<ActionQuality, string> = {
  minor: '小行动',
  normal: '正常',
  major: '重要行动',
  milestone: '里程碑',
}

export const QUALITY_ICONS: Record<ActionQuality, string> = {
  minor: 'Circle',
  normal: 'CircleDot',
  major: 'Star',
  milestone: 'Award',
}
