import { useMemo, useState } from 'react'
import type { Action } from '../models/action'
import type { Dimension } from '../models/dimension'

/**
 * 一周的光（v3.7 B1）—— 子曰原话「第一个卡片默认按照一个周的维度，
 * 展示每一天不同花瓣的投入占比情况，**一天是一个竖着的长方形**」。
 *
 * ============ 窗口之争：这是第六轮最尖锐的一处技术分歧 ============
 * 小露要**滚动七天**：「做成周一到周日的话，每个周一早上这张卡是 1/7 满，
 *   那就是一根每周清零重来的进度条。」
 * 小艾要**固定日历周**：「滑窗永远满 7 列、永不归零，会制造『连续』的错觉；
 *   **归零是反进度条的**。」
 * —— 两人用**同一个"进度条"理由**得出了相反结论。
 *
 * Lisa 先判给小露，理由是一条新判据：
 *   **压力不来自"满或空"，来自归零这件事是不是用户干的。**
 *   固定日历周那张空图，用户找不到任何自己的行为来解释它。
 *   他周日明明记了三笔，图上没了 —— 这是"我的东西被系统清了"。
 *
 * 小艾没有反驳，而是**改掉了默认视图**，把她的论证接住了：
 *   **周一默认停在上一周那一页，直到他记下今天第一笔，图才翻页。**
 *   归零从此由他的动作触发，不是系统的日历。
 * 并给了决定性论据：
 *   **固定日历周产生「页」；滚动七天产生「传送带」。**
 *   页可以被翻回、被比较、被结算；传送带上的东西会掉下去。
 *   而月结、季结、84 天那场会谈**全部建立在"期"上 —— 证据不能有保质期**。
 *
 * Lisa 第四轮投票接受，并公开认下他抓到她一个双标：
 *   她在「留给自己的一句话」那里要求过期必须有一句收尾（"用户对自己说的话被无声扔掉"是伤害），
 *   却在年轮这里默许了**每天掉落一列、无声、不可召回**。同一个错误，一个地方反对、一个地方主张。
 * 她还替小艾补了一层他没说的：**在这个默认下，"空图"这个状态在用户面前根本不出现。**
 *   周一到记下第一笔之前 = 上周满图；记下第一笔之后 = 新页第一列已有内容。
 *   **空图只存在于逻辑里，不存在于任何一帧屏幕上。**
 *
 * ============ 五条渲染约束，全是在拆「进度条语法」============
 * 1. **未来的日子不画空槽** —— 空槽就是"待填"，**槽本身就是进度条语法**。
 *    改成只有一条 1px 底线 + 日期数字。（小艾自己撤回了他上一轮的"画极淡空槽"）
 * 2. **今天那一列不高亮、不描边、不加指针** —— 一旦"今天"被标出来，
 *    视线就跟着它往右走，**那才是进度条的阅读方向**。七列一律等价。
 * 3. **列高恒定，不随当天 impact 变化** —— 高度一随量走它就是柱状图，多就是好。
 *    恒定之后，**一列只回答"这天的光怎么分的"，不回答"这天的光有多少"**，
 *    正好对上产品的立论：**代价是分配问题，不是产量问题。**
 * 4. **空白日画成极浅空框**（1px 描边、无填充）—— 满图的错觉被破掉，
 *    而这个空白是用户自己的（那天他确实没记），不是日历发的。
 * 5. **翻页不做动画** —— Lisa 给的心理理由可以拿去量以后所有动效：
 *    **凡是产品"给"的都要动画，凡是用户"做"的都不该有。**
 *
 * ============ 两条边界 ============
 * · 停在上一周且本周零记录时，加一行交代。**绝不写"记一笔就翻页"**——那是催办；
 *   翻页会自然发生，用户不需要被教。
 * · **连续两页皆空时整张卡不出现**（Lisa 主动堵的）：断了两周回来的人，
 *   否则会看到一张空的上周图 + 一句"这一周还没有记录"——**双重空白，
 *   而且看起来像产品在展示他的缺席**。他回来了，这件事比图上有什么都重要。
 */

const DAY_MS = 24 * 60 * 60 * 1000
/** 列高恒定。这个数是"分配"的画布高度，不是"产量"的刻度 —— 见约束 3 */
const COL_H = 56
const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']

interface Props {
  dimensions: Dimension[]
  actions: Action[]
}

function startOfDay(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** 那一周的周一零点。周日按 ISO 归到上一周（getDay() 的 0 是周日） */
function startOfWeek(ts: number): number {
  const d = new Date(startOfDay(ts))
  const day = d.getDay() || 7
  d.setDate(d.getDate() - day + 1)
  return d.getTime()
}

export function WeekRings({ dimensions, actions }: Props) {
  const today = startOfDay(Date.now())
  const thisWeek = startOfWeek(today)

  /** 每天每花瓣的权重。只算在册花瓣 —— 休息掉的那片不该把别人的占比压小 */
  const byDay = useMemo(() => {
    const inRoster = new Set(dimensions.map(d => d.id))
    const map = new Map<number, Map<string, number>>()
    for (const a of actions) {
      if (!a.isCompleted || !inRoster.has(a.dimensionId)) continue
      const d = startOfDay(a.date)
      let row = map.get(d)
      if (!row) { row = new Map(); map.set(d, row) }
      row.set(a.dimensionId, (row.get(a.dimensionId) ?? 0) + a.impact)
    }
    return map
  }, [dimensions, actions])

  const daysWithRecord = (weekStart: number) => {
    let n = 0
    for (let i = 0; i < 7; i++) if ((byDay.get(weekStart + i * DAY_MS)?.size ?? 0) > 0) n++
    return n
  }

  const thisWeekHas = daysWithRecord(thisWeek)
  const lastWeekHas = daysWithRecord(thisWeek - 7 * DAY_MS)

  /**
   * 默认停在哪一页 —— 这就是那场争论的解。
   * 本周还没有任何一天有记录 ⇒ 停在上一周（他昨天记的东西还在屏上）。
   * 一旦本周有了第一天记录 ⇒ 翻到本周。**归零由他的动作触发，不是日历。**
   */
  const defaultWeek = thisWeekHas > 0 ? thisWeek : thisWeek - 7 * DAY_MS
  const [weekStart, setWeekStart] = useState(defaultWeek)
  /** 用户手动翻过页之后就不再被默认值拽回来 */
  const [pinned, setPinned] = useState(false)
  const shown = pinned ? weekStart : defaultWeek

  // 🔴 连续两页皆空 ⇒ 整卡不出现（不占位、不留空框）
  if (thisWeekHas === 0 && lastWeekHas === 0) return null

  const isThisWeek = shown === thisWeek
  const isRestingOnLastWeek = !isThisWeek && shown === thisWeek - 7 * DAY_MS && thisWeekHas === 0

  const go = (delta: number) => {
    const next = shown + delta * 7 * DAY_MS
    // 往回不限，往前不越过本周
    if (next > thisWeek) return
    setWeekStart(next)
    setPinned(true)
  }

  const cols = Array.from({ length: 7 }, (_, i) => {
    const day = shown + i * DAY_MS
    const row = byDay.get(day)
    const total = row ? [...row.values()].reduce((s, v) => s + v, 0) : 0
    const segs = row && total > 0
      ? dimensions
          .filter(d => (row.get(d.id) ?? 0) > 0)
          .map(d => ({ id: d.id, colorHex: d.colorHex, share: (row.get(d.id) as number) / total }))
      : []
    return { day, segs, future: day > today, label: new Date(day).getDate() }
  })

  return (
    <div className="card space-y-2" data-testid="week-rings">
      <div className="flex items-baseline justify-between">
        {/* 标题跟着**所显示的那一页**走，不写死「这一周」——
            停在上一周却标着「这一周的光」，是产品在说错话 */}
        <h2 className="text-sm font-medium text-[var(--text-secondary)]" data-testid="week-rings-title">
          {isThisWeek ? '这一周的光' : shown === thisWeek - 7 * DAY_MS ? '上一周的光' : weekLabel(shown)}
        </h2>
        {/* 实拍问题：两个箭头 `‹ ›` 是 12px 的裸字符，既看不出可点、
            也离标题太远（`justify-between` 把它们甩到了最右）。
            改成 28px 的圆形触控目标 —— 28 不到 44 的触控下限，
            但它是**辅助导航**（主路径是看当前这一页），刻意做得不抢眼。 */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            className="week-nav"
            onClick={() => go(-1)}
            data-testid="week-prev"
            aria-label="上一周"
          >
            ‹
          </button>
          <button
            className="week-nav"
            onClick={() => go(1)}
            disabled={isThisWeek}
            data-testid="week-next"
            aria-label="下一周"
          >
            ›
          </button>
        </div>
      </div>

      <div className="week-cols" data-testid="week-cols">
        {cols.map(c => (
          <div className="week-col" key={c.day} data-future={c.future ? '1' : '0'}>
            {/* 🔴 未来的日子**不画空槽**：只有一条 1px 底线。
                空槽就是"待填"，槽本身就是进度条语法（约束 1） */}
            {c.future ? (
              <div className="week-bar is-future" style={{ height: COL_H }} />
            ) : c.segs.length > 0 ? (
              <div className="week-bar" style={{ height: COL_H }}>
                {c.segs.map(s => (
                  <span
                    key={s.id}
                    style={{ backgroundColor: s.colorHex, height: `${s.share * 100}%` }}
                  />
                ))}
              </div>
            ) : (
              /* 空白日：极浅空框，1px 描边、无填充。
                 满图的错觉被破掉，而这个空白是用户自己的（约束 4） */
              <div className="week-bar is-empty" style={{ height: COL_H }} data-testid="week-empty" />
            )}
            {/* 🔴 今天那一列不高亮、不描边、不加指针 —— 七列一律等价（约束 2） */}
            <span className="week-day">{WEEKDAYS[new Date(c.day).getDay() === 0 ? 6 : new Date(c.day).getDay() - 1]}</span>
            <span className="week-date">{c.label}</span>
          </div>
        ))}
      </div>

      {/* 停留态那一行交代。三个成分：① 明说本周零记录，排除"故障"的解读；
          ② 「先看看」标明这是临时停留；③ **绝不写"记一笔就翻页"**——那是催办。
          它在记下第一笔后随页翻走而消失，不换成另一句。 */}
      {isRestingOnLastWeek && (
        <p className="text-[13px] text-[var(--text-muted)] leading-relaxed" data-testid="week-resting">
          这一周还没有记录，先看看上一周。
        </p>
      )}

      <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
        一天一列，列内是那天的光怎么分的。列高一样 —— 这里不比多少，只看去处。
      </p>
    </div>
  )
}

function weekLabel(weekStart: number): string {
  const s = new Date(weekStart)
  const e = new Date(weekStart + 6 * DAY_MS)
  const f = (d: Date) => `${d.getMonth() + 1}月${d.getDate()}日`
  return `${f(s)} – ${f(e)}`
}
