<template>
  <DModal
    v-model="visibleModel"
    :title="`${containerTitle} · 显示条件`"
    width="min(960px, calc(100vw - 32px))"
    confirm-text="保存配置"
    :confirm-disabled="hasErrors"
    :flush-content-vertical="true"
    @confirm="save"
  >
    <RuleWorkbench
      title="显示条件"
      description="条件成立时改变整个容器的显示状态；隐藏后内部字段不校验、不提交"
      :empty="draft.stateRules.length === 0"
      @add="addRule"
    >
      <template #list>
        <RuleListItem
          v-for="(rule, index) in draft.stateRules"
          :key="rule.id"
          :active="selectedRuleId === rule.id"
          :title="rule.valueWhenTrue ? '条件成立时显示' : '条件成立时隐藏'"
          :summary="summarizeDesignerContainerStateRule(rule)"
          :diagnostics="diagnosticsForRule(rule.id)"
          :move-up-disabled="index === 0"
          :move-down-disabled="index === draft.stateRules.length - 1"
          @click="selectedRuleId = rule.id"
          @copy="copyRule(index)"
          @delete="removeRule(index)"
          @move-up="moveRule(index, -1)"
          @move-down="moveRule(index, 1)"
        />
      </template>
      <template #detail>
        <ElForm v-if="selectedRule" label-position="top">
          <ElFormItem label="条件成立时">
            <ElSegmented
              :model-value="selectedRule.valueWhenTrue"
              :options="[
                { label: '显示', value: true },
                { label: '隐藏', value: false },
              ]"
              @update:model-value="setRuleWhenTrue"
            />
          </ElFormItem>
          <ElFormItem label="执行条件">
            <DesignerExpressionEditor
              v-model="selectedRule.condition"
              :fields="document.dataSchema.fields"
              :document="document"
              :current-entity-code="entityCode"
              :variables="document.variables"
              :allow-current-row="allowCurrentRow"
              mode="condition"
            />
          </ElFormItem>
        </ElForm>
      </template>
    </RuleWorkbench>
  </DModal>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import DModal from '../infrastructure/FormModalShell.vue'
import {
  createDefaultDesignerContainerBehavior,
  createDesignerContainerStateRule,
  diagnoseDesignerContainerBehaviorDraft,
  summarizeDesignerContainerStateRule,
} from '@daxiangme/form-core'
import type {
  DesignerContainerBehavior,
  DesignerContainerNode,
  DesignerDocument,
} from '@daxiangme/form-core'
import DesignerExpressionEditor from './DesignerExpressionEditor.vue'
import RuleListItem from './DesignerBehaviorRuleListItem.vue'
import RuleWorkbench from './DesignerBehaviorRuleWorkbench.vue'

defineOptions({ name: 'DesignerContainerConditionEditor' })

const props = defineProps<{
  node: DesignerContainerNode
  document: DesignerDocument
  entityCode: string
}>()
const emit = defineEmits<{ save: [behavior: DesignerContainerBehavior] }>()
const visibleModel = defineModel<boolean>({ default: false })
const draft = reactive<DesignerContainerBehavior>(createDefaultDesignerContainerBehavior())
const selectedRuleId = ref('')
const containerTitle = computed(() => {
  const title = props.node.configuration.title
  return typeof title === 'string' && title.trim() ? title : '容器'
})
const allowCurrentRow = computed(
  () => props.entityCode !== props.document.dataSchema.rootEntity.code,
)
const selectedRule = computed(() =>
  draft.stateRules.find((rule) => rule.id === selectedRuleId.value),
)
const diagnostics = computed(() =>
  diagnoseDesignerContainerBehaviorDraft({
    document: props.document,
    nodeId: props.node.id,
    behavior: cloneValue(draft),
  }),
)
const hasErrors = computed(() => diagnostics.value.some((item) => item.severity === 'ERROR'))

watch(
  visibleModel,
  (visible) => {
    if (!visible) return
    Object.assign(
      draft,
      cloneValue(props.node.behavior ?? createDefaultDesignerContainerBehavior()),
    )
    selectedRuleId.value = draft.stateRules[0]?.id ?? ''
  },
  { immediate: true },
)

function diagnosticsForRule(ruleId: string) {
  return diagnostics.value.filter((item) => item.ruleId === ruleId)
}

function setRuleWhenTrue(value: boolean | string | number): void {
  const rule = selectedRule.value
  if (!rule || typeof value !== 'boolean') return
  rule.valueWhenTrue = value
  rule.valueWhenFalse = !value
}

function addRule(): void {
  const rule = createDesignerContainerStateRule(props.document, props.entityCode)
  draft.stateRules.push(rule)
  selectedRuleId.value = rule.id
}

function copyRule(index: number): void {
  const source = draft.stateRules[index]
  if (!source) return
  const copy = cloneValue(source)
  copy.id = `state-${crypto.randomUUID().replaceAll('-', '')}`
  draft.stateRules.splice(index + 1, 0, copy)
  selectedRuleId.value = copy.id
}

function removeRule(index: number): void {
  const removed = draft.stateRules[index]
  if (!removed) return
  draft.stateRules.splice(index, 1)
  if (selectedRuleId.value === removed.id)
    selectedRuleId.value = draft.stateRules[Math.max(0, index - 1)]?.id ?? ''
}

function moveRule(index: number, offset: -1 | 1): void {
  const target = index + offset
  if (target < 0 || target >= draft.stateRules.length) return
  const [item] = draft.stateRules.splice(index, 1)
  if (item) draft.stateRules.splice(target, 0, item)
}

function save(): void {
  if (hasErrors.value) return
  emit('save', cloneValue(draft))
  visibleModel.value = false
}

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
</script>
