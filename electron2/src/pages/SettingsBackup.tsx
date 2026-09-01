import { useState } from 'react'
import { useStore } from '../stores/useStore'
import { downloadJSON, downloadCSV, pickAndImportJSON } from '../db/fileTransfer'
import { isWebBuild, webStorageStatus, storagePromiseLines } from '../services/storage'
import { SubPageHeader } from '../components/SubPageHeader'

/**
 * 备份与导出（v3.7 C3）—— 子曰原话「数据备份 简化主界面，点击之后是打开新页面
 * 然后展示现有的功能」。
 *
 * 两处改名与措辞的理由：
 *   · 页名不叫「数据管理」——「管理」是全产品禁用词（晓雅 X1）。
 *     它在这一屏尤其错：用户到这儿来是**为了把东西拿走**，不是来治理它的。
 *   · 主列表那一行叫「**备份与导出**」而不是「数据备份」——
 *     **「导出」是他真正会用的那个动作**，而「可带走」是我们写在承诺里的话。
 *
 * 🔴 存储真相那一段**必须跟着搬过来，不能留在主列表也不能被简化掉**（v3.4 A3）：
 *   界面简化不能把「数据会丢」一起简化掉。
 *   网页版与桌面版的承诺分开写 —— 桌面版说 sqlite 文件路径，
 *   网页版必须说清「浏览器清缓存会一并清掉」，否则就是照抄一句做不到的话。
 *   这不是坏消息，是信任设计：**敢把局限写在脸上的工具，比含糊承诺"绝对安全"的更可信。**
 */
export function SettingsBackup() {
  const loadData = useStore(s => s.loadData)
  const [importMsg, setImportMsg] = useState('')
  const web = webStorageStatus()

  const handleImport = async () => {
    const result = await pickAndImportJSON()
    if (!result) return
    setImportMsg(result.message)
    await loadData()
  }

  const handleClearData = async () => {
    if (confirm('确定要清除所有数据吗？此操作不可撤销。')) {
      if (confirm('再次确认：清除所有花瓣、记录、目标、回顾？')) {
        await window.electronAPI.dbClearAll()
        window.location.reload()
      }
    }
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="page-pad space-y-4">
        <SubPageHeader title="备份与导出" fallback="/settings" />

        <div className="card space-y-3" data-testid="backup-actions">
          <div className="flex flex-wrap gap-3">
            <button className="btn text-sm" onClick={() => downloadJSON()} data-testid="export-json">
              导出 JSON
            </button>
            <button className="btn text-sm" onClick={() => downloadCSV()} data-testid="export-csv">
              导出 CSV
            </button>
            <button className="btn text-sm" onClick={handleImport} data-testid="import-json">
              导入 JSON
            </button>
          </div>
          <p className="text-xs text-[var(--text-muted)] leading-relaxed">
            JSON 是完整的一份（花瓣、记录、目标、回顾、季度会谈、定妆照都在里面），
            导回来能还原成现在这样。CSV 只有记录那一张表，适合拿去别的地方看。
          </p>
          {importMsg && (
            <div className="p-3 rounded-lg text-sm bg-[var(--accent)]/10 text-[var(--accent)]">
              {importMsg}
            </div>
          )}
        </div>

        {isWebBuild() && web && (
          <div className="card">
            <div className="storage-truth" data-testid="storage-truth">
              {storagePromiseLines(web).map(line => (
                <p key={line}>{line}</p>
              ))}
              <p className="storage-meta" data-testid="storage-meta">
                存储层 {web.kind}
                {' · '}持久化 {web.persisted === true ? '已获许可' : web.persisted === false ? '未获许可' : '无从得知'}
                {web.standalone ? ' · 已作为独立应用运行' : ''}
                {web.usageMB != null && web.quotaMB != null
                  ? ` · 已用 ${web.usageMB.toFixed(1)}MB / 可用 ${Math.round(web.quotaMB)}MB`
                  : ''}
              </p>
            </div>
          </div>
        )}

        {/* 清除放在最后，且与上面隔开一张卡的距离 ——
            危险动作不该和日常动作挤在同一组按钮里 */}
        <div className="card">
          <button
            className="btn text-sm text-[var(--danger)]"
            onClick={handleClearData}
            data-testid="clear-all"
          >
            清除所有数据
          </button>
          <p className="text-xs text-[var(--text-muted)] mt-2 leading-relaxed">
            清之前先导一份 JSON 出来。这个动作没有后悔药。
          </p>
        </div>
      </div>
    </div>
  )
}
