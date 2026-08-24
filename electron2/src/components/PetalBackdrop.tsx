import { FlowerLogo } from './FlowerLogo'

/**
 * 主题页氛围底纹（2026-08-18 子曰点名）——
 * 每个主页面背后一朵符合当前主题的淡色半透明花瓣。
 * 复用 FlowerLogo 的 SVG（花瓣用 var(--accent)），切主题自动换色；
 * 纯装饰：pointer-events 关闭、aria-hidden、透明度按主题微调（见 globals.css）。
 */
export function PetalBackdrop() {
  return (
    <div className="petal-backdrop" aria-hidden="true">
      <div style={{ position: 'absolute', right: -150, bottom: -170, transform: 'rotate(15deg)' }}>
        <FlowerLogo size={640} />
      </div>
      <div style={{ position: 'absolute', left: -90, top: 60, transform: 'rotate(-12deg)' }}>
        <FlowerLogo size={300} />
      </div>
    </div>
  )
}
