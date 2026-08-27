// 渲染进程数据库层 - 通过 IPC 调用主进程的 SQLite
// 本层负责：模型字段名 ↔ DB 列名的映射转换

import { v4 as uuid } from './uuid'
import { parseQuarterlyRow, toQuarterlyRow, type QuarterlyReview } from '../models/quarterly'

// ========== 诊断日志 ==========
// 默认静默。排查时在 DevTools 执行 localStorage.setItem('lifeos:debug','1') 后刷新。
const DEBUG = typeof localStorage !== 'undefined' && localStorage.getItem('lifeos:debug') === '1'
const LOG = DEBUG ? (tag: string, ...args: any[]) => console.log(`[DB:${tag}]`, ...args) : () => {}
const LOG_E = (tag: string, ...args: any[]) => console.error(`[DB:${tag}]`, ...args)

function api() {
  if (!window.electronAPI) {
    LOG_E('api', 'window.electronAPI 为 undefined，preload 未注入')
    throw new Error('electronAPI 未就绪，请确保在 Electron 环境中运行')
  }
  return window.electronAPI
}

// ========== Dimensions ==========

export async function getDimensions() {
  LOG('getDimensions', '请求中...')
  const rows = await api().dbDimensionsGetAll()
  LOG('getDimensions', `返回 ${rows.length} 条`)
  return rows.map(toDimension)
}

export async function addDimension(dim: any) {
  LOG('addDimension', dim.name)
  return api().dbDimensionsAdd({
    id: dim.id, name: dim.name, icon: dim.icon, colorHex: dim.colorHex,
    sortOrder: dim.sortOrder, isEnabled: dim.isEnabled ? 1 : 0,
    createdAt: dim.createdAt, currentScore: dim.currentScore ?? 0,
    initialScore: dim.initialScore ?? 0, scoringMode: dim.scoringMode ?? 'auto',
  })
}

export async function updateDimension(id: string, data: any) {
  LOG('updateDimension', id)
  const dbData: any = {}
  if (data.name !== undefined) dbData.name = data.name
  if (data.icon !== undefined) dbData.icon = data.icon
  if (data.colorHex !== undefined) dbData.colorHex = data.colorHex
  if (data.sortOrder !== undefined) dbData.sortOrder = data.sortOrder
  if (data.isEnabled !== undefined) dbData.isEnabled = data.isEnabled ? 1 : 0
  if (data.currentScore !== undefined) dbData.currentScore = data.currentScore
  if (data.initialScore !== undefined) dbData.initialScore = data.initialScore
  if (data.scoringMode !== undefined) dbData.scoringMode = data.scoringMode
  if (data.identity !== undefined) dbData.identity = data.identity
  // v3.5 / v3.6 新增列。🔴 这张白名单是个**沉默的陷阱**：忘了加字段不会报错，
  // 只是那个字段永远存不进去；而全部字段都被过滤掉时还会拼出空 SET 语句
  // （`UPDATE dimensions SET  WHERE id = ?`），主进程报 near "WHERE": syntax error。
  // 加新列 = 必须同时改这里，否则 UI 上改了、库里没变，查半天。
  if (data.targetScore !== undefined) dbData.targetScore = data.targetScore
  if (data.weeklyIntent !== undefined) dbData.weeklyIntent = data.weeklyIntent
  if (data.pactTiming !== undefined) dbData.pactTiming = data.pactTiming
  if (data.pactAnchor !== undefined) dbData.pactAnchor = data.pactAnchor
  if (data.pactText !== undefined) dbData.pactText = data.pactText
  // 空更新直接返回：既省一次 IPC，也不给主进程送一条会炸的 SQL
  if (Object.keys(dbData).length === 0) return true
  return api().dbDimensionsUpdate(id, dbData)
}

export async function deleteDimension(id: string) {
  LOG('deleteDimension', id)
  return api().dbDimensionsDelete(id)
}

// ========== Score Rubrics ==========

export async function getScoreRubrics() {
  LOG('getScoreRubrics', '请求中...')
  const rows = await api().dbRubricsGetAll()
  LOG('getScoreRubrics', `返回 ${rows.length} 条`)
  return rows.map(toScoreRubric)
}

export async function addScoreRubric(rubric: any) {
  LOG('addScoreRubric', rubric.label)
  return api().dbRubricsAdd({
    id: rubric.id, score: rubric.score, label: rubric.label,
    descriptionText: rubric.descriptionText, dimensionId: rubric.dimensionId,
  })
}

// ========== Branches ==========

export async function getBranches() {
  LOG('getBranches', '请求中...')
  const rows = await api().dbBranchesGetAll()
  LOG('getBranches', `返回 ${rows.length} 条`)
  return rows.map(toBranch)
}

export async function addBranch(branch: any) {
  LOG('addBranch', branch.name)
  return api().dbBranchesAdd({
    id: branch.id, name: branch.name, level: branch.level,
    sortOrder: branch.sortOrder, createdAt: branch.createdAt,
    parentId: branch.parentId ?? null, dimensionId: branch.dimensionId,
  })
}

export async function updateBranch(id: string, data: any) {
  LOG('updateBranch', id)
  return api().dbBranchesUpdate(id, data)
}

export async function deleteBranch(id: string) {
  LOG('deleteBranch', id)
  return api().dbBranchesDelete(id)
}

// ========== Goals ==========
// 模型字段: title, descriptionText, quantitativeTarget, currentValue, unit, isActive, dimensionId
// DB 列:   title, description,   quantitativeTarget, -,              quantitativeUnit, isActive, dimensionId

export async function getGoals() {
  LOG('getGoals', '请求中...')
  const rows = await api().dbGoalsGetAll()
  LOG('getGoals', `返回 ${rows.length} 条`)
  return rows.map(toGoal)
}

export async function addGoal(goal: any) {
  LOG('addGoal', goal.title)
  return api().dbGoalsAdd({
    id: goal.id,
    title: goal.title,
    description: goal.descriptionText ?? goal.description ?? '',
    quantitativeTarget: goal.quantitativeTarget ?? null,
    quantitativeUnit: goal.unit ?? goal.quantitativeUnit ?? null,
    isActive: goal.isActive ? 1 : 0,
    createdAt: goal.createdAt,
    updatedAt: goal.updatedAt,
    dimensionId: goal.dimensionId,
  })
}

export async function updateGoal(id: string, data: any) {
  LOG('updateGoal', id)
  const dbData: any = {}
  for (const [k, v] of Object.entries(data)) {
    if (k === 'isActive') dbData[k] = v ? 1 : 0
    else if (k === 'descriptionText') dbData.description = v
    else if (k === 'unit') dbData.quantitativeUnit = v
    else dbData[k] = v
  }
  return api().dbGoalsUpdate(id, dbData)
}

export async function deleteGoal(id: string) {
  LOG('deleteGoal', id)
  return api().dbGoalsDelete(id)
}

// ========== Actions ==========
// 模型字段: descriptionText → DB 列: description

export async function getActions() {
  LOG('getActions', '请求中...')
  const rows = await api().dbActionsGetAll()
  LOG('getActions', `返回 ${rows.length} 条`)
  return rows.map(toAction)
}

export async function addAction(action: any) {
  LOG('addAction', action.descriptionText ?? action.description ?? '(空)')
  return api().dbActionsAdd({
    id: action.id,
    date: action.date,
    description: action.descriptionText ?? action.description ?? '',
    quality: action.quality ?? 'medium',
    impact: action.impact ?? 1,
    isCompleted: action.isCompleted ? 1 : 0,
    createdAt: action.createdAt,
    updatedAt: action.updatedAt,
    dimensionId: action.dimensionId,
    branchId: action.branchId ?? null,
    goalId: action.goalId ?? null,
    mood: action.mood ?? '',
  })
}

export async function updateAction(id: string, data: any) {
  LOG('updateAction', id)
  const dbData: any = {}
  for (const [k, v] of Object.entries(data)) {
    if (k === 'isCompleted') dbData[k] = v ? 1 : 0
    else if (k === 'descriptionText') dbData.description = v
    else dbData[k] = v
  }
  return api().dbActionsUpdate(id, dbData)
}

export async function deleteAction(id: string) {
  LOG('deleteAction', id)
  return api().dbActionsDelete(id)
}

// ========== Reviews ==========
// 模型字段: reflectionText, autoSummary → DB 列: note (合并), + autoSummary 列

export async function getReviews() {
  LOG('getReviews', '请求中...')
  const rows = await api().dbReviewsGetAll()
  LOG('getReviews', `返回 ${rows.length} 条`)
  return rows.map(toReview)
}

export async function addReview(review: any) {
  LOG('addReview', review.periodType)
  // 将 reflectionText 存入 note，autoSummary 存入单独的列
  return api().dbReviewsAdd({
    id: review.id,
    periodType: review.periodType,
    periodStart: review.periodStart,
    periodEnd: review.periodEnd,
    score: review.score ?? 0,
    note: review.reflectionText ?? review.note ?? '',
    autoSummary: review.autoSummary ?? '',
    createdAt: review.createdAt,
    dimensionId: review.dimensionId ?? null,
  })
}

export async function updateReview(id: string, data: any) {
  LOG('updateReview', id)
  const dbData: any = {}
  for (const [k, v] of Object.entries(data)) {
    if (k === 'reflectionText') dbData.note = v
    else if (k === 'autoSummary') dbData.autoSummary = v
    else dbData[k] = v
  }
  return api().dbReviewsUpdate(id, dbData)
}

export async function deleteReview(id: string) {
  LOG('deleteReview', id)
  return api().dbReviewsDelete(id)
}

// ========== settings / snapshots / events（v3.1） ==========

export async function getSetting(key: string): Promise<string | null> {
  return api().dbSettingsGet(key)
}
export async function setSetting(key: string, value: string) {
  return api().dbSettingsSet(key, value)
}
export async function getSnapshots() {
  return api().dbSnapshotsGetAll()
}
export async function addSnapshot(row: { id: string; weekKey: string; takenAt: number; dataUrl: string }) {
  return api().dbSnapshotsAdd(row)
}
/** 本地埋点：只写本地 SQLite events 表，不出网（S4/J6） */
export async function logEvent(name: string) {
  try { await api().dbEventsLog(name) } catch { /* 埋点失败不影响任何功能 */ }
}

// ========== 季度会谈 / 焦点维度（v3.2） ==========

export async function getQuarterlyReviews(): Promise<QuarterlyReview[]> {
  const rows = await api().dbQuarterlyGetAll()
  return rows.map(parseQuarterlyRow)
}
export async function saveQuarterlyReview(r: QuarterlyReview) {
  return api().dbQuarterlyUpsert(toQuarterlyRow(r))
}
export async function deleteQuarterlyReview(id: string) {
  return api().dbQuarterlyDelete(id)
}
/** 焦点改写走专用通道：主进程一个事务里清旧写新，不走 updateDimension 逐条改 */
export async function setFocusDimensions(ids: string[]) {
  return api().dbFocusSet(ids)
}

// ========== 类型转换（DB 行 → 模型对象） ==========

function toDimension(row: any) {
  return {
    ...row,
    isEnabled: !!row.isEnabled,
    identity: row.identity ?? '',
    focusSince: row.focusSince ?? null,
    // 存量库（迁移前建的行）这几列是 NULL，给模型层补默认值，UI 才不必到处判空
    targetScore: row.targetScore ?? null,
    weeklyIntent: row.weeklyIntent ?? 0,
    pactTiming: row.pactTiming ?? '',
    pactAnchor: row.pactAnchor ?? '',
    pactText: row.pactText ?? '',
  }
}
function toScoreRubric(row: any) { return row }
function toBranch(row: any) { return row }
function toGoal(row: any) {
  return {
    ...row,
    isActive: !!row.isActive,
    descriptionText: row.description ?? '',
    unit: row.quantitativeUnit ?? null,
    currentValue: 0,
  }
}
function toAction(row: any) {
  return {
    ...row,
    isCompleted: !!row.isCompleted,
    descriptionText: row.description ?? '',
    mood: row.mood ?? '',
  }
}
function toReview(row: any) {
  return {
    ...row,
    reflectionText: row.note ?? '',
    autoSummary: row.autoSummary ?? '',
  }
}

// ========== 种子数据 ==========

export async function seedIfNeeded(): Promise<void> {
  LOG('seedIfNeeded', '开始检查...')
  const dims = await api().dbDimensionsGetAll()
  LOG('seedIfNeeded', `当前维度数: ${dims.length}`)
  if (dims.length > 0) {
    LOG('seedIfNeeded', '已有种子数据，跳过')
    return
  }
  LOG('seedIfNeeded', '无种子数据，将由主进程 seedIfNeeded 处理')
}

// ========== 导出 ==========

export { uuid }
export { exportJSON, exportCSV, importJSON } from './export'
