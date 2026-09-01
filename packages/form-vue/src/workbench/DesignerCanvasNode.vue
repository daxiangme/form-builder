<template>
  <div
    v-if="node.nodeType === 'FIELD' && field"
    class="designer-canvas-node designer-canvas-node--field"
    :class="{ 'is-table-cell': tableCell }"
    :data-designer-node-id="node.id"
    :data-designer-node-label="field.label"
    :data-designer-index="itemIndex"
    :style="nodeGridStyle"
  >
    <DesignerNodeFrame
      :label="field.label"
      :component-name="componentName"
      :selected="selectedNodeId === node.id"
      :required="field.required"
      :show-label="tableCell ? false : grid.showLabel"
      :label-position="grid.labelPosition"
      :form-label-position="formLabelPosition"
      :label-width="formLabelWidth"
      :palette-drag-active="paletteDragActive"
      :drop-target="dropTarget"
      @select="emit('select', node.id)"
      @duplicate="emit('duplicate', node.id)"
      @remove="emit('remove', node.id)"
      @drop="forwardDrop"
    >
      <DesignerStaticControl :model-value="field.defaultValue" :field="field" mode="DESIGN" />
      <small v-if="field.helpText && !tableCell" class="designer-canvas-node__help">
        {{ field.helpText }}
      </small>
    </DesignerNodeFrame>
  </div>

  <section
    v-else-if="node.nodeType === 'CONTAINER'"
    class="designer-canvas-node designer-canvas-node--container"
    :class="[
      { 'is-selected': selectedNodeId === node.id, 'is-structural': registration?.acceptsChildren },
      `is-${node.componentType}`,
      ...containerAppearanceClasses,
    ]"
    :data-designer-node-id="node.id"
    :data-designer-node-label="textConfiguration('title') || componentName"
    :data-designer-index="itemIndex"
    :style="nodeGridStyle"
    @click.stop="emit('select', node.id)"
    @dragenter.prevent="handleContainerDragEnter"
    @dragover.prevent="handleContainerDragOver"
    @dragleave="handleContainerDragLeave"
    @drop.prevent.stop="handleContainerDrop"
  >
    <DesignerDropIndicator v-if="containerDropPlacement" :placement="containerDropPlacement" />

    <header class="designer-canvas-node__chrome">
      <button
        class="designer-canvas-node__handle designer-node-drag-handle"
        type="button"
        aria-label="拖动组件"
      >
        <DxSvgIcon icon="ri:draggable" />
      </button>
      <DxSvgIcon :icon="registration?.icon ?? 'ri:error-warning-line'" />
      <strong>{{ textConfiguration('title') || componentName }}</strong>
      <small v-if="registration?.acceptsChildren">{{ childCount }} 项</small>
      <span />
      <button type="button" aria-label="复制组件" @click.stop="emit('duplicate', node.id)">
        <DxSvgIcon icon="ri:file-copy-line" />
      </button>
      <button type="button" aria-label="移除组件" @click.stop="emit('remove', node.id)">
        <DxSvgIcon icon="ri:delete-bin-line" />
      </button>
    </header>

    <component :is="`h${headingLevel}`" v-if="node.componentType === 'title'" :style="headingStyle">
      {{ textConfiguration('text') || '标题' }}
    </component>
    <ElDivider
      v-else-if="node.componentType === 'divider'"
      :content-position="dividerPosition"
      :border-style="dividerBorderStyle"
    >
      {{ textConfiguration('text') }}
    </ElDivider>
    <ElAlert
      v-else-if="node.componentType === 'alert'"
      :title="textConfiguration('title') || '提示内容'"
      :type="alertType"
      :effect="textConfiguration('effect') === 'dark' ? 'dark' : 'light'"
      :show-icon="booleanConfiguration('showIcon')"
      :closable="false"
    />
    <div
      v-else-if="node.componentType === 'button'"
      class="designer-canvas-node__button"
      :class="`is-${buttonAlign}`"
    >
      <ElButton
        :type="buttonType"
        :plain="booleanConfiguration('plain')"
        :round="booleanConfiguration('round')"
        disabled
      >
        {{ textConfiguration('text') || '按钮' }}
      </ElButton>
    </div>
    <ElAlert
      v-else-if="node.componentType === 'captcha'"
      type="warning"
      :closable="false"
      show-icon
      title="当前部署未配置短信或邮箱验证码渠道"
    />
    <ElAlert
      v-else-if="node.componentType === 'iframe'"
      type="info"
      :closable="false"
      show-icon
      :title="textConfiguration('title') || '外部页面'"
      description="静态 Core 不加载任意外部 URL"
    />

    <DesignerTabsFrame
      v-else-if="node.componentType === 'tabs'"
      v-model="activeSlot"
      class="designer-canvas-node__tabs"
      :items="node.slots"
      :type="tabsType"
    >
      <template #default="{ item: slot }">
        <DesignerDropZone
          v-if="slot.children.length === 0"
          :active="paletteDragActive"
          @drop="forwardDrop($event, slotDropTarget(slot.slotCode, 0))"
        />
        <VueDraggable
          v-else
          class="designer-canvas-node__slot-list"
          :model-value="slot.children"
          :group="sortableGroup"
          :animation="120"
          :disabled="device === 'mobile'"
          :on-move="canSortMove"
          draggable=".designer-canvas-node"
          handle=".designer-node-drag-handle"
          ghost-class="designer-canvas-node--ghost"
          chosen-class="designer-canvas-node--chosen"
          drag-class="designer-canvas-node--dragging"
          :data-container-id="node.id"
          :data-slot-code="slot.slotCode"
          @update:model-value="updateSlotChildren(slot.slotCode, $event)"
          @start="emit('drag-start', $event)"
          @end="emit('drag-end')"
        >
          <DesignerGridDropCell
            v-for="gap in slotProjection(slot.slotCode).gaps"
            :key="`${slot.id}-gap-${gap.row}-${gap.start}-${gap.index}`"
            :gap="gap"
            :active="paletteDragActive && device === 'desktop'"
            :target="{ containerId: node.id, slotCode: slot.slotCode }"
            @drop="forwardDrop"
          />
          <DesignerCanvasNode
            v-for="(child, index) in slot.children"
            :key="child.id"
            :node="child"
            :item-index="index"
            :fields="fields"
            :selected-node-id="selectedNodeId"
            :device="device"
            :gutter="gutter"
            :appearance="appearance"
            :grid-cell="slotCell(slot.slotCode, child.id)"
            :form-label-position="formLabelPosition"
            :form-label-width="formLabelWidth"
            :palette-drag-active="paletteDragActive"
            :drop-target="slotDropTarget(slot.slotCode, index)"
            :can-sort-move="canSortMove"
            @select="emit('select', $event)"
            @remove="emit('remove', $event)"
            @duplicate="emit('duplicate', $event)"
            @drop="forwardDrop"
            @reorder="forwardReorder"
            @drag-start="emit('drag-start', $event)"
            @drag-end="emit('drag-end')"
          />
        </VueDraggable>
      </template>
    </DesignerTabsFrame>

    <div
      v-else-if="node.componentType === 'row-subtable'"
      class="designer-canvas-node__subtable is-row"
    >
      <div class="designer-canvas-node__subtable-bar">
        <span>示例行</span>
        <ElButton disabled><DxSvgIcon icon="ri:add-line" />新增一行</ElButton>
      </div>
      <template v-for="slot in node.slots" :key="slot.id">
        <DesignerDropZone
          v-if="slot.children.length === 0"
          :active="paletteDragActive"
          label="拖入字段形成子表列"
          @drop="forwardDrop($event, slotDropTarget(slot.slotCode, 0))"
        />
        <template v-else>
          <div class="designer-canvas-node__table-head" :style="tableColumnsStyle(slot.slotCode)">
            <span v-for="column in subtableColumns(slot.slotCode)" :key="column.columnId">
              {{ column.label }}
            </span>
          </div>
          <VueDraggable
            class="designer-canvas-node__table-row"
            :style="tableColumnsStyle(slot.slotCode)"
            :model-value="slot.children"
            :group="sortableGroup"
            :animation="120"
            :disabled="device === 'mobile'"
            :on-move="canSortMove"
            draggable=".designer-canvas-node"
            handle=".designer-node-drag-handle"
            ghost-class="designer-canvas-node--ghost"
            chosen-class="designer-canvas-node--chosen"
            drag-class="designer-canvas-node--dragging"
            :data-container-id="node.id"
            :data-slot-code="slot.slotCode"
            @update:model-value="updateSlotChildren(slot.slotCode, $event)"
            @start="emit('drag-start', $event)"
            @end="emit('drag-end')"
          >
            <DesignerCanvasNode
              v-for="(child, index) in slot.children"
              :key="child.id"
              :node="child"
              :item-index="index"
              :fields="fields"
              :selected-node-id="selectedNodeId"
              :device="device"
              :gutter="gutter"
              :appearance="appearance"
              :grid-cell="slotCell(slot.slotCode, child.id)"
              :form-label-position="formLabelPosition"
              :form-label-width="formLabelWidth"
              :palette-drag-active="paletteDragActive"
              :drop-target="slotDropTarget(slot.slotCode, index)"
              :can-sort-move="canSortMove"
              table-cell
              @select="emit('select', $event)"
              @remove="emit('remove', $event)"
              @duplicate="emit('duplicate', $event)"
              @drop="forwardDrop"
              @reorder="forwardReorder"
              @drag-start="emit('drag-start', $event)"
              @drag-end="emit('drag-end')"
            />
          </VueDraggable>
        </template>
      </template>
    </div>

    <div
      v-else-if="node.componentType === 'block-subtable' || registration?.acceptsChildren"
      class="designer-canvas-node__container-content"
      :class="{ 'is-block-subtable': node.componentType === 'block-subtable' }"
    >
      <div v-if="node.componentType === 'block-subtable'" class="designer-canvas-node__block-index">
        # 1 示例数据块
      </div>
      <template v-for="slot in node.slots" :key="slot.id">
        <DesignerDropZone
          v-if="slot.children.length === 0"
          :active="paletteDragActive"
          @drop="forwardDrop($event, slotDropTarget(slot.slotCode, 0))"
        />
        <VueDraggable
          v-else
          class="designer-canvas-node__slot-list"
          :model-value="slot.children"
          :group="sortableGroup"
          :animation="120"
          :disabled="device === 'mobile'"
          :on-move="canSortMove"
          draggable=".designer-canvas-node"
          handle=".designer-node-drag-handle"
          ghost-class="designer-canvas-node--ghost"
          chosen-class="designer-canvas-node--chosen"
          drag-class="designer-canvas-node--dragging"
          :data-container-id="node.id"
          :data-slot-code="slot.slotCode"
          @update:model-value="updateSlotChildren(slot.slotCode, $event)"
          @start="emit('drag-start', $event)"
          @end="emit('drag-end')"
        >
          <DesignerGridDropCell
            v-for="gap in slotProjection(slot.slotCode).gaps"
            :key="`${slot.id}-gap-${gap.row}-${gap.start}-${gap.index}`"
            :gap="gap"
            :active="paletteDragActive && device === 'desktop'"
            :target="{ containerId: node.id, slotCode: slot.slotCode }"
            @drop="forwardDrop"
          />
          <DesignerCanvasNode
            v-for="(child, index) in slot.children"
            :key="child.id"
            :node="child"
            :item-index="index"
            :fields="fields"
            :selected-node-id="selectedNodeId"
            :device="device"
            :gutter="gutter"
            :appearance="appearance"
            :grid-cell="slotCell(slot.slotCode, child.id)"
            :form-label-position="formLabelPosition"
            :form-label-width="formLabelWidth"
            :palette-drag-active="paletteDragActive"
            :drop-target="slotDropTarget(slot.slotCode, index)"
            :can-sort-move="canSortMove"
            @select="emit('select', $event)"
            @remove="emit('remove', $event)"
            @duplicate="emit('duplicate', $event)"
            @drop="forwardDrop"
            @reorder="forwardReorder"
            @drag-start="emit('drag-start', $event)"
            @drag-end="emit('drag-end')"
          />
        </VueDraggable>
      </template>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue'
import type { CSSProperties } from 'vue'
import { VueDraggable, type SortableEvent } from 'vue-draggable-plus'
import DxSvgIcon from '../infrastructure/FormIcon.vue'
import { projectDesignerCanvas } from '@daxiangme/form-core'
import { findDesignerComponent } from '@daxiangme/form-core'
import {
  designerContainerAppearanceClasses,
  resolveDesignerContainerAppearance,
} from '@daxiangme/form-core'
import {
  createDesignerSubtableGridLayout,
  projectDesignerSubtableColumns,
} from '@daxiangme/form-core'
import type {
  DesignerCanvasCell,
  DesignerCanvasProjection,
  DesignerAppearance,
  DesignerDevice,
  DesignerDropTarget,
  DesignerField,
  DesignerLayoutNode,
  DesignerSortableMoveEvent,
  DesignerSubtableColumn,
} from '@daxiangme/form-core'
import DesignerStaticControl from '../rendering/DesignerStaticControl.vue'
import DesignerDropIndicator from './DesignerDropIndicator.vue'
import DesignerDropZone from './DesignerDropZone.vue'
import DesignerGridDropCell from './DesignerGridDropCell.vue'
import DesignerNodeFrame from './DesignerNodeFrame.vue'
import DesignerTabsFrame from './DesignerTabsFrame.vue'

defineOptions({ name: 'DesignerCanvasNode' })

const props = withDefaults(
  defineProps<{
    node: DesignerLayoutNode
    itemIndex: number
    fields: DesignerField[]
    selectedNodeId: string
    device: DesignerDevice
    gutter: number
    appearance: DesignerAppearance
    gridCell: DesignerCanvasCell
    formLabelPosition: 'TOP' | 'LEFT' | 'RIGHT'
    formLabelWidth: number
    paletteDragActive: boolean
    dropTarget: DesignerDropTarget
    canSortMove: (event: DesignerSortableMoveEvent) => boolean
    tableCell?: boolean
  }>(),
  { tableCell: false },
)
const emit = defineEmits<{
  select: [nodeId: string]
  remove: [nodeId: string]
  duplicate: [nodeId: string]
  drop: [payload: string, target: DesignerDropTarget]
  reorder: [containerId: string | null, slotCode: string, nodes: DesignerLayoutNode[]]
  'drag-start': [event?: SortableEvent]
  'drag-end': []
}>()
const sortableGroup = { name: 'daxiang-form-designer-canvas', pull: true, put: true }
const containerDropPlacement = ref<'BEFORE' | 'AFTER' | ''>('')
const field = computed(() => {
  const current = props.node
  return current.nodeType === 'FIELD'
    ? props.fields.find((item) => item.id === current.fieldId)
    : undefined
})
const registration = computed(() =>
  findDesignerComponent(
    props.node.nodeType === 'FIELD' ? (field.value?.componentType ?? '') : props.node.componentType,
  ),
)
const componentName = computed(() => registration.value?.name ?? '未知组件')
const grid = computed(() => props.node.layout[props.device === 'mobile' ? 'mobile' : 'pc'])
const activeSlot = ref('')
const lastActiveSlotIndex = ref(0)
const childCount = computed(() =>
  props.node.nodeType === 'CONTAINER'
    ? props.node.slots.reduce((count, slot) => count + slot.children.length, 0)
    : 0,
)
const containerAppearanceClasses = computed(() =>
  props.node.nodeType === 'CONTAINER'
    ? designerContainerAppearanceClasses(
        resolveDesignerContainerAppearance(props.appearance, props.node),
      )
    : [],
)
const headingLevel = computed(() => Math.max(1, Math.min(6, numberConfiguration('level') || 3)))
const headingStyle = computed<CSSProperties>(() => ({
  color: textConfiguration('fontColor') || undefined,
  fontSize: numberConfiguration('fontSize') ? `${numberConfiguration('fontSize')}px` : undefined,
  textAlign: normalizedTextAlign(textConfiguration('align')),
}))
const dividerPosition = computed(() => normalizedTextAlign(textConfiguration('position')) ?? 'left')
const dividerBorderStyle = computed(() => {
  const value = textConfiguration('borderStyle')
  return ['solid', 'dashed', 'dotted'].includes(value)
    ? (value as 'solid' | 'dashed' | 'dotted')
    : 'solid'
})
const alertType = computed(() => {
  const value = textConfiguration('type')
  return ['success', 'warning', 'info', 'error'].includes(value)
    ? (value as 'success' | 'warning' | 'info' | 'error')
    : 'info'
})
const buttonType = computed(() => {
  const value = textConfiguration('buttonType')
  return ['primary', 'success', 'warning', 'danger', 'info'].includes(value)
    ? (value as 'primary' | 'success' | 'warning' | 'danger' | 'info')
    : 'primary'
})
const buttonAlign = computed(() => normalizedTextAlign(textConfiguration('align')) ?? 'left')
const tabsType = computed(() => {
  const value = textConfiguration('tabsType')
  return ['card', 'border-card'].includes(value) ? (value as 'card' | 'border-card') : undefined
})
const nodeGridStyle = computed<CSSProperties>(() =>
  props.tableCell
    ? { gridColumn: 'auto', gridRow: '1' }
    : {
        gridColumn: `${props.gridCell.start + 1} / span ${props.gridCell.span}`,
        gridRow: `${props.gridCell.row + 1}`,
      },
)

watchEffect(() => {
  if (props.node.nodeType !== 'CONTAINER' || props.node.componentType !== 'tabs') return
  const currentIndex = props.node.slots.findIndex((slot) => slot.slotCode === activeSlot.value)
  if (currentIndex >= 0) {
    lastActiveSlotIndex.value = currentIndex
    return
  }
  if (props.node.slots.length === 0) {
    activeSlot.value = ''
    lastActiveSlotIndex.value = 0
    return
  }
  const fallbackIndex = Math.min(lastActiveSlotIndex.value, props.node.slots.length - 1)
  activeSlot.value = props.node.slots[fallbackIndex]?.slotCode ?? ''
})

function slotProjection(slotCode: string): DesignerCanvasProjection {
  if (props.node.nodeType !== 'CONTAINER') return { cells: [], gaps: [], rowCount: 1 }
  const slot = props.node.slots.find((item) => item.slotCode === slotCode)
  return projectDesignerCanvas(slot?.children ?? [], props.device)
}

function slotCell(slotCode: string, nodeId: string): DesignerCanvasCell {
  return (
    slotProjection(slotCode).cells.find((cell) => cell.nodeId === nodeId) ?? {
      nodeId,
      index: 0,
      row: 0,
      start: 0,
      span: 24,
    }
  )
}

function slotDropTarget(slotCode: string, index: number): DesignerDropTarget {
  return { containerId: props.node.id, slotCode, index, placement: 'INSIDE' }
}

function updateSlotChildren(slotCode: string, children: DesignerLayoutNode[]): void {
  emit('reorder', props.node.id, slotCode, children)
}

function forwardDrop(payload: string, target: DesignerDropTarget): void {
  emit('drop', payload, target)
}

function forwardReorder(
  containerId: string | null,
  slotCode: string,
  nodes: DesignerLayoutNode[],
): void {
  emit('reorder', containerId, slotCode, nodes)
}

function handleContainerDragEnter(event: DragEvent): void {
  if (!acceptsPaletteComponent(event)) return
  updateContainerDropPlacement(event)
}

function handleContainerDragOver(event: DragEvent): void {
  if (!acceptsPaletteComponent(event)) return
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
  updateContainerDropPlacement(event)
}

function handleContainerDragLeave(event: DragEvent): void {
  const current = event.currentTarget as HTMLElement | null
  const related = event.relatedTarget as Node | null
  if (current && related && current.contains(related)) return
  containerDropPlacement.value = ''
}

function handleContainerDrop(event: DragEvent): void {
  const componentType = event.dataTransfer?.getData('application/x-daxiang-form-component') ?? ''
  if (!componentType || !containerDropPlacement.value) return
  const placement = containerDropPlacement.value
  containerDropPlacement.value = ''
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

function updateContainerDropPlacement(event: DragEvent): void {
  const element = event.currentTarget as HTMLElement
  const bounds = element.getBoundingClientRect()
  containerDropPlacement.value = event.clientY < bounds.top + bounds.height / 2 ? 'BEFORE' : 'AFTER'
}

/** 返回设计行、表头和运行态共用的子表列投影。 */
function subtableColumns(slotCode: string): DesignerSubtableColumn[] {
  return props.node.nodeType === 'CONTAINER'
    ? projectDesignerSubtableColumns(props.node, props.fields, slotCode, { includeHidden: true })
    : []
}

/** 将统一子表列投影转换为设计画布使用的网格样式。 */
function tableColumnsStyle(slotCode: string): CSSProperties {
  const layout = createDesignerSubtableGridLayout(subtableColumns(slotCode))
  return { gridTemplateColumns: layout.template, minWidth: layout.minimumWidth }
}

function textConfiguration(key: string): string {
  const value = props.node.nodeType === 'CONTAINER' ? props.node.configuration[key] : undefined
  return typeof value === 'string' ? value : ''
}

function numberConfiguration(key: string): number {
  const value = props.node.nodeType === 'CONTAINER' ? props.node.configuration[key] : undefined
  return typeof value === 'number' ? value : 0
}

function booleanConfiguration(key: string): boolean {
  return props.node.nodeType === 'CONTAINER' && props.node.configuration[key] === true
}

function normalizedTextAlign(value: string): 'left' | 'center' | 'right' | undefined {
  return ['left', 'center', 'right'].includes(value)
    ? (value as 'left' | 'center' | 'right')
    : undefined
}
</script>

<style scoped>
.designer-canvas-node {
  position: relative;
  min-width: 0;
  align-self: start;
}

.designer-canvas-node__help {
  display: block;
  width: 100%;
  margin-top: var(--daxiang-form-space-1);
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.designer-canvas-node__chrome {
  display: grid;
  min-height: 34px;
  align-items: center;
  padding: 0 var(--daxiang-form-space-2);
  color: var(--el-text-color-regular);
  background: color-mix(in srgb, var(--el-fill-color-light) 72%, transparent);
  border-bottom: 1px dashed var(--el-border-color-lighter);
  grid-template-columns: auto auto auto auto 1fr auto auto;
  gap: var(--daxiang-form-space-1);
  font-size: 12px;
}

.designer-canvas-node__chrome small {
  color: var(--el-text-color-secondary);
}

.designer-canvas-node__chrome button {
  display: inline-flex;
  padding: var(--daxiang-form-space-1);
  color: inherit;
  background: transparent;
  border: 0;
  cursor: pointer;
}

.designer-canvas-node__handle {
  cursor: grab !important;
}

.designer-canvas-node--container {
  border: 1px solid transparent;
  transition: border-color var(--el-transition-duration-fast);
}

.designer-canvas-node--container:hover,
.designer-canvas-node--container.is-selected {
  border-color: var(--el-color-primary-light-5);
}

.designer-canvas-node--container.is-selected {
  box-shadow: inset 0 0 0 1px var(--el-color-primary-light-8);
}

.designer-canvas-node--container.is-structural {
  border-color: var(--el-border-color-lighter);
  border-style: dashed;
}

.designer-canvas-node--container.daxiang-form-container-surface.is-surface-none {
  border-color: var(--el-border-color-lighter);
  background: transparent;
}

.designer-canvas-node--container.daxiang-form-container-surface:not(.is-surface-none) {
  border-radius: var(--daxiang-form-container-radius);
}

.designer-canvas-node--container.daxiang-form-container-surface.is-surface-bordered {
  background: var(--el-bg-color);
  border-color: var(--el-border-color-lighter);
  border-style: solid;
}

.designer-canvas-node--container.daxiang-form-container-surface.is-surface-shadow {
  background: var(--el-bg-color);
  border-color: transparent;
  border-style: solid;
  box-shadow: var(--el-box-shadow-light);
}

.designer-canvas-node--container.daxiang-form-container-surface.is-surface-shadow:hover,
.designer-canvas-node--container.daxiang-form-container-surface.is-surface-shadow.is-selected {
  border-color: var(--el-color-primary-light-5);
}

.designer-canvas-node--container.daxiang-form-container-surface.is-surface-shadow.is-selected {
  box-shadow:
    var(--el-box-shadow-light),
    inset 0 0 0 1px var(--el-color-primary-light-8);
}

.designer-canvas-node--container.daxiang-form-container-surface.is-surface-filled,
.designer-canvas-node__container-content.is-block-subtable {
  background: var(--el-fill-color-extra-light);
}

.designer-canvas-node__container-content,
.designer-canvas-node__subtable {
  min-width: 0;
  padding: var(--daxiang-form-space-2);
}

.designer-canvas-node__subtable.is-row {
  overflow-x: auto;
}

.designer-canvas-node__slot-list {
  display: grid;
  min-width: 0;
  min-height: 44px;
  align-content: start;
  grid-template-columns: repeat(24, minmax(0, 1fr));
  grid-auto-rows: minmax(44px, auto);
  gap: var(--designer-row-gap) var(--designer-grid-gutter);
}

.designer-canvas-node__subtable-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: var(--daxiang-form-space-2);
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.designer-canvas-node__table-head,
.designer-canvas-node__table-row {
  display: grid;
  min-width: max-content;
}

.designer-canvas-node__table-head {
  min-height: 34px;
  align-items: center;
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-lighter);
  font-size: 12px;
}

.designer-canvas-node__table-head span {
  min-width: 0;
  padding: 0 var(--daxiang-form-space-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.designer-canvas-node__table-row {
  border-right: 1px solid var(--el-border-color-lighter);
  border-bottom: 1px solid var(--el-border-color-lighter);
  border-left: 1px solid var(--el-border-color-lighter);
}

.designer-canvas-node__table-row > :deep(.designer-canvas-node) {
  border-right: 1px solid var(--el-border-color-lighter);
}

.designer-canvas-node__table-row > :deep(.designer-canvas-node:last-child) {
  border-right: 0;
}

.designer-canvas-node__block-index {
  display: inline-flex;
  min-height: 24px;
  align-items: center;
  margin-bottom: var(--daxiang-form-space-2);
  color: var(--el-color-primary);
  font-size: 12px;
}

.designer-canvas-node__button.is-center {
  text-align: center;
}

.designer-canvas-node__button.is-right {
  text-align: right;
}
</style>
