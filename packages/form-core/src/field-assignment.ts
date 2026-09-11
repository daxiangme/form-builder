import type { DesignerField, DesignerFieldAssignment, DesignerResultKey } from './types'

/**
 * 将配置中的回填映射规范化为受控映射列表。
 *
 * @param value 字段配置中的 fieldMappings
 * @returns 合法映射；非法项丢弃
 */
export function parseDesignerFieldAssignments(value: unknown): DesignerFieldAssignment[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return []
    const sourceKey = (item as Record<string, unknown>).sourceKey
    const targetFieldId = (item as Record<string, unknown>).targetFieldId
    if (typeof sourceKey !== 'string' || !sourceKey) return []
    if (typeof targetFieldId !== 'string' || !targetFieldId) return []
    return [{ sourceKey, targetFieldId }]
  })
}

/**
 * 将 OCR 手动声明的返回值列表规范化。
 *
 * @param value 字段配置中的 resultKeys
 * @returns 合法结果键
 */
export function parseDesignerResultKeys(value: unknown): DesignerResultKey[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return []
    const key = (item as Record<string, unknown>).key
    const name = (item as Record<string, unknown>).name
    if (typeof key !== 'string' || !key) return []
    return [{ key, name: typeof name === 'string' && name ? name : key }]
  })
}

/**
 * 读取对象值字段可供表达式使用的一级属性名。
 *
 * OCR 以字段自身 `resultKeys` 为准；定位与审批意见使用静态键。
 *
 * @param field 当前字段
 * @param valueKeys 注册表声明的静态键
 * @returns 允许的属性名
 */
export function resolveDesignerFieldValueKeys(
  field: DesignerField,
  valueKeys?: readonly string[],
): string[] {
  if (field.componentType === 'ocr') {
    return parseDesignerResultKeys(field.configuration.resultKeys).map((item) => item.key)
  }
  return [...(valueKeys ?? [])]
}
