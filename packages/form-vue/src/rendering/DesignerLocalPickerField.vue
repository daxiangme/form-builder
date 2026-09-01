<template>
  <div class="designer-local-picker">
    <div class="designer-local-picker__value">
      <template v-if="selectedItems.length">
        <ElTag
          v-for="item in selectedItems"
          :key="item.id"
          effect="plain"
          :disable-transitions="true"
        >
          {{ item.label }}
        </ElTag>
      </template>
      <span v-else>{{ placeholder }}</span>
    </div>
    <ElButton :disabled="disabled || !adapter" @click="openPicker">
      <DxSvgIcon :icon="icon" />{{ buttonText }}
    </ElButton>

    <DModal
      v-model="visible"
      :title="buttonText"
      width="720px"
      confirm-text="确认选择"
      @confirm="confirmSelection"
    >
      <div class="designer-local-picker__dialog-toolbar">
        <ElInput v-model="keyword" clearable placeholder="输入关键词" @keyup.enter="loadItems">
          <template #prefix><DxSvgIcon icon="ri:search-line" /></template>
        </ElInput>
        <ElButton :loading="loading" @click="loadItems">查询</ElButton>
      </div>
      <ElAlert v-if="loadError" type="error" :closable="false" :title="loadError" />
      <ElCheckboxGroup v-if="multiple" v-model="draftIds" class="designer-local-picker__records">
        <ElCheckbox v-for="item in items" :key="item.id" :value="item.id">
          <span>{{ item.label }}</span
          ><small>{{ item.description }}</small>
        </ElCheckbox>
      </ElCheckboxGroup>
      <ElRadioGroup v-else v-model="draftSingleId" class="designer-local-picker__records">
        <ElRadio v-for="item in items" :key="item.id" :value="item.id">
          <span>{{ item.label }}</span
          ><small>{{ item.description }}</small>
        </ElRadio>
      </ElRadioGroup>
      <ElEmpty v-if="!loading && items.length === 0" description="没有匹配记录" :image-size="56" />
    </DModal>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { FormDirectoryAdapter, FormRuntimeAdapterContext } from '@daxiangme/form-core'
import DModal from '../infrastructure/FormModalShell.vue'
import DxSvgIcon from '../infrastructure/FormIcon.vue'

defineOptions({ name: 'DesignerLocalPickerField' })

interface DirectoryPickerItem {
  id: string
  label: string
  description?: string
}

const props = defineProps<{
  modelValue: unknown
  componentType: string
  icon: string
  buttonText: string
  disabled: boolean
  multiple: boolean
  adapter?: FormDirectoryAdapter
  adapterContext: FormRuntimeAdapterContext
}>()
const emit = defineEmits<{
  'update:modelValue': [value: unknown]
  'runtime-warning': [message: string]
}>()
const visible = ref(false)
const keyword = ref('')
const draftIds = ref<string[]>([])
const draftSingleId = ref('')
const items = ref<DirectoryPickerItem[]>([])
const loading = ref(false)
const loadError = ref('')
const selectedItems = computed(() => {
  const ids = selectedIds(props.modelValue)
  return ids.map(
    (id) =>
      selectedValueItem(props.modelValue, id) ??
      items.value.find((item) => item.id === id) ?? { id, label: id },
  )
})
const placeholder = computed(() =>
  props.disabled ? '尚未选择' : `请选择${props.buttonText.replace(/^选择/, '')}`,
)

function openPicker(): void {
  if (props.disabled) return
  if (!props.adapter) {
    emit('runtime-warning', `宿主未配置${props.buttonText}所需的目录 Adapter`)
    return
  }
  const ids = selectedIds(props.modelValue)
  draftIds.value = [...ids]
  draftSingleId.value = ids[0] ?? ''
  keyword.value = ''
  visible.value = true
  void loadItems()
}

async function loadItems(): Promise<void> {
  if (!props.adapter || loading.value) return
  loading.value = true
  loadError.value = ''
  try {
    const result = await props.adapter.query({
      subjectType: props.componentType,
      keyword: keyword.value.trim(),
      pageNo: 1,
      pageSize: 100,
      context: props.adapterContext,
    })
    items.value = result.items
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : '目录数据加载失败'
    emit('runtime-warning', loadError.value)
  } finally {
    loading.value = false
  }
}

function confirmSelection(): void {
  const ids = props.multiple ? draftIds.value : draftSingleId.value ? [draftSingleId.value] : []
  const selected = ids
    .map((id) => items.value.find((item) => item.id === id))
    .filter((item): item is DirectoryPickerItem => Boolean(item))
    .map(({ id, label }) => ({ id, label }))
  emit('update:modelValue', props.multiple ? selected : (selected[0] ?? null))
  visible.value = false
}

function selectedValueItem(value: unknown, id: string): DirectoryPickerItem | undefined {
  const values = Array.isArray(value) ? value : value ? [value] : []
  const source = values.find(
    (item) =>
      typeof item === 'object' && item !== null && (item as Record<string, unknown>).id === id,
  ) as Record<string, unknown> | undefined
  return source && typeof source.label === 'string' ? { id, label: source.label } : undefined
}

function selectedIds(value: unknown): string[] {
  const values = Array.isArray(value) ? value : value ? [value] : []
  return values.flatMap((item) => {
    if (typeof item === 'string') return [item]
    if (typeof item !== 'object' || item === null) return []
    const id = (item as Record<string, unknown>).id
    return typeof id === 'string' ? [id] : []
  })
}
</script>

<style scoped>
.designer-local-picker {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--daxiang-form-space-2);
}

.designer-local-picker__value {
  display: flex;
  min-height: 32px;
  align-items: center;
  padding: 0 var(--daxiang-form-space-2);
  overflow: hidden;
  color: var(--el-text-color-placeholder);
  background: var(--el-fill-color-blank);
  border: 1px solid var(--el-border-color);
  border-radius: var(--el-border-radius-base);
  gap: var(--daxiang-form-space-1);
}

.designer-local-picker__dialog-toolbar {
  display: grid;
  align-items: center;
  margin-bottom: var(--daxiang-form-space-3);
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--daxiang-form-space-2);
}

.designer-local-picker__records {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--daxiang-form-space-2);
}

.designer-local-picker__records :deep(.el-checkbox),
.designer-local-picker__records :deep(.el-radio) {
  width: 100%;
  height: auto;
  min-height: 58px;
  align-items: flex-start;
  padding: var(--daxiang-form-space-3);
  margin: 0;
  background: var(--el-fill-color-extra-light);
  border-radius: var(--el-border-radius-base);
}

.designer-local-picker__records :deep(.el-checkbox__label),
.designer-local-picker__records :deep(.el-radio__label) {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.designer-local-picker__records small {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
</style>
