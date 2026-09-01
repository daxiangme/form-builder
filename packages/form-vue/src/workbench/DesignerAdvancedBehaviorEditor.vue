<template>
  <DModal
    v-model="visibleModel"
    :title="`${field.label} · 高级配置`"
    width="min(1120px, calc(100vw - 32px))"
    confirm-text="保存配置"
    :confirm-disabled="hasErrors"
    :flush-content-vertical="true"
    @confirm="save"
  >
    <template v-if="editingFlow">
      <div class="designer-advanced-behavior__event-heading">
        <ElButton text @click="finishEditingFlow"
          ><DxSvgIcon icon="ri:arrow-left-line" />返回高级配置</ElButton
        >
        <div>
          <strong>{{ editingFlow.name }}</strong
          ><small>事件步骤与字段行为将在保存配置时原子提交</small>
        </div>
      </div>
      <DesignerEventFlowWorkbench
        v-model="draftFlows"
        :document="document"
        :selected-node-id="selectedNodeId"
        :initial-flow-id="editingFlow.id"
        :editable-flow-codes="[editingFlow.code]"
        :allow-create="false"
        :allow-delete="false"
        lock-identity
        :capabilities="capabilities"
      />
    </template>

    <ElTabs v-else v-model="activeTab" class="designer-advanced-behavior">
      <ElTabPane :label="tabLabel('state', '状态条件', draft.stateRules.length)" name="state">
        <RuleWorkbench
          title="状态规则"
          description="条件成立时改变字段的显示、必填或禁用状态"
          :empty="draft.stateRules.length === 0"
          @add="addStateRule"
        >
          <template #list>
            <RuleListItem
              v-for="(rule, index) in draft.stateRules"
              :key="rule.id"
              :active="selectedStateId === rule.id"
              :title="stateRuleTitle(rule)"
              :summary="summarizeDesignerStateRule(rule)"
              :diagnostics="diagnosticsForRule(rule.id)"
              :move-up-disabled="index === 0"
              :move-down-disabled="index === draft.stateRules.length - 1"
              @click="selectedStateId = rule.id"
              @copy="copyRule(draft.stateRules, index, 'state')"
              @delete="removeRule(draft.stateRules, index, 'state')"
              @move-up="moveRule(draft.stateRules, index, -1)"
              @move-down="moveRule(draft.stateRules, index, 1)"
            />
          </template>
          <template #detail>
            <ElForm v-if="selectedStateRule" label-position="top">
              <div class="designer-advanced-behavior__detail-grid">
                <ElFormItem label="改变状态">
                  <ElSelect v-model="selectedStateRule.target">
                    <ElOption label="显示状态" value="VISIBLE" />
                    <ElOption label="必填状态" value="REQUIRED" />
                    <ElOption label="禁用状态" value="DISABLED" />
                  </ElSelect>
                </ElFormItem>
                <ElFormItem label="条件成立时">
                  <ElSegmented
                    v-model="selectedStateRule.valueWhenTrue"
                    :options="booleanOptions"
                  />
                </ElFormItem>
              </div>
              <ElFormItem label="执行条件">
                <DesignerExpressionEditor
                  v-model="selectedStateRule.condition"
                  :fields="document.dataSchema.fields"
                  :variables="document.variables"
                  :allow-current-row="allowCurrentRow"
                  mode="condition"
                />
              </ElFormItem>
            </ElForm>
          </template>
        </RuleWorkbench>
      </ElTabPane>

      <ElTabPane :label="tabLabel('value', '计算与联动', draft.valueRules.length)" name="value">
        <RuleWorkbench
          title="计算与联动规则"
          description="公式确定性重算；联动只响应依赖字段变化"
          :empty="draft.valueRules.length === 0"
          @add="addValueRule"
        >
          <template #list>
            <RuleListItem
              v-for="(rule, index) in draft.valueRules"
              :key="rule.id"
              :active="selectedValueId === rule.id"
              :title="rule.mode === 'FORMULA' ? '计算公式' : '数据联动'"
              :summary="summarizeDesignerValueRule(rule)"
              :diagnostics="diagnosticsForRule(rule.id)"
              :move-up-disabled="index === 0"
              :move-down-disabled="index === draft.valueRules.length - 1"
              @click="selectedValueId = rule.id"
              @copy="copyRule(draft.valueRules, index, 'value')"
              @delete="removeRule(draft.valueRules, index, 'value')"
              @move-up="moveRule(draft.valueRules, index, -1)"
              @move-down="moveRule(draft.valueRules, index, 1)"
            />
          </template>
          <template #detail>
            <ElForm v-if="selectedValueRule" label-position="top">
              <ElFormItem label="规则类型">
                <ElSegmented
                  :model-value="selectedValueRule.mode"
                  :options="[
                    { label: '计算公式', value: 'FORMULA' },
                    { label: '数据联动', value: 'LINKAGE' },
                  ]"
                  @update:model-value="changeValueMode($event)"
                />
                <small>
                  {{
                    selectedValueRule.mode === 'FORMULA'
                      ? '公式字段在编辑态只读，并随依赖变化按拓扑顺序重算。'
                      : '联动只在表达式或条件依赖字段变化时执行。'
                  }}
                </small>
              </ElFormItem>
              <ElFormItem v-if="selectedValueRule.mode === 'LINKAGE'" label="已有值覆盖策略">
                <ElSegmented
                  v-model="selectedValueRule.overwritePolicy"
                  :options="[
                    { label: '始终覆盖', value: 'ALWAYS' },
                    { label: '仅空值', value: 'EMPTY_ONLY' },
                    { label: '覆盖前确认', value: 'CONFIRM' },
                  ]"
                />
              </ElFormItem>
              <ElFormItem label="设置值">
                <DesignerExpressionEditor
                  v-model="selectedValueRule.expression"
                  :fields="document.dataSchema.fields"
                  :variables="document.variables"
                  :allow-current-row="allowCurrentRow"
                  mode="value"
                />
              </ElFormItem>
              <ElFormItem label="执行条件">
                <ElSwitch
                  :model-value="selectedValueRule.condition !== undefined"
                  active-text="仅条件成立时执行"
                  @update:model-value="toggleValueRuleCondition($event === true)"
                />
                <DesignerExpressionEditor
                  v-if="selectedValueRule.condition"
                  v-model="selectedValueRule.condition"
                  :fields="document.dataSchema.fields"
                  :variables="document.variables"
                  :allow-current-row="allowCurrentRow"
                  mode="condition"
                />
              </ElFormItem>
            </ElForm>
          </template>
        </RuleWorkbench>
      </ElTabPane>

      <ElTabPane
        :label="tabLabel('validation', '验证规则', draft.validationRules.length)"
        name="validation"
      >
        <RuleWorkbench
          title="验证规则"
          description="验证数据是否正确，与必填互相独立"
          :empty="draft.validationRules.length === 0"
        >
          <template #add>
            <ElDropdown trigger="click" @command="addValidationRule">
              <ElButton plain><DxSvgIcon icon="ri:add-line" />添加规则</ElButton>
              <template #dropdown>
                <ElDropdownMenu>
                  <ElDropdownItem
                    v-for="item in validationCatalog"
                    :key="item.type"
                    :command="item.type"
                    :disabled="!item.available"
                  >
                    <span>{{ item.label }}</span>
                    <small v-if="!item.available">{{ item.unavailableReason }}</small>
                  </ElDropdownItem>
                </ElDropdownMenu>
              </template>
            </ElDropdown>
          </template>
          <template #list>
            <RuleListItem
              v-for="(rule, index) in draft.validationRules"
              :key="rule.id"
              :active="selectedValidationId === rule.id"
              :title="rule.name || '未命名验证规则'"
              :summary="summarizeDesignerValidationRule(rule)"
              :diagnostics="diagnosticsForRule(rule.id)"
              :enabled="rule.enabled"
              :move-up-disabled="index === 0"
              :move-down-disabled="index === draft.validationRules.length - 1"
              @click="selectedValidationId = rule.id"
              @toggle="rule.enabled = !rule.enabled"
              @copy="copyRule(draft.validationRules, index, 'validation')"
              @delete="removeRule(draft.validationRules, index, 'validation')"
              @move-up="moveRule(draft.validationRules, index, -1)"
              @move-down="moveRule(draft.validationRules, index, 1)"
            />
          </template>
          <template #detail>
            <ElForm v-if="selectedValidationRule" label-position="top">
              <div class="designer-advanced-behavior__validation-meta">
                <ElFormItem label="规则名称">
                  <ElInput v-model="selectedValidationRule.name" maxlength="60" />
                </ElFormItem>
                <ElFormItem label="规则类型">
                  <ElSelect
                    :model-value="selectedValidationRule.type"
                    @update:model-value="changeValidationType($event)"
                  >
                    <ElOption
                      v-for="item in validationCatalogWithLegacy"
                      :key="item.type"
                      :label="item.label"
                      :value="item.type"
                      :disabled="!item.available"
                    />
                  </ElSelect>
                </ElFormItem>
                <ElFormItem label="触发时机">
                  <ElSelect v-model="selectedValidationRule.trigger">
                    <ElOption label="值变化" value="CHANGE" />
                    <ElOption label="失焦" value="BLUR" />
                    <ElOption label="提交" value="SUBMIT" />
                  </ElSelect>
                </ElFormItem>
                <ElFormItem label="反馈级别">
                  <ElSelect v-model="selectedValidationRule.severity">
                    <ElOption label="阻断错误" value="ERROR" />
                    <ElOption label="字段警告" value="WARNING" />
                  </ElSelect>
                </ElFormItem>
              </div>
              <ValidationRuleConfiguration
                :rule="selectedValidationRule"
                :document="document"
                :field="field"
                :allow-current-row="allowCurrentRow"
                @update-configuration="setSelectedValidationConfiguration"
              />
              <ElFormItem label="校验条件">
                <ElSwitch
                  :model-value="selectedValidationRule.condition !== undefined"
                  active-text="仅条件成立时验证"
                  @update:model-value="toggleValidationCondition($event === true)"
                />
                <DesignerExpressionEditor
                  v-if="selectedValidationRule.condition"
                  v-model="selectedValidationRule.condition"
                  :fields="document.dataSchema.fields"
                  :variables="document.variables"
                  :allow-current-row="allowCurrentRow"
                  mode="condition"
                />
              </ElFormItem>
              <ElFormItem label="失败提示">
                <ElInput v-model="selectedValidationRule.message" maxlength="160" />
              </ElFormItem>
            </ElForm>
          </template>
        </RuleWorkbench>
      </ElTabPane>

      <ElTabPane :label="tabLabel('submit', '提交与事件', supportedEvents.length)" name="submit">
        <section class="designer-advanced-behavior__submit">
          <ElForm label-position="top">
            <ElFormItem label="提交行为">
              <ElSegmented
                v-model="draft.submitBehavior"
                :options="[
                  { label: '跟随表单', value: 'AUTO' },
                  { label: '始终提交', value: 'INCLUDE' },
                  { label: '忽略提交', value: 'EXCLUDE' },
                ]"
              />
              <small>忽略提交只影响最终数据投影，字段仍可展示和参与页面联动。</small>
            </ElFormItem>
          </ElForm>
          <div class="designer-advanced-behavior__events">
            <article v-for="event in supportedEvents" :key="event">
              <div>
                <strong>{{ eventLabel(event) }}事件</strong>
                <small>{{ boundFlow(event)?.name ?? '尚未创建事件流' }}</small>
              </div>
              <ElButton
                v-if="!boundFlow(event)"
                text
                type="primary"
                @click="createEventFlow(event)"
              >
                创建
              </ElButton>
              <template v-else>
                <ElButton text type="primary" @click="editEventFlow(event)">编辑</ElButton>
                <ElButton text type="danger" @click="unbindEvent(event)">解绑</ElButton>
              </template>
            </article>
          </div>
        </section>
      </ElTabPane>
    </ElTabs>

    <ElAlert
      v-if="!editingFlow && diagnostics.length > 0"
      class="designer-advanced-behavior__diagnostics"
      :type="hasErrors ? 'error' : 'warning'"
      :closable="false"
      show-icon
    >
      <template #title>{{
        hasErrors ? '请修正错误后保存' : '配置可保存，但存在能力警告'
      }}</template>
      <button
        v-for="item in diagnostics.slice(0, 5)"
        :key="`${item.code}:${item.path}:${item.ruleId ?? ''}`"
        type="button"
        @click="locateDiagnostic(item)"
      >
        {{ item.message }}
      </button>
    </ElAlert>
  </DModal>
</template>

<script setup lang="ts">
import { computed, ref, reactive, watch } from 'vue'
import DModal from '../infrastructure/FormModalShell.vue'
import DxSvgIcon from '../infrastructure/FormIcon.vue'
import { createDefaultDesignerFieldBehavior } from '@daxiangme/form-core'
import {
  createDesignerStateRule,
  createDesignerValidationRule,
  createDesignerValueRule,
  diagnoseDesignerFieldBehaviorDraft,
  resolveDesignerValidationCatalog,
  summarizeDesignerStateRule,
  summarizeDesignerValidationRule,
  summarizeDesignerValueRule,
  type DesignerFieldBehaviorCapabilities,
  type DesignerFieldBehaviorDiagnostic,
  type DesignerValidationCatalogItem,
} from '@daxiangme/form-core'
import type {
  DesignerComponentEvent,
  DesignerDocument,
  DesignerEventFlow,
  DesignerField,
  DesignerFieldBehavior,
  DesignerFieldStateRule,
  DesignerValidationRule,
  DesignerValidationRuleType,
} from '@daxiangme/form-core'
import DesignerEventFlowWorkbench from './DesignerEventFlowWorkbench.vue'
import DesignerExpressionEditor from './DesignerExpressionEditor.vue'
import RuleListItem from './DesignerBehaviorRuleListItem.vue'
import RuleWorkbench from './DesignerBehaviorRuleWorkbench.vue'
import ValidationRuleConfiguration from './DesignerValidationRuleConfiguration.vue'

defineOptions({ name: 'DesignerAdvancedBehaviorEditor' })

const props = defineProps<{
  field: DesignerField
  document: DesignerDocument
  selectedNodeId: string
  supportedEvents: DesignerComponentEvent[]
  capabilities: DesignerFieldBehaviorCapabilities
}>()
const emit = defineEmits<{
  save: [payload: { behavior: DesignerFieldBehavior; eventFlows: DesignerEventFlow[] }]
}>()
const visibleModel = defineModel<boolean>({ default: false })
const activeTab = ref<DesignerFieldBehaviorDiagnostic['tab']>('state')
const draft = reactive<DesignerFieldBehavior>(createDefaultDesignerFieldBehavior())
const draftFlows = ref<DesignerEventFlow[]>([])
const selectedStateId = ref('')
const selectedValueId = ref('')
const selectedValidationId = ref('')
const editingFlowId = ref('')
const editingEvent = ref<DesignerComponentEvent>()
const booleanOptions = [
  { label: '是', value: true },
  { label: '否', value: false },
]
const allowCurrentRow = computed(
  () => props.field.entityCode !== props.document.dataSchema.rootEntity.code,
)
const validationCatalog = computed(() =>
  resolveDesignerValidationCatalog(props.document, props.field, props.capabilities),
)
const validationCatalogWithLegacy = computed<DesignerValidationCatalogItem[]>(() => {
  const result = [...validationCatalog.value]
  const existing = selectedValidationRule.value?.type
  if (existing && !result.some((item) => item.type === existing)) {
    result.push({
      type: existing,
      label: `历史规则 · ${existing}`,
      description: '当前组件不再适用该规则，保存前请确认是否保留',
      available: false,
      unavailableReason: '当前组件不适用',
    })
  }
  return result
})
const selectedStateRule = computed(() =>
  draft.stateRules.find((rule) => rule.id === selectedStateId.value),
)
const selectedValueRule = computed(() =>
  draft.valueRules.find((rule) => rule.id === selectedValueId.value),
)
const selectedValidationRule = computed(() =>
  draft.validationRules.find((rule) => rule.id === selectedValidationId.value),
)
const editingFlow = computed(() => draftFlows.value.find((flow) => flow.id === editingFlowId.value))
const diagnostics = computed(() =>
  diagnoseDesignerFieldBehaviorDraft({
    document: props.document,
    fieldId: props.field.id,
    behavior: cloneValue(draft),
    eventFlows: draftFlows.value,
    capabilities: props.capabilities,
  }),
)
const hasErrors = computed(() => diagnostics.value.some((item) => item.severity === 'ERROR'))

watch(
  visibleModel,
  (visible) => {
    if (!visible) return
    Object.assign(draft, cloneValue(props.field.behavior))
    draftFlows.value = cloneValue(props.document.eventFlows)
    selectedStateId.value = draft.stateRules[0]?.id ?? ''
    selectedValueId.value = draft.valueRules[0]?.id ?? ''
    selectedValidationId.value = draft.validationRules[0]?.id ?? ''
    editingFlowId.value = ''
    editingEvent.value = undefined
  },
  { immediate: true },
)

function addStateRule(): void {
  const rule = createDesignerStateRule(props.document, props.field)
  draft.stateRules.push(rule)
  selectedStateId.value = rule.id
}

function addValueRule(): void {
  const rule = createDesignerValueRule('FORMULA')
  draft.valueRules.push(rule)
  selectedValueId.value = rule.id
}

function addValidationRule(command: string | number | object): void {
  if (typeof command !== 'string') return
  const catalog = validationCatalog.value.find((item) => item.type === command)
  if (!catalog?.available) return
  const rule = createDesignerValidationRule(
    command as DesignerValidationRuleType,
    props.document,
    props.field,
    draft.validationRules.length + 1,
  )
  draft.validationRules.push(rule)
  selectedValidationId.value = rule.id
}

function changeValueMode(value: unknown): void {
  const rule = selectedValueRule.value
  if (!rule || (value !== 'FORMULA' && value !== 'LINKAGE') || rule.mode === value) return
  const index = draft.valueRules.findIndex((item) => item.id === rule.id)
  const replacement = createDesignerValueRule(value)
  replacement.id = rule.id
  replacement.expression = rule.expression
  replacement.condition = rule.condition
  draft.valueRules.splice(index, 1, replacement)
}

function changeValidationType(value: unknown): void {
  const rule = selectedValidationRule.value
  if (!rule || typeof value !== 'string' || rule.type === value) return
  const catalog = validationCatalog.value.find((item) => item.type === value)
  if (!catalog?.available) return
  const index = draft.validationRules.findIndex((item) => item.id === rule.id)
  const replacement = createDesignerValidationRule(
    value as DesignerValidationRuleType,
    props.document,
    props.field,
    index + 1,
  )
  Object.assign(replacement, {
    id: rule.id,
    name: rule.name,
    enabled: rule.enabled,
    trigger: rule.trigger,
    severity: rule.severity,
    message: rule.message,
    condition: rule.condition,
  })
  draft.validationRules.splice(index, 1, replacement)
}

function setSelectedValidationConfiguration(key: string, value: unknown): void {
  const rule = selectedValidationRule.value
  if (!rule) return
  rule.configuration = {
    ...(rule.configuration as unknown as Record<string, unknown>),
    [key]: value,
  } as DesignerValidationRule['configuration']
}

function toggleValueRuleCondition(enabled: boolean): void {
  const rule = selectedValueRule.value
  if (!rule) return
  rule.condition = enabled ? (rule.condition ?? defaultCondition()) : undefined
}

function toggleValidationCondition(enabled: boolean): void {
  const rule = selectedValidationRule.value
  if (!rule) return
  rule.condition = enabled ? (rule.condition ?? defaultCondition()) : undefined
}

function copyRule<T extends { id: string }>(items: T[], index: number, prefix: string): void {
  const source = items[index]
  if (!source) return
  const copy = cloneValue(source)
  copy.id = createId(prefix)
  if ('name' in copy && typeof copy.name === 'string') copy.name = `${copy.name}副本`
  items.splice(index + 1, 0, copy)
  selectRule(prefix, copy.id)
}

function removeRule<T extends { id: string }>(items: T[], index: number, prefix: string): void {
  const removed = items[index]
  if (!removed) return
  items.splice(index, 1)
  const selectedId =
    prefix === 'state'
      ? selectedStateId
      : prefix === 'value'
        ? selectedValueId
        : selectedValidationId
  if (selectedId.value === removed.id) selectedId.value = items[Math.max(0, index - 1)]?.id ?? ''
}

function moveRule<T>(items: T[], index: number, offset: -1 | 1): void {
  const target = index + offset
  if (target < 0 || target >= items.length) return
  const [item] = items.splice(index, 1)
  if (item) items.splice(target, 0, item)
}

function selectRule(prefix: string, id: string): void {
  if (prefix === 'state') selectedStateId.value = id
  if (prefix === 'value') selectedValueId.value = id
  if (prefix === 'validation') selectedValidationId.value = id
}

function boundFlow(event: DesignerComponentEvent): DesignerEventFlow | undefined {
  const code = draft.eventBindings[event]
  return code ? draftFlows.value.find((flow) => flow.code === code) : undefined
}

function createEventFlow(event: DesignerComponentEvent): void {
  const code = uniqueEventCode(event)
  const flow: DesignerEventFlow = {
    id: createId('flow'),
    code,
    name: `${props.field.label}${eventLabel(event)}事件`,
    trigger: { scope: 'COMPONENT', event, nodeId: props.selectedNodeId },
    enabled: true,
    steps: [],
  }
  draftFlows.value.push(flow)
  draft.eventBindings[event] = code
  editingEvent.value = event
  editingFlowId.value = flow.id
}

function editEventFlow(event: DesignerComponentEvent): void {
  const flow = boundFlow(event)
  if (!flow) return
  editingEvent.value = event
  editingFlowId.value = flow.id
}

function unbindEvent(event: DesignerComponentEvent): void {
  delete draft.eventBindings[event]
}

function finishEditingFlow(): void {
  editingFlowId.value = ''
  editingEvent.value = undefined
  activeTab.value = 'submit'
}

function stateRuleTitle(rule: DesignerFieldStateRule): string {
  return { VISIBLE: '显示状态', REQUIRED: '必填状态', DISABLED: '禁用状态' }[rule.target]
}

function tabLabel(
  tab: DesignerFieldBehaviorDiagnostic['tab'],
  label: string,
  count: number,
): string {
  const errors = diagnostics.value.filter(
    (item) => item.tab === tab && item.severity === 'ERROR',
  ).length
  return errors > 0 ? `${label} ${count} · ${errors} 错误` : `${label} ${count}`
}

function diagnosticsForRule(ruleId: string): DesignerFieldBehaviorDiagnostic[] {
  return diagnostics.value.filter((item) => item.ruleId === ruleId)
}

function locateDiagnostic(item: DesignerFieldBehaviorDiagnostic): void {
  activeTab.value = item.tab
  if (!item.ruleId) return
  selectRule(item.tab, item.ruleId)
}

function eventLabel(event: DesignerComponentEvent): string {
  return { CHANGE: '值变化', BLUR: '失焦', FOCUS: '聚焦', CLICK: '点击' }[event]
}

function defaultCondition() {
  const fieldId =
    props.document.dataSchema.fields.find((item) => item.entityCode === props.field.entityCode)
      ?.id ?? props.field.id
  return {
    kind: 'CALL' as const,
    function: 'NOT_EMPTY' as const,
    arguments: [
      {
        kind: 'FIELD' as const,
        fieldId,
        scope:
          props.field.entityCode === props.document.dataSchema.rootEntity.code
            ? ('ROOT' as const)
            : ('CURRENT_ROW' as const),
      },
    ],
  }
}

function uniqueEventCode(event: DesignerComponentEvent): string {
  const base = `${props.field.key}_${event.toLocaleLowerCase()}`
    .replace(/[^A-Za-z0-9_]/g, '_')
    .replace(/^[^A-Za-z]+/, 'event_')
    .slice(0, 56)
  const existing = new Set(draftFlows.value.map((flow) => flow.code))
  let candidate = base || 'event_component'
  let serial = 2
  while (existing.has(candidate)) candidate = `${base.slice(0, 52)}_${serial++}`
  return candidate
}

function save(): void {
  if (hasErrors.value) return
  emit('save', { behavior: cloneValue(draft), eventFlows: cloneValue(draftFlows.value) })
  visibleModel.value = false
}

function createId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().replaceAll('-', '')}`
}

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
</script>

<style scoped>
.designer-advanced-behavior {
  min-height: 590px;
}

.designer-advanced-behavior__event-heading {
  display: flex;
  align-items: center;
  margin-bottom: var(--daxiang-form-space-3);
  gap: var(--daxiang-form-space-2);
}

.designer-advanced-behavior__event-heading > div {
  display: flex;
  flex-direction: column;
}

.designer-advanced-behavior__detail-grid,
.designer-advanced-behavior__validation-meta {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 var(--daxiang-form-space-3);
}

.designer-advanced-behavior__validation-meta {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.designer-advanced-behavior__submit {
  min-height: 500px;
}

.designer-advanced-behavior__submit :deep(.el-segmented) {
  width: 100%;
}

.designer-advanced-behavior__submit small,
.designer-advanced-behavior__event-heading small {
  color: var(--el-text-color-secondary);
}

.designer-advanced-behavior__events {
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--el-border-color-lighter);
}

.designer-advanced-behavior__events article {
  display: flex;
  align-items: center;
  min-height: 64px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.designer-advanced-behavior__events article > div {
  display: flex;
  min-width: 0;
  flex: 1 1 0;
  flex-direction: column;
}

.designer-advanced-behavior__diagnostics {
  margin-top: var(--daxiang-form-space-3);
}

.designer-advanced-behavior__diagnostics :deep(.el-alert__content) {
  width: 100%;
}

.designer-advanced-behavior__diagnostics button {
  display: block;
  width: 100%;
  padding: 2px 0;
  color: inherit;
  text-align: left;
  background: transparent;
  border: 0;
  cursor: pointer;
}

@media (width <= 860px) {
  .designer-advanced-behavior__validation-meta,
  .designer-advanced-behavior__detail-grid {
    grid-template-columns: 1fr;
  }
}
</style>
