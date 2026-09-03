<template>
  <main class="playground-shell">
    <header class="playground-toolbar">
      <div>
        <strong>DX Form</strong>
        <small>Vue 3 + Element Plus · 0.1.0</small>
      </div>
      <ElSegmented v-model="workspace" :options="workspaceOptions" />
      <ElSelect v-if="workspace === 'RUNTIME'" v-model="activeModule" aria-label="运行视图">
        <ElOption label="主体" value="" />
        <ElOption
          v-for="module in document.uiSchema.overlays"
          :key="module.code"
          :label="module.name"
          :value="module.code"
        />
      </ElSelect>
      <ElSelect v-model="device" aria-label="视口">
        <ElOption label="桌面" value="desktop" />
        <ElOption label="移动" value="mobile" />
      </ElSelect>
      <ElSelect
        :model-value="controlRadius"
        filterable
        allow-create
        default-first-option
        aria-label="全局圆角"
        @update:model-value="setControlRadius"
      >
        <ElOption
          v-for="option in radiusOptions"
          :key="String(option.value)"
          :label="option.label"
          :value="option.value"
        />
      </ElSelect>
      <ElSwitch v-model="dark" active-text="深色" inactive-text="浅色" />
    </header>

    <section v-if="workspace === 'DESIGN'" class="playground-workspace is-designer">
      <FormDesigner
        v-model="document"
        :adapters="localAdapter.adapters"
        :adapter-context="adapterContext"
        @save-request="showMessage('设计文档已交给宿主保存')"
        @export-request="showMessage('设计文档已交给宿主导出')"
      />
    </section>

    <section v-else class="playground-workspace is-runtime">
      <FormRenderer
        v-model="runtimeValue"
        :document="document"
        :device="device"
        :mode="runtimeMode"
        :active-module="activeModule"
        :overlay-only="Boolean(activeModule)"
        :adapters="localAdapter.adapters"
        :adapter-context="adapterContext"
        show-toolbar
        @submit="showMessage('宿主已收到提交投影')"
        @runtime-warning="showWarning"
        @overlay-closed="activeModule = ''"
      />
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import {
  createDemoDesignerDocument,
  createDesignerOverlayModule,
  createNodeFromComponent,
  designerRadiusEditorOptions,
  designerRadiusValueLabel,
  includeDesignerCurrentOption,
  parseDesignerRadiusInput,
  type DesignerDevice,
  type DesignerDocument,
  type DesignerRuntimeMode,
  type DesignerRuntimeValueStore,
} from '@daxiangme/form-core'
import { createLocalPreviewFormAdapter } from '@daxiangme/form-adapter'
import { FormDesigner, FormRenderer } from '@daxiangme/form-vue'

type RuntimeMode = Exclude<DesignerRuntimeMode, 'DESIGN'>

const workspaceOptions = [
  { label: '设计器', value: 'DESIGN' },
  { label: '运行态', value: 'RUNTIME' },
]
const workspace = ref<'DESIGN' | 'RUNTIME'>('DESIGN')
const dark = ref(false)
const device = ref<DesignerDevice>('desktop')
const activeModule = ref('')
const runtimeMode = ref<RuntimeMode>('CREATE')
const runtimeValue = ref<DesignerRuntimeValueStore>({ fields: {}, collections: {} })
const document = ref<DesignerDocument>(createPlaygroundDocument())
const localAdapter = createLocalPreviewFormAdapter()
const adapterContext = computed(() => ({
  applicationCode: 'playground',
  resourceCode: 'sample-form',
}))
const radiusOptions = computed(() =>
  includeDesignerCurrentOption(
    designerRadiusEditorOptions(false),
    document.value.appearance.controlRadius,
    (value) => (typeof value === 'number' ? designerRadiusValueLabel(value) : String(value)),
  ),
)
const controlRadius = computed(() => document.value.appearance.controlRadius)

watch(dark, (enabled) => globalThis.document.documentElement.classList.toggle('dark', enabled), {
  immediate: true,
})

onBeforeUnmount(() => localAdapter.dispose())

function setControlRadius(value: unknown): void {
  const next = parseDesignerRadiusInput(value)
  if (next === undefined) return
  document.value = {
    ...document.value,
    appearance: { ...document.value.appearance, controlRadius: next },
  }
}

function showMessage(message: string): void {
  ElMessage.success(message)
}

function showWarning(message: string): void {
  ElMessage.warning(message)
}

function createPlaygroundDocument(): DesignerDocument {
  const value = createDemoDesignerDocument('dx-form-playground')
  value.name = 'DX Form 独立组件示例'
  const dialog = createDesignerOverlayModule(value, 'DIALOG')
  dialog.name = '费用明细'
  dialog.width = 760
  const dialogText = createNodeFromComponent(value, 'text', {
    label: '费用用途',
    configuration: { placeholder: '请输入费用用途' },
  })
  const dialogFile = createNodeFromComponent(value, 'file', {
    label: '费用凭证',
    configuration: { maxCount: 5, maxSizeMb: 20, assetPolicyRef: 'GENERAL' },
  })
  if (dialogText) dialog.root.push(dialogText)
  if (dialogFile) dialog.root.push(dialogFile)
  value.uiSchema.overlays.push(dialog)

  const drawer = createDesignerOverlayModule(value, 'DRAWER')
  drawer.name = '申请说明'
  drawer.width = 520
  const drawerText = createNodeFromComponent(value, 'textarea', {
    label: '详细说明',
    configuration: { rows: 8, maxLength: 2000 },
  })
  if (drawerText) drawer.root.push(drawerText)
  value.uiSchema.overlays.push(drawer)
  return value
}
</script>
