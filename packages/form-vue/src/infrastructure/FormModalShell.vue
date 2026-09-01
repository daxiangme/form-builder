<template>
  <ElDialog
    :model-value="modelValue"
    :title="title"
    :class="['daxiang-form-modal', dialogClass]"
    width="var(--daxiang-form-modal-width)"
    :style="modalStyle"
    :align-center="alignCenter"
    :draggable="draggable"
    :overflow="dragOverflow"
    :body-class="bodyClass"
    :destroy-on-close="destroyOnClose"
    :close-on-click-modal="closeOnClickModal && !busy"
    :close-on-press-escape="closeOnPressEscape && !busy"
    :show-close="showClose && !busy"
    @update:model-value="handleModelValueUpdate"
    @closed="emit('closed')"
  >
    <div v-loading="loading" class="daxiang-form-modal__body">
      <slot />
    </div>

    <template v-if="showFooter || $slots.footer" #footer>
      <slot name="footer" :busy="busy" :close="requestClose" :confirm="requestConfirm">
        <ElButton v-if="showCancel" :disabled="busy" @click="requestClose">
          {{ cancelText }}
        </ElButton>
        <ElButton
          v-if="showConfirm"
          type="primary"
          :loading="confirmLoading"
          :disabled="confirmDisabled || loading"
          @click="requestConfirm"
        >
          {{ confirmText }}
        </ElButton>
      </slot>
    </template>
  </ElDialog>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from 'vue'

defineOptions({ name: 'FormModalShell' })

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    title?: string
    dialogClass?: string
    width?: string | number
    maxHeight?: string | number
    loading?: boolean
    confirmLoading?: boolean
    confirmDisabled?: boolean
    showFooter?: boolean
    showCancel?: boolean
    showConfirm?: boolean
    showClose?: boolean
    cancelText?: string
    confirmText?: string
    destroyOnClose?: boolean
    closeOnClickModal?: boolean
    closeOnPressEscape?: boolean
    alignCenter?: boolean
    draggable?: boolean
    dragOverflow?: boolean
    flushContentVertical?: boolean
  }>(),
  {
    title: '',
    dialogClass: '',
    width: 640,
    maxHeight: 'calc(100vh - var(--daxiang-form-space-4) * 2)',
    loading: false,
    confirmLoading: false,
    confirmDisabled: false,
    showFooter: true,
    showCancel: true,
    showConfirm: true,
    showClose: true,
    cancelText: '取消',
    confirmText: '确认',
    destroyOnClose: true,
    closeOnClickModal: true,
    closeOnPressEscape: true,
    alignCenter: true,
    draggable: true,
    dragOverflow: false,
    flushContentVertical: false,
  },
)

const emit = defineEmits<{
  'update:modelValue': [boolean]
  confirm: []
  cancel: []
  closed: []
}>()

const busy = computed(() => props.loading || props.confirmLoading)
const bodyClass = computed(() =>
  props.flushContentVertical
    ? 'daxiang-form-modal__content daxiang-form-modal__content--flush-vertical'
    : 'daxiang-form-modal__content',
)
const modalStyle = computed<CSSProperties>(() => ({
  '--daxiang-form-modal-width': typeof props.width === 'number' ? `${props.width}px` : props.width,
  '--daxiang-form-modal-max-height':
    typeof props.maxHeight === 'number' ? `${props.maxHeight}px` : props.maxHeight,
}))

function requestClose() {
  if (busy.value) return
  emit('cancel')
  emit('update:modelValue', false)
}

function requestConfirm() {
  if (busy.value || props.confirmDisabled) return
  emit('confirm')
}

function handleModelValueUpdate(value: boolean) {
  if (value) {
    emit('update:modelValue', true)
    return
  }
  requestClose()
}

defineExpose({ busy, requestClose, requestConfirm })
</script>

<style>
.daxiang-form-modal.el-dialog {
  display: flex;
  flex-direction: column;
  max-width: calc(100vw - var(--daxiang-form-space-4) * 2);
  max-height: var(--daxiang-form-modal-max-height);
  overflow: hidden;
}

.daxiang-form-modal .el-dialog__header,
.daxiang-form-modal .el-dialog__footer {
  flex: 0 0 auto;
}

.daxiang-form-modal .el-dialog__body.daxiang-form-modal__content {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}

.daxiang-form-modal .el-dialog__body.daxiang-form-modal__content--flush-vertical {
  padding-block: 0;
}

.daxiang-form-modal .daxiang-form-modal__body {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
}
</style>
