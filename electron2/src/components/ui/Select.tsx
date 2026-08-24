import { useEffect, useRef, useState } from 'react'

/**
 * 主题化下拉框（2026-08-18 子曰点名：原生 select 太丑）——
 * 原生 select 的弹层由系统绘制，拿不到主题 token，暗夜/茶室/花间三套皮全都管不到它；
 * 所以自绘一个：触发器像卡片、弹层带圆角与主题投影、选中项走 accent、可带维度色点。
 *
 * 保留原生该有的行为：Esc 关闭 / ↑↓ 移动 / Enter 选中 / 点外面关闭 / 键盘可达。
 * e2e 定位口径：容器 data-testid，选项按文字找（不再是 <option>，别再用 select.value 那套）。
 */

export interface SelectOption {
  value: string
  label: string
  /** 维度色点（可选） */
  colorHex?: string
}

interface SelectProps {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  /** value 为空时显示的文字，同时作为「全部」那一项的标签 */
  placeholder?: string
  testId?: string
  className?: string
}

export function Select({ value, onChange, options, placeholder = '请选择', testId, className = '' }: SelectProps) {
  const [open, setOpen] = useState(false)
  const [cursor, setCursor] = useState(0)
  const boxRef = useRef<HTMLDivElement>(null)

  // placeholder 本身是一项（= 清空选择），和原生 select 的空 option 等价
  const all: SelectOption[] = [{ value: '', label: placeholder }, ...options]
  const current = all.find(o => o.value === value) ?? all[0]

  useEffect(() => {
    if (!open) return
    setCursor(Math.max(0, all.findIndex(o => o.value === value)))
    const onDocClick = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
    // all/value 变化不需要重绑监听，只在开合时处理
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const pick = (v: string) => {
    onChange(v)
    setOpen(false)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setOpen(false); return }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (open) pick(all[cursor]?.value ?? '')
      else setOpen(true)
      return
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) { setOpen(true); return }
      setCursor(c => {
        const next = e.key === 'ArrowDown' ? c + 1 : c - 1
        return (next + all.length) % all.length
      })
    }
  }

  return (
    <div ref={boxRef} className={`zen-select ${className}`} data-testid={testId}>
      <button
        type="button"
        className={`zen-select-trigger ${open ? 'is-open' : ''} ${value ? 'has-value' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        onKeyDown={onKeyDown}
      >
        {current.colorHex && (
          <span className="zen-select-dot" style={{ backgroundColor: current.colorHex }} />
        )}
        <span className="zen-select-label">{current.label}</span>
        <span className={`zen-select-arrow ${open ? 'is-open' : ''}`}>⌄</span>
      </button>

      {open && (
        <div className="zen-select-menu" role="listbox" onKeyDown={onKeyDown}>
          {all.map((o, i) => (
            <button
              key={o.value || '__all__'}
              type="button"
              role="option"
              aria-selected={o.value === value}
              className={`zen-select-option ${o.value === value ? 'is-selected' : ''} ${i === cursor ? 'is-cursor' : ''}`}
              onMouseEnter={() => setCursor(i)}
              onClick={() => pick(o.value)}
            >
              {o.colorHex
                ? <span className="zen-select-dot" style={{ backgroundColor: o.colorHex }} />
                : <span className="zen-select-dot is-empty" />}
              <span className="zen-select-label">{o.label}</span>
              {o.value === value && <span className="zen-select-check">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
