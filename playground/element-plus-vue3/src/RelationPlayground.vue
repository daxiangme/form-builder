<template>
  <section class="daxiang-form relation-playground">
    <header class="relation-playground__header">
      <div>
        <p class="relation-playground__eyebrow">关系表单 · 公开虚拟数据</p>
        <h1>两个项目，一份协作计划</h1>
        <p>展开项目、任务和步骤，分别编辑不同父行的数据。两个项目已关联同一位成员。</p>
      </div>
      <ElButton :disabled="busy" @click="restart">重新载入演示</ElButton>
    </header>

    <div class="relation-playground__controls">
      <label>
        <span>权限场景</span>
        <ElSelect v-model="policyScenario" aria-label="关系权限场景" @change="updatePolicy">
          <ElOption label="独立授权：仅项目 A 可修改共享成员" value="INDEPENDENT" />
          <ElOption label="两个项目均可修改共享成员" value="ALL" />
          <ElOption label="撤销项目 A 的成员编辑权，仅项目 B 可编辑" value="REVOKE_A" />
          <ElOption label="隐藏项目 B 及其后代，保留数据" value="HIDDEN_B" />
          <ElOption label="只读：保留未保存输入" value="READ_ONLY" />
          <ElOption label="禁止关联和解除" value="NO_LINK" />
          <ElOption label="禁止级联：完整加载并逐项授权后删除" value="NO_CASCADE" />
        </ElSelect>
      </label>
      <label>
        <span>下一次保存</span>
        <ElSelect
          v-model="saveScenario"
          :disabled="busy"
          aria-label="保存响应场景"
          @change="updateScenarios"
        >
          <ElOption label="保存成功，回填身份与最终值" value="SUCCESS" />
          <ElOption label="确定拒绝，保留输入" value="REJECTED" />
          <ElOption label="版本冲突，保留输入" value="CONFLICT" />
          <ElOption label="回执丢失，查询原批次恢复" value="UNKNOWN" />
        </ElSelect>
      </label>
      <label>
        <span>成员候选</span>
        <ElSelect v-model="selectionScenario" aria-label="成员候选场景" @change="updateScenarios">
          <ElOption label="正常：每页一位，支持搜索" value="READY" />
          <ElOption label="空结果" value="EMPTY" />
          <ElOption label="加载失败" value="ERROR" />
          <ElOption label="确认时选择已过期" value="STALE" />
        </ElSelect>
      </label>
      <label>
        <span>重新载入方式</span>
        <ElSelect v-model="initialLoading" :disabled="busy" aria-label="关系初始加载方式">
          <ElOption label="完整数据" value="COMPLETE" />
          <ElOption label="逐层按页加载（点击重新载入生效）" value="LAZY" />
        </ElSelect>
      </label>
      <ElSwitch
        v-model="collectionLoadFailure"
        active-text="模拟关系加载失败"
        @change="updateScenarios"
      />
    </div>

    <div class="relation-playground__status" aria-live="polite">
      <ElTag :type="snapshot.dirty ? 'warning' : 'success'" effect="plain">
        {{ snapshot.dirty ? '有未保存修改' : '与最近保存一致' }}
      </ElTag>
      <span>{{ statusLabel }}</span>
      <span>已载入 {{ collectionCount }} 个集合 · {{ rowCount }} 行</span>
      <ElButton
        v-if="snapshot.status === 'UNKNOWN'"
        type="primary"
        :loading="resolving"
        @click="resolveSubmission"
      >
        查询原批次结果
      </ElButton>
    </div>

    <ElAlert v-if="notice" :title="notice" :type="noticeType" :closable="false" show-icon />
    <ElAlert
      v-if="policyScenario === 'INDEPENDENT'"
      title="在项目 A 修改共享成员姓名，会更新同一成员的展示；项目 B 只能查看姓名，但仍可修改本项目职责。解除项目 B 的关联不会删除成员。"
      type="info"
      :closable="false"
    />

    <div class="relation-playground__form">
      <ElFormRenderer
        :key="snapshot.sessionId"
        :session="session"
        :device="device"
        show-toolbar
        @submission="save"
      />
    </div>

    <footer v-if="lastOperations.length" class="relation-playground__receipt">
      <strong>最近一次提交</strong>
      <span v-for="item in lastOperations" :key="item.label"
        >{{ item.label }} {{ item.count }} 项</span
      >
      <small>只展示操作统计，不展示宿主引用或完整运行数据。</small>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef } from 'vue'
import {
  ElFormRenderer,
  createDesignerRuntimeSession,
  createLocalRelationFormAdapter,
  type DesignerRuntimeSnapshot,
  type DesignerDevice,
  type DesignerSubmissionBatch,
  type LocalRelationSaveScenario,
  type LocalRelationSelectionScenario,
} from 'el-form-gen'
import {
  createRelationPlaygroundCandidates,
  createRelationPlaygroundDocument,
  createRelationPlaygroundFieldPolicy,
  createRelationPlaygroundPolicy,
  createRelationPlaygroundState,
  type RelationPlaygroundPolicyScenario,
} from './relation-playground-fixture'

defineOptions({ name: 'RelationPlayground' })
withDefaults(
  defineProps<{
    /** 复用演示页设备选择，切换不会重建关系会话。 */
    device?: DesignerDevice
  }>(),
  { device: 'desktop' },
)

const formDocument = createRelationPlaygroundDocument()
const policyScenario = ref<RelationPlaygroundPolicyScenario>('INDEPENDENT')
const saveScenario = ref<LocalRelationSaveScenario>('SUCCESS')
const selectionScenario = ref<LocalRelationSelectionScenario>('READY')
const initialLoading = ref<'COMPLETE' | 'LAZY'>('COMPLETE')
const collectionLoadFailure = ref(false)
const notice = ref('')
const noticeType = ref<'success' | 'warning' | 'error' | 'info'>('info')
const resolving = ref(false)
const lastOperations = ref<Array<{ label: string; count: number }>>([])
let adapter = newAdapter()
const session = shallowRef(newSession())
const snapshot = shallowRef<DesignerRuntimeSnapshot>(session.value.getSnapshot())
let unsubscribe = session.value.subscribe((value) => {
  snapshot.value = value
})
let disposed = false

const busy = computed(() => ['PREPARING', 'SUBMITTING', 'UNKNOWN'].includes(snapshot.value.status))
const collectionCount = computed(() => Object.keys(snapshot.value.value.collections).length)
const rowCount = computed(() =>
  Object.values(snapshot.value.value.collections).reduce((sum, item) => sum + item.rows.length, 0),
)
const statusLabel = computed(
  () =>
    ({
      READY: '可以编辑',
      PREPARING: '正在检查修改',
      SUBMITTING: '正在保存，暂时冻结修改',
      UNKNOWN: '保存结果未知，等待原批次回执',
      DISPOSED: '会话已关闭',
    })[snapshot.value.status],
)

function newAdapter() {
  return createLocalRelationFormAdapter({
    initialState: createRelationPlaygroundState(),
    candidates: createRelationPlaygroundCandidates(),
    pageSize: 1,
    delayMs: 350,
  })
}

function newSession() {
  const initialState = createRelationPlaygroundState()
  if (initialLoading.value === 'LAZY') {
    initialState.collections = {}
    initialState.targets = {}
  }
  return createDesignerRuntimeSession({
    document: formDocument,
    initialState,
    mode: 'EDIT',
    fieldRuntimePolicy: createRelationPlaygroundFieldPolicy(formDocument),
    relationRuntimePolicy: createRelationPlaygroundPolicy(formDocument, policyScenario.value),
    adapters: adapter.adapters,
    adapterContext: { applicationCode: 'public-demo', resourceCode: 'project-collaboration' },
  })
}

function updatePolicy(): void {
  session.value.updateRuntimePolicy({
    relationRuntimePolicy: createRelationPlaygroundPolicy(formDocument, policyScenario.value),
  })
}

function updateScenarios(): void {
  adapter.setSaveScenario(saveScenario.value)
  adapter.setSelectionScenario(selectionScenario.value)
  adapter.setCollectionLoadFailure(collectionLoadFailure.value)
}

async function save(batch: DesignerSubmissionBatch): Promise<void> {
  const activeSession = session.value
  const activeAdapter = adapter
  const labels: Record<string, string> = {
    CREATE: '新增记录',
    UPDATE: '修改记录',
    DELETE: '删除记录',
    LINK: '建立关联',
    UNLINK: '解除关联',
  }
  const counts = new Map<string, number>()
  for (const operation of batch.operations) {
    const label =
      operation.subject === 'TARGET'
        ? '修改共享成员'
        : (labels[operation.operation] ?? operation.operation)
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }
  lastOperations.value = Array.from(counts, ([label, count]) => ({ label, count }))
  try {
    const receipt = await activeAdapter.save(batch)
    if (disposed || session.value !== activeSession) return
    const result = activeSession.applyReceipt(receipt)
    if (!result.ok && receipt.status !== 'UNKNOWN') {
      noticeType.value = 'error'
      notice.value = result.issues[0]?.message ?? '无法消费本次回执，当前输入已保留'
      return
    }
    noticeType.value =
      receipt.status === 'SUCCESS' ? 'success' : receipt.status === 'UNKNOWN' ? 'warning' : 'error'
    notice.value =
      receipt.status === 'SUCCESS'
        ? '保存成功。身份与最终值已回填，再次保存不会重复新增或关联。'
        : receipt.status === 'UNKNOWN'
          ? '已模拟回执丢失。请查询原批次结果，继续使用相同提交身份。'
          : (receipt.issues[0]?.message ?? '保存未完成，输入已保留。')
  } catch {
    if (disposed || session.value !== activeSession) return
    activeSession.applyReceipt({
      sessionId: batch.sessionId,
      submissionId: batch.submissionId,
      status: 'UNKNOWN',
      message: '保存响应中断，请查询原批次结果',
    })
    noticeType.value = 'warning'
    notice.value = '保存响应中断。当前批次与输入仍保留，请查询结果。'
  }
}

async function resolveSubmission(): Promise<void> {
  if (resolving.value) return
  const activeSession = session.value
  resolving.value = true
  try {
    const result = await activeSession.dispatch({ type: 'RESOLVE_SUBMISSION' })
    if (disposed || session.value !== activeSession) return
    const current = activeSession.getSnapshot()
    noticeType.value = result.ok && current.status === 'READY' ? 'success' : 'warning'
    notice.value =
      current.status === 'READY'
        ? '已取回原批次的成功回执。身份和版本已回填，保存冻结已解除。'
        : (result.issues[0]?.message ?? '原批次仍没有确定结果，请稍后继续查询。')
  } finally {
    resolving.value = false
  }
}

function restart(): void {
  if (busy.value) return
  unsubscribe()
  session.value.dispose()
  adapter.dispose()
  adapter = newAdapter()
  updateScenarios()
  session.value = newSession()
  snapshot.value = session.value.getSnapshot()
  unsubscribe = session.value.subscribe((value) => {
    snapshot.value = value
  })
  notice.value = ''
  lastOperations.value = []
}

onBeforeUnmount(() => {
  disposed = true
  unsubscribe()
  session.value.dispose()
  adapter.dispose()
})
</script>

<style scoped>
.daxiang-form.relation-playground {
  display: grid;
  width: min(1480px, 100%);
  padding: 28px;
  margin: 0 auto;
  color: var(--el-text-color-primary);
  gap: 20px;
}

.daxiang-form .relation-playground__header,
.daxiang-form .relation-playground__status,
.daxiang-form .relation-playground__receipt {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
}

.daxiang-form .relation-playground__header {
  justify-content: space-between;
}

.daxiang-form .relation-playground__header h1 {
  margin: 0 0 12px;
  font-size: 26px;
  font-weight: 600;
}

.daxiang-form .relation-playground__header p {
  margin: 0;
  color: var(--el-text-color-secondary);
  line-height: 1.7;
}

.daxiang-form .relation-playground__header .relation-playground__eyebrow {
  margin-bottom: 10px;
  color: var(--el-color-primary);
  font-size: 13px;
}

.daxiang-form .relation-playground__controls {
  display: grid;
  padding: 20px;
  border: 1px solid var(--el-border-color-light);
  border-radius: var(--el-border-radius-base);
  background: var(--el-bg-color-overlay);
  gap: 20px;
  grid-template-columns: 1.4fr 1fr 1fr;
}

.daxiang-form .relation-playground__controls label {
  display: grid;
  min-width: 0;
  gap: 8px;
}

.daxiang-form .relation-playground__controls label > span {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.daxiang-form .relation-playground__status,
.daxiang-form .relation-playground__receipt {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.daxiang-form .relation-playground__form {
  min-width: 0;
  padding: 20px;
  border: 1px solid var(--el-border-color-light);
  border-radius: var(--el-border-radius-base);
  background: var(--el-bg-color);
}

.daxiang-form .relation-playground__receipt {
  padding: 16px 0;
  border-top: 1px solid var(--el-border-color-light);
}

@media (width <= 900px) {
  .daxiang-form.relation-playground {
    padding: 16px;
  }

  .daxiang-form .relation-playground__controls {
    grid-template-columns: 1fr;
  }
}
</style>
