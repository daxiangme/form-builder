import type {
  DesignerField,
  DesignerResolvedFieldState,
  DesignerRuntimeMode,
  FormFieldAccessLevel,
  FormFieldAccessMap,
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
 * 按固定优先级把运行模式、服务端权限和文档状态收成最终字段状态。
 *
 * 优先级：模式限制 → 服务端隐藏 → 服务端只读 → 可编辑模式下的必填 → 文档状态收紧 → 公式只读。
 *
 * @param field 当前字段
 * @param documentState 文档条件规则解析后的状态
 * @param options.mode 运行模式
 * @param options.access 服务端对该字段的权限
 * @returns 不能放宽服务端或模式限制的最终状态
 */
export function applyDesignerFieldAccess(
  field: DesignerField,
  documentState: DesignerResolvedFieldState,
  options: {
    mode: DesignerRuntimeMode
    access?: FormFieldAccessLevel
  },
): DesignerResolvedFieldState {
  const modeLocked = isDesignerRuntimeWriteBlocked(options.mode)
  const access = options.access
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
  } else if (isDesignerRuntimeEditableMode(options.mode) && !disabled && access === 'REQUIRED') {
    required = true
  } else if (!isDesignerRuntimeEditableMode(options.mode)) {
    required = false
  }

  return { visible, required, disabled }
}

/**
 * 读取字段权限映射；未声明时视为可编辑，由文档规则继续收紧。
 *
 * @param fieldAccess 服务端权限投影
 * @param fieldId 字段 ID
 * @returns 服务端权限；缺失时返回 undefined
 */
export function readDesignerFieldAccess(
  fieldAccess: FormFieldAccessMap | undefined,
  fieldId: string,
): FormFieldAccessLevel | undefined {
  const access = fieldAccess?.[fieldId]
  if (
    access === 'HIDDEN' ||
    access === 'READ_ONLY' ||
    access === 'EDITABLE' ||
    access === 'REQUIRED'
  ) {
    return access
  }
  return undefined
}
