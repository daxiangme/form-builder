import { findDesignerComponent } from './component-registry'
import { designerRadiusCssValue, normalizeDesignerContainerRadiusOverride } from './radius'
import type {
  DesignerAppearance,
  DesignerContainerAppearanceDimension,
  DesignerContainerNode,
  DesignerContainerStyleOverride,
  DesignerDocument,
  DesignerLayoutNode,
  DesignerRadiusValue,
} from './types'

/** 设计与运行渲染器共同消费的容器外观解析结果。 */
export interface DesignerResolvedContainerAppearance {
  style: Exclude<DesignerContainerStyleOverride, 'INHERIT'>
  radius: DesignerRadiusValue
  styleSource: 'FORM' | 'COMPONENT'
  radiusSource: 'FORM' | 'COMPONENT'
}

/**
 * 解析显式容器最终生效的表面样式和圆角。
 *
 * 非表面组件不会获得容器外观类；非法值由文档诊断拒绝，这里只提供渲染期保守回退。
 */
export function resolveDesignerContainerAppearance(
  appearance: DesignerAppearance,
  node: DesignerContainerNode,
): DesignerResolvedContainerAppearance | undefined {
  const registration = findDesignerComponent(node.componentType)
  if (registration?.containerAppearance !== 'SURFACE') return undefined

  const styleOverride = normalizedStyleOverride(node.configuration.surfaceStyle)
  const radiusOverride = normalizeDesignerContainerRadiusOverride(node.configuration.surfaceRadius)
  return {
    style: styleOverride === 'INHERIT' ? appearance.containerStyle : styleOverride,
    radius: radiusOverride === 'INHERIT' ? appearance.containerRadius : radiusOverride,
    styleSource: styleOverride === 'INHERIT' ? 'FORM' : 'COMPONENT',
    radiusSource: radiusOverride === 'INHERIT' ? 'FORM' : 'COMPONENT',
  }
}

/** 返回容器表面对应的公共主题工具类；圆角像素由调用方写入 CSS 变量。 */
export function designerContainerAppearanceClasses(
  resolved: DesignerResolvedContainerAppearance | undefined,
): string[] {
  if (!resolved) return []
  return ['daxiang-form-container-surface', `is-surface-${resolved.style.toLowerCase()}`]
}

/** 返回容器圆角对应的内联 CSS 变量，供设计画布和运行表面共用。 */
export function designerContainerRadiusStyle(
  radius: DesignerRadiusValue,
): Record<'--daxiang-form-container-radius', string> {
  return { '--daxiang-form-container-radius': designerRadiusCssValue(radius) }
}

/** 统计当前文档中支持表面外观的显式容器数量。 */
export function countDesignerSurfaceContainers(document: DesignerDocument): number {
  let count = 0
  visitSurfaceContainers(document.uiSchema.root, () => {
    count += 1
  })
  return count
}

/**
 * 将指定外观维度批量恢复为继承表单默认值。
 *
 * @returns 实际发生配置变化的容器数量。
 */
export function applyDesignerContainerAppearanceInheritance(
  document: DesignerDocument,
  dimensions: readonly DesignerContainerAppearanceDimension[],
): number {
  const selected = new Set(dimensions)
  let changed = 0
  visitSurfaceContainers(document.uiSchema.root, (node) => {
    let nodeChanged = false
    const configuration = { ...node.configuration }
    if (selected.has('STYLE') && configuration.surfaceStyle !== 'INHERIT') {
      configuration.surfaceStyle = 'INHERIT'
      nodeChanged = true
    }
    if (selected.has('RADIUS') && configuration.surfaceRadius !== 'INHERIT') {
      configuration.surfaceRadius = 'INHERIT'
      nodeChanged = true
    }
    if (!nodeChanged) return
    node.configuration = configuration
    changed += 1
  })
  return changed
}

function visitSurfaceContainers(
  nodes: DesignerLayoutNode[],
  visitor: (node: DesignerContainerNode) => void,
): void {
  for (const node of nodes) {
    if (node.nodeType !== 'CONTAINER') continue
    if (findDesignerComponent(node.componentType)?.containerAppearance === 'SURFACE') visitor(node)
    for (const slot of node.slots) visitSurfaceContainers(slot.children, visitor)
  }
}

function normalizedStyleOverride(value: unknown): DesignerContainerStyleOverride {
  return ['INHERIT', 'NONE', 'BORDERED', 'SHADOW', 'FILLED'].includes(String(value))
    ? (value as DesignerContainerStyleOverride)
    : 'INHERIT'
}
