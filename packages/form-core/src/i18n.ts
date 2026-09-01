import type { DesignerI18nConfiguration } from './types'

/**
 * 按当前语言、默认语言和原文的固定顺序解释设计器国际化词条。
 *
 * 空翻译不会遮蔽后续回退值，未启用国际化时直接返回原文。
 */
export function resolveDesignerLocalizedText(
  configuration: DesignerI18nConfiguration,
  key: string,
  locale: string,
  fallback: string,
): string {
  if (!configuration.enabled) return fallback
  const entry = configuration.entries.find((item) => item.key === key)
  if (!entry) return fallback
  const localized = entry.values[locale]?.trim()
  if (localized) return localized
  const defaultText = entry.values[configuration.defaultLocale]?.trim()
  return defaultText || fallback
}

/** 生成字段标签约定使用的稳定词条 key。 */
export function designerFieldLabelI18nKey(fieldKey: string): string {
  return `field_${sanitizeKeyPart(fieldKey)}_label`
}

/** 生成字段帮助文字约定使用的稳定词条 key。 */
export function designerFieldHelpI18nKey(fieldKey: string): string {
  return `field_${sanitizeKeyPart(fieldKey)}_help`
}

/** 生成动作栏按钮约定使用的稳定词条 key。 */
export function designerActionI18nKey(action: string): string {
  return `action_${sanitizeKeyPart(action.toLowerCase())}_label`
}

/** 生成弹层模块名称约定使用的稳定词条 key。 */
export function designerModuleI18nKey(moduleCode: string): string {
  return `module_${sanitizeKeyPart(moduleCode)}_name`
}

function sanitizeKeyPart(value: string): string {
  const normalized = value.replace(/[^A-Za-z0-9_]/g, '_')
  return /^[A-Za-z]/.test(normalized) ? normalized : `key_${normalized}`
}
