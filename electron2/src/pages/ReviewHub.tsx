import { Link } from 'react-router-dom'
import { useStore } from '../stores/useStore'
import { SubPageHeader } from '../components/SubPageHeader'

/**
 * 「我的复盘」入口页（v3.7 B6）——「点进去可以看到自己每周每月每年的复盘情况，
 * 历史回顾放一个单独的入口，月回顾和年回顾也是，默认只显示当前周月年度的」。
 *
 * ============ 这一版最重要的一处认错 ============
 * 我给圆桌的底稿写着「月回顾与年回顾都不存在，B6 是新建两个层级」。**这是错的**，
 * Lisa 实读代码纠正：`Review.tsx` 早就有 `useState<'week'|'month'|'year'>`，
 * 三个 tab 早就叫「周回顾/月回顾/年回顾」，三种都已落库，历史回顾也已实现，
 * `reviewQuestions.ts` 更是早就按三池各六题分好了。
 *
 * ⇒ **所以 B6 不是新建，是拆入口。** 而这个纠正把风险位置整个挪了：
 *   **风险不在「要设计什么问题」，在「已经写好的问题里有哪几句是刀」**——
 *   那两池从来没有独立入口，等于**从未被真正打开过、从未被检验过**。
 *   两人各筛一遍，共换掉 8 题（见 `reviewQuestions.ts` 顶部）。
 *
 * ============ 为什么拆成入口而不是留一排 tab ============
 * 一排 tab 把三个尺度摆成同级可比的三个选项，于是用户会横着扫一遍再选。
 * 但这三件事的**发生频率差两个数量级**（每周一次 / 每月一次 / 每年一次），
 * 摆成同级会让年回顾看起来像一个"我今天也该看看"的东西 —— 那是催办的前身。
 * 拆成三行入口之后，它们只是三扇门，各自在自己的时候被推开。
 *
 * 🔴 **年入口不带任何「新」标记或圆点**（Lisa）：年回顾对新用户是空的，
 *   任何标记都会诱导他去点开一个只会告诉他「还没有」的地方。
 *   **产品不能引导用户去看自己的空。**
 */

const ENTRIES = [
  { to: '/review/week', label: '这一周', hint: '光去了哪' },
  { to: '/review/month', label: '这个月', hint: '这是你要的分法吗' },
  // 年那一行的副文本刻意不写「这一年过得怎么样」——
  //   那正是 Lisa 判死的那种开放式总结问句，写在入口上等于先把判决书递过去
  { to: '/review/year', label: '这一年', hint: '你的光给了谁，从哪儿拿来的' },
]

export function ReviewHub() {
  const reviews = useStore(s => s.reviews)

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="page-pad space-y-4">
        <SubPageHeader
          title="我的复盘"
          subtitle="记录是攒证据，这里是把账摊开看一眼"
          fallback="/garden"
        />

        <div className="card space-y-1" data-testid="review-entries">
          {ENTRIES.map(e => (
            <Link key={e.to} to={e.to} className="drawer-link" data-testid={`review-link-${e.to.split('/').pop()}`}>
              <span>{e.label}</span>
              <span className="drawer-hint">{e.hint} ›</span>
            </Link>
          ))}
        </div>

        {/* 历史回顾：子曰要它「放一个单独的入口」。
            它此前是当期页最底下的一张卡 —— 那个位置有个具体的坏处：
            用户每次写完这一周的思考，往下一滚就看见自己过去十条，
            于是**每一次复盘都自动附赠一次自我审阅**。拆出去之后，翻旧账是他主动的选择。 */}
        <Link to="/review/history" className="drawer-link" data-testid="link-review-history">
          <span>历史回顾</span>
          <span className="drawer-hint">
            {reviews.length > 0 ? `已经写下 ${reviews.length} 篇 ›` : '还没有写下的 ›'}
          </span>
        </Link>
      </div>
    </div>
  )
}
