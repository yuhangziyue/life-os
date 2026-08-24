import { getDimensions, getScoreRubrics, getBranches, getGoals, getActions, getReviews } from './database'
import { addDimension, addBranch, addGoal, addAction } from './database'

function api() {
  if (!window.electronAPI) throw new Error('electronAPI 未就绪')
  return window.electronAPI
}

export async function exportJSON(): Promise<string> {
  const [dimensions, scoreRubrics, branches, goals, actions, reviews] = await Promise.all([
    getDimensions(),
    getScoreRubrics(),
    getBranches(),
    getGoals(),
    getActions(),
    getReviews(),
  ])
  return JSON.stringify({
    version: '2.0.0',
    exportedAt: new Date().toISOString(),
    dimensions, scoreRubrics, branches, goals, actions, reviews,
  }, null, 2)
}

export async function exportCSV(): Promise<string> {
  const actions = await getActions()
  const dimensions = await getDimensions()
  const dimMap = new Map(dimensions.map((d: any) => [d.id, d.name]))
  const headers = ['日期', '维度', '描述', '质量等级', '贡献值', '是否完成']
  const rows = actions.map((a: any) => [
    new Date(a.date).toISOString().slice(0, 10),
    dimMap.get(a.dimensionId) ?? '',
    a.description,
    a.quality,
    a.impact.toString(),
    a.isCompleted ? '是' : '否',
  ])
  return [headers.join(','), ...rows.map((r: any[]) => r.map((c: string) => `"${c}"`).join(','))].join('\n')
}

export async function importJSON(jsonStr: string): Promise<{ success: boolean; message: string }> {
  try {
    const data = JSON.parse(jsonStr)
    if (!data.dimensions || !data.branches || !data.actions) {
      return { success: false, message: 'JSON 格式不正确，缺少必要字段' }
    }
    await api().dbClearAll()
    for (const d of data.dimensions) await addDimension(d)
    if (data.scoreRubrics?.length) {
      for (const r of data.scoreRubrics) await api().dbRubricsAdd(r)
    }
    for (const b of data.branches) await addBranch(b)
    if (data.goals?.length) {
      for (const g of data.goals) await addGoal(g)
    }
    for (const a of data.actions) await addAction(a)
    if (data.reviews?.length) {
      for (const r of data.reviews) await api().dbReviewsAdd(r)
    }
    return { success: true, message: `导入成功：${data.dimensions.length} 个维度，${data.actions.length} 条行动` }
  } catch (e) {
    return { success: false, message: `导入失败：${(e as Error).message}` }
  }
}
