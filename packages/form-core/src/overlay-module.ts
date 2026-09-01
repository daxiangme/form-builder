import { createDesignerId } from './designer-document'
import type {
  DesignerDocument,
  DesignerLayoutNode,
  DesignerOverlayMaxHeightPreset,
  DesignerOverlayModule,
} from './types'

/** 主体视图使用的稳定内部编码。 */
export const DESIGNER_MAIN_VIEW_CODE = 'main'

const DESIGNER_OVERLAY_MAX_HEIGHTS: Readonly<Record<DesignerOverlayMaxHeightPreset, string>> = {
  COMPACT: '60vh',
  STANDARD: '72vh',
  SPACIOUS: '84vh',
  VIEWPORT: 'calc(100vh - var(--daxiang-form-space-4) * 2)',
}

/** 将稳定高度档位解析为公共弹窗能够消费的 CSS 最大高度。 */
export function resolveDesignerOverlayMaxHeight(preset: DesignerOverlayMaxHeightPreset): string {
  return DESIGNER_OVERLAY_MAX_HEIGHTS[preset]
}

/** 创建一个空弹层模块。 */
export function createDesignerOverlayModule(
  document: DesignerDocument,
  kind: DesignerOverlayModule['kind'],
): DesignerOverlayModule {
  const serial = nextModuleSerial(document)
  return {
    id: createDesignerId('module'),
    code: `module_${serial}`,
    name: kind === 'DIALOG' ? `弹窗${serial}` : `抽屉${serial}`,
    kind,
    dataContext: 'FORM_DRAFT',
    width: kind === 'DIALOG' ? 720 : 480,
    radius: 'THEME',
    maxHeightPreset: 'VIEWPORT',
    root: [],
  }
}

/** 复制模块及其视图节点；字段身份继续复用，节点身份全部重新生成。 */
export function duplicateDesignerOverlayModule(
  document: DesignerDocument,
  moduleCode: string,
): DesignerOverlayModule | undefined {
  const source = document.uiSchema.overlays.find((module) => module.code === moduleCode)
  if (!source) return undefined
  const copy = cloneValue(source)
  const serial = nextModuleSerial(document)
  copy.id = createDesignerId('module')
  copy.code = `module_${serial}`
  copy.name = `${source.name}副本`
  regenerateNodeIds(copy.root)
  document.uiSchema.overlays.push(copy)
  return copy
}

/** 删除弹层模块；字段定义和其他视图保持不变。 */
export function removeDesignerOverlayModule(
  document: DesignerDocument,
  moduleCode: string,
): boolean {
  const index = document.uiSchema.overlays.findIndex((module) => module.code === moduleCode)
  if (index < 0) return false
  document.uiSchema.overlays.splice(index, 1)
  for (const flow of document.eventFlows) removeModuleActions(flow.steps, moduleCode)
  return true
}

/** 返回主体或指定模块的布局根节点。 */
export function resolveDesignerViewRoot(
  document: DesignerDocument,
  viewCode: string,
): DesignerLayoutNode[] {
  return viewCode === DESIGNER_MAIN_VIEW_CODE
    ? document.uiSchema.root
    : (document.uiSchema.overlays.find((module) => module.code === viewCode)?.root ??
        document.uiSchema.root)
}

/**
 * 在指定视图上下文中复用现有根布局算法。
 *
 * mutation 完成后始终恢复主表 root 引用，防止模块视图意外替换主体。
 */
export function mutateDesignerView(
  document: DesignerDocument,
  viewCode: string,
  mutation: (document: DesignerDocument) => void,
): void {
  if (viewCode === DESIGNER_MAIN_VIEW_CODE) {
    mutation(document)
    return
  }
  const module = document.uiSchema.overlays.find((item) => item.code === viewCode)
  if (!module) return
  const mainRoot = document.uiSchema.root
  document.uiSchema.root = module.root
  try {
    mutation(document)
    module.root = document.uiSchema.root
  } finally {
    document.uiSchema.root = mainRoot
  }
}

function nextModuleSerial(document: DesignerDocument): number {
  const used = new Set(
    document.uiSchema.overlays
      .map((module) => /^module_(\d+)$/.exec(module.code)?.[1])
      .filter(Boolean)
      .map(Number),
  )
  let serial = 1
  while (used.has(serial)) serial += 1
  return serial
}

function regenerateNodeIds(nodes: DesignerLayoutNode[]): void {
  for (const node of nodes) {
    node.id = createDesignerId('node')
    if (node.nodeType === 'CONTAINER') {
      for (const slot of node.slots) {
        slot.id = createDesignerId('slot')
        regenerateNodeIds(slot.children)
      }
    }
  }
}

function removeModuleActions(
  nodes: import('./types').DesignerEventStep[],
  moduleCode: string,
): void {
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const step = nodes[index]!
    if (
      step.stepType === 'ACTION' &&
      ['OPEN_MODULE', 'CONFIRM_MODULE', 'CANCEL_MODULE'].includes(step.actionType) &&
      step.configuration.moduleCode === moduleCode
    ) {
      nodes.splice(index, 1)
      continue
    }
    if (step.stepType === 'CONDITION') {
      step.branches.forEach((branch) => removeModuleActions(branch.steps, moduleCode))
      removeModuleActions(step.elseSteps, moduleCode)
    }
  }
}

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
