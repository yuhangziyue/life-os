import { useMemo } from 'react'
import { useStore, useEnabledDimensions, useCompanionDays } from '../stores/useStore'
import { composeGlance } from '../engine/impression'
import { isNight, isRoughDay, hasSampleFloor } from '../engine/ahaGate'

/**
 * 同句冷却的会话内记忆。**刻意不落库**：
 * 写一条 settings 就意味着「这句话出现过」变成了一个可被追踪的事件，
 * 而那正是我们刚从卡片形态里赶走的东西（容器的出现变成事件 ⇒ 奖励结构）。
 * 代价是冷却只在同一次会话内生效 —— 可接受，换来的是**图注零副作用**。
 */
let lastShown: { text: string; at: number } | null = null

/**
 * 光带图注（v3.7 A1）—— 取代原来那张 `DailyGlance` 卡片。
 *
 * ============ 为什么是一行图注，不是一张卡 ============
 * 子曰要「今天 tab 第二个卡片的内容可以不要」。四人裁决是**拆容器，不删内容**。
 *
 * 书香的诊断：**「它不是产品的声音，是产品在清嗓子。」**
 * Lisa 第四轮**否决了她自己上一轮的方案**（加四道闸门保留卡片），推理如下：
 *   加闸后这张卡大部分日子是空的，而**空卡藏不藏两条路都死**——
 *   藏起来，卡片的出现本身成了信号（"今天产品有话说"），
 *   **容器的出现变成事件**，套小艾的检测器就是奖励；不藏，屏上永久多一块空占位。
 *   **⇒ 稀疏 + 有容器 = 奖励结构。**
 *
 * 而彻底删也不对：那条分界只要求"产品说过"，**不要求"产品每天说一句"**。
 *
 * ⇒ 所以降级为**图注**。它与卡片的决定性差别，就是「声音」与「清嗓子」的分界线：
 *   **注解没有容器。它空着的时候什么都不发生，没有位置在等话。**
 *   小艾的检测器自动通过 —— 没出现的话用户根本不知道它本来会出现，
 *   因为那里从来没有一个框。
 *
 * 挂在光带下面而不是别处，也有具体理由：光带是**已经在陈述事实**的元件
 * （今天的光给了谁）。一句观察接在它自己的图下面，是**给图配一句注解**，
 * 不是产品另起一段对你讲话。
 *
 * 🔴 四条静音全部复用现成判据，不新写：
 *   深夜（`isNight`）· 坏日子（`isRoughDay`）· 样本地板（`hasSampleFloor`）· 同句 7 天冷却。
 *   其中**坏日子静音是在补一个真 bug**：原来那张卡没有它，
 *   于是「这是你想要的分法吗？」会在 `mood: vexed` 的日子里照念。
 */
export function BandCaption() {
  const dimensions = useEnabledDimensions()
  const actions = useStore(s => s.actions)
  const companionDays = useCompanionDays()

  const glance = useMemo(() => {
    const now = Date.now()
    const out = composeGlance({
      dimensions,
      actions,
      companionDays,
      now,
      silentNight: isNight(now),
      silentRoughDay: isRoughDay(actions, now),
      floorOk: hasSampleFloor(dimensions, actions, now),
      lastText: lastShown?.text,
      lastAt: lastShown?.at,
    })
    if (out) lastShown = { text: out.text, at: now }
    return out
  }, [dimensions, actions, companionDays])

  // 🔴 无句可说 ⇒ 整个不渲染，光带卡片的高度自然收缩。
  //   这里绝不能返回一个空的 <p> 或占位高度 —— 那就把"没有容器"又变回了有容器。
  if (!glance) return null

  return (
    <p
      className="text-[13px] text-[var(--text-muted)] leading-relaxed mt-2 px-0.5 truncate"
      data-testid="band-caption"
      data-kind={glance.kind}
      title={glance.text}
    >
      {glance.text}
    </p>
  )
}
