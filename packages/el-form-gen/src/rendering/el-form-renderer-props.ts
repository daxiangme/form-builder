import type {
  DesignerDevice,
  DesignerDocument,
  DesignerRuntimeAdapters,
  DesignerRuntimeMode,
  DesignerRuntimeValueStore,
  FormFieldRuntimePolicyMap,
  FormRuntimeAdapterContext,
} from '@daxiangme/form-core'

/** ElFormRenderer 的公共属性。 */
export interface ElFormRendererProps {
  document: DesignerDocument
  modelValue?: DesignerRuntimeValueStore
  mode?: Exclude<DesignerRuntimeMode, 'DESIGN'>
  /**
   * 宿主字段运行策略。
   *
   * 未传时按独立表单 Schema 工作。传入后视为完整权威投影，缺失或非法字段按 HIDDEN 失败关闭。
   */
  fieldRuntimePolicy?: FormFieldRuntimePolicyMap
  device?: DesignerDevice
  adapters?: DesignerRuntimeAdapters
  adapterContext?: FormRuntimeAdapterContext
  activeModule?: string
  /** @deprecated 请使用 activeModule。 */
  initialOverlayCode?: string
  overlayOnly?: boolean
  showToolbar?: boolean
}
