<template>
  <section class="designer-validation-rule-configuration">
    <template v-if="['LENGTH', 'RANGE', 'SELECTION'].includes(rule.type)">
      <ElFormItem label="最小值">
        <ElInputNumber
          :model-value="numberValue('minimum')"
          :min="rule.type === 'RANGE' ? -1000000000000 : 0"
          controls-position="right"
          @change="update('minimum', $event)"
        />
      </ElFormItem>
      <ElFormItem label="最大值">
        <ElInputNumber
          :model-value="numberValue('maximum')"
          :min="rule.type === 'RANGE' ? -1000000000000 : 0"
          controls-position="right"
          @change="update('maximum', $event)"
        />
      </ElFormItem>
    </template>
    <ElFormItem v-else-if="rule.type === 'PRECISION'" label="最大小数位数">
      <ElInputNumber
        :model-value="numberValue('scale')"
        :min="0"
        :max="12"
        controls-position="right"
        @change="update('scale', $event)"
      />
    </ElFormItem>
    <ElFormItem v-else-if="rule.type === 'FORMAT'" label="格式">
      <ElSelect :model-value="textValue('format')" @update:model-value="update('format', $event)">
        <ElOption label="邮箱" value="EMAIL" />
        <ElOption label="电话号码" value="PHONE" />
        <ElOption label="稳定编码" value="IDENTIFIER" />
      </ElSelect>
    </ElFormItem>
    <ElFormItem v-else-if="rule.type === 'REGEX'" label="安全正则表达式">
      <ElInput
        :model-value="textValue('pattern')"
        placeholder="例如 ^[A-Za-z0-9_]+$"
        maxlength="200"
        @update:model-value="update('pattern', $event)"
      />
    </ElFormItem>
    <template v-else-if="rule.type === 'DATE'">
      <ElFormItem label="最早时间">
        <ElDatePicker
          :model-value="textValue('minimum')"
          type="datetime"
          value-format="YYYY-MM-DD HH:mm:ss"
          @update:model-value="update('minimum', $event)"
        />
      </ElFormItem>
      <ElFormItem label="最晚时间">
        <ElDatePicker
          :model-value="textValue('maximum')"
          type="datetime"
          value-format="YYYY-MM-DD HH:mm:ss"
          @update:model-value="update('maximum', $event)"
        />
      </ElFormItem>
    </template>
    <template v-else-if="rule.type === 'FILE'">
      <ElFormItem label="最多文件数">
        <ElInputNumber
          :model-value="numberValue('maximumCount')"
          :min="1"
          :max="100"
          @change="update('maximumCount', $event)"
        />
      </ElFormItem>
      <ElFormItem label="单文件大小（MB）">
        <ElInputNumber
          :model-value="numberValue('maximumSizeMb')"
          :min="1"
          :max="1024"
          @change="update('maximumSizeMb', $event)"
        />
      </ElFormItem>
      <ElFormItem label="允许类型">
        <ElInput
          :model-value="textValue('accept')"
          placeholder=".pdf,image/*"
          @update:model-value="update('accept', $event)"
        />
      </ElFormItem>
    </template>
    <template v-else-if="rule.type === 'COMPARE_FIELD'">
      <ElFormItem label="比较字段">
        <ElSelect
          :model-value="textValue('fieldId')"
          @update:model-value="update('fieldId', $event)"
        >
          <ElOption
            v-for="candidate in comparisonFields"
            :key="candidate.id"
            :label="candidate.label"
            :value="candidate.id"
          />
        </ElSelect>
      </ElFormItem>
      <ElFormItem label="比较方式">
        <ElSelect
          :model-value="textValue('operator')"
          @update:model-value="update('operator', $event)"
        >
          <ElOption label="等于" value="EQ" />
          <ElOption label="不等于" value="NE" />
          <ElOption label="大于" value="GT" />
          <ElOption label="大于等于" value="GTE" />
          <ElOption label="小于" value="LT" />
          <ElOption label="小于等于" value="LTE" />
        </ElSelect>
      </ElFormItem>
    </template>
    <ElFormItem v-else-if="rule.type === 'EXPRESSION'" label="验证表达式">
      <DesignerExpressionEditor
        :model-value="expressionValue"
        :fields="document.dataSchema.fields"
        :variables="document.variables"
        :allow-current-row="allowCurrentRow"
        mode="condition"
        @update:model-value="update('expression', $event)"
      />
    </ElFormItem>
    <template v-else-if="rule.type === 'SUBTABLE'">
      <ElFormItem label="关联子表">
        <ElSelect
          :model-value="textValue('containerId')"
          @update:model-value="update('containerId', $event)"
        >
          <ElOption
            v-for="container in subtableContainers"
            :key="container.id"
            :label="container.label"
            :value="container.id"
          />
        </ElSelect>
      </ElFormItem>
      <ElFormItem label="最少行数">
        <ElInputNumber
          :model-value="numberValue('minimumRows')"
          :min="0"
          @change="update('minimumRows', $event)"
        />
      </ElFormItem>
      <ElFormItem label="最多行数">
        <ElInputNumber
          :model-value="numberValue('maximumRows')"
          :min="0"
          @change="update('maximumRows', $event)"
        />
      </ElFormItem>
    </template>
    <template v-else-if="rule.type === 'REMOTE'">
      <ElFormItem label="Provider 编码">
        <ElInput
          :model-value="textValue('provider')"
          @update:model-value="update('provider', $event)"
        />
      </ElFormItem>
      <ElFormItem label="验证器编码">
        <ElInput
          :model-value="textValue('validatorId')"
          @update:model-value="update('validatorId', $event)"
        />
      </ElFormItem>
      <ElTag type="warning" effect="plain">需要 Host 远程验证 Adapter</ElTag>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type {
  DesignerContainerNode,
  DesignerDocument,
  DesignerExpression,
  DesignerField,
  DesignerValidationRule,
} from '@daxiangme/form-core'
import DesignerExpressionEditor from './DesignerExpressionEditor.vue'

defineOptions({ name: 'DesignerValidationRuleConfiguration' })

const props = defineProps<{
  rule: DesignerValidationRule
  document: DesignerDocument
  field: DesignerField
  allowCurrentRow: boolean
}>()
const emit = defineEmits<{ updateConfiguration: [key: string, value: unknown] }>()
const configuration = computed(() => props.rule.configuration as unknown as Record<string, unknown>)
const comparisonFields = computed(() =>
  props.document.dataSchema.fields.filter(
    (candidate) =>
      candidate.id !== props.field.id && candidate.entityCode === props.field.entityCode,
  ),
)
const expressionValue = computed(() => {
  const value = configuration.value.expression
  return typeof value === 'object' && value !== null ? (value as DesignerExpression) : undefined
})
const subtableContainers = computed(() => {
  const result: Array<{ id: string; label: string }> = []
  const visit = (nodes: DesignerDocument['uiSchema']['root']): void => {
    for (const node of nodes) {
      if (node.nodeType !== 'CONTAINER') continue
      if (['row-subtable', 'block-subtable'].includes(node.componentType)) {
        result.push({ id: node.id, label: containerLabel(node) })
      }
      node.slots.forEach((slot) => visit(slot.children))
    }
  }
  visit(props.document.uiSchema.root)
  props.document.uiSchema.overlays.forEach((overlay) => visit(overlay.root))
  return result
})

function update(key: string, value: unknown): void {
  emit('updateConfiguration', key, value)
}

function numberValue(key: string): number | undefined {
  const value = configuration.value[key]
  return typeof value === 'number' ? value : undefined
}

function textValue(key: string): string {
  const value = configuration.value[key]
  return typeof value === 'string' ? value : ''
}

function containerLabel(container: DesignerContainerNode): string {
  const title = container.configuration.title
  return typeof title === 'string' && title ? title : container.componentType
}
</script>

<style scoped>
.designer-validation-rule-configuration {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 var(--daxiang-form-space-3);
}

.designer-validation-rule-configuration > :only-child,
.designer-validation-rule-configuration > .el-tag {
  grid-column: 1 / -1;
}

.designer-validation-rule-configuration :deep(.el-select),
.designer-validation-rule-configuration :deep(.el-input-number),
.designer-validation-rule-configuration :deep(.el-date-editor) {
  width: 100%;
}

@media (width <= 760px) {
  .designer-validation-rule-configuration {
    grid-template-columns: 1fr;
  }
}
</style>
