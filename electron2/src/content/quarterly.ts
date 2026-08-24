// 季度校准会谈的全部文案（v3.2）——
// Lisa 执笔（GROW / 精要主义 / 12-Week Year），书香语感终校，晓雅语气审。
//
// 语气总则（设计稿 §2.4）：
//   一律邀请式疑问句或陈述句，零祈使句；系统永远是「陪同者」人称（我们一起），不是「指导者」（你应该）；
//   所有问题都可以不回答，书写区全部可选——沉默着走完五幕也是一次完整的会谈。
//
// 红线：全稿不出现完成率、达成度、对勾/叉、逾期、百分比、涨跌箭头。

export const QUARTERLY_OPENING = {
  title: '季度校准会谈',
  lead: '这场对话大约需要一小时。你可以随时停下，花园会替你记住走到哪里了。',
}

export interface ActCopy {
  no: number
  title: string
  subtitle: string
  minutes: string
  questions: string[]
}

export const QUARTERLY_ACTS: ActCopy[] = [
  {
    no: 1,
    title: '回望上季',
    subtitle: '不审计，只是好奇地看看这十二周发生了什么',
    minutes: '15-20 分钟',
    questions: [
      '过去这十二周里，哪个瞬间现在想起来，还会让你微微一笑？',
      '有没有哪片花瓣，是被生活推着照顾的，而不是你选的？',
    ],
  },
  {
    no: 2,
    title: '逐瓣重新打分',
    subtitle: '现在的你，觉得每片花瓣舒展到哪里了？',
    minutes: '15-25 分钟',
    questions: [
      '这个位置，是它真实的样子，还是你希望它的样子？',
    ],
  },
  {
    no: 3,
    title: '对照差异',
    subtitle: '两张不同时间的照片，不是一张偏差表',
    minutes: '10-15 分钟',
    questions: [
      '哪片花瓣的变化，最出乎你的意料？',
      '有没有一片花瓣，分数没怎么动，但你对它的感觉变了？',
      '这两朵花之间的十二周里，什么在悄悄起作用？',
    ],
  },
  {
    no: 4,
    title: '选下季焦点',
    subtitle: '光是有限的，这正是选择珍贵的原因',
    minutes: '10-15 分钟',
    questions: [
      '如果下一个十二周，只能全心照顾一片花瓣——会是哪一片？',
      '为什么是它？十二周后，你希望它变成什么样子？',
    ],
  },
  {
    no: 5,
    title: '写一句季度意图',
    subtitle: '不是目标，不是计划，只是一句话',
    minutes: '5-10 分钟',
    questions: [],
  },
]

/** 上季有意图时才出现的那一问：永远问「它经历了什么」，不问「你做到了吗」 */
export function lastIntentQuestion(intent: string) {
  return `上一季你写下：「${intent}」。回头看，这一季它经历了什么？`
}

export const ACT2_MAIN_QUESTION = '现在的你，觉得这片花瓣舒展到哪里了？'

/** 第四幕最重要的一句——去惩罚化的关键落点 */
export const UNSELECTED_PROMISE =
  '其余的花瓣不会被冷落。它们只是这一季不站在光里——花园会继续照常记得它们的每一滴露水。'

/** 选到第 2 个时的温和提示：解释「为什么少即是多」，不说「最多选 2 个」这种系统腔 */
export const SECOND_FOCUS_HINT = '两片已经很多了。光是有限的，这正是选择珍贵的原因。'

export const INTENT_STARTERS = ['这一季，我想', '我愿意为', '十二周后的我，希望']

export const QUARTERLY_CLOSING = {
  title: '会谈结束了。下一程，慢慢走。',
  note: '十二周后我们再回来看这两朵花。',
}

/** 到期邀请卡（复用今日轻推卡形制，非弹窗、非红点、无角标数字） */
export const QUARTERLY_INVITE = {
  title: '这朵花陪你走过十二周了',
  body: '找一个安静的傍晚，我们一起回头看看，再决定下一程把光让给谁？',
  accept: '现在开始',
  defer: '这周先不',
}

/** 续谈询问：不能带任何「继续完成」的催促感（晓雅 X3） */
export function resumeQuestion(act: number) {
  return `上次我们聊到第 ${'一二三四五'[act - 1] ?? '一'} 幕，接着走，还是重新开始？`
}

export const SKIP_ACT_LABEL = '这幕先往后走'
