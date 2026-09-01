import { useMemo, useRef, useState } from 'react'
import { useStore, useEnabledDimensions } from '../stores/useStore'
import { composeFirstImpression } from '../engine/impression'
import { renderPostcard } from '../services/postcard'
import { FlowerChart } from './FlowerChart'
import { FlowerLogo } from './FlowerLogo'
import { PetalScoreRow } from './PetalScoreRow'
import { useFlowerSize } from '../hooks/useFlowerSize'

/**
 * 首启引导三幕（v3.3 T1，由 v3.1 的四幕收缩而来）——
 *   第一幕 欢迎与定性：这不是考核表，是你的花园（先卸防备，才有真话——书香）
 *   第二幕 八瓣速评 + 实时花形：左边打分，右边的花当场伸缩
 *   第三幕 花开了 + 第一份代价快照：一句由花形偏态生成的话 + 三个操作提示
 *
 * v3.3 相对 v3.1 的两处改动（2026-08-25 第四轮圆桌）：
 *   ① 原第二幕「认识八片花瓣」整幕删除 —— 认知成本下沉为滑块上方一行小字。
 *      理由（小露）：让人闭着眼睛捏泥巴、捏完再看，等于把最好的一刻挪到了最后。
 *   ② 新增「代价快照」—— 核心价值从第 84 天搬到第 1 天。
 *      Aha 不是我们递给他的一句话，是他自己在滑动时看见的；快照句只是替他说出口。
 *
 * 全程可跳过（跳过 = 种子分照旧）；设置页可重看。
 * 语气红线（晓雅 X3）：邀请式，不出现任何目标设定与命令句。
 * 快照句红线（Lisa）：不褒不贬 —— 「均匀」不是成就，「合着」不是辜负。
 */

// 八个种子维度的一句话介绍；自种维度走兜底
const DIMENSION_INTROS: Record<string, string> = {
  '职业发展': '你的手艺、事业与影响力',
  '财务状况': '钱的流向，和说「不」的底气',
  '个人成长': '读的书、学的课、想通的事',
  '身心健康': '身体与情绪——所有远方的入场券',
  '家庭关系': '与最亲近的人之间的温度',
  '社交关系': '朋友、同好，与真诚的连接',
  '休闲娱乐': '玩耍与放空，给心里的弦松松劲',
  '精神成长': '意义、感恩，与内心的安顿',
}

export function Onboarding() {
  // 首启三幕的花：同样不写死（v3.6.1）
  const onbFlower = useFlowerSize(260)
  const dimensions = useEnabledDimensions()
  const actions = useStore(s => s.actions)
  const completeOnboarding = useStore(s => s.completeOnboarding)
  const skipOnboarding = useStore(s => s.skipOnboarding)
  const setOnboardingOpen = useStore(s => s.setOnboardingOpen)
  const setQuickAddOpen = useStore(s => s.setQuickAddOpen)

  const [act, setAct] = useState(0)
  const [saving, setSaving] = useState(false)
  const [scores, setScores] = useState<Record<string, number>>(
    () => Object.fromEntries(dimensions.map(d => [d.id, Math.round(d.initialScore) || 3]))
  )

  // 代价快照：用用户亲手打的分算，不读写库后的 currentScore（口径稳定，不受写入时机影响）
  const impression = useMemo(
    () => composeFirstImpression(dimensions, scores),
    [dimensions, scores],
  )

  // 首启明信片（v3.4 A4，子曰拍板「明信片需要」）——
  // 折中方案：这张只画花 + 那句代价快照，**不画光带占比**。
  // 第一天他一条记录都没有，占比是空的；画出来就是编的。
  const bloomHost = useRef<HTMLDivElement>(null)
  const [postcard, setPostcard] = useState<string | null>(null)

  const makePostcard = () => {
    const canvas = bloomHost.current?.querySelector('canvas')
    if (!canvas) return
    const styles = getComputedStyle(document.documentElement)
    setPostcard(renderPostcard(
      {
        dimensions,
        actions,
        flowerCanvas: canvas,
        title: '花开的第一天',
        since: Date.now(),
        quote: impression[0],
        showShares: false,
      },
      {
        bg: styles.getPropertyValue('--bg-primary').trim() || '#0d0d0d',
        text: styles.getPropertyValue('--text-primary').trim() || '#e8e3d8',
        muted: styles.getPropertyValue('--text-muted').trim() || '#8b8271',
        accent: styles.getPropertyValue('--accent').trim() || '#c9a96e',
      },
    ))
  }

  const handleBloom = async () => {
    if (saving) return
    setSaving(true)
    try {
      await completeOnboarding(scores)
      setAct(2) // 完成写入后进「花开了」，收尾由本组件负责
    } finally {
      setSaving(false)
    }
  }

  const close = () => setOnboardingOpen(false)

  return (
    <div
      className="fixed inset-0 z-[70] overflow-y-auto"
      data-testid="onboarding"
      style={{ background: 'var(--bg-primary)' }}
    >
      {/*
        v3.7：窄屏收口。原来是 `items-center p-8` ——
        在 390px 的手机上左右各吃掉 32px，而第二幕内容本来就高（八条滑块 + 花 + 按钮），
        垂直居中会让顶部标题被切掉。窄屏改**顶对齐 + 小内边距**，宽屏保持原样。
      */}
      <div className="min-h-full flex items-start sm:items-center justify-center p-4 py-8 sm:p-8">
        {/* 打分幕要并排放花，比其余两幕宽 */}
        <div
          className={`w-full animate-fade-in ${act === 1 ? 'max-w-4xl' : 'max-w-xl'}`}
          key={act}
        >

          {act === 0 && (
            <div className="text-center space-y-6">
              <div className="flex justify-center"><FlowerLogo size={56} /></div>
              {/* 窄屏收一档：0.2em 字距 + 30px 在 390px 上会顶到两边边缘 */}
              <h1 className="text-2xl sm:text-3xl font-light tracking-[0.16em] sm:tracking-[0.2em]">生命之花</h1>
              <p className="text-sm sm:text-base text-[var(--text-secondary)] leading-loose">
                这里不是一张考核表，<br />是一座只属于你的花园。
              </p>
              <p className="text-sm text-[var(--text-muted)] leading-loose max-w-md mx-auto">
                「正因为你为你的玫瑰花费了时间，<br />才使你的玫瑰变得如此重要。」
                <span className="block mt-1 opacity-70">—— 《小王子》</span>
              </p>
              <div className="flex items-center justify-center gap-3 pt-2">
                <button className="btn btn-ghost text-sm" onClick={() => skipOnboarding()}>
                  先逛逛
                </button>
                <button className="btn btn-primary" onClick={() => setAct(1)}>
                  走进花园 →
                </button>
              </div>
            </div>
          )}

          {act === 1 && (
            <div className="space-y-5" data-testid="onboarding-scoring">
              <div className="text-center">
                <h2 className="text-xl sm:text-2xl font-light tracking-wide mb-2">此刻的花</h2>
                <p className="text-sm text-[var(--text-muted)] leading-relaxed">
                  现在的你，觉得每片花瓣舒展到哪里了？<br />凭直觉就好——没有对错，之后随时可以改。
                </p>
              </div>

              {/*
                左打分 · 右实时花形。每滑一格，那片花瓣当场伸缩——
                自己看见的东西不会被反驳（小露 R1 的完整形态）。

                🔴 v3.7 窄屏修的是一个**比样式更实质的问题**：
                  这一幕的全部意义是「你一边滑，一边看见花在动」。
                  而单列塌下来之后花被排到列表**下面** ——
                  用户滑滑块时花在屏幕外，**那一幕就只剩八条滑块，等于变回了一张问卷**。
                  ⇒ 所以窄屏下把花**提到列表前面并吸顶**（`order` + `sticky`），
                    列表在它下面滚。宽屏仍是左列表右花（花吸顶不变）。
              */}
              <div className="flex flex-col md:grid gap-4 md:gap-6 md:grid-cols-[1fr_auto] md:items-start">
                <div className="space-y-3 order-2 md:order-1 max-h-[42vh] md:max-h-[52vh] overflow-y-auto pr-1">
                  {dimensions.map(d => (
                    <div key={d.id} className="space-y-1">
                      <div className="text-xs text-[var(--text-muted)] leading-relaxed pl-0.5">
                        {DIMENSION_INTROS[d.name] ?? '你亲手种下的一片花瓣'}
                      </div>
                      <PetalScoreRow
                        dimension={d}
                        value={scores[d.id] ?? 3}
                        onChange={n => setScores(s => ({ ...s, [d.id]: n }))}
                        testId="onboarding-score-row"
                      />
                    </div>
                  ))}
                </div>
                {/* 窄屏：order-1 排到列表之前 + sticky 吸顶，滑动时始终在视野里 */}
                <div className="flex justify-center order-1 md:order-2 sticky top-0 md:top-0 z-10 py-1"
                     style={{ background: 'var(--bg-primary)' }}>
                  <FlowerChart
                    dimensions={dimensions}
                    actions={actions}
                    size={onbFlower}
                    scoreOverride={scores}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <button className="btn btn-ghost text-sm" onClick={() => setAct(0)}>← 上一步</button>
                <button className="btn btn-primary" disabled={saving} onClick={handleBloom} data-testid="onboarding-bloom">
                  {saving ? '花正在开…' : '让花开 →'}
                </button>
              </div>
            </div>
          )}

          {act === 2 && (
            <div className="text-center space-y-6">
              <h2 className="text-xl sm:text-2xl font-light tracking-wide">花开了</h2>
              <div ref={bloomHost} className="flex justify-center animate-bloom">
                <FlowerChart dimensions={dimensions} actions={actions} size={onbFlower} />
              </div>

              {/* 第一份代价快照：核心价值在第 1 天兑现。
                  事实 + 归因 + 一个不必回答的问题，不褒不贬（Lisa 定的口径） */}
              {impression.length > 0 && (
                <div
                  className="max-w-md mx-auto space-y-2 text-left"
                  data-testid="first-impression"
                >
                  {impression.map((line, i) => (
                    <p
                      key={i}
                      className={
                        i === 0
                          ? 'text-base text-[var(--text-primary)] leading-loose'
                          : 'text-sm text-[var(--text-secondary)] leading-loose'
                      }
                    >
                      {line}
                    </p>
                  ))}
                </div>
              )}

              <div className="text-sm text-[var(--text-secondary)] space-y-2 max-w-md mx-auto text-left leading-relaxed">
                <p>🌱 想记点什么：<b>⌘⇧L</b> 或点「+ 快速记录」，选一片花瓣，回车就好</p>
                <p>🌿 每周想回望：左边的「省 · 回顾反思」里有引导问题，答一个就够</p>
                <p>🌸 想换个气氛：设置里有三座花园——暗夜、茶室、花间</p>
              </div>
              {/* 明信片：想留就留，不留也走得掉。不是任务，是纪念品 */}
              <div className="space-y-3" data-testid="onboarding-postcard">
                {postcard ? (
                  <>
                    <img
                      src={postcard}
                      alt="花开第一天的明信片"
                      data-testid="onboarding-postcard-image"
                      className="w-40 mx-auto rounded-lg"
                      style={{ boxShadow: 'var(--card-shadow)' }}
                    />
                    <a
                      className="btn btn-ghost text-sm"
                      href={postcard}
                      download="life-flower-day-1.png"
                      data-testid="onboarding-postcard-save"
                    >
                      保存这张明信片
                    </a>
                  </>
                ) : (
                  <button
                    className="btn btn-ghost text-sm"
                    onClick={makePostcard}
                    data-testid="onboarding-postcard-make"
                  >
                    把这朵花留成一张明信片
                  </button>
                )}
              </div>

              <p className="text-xs text-[var(--text-muted)]">
                想深入了解这座花园，随时翻侧栏的「花语手册」
              </p>
              <div className="flex items-center justify-center gap-3">
                <button className="btn btn-ghost text-sm" onClick={close}>
                  走进花园
                </button>
                <button
                  className="btn btn-primary"
                  onClick={() => { close(); setQuickAddOpen(true) }}
                >
                  记下今天的一件小事
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
