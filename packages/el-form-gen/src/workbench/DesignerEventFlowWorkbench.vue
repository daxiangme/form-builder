<template>
  <div class="designer-event-flow-workbench">
    <aside>
      <ElDropdown v-if="allowCreate" trigger="click" @command="createFlow">
        <ElButton type="primary" plain><DxSvgIcon icon="ri:add-line" />创建事件</ElButton>
        <template #dropdown>
          <ElDropdownMenu>
            <ElDropdownItem command="FORM">表单事件</ElDropdownItem>
            <ElDropdownItem :disabled="!selectedNodeId" command="COMPONENT"
              >当前组件事件</ElDropdownItem
            >
          </ElDropdownMenu>
        </template>
      </ElDropdown>
      <button
        v-for="flow in visibleFlows"
        :key="flow.id"
        type="button"
        :class="{ 'is-active': selectedFlowId === flow.id }"
        @click="selectFlow(flow)"
      >
        <DxSvgIcon icon="ri:flashlight-line" />
        <span
          ><strong>{{ flow.name }}</strong
          ><small>{{ flowLabel(flow) }}</small></span
        >
        <ElButton
          v-if="allowDelete"
          text
          type="danger"
          aria-label="删除事件"
          @click.stop="removeFlow(flow.id)"
        >
          <DxSvgIcon icon="ri:delete-bin-line" />
        </ElButton>
      </button>
      <ElEmpty v-if="visibleFlows.length === 0" description="尚未创建事件" :image-size="48" />
    </aside>

    <main v-if="selectedFlow">
      <header>
        <ElInput v-model="selectedFlow.name" maxlength="80" aria-label="事件名称" />
        <ElInput
          v-model="selectedFlow.code"
          maxlength="64"
          aria-label="事件编码"
          :disabled="lockIdentity"
        />
        <ElSelect
          v-if="selectedFlow.trigger.scope === 'FORM'"
          v-model="selectedFlow.trigger.event"
          :disabled="lockIdentity"
        >
          <ElOption label="初始化完成" value="INITIALIZED" />
          <ElOption label="提交前" value="BEFORE_SUBMIT" />
          <ElOption label="提交后" value="AFTER_SUBMIT" />
          <ElOption label="重置" value="RESET" />
        </ElSelect>
        <ElSelect v-else v-model="selectedFlow.trigger.event" :disabled="lockIdentity">
          <ElOption
            v-for="event in selectedFlowComponentEvents"
            :key="event"
            :label="componentEventLabel(event)"
            :value="event"
          />
        </ElSelect>
        <ElSwitch
          v-model="selectedFlow.enabled"
          inline-prompt
          active-text="启用"
          inactive-text="停用"
        />
      </header>
      <div class="designer-event-flow-workbench__flow">
        <div class="designer-event-flow-workbench__start">开始</div>
        <DesignerEventStepTree
          :steps="selectedFlow.steps"
          :selected-step-id="selectedStep?.id ?? ''"
          @select="selectedStep = $event"
          @delete="handleStepDelete"
          @update:steps="selectedFlow.steps = $event"
        />
        <div class="designer-event-flow-workbench__end">结束</div>
      </div>
    </main>

    <section v-if="selectedStep" class="designer-event-flow-workbench__configuration">
      <template v-if="selectedStep.stepType === 'ACTION'">
        <header>
          <strong>动作配置</strong>
          <small>{{ actionDescription(selectedStep.actionType) }}</small>
        </header>
        <ElForm label-position="top">
          <ElFormItem label="动作名称"
            ><ElInput v-model="selectedStep.name" maxlength="80"
          /></ElFormItem>
          <ElFormItem label="执行动作">
            <ElSelect
              v-model="selectedStep.actionType"
              @change="resetActionConfiguration(selectedStep)"
            >
              <ElOption
                v-for="item in actionTypes"
                :key="item.value"
                :label="item.label"
                :value="item.value"
                :disabled="!item.available"
              >
                <span>{{ item.label }}</span>
                <small v-if="!item.available">{{ item.unavailableReason }}</small>
              </ElOption>
            </ElSelect>
          </ElFormItem>

          <ElFormItem
            v-if="['SET_FIELD', 'CLEAR_FIELD'].includes(selectedStep.actionType)"
            label="目标字段"
          >
            <ElSelect
              :model-value="configurationText(selectedStep, 'fieldId')"
              @update:model-value="setActionConfiguration(selectedStep, 'fieldId', $event)"
            >
              <ElOption
                v-for="field in document.dataSchema.fields"
                :key="field.id"
                :label="field.label"
                :value="field.id"
              />
            </ElSelect>
          </ElFormItem>
          <template v-if="selectedStep.actionType === 'COPY_FIELD'">
            <ElFormItem label="来源字段">
              <ElSelect
                :model-value="configurationText(selectedStep, 'sourceFieldId')"
                @update:model-value="setActionConfiguration(selectedStep, 'sourceFieldId', $event)"
              >
                <ElOption
                  v-for="field in document.dataSchema.fields"
                  :key="field.id"
                  :label="field.label"
                  :value="field.id"
                />
              </ElSelect>
            </ElFormItem>
            <ElFormItem label="目标字段">
              <ElSelect
                :model-value="configurationText(selectedStep, 'targetFieldId')"
                @update:model-value="setActionConfiguration(selectedStep, 'targetFieldId', $event)"
              >
                <ElOption
                  v-for="field in document.dataSchema.fields"
                  :key="field.id"
                  :label="field.label"
                  :value="field.id"
                />
              </ElSelect>
            </ElFormItem>
          </template>
          <ElFormItem
            v-if="['SET_FIELD', 'SET_VARIABLE'].includes(selectedStep.actionType)"
            label="设置值"
          >
            <DesignerExpressionEditor
              :model-value="expressionConfiguration(selectedStep)"
              :fields="document.dataSchema.fields"
              :variables="document.variables"
              :allow-current-row="selectedFlowAllowsCurrentRow"
              mode="value"
              @update:model-value="selectedStep.configuration.expression = $event"
            />
          </ElFormItem>
          <ElFormItem v-if="selectedStep.actionType === 'SET_VARIABLE'" label="目标变量">
            <ElSelect
              :model-value="configurationText(selectedStep, 'variableCode')"
              @update:model-value="setActionConfiguration(selectedStep, 'variableCode', $event)"
            >
              <ElOption
                v-for="variable in document.variables"
                :key="variable.code"
                :label="variable.name"
                :value="variable.code"
              />
            </ElSelect>
          </ElFormItem>
          <ElFormItem v-if="selectedStep.actionType === 'MESSAGE'" label="消息内容">
            <ElInput
              :model-value="configurationText(selectedStep, 'message')"
              maxlength="160"
              @update:model-value="setActionConfiguration(selectedStep, 'message', $event)"
            />
          </ElFormItem>
          <ElFormItem v-if="selectedStep.actionType === 'MESSAGE'" label="消息级别">
            <ElSelect
              :model-value="configurationText(selectedStep, 'level')"
              @update:model-value="setActionConfiguration(selectedStep, 'level', $event)"
            >
              <ElOption label="成功" value="SUCCESS" />
              <ElOption label="信息" value="INFO" />
              <ElOption label="警告" value="WARNING" />
              <ElOption label="错误" value="ERROR" />
            </ElSelect>
          </ElFormItem>
          <ElFormItem
            v-if="
              ['OPEN_MODULE', 'CONFIRM_MODULE', 'CANCEL_MODULE'].includes(selectedStep.actionType)
            "
            label="模块"
          >
            <ElSelect
              :model-value="configurationText(selectedStep, 'moduleCode')"
              @update:model-value="setActionConfiguration(selectedStep, 'moduleCode', $event)"
            >
              <ElOption
                v-for="module in document.uiSchema.overlays"
                :key="module.code"
                :label="module.name"
                :value="module.code"
              />
            </ElSelect>
          </ElFormItem>
          <ElFormItem v-if="selectedStep.actionType === 'REFRESH_DATA_SOURCE'" label="数据源">
            <ElSelect
              :model-value="configurationText(selectedStep, 'dataSourceCode')"
              @update:model-value="setActionConfiguration(selectedStep, 'dataSourceCode', $event)"
            >
              <ElOption
                v-for="source in document.dataSources"
                :key="source.code"
                :label="source.name"
                :value="source.code"
              />
            </ElSelect>
          </ElFormItem>
          <ElFormItem v-if="selectedStep.actionType === 'NAVIGATE_RESOURCE'" label="同应用资源编码">
            <ElInput
              :model-value="configurationText(selectedStep, 'resourceCode')"
              maxlength="64"
              @update:model-value="setActionConfiguration(selectedStep, 'resourceCode', $event)"
            />
          </ElFormItem>
          <ElFormItem v-if="selectedStep.actionType === 'NAVIGATE_RESOURCE'" label="在新页面打开">
            <ElSwitch
              :model-value="selectedStep.configuration.openInNewPage === true"
              @update:model-value="setActionConfiguration(selectedStep, 'openInNewPage', $event)"
            />
          </ElFormItem>
          <ElFormItem v-if="selectedStep.actionType === 'HOST_ACTION'" label="Host 动作编码">
            <ElInput
              :model-value="configurationText(selectedStep, 'actionCode')"
              maxlength="64"
              @update:model-value="setActionConfiguration(selectedStep, 'actionCode', $event)"
            />
          </ElFormItem>
          <ElFormItem label="执行条件">
            <div class="designer-event-flow-workbench__guard-toggle">
              <ElSwitch
                :model-value="Boolean(selectedStep.guard)"
                active-text="启用条件"
                @update:model-value="toggleGuard(selectedStep, Boolean($event))"
              />
              <small>条件为空时动作始终执行。</small>
            </div>
            <DesignerExpressionEditor
              v-if="selectedStep.guard"
              v-model="selectedStep.guard"
              :fields="document.dataSchema.fields"
              :variables="document.variables"
              :allow-current-row="selectedFlowAllowsCurrentRow"
              mode="condition"
            />
          </ElFormItem>
          <ElFormItem label="条件不满足">
            <ElSegmented
              v-model="selectedStep.guardFailure"
              :options="[
                { label: '跳过动作', value: 'SKIP' },
                { label: '阻断事件', value: 'BLOCK' },
              ]"
            />
          </ElFormItem>
          <ElFormItem label="执行异常">
            <ElSegmented
              v-model="selectedStep.onError"
              :options="[
                { label: '停止后续', value: 'STOP' },
                { label: '继续后续', value: 'CONTINUE' },
              ]"
            />
          </ElFormItem>
        </ElForm>
      </template>
      <template v-else>
        <header>
          <strong>条件配置</strong><small>按顺序命中第一个分支，否则进入其他情况。</small>
        </header>
        <ElForm label-position="top">
          <ElFormItem label="条件名称"
            ><ElInput v-model="selectedStep.name" maxlength="80"
          /></ElFormItem>
          <article v-for="(branch, index) in selectedStep.branches" :key="branch.id">
            <div>
              <ElInput v-model="branch.name" />
              <ElButton text type="danger" @click="selectedStep.branches.splice(index, 1)">
                <DxSvgIcon icon="ri:delete-bin-line" />
              </ElButton>
            </div>
            <DesignerExpressionEditor
              v-model="branch.condition"
              :fields="document.dataSchema.fields"
              :variables="document.variables"
              :allow-current-row="selectedFlowAllowsCurrentRow"
              mode="condition"
            />
          </article>
          <ElButton plain @click="addBranch">添加条件分支</ElButton>
        </ElForm>
      </template>
    </section>
    <ElEmpty
      v-else-if="selectedFlow"
      class="designer-event-flow-workbench__configuration"
      description="选择步骤后配置"
    />
    <ElEmpty
      v-else
      class="designer-event-flow-workbench__welcome"
      description="创建或选择一个事件"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import DxSvgIcon from '../infrastructure/FormIcon.vue'
import { findDesignerComponent } from '@daxiangme/form-core'
import { findDesignerNode } from '@daxiangme/form-core'
import {
  resolveDesignerEventActionAvailability,
  type DesignerFieldBehaviorCapabilities,
} from '@daxiangme/form-core'
import type {
  DesignerComponentEvent,
  DesignerDocument,
  DesignerEventActionStep,
  DesignerEventActionType,
  DesignerEventFlow,
  DesignerEventStep,
  DesignerExpression,
} from '@daxiangme/form-core'
import DesignerEventStepTree from './DesignerEventStepTree.vue'
import DesignerExpressionEditor from './DesignerExpressionEditor.vue'

defineOptions({ name: 'DesignerEventFlowWorkbench' })

const props = withDefaults(
  defineProps<{
    document: DesignerDocument
    selectedNodeId: string
    initialFlowId?: string
    editableFlowCodes?: string[]
    allowCreate?: boolean
    allowDelete?: boolean
    lockIdentity?: boolean
    capabilities: DesignerFieldBehaviorCapabilities
  }>(),
  {
    initialFlowId: '',
    editableFlowCodes: () => [],
    allowCreate: true,
    allowDelete: true,
    lockIdentity: false,
  },
)
const flowsModel = defineModel<DesignerEventFlow[]>({ required: true })
const draftFlows = ref<DesignerEventFlow[]>(cloneValue(flowsModel.value))
const selectedFlowId = ref('')
const selectedStep = ref<DesignerEventStep>()
const visibleFlows = computed(() => {
  if (props.editableFlowCodes.length === 0) return draftFlows.value
  const allowed = new Set(props.editableFlowCodes)
  return draftFlows.value.filter((flow) => allowed.has(flow.code))
})
const selectedFlow = computed(() =>
  draftFlows.value.find((flow) => flow.id === selectedFlowId.value),
)
const selectedFlowAllowsCurrentRow = computed(() => {
  const flow = selectedFlow.value
  return flow?.trigger.scope === 'COMPONENT' && nodeUsesCurrentRowContext(flow.trigger.nodeId)
})
const selectedFlowComponentEvents = computed<DesignerComponentEvent[]>(() => {
  const flow = selectedFlow.value
  return flow?.trigger.scope === 'COMPONENT'
    ? supportedEventsForNode(flow.trigger.nodeId)
    : ['CHANGE', 'BLUR', 'FOCUS']
})
const actionTypes = computed(() =>
  ACTION_TYPES.map((item) => ({
    ...item,
    ...resolveDesignerEventActionAvailability(item.value, props.capabilities),
  })),
)

const ACTION_TYPES: Array<{ label: string; value: DesignerEventActionType }> = [
  { label: '设置字段', value: 'SET_FIELD' },
  { label: '清空字段', value: 'CLEAR_FIELD' },
  { label: '复制字段', value: 'COPY_FIELD' },
  { label: '设置变量', value: 'SET_VARIABLE' },
  { label: '验证表单', value: 'VALIDATE' },
  { label: '提交表单', value: 'SUBMIT' },
  { label: '重置表单', value: 'RESET' },
  { label: '打印', value: 'PRINT' },
  { label: '显示消息', value: 'MESSAGE' },
  { label: '打开模块', value: 'OPEN_MODULE' },
  { label: '确认模块', value: 'CONFIRM_MODULE' },
  { label: '取消模块', value: 'CANCEL_MODULE' },
  { label: '资源导航', value: 'NAVIGATE_RESOURCE' },
  { label: '刷新数据源', value: 'REFRESH_DATA_SOURCE' },
  { label: 'Host 动作', value: 'HOST_ACTION' },
]

watch(
  () => flowsModel.value,
  (flows) => {
    if (JSON.stringify(flows) !== JSON.stringify(draftFlows.value))
      draftFlows.value = cloneValue(flows)
  },
  { deep: true },
)
watch(
  draftFlows,
  (flows) => {
    if (JSON.stringify(flows) !== JSON.stringify(flowsModel.value))
      flowsModel.value = cloneValue(flows)
  },
  { deep: true },
)
watch(
  [visibleFlows, () => props.initialFlowId],
  ([flows, initialFlowId]) => {
    const preferred = flows.find((flow) => flow.id === initialFlowId)
    const fallback = preferred ?? flows[0]
    if (!flows.some((flow) => flow.id === selectedFlowId.value))
      selectedFlowId.value = fallback?.id ?? ''
  },
  { immediate: true },
)

function createFlow(command: string | number | object): void {
  if (command !== 'FORM' && command !== 'COMPONENT') return
  const serial = draftFlows.value.length + 1
  const flow: DesignerEventFlow = {
    id: createId('flow'),
    code: uniqueFlowCode(`event_${serial}`),
    name: command === 'FORM' ? `表单事件${serial}` : `组件事件${serial}`,
    trigger:
      command === 'FORM'
        ? { scope: 'FORM', event: 'BEFORE_SUBMIT' }
        : {
            scope: 'COMPONENT',
            event: supportedEventsForNode(props.selectedNodeId)[0] ?? 'CHANGE',
            nodeId: props.selectedNodeId,
          },
    enabled: true,
    steps: [],
  }
  draftFlows.value.push(flow)
  selectFlow(flow)
}

function selectFlow(flow: DesignerEventFlow): void {
  selectedFlowId.value = flow.id
  selectedStep.value = undefined
}

function removeFlow(flowId: string): void {
  const index = draftFlows.value.findIndex((flow) => flow.id === flowId)
  if (index < 0) return
  draftFlows.value.splice(index, 1)
  if (selectedFlowId.value !== flowId) return
  selectedFlowId.value =
    visibleFlows.value[Math.max(0, index - 1)]?.id ?? visibleFlows.value[0]?.id ?? ''
  selectedStep.value = undefined
}

function handleStepDelete(stepId: string): void {
  if (selectedStep.value?.id === stepId) selectedStep.value = undefined
}

function configurationText(step: DesignerEventActionStep, key: string): string {
  const value = step.configuration[key]
  return typeof value === 'string' ? value : ''
}

function setActionConfiguration(step: DesignerEventActionStep, key: string, value: unknown): void {
  step.configuration = { ...step.configuration, [key]: value }
}

function toggleGuard(step: DesignerEventActionStep, enabled: boolean): void {
  step.guard = enabled ? (step.guard ?? { kind: 'LITERAL', value: true }) : undefined
}

function resetActionConfiguration(step: DesignerEventActionStep): void {
  const availability = resolveDesignerEventActionAvailability(step.actionType, props.capabilities)
  if (!availability.available) return
  step.configuration = defaultActionConfiguration(step.actionType)
  step.name = ACTION_TYPES.find((item) => item.value === step.actionType)?.label ?? '执行动作'
}

function defaultActionConfiguration(type: DesignerEventActionType): Record<string, unknown> {
  if (type === 'MESSAGE') return { message: '操作已完成', level: 'SUCCESS' }
  if (['SET_FIELD', 'CLEAR_FIELD'].includes(type)) {
    return { fieldId: props.document.dataSchema.fields[0]?.id ?? '' }
  }
  if (type === 'COPY_FIELD') return { sourceFieldId: '', targetFieldId: '' }
  if (type === 'SET_VARIABLE') {
    return {
      variableCode: props.document.variables[0]?.code ?? '',
      expression: { kind: 'LITERAL', value: null },
    }
  }
  if (['OPEN_MODULE', 'CONFIRM_MODULE', 'CANCEL_MODULE'].includes(type)) {
    return { moduleCode: props.document.uiSchema.overlays[0]?.code ?? '' }
  }
  if (type === 'REFRESH_DATA_SOURCE')
    return { dataSourceCode: props.document.dataSources[0]?.code ?? '' }
  if (type === 'NAVIGATE_RESOURCE') return { resourceCode: '', openInNewPage: false }
  if (type === 'HOST_ACTION') return { actionCode: '' }
  return {}
}

function expressionConfiguration(step: DesignerEventActionStep): DesignerExpression | undefined {
  const value = step.configuration.expression
  return typeof value === 'object' && value !== null ? (value as DesignerExpression) : undefined
}

function addBranch(): void {
  if (!selectedStep.value || selectedStep.value.stepType !== 'CONDITION') return
  selectedStep.value.branches.push({
    id: createId('branch'),
    name: `条件 ${selectedStep.value.branches.length + 1}`,
    condition: { kind: 'LITERAL', value: true },
    steps: [],
  })
}

function flowLabel(flow: DesignerEventFlow): string {
  return flow.trigger.scope === 'FORM'
    ? `表单 · ${flow.trigger.event}`
    : `组件 · ${flow.trigger.event}`
}

function actionDescription(type: DesignerEventActionType): string {
  const availability = resolveDesignerEventActionAvailability(type, props.capabilities)
  return availability.available
    ? '动作按事件流顺序执行，可配置阻断和异常策略。'
    : `${availability.unavailableReason}；历史步骤保留并在运行时失败关闭。`
}

function supportedEventsForNode(nodeId: string): DesignerComponentEvent[] {
  for (const root of [
    props.document.uiSchema.root,
    ...props.document.uiSchema.overlays.map((overlay) => overlay.root),
  ]) {
    const node = findDesignerNode(root, nodeId)
    if (!node) continue
    const componentType =
      node.nodeType === 'FIELD'
        ? props.document.dataSchema.fields.find((field) => field.id === node.fieldId)?.componentType
        : node.componentType
    return (componentType ? findDesignerComponent(componentType)?.supportedEvents : undefined) ?? []
  }
  return []
}

function nodeUsesCurrentRowContext(nodeId: string): boolean {
  const visit = (nodes: DesignerDocument['uiSchema']['root'], insideSubtable: boolean): boolean => {
    for (const node of nodes) {
      if (node.id === nodeId) return insideSubtable
      if (node.nodeType !== 'CONTAINER') continue
      const nextInside =
        insideSubtable || ['row-subtable', 'block-subtable'].includes(node.componentType)
      for (const slot of node.slots) if (visit(slot.children, nextInside)) return true
    }
    return false
  }
  return [
    props.document.uiSchema.root,
    ...props.document.uiSchema.overlays.map((item) => item.root),
  ].some((root) => visit(root, false))
}

function componentEventLabel(event: DesignerComponentEvent): string {
  return { CHANGE: '值变化', BLUR: '失焦', FOCUS: '聚焦', CLICK: '点击' }[event]
}

function uniqueFlowCode(candidate: string): string {
  const existing = new Set(draftFlows.value.map((flow) => flow.code))
  let code = candidate
  let serial = 2
  while (existing.has(code)) code = `${candidate}_${serial++}`
  return code
}

function createId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().replaceAll('-', '')}`
}

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
</script>

<style scoped>
.designer-event-flow-workbench {
  display: grid;
  min-height: 560px;
  overflow: hidden;
  border: 1px solid var(--el-border-color-lighter);
  grid-template-columns: 220px minmax(300px, 1fr) minmax(280px, 340px);
}

.designer-event-flow-workbench > aside,
.designer-event-flow-workbench > main,
.designer-event-flow-workbench__configuration {
  min-width: 0;
  min-height: 0;
  overflow: auto;
}

.designer-event-flow-workbench > aside {
  display: flex;
  padding: var(--daxiang-form-space-2);
  flex-direction: column;
  border-right: 1px solid var(--el-border-color-lighter);
  gap: var(--daxiang-form-space-2);
}

.designer-event-flow-workbench > aside > button {
  display: grid;
  align-items: center;
  padding: var(--daxiang-form-space-2);
  color: var(--el-text-color-regular);
  text-align: left;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--el-border-radius-base);
  cursor: pointer;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: var(--daxiang-form-space-2);
}

.designer-event-flow-workbench > aside > button.is-active {
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  border-color: var(--el-color-primary-light-5);
}

.designer-event-flow-workbench > aside span,
.designer-event-flow-workbench__configuration > header {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.designer-event-flow-workbench > aside strong,
.designer-event-flow-workbench > aside small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.designer-event-flow-workbench > main {
  display: flex;
  flex-direction: column;
  background-image: radial-gradient(var(--el-border-color-light) 1px, transparent 1px);
  background-size: 20px 20px;
}

.designer-event-flow-workbench > main > header {
  display: grid;
  padding: var(--daxiang-form-space-2);
  background: var(--el-bg-color);
  border-bottom: 1px solid var(--el-border-color-lighter);
  grid-template-columns: 1.3fr 1fr 150px auto;
  gap: var(--daxiang-form-space-2);
}

.designer-event-flow-workbench__flow {
  display: flex;
  align-items: stretch;
  padding: var(--daxiang-form-space-5);
  flex: 1 1 0;
  flex-direction: column;
  gap: var(--daxiang-form-space-3);
}

.designer-event-flow-workbench__start,
.designer-event-flow-workbench__end {
  padding: var(--daxiang-form-space-2);
  color: var(--el-color-white);
  text-align: center;
  background: var(--el-color-primary);
  border-radius: var(--el-border-radius-base);
}

.designer-event-flow-workbench__end {
  background: var(--el-text-color-secondary);
}

.designer-event-flow-workbench__configuration {
  padding: var(--daxiang-form-space-3);
  background: var(--el-bg-color);
  border-left: 1px solid var(--el-border-color-lighter);
}

.designer-event-flow-workbench__configuration > header {
  margin-bottom: var(--daxiang-form-space-3);
}

.designer-event-flow-workbench__configuration article {
  padding: var(--daxiang-form-space-2);
  margin-bottom: var(--daxiang-form-space-2);
  background: var(--el-fill-color-lighter);
  border-radius: var(--el-border-radius-base);
}

.designer-event-flow-workbench__configuration article > div,
.designer-event-flow-workbench__guard-toggle {
  display: flex;
  align-items: center;
  gap: var(--daxiang-form-space-2);
}

.designer-event-flow-workbench__configuration :deep(.el-segmented),
.designer-event-flow-workbench__configuration :deep(.el-select) {
  width: 100%;
}

.designer-event-flow-workbench__welcome {
  grid-column: 2 / -1;
}

@media (width <= 980px) {
  .designer-event-flow-workbench {
    overflow: auto;
    grid-template-columns: 190px minmax(420px, 1fr);
  }

  .designer-event-flow-workbench__configuration {
    grid-column: 1 / -1;
    border-top: 1px solid var(--el-border-color-lighter);
    border-left: 0;
  }
}
</style>
