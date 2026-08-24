import { create } from 'zustand'
import { useShallow } from 'zustand/react/shallow'
import {
  getDimensions, addDimension, updateDimension, deleteDimension,
  getScoreRubrics, addScoreRubric,
  getBranches, addBranch, updateBranch, deleteBranch,
  getGoals, addGoal, updateGoal, deleteGoal,
  getActions, addAction, updateAction, deleteAction,
  getReviews, addReview, updateReview, deleteReview,
  setSetting, getSetting, logEvent,
  getQuarterlyReviews, saveQuarterlyReview, deleteQuarterlyReview, setFocusDimensions,
  seedIfNeeded, uuid,
} from '../db'
import { loadAmbience, saveAmbience, applyCursorSetting, type Ambience } from '../services/ambience'
import { calculateScore, overallScore, coveredDimensions, startOfToday } from '../engine/scoring'
import { composeEcho, composeCompleteEcho, type Echo } from '../engine/echo'
import { loadAIConfig, saveAIConfig, testConnection } from '../services/ai'
import { loadTheme, type ThemeId } from '../services/theme'
import { DEFAULT_RUBRICS } from '../models/dimension'
import type { Dimension, ScoreRubric } from '../models/dimension'
import type { Branch } from '../models/branch'
import type { Goal } from '../models/goal'
import type { Action } from '../models/action'
import type { Review } from '../models/review'
import type { AIConfig, AITestResult } from '../services/ai'
import type { QuarterlyReview } from '../models/quarterly'
import { MAX_FOCUS } from '../models/quarterly'
import { nextDeferUntil } from '../engine/quarterly'

// 同 src/db/database.ts：localStorage.setItem('lifeos:debug','1') 打开
const DEBUG = typeof localStorage !== 'undefined' && localStorage.getItem('lifeos:debug') === '1'
const LOG = DEBUG ? (tag: string, ...args: any[]) => console.log(`[Store:${tag}]`, ...args) : () => {}
const LOG_E = (tag: string, ...args: any[]) => console.error(`[Store:${tag}]`, ...args)

// ========== Store 类型 ==========

interface AppState {
  dimensions: Dimension[]
  scoreRubrics: ScoreRubric[]
  branches: Branch[]
  goals: Goal[]
  actions: Action[]
  reviews: Review[]

  isLoading: boolean
  loadError: string | null
  sidebarCollapsed: boolean
  quickAddOpen: boolean
  selectedDate: number

  theme: ThemeId
  echo: Echo | null

  ambience: Ambience
  onboardingOpen: boolean

  // ---- 季度校准会谈（v3.2）----
  quarterlyReviews: QuarterlyReview[]
  /** 会谈进行中时的当前记录（草稿实体本身）；null = 没在会谈里 */
  quarterlySession: QuarterlyReview | null
  quarterlyDefer: { until: number; count: number }

  aiConfig: AIConfig
  aiTestResult: AITestResult | null
  isTestingAI: boolean

  loadData: () => Promise<void>
  toggleSidebar: () => void
  setQuickAddOpen: (open: boolean) => void
  setSelectedDate: (date: number) => void
  setTheme: (theme: ThemeId) => void
  clearEcho: () => void
  setAmbience: (partial: Partial<Ambience>) => void
  setOnboardingOpen: (open: boolean) => void
  /** 完成首启引导：写入亲手打的初始分 → 记 done → 花苞绽放交给组件动画 */
  completeOnboarding: (scores: Record<string, number>) => Promise<void>
  /** 跳过引导：不动种子分，只记 done */
  skipOnboarding: () => Promise<void>

  /** 发起会谈：有草稿则续用，否则新建一条 completedAt 为空的记录 */
  startQuarterly: (resume?: boolean) => Promise<void>
  /** 中途保存（每幕切换、每次书写落焦都调）——退出不弹挽留框，靠这条兜底 */
  saveQuarterlyDraft: (patch: Partial<QuarterlyReview>) => Promise<void>
  /** 关掉会谈窗口（草稿留着，不催办） */
  closeQuarterly: () => void
  /** 走完五幕：写分数 + 落焦点 + 记完成时刻 */
  completeQuarterly: () => Promise<void>
  /** 作废草稿 */
  discardQuarterlyDraft: (id: string) => Promise<void>
  /** 邀请卡「这周先不」 */
  deferQuarterly: () => Promise<void>

  addDimension: (dim: Omit<Dimension, 'id' | 'createdAt'>) => Promise<void>
  updateDimension: (id: string, data: Partial<Dimension>) => Promise<void>
  deleteDimension: (id: string) => Promise<void>

  addBranch: (branch: Omit<Branch, 'id' | 'createdAt'>) => Promise<void>
  updateBranch: (id: string, data: Partial<Branch>) => Promise<void>
  deleteBranch: (id: string) => Promise<void>

  addGoal: (goal: Omit<Goal, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>
  updateGoal: (id: string, data: Partial<Goal>) => Promise<void>
  deleteGoal: (id: string) => Promise<void>

  addAction: (action: Omit<Action, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>
  updateAction: (id: string, data: Partial<Action>) => Promise<void>
  deleteAction: (id: string) => Promise<void>

  addReview: (review: Omit<Review, 'id' | 'createdAt'>) => Promise<void>
  updateReview: (id: string, data: Partial<Review>) => Promise<void>
  deleteReview: (id: string) => Promise<void>

  setAIConfig: (config: Partial<AIConfig>) => void
  saveAIConfig: () => void
  testAIConnection: () => Promise<void>
}

// ========== Store 实现 ==========

export const useStore = create<AppState>((set, get) => ({
  dimensions: [],
  scoreRubrics: [],
  branches: [],
  goals: [],
  actions: [],
  reviews: [],
  isLoading: true,
  loadError: null,
  sidebarCollapsed: false,
  quickAddOpen: false,
  selectedDate: startOfToday(),
  theme: loadTheme(),
  echo: null,
  ambience: loadAmbience(),
  onboardingOpen: false,
  quarterlyReviews: [],
  quarterlySession: null,
  quarterlyDefer: { until: 0, count: 0 },
  aiConfig: loadAIConfig(),
  aiTestResult: null,
  isTestingAI: false,

  loadData: async () => {
    LOG('loadData', '========== 开始加载数据 ==========')
    set({ isLoading: true, loadError: null })

    try {
      // Step 1: 确保种子数据
      LOG('loadData', 'Step 1: seedIfNeeded')
      await seedIfNeeded()
      LOG('loadData', 'Step 1: 完成')

      // Step 2: 并行加载所有数据
      LOG('loadData', 'Step 2: 并行加载数据...')
      const [dimensions, scoreRubrics, branches, goals, actions, reviews, quarterlyReviews, deferUntil, deferCount] = await Promise.all([
        getDimensions(),
        getScoreRubrics(),
        getBranches(),
        getGoals(),
        getActions(),
        getReviews(),
        getQuarterlyReviews(),
        getSetting('quarterlyDeferUntil'),
        getSetting('quarterlyDeferCount'),
      ])
      LOG('loadData', `Step 2: 完成 - dims=${dimensions.length}, rubrics=${scoreRubrics.length}, branches=${branches.length}, goals=${goals.length}, actions=${actions.length}, reviews=${reviews.length}`)

      // Step 3: 计算维度分数
      LOG('loadData', 'Step 3: 计算维度分数')
      const updatedDims = dimensions.map(d => ({
        ...d,
        currentScore: calculateScore(d, actions),
      }))

      await Promise.all(
        updatedDims.map(d => updateDimension(d.id, { currentScore: d.currentScore }))
      )
      LOG('loadData', 'Step 3: 完成')

      set({
        dimensions: updatedDims,
        scoreRubrics,
        branches,
        goals,
        actions,
        reviews,
        quarterlyReviews,
        quarterlyDefer: { until: Number(deferUntil) || 0, count: Number(deferCount) || 0 },
        isLoading: false,
        loadError: null,
      })
      LOG('loadData', '========== 数据加载完成 ==========')
    } catch (e) {
      LOG_E('loadData', '加载失败:', e)
      const message = e instanceof Error ? e.message : String(e)
      const stack = e instanceof Error ? e.stack : ''
      LOG_E('loadData', '堆栈:', stack)
      set({
        isLoading: false,
        loadError: `数据加载失败: ${message}`,
      })
    }
  },

  toggleSidebar: () => set(s => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setQuickAddOpen: (open) => set({ quickAddOpen: open }),
  setSelectedDate: (date) => set({ selectedDate: date }),
  setTheme: (theme) => set({ theme }),
  clearEcho: () => set({ echo: null }),

  setAmbience: (partial) => {
    const next = { ...get().ambience, ...partial }
    saveAmbience(next)
    applyCursorSetting(next.cursor)
    set({ ambience: next })
  },

  setOnboardingOpen: (open) => set({ onboardingOpen: open }),

  completeOnboarding: async (scores) => {
    const entries = Object.entries(scores)
    for (const [dimId, score] of entries) {
      await updateDimension(dimId, { initialScore: score, currentScore: score })
    }
    await setSetting('onboardingDone', '1')
    logEvent('onboarding_done')
    await get().loadData()
    // 不在这里关 overlay：组件还要演「花开了」这一幕，收尾由组件负责
  },

  skipOnboarding: async () => {
    await setSetting('onboardingDone', '1')
    logEvent('onboarding_skip')
    set({ onboardingOpen: false })
  },

  // ---- 季度校准会谈（v3.2）----

  startQuarterly: async (resume = true) => {
    const draft = get().quarterlyReviews.find(r => r.completedAt == null) ?? null
    if (resume && draft) {
      set({ quarterlySession: draft })
      logEvent('quarterly_resume')
      return
    }
    if (draft) await deleteQuarterlyReview(draft.id) // 作废旧草稿后重新开始
    const fresh: QuarterlyReview = {
      id: uuid(),
      startedAt: Date.now(),
      completedAt: null,
      actProgress: 1,
      scores: {},
      reflections: {},
      focusDimensionIds: get().dimensions.filter(d => d.focusSince != null).map(d => d.id),
      intent: '',
    }
    await saveQuarterlyReview(fresh)
    logEvent('quarterly_start')
    set({ quarterlySession: fresh, quarterlyReviews: [fresh, ...get().quarterlyReviews.filter(r => r.completedAt != null)] })
  },

  saveQuarterlyDraft: async (patch) => {
    const cur = get().quarterlySession
    if (!cur) return
    const next = { ...cur, ...patch }
    set({ quarterlySession: next })
    await saveQuarterlyReview(next)
  },

  closeQuarterly: () => set({ quarterlySession: null }),

  completeQuarterly: async () => {
    const cur = get().quarterlySession
    if (!cur) return
    const done: QuarterlyReview = { ...cur, completedAt: Date.now(), actProgress: 5 }

    // 第二幕的分数走既有分数写入通路（与首次盘点同构）；跳过第二幕则 scores 为空，沿用现有分数
    for (const [dimId, score] of Object.entries(done.scores)) {
      await updateDimension(dimId, { initialScore: score, currentScore: score })
    }
    // 焦点落库：权威源写会谈记录，dimensions.focusSince 是同一事务里的渲染缓存
    await setFocusDimensions(done.focusDimensionIds.slice(0, MAX_FOCUS))
    await saveQuarterlyReview(done)
    // 完成即重置推迟计数：下一程从今天起算 84 天
    await setSetting('quarterlyDeferUntil', '0')
    await setSetting('quarterlyDeferCount', '0')
    logEvent('quarterly_done')
    set({ quarterlySession: done })
    await get().loadData()
  },

  discardQuarterlyDraft: async (id) => {
    await deleteQuarterlyReview(id)
    set({ quarterlySession: null })
    await get().loadData()
  },

  deferQuarterly: async () => {
    const count = get().quarterlyDefer.count + 1
    const until = nextDeferUntil()
    await setSetting('quarterlyDeferUntil', String(until))
    await setSetting('quarterlyDeferCount', String(count))
    logEvent('quarterly_defer')
    set({ quarterlyDefer: { until, count } })
  },

  // ---- Dimension CRUD ----
  addDimension: async (dim) => {
    const now = Date.now()
    const newDim: Dimension = { ...dim, id: uuid(), createdAt: now }
    await addDimension(newDim)
    // 新维度带上一套标准评分标准，详情页的评分对照才不是空的
    await Promise.all(
      DEFAULT_RUBRICS.map(r => addScoreRubric({ ...r, id: uuid(), dimensionId: newDim.id }))
    )
    await get().loadData()
  },

  updateDimension: async (id, data) => {
    await updateDimension(id, data)
    await get().loadData()
  },

  deleteDimension: async (id) => {
    await deleteDimension(id)
    await get().loadData()
  },

  // ---- Branch CRUD ----
  addBranch: async (branch) => {
    const newBranch: Branch = { ...branch, id: uuid(), createdAt: Date.now() }
    await addBranch(newBranch)
    await get().loadData()
  },

  updateBranch: async (id, data) => {
    await updateBranch(id, data)
    await get().loadData()
  },

  deleteBranch: async (id) => {
    await deleteBranch(id)
    await get().loadData()
  },

  // ---- Goal CRUD ----
  addGoal: async (goal) => {
    const now = Date.now()
    const newGoal: Goal = { ...goal, id: uuid(), createdAt: now, updatedAt: now }
    await addGoal(newGoal)
    await get().loadData()
  },

  updateGoal: async (id, data) => {
    await updateGoal(id, { ...data, updatedAt: Date.now() })
    await get().loadData()
  },

  deleteGoal: async (id) => {
    await deleteGoal(id)
    await get().loadData()
  },

  // ---- Action CRUD ----
  addAction: async (action) => {
    const now = Date.now()
    const newAction: Action = { ...action, id: uuid(), createdAt: now, updatedAt: now }
    LOG('addAction', '创建:', newAction.descriptionText)

    // 行动回响：用「写入前」的状态判断唤醒/连续天数，写入完成后再展示
    const { dimensions, goals, actions } = get()
    const dim = dimensions.find(d => d.id === action.dimensionId)
    const echo = dim
      ? composeEcho({ dimension: dim, goals, actions, quality: newAction.quality, seed: newAction.id })
      : null

    await addAction(newAction)
    await get().loadData()
    if (echo) set({ echo })
  },

  updateAction: async (id, data) => {
    // 把一条记录标记为「完成」也值得被回应
    const prev = get().actions.find(a => a.id === id)
    const justCompleted = !!prev && !prev.isCompleted && data.isCompleted === true

    await updateAction(id, { ...data, updatedAt: Date.now() })
    await get().loadData()

    if (justCompleted && prev) {
      const dim = get().dimensions.find(d => d.id === prev.dimensionId)
      if (dim) set({ echo: composeCompleteEcho(dim, prev.descriptionText) })
    }
  },

  deleteAction: async (id) => {
    await deleteAction(id)
    await get().loadData()
  },

  // ---- Review CRUD ----
  addReview: async (review) => {
    const newReview: Review = { ...review, id: uuid(), createdAt: Date.now() }
    await addReview(newReview)
    await get().loadData()
  },

  updateReview: async (id, data) => {
    await updateReview(id, data)
    await get().loadData()
  },

  deleteReview: async (id) => {
    await deleteReview(id)
    await get().loadData()
  },

  // ---- AI ----
  setAIConfig: (config) => set(s => ({ aiConfig: { ...s.aiConfig, ...config } })),
  saveAIConfig: () => {
    const { aiConfig } = get()
    saveAIConfig(aiConfig)
  },
  testAIConnection: async () => {
    set({ isTestingAI: true, aiTestResult: null })
    const { aiConfig } = get()
    const result = await testConnection(aiConfig)
    set({ isTestingAI: false, aiTestResult: result })
  },
}))

// ========== 派生选择器 ==========
//
// ⚠️ 铁律：任何在 selector 里 .filter()/.map() 造新数组、或 {} 造新对象的派生 hook，
// 必须套 useShallow。zustand v5 走 useSyncExternalStore，getSnapshot 返回新引用
// 会被 React 判定"快照一直在变" → 无限重渲染 → Maximum update depth exceeded → 整棵树被拆掉白屏。
// 返回原对象引用（.find()）或原始值（number/string/boolean）的不需要包。
// 别为了"少个 import"把 filter 直接写进组件里的 useStore(...)——同样会炸。

export function useDimension(id: string) {
  // .find() 返回 store 里的原对象引用，天然稳定，无需 useShallow
  return useStore(s => s.dimensions.find(d => d.id === id))
}

/** 启用中的维度。原本这句 filter 在 6 个组件里各抄了一遍且都没包 useShallow，是白屏元凶之一 */
export function useEnabledDimensions() {
  return useStore(useShallow(s => s.dimensions.filter(d => d.isEnabled)))
}

export function useDimensionBranches(dimensionId: string) {
  return useStore(useShallow(s => s.branches.filter(b => b.dimensionId === dimensionId)))
}

export function useDimensionGoals(dimensionId: string) {
  return useStore(useShallow(s => s.goals.filter(g => g.dimensionId === dimensionId)))
}

export function useTodayActions() {
  return useStore(useShallow(s => {
    const today = startOfToday()
    const tomorrow = today + 24 * 60 * 60 * 1000
    return s.actions.filter(a => a.date >= today && a.date < tomorrow)
  }))
}

export function useDateActions(date: number) {
  return useStore(useShallow(s => {
    const dayStart = date
    const dayEnd = date + 24 * 60 * 60 * 1000
    return s.actions.filter(a => a.date >= dayStart && a.date < dayEnd)
  }))
}

export function useOverallScore() {
  return useStore(s => overallScore(s.dimensions, s.actions))
}

export function useCoveredCount() {
  return useStore(s => coveredDimensions(s.dimensions, s.actions))
}

/**
 * 陪伴天数（C3）：从最早一条记录（或花园创建）到今天的自然日数，永不清零。
 * 我们庆祝在场，不惩罚缺席——这不是 streak，断一天也不会归零。
 * 返回原始值（number），无需 useShallow。
 */
export function useCompanionDays() {
  return useStore(s => {
    const firsts: number[] = []
    if (s.actions.length > 0) firsts.push(Math.min(...s.actions.map(a => a.date)))
    if (s.dimensions.length > 0) firsts.push(Math.min(...s.dimensions.map(d => d.createdAt)))
    if (firsts.length === 0) return 1
    const first = Math.min(...firsts)
    return Math.max(1, Math.floor((Date.now() - first) / (24 * 60 * 60 * 1000)) + 1)
  })
}

/** 这一季的焦点维度（0-2 片）。filter 造新数组 → 必须 useShallow */
export function useFocusDimensions() {
  return useStore(useShallow(s => s.dimensions.filter(d => d.focusSince != null)))
}

/** 累计记录天数（有至少一条记录的自然日数，同样只增不减） */
export function useRecordedDays() {
  return useStore(s => {
    const days = new Set(s.actions.map(a => a.date))
    return days.size
  })
}
