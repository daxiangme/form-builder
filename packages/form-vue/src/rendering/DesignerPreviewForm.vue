<template>
  <div
    class="daxiang-form designer-preview-form"
    :class="[
      `is-${device}`,
      `is-mode-${modeModel.toLowerCase()}`,
      { 'is-overlay-only': overlayOnly },
    ]"
    :style="previewStyle"
  >
    <template v-if="!overlayOnly">
      <div v-if="showToolbar" class="designer-preview-form__toolbar">
        <span><DxSvgIcon :icon="modeIcon" />{{ modeLabel }}</span>
        <div>
          <ElSelect
            v-if="document.i18n.enabled"
            v-model="activeLocale"
            class="designer-preview-form__locale"
            aria-label="预览语言"
          >
            <ElOption
              v-for="locale in document.i18n.locales"
              :key="locale"
              :label="locale"
              :value="locale"
            />
          </ElSelect>
          <ElSegmented v-model="modeModel" :options="modeOptions" />
        </div>
      </div>

      <ElAlert
        v-if="runtimeNotice"
        class="designer-preview-form__notice"
        :type="runtimeNotice.type"
        :title="runtimeNotice.message"
        show-icon
        closable
        @close="runtimeNotice = undefined"
      />

      <div
        v-if="showActionBarAt('TOP')"
        class="designer-preview-form__actions"
        :class="`is-${document.actionBar.align.toLowerCase()}`"
      >
        <ElButton
          v-for="button in localizedActionButtons"
          :key="`top-${button.action}`"
          :type="button.action === 'SUBMIT' ? 'primary' : 'default'"
          @click="runAction(button.action)"
        >
          {{ button.label }}
        </ElButton>
      </div>

      <ElForm
        class="designer-preview-form__form"
        :class="controlRadiusBind.class"
        :style="controlRadiusBind.style"
        :label-position="formLabelPosition"
        :label-width="document.appearance.labelWidth"
        :label-suffix="document.appearance.labelSuffix"
        :size="elementSize"
      >
        <ElRow class="designer-preview-form__grid" :gutter="document.appearance.gridGutter">
          <DesignerRuntimeNode
            v-for="node in document.uiSchema.root"
            :key="node.id"
            :node="node"
            :fields="localizedFields"
            :value-store="valueStore"
            :mode="modeModel"
            :device="device"
            :gutter="document.appearance.gridGutter"
            :appearance="document.appearance"
            :field-states="fieldStates"
            :field-feedbacks="fieldFeedbacks"
            feedback-scope="main"
            :adapters="adapters"
            :adapter-context="adapterContext"
            :readonly-display-mode="document.appearance.readonlyDisplayMode"
            @update-field-value="updateFieldValue"
            @update-collection="updateCollection"
            @component-event="handleComponentEvent"
            @runtime-warning="showRuntimeWarning"
          />
        </ElRow>
        <ElEmpty v-if="document.uiSchema.root.length === 0" description="当前表单没有可预览内容" />
      </ElForm>

      <div
        v-if="showActionBarAt('BOTTOM')"
        class="designer-preview-form__actions"
        :class="`is-${document.actionBar.align.toLowerCase()}`"
      >
        <ElButton
          v-for="button in localizedActionButtons"
          :key="`bottom-${button.action}`"
          :type="button.action === 'SUBMIT' ? 'primary' : 'default'"
          @click="runAction(button.action)"
        >
          {{ button.label }}
        </ElButton>
      </div>
    </template>

    <DModal
      :model-value="activeOverlay?.kind === 'DIALOG'"
      :title="localizedOverlayName"
      :width="activeOverlay?.width ?? 720"
      :max-height="resolveDesignerOverlayMaxHeight(activeOverlay?.maxHeightPreset ?? 'VIEWPORT')"
      :radius="activeOverlay?.radius"
      confirm-text="确认"
      @update:model-value="handleDialogVisibility"
      @confirm="confirmActiveModule"
      @cancel="cancelActiveModule"
    >
      <div v-if="activeOverlay && overlayValueStore" class="designer-preview-form__overlay-content">
        <ElForm
          :class="controlRadiusBind.class"
          :style="controlRadiusBind.style"
          :label-position="formLabelPosition"
          :label-width="document.appearance.labelWidth"
          :label-suffix="document.appearance.labelSuffix"
          :size="elementSize"
        >
          <ElRow :gutter="document.appearance.gridGutter" class="designer-preview-form__grid">
            <DesignerRuntimeNode
              v-for="node in activeOverlay.root"
              :key="node.id"
              :node="node"
              :fields="localizedFields"
              :value-store="overlayValueStore"
              :mode="modeModel"
              :device="device"
              :gutter="document.appearance.gridGutter"
              :appearance="document.appearance"
              :field-states="overlayFieldStates"
              :field-feedbacks="fieldFeedbacks"
              :feedback-scope="activeOverlay.code"
              :adapters="adapters"
              :adapter-context="overlayAdapterContext"
              :readonly-display-mode="document.appearance.readonlyDisplayMode"
              @update-field-value="updateOverlayFieldValue"
              @update-collection="updateOverlayCollection"
              @component-event="handleComponentEvent"
              @runtime-warning="showRuntimeWarning"
            />
          </ElRow>
        </ElForm>
      </div>
    </DModal>

    <ElDrawer
      :model-value="activeOverlay?.kind === 'DRAWER'"
      class="daxiang-form daxiang-form-drawer"
      :title="localizedOverlayName"
      :size="`${activeOverlay?.width ?? 480}px`"
      destroy-on-close
      @update:model-value="handleDrawerVisibility"
    >
      <div v-if="activeOverlay && overlayValueStore" class="designer-preview-form__overlay-content">
        <ElForm
          :class="controlRadiusBind.class"
          :style="controlRadiusBind.style"
          :label-position="formLabelPosition"
          :label-width="document.appearance.labelWidth"
          :label-suffix="document.appearance.labelSuffix"
          :size="elementSize"
        >
          <ElRow :gutter="document.appearance.gridGutter" class="designer-preview-form__grid">
            <DesignerRuntimeNode
              v-for="node in activeOverlay.root"
              :key="node.id"
              :node="node"
              :fields="localizedFields"
              :value-store="overlayValueStore"
              :mode="modeModel"
              :device="device"
              :gutter="document.appearance.gridGutter"
              :appearance="document.appearance"
              :field-states="overlayFieldStates"
              :field-feedbacks="fieldFeedbacks"
              :feedback-scope="activeOverlay.code"
              :adapters="adapters"
              :adapter-context="overlayAdapterContext"
              :readonly-display-mode="document.appearance.readonlyDisplayMode"
              @update-field-value="updateOverlayFieldValue"
              @update-collection="updateOverlayCollection"
              @component-event="handleComponentEvent"
              @runtime-warning="showRuntimeWarning"
            />
          </ElRow>
        </ElForm>
      </div>
      <template #footer>
        <div class="designer-preview-form__drawer-footer">
          <ElButton @click="cancelActiveModule()">取消</ElButton>
          <ElButton type="primary" @click="confirmActiveModule()">确认</ElButton>
        </div>
      </template>
    </ElDrawer>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, reactive, watch, nextTick } from 'vue'
import type { CSSProperties } from 'vue'
import DModal from '../infrastructure/FormModalShell.vue'
import DxSvgIcon from '../infrastructure/FormIcon.vue'
import { designerControlRadiusBind } from '../designer-radius-style'
import { executeDesignerEventFlow } from '@daxiangme/form-core'
import { resolveDesignerOverlayMaxHeight } from '@daxiangme/form-core'
import {
  designerActionI18nKey,
  designerFieldHelpI18nKey,
  designerFieldLabelI18nKey,
  designerModuleI18nKey,
  resolveDesignerLocalizedText,
} from '@daxiangme/form-core'
import { projectDesignerSubmission } from '@daxiangme/form-core'
import { createDesignerSubtableRow, projectDesignerSubtableColumns } from '@daxiangme/form-core'
import {
  applyDesignerCurrentRowValueRules,
  applyDesignerValueRules,
  createDesignerFieldFeedbackKey,
  projectDesignerFieldFeedback,
  applyDesignerFieldAccess,
  isDesignerRuntimeWriteBlocked,
  readDesignerFieldAccess,
  resolveDesignerFieldState,
  validateDesignerField,
} from '@daxiangme/form-core'
import type {
  DesignerActionBarButton,
  DesignerComponentEvent,
  DesignerContainerNode,
  DesignerDevice,
  DesignerDocument,
  DesignerEventFlow,
  DesignerFieldFeedback,
  DesignerFormEvent,
  DesignerLayoutNode,
  DesignerOverlayModule,
  DesignerResolvedFieldState,
  DesignerRuntimeAdapters,
  DesignerRuntimeMode,
  DesignerRuntimeValueStore,
  DesignerSubtableRow,
  DesignerValidationResult,
  FormFieldAccessMap,
  FormRuntimeAdapterContext,
  DesignerSubmissionProjection,
} from '@daxiangme/form-core'
import DesignerRuntimeNode from './DesignerRuntimeNode.vue'

defineOptions({ name: 'FormRenderer' })

const props = withDefaults(
  defineProps<{
    document: DesignerDocument
    modelValue?: DesignerRuntimeValueStore
    mode?: Exclude<DesignerRuntimeMode, 'DESIGN'>
    fieldAccess?: FormFieldAccessMap
    device?: DesignerDevice
    adapters?: DesignerRuntimeAdapters
    adapterContext?: FormRuntimeAdapterContext
    activeModule?: string
    /** @deprecated 请使用 activeModule。 */
    initialOverlayCode?: string
    overlayOnly?: boolean
    showToolbar?: boolean
  }>(),
  {
    mode: 'CREATE',
    device: 'desktop',
    adapterContext: () => ({}),
    activeModule: '',
    initialOverlayCode: '',
    overlayOnly: false,
    showToolbar: false,
  },
)
const emit = defineEmits<{
  'update:modelValue': [value: DesignerRuntimeValueStore]
  submit: [projection: DesignerSubmissionProjection]
  reset: [value: DesignerRuntimeValueStore]
  action: [action: DesignerActionBarButton['action']]
  'runtime-warning': [message: string]
  'overlay-closed': []
  'overlay-open-failed': [message: string]
}>()
const modeModel = ref<Exclude<DesignerRuntimeMode, 'DESIGN'>>(props.mode)
const activeLocale = ref(props.document.i18n.defaultLocale)
const modeOptions = [
  { label: '新增', value: 'CREATE' },
  { label: '编辑', value: 'EDIT' },
  { label: '只读', value: 'READ_ONLY' },
  { label: '详情', value: 'DETAIL' },
]
const valueStore = reactive<DesignerRuntimeValueStore>({ fields: {}, collections: {} })
const variables = reactive<Record<string, unknown>>({})
const fieldFeedbacks = reactive<Record<string, DesignerFieldFeedback>>({})
const activeFlowIds = new Set<string>()
const activeOverlayCode = ref('')
const overlayValueStore = ref<DesignerRuntimeValueStore>()
const overlaySourceRow = ref<DesignerSubtableRow>()
const overlaySourceContainerId = ref('')
const submitting = ref(false)
const runtimeNotice = ref<{ type: 'success' | 'info' | 'warning' | 'error'; message: string }>()
const activeOverlay = computed<DesignerOverlayModule | undefined>(() =>
  props.document.uiSchema.overlays.find((overlay) => overlay.code === activeOverlayCode.value),
)
const requestedOverlayCode = computed(() => props.activeModule || props.initialOverlayCode)
const overlayAdapterContext = computed<FormRuntimeAdapterContext>(() => ({
  ...props.adapterContext,
  moduleCode: activeOverlay.value?.code,
  rowKey: overlaySourceRow.value?.rowId,
}))
const localizedFields = computed(() =>
  props.document.dataSchema.fields.map((field) => ({
    ...field,
    label: resolveDesignerLocalizedText(
      props.document.i18n,
      designerFieldLabelI18nKey(field.key),
      activeLocale.value,
      field.label,
    ),
    helpText: resolveDesignerLocalizedText(
      props.document.i18n,
      designerFieldHelpI18nKey(field.key),
      activeLocale.value,
      field.helpText,
    ),
  })),
)
const localizedOverlayName = computed(() =>
  activeOverlay.value
    ? resolveDesignerLocalizedText(
        props.document.i18n,
        designerModuleI18nKey(activeOverlay.value.code),
        activeLocale.value,
        activeOverlay.value.name,
      )
    : '',
)
const modeLabel = computed(
  () =>
    ({ CREATE: '新增表单', EDIT: '编辑表单', READ_ONLY: '只读表单', DETAIL: '数据详情' })[
      modeModel.value
    ],
)
const modeIcon = computed(
  () =>
    ({
      CREATE: 'ri:add-circle-line',
      EDIT: 'ri:edit-line',
      READ_ONLY: 'ri:lock-line',
      DETAIL: 'ri:file-list-3-line',
    })[modeModel.value],
)
const elementSize = computed(() => {
  const size = props.document.appearance.size
  return size === 'SMALL' ? 'small' : size === 'LARGE' ? 'large' : 'default'
})
const controlRadiusBind = computed(() =>
  designerControlRadiusBind(props.document.appearance.controlRadius),
)
const formLabelPosition = computed(
  () => props.document.appearance.labelPosition.toLowerCase() as 'top' | 'left' | 'right',
)
const previewStyle = computed<CSSProperties>(() => ({
  '--designer-row-gap': `${props.document.appearance.rowGap}px`,
}))
const expressionContext = computed(() => ({
  fields: valueStore.fields,
  variables,
  context: {
    RUNTIME_MODE: modeModel.value,
    DEVICE: props.device,
    NOW: new Date().toISOString(),
  },
}))
const fieldStates = computed<Record<string, DesignerResolvedFieldState>>(() =>
  resolveFieldStates(valueStore),
)
const overlayFieldStates = computed<Record<string, DesignerResolvedFieldState>>(() =>
  resolveFieldStates(overlayValueStore.value ?? valueStore),
)
const enabledActionButtons = computed(() =>
  props.document.actionBar.buttons.filter((button) => button.enabled),
)
const localizedActionButtons = computed(() =>
  enabledActionButtons.value.map((button) => ({
    ...button,
    label: resolveDesignerLocalizedText(
      props.document.i18n,
      designerActionI18nKey(button.action),
      activeLocale.value,
      button.label,
    ),
  })),
)

watch([() => props.document, requestedOverlayCode], ([document]) => initializeRuntime(document), {
  immediate: true,
  deep: true,
})
watch(
  () => props.mode,
  (mode) => {
    modeModel.value = mode
  },
)
watch(
  () => props.modelValue,
  (value) => {
    if (!value || runtimeStoreSignature(value) === runtimeStoreSignature(valueStore)) return
    replaceValueStore(valueStore, value)
  },
  { deep: true },
)

/** 使用文档默认值建立一个与设计文档隔离的运行副本。 */
function initializeRuntime(document: DesignerDocument, emitInitialized = true): void {
  clearRecord(valueStore.fields)
  clearRecord(valueStore.collections)
  clearRecord(variables)
  clearRecord(fieldFeedbacks)
  closeActiveModule()
  activeLocale.value = document.i18n.locales.includes(document.i18n.defaultLocale)
    ? document.i18n.defaultLocale
    : (document.i18n.locales[0] ?? 'zh-CN')
  for (const variable of document.variables)
    variables[variable.code] = cloneValue(variable.initialValue)
  const collectionFieldIds = collectSubtableFieldIds(allViewRoots(document), document)
  for (const field of document.dataSchema.fields) {
    if (!collectionFieldIds.has(field.id))
      valueStore.fields[field.id] = cloneValue(field.defaultValue)
  }
  initializeSubtableCollections(document.uiSchema.root, document, valueStore)
  if (props.modelValue) mergeValueStore(valueStore, props.modelValue)
  void applyValueRules(valueStore, 'INITIALIZE')
  void applyCollectionValueRules(valueStore)
  if (requestedOverlayCode.value) openInitialOverlay(requestedOverlayCode.value)
  if (emitInitialized) void nextTick(() => runFormEvent('INITIALIZED'))
}

/** 在独立预览会话初始化后直接打开设计器当前选中的弹层模块。 */
function openInitialOverlay(moduleCode: string): void {
  try {
    openModule(moduleCode)
  } catch (error) {
    showRuntimeError(error)
    if (props.overlayOnly) emit('overlay-open-failed', runtimeErrorMessage(error))
  }
}

/** 更新根表字段，执行受控计算规则；组件事件由渲染节点随后触发。 */
async function updateFieldValue(fieldId: string, value: unknown): Promise<void> {
  if (rejectWriteAction('字段写入')) return
  valueStore.fields[fieldId] = value
  await applyValueRules(valueStore, 'CHANGE', [fieldId])
  await applyCollectionValueRules(valueStore, undefined, 'CHANGE', [fieldId])
  emitRuntimeValue()
}

/** 更新指定子表容器的多行值。 */
function updateCollection(containerId: string, rows: DesignerSubtableRow[]): void {
  if (rejectWriteAction('集合写入')) return
  valueStore.collections[containerId] = rows
  void applyCollectionValueRules(valueStore, rows)
  emitRuntimeValue()
}

/** 更新弹层草稿字段，不提前污染主体。 */
async function updateOverlayFieldValue(fieldId: string, value: unknown): Promise<void> {
  if (rejectWriteAction('模块字段写入') || !overlayValueStore.value) return
  overlayValueStore.value.fields[fieldId] = value
  await applyValueRules(overlayValueStore.value, 'CHANGE', [fieldId])
  await applyCollectionValueRules(overlayValueStore.value, undefined, 'CHANGE', [fieldId])
}

/** 更新弹层草稿中的子表集合。 */
function updateOverlayCollection(containerId: string, rows: DesignerSubtableRow[]): void {
  if (rejectWriteAction('模块集合写入') || !overlayValueStore.value) return
  overlayValueStore.value.collections[containerId] = rows
  void applyCollectionValueRules(overlayValueStore.value, rows)
}

/** 执行组件事件对应的验证和声明式事件流。 */
async function handleComponentEvent(
  nodeId: string,
  event: DesignerComponentEvent,
  currentRow?: DesignerSubtableRow,
  containerId?: string,
): Promise<void> {
  const fieldId = fieldIdForNode(nodeId)
  if (fieldId && event === 'CHANGE' && currentRow) {
    await applyCurrentRowValueRules(fieldId, currentRow, undefined, 'CHANGE', [fieldId])
  }
  if (fieldId && (event === 'CHANGE' || event === 'BLUR')) {
    await validateSingleField(fieldId, event, currentRow)
  }
  const flows = resolveComponentFlows(nodeId, event, fieldId)
  for (const flow of flows) await runFlow(flow, currentRow, containerId)
}

/** 执行动作栏按钮；只读和详情态不产生写入动作。 */
function runAction(action: DesignerActionBarButton['action']): void {
  if (action !== 'PRINT' && rejectWriteAction(action === 'SUBMIT' ? '提交' : '重置')) return
  emit('action', action)
  if (action === 'SUBMIT') void submitForm()
  if (action === 'RESET') resetForm()
  if (action === 'PRINT') window.print()
}

/** 先执行提交前事件和完整验证，再生成纯前端提交投影。 */
async function submitForm(): Promise<void> {
  if (rejectWriteAction('提交')) return
  if (submitting.value) throw new Error('表单正在提交，不能重复进入提交动作')
  submitting.value = true
  try {
    const beforeCompleted = await runFormEvent('BEFORE_SUBMIT')
    if (!beforeCompleted || !(await validateForm())) return
    const projection = projectDesignerSubmission(props.document, valueStore, fieldStates.value, {
      dirtyOverlayModuleIds: activeOverlay.value ? [activeOverlay.value.id] : [],
    })
    runtimeNotice.value = {
      type: 'success',
      message: `提交投影已生成：${Object.keys(projection.fields).length} 个主表字段，${Object.keys(projection.collections).length} 个子表集合`,
    }
    emit('submit', cloneValue(projection))
    await runFormEvent('AFTER_SUBMIT')
  } catch (error) {
    showRuntimeError(error)
  } finally {
    submitting.value = false
  }
}

/** 恢复默认值并触发表单重置事件。 */
function resetForm(): void {
  if (rejectWriteAction('重置')) return
  initializeRuntime(props.document, false)
  void runFormEvent('RESET')
  runtimeNotice.value = { type: 'info', message: '已恢复表单默认值' }
  const value = cloneValue(valueStore)
  emit('update:modelValue', value)
  emit('reset', value)
}

/** 执行完整提交校验，并将根字段错误投影到控件外壳。 */
async function validateForm(): Promise<boolean> {
  clearRecord(fieldFeedbacks)
  const results: DesignerValidationResult[] = []
  const collectionFields = collectSubtableFieldIds(allViewRoots(props.document), props.document)
  for (const field of props.document.dataSchema.fields) {
    if (collectionFields.has(field.id)) continue
    const fieldResults = await validateDesignerField(
      field,
      valueStore.fields[field.id],
      'SUBMIT',
      expressionContext.value,
      {
        state: fieldStates.value[field.id],
        remoteAdapter: props.adapters?.remoteValidation,
        collectionRows: validationCollectionRows(field.id),
      },
    )
    results.push(...fieldResults)
    const feedback = projectDesignerFieldFeedback(fieldResults)
    if (feedback) fieldFeedbacks[createDesignerFieldFeedbackKey(field.id)] = feedback
  }
  for (const [containerId, rows] of Object.entries(valueStore.collections)) {
    for (const row of rows) {
      for (const [fieldId, value] of Object.entries(row.values)) {
        const field = props.document.dataSchema.fields.find((item) => item.id === fieldId)
        if (!field) continue
        const rowResults = await validateDesignerField(
          field,
          value,
          'SUBMIT',
          { ...expressionContext.value, currentRow: row.values },
          {
            remoteAdapter: props.adapters?.remoteValidation,
            collectionRows: validationCollectionRows(field.id),
          },
        )
        results.push(...rowResults)
        const feedback = projectDesignerFieldFeedback(rowResults)
        if (feedback) {
          fieldFeedbacks[
            createDesignerFieldFeedbackKey(field.id, {
              viewCode: 'main',
              containerId,
              rowId: row.rowId,
            })
          ] = feedback
        }
      }
    }
  }
  const errors = results.filter((result) => result.severity === 'ERROR')
  const warnings = results.filter((result) => result.severity === 'WARNING')
  if (errors.length > 0) {
    runtimeNotice.value = { type: 'error', message: `验证未通过：${errors[0]!.message}` }
    return false
  }
  if (warnings.length > 0)
    runtimeNotice.value = { type: 'warning', message: `验证警告：${warnings[0]!.message}` }
  return true
}

/** 验证单个根字段或当前子表行字段。 */
async function validateSingleField(
  fieldId: string,
  trigger: 'CHANGE' | 'BLUR',
  currentRow?: DesignerSubtableRow,
): Promise<void> {
  const field = props.document.dataSchema.fields.find((item) => item.id === fieldId)
  if (!field) return
  const store = overlayValueStore.value ?? valueStore
  const value = currentRow ? currentRow.values[fieldId] : store.fields[fieldId]
  const results = await validateDesignerField(
    field,
    value,
    trigger,
    { ...expressionContext.value, fields: store.fields, currentRow: currentRow?.values },
    {
      state: resolveDesignerFieldState(field, expressionRuntime(store, currentRow)),
      remoteAdapter: props.adapters?.remoteValidation,
      collectionRows: validationCollectionRows(field.id),
    },
  )
  const viewCode = activeOverlay.value?.code ?? 'main'
  const key = createDesignerFieldFeedbackKey(fieldId, {
    viewCode,
    containerId: currentRow ? findCollectionContainerId(currentRow) : undefined,
    rowId: currentRow?.rowId,
  })
  const feedback = projectDesignerFieldFeedback(results)
  if (feedback) fieldFeedbacks[key] = feedback
  else delete fieldFeedbacks[key]
}

function findCollectionContainerId(row: DesignerSubtableRow): string | undefined {
  const store = overlayValueStore.value ?? valueStore
  return Object.entries(store.collections).find(([, rows]) =>
    rows.some((item) => item.rowId === row.rowId),
  )?.[0]
}

/** 打开模块并按配置建立表单草稿或子表当前行草稿。 */
function openModule(
  moduleCode: string,
  currentRow?: DesignerSubtableRow,
  containerId?: string,
): void {
  if (activeOverlay.value) throw new Error('当前已有弹层模块打开，不支持嵌套弹层')
  const overlay = props.document.uiSchema.overlays.find((item) => item.code === moduleCode)
  if (!overlay) throw new Error(`模块 ${moduleCode} 不存在`)
  if (overlay.dataContext === 'SUBTABLE_ROW_DRAFT' && !currentRow) {
    throw new Error('当前事件没有子表行上下文，不能打开行草稿模块')
  }
  activeOverlayCode.value = moduleCode
  overlaySourceRow.value = currentRow
  overlaySourceContainerId.value = containerId ?? ''
  overlayValueStore.value =
    overlay.dataContext === 'SUBTABLE_ROW_DRAFT'
      ? { fields: cloneValue(currentRow!.values), collections: {} }
      : cloneValue(valueStore)
  initializeSubtableCollections(overlay.root, props.document, overlayValueStore.value)
}

/** 确认模块草稿，并合并回它打开时的数据上下文。 */
function confirmActiveModule(moduleCode = activeOverlayCode.value): void {
  if (rejectWriteAction('模块确认')) return
  if (!activeOverlay.value || activeOverlay.value.code !== moduleCode || !overlayValueStore.value)
    return
  if (activeOverlay.value.dataContext === 'SUBTABLE_ROW_DRAFT' && overlaySourceRow.value) {
    overlaySourceRow.value.values = cloneValue(overlayValueStore.value.fields)
    if (overlaySourceContainerId.value) {
      valueStore.collections[overlaySourceContainerId.value] = [
        ...(valueStore.collections[overlaySourceContainerId.value] ?? []),
      ]
    }
  } else {
    replaceValueStore(valueStore, overlayValueStore.value)
  }
  emitRuntimeValue()
  closeActiveModule()
  runtimeNotice.value = { type: 'success', message: '模块草稿已确认' }
  if (props.overlayOnly) emit('overlay-closed')
}

/** 取消模块草稿，不修改主体或原子表行。 */
function cancelActiveModule(moduleCode = activeOverlayCode.value): void {
  if (!activeOverlay.value) return
  if (moduleCode && activeOverlay.value?.code !== moduleCode) return
  closeActiveModule()
  runtimeNotice.value = { type: 'info', message: '已放弃模块草稿' }
  if (props.overlayOnly) emit('overlay-closed')
}

/** 执行表单生命周期事件，返回是否未被动作阻断。 */
async function runFormEvent(event: DesignerFormEvent): Promise<boolean> {
  const flows = props.document.eventFlows.filter(
    (flow) => flow.trigger.scope === 'FORM' && flow.trigger.event === event,
  )
  let completed = true
  for (const flow of flows) {
    const result = await runFlow(flow)
    if (!result) completed = false
  }
  return completed
}

/** 在受控 Host 中执行一个事件流，并统一反馈错误。 */
async function runFlow(
  flow: DesignerEventFlow,
  currentRow?: DesignerSubtableRow,
  containerId?: string,
): Promise<boolean> {
  const store = overlayValueStore.value ?? valueStore
  const result = await executeDesignerEventFlow(
    flow,
    {
      document: props.document,
      valueStore: store,
      variables,
      currentRow: currentRow?.values,
      expressionContext: {
        ...expressionContext.value.context,
        RUNTIME_MODE: modeModel.value,
        DEVICE: props.device,
      },
      adapters: props.adapters,
      runtimeMode: modeModel.value,
      validate: validateForm,
      submit: submitForm,
      reset: resetForm,
      print: () => window.print(),
      message: (message, level) => {
        runtimeNotice.value = { type: messageType(level), message }
      },
      openModule: (moduleCode) => openModule(moduleCode, currentRow, containerId),
      confirmModule: confirmActiveModule,
      cancelModule: cancelActiveModule,
    },
    activeFlowIds,
  )
  if (result.errors.length > 0) {
    runtimeNotice.value = { type: result.blocked ? 'error' : 'warning', message: result.errors[0]! }
  }
  return result.completed && !result.blocked
}

/** 解析节点显式绑定和同节点触发器，去重后按文档顺序返回。 */
function resolveComponentFlows(
  nodeId: string,
  event: DesignerComponentEvent,
  fieldId?: string,
): DesignerEventFlow[] {
  const bindingCode = componentEventBindings(nodeId, fieldId)?.[event]
  return props.document.eventFlows.filter(
    (flow, index, flows) =>
      (flow.code === bindingCode ||
        (flow.trigger.scope === 'COMPONENT' &&
          flow.trigger.nodeId === nodeId &&
          flow.trigger.event === event)) &&
      flows.findIndex((candidate) => candidate.id === flow.id) === index,
  )
}

/** 返回字段或容器节点保存的事件绑定。 */
function componentEventBindings(nodeId: string, fieldId?: string) {
  if (fieldId)
    return props.document.dataSchema.fields.find((field) => field.id === fieldId)?.behavior
      .eventBindings
  const node = findNode(nodeId)
  return node?.nodeType === 'CONTAINER' ? node.eventBindings : undefined
}

/** 由布局节点身份解析字段身份。 */
function fieldIdForNode(nodeId: string): string | undefined {
  const node = findNode(nodeId)
  return node?.nodeType === 'FIELD' ? node.fieldId : undefined
}

/** 在主体和所有弹层中查找节点。 */
function findNode(nodeId: string): DesignerLayoutNode | undefined {
  const visit = (nodes: DesignerLayoutNode[]): DesignerLayoutNode | undefined => {
    for (const node of nodes) {
      if (node.id === nodeId) return node
      if (node.nodeType === 'CONTAINER') {
        for (const slot of node.slots) {
          const match = visit(slot.children)
          if (match) return match
        }
      }
    }
    return undefined
  }
  for (const root of allViewRoots(props.document)) {
    const match = visit(root)
    if (match) return match
  }
  return undefined
}

/** 计算给定值仓库下所有字段的最终状态。 */
function resolveFieldStates(
  store: DesignerRuntimeValueStore,
): Record<string, DesignerResolvedFieldState> {
  return Object.fromEntries(
    props.document.dataSchema.fields.map((field) => [
      field.id,
      applyDesignerFieldAccess(field, resolveDesignerFieldState(field, expressionRuntime(store)), {
        mode: modeModel.value,
        access: readDesignerFieldAccess(props.fieldAccess, field.id),
      }),
    ]),
  )
}

/**
 * 在渲染和事件分发两层拒绝只读/详情写动作。
 *
 * @param action 被拒绝的写动作名称
 * @returns 当前模式禁止写入时返回 true
 */
function rejectWriteAction(action: string): boolean {
  if (!isDesignerRuntimeWriteBlocked(modeModel.value)) return false
  emit('runtime-warning', `只读或详情模式不允许${action}`)
  showRuntimeWarning(`只读或详情模式不允许${action}`)
  return true
}

/** 建立表达式运行上下文，当前行仅在子表事件或校验期间注入。 */
function expressionRuntime(store: DesignerRuntimeValueStore, currentRow?: DesignerSubtableRow) {
  return {
    fields: store.fields,
    currentRow: currentRow?.values,
    variables,
    context: expressionContext.value.context,
  }
}

/** 执行值规则并把诊断反馈到预览，不吞掉循环依赖。 */
async function applyValueRules(
  store: DesignerRuntimeValueStore,
  phase: 'INITIALIZE' | 'CHANGE',
  changedFieldIds: Iterable<string> = [],
): Promise<void> {
  const failures = await applyDesignerValueRules(
    props.document,
    store,
    {
      variables,
      context: expressionContext.value.context,
    },
    { phase, changedFieldIds, confirmationAdapter: props.adapters?.linkageConfirmation },
  )
  if (failures.length > 0) runtimeNotice.value = { type: 'error', message: failures[0]! }
}

/** 执行当前行所属子实体的计算规则，主表字段仍从所在运行副本读取。 */
async function applyCurrentRowValueRules(
  fieldId: string,
  row: DesignerSubtableRow,
  store: DesignerRuntimeValueStore = activeOverlay.value && overlayValueStore.value
    ? overlayValueStore.value
    : valueStore,
  phase: 'INITIALIZE' | 'CHANGE' = 'INITIALIZE',
  changedFieldIds: Iterable<string> = [],
): Promise<void> {
  const entityCode = props.document.dataSchema.fields.find(
    (field) => field.id === fieldId,
  )?.entityCode
  if (!entityCode || entityCode === props.document.dataSchema.rootEntity.code) return
  const failures = await applyDesignerCurrentRowValueRules(
    props.document,
    row.values,
    entityCode,
    {
      fields: store.fields,
      variables,
      context: expressionContext.value.context,
    },
    {
      phase,
      changedFieldIds,
      confirmationAdapter: props.adapters?.linkageConfirmation,
    },
  )
  if (failures.length > 0) runtimeNotice.value = { type: 'error', message: failures[0]! }
}

/** 为新建、复制及初始化的子表行补齐当前行计算结果。 */
async function applyCollectionValueRules(
  store: DesignerRuntimeValueStore,
  rows: DesignerSubtableRow[] = Object.values(store.collections).flat(),
  phase: 'INITIALIZE' | 'CHANGE' = 'INITIALIZE',
  changedFieldIds: Iterable<string> = [],
): Promise<void> {
  for (const row of rows) {
    const fieldId = Object.keys(row.values).find((candidate) =>
      props.document.dataSchema.fields.some((field) => field.id === candidate),
    )
    if (fieldId) await applyCurrentRowValueRules(fieldId, row, store, phase, changedFieldIds)
  }
}

/** 读取字段子表规则引用的集合行数；未配置容器时保持零行并由规则决定结果。 */
function validationCollectionRows(fieldId: string): number | undefined {
  const field = props.document.dataSchema.fields.find((item) => item.id === fieldId)
  const rule = field?.behavior.validationRules.find(
    (item) => item.type === 'SUBTABLE' && item.enabled,
  )
  const containerId = (rule?.configuration as { containerId?: unknown } | undefined)?.containerId
  return typeof containerId === 'string'
    ? (valueStore.collections[containerId]?.length ?? 0)
    : undefined
}

/** 判断动作栏在当前位置是否可见。 */
function showActionBarAt(position: 'TOP' | 'BOTTOM'): boolean {
  if (!props.document.actionBar.visible || ['READ_ONLY', 'DETAIL'].includes(modeModel.value))
    return false
  return (
    props.document.actionBar.position === position || props.document.actionBar.position === 'BOTH'
  )
}

/** 为当前预览副本建立各子表的初始行。 */
function initializeSubtableCollections(
  nodes: DesignerLayoutNode[],
  document: DesignerDocument,
  store: DesignerRuntimeValueStore,
): void {
  for (const node of nodes) {
    if (node.nodeType !== 'CONTAINER') continue
    if (
      ['row-subtable', 'block-subtable'].includes(node.componentType) &&
      !store.collections[node.id]
    ) {
      const count = normalizedInitialRows(node)
      store.collections[node.id] = Array.from({ length: count }, () =>
        createSubtableRow(node, document),
      )
    }
    for (const slot of node.slots) initializeSubtableCollections(slot.children, document, store)
  }
}

/** 收集所有视图的子表直接字段，避免根字段仓库重复持有相同数据。 */
function collectSubtableFieldIds(
  roots: DesignerLayoutNode[][],
  document: DesignerDocument,
): Set<string> {
  const fieldIds = new Set<string>()
  const visit = (nodes: DesignerLayoutNode[]): void => {
    for (const node of nodes) {
      if (node.nodeType !== 'CONTAINER') continue
      if (['row-subtable', 'block-subtable'].includes(node.componentType)) {
        for (const column of projectDesignerSubtableColumns(
          node,
          document.dataSchema.fields,
          undefined,
          {
            includeHidden: true,
          },
        )) {
          fieldIds.add(column.fieldId)
        }
        continue
      }
      for (const slot of node.slots) visit(slot.children)
    }
  }
  roots.forEach(visit)
  return fieldIds
}

/** 返回主体与全部弹层视图的根节点集合。 */
function allViewRoots(document: DesignerDocument): DesignerLayoutNode[][] {
  return [document.uiSchema.root, ...document.uiSchema.overlays.map((overlay) => overlay.root)]
}

/** 根据子表直接字段创建一行隔离的默认值。 */
function createSubtableRow(
  node: DesignerContainerNode,
  document: DesignerDocument,
): DesignerSubtableRow {
  const columns = projectDesignerSubtableColumns(node, document.dataSchema.fields)
  const defaults = Object.fromEntries(
    columns.map((column) => [
      column.fieldId,
      document.dataSchema.fields.find((field) => field.id === column.fieldId)?.defaultValue,
    ]),
  )
  return createDesignerSubtableRow(columns, defaults)
}

/** 读取并限制子表初始行数量。 */
function normalizedInitialRows(node: DesignerContainerNode): number {
  const value = node.configuration.initialRows
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(20, Math.trunc(value)))
    : 0
}

/** Element Plus 对话框关闭事件统一走丢弃草稿语义。 */
function handleDialogVisibility(visible: boolean): void {
  if (!visible) cancelActiveModule()
}

/** Element Plus 抽屉关闭事件统一走丢弃草稿语义。 */
function handleDrawerVisibility(visible: boolean): void {
  if (!visible) cancelActiveModule()
}

/** 清理当前弹层运行上下文。 */
function closeActiveModule(): void {
  activeOverlayCode.value = ''
  overlayValueStore.value = undefined
  overlaySourceRow.value = undefined
  overlaySourceContainerId.value = ''
}

/** 原位替换值仓库，保持 Vue 响应式对象身份。 */
function replaceValueStore(
  target: DesignerRuntimeValueStore,
  source: DesignerRuntimeValueStore,
): void {
  clearRecord(target.fields)
  clearRecord(target.collections)
  Object.assign(target.fields, cloneValue(source.fields))
  Object.assign(target.collections, cloneValue(source.collections))
}

/** 清空响应式记录并保留对象引用。 */
function clearRecord<T>(record: Record<string, T>): void {
  for (const key of Object.keys(record)) delete record[key]
}

/** 将事件消息级别映射为 Element Plus 提示类型。 */
function messageType(level: 'SUCCESS' | 'INFO' | 'WARNING' | 'ERROR') {
  return level.toLowerCase() as 'success' | 'info' | 'warning' | 'error'
}

/** 将运行异常转换为页面内可见反馈。 */
function showRuntimeError(error: unknown): void {
  runtimeNotice.value = {
    type: 'error',
    message: runtimeErrorMessage(error),
  }
  emit('runtime-warning', runtimeNotice.value.message)
}

/** 将可预期的能力缺失或运行降级同时反馈给页面和宿主。 */
function showRuntimeWarning(message: string): void {
  runtimeNotice.value = { type: 'warning', message }
  emit('runtime-warning', message)
}

/** 输出与内部反应式容器隔离的值副本。 */
function emitRuntimeValue(): void {
  emit('update:modelValue', cloneValue(valueStore))
}

/** 将外部受控值合并到已建立默认值的运行仓库。 */
function mergeValueStore(
  target: DesignerRuntimeValueStore,
  source: DesignerRuntimeValueStore,
): void {
  Object.assign(target.fields, cloneValue(source.fields))
  Object.assign(target.collections, cloneValue(source.collections))
}

/** 用稳定 JSON 签名阻止受控回传导致的无效循环。 */
function runtimeStoreSignature(store: DesignerRuntimeValueStore): string {
  return JSON.stringify(store)
}

/** 将任意运行异常规范化为可向外层反馈的明确消息。 */
function runtimeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '运行预览执行失败'
}

/** 克隆运行值；优先支持 File 等浏览器宿主对象。 */
function cloneValue<T>(value: T): T {
  if (value === undefined || value === null) return value
  if (typeof globalThis.structuredClone === 'function') {
    try {
      return globalThis.structuredClone(value)
    } catch {
      // 无法结构化克隆的宿主对象继续使用保守递归策略。
    }
  }
  if (Array.isArray(value)) return value.map((item) => cloneValue(item)) as T
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        cloneValue(item),
      ]),
    ) as T
  }
  return value
}
</script>

<style scoped>
.designer-preview-form {
  box-sizing: border-box;
  width: 100%;
  min-height: 480px;
  padding: var(--daxiang-form-space-4);
  margin: auto;
  background: var(--el-bg-color);
  transition: width var(--el-transition-duration-fast);
}

.designer-preview-form.is-mobile {
  width: min(390px, 100%);
}

.designer-preview-form.is-overlay-only {
  width: 0;
  min-height: 0;
  padding: 0;
  margin: 0;
  overflow: hidden;
}

.designer-preview-form__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: var(--daxiang-form-space-3);
  margin-bottom: var(--daxiang-form-space-4);
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.designer-preview-form__toolbar > span {
  display: inline-flex;
  align-items: center;
  color: var(--el-text-color-regular);
  gap: var(--daxiang-form-space-2);
  font-size: 13px;
  font-weight: 600;
}

.designer-preview-form__toolbar > div {
  display: flex;
  align-items: center;
  gap: var(--daxiang-form-space-2);
}

.designer-preview-form__locale {
  width: 120px;
}

.designer-preview-form__notice {
  margin-bottom: var(--daxiang-form-space-3);
}

.designer-preview-form__actions {
  display: flex;
  padding: var(--daxiang-form-space-3) 0;
  gap: var(--daxiang-form-space-2);
}

.designer-preview-form__actions.is-center {
  justify-content: center;
}

.designer-preview-form__actions.is-right,
.designer-preview-form__drawer-footer {
  justify-content: flex-end;
}

.designer-preview-form__grid {
  row-gap: var(--designer-row-gap);
}

.designer-preview-form__form :deep(.el-form-item) {
  margin-bottom: 0;
}

.designer-preview-form__overlay-content {
  min-height: 160px;
  padding: var(--daxiang-form-space-2);
}

.designer-preview-form__drawer-footer {
  display: flex;
  gap: var(--daxiang-form-space-2);
}

.designer-preview-form.is-mode-detail {
  background: var(--el-fill-color-blank);
}

@media (width <= 640px) {
  .designer-preview-form {
    padding: var(--daxiang-form-space-3);
  }

  .designer-preview-form__toolbar {
    align-items: stretch;
    flex-direction: column;
    gap: var(--daxiang-form-space-2);
  }
}

@media (prefers-reduced-motion: reduce) {
  .designer-preview-form {
    transition: none;
  }
}
</style>
