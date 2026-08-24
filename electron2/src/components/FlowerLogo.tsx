/**
 * 生命之花 · 花瓣 Logo（纯 SVG，跟随主题 accent 色）。
 * 八片花瓣对应八个维度；用在侧边栏左上角与今后一切需要标识的地方。
 */
export function FlowerLogo({ size = 22 }: { size?: number }) {
  const petals = Array.from({ length: 8 }, (_, i) => i * 45)
  return (
    <svg
      width={size}
      height={size}
      viewBox="-30 -30 60 60"
      aria-label="生命之花"
      style={{ flexShrink: 0 }}
    >
      {petals.map(deg => (
        <path
          key={deg}
          d="M0,0 C7,-9 20,-10 26,0 C20,10 7,9 0,0"
          transform={`rotate(${deg})`}
          fill="var(--accent)"
          opacity={0.45}
          stroke="var(--accent)"
          strokeOpacity={0.75}
          strokeWidth={1}
        />
      ))}
      <circle r="4.2" fill="var(--accent)" />
      <circle r="1.6" fill="var(--accent-contrast)" opacity={0.8} />
    </svg>
  )
}
