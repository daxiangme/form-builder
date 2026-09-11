<template>
  <div ref="rootRef" class="designer-signature-field" :class="{ 'is-disabled': disabled }">
    <canvas
      ref="canvasRef"
      class="designer-signature-field__canvas"
      :aria-label="disabled ? '签名预览' : '手写签名区域'"
      @pointerdown="beginStroke"
      @pointermove="continueStroke"
      @pointerup="endStroke"
      @pointerleave="endStroke"
      @pointercancel="endStroke"
    />
    <div class="designer-signature-field__actions">
      <span>请在上方区域签名</span>
      <ElButton v-if="!disabled" link @click="clearCanvas">清空</ElButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

defineOptions({ name: 'DesignerSignatureField' })

const props = withDefaults(
  defineProps<{
    /** 禁用手写；弹窗内始终可写，表单回显不再内嵌本画板。 */
    disabled?: boolean
    /** 画笔宽度，像素。 */
    lineWidth?: number
    /** 画笔颜色。 */
    penColor?: string
    /** 当前草稿值；仅 `data:` / http(s) / blob 会还原到画布。 */
    modelValue?: string
    /** 优先于字段值的预览地址。 */
    previewSrc?: string
  }>(),
  { disabled: false, lineWidth: 2, penColor: '#111827', modelValue: '', previewSrc: '' },
)
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const rootRef = ref<HTMLElement>()
const canvasRef = ref<HTMLCanvasElement>()
let drawing = false
let observer: ResizeObserver | undefined
let sized = false

onMounted(() => {
  observer = new ResizeObserver(() => resizeCanvas())
  if (rootRef.value) observer.observe(rootRef.value)
  if (canvasRef.value) observer.observe(canvasRef.value)
  resizeCanvas()
})

onBeforeUnmount(() => {
  observer?.disconnect()
})

watch(
  () => [props.modelValue, props.previewSrc],
  () => restoreImage(drawableSource()),
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
  if (rect.width < 2 || rect.height < 2) return
  const snapshot = sized && canvas.width > 1 ? canvas.toDataURL('image/png') : drawableSource()
  const ratio = window.devicePixelRatio || 1
  canvas.width = Math.max(1, Math.round(rect.width * ratio))
  canvas.height = Math.max(1, Math.round(rect.height * ratio))
  const context = canvas.getContext('2d')
  context?.setTransform(ratio, 0, 0, ratio, 0, 0)
  sized = true
  restoreImage(isDrawableSrc(snapshot) ? snapshot : drawableSource())
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

function drawableSource(): string {
  const preview = props.previewSrc.trim()
  if (isDrawableSrc(preview)) return preview
  const value = props.modelValue.trim()
  return isDrawableSrc(value) ? value : ''
}

function isDrawableSrc(value: string): boolean {
  return value.startsWith('data:image/') || /^(https?:|blob:)/i.test(value)
}

/** 将预览会话内的签名数据还原到画布，不读取远程资源。 */
function restoreImage(value: string): void {
  const canvas = canvasRef.value
  const context = canvas?.getContext('2d')
  if (!canvas || !context) return
  context.clearRect(0, 0, canvas.width, canvas.height)
  if (!value || !isDrawableSrc(value)) return
  const image = new Image()
  image.onload = () => {
    if (canvasRef.value !== canvas) return
    context.drawImage(image, 0, 0, canvas.clientWidth, canvas.clientHeight)
  }
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
  height: min(50vh, 280px);
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
