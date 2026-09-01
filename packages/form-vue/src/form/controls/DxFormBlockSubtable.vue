<template>
  <section class="daxiang-form-block-subtable" :class="{ 'is-mobile': device === 'mobile' }">
    <header v-if="title || canCreate" class="daxiang-form-block-subtable__header">
      <div class="daxiang-form-block-subtable__heading">
        <strong v-if="title">{{ title }}</strong>
        <span>{{ modelValue.length }} 条</span>
      </div>
      <ElButton v-if="canCreate" type="primary" link @click="addRow">
        <DxSvgIcon icon="ri:add-line" />新增区块
      </ElButton>
    </header>

    <ElEmpty
      v-if="columns.length === 0"
      class="daxiang-form-block-subtable__empty"
      description="请先配置区块字段"
      :image-size="48"
    />
    <ElEmpty
      v-else-if="modelValue.length === 0"
      class="daxiang-form-block-subtable__empty"
      description="暂无明细"
      :image-size="48"
    />

    <div v-else-if="mode === 'DETAIL'" class="daxiang-form-block-subtable__blocks is-detail">
      <article
        v-for="(row, index) in modelValue"
        :key="row.rowId"
        class="daxiang-form-block-subtable__block"
      >
        <header class="daxiang-form-block-subtable__block-header">
          <strong>第 {{ index + 1 }} 条</strong>
        </header>
        <div class="daxiang-form-block-subtable__field-grid">
          <div
            v-for="column in columns"
            :key="column.columnId"
            class="daxiang-form-block-subtable__detail-field"
          >
            <span>{{ column.label }}</span>
            <div>
              <slot
                name="detail-field"
                :row="row"
                :column="column"
                :row-index="index"
                :value="row.values[column.fieldId]"
              >
                {{ displayValue(row.values[column.fieldId]) }}
              </slot>
            </div>
          </div>
        </div>
      </article>
    </div>

    <div v-else-if="dialogEditing" class="daxiang-form-block-subtable__summaries">
      <article
        v-for="(row, index) in modelValue"
        :key="row.rowId"
        class="daxiang-form-block-subtable__summary"
      >
        <header class="daxiang-form-block-subtable__block-header">
          <strong>第 {{ index + 1 }} 条</strong>
          <span class="daxiang-form-block-subtable__actions">
            <ElButton link type="primary" @click="openEditor(row)">编辑</ElButton>
            <ElButton v-if="allowCopy" link @click="copyRow(row.rowId)">复制</ElButton>
            <ElButton v-if="allowDelete" link type="danger" @click="deleteRow(row.rowId)"
              >删除</ElButton
            >
          </span>
        </header>
        <div class="daxiang-form-block-subtable__summary-grid">
          <div v-for="column in summaryColumns" :key="column.columnId">
            <span>{{ column.label }}</span>
            <div>
              <slot
                name="detail-field"
                :row="row"
                :column="column"
                :row-index="index"
                :value="row.values[column.fieldId]"
              >
                {{ displayValue(row.values[column.fieldId]) }}
              </slot>
            </div>
          </div>
        </div>
      </article>
    </div>

    <div v-else class="daxiang-form-block-subtable__blocks">
      <article
        v-for="(row, index) in modelValue"
        :key="row.rowId"
        class="daxiang-form-block-subtable__block"
      >
        <header class="daxiang-form-block-subtable__block-header">
          <strong>第 {{ index + 1 }} 条</strong>
          <span
            v-if="editable && (allowCopy || allowDelete)"
            class="daxiang-form-block-subtable__actions"
          >
            <ElButton v-if="allowCopy" link @click="copyRow(row.rowId)">复制</ElButton>
            <ElButton v-if="allowDelete" link type="danger" @click="deleteRow(row.rowId)"
              >删除</ElButton
            >
          </span>
        </header>
        <div class="daxiang-form-block-subtable__field-grid">
          <div
            v-for="column in columns"
            :key="column.columnId"
            class="daxiang-form-block-subtable__field"
          >
            <span>{{ column.label }}</span>
            <div>
              <slot
                name="field"
                :row="row"
                :column="column"
                :row-index="index"
                :value="row.values[column.fieldId]"
                :update="(value: unknown) => updateInlineValue(row.rowId, column.fieldId, value)"
              >
                {{ displayValue(row.values[column.fieldId]) }}
              </slot>
            </div>
          </div>
        </div>
      </article>
    </div>

    <DModal
      v-model="editorVisible"
      :title="editorTitle"
      :width="editorWidth"
      :confirm-disabled="!editorDraft"
      @confirm="confirmEditor"
      @cancel="cancelEditor"
    >
      <div v-if="editorDraft" class="daxiang-form-block-subtable__editor-grid">
        <div
          v-for="column in columns"
          :key="column.columnId"
          class="daxiang-form-block-subtable__field"
        >
          <span>{{ column.label }}</span>
          <div>
            <slot
              name="field"
              :row="editorDraft"
              :column="column"
              :row-index="editorSourceIndex"
              :value="editorDraft.values[column.fieldId]"
              :update="(value: unknown) => updateDraftValue(column.fieldId, value)"
            >
              {{ displayValue(editorDraft.values[column.fieldId]) }}
            </slot>
          </div>
        </div>
      </div>
    </DModal>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import DxSvgIcon from '../../infrastructure/FormIcon.vue'
import DModal from '../../infrastructure/FormModalShell.vue'
import { cloneDesignerSubtableRow, createDesignerSubtableRow } from '@daxiangme/form-core'
import type {
  DesignerDevice,
  DesignerRuntimeMode,
  DesignerSubtableColumn,
  DesignerSubtableRow,
} from '@daxiangme/form-core'

defineOptions({ name: 'DxFormBlockSubtable' })

interface SubtableFieldSlotProps {
  row: DesignerSubtableRow
  column: DesignerSubtableColumn
  rowIndex: number
  value: unknown
  update: (value: unknown) => void
}

interface SubtableSummarySlotProps {
  row: DesignerSubtableRow
  column: DesignerSubtableColumn
  rowIndex: number
  value: unknown
}

const props = withDefaults(
  defineProps<{
    modelValue: DesignerSubtableRow[]
    columns: DesignerSubtableColumn[]
    mode: DesignerRuntimeMode
    device?: DesignerDevice
    title?: string
    allowCreate?: boolean
    allowCopy?: boolean
    allowDelete?: boolean
    initialRows?: number
    defaultValues?: Readonly<Record<string, unknown>>
    deepEditMode?: 'INLINE' | 'DIALOG' | 'DRAWER' | string
  }>(),
  {
    device: 'desktop',
    title: '',
    allowCreate: true,
    allowCopy: true,
    allowDelete: true,
    initialRows: 0,
    defaultValues: () => ({}),
    deepEditMode: 'INLINE',
  },
)

defineSlots<{
  field: (props: SubtableFieldSlotProps) => unknown
  'detail-field': (props: SubtableSummarySlotProps) => unknown
}>()

const emit = defineEmits<{ 'update:modelValue': [rows: DesignerSubtableRow[]] }>()
const initialized = ref(false)
const editorVisible = ref(false)
const editorDraft = ref<DesignerSubtableRow>()
const editorSourceRowId = ref('')
const editable = computed(() => props.mode === 'CREATE' || props.mode === 'EDIT')
const canCreate = computed(() => editable.value && props.allowCreate)
const normalizedInitialRows = computed(() => normalizeInteger(props.initialRows, 0, 20, 0))
const normalizedEditMode = computed<'INLINE' | 'DIALOG'>(() =>
  ['DIALOG', 'DRAWER'].includes(String(props.deepEditMode).toUpperCase()) ? 'DIALOG' : 'INLINE',
)
const dialogEditing = computed(() => editable.value && normalizedEditMode.value === 'DIALOG')
const summaryColumns = computed(() => props.columns.slice(0, 3))
const editorSourceIndex = computed(() => {
  if (!editorSourceRowId.value) return props.modelValue.length
  return props.modelValue.findIndex((row) => row.rowId === editorSourceRowId.value)
})
const editorTitle = computed(() => {
  const subject = props.title || '明细'
  return editorSourceRowId.value ? `编辑${subject}` : `新增${subject}`
})
const editorWidth = computed(() =>
  props.device === 'mobile' ? 'min(360px, calc(100vw - 32px))' : 'min(760px, calc(100vw - 32px))',
)

watch(
  editable,
  (enabled) => {
    if (enabled) initializeRows()
  },
  { immediate: true },
)

watch(
  [dialogEditing, () => props.modelValue.map((row) => row.rowId).join('\u0000')],
  ([editingEnabled]) => {
    if (!editorVisible.value) return
    const sourceStillExists =
      !editorSourceRowId.value ||
      props.modelValue.some((row) => row.rowId === editorSourceRowId.value)
    if (!editingEnabled || !sourceStillExists) resetEditor()
  },
)

/** 首次进入可编辑会话时补足声明的初始块数，之后用户删除数据不会触发自动回填。 */
function initializeRows(): void {
  if (initialized.value) return
  if (!editable.value) return
  initialized.value = true
  const expected = normalizedInitialRows.value
  if (props.modelValue.length >= expected) return
  const additions = Array.from({ length: expected - props.modelValue.length }, () =>
    createDesignerSubtableRow(props.columns, props.defaultValues),
  )
  emit('update:modelValue', [...props.modelValue, ...additions])
}

/** INLINE 直接追加空块；DIALOG 先编辑独立草稿，确认后才写回集合。 */
function addRow(): void {
  if (!canCreate.value) return
  if (dialogEditing.value) {
    editorSourceRowId.value = ''
    editorDraft.value = createDesignerSubtableRow(props.columns, props.defaultValues)
    editorVisible.value = true
    return
  }
  emit('update:modelValue', [
    ...props.modelValue,
    createDesignerSubtableRow(props.columns, props.defaultValues),
  ])
}

/** 打开现有行的深克隆草稿，弹窗输入不会提前污染预览值。 */
function openEditor(row: DesignerSubtableRow): void {
  if (!dialogEditing.value) return
  editorSourceRowId.value = row.rowId
  editorDraft.value = { ...cloneDesignerSubtableRow(row), rowId: row.rowId }
  editorVisible.value = true
}

/** 确认时一次性新增或替换整行，保持事务式弹窗编辑语义。 */
function confirmEditor(): void {
  const draft = editorDraft.value
  if (!draft || !dialogEditing.value) return
  if (!editorSourceRowId.value) {
    emit('update:modelValue', [...props.modelValue, draft])
  } else {
    emit(
      'update:modelValue',
      props.modelValue.map((row) => (row.rowId === editorSourceRowId.value ? draft : row)),
    )
  }
  resetEditor()
}

/** 取消时只销毁草稿，不触发集合更新。 */
function cancelEditor(): void {
  resetEditor()
}

/** 清理弹窗会话，避免下一次新增继承上一次编辑身份。 */
function resetEditor(): void {
  editorVisible.value = false
  editorDraft.value = undefined
  editorSourceRowId.value = ''
}

/** 深复制目标块并插入源块之后。 */
function copyRow(rowId: string): void {
  if (!editable.value || !props.allowCopy) return
  const index = props.modelValue.findIndex((row) => row.rowId === rowId)
  if (index < 0) return
  const rows = [...props.modelValue]
  rows.splice(index + 1, 0, cloneDesignerSubtableRow(rows[index]))
  emit('update:modelValue', rows)
}

/** 按行身份删除，避免界面重排后误删相邻区块。 */
function deleteRow(rowId: string): void {
  if (!editable.value || !props.allowDelete) return
  emit(
    'update:modelValue',
    props.modelValue.filter((row) => row.rowId !== rowId),
  )
}

/** INLINE 模式以不可变方式回写字段值；只读和详情模式拒绝修改。 */
function updateInlineValue(rowId: string, fieldId: string, value: unknown): void {
  if (!editable.value) return
  emit(
    'update:modelValue',
    props.modelValue.map((row) =>
      row.rowId === rowId ? { ...row, values: { ...row.values, [fieldId]: value } } : row,
    ),
  )
}

/** 弹窗字段仅更新独立行草稿，直到用户确认才提交。 */
function updateDraftValue(fieldId: string, value: unknown): void {
  if (!editorDraft.value) return
  editorDraft.value = {
    ...editorDraft.value,
    values: { ...editorDraft.value.values, [fieldId]: value },
  }
}

/** 缺少详情插槽时提供安全的简洁摘要。 */
function displayValue(value: unknown): string {
  if (value === undefined || value === null || value === '') return '—'
  if (Array.isArray(value)) return value.map(displayValue).join('、') || '—'
  if (typeof value === 'object') return '已填写'
  return String(value)
}

/** 将导入配置约束到领域组件承诺的安全整数范围。 */
function normalizeInteger(
  value: unknown,
  minimum: number,
  maximum: number,
  fallback: number,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.max(minimum, Math.min(maximum, Math.trunc(value)))
}
</script>

<style scoped>
.daxiang-form-block-subtable {
  width: 100%;
  min-width: 0;
}

.daxiang-form-block-subtable__header,
.daxiang-form-block-subtable__block-header {
  display: flex;
  min-height: 36px;
  align-items: center;
  justify-content: space-between;
}

.daxiang-form-block-subtable__heading {
  display: inline-flex;
  min-width: 0;
  align-items: baseline;
  gap: var(--daxiang-form-space-2);
}

.daxiang-form-block-subtable__heading span,
.daxiang-form-block-subtable__block-header {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.daxiang-form-block-subtable__blocks,
.daxiang-form-block-subtable__summaries {
  border-top: 1px solid var(--el-border-color-lighter);
}

.daxiang-form-block-subtable__block,
.daxiang-form-block-subtable__summary {
  padding: var(--daxiang-form-space-3) 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.daxiang-form-block-subtable__field-grid,
.daxiang-form-block-subtable__editor-grid {
  display: grid;
  min-width: 0;
  padding-top: var(--daxiang-form-space-2);
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--daxiang-form-space-3) var(--daxiang-form-space-4);
}

.daxiang-form-block-subtable__field,
.daxiang-form-block-subtable__detail-field {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.daxiang-form-block-subtable__field > span,
.daxiang-form-block-subtable__detail-field > span,
.daxiang-form-block-subtable__summary-grid span {
  margin-bottom: var(--daxiang-form-space-1);
  color: var(--el-text-color-regular);
  font-size: 13px;
  font-weight: 500;
}

.daxiang-form-block-subtable__field > div,
.daxiang-form-block-subtable__detail-field > div,
.daxiang-form-block-subtable__summary-grid div {
  min-width: 0;
}

.daxiang-form-block-subtable__actions {
  display: inline-flex;
  white-space: nowrap;
}

.daxiang-form-block-subtable__summary-grid {
  display: grid;
  padding-top: var(--daxiang-form-space-2);
  grid-template-columns: repeat(3, minmax(0, 1fr));
  column-gap: var(--daxiang-form-space-4);
}

.daxiang-form-block-subtable__summary-grid > div {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.daxiang-form-block-subtable__summary-grid > div > div,
.daxiang-form-block-subtable__detail-field > div {
  color: var(--el-text-color-secondary);
  line-height: 1.6;
  overflow-wrap: anywhere;
}

.daxiang-form-block-subtable.is-mobile .daxiang-form-block-subtable__field-grid,
.daxiang-form-block-subtable.is-mobile .daxiang-form-block-subtable__summary-grid,
.daxiang-form-block-subtable.is-mobile .daxiang-form-block-subtable__editor-grid {
  grid-template-columns: minmax(0, 1fr);
  row-gap: var(--daxiang-form-space-3);
}

.daxiang-form-block-subtable__empty {
  min-height: 120px;
}
</style>
