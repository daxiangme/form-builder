import './element-plus-runtime-styles'
import type { App, Plugin } from 'vue'
import ElFormDesigner from './FormDesigner.vue'
import ElFormRenderer from './rendering/DesignerPreviewForm.vue'
import './style.css'

/** 普通 Vue 宿主可直接从主包使用的文档创建、编解码、诊断与演示辅助门面。 */
export {
  createDefaultDesignerFieldBehavior,
  createDemoDesignerDocument,
  createDesignerOverlayModule,
  createEmptyDesignerDocument,
  createNodeFromComponent,
  decodeDesignerDocument,
  diagnoseDesignerDocument,
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
  FormFieldAccessLevel,
  FormFieldRuntimePolicy,
  FormFieldRuntimePolicyMap,
  FormRuntimeAdapterContext,
  FormRuntimeAdapters,
} from '@daxiangme/form-core'

/** 主包传递依赖的本地预览与 DX BPM Adapter 工厂。 */
export { createDxBpmFormAdapter, createLocalPreviewFormAdapter } from '@daxiangme/form-adapter'

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
