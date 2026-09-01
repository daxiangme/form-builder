import type { App, Plugin } from 'vue'
import FormDesigner from './FormDesigner.vue'
import FormRenderer from './rendering/DesignerPreviewForm.vue'
import './style.css'

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
