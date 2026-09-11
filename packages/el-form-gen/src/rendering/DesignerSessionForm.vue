<template>
  <div
    class="daxiang-form daxiang-form-session"
    :class="[{ 'is-mobile': device === 'mobile', 'is-embedded': embedded }, controlRadius.class]"
    :style="controlRadius.style"
  >
    <header v-if="showToolbarChrome" class="daxiang-form-session__toolbar">
      <div>
        <strong>{{ session.document.name }}</strong>
        <ElTag
          :type="snapshot.status === 'UNKNOWN' ? 'warning' : snapshot.dirty ? 'info' : 'success'"
          >{{ statusText }}</ElTag
        >
        <ElButton
          v-if="snapshot.status === 'UNKNOWN'"
          size="small"
          :loading="resolving"
          @click="resolveSubmission"
          >核对</ElButton
        >
        <ElButton v-if="persistentIssues.length" size="small" @click="issuesDialogOpen = true"
          >查看问题</ElButton
        >
      </div>
      <ElSegmented
        v-if="legacy"
        :model-value="session.mode"
        :options="modeOptions"
        :disabled="locked"
        @update:model-value="changeMode"
      />
    </header>
    <template v-if="!overlayOnly">
      <div
        v-if="showActions('TOP')"
        class="daxiang-form-session__actions is-pinned-top"
        :class="actionBarAlignClass"
      >
        <ElButton
          v-for="button in actionButtons"
          :key="button.action"
          :type="button.action === 'SUBMIT' ? 'primary' : 'default'"
          :disabled="locked"
          :loading="button.action === 'SUBMIT' && snapshot.status === 'PREPARING'"
          @click="runAction(button.action)"
          >{{ button.label }}</ElButton
        >
      </div>
      <div class="daxiang-form-session__body">
        <ElForm
          :label-position="labelPosition"
          :label-width="session.document.appearance.labelWidth"
          :label-suffix="session.document.appearance.labelSuffix"
          :size="elementSize"
        >
          <DesignerGridFlowRow
            :nodes="occupyingRootNodes"
            :device="device"
            :gutter="session.document.appearance.gridGutter"
            :row-gap="session.document.appearance.rowGap"
          >
            <template #default="{ node }">
              <DesignerSessionNode
                :key="`${snapshot.sessionId}:${node.id}`"
                :node="node"
                :session="session"
                :snapshot="snapshot"
                :row-key="renderedRowKey"
                :device="device"
                @runtime-warning="warn"
              />
            </template>
          </DesignerGridFlowRow>
          <ElEmpty v-if="!renderedNodes.length" description="当前表单没有内容" />
        </ElForm>
      </div>
      <div
        v-if="showBottomActions"
        class="daxiang-form-session__actions is-pinned-bottom"
        :class="actionBarAlignClass"
      >
        <ElButton
          v-if="!session.document.actionBar.visible && writableMode"
          type="primary"
          :disabled="locked"
          @click="submit"
          >保存</ElButton
        >
        <ElButton
          v-for="button in showActions('BOTTOM') ? actionButtons : []"
          :key="button.action"
          :type="button.action === 'SUBMIT' ? 'primary' : 'default'"
          :disabled="locked"
          @click="runAction(button.action)"
          >{{ button.label }}</ElButton
        >
        <ElButton
          v-if="showResidualResolve"
          type="primary"
          :loading="resolving"
          @click="resolveSubmission"
          >核对保存结果</ElButton
        >
        <ElButton v-if="showResidualIssues" @click="issuesDialogOpen = true">查看问题</ElButton>
      </div>
    </template>
    <component
      :is="draftModule?.kind === 'DRAWER' ? ElDrawer : FormModalShell"
      :model-value="Boolean(draftSession)"
      class="daxiang-form"
      :title="draftModule?.name ?? '编辑当前行'"
      :width="draftModule?.width ?? 800"
      :size="draftModule?.width ?? 800"
      :radius="overlayDialogRadius"
      :max-height="resolveDesignerOverlayMaxHeight(draftModule?.maxHeightPreset ?? 'VIEWPORT')"
      destroy-on-close
      :close-on-click-modal="false"
      :close-on-press-escape="!locked && !draftBusy"
      :show-close="!locked && !draftBusy"
      @update:model-value="closeDraft"
    >
      <DesignerSessionForm
        v-if="draftSession && snapshot.activeDraft"
        :session="draftSession"
        :device="device"
        :nodes="draftNodes"
        :row-key="snapshot.activeDraft.rowKey"
        embedded
        @runtime-warning="warn"
      />
      <template #footer>
        <ElButton :disabled="locked || draftBusy" @click="cancelDraft">取消</ElButton>
        <ElButton
          type="primary"
          :disabled="locked || !writableMode"
          :loading="draftBusy"
          @click="confirmDraft"
          >确认</ElButton
        >
      </template>
    </component>
    <FormModalShell
      v-model="issuesDialogOpen"
      title="查看问题"
      :show-confirm="false"
      cancel-text="关闭"
    >
      <div class="daxiang-form-session__issue-list">
        <p v-for="(issue, index) in persistentIssues" :key="`${issue.code}-${index}`">
          <span>{{ issue.message }}</span>
          <ElButton
            v-if="issue.rowKey && issue.fieldId"
            size="small"
            text
            :disabled="locked"
            @click="revertField(issue.rowKey, issue.fieldId)"
            >还原该字段</ElButton
          >
        </p>
      </div>
    </FormModalShell>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, provide, ref, shallowRef, watch } from 'vue'
import { ElDrawer, ElMessage, ElMessageBox } from 'element-plus'
import { resolveDesignerOverlayMaxHeight } from '@daxiangme/form-core'
import type {
  DesignerActionBarButton,
  DesignerDevice,
  DesignerLayoutNode,
  DesignerRuntimeSession,
  DesignerRuntimeSnapshot,
  DesignerSubmissionBatch,
  DesignerSubmissionProjection,
} from '@daxiangme/form-core'
import { designerControlRadiusBind } from '../designer-radius-style'
import DesignerGridFlowRow from './DesignerGridFlowRow.vue'
import DesignerSessionNode from './DesignerSessionNode.vue'
import { designerLayoutNodeOccupiesRuntimeGrid } from './runtime-grid'
import { sessionSubmitKey } from './session-rendering-context'
import FormModalShell from '../infrastructure/FormModalShell.vue'

defineOptions({ name: 'DesignerSessionForm' })
const props = withDefaults(
  defineProps<{
    /** 宿主拥有的唯一运行会话。 */
    session: DesignerRuntimeSession
    /** 呈现设备，切换不会重新初始化数据。 */
    device?: DesignerDevice
    /** 当前打开的模块编码。 */
    activeModule?: string
    /** 是否只显示模块。 */
    overlayOnly?: boolean
    /** 显示工具栏与保存状态。 */
    showToolbar?: boolean
    /** 内部草稿使用的显式布局。 */
    nodes?: DesignerLayoutNode[]
    /** 内部草稿绑定行。 */
    rowKey?: string
    /** 内部草稿不重复渲染主表动作栏。 */
    embedded?: boolean
    /** 内部旧一级桥使用原快照提交及重置事件。 */
    legacy?: boolean
  }>(),
  { device: 'desktop', activeModule: '', overlayOnly: false, showToolbar: false, embedded: false },
)
const emit = defineEmits<{
  submission: [batch: DesignerSubmissionBatch]
  'runtime-warning': [message: string]
  'overlay-closed': []
  'overlay-open-failed': [message: string]
  'legacy-submit': [projection: DesignerSubmissionProjection]
  'legacy-reset': []
  action: [action: DesignerActionBarButton['action']]
}>()
const snapshot = shallowRef(props.session.getSnapshot())
const resolving = ref(false)
const draftBusy = ref(false)
const issuesDialogOpen = ref(false)
const promptedUnknownKey = ref('')
const toastedMessages = new Set<string>()
const toastedIssueKeys = new Set<string>()
let unsubscribe: (() => void) | undefined
const emittedBatches = new Set<string>()
watch(
  () => props.session,
  (session) => {
    unsubscribe?.()
    snapshot.value = session.getSnapshot()
    promptedUnknownKey.value = ''
    toastedMessages.clear()
    toastedIssueKeys.clear()
    issuesDialogOpen.value = false
    if (snapshot.value.pendingSubmission)
      emittedBatches.add(snapshot.value.pendingSubmission.submissionId)
    unsubscribe = session.subscribe((next: DesignerRuntimeSnapshot) => {
      snapshot.value = next
      const batch = next.pendingSubmission
      if (next.status === 'SUBMITTING' && batch && !emittedBatches.has(batch.submissionId)) {
        emittedBatches.add(batch.submissionId)
        emit('submission', batch)
      }
    })
  },
  { immediate: true },
)
onBeforeUnmount(() => unsubscribe?.())
const locked = computed(() => snapshot.value.status !== 'READY')
const writableMode = computed(() => {
  void snapshot.value.revision
  return props.session.mode === 'CREATE' || props.session.mode === 'EDIT'
})
const renderedNodes = computed(() => props.nodes ?? props.session.document.uiSchema.root)
const renderedRowKey = computed(() => props.rowKey ?? snapshot.value.value.root.clientRowKey)
const occupyingRootNodes = computed(() => {
  void snapshot.value.revision
  const rowKey = renderedRowKey.value
  const fields = props.session.document.dataSchema.fields
  const fieldStates = Object.fromEntries(
    fields.map((field) => [field.id, props.session.readFieldState(rowKey, field.id)]),
  )
  const nodes = renderedNodes.value
  const nodeStates = Object.fromEntries(
    nodes.map((node) => [node.id, props.session.readNodeState(rowKey, node.id)]),
  )
  return nodes.filter((node) =>
    designerLayoutNodeOccupiesRuntimeGrid(node, {
      mode: snapshot.value.status === 'READY' ? props.session.mode : 'READ_ONLY',
      fields,
      fieldStates,
      nodeStates,
    }),
  )
})
const controlRadius = computed(() =>
  designerControlRadiusBind(props.session.document.appearance.controlRadius),
)
const labelPosition = computed(
  () => props.session.document.appearance.labelPosition.toLowerCase() as 'top' | 'left' | 'right',
)
const elementSize = computed(() =>
  props.session.document.appearance.size === 'SMALL'
    ? 'small'
    : props.session.document.appearance.size === 'LARGE'
      ? 'large'
      : 'default',
)
const actionButtons = computed(() =>
  props.session.document.actionBar.buttons.filter((button) => button.enabled),
)
const actionBarAlignClass = computed(
  () => `is-align-${props.session.document.actionBar.align.toLowerCase()}`,
)
const modeOptions = [
  { label: '新增', value: 'CREATE' },
  { label: '编辑', value: 'EDIT' },
  { label: '只读', value: 'READ_ONLY' },
  { label: '详情', value: 'DETAIL' },
]
const statusText = computed(
  () =>
    ({
      READY: snapshot.value.dirty ? '有未保存修改' : '已与保存基线一致',
      PREPARING: '正在校验',
      SUBMITTING: '正在保存',
      UNKNOWN: '结果待核对',
      DISPOSED: '会话已结束',
    })[snapshot.value.status],
)
function changeMode(value: string | number | boolean) {
  if (value === 'CREATE' || value === 'EDIT' || value === 'READ_ONLY' || value === 'DETAIL')
    props.session.updateRuntimePolicy({ mode: value })
}
const showToolbarChrome = computed(() => props.showToolbar && !props.embedded)
const persistentIssues = computed(() =>
  snapshot.value.issues.filter(
    (issue) => issue.code !== 'VALIDATION_FAILED' && issue.code !== 'SUBMISSION_UNKNOWN',
  ),
)
const showResidualResolve = computed(
  () => !showToolbarChrome.value && snapshot.value.status === 'UNKNOWN',
)
const showResidualIssues = computed(
  () => !showToolbarChrome.value && persistentIssues.value.length > 0,
)
const showBottomActions = computed(
  () =>
    showActions('BOTTOM') ||
    (showToolbarChrome.value &&
      !props.session.document.actionBar.visible &&
      !props.embedded &&
      writableMode.value) ||
    showResidualResolve.value ||
    showResidualIssues.value,
)
function issueKey(issue: { code: string; message: string; rowKey?: string; fieldId?: string }) {
  return `${issue.code}:${issue.rowKey ?? ''}:${issue.fieldId ?? ''}:${issue.message}`
}
function warn(message: string) {
  if (message && !toastedMessages.has(message)) {
    toastedMessages.add(message)
    ElMessage.warning(message)
  }
  emit('runtime-warning', message)
}
function toastSnapshotIssue() {
  const issue = snapshot.value.issues[0]
  if (issue) warn(issue.message)
}

async function revertField(rowKey: string, fieldId: string) {
  const result = await props.session.dispatch({ type: 'REVERT_FIELD', rowKey, fieldId })
  if (!result.ok) warn(result.issues[0]?.message ?? '当前字段无法还原')
}
function showActions(position: 'TOP' | 'BOTTOM') {
  const bar = props.session.document.actionBar
  return (
    !props.embedded &&
    writableMode.value &&
    bar.visible &&
    (bar.position === position || bar.position === 'BOTH')
  )
}
async function promptUnknownResolution() {
  try {
    await ElMessageBox.confirm('保存结果尚未确认，请核对原提交结果', '结果待核对', {
      type: 'warning',
      confirmButtonText: '核对保存结果',
      cancelButtonText: '取消',
      closeOnClickModal: false,
    })
    await resolveSubmission()
  } catch {
    /* 用户取消后仍可从工具栏或动作栏再次核对 */
  }
}
async function submit() {
  try {
    if (props.legacy) {
      const projection = await props.session.projectLegacySubmission()
      if (projection) {
        emit('legacy-submit', projection)
        await props.session.dispatch({ type: 'FORM_EVENT', event: 'AFTER_SUBMIT' })
      } else toastSnapshotIssue()
    } else {
      const batch = await props.session.prepareSubmission()
      if (!batch) toastSnapshotIssue()
    }
  } catch {
    warn('提交准备失败，请检查表单诊断')
  }
}
provide(sessionSubmitKey, submit)
function runAction(action: DesignerActionBarButton['action']) {
  emit('action', action)
  if (action === 'SUBMIT') void submit()
  else if (action === 'RESET') {
    if (props.legacy) emit('legacy-reset')
    else {
      const result = props.session.reset()
      if (!result.ok) warn(result.issues[0]?.message ?? '当前不能重置')
    }
  } else window.print()
}
async function resolveSubmission() {
  resolving.value = true
  try {
    const result = await props.session.dispatch({ type: 'RESOLVE_SUBMISSION' })
    if (!result.ok) warn(result.issues[0]?.message ?? '暂时无法确认保存结果')
  } finally {
    resolving.value = false
  }
}
watch(
  () => {
    if (props.embedded || snapshot.value.status !== 'UNKNOWN') return ''
    return snapshot.value.pendingSubmission?.submissionId || snapshot.value.sessionId
  },
  (key) => {
    if (!key || promptedUnknownKey.value === key) return
    promptedUnknownKey.value = key
    void promptUnknownResolution()
  },
  { immediate: true },
)
watch(
  persistentIssues,
  (issues) => {
    if (!issues.length) {
      toastedIssueKeys.clear()
      toastedMessages.clear()
      issuesDialogOpen.value = false
      return
    }
    const current = new Set(issues.map((issue) => issueKey(issue)))
    for (const key of [...toastedIssueKeys]) if (!current.has(key)) toastedIssueKeys.delete(key)
    for (const issue of issues) {
      const key = issueKey(issue)
      if (toastedIssueKeys.has(key)) continue
      toastedIssueKeys.add(key)
      if (issue.message && !toastedMessages.has(issue.message)) warn(issue.message)
    }
  },
  { immediate: true },
)
const draftSession = computed(() =>
  snapshot.value.activeDraft
    ? props.session.getDraft(snapshot.value.activeDraft.draftId)
    : undefined,
)
const draftModule = computed(() =>
  props.session.document.uiSchema.overlays.find(
    (module) => module.code === snapshot.value.activeDraft?.moduleCode,
  ),
)
const overlayDialogRadius = computed(() => {
  const radius = draftModule.value?.radius
  if (radius === undefined || radius === 'THEME') {
    return props.session.document.appearance.controlRadius
  }
  return radius
})
const draftNodes = computed(() => {
  if (draftModule.value) return draftModule.value.root
  const key = snapshot.value.activeDraft?.rowKey
  const collection = Object.values(snapshot.value.value.collections).find((item) =>
    item.rows.some((row) => row.clientRowKey === key),
  )
  if (!collection) return props.session.document.uiSchema.root
  const find = (nodes: DesignerLayoutNode[]): DesignerLayoutNode[] | undefined => {
    for (const node of nodes) {
      if (node.nodeType !== 'CONTAINER') continue
      if (node.id === collection.scope.containerId)
        return node.slots.flatMap((slot) => slot.children)
      for (const slot of node.slots) {
        const found = find(slot.children)
        if (found) return found
      }
    }
    return undefined
  }
  return find(props.session.document.uiSchema.root) ?? []
})
async function cancelDraft() {
  if (!snapshot.value.activeDraft || draftBusy.value) return
  const result = await props.session.dispatch({
    type: 'CANCEL_DRAFT',
    draftId: snapshot.value.activeDraft.draftId,
  })
  if (result.ok) emit('overlay-closed')
  else warn(result.issues[0]?.message ?? '当前不能关闭草稿')
}
async function confirmDraft() {
  if (!snapshot.value.activeDraft || draftBusy.value) return
  draftBusy.value = true
  try {
    const result = await props.session.dispatch({
      type: 'CONFIRM_DRAFT',
      draftId: snapshot.value.activeDraft.draftId,
    })
    if (result.ok) emit('overlay-closed')
    else warn(result.issues[0]?.message ?? '草稿尚未通过校验')
  } finally {
    draftBusy.value = false
  }
}
function closeDraft(open: boolean) {
  if (!open) void cancelDraft()
}
watch(
  [() => props.session, () => props.activeModule],
  async ([session, moduleCode], _, onCleanup) => {
    if (!moduleCode || props.embedded) return
    let active = true
    onCleanup(() => {
      active = false
    })
    const result = await session.dispatch({
      type: 'BEGIN_DRAFT',
      rowKey: renderedRowKey.value,
      moduleCode,
    })
    if (!active) return
    if (!result.ok) {
      const message = result.issues[0]?.message ?? '当前模块无法打开'
      warn(message)
      if (props.overlayOnly) emit('overlay-open-failed', message)
    }
  },
  { immediate: true },
)
</script>

<style scoped>
.daxiang-form.daxiang-form-session {
  box-sizing: border-box;
  display: flex;
  width: 100%;
  min-height: 0;
  height: 100%;
  margin: 0;
  padding: 16px;
  overflow: hidden;
  color: var(--el-text-color-primary);
  background: var(--el-bg-color);
  flex-direction: column;
}

.daxiang-form.daxiang-form-session.is-mobile:not(.is-embedded) {
  max-width: 390px;
  margin-inline: auto;
}

.daxiang-form.daxiang-form-session.is-embedded {
  display: block;
  height: auto;
  max-height: none;
  padding: 0;
  margin: 0;
  overflow: visible;
}

.daxiang-form .daxiang-form-session__toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 16px;
  flex: 0 0 auto;
}

.daxiang-form .daxiang-form-session__toolbar > div {
  display: flex;
  gap: 12px;
  align-items: center;
}

.daxiang-form .daxiang-form-session__body {
  min-height: 0;
  flex: 1 1 auto;
  overflow: auto;
}

.daxiang-form.daxiang-form-session.is-embedded .daxiang-form-session__body {
  overflow: visible;
}

.daxiang-form .daxiang-form-session__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  flex: 0 0 auto;
}

.daxiang-form .daxiang-form-session__actions.is-pinned-top {
  padding-bottom: 12px;
}

.daxiang-form .daxiang-form-session__actions.is-pinned-bottom {
  padding-top: 12px;
  border-top: 1px solid var(--el-border-color-lighter);
  background: var(--el-bg-color);
}

.daxiang-form .daxiang-form-session__actions.is-align-left {
  justify-content: flex-start;
}

.daxiang-form .daxiang-form-session__actions.is-align-center {
  justify-content: center;
}

.daxiang-form .daxiang-form-session__actions.is-align-right {
  justify-content: flex-end;
}

.daxiang-form-session__issue-list p {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-block: 8px;
}
</style>
