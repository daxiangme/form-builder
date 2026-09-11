<template>
  <FormModalShell
    v-if="modelValue"
    :model-value="true"
    title="地图选点"
    :width="dialogWidth"
    :radius="dialogRadius"
    max-height="calc(100vh - 48px)"
    dialog-class="daxiang-form-location-picker-dialog"
    confirm-text="确认"
    cancel-text="取消"
    :loading="binding"
    :confirm-disabled="!draftValue"
    :confirm-loading="searching"
    @update:model-value="emit('update:modelValue', $event)"
    @confirm="confirm"
    @closed="handleClosed"
  >
    <div class="designer-location-picker">
      <div class="designer-location-picker__search">
        <ElInput
          v-model="address"
          clearable
          placeholder="请输入地址搜索，或点击地图选点"
          @keyup.enter="search"
        />
        <FormButton :loading="searching" :disabled="binding" icon="ri:search-line" @click="search">
          搜索地点
        </FormButton>
      </div>
      <div ref="canvasRef" class="designer-location-picker__canvas" />
    </div>
  </FormModalShell>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import {
  resolveDesignerDialogRadius,
  resolveLocationPickerDialogWidth,
  type DesignerField,
  type DesignerRadiusValue,
  type DesignerRuntimeAdapters,
  type FormLocationField,
  type FormLocationPickerSession,
  type FormLocationValue,
  type FormRuntimeAdapterContext,
} from '@daxiangme/form-core'
import FormButton from '../infrastructure/FormButton.vue'
import FormModalShell from '../infrastructure/FormModalShell.vue'

defineOptions({ name: 'DesignerLocationPickerDialog' })

const props = defineProps<{
  modelValue: boolean
  field: DesignerField
  adapters?: DesignerRuntimeAdapters
  adapterContext: FormRuntimeAdapterContext
  initial?: FormLocationValue
  defaultCenter?: { longitude: number; latitude: number }
  requestedFields: FormLocationField[]
  /** 表单控件圆角；跟随系统时弹窗外壳为 16px。 */
  controlRadius?: DesignerRadiusValue
}>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  confirm: [value: FormLocationValue]
  'runtime-warning': [message: string]
}>()
const canvasRef = ref<HTMLElement>()
const address = ref('')
const draftValue = ref<FormLocationValue>()
const binding = ref(false)
const searching = ref(false)
const session = ref<FormLocationPickerSession>()
const dialogWidth = computed(
  () => `${resolveLocationPickerDialogWidth(props.field.configuration.pickerDialogWidth)}%`,
)
const dialogRadius = computed(() => resolveDesignerDialogRadius(props.controlRadius))

watch(
  () => [props.modelValue, canvasRef.value] as const,
  async ([open, canvas]) => {
    if (!open) {
      teardown()
      return
    }
    if (!canvas || session.value || binding.value) return
    address.value = props.initial?.address?.trim() || ''
    draftValue.value = props.initial
    await bindCanvas()
  },
)

async function bindCanvas(): Promise<void> {
  const bindPicker = props.adapters?.location?.bindPicker
  const canvas = canvasRef.value
  if (!bindPicker || !canvas) {
    emit('runtime-warning', '当前宿主未提供地图画布挂载')
    emit('update:modelValue', false)
    return
  }
  binding.value = true
  try {
    session.value = await bindPicker({
      canvas,
      fieldId: props.field.id,
      fieldCode: props.field.key,
      provider: textConfiguration('mapProvider') || undefined,
      initial: props.initial,
      defaultCenter: props.defaultCenter,
      requestedFields: props.requestedFields,
      onChange: applyPreview,
      context: props.adapterContext,
    })
    const current = session.value.getValue()
    if (current) applyPreview(current)
  } catch (error) {
    emit('runtime-warning', error instanceof Error ? error.message : '地图选点打开失败')
    emit('update:modelValue', false)
  } finally {
    binding.value = false
  }
}

async function search(): Promise<void> {
  if (!session.value || searching.value) return
  const keyword = address.value.trim()
  if (!keyword) {
    emit('runtime-warning', '请输入要搜索的地址')
    return
  }
  searching.value = true
  try {
    await session.value.search(keyword)
  } catch (error) {
    emit('runtime-warning', error instanceof Error ? error.message : '地点搜索失败')
  } finally {
    searching.value = false
  }
}

function confirm(): void {
  const value = draftValue.value ?? session.value?.getValue()
  if (!value) return
  emit('confirm', value)
  emit('update:modelValue', false)
}

function applyPreview(value: FormLocationValue): void {
  draftValue.value = value
  if (value.address?.trim()) address.value = value.address
}

function handleClosed(): void {
  teardown()
}

function teardown(): void {
  session.value?.destroy()
  session.value = undefined
}

function textConfiguration(key: string): string {
  const value = props.field.configuration[key]
  return typeof value === 'string' ? value : ''
}

onBeforeUnmount(() => teardown())
</script>

<style>
.daxiang-form-location-picker-dialog .daxiang-form-modal__body {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
</style>

<style scoped>
.designer-location-picker {
  display: grid;
  flex: 1 1 auto;
  min-height: min(560px, calc(100vh - 220px));
  grid-template-rows: auto minmax(280px, 1fr);
  gap: var(--daxiang-form-space-3);
}

.designer-location-picker__search {
  display: grid;
  align-items: center;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--daxiang-form-space-2);
}

.designer-location-picker__canvas {
  min-height: 280px;
  overflow: hidden;
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--el-border-radius-base);
}
</style>
