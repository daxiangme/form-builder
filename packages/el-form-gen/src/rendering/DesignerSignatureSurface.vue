<template>
  <div class="designer-signature-surface">
    <button
      v-if="showActions"
      type="button"
      class="designer-signature-surface__preview"
      :disabled="disabled"
      :aria-label="hasValue ? '查看并重签' : '点击签名'"
      @click="emit('open')"
    >
      <img v-if="previewSrc" :src="previewSrc" alt="签名" />
      <span v-else>点击签名</span>
    </button>
    <div
      v-else
      class="designer-signature-surface__preview"
      :aria-label="hasValue ? '签名' : '未签名'"
    >
      <img v-if="previewSrc" :src="previewSrc" alt="签名" />
      <span v-else>未签名</span>
    </div>
    <div v-if="showActions" class="designer-signature-surface__actions">
      <FormButton
        :disabled="disabled"
        :loading="loading"
        icon="ri:quill-pen-line"
        @click="emit('open')"
      >
        {{ hasValue ? '重签' : '签名' }}
      </FormButton>
      <FormButton v-if="hasValue" :disabled="disabled || loading" @click="emit('clear')">
        清除
      </FormButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import FormButton from '../infrastructure/FormButton.vue'

defineOptions({ name: 'DesignerSignatureSurface' })

withDefaults(
  defineProps<{
    /** 已确认签名的预览地址；空则显示占位。 */
    previewSrc: string
    /** 字段是否已有确认值，用于切换「签名 / 重签」和「清除」。 */
    hasValue: boolean
    /** 设计态、只读或缺少资产端口时禁用开窗与清除。 */
    disabled: boolean
    /** 确认后上传等异步过程中的等待态。 */
    loading?: boolean
    /** 为 false 时只展示预览，不渲染签名/重签/清除。 */
    showActions?: boolean
  }>(),
  { disabled: false, loading: false, previewSrc: '', hasValue: false, showActions: true },
)
const emit = defineEmits<{
  /** 打开签名弹窗；设计态由父组件忽略。 */
  open: []
  /** 立刻清空已确认的字段值，不打开弹窗。 */
  clear: []
}>()
</script>

<style scoped>
.designer-signature-surface {
  display: grid;
  gap: var(--daxiang-form-space-2);
}

.designer-signature-surface__preview {
  display: flex;
  width: 100%;
  min-height: 96px;
  align-items: center;
  justify-content: center;
  padding: var(--daxiang-form-space-2);
  overflow: hidden;
  appearance: none;
  background: var(--el-bg-color);
  border: 1px dashed var(--el-border-color);
  border-radius: var(--el-border-radius-base);
  color: var(--el-text-color-placeholder);
  cursor: pointer;
  font: inherit;
  font-size: 13px;
}

.designer-signature-surface__preview:disabled,
.designer-signature-surface__preview:not(button) {
  cursor: default;
}

.designer-signature-surface__preview img {
  display: block;
  max-width: 100%;
  max-height: 96px;
  object-fit: contain;
}

.designer-signature-surface__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--daxiang-form-space-2);
}
</style>
