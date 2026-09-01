<template>
  <DModal
    v-model="visibleModel"
    title="批量设置字段默认值"
    width="min(760px, calc(100vw - 32px))"
    confirm-text="应用默认值"
    :confirm-disabled="selectedIds.length === 0"
    :flush-content-vertical="true"
    @confirm="save"
  >
    <ElAlert
      type="info"
      :closable="false"
      show-icon
      title="整次应用形成一个可撤销命令"
      description="主键、系统字段、文件、对象和未接 Adapter 的引用字段已自动排除。"
    />
    <div class="designer-batch-default-editor">
      <article v-for="field in fields" :key="field.id">
        <ElCheckbox v-model="selectedMap[field.id]" :label="field.id">
          <span
            ><strong>{{ field.label }}</strong
            ><small>{{ field.key }} · {{ field.semanticType }}</small></span
          >
        </ElCheckbox>
        <DesignerFieldDefaultValueEditor
          :field="draftField(field)"
          @update:model-value="values[field.id] = $event"
        />
      </article>
      <ElEmpty v-if="fields.length === 0" description="当前文档没有可批量设置的字段" />
    </div>
  </DModal>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import DModal from '../infrastructure/FormModalShell.vue'
import type { DesignerField } from '@daxiangme/form-core'
import DesignerFieldDefaultValueEditor from './DesignerFieldDefaultValueEditor.vue'

defineOptions({ name: 'DesignerBatchDefaultEditor' })

const props = defineProps<{ fields: DesignerField[] }>()
const emit = defineEmits<{ save: [values: Record<string, unknown>] }>()
const visibleModel = defineModel<boolean>({ default: false })
const selectedMap = reactive<Record<string, boolean>>({})
const values = reactive<Record<string, unknown>>({})
const selectedIds = computed(() =>
  props.fields.filter((field) => selectedMap[field.id]).map((field) => field.id),
)

watch(visibleModel, (visible) => {
  if (!visible) return
  clearRecord(selectedMap)
  clearRecord(values)
  for (const field of props.fields) values[field.id] = cloneValue(field.defaultValue)
})

function draftField(field: DesignerField): DesignerField {
  return { ...field, defaultValue: values[field.id] }
}

function save(): void {
  emit(
    'save',
    Object.fromEntries(selectedIds.value.map((fieldId) => [fieldId, cloneValue(values[fieldId])])),
  )
  visibleModel.value = false
}

function clearRecord(record: Record<string, unknown>): void {
  for (const key of Object.keys(record)) delete record[key]
}

function cloneValue<T>(value: T): T {
  if (value === undefined || value === null) return value
  if (typeof globalThis.structuredClone === 'function') {
    try {
      return globalThis.structuredClone(value)
    } catch {
      // 默认值中的宿主对象无法结构化克隆时继续使用保守递归策略。
    }
  }
  if (Array.isArray(value)) return value.map((item) => cloneValue(item)) as T
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        cloneValue(item),
      ]),
    ) as T
  }
  return value
}
</script>

<style scoped>
.designer-batch-default-editor {
  display: flex;
  max-height: 560px;
  padding-top: var(--daxiang-form-space-3);
  flex-direction: column;
  overflow-y: auto;
  gap: var(--daxiang-form-space-2);
}

.designer-batch-default-editor article {
  display: grid;
  align-items: center;
  padding: var(--daxiang-form-space-2);
  background: var(--el-fill-color-extra-light);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--el-border-radius-base);
  grid-template-columns: minmax(180px, 0.8fr) minmax(220px, 1.2fr);
  gap: var(--daxiang-form-space-3);
}

.designer-batch-default-editor article span {
  display: flex;
  flex-direction: column;
}

.designer-batch-default-editor small {
  color: var(--el-text-color-secondary);
  font-size: 11px;
}
</style>
