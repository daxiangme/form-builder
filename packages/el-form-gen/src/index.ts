import './element-plus-runtime-styles'
import type { App, Plugin } from 'vue'
import ElFormDesigner from './FormDesigner.vue'
import ElFormRenderer from './rendering/DesignerPreviewForm.vue'
import './style.css'

/** 普通 Vue 宿主可直接从主包使用的文档创建、编解码、诊断与演示辅助门面。 */
export {
  createDefaultDesignerContainerBehavior,
  createDefaultDesignerFieldBehavior,
  createDemoDesignerDocument,
  createDesignerOverlayModule,
  createEmptyDesignerDocument,
  createNodeFromComponent,
  decodeDesignerDocument,
  diagnoseDesignerDocument,
  migrateDesignerDocument,
  designerRadiusEditorOptions,
  designerRadiusValueLabel,
  includeDesignerCurrentOption,
  parseDesignerRadiusInput,
  serializeDesignerDocument,
} from '@daxiangme/form-core'

/** 普通 Vue 宿主可直接从主包引用的稳定公共类型。 */
export type {
  DesignerAppearance,
  DesignerDevice,
  DesignerDiagnostic,
  DesignerDocument,
  DesignerDocumentDecodeResult,
  DesignerDocumentLimits,
  DesignerField,
  DesignerFieldId,
  DesignerInitialDataModel,
  DesignerLayoutNode,
  DesignerRuntimeAdapters,
  DesignerRuntimeMode,
  DesignerRuntimeValueStore,
  DesignerSubmissionProjection,
  DesignerValidationResult,
  FormDesignerCatalogs,
  FormDesignerHostCapabilities,
  FormFieldAccessFallback,
  FormFieldAccessLevel,
  FormFieldRuntimePolicy,
  FormFieldRuntimePolicyMap,
  FormRuntimeAdapterContext,
  FormRuntimeAdapters,
} from '@daxiangme/form-core'

/** 主包传递依赖的本地预览与 DX BPM Adapter 工厂。 */
export { createDxBpmFormAdapter, createLocalPreviewFormAdapter } from '@daxiangme/form-adapter'
/** 关系表单的内存宿主示例，可用于独立演示保存与冲突处理。 */
export { createLocalRelationFormAdapter } from '@daxiangme/form-adapter'

/** 关系会话与稳定地址工具；所有运行状态均由 Core 持有。 */
export {
  createDesignerRuntimeSession,
  createDesignerCollectionKey,
  createDesignerTargetKey,
  createDesignerRuntimeFeedbackKey,
} from '@daxiangme/form-core'

/** 关系、权限、命令、提交和回执的完整公开契约。 */
export type {
  CreateDesignerRuntimeSessionOptions,
  DesignerCollectionLoadState,
  DesignerCollectionScope,
  DesignerDataEntity,
  DesignerDataSchema,
  DesignerExpression,
  DesignerExpressionFieldScope,
  DesignerExpressionRuntimeContext,
  DesignerFormEvent,
  DesignerEventFlow,
  DesignerOverlayModule,
  DesignerResolvedFieldState,
  DesignerResolvedNodeState,
  DesignerRelation,
  DesignerManyToManyRelation,
  DesignerOneToManyRelation,
  DesignerRelationValueStore,
  DesignerRuntimeRow,
  DesignerRuntimeTarget,
  DesignerRuntimeTargetReference,
  DesignerRuntimeVersion,
  DesignerRuntimeCollection,
  DesignerRuntimeLimits,
  DesignerRuntimeIssue,
  DesignerRuntimePolicyContext,
  DesignerRelationOperation,
  DesignerRuntimeCommand,
  DesignerRuntimeCommandResult,
  DesignerRuntimeSession,
  DesignerRuntimeSnapshot,
  DesignerSubmissionOperation,
  DesignerTargetFieldOrigin,
  DesignerSubmissionBatch,
  DesignerOperationReceipt,
  DesignerSaveReceipt,
  DesignerRelationCandidate,
  DesignerRelationRequest,
  FormRelationRuntimePolicy,
  FormRelationRuntimePolicyResolver,
  FormRelationDataAdapter,
  FormRelationSelectionAdapter,
  FormSubmissionStatusAdapter,
} from '@daxiangme/form-core'

/** Renderer 两种互斥入口的公共属性。 */
export type {
  ElFormRendererProps,
  ElFormRendererLegacyProps,
  ElFormRendererSessionProps,
} from './rendering/el-form-renderer-props'

/** 内存关系宿主工厂与可选演示场景。 */
export type {
  CreateLocalRelationFormAdapterOptions,
  LocalRelationFormAdapterHandle,
  LocalRelationSaveScenario,
  LocalRelationSelectionScenario,
} from '@daxiangme/form-adapter'

/** 主包传递依赖的 Adapter 与传输端口类型。 */
export type {
  CreateDxBpmFormAdapterOptions,
  CreateLocalPreviewFormAdapterOptions,
  FormTransport,
  FormTransportDownload,
  FormTransportRequest,
  LocalPreviewFormAdapterHandle,
} from '@daxiangme/form-adapter'

/**
 * Vue 3 全局安装入口。
 *
 * 只注册 `ElFormDesigner` 与 `ElFormRenderer`，不负责安装 Element Plus。
 */
export const ElFormGenPlugin: Plugin = {
  install(app: App) {
    app.component('ElFormDesigner', ElFormDesigner)
    app.component('ElFormRenderer', ElFormRenderer)
  },
}

export { ElFormDesigner, ElFormRenderer }

export default ElFormGenPlugin
