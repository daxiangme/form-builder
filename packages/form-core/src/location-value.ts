import type { FormLocationField, FormLocationValue } from './types'

/** 定位结果中可供勾选输出或表达式读取的键。 */
export const FORM_LOCATION_OUTPUT_FIELDS: FormLocationField[] = [
  'longitude',
  'latitude',
  'address',
  'name',
  'province',
  'city',
  'district',
  'township',
  'streetAddress',
  'adcode',
  'adcodePath',
  'source',
  'collectedAt',
  'provider',
  'accuracyMeters',
]

/** 选点弹窗相对视口宽度的默认百分比。 */
export const FORM_LOCATION_DEFAULT_PICKER_DIALOG_WIDTH = 60

/** 选点弹窗宽度允许的最小值（百分比）。 */
export const FORM_LOCATION_MIN_PICKER_DIALOG_WIDTH = 30

/** 选点弹窗宽度允许的最大值（百分比）。 */
export const FORM_LOCATION_MAX_PICKER_DIALOG_WIDTH = 100

/**
 * 将设计态填写的选点弹窗宽度规范为 30–100 的百分比。
 *
 * @param value 字段配置 `pickerDialogWidth`
 * @returns 可直接用于 CSS 的百分比数值
 */
export function resolveLocationPickerDialogWidth(value: unknown): number {
  const numeric =
    typeof value === 'number' && Number.isFinite(value)
      ? value
      : FORM_LOCATION_DEFAULT_PICKER_DIALOG_WIDTH
  return Math.min(
    FORM_LOCATION_MAX_PICKER_DIALOG_WIDTH,
    Math.max(FORM_LOCATION_MIN_PICKER_DIALOG_WIDTH, Math.round(numeric)),
  )
}

/** 新建定位字段时默认勾选的输出键，含追溯元数据。 */
export const FORM_LOCATION_DEFAULT_OUTPUT_FIELDS: FormLocationField[] = [
  'longitude',
  'latitude',
  'address',
  'province',
  'city',
  'district',
  'provider',
  'collectedAt',
  'source',
]

const LOCATION_OUTPUT_FIELD_SET = new Set<string>(FORM_LOCATION_OUTPUT_FIELDS)

/**
 * 判断取值是否为合法的定位输出字段名。
 *
 * @param value 待检查值
 * @returns 属于固定 VO 可勾选键时返回 true
 */
export function isFormLocationField(value: unknown): value is FormLocationField {
  return typeof value === 'string' && LOCATION_OUTPUT_FIELD_SET.has(value)
}

/**
 * 按设计态勾选裁剪定位结果。坐标系在写出经纬度时强制带上。
 *
 * 未勾选的键不写入，以便区分「没配」和「采不到」。
 *
 * @param value Adapter 返回的完整结果
 * @param outputFields 设计态勾选
 * @returns 写入字段值的裁剪副本
 */
export function cropFormLocationValue(
  value: FormLocationValue,
  outputFields: readonly string[],
): Record<string, unknown> {
  const selected = new Set(outputFields.filter(isFormLocationField))
  const cropped: Record<string, unknown> = {}
  if (selected.has('longitude') || selected.has('latitude')) {
    if (selected.has('longitude')) cropped.longitude = value.longitude
    if (selected.has('latitude')) cropped.latitude = value.latitude
    cropped.coordinateSystem = 'GCJ02'
  }
  for (const key of FORM_LOCATION_OUTPUT_FIELDS) {
    if (key === 'longitude' || key === 'latitude' || !selected.has(key)) continue
    const next = value[key]
    if (next !== undefined) cropped[key] = next
  }
  return cropped
}
