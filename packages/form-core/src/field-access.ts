import type {
  DesignerField,
  DesignerResolvedFieldState,
  DesignerRuntimeMode,
  FormFieldAccessLevel,
  FormFieldRuntimePolicy,
  FormFieldRuntimePolicyMap,
} from './types'

/** 会改写业务数据或触发写副作用的事件动作。 */
export const DESIGNER_WRITE_EVENT_ACTIONS = new Set([
  'SET_FIELD',
  'CLEAR_FIELD',
  'COPY_FIELD',
  'SET_VARIABLE',
  'SUBMIT',
  'RESET',
  'REFRESH_DATA_SOURCE',
  'HOST_ACTION',
  'CONFIRM_MODULE',
])

const FIELD_TARGETED_WRITE_ACTIONS = new Set(['SET_FIELD', 'CLEAR_FIELD', 'COPY_FIELD'])

/**
 * 判断当前运行模式是否禁止写操作。
 *
 * @param mode 运行模式
 * @returns 只读或详情时返回 true
 */
export function isDesignerRuntimeWriteBlocked(mode: DesignerRuntimeMode | undefined): boolean {
  return mode === 'READ_ONLY' || mode === 'DETAIL'
}

/**
 * 判断当前运行模式是否允许服务端必填约束生效。
 *
 * @param mode 运行模式
 * @returns 仅新增和编辑返回 true
 */
export function isDesignerRuntimeEditableMode(mode: DesignerRuntimeMode | undefined): boolean {
  return mode === 'CREATE' || mode === 'EDIT'
}

/**
 * 判断取值是否为合法的三态访问级别。
 *
 * @param value 待检查值
 * @returns 仅 HIDDEN、READ_ONLY、EDITABLE 返回 true
 */
export function isDesignerFieldAccessLevel(value: unknown): value is FormFieldAccessLevel {
  return value === 'HIDDEN' || value === 'READ_ONLY' || value === 'EDITABLE'
}

/**
 * 判断宿主访问级别是否允许用户、联动或事件写入。
 *
 * 未声明访问级别时视为独立表单，由文档规则继续收紧。HIDDEN 与 READ_ONLY 均不可写。
 *
 * @param accessLevel 宿主访问级别
 * @returns 允许用户写入时返回 true
 */
export function isDesignerHostAccessWritable(
  accessLevel: FormFieldAccessLevel | undefined,
): boolean {
  return accessLevel !== 'HIDDEN' && accessLevel !== 'READ_ONLY'
}

/**
 * 判断当前模式与宿主权限是否允许用户写入字段。
 *
 * 公式计算不走此判断；联动、事件流和控件输入必须遵守结果。
 *
 * @param options.mode 运行模式
 * @param options.accessLevel 宿主访问级别
 * @returns 允许用户写入时返回 true
 */
export function isDesignerFieldUserWritable(options: {
  mode: DesignerRuntimeMode
  accessLevel?: FormFieldAccessLevel
}): boolean {
  if (isDesignerRuntimeWriteBlocked(options.mode)) return false
  return isDesignerHostAccessWritable(options.accessLevel)
}

/**
 * 判断事件动作是否针对具体字段执行写入。
 *
 * @param actionType 事件动作类型
 * @returns 字段赋值类动作返回 true
 */
export function isDesignerFieldTargetedWriteAction(actionType: string): boolean {
  return FIELD_TARGETED_WRITE_ACTIONS.has(actionType)
}

/**
 * 读取字段运行策略；未传映射时返回 undefined，传入后缺失或非法字段失败关闭为 HIDDEN。
 *
 * @param policies 宿主运行策略投影
 * @param fieldId 字段 ID
 * @returns 规范化策略；独立表单返回 undefined
 */
export function readDesignerFieldRuntimePolicy(
  policies: FormFieldRuntimePolicyMap | undefined,
  fieldId: string,
): FormFieldRuntimePolicy | undefined {
  if (policies === undefined) return undefined
  const policy = policies[fieldId]
  if (!isRecord(policy) || !isDesignerFieldAccessLevel(policy.accessLevel)) {
    return { accessLevel: 'HIDDEN' }
  }
  return {
    accessLevel: policy.accessLevel,
    required: policy.required === true ? true : undefined,
  }
}

/**
 * 按固定优先级把运行模式、宿主策略和文档状态收成最终字段状态。
 *
 * 未传策略时按独立表单 Schema 工作。传入策略后访问级别为权威投影，公式只能继续收紧，不能放宽宿主权限。
 *
 * 优先级：模式限制 → 宿主隐藏 → 宿主只读 → 可编辑模式下的宿主必填 → 文档状态收紧 → 公式只读。
 *
 * @param field 当前字段
 * @param documentState 文档条件规则解析后的状态
 * @param options.mode 运行模式
 * @param options.policy 宿主对该字段的运行策略
 * @returns 不能放宽宿主或模式限制的最终状态
 */
export function applyDesignerFieldAccess(
  field: DesignerField,
  documentState: DesignerResolvedFieldState,
  options: {
    mode: DesignerRuntimeMode
    policy?: FormFieldRuntimePolicy
  },
): DesignerResolvedFieldState {
  const modeLocked = isDesignerRuntimeWriteBlocked(options.mode)
  const access = options.policy?.accessLevel
  const formulaLocked = field.behavior.valueRules.some((rule) => rule.mode === 'FORMULA')
  let visible = documentState.visible
  let required = documentState.required
  let disabled = documentState.disabled

  if (access === 'HIDDEN') {
    visible = false
  }
  if (modeLocked || access === 'READ_ONLY' || access === 'HIDDEN') {
    disabled = true
  }
  if (formulaLocked) {
    disabled = true
  }
  if (!visible) {
    required = false
  } else if (!isDesignerRuntimeEditableMode(options.mode) || disabled) {
    required = false
  } else if (options.policy?.required === true && access === 'EDITABLE') {
    required = true
  }

  return { visible, required, disabled, accessLevel: access }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
