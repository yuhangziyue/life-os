import type { Dimension } from '../models/dimension'
import { scoreStage } from '../engine/scoring'

/**
 * 花瓣打分行 —— 首启引导第三幕与季度会谈第二幕**共用同一套组件**
 * （设计稿 §2.3：两处共用，下期开发省一份工；小露 R4：滑块是表单，花瓣才是这个产品的语言）。
 *
 * 十颗花瓣色圆点，点到哪儿算哪儿：没有滑块、没有数字输入框、没有"确认"二字。
 */

interface Props {
  dimension: Dimension
  value: number
  onChange: (score: number) => void
  /** 打分行右侧显示状态词（萌芽/舒展/盛放…），会谈第二幕聚光模式下不显示 */
  showStage?: boolean
  /** 调用方各自的测试锚点（引导用 onboarding-score-row，会谈用 quarterly-score-row） */
  testId?: string
}

/**
 * 🔴 这一行为什么会溢出边框（子曰实拍点名：「最后的舒展部分已经超出边框了」）
 *
 * 原来三段全是**写死的宽度**：
 *   名字 `w-16`（64px）+ 十颗点（10×17 + 9×4 = 206px）+ 状态词 `w-10`（40px）
 *   + 两处 `gap-3`（24px）+ 卡片左右内距（32px）= **366px**
 * 而 390px 的手机减掉浮层内距只剩 ~358px ⇒ **超 8px，最右那一格被顶出去**。
 * 选中那颗还带 `scale(1.25)`，又往外顶一点。
 *
 * 我上一版只把状态词从 `w-8` 加宽到 `w-10` —— 那是把溢出**加重**了 8px，
 * 只是恰好换了个溢出的方向（从竖排变成出框）。
 * **写死的三段加起来超过容器，加宽任何一段都不可能解决。**
 *
 * ⇒ 让中间那段**随视口收缩**（`clamp`），并且保持圆形：
 *   390px 上点径 ~13px、间距 ~3px ⇒ 十颗合计 ~161px，整行 ~313px，留有余量；
 *   宽屏上回到原来的 17px。
 * 这样任何瓣数、任何屏宽都不会溢出 —— 不再靠"凑一组刚好的像素"。
 */
export function PetalScoreRow({ dimension, value, onChange, showStage = true, testId }: Props) {
  return (
    <div className="card py-3 px-3 sm:px-4 flex items-center gap-2 sm:gap-3" data-testid={testId ?? 'petal-score-row'}>
      {/* 名字也跟着收一档：窄屏 56px 够放四个字（最长的花瓣名是四字） */}
      <span className="text-sm w-14 sm:w-16 flex-shrink-0 truncate">{dimension.name}</span>
      <div className="psr-dots">
        {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
          <button
            key={n}
            aria-label={`${dimension.name} ${n} 分`}
            className="psr-dot"
            style={{
              backgroundColor: n <= value ? dimension.colorHex : 'var(--bg-hover)',
              opacity: n <= value ? 0.45 + (n / 10) * 0.55 : 1,
              transform: n === value ? 'scale(1.25)' : 'scale(1)',
            }}
            onClick={() => onChange(n)}
          />
        ))}
      </div>
      {showStage && (
        <span className="text-xs text-[var(--text-muted)] text-right whitespace-nowrap flex-shrink-0">
          {scoreStage(value)}
        </span>
      )}
    </div>
  )
}
