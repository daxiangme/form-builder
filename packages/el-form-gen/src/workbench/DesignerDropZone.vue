<template>
  <div
    class="designer-drop-zone"
    :class="{ 'is-active': active, 'is-over': over }"
    @dragenter.prevent="handleDragEnter"
    @dragover.prevent="allowDrop"
    @dragleave="over = false"
    @drop.prevent.stop="handleDrop"
  >
    <span>{{ label }}</span>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
defineOptions({ name: 'DesignerDropZone' })

withDefaults(defineProps<{ active: boolean; label?: string }>(), { label: '放置到这里' })
const emit = defineEmits<{ drop: [payload: string] }>()
const over = ref(false)

function allowDrop(event: DragEvent): void {
  if (!acceptsPaletteComponent(event)) return
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
}

function handleDrop(event: DragEvent): void {
  over.value = false
  const componentType = event.dataTransfer?.getData('application/x-daxiang-form-component') ?? ''
  if (componentType) emit('drop', `component:${componentType}`)
}

function handleDragEnter(event: DragEvent): void {
  if (acceptsPaletteComponent(event)) over.value = true
}

function acceptsPaletteComponent(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes(
    'application/x-daxiang-form-component',
  )
}
</script>

<style scoped>
.designer-drop-zone {
  display: flex;
  width: 100%;
  min-height: 88px;
  align-items: center;
  justify-content: center;
  color: var(--el-text-color-placeholder);
  background: color-mix(in srgb, var(--el-fill-color-light) 64%, transparent);
  border: 1px dashed var(--el-border-color);
  pointer-events: none;
  transition:
    color var(--el-transition-duration-fast),
    background-color var(--el-transition-duration-fast),
    border-color var(--el-transition-duration-fast);
}

.designer-drop-zone span {
  font-size: 12px;
}

.designer-drop-zone.is-active {
  color: var(--el-color-primary);
  border-color: var(--el-color-primary-light-5);
  pointer-events: auto;
}

.designer-drop-zone.is-over {
  background: var(--el-color-primary-light-9);
  border-color: var(--el-color-primary);
}

@media (prefers-reduced-motion: reduce) {
  .designer-drop-zone {
    transition: none;
  }
}
</style>
