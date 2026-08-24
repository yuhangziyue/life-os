// 导出 / 导入的"落盘"层。
// 设置页按钮和原生菜单（文件 → 导出 JSON / 导出 CSV / 导入 JSON）共用这里的实现，
// 避免两处各写一遍再慢慢漂移。序列化本身在 ./export.ts，这里只管触发浏览器下载和选文件。

import { exportJSON, exportCSV, importJSON } from './export'

function download(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

const today = () => new Date().toISOString().slice(0, 10)

export async function downloadJSON() {
  download(await exportJSON(), `life-os-backup-${today()}.json`, 'application/json')
}

export async function downloadCSV() {
  // BOM 前缀，否则 Excel 打开中文列名是乱码
  download('﻿' + (await exportCSV()), `life-os-actions-${today()}.csv`, 'text/csv;charset=utf-8')
}

/** 弹出文件选择器并导入。返回 null 表示用户取消了选择。 */
export function pickAndImportJSON(): Promise<{ success: boolean; message: string } | null> {
  return new Promise(resolve => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async e => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return resolve(null)
      resolve(await importJSON(await file.text()))
    }
    input.oncancel = () => resolve(null)
    input.click()
  })
}
