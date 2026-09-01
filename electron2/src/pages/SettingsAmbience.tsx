import { useStore } from '../stores/useStore'
import { SubPageHeader } from '../components/SubPageHeader'

/**
 * 氛围（v3.7 C5）—— 子曰原话「氛围也是改为 listitem 然后打开新页面查看具体设置」。
 *
 * 三个开关都是「动效三原则」第三条（**一律可关**）的落地。搬到子页之后有一处得补：
 * 主列表那一行的副文本必须**说清这里面有什么**（「动效的快慢、光带、深夜静音」），
 * 因为「氛围」这个词本身不说明任何事 —— 一个不说明内容的入口，用户只会点一次。
 */
export function SettingsAmbience() {
  const ambience = useStore(s => s.ambience)
  const setAmbience = useStore(s => s.setAmbience)
  const setOnboardingOpen = useStore(s => s.setOnboardingOpen)

  const rows = [
    {
      key: 'cursor' as const,
      name: '主题化鼠标指针',
      desc: '花瓣形状的指针，随主题换装；关闭后使用系统指针',
      testid: 'toggle-cursor',
    },
    {
      key: 'trail' as const,
      name: '花瓣拖尾',
      desc: '指针划过时洒落几片花瓣——暗夜会发光，茶室落桂瓣，花间是樱吹雪',
      testid: 'toggle-trail',
    },
    {
      key: 'motion' as const,
      name: '页面过渡与光效',
      desc: '换页时的淡入、以及记一笔之后那一屏的动画。关掉之后只留文字与终态',
      testid: 'toggle-motion',
    },
  ]

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="page-pad space-y-4">
        <SubPageHeader title="氛围" fallback="/settings" />

        <div className="card space-y-4" data-testid="ambience-section">
          {rows.map(r => (
            <label key={r.key} className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm">{r.name}</div>
                <div className="text-xs text-[var(--text-muted)] mt-0.5 leading-relaxed">{r.desc}</div>
              </div>
              <input
                type="checkbox"
                className="w-4 h-4 flex-shrink-0"
                checked={ambience[r.key]}
                onChange={e => setAmbience({ [r.key]: e.target.checked })}
                data-testid={r.testid}
              />
            </label>
          ))}
        </div>

        {/*
          深夜静音这一条**刻意不做成开关**，只在这里说清它是常在的。
          做成开关就意味着它可以被关掉，而它是一条红线（深夜是只减不加的时段）——
          **把红线做成偏好项，等于承认它可以被交易。**
        */}
        <div className="card space-y-2" data-testid="night-rule">
          <h2 className="text-sm font-medium text-[var(--text-secondary)]">深夜与心情不好的日子</h2>
          <p className="text-xs text-[var(--text-muted)] leading-relaxed">
            22:00 之后、以及你记下的心情不太好的那些天，产品不说观察，也不播任何一屏动画。
            这一条没有开关 —— 它不是偏好，是这个软件对你的分寸。
          </p>
        </div>

        <div className="card space-y-2">
          <button
            className="btn btn-ghost text-sm"
            onClick={() => setOnboardingOpen(true)}
            data-testid="replay-onboarding"
          >
            重看初见引导
          </button>
          <p className="text-xs text-[var(--text-muted)] leading-relaxed">
            重新走一遍第一次打开时的引导，也可以顺手重新打一遍初始分
          </p>
        </div>
      </div>
    </div>
  )
}
