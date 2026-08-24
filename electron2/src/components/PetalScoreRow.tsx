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

export function PetalScoreRow({ dimension, value, onChange, showStage = true, testId }: Props) {
  return (
    <div className="card py-3 px-4 flex items-center gap-3" data-testid={testId ?? 'petal-score-row'}>
      <span className="text-sm w-16 flex-shrink-0">{dimension.name}</span>
      <div className="flex-1 flex items-center gap-1">
        {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
          <button
            key={n}
            aria-label={`${dimension.name} ${n} 分`}
            className="rounded-full transition-all"
            style={{
              width: 17, height: 17,
              backgroundColor: n <= value ? dimension.colorHex : 'var(--bg-hover)',
              opacity: n <= value ? 0.45 + (n / 10) * 0.55 : 1,
              transform: n === value ? 'scale(1.25)' : 'scale(1)',
            }}
            onClick={() => onChange(n)}
          />
        ))}
      </div>
      {showStage && (
        <span className="text-xs text-[var(--text-muted)] w-8 text-right">{scoreStage(value)}</span>
      )}
    </div>
  )
}
