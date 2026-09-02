import { useMemo, useRef, useState } from 'react'
import { useStore, useEnabledDimensions } from '../stores/useStore'
import { composeFirstImpression } from '../engine/impression'
import { renderPostcard } from '../services/postcard'
import { FlowerChart } from './FlowerChart'
import { FlowerLogo } from './FlowerLogo'
import { PetalScoreRow } from './PetalScoreRow'
import { useFlowerSize } from '../hooks/useFlowerSize'
import { Overlay } from './Overlay'

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
  /**
   * 第二幕内部的分步（v3.7）。子曰：「如果一页放不下 分多页多个步骤介绍完」。
   *
   * 八条滑块 + 一朵花 + 标题 + 按钮在 390×844 上放不下，
   * 上一版靠「顶对齐 + 内层 42vh 滚动条」硬塞 —— 那让这一幕变成了一张要滚的表单，
   * 而**表单是要横向比较着填的东西**，正好是这产品最不要的动作。
   *
   * 每步三片：三条滑块 + 花 + 按钮刚好一屏，且**一次只面对三片**，
   * 与 C7 单片设置页同一条思路（一次露得少，就不会想着调平）。
   */
  const [step, setStep] = useState(0)
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

  /**
   * 🔴 明信片为什么需要一份「冻住的花」（v3.7 拆幕之后引入的 bug，实测抓到）
   *
   * 拆幕之前，明信片按钮与那朵花在同一屏，`bloomHost.current` 直接就有 canvas。
   * 拆成两步之后，花在第 0 步、按钮在第 1 步 ——
   * **第 1 步渲染时第 0 步已经卸载，`bloomHost.current` 是 null，
   *   `makePostcard` 撞上 early return，明信片静默地生成不出来。**
   * 实测症状是 `made: false`，而界面上什么都不说 —— 点了没反应。
   *
   * 修法不是把按钮搬回去（那样第 0 步又会太挤），而是**在离开第 0 步时把那一帧冻住**。
   * 这在语义上也更对：明信片记的是「花开那一刻的那朵花」，
   * 而不是「你翻到第二页时它长什么样」—— 冻帧才是这张明信片的本义。
   */
  const frozenFlower = useRef<HTMLCanvasElement | null>(null)
  const freezeFlower = () => {
    const live = bloomHost.current?.querySelector('canvas')
    if (!live) return
    const copy = document.createElement('canvas')
    copy.width = live.width
    copy.height = live.height
    copy.getContext('2d')?.drawImage(live, 0, 0)
    frozenFlower.current = copy
  }

  const makePostcard = () => {
    // 先用冻住的那一帧；同屏还在时（宽屏或将来改回一屏）退回实时 canvas
    const canvas = frozenFlower.current ?? bloomHost.current?.querySelector('canvas')
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
      // 🔴 step 必须归零：第二幕最后一步的 step 是 2，
      //   不清掉就会直接跳过「花开了」那一屏 —— 而那一屏是整个引导的情绪落点
      setStep(0)
      setAct(2) // 完成写入后进「花开了」，收尾由本组件负责
    } finally {
      setSaving(false)
    }
  }

  const close = () => setOnboardingOpen(false)

  /** 每步露几片。三片是「一屏放得下」与「翻太多次」之间的那个点 */
  const PETALS_PER_STEP = 3
  const stepCount = Math.max(1, Math.ceil(dimensions.length / PETALS_PER_STEP))
  const stepPetals = dimensions.slice(step * PETALS_PER_STEP, (step + 1) * PETALS_PER_STEP)
  const isLastStep = step >= stepCount - 1

  // v3.7：portal 到 body —— 祖先上任何 transform/filter/will-change 都会把
  //   `position: fixed` 捕获成相对该祖先定位（见 Overlay.tsx）
  return (
    <Overlay>
    <div
      className="fixed inset-0 z-[70] overflow-y-auto"
      data-testid="onboarding"
      style={{ background: 'var(--bg-primary)' }}
    >
      {/*
        v3.7 二改（子曰口径：「引导页的内容多少要适中，垂直居中，
        如果一页放不下 分多页多个步骤介绍完」）。
        
        我上一版改成了**顶对齐**，那是在用对齐方式去容纳过高的内容 ——
        治的是症状。正确的做法是**让每一步的内容本来就放得下**：
        第二幕的八条滑块拆成每步三片（见下方 PETALS_PER_STEP），
        于是每一步都不超过一屏，可以老老实实垂直居中。
        内边距在窄屏收到 1rem —— 32px 在 390px 上占掉整宽的六分之一。
      */}
      <div className="min-h-full flex items-center justify-center p-4 sm:p-8">
        {/* 打分幕要并排放花，比其余两幕宽 */}
        <div
          /* 第二幕原来是 max-w-4xl（为了并排放八条滑块 + 花）。
             拆成每步三片之后不需要那么宽了 —— 三条滑块 + 一朵花，max-w-2xl 就够。
             宽度收窄的连带好处：宽屏上这一幕不再像一张后台表单。 */
          className={`w-full animate-fade-in ${act === 1 ? 'max-w-2xl' : 'max-w-xl'}`}
          key={`${act}-${step}`}
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

                🔴 两处窄屏修正，第二处是子曰第二次点名之后改的：
                  ① 这一幕的全部意义是「你一边滑，一边看见花在动」。
                     单列塌下来之后花被排到列表**下面** ——
                     滑滑块时花在屏幕外，**那一幕就只剩八条滑块，等于变回了一张问卷**。
                     ⇒ 窄屏把花**提到列表前面**（`order`），宽屏仍是左列表右花。
                  ② 上一版给列表套了 `max-h-[42vh] overflow-y-auto`，
                     那是**用内层滚动条去容纳过高的内容** —— 治的是症状，
                     而且它让这一幕变成一张要滚的表单，
                     **表单是要横向比较着填的东西**，正好是这产品最不要的动作。
                     ⇒ 改成**每步三片**：每一步都放得下，于是整屏可以老老实实垂直居中，
                       内层没有滚动条，一次也只面对三片（与 C7 单片页同一条思路）。
              */}
              <div className="flex flex-col md:grid gap-4 md:gap-6 md:grid-cols-[1fr_auto] md:items-start">
                <div className="space-y-3 order-2 md:order-1">
                  {stepPetals.map(d => (
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
                {/* 窄屏：order-1 排到列表之前，滑动时花始终在视野里 */}
                <div className="flex justify-center order-1 md:order-2">
                  <FlowerChart
                    dimensions={dimensions}
                    actions={actions}
                    size={onbFlower}
                    scoreOverride={scores}
                  />
                </div>
              </div>

              {/* 分步指示：只画点，不写「3/8」——
                  写成分数就是进度条，而这一幕本来就允许你随便滑、之后随时改。
                  点的作用只是让人知道「还有几屏」，不是让人追进度。 */}
              {act === 1 && stepCount > 1 && (
                <div className="flex items-center justify-center gap-1.5" data-testid="onboarding-steps">
                  {Array.from({ length: stepCount }, (_, i) => (
                    <span
                      key={i}
                      className="rounded-full transition-all"
                      style={{
                        width: i === step ? 14 : 5, height: 5,
                        background: i === step ? 'var(--accent)' : 'var(--border-strong)',
                      }}
                    />
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between gap-3">
                <button
                  className="btn btn-ghost text-sm"
                  onClick={() => (step > 0 ? setStep(step - 1) : setAct(0))}
                >
                  ← 上一步
                </button>
                {isLastStep ? (
                  <button className="btn btn-primary" disabled={saving} onClick={handleBloom} data-testid="onboarding-bloom">
                    {saving ? '花正在开…' : '让花开 →'}
                  </button>
                ) : (
                  <button
                    className="btn btn-primary"
                    onClick={() => setStep(step + 1)}
                    data-testid="onboarding-step-next"
                  >
                    接着看 →
                  </button>
                )}
              </div>
            </div>
          )}

          {/*
            第三幕也分两步（v3.7 二改，子曰点名「花开了 内容还是比较多 一屏放不下」）。

            原来这一幕堆了六块：标题 / 花 / 代价快照三行 / 三条操作说明 / 明信片 / 收尾按钮。
            拆法不是随便对半切，是按**这一幕的两件事**切：
              第 0 步 = 那个瞬间（花开 + 第一份代价快照）—— 这是整个引导的情绪落点，
                       它该独占一屏，旁边不要有操作说明抢戏
              第 1 步 = 接下来怎么用（三条 + 明信片 + 出口）
            **把"感受"和"说明"塞进同一屏，感受一定输。**
          */}
          {act === 2 && step === 0 && (
            <div className="text-center space-y-6" data-testid="onboarding-bloom-act">
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

              <div className="flex items-center justify-center">
                <button
                  className="btn btn-primary"
                  /* 离开这一屏之前把花冻成一帧 —— 明信片要用它（见 makePostcard 注释） */
                  onClick={() => { freezeFlower(); setStep(1) }}
                  data-testid="onboarding-bloom-next"
                >
                  接着看 →
                </button>
              </div>
            </div>
          )}

          {act === 2 && step > 0 && (
            <div className="text-center space-y-6" data-testid="onboarding-howto">
              <h2 className="text-xl sm:text-2xl font-light tracking-wide">接下来</h2>

              {/*
                🔴 这三条原来指向的 UI **已经不存在了**：
                  「点「+ 快速记录」」⇒ v3.7 D1 已改为右下角那个「记」
                  「左边的『省 · 回顾反思』」⇒ v3.6 **侧栏整个删掉了**，
                     而且那一栏现在叫「我的复盘」，在「我的花园」里
                  ⇒ 一份教用户去点不存在的东西的说明书，比没有说明书更坏：
                    它让用户以为是自己找不到。
                照当前形态重写，并且**只说三件他这一分钟真的会做的事**。
              */}
              <div className="text-sm text-[var(--text-secondary)] space-y-2.5 max-w-md mx-auto text-left leading-relaxed">
                <p>🌱 想记一笔：点右下角那个「<b>记</b>」，选一片花瓣，写一句就好</p>
                <p>🌿 想回望：「我的花园 → 我的复盘」，那里有引导问题，答一个就够</p>
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

              {/* 🔴 「侧栏」在 v3.6 就删了，「花语手册」现在叫「花语」、
                  在「设置 → 关于」里（C6）。指错路的说明比没有说明更坏。 */}
              <p className="text-xs text-[var(--text-muted)]">
                想多了解这座花园，「设置 → 关于」里有一份花语
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
    </Overlay>
  )
}
