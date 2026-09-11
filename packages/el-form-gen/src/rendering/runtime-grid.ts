import type {
  DesignerField,
  DesignerLayoutNode,
  DesignerResolvedFieldState,
  DesignerResolvedNodeState,
  DesignerRuntimeMode,
} from '@daxiangme/form-core'

/** 判断布局节点在运行态是否占据 24 栅格，与节点组件的 v-if 一致。 */
export function designerLayoutNodeOccupiesRuntimeGrid(
  node: DesignerLayoutNode,
  options: {
    mode: DesignerRuntimeMode
    fields: DesignerField[]
    fieldStates: Record<string, DesignerResolvedFieldState>
    nodeStates?: Record<string, DesignerResolvedNodeState>
  },
): boolean {
  if (node.nodeType === 'FIELD') {
    const field = options.fields.find((item) => item.id === node.fieldId)
    if (!field) return false
    const state = options.fieldStates[field.id] ?? {
      visible: field.componentType !== 'hidden' && !field.display.hidden,
      required: field.required,
      disabled: field.display.readonly,
    }
    return state.visible
  }
  if (
    (options.mode === 'DETAIL' || options.mode === 'READ_ONLY') &&
    (node.componentType === 'button' || node.componentType === 'captcha')
  ) {
    return false
  }
  return options.nodeStates?.[node.id]?.visible !== false
}
