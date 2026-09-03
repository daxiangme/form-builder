<template>
  <div class="designer-property-editor">
    <ElInput
      v-if="editor.type === 'TEXT'"
      :model-value="stringValue"
      :maxlength="editor.maxLength"
      @update:model-value="emitValue"
    />
    <ElInput
      v-else-if="editor.type === 'TEXTAREA'"
      :model-value="stringValue"
      type="textarea"
      :rows="editor.rows ?? 3"
      :maxlength="editor.maxLength"
      @update:model-value="emitValue"
    />
    <template v-else-if="editor.type === 'IDENTIFIER'">
      <ElInput
        :model-value="identifierDraft"
        :maxlength="editor.maxLength ?? 64"
        placeholder="以字母开头，仅字母、数字和下划线"
        @update:model-value="updateIdentifierDraft"
        @blur="commitIdentifier"
        @keydown.enter="blurIdentifier"
      />
      <small v-if="identifierTouched && identifierError" class="designer-property-editor__error">
        {{ identifierError }}
      </small>
    </template>
    <div v-else-if="editor.type === 'NUMBER'" class="designer-property-editor__unit-control">
      <ElInputNumber
        :model-value="numberValue"
        :min="editor.minimum"
        :max="editor.maximum"
        :step="editor.step ?? 1"
        @update:model-value="emitNumberValue"
      />
      <span v-if="editor.unit">{{ editor.unit }}</span>
    </div>
    <ElSwitch
      v-else-if="editor.type === 'BOOLEAN'"
      :model-value="modelValue === true"
      @update:model-value="emitValue(Boolean($event))"
    />
    <ElSelect
      v-else-if="editor.type === 'RADIUS'"
      :model-value="primitiveValue"
      filterable
      allow-create
      default-first-option
      placeholder="跟随系统或 4 的倍数 px"
      @update:model-value="emitRadiusValue"
    >
      <ElOption
        v-for="option in radiusOptions"
        :key="String(option.value)"
        :label="option.label"
        :value="option.value"
      />
    </ElSelect>
    <ElSelect
      v-else-if="editor.type === 'SELECT' || editor.type === 'PRESET_NUMBER'"
      :model-value="primitiveValue"
      @update:model-value="emitValue"
    >
      <ElOption
        v-for="option in controlledOptions"
        :key="String(option.value)"
        :label="option.label"
        :value="option.value"
        :disabled="option.disabled"
      />
    </ElSelect>
    <ElSegmented
      v-else-if="editor.type === 'SEGMENTED'"
      :model-value="primitiveValue"
      :options="controlledOptions"
      @update:model-value="emitValue"
    />
    <ElColorPicker
      v-else-if="editor.type === 'COLOR'"
      :model-value="stringValue"
      @update:model-value="emitValue($event ?? '')"
    />
    <DesignerOptionsEditor
      v-else-if="editor.type === 'OPTIONS'"
      :model-value="modelValue"
      @update:model-value="emitValue"
    />
    <ElSelect
      v-else-if="editor.type === 'DATE_FORMAT'"
      :model-value="primitiveValue"
      @update:model-value="emitValue"
    >
      <ElOption
        v-for="option in controlledOptions"
        :key="String(option.value)"
        :label="option.label"
        :value="option.value"
      />
    </ElSelect>
    <ElSelect
      v-else-if="editor.type === 'FILE_TYPES'"
      :model-value="selectedFileExtensions"
      multiple
      collapse-tags
      collapse-tags-tooltip
      clearable
      placeholder="不限文件类型"
      @update:model-value="updateFileTypes"
    >
      <ElOptionGroup label="快捷分组">
        <ElOption
          v-for="option in fileTypeGroups"
          :key="option.value"
          :label="option.label"
          :value="option.value"
        />
      </ElOptionGroup>
      <ElOptionGroup label="扩展名">
        <ElOption
          v-for="option in fileExtensionOptions"
          :key="option.value"
          :label="option.label"
          :value="option.value"
        />
      </ElOptionGroup>
    </ElSelect>
    <template v-else-if="editor.type === 'URL'">
      <ElInput
        :model-value="urlDraft"
        :maxlength="editor.maxLength"
        placeholder="https://"
        clearable
        @update:model-value="updateUrlDraft"
      />
      <small v-if="urlError" class="designer-property-editor__error">{{ urlError }}</small>
    </template>
    <template v-else-if="editor.type === 'RESOURCE_REFERENCE'">
      <ElInput :model-value="stringValue" disabled :placeholder="`尚未选择${resourceLabel}`" />
      <small class="designer-property-editor__availability">{{ editor.unavailableReason }}</small>
    </template>
    <ElSelect
      v-else-if="editor.type === 'GRID_SPAN' || editor.type === 'GRID_OFFSET'"
      :model-value="primitiveValue"
      @update:model-value="emitValue"
    >
      <ElOption
        v-for="option in controlledOptions"
        :key="String(option.value)"
        :label="option.label"
        :value="option.value"
      />
    </ElSelect>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { DesignerPropertyDefinition, DesignerPropertyOption } from '@daxiangme/form-core'
import {
  DESIGNER_FILE_TYPE_OPTIONS,
  DESIGNER_MOBILE_SPAN_PRESETS,
  DESIGNER_PC_SPAN_PRESETS,
  designerDateFormatOptions,
  designerRadiusEditorOptions,
  designerRadiusValueLabel,
  includeDesignerCurrentOption,
  numberOptions,
  parseDesignerRadiusInput,
} from '@daxiangme/form-core'
import DesignerOptionsEditor from './DesignerOptionsEditor.vue'

defineOptions({ name: 'DesignerPropertyEditorHost' })

const props = withDefaults(
  defineProps<{
    definition: DesignerPropertyDefinition
    modelValue: unknown
    configuration?: Readonly<Record<string, unknown>>
  }>(),
  {
    configuration: () => ({}),
  },
)
const emit = defineEmits<{ 'update:modelValue': [value: unknown] }>()
const urlDraft = ref('')
const identifierDraft = ref('')
const identifierTouched = ref(false)

const editor = computed(() => props.definition.editor)
const stringValue = computed(() => (typeof props.modelValue === 'string' ? props.modelValue : ''))
const numberValue = computed(() =>
  typeof props.modelValue === 'number' && Number.isFinite(props.modelValue)
    ? props.modelValue
    : undefined,
)
const primitiveValue = computed(() =>
  ['string', 'number', 'boolean'].includes(typeof props.modelValue)
    ? (props.modelValue as string | number | boolean)
    : undefined,
)
const controlledOptions = computed<DesignerPropertyOption[]>(() => {
  const currentEditor = editor.value
  if (currentEditor.type === 'DATE_FORMAT') {
    return includeDesignerCurrentOption(
      designerDateFormatOptions(props.configuration[currentEditor.sourceKey]),
      props.modelValue,
    )
  }
  if (currentEditor.type === 'GRID_SPAN') {
    const presets =
      currentEditor.device === 'desktop' ? DESIGNER_PC_SPAN_PRESETS : DESIGNER_MOBILE_SPAN_PRESETS
    return includeDesignerCurrentOption(presets, props.modelValue, (value) => `${value}/24`)
  }
  if (currentEditor.type === 'RADIUS') {
    return includeDesignerCurrentOption(
      designerRadiusEditorOptions(Boolean(currentEditor.includeInherit)),
      props.modelValue,
      (value) => (typeof value === 'number' ? designerRadiusValueLabel(value) : String(value)),
    )
  }
  if (currentEditor.type === 'GRID_OFFSET') {
    const span = finiteInteger(props.configuration[currentEditor.spanKey], 24)
    const maximum = Math.max(0, 24 - Math.max(1, Math.min(24, span)))
    const presets: DesignerPropertyOption[] = [
      { label: '无偏移', value: 0 },
      ...numberOptions(
        Array.from({ length: maximum }, (_, index) => index + 1),
        (value) => `${value}/24`,
      ),
    ]
    return includeDesignerCurrentOption(presets, props.modelValue, (value) => `${value}/24`)
  }
  if (
    currentEditor.type === 'SELECT' ||
    currentEditor.type === 'SEGMENTED' ||
    currentEditor.type === 'PRESET_NUMBER'
  ) {
    return currentEditor.legacyValuePolicy === 'PRESERVE' || currentEditor.type === 'PRESET_NUMBER'
      ? includeDesignerCurrentOption(
          currentEditor.options,
          props.modelValue,
          (value) => currentEditor.legacyValueLabels?.[String(value)] ?? String(value),
        )
      : currentEditor.options
  }
  return []
})
const radiusOptions = computed(() =>
  editor.value.type === 'RADIUS' ? controlledOptions.value : [],
)
const selectedFileExtensions = computed(() => parseFileExtensions(stringValue.value))
const fileTypeGroups = computed(() =>
  DESIGNER_FILE_TYPE_OPTIONS.filter((item) => item.group).map((item) => ({
    label: item.label,
    value: `group:${item.extensions.join('|')}`,
  })),
)
const fileExtensionOptions = computed(() => {
  const known = DESIGNER_FILE_TYPE_OPTIONS.filter((item) => !item.group).map((item) => ({
    label: item.label,
    value: item.extensions[0] ?? '',
  }))
  const knownValues = new Set(known.map((item) => item.value))
  const legacy = selectedFileExtensions.value
    .filter((extension) => !knownValues.has(extension))
    .map((extension) => ({ label: `当前扩展名 · ${extension}`, value: extension }))
  return [...legacy, ...known]
})
const urlError = computed(() => validateHttpsUrl(urlDraft.value))
const identifierError = computed(() => validateIdentifier(identifierDraft.value))
const resourceLabel = computed(() => {
  const currentEditor = editor.value
  if (currentEditor.type !== 'RESOURCE_REFERENCE') return '资源'
  return {
    DICTIONARY: '字典',
    PROCESS: '流程',
    FORM: '表单',
    ASSET_POLICY: '文件策略',
  }[currentEditor.resourceType]
})

watch(
  () => props.modelValue,
  (value) => {
    urlDraft.value = typeof value === 'string' ? value : ''
    identifierDraft.value = typeof value === 'string' ? value : ''
    identifierTouched.value = false
  },
  { immediate: true },
)

function emitValue(value: unknown): void {
  emit('update:modelValue', value)
}

function emitNumberValue(value: number | undefined): void {
  emitValue(value === undefined && props.modelValue === null ? null : value)
}

/** 仅提交跟随表单、跟随系统或合法 4 的倍数像素；手输 10 等非法值不落盘。 */
function emitRadiusValue(value: unknown): void {
  const currentEditor = editor.value
  if (currentEditor.type !== 'RADIUS') return
  if (currentEditor.includeInherit && value === 'INHERIT') {
    emitValue('INHERIT')
    return
  }
  const next = parseDesignerRadiusInput(value)
  if (next === undefined) return
  emitValue(next)
}

function updateUrlDraft(value: string): void {
  urlDraft.value = value
  if (!validateHttpsUrl(value)) emitValue(value)
}

function updateIdentifierDraft(value: string): void {
  identifierDraft.value = value
}

function commitIdentifier(): void {
  identifierTouched.value = true
  if (identifierError.value || identifierDraft.value === props.modelValue) return
  emitValue(identifierDraft.value)
}

function blurIdentifier(event: Event | KeyboardEvent): void {
  const target = event.currentTarget as HTMLInputElement | null
  target?.blur()
}

function updateFileTypes(values: string[]): void {
  const extensions = new Set<string>()
  for (const value of values) {
    if (value.startsWith('group:')) {
      for (const extension of value.slice('group:'.length).split('|')) extensions.add(extension)
      continue
    }
    extensions.add(normalizeExtension(value))
  }
  emitValue([...extensions].filter(Boolean).sort().join(','))
}

function parseFileExtensions(value: string): string[] {
  return [...new Set(value.split(',').map(normalizeExtension).filter(Boolean))]
}

function normalizeExtension(value: string): string {
  const normalized = value.trim().toLowerCase()
  if (!normalized) return ''
  return normalized.startsWith('.') ? normalized : `.${normalized}`
}

function validateHttpsUrl(value: string): string {
  if (!value.trim()) return ''
  try {
    return new URL(value).protocol === 'https:' ? '' : '仅允许 HTTPS 地址'
  } catch {
    return '请输入完整的 HTTPS 地址'
  }
}

function validateIdentifier(value: string): string {
  if (!value) return '编码不能为空'
  return /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(value)
    ? ''
    : '必须以字母开头，且只能包含字母、数字和下划线'
}

function finiteInteger(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) ? value : fallback
}
</script>

<style scoped>
.designer-property-editor,
.designer-property-editor :deep(.el-select),
.designer-property-editor :deep(.el-input-number),
.designer-property-editor :deep(.el-segmented) {
  width: 100%;
}

.designer-property-editor__unit-control {
  display: grid;
  align-items: center;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--daxiang-form-space-2);
}

.designer-property-editor__unit-control > span,
.designer-property-editor__availability {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.designer-property-editor__availability,
.designer-property-editor__error {
  display: block;
  margin-top: var(--daxiang-form-space-1);
}

.designer-property-editor__error {
  color: var(--el-color-danger);
  font-size: 12px;
}
</style>
