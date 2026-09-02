import type { App, Plugin } from 'vue'
import FormDesigner from './FormDesigner.vue'
import FormRenderer from './rendering/DesignerPreviewForm.vue'
import './style.css'

/** 普通 Vue 宿主可直接从主包使用的文档创建、编解码与诊断门面。 */
export {
  createDemoDesignerDocument,
  createEmptyDesignerDocument,
  decodeDesignerDocument,
  diagnoseDesignerDocument,
  serializeDesignerDocument,
} from '@daxiangme/form-core'

/** 普通 Vue 宿主可直接从主包引用的稳定公共类型。 */
export type {
  DesignerDiagnostic,
  DesignerDocument,
  DesignerDocumentDecodeResult,
  DesignerRuntimeAdapters,
  DesignerRuntimeMode,
  DesignerRuntimeValueStore,
  DesignerSubmissionProjection,
  DesignerValidationResult,
  FormRuntimeAdapterContext,
  FormRuntimeAdapters,
} from '@daxiangme/form-core'

/** Vue 3 全局安装入口；按需使用时可以直接导入具名组件。 */
export const DaxiangFormVue: Plugin = {
  install(app: App) {
    app.component('FormDesigner', FormDesigner)
    app.component('FormRenderer', FormRenderer)
  },
}

export { FormDesigner, FormRenderer }
export { default as FormIcon } from './infrastructure/FormIcon.vue'
export { default as FormModalShell } from './infrastructure/FormModalShell.vue'
export type { DesignerCanvasViewportPreset } from './workbench/workbench-preferences'

export default DaxiangFormVue
