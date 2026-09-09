import type {
  DesignerDevice,
  DesignerDocument,
  DesignerRuntimeAdapters,
  DesignerRuntimeMode,
  DesignerRuntimeValueStore,
  FormFieldAccessFallback,
  FormFieldRuntimePolicyMap,
  FormRuntimeAdapterContext,
  DesignerRuntimeSession,
} from '@daxiangme/form-core'

/** ElFormRenderer 旧一级表单的公共属性；新关系使用 session 入口。 */
export interface ElFormRendererLegacyProps {
  /** 一级设计文档；嵌套关系和多对多必须使用 session。 */
  document: DesignerDocument
  /** 一级运行快照，不代表保存回执。 */
  modelValue?: DesignerRuntimeValueStore
  /** 旧入口运行模式，默认 CREATE。 */
  mode?: Exclude<DesignerRuntimeMode, 'DESIGN'>
  /**
   * 宿主字段运行策略。
   *
   * 未传时按独立表单 Schema 工作。传入后视为完整权威投影；键缺失走 fieldRuntimePolicyFallback，非法访问级别仍按 HIDDEN。
   */
  fieldRuntimePolicy?: FormFieldRuntimePolicyMap
  /**
   * 传入字段策略后未列出字段的缺省访问级别。
   *
   * 默认 HIDDEN。宿主只传关心的字段时须显式设为 EDITABLE。
   */
  fieldRuntimePolicyFallback?: FormFieldAccessFallback
  /** 呈现设备，默认 desktop。 */
  device?: DesignerDevice
  /** 宿主细粒度能力。 */
  adapters?: DesignerRuntimeAdapters
  /** 与设计文档隔离的宿主上下文。 */
  adapterContext?: FormRuntimeAdapterContext
  /** 初始打开的模块编码。 */
  activeModule?: string
  /** @deprecated 请使用 activeModule。 */
  initialOverlayCode?: string
  /** 仅显示指定模块。 */
  overlayOnly?: boolean
  /** 是否显示运行工具栏。 */
  showToolbar?: boolean
  /** 旧入口不可同时传入会话。 */
  session?: never
}

/** ElFormRenderer 关系入口；会话持有全部运行输入，避免双值仓。 */
export interface ElFormRendererSessionProps {
  /** 宿主创建并拥有生命周期的唯一运行会话。 */
  session: DesignerRuntimeSession
  /** 呈现设备，默认 desktop。 */
  device?: DesignerDevice
  /** 打开的模块编码；切换模块不重建会话。 */
  activeModule?: string
  /** 仅显示模块内容。 */
  overlayOnly?: boolean
  /** 是否显示保存、重置和保存状态工具栏。 */
  showToolbar?: boolean
  /** 文档由 session 持有，禁止重复传入。 */
  document?: never
  /** 值由 session 持有，禁止重复传入。 */
  modelValue?: never
  /** 模式通过 session.updateRuntimePolicy 更新。 */
  mode?: never
  /** 字段权限通过 session.updateRuntimePolicy 更新。 */
  fieldRuntimePolicy?: never
  /** 权限缺省通过 session.updateRuntimePolicy 更新。 */
  fieldRuntimePolicyFallback?: never
  /** Adapter 在创建 session 时注入。 */
  adapters?: never
  /** 上下文在创建 session 时注入。 */
  adapterContext?: never
  /** 新入口使用 activeModule。 */
  initialOverlayCode?: never
}

/** ElFormRenderer 互斥的旧一级输入或关系会话输入。 */
export type ElFormRendererProps = ElFormRendererLegacyProps | ElFormRendererSessionProps
