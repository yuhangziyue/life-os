import {
  getDimensions, getScoreRubrics, getBranches, getGoals, getActions, getReviews,
  getQuarterlyReviews, getSnapshots,
} from './database'
import { addDimension, addBranch, addGoal, addAction } from './database'

/**
 * 导出 / 导入（v3.6.2 补全）。
 *
 * 🔴 v3.6.1 之前这里只序列化**六张表**（dimensions / scoreRubrics / branches / goals /
 *   actions / reviews），漏掉了 `quarterly_reviews`、`settings`、`flower_snapshots`。
 *   严重性不在于"少了几张表"，而在于：
 *     · **季度会谈是这个产品最贵的东西**（定位 v2.0：记录=攒证据，季度会谈=结算），
 *       它的全部记录都在 `quarterly_reviews` 里
 *     · **网页版我们亲口写着「导出是唯一的保命通道」**（A3 的存储真相文案）
 *   ⇒ 用户照我们说的定期导出、某天真丢了数据、导回来 —— 结算记录和定妆照全没了。
 *   这是"按我们说的做，结果被我们坑了"，比任何功能缺失都严重。
 *
 * 关于 `events` 表：**刻意不导**。它只承载 Aha 闸门的记账（播过没播过、冷却到没到），
 * 不是用户的数据。为它加一套带时间戳的写入 API 不值得，最坏后果也只是
 * 某一种 Aha 在恢复后重播一次 —— 而那正好是恢复数据的人愿意看到的。
 *
 * 版本号：3.0.0。导入侧**必须兼容 2.0.0 的旧文件**（缺的字段当空处理），
 * 否则用户手上那些旧备份会在最需要它们的时刻打不开。
 */

function api() {
  if (!window.electronAPI) throw new Error('electronAPI 未就绪')
  return window.electronAPI
}

export async function exportJSON(): Promise<string> {
  const [dimensions, scoreRubrics, branches, goals, actions, reviews, quarterlyReviews, snapshots, settings] =
    await Promise.all([
      getDimensions(),
      getScoreRubrics(),
      getBranches(),
      getGoals(),
      getActions(),
      getReviews(),
      getQuarterlyReviews(),
      getSnapshots(),
      api().dbSettingsGetAll(),
    ])

  // 待播的 Aha 载荷是**当下这一刻的中间态**，不是用户数据。
  // 导进另一台设备会凭空弹一屏跟那台设备无关的定格帧，所以剔掉。
  const { ahaPending, ...keptSettings } = settings as Record<string, string>
  void ahaPending

  return JSON.stringify({
    version: '3.0.0',
    exportedAt: new Date().toISOString(),
    dimensions, scoreRubrics, branches, goals, actions, reviews,
    quarterlyReviews, snapshots, settings: keptSettings,
  }, null, 2)
}

export async function exportCSV(): Promise<string> {
  const actions = await getActions()
  const dimensions = await getDimensions()
  const dimMap = new Map(dimensions.map((d: any) => [d.id, d.name]))
  const headers = ['日期', '维度', '描述', '质量等级', '贡献值', '是否完成']
  const rows = actions.map((a: any) => [
    new Date(a.date).toISOString().slice(0, 10),
    dimMap.get(a.dimensionId) ?? '',
    a.description,
    a.quality,
    a.impact.toString(),
    a.isCompleted ? '是' : '否',
  ])
  return [headers.join(','), ...rows.map((r: any[]) => r.map((c: string) => `"${c}"`).join(','))].join('\n')
}

export async function importJSON(jsonStr: string): Promise<{ success: boolean; message: string }> {
  try {
    const data = JSON.parse(jsonStr)
    if (!data.dimensions || !data.branches || !data.actions) {
      return { success: false, message: 'JSON 格式不正确，缺少必要字段' }
    }
    await api().dbClearAll()
    for (const d of data.dimensions) await addDimension(d)
    if (data.scoreRubrics?.length) {
      for (const r of data.scoreRubrics) await api().dbRubricsAdd(r)
    }
    for (const b of data.branches) await addBranch(b)
    if (data.goals?.length) {
      for (const g of data.goals) await addGoal(g)
    }
    for (const a of data.actions) await addAction(a)
    if (data.reviews?.length) {
      for (const r of data.reviews) await api().dbReviewsAdd(r)
    }

    // ---- 以下三块是 3.0.0 新增。旧文件（2.0.0）没有这些字段，
    //      走的是「有就恢复、没有就跳过」，所以旧备份照样能打开 ----
    let restoredQuarterly = 0
    if (data.quarterlyReviews?.length) {
      for (const q of data.quarterlyReviews) {
        await api().dbQuarterlyUpsert(q)
        restoredQuarterly++
      }
    }
    if (data.snapshots?.length) {
      for (const s of data.snapshots) await api().dbSnapshotsAdd(s)
    }
    if (data.settings && typeof data.settings === 'object') {
      for (const [k, v] of Object.entries(data.settings as Record<string, string>)) {
        // 再保险一次：即使旧文件里混进了待播载荷也不恢复它
        if (k === 'ahaPending') continue
        await api().dbSettingsSet(k, String(v))
      }
    }

    const extra = restoredQuarterly > 0 ? `，${restoredQuarterly} 场会谈` : ''
    return {
      success: true,
      message: `导入成功：${data.dimensions.length} 个维度，${data.actions.length} 条行动${extra}`,
    }
  } catch (e) {
    return { success: false, message: `导入失败：${(e as Error).message}` }
  }
}
