<template>
  <div class="designer-detail-field" :class="{ 'is-empty': empty, 'is-compact': compact }">
    <div v-if="showLabel" class="designer-detail-field__label">
      <span>{{ field.label }}</span>
      <ElTag v-if="field.required" size="small" type="danger" effect="plain">必填</ElTag>
    </div>

    <div class="designer-detail-field__value">
      <img
        v-if="field.componentType === 'signature' && imageValue"
        class="designer-detail-field__signature"
        :src="imageValue"
        alt="签名"
      />
      <div v-else-if="field.componentType === 'opinion'" class="designer-detail-field__opinion">
        <p>{{ opinionText || emptyText }}</p>
        <img v-if="opinionSignature" :src="opinionSignature" alt="意见签名" />
      </div>
      <div
        v-else-if="field.componentType === 'file' && detailFiles.length"
        class="designer-detail-field__files"
      >
        <ElTag v-for="file in detailFiles" :key="file.key" type="info" effect="plain">
          <DxSvgIcon icon="ri:attachment-2" />{{ file.name }}
        </ElTag>
      </div>
      <DxStepProgress
        v-else-if="field.componentType === 'steps'"
        :model-value="stepValue"
        :items="options"
        :direction="textConfiguration('direction') === 'vertical' ? 'vertical' : 'horizontal'"
        :compact="booleanConfiguration('simple')"
        :show-description="field.configuration.showDescription !== false"
        disabled
      />
      <ElTag
        v-else-if="typeof modelValue === 'boolean'"
        :type="modelValue ? 'success' : 'info'"
        effect="light"
      >
        {{ modelValue ? booleanActiveText : booleanInactiveText }}
      </ElTag>
      <div
        v-else-if="field.componentType === 'position' && positionItems.length"
        class="designer-detail-field__meta"
      >
        <span v-for="item in positionItems" :key="item.label">
          <small>{{ item.label }}</small
          >{{ item.value }}
        </span>
      </div>
      <p v-else-if="field.componentType === 'rich-text'" class="designer-detail-field__rich">
        {{ displayText }}
      </p>
      <span v-else>{{ displayText }}</span>
    </div>

    <small v-if="shouldShowHelp && field.helpText" class="designer-detail-field__help">{{
      field.helpText
    }}</small>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import DxSvgIcon from '../infrastructure/FormIcon.vue'
import dayjs from 'dayjs'
import { formatDesignerNumber } from '@daxiangme/form-core'
import type { DesignerField, DesignerOption } from '@daxiangme/form-core'
import DxStepProgress from '../form/controls/DxStepProgress.vue'

defineOptions({ name: 'DesignerDetailField' })

const props = withDefaults(
  defineProps<{
    field: DesignerField
    modelValue: unknown
    showLabel: boolean
    compact?: boolean
    showHelp?: boolean
  }>(),
  { compact: false },
)

const emptyText = '—'
const shouldShowHelp = computed(() => props.showHelp ?? !props.compact)
const options = computed<DesignerOption[]>(() =>
  normalizeOptions(props.field.configuration.options),
)
const empty = computed(() => isEmptyValue(props.modelValue))
const imageValue = computed(() =>
  typeof props.modelValue === 'string' && props.modelValue.startsWith('data:image/')
    ? props.modelValue
    : '',
)
const opinionText = computed(() => objectText(props.modelValue, 'opinion'))
const opinionSignature = computed(() => {
  const value = objectText(props.modelValue, 'signature')
  return value.startsWith('data:image/') ? value : ''
})
const detailFiles = computed(() => {
  if (!Array.isArray(props.modelValue)) return []
  return props.modelValue.flatMap((item, index) => {
    if (typeof item === 'string' && item) {
      return [{ key: `file-string-${index}-${item}`, name: item }]
    }
    if (typeof item !== 'object' || item === null) return []
    const source = item as Record<string, unknown>
    const name = source.name
    if (typeof name !== 'string' || !name) return []
    const identity = source.uid ?? source.id ?? source.url ?? name
    return [{ key: `file-object-${String(identity)}-${index}`, name }]
  })
})
const stepValue = computed(() =>
  typeof props.modelValue === 'number' || typeof props.modelValue === 'string'
    ? props.modelValue
    : 0,
)
const booleanActiveText = computed(() => textConfiguration('activeText') || '是')
const booleanInactiveText = computed(() => textConfiguration('inactiveText') || '否')
const positionItems = computed(() => {
  if (
    typeof props.modelValue !== 'object' ||
    props.modelValue === null ||
    Array.isArray(props.modelValue)
  )
    return []
  const source = props.modelValue as Record<string, unknown>
  const labels: Record<string, string> = {
    longitude: '经度',
    latitude: '纬度',
    accuracy: '精度',
    capturedAt: '采集时间',
  }
  return Object.entries(labels).flatMap(([key, label]) => {
    const value = source[key]
    return isEmptyValue(value) ? [] : [{ label, value: String(value) }]
  })
})
const displayText = computed(() => formatValue(props.modelValue))

function formatValue(value: unknown): string {
  if (isEmptyValue(value)) return emptyText
  if (props.field.componentType === 'number' && typeof value === 'number')
    return formatNumber(value)
  if (['date', 'date-range', 'date-multiple'].includes(props.field.componentType))
    return formatDateValue(value)
  if (hasOptionSemantics()) return formatOptionValue(value)
  if (Array.isArray(value))
    return value.map(formatStructuredItem).filter(Boolean).join('、') || emptyText
  if (typeof value === 'object' && value !== null) return formatStructuredItem(value) || emptyText
  return String(value)
}

function formatNumber(value: number): string {
  return formatDesignerNumber(value, props.field.configuration)
}

function formatDateValue(value: unknown): string {
  const values = Array.isArray(value) ? value : [value]
  const dateTime = usesDateTimeSemantics()
  const format = resolveDateFormat(dateTime)
  const formatted = values.map((item) => formatDateItem(item, format, dateTime))
  return formatted.join(textConfiguration('separator') || ' 至 ')
}

function usesDateTimeSemantics(): boolean {
  if (props.field.semanticType === 'DATE_TIME') return true
  if (props.field.componentType === 'date') return textConfiguration('dateType') === 'datetime'
  return props.field.componentType === 'date-range' && textConfiguration('rangeType') === 'DATETIME'
}

function resolveDateFormat(dateTime: boolean): string {
  const configuredFormat = textConfiguration('format')
  if (configuredFormat) return configuredFormat
  if (props.field.componentType === 'date' && textConfiguration('dateType') === 'month')
    return 'YYYY-MM'
  if (props.field.componentType === 'date' && textConfiguration('dateType') === 'year')
    return 'YYYY'
  return dateTime ? 'YYYY-MM-DD HH:mm:ss' : 'YYYY-MM-DD'
}

function formatDateItem(value: unknown, format: string, dateTime: boolean): string {
  if (typeof value !== 'string' && typeof value !== 'number' && !(value instanceof Date)) {
    return String(value)
  }
  const normalizedValue = !dateTime && typeof value === 'string' ? calendarDatePrefix(value) : value
  const parsed = dayjs(normalizedValue)
  return parsed.isValid() ? parsed.format(format) : String(value)
}

function calendarDatePrefix(value: string): string {
  const matched = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  return matched ? `${matched[1]}-${matched[2]}-${matched[3]}` : value
}

function formatOptionValue(value: unknown): string {
  const values = Array.isArray(value) ? value : [value]
  return (
    values
      .map((item) => findOptionLabel(options.value, item) ?? formatStructuredItem(item))
      .filter(Boolean)
      .join('、') || emptyText
  )
}

function formatStructuredItem(value: unknown): string {
  if (isEmptyValue(value)) return ''
  if (typeof value !== 'object' || value === null) return String(value)
  const source = value as Record<string, unknown>
  for (const key of ['label', 'name', 'title', 'displayName', 'value']) {
    const candidate = source[key]
    if (['string', 'number', 'boolean'].includes(typeof candidate)) return String(candidate)
  }
  return Object.entries(source)
    .filter(([, item]) => !isEmptyValue(item))
    .map(([key, item]) => `${key}：${String(item)}`)
    .join('；')
}

function hasOptionSemantics(): boolean {
  return [
    'select',
    'multi-select',
    'checkbox',
    'radio',
    'dynamic-select',
    'dynamic-cascade',
    'region',
    'dictionary-tree',
  ].includes(props.field.componentType)
}

function findOptionLabel(items: DesignerOption[], value: unknown): string | undefined {
  for (const item of items) {
    if (item.value === value) return item.label
    const nested = findOptionLabel(item.children ?? [], value)
    if (nested) return nested
  }
  return undefined
}

function normalizeOptions(source: unknown): DesignerOption[] {
  if (!Array.isArray(source)) return []
  return source.map<DesignerOption>((item, index) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      return { label: String(item), value: String(item) }
    }
    const option = item as Record<string, unknown>
    const value = option.value
    return {
      label: String(option.label ?? `选项 ${index + 1}`),
      value: ['string', 'number', 'boolean'].includes(typeof value)
        ? (value as string | number | boolean)
        : `option-${index + 1}`,
      children: normalizeOptions(option.children),
    }
  })
}

function objectText(value: unknown, key: string): string {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return ''
  const candidate = (value as Record<string, unknown>)[key]
  return typeof candidate === 'string' ? candidate : ''
}

function isEmptyValue(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
  )
}

function textConfiguration(key: string): string {
  const value = props.field.configuration[key]
  return typeof value === 'string' ? value : ''
}

function booleanConfiguration(key: string): boolean {
  return props.field.configuration[key] === true
}
</script>

<style scoped>
.designer-detail-field {
  min-width: 0;
  padding: var(--daxiang-form-space-2) 0;
}

.designer-detail-field.is-compact {
  padding: 0;
}

.designer-detail-field__label {
  display: flex;
  min-width: 0;
  align-items: center;
  margin-bottom: var(--daxiang-form-space-1);
  color: var(--el-text-color-secondary);
  gap: var(--daxiang-form-space-2);
  font-size: 12px;
}

.designer-detail-field__value {
  min-height: 24px;
  color: var(--el-text-color-primary);
  line-height: 24px;
  overflow-wrap: anywhere;
}

.designer-detail-field.is-empty .designer-detail-field__value {
  color: var(--el-text-color-placeholder);
}

.designer-detail-field__help {
  display: block;
  margin-top: var(--daxiang-form-space-1);
  color: var(--el-text-color-secondary);
  line-height: 18px;
}

.designer-detail-field__signature,
.designer-detail-field__opinion img {
  display: block;
  max-width: 240px;
  max-height: 96px;
  object-fit: contain;
}

.designer-detail-field__opinion,
.designer-detail-field__files,
.designer-detail-field__meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--daxiang-form-space-2);
}

.designer-detail-field__opinion {
  flex-direction: column;
}

.designer-detail-field__opinion p,
.designer-detail-field__rich {
  margin: 0;
  white-space: pre-wrap;
}

.designer-detail-field__meta > span {
  display: inline-flex;
  flex-direction: column;
  padding: var(--daxiang-form-space-1) var(--daxiang-form-space-2);
  background: var(--el-fill-color-light);
  border-radius: var(--el-border-radius-small);
}

.designer-detail-field__meta small {
  color: var(--el-text-color-secondary);
  line-height: 16px;
}
</style>
