<template>
  <DModal
    v-model="visibleModel"
    title="等分当前容器字段"
    width="460px"
    confirm-text="应用布局"
    :confirm-disabled="affectedCount === 0"
    @confirm="save"
  >
    <ElAlert
      :type="affectedCount > 0 ? 'info' : 'warning'"
      :closable="false"
      show-icon
      :title="`${targetLabel}：将调整 ${affectedCount} 个直接字段`"
      :description="`跳过 ${skippedCount} 个整行、布局、子表、标题或不可处理节点；移动布局保持不变。`"
    />
    <ElForm label-position="top" class="designer-quick-grid-editor">
      <ElFormItem label="PC 每行字段数">
        <ElSegmented
          v-model="span"
          :options="[
            { label: '1 列', value: 24 },
            { label: '2 列', value: 12 },
            { label: '3 列', value: 8 },
            { label: '4 列', value: 6 },
          ]"
        />
      </ElFormItem>
      <small>应用时会同时清零这些字段的 PC 偏移，整次操作可一次撤销。</small>
    </ElForm>
  </DModal>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import DModal from '../infrastructure/FormModalShell.vue'

defineOptions({ name: 'DesignerQuickGridEditor' })

defineProps<{ targetLabel: string; affectedCount: number; skippedCount: number }>()
const emit = defineEmits<{ save: [span: 24 | 12 | 8 | 6] }>()
const visibleModel = defineModel<boolean>({ default: false })
const span = ref<24 | 12 | 8 | 6>(12)

function save(): void {
  emit('save', span.value)
  visibleModel.value = false
}
</script>

<style scoped>
.designer-quick-grid-editor {
  padding-top: var(--daxiang-form-space-3);
}

.designer-quick-grid-editor :deep(.el-segmented) {
  width: 100%;
}

.designer-quick-grid-editor small {
  color: var(--el-text-color-secondary);
}
</style>
