import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useStore, useEnabledDimensions } from '../stores/useStore'
import {
  LIGHT_LAW, TOO_LIGHT, pct, shareDelta, shiftFact,
  type AhaPayload, type LightShift,
} from '../engine/lightShift'

/**
 * 「光的分配」定格帧 —— 全产品唯一允许抢注意力的一屏（v3.6 第五轮圆桌定稿）。
 *
 * ============ 它不在提交后播 ============
 * 这是本轮最重要的一处改动（小露二轮那一刀，小艾与老架均放行）：
 *   **定格帧永不在提交后播，它攒着，下次打开 app 时作为「进门的一眼」播。**
 * 一刀解掉三个问题：
 *   · 追求触发 —— 提交后什么都不会来，就没有东西可追（小露）
 *   · Ability  —— 1450ms 不再加在每天的记录路径上，记录永远 240ms 走完（小艾）
 *   · 边际成本 —— 落在用户本来就在等渲染的时刻（老架）
 *
 * ============ 白底上「光」怎么画（小露的三条规则）============
 * 花间集是 #fbeef1 白粉底，而**白底上加亮 = 消失**。所以：
 *   ① **反相**：不给赢家加光，给其余七段减光（退潮 opacity→0.28 / saturate→0.35）。
 *      观众感知到的「这段在发光」，其实是它周围暗下去了。
 *   ② **光粒是深色墨点，不是白星**：取源花瓣植物色 L−14% / S+10%。
 *      白色粒子在 #fbeef1 上等于隐形。**颜色就是名字** —— 观众不需要文字
 *      也知道是哪一片飞出来的（这也是主句允许不具名付方的前提）。
 *   ③ 唯一允许的「发光」是**一条 1px 近白线**，不是一团光。线可见，团不可见。
 * 明确禁止：shadowBlur / mix-blend-mode:screen / 白色径向渐变 / canvas lighter
 *   （老架三轮承认他的 lighter 方案在这个主题下无效并撤回）。
 *
 * ============ 数字纪律 ============
 * 全屏**恰好 1 个数字**，且身份是「图上的标签」不是「待读的数据」：
 * 得光那片的终值，硬切不翻滚（翻滚的数字是老虎机）。
 * **零箭头** —— 方向符号即评价符号，中文阅读里它比文字更快也更难辩解。
 */

const RISE_MS = 160        // 退潮
const HOLD_MS = 60         // 呼吸口
const FLY_MS = 600         // 三粒飞行总窗口（与花瓣补间同一条时间轴）
const ABSORB_MS = 150
/**
 * 自动淡出。不需要点掉、滑走即消（Lisa 三轮：不阻断操作）。
 * 6.2 秒 = 1.6 秒动画 + 4.6 秒读一句话的时间。
 * 原本是 4.2 秒 —— 实测太紧：动画刚落定就开始倒计时，一句 20 字的话读不完。
 */
const AUTO_CLOSE_MS = 6200

interface Props {
  payload: AhaPayload
  /** 触发时刻。定格帧移到"进门"之后，因果链需要一个日期锚（小艾三轮的必要条件） */
  stampedAt?: number
  onClose: () => void
}

/**
 * 一屏定格，四种 kind 共用（v3.6.1）。
 * light_shift 走完整的光河序列；其余三种（stage_up / awaken / intent_set）
 * 是**纯事实句**，刻意不给动画 —— 它们的信息量在句子里，加动效只会变成表演。
 * 「简约」在这里的具体含义：能用一句话说完的，不画第二样东西。
 */
export function LightShiftAha({ payload, stampedAt, onClose }: Props) {
  if (payload.kind === 'light_shift') {
    return <LightRiverFrame shift={payload.shift} stampedAt={stampedAt} onClose={onClose} />
  }
  return <FactFrame payload={payload} stampedAt={stampedAt} onClose={onClose} />
}

/** 事实型定格：一个色点 + 一句主句 + 若干补充行。零动画、零数字 */
function FactFrame({ payload, stampedAt, onClose }: {
  payload: Extract<AhaPayload, { kind: 'stage_up' | 'awaken' | 'intent_set' }>
  stampedAt?: number
  onClose: () => void
}) {
  useEffect(() => {
    const t = setTimeout(onClose, 5600)   // 事实型没有动画，纯读句子的时间
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => { clearTimeout(t); window.removeEventListener('keydown', onKey) }
  }, [onClose])

  const dateAnchor = stampedAt
    ? new Date(stampedAt).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })
    : null

  return (
    <div className="aha-scrim" data-testid="aha-frame" onClick={onClose} role="dialog" aria-label="花园里的一件事">
      <div className="aha-sheet-body" data-testid={`aha-${payload.kind}`} onClick={e => e.stopPropagation()}>
        {dateAnchor && <p className="aha-anchor" data-testid="aha-anchor">{dateAnchor}那一笔之后</p>}
        <span className="aha-dot" style={{ backgroundColor: payload.colorHex }} />
        <p className="aha-fact" data-testid="aha-fact">{payload.headline}</p>
        {payload.lines.map(l => (
          <p key={l} className="aha-line">{l}</p>
        ))}
      </div>
    </div>
  )
}

/** 墨点色：源花瓣植物色加深一档。白底上「浓」才是光，「亮」等于消失 */
function inkOf(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return hex
  const n = parseInt(m[1], 16)
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0
  const l = (max + min) / 2
  const d = max - min
  let sat = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  return `hsl(${Math.round(h)} ${Math.round(Math.min(1, sat + 0.1) * 100)}% ${Math.round(Math.max(0, l - 0.14) * 100)}%)`
}

interface Path { x0: number; y0: number; mx: number; my: number; x1: number; y1: number; color: string; delay: number }

function LightRiverFrame({ shift, stampedAt, onClose }: {
  shift: LightShift
  stampedAt?: number
  onClose: () => void
}) {
  const dimensions = useEnabledDimensions()
  const lawSeen = useStore(s => s.ahaLawSeen)
  const markAhaLawSeen = useStore(s => s.markAhaLawSeen)

  // 「可关」是动效红线的第三条：系统级 reduced-motion 与用户在氛围里关掉动效，
  // 走**同一条降级路径** —— 位移仍然被画出来（静态虚线箭头），只是不再补间
  const reduced = useMemo(
    () =>
      (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) ||
      (typeof document !== 'undefined' && document.documentElement.dataset.motion === 'off'),
    [],
  )

  /** 0 = 记录前的形状，1 = 记录后 */
  const [t, setT] = useState(reduced ? 1 : 0)
  const [ebb, setEbb] = useState(!reduced)   // 退潮中（其余七段暗下去）
  const [absorbed, setAbsorbed] = useState(reduced)
  const bandRef = useRef<HTMLDivElement>(null)
  const dotsRef = useRef<HTMLDivElement[]>([])
  const rafRef = useRef(0)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const [paths, setPaths] = useState<Path[]>([])

  const gainedIdx = shift.segments.findIndex(s => s.dimensionId === shift.gained.dimensionId)

  // 段坐标必须在动画开始前一次性量好并缓存 ——
  // rAF 每帧读 offsetWidth 会强制 layout（老架三轮点名的坑）
  useLayoutEffect(() => {
    if (reduced) return
    const band = bandRef.current
    if (!band) return
    const bandRect = band.getBoundingClientRect()
    const segs = [...band.querySelectorAll<HTMLElement>('[data-testid="aha-band-seg"]')]
    if (segs.length === 0 || gainedIdx < 0) return
    const center = (el: HTMLElement) => {
      const r = el.getBoundingClientRect()
      return { x: r.left - bandRect.left + r.width / 2, y: r.height / 2 }
    }
    const target = center(segs[gainedIdx])
    // 只从被让开最多的 3 段各发 1 粒 —— 八粒是噪声，而且三个可数的实体才能归因到花瓣
    const sources = shift.yielded.slice(0, 3)
    const next: Path[] = sources.map((y, i) => {
      const idx = shift.segments.findIndex(s => s.dimensionId === y.dimensionId)
      const el = segs[idx]
      const from = el ? center(el) : { x: 0, y: bandRect.height / 2 }
      const give = y.from - y.to
      return {
        x0: from.x, y0: from.y,
        // 弧高按让出量映射 5–11px：让得多，弧抬得高。抬起是为了轨迹不被带子自己遮住
        mx: (from.x + target.x) / 2,
        my: from.y - (5 + Math.min(6, give * 120)),
        x1: target.x, y1: target.y,
        color: inkOf(y.colorHex),
        delay: i * 60,
      }
    })
    setPaths(next)
  }, [reduced, shift.key, gainedIdx])

  // 时序：退潮 → 呼吸口 → 飞行（花瓣补间滞后 120ms 起步，让因果读作「光先动，宽度后让」）
  useEffect(() => {
    if (reduced) return
    const at = (ms: number, fn: () => void) => { timers.current.push(setTimeout(fn, ms)) }
    at(RISE_MS + HOLD_MS + 120, () => {
      const t0 = performance.now()
      const tick = (now: number) => {
        const p = Math.min(1, (now - t0) / FLY_MS)
        const e = 1 - Math.pow(1 - p, 3)
        setT(e)
        // 三粒沿二次贝塞尔飞，只写 transform，不碰布局
        paths.forEach((path, i) => {
          const el = dotsRef.current[i]
          if (!el) return
          const local = Math.min(1, Math.max(0, (now - t0 - path.delay) / (FLY_MS - 120)))
          const le = local < 0.5 ? 2 * local * local : 1 - Math.pow(-2 * local + 2, 2) / 2
          const x = (1 - le) ** 2 * path.x0 + 2 * (1 - le) * le * path.mx + le ** 2 * path.x1
          const y = (1 - le) ** 2 * path.y0 + 2 * (1 - le) * le * path.my + le ** 2 * path.y1
          el.style.transform = `translate3d(${x}px, ${y}px, 0)`
          el.style.opacity = local >= 1 ? '0' : String(0.95 - le * 0.1)
        })
        if (p < 1) rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)
    })
    at(RISE_MS + HOLD_MS + FLY_MS, () => setAbsorbed(true))
    at(RISE_MS + HOLD_MS + FLY_MS + ABSORB_MS, () => setEbb(false))
    at(AUTO_CLOSE_MS, onClose)
    return () => {
      timers.current.forEach(clearTimeout)
      timers.current = []
      cancelAnimationFrame(rafRef.current)
    }
  }, [reduced, shift.key, paths, onClose])

  const showLaw = !lawSeen && !shift.firstEver
  useEffect(() => { if (showLaw) void markAhaLawSeen() }, [showLaw, markAhaLawSeen])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const segs = shift.segments.map(s => ({ ...s, now: s.from + (s.to - s.from) * t }))
  const total = segs.reduce((sum, s) => sum + s.now, 0) || 1

  // 焦点那片是否正是被让开最多的一片 —— 那一句是全产品最贴 ICP 的一句
  const focusIds = new Set(dimensions.filter(d => d.focusSince != null).map(d => d.id))
  const focusYield = shift.yielded.find(y => focusIds.has(y.dimensionId))

  const delta = shareDelta(shift.gained.from, shift.gained.to)
  const dateAnchor = stampedAt
    ? new Date(stampedAt).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })
    : null

  return (
    <div
      className="aha-scrim"
      data-testid="aha-frame"
      onClick={onClose}
      role="dialog"
      aria-label="光的分配"
    >
      <div className="aha-sheet-body" data-testid="light-shift" onClick={e => e.stopPropagation()}>
        {dateAnchor && (
          <p className="aha-anchor" data-testid="aha-anchor">{dateAnchor}那一笔之后</p>
        )}

        {/* 主句：字号最大的那一行，承担价值点。受损方默认不具名 */}
        <p className="aha-fact" data-testid="aha-fact">
          {shiftFact(shift, focusYield ? focusYield.name : null)}
        </p>

        {/* 光河：22px，八段按占比分宽，三粒墨点在它上面飞 */}
        <div className={`aha-river${ebb ? ' is-ebb' : ''}`} ref={bandRef} data-testid="aha-band">
          {segs.map((s, i) => (
            <span
              key={s.dimensionId}
              data-testid="aha-band-seg"
              data-dimension={s.name}
              className={i === gainedIdx ? 'is-gained' : ''}
              style={{ flex: `0 0 ${(s.now / total) * 100}%`, backgroundColor: s.colorHex }}
            >
              {i === gainedIdx && absorbed && <i className="aha-glint" />}
            </span>
          ))}
          {!reduced && paths.map((p, i) => (
            <div
              key={i}
              ref={el => { if (el) dotsRef.current[i] = el }}
              className="aha-ink"
              data-testid="aha-ink"
              style={{ backgroundColor: p.color, transform: `translate3d(${p.x0}px, ${p.y0}px, 0)` }}
            />
          ))}
          {/* reduced-motion 的静态版：不是只剩文字兜底，位移这件事仍然被画出来 */}
          {reduced && shift.yielded.slice(0, 3).map(y => (
            <span key={y.dimensionId} className="aha-static-arrow" data-testid="aha-static-arrow"
                  style={{ backgroundColor: inkOf(y.colorHex) }} />
          ))}
        </div>

        {/* 全屏恰好一个数字，右对齐成脚注。硬切，不翻滚 */}
        <p className="aha-one-number" data-testid="aha-number">
          {delta.kind === 'sub_pct'
            ? TOO_LIGHT
            : `${shift.gained.name} ${pct(shift.gained.to)}%`}
        </p>

        {shift.firstEver && (
          <p className="aha-law">这是这座花园的第一笔光。它现在全在这一片上。</p>
        )}
        {showLaw && <p className="aha-law" data-testid="aha-law">{LIGHT_LAW}</p>}

        <p className="aha-exit">具体到几成几，都在细看数据里。</p>
      </div>
    </div>
  )
}
