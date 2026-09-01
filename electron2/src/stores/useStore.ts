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
import { calculateScore, overallScore, coveredDimensions, startOfToday, dimensionVitality } from '../engine/scoring'
import { composeEcho, composeCompleteEcho, type Echo } from '../engine/echo'
import { composeLightShift, LIGHT_LAW_SEEN_KEY, type AhaPayload } from '../engine/lightShift'
import {
  detectAwaken, detectStageShift, detectWeekLight, isDailyFirst,
  awakenLine, stageShiftLines, weekLightLines,
  composeIntentSet, intentSetLines,
  DAILY_FIRST_LINE, PETAL_FIRST_LINE, NIGHT_LINE, EARLY_LINE, WEEK_LIGHT_SEEN_KEY,
} from '../engine/ahaMoments'
import {
  checkAhaGate, hasSampleFloor, isBackfill, isNight, isEarly, isRoughDay,
  EV_PLAYED, EV_KIND_PREFIX, type AhaKind,
} from '../engine/ahaGate'
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
import { nextDeferUntil, gardenBirth } from '../engine/quarterly'

/**
 * 本季起点 = 上一次「完成」的季度会谈时刻；从未谈过则花园生日。
 * 给行动回响的账本行（「本季第 N 次照顾 X」）用，与产品的 84 天节奏同源，
 * 刻意不用自然季度 —— 这座花园的季节是从上次结算算起的。
 */
function seasonStartOf(reviews: QuarterlyReview[], dimensions: Dimension[]): number {
  const done = reviews.filter(r => r.completedAt != null)
  if (done.length === 0) return gardenBirth(dimensions)
  return Math.max(...done.map(r => r.completedAt as number))
}

/** 待播定格帧的载荷落在 settings（key-value 能存 JSON）；闸门与幂等走 events 表 */
const AHA_PENDING_KEY = 'ahaPending'

/** 闸门要的两个查询。走 window.electronAPI，桌面与网页两版都已实现 */
function ahaDeps() {
  return {
    hasSince: (name: string, since: number) =>
      window.electronAPI.dbEventsHasSince(name, since).catch(() => false),
    countSince: (name: string, since: number) =>
      window.electronAPI.dbEventsCountSince(name, since).catch(() => 0),
  }
}

/**
 * 进门时消费待播的定格帧。
 *
 * Lisa 三轮给的唯一抑制规则（她的原话：他上次没记却被一句账本迎接，
 * 这句就是没被邀请的评判）：
 *   · 只在上一次会话里他**确实记了东西**之后出现 —— 载荷本身就是记录产生的，天然满足
 *   · 当日首开只一次 —— 靠 aha_played 的日上限兜住
 *   · 22:00–05:00 不出现
 *   · 中断回归 7 天内不出现
 *   · 不阻断操作、不需点掉、滑走即消、当日不再补
 */
async function takePendingAha(
  actions: Action[],
): Promise<{ aha?: AhaPayload; ahaStampedAt?: number }> {
  /** 取不到就返回**空对象**，不是 { aha: null } —— 见 loadData 里那段注释 */
  const none: { aha?: AhaPayload; ahaStampedAt?: number } = {}
  try {
    const raw = await getSetting(AHA_PENDING_KEY)
    if (!raw) return none
    const payload = JSON.parse(raw) as AhaPayload & { gateKind?: AhaKind }
    const now = Date.now()

    // 进门这一刻若是深夜，同样收声（小艾三轮：深夜闸门的判定时刻要跟着挪到进门时刻）
    if (isNight(now)) return none

    // 中断回归 7 天内不播 —— 一个刚回来的人开门不该撞上一句账本
    const lastAt = actions.length ? Math.max(...actions.map(a => a.createdAt)) : 0
    const brokeDays = lastAt ? Math.floor((payload.at - lastAt) / 86400000) : 0
    if (brokeDays >= 5) {
      await setSetting(AHA_PENDING_KEY, '')
      return none
    }

    const gateKind: AhaKind = payload.gateKind ?? (payload.kind as AhaKind)
    const gate = await checkAhaGate(gateKind, ahaDeps(), { now })
    if (!gate.pass) return none

    await setSetting(AHA_PENDING_KEY, '')
    await logEvent(EV_PLAYED)
    await logEvent(`${EV_KIND_PREFIX}${gateKind}`)
    return { aha: payload, ahaStampedAt: payload.at }
  } catch {
    return none
  }
}

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
  /** 「再记一条」预选的维度 id（v3.3 T6）；'' = 不预选 */
  quickAddPreset: string
  selectedDate: number

  theme: ThemeId
  echo: Echo | null
  /** 定格帧载荷（v3.6.1：四种 kind 的判别联合）。它只在「进门的一眼」被消费 */
  aha: AhaPayload | null
  /** 那条「总和恒为 100%」的解释是否已经说过（说一次就够） */
  ahaLawSeen: boolean
  /** 第 7 天「一周的光」是否已经出现过（终身一次） */
  weekLightSeen: boolean
  /** 点花瓣弹出的维度面板（v3.5 M7）；null = 没开。花瓣即导航，取代了「维度管理」那一栏 */
  dimensionSheetId: string | null
  /** 定格帧的触发时刻（进门播时用来给日期锚，小艾三轮的必要条件） */
  ahaStampedAt: number | null
  /**
   * 回执层（v3.6）：刚拿到光的那片花瓣 id。
   * 光带里这一段做一次 240ms 的饱和度脉冲 + 一粒墨点落下，然后停在 1.06 直到下一次记录 ——
   * 🔴 通道必须是**饱和度**不是宽度：一条 impact=2 的记录在 294px 带子上只让某段变宽 3–9px、
   *    其余各收缩 0.4–1.3px，240ms 内 1px 的宽度变化人眼没有知觉（小露二轮实算）。
   */
  pulseDimId: string | null
  /** 回归卡已收起的那次中断（值 = 上次记录时刻）；0 = 没收过 */
  returnCardDismissedAt: number
  /**
   * 时刻类 Aha 的那一行（v3.6.1）。
   * 深夜 / 清晨 / 当天首条 / 某片首条 —— 这四种**不弹层**，只改回执那一行字。
   * 深夜是唯一「只减不加」的时段：它只留全产品最短的一句「记下了。」
   */
  receiptLine: string | null

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
  /** 打开面板并预选维度：补记场景（周末批量补、晚上回顾今天）的入口 */
  openQuickAddWith: (dimensionId: string) => void
  setSelectedDate: (date: number) => void
  setTheme: (theme: ThemeId) => void
  clearEcho: () => void
  clearAha: () => void
  dismissReturnCard: (lastAt: number) => Promise<void>
  markAhaLawSeen: () => Promise<void>
  openDimensionSheet: (id: string) => void
  closeDimensionSheet: () => void
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
  quickAddPreset: '',
  selectedDate: startOfToday(),
  theme: loadTheme(),
  echo: null,
  aha: null,
  ahaLawSeen: false,
  weekLightSeen: false,
  dimensionSheetId: null,
  ahaStampedAt: null,
  pulseDimId: null,
  returnCardDismissedAt: 0,
  receiptLine: null,
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
      const [dimensions, scoreRubrics, branches, goals, actions, reviews, quarterlyReviews, deferUntil, deferCount, lawSeen, returnSeen, weekSeen] = await Promise.all([
        getDimensions(),
        getScoreRubrics(),
        getBranches(),
        getGoals(),
        getActions(),
        getReviews(),
        getQuarterlyReviews(),
        getSetting('quarterlyDeferUntil'),
        getSetting('quarterlyDeferCount'),
        getSetting(LIGHT_LAW_SEEN_KEY),
        getSetting('returnCardSeenAt'),
        getSetting(WEEK_LIGHT_SEEN_KEY),
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

      // 取待播帧：已经有一屏在显示时不再取（避免重复消费）
      const takenAha = get().aha ? {} : await takePendingAha(actions)

      set({
        dimensions: updatedDims,
        scoreRubrics,
        branches,
        goals,
        actions,
        reviews,
        quarterlyReviews,
        quarterlyDefer: { until: Number(deferUntil) || 0, count: Number(deferCount) || 0 },
        ahaLawSeen: lawSeen === '1',
        returnCardDismissedAt: Number(returnSeen) || 0,
        weekLightSeen: weekSeen === '1',
        // 待播的定格帧必须在**首帧渲染前**就算完并放进同一批 set ——
        // 进门后再算会闪一下才播，那比不播更糟（小露三轮的护栏）。
        //
        // 🔴 只在**真的取到载荷时**才写这两个字段（`takenAha` 是条件展开）。
        //   无条件写 `aha: null` 会造成两个真实故障：
        //   ① dev 的 StrictMode 双跑 effect ⇒ 第一次取出定格帧、第二次立刻擦掉，帧永远不出现
        //   ② 每次 addAction 结尾都会 loadData ⇒ 正在读的那一屏定格会被下一笔记录擦掉
        ...takenAha,
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
  setQuickAddOpen: (open) => set({ quickAddOpen: open, quickAddPreset: open ? get().quickAddPreset : '' }),
  openQuickAddWith: (dimensionId) => set({ quickAddOpen: true, quickAddPreset: dimensionId }),
  setSelectedDate: (date) => set({ selectedDate: date }),
  setTheme: (theme) => set({ theme }),
  clearEcho: () => set({ echo: null, receiptLine: null }),
  clearAha: () => set({ aha: null, ahaStampedAt: null }),

  dismissReturnCard: async (lastAt) => {
    set({ returnCardDismissedAt: lastAt })
    try { await setSetting('returnCardSeenAt', String(lastAt)) } catch { /* 记不住就下次再出一次，无害 */ }
  },

  openDimensionSheet: (id) => set({ dimensionSheetId: id }),
  closeDimensionSheet: () => set({ dimensionSheetId: null }),

  /** 那条「总和恒为 100%」的解释已经说过了，落库，永不再出现 */
  markAhaLawSeen: async () => {
    if (get().ahaLawSeen) return
    set({ ahaLawSeen: true })
    try { await setSetting(LIGHT_LAW_SEEN_KEY, '1') } catch { /* 记不住比说两次好，不挡路径 */ }
  },

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
    // 「立了意图」的当场：从「什么都没写」变成「写了目标或约定」——每片一辈子只演一次。
    // 🔴 这条 Aha 的全部理由（晓雅一轮）：**设定计划的当场必须显示代价** ——
    //   你说要给这片多一些，那些光眼下在别处。不显示这个，计划就退化成待办清单。
    const prev = get().dimensions.find(d => d.id === id)
    const wasEmpty = !!prev && prev.targetScore == null && !prev.pactText
    await updateDimension(id, data)
    await get().loadData()

    if (wasEmpty) {
      const now = get().dimensions.find(d => d.id === id)
      const nowSet = !!now && (now.targetScore != null || !!now.pactText)
      if (now && nowSet) {
        const seen = `${EV_KIND_PREFIX}intent_set:${id}`
        try {
          if (!(await window.electronAPI.dbEventsHas(seen))) {
            const info = composeIntentSet(now)
            const lines = intentSetLines(info)
            await logEvent(seen)
            await setSetting(AHA_PENDING_KEY, JSON.stringify({
              kind: 'intent_set', at: Date.now(), gateKind: 'intent_set',
              headline: lines[0], lines: lines.slice(1), colorHex: now.colorHex,
            }))
          }
        } catch { /* 攒不下不挡编辑路径 */ }
      }
    }
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
    const { dimensions, goals, actions, quarterlyReviews } = get()
    const dim = dimensions.find(d => d.id === action.dimensionId)
    const echo = dim
      ? composeEcho({
          dimension: dim,
          goals,
          actions,
          quality: newAction.quality,
          seed: newAction.id,
          seasonStart: seasonStartOf(quarterlyReviews, dimensions),
        })
      : null

    // 「光的分配」（v3.6）：仍然必须用写入前的 actions 算 —— 它要的正是「之前 vs 之后」的差。
    // 但**提交后不再弹层**：命中就攒起来，等下次打开 app 作为「进门的一眼」播。
    // 提交后什么都不会来 ⇒ 「追求触发」被彻底掐死（小露二轮那一刀）。
    const shift = composeLightShift({ dimensions, actionsBefore: actions, added: newAction })

    await addAction(newAction)
    await get().loadData()

    const nowTs = newAction.createdAt
    const backfill = isBackfill(newAction)

    // ---- 时刻类 Aha：不弹层，只改回执那一行字（v3.6.1）----
    // 补记一律屏蔽 —— 「今天的账开了」在补记场景下是假的（老架二轮）
    let receiptLine: string | null = null
    if (!backfill) {
      if (isNight(nowTs)) receiptLine = NIGHT_LINE
      else if (dim && !actions.some(a => a.isCompleted && a.dimensionId === dim.id)) {
        receiptLine = PETAL_FIRST_LINE(dim.name)     // 这片花瓣有史以来第一条
      } else if (isDailyFirst(actions, nowTs)) {
        receiptLine = isEarly(nowTs) ? EARLY_LINE : DAILY_FIRST_LINE
      }
    }

    // 回执层：光带里那一段做一次饱和度脉冲。每次记录都有，不阻断
    set({ echo, pulseDimId: action.dimensionId, receiptLine })

    // ---- 形态类 Aha：不当场播，攒到下次进门 ----
    // 静音档（Lisa 二轮定为唯一「只减不加」的时段）：深夜与坏日子一律不攒，
    // 且**不落任何事件行 ⇒ 不消耗冷却**（小艾三轮要求这条必须在代码里写死一套）。
    if (isNight(nowTs) || isRoughDay(get().actions, nowTs)) return
    if (!dim) return

    const floorOk = hasSampleFloor(dimensions, get().actions, nowTs)
    const dormantNames = dimensions
      .filter(d => d.id !== dim.id && dimensionVitality(d, actions).dormant)
      .map(d => d.name)

    // 🔴 单次记录最多攒 1 条，按信息价值取第一，其余**直接丢弃不排队**
    //    （排队 = 承诺 = 落空 = 奖励，圆桌闸门第 1 条）
    const stage = detectStageShift({ dimension: dim, actionsBefore: actions, impact: newAction.impact })
    const awaken = detectAwaken({ dimension: dim, actionsBefore: actions, now: nowTs })

    const candidates: { kind: AhaKind; payload: AhaPayload }[] = []

    // 第 7 天「一周的光」：四个 Aha 递进线上唯一还缺的一环，终身一次
    if (!get().weekLightSeen) {
      const wl = detectWeekLight({
        actions: get().actions,
        gardenBornAt: gardenBirth(dimensions),
        now: nowTs,
      })
      if (wl) {
        const lines = weekLightLines(wl)
        candidates.push({
          kind: 'week_light',
          payload: {
            kind: 'stage_up', at: nowTs,        // 复用事实型定格帧的渲染
            headline: lines[0], lines: lines.slice(1), colorHex: dim.colorHex,
          },
        })
      }
    }

    if (shift?.firstEver) {
      candidates.push({ kind: 'first_ever', payload: { kind: 'light_shift', at: nowTs, shift } })
    }
    if (stage) {
      const lines = stageShiftLines(stage, dormantNames)
      candidates.push({
        kind: 'stage_up',
        payload: { kind: 'stage_up', at: nowTs, headline: lines[0], lines: lines.slice(1), colorHex: stage.colorHex },
      })
    }
    if (awaken) {
      candidates.push({
        kind: 'awaken',
        payload: { kind: 'awaken', at: nowTs, headline: awakenLine(awaken), lines: [], colorHex: awaken.colorHex },
      })
    }
    if (shift && !shift.firstEver) {
      candidates.push({ kind: 'light_shift', payload: { kind: 'light_shift', at: nowTs, shift } })
    }

    for (const c of candidates) {
      const gate = await checkAhaGate(c.kind, ahaDeps(), { backfill, floorOk, now: nowTs })
      if (!gate.pass) continue
      try {
        await setSetting(AHA_PENDING_KEY, JSON.stringify({ ...c.payload, gateKind: c.kind }))
        if (c.kind === 'week_light') {
          await setSetting(WEEK_LIGHT_SEEN_KEY, '1')
          set({ weekLightSeen: true })
        }
      } catch { /* 攒不下就当没这回事，不挡记录路径 */ }
      return                                          // 只攒第一条，剩下的丢掉
    }
  },

  updateAction: async (id, data) => {
    // 把一条记录标记为「完成」也值得被回应
    const prev = get().actions.find(a => a.id === id)
    const justCompleted = !!prev && !prev.isCompleted && data.isCompleted === true

    await updateAction(id, { ...data, updatedAt: Date.now() })
    await get().loadData()

    if (justCompleted && prev) {
      const dim = get().dimensions.find(d => d.id === prev.dimensionId)
      // 把一条既有记录勾成完成，光的分配确实变了；但这条路径上没有「刚写进去的那条」
      // 可供对照，所以只给回响、不给 Aha（宁可不演，不演错）
      if (dim) set({ echo: composeCompleteEcho(dim, prev.descriptionText), aha: null })
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
