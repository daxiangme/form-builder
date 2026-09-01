<template>
  <div
    class="designer-grid-drop-cell"
    :class="{ 'is-active': active, 'is-over': over }"
    :style="gridStyle"
    @dragenter.prevent="handleDragEnter"
    @dragover.prevent="allowDrop"
    @dragleave="over = false"
    @drop.prevent.stop="handleDrop"
  >
    <span><DxSvgIcon icon="ri:add-line" />放置到此列</span>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import DxSvgIcon from '../infrastructure/FormIcon.vue'
import type { DesignerCanvasGap, DesignerDropTarget } from '@daxiangme/form-core'

defineOptions({ name: 'DesignerGridDropCell' })

const props = defineProps<{
  gap: DesignerCanvasGap
  active: boolean
  target: Omit<DesignerDropTarget, 'columnStart' | 'index'>
}>()
const emit = defineEmits<{ drop: [payload: string, target: DesignerDropTarget] }>()
const over = ref(false)
const gridStyle = computed(() => ({
  gridColumn: `${props.gap.start + 1} / span ${props.gap.span}`,
  gridRow: `${props.gap.row + 1}`,
}))

function handleDragEnter(event: DragEvent): void {
  if (!acceptsPaletteComponent(event)) return
  over.value = true
}

function allowDrop(event: DragEvent): void {
  if (!acceptsPaletteComponent(event)) return
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
}

function handleDrop(event: DragEvent): void {
  over.value = false
  const componentType = event.dataTransfer?.getData('application/x-daxiang-form-component') ?? ''
  if (!componentType) return
  emit('drop', `component:${componentType}`, {
    ...props.target,
    index: props.gap.index,
    placement: 'GRID',
    columnStart: props.gap.start,
  })
}

function acceptsPaletteComponent(event: DragEvent): boolean {
  return (
    props.active &&
    Array.from(event.dataTransfer?.types ?? []).includes('application/x-daxiang-form-component')
  )
}
</script>

<style scoped>
.designer-grid-drop-cell {
  z-index: 4;
  display: none;
  min-height: 44px;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  color: var(--el-color-primary);
  background: color-mix(in srgb, var(--el-color-primary) 4%, transparent);
  outline: 1px dashed var(--el-color-primary-light-5);
  outline-offset: -3px;
  font-size: 11px;
}

.designer-grid-drop-cell.is-active {
  display: flex;
  pointer-events: auto;
}

.designer-grid-drop-cell.is-over {
  background: var(--el-color-primary-light-9);
  outline-color: var(--el-color-primary);
}

.designer-grid-drop-cell span {
  display: inline-flex;
  align-items: center;
  gap: var(--daxiang-form-space-1);
}
</style>
