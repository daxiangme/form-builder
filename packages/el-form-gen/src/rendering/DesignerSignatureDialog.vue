<template>
  <FormModalShell
    v-if="modelValue"
    :model-value="true"
    title="手写签名"
    width="min(640px, calc(100vw - 32px))"
    :radius="dialogRadius"
    max-height="calc(100vh - 48px)"
    dialog-class="daxiang-form-signature-dialog"
    confirm-text="确认"
    cancel-text="取消"
    :confirm-disabled="!draftValue"
    @update:model-value="emit('update:modelValue', $event)"
    @confirm="confirm"
  >
    <div class="designer-signature-dialog">
      <DesignerSignatureField
        :model-value="draftPreviewSrc"
        :preview-src="draftPreviewSrc"
        :line-width="lineWidth"
        :pen-color="penColor"
        @update:model-value="applyStroke"
      />
      <FormButton
        v-if="allowPersonalSignature"
        :disabled="!adapters?.personalSignature || reusing"
        :loading="reusing"
        icon="ri:account-circle-line"
        @click="reusePersonalSignature"
      >
        使用个人签名
      </FormButton>
    </div>
  </FormModalShell>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  resolveDesignerDialogRadius,
  type DesignerField,
  type DesignerRadiusValue,
  type DesignerRuntimeAdapters,
  type FormAssetReference,
  type FormRuntimeAdapterContext,
} from '@daxiangme/form-core'
import FormButton from '../infrastructure/FormButton.vue'
import FormModalShell from '../infrastructure/FormModalShell.vue'
import DesignerSignatureField from './DesignerSignatureField.vue'

defineOptions({ name: 'DesignerSignatureDialog' })

const props = withDefaults(
  defineProps<{
    /** 是否打开签名弹窗。 */
    modelValue: boolean
    /** 当前签名或审批意见字段，用于个人签名复用上下文。 */
    field: DesignerField
    adapters?: DesignerRuntimeAdapters
    adapterContext?: FormRuntimeAdapterContext
    /** 表单控件圆角；跟随系统时弹窗外壳为 16px。 */
    controlRadius?: DesignerRadiusValue
    /** 打开时已确认的字段值，确认未改笔迹时原样写回。 */
    initialValue?: string
    /** 画板与回显用的图片地址。 */
    previewSrc?: string
    /** 画笔宽度，像素。 */
    lineWidth?: number
    /** 画笔颜色。 */
    penColor?: string
    /** 是否在弹窗内提供「使用个人签名」；确认后才写入字段。 */
    allowPersonalSignature?: boolean
  }>(),
  {
    adapterContext: () => ({}),
    initialValue: '',
    previewSrc: '',
    lineWidth: 2,
    penColor: '#111827',
    allowPersonalSignature: false,
  },
)
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  confirm: [payload: { value: string; asset?: FormAssetReference }]
  'runtime-warning': [message: string]
}>()

const draftValue = ref('')
const draftPreviewSrc = ref('')
const pendingAsset = ref<FormAssetReference>()
const reusing = ref(false)
const dialogRadius = computed(() => resolveDesignerDialogRadius(props.controlRadius))

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    draftValue.value = props.initialValue
    draftPreviewSrc.value = props.previewSrc
    pendingAsset.value = undefined
  },
)

function applyStroke(dataUrl: string): void {
  draftValue.value = dataUrl
  pendingAsset.value = undefined
}

function confirm(): void {
  if (!draftValue.value) return
  emit('confirm', { value: draftValue.value, asset: pendingAsset.value })
  emit('update:modelValue', false)
}

/** 复用账户中心个人签名到弹窗草稿；确认后才写入字段。 */
async function reusePersonalSignature(): Promise<void> {
  const adapter = props.adapters?.personalSignature
  if (!adapter || reusing.value) {
    emit('runtime-warning', '当前宿主未提供个人签名 Adapter')
    return
  }
  reusing.value = true
  try {
    const asset = await adapter.reuse({
      fieldId: props.field.id,
      fieldCode: props.field.key,
      context: props.adapterContext,
    })
    pendingAsset.value = asset
    draftValue.value = asset.assetId
    draftPreviewSrc.value = asset.downloadUrl ?? ''
  } catch (error) {
    emit('runtime-warning', error instanceof Error ? error.message : '个人签名复用失败')
  } finally {
    reusing.value = false
  }
}
</script>

<style>
.daxiang-form-signature-dialog .daxiang-form-modal__body {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
</style>

<style scoped>
.designer-signature-dialog {
  display: grid;
  gap: var(--daxiang-form-space-3);
}
</style>
