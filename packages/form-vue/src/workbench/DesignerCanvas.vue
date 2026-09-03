<template>
  <main
    ref="canvasRef"
    class="designer-canvas"
    :class="{
      'is-grid-visible': gridVisible,
      'is-adaptive-viewport': !viewportWidth,
    }"
    @dragenter="handleStageDragEnter"
    @dragover="handleStageDragOver"
    @dragleave="handleStageDragLeave"
    @drop="endPaletteDrag"
  >
    <div ref="stageRef" class="designer-canvas__stage">
      <div class="designer-canvas__scene" :style="sceneStyle">
        <ElForm
          ref="surfaceRef"
          class="designer-canvas__surface"
          :class="[
            `is-${device}`,
            `is-align-${document.appearance.labelAlign.toLowerCase()}`,
            controlRadiusBind.class,
            {
              'is-overlay-module': Boolean(activeModule),
              'is-adaptive-viewport': !viewportWidth,
            },
          ]"
          :style="surfaceStyle"
          :label-position="elementLabelPosition"
          :label-width="document.appearance.labelWidth"
          :label-suffix="document.appearance.labelSuffix"
          :size="elementSize"
        >
          <component
            :is="activeModule ? DesignerOverlayCanvasFrame : 'div'"
            class="designer-canvas__view-frame"
            v-bind="canvasFrameProps"
            @select-frame="emit('select', '')"
          >
            <div class="designer-canvas__root-editor" @click.self="emit('select', '')">
              <VueDraggable
                v-if="document.uiSchema.root.length > 0"
                class="designer-canvas__node-list"
                :model-value="document.uiSchema.root"
                :group="sortableGroup"
                :animation="120"
                :disabled="device === 'mobile'"
                :on-move="canSortMove"
                :empty-insert-threshold="sortableEmptyInsertThreshold"
                invert-swap
                :swap-threshold="sortableSwapThreshold"
                draggable=".designer-canvas-node"
                handle=".designer-node-drag-handle"
                ghost-class="designer-canvas-node--ghost"
                chosen-class="designer-canvas-node--chosen"
                drag-class="designer-canvas-node--dragging"
                data-container-id=""
                data-slot-code="root"
                @update:model-value="updateRootNodes"
                @start="handleNodeDragStart"
                @end="handleNodeDragEnd"
              >
                <DesignerGridDropCell
                  v-for="gap in rootProjection.gaps"
                  :key="`root-gap-${gap.row}-${gap.start}-${gap.index}`"
                  :gap="gap"
                  :active="paletteDragActive && device === 'desktop'"
                  :target="{ containerId: null, slotCode: 'root' }"
                  @drop="handleDrop"
                />
                <DesignerCanvasNode
                  v-for="(node, index) in document.uiSchema.root"
                  :key="node.id"
                  :node="node"
                  :item-index="index"
                  :fields="document.dataSchema.fields"
                  :selected-node-id="selectedNodeId"
                  :device="device"
                  :gutter="document.appearance.gridGutter"
                  :appearance="document.appearance"
                  :grid-cell="cellFor(rootProjection, node.id)"
                  :form-label-position="formLabelPosition"
                  :form-label-width="document.appearance.labelWidth"
                  :palette-drag-active="paletteDragActive"
                  :drop-target="{ containerId: null, slotCode: 'root', index }"
                  :can-sort-move="canSortMove"
                  @select="emit('select', $event)"
                  @remove="emit('remove', $event)"
                  @duplicate="emit('duplicate', $event)"
                  @drop="handleDrop"
                  @reorder="forwardReorder"
                  @drag-start="handleNodeDragStart"
                  @drag-end="handleNodeDragEnd"
                />
              </VueDraggable>
              <DesignerDropZone
                class="designer-canvas__tail-drop-zone"
                :class="{ 'is-empty': document.uiSchema.root.length === 0 }"
                :active="paletteDragActive"
                :label="emptyDropLabel"
                @drop="
                  handleDrop($event, {
                    containerId: null,
                    slotCode: 'root',
                    index: document.uiSchema.root.length,
                    placement: 'INSIDE',
                  })
                "
              />
            </div>
          </component>
        </ElForm>
      </div>
      <div
        v-if="dragCandidate.visible"
        class="designer-canvas__drop-candidate"
        :style="dragCandidateStyle"
        role="status"
        aria-live="polite"
      >
        <span>{{ dragCandidate.label }}</span>
      </div>
      <div
        v-if="dragSession.active && !dragSession.accepted"
        class="designer-canvas__drag-rejection"
      >
        <DxSvgIcon icon="ri:error-warning-line" />{{ dragSession.rejectionReason }}
      </div>
    </div>
  </main>
</template>

<script setup lang="ts">
import { computed, ref, reactive, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import type { CSSProperties } from 'vue'
import { VueDraggable, type SortableEvent } from 'vue-draggable-plus'
import DxSvgIcon from '../infrastructure/FormIcon.vue'
import { projectDesignerCanvas } from '@daxiangme/form-core'
import { designerControlRadiusBind } from '../designer-radius-style'
import { designerNodeDropRejection } from '@daxiangme/form-core'
import type {
  DesignerCanvasCell,
  DesignerCanvasProjection,
  DesignerDevice,
  DesignerDocument,
  DesignerDragSession,
  DesignerDropTarget,
  DesignerLayoutNode,
  DesignerOverlayModule,
  DesignerSortableMoveEvent,
} from '@daxiangme/form-core'
import DesignerCanvasNode from './DesignerCanvasNode.vue'
import DesignerDropZone from './DesignerDropZone.vue'
import DesignerGridDropCell from './DesignerGridDropCell.vue'
import DesignerOverlayCanvasFrame from './DesignerOverlayCanvasFrame.vue'
import {
  DESIGNER_CANVAS_EMPTY_INSERT_THRESHOLD,
  DESIGNER_CANVAS_NESTED_ESCAPE_PX,
  DESIGNER_CANVAS_SORTABLE_GROUP,
  DESIGNER_CANVAS_SWAP_THRESHOLD,
} from './designer-canvas-sortable'

defineOptions({ name: 'DesignerCanvas' })

const props = defineProps<{
  document: DesignerDocument
  selectedNodeId: string
  device: DesignerDevice
  viewportWidth?: number
  zoom: number
  gridVisible: boolean
  activeModule?: DesignerOverlayModule
}>()
const emit = defineEmits<{
  'update:zoom': [zoom: number]
  select: [nodeId: string]
  remove: [nodeId: string]
  duplicate: [nodeId: string]
  drop: [payload: string, target: DesignerDropTarget]
  reorder: [containerId: string | null, slotCode: string, nodes: DesignerLayoutNode[]]
  'drag-start': []
  'drag-end': []
}>()
const dragSession = ref<DesignerDragSession>(createEmptyDragSession())
const dragCandidate = reactive({ visible: false, left: 0, top: 0, width: 0, label: '' })
const canvasRef = ref<HTMLElement>()
const stageRef = ref<HTMLElement>()
const surfaceRef = ref<{ $el: HTMLElement }>()
const stageSize = reactive({ width: 0, height: 0 })
const naturalHeight = ref(0)
const sortableGroup = DESIGNER_CANVAS_SORTABLE_GROUP
const sortableEmptyInsertThreshold = DESIGNER_CANVAS_EMPTY_INSERT_THRESHOLD
const sortableSwapThreshold = DESIGNER_CANVAS_SWAP_THRESHOLD
const paletteDragActive = computed(
  () => dragSession.value.active && dragSession.value.source === 'PALETTE',
)
const canvasFrameProps = computed(() => (props.activeModule ? { module: props.activeModule } : {}))
const emptyDropLabel = computed(() => {
  if (props.document.uiSchema.root.length > 0) return '拖放到末尾'
  return props.activeModule ? '拖放组件到模块内容区' : '拖放组件到表单内容区'
})
const formLabelPosition = computed(() => props.document.appearance.labelPosition)
const elementLabelPosition = computed(() => {
  const position = props.document.appearance.labelPosition.toLowerCase()
  return position as 'top' | 'left' | 'right'
})
const elementSize = computed(() => {
  const size = props.document.appearance.size
  return size === 'SMALL' ? 'small' : size === 'LARGE' ? 'large' : 'default'
})
const rootProjection = computed(() =>
  projectDesignerCanvas(props.document.uiSchema.root, props.device),
)
const naturalWidth = computed(() => {
  if (props.viewportWidth) return props.viewportWidth
  if (props.device === 'mobile') return 390
  return Math.max(320, stageSize.width - 8)
})
const scale = computed(() => props.zoom / 100)
const controlRadiusBind = computed(() =>
  designerControlRadiusBind(props.document.appearance.controlRadius),
)
const minimumSceneHeight = computed(() => Math.max(480, stageSize.height - 16))
const sceneStyle = computed(() => ({
  width: `${naturalWidth.value * scale.value}px`,
  height: `${Math.max(minimumSceneHeight.value, naturalHeight.value * scale.value)}px`,
}))
const surfaceStyle = computed(() => ({
  width: `${naturalWidth.value}px`,
  minHeight: `${minimumSceneHeight.value / Math.max(scale.value, 0.5)}px`,
  transform: `scale(${scale.value})`,
  '--designer-grid-gutter': `${props.document.appearance.gridGutter}px`,
  '--designer-row-gap': `${props.document.appearance.rowGap}px`,
  '--designer-canvas-min-height': `${minimumSceneHeight.value / Math.max(scale.value, 0.5)}px`,
  ...controlRadiusBind.value.style,
}))
const dragCandidateStyle = computed<CSSProperties>(() => ({
  left: `${dragCandidate.left}px`,
  top: `${dragCandidate.top}px`,
  width: `${dragCandidate.width}px`,
}))

let stageResizeObserver: ResizeObserver | undefined
let surfaceResizeObserver: ResizeObserver | undefined

onMounted(() => {
  stageResizeObserver = new ResizeObserver(updateStageSize)
  surfaceResizeObserver = new ResizeObserver(updateSurfaceHeight)
  if (stageRef.value) stageResizeObserver.observe(stageRef.value)
  if (surfaceRef.value?.$el) surfaceResizeObserver.observe(surfaceRef.value.$el)
  updateStageSize()
  updateSurfaceHeight()
})

onBeforeUnmount(() => {
  stageResizeObserver?.disconnect()
  surfaceResizeObserver?.disconnect()
  stopCanvasPointerTracking()
})

watch(
  () => props.selectedNodeId,
  async (nodeId) => {
    if (!nodeId) return
    await nextTick()
    const target = canvasRef.value?.querySelector<HTMLElement>(
      `[data-designer-node-id="${nodeId}"]`,
    )
    target?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  },
)

watch(
  () => props.zoom,
  async (nextZoom, previousZoom) => {
    const stage = stageRef.value
    if (!stage || nextZoom === previousZoom) return
    const previousScale = previousZoom / 100
    const horizontalCenter =
      (stage.scrollLeft + stage.clientWidth / 2) / Math.max(1, naturalWidth.value * previousScale)
    const verticalCenter =
      (stage.scrollTop + stage.clientHeight / 2) / Math.max(1, naturalHeight.value * previousScale)
    await nextTick()
    stage.scrollLeft = horizontalCenter * naturalWidth.value * scale.value - stage.clientWidth / 2
    stage.scrollTop = verticalCenter * naturalHeight.value * scale.value - stage.clientHeight / 2
  },
)

function updateStageSize(): void {
  const stage = stageRef.value
  if (!stage) return
  stageSize.width = stage.clientWidth
  stageSize.height = stage.clientHeight
}

function updateSurfaceHeight(): void {
  naturalHeight.value = surfaceRef.value?.$el.offsetHeight ?? 0
}

function updateRootNodes(nodes: DesignerLayoutNode[]): void {
  emit('reorder', null, 'root', nodes)
}

const canvasPointer = { x: 0, y: 0 }

function trackCanvasPointer(event: Event): void {
  const pointer = pointerFromEvent(event)
  if (!pointer) return
  canvasPointer.x = pointer.x
  canvasPointer.y = pointer.y
}

function startCanvasPointerTracking(event?: SortableEvent): void {
  const native = (event as (SortableEvent & { originalEvent?: Event }) | undefined)?.originalEvent
  const pointer = pointerFromEvent(native)
  if (pointer) {
    canvasPointer.x = pointer.x
    canvasPointer.y = pointer.y
  }
  window.addEventListener('pointermove', trackCanvasPointer)
  window.addEventListener('dragover', trackCanvasPointer)
}

function stopCanvasPointerTracking(): void {
  window.removeEventListener('pointermove', trackCanvasPointer)
  window.removeEventListener('dragover', trackCanvasPointer)
  canvasPointer.x = 0
  canvasPointer.y = 0
}

function handleNodeDragStart(event?: SortableEvent): void {
  const sourceNodeId = event?.item.dataset.designerNodeId ?? ''
  startCanvasPointerTracking(event)
  dragSession.value = {
    active: true,
    source: 'CANVAS',
    sourceNodeId,
    accepted: true,
    rejectionReason: '',
  }
  emit('drag-start')
}

function handleNodeDragEnd(): void {
  stopCanvasPointerTracking()
  clearDragCandidate()
  dragSession.value = createEmptyDragSession()
  emit('drag-end')
}

function handleStageDragEnter(event: DragEvent): void {
  if (!Array.from(event.dataTransfer?.types ?? []).includes('application/x-daxiang-form-component'))
    return
  dragSession.value = {
    active: true,
    source: 'PALETTE',
    sourceNodeId: '',
    accepted: true,
    rejectionReason: '',
  }
}

function handleStageDragOver(event: DragEvent): void {
  if (!dragSession.value.active) return
  const stage = stageRef.value
  if (!stage) return
  const bounds = stage.getBoundingClientRect()
  const threshold = 52
  if (event.clientY < bounds.top + threshold) stage.scrollTop -= 14
  if (event.clientY > bounds.bottom - threshold) stage.scrollTop += 14
  if (event.clientX < bounds.left + threshold) stage.scrollLeft -= 14
  if (event.clientX > bounds.right - threshold) stage.scrollLeft += 14
}

function handleStageDragLeave(event: DragEvent): void {
  if (isPointerInsideElement(event, event.currentTarget as HTMLElement | null)) return
  endPaletteDrag()
}

/** 用当前指针坐标判断是否仍在画布内，避免 `relatedTarget` 为空时误结束面板拖放。 */
function isPointerInsideElement(event: DragEvent, element: HTMLElement | null): boolean {
  if (!element) return false
  const bounds = element.getBoundingClientRect()
  return (
    event.clientX >= bounds.left &&
    event.clientX <= bounds.right &&
    event.clientY >= bounds.top &&
    event.clientY <= bounds.bottom
  )
}

function endPaletteDrag(): void {
  if (dragSession.value.source === 'PALETTE') {
    clearDragCandidate()
    dragSession.value = createEmptyDragSession()
  }
}

function handleDrop(payload: string, target: DesignerDropTarget): void {
  endPaletteDrag()
  emit('drop', payload, target)
}

function forwardReorder(
  containerId: string | null,
  slotCode: string,
  nodes: DesignerLayoutNode[],
): void {
  emit('reorder', containerId, slotCode, nodes)
}

function canSortMove(event: DesignerSortableMoveEvent, originalEvent?: Event): boolean {
  if (shouldReleaseNestedList(event, originalEvent)) {
    clearDragCandidate()
    return false
  }
  const nodeId = event.dragged.dataset.designerNodeId ?? ''
  const targetContainerId = event.to.dataset.containerId || null
  const targetIndex = resolveTargetIndex(event)
  const placement =
    event.related === event.to ? 'INSIDE' : event.willInsertAfter ? 'AFTER' : 'BEFORE'
  const target: DesignerDropTarget = {
    containerId: targetContainerId,
    slotCode: event.to.dataset.slotCode ?? 'root',
    index: targetIndex,
    placement,
  }
  const rejectionReason = nodeId
    ? designerNodeDropRejection(props.document, nodeId, target)
    : '拖动节点不存在'
  const accepted = !rejectionReason
  dragSession.value = {
    ...dragSession.value,
    target,
    accepted,
    rejectionReason,
  }
  updateDragCandidate(event, accepted)
  return accepted
}

/** 指针离开嵌套插槽后让出落点，使节点可以拖回父级列表。 */
function shouldReleaseNestedList(event: DesignerSortableMoveEvent, originalEvent?: Event): boolean {
  if (!event.to.dataset.containerId) return false
  const pointer = resolveCanvasPointer(originalEvent)
  if (!pointer) return false
  const bounds = event.to.getBoundingClientRect()
  const inset = DESIGNER_CANVAS_NESTED_ESCAPE_PX
  const inside =
    pointer.x >= bounds.left &&
    pointer.x <= bounds.right &&
    pointer.y >= bounds.top + inset &&
    pointer.y <= bounds.bottom - inset
  return !inside
}

function resolveCanvasPointer(event?: Event): { x: number; y: number } | undefined {
  const fromEvent = pointerFromEvent(event)
  if (fromEvent) return fromEvent
  if (canvasPointer.x === 0 && canvasPointer.y === 0) return undefined
  return canvasPointer
}

function pointerFromEvent(event?: Event): { x: number; y: number } | undefined {
  if (!event) return undefined
  if (isClientPointEvent(event)) return { x: event.clientX, y: event.clientY }
  const touchEvent = event as TouchEvent
  const touch = touchEvent.touches?.[0] ?? touchEvent.changedTouches?.[0]
  return touch ? { x: touch.clientX, y: touch.clientY } : undefined
}

function isClientPointEvent(event: Event): event is MouseEvent {
  return 'clientX' in event && 'clientY' in event
}

function resolveTargetIndex(event: DesignerSortableMoveEvent): number {
  if (event.related === event.to) return 0
  const relatedIndex = Number(event.related.dataset.designerIndex)
  if (!Number.isFinite(relatedIndex)) return 0
  return relatedIndex + (event.willInsertAfter ? 1 : 0)
}

function updateDragCandidate(event: DesignerSortableMoveEvent, accepted: boolean): void {
  const stage = stageRef.value
  if (!stage || !accepted) {
    clearDragCandidate()
    return
  }
  const stageBounds = stage.getBoundingClientRect()
  const targetBounds = event.related.getBoundingClientRect()
  const insertAfter = event.related !== event.to && event.willInsertAfter === true
  const targetName = event.related.dataset.designerNodeLabel
  dragCandidate.visible = true
  dragCandidate.left = Math.max(8, targetBounds.left - stageBounds.left + stage.scrollLeft)
  dragCandidate.top =
    (insertAfter ? targetBounds.bottom : targetBounds.top) - stageBounds.top + stage.scrollTop
  dragCandidate.width = Math.max(
    96,
    Math.min(targetBounds.width, stage.scrollWidth - dragCandidate.left - 8),
  )
  dragCandidate.label = targetName
    ? `插入到「${targetName}」${insertAfter ? '之后' : '之前'}`
    : '放入当前布局区域'
}

function clearDragCandidate(): void {
  dragCandidate.visible = false
  dragCandidate.label = ''
}

function cellFor(projection: DesignerCanvasProjection, nodeId: string): DesignerCanvasCell {
  return (
    projection.cells.find((cell) => cell.nodeId === nodeId) ?? {
      nodeId,
      index: 0,
      row: 0,
      start: 0,
      span: 24,
    }
  )
}

function fitToWidth(): void {
  const availableWidth = Math.max(1, stageSize.width - 16)
  const targetZoom = Math.max(
    50,
    Math.min(150, Math.floor((availableWidth / naturalWidth.value) * 10) * 10),
  )
  emit('update:zoom', targetZoom)
}

/** 捕获画布当前相对中心，用于侧栏调宽前后保持观察位置。 */
function captureViewport(): { horizontal: number; vertical: number } {
  const stage = stageRef.value
  if (!stage) return { horizontal: 0.5, vertical: 0 }
  return {
    horizontal: (stage.scrollLeft + stage.clientWidth / 2) / Math.max(1, stage.scrollWidth),
    vertical: (stage.scrollTop + stage.clientHeight / 2) / Math.max(1, stage.scrollHeight),
  }
}

/** 恢复画布相对中心，不改变节点选择和缩放。 */
async function restoreViewport(position: { horizontal: number; vertical: number }): Promise<void> {
  await nextTick()
  const stage = stageRef.value
  if (!stage) return
  stage.scrollLeft = position.horizontal * stage.scrollWidth - stage.clientWidth / 2
  stage.scrollTop = position.vertical * stage.scrollHeight - stage.clientHeight / 2
}

function createEmptyDragSession(): DesignerDragSession {
  return {
    active: false,
    source: null,
    sourceNodeId: '',
    accepted: true,
    rejectionReason: '',
  }
}

defineExpose({ fitToWidth, captureViewport, restoreViewport })
</script>

<style scoped>
.designer-canvas {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1 1 0;
  overflow: hidden;
  background: var(--el-fill-color-extra-light);
}

.designer-canvas__stage {
  position: relative;
  min-width: 0;
  min-height: 0;
  flex: 1 1 0;
  padding: var(--daxiang-form-space-2);
  overflow: auto;
  background-color: var(--el-fill-color-extra-light);
}

.designer-canvas.is-adaptive-viewport .designer-canvas__stage {
  padding: var(--daxiang-form-space-1);
}

.designer-canvas__drag-rejection {
  position: sticky;
  z-index: 20;
  bottom: var(--daxiang-form-space-2);
  left: 50%;
  display: flex;
  width: max-content;
  max-width: min(520px, calc(100% - 32px));
  align-items: center;
  padding: var(--daxiang-form-space-2) var(--daxiang-form-space-3);
  margin: 0 auto;
  color: var(--el-color-danger);
  background: var(--el-color-danger-light-9);
  border: 1px solid var(--el-color-danger-light-5);
  border-radius: var(--el-border-radius-base);
  gap: var(--daxiang-form-space-1);
  transform: translateY(-100%);
}

.designer-canvas__drop-candidate {
  position: absolute;
  z-index: 24;
  height: 2px;
  pointer-events: none;
  color: var(--el-color-primary);
  background: var(--el-color-primary);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--el-color-primary) 20%, transparent);
}

.designer-canvas__drop-candidate::before,
.designer-canvas__drop-candidate::after {
  position: absolute;
  top: 50%;
  width: 8px;
  height: 8px;
  content: '';
  background: var(--el-color-primary);
  border: 2px solid var(--el-bg-color);
  border-radius: 50%;
  transform: translateY(-50%);
}

.designer-canvas__drop-candidate::before {
  left: -4px;
}

.designer-canvas__drop-candidate::after {
  right: -4px;
}

.designer-canvas__drop-candidate span {
  position: absolute;
  bottom: 6px;
  left: 50%;
  max-width: calc(100% - 16px);
  padding: var(--daxiang-form-space-1) var(--daxiang-form-space-2);
  overflow: hidden;
  color: var(--el-color-white);
  background: var(--el-color-primary);
  border-radius: var(--el-border-radius-small);
  box-shadow: var(--el-box-shadow-light);
  font-size: 11px;
  line-height: 16px;
  text-overflow: ellipsis;
  transform: translateX(-50%);
  white-space: nowrap;
}

.designer-canvas.is-grid-visible .designer-canvas__stage {
  background-image: radial-gradient(var(--el-border-color) 1px, transparent 1px);
  background-size: 18px 18px;
}

.designer-canvas__scene {
  position: relative;
  min-width: 0;
  margin: 0 auto;
}

.designer-canvas__surface {
  position: absolute;
  top: 0;
  left: 0;
  box-sizing: border-box;
  padding: var(--daxiang-form-space-2);
  background: transparent;
  border: 0;
  transform-origin: top left;
}

.designer-canvas__surface.is-mobile {
  background: var(--el-bg-color);
  box-shadow: var(--el-box-shadow-light);
}

.designer-canvas__surface.is-overlay-module,
.designer-canvas__surface.is-adaptive-viewport {
  padding: 0;
}

.designer-canvas__surface > div.designer-canvas__view-frame {
  box-sizing: border-box;
  display: flex;
  width: 100%;
  min-height: var(--designer-canvas-min-height);
  flex-direction: column;
}

.designer-canvas__root-editor {
  display: flex;
  width: 100%;
  min-width: 0;
  min-height: 0;
  flex: 1 1 0;
  flex-direction: column;
}

.designer-canvas__node-list {
  position: relative;
  display: grid;
  min-height: 88px;
  flex: 0 0 auto;
  align-content: start;
  grid-template-columns: repeat(24, minmax(0, 1fr));
  grid-auto-rows: minmax(44px, auto);
  gap: var(--designer-row-gap) var(--designer-grid-gutter);
}

.designer-canvas__tail-drop-zone {
  min-height: 72px;
  flex: 1 1 auto;
  margin-top: var(--designer-row-gap);
}

.designer-canvas__tail-drop-zone.is-empty {
  min-height: 100%;
  margin-top: 0;
}

.designer-canvas__tail-drop-zone:not(.is-empty, .is-active) {
  background: transparent;
  border-color: transparent;
}

.designer-canvas__tail-drop-zone:not(.is-empty, .is-active) :deep(span) {
  opacity: 0;
}

.designer-canvas__surface.is-align-left :deep(.designer-node-frame__label) {
  justify-content: flex-start;
  text-align: left;
}

.designer-canvas__surface.is-align-right :deep(.designer-node-frame__label) {
  justify-content: flex-end;
  text-align: right;
}

.designer-canvas :deep(.designer-canvas-node--ghost) {
  background: color-mix(in srgb, var(--el-color-primary) 8%, transparent);
  outline: 1px dashed var(--el-color-primary-light-3);
  opacity: 0.22;
}

.designer-canvas :deep(.designer-canvas-node--chosen) {
  cursor: grabbing;
}

.designer-canvas :deep(.designer-canvas-node--dragging) {
  box-shadow: var(--el-box-shadow-light);
  opacity: 0.9;
}
</style>
