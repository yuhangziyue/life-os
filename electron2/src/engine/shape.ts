// 形状句 —— 把八段占比说成一句人话（v3.6，Lisa 第五轮提案 2）。
//
// 为什么需要它：
//   「代价可见」的数学表达是占比（之和恒为 100%，天然互斥）。但占比是八个数字，
//   而八个数字的列表就是报表（小露的老红线：「不能是八个百分比数字的列表」）。
//   人读得懂的是**形状**：光几乎只去了一处 / 六片让给了两片 / 八片都在动没有哪片在开。
//
// 红线（Lisa 的「被看见 vs 被刺激」六问表，逐条过）：
//   1. 可反驳 —— 每一句都是用户瞟一眼数据就能判对错的观察，不是评价
//   2. 无方向 —— 不出现更多/更好/更久，不出现涨跌箭头
//   3. 命名形状，不命名动机 —— 绝不写「你在赌一件事」这种越界解读
//   4. 坏日子对称 —— 每一句在「今天觉得自己在毁掉生活」的语境下念出来都不残忍
//   ⇒ 所以这里**没有一句带程度副词**（难得/格外/终于），也没有一句是完整句号收尾的感慨。

import type { LightShare } from './impression'

/** 统计窗口的说法。句子对不对，取决于说的是哪一段时间 */
export type PeriodWord = '这一周' | '这一个月' | '这一季'

export interface ShapeLine {
  /** 命中的形状 key，e2e 与埋点用 */
  kind: 'single' | 'twoOfEight' | 'even' | 'untouched' | 'shifted' | 'steady' | 'thin'
  text: string
}

/**
 * 八片总数。占比向量长度可能小于 8（lightShares 会滤掉零权重的），
 * 所以「有几片没被点到」必须拿总数减，不能靠数组长度。
 */
const PETALS = 8

/**
 * 一句形状概括。命中优先级从「最有信息量」到「最兜底」，只出一句。
 *
 * @param shares  lightShares() 的产物（已按占比降序，且已滤掉零权重）
 * @param period  这段占比统计的是哪个窗口
 * @param prevTop 上一个同长度窗口的首位花瓣名（可选）。给了才可能命中 shifted / steady
 */
export function shapeSummary(
  shares: LightShare[],
  period: PeriodWord,
  prevTop?: string | null,
): ShapeLine | null {
  if (shares.length === 0) return null

  const top = shares[0]
  const second = shares[1]
  const third = shares[2]
  const untouched = PETALS - shares.length

  // 只有一两条记录时不谈形状 —— 样本太薄，说什么都是过度解读
  const totalWeight = shares.reduce((s, x) => s + x.weight, 0)
  if (totalWeight < 4) {
    return { kind: 'thin', text: `${period}的账还薄，先攒着。` }
  }

  if (top.share >= 0.4) {
    return { kind: 'single', text: `${period}的光，几乎只去了一个地方。` }
  }

  if (second && top.share + second.share >= 0.6 && (!third || third.share <= 0.1)) {
    return { kind: 'twoOfEight', text: '六片让给了两片。' }
  }

  if (untouched >= 3) {
    return { kind: 'untouched', text: `有 ${untouched} 片${period}还没被点到。` }
  }

  // 八片都在场且都不突出：这是「均匀」，而均匀不是成就（Lisa 的原始口径）
  if (shares.length >= 7 && top.share <= 0.2) {
    return { kind: 'even', text: '八片都在动，没有哪一片在开。' }
  }

  if (prevTop && prevTop !== top.name) {
    return { kind: 'shifted', text: '重心换了地方。' }
  }
  if (prevTop && prevTop === top.name) {
    return { kind: 'steady', text: `同一片开在最前面，${period}没变过。` }
  }

  return { kind: 'thin', text: `${period}的光分成了 ${shares.length} 份。` }
}
