import { findDesignerComponent } from './component-registry'
import { diagnoseDesignerAdvancedDocument } from './document-advanced'
import type {
  DesignerDiagnosticSeverity,
  DesignerDocument,
  DesignerEventActionType,
  DesignerEventFlow,
  DesignerEventStep,
  DesignerField,
  DesignerFieldBehavior,
  DesignerFieldStateRule,
  DesignerFieldValueRule,
  DesignerLinkageOverwritePolicy,
  DesignerValidationConfigurationMap,
  DesignerValidationRule,
  DesignerValidationRuleType,
} from './types'

/** 高级配置编辑器只消费能力状态，不持有 Adapter 实例。 */
export interface DesignerFieldBehaviorCapabilities {
  remoteValidation: boolean
  dataSource: boolean
  navigation: boolean
  hostAction: boolean
  linkageConfirmation: boolean
}

/** 字段验证目录中的可创建规则。 */
export interface DesignerValidationCatalogItem {
  type: DesignerValidationRuleType
  label: string
  description: string
  available: boolean
  unavailableReason: string
}

/** 高级配置保存前可定位到页签与规则的诊断。 */
export interface DesignerFieldBehaviorDiagnostic {
  severity: DesignerDiagnosticSeverity
  code: string
  message: string
  path: string
  tab: 'state' | 'value' | 'validation' | 'submit'
  ruleId?: string
}

/** 事件动作目录项的运行能力状态。 */
export interface DesignerEventActionAvailability {
  type: DesignerEventActionType
  available: boolean
  unavailableReason: string
}

const VALIDATION_META: Record<
  DesignerValidationRuleType,
  Pick<DesignerValidationCatalogItem, 'label' | 'description'>
> = {
  LENGTH: { label: '长度', description: '限制文本最短与最长长度' },
  RANGE: { label: '数值范围', description: '限制数值最小值与最大值' },
  PRECISION: { label: '小数精度', description: '限制数值允许的小数位数' },
  FORMAT: { label: '常用格式', description: '校验邮箱、电话号码或稳定编码' },
  REGEX: { label: '安全正则', description: '使用受控安全正则校验文本格式' },
  DATE: { label: '日期范围', description: '限制最早与最晚日期时间' },
  SELECTION: { label: '选择数量', description: '限制集合最少与最多选择项' },
  FILE: { label: '文件约束', description: '限制文件数量、大小和类型' },
  COMPARE_FIELD: { label: '跨字段比较', description: '与同一表单作用域内的字段比较' },
  EXPRESSION: { label: '表达式', description: '使用受控布尔表达式判定数据' },
  SUBTABLE: { label: '子表行数', description: '限制关联子表最少与最多行数' },
  REMOTE: { label: '远程验证', description: '交由 Host 提供的验证 Adapter 执行' },
}

/**
 * 生成当前字段可创建的验证规则目录。
 *
 * 历史远程规则由编辑器额外保留；目录在缺少 Adapter 时只提供禁用说明，禁止新建。
 */
export function resolveDesignerValidationCatalog(
  document: DesignerDocument,
  field: DesignerField,
  capabilities: DesignerFieldBehaviorCapabilities,
): DesignerValidationCatalogItem[] {
  const supported = new Set<DesignerValidationRuleType>(['COMPARE_FIELD', 'EXPRESSION'])
  const registration = findDesignerComponent(field.componentType)
  const semanticType = registration?.semanticType ?? field.semanticType
  if (['STRING', 'LONG_TEXT', 'REFERENCE'].includes(semanticType)) {
    supported.add('LENGTH')
    supported.add('FORMAT')
    supported.add('REGEX')
  }
  if (semanticType === 'NUMBER') {
    supported.add('RANGE')
    supported.add('PRECISION')
  }
  if (['DATE', 'DATE_TIME'].includes(semanticType)) supported.add('DATE')
  if (isCollectionField(field)) supported.add('SELECTION')
  if (semanticType === 'FILE') supported.add('FILE')
  if (hasSubtable(document)) supported.add('SUBTABLE')
  supported.add('REMOTE')

  return [...supported].map((type) => {
    const requiresRemoteAdapter = type === 'REMOTE'
    return {
      type,
      ...VALIDATION_META[type],
      available: !requiresRemoteAdapter || capabilities.remoteValidation,
      unavailableReason:
        requiresRemoteAdapter && !capabilities.remoteValidation
          ? '当前 Host 未提供远程验证 Adapter，历史规则会保留但不能新建'
          : '',
    }
  })
}

/** 创建合法且可立即编辑的字段状态规则。 */
export function createDesignerStateRule(
  document: DesignerDocument,
  field: DesignerField,
): DesignerFieldStateRule {
  return {
    id: createBehaviorId('state'),
    target: 'VISIBLE',
    condition: defaultCondition(document, field),
    valueWhenTrue: true,
  }
}

/** 创建公式或联动默认规则；联动显式携带覆盖策略。 */
export function createDesignerValueRule(
  mode: DesignerFieldValueRule['mode'] = 'FORMULA',
): DesignerFieldValueRule {
  if (mode === 'LINKAGE') {
    return {
      id: createBehaviorId('linkage'),
      mode,
      expression: { kind: 'LITERAL', value: null },
      overwritePolicy: 'ALWAYS',
    }
  }
  return {
    id: createBehaviorId('formula'),
    mode,
    expression: { kind: 'LITERAL', value: null },
  }
}

/** 创建当前类型的严格验证规则默认值。 */
export function createDesignerValidationRule(
  type: DesignerValidationRuleType,
  document: DesignerDocument,
  field: DesignerField,
  sequence: number,
): DesignerValidationRule {
  const base = {
    id: createBehaviorId('validation'),
    name: `${VALIDATION_META[type].label}${sequence}`,
    enabled: true,
    trigger: 'SUBMIT' as const,
    severity: 'ERROR' as const,
    message: '',
  }
  const configuration = createValidationConfiguration(type, document, field)
  return { ...base, type, configuration } as DesignerValidationRule
}

/** 将字段状态规则转换为列表摘要。 */
export function summarizeDesignerStateRule(rule: DesignerFieldStateRule): string {
  const target = { VISIBLE: '显示', REQUIRED: '必填', DISABLED: '禁用' }[rule.target]
  return `条件成立时${rule.valueWhenTrue ? '' : '不'}${target}`
}

/** 将公式或联动转换为列表摘要。 */
export function summarizeDesignerValueRule(rule: DesignerFieldValueRule): string {
  if (rule.mode === 'FORMULA') return '依赖变化后自动重算，目标字段只读'
  const policy: Record<DesignerLinkageOverwritePolicy, string> = {
    ALWAYS: '始终覆盖',
    EMPTY_ONLY: '仅空值写入',
    CONFIRM: '覆盖前确认',
  }
  return `依赖变化时联动 · ${policy[rule.overwritePolicy]}`
}

/** 将验证规则转换为列表摘要。 */
export function summarizeDesignerValidationRule(rule: DesignerValidationRule): string {
  const status = rule.enabled ? '启用' : '停用'
  const severity = rule.severity === 'ERROR' ? '阻断错误' : '字段警告'
  return `${VALIDATION_META[rule.type].label} · ${status} · ${severity}`
}

/**
 * 使用行为与事件流草稿构造临时文档并返回字段级诊断。
 *
 * 文档诊断负责严格 Schema、表达式、循环与引用；本模块补充产品级重复名称和 Adapter 能力诊断。
 */
export function diagnoseDesignerFieldBehaviorDraft(input: {
  document: DesignerDocument
  fieldId: string
  behavior: DesignerFieldBehavior
  eventFlows: DesignerEventFlow[]
  capabilities: DesignerFieldBehaviorCapabilities
}): DesignerFieldBehaviorDiagnostic[] {
  const document = cloneValue(input.document)
  document.eventFlows = cloneValue(input.eventFlows)
  const fieldIndex = document.dataSchema.fields.findIndex((field) => field.id === input.fieldId)
  const field = document.dataSchema.fields[fieldIndex]
  if (!field) {
    return [
      diagnostic('ERROR', 'FIELD_MISSING', '当前字段已不存在', '$.dataSchema.fields', 'state'),
    ]
  }
  field.behavior = cloneValue(input.behavior)
  const fieldPath = `$.dataSchema.fields[${fieldIndex}].behavior`
  const result = diagnoseDesignerAdvancedDocument(document)
    .filter((item) => item.path.startsWith(fieldPath) || item.path.startsWith('$.eventFlows'))
    .map((item) => toFieldDiagnostic(item, field, input.behavior))
  appendDuplicateRuleNames(input.behavior, result)
  appendCapabilityDiagnostics(input, result)
  return deduplicateDiagnostics(result)
}

/** 根据运行能力输出事件动作的可新增状态。 */
export function resolveDesignerEventActionAvailability(
  type: DesignerEventActionType,
  capabilities: DesignerFieldBehaviorCapabilities,
): DesignerEventActionAvailability {
  if (type === 'NAVIGATE_RESOURCE' && !capabilities.navigation) {
    return { type, available: false, unavailableReason: '当前 Host 未提供同应用导航 Adapter' }
  }
  if (type === 'REFRESH_DATA_SOURCE' && !capabilities.dataSource) {
    return { type, available: false, unavailableReason: '当前 Host 未提供数据源 Adapter' }
  }
  if (type === 'HOST_ACTION' && !capabilities.hostAction) {
    return { type, available: false, unavailableReason: '当前 Host 未提供 Host 动作 Adapter' }
  }
  return { type, available: true, unavailableReason: '' }
}

function createValidationConfiguration<Type extends DesignerValidationRuleType>(
  type: Type,
  document: DesignerDocument,
  field: DesignerField,
): DesignerValidationConfigurationMap[Type] {
  const comparisonField = document.dataSchema.fields.find(
    (candidate) => candidate.id !== field.id && candidate.entityCode === field.entityCode,
  )
  const subtableId = findFirstSubtableId(document)
  const configurations: DesignerValidationConfigurationMap = {
    LENGTH: {},
    RANGE: {},
    PRECISION: { scale: 2 },
    FORMAT: { format: 'EMAIL' },
    REGEX: { pattern: '.*' },
    DATE: {},
    SELECTION: {},
    FILE: {},
    COMPARE_FIELD: { fieldId: comparisonField?.id ?? '', operator: 'EQ' },
    EXPRESSION: { expression: defaultCondition(document, field) },
    SUBTABLE: { containerId: subtableId },
    REMOTE: { provider: '', validatorId: '' },
  }
  return configurations[type]
}

function defaultCondition(document: DesignerDocument, field: DesignerField) {
  const candidate =
    document.dataSchema.fields.find((item) => item.entityCode === field.entityCode)?.id ?? field.id
  return {
    kind: 'CALL' as const,
    function: 'NOT_EMPTY' as const,
    arguments: [
      {
        kind: 'FIELD' as const,
        fieldId: candidate,
        scope:
          field.entityCode === document.dataSchema.rootEntity.code
            ? ('ROOT' as const)
            : ('CURRENT_ROW' as const),
      },
    ],
  }
}

function isCollectionField(field: DesignerField): boolean {
  return (
    field.semanticType === 'ARRAY' ||
    ['checkbox', 'multi-select', 'date-multiple'].includes(field.componentType) ||
    field.configuration.multiple === true ||
    field.configuration.selectionMode === 'MULTIPLE'
  )
}

function hasSubtable(document: DesignerDocument): boolean {
  return Boolean(findFirstSubtableId(document))
}

function findFirstSubtableId(document: DesignerDocument): string {
  const roots = [
    document.uiSchema.root,
    ...document.uiSchema.overlays.map((overlay) => overlay.root),
  ]
  for (const root of roots) {
    const found = findSubtableInNodes(root)
    if (found) return found
  }
  return ''
}

function findSubtableInNodes(nodes: DesignerDocument['uiSchema']['root']): string {
  for (const node of nodes) {
    if (
      node.nodeType === 'CONTAINER' &&
      ['row-subtable', 'block-subtable'].includes(node.componentType)
    ) {
      return node.id
    }
    if (node.nodeType === 'CONTAINER') {
      for (const slot of node.slots) {
        const nested = findSubtableInNodes(slot.children)
        if (nested) return nested
      }
    }
  }
  return ''
}

function appendDuplicateRuleNames(
  behavior: DesignerFieldBehavior,
  result: DesignerFieldBehaviorDiagnostic[],
): void {
  const firstByName = new Map<string, string>()
  for (const rule of behavior.validationRules) {
    const normalized = rule.name.trim().toLocaleLowerCase()
    if (!normalized) {
      result.push(
        diagnostic(
          'ERROR',
          'VALIDATION_RULE_NAME',
          '验证规则名称不能为空',
          '',
          'validation',
          rule.id,
        ),
      )
      continue
    }
    if (firstByName.has(normalized)) {
      result.push(
        diagnostic(
          'ERROR',
          'VALIDATION_RULE_DUPLICATE_NAME',
          '验证规则名称不能重复',
          '',
          'validation',
          rule.id,
        ),
      )
      continue
    }
    firstByName.set(normalized, rule.id)
  }
}

function appendCapabilityDiagnostics(
  input: {
    behavior: DesignerFieldBehavior
    eventFlows: DesignerEventFlow[]
    capabilities: DesignerFieldBehaviorCapabilities
  },
  result: DesignerFieldBehaviorDiagnostic[],
): void {
  for (const rule of input.behavior.validationRules) {
    if (rule.type === 'REMOTE' && !input.capabilities.remoteValidation) {
      result.push(
        diagnostic(
          'WARNING',
          'REMOTE_VALIDATION_ADAPTER_MISSING',
          '当前 Host 未提供远程验证 Adapter；历史规则会保留并在运行时失败关闭',
          '',
          'validation',
          rule.id,
        ),
      )
    }
  }
  for (const rule of input.behavior.valueRules) {
    if (
      rule.mode === 'LINKAGE' &&
      rule.overwritePolicy === 'CONFIRM' &&
      !input.capabilities.linkageConfirmation
    ) {
      result.push(
        diagnostic(
          'WARNING',
          'LINKAGE_CONFIRM_ADAPTER_MISSING',
          '当前 Host 未提供联动确认 Adapter；已有值不会被覆盖',
          '',
          'value',
          rule.id,
        ),
      )
    }
  }
  const boundCodes = new Set(Object.values(input.behavior.eventBindings).filter(Boolean))
  for (const flow of input.eventFlows.filter((item) => boundCodes.has(item.code))) {
    visitEventSteps(flow.steps, (step) => {
      if (step.stepType !== 'ACTION') return
      const availability = resolveDesignerEventActionAvailability(
        step.actionType,
        input.capabilities,
      )
      if (!availability.available) {
        result.push(
          diagnostic(
            'WARNING',
            'EVENT_ACTION_ADAPTER_MISSING',
            `${availability.unavailableReason}；历史步骤会保留并在运行时失败关闭`,
            '',
            'submit',
          ),
        )
      }
    })
  }
}

function visitEventSteps(
  steps: DesignerEventStep[],
  visit: (step: DesignerEventStep) => void,
): void {
  for (const step of steps) {
    visit(step)
    if (step.stepType === 'CONDITION') {
      step.branches.forEach((branch) => visitEventSteps(branch.steps, visit))
      visitEventSteps(step.elseSteps, visit)
    }
  }
}

function toFieldDiagnostic(
  item: { severity: DesignerDiagnosticSeverity; code: string; message: string; path: string },
  field: DesignerField,
  behavior: DesignerFieldBehavior,
): DesignerFieldBehaviorDiagnostic {
  const tab = diagnosticTab(item.path)
  const indexMatch = item.path.match(/\.(stateRules|valueRules|validationRules)\[(\d+)]/)
  const collection = indexMatch?.[1]
  const index = Number(indexMatch?.[2] ?? -1)
  const ruleId =
    collection === 'stateRules'
      ? behavior.stateRules[index]?.id
      : collection === 'valueRules'
        ? behavior.valueRules[index]?.id
        : collection === 'validationRules'
          ? behavior.validationRules[index]?.id
          : undefined
  return { ...item, message: `${field.label}：${item.message}`, tab, ruleId }
}

function diagnosticTab(path: string): DesignerFieldBehaviorDiagnostic['tab'] {
  if (path.includes('.valueRules')) return 'value'
  if (path.includes('.validationRules')) return 'validation'
  if (path.includes('.eventBindings') || path.startsWith('$.eventFlows')) return 'submit'
  return 'state'
}

function diagnostic(
  severity: DesignerDiagnosticSeverity,
  code: string,
  message: string,
  path: string,
  tab: DesignerFieldBehaviorDiagnostic['tab'],
  ruleId?: string,
): DesignerFieldBehaviorDiagnostic {
  return { severity, code, message, path, tab, ruleId }
}

function deduplicateDiagnostics(
  diagnostics: DesignerFieldBehaviorDiagnostic[],
): DesignerFieldBehaviorDiagnostic[] {
  const seen = new Set<string>()
  return diagnostics.filter((item) => {
    const key = `${item.severity}:${item.code}:${item.path}:${item.ruleId ?? ''}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function createBehaviorId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().replaceAll('-', '')}`
}

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
