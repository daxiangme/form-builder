<template>
  <div class="designer-field-assignments-editor">
    <div
      v-for="(item, index) in assignments"
      :key="index"
      class="designer-field-assignments-editor__row"
    >
      <ElSelect
        :model-value="item.sourceKey"
        filterable
        allow-create
        default-first-option
        placeholder="来源键"
        @update:model-value="update(index, 'sourceKey', $event)"
      >
        <ElOption
          v-for="option in sourceOptions"
          :key="String(option.value)"
          :label="option.label"
          :value="option.value"
        />
      </ElSelect>
      <ElSelect
        :model-value="item.targetFieldId"
        filterable
        placeholder="目标字段"
        @update:model-value="update(index, 'targetFieldId', $event)"
      >
        <ElOption
          v-for="field in fieldCandidates"
          :key="field.id"
          :label="field.label"
          :value="field.id"
        />
      </ElSelect>
      <FormButton
        link
        type="danger"
        aria-label="删除映射"
        icon="ri:delete-bin-line"
        @click="remove(index)"
      />
    </div>
    <FormButton link icon="ri:add-line" @click="add">添加映射</FormButton>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import FormButton from '../infrastructure/FormButton.vue'
import {
  parseDesignerResultKeys,
  type DesignerFieldAssignment,
  type DesignerPropertyOption,
} from '@daxiangme/form-core'

defineOptions({ name: 'DesignerFieldAssignmentsEditor' })

const props = withDefaults(
  defineProps<{
    modelValue: unknown
    configuration?: Readonly<Record<string, unknown>>
    sourceKeys?: DesignerPropertyOption[]
    fieldCandidates?: Array<{ id: string; label: string }>
  }>(),
  { configuration: () => ({}), fieldCandidates: () => [], sourceKeys: () => [] },
)
const emit = defineEmits<{ 'update:modelValue': [value: DesignerFieldAssignment[]] }>()
const assignments = computed(() => readAssignmentDrafts(props.modelValue))
const sourceOptions = computed<DesignerPropertyOption[]>(() => {
  if (props.sourceKeys.length) return props.sourceKeys
  return parseDesignerResultKeys(props.configuration.resultKeys).map((item) => ({
    label: item.name || item.key,
    value: item.key,
  }))
})

function update(index: number, key: keyof DesignerFieldAssignment, value: unknown): void {
  if (typeof value !== 'string') return
  const next = assignments.value.map((item) => ({ ...item }))
  const current = next[index]
  if (!current) return
  current[key] = value
  emit('update:modelValue', next)
}

function add(): void {
  emit('update:modelValue', [...assignments.value, { sourceKey: '', targetFieldId: '' }])
}

function remove(index: number): void {
  emit(
    'update:modelValue',
    assignments.value.filter((_, current) => current !== index),
  )
}

/** 编辑器保留未填完的映射行；运行期解析仍会丢弃空键。 */
function readAssignmentDrafts(value: unknown): DesignerFieldAssignment[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return []
    const sourceKey = (item as Record<string, unknown>).sourceKey
    const targetFieldId = (item as Record<string, unknown>).targetFieldId
    return [
      {
        sourceKey: typeof sourceKey === 'string' ? sourceKey : '',
        targetFieldId: typeof targetFieldId === 'string' ? targetFieldId : '',
      },
    ]
  })
}
</script>

<style scoped>
.designer-field-assignments-editor {
  display: flex;
  flex-direction: column;
  gap: var(--daxiang-form-space-2);
}

.designer-field-assignments-editor__row {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: var(--daxiang-form-space-1);
}
</style>
