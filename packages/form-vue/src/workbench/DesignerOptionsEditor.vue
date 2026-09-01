<template>
  <div class="designer-options-editor">
    <div v-for="(option, index) in options" :key="index" class="designer-options-editor__row">
      <ElInput
        :model-value="option.label"
        placeholder="显示文字"
        @change="updateOption(index, 'label', $event)"
      />
      <ElInput
        :model-value="String(option.value)"
        placeholder="选项值"
        @change="updateOption(index, 'value', $event)"
      />
      <ElButton link type="danger" aria-label="删除选项" @click="removeOption(index)">
        <DxSvgIcon icon="ri:delete-bin-line" />
      </ElButton>
    </div>
    <ElButton link @click="addOption"><DxSvgIcon icon="ri:add-line" />添加选项</ElButton>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import DxSvgIcon from '../infrastructure/FormIcon.vue'
import type { DesignerOption } from '@daxiangme/form-core'

defineOptions({ name: 'DesignerOptionsEditor' })

const props = defineProps<{ modelValue: unknown }>()
const emit = defineEmits<{ 'update:modelValue': [value: DesignerOption[]] }>()
const options = computed(() => normalizeOptions(props.modelValue))

function updateOption(index: number, key: 'label' | 'value', value: string): void {
  const next = cloneOptions()
  const current = next[index]
  if (!current) return
  current[key] = value
  emit('update:modelValue', next)
}

function addOption(): void {
  const next = cloneOptions()
  next.push({ label: `选项 ${next.length + 1}`, value: `option-${next.length + 1}` })
  emit('update:modelValue', next)
}

function removeOption(index: number): void {
  const next = cloneOptions()
  next.splice(index, 1)
  emit('update:modelValue', next)
}

function cloneOptions(): DesignerOption[] {
  return options.value.map((item) => ({ ...item }))
}

function normalizeOptions(source: unknown): DesignerOption[] {
  if (!Array.isArray(source)) return []
  return source.map((item, index) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      return { label: String(item), value: String(item) }
    }
    const option = item as Record<string, unknown>
    return {
      label: String(option.label ?? `选项 ${index + 1}`),
      value: ['string', 'number', 'boolean'].includes(typeof option.value)
        ? (option.value as string | number | boolean)
        : `option-${index + 1}`,
    }
  })
}
</script>

<style scoped>
.designer-options-editor {
  display: flex;
  flex-direction: column;
  gap: var(--daxiang-form-space-2);
}

.designer-options-editor__row {
  display: grid;
  align-items: center;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
  gap: var(--daxiang-form-space-1);
}
</style>
