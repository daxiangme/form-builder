<template>
  <div class="designer-expression-editor" :class="{ 'is-nested': depth > 0 }">
    <div class="designer-expression-editor__node">
      <ElSelect
        :model-value="expression.kind"
        class="designer-expression-editor__kind"
        aria-label="表达式节点类型"
        @update:model-value="changeKind"
      >
        <ElOption label="固定值" value="LITERAL" />
        <ElOption label="字段值" value="FIELD" />
        <ElOption label="表单变量" value="VARIABLE" />
        <ElOption label="运行上下文" value="CONTEXT" />
        <ElOption label="函数" value="CALL" />
      </ElSelect>

      <template v-if="expression.kind === 'LITERAL'">
        <ElSelect :model-value="literalType" @update:model-value="changeLiteralType">
          <ElOption label="文本" value="STRING" />
          <ElOption label="数值" value="NUMBER" />
          <ElOption label="布尔" value="BOOLEAN" />
          <ElOption label="空值" value="NULL" />
        </ElSelect>
        <ElInput
          v-if="literalType === 'STRING'"
          :model-value="String(expression.value ?? '')"
          placeholder="输入文本"
          @update:model-value="updateLiteral"
        />
        <ElInputNumber
          v-else-if="literalType === 'NUMBER'"
          :model-value="typeof expression.value === 'number' ? expression.value : 0"
          controls-position="right"
          @update:model-value="updateLiteral"
        />
        <ElSegmented
          v-else-if="literalType === 'BOOLEAN'"
          :model-value="expression.value === true"
          :options="[
            { label: '是', value: true },
            { label: '否', value: false },
          ]"
          @update:model-value="updateLiteral"
        />
        <ElText v-else type="info">null</ElText>
      </template>

      <template v-else-if="expression.kind === 'FIELD'">
        <ElSelect
          v-if="allowCurrentRow"
          :model-value="expression.scope"
          aria-label="字段作用域"
          @update:model-value="updateFieldScope"
        >
          <ElOption label="主表字段" value="ROOT" />
          <ElOption label="当前子表行" value="CURRENT_ROW" />
          <ElOption label="祖先行" value="ANCESTOR" />
        </ElSelect>
        <ElInputNumber
          v-if="expression.scope === 'ANCESTOR'"
          :model-value="expression.ancestorDepth ?? 1"
          :min="1"
          :max="16"
          aria-label="祖先层数（1 为直接父行）"
          @update:model-value="updateAncestorDepth"
        />
        <ElSelect
          :model-value="expression.fieldId"
          filterable
          aria-label="表达式字段"
          @update:model-value="updateFieldId"
        >
          <ElOption
            v-for="field in availableFields"
            :key="field.id"
            :label="field.label"
            :value="field.id"
          />
        </ElSelect>
      </template>

      <ElSelect
        v-else-if="expression.kind === 'VARIABLE'"
        :model-value="expression.variableCode"
        aria-label="表单变量"
        @update:model-value="updateVariable"
      >
        <ElOption
          v-for="variable in variables"
          :key="variable.code"
          :label="variable.name"
          :value="variable.code"
        />
      </ElSelect>

      <ElSelect
        v-else-if="expression.kind === 'CONTEXT'"
        :model-value="expression.key"
        aria-label="运行上下文"
        @update:model-value="updateContext"
      >
        <ElOption label="运行模式" value="RUNTIME_MODE" />
        <ElOption label="设备类型" value="DEVICE" />
        <ElOption label="当前用户" value="CURRENT_USER_ID" />
        <ElOption label="当前租户" value="CURRENT_TENANT_ID" />
        <ElOption label="当前时间" value="NOW" />
      </ElSelect>

      <template v-else>
        <ElSelect
          :model-value="expression.function"
          filterable
          aria-label="表达式函数"
          @update:model-value="changeFunction"
        >
          <ElOptionGroup v-for="group in functionGroups" :key="group.label" :label="group.label">
            <ElOption
              v-for="item in group.options"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </ElOptionGroup>
        </ElSelect>
        <ElButton
          v-if="isVariadicFunction(expression.function)"
          text
          :disabled="expression.arguments.length >= 8"
          @click="addArgument"
        >
          <DxSvgIcon icon="ri:add-line" />参数
        </ElButton>
      </template>
    </div>

    <div v-if="expression.kind === 'CALL'" class="designer-expression-editor__arguments">
      <div
        v-for="(argument, index) in expression.arguments"
        :key="index"
        class="designer-expression-editor__argument"
      >
        <span>{{ argumentLabel(expression.function, index) }}</span>
        <DesignerExpressionEditor
          :model-value="argument"
          :fields="fields"
          :document="document"
          :current-entity-code="currentEntityCode"
          :variables="variables"
          :mode="argumentMode(expression.function, index)"
          :allow-current-row="allowCurrentRow"
          :depth="depth + 1"
          @update:model-value="updateArgument(index, $event)"
        />
        <ElButton
          v-if="canRemoveArgument(expression.function, expression.arguments.length)"
          text
          type="danger"
          aria-label="删除函数参数"
          @click="removeArgument(index)"
        >
          <DxSvgIcon icon="ri:delete-bin-line" />
        </ElButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import DxSvgIcon from '../infrastructure/FormIcon.vue'
import type {
  DesignerDocument,
  DesignerExpression,
  DesignerExpressionContextKey,
  DesignerExpressionFieldScope,
  DesignerExpressionFunction,
  DesignerField,
  DesignerVariableDefinition,
} from '@daxiangme/form-core'

defineOptions({ name: 'DesignerExpressionEditor' })

const props = withDefaults(
  defineProps<{
    modelValue?: DesignerExpression
    fields: DesignerField[]
    /** 作用域选择所依据的规范实体和关系目录。 */
    document?: DesignerDocument
    /** 当前行的语义实体编码。 */
    currentEntityCode?: string
    variables: DesignerVariableDefinition[]
    mode: 'condition' | 'value'
    allowCurrentRow?: boolean
    depth?: number
  }>(),
  { allowCurrentRow: false, depth: 0 },
)
const emit = defineEmits<{ 'update:modelValue': [expression: DesignerExpression] }>()
const expression = computed<DesignerExpression>(
  () => props.modelValue ?? defaultExpression(props.mode),
)
const literalType = computed<'STRING' | 'NUMBER' | 'BOOLEAN' | 'NULL'>(() => {
  if (expression.value.kind !== 'LITERAL') return 'STRING'
  if (expression.value.value === null) return 'NULL'
  if (typeof expression.value.value === 'number') return 'NUMBER'
  if (typeof expression.value.value === 'boolean') return 'BOOLEAN'
  return 'STRING'
})
const functionGroups = computed(() => {
  const conditionOptions = [
    ['并且', 'AND'],
    ['或者', 'OR'],
    ['取反', 'NOT'],
    ['等于', 'EQ'],
    ['不等于', 'NE'],
    ['大于', 'GT'],
    ['大于等于', 'GTE'],
    ['小于', 'LT'],
    ['小于等于', 'LTE'],
    ['为空', 'EMPTY'],
    ['不为空', 'NOT_EMPTY'],
    ['属于集合', 'IN'],
    ['包含', 'CONTAINS'],
  ] as const
  const valueOptions = [
    ['相加', 'ADD'],
    ['相减', 'SUBTRACT'],
    ['相乘', 'MULTIPLY'],
    ['相除', 'DIVIDE'],
    ['拼接文本', 'CONCAT'],
    ['首个非空值', 'COALESCE'],
    ['长度', 'LENGTH'],
    ['条件取值', 'IF'],
  ] as const
  const convert = (items: ReadonlyArray<readonly [string, DesignerExpressionFunction]>) =>
    items.map(([label, value]) => ({ label, value }))
  return props.mode === 'condition'
    ? [{ label: '逻辑与比较', options: convert(conditionOptions) }]
    : [
        { label: '计算与文本', options: convert(valueOptions) },
        { label: '逻辑与比较', options: convert(conditionOptions) },
      ]
})

function changeKind(value: unknown): void {
  if (value === 'LITERAL') emit('update:modelValue', { kind: 'LITERAL', value: '' })
  if (value === 'FIELD') {
    emit('update:modelValue', { kind: 'FIELD', fieldId: props.fields[0]?.id ?? '', scope: 'ROOT' })
  }
  if (value === 'VARIABLE') {
    emit('update:modelValue', { kind: 'VARIABLE', variableCode: props.variables[0]?.code ?? '' })
  }
  if (value === 'CONTEXT') emit('update:modelValue', { kind: 'CONTEXT', key: 'NOW' })
  if (value === 'CALL')
    emit('update:modelValue', createCall(props.mode === 'condition' ? 'EQ' : 'ADD'))
}

function changeLiteralType(value: unknown): void {
  if (value === 'STRING') emit('update:modelValue', { kind: 'LITERAL', value: '' })
  if (value === 'NUMBER') emit('update:modelValue', { kind: 'LITERAL', value: 0 })
  if (value === 'BOOLEAN') emit('update:modelValue', { kind: 'LITERAL', value: false })
  if (value === 'NULL') emit('update:modelValue', { kind: 'LITERAL', value: null })
}

function updateLiteral(value: unknown): void {
  if (['string', 'number', 'boolean'].includes(typeof value) || value === null) {
    emit('update:modelValue', { kind: 'LITERAL', value: value as string | number | boolean | null })
  }
}

function updateFieldId(value: unknown): void {
  if (expression.value.kind === 'FIELD' && typeof value === 'string') {
    emit('update:modelValue', { ...expression.value, fieldId: value })
  }
}

function updateFieldScope(value: unknown): void {
  if (
    expression.value.kind === 'FIELD' &&
    (value === 'ROOT' ||
      ((value === 'CURRENT_ROW' || value === 'ANCESTOR') && props.allowCurrentRow))
  ) {
    const scope = value as DesignerExpressionFieldScope
    const ancestorDepth = scope === 'ANCESTOR' ? 1 : undefined
    const candidates = fieldsForScope(scope, ancestorDepth)
    emit('update:modelValue', {
      ...expression.value,
      scope,
      ancestorDepth,
      fieldId:
        candidates.find(
          (field) => expression.value.kind === 'FIELD' && field.id === expression.value.fieldId,
        )?.id ??
        candidates[0]?.id ??
        '',
    })
  }
}

const availableFields = computed(() =>
  expression.value.kind === 'FIELD'
    ? fieldsForScope(expression.value.scope, expression.value.ancestorDepth)
    : props.fields,
)

/** 只列出根、当前行或指定祖先的合法字段，不允许跨父行选择。 */
function fieldsForScope(scope: DesignerExpressionFieldScope, ancestorDepth = 1): DesignerField[] {
  const document = props.document
  if (!document) return props.fields
  if (scope === 'ROOT')
    return props.fields.filter((field) => field.entityCode === document.dataSchema.rootEntity.code)
  const currentCode = props.currentEntityCode
  if (!currentCode) return []
  const currentRelations = document.dataSchema.relations.filter(
    (relation) =>
      relation.childEntity.code === currentCode ||
      (relation.kind === 'MANY_TO_MANY' && relation.targetEntity.code === currentCode),
  )
  if (scope === 'CURRENT_ROW') {
    const codes = new Set([
      currentCode,
      ...currentRelations.flatMap((relation) =>
        relation.kind === 'MANY_TO_MANY'
          ? [relation.childEntity.code, relation.targetEntity.code]
          : [relation.childEntity.code],
      ),
    ])
    return props.fields.filter((field) => codes.has(field.entityCode))
  }
  let entityIds = new Set(currentRelations.map((relation) => relation.parentEntityId))
  for (let depth = 1; depth < ancestorDepth; depth += 1)
    entityIds = new Set(
      document.dataSchema.relations
        .filter((relation) => entityIds.has(relation.childEntity.id))
        .map((relation) => relation.parentEntityId),
    )
  const codes = new Set(
    document.dataSchema.entities
      .filter((entity) => entityIds.has(entity.id))
      .map((entity) => entity.code),
  )
  return props.fields.filter((field) => codes.has(field.entityCode))
}

function updateAncestorDepth(value: number | undefined): void {
  if (expression.value.kind !== 'FIELD' || !value || !Number.isInteger(value)) return
  const candidates = fieldsForScope('ANCESTOR', value)
  const fieldId =
    candidates.find(
      (field) => expression.value.kind === 'FIELD' && field.id === expression.value.fieldId,
    )?.id ??
    candidates[0]?.id ??
    ''
  emit('update:modelValue', { ...expression.value, ancestorDepth: value, fieldId })
}

function updateVariable(value: unknown): void {
  if (typeof value === 'string')
    emit('update:modelValue', { kind: 'VARIABLE', variableCode: value })
}

function updateContext(value: unknown): void {
  if (
    ['RUNTIME_MODE', 'DEVICE', 'CURRENT_USER_ID', 'CURRENT_TENANT_ID', 'NOW'].includes(
      String(value),
    )
  ) {
    emit('update:modelValue', { kind: 'CONTEXT', key: value as DesignerExpressionContextKey })
  }
}

function changeFunction(value: unknown): void {
  if (!isExpressionFunction(value)) return
  const next = createCall(value)
  const current = expression.value
  if (current.kind === 'CALL') {
    next.arguments = next.arguments.map((fallback, index) => current.arguments[index] ?? fallback)
  }
  emit('update:modelValue', next)
}

function createCall(
  functionName: DesignerExpressionFunction,
): Extract<DesignerExpression, { kind: 'CALL' }> {
  return {
    kind: 'CALL',
    function: functionName,
    arguments: Array.from({ length: minimumArgumentCount(functionName) }, (_, index) =>
      defaultArgument(functionName, index),
    ),
  }
}

function updateArgument(index: number, value: DesignerExpression): void {
  if (expression.value.kind !== 'CALL') return
  const argumentsList = [...expression.value.arguments]
  argumentsList[index] = value
  emit('update:modelValue', { ...expression.value, arguments: argumentsList })
}

function addArgument(): void {
  if (expression.value.kind !== 'CALL' || expression.value.arguments.length >= 8) return
  emit('update:modelValue', {
    ...expression.value,
    arguments: [
      ...expression.value.arguments,
      defaultArgument(expression.value.function, expression.value.arguments.length),
    ],
  })
}

function removeArgument(index: number): void {
  if (
    expression.value.kind !== 'CALL' ||
    !canRemoveArgument(expression.value.function, expression.value.arguments.length)
  )
    return
  emit('update:modelValue', {
    ...expression.value,
    arguments: expression.value.arguments.filter((_, argumentIndex) => argumentIndex !== index),
  })
}

function minimumArgumentCount(functionName: DesignerExpressionFunction): number {
  if (['NOT', 'EMPTY', 'NOT_EMPTY', 'LENGTH'].includes(functionName)) return 1
  if (functionName === 'IF') return 3
  return 2
}

function isVariadicFunction(functionName: DesignerExpressionFunction): boolean {
  return ['AND', 'OR', 'CONCAT', 'COALESCE'].includes(functionName)
}

function canRemoveArgument(functionName: DesignerExpressionFunction, count: number): boolean {
  return isVariadicFunction(functionName) && count > minimumArgumentCount(functionName)
}

function defaultArgument(
  functionName: DesignerExpressionFunction,
  index: number,
): DesignerExpression {
  if (['AND', 'OR', 'NOT'].includes(functionName) || (functionName === 'IF' && index === 0)) {
    return { kind: 'LITERAL', value: true }
  }
  if (['ADD', 'SUBTRACT', 'MULTIPLY', 'DIVIDE'].includes(functionName)) {
    return { kind: 'LITERAL', value: 0 }
  }
  if (props.fields[0]) return { kind: 'FIELD', fieldId: props.fields[0].id, scope: 'ROOT' }
  return { kind: 'LITERAL', value: null }
}

function argumentMode(
  functionName: DesignerExpressionFunction,
  index: number,
): 'condition' | 'value' {
  return ['AND', 'OR', 'NOT'].includes(functionName) || (functionName === 'IF' && index === 0)
    ? 'condition'
    : 'value'
}

function argumentLabel(functionName: DesignerExpressionFunction, index: number): string {
  if (functionName === 'IF') return ['条件', '成立时', '不成立时'][index] ?? `参数 ${index + 1}`
  if (['EQ', 'NE', 'GT', 'GTE', 'LT', 'LTE', 'IN', 'CONTAINS'].includes(functionName)) {
    return index === 0 ? '左值' : '右值'
  }
  return `参数 ${index + 1}`
}

function defaultExpression(mode: 'condition' | 'value'): DesignerExpression {
  return mode === 'condition' ? createCall('EQ') : { kind: 'LITERAL', value: null }
}

function isExpressionFunction(value: unknown): value is DesignerExpressionFunction {
  return functionGroups.value.some((group) => group.options.some((item) => item.value === value))
}
</script>

<style scoped>
.designer-expression-editor {
  display: flex;
  width: 100%;
  min-width: 0;
  padding: var(--daxiang-form-space-2);
  flex-direction: column;
  background: var(--el-fill-color-extra-light);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--el-border-radius-base);
  gap: var(--daxiang-form-space-2);
}

.designer-expression-editor.is-nested {
  background: var(--el-bg-color);
}

.designer-expression-editor__node {
  display: grid;
  min-width: 0;
  align-items: center;
  grid-template-columns: minmax(110px, 0.7fr) minmax(140px, 1fr) minmax(160px, 1.3fr);
  gap: var(--daxiang-form-space-2);
}

.designer-expression-editor__kind {
  min-width: 0;
}

.designer-expression-editor__arguments {
  display: flex;
  padding-left: var(--daxiang-form-space-3);
  flex-direction: column;
  border-left: 2px solid var(--el-color-primary-light-7);
  gap: var(--daxiang-form-space-2);
}

.designer-expression-editor__argument {
  display: grid;
  min-width: 0;
  align-items: start;
  grid-template-columns: 56px minmax(0, 1fr) auto;
  gap: var(--daxiang-form-space-2);
}

.designer-expression-editor__argument > span {
  padding-top: 8px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

@media (width <= 720px) {
  .designer-expression-editor__node {
    grid-template-columns: 1fr;
  }

  .designer-expression-editor__arguments {
    padding-left: var(--daxiang-form-space-2);
  }

  .designer-expression-editor__argument {
    grid-template-columns: 1fr auto;
  }

  .designer-expression-editor__argument > span {
    grid-column: 1 / -1;
  }
}
</style>
