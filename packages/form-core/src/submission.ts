import type {
  DesignerDocument,
  DesignerLayoutNode,
  DesignerResolvedFieldState,
  DesignerRuntimeValueStore,
  DesignerSubmissionProjection,
} from './types'

/**
 * 根据表单策略、字段覆盖、宿主运行策略和最终运行状态生成提交投影。
 *
 * 技术隐藏字段始终保留；宿主 HIDDEN / READ_ONLY 不进入用户提交。其他字段的 EXCLUDE 优先于全局策略。
 * 该函数只返回新对象，不修改预览值仓库。
 */
export function projectDesignerSubmission(
  document: DesignerDocument,
  valueStore: DesignerRuntimeValueStore,
  fieldStates: Record<string, DesignerResolvedFieldState>,
  options: { dirtyOverlayModuleIds?: string[] } = {},
): DesignerSubmissionProjection {
  if ((options.dirtyOverlayModuleIds?.length ?? 0) > 0) {
    throw new Error('仍有未确认的弹层模块草稿，不能提交表单')
  }
  const excludedFieldIds: string[] = []
  const includedFieldIds = new Set<string>()
  for (const field of document.dataSchema.fields) {
    const technicalHidden = field.componentType === 'hidden'
    const state = fieldStates[field.id]
    const hostBlocked = state?.accessLevel === 'HIDDEN' || state?.accessLevel === 'READ_ONLY'
    const hidden = state ? !state.visible : field.display.hidden
    const behavior = field.behavior.submitBehavior
    const excluded = technicalHidden
      ? false
      : hostBlocked ||
        behavior === 'EXCLUDE' ||
        (behavior !== 'INCLUDE' && document.submitPolicy.ignoreHiddenFields && hidden)
    if (excluded) excludedFieldIds.push(field.id)
    else includedFieldIds.add(field.id)
  }
  const fields = Object.fromEntries(
    Object.entries(valueStore.fields)
      .filter(([fieldId]) => includedFieldIds.has(fieldId))
      .map(([fieldId, value]) => [fieldId, cloneValue(value)]),
  )
  const collectionFieldIds = collectCollectionFieldIds(document.uiSchema.root)
  for (const overlay of document.uiSchema.overlays) {
    mergeCollectionFieldIds(collectionFieldIds, collectCollectionFieldIds(overlay.root))
  }
  const collections = Object.fromEntries(
    Object.entries(valueStore.collections).map(([containerId, rows]) => {
      const allowed = collectionFieldIds.get(containerId) ?? includedFieldIds
      return [
        containerId,
        rows.map((row) => ({
          rowId: row.rowId,
          values: Object.fromEntries(
            Object.entries(row.values)
              .filter(([fieldId]) => allowed.has(fieldId) && includedFieldIds.has(fieldId))
              .map(([fieldId, value]) => [fieldId, cloneValue(value)]),
          ),
        })),
      ]
    }),
  )
  return { fields, collections, excludedFieldIds }
}

function collectCollectionFieldIds(nodes: DesignerLayoutNode[]): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>()
  const visit = (children: DesignerLayoutNode[]): void => {
    for (const node of children) {
      if (node.nodeType !== 'CONTAINER') continue
      if (['row-subtable', 'block-subtable'].includes(node.componentType)) {
        const fieldIds = new Set<string>()
        for (const slot of node.slots) {
          for (const child of slot.children) {
            if (child.nodeType === 'FIELD') fieldIds.add(child.fieldId)
          }
        }
        result.set(node.id, fieldIds)
        continue
      }
      node.slots.forEach((slot) => visit(slot.children))
    }
  }
  visit(nodes)
  return result
}

function mergeCollectionFieldIds(
  target: Map<string, Set<string>>,
  source: Map<string, Set<string>>,
): void {
  for (const [containerId, fieldIds] of source) target.set(containerId, fieldIds)
}

function cloneValue<T>(value: T): T {
  if (value === undefined || value === null) return value
  if (typeof globalThis.structuredClone === 'function') {
    try {
      return globalThis.structuredClone(value)
    } catch {
      // 文件句柄等宿主对象无法结构化克隆时使用保守递归策略。
    }
  }
  if (Array.isArray(value)) return value.map((item) => cloneValue(item)) as T
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        cloneValue(item),
      ]),
    ) as T
  }
  return value
}
