<template>
  <article
    class="designer-node-frame"
    :class="[
      { 'is-selected': selected, 'is-label-hidden': !showLabel },
      `is-label-${resolvedLabelPosition.toLowerCase()}`,
    ]"
    :style="frameStyle"
    @click.stop="emit('select')"
    @dragenter.prevent="handleDragEnter"
    @dragover.prevent="handleDragOver"
    @dragleave="handleDragLeave"
    @drop.prevent.stop="handleDrop"
  >
    <button
      class="designer-node-frame__handle designer-node-drag-handle"
      type="button"
      aria-label="拖动字段"
    >
      <DxSvgIcon icon="ri:draggable" />
    </button>

    <div class="designer-node-frame__content">
      <div v-if="showLabel" class="designer-node-frame__label">
        <span v-if="required" aria-hidden="true">*</span>{{ label }}
      </div>
      <div class="designer-node-frame__control">
        <slot />
      </div>
    </div>

    <div class="designer-node-frame__actions">
      <small>{{ componentName }}</small>
      <button type="button" aria-label="复制字段" @click.stop="emit('duplicate')">
        <DxSvgIcon icon="ri:file-copy-line" />
      </button>
      <button type="button" aria-label="从布局移除字段" @click.stop="emit('remove')">
        <DxSvgIcon icon="ri:delete-bin-line" />
      </button>
    </div>

    <DesignerDropIndicator v-if="dropPlacement" :placement="dropPlacement" />
  </article>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import DxSvgIcon from '../infrastructure/FormIcon.vue'
import type { DesignerDropTarget } from '@daxiangme/form-core'
import DesignerDropIndicator from './DesignerDropIndicator.vue'

defineOptions({ name: 'DesignerNodeFrame' })

const props = defineProps<{
  label: string
  componentName: string
  selected: boolean
  required: boolean
  showLabel: boolean
  labelPosition: 'INHERIT' | 'TOP' | 'LEFT' | 'RIGHT'
  formLabelPosition: 'TOP' | 'LEFT' | 'RIGHT'
  labelWidth: number
  paletteDragActive: boolean
  dropTarget: DesignerDropTarget
}>()
const emit = defineEmits<{
  select: []
  duplicate: []
  remove: []
  drop: [payload: string, target: DesignerDropTarget]
}>()
const dropPlacement = ref<'BEFORE' | 'AFTER' | ''>('')
const resolvedLabelPosition = computed(() =>
  props.labelPosition === 'INHERIT' ? props.formLabelPosition : props.labelPosition,
)
const frameStyle = computed(() => ({ '--designer-label-width': `${props.labelWidth}px` }))

function handleDragEnter(event: DragEvent): void {
  if (!acceptsPaletteComponent(event)) return
  updateDropPlacement(event)
}

function handleDragOver(event: DragEvent): void {
  if (!acceptsPaletteComponent(event)) return
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
  updateDropPlacement(event)
}

function handleDragLeave(event: DragEvent): void {
  const current = event.currentTarget as HTMLElement | null
  const related = event.relatedTarget as Node | null
  if (current && related && current.contains(related)) return
  dropPlacement.value = ''
}

function handleDrop(event: DragEvent): void {
  const componentType = event.dataTransfer?.getData('application/x-daxiang-form-component') ?? ''
  if (!componentType || !dropPlacement.value) return
  const placement = dropPlacement.value
  dropPlacement.value = ''
  emit('drop', `component:${componentType}`, {
    ...props.dropTarget,
    index: props.dropTarget.index + (placement === 'AFTER' ? 1 : 0),
    placement,
  })
}

function acceptsPaletteComponent(event: DragEvent): boolean {
  return (
    props.paletteDragActive &&
    Array.from(event.dataTransfer?.types ?? []).includes('application/x-daxiang-form-component')
  )
}

function updateDropPlacement(event: DragEvent): void {
  const element = event.currentTarget as HTMLElement
  const bounds = element.getBoundingClientRect()
  dropPlacement.value = event.clientY < bounds.top + bounds.height / 2 ? 'BEFORE' : 'AFTER'
}
</script>

<style scoped>
.designer-node-frame {
  position: relative;
  min-width: 0;
  min-height: 44px;
  background: var(--el-bg-color);
  border: 1px solid transparent;
  transition:
    border-color var(--el-transition-duration-fast),
    background-color var(--el-transition-duration-fast);
}

.designer-node-frame:hover {
  border-color: var(--el-color-primary-light-7);
}

.designer-node-frame.is-selected {
  border-color: var(--el-color-primary);
}

.designer-node-frame__handle {
  position: absolute;
  z-index: 5;
  top: 50%;
  left: 3px;
  display: flex;
  width: 16px;
  height: 26px;
  align-items: center;
  justify-content: center;
  color: var(--el-color-white);
  background: var(--el-color-primary);
  border: 0;
  border-radius: 3px;
  cursor: grab;
  opacity: 0;
  transform: translateY(-50%);
  transition:
    opacity var(--el-transition-duration-fast),
    background-color var(--el-transition-duration-fast);
}

.designer-node-frame__handle :deep(svg) {
  width: 12px;
  height: 12px;
}

.designer-node-frame:hover > .designer-node-frame__handle,
.designer-node-frame.is-selected > .designer-node-frame__handle {
  opacity: 1;
}

.designer-node-frame__content {
  display: grid;
  min-width: 0;
  min-height: 42px;
  align-items: center;
  grid-template-columns: minmax(72px, var(--designer-label-width)) minmax(0, 1fr);
}

.designer-node-frame.is-label-top .designer-node-frame__content {
  padding: var(--daxiang-form-space-2);
  grid-template-columns: minmax(0, 1fr);
  gap: var(--daxiang-form-space-1);
}

.designer-node-frame.is-label-hidden .designer-node-frame__content {
  grid-template-columns: minmax(0, 1fr);
}

.designer-node-frame__label {
  align-self: stretch;
  display: flex;
  min-width: 0;
  align-items: center;
  padding: var(--daxiang-form-space-2);
  color: var(--el-text-color-primary);
  background: var(--el-fill-color-extra-light);
  font-size: 13px;
}

.designer-node-frame.is-label-right .designer-node-frame__label {
  justify-content: flex-end;
  order: 2;
  text-align: right;
}

.designer-node-frame.is-label-top .designer-node-frame__label {
  padding: 0;
  background: transparent;
}

.designer-node-frame__label span {
  margin-right: 3px;
  color: var(--el-color-danger);
}

.designer-node-frame__control {
  min-width: 0;
  padding: var(--daxiang-form-space-1) var(--daxiang-form-space-2);
  pointer-events: none;
  user-select: none;
}

.designer-node-frame.is-label-top .designer-node-frame__control {
  padding: 0;
}

.designer-node-frame__actions {
  position: absolute;
  z-index: 5;
  right: 3px;
  bottom: 3px;
  display: flex;
  height: 22px;
  align-items: center;
  color: var(--el-color-white);
  background: var(--el-color-primary);
  border-radius: 3px;
  opacity: 0;
  transition: opacity var(--el-transition-duration-fast);
}

.designer-node-frame:hover > .designer-node-frame__actions,
.designer-node-frame.is-selected > .designer-node-frame__actions {
  opacity: 1;
}

.designer-node-frame__actions small {
  padding: 0 5px;
  font-size: 10px;
}

.designer-node-frame__actions button {
  display: inline-flex;
  width: 22px;
  height: 22px;
  align-items: center;
  justify-content: center;
  padding: 0;
  color: inherit;
  background: transparent;
  border: 0;
  cursor: pointer;
}

.designer-node-frame__actions button :deep(svg) {
  width: 13px;
  height: 13px;
}

.designer-node-frame__actions button:hover {
  background: color-mix(in srgb, var(--el-color-white) 16%, transparent);
}

@media (prefers-reduced-motion: reduce) {
  .designer-node-frame,
  .designer-node-frame__handle,
  .designer-node-frame__actions {
    transition: none;
  }
}
</style>
