<template>
  <div class="designer-signature-field" :class="{ 'is-disabled': disabled }">
    <canvas
      ref="canvasRef"
      class="designer-signature-field__canvas"
      :aria-label="disabled ? '签名预览' : '手写签名区域'"
      @pointerdown="beginStroke"
      @pointermove="continueStroke"
      @pointerup="endStroke"
      @pointerleave="endStroke"
    />
    <div class="designer-signature-field__actions">
      <span>{{ disabled ? '运行预览中可手写签名' : '请在上方区域签名' }}</span>
      <ElButton v-if="!disabled" link @click="clearCanvas">清空</ElButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
defineOptions({ name: 'DesignerSignatureField' })

const props = withDefaults(
  defineProps<{
    disabled?: boolean
    lineWidth?: number
    penColor?: string
    modelValue?: string
  }>(),
  { disabled: false, lineWidth: 2, penColor: '#111827', modelValue: '' },
)
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const canvasRef = ref<HTMLCanvasElement>()
let drawing = false

onMounted(() => {
  resizeCanvas()
  restoreImage(props.modelValue)
})
watch(
  () => props.modelValue,
  (value) => restoreImage(value),
)

/** 开始一段本地签名笔画，不产生文件上传或远程请求。 */
function beginStroke(event: PointerEvent): void {
  if (props.disabled) return
  const context = drawingContext()
  if (!context) return
  drawing = true
  canvasRef.value?.setPointerCapture(event.pointerId)
  const point = canvasPoint(event)
  context.beginPath()
  context.moveTo(point.x, point.y)
}

/** 延续当前签名笔画。 */
function continueStroke(event: PointerEvent): void {
  if (!drawing || props.disabled) return
  const context = drawingContext()
  if (!context) return
  const point = canvasPoint(event)
  context.lineTo(point.x, point.y)
  context.stroke()
}

/** 结束当前签名笔画。 */
function endStroke(): void {
  if (!drawing) return
  drawing = false
  emit('update:modelValue', canvasRef.value?.toDataURL('image/png') ?? '')
}

/** 清除当前预览会话中的签名，不写入设计文档。 */
function clearCanvas(): void {
  const canvas = canvasRef.value
  const context = canvas?.getContext('2d')
  if (!canvas || !context) return
  context.clearRect(0, 0, canvas.width, canvas.height)
  emit('update:modelValue', '')
}

function resizeCanvas(): void {
  const canvas = canvasRef.value
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  const ratio = window.devicePixelRatio || 1
  canvas.width = Math.max(1, Math.round(rect.width * ratio))
  canvas.height = Math.max(1, Math.round(rect.height * ratio))
  const context = canvas.getContext('2d')
  context?.scale(ratio, ratio)
}

function drawingContext(): CanvasRenderingContext2D | null {
  const context = canvasRef.value?.getContext('2d') ?? null
  if (!context) return null
  context.lineCap = 'round'
  context.lineJoin = 'round'
  context.lineWidth = Math.max(1, props.lineWidth)
  context.strokeStyle = props.penColor || '#111827'
  return context
}

function canvasPoint(event: PointerEvent): { x: number; y: number } {
  const rect = canvasRef.value?.getBoundingClientRect()
  return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) }
}

/** 将预览会话内的签名数据还原到画布，不读取远程资源。 */
function restoreImage(value: string): void {
  const canvas = canvasRef.value
  const context = canvas?.getContext('2d')
  if (!canvas || !context) return
  context.clearRect(0, 0, canvas.width, canvas.height)
  if (!value.startsWith('data:image/')) return
  const image = new Image()
  image.onload = () => context.drawImage(image, 0, 0, canvas.clientWidth, canvas.clientHeight)
  image.src = value
}
</script>

<style scoped>
.designer-signature-field {
  overflow: hidden;
  background: var(--el-bg-color);
  border: 1px dashed var(--el-border-color);
  border-radius: var(--el-border-radius-base);
}

.designer-signature-field__canvas {
  display: block;
  width: 100%;
  height: 140px;
  cursor: crosshair;
  touch-action: none;
}

.designer-signature-field.is-disabled .designer-signature-field__canvas {
  cursor: default;
}

.designer-signature-field__actions {
  display: flex;
  min-height: 36px;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--daxiang-form-space-3);
  color: var(--el-text-color-secondary);
  border-top: 1px solid var(--el-border-color-lighter);
  font-size: 12px;
}
</style>
