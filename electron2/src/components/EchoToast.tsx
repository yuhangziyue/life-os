import { useEffect } from 'react'
import { useStore } from '../stores/useStore'

/**
 * 行动回响（P0-11）—— 每次记录/完成后的温暖反馈：
 * 明确告诉你这个动作有什么用（效果行），再送一句经典的话（温暖话语）。
 * 5 秒自动收起，点击立即收起；永远不打断操作路径。
 */
export function EchoToast() {
  const echo = useStore(s => s.echo)
  const clearEcho = useStore(s => s.clearEcho)

  useEffect(() => {
    if (!echo) return
    const timer = setTimeout(clearEcho, 5000)
    return () => clearTimeout(timer)
  }, [echo, clearEcho])

  if (!echo) return null

  return (
    <div
      key={echo.key}
      className="echo-toast cursor-pointer"
      data-testid="echo-toast"
      onClick={clearEcho}
    >
      <div className="flex items-start gap-3">
        <div
          className="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1.5"
          style={{ backgroundColor: echo.color }}
        />
        <div className="min-w-0">
          {echo.lines.map((line, i) => (
            <p key={i} className={`text-sm leading-relaxed ${i === 0 ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>
              {line}
            </p>
          ))}
          <p className="text-xs text-[var(--text-secondary)] mt-2 leading-relaxed">
            {echo.word.benefit}
          </p>
          {echo.word.quote && (
            <p className="text-xs text-[var(--text-muted)] mt-1.5 italic leading-relaxed">
              「{echo.word.quote}」
              {echo.word.source && <span className="not-italic"> —— {echo.word.source}</span>}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
