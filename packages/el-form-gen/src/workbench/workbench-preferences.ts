/** 设计画布的受控视口档位。 */
export type DesignerCanvasViewportPreset =
  'FIT' | 'PC_1920' | 'PC_1440' | 'PC_1280' | 'PC_1024' | 'MOBILE_440' | 'MOBILE_375'

/** 工作区本地偏好；该对象不属于设计文档、命令历史或脏状态。 */
export interface DesignerWorkbenchPreferences {
  version: 1
  leftCollapsed: boolean
  rightCollapsed: boolean
  leftWidth: number
  rightWidth: number
  gridVisible: boolean
  viewport: DesignerCanvasViewportPreset
}

const STORAGE_PREFIX = 'daxiang-form:designer-workbench:v1:'
const DEFAULT_PREFERENCES: DesignerWorkbenchPreferences = {
  version: 1,
  leftCollapsed: false,
  rightCollapsed: false,
  leftWidth: 280,
  rightWidth: 380,
  gridVisible: true,
  viewport: 'FIT',
}

/** 读取当前文档隔离的工作区偏好；非法内容回退默认值且不抛出。 */
export function loadDesignerWorkbenchPreferences(documentId: string): DesignerWorkbenchPreferences {
  try {
    const raw = window.localStorage.getItem(storageKey(documentId))
    if (!raw) return { ...DEFAULT_PREFERENCES }
    const source = JSON.parse(raw) as unknown
    if (!isRecord(source) || source.version !== 1) return { ...DEFAULT_PREFERENCES }
    return {
      version: 1,
      leftCollapsed: source.leftCollapsed === true,
      rightCollapsed: source.rightCollapsed === true,
      leftWidth: clampNumber(source.leftWidth, 240, 360, DEFAULT_PREFERENCES.leftWidth),
      rightWidth: clampNumber(source.rightWidth, 320, 480, DEFAULT_PREFERENCES.rightWidth),
      gridVisible: source.gridVisible !== false,
      viewport: isViewportPreset(source.viewport) ? source.viewport : 'FIT',
    }
  } catch {
    return { ...DEFAULT_PREFERENCES }
  }
}

/** 保存工作区偏好；浏览器存储不可用时保持当前会话状态。 */
export function saveDesignerWorkbenchPreferences(
  documentId: string,
  preferences: DesignerWorkbenchPreferences,
): void {
  try {
    window.localStorage.setItem(storageKey(documentId), JSON.stringify(preferences))
  } catch {
    // 工作区偏好不是设计数据，存储失败不阻断编辑与保存。
  }
}

/** 将视口档位转换为画布设备和固定宽度；FIT 使用 undefined 表示自适应。 */
export function resolveDesignerViewportPreset(preset: DesignerCanvasViewportPreset): {
  device: 'desktop' | 'mobile'
  width?: number
} {
  if (preset === 'FIT') return { device: 'desktop' }
  if (preset === 'MOBILE_440') return { device: 'mobile', width: 440 }
  if (preset === 'MOBILE_375') return { device: 'mobile', width: 375 }
  return {
    device: 'desktop',
    width: Number(preset.slice('PC_'.length)),
  }
}

function storageKey(documentId: string): string {
  return `${STORAGE_PREFIX}${encodeURIComponent(documentId || 'standalone')}`
}

function clampNumber(value: unknown, minimum: number, maximum: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(minimum, Math.min(maximum, Math.round(value)))
    : fallback
}

function isViewportPreset(value: unknown): value is DesignerCanvasViewportPreset {
  return ['FIT', 'PC_1920', 'PC_1440', 'PC_1280', 'PC_1024', 'MOBILE_440', 'MOBILE_375'].includes(
    String(value),
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
