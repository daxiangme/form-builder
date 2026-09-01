/** 设计器文档当前稳定版本。 */
export const DESIGNER_DOCUMENT_VERSION = '1.0' as const

/** 设计器字段的语义数据类型，不包含任何数据库方言。 */
export type DesignerSemanticType =
  | 'STRING'
  | 'LONG_TEXT'
  | 'NUMBER'
  | 'BOOLEAN'
  | 'DATE'
  | 'DATE_TIME'
  | 'FILE'
  | 'REFERENCE'
  | 'OBJECT'
  | 'ARRAY'

/** 本地字段与未来权威字段来源之间的绑定状态。 */
export type DesignerBindingStatus = 'UNBOUND' | 'BOUND' | 'STALE' | 'INCOMPATIBLE' | 'MISSING'

/** 设计器组件在静态 Core 中的能力状态。 */
export type DesignerComponentAvailability = 'AVAILABLE' | 'CONDITIONAL' | 'UNAVAILABLE'

/** 组件面板的稳定分类。 */
export type DesignerComponentGroup =
  'LAYOUT' | 'BASIC' | 'ADVANCED' | 'DYNAMIC' | 'SUBTABLE' | 'AUXILIARY'

/** 设计器与静态运行预览共用的模式。 */
export type DesignerRuntimeMode = 'DESIGN' | 'CREATE' | 'EDIT' | 'READ_ONLY' | 'DETAIL'

/** 设计器当前设备。移动端只复用同一份 Schema。 */
export type DesignerDevice = 'desktop' | 'mobile'

/**
 * 静态预览中的子表行。
 *
 * `rowId` 只标识当前预览副本中的一行；`values` 使用字段 ID 作为键，避免字段编码调整后串行数据。
 */
export interface DesignerSubtableRow {
  rowId: string
  values: Record<string, unknown>
}

/**
 * 子表各展示形态共用的只读列投影。
 *
 * 列标识来自布局节点，字段身份来自 Data Schema；该投影不进入设计文档，也不持有可变节点引用。
 */
export interface DesignerSubtableColumn {
  columnId: string
  fieldId: string
  fieldKey: string
  label: string
  componentType: string
  semanticType: DesignerSemanticType
}

/**
 * 静态运行预览的值仓库。
 *
 * 普通字段与集合值分开保存；集合以子表容器节点 ID 为键，整个仓库只属于预览副本，不允许写回设计文档。
 */
export interface DesignerRuntimeValueStore {
  fields: Record<string, unknown>
  collections: Record<string, DesignerSubtableRow[]>
}

/** 表达式读取字段时的受控数据作用域。 */
export type DesignerExpressionFieldScope = 'ROOT' | 'CURRENT_ROW'

/** 表达式可读取的受控上下文值。 */
export type DesignerExpressionContextKey =
  'RUNTIME_MODE' | 'DEVICE' | 'CURRENT_USER_ID' | 'CURRENT_TENANT_ID' | 'NOW'

/** 声明式表达式 AST；Core 不持久化或执行自由脚本。 */
export type DesignerExpression =
  | { kind: 'LITERAL'; value: string | number | boolean | null }
  | { kind: 'FIELD'; fieldId: string; scope: DesignerExpressionFieldScope }
  | { kind: 'VARIABLE'; variableCode: string }
  | { kind: 'CONTEXT'; key: DesignerExpressionContextKey }
  | {
      kind: 'CALL'
      function: DesignerExpressionFunction
      arguments: DesignerExpression[]
    }

/** 表达式解释器允许的纯函数目录。 */
export type DesignerExpressionFunction =
  | 'AND'
  | 'OR'
  | 'NOT'
  | 'EQ'
  | 'NE'
  | 'GT'
  | 'GTE'
  | 'LT'
  | 'LTE'
  | 'EMPTY'
  | 'NOT_EMPTY'
  | 'IN'
  | 'CONTAINS'
  | 'ADD'
  | 'SUBTRACT'
  | 'MULTIPLY'
  | 'DIVIDE'
  | 'CONCAT'
  | 'COALESCE'
  | 'LENGTH'
  | 'IF'

/** 字段运行状态规则。 */
export interface DesignerFieldStateRule {
  id: string
  target: 'VISIBLE' | 'REQUIRED' | 'DISABLED'
  condition: DesignerExpression
  valueWhenTrue: boolean
  valueWhenFalse?: boolean
}

/** 联动规则覆盖已有目标值时采用的受控策略。 */
export type DesignerLinkageOverwritePolicy = 'ALWAYS' | 'EMPTY_ONLY' | 'CONFIRM'

/** 确定性重算并使目标字段保持只读的计算公式。 */
export interface DesignerFormulaValueRule {
  id: string
  mode: 'FORMULA'
  expression: DesignerExpression
  condition?: DesignerExpression
}

/** 仅在依赖字段变化后执行的数据联动。 */
export interface DesignerLinkageValueRule {
  id: string
  mode: 'LINKAGE'
  expression: DesignerExpression
  condition?: DesignerExpression
  overwritePolicy: DesignerLinkageOverwritePolicy
}

/** 字段计算或赋值联动规则。 */
export type DesignerFieldValueRule = DesignerFormulaValueRule | DesignerLinkageValueRule

/** 字段验证规则类型。必填仍由字段 required 或状态规则独立决定。 */
export type DesignerValidationRuleType =
  | 'LENGTH'
  | 'RANGE'
  | 'PRECISION'
  | 'FORMAT'
  | 'REGEX'
  | 'DATE'
  | 'SELECTION'
  | 'FILE'
  | 'COMPARE_FIELD'
  | 'EXPRESSION'
  | 'SUBTABLE'
  | 'REMOTE'

/** 验证规则通用字段；规则参数由具体类型收紧。 */
export interface DesignerValidationRuleBase {
  id: string
  name: string
  enabled: boolean
  trigger: 'CHANGE' | 'BLUR' | 'SUBMIT'
  severity: 'ERROR' | 'WARNING'
  message: string
  condition?: DesignerExpression
}

/** 最小值与最大值区间配置。 */
export interface DesignerValidationRangeConfiguration {
  minimum?: number
  maximum?: number
}

/** 跨字段比较允许的受控操作符。 */
export type DesignerValidationComparisonOperator = 'EQ' | 'NE' | 'GT' | 'GTE' | 'LT' | 'LTE'

/** 各验证规则类型对应的严格参数。 */
export interface DesignerValidationConfigurationMap {
  LENGTH: DesignerValidationRangeConfiguration
  RANGE: DesignerValidationRangeConfiguration
  PRECISION: { scale: number }
  FORMAT: { format: 'EMAIL' | 'PHONE' | 'IDENTIFIER' }
  REGEX: { pattern: string }
  DATE: { minimum?: string; maximum?: string }
  SELECTION: DesignerValidationRangeConfiguration
  FILE: { maximumCount?: number; maximumSizeMb?: number; accept?: string }
  COMPARE_FIELD: { fieldId: string; operator: DesignerValidationComparisonOperator }
  EXPRESSION: { expression: DesignerExpression }
  SUBTABLE: { containerId: string; minimumRows?: number; maximumRows?: number }
  REMOTE: { provider: string; validatorId: string }
}

/** 声明式字段验证规则判别联合，JSON 外形保持 `type + configuration`。 */
export type DesignerValidationRule = {
  [Type in DesignerValidationRuleType]: DesignerValidationRuleBase & {
    type: Type
    configuration: DesignerValidationConfigurationMap[Type]
  }
}[DesignerValidationRuleType]

/** 字段是否进入最终提交数据。 */
export type DesignerFieldSubmitBehavior = 'AUTO' | 'INCLUDE' | 'EXCLUDE'

/** 组件可绑定的运行事件。 */
export type DesignerComponentEvent = 'CHANGE' | 'BLUR' | 'FOCUS' | 'CLICK'

/** 字段行为配置。 */
export interface DesignerFieldBehavior {
  stateRules: DesignerFieldStateRule[]
  valueRules: DesignerFieldValueRule[]
  validationRules: DesignerValidationRule[]
  submitBehavior: DesignerFieldSubmitBehavior
  eventBindings: Partial<Record<DesignerComponentEvent, string>>
}

/** 静态选项的稳定结构。 */
export interface DesignerOption {
  label: string
  value: string | number | boolean
  disabled?: boolean
  children?: DesignerOption[]
}

/** 可选外部字段绑定引用；Core 只保存稳定引用，不解释业务来源。 */
export interface DesignerFieldBinding {
  provider: string
  sourceId: string
  fieldId: string
  fieldPath: string
  sourceDataType: string
  sourceRevision?: number
}

/** 设计文档保存的外部数据模型身份；不包含物理表、物理列或键映射。 */
export interface DesignerDataModelSource {
  provider: string
  sourceId: string
  sourceRevision?: number
}

/** 设计文档中的语义实体身份。 */
export interface DesignerDataEntity {
  id: string
  code: string
  name: string
}

/** 当前 Core 支持的主实体到一级子实体一对多关系。 */
export interface DesignerOneToManyRelation {
  id: string
  code: string
  name: string
  parentEntityId: string
  childEntity: DesignerDataEntity
  loadMode: 'SYNC' | 'ASYNC'
}

/** 字段基础校验。专属校验继续存放在版本化组件配置中。 */
export interface DesignerFieldValidation {
  minimumLength?: number
  maximumLength?: number
  minimum?: number
  maximum?: number
  pattern?: string
  message?: string
}

/** 字段展示配置。 */
export interface DesignerFieldDisplay {
  placeholder: string
  hidden: boolean
  readonly: boolean
}

/** 数据 Schema 中的本地语义字段。 */
export interface DesignerField {
  id: string
  /** 字段所属语义实体编码；根级字段必须属于主实体，子表列必须属于对应子实体。 */
  entityCode: string
  key: string
  label: string
  semanticType: DesignerSemanticType
  componentType: string
  configurationVersion: number
  configuration: Record<string, unknown>
  defaultValue: unknown
  helpText: string
  required: boolean
  validation: DesignerFieldValidation
  /** 条件状态、计算联动、独立验证、提交投影和事件绑定。 */
  behavior: DesignerFieldBehavior
  display: DesignerFieldDisplay
  bindingStatus: DesignerBindingStatus
  primaryKey: boolean
  systemField: boolean
  displayOrder: number
  binding?: DesignerFieldBinding
}

/** 文档内持久化的数据模型目录。 */
export interface DesignerDataSchema {
  source?: DesignerDataModelSource
  rootEntity: DesignerDataEntity
  relations: DesignerOneToManyRelation[]
  fields: DesignerField[]
}

/** 单端 24 栅格配置。 */
export interface DesignerDeviceGrid {
  span: number
  offset: number
  showLabel: boolean
  labelPosition: 'INHERIT' | 'TOP' | 'LEFT' | 'RIGHT'
}

/** PC 与移动端共用字段树时的响应式布局。 */
export interface DesignerResponsiveGrid {
  pc: DesignerDeviceGrid
  mobile: DesignerDeviceGrid
}

/** 引用数据字段的 UI 节点。 */
export interface DesignerFieldNode {
  nodeType: 'FIELD'
  id: string
  fieldId: string
  layout: DesignerResponsiveGrid
}

/** 容器中的稳定命名插槽。 */
export interface DesignerLayoutSlot {
  id: string
  slotCode: string
  label: string
  children: DesignerLayoutNode[]
}

/** 显式布局或辅助组件节点。 */
export interface DesignerContainerNode {
  nodeType: 'CONTAINER'
  id: string
  componentType: string
  configurationVersion: number
  configuration: Record<string, unknown>
  layout: DesignerResponsiveGrid
  slots: DesignerLayoutSlot[]
  /** 容器或辅助组件仅保存注册表允许的事件绑定。 */
  eventBindings?: Partial<Record<DesignerComponentEvent, string>>
}

/** 设计器 UI Schema 节点。 */
export type DesignerLayoutNode = DesignerFieldNode | DesignerContainerNode

/** 表单字段控件和显式容器共用的受控圆角档位。 */
export type DesignerRadiusPreset = 'THEME' | 'NONE' | 'SMALL' | 'BASE' | 'LARGE'

/** 表单显式布局容器允许使用的表面样式。 */
export type DesignerContainerStyle = 'NONE' | 'BORDERED' | 'SHADOW'

/** 容器节点对表单默认表面样式的覆盖值。 */
export type DesignerContainerStyleOverride = 'INHERIT' | DesignerContainerStyle | 'FILLED'

/** 容器节点对表单默认圆角的覆盖值。 */
export type DesignerContainerRadiusOverride = 'INHERIT' | DesignerRadiusPreset

/** 批量恢复容器外观继承时可独立处理的配置维度。 */
export type DesignerContainerAppearanceDimension = 'STYLE' | 'RADIUS'

/** 表单整体外观配置。 */
export interface DesignerAppearance {
  labelPosition: 'TOP' | 'LEFT' | 'RIGHT'
  labelWidth: number
  labelSuffix: string
  labelAlign: 'LEFT' | 'RIGHT'
  defaultPlaceholder: string
  gridGutter: number
  /** 字段栅格的纵向行距，单位为 px，合法范围为 0～64。 */
  rowGap: number
  defaultPcSpan: number
  defaultMobileSpan: number
  readonlyDisplayMode: 'CONTROL' | 'TEXT'
  size: 'SMALL' | 'DEFAULT' | 'LARGE'
  /** 普通字段控件统一使用的圆角；THEME 表示继续跟随系统主题。 */
  controlRadius: DesignerRadiusPreset
  /** 支持表面的显式布局容器在未覆盖时使用的默认样式。 */
  containerStyle: DesignerContainerStyle
  /** 支持表面的显式布局容器在未覆盖时使用的默认圆角。 */
  containerRadius: DesignerRadiusPreset
}

/** 表单提交时对普通隐藏字段的统一处理策略。 */
export interface DesignerSubmitPolicy {
  ignoreHiddenFields: boolean
}

/** 运行态动作栏中的受控按钮。 */
export interface DesignerActionBarButton {
  action: 'SUBMIT' | 'RESET' | 'PRINT'
  label: string
  enabled: boolean
}

/** 表单运行态动作栏配置。 */
export interface DesignerActionBar {
  visible: boolean
  position: 'TOP' | 'BOTTOM' | 'BOTH'
  align: 'LEFT' | 'CENTER' | 'RIGHT'
  buttons: DesignerActionBarButton[]
}

/** 表单持久化变量定义；运行值不写入设计文档。 */
export interface DesignerVariableDefinition {
  id: string
  code: string
  name: string
  valueType: 'STRING' | 'NUMBER' | 'BOOLEAN' | 'DATE' | 'OBJECT'
  initialValue: string | number | boolean | null
}

/** 数据源输入或输出映射。 */
export interface DesignerDataSourceMapping {
  source: string
  target: string
}

/** Core 只保存稳定来源身份和映射，不保存 URL、SQL、请求头或凭据。 */
export interface DesignerDataSourceDefinition {
  id: string
  code: string
  name: string
  provider: string
  sourceId: string
  sourceRevision?: number
  inputMappings: DesignerDataSourceMapping[]
  outputMappings: DesignerDataSourceMapping[]
}

/** 表单生命周期事件。 */
export type DesignerFormEvent = 'INITIALIZED' | 'BEFORE_SUBMIT' | 'AFTER_SUBMIT' | 'RESET'

/** 声明式动作步骤类型。 */
export type DesignerEventActionType =
  | 'SET_FIELD'
  | 'CLEAR_FIELD'
  | 'COPY_FIELD'
  | 'SET_VARIABLE'
  | 'VALIDATE'
  | 'SUBMIT'
  | 'RESET'
  | 'PRINT'
  | 'MESSAGE'
  | 'OPEN_MODULE'
  | 'CONFIRM_MODULE'
  | 'CANCEL_MODULE'
  | 'NAVIGATE_RESOURCE'
  | 'REFRESH_DATA_SOURCE'
  | 'HOST_ACTION'

/** 事件动作的错误处理策略。 */
export type DesignerEventErrorPolicy = 'STOP' | 'CONTINUE'

/** 引导式事件流中的单个动作。 */
export interface DesignerEventActionStep {
  id: string
  stepType: 'ACTION'
  name: string
  actionType: DesignerEventActionType
  configuration: Record<string, unknown>
  guard?: DesignerExpression
  guardFailure: 'SKIP' | 'BLOCK'
  onError: DesignerEventErrorPolicy
}

/** 条件分支。 */
export interface DesignerEventConditionBranch {
  id: string
  name: string
  condition: DesignerExpression
  steps: DesignerEventStep[]
}

/** 引导式事件流中的条件节点。 */
export interface DesignerEventConditionStep {
  id: string
  stepType: 'CONDITION'
  name: string
  branches: DesignerEventConditionBranch[]
  elseSteps: DesignerEventStep[]
}

/** 事件流递归步骤。 */
export type DesignerEventStep = DesignerEventActionStep | DesignerEventConditionStep

/** 可由字段、容器或表单生命周期引用的声明式事件流。 */
export interface DesignerEventFlow {
  id: string
  code: string
  name: string
  trigger:
    | { scope: 'FORM'; event: DesignerFormEvent }
    | { scope: 'COMPONENT'; event: DesignerComponentEvent; nodeId: string }
  enabled: boolean
  steps: DesignerEventStep[]
}

/** 弹层模块类型。 */
export type DesignerOverlayKind = 'DIALOG' | 'DRAWER'

/** 弹层模块的数据草稿来源。 */
export type DesignerOverlayDataContext = 'FORM_DRAFT' | 'SUBTABLE_ROW_DRAFT'

/** 弹窗在运行态允许使用的最大高度档位。 */
export type DesignerOverlayMaxHeightPreset = 'COMPACT' | 'STANDARD' | 'SPACIOUS' | 'VIEWPORT'

/** 主体之外可被事件打开的弹窗或抽屉视图。 */
export interface DesignerOverlayModule {
  id: string
  code: string
  name: string
  kind: DesignerOverlayKind
  dataContext: DesignerOverlayDataContext
  width: number
  /** 弹窗使用的受控圆角档位；抽屉保留该值但不渲染圆角。 */
  radius: DesignerRadiusPreset
  /** 弹窗运行最大高度；抽屉保留该值但继续占满可用高度。 */
  maxHeightPreset: DesignerOverlayMaxHeightPreset
  root: DesignerLayoutNode[]
}

/** 国际化词条。 */
export interface DesignerI18nEntry {
  key: string
  values: Record<string, string>
}

/** 表单国际化配置。 */
export interface DesignerI18nConfiguration {
  enabled: boolean
  defaultLocale: string
  locales: string[]
  entries: DesignerI18nEntry[]
}

/** 可设计视图集合。主体 root 保持旧协议位置，弹层作为增量集合。 */
export interface DesignerUiSchema {
  root: DesignerLayoutNode[]
  overlays: DesignerOverlayModule[]
}

/** 独立设计器完整文档。 */
export interface DesignerDocument {
  documentVersion: typeof DESIGNER_DOCUMENT_VERSION
  id: string
  name: string
  description: string
  dataSchema: DesignerDataSchema
  uiSchema: DesignerUiSchema
  appearance: DesignerAppearance
  submitPolicy: DesignerSubmitPolicy
  actionBar: DesignerActionBar
  variables: DesignerVariableDefinition[]
  dataSources: DesignerDataSourceDefinition[]
  eventFlows: DesignerEventFlow[]
  i18n: DesignerI18nConfiguration
  actions: DesignerAction[]
  extensions: Record<string, unknown>
}

/** Core 仅保存声明式动作引用，不接受自由脚本。 */
export interface DesignerAction {
  code: string
  name: string
  handlerType: 'SAVE' | 'RESET' | 'DELETE' | 'PRINT' | 'NAVIGATE'
  target?: string
}

/** 属性编辑器中的稳定原子选项。 */
export interface DesignerPropertyOption {
  label: string
  value: string | number | boolean
  disabled?: boolean
}

/** 属性编辑器的共享行为；历史值策略只影响编辑显示，不会改写文档。 */
export interface DesignerPropertyEditorBase {
  visibleWhen?: (configuration: Readonly<Record<string, unknown>>) => boolean
  legacyValuePolicy?: 'PRESERVE' | 'REJECT'
  /** 为需要保留的旧枚举值提供可理解的显示名称，避免属性面板暴露内部编码。 */
  legacyValueLabels?: Readonly<Record<string, string>>
}

/**
 * 组件注册项使用的业务语义属性编辑器。
 *
 * 判别联合把受控选项、单位、范围和专属能力集中在注册表，属性面板只解释该接口，
 * 不再根据字段 key 或 JavaScript 值类型猜测应该使用哪一种输入控件。
 */
export type DesignerPropertyEditor =
  | (DesignerPropertyEditorBase & {
      type: 'TEXT'
      maxLength?: number
    })
  | (DesignerPropertyEditorBase & {
      type: 'TEXTAREA'
      rows?: number
      maxLength?: number
    })
  | (DesignerPropertyEditorBase & {
      type: 'NUMBER'
      minimum?: number
      maximum?: number
      step?: number
      unit?: string
    })
  | (DesignerPropertyEditorBase & { type: 'BOOLEAN' })
  | (DesignerPropertyEditorBase & {
      type: 'SELECT' | 'SEGMENTED'
      options: DesignerPropertyOption[]
    })
  | (DesignerPropertyEditorBase & {
      type: 'PRESET_NUMBER'
      options: DesignerPropertyOption[]
      minimum?: number
      maximum?: number
      unit?: string
    })
  | (DesignerPropertyEditorBase & { type: 'COLOR' })
  | (DesignerPropertyEditorBase & { type: 'OPTIONS' })
  | (DesignerPropertyEditorBase & {
      type: 'DATE_FORMAT'
      sourceKey: string
    })
  | (DesignerPropertyEditorBase & { type: 'FILE_TYPES' })
  | (DesignerPropertyEditorBase & {
      type: 'URL'
      maxLength?: number
    })
  | (DesignerPropertyEditorBase & {
      type: 'RESOURCE_REFERENCE'
      resourceType: 'DICTIONARY' | 'PROCESS' | 'FORM' | 'ASSET_POLICY'
      unavailableReason: string
    })
  | (DesignerPropertyEditorBase & {
      type: 'GRID_SPAN'
      device: DesignerDevice
    })
  | (DesignerPropertyEditorBase & {
      type: 'GRID_OFFSET'
      spanKey: string
    })
  | (DesignerPropertyEditorBase & {
      type: 'IDENTIFIER'
      maxLength?: number
    })

/** 注册项贡献给属性工作台的结构化属性。 */
export interface DesignerPropertyDefinition {
  key: string
  label: string
  section: 'BASIC' | 'DATA' | 'DISPLAY' | 'CAPABILITY'
  editor: DesignerPropertyEditor
  description?: string
}

/** 组件注册项是组件目录、节点工厂、属性和渲染行为的唯一真源。 */
export interface DesignerComponentRegistration {
  componentType: string
  name: string
  icon: string
  group: DesignerComponentGroup
  nodeKind: 'FIELD' | 'CONTAINER'
  semanticType: DesignerSemanticType
  compatibleSemanticTypes: DesignerSemanticType[]
  configurationVersion: number
  defaultConfiguration: Readonly<Record<string, unknown>>
  defaultSpan: number
  /** 新建节点的外层字段标签默认状态；已有文档继续使用节点自身布局值。 */
  defaultShowLabel: boolean
  /** 详情态外层标签策略；自描述组件可以隐藏重复标签，但不改写布局配置。 */
  detailLabelPolicy: 'INHERIT' | 'HIDE'
  /** 只有 SURFACE 容器才允许继承或覆盖表单级容器外观。 */
  containerAppearance: 'NONE' | 'SURFACE'
  availability: DesignerComponentAvailability
  unavailableReason: string
  acceptsChildren: boolean
  /** 注册项显式声明可绑定事件；未声明时不显示事件入口。 */
  supportedEvents?: DesignerComponentEvent[]
  properties: DesignerPropertyDefinition[]
}

/** 运行表达式时由 Host 提供的只读上下文。 */
export interface DesignerExpressionRuntimeContext {
  fields: Record<string, unknown>
  currentRow?: Record<string, unknown>
  variables: Record<string, unknown>
  context: Partial<Record<DesignerExpressionContextKey, unknown>>
}

/** 字段解释后的运行状态。 */
export interface DesignerResolvedFieldState {
  visible: boolean
  required: boolean
  disabled: boolean
}

/** 单条运行验证结果。 */
export interface DesignerValidationResult {
  fieldId: string
  ruleId: string
  severity: 'ERROR' | 'WARNING'
  message: string
}

/** 字段下方分别展示的错误与非阻断警告。 */
export interface DesignerFieldFeedback {
  error?: string
  warning?: string
}

/** 提交投影结果。 */
export interface DesignerSubmissionProjection {
  fields: Record<string, unknown>
  collections: Record<string, DesignerSubtableRow[]>
  excludedFieldIds: string[]
}

/** 宿主注入给远程能力的稳定运行上下文，不包含认证凭据或传输配置。 */
export interface FormRuntimeAdapterContext {
  applicationCode?: string
  resourceCode?: string
  formId?: string
  recordToken?: string
  moduleCode?: string
  rowKey?: string
  extension?: Readonly<Record<string, unknown>>
}

/** 文件上传完成后供运行表单展示的资源元数据。 */
export interface FormAssetReference {
  assetId: string
  name: string
  size: number
  contentType?: string
  downloadUrl?: string
}

/** 文件上传请求；Schema 只保存约束，真实文件和宿主上下文只存在于本次调用。 */
export interface FormAssetUploadRequest {
  file: File
  fieldId: string
  fieldCode: string
  policyRef?: string
  context: FormRuntimeAdapterContext
}

/** 文件元数据批量解析请求。 */
export interface FormAssetResolveRequest {
  assetIds: string[]
  fieldId: string
  fieldCode: string
  context: FormRuntimeAdapterContext
}

/** 文件下载请求。 */
export interface FormAssetDownloadRequest {
  assetId: string
  fieldId: string
  fieldCode: string
  context: FormRuntimeAdapterContext
}

/** 文件下载结果；宿主可以返回可访问 URL 或需要浏览器保存的 Blob。 */
export type FormAssetDownloadResult =
  | { kind: 'URL'; url: string; fileName?: string }
  | { kind: 'BLOB'; blob: Blob; fileName: string; contentType?: string }

/** 文件上传、元数据解析与下载端口。物理删除不属于字段编辑语义。 */
export interface FormAssetAdapter {
  upload: (request: FormAssetUploadRequest) => Promise<FormAssetReference>
  resolve: (request: FormAssetResolveRequest) => Promise<FormAssetReference[]>
  download: (request: FormAssetDownloadRequest) => Promise<FormAssetDownloadResult>
}

/** 受控远程验证 Adapter。 */
export interface DesignerRemoteValidationAdapter {
  validate: (request: {
    provider: string
    validatorId: string
    value: unknown
    fieldId: string
  }) => Promise<{ valid: boolean; message?: string }>
}

/** 受控数据源运行 Adapter。 */
export interface DesignerDataSourceAdapter {
  execute: (
    definition: DesignerDataSourceDefinition,
    input: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>
}

/** Host 动作与同应用资源导航 Adapter。 */
export interface DesignerHostActionAdapter {
  execute: (actionCode: string, input: Record<string, unknown>) => Promise<void>
  navigateResource: (resourceCode: string, openInNewPage: boolean) => Promise<void>
}

/** 同应用资源导航端口。 */
export interface FormNavigationAdapter {
  navigate: (request: {
    resourceCode: string
    openInNewPage: boolean
    context: FormRuntimeAdapterContext
  }) => Promise<void>
}

/** 人员、组织、角色和岗位等目录选择端口。 */
export interface FormDirectoryAdapter {
  query: (request: {
    subjectType: string
    keyword: string
    pageNo: number
    pageSize: number
    context: FormRuntimeAdapterContext
  }) => Promise<{
    items: Array<{ id: string; label: string; description?: string }>
    totalCount: number
  }>
}

/** OCR 识别端口。 */
export interface FormOcrAdapter {
  recognize: (request: {
    file: File
    fieldId: string
    fieldCode: string
    provider?: string
    context: FormRuntimeAdapterContext
  }) => Promise<Record<string, unknown>>
}

/** 扫码端口。 */
export interface FormScanAdapter {
  scan: (request: { context: FormRuntimeAdapterContext }) => Promise<{ text: string }>
}

/** 定位端口。 */
export interface FormLocationAdapter {
  locate: (request: {
    context: FormRuntimeAdapterContext
  }) => Promise<{ longitude: number; latitude: number; address?: string }>
}

/** 联动覆盖已有字段值前由 Host 提供的受控确认 Adapter。 */
export interface DesignerLinkageConfirmationAdapter {
  confirmOverwrite: (request: {
    fieldId: string
    fieldLabel: string
    currentValue: unknown
    nextValue: unknown
  }) => Promise<boolean>
}

/** 静态运行预览可选 Adapter 集合；缺少能力时必须失败关闭。 */
export interface DesignerRuntimeAdapters {
  asset?: FormAssetAdapter
  remoteValidation?: DesignerRemoteValidationAdapter
  dataSource?: DesignerDataSourceAdapter
  hostAction?: DesignerHostActionAdapter
  linkageConfirmation?: DesignerLinkageConfirmationAdapter
  navigation?: FormNavigationAdapter
  directory?: FormDirectoryAdapter
  ocr?: FormOcrAdapter
  scan?: FormScanAdapter
  location?: FormLocationAdapter
}

/** 对外公开的运行 Adapter 集合别名。 */
export type FormRuntimeAdapters = DesignerRuntimeAdapters

/** 文档诊断级别。 */
export type DesignerDiagnosticSeverity = 'ERROR' | 'WARNING'

/** 设计文档的可定位诊断。 */
export interface DesignerDiagnostic {
  severity: DesignerDiagnosticSeverity
  code: string
  message: string
  path: string
}

/** 文档解码结果。错误诊断存在时不返回文档。 */
export interface DesignerDocumentDecodeResult {
  document?: DesignerDocument
  diagnostics: DesignerDiagnostic[]
}

/** 画布中可接收新节点的稳定目标。 */
export interface DesignerDropTarget {
  containerId: string | null
  slotCode: string
  index: number
  placement?: 'BEFORE' | 'AFTER' | 'INSIDE' | 'GRID'
  columnStart?: number
}

/** 设计态拖放会话；该状态只服务当前交互，不进入设计文档。 */
export interface DesignerDragSession {
  active: boolean
  source: 'PALETTE' | 'CANVAS' | null
  sourceNodeId: string
  target?: DesignerDropTarget
  accepted: boolean
  rejectionReason: string
}

/** Sortable 在设计器内部暴露的最小移动上下文，避免工作台依赖第三方完整事件类型。 */
export interface DesignerSortableMoveEvent {
  dragged: HTMLElement
  related: HTMLElement
  to: HTMLElement
  willInsertAfter?: boolean
}

/** 24 栅格投影中的字段或布局节点单元。 */
export interface DesignerCanvasCell {
  nodeId: string
  index: number
  row: number
  start: number
  span: number
}

/** 24 栅格投影中的空白可放置单元。 */
export interface DesignerCanvasGap {
  index: number
  row: number
  start: number
  span: number
}

/** 设计态只读栅格投影，不作为第二份 Schema 持久化。 */
export interface DesignerCanvasProjection {
  cells: DesignerCanvasCell[]
  gaps: DesignerCanvasGap[]
  rowCount: number
}

/** 大纲使用的只读投影节点。 */
export interface DesignerOutlineItem {
  id: string
  label: string
  typeLabel: string
  children: DesignerOutlineItem[]
}

/** Host 首次向独立 Core 注入的字段描述。 */
export interface DesignerInitialField {
  fieldId: string
  fieldCode: string
  fieldName: string
  sourceDataType: string
  semanticType: DesignerSemanticType
  defaultComponentType: string
  physicalColumnName?: string
  required?: boolean
  readonly?: boolean
  primaryKey?: boolean
  systemField?: boolean
  displayOrder?: number
}

/** Host 首次向独立 Core 注入的实体描述。 */
export interface DesignerInitialEntity {
  entityId: string
  entityCode: string
  entityName: string
  physicalTableName?: string
  fields: DesignerInitialField[]
}

/** Host 首次向独立 Core 注入的一级一对多关系。 */
export interface DesignerInitialOneToManyRelation {
  relationId: string
  relationCode: string
  relationName: string
  parentEntityId: string
  childEntity: DesignerInitialEntity
  loadMode?: 'SYNC' | 'ASYNC'
  keyMappings?: Array<{ parentFieldId: string; childFieldId: string }>
}

/** Host 首次初始化 Core 时使用的数据模型参数。 */
export interface DesignerInitialDataModel {
  provider: string
  sourceId: string
  sourceRevision?: number
  rootEntity: DesignerInitialEntity
  relations: DesignerInitialOneToManyRelation[]
}

/** 物理来源信息只存在于当前 Core 会话，绝不进入设计文档。 */
export interface DesignerSourceMetadataIndex {
  provider: string
  sourceId: string
  sourceRevision?: number
  entities: Record<string, { physicalTableName?: string }>
  fields: Record<string, { physicalColumnName?: string }>
  relations: Record<
    string,
    {
      keyMappings: Array<{ parentFieldId: string; childFieldId: string }>
    }
  >
}

/** 字段页一次生成主表和子表布局时的受控请求。 */
export interface DesignerGenerateLayoutRequest {
  fieldIds: string[]
  relations: Array<{
    relationCode: string
    componentType: 'row-subtable' | 'block-subtable'
  }>
}

/** 主实体可修改的语义身份属性。 */
export type DesignerRootEntityPatch = Partial<Pick<DesignerDataEntity, 'name' | 'code'>>

/** 一级子表关系可修改的语义身份属性。 */
export interface DesignerRelationPatch {
  name?: string
  code?: string
  childEntityName?: string
  childEntityCode?: string
}
