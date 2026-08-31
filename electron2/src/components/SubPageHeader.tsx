import { useNavigate } from 'react-router-dom'

/**
 * 二级页页头（v3.6.1）—— 标题 + 返回。
 *
 * 🔴 为什么返回入口是硬要求，不是锦上添花：
 *   我们在「我 → 我的数据」里主动推荐用户「添加到主屏幕」（那是 Safari 上唯一能让
 *   IndexedDB 免于 7 天清除的途径）。而**装到主屏之后是 standalone 模式，没有浏览器返回键**。
 *   六个二级页里此前只有「维度详情」有返回入口 —— 其余四个进去就只能靠底栏跳走，
 *   上下文当场丢掉。这是我们自己挖的坑：一边推荐安装，一边假设浏览器返回键还在。
 *
 * 交互口径：
 *   · 返回一律走 `navigate(-1)`（回到你来的那一屏），不硬编码目标路由 ——
 *     同一个二级页可能从「今天」也可能从「我的花园」进来，硬编码必然有一半是错的
 *   · 兜底：没有历史可回时（直接粘贴 hash 进来）退到 `fallback`
 *   · 返回键在**标题左侧同一行**，不另占一行 —— 窄屏的每一行都很贵
 */
interface Props {
  title: string
  /** 副标题，可空。窄屏下它是最先该被牺牲的东西，所以刻意做成可选 */
  subtitle?: string
  /** 没有浏览器历史时退到哪 */
  fallback?: string
  /** 标题右侧的操作区（比如「行动记录」的筛选） */
  right?: React.ReactNode
}

export function SubPageHeader({ title, subtitle, fallback = '/', right }: Props) {
  const navigate = useNavigate()

  const goBack = () => {
    // history.length <= 1 说明没得可退（PWA 冷启动直接落在这一页）
    if (window.history.length > 1) navigate(-1)
    else navigate(fallback)
  }

  return (
    <div className="subpage-head">
      <button className="subpage-back" onClick={goBack} aria-label="返回" data-testid="subpage-back">
        ←
      </button>
      <div className="subpage-title">
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {right && <div className="subpage-right">{right}</div>}
    </div>
  )
}
