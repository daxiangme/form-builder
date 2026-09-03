<template>
  <ElCol
    v-if="node.nodeType === 'FIELD' && runtimeVisibleField"
    :span="grid.span"
    :offset="grid.offset"
  >
    <DesignerDetailField
      v-if="mode === 'DETAIL'"
      :field="runtimeVisibleField"
      :model-value="valueStore.fields[runtimeVisibleField.id]"
      :show-label="detailShowLabel"
    />
    <ElFormItem
      v-else
      :label="grid.showLabel ? runtimeVisibleField.label : ''"
      :label-position="fieldLabelPosition"
      :required="runtimeFieldState.required"
      :error="runtimeFieldFeedback?.error"
      @focusin="emitComponentEvent(node.id, 'FOCUS')"
      @focusout="emitComponentEvent(node.id, 'BLUR')"
    >
      <DesignerStaticControl
        :model-value="valueStore.fields[runtimeVisibleField.id]"
        :field="runtimeField"
        :mode="mode"
        :appearance-mode="readonlyDisplayMode"
        :adapters="adapters"
        :adapter-context="adapterContext"
        @update:model-value="updateFieldValue"
        @runtime-warning="(message) => emit('runtime-warning', message)"
      />
      <small v-if="runtimeVisibleField.helpText" class="designer-runtime-node__help">{{
        runtimeVisibleField.helpText
      }}</small>
      <small v-if="runtimeFieldFeedback?.warning" class="designer-runtime-node__warning">
        {{ runtimeFieldFeedback.warning }}
      </small>
    </ElFormItem>
  </ElCol>

  <ElCol
    v-else-if="
      node.nodeType === 'CONTAINER' && !(mode === 'DETAIL' && node.componentType === 'button')
    "
    :span="grid.span"
    :offset="grid.offset"
  >
    <div
      class="designer-runtime-node__surface-host"
      :class="containerAppearanceClasses"
      :style="containerRadiusStyle"
    >
      <component
        :is="`h${headingLevel}`"
        v-if="node.componentType === 'title'"
        class="designer-runtime-node__heading"
        :style="headingStyle"
      >
        {{ textConfiguration('text') || '标题' }}
      </component>
      <ElDivider
        v-else-if="node.componentType === 'divider'"
        class="designer-runtime-node__divider"
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
        :closable="booleanConfiguration('closable')"
      />
      <div
        v-else-if="node.componentType === 'button'"
        class="designer-runtime-node__button"
        :class="`is-${buttonAlign}`"
      >
        <ElButton
          :type="buttonType"
          :plain="booleanConfiguration('plain')"
          :round="booleanConfiguration('round')"
          :disabled="mode === 'READ_ONLY' || mode === 'DETAIL' || booleanConfiguration('disabled')"
          @click="emitComponentEvent(node.id, 'CLICK')"
        >
          {{ textConfiguration('text') || '按钮' }}
        </ElButton>
      </div>
      <div v-else-if="node.componentType === 'captcha'" class="designer-runtime-node__button">
        <ElButton
          :disabled="mode === 'READ_ONLY' || mode === 'DETAIL' || !adapters?.challenge"
          :loading="challengeLoading"
          @click="issueChallenge"
        >
          获取验证码
        </ElButton>
        <small class="designer-runtime-node__help">{{
          adapters?.challenge
            ? '验证码由宿主挑战 Adapter 签发'
            : '当前宿主未提供验证码 Adapter，挑战已失败关闭'
        }}</small>
      </div>
      <ElAlert
        v-else-if="node.componentType === 'iframe'"
        type="info"
        :closable="false"
        show-icon
        :title="textConfiguration('title') || '外部页面'"
        description="静态 Core 不加载任意外部 URL"
      />
      <ElTabs
        v-else-if="node.componentType === 'tabs'"
        v-model="activeSlot"
        class="designer-runtime-node__tabs"
        :class="[`is-${tabsType || 'line'}`, { 'is-detail': mode === 'DETAIL' }]"
        :type="tabsType"
      >
        <ElTabPane
          v-for="slot in node.slots"
          :key="slot.id"
          :name="slot.slotCode"
          :label="slot.label"
        >
          <ElRow class="designer-runtime-node__grid" :gutter="gutter">
            <DesignerRuntimeNode
              v-for="child in slot.children"
              :key="child.id"
              :node="child"
              :fields="fields"
              :value-store="valueStore"
              :mode="mode"
              :device="device"
              :gutter="gutter"
              :appearance="appearance"
              :field-states="fieldStates"
              :field-feedbacks="fieldFeedbacks"
              :feedback-scope="feedbackScope"
              :adapters="adapters"
              :adapter-context="adapterContext"
              :readonly-display-mode="readonlyDisplayMode"
              @update-field-value="(fieldId, value) => emit('update-field-value', fieldId, value)"
              @update-collection="
                (containerId, rows) => emit('update-collection', containerId, rows)
              "
              @component-event="(...args) => emit('component-event', ...args)"
              @runtime-warning="(message) => emit('runtime-warning', message)"
            />
          </ElRow>
        </ElTabPane>
      </ElTabs>
      <DxFormRowSubtable
        v-else-if="node.componentType === 'row-subtable'"
        :model-value="subtableRows"
        :columns="subtableColumns"
        :mode="mode"
        :device="device"
        :title="containerTitle || componentName"
        :allow-create="booleanConfiguration('allowCreate')"
        :allow-copy="booleanConfiguration('allowCopy')"
        :allow-delete="booleanConfiguration('allowDelete')"
        :show-index="booleanConfiguration('showIndex')"
        :pagination="booleanConfiguration('pagination')"
        :page-size="numberConfiguration('pageSize') || 10"
        :initial-rows="numberConfiguration('initialRows')"
        :default-values="subtableDefaultValues"
        @update:model-value="updateSubtableRows"
      >
        <template #cell="{ column, value, update, row }">
          <div
            v-if="fieldForColumn(column)"
            @focusin="emitComponentEvent(column.columnId, 'FOCUS', row, node.id)"
            @focusout="emitComponentEvent(column.columnId, 'BLUR', row, node.id)"
          >
            <DesignerStaticControl
              :model-value="value"
              :field="runtimeSubtableField(column)"
              :mode="mode"
              :appearance-mode="readonlyDisplayMode"
              :adapters="adapters"
              :adapter-context="{ ...adapterContext, rowKey: row.rowId }"
              @update:model-value="updateSubtableField(column, row, $event, update, node.id)"
              @runtime-warning="(message) => emit('runtime-warning', message)"
            />
            <small
              v-if="subtableFeedback(column.fieldId, row, node.id)?.error"
              class="designer-runtime-node__error"
            >
              {{ subtableFeedback(column.fieldId, row, node.id)?.error }}
            </small>
            <small
              v-if="subtableFeedback(column.fieldId, row, node.id)?.warning"
              class="designer-runtime-node__warning"
            >
              {{ subtableFeedback(column.fieldId, row, node.id)?.warning }}
            </small>
          </div>
          <ElText v-else type="danger">失效字段</ElText>
        </template>
        <template #detail-cell="{ column, value }">
          <DesignerDetailField
            v-if="fieldForColumn(column)"
            compact
            :field="fieldForColumn(column)!"
            :model-value="value"
            :show-label="false"
          />
          <ElText v-else type="danger">失效字段</ElText>
        </template>
      </DxFormRowSubtable>
      <DxFormBlockSubtable
        v-else-if="node.componentType === 'block-subtable'"
        :model-value="subtableRows"
        :columns="subtableColumns"
        :mode="mode"
        :device="device"
        :title="containerTitle || componentName"
        :allow-create="booleanConfiguration('allowCreate')"
        :allow-copy="booleanConfiguration('allowCopy')"
        :allow-delete="booleanConfiguration('allowDelete')"
        :initial-rows="numberConfiguration('initialRows')"
        :deep-edit-mode="textConfiguration('deepEditMode') || 'INLINE'"
        :default-values="subtableDefaultValues"
        @update:model-value="updateSubtableRows"
      >
        <template #field="{ column, value, update, row }">
          <div
            v-if="fieldForColumn(column)"
            @focusin="emitComponentEvent(column.columnId, 'FOCUS', row, node.id)"
            @focusout="emitComponentEvent(column.columnId, 'BLUR', row, node.id)"
          >
            <DesignerStaticControl
              :model-value="value"
              :field="runtimeSubtableField(column)"
              :mode="mode"
              :appearance-mode="readonlyDisplayMode"
              :adapters="adapters"
              :adapter-context="{ ...adapterContext, rowKey: row.rowId }"
              @update:model-value="updateSubtableField(column, row, $event, update, node.id)"
              @runtime-warning="(message) => emit('runtime-warning', message)"
            />
            <small
              v-if="subtableFeedback(column.fieldId, row, node.id)?.error"
              class="designer-runtime-node__error"
            >
              {{ subtableFeedback(column.fieldId, row, node.id)?.error }}
            </small>
            <small
              v-if="subtableFeedback(column.fieldId, row, node.id)?.warning"
              class="designer-runtime-node__warning"
            >
              {{ subtableFeedback(column.fieldId, row, node.id)?.warning }}
            </small>
          </div>
          <ElText v-else type="danger">失效字段</ElText>
        </template>
        <template #detail-field="{ column, value }">
          <DesignerDetailField
            v-if="fieldForColumn(column)"
            compact
            :field="fieldForColumn(column)!"
            :model-value="value"
            :show-label="false"
          />
          <ElText v-else type="danger">失效字段</ElText>
        </template>
      </DxFormBlockSubtable>
      <section v-else class="designer-runtime-node__container" :class="`is-${node.componentType}`">
        <header v-if="containerTitle" class="designer-runtime-node__container-header">
          <strong>{{ containerTitle || componentName }}</strong>
        </header>
        <ElRow
          v-for="slot in node.slots"
          :key="slot.id"
          class="designer-runtime-node__grid"
          :gutter="gutter"
        >
          <DesignerRuntimeNode
            v-for="child in slot.children"
            :key="child.id"
            :node="child"
            :fields="fields"
            :value-store="valueStore"
            :mode="mode"
            :device="device"
            :gutter="gutter"
            :appearance="appearance"
            :field-states="fieldStates"
            :field-feedbacks="fieldFeedbacks"
            :feedback-scope="feedbackScope"
            :adapters="adapters"
            :adapter-context="adapterContext"
            :readonly-display-mode="readonlyDisplayMode"
            @update-field-value="(fieldId, value) => emit('update-field-value', fieldId, value)"
            @update-collection="(containerId, rows) => emit('update-collection', containerId, rows)"
            @component-event="(...args) => emit('component-event', ...args)"
            @runtime-warning="(message) => emit('runtime-warning', message)"
          />
        </ElRow>
        <ElEmpty
          v-if="node.slots.every((slot) => slot.children.length === 0)"
          description="暂无内容"
          :image-size="48"
        />
      </section>
    </div>
  </ElCol>
</template>

<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue'
import { findDesignerComponent } from '@daxiangme/form-core'
import {
  designerContainerAppearanceClasses,
  designerContainerRadiusStyle,
  resolveDesignerContainerAppearance,
} from '@daxiangme/form-core'
import { createDesignerFieldFeedbackKey } from '@daxiangme/form-core'
import { projectDesignerSubtableColumns } from '@daxiangme/form-core'
import type {
  DesignerAppearance,
  DesignerDevice,
  DesignerComponentEvent,
  DesignerField,
  DesignerFieldFeedback,
  DesignerLayoutNode,
  DesignerResolvedFieldState,
  DesignerRuntimeMode,
  DesignerRuntimeAdapters,
  DesignerRuntimeValueStore,
  DesignerSubtableColumn,
  DesignerSubtableRow,
  FormRuntimeAdapterContext,
} from '@daxiangme/form-core'
import DxFormBlockSubtable from '../form/controls/DxFormBlockSubtable.vue'
import DxFormRowSubtable from '../form/controls/DxFormRowSubtable.vue'
import DesignerDetailField from './DesignerDetailField.vue'
import DesignerStaticControl from './DesignerStaticControl.vue'

defineOptions({ name: 'DesignerRuntimeNode' })

const props = defineProps<{
  node: DesignerLayoutNode
  fields: DesignerField[]
  valueStore: DesignerRuntimeValueStore
  mode: DesignerRuntimeMode
  device: DesignerDevice
  gutter: number
  appearance: DesignerAppearance
  fieldStates: Record<string, DesignerResolvedFieldState>
  fieldFeedbacks: Record<string, DesignerFieldFeedback>
  feedbackScope: string
  adapters?: DesignerRuntimeAdapters
  adapterContext: FormRuntimeAdapterContext
  readonlyDisplayMode: 'CONTROL' | 'TEXT'
}>()

const emit = defineEmits<{
  'update-field-value': [fieldId: string, value: unknown]
  'update-collection': [containerId: string, rows: DesignerSubtableRow[]]
  'component-event': [
    nodeId: string,
    event: DesignerComponentEvent,
    currentRow?: DesignerSubtableRow,
    containerId?: string,
  ]
  'runtime-warning': [message: string]
}>()
const challengeLoading = ref(false)

/** 通过宿主挑战 Adapter 签发验证码；缺少端口或只读模式时失败关闭。 */
async function issueChallenge(): Promise<void> {
  if (props.mode === 'READ_ONLY' || props.mode === 'DETAIL') {
    emit('runtime-warning', '只读或详情模式不允许发起验证码挑战')
    return
  }
  const adapter = props.adapters?.challenge
  if (!adapter) {
    emit('runtime-warning', '当前宿主未提供验证码 Adapter，挑战已失败关闭')
    return
  }
  challengeLoading.value = true
  try {
    const result = await adapter.issue({
      fieldId: props.node.id,
      fieldCode: field.value?.key ?? props.node.id,
      context: props.adapterContext,
    })
    if (result.challengeId) {
      emit('update-field-value', field.value?.id ?? props.node.id, result.challengeId)
    }
  } catch (error) {
    emit('runtime-warning', error instanceof Error ? error.message : '验证码挑战失败')
  } finally {
    challengeLoading.value = false
  }
}

const field = computed(() => {
  const node = props.node
  return node.nodeType === 'FIELD'
    ? props.fields.find((item) => item.id === node.fieldId)
    : undefined
})
const runtimeVisibleField = computed(() => {
  const currentField = field.value
  if (!currentField || !runtimeFieldState.value.visible) return undefined
  return currentField
})
const runtimeFieldState = computed<DesignerResolvedFieldState>(() =>
  field.value
    ? (props.fieldStates[field.value.id] ?? {
        visible: field.value.componentType !== 'hidden' && !field.value.display.hidden,
        required: field.value.required,
        disabled: field.value.display.readonly,
      })
    : { visible: false, required: false, disabled: false },
)
const runtimeField = computed<DesignerField>(() => ({
  ...runtimeVisibleField.value!,
  required: runtimeFieldState.value.required,
  display: { ...runtimeVisibleField.value!.display, readonly: runtimeFieldState.value.disabled },
}))
const runtimeFieldFeedback = computed(() =>
  runtimeVisibleField.value
    ? props.fieldFeedbacks[
        createDesignerFieldFeedbackKey(runtimeVisibleField.value.id, {
          viewCode: props.feedbackScope,
        })
      ]
    : undefined,
)
const fieldRegistration = computed(() =>
  runtimeVisibleField.value
    ? findDesignerComponent(runtimeVisibleField.value.componentType)
    : undefined,
)
const grid = computed(() => props.node.layout[props.device === 'mobile' ? 'mobile' : 'pc'])
const detailShowLabel = computed(
  () => grid.value.showLabel && fieldRegistration.value?.detailLabelPolicy !== 'HIDE',
)
const activeSlot = ref('')
const lastActiveSlotIndex = ref(0)
const fieldLabelPosition = computed(() => {
  const position = grid.value.labelPosition
  return position === 'INHERIT' ? undefined : (position.toLowerCase() as 'top' | 'left' | 'right')
})
const container = computed(() => (props.node.nodeType === 'CONTAINER' ? props.node : undefined))
const registration = computed(() =>
  container.value ? findDesignerComponent(container.value.componentType) : undefined,
)
const componentName = computed(() => registration.value?.name ?? '')
const containerTitle = computed(() => {
  const value = container.value?.configuration.title
  return typeof value === 'string' ? value : ''
})
const containerAppearanceClasses = computed(() =>
  container.value
    ? designerContainerAppearanceClasses(
        resolveDesignerContainerAppearance(props.appearance, container.value),
      )
    : [],
)
const containerRadiusStyle = computed(() => {
  if (!container.value) return undefined
  const resolved = resolveDesignerContainerAppearance(props.appearance, container.value)
  return resolved ? designerContainerRadiusStyle(resolved.radius) : undefined
})
const headingLevel = computed(() => Math.max(1, Math.min(6, numberConfiguration('level') || 3)))
const headingStyle = computed(() => ({
  color: textConfiguration('fontColor') || undefined,
  fontSize: numberConfiguration('fontSize') ? `${numberConfiguration('fontSize')}px` : undefined,
  textAlign: ['left', 'center', 'right'].includes(textConfiguration('align'))
    ? textConfiguration('align')
    : undefined,
}))
const dividerPosition = computed(() => {
  const value = textConfiguration('position')
  return ['left', 'center', 'right'].includes(value)
    ? (value as 'left' | 'center' | 'right')
    : 'left'
})
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
const buttonAlign = computed(() => {
  const value = textConfiguration('align')
  return ['left', 'center', 'right'].includes(value) ? value : 'left'
})
const tabsType = computed(() => {
  const value = textConfiguration('tabsType')
  return ['card', 'border-card'].includes(value) ? (value as 'card' | 'border-card') : undefined
})

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
const subtableColumns = computed(() =>
  container.value ? projectDesignerSubtableColumns(container.value, props.fields) : [],
)
const subtableRows = computed(() =>
  container.value ? (props.valueStore.collections[container.value.id] ?? []) : [],
)
const subtableDefaultValues = computed<Record<string, unknown>>(() =>
  Object.fromEntries(
    subtableColumns.value.map((column) => [
      column.fieldId,
      cloneValue(fieldForColumn(column)?.defaultValue),
    ]),
  ),
)

function updateFieldValue(value: unknown): void {
  if (field.value) {
    emit('update-field-value', field.value.id, value)
    emitComponentEvent(props.node.id, 'CHANGE')
  }
}

/** 将子表领域组件产生的多行值回传给运行值仓库。 */
function updateSubtableRows(rows: DesignerSubtableRow[]): void {
  if (container.value) emit('update-collection', container.value.id, rows)
}

function textConfiguration(key: string): string {
  const value = container.value?.configuration[key]
  return typeof value === 'string' ? value : ''
}

function numberConfiguration(key: string): number {
  const value = container.value?.configuration[key]
  return typeof value === 'number' ? value : 0
}

function booleanConfiguration(key: string): boolean {
  return container.value?.configuration[key] === true
}

/** 返回稳定列投影对应的字段定义。 */
function fieldForColumn(column: DesignerSubtableColumn): DesignerField | undefined {
  return props.fields.find((item) => item.id === column.fieldId)
}

function runtimeSubtableField(column: DesignerSubtableColumn): DesignerField {
  const source = fieldForColumn(column)!
  const state = props.fieldStates[source.id]
  return state
    ? {
        ...source,
        required: state.required,
        display: { ...source.display, readonly: state.disabled },
      }
    : source
}

function updateSubtableField(
  column: DesignerSubtableColumn,
  row: DesignerSubtableRow,
  value: unknown,
  update: (value: unknown) => void,
  containerId: string,
): void {
  update(value)
  emitComponentEvent(column.columnId, 'CHANGE', row, containerId)
}

function subtableFeedback(fieldId: string, row: DesignerSubtableRow, containerId: string) {
  return props.fieldFeedbacks[
    createDesignerFieldFeedbackKey(fieldId, {
      viewCode: props.feedbackScope,
      containerId,
      rowId: row.rowId,
    })
  ]
}

function emitComponentEvent(
  nodeId: string,
  event: DesignerComponentEvent,
  currentRow?: DesignerSubtableRow,
  containerId?: string,
): void {
  emit('component-event', nodeId, event, currentRow, containerId)
}

/** 克隆字段默认值，避免新行共享数组或对象引用。 */
function cloneValue(value: unknown): unknown {
  if (value === undefined) return undefined
  if (typeof globalThis.structuredClone === 'function') {
    try {
      return globalThis.structuredClone(value)
    } catch {
      // 文件等宿主对象无法克隆时交给子表投影的保守克隆策略处理。
    }
  }
  return value === null || typeof value !== 'object' ? value : JSON.parse(JSON.stringify(value))
}
</script>

<style scoped>
.designer-runtime-node__help {
  display: block;
  width: 100%;
  margin-top: var(--daxiang-form-space-1);
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.designer-runtime-node__warning,
.designer-runtime-node__error {
  display: block;
  width: 100%;
  margin-top: var(--daxiang-form-space-1);
  color: var(--el-color-warning);
  font-size: 12px;
}

.designer-runtime-node__error {
  color: var(--el-color-danger);
}

.designer-runtime-node__grid {
  row-gap: var(--designer-row-gap);
}

.designer-runtime-node__heading {
  margin: 0;
}

.designer-runtime-node__divider {
  margin: var(--daxiang-form-space-3) 0;
}

.designer-runtime-node__tabs {
  width: 100%;
}

.designer-runtime-node__tabs:not(.is-border-card) :deep(.el-tabs__header) {
  margin-bottom: 0;
}

.designer-runtime-node__tabs:not(.is-border-card) :deep(.el-tabs__content) {
  padding-top: var(--daxiang-form-section-gap);
}

.designer-runtime-node__tabs.is-detail :deep(.el-tabs__content) {
  padding-top: var(--daxiang-form-space-1);
}

.designer-runtime-node__button {
  width: 100%;
}

.designer-runtime-node__button.is-center {
  text-align: center;
}

.designer-runtime-node__button.is-right {
  text-align: right;
}

.designer-runtime-node__surface-host {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
}

.designer-runtime-node__surface-host.daxiang-form-container-surface.is-surface-none,
.designer-runtime-node__container {
  padding: 0;
}

.designer-runtime-node__surface-host.daxiang-form-container-surface:not(.is-surface-none) {
  padding: var(--daxiang-form-space-3);
  border-radius: var(--daxiang-form-container-radius);
}

.designer-runtime-node__surface-host.daxiang-form-container-surface.is-surface-bordered {
  border: 1px solid var(--el-border-color-lighter);
}

.designer-runtime-node__surface-host.daxiang-form-container-surface.is-surface-shadow {
  background: var(--el-bg-color);
  box-shadow: var(--el-box-shadow-light);
}

.designer-runtime-node__surface-host.daxiang-form-container-surface.is-surface-filled {
  background: var(--el-fill-color-light);
}

.designer-runtime-node__container-header {
  display: flex;
  min-height: 36px;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--daxiang-form-space-2);
}
</style>
