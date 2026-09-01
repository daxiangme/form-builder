import { findDesignerComponent } from './component-registry'
import { diagnoseDesignerExpression, resolveDesignerFieldEvaluationOrder } from './expression'
import { isSafeDesignerRegularExpression } from './validation'
import type {
  DesignerActionBar,
  DesignerDiagnostic,
  DesignerDocument,
  DesignerEventActionType,
  DesignerFieldBehavior,
  DesignerLayoutNode,
  DesignerSubmitPolicy,
} from './types'

/** 新文档默认动作栏：只显示底部右侧提交按钮。 */
export const DEFAULT_DESIGNER_ACTION_BAR: DesignerActionBar = {
  visible: true,
  position: 'BOTTOM',
  align: 'RIGHT',
  buttons: [
    { action: 'SUBMIT', label: '提交', enabled: true },
    { action: 'RESET', label: '重置', enabled: false },
    { action: 'PRINT', label: '打印', enabled: false },
  ],
}

/** 新旧文档共用的默认提交策略；普通隐藏字段默认仍参与提交。 */
export const DEFAULT_DESIGNER_SUBMIT_POLICY: DesignerSubmitPolicy = {
  ignoreHiddenFields: false,
}

/** 创建字段高级行为默认值。 */
export function createDefaultDesignerFieldBehavior(): DesignerFieldBehavior {
  return {
    stateRules: [],
    valueRules: [],
    validationRules: [],
    submitBehavior: 'AUTO',
    eventBindings: {},
  }
}

/**
 * 在克隆后的文档中补齐高级协议默认值。
 *
 * 旧文档动作栏保持隐藏以维持历史视觉；旧基础校验转换为稳定规则，但不会修改调用方原对象。
 */
export function normalizeDesignerAdvancedDocument(source: Record<string, unknown>): void {
  const uiSchema = isRecord(source.uiSchema) ? source.uiSchema : undefined
  if (uiSchema && !('overlays' in uiSchema)) uiSchema.overlays = []
  if (uiSchema && Array.isArray(uiSchema.overlays)) {
    for (const overlay of uiSchema.overlays) {
      if (!isRecord(overlay)) continue
      if (!('radius' in overlay)) overlay.radius = 'THEME'
      if (!('maxHeightPreset' in overlay)) overlay.maxHeightPreset = 'VIEWPORT'
    }
  }
  if (!('submitPolicy' in source)) source.submitPolicy = { ...DEFAULT_DESIGNER_SUBMIT_POLICY }
  if (!('actionBar' in source)) {
    source.actionBar = { ...DEFAULT_DESIGNER_ACTION_BAR, visible: false, buttons: [] }
  }
  if (!('variables' in source)) source.variables = []
  if (!('dataSources' in source)) source.dataSources = []
  if (!('eventFlows' in source)) source.eventFlows = []
  if (!('i18n' in source)) {
    source.i18n = { enabled: false, defaultLocale: 'zh-CN', locales: ['zh-CN'], entries: [] }
  }
  const dataSchema = isRecord(source.dataSchema) ? source.dataSchema : undefined
  if (!dataSchema || !Array.isArray(dataSchema.fields)) return
  for (const rawField of dataSchema.fields) {
    if (!isRecord(rawField)) continue
    if (!('behavior' in rawField)) {
      rawField.behavior = createDefaultDesignerFieldBehavior()
      migrateLegacyValidation(rawField)
      continue
    }
    if (!isRecord(rawField.behavior)) continue
    const behavior = rawField.behavior
    if (!('stateRules' in behavior)) behavior.stateRules = []
    if (!('valueRules' in behavior)) behavior.valueRules = []
    if (Array.isArray(behavior.valueRules)) {
      for (const valueRule of behavior.valueRules) {
        if (
          isRecord(valueRule) &&
          valueRule.mode === 'LINKAGE' &&
          !('overwritePolicy' in valueRule)
        ) {
          valueRule.overwritePolicy = 'ALWAYS'
        }
      }
    }
    if (!('validationRules' in behavior)) behavior.validationRules = []
    if (!('submitBehavior' in behavior)) behavior.submitBehavior = 'AUTO'
    else if (!['AUTO', 'INCLUDE', 'EXCLUDE'].includes(String(behavior.submitBehavior))) {
      // 非法显式值由诊断层处理，不能静默改写。
    }
    if (!('eventBindings' in behavior)) behavior.eventBindings = {}
  }
}

/** 诊断高级协议的白名单、引用、表达式和受控枚举。 */
export function diagnoseDesignerAdvancedDocument(document: DesignerDocument): DesignerDiagnostic[] {
  const result: DesignerDiagnostic[] = []
  const source = document as unknown as Record<string, unknown>
  unknownKeys(
    source,
    [
      'documentVersion',
      'id',
      'name',
      'description',
      'dataSchema',
      'uiSchema',
      'appearance',
      'submitPolicy',
      'actionBar',
      'variables',
      'dataSources',
      'eventFlows',
      'i18n',
      'actions',
      'extensions',
    ],
    '$',
    'DOCUMENT_UNKNOWN_PROPERTY',
    result,
  )
  diagnoseSubmitPolicy(document, result)
  diagnoseActionBar(document, result)
  diagnoseVariables(document, result)
  diagnoseDataSources(document, result)
  diagnoseI18n(document, result)
  diagnoseLegacyActions(source.actions, result)
  const dataSchema = isRecord(source.dataSchema) ? source.dataSchema : undefined
  const uiSchema = isRecord(source.uiSchema) ? source.uiSchema : undefined
  const hasFields = Array.isArray(dataSchema?.fields)
  const hasOverlays = Array.isArray(uiSchema?.overlays)
  if (uiSchema) diagnoseOverlays(document, result)
  if (hasFields) diagnoseFieldBehaviors(document, result)
  if (
    hasFields &&
    hasOverlays &&
    Array.isArray(document.variables) &&
    Array.isArray(document.dataSources) &&
    Array.isArray(document.eventFlows)
  ) {
    diagnoseEventFlows(document, result)
    result.push(...resolveDesignerFieldEvaluationOrder(document).diagnostics)
  }
  return result
}

function migrateLegacyValidation(field: Record<string, unknown>): void {
  const behavior = field.behavior as DesignerFieldBehavior
  const validation = isRecord(field.validation) ? field.validation : undefined
  const fieldId = typeof field.id === 'string' ? field.id : 'unknown'
  if (!validation) return
  if (validation.minimumLength !== undefined || validation.maximumLength !== undefined) {
    behavior.validationRules.push({
      id: `legacy-${fieldId}-length`,
      name: '历史长度校验',
      type: 'LENGTH',
      enabled: true,
      trigger: 'SUBMIT',
      severity: 'ERROR',
      message: typeof validation.message === 'string' ? validation.message : '',
      configuration: {
        minimum: finiteNumberOrUndefined(validation.minimumLength),
        maximum: finiteNumberOrUndefined(validation.maximumLength),
      },
    })
  }
  if (validation.minimum !== undefined || validation.maximum !== undefined) {
    behavior.validationRules.push({
      id: `legacy-${fieldId}-range`,
      name: '历史范围校验',
      type: 'RANGE',
      enabled: true,
      trigger: 'SUBMIT',
      severity: 'ERROR',
      message: typeof validation.message === 'string' ? validation.message : '',
      configuration: {
        minimum: finiteNumberOrUndefined(validation.minimum),
        maximum: finiteNumberOrUndefined(validation.maximum),
      },
    })
  }
  if (typeof validation.pattern === 'string' && validation.pattern) {
    behavior.validationRules.push({
      id: `legacy-${fieldId}-pattern`,
      name: '历史格式校验',
      type: 'REGEX',
      enabled: true,
      trigger: 'SUBMIT',
      severity: 'ERROR',
      message: typeof validation.message === 'string' ? validation.message : '',
      configuration: { pattern: validation.pattern },
    })
  }
}

function diagnoseSubmitPolicy(document: DesignerDocument, result: DesignerDiagnostic[]): void {
  if (!isRecord(document.submitPolicy)) {
    result.push(error('SUBMIT_POLICY', '提交策略必须是对象', '$.submitPolicy'))
    return
  }
  unknownKeys(
    document.submitPolicy,
    ['ignoreHiddenFields'],
    '$.submitPolicy',
    'SUBMIT_POLICY_UNKNOWN_PROPERTY',
    result,
  )
  if (typeof document.submitPolicy.ignoreHiddenFields !== 'boolean') {
    result.push(
      error(
        'SUBMIT_POLICY_VALUE',
        '隐藏字段提交策略必须是布尔值',
        '$.submitPolicy.ignoreHiddenFields',
      ),
    )
  }
}

function diagnoseActionBar(document: DesignerDocument, result: DesignerDiagnostic[]): void {
  const actionBar = document.actionBar
  if (!isRecord(actionBar)) {
    result.push(error('ACTION_BAR', '动作栏配置必须是对象', '$.actionBar'))
    return
  }
  unknownKeys(
    actionBar,
    ['visible', 'position', 'align', 'buttons'],
    '$.actionBar',
    'ACTION_BAR_UNKNOWN_PROPERTY',
    result,
  )
  if (typeof actionBar.visible !== 'boolean')
    result.push(error('ACTION_BAR_VALUE', '动作栏显示配置不正确', '$.actionBar.visible'))
  if (!['TOP', 'BOTTOM', 'BOTH'].includes(String(actionBar.position)))
    result.push(error('ACTION_BAR_VALUE', '动作栏位置不正确', '$.actionBar.position'))
  if (!['LEFT', 'CENTER', 'RIGHT'].includes(String(actionBar.align)))
    result.push(error('ACTION_BAR_VALUE', '动作栏对齐不正确', '$.actionBar.align'))
  if (!Array.isArray(actionBar.buttons)) {
    result.push(error('ACTION_BAR_BUTTONS', '动作栏按钮必须是数组', '$.actionBar.buttons'))
    return
  }
  actionBar.buttons.forEach((button, index) => {
    const path = `$.actionBar.buttons[${index}]`
    if (!isRecord(button))
      return void result.push(error('ACTION_BAR_BUTTON', '动作栏按钮必须是对象', path))
    unknownKeys(
      button,
      ['action', 'label', 'enabled'],
      path,
      'ACTION_BAR_BUTTON_UNKNOWN_PROPERTY',
      result,
    )
    if (
      !['SUBMIT', 'RESET', 'PRINT'].includes(String(button.action)) ||
      typeof button.label !== 'string' ||
      typeof button.enabled !== 'boolean'
    ) {
      result.push(error('ACTION_BAR_BUTTON_VALUE', '动作栏按钮配置不正确', path))
    }
  })
}

function diagnoseVariables(document: DesignerDocument, result: DesignerDiagnostic[]): void {
  if (!Array.isArray(document.variables)) {
    result.push(error('VARIABLES', '变量定义必须是数组', '$.variables'))
    return
  }
  const codes = new Set<string>()
  document.variables.forEach((variable, index) => {
    const path = `$.variables[${index}]`
    if (!isRecord(variable)) return void result.push(error('VARIABLE', '变量必须是对象', path))
    unknownKeys(
      variable,
      ['id', 'code', 'name', 'valueType', 'initialValue'],
      path,
      'VARIABLE_UNKNOWN_PROPERTY',
      result,
    )
    if (!identifier(variable.code) || codes.has(variable.code))
      result.push(error('VARIABLE_CODE', '变量编码为空、重复或格式不正确', `${path}.code`))
    else codes.add(variable.code)
    if (
      typeof variable.id !== 'string' ||
      !variable.id ||
      typeof variable.name !== 'string' ||
      !variable.name
    )
      result.push(error('VARIABLE_IDENTITY', '变量标识和名称不能为空', path))
    if (!['STRING', 'NUMBER', 'BOOLEAN', 'DATE', 'OBJECT'].includes(String(variable.valueType)))
      result.push(error('VARIABLE_TYPE', '变量类型不正确', `${path}.valueType`))
  })
}

function diagnoseDataSources(document: DesignerDocument, result: DesignerDiagnostic[]): void {
  if (!Array.isArray(document.dataSources)) {
    result.push(error('DATA_SOURCES', '数据源定义必须是数组', '$.dataSources'))
    return
  }
  const codes = new Set<string>()
  const fieldIds = new Set(
    Array.isArray(document.dataSchema?.fields)
      ? document.dataSchema.fields.map((field) => field.id)
      : [],
  )
  const variableCodes = new Set(
    (Array.isArray(document.variables) ? document.variables : []).map((variable) => variable.code),
  )
  document.dataSources.forEach((dataSource, index) => {
    const path = `$.dataSources[${index}]`
    if (!isRecord(dataSource))
      return void result.push(error('DATA_SOURCE', '数据源必须是对象', path))
    unknownKeys(
      dataSource,
      [
        'id',
        'code',
        'name',
        'provider',
        'sourceId',
        'sourceRevision',
        'inputMappings',
        'outputMappings',
      ],
      path,
      'DATA_SOURCE_UNKNOWN_PROPERTY',
      result,
    )
    if (!identifier(dataSource.code) || codes.has(dataSource.code))
      result.push(error('DATA_SOURCE_CODE', '数据源编码为空、重复或格式不正确', `${path}.code`))
    else codes.add(dataSource.code)
    for (const key of ['id', 'name', 'provider', 'sourceId'] as const) {
      if (typeof dataSource[key] !== 'string' || !dataSource[key])
        result.push(error('DATA_SOURCE_IDENTITY', `${key} 不能为空`, `${path}.${key}`))
    }
    if (
      dataSource.sourceRevision !== undefined &&
      (!Number.isInteger(dataSource.sourceRevision) || dataSource.sourceRevision < 0)
    ) {
      result.push(error('DATA_SOURCE_REVISION', '来源版本必须是非负整数', `${path}.sourceRevision`))
    }
    diagnoseMappings(
      dataSource.inputMappings,
      `${path}.inputMappings`,
      'INPUT',
      fieldIds,
      variableCodes,
      result,
    )
    diagnoseMappings(
      dataSource.outputMappings,
      `${path}.outputMappings`,
      'OUTPUT',
      fieldIds,
      variableCodes,
      result,
    )
  })
}

function diagnoseMappings(
  source: unknown,
  path: string,
  direction: 'INPUT' | 'OUTPUT',
  fieldIds: Set<string>,
  variableCodes: Set<string>,
  result: DesignerDiagnostic[],
): void {
  if (!Array.isArray(source))
    return void result.push(error('DATA_SOURCE_MAPPING', '映射必须是数组', path))
  source.forEach((mapping, index) => {
    const itemPath = `${path}[${index}]`
    if (!isRecord(mapping))
      return void result.push(error('DATA_SOURCE_MAPPING', '映射项必须是对象', itemPath))
    unknownKeys(
      mapping,
      ['source', 'target'],
      itemPath,
      'DATA_SOURCE_MAPPING_UNKNOWN_PROPERTY',
      result,
    )
    if (
      typeof mapping.source !== 'string' ||
      !mapping.source ||
      typeof mapping.target !== 'string' ||
      !mapping.target
    )
      result.push(error('DATA_SOURCE_MAPPING_VALUE', '映射来源和目标不能为空', itemPath))
    if (typeof mapping.source !== 'string' || typeof mapping.target !== 'string') return
    const reference = direction === 'INPUT' ? mapping.source : mapping.target
    const adapterKey = direction === 'INPUT' ? mapping.target : mapping.source
    if (!identifier(adapterKey)) {
      result.push(
        error(
          'DATA_SOURCE_MAPPING_KEY',
          'Adapter 映射名称必须使用受控编码',
          `${itemPath}.${direction === 'INPUT' ? 'target' : 'source'}`,
        ),
      )
    }
    const referenceType = reference.startsWith('field:')
      ? 'FIELD'
      : reference.startsWith('variable:')
        ? 'VARIABLE'
        : 'UNKNOWN'
    const referenceCode = reference.slice(reference.indexOf(':') + 1)
    if (referenceType === 'UNKNOWN') {
      result.push(
        error(
          'DATA_SOURCE_MAPPING_REFERENCE',
          '映射必须使用 field:字段ID 或 variable:变量编码',
          `${itemPath}.${direction === 'INPUT' ? 'source' : 'target'}`,
        ),
      )
    } else if (
      (referenceType === 'FIELD' && !fieldIds.has(referenceCode)) ||
      (referenceType === 'VARIABLE' && !variableCodes.has(referenceCode))
    ) {
      result.push(
        error(
          'DATA_SOURCE_MAPPING_REFERENCE',
          '映射引用的字段或变量不存在',
          `${itemPath}.${direction === 'INPUT' ? 'source' : 'target'}`,
        ),
      )
    }
  })
}

function diagnoseI18n(document: DesignerDocument, result: DesignerDiagnostic[]): void {
  const i18n = document.i18n
  if (!isRecord(i18n)) return void result.push(error('I18N', '国际化配置必须是对象', '$.i18n'))
  unknownKeys(
    i18n,
    ['enabled', 'defaultLocale', 'locales', 'entries'],
    '$.i18n',
    'I18N_UNKNOWN_PROPERTY',
    result,
  )
  if (
    typeof i18n.enabled !== 'boolean' ||
    !locale(i18n.defaultLocale) ||
    !Array.isArray(i18n.locales) ||
    !Array.isArray(i18n.entries)
  )
    result.push(error('I18N_VALUE', '国际化配置类型不正确', '$.i18n'))
  if (Array.isArray(i18n.locales) && i18n.locales.some((item) => !locale(item)))
    result.push(error('I18N_LOCALE', '语言标签必须符合 BCP 47 基本格式', '$.i18n.locales'))
  if (Array.isArray(i18n.locales) && new Set(i18n.locales).size !== i18n.locales.length) {
    result.push(error('I18N_LOCALE_DUPLICATE', '语言列表不能包含重复项', '$.i18n.locales'))
  }
  if (Array.isArray(i18n.locales) && !i18n.locales.includes(i18n.defaultLocale)) {
    result.push(error('I18N_DEFAULT_LOCALE', '默认语言必须存在于语言列表', '$.i18n.defaultLocale'))
  }
  const keys = new Set<string>()
  if (Array.isArray(i18n.entries))
    i18n.entries.forEach((entry, index) => {
      const path = `$.i18n.entries[${index}]`
      if (!isRecord(entry))
        return void result.push(error('I18N_ENTRY', '国际化词条必须是对象', path))
      unknownKeys(entry, ['key', 'values'], path, 'I18N_ENTRY_UNKNOWN_PROPERTY', result)
      if (!identifier(entry.key) || keys.has(entry.key))
        result.push(error('I18N_ENTRY_KEY', '词条 key 为空、重复或格式不正确', `${path}.key`))
      else keys.add(entry.key)
      if (
        !isRecord(entry.values) ||
        Object.values(entry.values).some((value) => typeof value !== 'string')
      )
        result.push(error('I18N_ENTRY_VALUE', '词条翻译必须是文本映射', `${path}.values`))
      else if (
        Array.isArray(i18n.locales) &&
        Object.keys(entry.values).some((entryLocale) => !i18n.locales.includes(entryLocale))
      ) {
        result.push(error('I18N_ENTRY_LOCALE', '词条包含未启用的语言', `${path}.values`))
      }
    })
}

function diagnoseLegacyActions(source: unknown, result: DesignerDiagnostic[]): void {
  if (!Array.isArray(source)) return
  const codes = new Set<string>()
  source.forEach((action, index) => {
    const path = `$.actions[${index}]`
    if (!isRecord(action)) return void result.push(error('ACTION', '声明式动作必须是对象', path))
    unknownKeys(
      action,
      ['code', 'name', 'handlerType', 'target'],
      path,
      'ACTION_UNKNOWN_PROPERTY',
      result,
    )
    if (!identifier(action.code) || codes.has(action.code)) {
      result.push(error('ACTION_CODE', '动作编码为空、重复或格式不正确', `${path}.code`))
    } else codes.add(action.code)
    if (typeof action.name !== 'string' || !action.name) {
      result.push(error('ACTION_NAME', '动作名称不能为空', `${path}.name`))
    }
    if (!['SAVE', 'RESET', 'DELETE', 'PRINT', 'NAVIGATE'].includes(String(action.handlerType))) {
      result.push(error('ACTION_HANDLER', '动作处理类型不受支持', `${path}.handlerType`))
    }
    if (
      action.handlerType === 'NAVIGATE' &&
      (typeof action.target !== 'string' || !identifier(action.target))
    ) {
      result.push(error('ACTION_TARGET', '导航动作只能引用受控资源编码', `${path}.target`))
    }
  })
}

function diagnoseOverlays(document: DesignerDocument, result: DesignerDiagnostic[]): void {
  if (!Array.isArray(document.uiSchema.overlays))
    return void result.push(error('OVERLAYS', '弹层模块必须是数组', '$.uiSchema.overlays'))
  const codes = new Set<string>()
  document.uiSchema.overlays.forEach((overlay, index) => {
    const path = `$.uiSchema.overlays[${index}]`
    if (!isRecord(overlay)) return void result.push(error('OVERLAY', '弹层模块必须是对象', path))
    unknownKeys(
      overlay,
      ['id', 'code', 'name', 'kind', 'dataContext', 'width', 'radius', 'maxHeightPreset', 'root'],
      path,
      'OVERLAY_UNKNOWN_PROPERTY',
      result,
    )
    if (!identifier(overlay.code) || codes.has(overlay.code))
      result.push(error('OVERLAY_CODE', '模块编码为空、重复或格式不正确', `${path}.code`))
    else codes.add(overlay.code)
    if (
      typeof overlay.id !== 'string' ||
      !overlay.id ||
      typeof overlay.name !== 'string' ||
      !overlay.name
    )
      result.push(error('OVERLAY_IDENTITY', '模块标识和名称不能为空', path))
    if (!['DIALOG', 'DRAWER'].includes(String(overlay.kind)))
      result.push(error('OVERLAY_KIND', '模块类型不正确', `${path}.kind`))
    if (!['FORM_DRAFT', 'SUBTABLE_ROW_DRAFT'].includes(String(overlay.dataContext)))
      result.push(error('OVERLAY_CONTEXT', '模块数据上下文不正确', `${path}.dataContext`))
    if (
      typeof overlay.width !== 'number' ||
      !Number.isFinite(overlay.width) ||
      overlay.width < 320 ||
      overlay.width > 1200
    )
      result.push(error('OVERLAY_WIDTH', '模块宽度必须为 320～1200', `${path}.width`))
    if (!['THEME', 'NONE', 'SMALL', 'BASE', 'LARGE'].includes(String(overlay.radius))) {
      result.push(error('OVERLAY_RADIUS', '弹窗圆角档位不正确', `${path}.radius`))
    }
    if (
      !['COMPACT', 'STANDARD', 'SPACIOUS', 'VIEWPORT'].includes(String(overlay.maxHeightPreset))
    ) {
      result.push(
        error('OVERLAY_MAX_HEIGHT', '弹窗运行最大高度档位不正确', `${path}.maxHeightPreset`),
      )
    }
    if (!Array.isArray(overlay.root))
      result.push(error('OVERLAY_ROOT', '模块布局必须是数组', `${path}.root`))
  })
}

function diagnoseFieldBehaviors(document: DesignerDocument, result: DesignerDiagnostic[]): void {
  const flowCodes = new Set(
    (Array.isArray(document.eventFlows) ? document.eventFlows : []).map((flow) => flow.code),
  )
  document.dataSchema.fields.forEach((field, index) => {
    const path = `$.dataSchema.fields[${index}].behavior`
    const behavior = field.behavior
    if (!isRecord(behavior))
      return void result.push(error('FIELD_BEHAVIOR', '字段行为必须是对象', path))
    unknownKeys(
      behavior,
      ['stateRules', 'valueRules', 'validationRules', 'submitBehavior', 'eventBindings'],
      path,
      'FIELD_BEHAVIOR_UNKNOWN_PROPERTY',
      result,
    )
    if (!['AUTO', 'INCLUDE', 'EXCLUDE'].includes(String(behavior.submitBehavior)))
      result.push(error('FIELD_SUBMIT_BEHAVIOR', '字段提交行为不正确', `${path}.submitBehavior`))
    diagnoseStateRules(
      behavior.stateRules,
      document,
      `${path}.stateRules`,
      field.entityCode !== document.dataSchema.rootEntity.code,
      result,
    )
    diagnoseValueRules(
      behavior.valueRules,
      document,
      `${path}.valueRules`,
      field.entityCode !== document.dataSchema.rootEntity.code,
      result,
    )
    diagnoseValidationRules(
      behavior.validationRules,
      document,
      `${path}.validationRules`,
      field.entityCode !== document.dataSchema.rootEntity.code,
      result,
    )
    if (!isRecord(behavior.eventBindings))
      result.push(error('FIELD_EVENT_BINDINGS', '字段事件绑定必须是对象', `${path}.eventBindings`))
    else {
      const registration = findDesignerComponent(field.componentType)
      const allowed = new Set(
        registration?.supportedEvents ?? defaultSupportedEvents(field.componentType),
      )
      for (const [event, flowCode] of Object.entries(behavior.eventBindings)) {
        if (!allowed.has(event as never))
          result.push(
            error(
              'FIELD_EVENT_UNSUPPORTED',
              `${registration?.name ?? field.label}不支持 ${event} 事件`,
              `${path}.eventBindings.${event}`,
            ),
          )
        if (typeof flowCode !== 'string' || !flowCodes.has(flowCode))
          result.push(
            error(
              'FIELD_EVENT_FLOW',
              '字段事件引用了不存在的事件流',
              `${path}.eventBindings.${event}`,
            ),
          )
      }
    }
  })
}

function diagnoseStateRules(
  source: unknown,
  document: DesignerDocument,
  path: string,
  allowCurrentRow: boolean,
  result: DesignerDiagnostic[],
): void {
  if (!Array.isArray(source))
    return void result.push(error('STATE_RULES', '字段状态规则必须是数组', path))
  source.forEach((rule, index) => {
    const itemPath = `${path}[${index}]`
    if (!isRecord(rule))
      return void result.push(error('STATE_RULE', '字段状态规则必须是对象', itemPath))
    unknownKeys(
      rule,
      ['id', 'target', 'condition', 'valueWhenTrue', 'valueWhenFalse'],
      itemPath,
      'STATE_RULE_UNKNOWN_PROPERTY',
      result,
    )
    if (
      !['VISIBLE', 'REQUIRED', 'DISABLED'].includes(String(rule.target)) ||
      typeof rule.id !== 'string' ||
      typeof rule.valueWhenTrue !== 'boolean' ||
      (rule.valueWhenFalse !== undefined && typeof rule.valueWhenFalse !== 'boolean')
    )
      result.push(error('STATE_RULE_VALUE', '字段状态规则配置不正确', itemPath))
    result.push(
      ...diagnoseDesignerExpression(rule.condition, document, `${itemPath}.condition`, {
        allowCurrentRow,
      }),
    )
  })
}

function diagnoseValueRules(
  source: unknown,
  document: DesignerDocument,
  path: string,
  allowCurrentRow: boolean,
  result: DesignerDiagnostic[],
): void {
  if (!Array.isArray(source))
    return void result.push(error('VALUE_RULES', '字段值规则必须是数组', path))
  source.forEach((rule, index) => {
    const itemPath = `${path}[${index}]`
    if (!isRecord(rule))
      return void result.push(error('VALUE_RULE', '字段值规则必须是对象', itemPath))
    const allowedKeys =
      rule.mode === 'LINKAGE'
        ? ['id', 'mode', 'expression', 'condition', 'overwritePolicy']
        : ['id', 'mode', 'expression', 'condition']
    unknownKeys(rule, allowedKeys, itemPath, 'VALUE_RULE_UNKNOWN_PROPERTY', result)
    if (!['FORMULA', 'LINKAGE'].includes(String(rule.mode)) || typeof rule.id !== 'string')
      result.push(error('VALUE_RULE_VALUE', '字段值规则配置不正确', itemPath))
    if (
      rule.mode === 'LINKAGE' &&
      !['ALWAYS', 'EMPTY_ONLY', 'CONFIRM'].includes(String(rule.overwritePolicy))
    ) {
      result.push(
        error('VALUE_RULE_OVERWRITE_POLICY', '联动覆盖策略不正确', `${itemPath}.overwritePolicy`),
      )
    }
    result.push(
      ...diagnoseDesignerExpression(rule.expression, document, `${itemPath}.expression`, {
        allowCurrentRow,
      }),
    )
    if (rule.condition !== undefined)
      result.push(
        ...diagnoseDesignerExpression(rule.condition, document, `${itemPath}.condition`, {
          allowCurrentRow,
        }),
      )
  })
}

function diagnoseValidationRules(
  source: unknown,
  document: DesignerDocument,
  path: string,
  allowCurrentRow: boolean,
  result: DesignerDiagnostic[],
): void {
  if (!Array.isArray(source))
    return void result.push(error('VALIDATION_RULES', '验证规则必须是数组', path))
  source.forEach((rule, index) => {
    const itemPath = `${path}[${index}]`
    if (!isRecord(rule))
      return void result.push(error('VALIDATION_RULE', '验证规则必须是对象', itemPath))
    unknownKeys(
      rule,
      [
        'id',
        'name',
        'type',
        'enabled',
        'trigger',
        'severity',
        'message',
        'condition',
        'configuration',
      ],
      itemPath,
      'VALIDATION_RULE_UNKNOWN_PROPERTY',
      result,
    )
    if (
      typeof rule.id !== 'string' ||
      !rule.id ||
      typeof rule.name !== 'string' ||
      typeof rule.enabled !== 'boolean' ||
      !['CHANGE', 'BLUR', 'SUBMIT'].includes(String(rule.trigger)) ||
      !['ERROR', 'WARNING'].includes(String(rule.severity)) ||
      typeof rule.message !== 'string' ||
      !isRecord(rule.configuration)
    )
      result.push(error('VALIDATION_RULE_VALUE', '验证规则配置不正确', itemPath))
    if (
      ![
        'LENGTH',
        'RANGE',
        'PRECISION',
        'FORMAT',
        'REGEX',
        'DATE',
        'SELECTION',
        'FILE',
        'COMPARE_FIELD',
        'EXPRESSION',
        'SUBTABLE',
        'REMOTE',
      ].includes(String(rule.type))
    )
      result.push(error('VALIDATION_RULE_TYPE', '验证规则类型不受支持', `${itemPath}.type`))
    if (rule.condition !== undefined)
      result.push(
        ...diagnoseDesignerExpression(rule.condition, document, `${itemPath}.condition`, {
          allowCurrentRow,
        }),
      )
    if (
      rule.type === 'REGEX' &&
      isRecord(rule.configuration) &&
      !isSafeDesignerRegularExpression(String(rule.configuration.pattern ?? ''))
    )
      result.push(
        error('VALIDATION_REGEX', '正则表达式不安全或无效', `${itemPath}.configuration.pattern`),
      )
    if (isRecord(rule.configuration)) {
      diagnoseValidationConfiguration(
        String(rule.type),
        rule.configuration,
        document,
        `${itemPath}.configuration`,
        allowCurrentRow,
        result,
      )
    }
  })
}

function diagnoseValidationConfiguration(
  type: string,
  configuration: Record<string, unknown>,
  document: DesignerDocument,
  path: string,
  allowCurrentRow: boolean,
  result: DesignerDiagnostic[],
): void {
  const allowed: Record<string, string[]> = {
    LENGTH: ['minimum', 'maximum'],
    RANGE: ['minimum', 'maximum'],
    PRECISION: ['scale'],
    FORMAT: ['format'],
    REGEX: ['pattern'],
    DATE: ['minimum', 'maximum'],
    SELECTION: ['minimum', 'maximum'],
    FILE: ['maximumCount', 'maximumSizeMb', 'accept'],
    COMPARE_FIELD: ['fieldId', 'operator'],
    EXPRESSION: ['expression'],
    SUBTABLE: ['containerId', 'minimumRows', 'maximumRows'],
    REMOTE: ['provider', 'validatorId'],
  }
  const keys = allowed[type]
  if (!keys) return
  unknownKeys(configuration, keys, path, 'VALIDATION_CONFIGURATION_UNKNOWN_PROPERTY', result)
  if (type === 'RANGE') diagnoseFiniteRange(configuration, path, result)
  if (['LENGTH', 'SELECTION'].includes(type)) {
    diagnoseIntegerRange(configuration, path, 0, result)
  }
  if (type === 'PRECISION') {
    diagnoseIntegerAtLeast(configuration.scale, 0, `${path}.scale`, result)
  }
  if (type === 'FILE') {
    if (configuration.maximumCount !== undefined) {
      diagnoseIntegerAtLeast(configuration.maximumCount, 1, `${path}.maximumCount`, result)
    }
    if (
      configuration.maximumSizeMb !== undefined &&
      (typeof configuration.maximumSizeMb !== 'number' ||
        !Number.isFinite(configuration.maximumSizeMb) ||
        configuration.maximumSizeMb <= 0)
    ) {
      result.push(
        error('VALIDATION_CONFIGURATION_VALUE', '文件大小上限必须大于 0', `${path}.maximumSizeMb`),
      )
    }
    if (configuration.accept !== undefined && typeof configuration.accept !== 'string') {
      result.push(
        error('VALIDATION_CONFIGURATION_VALUE', '文件类型限制必须是文本', `${path}.accept`),
      )
    }
  }
  if (type === 'SUBTABLE') {
    diagnoseIntegerRange(
      { minimum: configuration.minimumRows, maximum: configuration.maximumRows },
      path,
      0,
      result,
      { minimum: 'minimumRows', maximum: 'maximumRows' },
    )
  }
  if (type === 'DATE') diagnoseDateRange(configuration, path, result)
  if (
    type === 'FORMAT' &&
    !['EMAIL', 'PHONE', 'IDENTIFIER'].includes(String(configuration.format))
  ) {
    result.push(error('VALIDATION_CONFIGURATION_VALUE', '常用格式类型不正确', `${path}.format`))
  }
  if (type === 'COMPARE_FIELD') {
    const fieldIds = new Set(document.dataSchema.fields.map((field) => field.id))
    if (!fieldIds.has(String(configuration.fieldId))) {
      result.push(error('VALIDATION_CONFIGURATION_REFERENCE', '比较字段不存在', `${path}.fieldId`))
    }
    if (
      configuration.operator !== undefined &&
      !['EQ', 'NE', 'GT', 'GTE', 'LT', 'LTE'].includes(String(configuration.operator))
    ) {
      result.push(error('VALIDATION_CONFIGURATION_VALUE', '比较操作符不正确', `${path}.operator`))
    }
  }
  if (type === 'EXPRESSION') {
    result.push(
      ...diagnoseDesignerExpression(configuration.expression, document, `${path}.expression`, {
        allowCurrentRow,
      }),
    )
  }
  if (type === 'SUBTABLE') {
    const nodes = collectNodes([
      document.uiSchema.root,
      ...document.uiSchema.overlays.map((overlay) => overlay.root),
    ])
    const node = nodes.get(String(configuration.containerId))
    if (
      node?.nodeType !== 'CONTAINER' ||
      !['row-subtable', 'block-subtable'].includes(node.componentType)
    ) {
      result.push(
        error('VALIDATION_CONFIGURATION_REFERENCE', '子表容器不存在', `${path}.containerId`),
      )
    }
  }
  if (
    type === 'REMOTE' &&
    (typeof configuration.provider !== 'string' ||
      !configuration.provider ||
      typeof configuration.validatorId !== 'string' ||
      !configuration.validatorId)
  ) {
    result.push(error('VALIDATION_CONFIGURATION_VALUE', '远程验证来源不能为空', path))
  }
}

function diagnoseFiniteRange(
  configuration: Record<string, unknown>,
  path: string,
  result: DesignerDiagnostic[],
): void {
  for (const key of ['minimum', 'maximum'] as const) {
    const value = configuration[key]
    if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value))) {
      result.push(
        error('VALIDATION_CONFIGURATION_VALUE', `${key} 必须是有限数字`, `${path}.${key}`),
      )
    }
  }
  if (
    typeof configuration.minimum === 'number' &&
    Number.isFinite(configuration.minimum) &&
    typeof configuration.maximum === 'number' &&
    Number.isFinite(configuration.maximum) &&
    configuration.minimum > configuration.maximum
  ) {
    result.push(error('VALIDATION_CONFIGURATION_RANGE', '最小值不能大于最大值', path))
  }
}

function diagnoseIntegerRange(
  configuration: Record<string, unknown>,
  path: string,
  minimumAllowed: number,
  result: DesignerDiagnostic[],
  keys: { minimum: string; maximum: string } = { minimum: 'minimum', maximum: 'maximum' },
): void {
  const minimum = configuration.minimum
  const maximum = configuration.maximum
  if (minimum !== undefined) {
    diagnoseIntegerAtLeast(minimum, minimumAllowed, `${path}.${keys.minimum}`, result)
  }
  if (maximum !== undefined) {
    diagnoseIntegerAtLeast(maximum, minimumAllowed, `${path}.${keys.maximum}`, result)
  }
  if (typeof minimum === 'number' && typeof maximum === 'number' && minimum > maximum) {
    result.push(error('VALIDATION_CONFIGURATION_RANGE', '最小值不能大于最大值', path))
  }
}

function diagnoseIntegerAtLeast(
  value: unknown,
  minimum: number,
  path: string,
  result: DesignerDiagnostic[],
): void {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < minimum) {
    result.push(error('VALIDATION_CONFIGURATION_VALUE', `必须是不小于 ${minimum} 的整数`, path))
  }
}

function diagnoseDateRange(
  configuration: Record<string, unknown>,
  path: string,
  result: DesignerDiagnostic[],
): void {
  const minimum = configuration.minimum
  const maximum = configuration.maximum
  const minimumTime = minimum === undefined ? undefined : Date.parse(String(minimum))
  const maximumTime = maximum === undefined ? undefined : Date.parse(String(maximum))
  if (minimum !== undefined && !Number.isFinite(minimumTime)) {
    result.push(error('VALIDATION_CONFIGURATION_VALUE', '最早日期格式不正确', `${path}.minimum`))
  }
  if (maximum !== undefined && !Number.isFinite(maximumTime)) {
    result.push(error('VALIDATION_CONFIGURATION_VALUE', '最晚日期格式不正确', `${path}.maximum`))
  }
  if (
    minimumTime !== undefined &&
    maximumTime !== undefined &&
    Number.isFinite(minimumTime) &&
    Number.isFinite(maximumTime) &&
    minimumTime > maximumTime
  ) {
    result.push(error('VALIDATION_CONFIGURATION_RANGE', '最早日期不能晚于最晚日期', path))
  }
}

function diagnoseEventFlows(document: DesignerDocument, result: DesignerDiagnostic[]): void {
  if (!Array.isArray(document.eventFlows)) {
    result.push(error('EVENT_FLOWS', '事件流必须是数组', '$.eventFlows'))
    return
  }
  const codes = new Set<string>()
  const moduleCodes = new Set(document.uiSchema.overlays.map((module) => module.code))
  const dataSourceCodes = new Set(document.dataSources.map((source) => source.code))
  const fieldIds = new Set(document.dataSchema.fields.map((field) => field.id))
  const variableCodes = new Set(document.variables.map((variable) => variable.code))
  const roots = [
    document.uiSchema.root,
    ...document.uiSchema.overlays.map((overlay) => overlay.root),
  ]
  const nodeMap = collectNodes(roots)
  const nodeIds = new Set(nodeMap.keys())
  const currentRowNodeIds = collectCurrentRowNodeIds(roots)
  const fieldsById = new Map(document.dataSchema.fields.map((field) => [field.id, field]))
  document.eventFlows.forEach((flow, index) => {
    const path = `$.eventFlows[${index}]`
    if (!isRecord(flow)) return void result.push(error('EVENT_FLOW', '事件流必须是对象', path))
    unknownKeys(
      flow,
      ['id', 'code', 'name', 'trigger', 'enabled', 'steps'],
      path,
      'EVENT_FLOW_UNKNOWN_PROPERTY',
      result,
    )
    if (!identifier(flow.code) || codes.has(flow.code))
      result.push(error('EVENT_FLOW_CODE', '事件流编码为空、重复或格式不正确', `${path}.code`))
    else codes.add(flow.code)
    if (
      typeof flow.id !== 'string' ||
      !flow.id ||
      typeof flow.name !== 'string' ||
      !flow.name ||
      typeof flow.enabled !== 'boolean'
    )
      result.push(error('EVENT_FLOW_IDENTITY', '事件流标识、名称或启用状态不正确', path))
    if (!isRecord(flow.trigger))
      result.push(error('EVENT_FLOW_TRIGGER', '事件触发器必须是对象', `${path}.trigger`))
    else if (flow.trigger.scope === 'FORM') {
      unknownKeys(
        flow.trigger,
        ['scope', 'event'],
        `${path}.trigger`,
        'EVENT_TRIGGER_UNKNOWN_PROPERTY',
        result,
      )
      if (
        !['INITIALIZED', 'BEFORE_SUBMIT', 'AFTER_SUBMIT', 'RESET'].includes(
          String(flow.trigger.event),
        )
      )
        result.push(error('EVENT_FLOW_TRIGGER', '表单事件不受支持', `${path}.trigger.event`))
    } else if (flow.trigger.scope === 'COMPONENT') {
      unknownKeys(
        flow.trigger,
        ['scope', 'event', 'nodeId'],
        `${path}.trigger`,
        'EVENT_TRIGGER_UNKNOWN_PROPERTY',
        result,
      )
      if (
        !['CHANGE', 'BLUR', 'FOCUS', 'CLICK'].includes(String(flow.trigger.event)) ||
        typeof flow.trigger.nodeId !== 'string' ||
        !nodeIds.has(flow.trigger.nodeId)
      )
        result.push(error('EVENT_FLOW_TRIGGER', '组件事件或节点引用不正确', `${path}.trigger`))
      else {
        const node = nodeMap.get(flow.trigger.nodeId)
        const componentType =
          node?.nodeType === 'FIELD'
            ? fieldsById.get(node.fieldId)?.componentType
            : node?.componentType
        const registration = componentType ? findDesignerComponent(componentType) : undefined
        if (!registration?.supportedEvents?.includes(flow.trigger.event as never)) {
          result.push(
            error(
              'EVENT_FLOW_TRIGGER_UNSUPPORTED',
              '当前组件不支持所选事件',
              `${path}.trigger.event`,
            ),
          )
        }
      }
    } else result.push(error('EVENT_FLOW_TRIGGER', '事件触发范围不正确', `${path}.trigger.scope`))
    diagnoseEventSteps(
      flow.steps,
      document,
      `${path}.steps`,
      0,
      flow.trigger.scope === 'COMPONENT' && currentRowNodeIds.has(flow.trigger.nodeId),
      {
        moduleCodes,
        dataSourceCodes,
        fieldIds,
        variableCodes,
        stepIds: new Set<string>(),
        branchIds: new Set<string>(),
      },
      result,
    )
  })
}

function diagnoseEventSteps(
  source: unknown,
  document: DesignerDocument,
  path: string,
  depth: number,
  allowCurrentRow: boolean,
  references: {
    moduleCodes: Set<string>
    dataSourceCodes: Set<string>
    fieldIds: Set<string>
    variableCodes: Set<string>
    stepIds: Set<string>
    branchIds: Set<string>
  },
  result: DesignerDiagnostic[],
): void {
  if (!Array.isArray(source))
    return void result.push(error('EVENT_STEPS', '事件步骤必须是数组', path))
  if (depth > 20) return void result.push(error('EVENT_DEPTH', '事件流嵌套深度超过限制', path))
  source.forEach((step, index) => {
    const itemPath = `${path}[${index}]`
    if (!isRecord(step))
      return void result.push(error('EVENT_STEP', '事件步骤必须是对象', itemPath))
    if (step.stepType === 'ACTION') {
      unknownKeys(
        step,
        [
          'id',
          'stepType',
          'name',
          'actionType',
          'configuration',
          'guard',
          'guardFailure',
          'onError',
        ],
        itemPath,
        'EVENT_ACTION_UNKNOWN_PROPERTY',
        result,
      )
      if (typeof step.id !== 'string' || !step.id || references.stepIds.has(step.id)) {
        result.push(error('EVENT_STEP_ID', '事件步骤标识为空、重复或格式不正确', `${itemPath}.id`))
      } else references.stepIds.add(step.id)
      if (
        typeof step.name !== 'string' ||
        !step.name ||
        !eventActionType(step.actionType) ||
        !isRecord(step.configuration) ||
        !['SKIP', 'BLOCK'].includes(String(step.guardFailure)) ||
        !['STOP', 'CONTINUE'].includes(String(step.onError))
      )
        result.push(error('EVENT_ACTION_VALUE', '事件动作配置不正确', itemPath))
      if (step.guard !== undefined)
        result.push(
          ...diagnoseDesignerExpression(step.guard, document, `${itemPath}.guard`, {
            allowCurrentRow,
          }),
        )
      if (isRecord(step.configuration))
        diagnoseEventActionConfiguration(
          step.actionType as DesignerEventActionType,
          step.configuration,
          document,
          itemPath,
          allowCurrentRow,
          references,
          result,
        )
      return
    }
    if (step.stepType === 'CONDITION') {
      unknownKeys(
        step,
        ['id', 'stepType', 'name', 'branches', 'elseSteps'],
        itemPath,
        'EVENT_CONDITION_UNKNOWN_PROPERTY',
        result,
      )
      if (!Array.isArray(step.branches) || !Array.isArray(step.elseSteps))
        return void result.push(error('EVENT_CONDITION_VALUE', '条件分支配置不正确', itemPath))
      if (typeof step.id !== 'string' || !step.id || references.stepIds.has(step.id)) {
        result.push(error('EVENT_STEP_ID', '事件步骤标识为空、重复或格式不正确', `${itemPath}.id`))
      } else references.stepIds.add(step.id)
      if (typeof step.name !== 'string' || !step.name) {
        result.push(error('EVENT_CONDITION_NAME', '条件步骤名称不能为空', `${itemPath}.name`))
      }
      step.branches.forEach((branch, branchIndex) => {
        const branchPath = `${itemPath}.branches[${branchIndex}]`
        if (!isRecord(branch))
          return void result.push(error('EVENT_BRANCH', '条件分支必须是对象', branchPath))
        unknownKeys(
          branch,
          ['id', 'name', 'condition', 'steps'],
          branchPath,
          'EVENT_BRANCH_UNKNOWN_PROPERTY',
          result,
        )
        if (typeof branch.id !== 'string' || !branch.id || references.branchIds.has(branch.id)) {
          result.push(
            error('EVENT_BRANCH_ID', '条件分支标识为空、重复或格式不正确', `${branchPath}.id`),
          )
        } else references.branchIds.add(branch.id)
        if (typeof branch.name !== 'string' || !branch.name) {
          result.push(error('EVENT_BRANCH_NAME', '条件分支名称不能为空', `${branchPath}.name`))
        }
        result.push(
          ...diagnoseDesignerExpression(branch.condition, document, `${branchPath}.condition`, {
            allowCurrentRow,
          }),
        )
        diagnoseEventSteps(
          branch.steps,
          document,
          `${branchPath}.steps`,
          depth + 1,
          allowCurrentRow,
          references,
          result,
        )
      })
      diagnoseEventSteps(
        step.elseSteps,
        document,
        `${itemPath}.elseSteps`,
        depth + 1,
        allowCurrentRow,
        references,
        result,
      )
      return
    }
    result.push(error('EVENT_STEP_TYPE', '事件步骤类型不受支持', `${itemPath}.stepType`))
  })
}

function diagnoseEventActionConfiguration(
  type: DesignerEventActionType,
  configuration: Record<string, unknown>,
  document: DesignerDocument,
  path: string,
  allowCurrentRow: boolean,
  references: {
    moduleCodes: Set<string>
    dataSourceCodes: Set<string>
    fieldIds: Set<string>
    variableCodes: Set<string>
    stepIds: Set<string>
    branchIds: Set<string>
  },
  result: DesignerDiagnostic[],
): void {
  const allowed: Record<DesignerEventActionType, string[]> = {
    SET_FIELD: ['fieldId', 'value', 'expression'],
    CLEAR_FIELD: ['fieldId'],
    COPY_FIELD: ['sourceFieldId', 'targetFieldId'],
    SET_VARIABLE: ['variableCode', 'value', 'expression'],
    VALIDATE: [],
    SUBMIT: [],
    RESET: [],
    PRINT: [],
    MESSAGE: ['message', 'level'],
    OPEN_MODULE: ['moduleCode'],
    CONFIRM_MODULE: ['moduleCode'],
    CANCEL_MODULE: ['moduleCode'],
    NAVIGATE_RESOURCE: ['resourceCode', 'openInNewPage'],
    REFRESH_DATA_SOURCE: ['dataSourceCode'],
    HOST_ACTION: ['actionCode'],
  }
  unknownKeys(
    configuration,
    allowed[type],
    `${path}.configuration`,
    'EVENT_ACTION_CONFIGURATION_UNKNOWN_PROPERTY',
    result,
  )
  const requiredFieldReferences =
    type === 'COPY_FIELD'
      ? ['sourceFieldId', 'targetFieldId']
      : ['SET_FIELD', 'CLEAR_FIELD'].includes(type)
        ? ['fieldId']
        : []
  for (const key of requiredFieldReferences)
    if (!references.fieldIds.has(String(configuration[key])))
      result.push(
        error('EVENT_ACTION_FIELD', '动作引用了不存在的字段', `${path}.configuration.${key}`),
      )
  if (type === 'SET_VARIABLE' && !references.variableCodes.has(String(configuration.variableCode)))
    result.push(
      error(
        'EVENT_ACTION_VARIABLE',
        '动作引用了不存在的变量',
        `${path}.configuration.variableCode`,
      ),
    )
  if (
    ['OPEN_MODULE', 'CONFIRM_MODULE', 'CANCEL_MODULE'].includes(type) &&
    !references.moduleCodes.has(String(configuration.moduleCode))
  )
    result.push(
      error('EVENT_ACTION_MODULE', '动作引用了不存在的模块', `${path}.configuration.moduleCode`),
    )
  if (
    type === 'REFRESH_DATA_SOURCE' &&
    !references.dataSourceCodes.has(String(configuration.dataSourceCode))
  )
    result.push(
      error(
        'EVENT_ACTION_DATA_SOURCE',
        '动作引用了不存在的数据源',
        `${path}.configuration.dataSourceCode`,
      ),
    )
  if (['SET_FIELD', 'SET_VARIABLE'].includes(type) && configuration.expression !== undefined) {
    result.push(
      ...diagnoseDesignerExpression(
        configuration.expression,
        document,
        `${path}.configuration.expression`,
        {
          allowCurrentRow,
        },
      ),
    )
  }
  if (
    type === 'MESSAGE' &&
    (typeof configuration.message !== 'string' ||
      !configuration.message ||
      !['SUCCESS', 'INFO', 'WARNING', 'ERROR'].includes(String(configuration.level)))
  ) {
    result.push(error('EVENT_ACTION_MESSAGE', '消息内容或级别不正确', `${path}.configuration`))
  }
  if (
    type === 'NAVIGATE_RESOURCE' &&
    (!identifier(configuration.resourceCode) ||
      (configuration.openInNewPage !== undefined &&
        typeof configuration.openInNewPage !== 'boolean'))
  ) {
    result.push(
      error('EVENT_ACTION_RESOURCE', '导航资源编码或打开方式不正确', `${path}.configuration`),
    )
  }
  if (type === 'HOST_ACTION' && !identifier(configuration.actionCode)) {
    result.push(
      error('EVENT_ACTION_HOST', 'Host 动作编码不正确', `${path}.configuration.actionCode`),
    )
  }
}

function collectNodes(roots: DesignerLayoutNode[][]): Map<string, DesignerLayoutNode> {
  const result = new Map<string, DesignerLayoutNode>()
  const visit = (nodes: DesignerLayoutNode[]): void =>
    nodes.forEach((node) => {
      result.set(node.id, node)
      if (node.nodeType === 'CONTAINER') node.slots.forEach((slot) => visit(slot.children))
    })
  roots.forEach(visit)
  return result
}

function collectCurrentRowNodeIds(roots: DesignerLayoutNode[][]): Set<string> {
  const result = new Set<string>()
  const visit = (nodes: DesignerLayoutNode[], insideSubtable: boolean): void =>
    nodes.forEach((node) => {
      const currentInsideSubtable =
        insideSubtable ||
        (node.nodeType === 'CONTAINER' &&
          ['row-subtable', 'block-subtable'].includes(node.componentType))
      if (insideSubtable) result.add(node.id)
      if (node.nodeType === 'CONTAINER') {
        node.slots.forEach((slot) => visit(slot.children, currentInsideSubtable))
      }
    })
  roots.forEach((root) => visit(root, false))
  return result
}

function defaultSupportedEvents(componentType: string): Set<'CHANGE' | 'BLUR' | 'FOCUS' | 'CLICK'> {
  if (componentType === 'button') return new Set(['CLICK'])
  return new Set(['CHANGE', 'BLUR', 'FOCUS'])
}

function eventActionType(value: unknown): boolean {
  return [
    'SET_FIELD',
    'CLEAR_FIELD',
    'COPY_FIELD',
    'SET_VARIABLE',
    'VALIDATE',
    'SUBMIT',
    'RESET',
    'PRINT',
    'MESSAGE',
    'OPEN_MODULE',
    'CONFIRM_MODULE',
    'CANCEL_MODULE',
    'NAVIGATE_RESOURCE',
    'REFRESH_DATA_SOURCE',
    'HOST_ACTION',
  ].includes(String(value))
}

function identifier(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(value)
}

function locale(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/.test(value)
}

function unknownKeys(
  source: Record<string, unknown>,
  allowedKeys: Iterable<string>,
  path: string,
  code: string,
  result: DesignerDiagnostic[],
): void {
  const allowed = new Set(allowedKeys)
  for (const key of Object.keys(source))
    if (!allowed.has(key)) result.push(error(code, `不支持属性 ${key}`, `${path}.${key}`))
}

function error(code: string, message: string, path: string): DesignerDiagnostic {
  return { severity: 'ERROR', code, message, path }
}

function finiteNumberOrUndefined(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
