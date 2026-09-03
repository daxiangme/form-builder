import type { DesignerContainerRadiusOverride, DesignerRadiusValue } from './types'

/** 自定义圆角允许的最小像素值。 */
export const DESIGNER_RADIUS_MIN_PX = 0

/** 自定义圆角允许的最大像素值。 */
export const DESIGNER_RADIUS_MAX_PX = 32

/** 自定义圆角必须是该步长的倍数。 */
export const DESIGNER_RADIUS_STEP_PX = 4

/** 检查器常用的圆角预设，不含跟随系统。 */
export const DESIGNER_RADIUS_PX_PRESETS = [0, 4, 8, 12] as const

const LEGACY_RADIUS_PRESETS: Readonly<Record<string, DesignerRadiusValue>> = {
  THEME: 'THEME',
  NONE: 0,
  SMALL: 4,
  BASE: 8,
  LARGE: 12,
}

/**
 * 判断取值是否为合法的受控圆角。
 *
 * `THEME` 表示跟随宿主主题；数字必须是 0～32 且为 4 的倍数。
 */
export function isDesignerRadiusValue(value: unknown): value is DesignerRadiusValue {
  if (value === 'THEME') return true
  return isDesignerRadiusPx(value)
}

/** 判断取值是否为合法的自定义圆角像素。 */
export function isDesignerRadiusPx(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= DESIGNER_RADIUS_MIN_PX &&
    value <= DESIGNER_RADIUS_MAX_PX &&
    value % DESIGNER_RADIUS_STEP_PX === 0
  )
}

/**
 * 将未知圆角输入归一为 `THEME` 或合法像素。
 *
 * 旧档位 `NONE` / `SMALL` / `BASE` / `LARGE` 分别映射为 0 / 4 / 8 / 12。
 * 无法识别的值返回 `undefined`，由诊断层失败关闭。
 */
export function normalizeDesignerRadiusValue(value: unknown): DesignerRadiusValue | undefined {
  if (typeof value === 'number') return isDesignerRadiusPx(value) ? value : undefined
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (trimmed in LEGACY_RADIUS_PRESETS) return LEGACY_RADIUS_PRESETS[trimmed]
  return parseDesignerRadiusInput(trimmed)
}

/**
 * 将容器圆角覆盖值归一为跟随表单、跟随系统或合法像素。
 *
 * 非法值回退为跟随表单，避免渲染期抛出类型异常。
 */
export function normalizeDesignerContainerRadiusOverride(
  value: unknown,
): DesignerContainerRadiusOverride {
  if (value === 'INHERIT') return 'INHERIT'
  return normalizeDesignerRadiusValue(value) ?? 'INHERIT'
}

/**
 * 解析检查器手输的圆角文本，例如 `16` 或 `16px`。
 *
 * 非 4 倍数或越界时返回 `undefined`，调用方不得写入文档。
 */
export function parseDesignerRadiusInput(raw: unknown): DesignerRadiusValue | undefined {
  if (raw === 'THEME') return 'THEME'
  if (typeof raw === 'number') return isDesignerRadiusPx(raw) ? raw : undefined
  if (typeof raw !== 'string') return undefined
  const trimmed = raw.trim()
  if (trimmed === 'THEME') return 'THEME'
  const numeric = Number.parseInt(trimmed.replace(/px$/i, ''), 10)
  if (String(numeric) !== trimmed.replace(/px$/i, '').trim()) return undefined
  return isDesignerRadiusPx(numeric) ? numeric : undefined
}

/**
 * 将圆角取值解析为 CSS 长度。
 *
 * `THEME` 继续消费宿主 `--el-border-radius-base`；数字写入明确像素。
 */
export function designerRadiusCssValue(radius: DesignerRadiusValue): string {
  return radius === 'THEME' ? 'var(--el-border-radius-base)' : `${radius}px`
}

/** 将圆角取值格式化为检查器可读文案。 */
export function designerRadiusValueLabel(radius: DesignerRadiusValue): string {
  if (radius === 'THEME') return '跟随系统'
  if (radius === 0) return '直角 0px'
  return `${radius}px`
}
