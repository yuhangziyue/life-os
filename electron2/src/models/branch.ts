// 维度分支：支持二度/三度树形结构

export interface Branch {
  id: string
  name: string
  level: number          // 1 = 二度分支, 2 = 三度分支
  sortOrder: number
  createdAt: number

  parentId: string | null  // 三度分支指向二度分支
  dimensionId: string      // 所属维度
}
