// 网页版的存储真相（v3.4 A1 + A3）。
//
// 为什么这件事是 P0 而不是体验优化：
//   桌面版对用户的承诺是「数据在你自己电脑里，就是一个 sqlite 文件，随时导出带走」。
//   **这句话在网页版不成立**，照抄就是失信 ——
//     · 浏览器 IndexedDB，用户看不见、拷不走
//     · 清缓存 / 隐私模式 / 存储压力驱逐 都会清掉
//     · 🔴 Safari 对**未添加到主屏**的站点有 7 天不访问即清除（ITP）
//   而这是一个「84 天才结算一次」的产品：用户完全可能在一个周期内被清空账本。
//   账本丢了，这个产品就什么都不是了。
//
// 两手应对，缺一不可：
//   A1 navigator.storage.persist() —— Chrome/Edge 上换来持久配额（不再被存储压力驱逐）
//   A3 如实告知 + 出口显性化 —— 做不到的事不承诺；一个敢把局限写在脸上的工具更可信
//
// Safari 上 persist() 基本必然返回 false：那里唯一的持久化途径是「添加到主屏幕」（A2）。
// 所以界面上不能只报 true/false，要顺带说清「怎么才能更稳」。

export type StorageKind = 'indexeddb' | 'localstorage' | 'memory'

export interface WebStorageStatus {
  kind: StorageKind
  /** navigator.storage.persist() 的结果。null = 浏览器不支持这个 API，无从得知 */
  persisted: boolean | null
  /** 已用 / 配额（MB）。拿不到就是 null，不猜 */
  usageMB: number | null
  quotaMB: number | null
  /** 已经以独立应用形态运行（添加到主屏 / 安装为 PWA）——Safari 上这是持久化的唯一途径 */
  standalone: boolean
}

declare global {
  interface Window {
    /** 只有网页版会挂这个对象；Electron 版永远是 undefined。判据是结构性的，不靠 UA */
    __lifeosWeb?: WebStorageStatus
  }
}

/** 当前是不是网页版。桌面版与网页版的「关于」文案必须分开写，就靠这一个判据 */
export function isWebBuild(): boolean {
  return typeof window !== 'undefined' && !!window.__lifeosWeb
}

export function webStorageStatus(): WebStorageStatus | null {
  return (typeof window !== 'undefined' && window.__lifeosWeb) || null
}

function isStandalone(): boolean {
  try {
    // iOS Safari 走 navigator.standalone；其余走 display-mode
    const iosStandalone = (navigator as any).standalone === true
    const dm = typeof matchMedia === 'function' &&
      (matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: minimal-ui)').matches)
    return !!(iosStandalone || dm)
  } catch { return false }
}

/**
 * 申请持久化存储，并把真实结果记在 window.__lifeosWeb 上供界面如实呈现。
 * 只在网页版入口调用一次。**不抛异常**：拿不到就如实说拿不到，绝不因此挡住启动。
 */
export async function initWebStorageStatus(kind: StorageKind): Promise<WebStorageStatus> {
  const status: WebStorageStatus = {
    kind,
    persisted: null,
    usageMB: null,
    quotaMB: null,
    standalone: isStandalone(),
  }

  try {
    const sm = navigator.storage
    if (sm?.persist) {
      // 已经批过就别再问一次（重复调用在部分浏览器会重新弹窗）
      const already = sm.persisted ? await sm.persisted() : false
      status.persisted = already ? true : await sm.persist()
    }
    if (sm?.estimate) {
      const est = await sm.estimate()
      if (typeof est.usage === 'number') status.usageMB = est.usage / 1024 / 1024
      if (typeof est.quota === 'number') status.quotaMB = est.quota / 1024 / 1024
    }
  } catch { /* 拿不到就保持 null —— 界面会说「无从得知」，不会假装安全 */ }

  window.__lifeosWeb = status
  return status
}

/** 「关于」面板里那几行字。网页版与桌面版分开写，这是 A3 的全部内容 */
export function storagePromiseLines(status: WebStorageStatus): string[] {
  const lines: string[] = [
    '数据只存在你这台设备的浏览器里，不上传任何服务器，没有账号，没有云同步。',
  ]

  if (status.kind === 'memory') {
    lines.push('🔴 当前浏览器不允许本站存储数据，这一次的记录**刷新就会消失**。换个浏览器，或关掉隐私模式。')
  } else if (status.kind === 'localstorage') {
    lines.push('⚠️ 当前降级到 localStorage（约 5MB 上限），定妆照可能存不下。功能都能用，但建议更频繁地导出。')
  }

  lines.push('浏览器清理缓存会一并清掉它 —— 重要的话记得定期导出，下面一键就能带走。')

  if (status.persisted === true) {
    lines.push('✓ 这台设备已授予持久化存储：浏览器空间不足时不会优先清掉它。')
  } else if (status.persisted === false) {
    lines.push(
      status.standalone
        ? '这个浏览器没有给持久化许可，但你已经把它装成独立应用了，这已经是最稳的形态。'
        : '这个浏览器暂未授予持久化许可。把本页「添加到主屏幕 / 安装为应用」会明显更稳 —— Safari 上这是唯一的办法（未安装的站点 7 天不访问就会被清）。',
    )
  } else {
    lines.push('这个浏览器不支持查询持久化状态，所以我无从保证 —— 请把导出当成正式备份，不是可选项。')
  }

  return lines
}
