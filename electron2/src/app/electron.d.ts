export interface ElectronAPI {
  ping: () => string

  /** 菜单事件订阅，返回反注册函数（useEffect 清理时必须调用） */
  onQuickAdd: (callback: () => void) => () => void
  onNavigate: (callback: (path: string) => void) => () => void
  onExportJSON: (callback: () => void) => () => void
  onExportCSV: (callback: () => void) => () => void
  onImportJSON: (callback: () => void) => () => void

  dbDimensionsGetAll: () => Promise<any[]>
  dbDimensionsGet: (id: string) => Promise<any>
  dbDimensionsAdd: (row: any) => Promise<boolean>
  dbDimensionsUpdate: (id: string, data: any) => Promise<boolean>
  dbDimensionsDelete: (id: string) => Promise<boolean>

  dbRubricsGetAll: () => Promise<any[]>
  dbRubricsGetByDimension: (dimId: string) => Promise<any[]>
  dbRubricsAdd: (row: any) => Promise<boolean>

  dbBranchesGetAll: () => Promise<any[]>
  dbBranchesGetByDimension: (dimId: string) => Promise<any[]>
  dbBranchesAdd: (row: any) => Promise<boolean>
  dbBranchesUpdate: (id: string, data: any) => Promise<boolean>
  dbBranchesDelete: (id: string) => Promise<boolean>

  dbGoalsGetAll: () => Promise<any[]>
  dbGoalsGetByDimension: (dimId: string) => Promise<any[]>
  dbGoalsAdd: (row: any) => Promise<boolean>
  dbGoalsUpdate: (id: string, data: any) => Promise<boolean>
  dbGoalsDelete: (id: string) => Promise<boolean>

  dbActionsGetAll: () => Promise<any[]>
  dbActionsGetByDimension: (dimId: string) => Promise<any[]>
  dbActionsAdd: (row: any) => Promise<boolean>
  dbActionsUpdate: (id: string, data: any) => Promise<boolean>
  dbActionsDelete: (id: string) => Promise<boolean>

  dbReviewsGetAll: () => Promise<any[]>
  dbReviewsAdd: (row: any) => Promise<boolean>
  dbReviewsUpdate: (id: string, data: any) => Promise<boolean>
  dbReviewsDelete: (id: string) => Promise<boolean>

  dbSettingsGet: (key: string) => Promise<string | null>
  dbSettingsSet: (key: string, value: string) => Promise<boolean>
  dbSnapshotsGetAll: () => Promise<any[]>
  dbSnapshotsAdd: (row: any) => Promise<boolean>
  dbEventsLog: (name: string) => Promise<boolean>
  /** Aha 闸门用（v3.6）：某个事件名有没有出现过 / 某时刻之后有没有 / 某时刻之后出现几次 */
  dbEventsHas: (name: string) => Promise<boolean>
  dbEventsHasSince: (name: string, sinceMs: number) => Promise<boolean>
  dbEventsCountSince: (name: string, sinceMs: number) => Promise<number>
  /** 播完待播帧后清掉整组（name LIKE 'prefix%'），避免堆积 */
  dbEventsClearPrefix: (prefix: string) => Promise<boolean>

  appDbPath: () => Promise<string>

  dbQuarterlyGetAll: () => Promise<any[]>
  dbQuarterlyUpsert: (row: any) => Promise<boolean>
  dbQuarterlyDelete: (id: string) => Promise<boolean>
  dbFocusSet: (ids: string[]) => Promise<boolean>

  dbClearAll: () => Promise<boolean>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
