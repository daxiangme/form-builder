<template>
  <div class="designer-result-keys-editor">
    <div v-for="(item, index) in keys" :key="index" class="designer-result-keys-editor__row">
      <ElInput
        :model-value="item.key"
        placeholder="返回值键"
        @update:model-value="update(index, 'key', $event)"
      />
      <ElInput
        :model-value="item.name"
        placeholder="显示名称"
        @update:model-value="update(index, 'name', $event)"
      />
      <FormButton
        link
        type="danger"
        aria-label="删除返回值"
        icon="ri:delete-bin-line"
        @click="remove(index)"
      />
    </div>
    <FormButton link icon="ri:add-line" @click="add">添加返回值</FormButton>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import FormButton from '../infrastructure/FormButton.vue'
import type { DesignerResultKey } from '@daxiangme/form-core'

defineOptions({ name: 'DesignerResultKeysEditor' })

const props = defineProps<{ modelValue: unknown }>()
const emit = defineEmits<{ 'update:modelValue': [value: DesignerResultKey[]] }>()
const keys = computed(() => readResultKeyDrafts(props.modelValue))

function update(index: number, key: keyof DesignerResultKey, value: string): void {
  const next = keys.value.map((item) => ({ ...item }))
  const current = next[index]
  if (!current) return
  current[key] = value
  emit('update:modelValue', next)
}

function add(): void {
  emit('update:modelValue', [...keys.value, { key: '', name: '' }])
}

function remove(index: number): void {
  emit(
    'update:modelValue',
    keys.value.filter((_, current) => current !== index),
  )
}

/** 编辑器保留未填完的返回值行；运行期解析仍会丢弃空键。 */
function readResultKeyDrafts(value: unknown): DesignerResultKey[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return []
    const key = (item as Record<string, unknown>).key
    const name = (item as Record<string, unknown>).name
    return [
      {
        key: typeof key === 'string' ? key : '',
        name: typeof name === 'string' ? name : '',
      },
    ]
  })
}
</script>

<style scoped>
.designer-result-keys-editor {
  display: flex;
  flex-direction: column;
  gap: var(--daxiang-form-space-2);
}

.designer-result-keys-editor__row {
  display: flex;
  gap: var(--daxiang-form-space-1);
}
</style>
