<template>
  <section class="daxiang-form form-designer-core">
    <DesignerCommandBar
      :document-name="engine.document.value.name"
      :dirty="engine.dirty.value"
      :can-undo="engine.canUndo.value"
      :can-redo="engine.canRedo.value"
      :viewport="viewport"
      :zoom="zoom"
      :grid-visible="gridVisible"
      @update:viewport="viewport = $event"
      @update:zoom="zoom = clampZoom($event)"
      @toggle-grid="gridVisible = !gridVisible"
      @fit="canvasRef?.fitToWidth()"
      @equal-layout="openQuickGrid"
      @batch-defaults="batchDefaultVisible = true"
      @schema="schemaVisible = true"
      @print="printPreview"
      @undo="engine.undo"
      @redo="engine.redo"
      @import="openImportPicker"
      @export="emit('export-request', currentDocument())"
      @clear="clearDocument"
      @preview="openPreview"
      @save="emit('save-request', currentDocument())"
    >
      <template #leading><slot name="header-leading" /></template>
    </DesignerCommandBar>

    <div ref="workspaceRef" class="form-designer-core__workspace" :style="workspaceStyle">
      <nav class="form-designer-core__rail is-left" aria-label="设计资源">
        <ElTooltip
          v-for="item in leftRailItems"
          :key="item.name"
          :content="item.label"
          placement="right"
        >
          <button
            type="button"
            :class="{ 'is-active': leftTab === item.name && !leftCollapsed }"
            :aria-label="item.label"
            @click="openLeftPanel(item.name)"
          >
            <DxSvgIcon :icon="item.icon" />
          </button>
        </ElTooltip>
        <ElTooltip :content="leftCollapsed ? '展开左侧栏' : '收起左侧栏'" placement="right">
          <button
            type="button"
            class="is-bottom"
            :aria-label="leftCollapsed ? '展开左侧栏' : '收起左侧栏'"
            @click="toggleLeftPanel"
          >
            <DxSvgIcon :icon="leftCollapsed ? 'ri:side-bar-line' : 'ri:side-bar-fill'" />
          </button>
        </ElTooltip>
      </nav>

      <aside
        v-show="!leftCollapsed"
        class="form-designer-core__left"
        :aria-hidden="leftCollapsed"
        :inert="leftCollapsed || undefined"
      >
        <DesignerPalette
          v-show="leftTab === 'components'"
          :catalogs="catalogs"
          @add="addComponent"
          @apply-template="applyTemplate"
        />
        <DesignerFieldTree
          v-show="leftTab === 'fields'"
          :document="canvasDocument"
          :source-metadata="sourceMetadata"
          :placed-field-ids="placedFieldIds"
          :placed-relation-codes="placedRelationCodes"
          :selected-field-id="selectedField?.id ?? ''"
          @select="selectField"
          @restore="restoreField"
          @delete="deleteField"
          @create-relation="createRelationContainer"
          @generate-layout="generateDataModelLayout"
        />
        <DesignerOutline
          v-show="leftTab === 'outline'"
          :items="outline"
          :selected-node-id="engine.selectedNodeId.value"
          @select="engine.selectedNodeId.value = $event"
        />
        <DesignerModuleManager
          v-show="leftTab === 'modules'"
          :document="engine.document.value"
          :active-view-code="activeViewCode"
          @select="selectView"
          @add="addModule"
          @duplicate="duplicateModule"
          @delete="deleteModule"
        />
      </aside>

      <div
        v-show="!leftCollapsed"
        class="form-designer-core__resizer is-left"
        role="separator"
        aria-label="调整左侧栏宽度"
        aria-orientation="vertical"
        :aria-valuemin="240"
        :aria-valuemax="360"
        :aria-valuenow="leftWidth"
        tabindex="0"
        @pointerdown="startResize('left', $event)"
        @keydown="resizeWithKeyboard('left', $event)"
      />

      <DesignerCanvas
        ref="canvasRef"
        class="form-designer-core__canvas"
        :document="canvasDocument"
        :selected-node-id="engine.selectedNodeId.value"
        :device="device"
        :viewport-width="viewportWidth"
        :zoom="zoom"
        :grid-visible="gridVisible"
        :active-module="activeModule"
        @select="engine.selectedNodeId.value = $event"
        @remove="removeNode"
        @duplicate="duplicateNode"
        @drop="handleDrop"
        @reorder="applySortableOrder"
        @drag-end="engine.commitExternalMutation"
      />

      <div
        v-show="!rightCollapsed"
        class="form-designer-core__resizer is-right"
        role="separator"
        aria-label="调整右侧栏宽度"
        aria-orientation="vertical"
        :aria-valuemin="320"
        :aria-valuemax="480"
        :aria-valuenow="rightWidth"
        tabindex="0"
        @pointerdown="startResize('right', $event)"
        @keydown="resizeWithKeyboard('right', $event)"
      />

      <div
        v-show="!rightCollapsed"
        class="form-designer-core__right"
        :aria-hidden="rightCollapsed"
        :inert="rightCollapsed || undefined"
      >
        <DesignerInspector
          v-model:active-tab="rightTab"
          :document="engine.document.value"
          :selected-node="selectedNode"
          :selected-field="selectedField"
          :active-module="activeModule"
          @update-document="updateDocument"
          @update-appearance="updateAppearance"
          @update-field="updateField"
          @change-component="changeFieldComponent"
          @update-configuration="updateConfiguration"
          @update-grid="updateGrid"
          @apply-container-appearance="applyContainerAppearance"
          @update-root-entity="updateRootEntity"
          @update-relation="updateRelation"
          @update-submit-policy="updateSubmitPolicy"
          @update-action-bar="updateActionBar"
          @update-module="updateModule"
          @open-field-advanced="fieldAdvancedVisible = true"
          @open-event-editor="eventEditorVisible = true"
          @open-global-advanced="globalAdvancedVisible = true"
          @open-schema="schemaVisible = true"
        />
      </div>

      <nav class="form-designer-core__rail is-right" aria-label="设计配置">
        <ElTooltip content="组件配置" placement="left">
          <button
            type="button"
            :class="{ 'is-active': rightTab === 'component' && !rightCollapsed }"
            aria-label="组件配置"
            @click="openRightPanel('component')"
          >
            <DxSvgIcon icon="ri:file-settings-line" />
          </button>
        </ElTooltip>
        <ElTooltip content="表单配置" placement="left">
          <button
            type="button"
            :class="{ 'is-active': rightTab === 'form' && !rightCollapsed }"
            aria-label="表单配置"
            @click="openRightPanel('form')"
          >
            <DxSvgIcon icon="ri:settings-3-line" />
          </button>
        </ElTooltip>
        <ElTooltip :content="rightCollapsed ? '展开右侧栏' : '收起右侧栏'" placement="left">
          <button
            type="button"
            class="is-bottom"
            :aria-label="rightCollapsed ? '展开右侧栏' : '收起右侧栏'"
            @click="toggleRightPanel"
          >
            <DxSvgIcon :icon="rightCollapsed ? 'ri:side-bar-line' : 'ri:side-bar-fill'" />
          </button>
        </ElTooltip>
      </nav>
    </div>

    <input
      ref="importInputRef"
      type="file"
      accept="application/json,.json"
      hidden
      @change="importFile"
    />
    <DModal
      v-if="!previewOverlayCode"
      v-model="previewVisible"
      :title="previewTitle"
      width="min(1120px, calc(100vw - 32px))"
      :show-footer="false"
      :flush-content-vertical="true"
    >
      <DesignerPreviewForm
        :key="previewSession"
        :document="previewDocument"
        :device="device"
        :adapters="effectiveRuntimeAdapters"
        :adapter-context="adapterContext"
        show-toolbar
        :initial-overlay-code="previewOverlayCode"
      />
    </DModal>
    <DesignerPreviewForm
      v-else-if="previewVisible"
      :key="previewSession"
      :document="previewDocument"
      :device="device"
      :adapters="effectiveRuntimeAdapters"
      :adapter-context="adapterContext"
      show-toolbar
      :initial-overlay-code="previewOverlayCode"
      overlay-only
      @overlay-closed="closePreviewSession"
      @overlay-open-failed="handlePreviewOpenFailure"
    />
    <DesignerQuickGridEditor
      v-model="quickGridVisible"
      :target-label="quickGridPreview.targetLabel"
      :affected-count="quickGridPreview.affectedNodeIds.length"
      :skipped-count="quickGridPreview.skippedCount"
      @save="applyQuickGrid"
    />
    <DesignerBatchDefaultEditor
      v-model="batchDefaultVisible"
      :fields="batchDefaultFields"
      @save="applyBatchDefaults"
    />
    <DesignerAdvancedBehaviorEditor
      v-if="selectedField"
      v-model="fieldAdvancedVisible"
      :field="selectedField"
      :document="engine.document.value"
      :selected-node-id="selectedNode?.id ?? ''"
      :supported-events="selectedSupportedEvents"
      :capabilities="fieldBehaviorCapabilities"
      @save="saveFieldBehavior"
    />
    <DesignerEventFlowEditor
      v-model="eventEditorVisible"
      :document="engine.document.value"
      :selected-node-id="selectedNode?.id ?? ''"
      :capabilities="fieldBehaviorCapabilities"
      @save="saveEventFlows"
    />
    <DesignerGlobalAdvancedEditor
      v-model="globalAdvancedVisible"
      :document="engine.document.value"
      @save="saveGlobalAdvanced"
    />
    <DesignerSchemaInspector
      v-model="schemaVisible"
      :document="engine.document.value"
      @import="replaceDocument($event, true)"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import DModal from './infrastructure/FormModalShell.vue'
import DxSvgIcon from './infrastructure/FormIcon.vue'
import {
  applyDesignerBatchDefaults,
  applyDesignerQuickGrid,
  collectDesignerBatchDefaultFields,
  previewDesignerQuickGrid,
} from '@daxiangme/form-core'
import {
  compatibleDesignerComponents,
  findDesignerComponent,
  resolveDesignerCatalogComponents,
} from '@daxiangme/form-core'
import { applyDesignerContainerAppearanceInheritance } from '@daxiangme/form-core'
import {
  collectPlacedRelationCodes,
  prepareDesignerDataModel,
  resolveDesignerTargetEntityCode,
  updateDesignerRelation,
  updateDesignerRootEntity,
} from '@daxiangme/form-core'
import {
  cloneDesignerDocument,
  collectPlacedFieldIds,
  createDesignerOutline,
  createEmptyDesignerDocument,
  createNodeFromComponent,
  createDesignerRelationContainer,
  deleteUnplacedDesignerField,
  designerComponentDropRejection,
  designerNodeDropRejection,
  diagnoseDesignerDocument,
  duplicateDesignerNode,
  findDesignerNode,
  generateDesignerDataModelLayout,
  insertDesignerNode,
  isDesignerRadiusValue,
  moveDesignerNode,
  removeDesignerNode,
  restoreDesignerFieldNode,
  serializeDesignerDocument,
  synchronizeContainerSlots,
} from '@daxiangme/form-core'
import { decodeDesignerImport, useDesignerEngine } from './composables/use-designer-engine'
import {
  createDesignerOverlayModule,
  DESIGNER_MAIN_VIEW_CODE,
  duplicateDesignerOverlayModule,
  mutateDesignerView,
  removeDesignerOverlayModule,
  resolveDesignerViewRoot,
} from '@daxiangme/form-core'
import {
  loadDesignerWorkbenchPreferences,
  resolveDesignerViewportPreset,
  saveDesignerWorkbenchPreferences,
  type DesignerCanvasViewportPreset,
} from './workbench/workbench-preferences'
import type {
  DesignerActionBar,
  DesignerComponentEvent,
  DesignerContainerAppearanceDimension,
  DesignerDevice,
  DesignerDocument,
  DesignerDropTarget,
  DesignerField,
  DesignerFieldBehavior,
  DesignerEventFlow,
  DesignerEventStep,
  DesignerGenerateLayoutRequest,
  DesignerInitialDataModel,
  DesignerLayoutNode,
  DesignerOverlayModule,
  DesignerRelationPatch,
  DesignerRuntimeAdapters,
  DesignerRootEntityPatch,
  FormDesignerCatalogs,
  FormRuntimeAdapterContext,
} from '@daxiangme/form-core'
import DesignerPreviewForm from './rendering/DesignerPreviewForm.vue'
import type { DesignerFieldBehaviorCapabilities } from '@daxiangme/form-core'
import DesignerCanvas from './workbench/DesignerCanvas.vue'
import DesignerAdvancedBehaviorEditor from './workbench/DesignerAdvancedBehaviorEditor.vue'
import DesignerBatchDefaultEditor from './workbench/DesignerBatchDefaultEditor.vue'
import DesignerCommandBar from './workbench/DesignerCommandBar.vue'
import DesignerEventFlowEditor from './workbench/DesignerEventFlowEditor.vue'
import DesignerFieldTree from './workbench/DesignerFieldTree.vue'
import DesignerGlobalAdvancedEditor from './workbench/DesignerGlobalAdvancedEditor.vue'
import DesignerInspector from './workbench/DesignerInspector.vue'
import DesignerModuleManager from './workbench/DesignerModuleManager.vue'
import DesignerOutline from './workbench/DesignerOutline.vue'
import DesignerPalette from './workbench/DesignerPalette.vue'
import DesignerQuickGridEditor from './workbench/DesignerQuickGridEditor.vue'
import DesignerSchemaInspector from './workbench/DesignerSchemaInspector.vue'

defineOptions({ name: 'FormDesigner' })

const props = defineProps<{
  modelValue: DesignerDocument
  initialDataModel?: DesignerInitialDataModel
  catalogs?: FormDesignerCatalogs
  adapters?: DesignerRuntimeAdapters
  adapterContext?: FormRuntimeAdapterContext
  /** @deprecated 请使用 adapters。 */
  runtimeAdapters?: DesignerRuntimeAdapters
}>()
const emit = defineEmits<{
  'update:modelValue': [document: DesignerDocument]
  'dirty-change': [dirty: boolean]
  diagnostics: [items: ReturnType<typeof diagnoseDesignerDocument>]
  'save-request': [document: DesignerDocument]
  'export-request': [document: DesignerDocument]
}>()
const initialPreparation = prepareDesignerDataModel(props.modelValue, props.initialDataModel)
const engine = useDesignerEngine(initialPreparation.document)
const sourceMetadata = ref(initialPreparation.sourceMetadata)
const initializationDiagnostics = ref(initialPreparation.diagnostics)
const initialPreferences = loadDesignerWorkbenchPreferences(props.modelValue.id)
const viewport = ref<DesignerCanvasViewportPreset>(initialPreferences.viewport)
const viewportResolution = computed(() => resolveDesignerViewportPreset(viewport.value))
const device = computed<DesignerDevice>(() => viewportResolution.value.device)
const viewportWidth = computed(() => viewportResolution.value.width)
const zoom = ref(100)
const gridVisible = ref(initialPreferences.gridVisible)
const leftTab = ref('components')
const rightTab = ref<'component' | 'form'>('component')
const activeViewCode = ref(DESIGNER_MAIN_VIEW_CODE)
const leftManualCollapsed = ref(initialPreferences.leftCollapsed)
const rightManualCollapsed = ref(initialPreferences.rightCollapsed)
const leftWidth = ref(initialPreferences.leftWidth)
const rightWidth = ref(initialPreferences.rightWidth)
const workspaceRef = ref<HTMLElement>()
const workspaceWidth = ref(0)
const autoCollapseLeft = computed(
  () => workspaceWidth.value > 0 && workspaceWidth.value < leftWidth.value + rightWidth.value + 620,
)
const autoCollapseRight = computed(
  () => workspaceWidth.value > 0 && workspaceWidth.value < rightWidth.value + 620,
)
const leftCollapsed = computed(() => leftManualCollapsed.value || autoCollapseLeft.value)
const rightCollapsed = computed(() => rightManualCollapsed.value || autoCollapseRight.value)
const workspaceStyle = computed(() => ({
  gridTemplateColumns: [
    '44px',
    leftCollapsed.value ? '0px' : `${leftWidth.value}px`,
    leftCollapsed.value ? '0px' : '6px',
    'minmax(0, 1fr)',
    rightCollapsed.value ? '0px' : '6px',
    rightCollapsed.value ? '0px' : `${rightWidth.value}px`,
    '44px',
  ].join(' '),
}))
const leftRailItems = [
  { name: 'components', label: '组件', icon: 'ri:apps-2-line' },
  { name: 'fields', label: '字段', icon: 'ri:list-check-3' },
  { name: 'outline', label: '大纲', icon: 'ri:node-tree' },
  { name: 'modules', label: '模块', icon: 'ri:window-line' },
] as const
const previewVisible = ref(false)
const previewSession = ref(0)
const previewTargetViewCode = ref(DESIGNER_MAIN_VIEW_CODE)
const quickGridVisible = ref(false)
const batchDefaultVisible = ref(false)
const fieldAdvancedVisible = ref(false)
const eventEditorVisible = ref(false)
const globalAdvancedVisible = ref(false)
const schemaVisible = ref(false)
const importInputRef = ref<HTMLInputElement>()
const canvasRef = ref<{
  fitToWidth: () => void
  captureViewport: () => { horizontal: number; vertical: number }
  restoreViewport: (position: { horizontal: number; vertical: number }) => Promise<void>
}>()
const activeViewRoot = computed(() =>
  resolveDesignerViewRoot(engine.document.value, activeViewCode.value),
)
const activeModule = computed(() =>
  engine.document.value.uiSchema.overlays.find((module) => module.code === activeViewCode.value),
)
const canvasDocument = computed<DesignerDocument>(() => ({
  ...engine.document.value,
  uiSchema: { ...engine.document.value.uiSchema, root: activeViewRoot.value },
}))
const outline = computed(() => createDesignerOutline(canvasDocument.value))
const placedFieldIds = computed(() => collectPlacedFieldIds(activeViewRoot.value))
const placedRelationCodes = computed(() => collectPlacedRelationCodes(activeViewRoot.value))
const selectedNode = computed(() =>
  findDesignerNode(activeViewRoot.value, engine.selectedNodeId.value),
)
const selectedField = computed(() => {
  const node = selectedNode.value
  return node?.nodeType === 'FIELD'
    ? engine.document.value.dataSchema.fields.find((field) => field.id === node.fieldId)
    : undefined
})
const previewDocument = computed(() => cloneDesignerDocument(engine.document.value))
const previewTargetModule = computed(() =>
  engine.document.value.uiSchema.overlays.find(
    (module) => module.code === previewTargetViewCode.value,
  ),
)
const previewOverlayCode = computed(() => previewTargetModule.value?.code)
const previewTitle = computed(() =>
  previewTargetModule.value ? `运行预览 · ${previewTargetModule.value.name}` : '运行预览',
)
const quickGridPreview = computed(() =>
  previewDesignerQuickGrid(canvasDocument.value, engine.selectedNodeId.value),
)
const batchDefaultFields = computed(() => collectDesignerBatchDefaultFields(engine.document.value))
const selectedSupportedEvents = computed<DesignerComponentEvent[]>(() => {
  const registration = selectedField.value
    ? findDesignerComponent(selectedField.value.componentType)
    : undefined
  return registration?.supportedEvents ?? ['CHANGE', 'BLUR', 'FOCUS']
})
const hostAdapters = computed(() => props.adapters ?? props.runtimeAdapters)
const catalogComponents = computed(
  () => resolveDesignerCatalogComponents(props.catalogs).components,
)
const adapterContext = computed<FormRuntimeAdapterContext>(() => props.adapterContext ?? {})
const effectiveRuntimeAdapters = computed<DesignerRuntimeAdapters>(() => ({
  ...hostAdapters.value,
  linkageConfirmation: hostAdapters.value?.linkageConfirmation ?? {
    confirmOverwrite: async ({ fieldLabel }) => {
      try {
        await ElMessageBox.confirm(`${fieldLabel}已有值，是否使用联动结果覆盖？`, '确认联动覆盖', {
          type: 'warning',
          confirmButtonText: '覆盖',
          cancelButtonText: '保留原值',
        })
        return true
      } catch {
        return false
      }
    },
  },
}))
const fieldBehaviorCapabilities = computed<DesignerFieldBehaviorCapabilities>(() => ({
  remoteValidation: Boolean(effectiveRuntimeAdapters.value.remoteValidation),
  dataSource: Boolean(effectiveRuntimeAdapters.value.dataSource),
  navigation: Boolean(effectiveRuntimeAdapters.value.hostAction?.navigateResource),
  hostAction: Boolean(effectiveRuntimeAdapters.value.hostAction?.execute),
  linkageConfirmation: Boolean(effectiveRuntimeAdapters.value.linkageConfirmation),
}))

let workspaceResizeObserver: ResizeObserver | undefined

watch(
  () => props.modelValue,
  (document) => {
    if (serializeDesignerDocument(document) === serializeDesignerDocument(engine.document.value))
      return
    replaceDocument(document)
  },
  { deep: true },
)

watch(
  () => engine.document.value,
  (document) => {
    const next = cloneDesignerDocument(document)
    emit('update:modelValue', next)
    emit('diagnostics', [...initializationDiagnostics.value, ...diagnoseDesignerDocument(next)])
  },
  { deep: true },
)
watch(
  () => engine.dirty.value,
  (dirty) => emit('dirty-change', dirty),
  { immediate: true },
)
watch(
  [leftManualCollapsed, rightManualCollapsed, leftWidth, rightWidth, gridVisible, viewport],
  () => {
    saveDesignerWorkbenchPreferences(engine.document.value.id, {
      version: 1,
      leftCollapsed: leftManualCollapsed.value,
      rightCollapsed: rightManualCollapsed.value,
      leftWidth: leftWidth.value,
      rightWidth: rightWidth.value,
      gridVisible: gridVisible.value,
      viewport: viewport.value,
    })
  },
)
onMounted(() => {
  window.addEventListener('keydown', handleShortcut)
  workspaceResizeObserver = new ResizeObserver(() => {
    workspaceWidth.value = workspaceRef.value?.clientWidth ?? 0
  })
  if (workspaceRef.value) workspaceResizeObserver.observe(workspaceRef.value)
  workspaceWidth.value = workspaceRef.value?.clientWidth ?? 0
  emit('update:modelValue', currentDocument())
  emit('diagnostics', [
    ...initializationDiagnostics.value,
    ...diagnoseDesignerDocument(currentDocument()),
  ])
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleShortcut)
  workspaceResizeObserver?.disconnect()
})

/** 返回与 Vue 代理隔离的当前文档。 */
function currentDocument(): DesignerDocument {
  return cloneDesignerDocument(engine.document.value)
}

/** 替换文档时重新执行一次性参数判定，并刷新只读来源索引。 */
function replaceDocument(document: DesignerDocument, keepHistory = false): void {
  const preparation = prepareDesignerDataModel(document, props.initialDataModel)
  sourceMetadata.value = preparation.sourceMetadata
  initializationDiagnostics.value = preparation.diagnostics
  engine.replaceDocument(preparation.document, keepHistory)
  activeViewCode.value = DESIGNER_MAIN_VIEW_CODE
}

/** 将组件点击添加到根布局末尾。 */
function addComponent(componentType: string): void {
  addComponentAt(componentType, {
    containerId: null,
    slotCode: 'root',
    index: activeViewRoot.value.length,
  })
}

function addComponentAt(componentType: string, target: DesignerDropTarget): void {
  const registration =
    catalogComponents.value.find((item) => item.componentType === componentType) ??
    findDesignerComponent(componentType)
  if (!registration) {
    ElMessage.error(`组件 ${componentType} 未注册`)
    return
  }
  if (registration.availability === 'UNAVAILABLE') {
    ElMessage.warning(registration.unavailableReason)
    return
  }
  const rejection = designerComponentDropRejection(canvasDocument.value, componentType, target)
  if (rejection) {
    ElMessage.warning(rejection)
    return
  }
  let selectedId = ''
  engine.execute((document) => {
    mutateDesignerView(document, activeViewCode.value, (viewDocument) => {
      const entityCode =
        registration.nodeKind === 'FIELD'
          ? resolveDesignerTargetEntityCode(viewDocument, target.containerId)
          : undefined
      const node = createNodeFromComponent(viewDocument, componentType, { entityCode })
      if (!node || !insertDesignerNode(viewDocument, node, target)) return
      selectedId = node.id
    })
  })
  if (selectedId) engine.selectedNodeId.value = selectedId
}

/** 处理组件或现有节点的原生拖放载荷。 */
function handleDrop(payload: string, target: DesignerDropTarget): void {
  if (payload.startsWith('component:')) {
    addComponentAt(payload.slice('component:'.length), target)
    return
  }
  if (!payload.startsWith('node:')) return
  const nodeId = payload.slice('node:'.length)
  const rejection = designerNodeDropRejection(canvasDocument.value, nodeId, target)
  if (rejection) {
    ElMessage.warning(rejection)
    return
  }
  let moved = false
  engine.execute((document) => {
    mutateDesignerView(document, activeViewCode.value, (viewDocument) => {
      moved = moveDesignerNode(viewDocument, nodeId, target)
    })
  })
  if (!moved) ElMessage.warning('当前节点无法移动到目标位置')
  else engine.selectedNodeId.value = nodeId
}

/** 在 Sortable 事务期间同步目标列表，拖动结束时由命令引擎统一记录一个快照。 */
function applySortableOrder(
  containerId: string | null,
  slotCode: string,
  nodes: DesignerLayoutNode[],
): void {
  const target = containerId ? findDesignerNode(activeViewRoot.value, containerId) : undefined
  const collection = containerId
    ? target?.nodeType === 'CONTAINER'
      ? target.slots.find((slot) => slot.slotCode === slotCode)?.children
      : undefined
    : activeViewRoot.value
  if (collection) collection.splice(0, collection.length, ...nodes)
}

function removeNode(nodeId: string): void {
  engine.execute((document) => {
    mutateDesignerView(document, activeViewCode.value, (viewDocument) => {
      removeDesignerNode(viewDocument, nodeId)
    })
  })
  if (engine.selectedNodeId.value === nodeId) engine.selectedNodeId.value = ''
}

function duplicateNode(nodeId: string): void {
  let copyId = ''
  engine.execute((document) => {
    mutateDesignerView(document, activeViewCode.value, (viewDocument) => {
      copyId = duplicateDesignerNode(viewDocument, nodeId)?.id ?? ''
    })
  })
  if (copyId) engine.selectedNodeId.value = copyId
}

function selectField(fieldId: string): void {
  const nodeId = findFieldNodeId(activeViewRoot.value, fieldId)
  if (nodeId) engine.selectedNodeId.value = nodeId
  else leftTab.value = 'fields'
}

function restoreField(fieldId: string): void {
  let nodeId = ''
  engine.execute((document) => {
    mutateDesignerView(document, activeViewCode.value, (viewDocument) => {
      nodeId = restoreDesignerFieldNode(viewDocument, fieldId)?.id ?? ''
    })
  })
  if (nodeId) engine.selectedNodeId.value = nodeId
  else ElMessage.warning('请先在字段目录中创建该子实体对应的子表容器')
}

/** 在字段目录中为未放置关系创建指定子表容器。 */
function createRelationContainer(
  relationCode: string,
  componentType: 'row-subtable' | 'block-subtable',
): void {
  if (activeViewCode.value !== DESIGNER_MAIN_VIEW_CODE) {
    ElMessage.warning('一级子表关系只能放置在主表单主体')
    return
  }
  let nodeId = ''
  engine.execute((document) => {
    nodeId = createDesignerRelationContainer(document, relationCode, componentType)?.id ?? ''
  })
  if (!nodeId) {
    ElMessage.warning('当前关系不存在或已经放置')
    return
  }
  engine.selectedNodeId.value = nodeId
}

/** 将字段页选中的主字段和子关系作为一个命令生成布局。 */
function generateDataModelLayout(request: DesignerGenerateLayoutRequest): void {
  if (activeViewCode.value !== DESIGNER_MAIN_VIEW_CODE && request.relations.length > 0) {
    ElMessage.warning('弹层模块只能生成当前实体字段，不能创建一级子表关系')
    return
  }
  let createdNodeIds: string[] = []
  let skippedFieldIds: string[] = []
  engine.execute((document) => {
    mutateDesignerView(document, activeViewCode.value, (viewDocument) => {
      const result = generateDesignerDataModelLayout(viewDocument, request)
      createdNodeIds = result.createdNodeIds
      skippedFieldIds = result.skippedFieldIds
    })
  })
  const selectedId = createdNodeIds.at(-1)
  if (selectedId) engine.selectedNodeId.value = selectedId
  if (skippedFieldIds.length > 0) {
    ElMessage.warning(`已跳过 ${skippedFieldIds.length} 个已放置、系统或暂不可放置字段`)
  } else if (createdNodeIds.length > 0) {
    ElMessage.success(`已生成 ${createdNodeIds.length} 个布局节点`)
  }
}

async function deleteField(fieldId: string): Promise<void> {
  const placedAnywhere = [
    engine.document.value.uiSchema.root,
    ...engine.document.value.uiSchema.overlays.map((item) => item.root),
  ].some((root) => collectPlacedFieldIds(root).has(fieldId))
  if (placedAnywhere) {
    ElMessage.warning('该字段仍在主体或弹层模块中使用，不能删除字段定义')
    return
  }
  try {
    await ElMessageBox.confirm('该字段尚未放置，删除后只可通过撤销恢复。', '删除本地字段', {
      type: 'warning',
      confirmButtonText: '删除',
    })
  } catch {
    return
  }
  engine.execute((document) => {
    deleteUnplacedDesignerField(document, fieldId)
  })
}

function updateDocument(patch: Partial<DesignerDocument>): void {
  engine.execute((document) => Object.assign(document, patch))
}

/** 更新表单提交投影策略。 */
function updateSubmitPolicy(patch: Partial<DesignerDocument['submitPolicy']>): void {
  engine.execute((document) => {
    document.submitPolicy = { ...document.submitPolicy, ...patch }
  })
}

/** 更新运行态动作栏；按钮集合始终作为完整受控值替换。 */
function updateActionBar(patch: Partial<DesignerActionBar>): void {
  engine.execute((document) => {
    document.actionBar = { ...document.actionBar, ...patch }
  })
}

/** 将字段高级行为与事件流草稿作为一个历史命令原子保存。 */
function saveFieldBehavior(payload: {
  behavior: DesignerFieldBehavior
  eventFlows: DesignerEventFlow[]
}): void {
  const fieldId = selectedField.value?.id
  if (!fieldId) return
  engine.execute((document) => {
    const field = document.dataSchema.fields.find((item) => item.id === fieldId)
    if (!field) return
    field.behavior = payload.behavior
    document.eventFlows = payload.eventFlows
  })
}

/** 将事件流列表作为一个历史命令保存，并清理已经失效的字段事件绑定。 */
function saveEventFlows(flows: DesignerEventFlow[]): void {
  engine.execute((document) => {
    document.eventFlows = flows
    const validCodes = new Set(flows.map((flow) => flow.code))
    for (const field of document.dataSchema.fields) {
      field.behavior.eventBindings = Object.fromEntries(
        Object.entries(field.behavior.eventBindings).filter(
          ([, code]) => code && validCodes.has(code),
        ),
      )
    }
    const cleanContainerBindings = (nodes: DesignerLayoutNode[]): void => {
      for (const node of nodes) {
        if (node.nodeType !== 'CONTAINER') continue
        if (node.eventBindings) {
          node.eventBindings = Object.fromEntries(
            Object.entries(node.eventBindings).filter(([, code]) => code && validCodes.has(code)),
          )
        }
        node.slots.forEach((slot) => cleanContainerBindings(slot.children))
      }
    }
    cleanContainerBindings(document.uiSchema.root)
    document.uiSchema.overlays.forEach((overlay) => cleanContainerBindings(overlay.root))
  })
}

/** 将变量、数据源和国际化配置作为一个历史命令保存。 */
function saveGlobalAdvanced(
  patch: Pick<DesignerDocument, 'variables' | 'dataSources' | 'i18n'>,
): void {
  engine.execute((document) => {
    document.variables = patch.variables
    document.dataSources = patch.dataSources
    document.i18n = patch.i18n
  })
}

/** 按当前活动视图建立新的运行预览会话。 */
function openPreview(): void {
  previewTargetViewCode.value = activeModule.value?.code ?? DESIGNER_MAIN_VIEW_CODE
  previewSession.value += 1
  previewVisible.value = true
}

/** 关闭当前定向模块预览；再次预览会重新建立独立运行草稿。 */
function closePreviewSession(): void {
  previewVisible.value = false
}

/** 模块缺少必要上下文时关闭不可见 Host，并将失败原因反馈给用户。 */
function handlePreviewOpenFailure(message: string): void {
  closePreviewSession()
  ElMessage.error(message)
}

/** 打开当前活动视图的运行预览后调用浏览器打印能力。 */
async function printPreview(): Promise<void> {
  openPreview()
  await nextTick()
  window.print()
}

function openQuickGrid(): void {
  quickGridVisible.value = true
}

/** 应用当前视图快捷栅格；整批只产生一个历史快照。 */
function applyQuickGrid(span: 24 | 12 | 8 | 6): void {
  let changed = 0
  engine.execute((document) => {
    mutateDesignerView(document, activeViewCode.value, (viewDocument) => {
      changed = applyDesignerQuickGrid(viewDocument, engine.selectedNodeId.value, span)
    })
  })
  if (changed > 0) ElMessage.success(`已调整 ${changed} 个字段的 PC 栅格`)
  else ElMessage.info('当前容器没有可调整的直接字段')
}

/** 应用批量默认值；整批只产生一个历史快照。 */
function applyBatchDefaults(values: Record<string, unknown>): void {
  let changed = 0
  engine.execute((document) => {
    changed = applyDesignerBatchDefaults(document, values)
  })
  if (changed > 0) ElMessage.success(`已更新 ${changed} 个字段默认值`)
}

function updateAppearance(key: keyof DesignerDocument['appearance'], value: unknown): void {
  if ((key === 'controlRadius' || key === 'containerRadius') && !isDesignerRadiusValue(value))
    return
  engine.execute((document) => {
    const appearance = { ...document.appearance, [key]: value }
    // 顶部标签从左侧开始阅读更符合纵向表单习惯；只在切换位置时应用默认值，后续仍允许手动调整。
    if (key === 'labelPosition' && value === 'TOP') appearance.labelAlign = 'LEFT'
    document.appearance = appearance
  })
}

/** 更新主实体语义身份；实体编码修改会同步主实体字段作用域。 */
function updateRootEntity(patch: DesignerRootEntityPatch): void {
  let rejection = ''
  engine.execute((document) => {
    rejection = updateDesignerRootEntity(document, patch)
  })
  if (rejection) ElMessage.warning(rejection)
}

/** 更新一级子表关系；关系和子实体编码修改会同步节点引用及字段作用域。 */
function updateRelation(relationCode: string, patch: DesignerRelationPatch): void {
  let rejection = ''
  engine.execute((document) => {
    rejection = updateDesignerRelation(document, relationCode, patch)
  })
  if (rejection) ElMessage.warning(rejection)
}

/** 将全部表面容器的所选外观维度作为一个命令恢复为表单继承。 */
function applyContainerAppearance(dimensions: DesignerContainerAppearanceDimension[]): void {
  let changed = 0
  engine.execute((document) => {
    changed = applyDesignerContainerAppearanceInheritance(document, dimensions)
  })
  if (changed > 0) {
    ElMessage.success(`已将 ${changed} 个容器恢复为跟随表单`)
    return
  }
  ElMessage.info('全部容器已经跟随表单，无需重复应用')
}

function updateField(patch: Partial<DesignerField>): void {
  const fieldId = selectedField.value?.id
  if (!fieldId) return
  if (
    patch.key &&
    engine.document.value.dataSchema.fields.some(
      (field) =>
        field.id !== fieldId &&
        field.entityCode === selectedField.value?.entityCode &&
        field.key === patch.key,
    )
  ) {
    ElMessage.warning('字段编码不能重复')
    return
  }
  engine.execute((document) => {
    const field = document.dataSchema.fields.find((item) => item.id === fieldId)
    if (field) Object.assign(field, patch)
  })
}

function changeFieldComponent(componentType: string): void {
  const source = selectedField.value
  const target = source
    ? (catalogComponents.value.find((item) => item.componentType === componentType) ??
      findDesignerComponent(componentType))
    : undefined
  if (!source || !target || target.nodeKind !== 'FIELD') return
  if (
    !compatibleDesignerComponents(source.semanticType).some(
      (item) => item.componentType === componentType,
    )
  ) {
    ElMessage.warning('目标控件与当前字段语义类型不兼容')
    return
  }
  if (target.availability === 'UNAVAILABLE') {
    ElMessage.warning(target.unavailableReason)
    return
  }
  engine.execute((document) => {
    const field = document.dataSchema.fields.find((item) => item.id === source.id)
    if (!field) return
    const retained = Object.fromEntries(
      Object.entries(field.configuration).filter(([key]) => key in target.defaultConfiguration),
    )
    field.componentType = target.componentType
    field.configurationVersion = target.configurationVersion
    field.configuration = { ...target.defaultConfiguration, ...retained }
  })
}

function updateConfiguration(key: string, value: unknown): void {
  const node = selectedNode.value
  const field = selectedField.value
  if (!node) return
  engine.execute((document) => {
    if (field) {
      const target = document.dataSchema.fields.find((item) => item.id === field.id)
      if (target) target.configuration = { ...target.configuration, [key]: value }
      return
    }
    mutateDesignerView(document, activeViewCode.value, (viewDocument) => {
      const target = findDesignerNode(viewDocument.uiSchema.root, node.id)
      if (target?.nodeType !== 'CONTAINER') return
      target.configuration = { ...target.configuration, [key]: value }
      synchronizeContainerSlots(target)
    })
  })
}

function updateGrid(deviceName: 'pc' | 'mobile', key: string, value: unknown): void {
  const nodeId = selectedNode.value?.id
  if (!nodeId) return
  engine.execute((document) => {
    mutateDesignerView(document, activeViewCode.value, (viewDocument) => {
      const target = findDesignerNode(viewDocument.uiSchema.root, nodeId)
      if (!target) return
      target.layout = {
        ...target.layout,
        [deviceName]: { ...target.layout[deviceName], [key]: value },
      }
    })
  })
}

async function applyTemplate(templateCode: 'TWO_COLUMN' | 'SECTIONED' | 'SHOWCASE'): Promise<void> {
  const targetViewCode = activeViewCode.value
  if (resolveDesignerViewRoot(engine.document.value, targetViewCode).length > 0) {
    try {
      await ElMessageBox.confirm(
        '应用模板将替换当前画布布局；原字段保留为未放置字段，其他模块和表单配置不受影响，可通过撤销恢复。',
        '应用模板',
        {
          type: 'warning',
          confirmButtonText: '应用模板',
        },
      )
    } catch {
      return
    }
  }
  engine.execute((document) => {
    mutateDesignerView(document, targetViewCode, (viewDocument) => {
      viewDocument.uiSchema.root = []
      appendTemplateLayout(viewDocument, templateCode)
    })
  })
  engine.selectedNodeId.value = ''
}

/** 向当前视图追加模板布局，同时复用现有数据模型和全局文档配置。 */
function appendTemplateLayout(
  document: DesignerDocument,
  templateCode: 'TWO_COLUMN' | 'SECTIONED' | 'SHOWCASE',
): void {
  if (templateCode === 'TWO_COLUMN') {
    appendTwoColumnTemplate(document)
    return
  }
  if (templateCode === 'SECTIONED') {
    appendSectionedTemplate(document)
    return
  }
  appendShowcaseTemplate(document)
}

async function clearDocument(): Promise<void> {
  try {
    await ElMessageBox.confirm('清空会移除所有本地字段和布局，可通过撤销恢复。', '清空设计', {
      type: 'warning',
      confirmButtonText: '清空',
    })
  } catch {
    return
  }
  const empty = createEmptyDesignerDocument(engine.document.value.id, engine.document.value.name)
  replaceDocument(empty, true)
  engine.selectedNodeId.value = ''
}

function openImportPicker(): void {
  if (!importInputRef.value) return
  importInputRef.value.value = ''
  importInputRef.value.click()
}

async function importFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const decoded = decodeDesignerImport(await file.text())
  if (!decoded.document) {
    await ElMessageBox.alert(
      decoded.diagnostics.map((item) => `${item.path}：${item.message}`).join('\n'),
      '导入失败',
      {
        type: 'error',
      },
    )
    return
  }
  replaceDocument(decoded.document, true)
  ElMessage.success('设计文档已导入，保存前仍可撤销')
}

function selectView(viewCode: string): void {
  activeViewCode.value = viewCode
  engine.selectedNodeId.value = ''
  if (viewCode !== DESIGNER_MAIN_VIEW_CODE) rightTab.value = 'component'
}

/** 新增弹窗或抽屉模块并立即切换到其独立视图。 */
function addModule(kind: DesignerOverlayModule['kind']): void {
  let moduleCode = ''
  engine.execute((document) => {
    const module = createDesignerOverlayModule(document, kind)
    document.uiSchema.overlays.push(module)
    moduleCode = module.code
  })
  if (moduleCode) selectView(moduleCode)
}

/** 复制模块视图，但继续复用语义字段定义。 */
function duplicateModule(moduleCode: string): void {
  let copyCode = ''
  engine.execute((document) => {
    copyCode = duplicateDesignerOverlayModule(document, moduleCode)?.code ?? ''
  })
  if (copyCode) selectView(copyCode)
}

async function deleteModule(moduleCode: string): Promise<void> {
  try {
    await ElMessageBox.confirm('删除模块会移除其视图和相关打开动作，可通过撤销恢复。', '删除模块', {
      type: 'warning',
      confirmButtonText: '删除',
    })
  } catch {
    return
  }
  engine.execute((document) => {
    removeDesignerOverlayModule(document, moduleCode)
  })
  if (activeViewCode.value === moduleCode) selectView(DESIGNER_MAIN_VIEW_CODE)
}

/** 更新模块语义身份；编码修改同步事件动作引用。 */
function updateModule(moduleCode: string, patch: Partial<DesignerOverlayModule>): void {
  const normalizedPatch = normalizeModulePatch(patch)
  if (normalizedPatch.name !== undefined && normalizedPatch.name.length === 0) {
    ElMessage.warning('模块名称不能为空')
    return
  }
  if (normalizedPatch.code !== undefined) {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(normalizedPatch.code)) {
      ElMessage.warning('模块编码必须以字母开头，且只能包含字母、数字和下划线')
      return
    }
    if (
      engine.document.value.uiSchema.overlays.some(
        (module) => module.code !== moduleCode && module.code === normalizedPatch.code,
      )
    ) {
      ElMessage.warning('模块编码不能重复')
      return
    }
  }
  const currentModule = engine.document.value.uiSchema.overlays.find(
    (item) => item.code === moduleCode,
  )
  if (!currentModule || modulePatchMatches(currentModule, normalizedPatch)) return
  engine.execute((document) => {
    const module = document.uiSchema.overlays.find((item) => item.code === moduleCode)
    if (!module) return
    const nextCode = normalizedPatch.code
    Object.assign(module, normalizedPatch)
    if (nextCode && nextCode !== moduleCode) {
      synchronizeModuleActionReferences(
        document.eventFlows.flatMap((flow) => flow.steps),
        moduleCode,
        nextCode,
      )
    }
  })
  if (normalizedPatch.code && activeViewCode.value === moduleCode)
    activeViewCode.value = normalizedPatch.code
}

/** 规范化右侧模块配置输入，保证宽度和受控枚举不会污染设计文档。 */
function normalizeModulePatch(
  patch: Partial<DesignerOverlayModule>,
): Partial<DesignerOverlayModule> {
  const normalized: Partial<DesignerOverlayModule> = {}
  if (patch.name !== undefined) normalized.name = patch.name.trim()
  if (patch.code !== undefined) normalized.code = patch.code.trim()
  if (patch.width !== undefined && Number.isFinite(patch.width)) {
    normalized.width = clampPanelWidth(patch.width, 320, 1200)
  }
  if (
    patch.dataContext !== undefined &&
    ['FORM_DRAFT', 'SUBTABLE_ROW_DRAFT'].includes(patch.dataContext)
  ) {
    normalized.dataContext = patch.dataContext
  }
  if (patch.radius !== undefined && isDesignerRadiusValue(patch.radius)) {
    normalized.radius = patch.radius
  }
  if (
    patch.maxHeightPreset !== undefined &&
    ['COMPACT', 'STANDARD', 'SPACIOUS', 'VIEWPORT'].includes(patch.maxHeightPreset)
  ) {
    normalized.maxHeightPreset = patch.maxHeightPreset
  }
  return normalized
}

/** 判断模块配置是否实际变化，避免失焦提交无效历史命令。 */
function modulePatchMatches(
  module: DesignerOverlayModule,
  patch: Partial<DesignerOverlayModule>,
): boolean {
  return Object.entries(patch).every(
    ([key, value]) => module[key as keyof DesignerOverlayModule] === value,
  )
}

function synchronizeModuleActionReferences(
  steps: DesignerEventStep[],
  sourceCode: string,
  targetCode: string,
): void {
  for (const step of steps) {
    if (
      step.stepType === 'ACTION' &&
      ['OPEN_MODULE', 'CONFIRM_MODULE', 'CANCEL_MODULE'].includes(step.actionType) &&
      step.configuration.moduleCode === sourceCode
    ) {
      step.configuration.moduleCode = targetCode
    }
    if (step.stepType === 'CONDITION') {
      step.branches.forEach((branch) =>
        synchronizeModuleActionReferences(branch.steps, sourceCode, targetCode),
      )
      synchronizeModuleActionReferences(step.elseSteps, sourceCode, targetCode)
    }
  }
}

function openLeftPanel(tab: (typeof leftRailItems)[number]['name']): void {
  leftTab.value = tab
  leftManualCollapsed.value = false
}

function openRightPanel(tab: 'component' | 'form'): void {
  rightTab.value = tab
  rightManualCollapsed.value = false
}

async function toggleLeftPanel(): Promise<void> {
  const position = canvasRef.value?.captureViewport()
  if (autoCollapseLeft.value && !leftManualCollapsed.value) {
    ElMessage.info('当前宽度不足，左侧栏会保持自动收起')
    return
  }
  leftManualCollapsed.value = !leftManualCollapsed.value
  await restoreCanvasViewportAfterLayout(position, true)
}

async function toggleRightPanel(): Promise<void> {
  const position = canvasRef.value?.captureViewport()
  if (autoCollapseRight.value && !rightManualCollapsed.value) {
    ElMessage.info('当前宽度不足，右侧栏会保持自动收起')
    return
  }
  rightManualCollapsed.value = !rightManualCollapsed.value
  await restoreCanvasViewportAfterLayout(position, true)
}

function startResize(side: 'left' | 'right', event: PointerEvent): void {
  event.preventDefault()
  const startX = event.clientX
  const startWidth = side === 'left' ? leftWidth.value : rightWidth.value
  const viewportPosition = canvasRef.value?.captureViewport()
  const handleMove = (moveEvent: PointerEvent): void => {
    const delta = moveEvent.clientX - startX
    if (side === 'left') leftWidth.value = clampPanelWidth(startWidth + delta, 240, 360)
    else rightWidth.value = clampPanelWidth(startWidth - delta, 320, 480)
  }
  const handleUp = async (): Promise<void> => {
    window.removeEventListener('pointermove', handleMove)
    window.removeEventListener('pointerup', handleUp)
    document.body.classList.remove('is-resizing-form-designer')
    await restoreCanvasViewportAfterLayout(viewportPosition)
  }
  document.body.classList.add('is-resizing-form-designer')
  window.addEventListener('pointermove', handleMove)
  window.addEventListener('pointerup', handleUp, { once: true })
}

async function resizeWithKeyboard(side: 'left' | 'right', event: KeyboardEvent): Promise<void> {
  const minimum = side === 'left' ? 240 : 320
  const maximum = side === 'left' ? 360 : 480
  const current = side === 'left' ? leftWidth.value : rightWidth.value
  const next = (() => {
    if (event.key === 'ArrowLeft') return current + (side === 'left' ? -10 : 10)
    if (event.key === 'ArrowRight') return current + (side === 'left' ? 10 : -10)
    if (event.key === 'Home') return minimum
    if (event.key === 'End') return maximum
    return undefined
  })()
  if (next === undefined) return
  event.preventDefault()
  const position = canvasRef.value?.captureViewport()
  if (side === 'left') leftWidth.value = clampPanelWidth(next, minimum, maximum)
  else rightWidth.value = clampPanelWidth(next, minimum, maximum)
  await restoreCanvasViewportAfterLayout(position, true)
}

/** 等待工作区列宽稳定后恢复画布观察位置，避免收展动画中途按旧尺寸计算滚动量。 */
async function restoreCanvasViewportAfterLayout(
  position: { horizontal: number; vertical: number } | undefined,
  waitForTransition = false,
): Promise<void> {
  if (!position) return
  await nextTick()
  if (waitForTransition) await waitForWorkspaceGridTransition()
  await canvasRef.value?.restoreViewport(position)
}

/** 等待 Grid 列宽过渡完成；减少动态效果或无过渡时立即返回。 */
async function waitForWorkspaceGridTransition(): Promise<void> {
  const workspace = workspaceRef.value
  if (!workspace || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const style = window.getComputedStyle(workspace)
  const durations = style.transitionDuration.split(',').map(parseTransitionTime)
  const delays = style.transitionDelay.split(',').map(parseTransitionTime)
  const transitionCount = Math.max(durations.length, delays.length)
  const maximumDuration = Math.max(
    0,
    ...Array.from(
      { length: transitionCount },
      (_, index) =>
        (durations[index % durations.length] ?? 0) + (delays[index % delays.length] ?? 0),
    ),
  )
  if (maximumDuration <= 0) return
  await new Promise<void>((resolve) => {
    let settled = false
    const finish = (): void => {
      if (settled) return
      settled = true
      workspace.removeEventListener('transitionend', handleTransitionEnd)
      window.clearTimeout(timeoutId)
      resolve()
    }
    const handleTransitionEnd = (event: TransitionEvent): void => {
      if (event.target === workspace && event.propertyName === 'grid-template-columns') finish()
    }
    const timeoutId = window.setTimeout(finish, maximumDuration + 80)
    workspace.addEventListener('transitionend', handleTransitionEnd)
  })
}

/** 将 CSS 秒或毫秒时间转换为毫秒。 */
function parseTransitionTime(value: string): number {
  const normalized = value.trim()
  if (normalized.endsWith('ms')) return Number.parseFloat(normalized) || 0
  if (normalized.endsWith('s')) return (Number.parseFloat(normalized) || 0) * 1000
  return 0
}

function clampPanelWidth(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, Math.round(value)))
}

function handleShortcut(event: KeyboardEvent): void {
  const target = event.target as HTMLElement | null
  const editing = Boolean(target?.closest('input,textarea,[contenteditable=true]'))
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
    event.preventDefault()
    emit('save-request', currentDocument())
    return
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault()
    if (event.shiftKey) engine.redo()
    else engine.undo()
    return
  }
  if (
    !editing &&
    (event.key === 'Backspace' || event.key === 'Delete') &&
    engine.selectedNodeId.value
  ) {
    event.preventDefault()
    removeNode(engine.selectedNodeId.value)
  }
}

function findFieldNodeId(nodes: DesignerLayoutNode[], fieldId: string): string {
  for (const node of nodes) {
    if (node.nodeType === 'FIELD' && node.fieldId === fieldId) return node.id
    if (node.nodeType === 'CONTAINER') {
      for (const slot of node.slots) {
        const found = findFieldNodeId(slot.children, fieldId)
        if (found) return found
      }
    }
  }
  return ''
}

function clampZoom(value: number): number {
  return Math.min(150, Math.max(50, Math.round(value / 10) * 10))
}

/** 向当前视图追加双列业务表单模板。 */
function appendTwoColumnTemplate(document: DesignerDocument): void {
  const samples: Array<[string, string, Partial<Record<string, unknown>>]> = [
    ['text', '申请主题', { placeholder: '请输入申请主题' }],
    ['select', '申请类型', {}],
    ['textarea', '申请说明', { rows: 4 }],
    ['number', '申请金额', { precision: 2, currencyPrefix: '¥', thousandsSeparator: true }],
    ['date', '期望完成日期', {}],
    ['file', '相关附件', {}],
  ]
  for (const [componentType, label, configuration] of samples) {
    const node = createNodeFromComponent(document, componentType, { label, configuration })
    if (node) document.uiSchema.root.push(node)
  }
}

/** 向当前视图追加分组表单模板。 */
function appendSectionedTemplate(document: DesignerDocument): void {
  const group = createNodeFromComponent(document, 'group', { configuration: { title: '基础信息' } })
  if (group?.nodeType !== 'CONTAINER') return
  for (const [type, label] of [
    ['text', '申请主题'],
    ['select', '申请类型'],
    ['textarea', '申请说明'],
    ['date', '期望日期'],
  ] as const) {
    const node = createNodeFromComponent(document, type, { label })
    if (node) group.slots[0]?.children.push(node)
  }
  document.uiSchema.root.push(group)
}

/** 创建覆盖高级、动态及子表专属渲染器的本地能力示例。 */
function appendShowcaseTemplate(document: DesignerDocument): void {
  const sections: Array<{
    title: string
    fields: ReadonlyArray<readonly [string, string]>
  }> = [
    {
      title: '基础输入',
      fields: [
        ['text', '单行文本'],
        ['textarea', '多行文本'],
        ['select', '下拉选择'],
        ['multi-select', '多选下拉'],
        ['checkbox', '复选框'],
        ['radio', '单选框'],
        ['date', '日期'],
        ['serial-number', '流水号'],
        ['file', '文件'],
        ['number', '数字'],
        ['switch', '开关'],
        ['rate', '评分'],
        ['steps', '步骤'],
        ['rich-text', '富文本'],
        ['hidden', '隐藏字段'],
      ],
    },
    {
      title: '目录与引用',
      fields: [
        ['user', '申请人'],
        ['role', '审批角色'],
        ['organization', '申请部门'],
        ['post', '申请岗位'],
        ['custom-data', '自定义数据'],
        ['process-reference', '关联流程'],
        ['form-reference', '关联表单'],
      ],
    },
    {
      title: '结构化数据',
      fields: [
        ['region', '所属地区'],
        ['dictionary-tree', '业务分类'],
        ['data-dialog', '数据对话框'],
        ['dynamic-select', '动态选择'],
        ['dynamic-cascade', '动态级联'],
      ],
    },
    {
      title: '审批与采集',
      fields: [
        ['date-range', '日期范围'],
        ['date-multiple', '多日期'],
        ['signature', '手写签名'],
        ['opinion', '审批意见'],
        ['scan-code', '扫码内容'],
        ['ocr', 'OCR 识别'],
        ['position', '采集位置'],
      ],
    },
  ]

  for (const section of sections) {
    const heading = createNodeFromComponent(document, 'title', {
      configuration: { text: section.title, level: 3 },
    })
    if (heading) document.uiSchema.root.push(heading)
    for (const [componentType, label] of section.fields) {
      const child = createNodeFromComponent(document, componentType, { label })
      if (child) document.uiSchema.root.push(child)
    }
  }

  const tabs = createNodeFromComponent(document, 'tabs', {
    configuration: { tabsType: 'card', tabs: ['布局示例', '辅助组件'] },
  })
  if (tabs?.nodeType === 'CONTAINER') {
    const firstTabField = createNodeFromComponent(document, 'text', { label: '标签页字段' })
    if (firstTabField) tabs.slots[0]?.children.push(firstTabField)
    for (const componentType of ['title', 'divider', 'alert', 'button', 'iframe'] as const) {
      const child = createNodeFromComponent(document, componentType)
      if (child) tabs.slots[1]?.children.push(child)
    }
    document.uiSchema.root.push(tabs)
  }

  const rowSubtable = createNodeFromComponent(document, 'row-subtable', {
    configuration: { title: '费用明细', initialRows: 1 },
  })
  if (rowSubtable?.nodeType === 'CONTAINER') {
    const relationCode = String(rowSubtable.configuration.relationCode ?? '')
    const entityCode = document.dataSchema.relations.find(
      (relation) => relation.code === relationCode,
    )?.childEntity.code
    for (const [componentType, label] of [
      ['text', '费用事项'],
      ['number', '费用金额'],
      ['date', '发生日期'],
    ] as const) {
      const child = createNodeFromComponent(document, componentType, { label, entityCode })
      if (child) rowSubtable.slots[0]?.children.push(child)
    }
    document.uiSchema.root.push(rowSubtable)
  }

  const blockSubtable = createNodeFromComponent(document, 'block-subtable', {
    configuration: { title: '行程信息', initialRows: 1 },
  })
  if (blockSubtable?.nodeType === 'CONTAINER') {
    const relationCode = String(blockSubtable.configuration.relationCode ?? '')
    const entityCode = document.dataSchema.relations.find(
      (relation) => relation.code === relationCode,
    )?.childEntity.code
    for (const [componentType, label] of [
      ['text', '目的地'],
      ['date-range', '行程日期'],
      ['textarea', '行程说明'],
    ] as const) {
      const child = createNodeFromComponent(document, componentType, { label, entityCode })
      if (child) blockSubtable.slots[0]?.children.push(child)
    }
    document.uiSchema.root.push(blockSubtable)
  }
}

defineExpose({
  markClean: engine.markClean,
  dirty: engine.dirty,
  replaceDocument,
  currentDocument,
})
</script>

<style scoped>
.form-designer-core {
  display: flex;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  flex: 1 1 0;
  flex-direction: column;
  overflow: hidden;
  background: var(--el-bg-color);
}

.form-designer-core__workspace {
  display: grid;
  min-width: 0;
  min-height: 0;
  flex: 1 1 0;
  overflow: hidden;
  transition: grid-template-columns var(--el-transition-duration-fast);
}

.form-designer-core__left {
  display: flex;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--el-bg-color);
  border-right: 1px solid var(--el-border-color-lighter);
}

.form-designer-core__rail.is-left {
  grid-column: 1;
}

.form-designer-core__left {
  grid-column: 2;
}

.form-designer-core__resizer.is-left {
  grid-column: 3;
}

.form-designer-core__canvas {
  grid-column: 4;
}

.form-designer-core__resizer.is-right {
  grid-column: 5;
}

.form-designer-core__right {
  grid-column: 6;
}

.form-designer-core__rail.is-right {
  grid-column: 7;
}

.form-designer-core__left > * {
  width: 100%;
  min-width: 0;
  min-height: 0;
  flex: 1 1 0;
}

.form-designer-core__right {
  display: flex;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.form-designer-core__right > * {
  width: 100%;
  min-width: 0;
  min-height: 0;
  flex: 1 1 0;
}

.form-designer-core__rail {
  z-index: 5;
  display: flex;
  min-width: 0;
  min-height: 0;
  align-items: center;
  padding: var(--daxiang-form-space-2) 0;
  flex-direction: column;
  background: var(--el-bg-color);
  gap: var(--daxiang-form-space-1);
}

.form-designer-core__rail.is-left {
  border-right: 1px solid var(--el-border-color-lighter);
}

.form-designer-core__rail.is-right {
  border-left: 1px solid var(--el-border-color-lighter);
}

.form-designer-core__rail button {
  display: inline-flex;
  width: 34px;
  height: 34px;
  align-items: center;
  justify-content: center;
  color: var(--el-text-color-secondary);
  background: transparent;
  border: 0;
  border-radius: var(--el-border-radius-base);
  cursor: pointer;
}

.form-designer-core__rail button:hover,
.form-designer-core__rail button.is-active {
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}

.form-designer-core__rail button.is-bottom {
  margin-top: auto;
}

.form-designer-core__resizer {
  position: relative;
  z-index: 6;
  min-width: 0;
  min-height: 0;
  cursor: col-resize;
  outline: none;
}

.form-designer-core__resizer::after {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 2px;
  width: 2px;
  content: '';
  background: transparent;
}

.form-designer-core__resizer:hover::after,
.form-designer-core__resizer:focus-visible::after {
  background: var(--el-color-primary);
}

:global(body.is-resizing-form-designer) {
  cursor: col-resize !important;
  user-select: none;
}

:global(body.is-resizing-form-designer) .form-designer-core__workspace {
  transition: none;
}

.form-designer-core__left-tabs {
  display: flex;
  width: 100%;
  min-height: 0;
  flex-direction: column;
}

.form-designer-core__left-tabs :deep(.el-tabs__header) {
  flex: 0 0 auto;
  padding: 0 var(--daxiang-form-space-3);
  margin-bottom: 0;
}

.form-designer-core__left-tabs :deep(.el-tabs__content),
.form-designer-core__left-tabs :deep(.el-tab-pane) {
  display: flex;
  min-height: 0;
  flex: 1 1 0;
}

.form-designer-core :deep(.designer-inspector) {
  border-left: 1px solid var(--el-border-color-lighter);
}

.form-designer-core :deep(.designer-palette__scroll),
.form-designer-core :deep(.designer-field-tree__scroll),
.form-designer-core :deep(.designer-outline),
.form-designer-core :deep(.designer-module-manager__scroll),
.form-designer-core :deep(.designer-canvas__stage),
.form-designer-core :deep(.designer-inspector__scroll) {
  scrollbar-gutter: stable;
  scrollbar-color: var(--el-border-color) transparent;
  scrollbar-width: thin;
}

.form-designer-core :deep(.designer-palette__scroll::-webkit-scrollbar),
.form-designer-core :deep(.designer-field-tree__scroll::-webkit-scrollbar),
.form-designer-core :deep(.designer-outline::-webkit-scrollbar),
.form-designer-core :deep(.designer-module-manager__scroll::-webkit-scrollbar),
.form-designer-core :deep(.designer-canvas__stage::-webkit-scrollbar),
.form-designer-core :deep(.designer-inspector__scroll::-webkit-scrollbar) {
  width: 5px !important;
  height: 5px !important;
}

.form-designer-core :deep(.designer-palette__scroll::-webkit-scrollbar-track),
.form-designer-core :deep(.designer-field-tree__scroll::-webkit-scrollbar-track),
.form-designer-core :deep(.designer-outline::-webkit-scrollbar-track),
.form-designer-core :deep(.designer-module-manager__scroll::-webkit-scrollbar-track),
.form-designer-core :deep(.designer-canvas__stage::-webkit-scrollbar-track),
.form-designer-core :deep(.designer-inspector__scroll::-webkit-scrollbar-track) {
  background: transparent;
}

.form-designer-core :deep(.designer-palette__scroll::-webkit-scrollbar-thumb),
.form-designer-core :deep(.designer-field-tree__scroll::-webkit-scrollbar-thumb),
.form-designer-core :deep(.designer-outline::-webkit-scrollbar-thumb),
.form-designer-core :deep(.designer-module-manager__scroll::-webkit-scrollbar-thumb),
.form-designer-core :deep(.designer-canvas__stage::-webkit-scrollbar-thumb),
.form-designer-core :deep(.designer-inspector__scroll::-webkit-scrollbar-thumb) {
  background-color: var(--el-border-color) !important;
  border-radius: var(--el-border-radius-base);
}

.form-designer-core :deep(.designer-palette__scroll::-webkit-scrollbar-thumb:hover),
.form-designer-core :deep(.designer-field-tree__scroll::-webkit-scrollbar-thumb:hover),
.form-designer-core :deep(.designer-outline::-webkit-scrollbar-thumb:hover),
.form-designer-core :deep(.designer-module-manager__scroll::-webkit-scrollbar-thumb:hover),
.form-designer-core :deep(.designer-canvas__stage::-webkit-scrollbar-thumb:hover),
.form-designer-core :deep(.designer-inspector__scroll::-webkit-scrollbar-thumb:hover) {
  background-color: var(--el-border-color-darker) !important;
}

@media (prefers-reduced-motion: reduce) {
  .form-designer-core__workspace {
    transition: none;
  }
}
</style>
