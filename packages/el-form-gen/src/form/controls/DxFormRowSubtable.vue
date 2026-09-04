<template>
  <section class="daxiang-form-row-subtable">
    <header v-if="title || canCreate" class="daxiang-form-row-subtable__header">
      <div class="daxiang-form-row-subtable__heading">
        <strong v-if="title">{{ title }}</strong>
        <span>{{ modelValue.length }} 条</span>
      </div>
      <ElButton v-if="canCreate" type="primary" link @click="addRow">
        <DxSvgIcon icon="ri:add-line" />新增一行
      </ElButton>
    </header>

    <ElEmpty
      v-if="columns.length === 0"
      class="daxiang-form-row-subtable__empty"
      description="请先配置子表列"
      :image-size="48"
    />
    <ElEmpty
      v-else-if="modelValue.length === 0"
      class="daxiang-form-row-subtable__empty"
      description="暂无明细"
      :image-size="48"
    />

    <div v-else-if="device === 'mobile'" class="daxiang-form-row-subtable__records">
      <article
        v-for="(row, localIndex) in visibleRows"
        :key="row.rowId"
        class="daxiang-form-row-subtable__record"
      >
        <header v-if="showIndex || showActions" class="daxiang-form-row-subtable__record-header">
          <strong v-if="showIndex">第 {{ displayIndex(localIndex) }} 条</strong>
          <span v-else />
          <span v-if="showActions" class="daxiang-form-row-subtable__actions">
            <ElButton v-if="allowCopy" link @click="copyRow(row.rowId)">复制</ElButton>
            <ElButton v-if="allowDelete" link type="danger" @click="deleteRow(row.rowId)"
              >删除</ElButton
            >
          </span>
        </header>
        <div
          v-for="column in columns"
          :key="column.columnId"
          class="daxiang-form-row-subtable__record-field"
        >
          <span class="daxiang-form-row-subtable__record-label">{{ column.label }}</span>
          <div class="daxiang-form-row-subtable__record-value">
            <slot
              v-if="mode === 'DETAIL'"
              name="detail-cell"
              :row="row"
              :column="column"
              :row-index="sourceIndex(localIndex)"
              :value="row.values[column.fieldId]"
            >
              {{ displayValue(row.values[column.fieldId]) }}
            </slot>
            <slot
              v-else
              name="cell"
              :row="row"
              :column="column"
              :row-index="sourceIndex(localIndex)"
              :value="row.values[column.fieldId]"
              :update="(value: unknown) => updateCell(row.rowId, column.fieldId, value)"
            >
              {{ displayValue(row.values[column.fieldId]) }}
            </slot>
          </div>
        </div>
      </article>
    </div>

    <div
      v-else
      class="daxiang-form-row-subtable__scroll"
      role="region"
      :aria-label="title || '子表明细'"
    >
      <div
        class="daxiang-form-row-subtable__table"
        :style="{ minWidth: gridLayout.minimumWidth }"
        role="table"
        :aria-label="title || '子表明细'"
        :aria-rowcount="modelValue.length + 1"
      >
        <div
          class="daxiang-form-row-subtable__grid daxiang-form-row-subtable__table-head"
          :style="{ gridTemplateColumns: gridLayout.template }"
          role="row"
        >
          <span v-if="showIndex" class="daxiang-form-row-subtable__index" role="columnheader"
            >序号</span
          >
          <span v-for="column in columns" :key="column.columnId" role="columnheader">
            {{ column.label }}
          </span>
          <span
            v-if="showActions"
            class="daxiang-form-row-subtable__sticky-action"
            role="columnheader"
          >
            操作
          </span>
        </div>

        <div
          v-for="(row, localIndex) in visibleRows"
          :key="row.rowId"
          class="daxiang-form-row-subtable__grid daxiang-form-row-subtable__table-row"
          :class="{ 'is-detail': mode === 'DETAIL' }"
          :style="{ gridTemplateColumns: gridLayout.template }"
          role="row"
        >
          <span v-if="showIndex" class="daxiang-form-row-subtable__index" role="cell">
            {{ displayIndex(localIndex) }}
          </span>
          <div v-for="column in columns" :key="column.columnId" role="cell">
            <slot
              v-if="mode === 'DETAIL'"
              name="detail-cell"
              :row="row"
              :column="column"
              :row-index="sourceIndex(localIndex)"
              :value="row.values[column.fieldId]"
            >
              {{ displayValue(row.values[column.fieldId]) }}
            </slot>
            <slot
              v-else
              name="cell"
              :row="row"
              :column="column"
              :row-index="sourceIndex(localIndex)"
              :value="row.values[column.fieldId]"
              :update="(value: unknown) => updateCell(row.rowId, column.fieldId, value)"
            >
              {{ displayValue(row.values[column.fieldId]) }}
            </slot>
          </div>
          <div v-if="showActions" class="daxiang-form-row-subtable__sticky-action" role="cell">
            <span class="daxiang-form-row-subtable__actions">
              <ElButton v-if="allowCopy" link @click="copyRow(row.rowId)">复制</ElButton>
              <ElButton v-if="allowDelete" link type="danger" @click="deleteRow(row.rowId)"
                >删除</ElButton
              >
            </span>
          </div>
        </div>
      </div>
    </div>

    <ElPagination
      v-if="pagination && modelValue.length > normalizedPageSize"
      v-model:current-page="currentPage"
      class="daxiang-form-row-subtable__pagination"
      :page-size="normalizedPageSize"
      :total="modelValue.length"
      :layout="paginationLayout"
      :pager-count="device === 'mobile' ? 5 : 7"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue'
import DxSvgIcon from '../../infrastructure/FormIcon.vue'
import {
  cloneDesignerSubtableRow,
  createDesignerSubtableGridLayout,
  createDesignerSubtableRow,
} from '@daxiangme/form-core'
import type {
  DesignerDevice,
  DesignerRuntimeMode,
  DesignerSubtableColumn,
  DesignerSubtableRow,
} from '@daxiangme/form-core'

defineOptions({ name: 'DxFormRowSubtable' })

interface SubtableCellSlotProps {
  row: DesignerSubtableRow
  column: DesignerSubtableColumn
  rowIndex: number
  value: unknown
  update: (value: unknown) => void
}

interface SubtableDetailCellSlotProps {
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
    showIndex?: boolean
    pagination?: boolean
    pageSize?: number
    initialRows?: number
    defaultValues?: Readonly<Record<string, unknown>>
    /** 宿主策略允许行增删复制时为 true；无策略时由运行模式决定。 */
    rowWritable?: boolean
  }>(),
  {
    device: 'desktop',
    title: '',
    allowCreate: true,
    allowCopy: true,
    allowDelete: true,
    showIndex: true,
    pagination: false,
    pageSize: 10,
    initialRows: 0,
    defaultValues: () => ({}),
    rowWritable: true,
  },
)

defineSlots<{
  cell: (props: SubtableCellSlotProps) => unknown
  'detail-cell': (props: SubtableDetailCellSlotProps) => unknown
}>()

const emit = defineEmits<{ 'update:modelValue': [rows: DesignerSubtableRow[]] }>()
const currentPage = ref(1)
const initialized = ref(false)
const editable = computed(
  () => props.rowWritable && (props.mode === 'CREATE' || props.mode === 'EDIT'),
)
const canCreate = computed(() => editable.value && props.allowCreate)
const showActions = computed(() => editable.value && (props.allowCopy || props.allowDelete))
const normalizedPageSize = computed(() => normalizeInteger(props.pageSize, 1, 100, 10))
const normalizedInitialRows = computed(() => normalizeInteger(props.initialRows, 0, 20, 0))
const paginationLayout = computed(() =>
  props.device === 'mobile' ? 'prev, pager, next' : 'total, prev, pager, next',
)
const gridLayout = computed(() =>
  createDesignerSubtableGridLayout(props.columns, {
    showIndex: props.showIndex,
    showActions: showActions.value,
  }),
)
const visibleRows = computed(() => {
  if (!props.pagination) return props.modelValue
  const start = (currentPage.value - 1) * normalizedPageSize.value
  return props.modelValue.slice(start, start + normalizedPageSize.value)
})

watch(
  editable,
  (enabled) => {
    if (enabled) initializeRows()
  },
  { immediate: true },
)

watch([() => props.modelValue.length, normalizedPageSize], clampCurrentPage)

/** 首次进入可编辑会话时补足声明的初始行数，用户随后删除为空时不会被静默重建。 */
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

/** 追加空白行，并在分页开启时定位到最后一页。 */
function addRow(): void {
  if (!canCreate.value) return
  const rows = [...props.modelValue, createDesignerSubtableRow(props.columns, props.defaultValues)]
  emit('update:modelValue', rows)
  if (props.pagination)
    currentPage.value = Math.max(1, Math.ceil(rows.length / normalizedPageSize.value))
}

/** 深复制目标行，插入在源行之后并保留各字段值的引用隔离。 */
function copyRow(rowId: string): void {
  if (!editable.value || !props.allowCopy) return
  const index = props.modelValue.findIndex((row) => row.rowId === rowId)
  if (index < 0) return
  const rows = [...props.modelValue]
  rows.splice(index + 1, 0, cloneDesignerSubtableRow(rows[index]))
  emit('update:modelValue', rows)
  if (props.pagination) currentPage.value = Math.floor((index + 1) / normalizedPageSize.value) + 1
}

/** 按稳定行身份删除，避免分页下用可见索引误删其他行。 */
function deleteRow(rowId: string): void {
  if (!editable.value || !props.allowDelete) return
  emit(
    'update:modelValue',
    props.modelValue.filter((row) => row.rowId !== rowId),
  )
  nextTick(clampCurrentPage)
}

/** 以不可变方式更新单元格值，确保每一行的数据容器保持独立。 */
function updateCell(rowId: string, fieldId: string, value: unknown): void {
  if (!editable.value) return
  emit(
    'update:modelValue',
    props.modelValue.map((row) =>
      row.rowId === rowId ? { ...row, values: { ...row.values, [fieldId]: value } } : row,
    ),
  )
}

/** 将当前分页内的相对索引换算为完整集合索引。 */
function sourceIndex(localIndex: number): number {
  return props.pagination
    ? (currentPage.value - 1) * normalizedPageSize.value + localIndex
    : localIndex
}

/** 返回面向用户的一基序号。 */
function displayIndex(localIndex: number): number {
  return sourceIndex(localIndex) + 1
}

/** 删除或页大小变化后，将页码约束到仍存在的数据范围。 */
function clampCurrentPage(): void {
  const pageCount = Math.max(1, Math.ceil(props.modelValue.length / normalizedPageSize.value))
  currentPage.value = Math.min(currentPage.value, pageCount)
}

/** 无渲染插槽时提供保守的可读文本，不把对象直接输出为技术字符串。 */
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
.daxiang-form-row-subtable {
  width: 100%;
  min-width: 0;
}

.daxiang-form-row-subtable__header,
.daxiang-form-row-subtable__record-header {
  display: flex;
  min-height: 36px;
  align-items: center;
  justify-content: space-between;
}

.daxiang-form-row-subtable__heading {
  display: inline-flex;
  min-width: 0;
  align-items: baseline;
  gap: var(--daxiang-form-space-2);
}

.daxiang-form-row-subtable__heading span,
.daxiang-form-row-subtable__record-header {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.daxiang-form-row-subtable__scroll {
  width: 100%;
  min-width: 0;
  overflow-x: auto;
  border: 1px solid var(--el-border-color-lighter);
}

.daxiang-form-row-subtable__table {
  width: 100%;
}

.daxiang-form-row-subtable__grid {
  display: grid;
  width: 100%;
  min-width: 100%;
  align-items: stretch;
}

.daxiang-form-row-subtable__grid > * {
  display: flex;
  min-width: 0;
  min-height: 48px;
  align-items: center;
  padding: var(--daxiang-form-space-2) var(--daxiang-form-space-3);
  border-right: 1px solid var(--el-border-color-lighter);
}

.daxiang-form-row-subtable__grid > :last-child {
  border-right: 0;
}

.daxiang-form-row-subtable__table-head {
  min-height: 40px;
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color-light);
  font-size: 12px;
  font-weight: 600;
}

.daxiang-form-row-subtable__table-head > * {
  min-height: 40px;
}

.daxiang-form-row-subtable__table-row {
  border-top: 1px solid var(--el-border-color-lighter);
  background: var(--el-bg-color);
}

.daxiang-form-row-subtable__table-row > * {
  align-items: flex-start;
  min-height: 44px;
}

.daxiang-form-row-subtable__table-row:hover {
  background: var(--el-fill-color-extra-light);
}

.daxiang-form-row-subtable__index {
  justify-content: center;
  color: var(--el-text-color-secondary);
  font-variant-numeric: tabular-nums;
}

.daxiang-form-row-subtable__sticky-action {
  position: sticky;
  z-index: 1;
  right: 0;
  justify-content: center;
  background: inherit;
  border-left: 1px solid var(--el-border-color-lighter);
}

.daxiang-form-row-subtable__actions {
  display: inline-flex;
  white-space: nowrap;
}

.daxiang-form-row-subtable__pagination {
  max-width: 100%;
  justify-content: flex-end;
  margin-top: var(--daxiang-form-space-3);
  overflow: hidden;
}

.daxiang-form-row-subtable__records {
  border-top: 1px solid var(--el-border-color-lighter);
}

.daxiang-form-row-subtable__record {
  padding: var(--daxiang-form-space-3) 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.daxiang-form-row-subtable__record-field {
  display: grid;
  min-width: 0;
  align-items: start;
  padding-top: var(--daxiang-form-space-2);
  grid-template-columns: minmax(84px, 30%) minmax(0, 1fr);
  column-gap: var(--daxiang-form-space-3);
}

.daxiang-form-row-subtable__record-label {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 32px;
}

.daxiang-form-row-subtable__record-value {
  min-width: 0;
}

.daxiang-form-row-subtable__empty {
  min-height: 120px;
}

@media (width <= 640px) {
  .daxiang-form-row-subtable__pagination {
    justify-content: center;
  }
}
</style>
