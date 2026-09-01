import {
  collectDesignerExpressionFieldIds,
  evaluateDesignerCondition,
  evaluateDesignerExpression,
  resolveDesignerFieldEvaluationOrder,
} from './expression'
import type {
  DesignerDocument,
  DesignerExpression,
  DesignerExpressionRuntimeContext,
  DesignerField,
  DesignerFieldFeedback,
  DesignerFieldValueRule,
  DesignerLinkageConfirmationAdapter,
  DesignerRemoteValidationAdapter,
  DesignerResolvedFieldState,
  DesignerRuntimeValueStore,
  DesignerValidationResult,
  DesignerValidationRule,
} from './types'

/** 为根字段、模块字段或子表行生成互不冲突的反馈键。 */
export function createDesignerFieldFeedbackKey(
  fieldId: string,
  context: { viewCode?: string; containerId?: string; rowId?: string } = {},
): string {
  return [
    context.viewCode ?? 'main',
    context.containerId ?? 'root',
    context.rowId ?? 'root',
    fieldId,
  ].join(':')
}

/** 将同一字段的一组验证结果折叠为错误与警告双通道。 */
export function projectDesignerFieldFeedback(
  results: DesignerValidationResult[],
): DesignerFieldFeedback | undefined {
  const error = results.find((item) => item.severity === 'ERROR')?.message
  const warning = results.find((item) => item.severity === 'WARNING')?.message
  return error || warning ? { error, warning } : undefined
}

/** 根据静态配置和条件规则计算字段最终显示、必填及禁用状态。 */
export function resolveDesignerFieldState(
  field: DesignerField,
  runtime: DesignerExpressionRuntimeContext,
): DesignerResolvedFieldState {
  const state: DesignerResolvedFieldState = {
    visible: field.componentType !== 'hidden' && !field.display.hidden,
    required: field.required,
    disabled:
      field.display.readonly || field.behavior.valueRules.some((rule) => rule.mode === 'FORMULA'),
  }
  for (const rule of field.behavior.stateRules) {
    const value = evaluateDesignerCondition(rule.condition, runtime)
      ? rule.valueWhenTrue
      : (rule.valueWhenFalse ?? stateTargetValue(state, rule.target))
    if (rule.target === 'VISIBLE') state.visible = value
    if (rule.target === 'REQUIRED') state.required = value
    if (rule.target === 'DISABLED') state.disabled = value
  }
  if (field.behavior.valueRules.some((rule) => rule.mode === 'FORMULA')) state.disabled = true
  return state
}

/** 按依赖拓扑执行字段计算与联动，并直接更新当前运行值副本。 */
export async function applyDesignerValueRules(
  document: DesignerDocument,
  valueStore: DesignerRuntimeValueStore,
  runtime: Omit<DesignerExpressionRuntimeContext, 'fields'>,
  options: {
    phase?: 'INITIALIZE' | 'CHANGE'
    changedFieldIds?: Iterable<string>
    confirmationAdapter?: DesignerLinkageConfirmationAdapter
  } = {},
): Promise<string[]> {
  const { orderedFields, diagnostics } = resolveDesignerFieldEvaluationOrder(document)
  if (diagnostics.length > 0) return diagnostics.map((item) => item.message)
  const failures: string[] = []
  const phase = options.phase ?? 'INITIALIZE'
  const dirtyFieldIds = new Set(options.changedFieldIds ?? [])
  for (const field of orderedFields) {
    if (field.entityCode !== document.dataSchema.rootEntity.code) continue
    for (const rule of field.behavior.valueRules) {
      if (!shouldExecuteValueRule(rule, phase, dirtyFieldIds)) continue
      const context: DesignerExpressionRuntimeContext = { ...runtime, fields: valueStore.fields }
      if (rule.condition && !evaluateDesignerCondition(rule.condition, context)) continue
      try {
        const nextValue = cloneValue(evaluateDesignerExpression(rule.expression, context))
        const currentValue = valueStore.fields[field.id]
        const writeDecision = allowsValueRuleWrite(
          rule,
          field,
          currentValue,
          nextValue,
          phase,
          options.confirmationAdapter,
          failures,
        )
        if (!(typeof writeDecision === 'boolean' ? writeDecision : await writeDecision)) {
          continue
        }
        if (!valuesEqual(currentValue, nextValue)) {
          valueStore.fields[field.id] = nextValue
          dirtyFieldIds.add(field.id)
        }
      } catch (error) {
        failures.push(`${field.label}：${error instanceof Error ? error.message : '计算失败'}`)
      }
    }
  }
  return failures
}

/** 按依赖拓扑执行一个子实体当前行的计算规则，并把结果写回该行值副本。 */
export async function applyDesignerCurrentRowValueRules(
  document: DesignerDocument,
  rowValues: Record<string, unknown>,
  entityCode: string,
  runtime: Omit<DesignerExpressionRuntimeContext, 'currentRow'>,
  options: {
    phase?: 'INITIALIZE' | 'CHANGE'
    changedFieldIds?: Iterable<string>
    confirmationAdapter?: DesignerLinkageConfirmationAdapter
  } = {},
): Promise<string[]> {
  const { orderedFields, diagnostics } = resolveDesignerFieldEvaluationOrder(document)
  if (diagnostics.length > 0) return diagnostics.map((item) => item.message)
  const failures: string[] = []
  const phase = options.phase ?? 'INITIALIZE'
  const dirtyFieldIds = new Set(options.changedFieldIds ?? [])
  for (const field of orderedFields) {
    if (field.entityCode !== entityCode) continue
    for (const rule of field.behavior.valueRules) {
      if (!shouldExecuteValueRule(rule, phase, dirtyFieldIds)) continue
      const context: DesignerExpressionRuntimeContext = { ...runtime, currentRow: rowValues }
      if (rule.condition && !evaluateDesignerCondition(rule.condition, context)) continue
      try {
        const nextValue = cloneValue(evaluateDesignerExpression(rule.expression, context))
        const currentValue = rowValues[field.id]
        const writeDecision = allowsValueRuleWrite(
          rule,
          field,
          currentValue,
          nextValue,
          phase,
          options.confirmationAdapter,
          failures,
        )
        if (!(typeof writeDecision === 'boolean' ? writeDecision : await writeDecision)) {
          continue
        }
        if (!valuesEqual(currentValue, nextValue)) {
          rowValues[field.id] = nextValue
          dirtyFieldIds.add(field.id)
        }
      } catch (error) {
        failures.push(`${field.label}：${error instanceof Error ? error.message : '计算失败'}`)
      }
    }
  }
  return failures
}

function shouldExecuteValueRule(
  rule: DesignerFieldValueRule,
  phase: 'INITIALIZE' | 'CHANGE',
  dirtyFieldIds: Set<string>,
): boolean {
  if (phase === 'INITIALIZE') return true
  const dependencies = collectDesignerExpressionFieldIds(rule.expression)
  if (rule.condition) {
    for (const fieldId of collectDesignerExpressionFieldIds(rule.condition))
      dependencies.add(fieldId)
  }
  return [...dependencies].some((fieldId) => dirtyFieldIds.has(fieldId))
}

function allowsValueRuleWrite(
  rule: DesignerFieldValueRule,
  field: DesignerField,
  currentValue: unknown,
  nextValue: unknown,
  phase: 'INITIALIZE' | 'CHANGE',
  confirmationAdapter: DesignerLinkageConfirmationAdapter | undefined,
  failures: string[],
): boolean | Promise<boolean> {
  if (rule.mode === 'FORMULA' || isEmpty(currentValue)) return true
  if (rule.overwritePolicy === 'ALWAYS') return true
  if (rule.overwritePolicy === 'EMPTY_ONLY' || phase === 'INITIALIZE') return false
  if (!confirmationAdapter) {
    failures.push(`${field.label}：当前 Host 未提供联动确认能力，已保留原值`)
    return false
  }
  return confirmationAdapter
    .confirmOverwrite({
      fieldId: field.id,
      fieldLabel: field.label,
      currentValue,
      nextValue,
    })
    .catch(() => {
      failures.push(`${field.label}：联动覆盖确认失败，已保留原值`)
      return false
    })
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  try {
    return JSON.stringify(left) === JSON.stringify(right)
  } catch {
    return false
  }
}

/** 按触发时机验证一个字段；必填验证与规则验证互相独立。 */
export async function validateDesignerField(
  field: DesignerField,
  value: unknown,
  trigger: DesignerValidationRule['trigger'],
  runtime: DesignerExpressionRuntimeContext,
  options: {
    state?: DesignerResolvedFieldState
    remoteAdapter?: DesignerRemoteValidationAdapter
    collectionRows?: number
  } = {},
): Promise<DesignerValidationResult[]> {
  const state = options.state ?? resolveDesignerFieldState(field, runtime)
  if (!state.visible || state.disabled) return []
  const results: DesignerValidationResult[] = []
  if (state.required && isEmpty(value)) {
    results.push({
      fieldId: field.id,
      ruleId: 'required',
      severity: 'ERROR',
      message: field.validation.message || `${field.label}为必填项`,
    })
  }
  for (const rule of field.behavior.validationRules) {
    if (!rule.enabled || rule.trigger !== trigger) continue
    if (isEmpty(value) && rule.type !== 'SUBTABLE') continue
    if (rule.condition && !evaluateDesignerCondition(rule.condition, runtime)) continue
    const failure = await validateRule(field, rule, value, runtime, options)
    if (failure) {
      results.push({
        fieldId: field.id,
        ruleId: rule.id,
        severity: rule.severity,
        message: rule.message || failure,
      })
    }
  }
  return results
}

/** 校验安全正则文本，拒绝回溯风险结构、反向引用和超长模式。 */
export function isSafeDesignerRegularExpression(pattern: string): boolean {
  if (!pattern || pattern.length > 200) return false
  if (/\\[1-9]|\(\?<([=!])|\(\?>|\(\?\(/.test(pattern)) return false
  if (/\([^)]*[+*][^)]*\)[+*{]/.test(pattern)) return false
  try {
    void new RegExp(pattern)
    return true
  } catch {
    return false
  }
}

async function validateRule(
  field: DesignerField,
  rule: DesignerValidationRule,
  value: unknown,
  runtime: DesignerExpressionRuntimeContext,
  options: {
    remoteAdapter?: DesignerRemoteValidationAdapter
    collectionRows?: number
  },
): Promise<string> {
  const configuration = rule.configuration as unknown as Record<string, unknown>
  if (rule.type === 'LENGTH') {
    const length = valueLength(value)
    const minimum = finiteNumber(configuration.minimum)
    const maximum = finiteNumber(configuration.maximum)
    if (minimum !== undefined && length < minimum) return `长度不能少于 ${minimum}`
    if (maximum !== undefined && length > maximum) return `长度不能超过 ${maximum}`
  }
  if (rule.type === 'RANGE') {
    const number = finiteNumber(value)
    if (number === undefined) return '请输入有效数值'
    const minimum = finiteNumber(configuration.minimum)
    const maximum = finiteNumber(configuration.maximum)
    if (minimum !== undefined && number < minimum) return `不能小于 ${minimum}`
    if (maximum !== undefined && number > maximum) return `不能大于 ${maximum}`
  }
  if (rule.type === 'PRECISION') {
    const scale = finiteNumber(configuration.scale)
    if (scale !== undefined && decimalPlaces(value) > scale) return `小数位数不能超过 ${scale}`
  }
  if (rule.type === 'FORMAT') {
    const text = String(value)
    const format = String(configuration.format ?? '')
    if (format === 'EMAIL' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) return '邮箱格式不正确'
    if (format === 'PHONE' && !/^\+?[0-9][0-9\s-]{5,19}$/.test(text)) return '电话号码格式不正确'
    if (format === 'IDENTIFIER' && !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(text))
      return '编码格式不正确'
  }
  if (rule.type === 'REGEX') {
    const pattern = String(configuration.pattern ?? '')
    if (!isSafeDesignerRegularExpression(pattern)) return '正则表达式不安全或无效'
    if (!new RegExp(pattern).test(String(value))) return '输入内容格式不正确'
  }
  if (rule.type === 'DATE') {
    const timestamp = Date.parse(String(value))
    if (!Number.isFinite(timestamp)) return '日期格式不正确'
    const minimum = Date.parse(String(configuration.minimum ?? ''))
    const maximum = Date.parse(String(configuration.maximum ?? ''))
    if (Number.isFinite(minimum) && timestamp < minimum) return '日期早于允许范围'
    if (Number.isFinite(maximum) && timestamp > maximum) return '日期晚于允许范围'
  }
  if (rule.type === 'SELECTION') {
    const count = Array.isArray(value) ? value.length : 1
    const minimum = finiteNumber(configuration.minimum)
    const maximum = finiteNumber(configuration.maximum)
    if (minimum !== undefined && count < minimum) return `至少选择 ${minimum} 项`
    if (maximum !== undefined && count > maximum) return `最多选择 ${maximum} 项`
  }
  if (rule.type === 'FILE') {
    const files = Array.isArray(value) ? value : [value]
    const maximumCount = finiteNumber(configuration.maximumCount)
    if (maximumCount !== undefined && files.length > maximumCount)
      return `最多上传 ${maximumCount} 个文件`
    const maximumSizeMb = finiteNumber(configuration.maximumSizeMb)
    if (
      maximumSizeMb !== undefined &&
      files.some((file) => {
        if (!isRecord(file)) return false
        const size = finiteNumber(file.size)
        return size !== undefined && size > maximumSizeMb * 1024 * 1024
      })
    ) {
      return `单个文件不能超过 ${maximumSizeMb} MB`
    }
    const accept = String(configuration.accept ?? '').trim()
    if (accept && files.some((file) => !matchesAcceptedFile(file, accept)))
      return '文件类型不符合要求'
  }
  if (rule.type === 'COMPARE_FIELD') {
    const targetFieldId = String(configuration.fieldId ?? '')
    const operator = String(configuration.operator ?? 'EQ')
    const target = runtime.fields[targetFieldId]
    const valid = compare(value, target, operator)
    if (!valid) return `与${field.label}关联的字段比较未通过`
  }
  if (rule.type === 'EXPRESSION') {
    const expression = configuration.expression
    if (!isRecord(expression)) return '验证表达式缺失'
    try {
      if (
        evaluateDesignerExpression(expression as unknown as DesignerExpression, runtime) !== true
      ) {
        return '表达式验证未通过'
      }
    } catch {
      return '表达式验证执行失败'
    }
  }
  if (rule.type === 'SUBTABLE') {
    const rows = options.collectionRows ?? 0
    const minimumRows = finiteNumber(configuration.minimumRows)
    const maximumRows = finiteNumber(configuration.maximumRows)
    if (minimumRows !== undefined && rows < minimumRows) return `子表至少需要 ${minimumRows} 行`
    if (maximumRows !== undefined && rows > maximumRows) return `子表最多允许 ${maximumRows} 行`
  }
  if (rule.type === 'REMOTE') {
    const provider = String(configuration.provider ?? '')
    const validatorId = String(configuration.validatorId ?? '')
    if (!provider || !validatorId) return '远程验证来源未配置'
    if (!options.remoteAdapter) return '当前 Host 未提供远程验证能力'
    try {
      const result = await options.remoteAdapter.validate({
        provider,
        validatorId,
        value,
        fieldId: field.id,
      })
      if (!result.valid) return result.message || '远程验证未通过'
    } catch {
      return '远程验证执行失败'
    }
  }
  return ''
}

function stateTargetValue(
  state: DesignerResolvedFieldState,
  target: DesignerFieldStateRuleTarget,
): boolean {
  if (target === 'VISIBLE') return state.visible
  if (target === 'REQUIRED') return state.required
  return state.disabled
}

type DesignerFieldStateRuleTarget = 'VISIBLE' | 'REQUIRED' | 'DISABLED'

function compare(left: unknown, right: unknown, operator: string): boolean {
  if (operator === 'EQ') return left === right
  if (operator === 'NE') return left !== right
  if (typeof left !== 'number' || typeof right !== 'number') return false
  if (operator === 'GT') return left > right
  if (operator === 'GTE') return left >= right
  if (operator === 'LT') return left < right
  if (operator === 'LTE') return left <= right
  return false
}

function valueLength(value: unknown): number {
  if (typeof value === 'string' || Array.isArray(value)) return value.length
  return String(value ?? '').length
}

function decimalPlaces(value: unknown): number {
  const text = String(value)
  const dot = text.indexOf('.')
  return dot < 0 ? 0 : text.length - dot - 1
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function isEmpty(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
  )
}

function matchesAcceptedFile(value: unknown, accept: string): boolean {
  if (!isRecord(value)) return false
  const name = typeof value.name === 'string' ? value.name.toLowerCase() : ''
  const mimeType = typeof value.type === 'string' ? value.type.toLowerCase() : ''
  return accept
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .some((item) => {
      if (item.startsWith('.')) return name.endsWith(item)
      if (item.endsWith('/*')) return mimeType.startsWith(item.slice(0, -1))
      return mimeType === item
    })
}

function cloneValue(value: unknown): unknown {
  if (value === undefined || value === null) return value
  if (typeof globalThis.structuredClone === 'function') {
    try {
      return globalThis.structuredClone(value)
    } catch {
      // 文件句柄等宿主对象无法结构化克隆时，保留原值交由控件自身管理。
    }
  }
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
