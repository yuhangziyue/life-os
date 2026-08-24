// 维度目标：支持定性 + 定量追踪

export interface Goal {
  id: string
  title: string
  descriptionText: string
  quantitativeTarget: number | null   // 定量目标值
  currentValue: number | null         // 当前进度
  unit: string | null                 // 单位（如 "次", "万元", "本"）
  isActive: boolean
  createdAt: number
  updatedAt: number

  dimensionId: string
}
