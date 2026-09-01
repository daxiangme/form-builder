import { findDesignerComponent } from './component-registry'
import type { DesignerDocument, DesignerField, DesignerLayoutNode } from './types'

/** 当前容器快捷栅格的影响预览。 */
export interface DesignerQuickGridPreview {
  targetLabel: string
  affectedNodeIds: string[]
  skippedCount: number
}

/** 计算当前节点所在容器的直接普通字段，不进入嵌套布局或子表。 */
export function previewDesignerQuickGrid(
  document: DesignerDocument,
  selectedNodeId: string,
): DesignerQuickGridPreview {
  const target = resolveTargetCollection(document.uiSchema.root, selectedNodeId)
  const affectedNodeIds: string[] = []
  let skippedCount = 0
  for (const node of target.nodes) {
    if (node.nodeType !== 'FIELD' || node.layout.pc.span === 24) {
      skippedCount += 1
      continue
    }
    const field = document.dataSchema.fields.find((item) => item.id === node.fieldId)
    const registration = field ? findDesignerComponent(field.componentType) : undefined
    if (
      !field ||
      !registration ||
      registration.group === 'AUXILIARY' ||
      registration.group === 'SUBTABLE'
    ) {
      skippedCount += 1
      continue
    }
    affectedNodeIds.push(node.id)
  }
  return { targetLabel: target.label, affectedNodeIds, skippedCount }
}

/** 将预览中的直接字段设为统一 PC 跨度并清零偏移；移动布局保持不变。 */
export function applyDesignerQuickGrid(
  document: DesignerDocument,
  selectedNodeId: string,
  span: 24 | 12 | 8 | 6,
): number {
  const preview = previewDesignerQuickGrid(document, selectedNodeId)
  if (preview.affectedNodeIds.length === 0) return 0
  const ids = new Set(preview.affectedNodeIds)
  const visit = (nodes: DesignerLayoutNode[]): void => {
    for (const node of nodes) {
      if (ids.has(node.id)) {
        node.layout.pc = { ...node.layout.pc, span, offset: 0 }
      }
      if (node.nodeType === 'CONTAINER') node.slots.forEach((slot) => visit(slot.children))
    }
  }
  visit(document.uiSchema.root)
  document.uiSchema.overlays.forEach((overlay) => visit(overlay.root))
  return ids.size
}

/** 返回允许批量设置默认值的语义字段。 */
export function collectDesignerBatchDefaultFields(document: DesignerDocument): DesignerField[] {
  return document.dataSchema.fields.filter((field) => {
    if (field.primaryKey || field.systemField || ['FILE', 'OBJECT'].includes(field.semanticType))
      return false
    const registration = findDesignerComponent(field.componentType)
    if (!registration || registration.availability !== 'AVAILABLE') return false
    if (field.semanticType === 'REFERENCE' && registration.group !== 'BASIC') return false
    return true
  })
}

/** 将勾选字段的默认值作为一个文档变更写入。 */
export function applyDesignerBatchDefaults(
  document: DesignerDocument,
  values: Record<string, unknown>,
): number {
  const allowed = new Set(collectDesignerBatchDefaultFields(document).map((field) => field.id))
  let changed = 0
  for (const field of document.dataSchema.fields) {
    if (!allowed.has(field.id) || !(field.id in values)) continue
    field.defaultValue = cloneValue(values[field.id])
    changed += 1
  }
  return changed
}

function resolveTargetCollection(
  root: DesignerLayoutNode[],
  selectedNodeId: string,
): { nodes: DesignerLayoutNode[]; label: string } {
  if (!selectedNodeId) return { nodes: root, label: '主表根画布' }
  const visit = (
    nodes: DesignerLayoutNode[],
    parentLabel: string,
  ): { nodes: DesignerLayoutNode[]; label: string } | undefined => {
    for (const node of nodes) {
      if (node.id === selectedNodeId) {
        if (node.nodeType === 'CONTAINER' && node.slots[0]) {
          const registration = findDesignerComponent(node.componentType)
          return { nodes: node.slots[0].children, label: registration?.name ?? '当前容器' }
        }
        return { nodes, label: parentLabel }
      }
      if (node.nodeType !== 'CONTAINER') continue
      const registration = findDesignerComponent(node.componentType)
      for (const slot of node.slots) {
        const found = visit(slot.children, `${registration?.name ?? '容器'} · ${slot.label}`)
        if (found) return found
      }
    }
    return undefined
  }
  return visit(root, '主表根画布') ?? { nodes: root, label: '主表根画布' }
}

function cloneValue(value: unknown): unknown {
  return value === undefined ? undefined : (JSON.parse(JSON.stringify(value)) as unknown)
}
