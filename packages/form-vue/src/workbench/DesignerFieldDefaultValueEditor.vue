<template>
  <div class="designer-default-value-editor">
    <ElInputNumber
      v-if="field.semanticType === 'NUMBER' && field.componentType !== 'rate'"
      :model-value="numberValue"
      :min="numberConfiguration('minimum')"
      :max="numberConfiguration('maximum')"
      :step="numberConfiguration('step') ?? 1"
      :precision="integerConfiguration('precision')"
      @update:model-value="emitValue($event ?? null)"
    />
    <ElRate
      v-else-if="field.componentType === 'rate'"
      :model-value="numberValue ?? 0"
      :max="integerConfiguration('max') ?? 5"
      :allow-half="field.configuration.allowHalf === true"
      clearable
      @update:model-value="emitValue"
    />
    <ElSwitch
      v-else-if="field.semanticType === 'BOOLEAN'"
      :model-value="field.defaultValue === true"
      @update:model-value="emitValue(Boolean($event))"
    />
    <ElDatePicker
      v-else-if="field.componentType === 'date'"
      :model-value="stringValue"
      :type="datePickerType"
      :value-format="dateValueFormat"
      clearable
      @update:model-value="emitValue($event ?? '')"
    />
    <ElSelect
      v-else-if="field.componentType === 'steps'"
      :model-value="primitiveValue"
      clearable
      placeholder="请选择默认步骤"
      @update:model-value="emitValue"
    >
      <ElOption
        v-for="option in fieldOptions"
        :key="String(option.value)"
        :label="option.label"
        :value="option.value"
        :disabled="option.disabled"
      />
    </ElSelect>
    <ElSelect
      v-else-if="usesOptionDefault"
      :model-value="optionDefaultValue"
      :multiple="multipleOptionDefault"
      clearable
      placeholder="请选择默认值"
      @update:model-value="emitValue"
    >
      <ElOption
        v-for="option in fieldOptions"
        :key="String(option.value)"
        :label="option.label"
        :value="option.value"
        :disabled="option.disabled"
      />
    </ElSelect>
    <template v-else-if="defaultValueUnavailable">
      <ElTag effect="plain" type="info">不设置默认值</ElTag>
      <small>{{ defaultValueUnavailable }}</small>
    </template>
    <ElInput
      v-else
      :model-value="stringValue"
      :maxlength="textMaximumLength"
      @update:model-value="emitValue"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { DesignerField, DesignerOption } from '@daxiangme/form-core'

defineOptions({ name: 'DesignerFieldDefaultValueEditor' })

const props = defineProps<{ field: DesignerField }>()
const emit = defineEmits<{ 'update:modelValue': [value: unknown] }>()

const numberValue = computed(() =>
  typeof props.field.defaultValue === 'number' && Number.isFinite(props.field.defaultValue)
    ? props.field.defaultValue
    : undefined,
)
const stringValue = computed(() =>
  typeof props.field.defaultValue === 'string' ? props.field.defaultValue : '',
)
const primitiveValue = computed(() =>
  ['string', 'number', 'boolean'].includes(typeof props.field.defaultValue)
    ? (props.field.defaultValue as string | number | boolean)
    : undefined,
)
const fieldOptions = computed(() => normalizeFieldOptions(props.field.configuration.options))
const multipleOptionDefault = computed(
  () =>
    ['multi-select', 'checkbox'].includes(props.field.componentType) ||
    (props.field.componentType === 'dynamic-select' && props.field.configuration.multiple === true),
)
const optionDefaultValue = computed(() => {
  if (multipleOptionDefault.value)
    return Array.isArray(props.field.defaultValue) ? props.field.defaultValue : []
  return primitiveValue.value
})
const usesOptionDefault = computed(() =>
  ['select', 'multi-select', 'checkbox', 'radio', 'dynamic-select'].includes(
    props.field.componentType,
  ),
)
const defaultValueUnavailable = computed(() => {
  if (props.field.semanticType === 'FILE')
    return '文件默认值必须来自受控文件资源，静态 Core 不伪造文件引用'
  if (props.field.semanticType === 'OBJECT') return '对象默认值必须由对应能力 Adapter 提供'
  if (props.field.semanticType === 'REFERENCE')
    return '资源引用 Adapter 尚未接入，不能设置伪造默认值'
  if (props.field.semanticType === 'ARRAY' && !usesOptionDefault.value)
    return '当前数组组件不支持静态默认值'
  return ''
})
const datePickerType = computed<'date' | 'datetime' | 'month' | 'year'>(() => {
  const configured = props.field.configuration.dateType
  return ['date', 'datetime', 'month', 'year'].includes(String(configured))
    ? (configured as 'date' | 'datetime' | 'month' | 'year')
    : 'date'
})
const dateValueFormat = computed(() => {
  if (datePickerType.value === 'datetime') return 'YYYY-MM-DD HH:mm:ss'
  if (datePickerType.value === 'month') return 'YYYY-MM'
  if (datePickerType.value === 'year') return 'YYYY'
  return 'YYYY-MM-DD'
})
const textMaximumLength = computed(() => {
  const configured = props.field.configuration.maxLength
  return typeof configured === 'number' && Number.isInteger(configured) ? configured : undefined
})

function emitValue(value: unknown): void {
  emit('update:modelValue', value)
}

function numberConfiguration(key: string): number | undefined {
  const value = props.field.configuration[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function integerConfiguration(key: string): number | undefined {
  const value = numberConfiguration(key)
  return value !== undefined && Number.isInteger(value) ? value : undefined
}

function normalizeFieldOptions(value: unknown): DesignerOption[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (item): item is DesignerOption =>
      typeof item === 'object' &&
      item !== null &&
      typeof (item as DesignerOption).label === 'string' &&
      ['string', 'number', 'boolean'].includes(typeof (item as DesignerOption).value),
  )
}
</script>

<style scoped>
.designer-default-value-editor,
.designer-default-value-editor :deep(.el-select),
.designer-default-value-editor :deep(.el-input-number),
.designer-default-value-editor :deep(.el-date-editor) {
  width: 100%;
}

.designer-default-value-editor small {
  display: block;
  margin-top: var(--daxiang-form-space-1);
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
</style>
