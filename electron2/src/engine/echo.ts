// 行动回响 —— 每一次记录/完成，都要被明确、温暖地回应：这个动作有什么用。
// 组成：效果行（落在哪片花瓣、唤醒/连续照顾/目标推进）+ 温暖话语（benefit + 经典引言）。

import type { Dimension } from '../models/dimension'
import type { Goal } from '../models/goal'
import type { Action, ActionQuality } from '../models/action'
import {
  dimensionVitality,
  careStreak,
  calculateScore,
  scoreAfterAdding,
  scoreStage,
} from './scoring'
import { QUALITY_IMPACT } from '../models/action'
import { pickWarmWord, type WarmWord } from '../content/warmWords'

export interface Echo {
  key: number              // 每次不同，驱动 toast 重新出现
  dimensionName: string
  color: string
  lines: string[]          // 效果行（1-3 行）
  word: WarmWord           // 温暖话语（benefit + quote）
}

/**
 * 在行动写入「之前」调用（用写入前的 actions 判断沉睡/连续天数），
 * 返回写入后应展示的回响。
 */
export function composeEcho(params: {
  dimension: Dimension
  goals: Goal[]
  actions: Action[]        // 写入前的全量行动
  quality: ActionQuality
  seed: string
  /** 本季起点（上次季度会谈完成时刻，没有则花园生日）。缺省则不出账本行 */
  seasonStart?: number
}): Echo {
  const { dimension, goals, actions, quality, seed, seasonStart } = params
  const vitality = dimensionVitality(dimension, actions)
  const lines: string[] = []

  // 效果行 1：落点 + 唤醒
  if (vitality.dormant && vitality.daysSinceLast != null) {
    lines.push(`沉睡了 ${vitality.daysSinceLast} 天的「${dimension.name}」被你唤醒了，花瓣正在重新舒展`)
  } else {
    lines.push(`这滴露水落在了「${dimension.name}」的花瓣上`)
  }

  // 效果行 2：连续照顾（写入前的 streak；今天这条落下后 +1）
  const streakBefore = careStreak(dimension.id, actions)
  const streakAfter = vitality.hasToday ? streakBefore : streakBefore + 1
  if (streakAfter >= 2) {
    lines.push(`这是你连续第 ${streakAfter} 天照顾它`)
  }

  // 效果行 3：账本行（v3.3 T2，书香方案）
  // 「本季第 N 次」永远不会重复，因为数字在变 —— 一条机制抵掉一整个内容扩容工程。
  if (seasonStart != null) {
    const seasonCount = actions.filter(
      a => a.dimensionId === dimension.id && a.isCompleted && a.date >= seasonStart
    ).length + 1 // +1 = 今天这条
    if (seasonCount >= 2) {
      lines.push(`这是本季第 ${seasonCount} 次照顾「${dimension.name}」`)
    }
  }

  // 效果行 4：状态词跃迁（v3.3 T2，全票通过）
  // 离散的、仪式性的、值得庆祝 —— 比「+0.4 分」强十倍。只在真的跨档时出现。
  const stageBefore = scoreStage(calculateScore(dimension, actions))
  const stageAfter = scoreStage(scoreAfterAdding(dimension, actions, QUALITY_IMPACT[quality]))
  if (stageAfter !== stageBefore) {
    lines.push(`🌿 「${dimension.name}」从${stageBefore}进入了${stageAfter}——它正在慢慢打开`)
  }

  // 效果行 5：目标推进
  const goal = goals.find(g => g.isActive && g.dimensionId === dimension.id)
  if (goal) {
    lines.push(`离「${goal.title}」又近了一步`)
  }

  // 身份宣言联动（C2）：写了宣言的维度，行动确认变成给身份投票（《原子习惯》）
  if (dimension.identity) {
    lines.push(`又给「成为${dimension.identity}的人」投了一票`)
  }

  // 里程碑加一句
  if (quality === 'milestone') {
    lines.push('里程碑会让这片花瓣长久地记得今天')
  }

  return {
    key: Date.now(),
    dimensionName: dimension.name,
    color: dimension.colorHex,
    lines,
    word: pickWarmWord(dimension.name, seed),
  }
}

/** 完成一条已有记录时的轻量回响 */
export function composeCompleteEcho(dimension: Dimension, description: string): Echo {
  return {
    key: Date.now(),
    dimensionName: dimension.name,
    color: dimension.colorHex,
    lines: [`「${description || '一件小事'}」完成了，它滋养了「${dimension.name}」`],
    word: pickWarmWord(dimension.name, description + dimension.id),
  }
}
