<template>
  <ElCol v-if="relationNode" :span="grid.span" :offset="grid.offset">
    <section
      v-if="collectionPolicy.visible"
      class="daxiang-form-relation"
      :class="{ 'is-table': relationNode.componentType === 'row-subtable' }"
    >
      <header class="daxiang-form-relation__header">
        <strong>{{ title }}</strong>
        <div class="daxiang-form-relation__actions">
          <ElButton v-if="canCreate" size="small" :disabled="locked" @click="createRow"
            >新增</ElButton
          >
          <ElButton v-if="canLink" size="small" :disabled="locked" @click="openPicker"
            >关联已有记录</ElButton
          >
          <ElButton
            v-if="collection?.loadState === 'UNLOADED' || collection?.loadState === 'FAILED'"
            size="small"
            :disabled="locked"
            @click="load(false)"
            >{{ collection?.loadState === 'FAILED' ? '重试加载' : '加载数据' }}</ElButton
          >
        </div>
      </header>
      <ElAlert v-if="collection?.error" :title="collection.error" type="error" :closable="false" />
      <p v-if="collection?.loadState === 'LOADING'" class="daxiang-form-relation__status">
        正在加载…
      </p>
      <ElEmpty
        v-else-if="collection?.loadState === 'COMPLETE' && !collection.rows.length"
        description="暂无记录"
        :image-size="48"
      />
      <article
        v-for="(row, index) in visibleRows"
        :key="row.clientRowKey"
        class="daxiang-form-relation__row"
      >
        <header class="daxiang-form-relation__row-header">
          <span>第 {{ (page - 1) * pageSize + index + 1 }} 项</span>
          <div class="daxiang-form-relation__actions">
            <ElButton
              v-if="canEditRow(row)"
              size="small"
              text
              :disabled="locked"
              @click="editRow(row)"
              >弹层编辑</ElButton
            >
            <ElButton
              v-if="canCopy(row)"
              size="small"
              text
              :disabled="locked"
              @click="command({ type: 'COPY_ROW', rowKey: row.clientRowKey })"
              >复制</ElButton
            >
            <ElButton
              v-if="canRemove(row)"
              size="small"
              text
              type="danger"
              :disabled="locked"
              @click="removeRow(row)"
              >{{ row.target ? '解除关联' : '删除' }}</ElButton
            >
          </div>
        </header>
        <ElRow :gutter="document.appearance.gridGutter">
          <DesignerSessionNode
            v-for="child in inlineChildren"
            :key="child.id"
            :node="child"
            :session="session"
            :snapshot="snapshot"
            :row-key="row.clientRowKey"
            :device="device"
            @runtime-warning="emit('runtime-warning', $event)"
          />
        </ElRow>
        <details v-if="nestedChildren.length" class="daxiang-form-relation__nested">
          <summary>子项详情</summary>
          <ElRow :gutter="document.appearance.gridGutter">
            <DesignerSessionNode
              v-for="child in nestedChildren"
              :key="child.id"
              :node="child"
              :session="session"
              :snapshot="snapshot"
              :row-key="row.clientRowKey"
              :device="device"
              @runtime-warning="emit('runtime-warning', $event)"
            />
          </ElRow>
        </details>
      </article>
      <div class="daxiang-form-relation__footer">
        <ElPagination
          v-if="pagination && (collection?.rows.length ?? 0) > pageSize"
          v-model:current-page="page"
          :page-size="pageSize"
          :total="collection?.rows.length ?? 0"
          layout="prev, pager, next"
          small
        />
        <ElButton
          v-if="collection?.hasMore || collection?.loadState === 'PARTIAL'"
          :disabled="locked || collection?.loadState === 'LOADING'"
          size="small"
          @click="load(true)"
          >加载更多</ElButton
        >
      </div>
    </section>
    <ElDialog
      v-model="pickerOpen"
      class="daxiang-form"
      title="关联已有记录"
      width="min(640px, 92vw)"
      @closed="closePicker"
    >
      <ElInput
        v-model="keyword"
        clearable
        placeholder="搜索候选记录"
        aria-label="搜索候选记录"
        @keyup.enter="searchCandidates(false)"
      >
        <template #append
          ><ElButton :loading="candidateLoading" @click="searchCandidates(false)"
            >搜索</ElButton
          ></template
        >
      </ElInput>
      <ElAlert
        v-if="pickerError"
        :title="pickerError"
        type="error"
        :closable="false"
        class="daxiang-form-relation__picker-error"
      />
      <ElCheckboxGroup v-model="selectedKeys" class="daxiang-form-relation__candidates">
        <ElCheckbox
          v-for="candidate in candidates"
          :key="candidateKey(candidate)"
          :value="candidateKey(candidate)"
          :disabled="candidate.disabled || alreadyLinked(candidate)"
        >
          {{ candidate.label }}{{ alreadyLinked(candidate) ? '（已关联）' : '' }}
        </ElCheckbox>
      </ElCheckboxGroup>
      <ElEmpty
        v-if="!candidateLoading && !candidates.length && !pickerError"
        description="没有可选记录"
        :image-size="48"
      />
      <ElButton v-if="candidateCursor" :loading="candidateLoading" @click="searchCandidates(true)"
        >更多候选</ElButton
      >
      <template #footer>
        <span class="daxiang-form-relation__selection-count"
          >已选择 {{ selectedKeys.length }} 项</span
        >
        <ElButton @click="pickerOpen = false">取消</ElButton>
        <ElButton
          type="primary"
          :loading="linking"
          :disabled="!selectedKeys.length || locked"
          @click="confirmSelection"
          >确认关联</ElButton
        >
      </template>
    </ElDialog>
  </ElCol>
  <ElCol v-else-if="layoutContainer" :span="grid.span" :offset="grid.offset">
    <section
      class="daxiang-form-session-container"
      :class="containerClasses"
      :style="containerStyle"
    >
      <strong v-if="title" class="daxiang-form-session-container__title">{{ title }}</strong>
      <ElTabs v-if="layoutContainer.componentType === 'tabs'" v-model="activeTab">
        <ElTabPane
          v-for="slot in layoutContainer.slots"
          :key="slot.id"
          :name="slot.slotCode"
          :label="slot.label"
        >
          <ElRow :gutter="document.appearance.gridGutter">
            <DesignerSessionNode
              v-for="child in slot.children"
              :key="child.id"
              :node="child"
              :session="session"
              :snapshot="snapshot"
              :row-key="rowKey"
              :device="device"
              @runtime-warning="emit('runtime-warning', $event)"
            />
          </ElRow>
        </ElTabPane>
      </ElTabs>
      <template v-else>
        <ElRow
          v-for="slot in layoutContainer.slots"
          :key="slot.id"
          :gutter="document.appearance.gridGutter"
        >
          <DesignerSessionNode
            v-for="child in slot.children"
            :key="child.id"
            :node="child"
            :session="session"
            :snapshot="snapshot"
            :row-key="rowKey"
            :device="device"
            @runtime-warning="emit('runtime-warning', $event)"
          />
        </ElRow>
      </template>
    </section>
  </ElCol>
  <DesignerRuntimeNode
    v-else
    :node="node"
    :fields="fields"
    :value-store="projectedValue"
    :mode="displayMode"
    :device="device"
    :gutter="document.appearance.gridGutter"
    :appearance="document.appearance"
    :field-states="fieldStates"
    :field-feedbacks="fieldFeedbacks"
    :feedback-scope="rowKey"
    :adapters="session.adapters"
    :adapter-context="{ ...session.adapterContext, rowKey }"
    :readonly-display-mode="document.appearance.readonlyDisplayMode"
    @update-field-value="writeField"
    @component-event="componentEvent"
    @runtime-warning="emit('runtime-warning', $event)"
  />
</template>

<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  createDesignerFieldFeedbackKey,
  createDesignerRuntimeFeedbackKey,
  createDesignerTargetKey,
  designerContainerAppearanceClasses,
  designerContainerRadiusStyle,
  resolveDesignerContainerAppearance,
} from '@daxiangme/form-core'
import type {
  DesignerComponentEvent,
  DesignerDevice,
  DesignerLayoutNode,
  DesignerRelationCandidate,
  DesignerRuntimeCommand,
  DesignerRuntimeRow,
  DesignerRuntimeSession,
  DesignerRuntimeSnapshot,
} from '@daxiangme/form-core'
import DesignerRuntimeNode from './DesignerRuntimeNode.vue'
import { sessionSubmitKey } from './session-rendering-context'

defineOptions({ name: 'DesignerSessionNode' })
const props = defineProps<{
  /** 当前设计节点。 */
  node: DesignerLayoutNode
  /** 唯一运行会话或隔离草稿。 */
  session: DesignerRuntimeSession
  /** 当前观察快照，仅用其修订触发重新投影。 */
  snapshot: DesignerRuntimeSnapshot
  /** 当前行稳定身份，根字段也使用根行身份。 */
  rowKey: string
  /** 呈现设备。 */
  device: DesignerDevice
}>()
const emit = defineEmits<{ 'runtime-warning': [message: string] }>()
const submitSession = inject(sessionSubmitKey)
const document = computed(() => props.session.document)
const grid = computed(() => props.node.layout[props.device === 'mobile' ? 'mobile' : 'pc'])
const relationNode = computed(() =>
  props.node.nodeType === 'CONTAINER' &&
  ['row-subtable', 'block-subtable'].includes(props.node.componentType)
    ? props.node
    : undefined,
)
const layoutContainer = computed(() =>
  props.node.nodeType === 'CONTAINER' && props.node.slots.length && !relationNode.value
    ? props.node
    : undefined,
)
const title = computed(() =>
  props.node.nodeType === 'CONTAINER' && typeof props.node.configuration.title === 'string'
    ? props.node.configuration.title
    : '',
)
const scope = computed(() => {
  void props.snapshot.revision
  return relationNode.value
    ? props.session.scopeFor(relationNode.value.id, props.rowKey)
    : undefined
})
const collection = computed(() => {
  void props.snapshot.revision
  return scope.value ? props.session.readCollection(scope.value) : undefined
})
const collectionPolicy = computed(() => {
  void props.snapshot.revision
  return scope.value
    ? props.session.readPolicy(scope.value)
    : { visible: false, editable: false, operations: {} }
})
const relation = computed(() =>
  document.value.dataSchema.relations.find(
    (item) => item.code === relationNode.value?.configuration.relationCode,
  ),
)
const locked = computed(
  () => props.snapshot.status !== 'READY' || ['READ_ONLY', 'DETAIL'].includes(props.session.mode),
)
const displayMode = computed(() =>
  props.snapshot.status === 'READY' ? props.session.mode : 'READ_ONLY',
)
const row = computed(() => {
  void props.snapshot.revision
  return props.session.readRow(props.rowKey)
})
const fields = computed(() => document.value.dataSchema.fields)
const projectedValue = computed(() => ({ fields: row.value?.values ?? {}, collections: {} }))
const fieldStates = computed(() => {
  void props.snapshot.revision
  return Object.fromEntries(
    fields.value.map((field) => [field.id, props.session.readFieldState(props.rowKey, field.id)]),
  )
})
const fieldFeedbacks = computed(() =>
  Object.fromEntries(
    fields.value.map((field) => [
      createDesignerFieldFeedbackKey(field.id, { viewCode: props.rowKey }),
      props.snapshot.feedbacks[createDesignerRuntimeFeedbackKey(props.rowKey, field.id)] ?? {},
    ]),
  ),
)
const containerAppearance = computed(() =>
  layoutContainer.value
    ? resolveDesignerContainerAppearance(document.value.appearance, layoutContainer.value)
    : undefined,
)
const containerClasses = computed(() =>
  designerContainerAppearanceClasses(containerAppearance.value),
)
const containerStyle = computed(() =>
  containerAppearance.value
    ? designerContainerRadiusStyle(containerAppearance.value.radius)
    : undefined,
)
const activeTab = ref(layoutContainer.value?.slots[0]?.slotCode ?? '')
const children = computed(() => relationNode.value?.slots.flatMap((slot) => slot.children) ?? [])
const inlineChildren = computed(() =>
  relationNode.value?.componentType === 'row-subtable'
    ? children.value.filter((node) => node.nodeType === 'FIELD')
    : children.value,
)
const nestedChildren = computed(() =>
  relationNode.value?.componentType === 'row-subtable'
    ? children.value.filter((node) => node.nodeType !== 'FIELD')
    : [],
)
const page = ref(1)
const pagination = computed(() => relationNode.value?.configuration.pagination === true)
const pageSize = computed(() =>
  Math.max(1, Number(relationNode.value?.configuration.pageSize) || 10),
)
const visibleRows = computed(() =>
  pagination.value
    ? (collection.value?.rows.slice(
        (page.value - 1) * pageSize.value,
        page.value * pageSize.value,
      ) ?? [])
    : (collection.value?.rows ?? []),
)
watch(
  () => collection.value?.rows.length,
  (count) => {
    page.value = Math.min(page.value, Math.max(1, Math.ceil((count ?? 0) / pageSize.value)))
  },
)
const canCreate = computed(
  () =>
    relation.value?.kind !== 'MANY_TO_MANY' &&
    collectionPolicy.value.editable &&
    collectionPolicy.value.operations.CREATE === true &&
    relationNode.value?.configuration.allowCreate !== false,
)
const canLink = computed(
  () =>
    relation.value?.kind === 'MANY_TO_MANY' &&
    collectionPolicy.value.editable &&
    collectionPolicy.value.operations.LINK === true &&
    relationNode.value?.configuration.allowCreate !== false,
)
function policyFor(item: DesignerRuntimeRow) {
  return props.session.readPolicy(scope.value!, item.clientRowKey)
}
function canEditRow(item: DesignerRuntimeRow) {
  const policy = policyFor(item)
  return policy.editable && (policy.operations.UPDATE === true || policy.targetEditable === true)
}
function canCopy(item: DesignerRuntimeRow) {
  return (
    relationNode.value?.configuration.allowCopy !== false &&
    !item.target &&
    canCreate.value &&
    policyFor(item).visible
  )
}
function canRemove(item: DesignerRuntimeRow) {
  return (
    relationNode.value?.configuration.allowDelete !== false &&
    policyFor(item).operations[item.target ? 'UNLINK' : 'DELETE'] === true
  )
}
async function command(value: DesignerRuntimeCommand) {
  const session = props.session
  const result = await session.dispatch(value)
  if (lifetime.signal.aborted || props.session !== session) return { ok: false, issues: [] }
  if (!result.ok) emit('runtime-warning', result.issues[0]?.message ?? '当前操作未完成')
  else if (result.submissionRequested) await submitSession?.()
  return result
}
function createRow() {
  if (scope.value) void command({ type: 'CREATE_ROW', scope: scope.value })
}
function removeRow(item: DesignerRuntimeRow) {
  void command({ type: item.target ? 'UNLINK' : 'DELETE_ROW', rowKey: item.clientRowKey })
}
function editRow(item: DesignerRuntimeRow) {
  void command({ type: 'BEGIN_DRAFT', rowKey: item.clientRowKey })
}
function load(more: boolean) {
  if (scope.value)
    void command({ type: 'LOAD_COLLECTION', scope: scope.value, more, signal: lifetime.signal })
}
const lifetime = new AbortController()
onMounted(() => {
  if (
    scope.value &&
    props.session.adapters.relationSelection &&
    relation.value?.kind === 'MANY_TO_MANY' &&
    collection.value?.rows.length
  )
    void command({ type: 'RESOLVE_REFERENCES', scope: scope.value, signal: lifetime.signal })
})
let pendingWrite: Promise<unknown> = Promise.resolve()
function writeField(fieldId: string, value: unknown) {
  pendingWrite = command({ type: 'SET_FIELD', rowKey: props.rowKey, fieldId, value }).then(
    async (result) => {
      if (result.ok)
        await command({
          type: 'EVENT',
          nodeId: props.node.id,
          event: 'CHANGE',
          rowKey: props.rowKey,
        })
    },
  )
}
async function componentEvent(nodeId: string, event: DesignerComponentEvent) {
  if (event === 'CHANGE') return
  await pendingWrite
  await command({ type: 'EVENT', nodeId, event, rowKey: props.rowKey })
}

const pickerOpen = ref(false)
const keyword = ref('')
const candidates = ref<DesignerRelationCandidate[]>([])
const selectedKeys = ref<string[]>([])
const candidateCache = new Map<string, DesignerRelationCandidate>()
const candidateCursor = ref<string>()
const candidateLoading = ref(false)
const linking = ref(false)
const pickerError = ref('')
let queryController: AbortController | undefined
let queryGeneration = 0
function candidateKey(candidate: DesignerRelationCandidate) {
  return createDesignerTargetKey(candidate.entityId, candidate.identity)
}
function alreadyLinked(candidate: DesignerRelationCandidate) {
  return (
    collection.value?.rows.some(
      (item) =>
        item.target?.entityId === candidate.entityId && item.target.identity === candidate.identity,
    ) ?? false
  )
}
function openPicker() {
  pickerOpen.value = true
  selectedKeys.value = []
  keyword.value = ''
  candidateCache.clear()
  void searchCandidates(false)
}
function closePicker() {
  queryController?.abort()
  queryGeneration += 1
  candidateLoading.value = false
  candidateCache.clear()
  candidates.value = []
  selectedKeys.value = []
  candidateCursor.value = undefined
}
async function searchCandidates(more: boolean) {
  if (!scope.value) return
  queryController?.abort()
  const controller = new AbortController()
  queryController = controller
  const generation = ++queryGeneration
  candidateLoading.value = true
  pickerError.value = ''
  try {
    const result = await props.session.queryCandidates(
      scope.value,
      keyword.value.trim(),
      more ? candidateCursor.value : undefined,
      controller.signal,
    )
    if (controller.signal.aborted || generation !== queryGeneration) return
    for (const candidate of result.items) candidateCache.set(candidateKey(candidate), candidate)
    candidates.value = more
      ? [
          ...new Map(
            [...candidates.value, ...result.items].map((item) => [candidateKey(item), item]),
          ).values(),
        ]
      : result.items
    candidateCursor.value = result.cursor
  } catch {
    if (!controller.signal.aborted && generation === queryGeneration)
      pickerError.value = '候选加载失败，请重试'
  } finally {
    if (generation === queryGeneration) candidateLoading.value = false
  }
}
async function confirmSelection() {
  if (!scope.value || linking.value) return
  linking.value = true
  try {
    const selected = selectedKeys.value.flatMap((key) => {
      const item = candidateCache.get(key)
      return item ? [item] : []
    })
    if (selected.length !== selectedKeys.value.length) {
      pickerError.value = '部分选择已失效，请重新选择'
      return
    }
    const result = await command({
      type: 'LINK',
      scope: scope.value,
      candidates: selected,
      signal: lifetime.signal,
    })
    if (result.ok) pickerOpen.value = false
    else pickerError.value = result.issues[0]?.message ?? '关联未完成，请重新选择'
  } finally {
    linking.value = false
  }
}
onBeforeUnmount(() => {
  lifetime.abort()
  closePicker()
})
</script>

<style scoped>
.daxiang-form .daxiang-form-relation {
  padding: var(--daxiang-form-space-3, 12px);
  margin-bottom: 16px;
  border: 1px solid var(--el-border-color);
  border-radius: var(--el-border-radius-base);
  background: var(--el-bg-color);
}

.daxiang-form .daxiang-form-relation__header,
.daxiang-form .daxiang-form-relation__row-header,
.daxiang-form .daxiang-form-relation__footer {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
}

.daxiang-form .daxiang-form-relation__header {
  margin-bottom: 12px;
}

.daxiang-form .daxiang-form-relation__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.daxiang-form .daxiang-form-relation__row {
  padding: 12px;
  margin-block: 8px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--el-border-radius-base);
}

.daxiang-form .daxiang-form-relation__row-header {
  margin-bottom: 12px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.daxiang-form .daxiang-form-relation__nested {
  margin-top: 8px;
}

.daxiang-form .daxiang-form-relation__nested > summary {
  padding: 8px 0;
  color: var(--el-color-primary);
  cursor: pointer;
}

.daxiang-form .daxiang-form-relation__status,
.daxiang-form .daxiang-form-relation__selection-count {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.daxiang-form .daxiang-form-relation__selection-count {
  margin-right: 12px;
}

.daxiang-form .daxiang-form-relation__candidates {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding-block: 12px;
}

.daxiang-form .daxiang-form-relation__picker-error {
  margin-top: 12px;
}

.daxiang-form-session-container {
  margin-bottom: 12px;
}

.daxiang-form-session-container__title {
  display: block;
  margin-bottom: 12px;
}
</style>
