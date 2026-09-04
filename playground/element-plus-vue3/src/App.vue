<template>
  <main class="playground-shell">
    <header class="playground-toolbar">
      <div>
        <strong>Form Gen</strong>
        <small>Vue 3 + Element Plus · el-form-gen</small>
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
      <ElSelect
        v-if="workspace === 'RUNTIME'"
        v-model="policyScenario"
        class="playground-policy"
        aria-label="字段权限场景"
      >
        <ElOption
          v-for="option in policyScenarioOptions"
          :key="option.value"
          :label="option.label"
          :value="option.value"
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
      <ElFormDesigner
        v-model="document"
        :adapters="localAdapter.adapters"
        :adapter-context="adapterContext"
        @save-request="showMessage('设计文档已交给宿主保存')"
        @export-request="showMessage('设计文档已交给宿主导出')"
      />
    </section>

    <section v-else class="playground-workspace is-runtime">
      <ElFormRenderer
        v-model="runtimeValue"
        :document="document"
        :device="device"
        :mode="runtimeMode"
        :active-module="activeModule"
        :overlay-only="Boolean(activeModule)"
        :field-runtime-policy="fieldRuntimePolicy"
        :adapters="localAdapter.adapters"
        :adapter-context="adapterContext"
        show-toolbar
        @submit="handleSubmit"
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
  ElFormDesigner,
  ElFormRenderer,
  createDemoDesignerDocument,
  createDesignerOverlayModule,
  createLocalPreviewFormAdapter,
  createNodeFromComponent,
  designerRadiusEditorOptions,
  designerRadiusValueLabel,
  includeDesignerCurrentOption,
  parseDesignerRadiusInput,
  type DesignerDevice,
  type DesignerDocument,
  type DesignerRuntimeMode,
  type DesignerRuntimeValueStore,
  type DesignerSubmissionProjection,
  type FormFieldRuntimePolicyMap,
} from 'el-form-gen'

type RuntimeMode = Exclude<DesignerRuntimeMode, 'DESIGN'>
type PolicyScenario = 'SCHEMA' | 'ALL_EDITABLE' | 'MIXED' | 'EMPTY'

const workspaceOptions = [
  { label: '设计器', value: 'DESIGN' },
  { label: '运行态', value: 'RUNTIME' },
]
const policyScenarioOptions: Array<{ label: string; value: PolicyScenario }> = [
  { label: '独立 Schema（不传策略）', value: 'SCHEMA' },
  { label: '权威投影 · 全可编辑', value: 'ALL_EDITABLE' },
  { label: '权威投影 · 三态+必填', value: 'MIXED' },
  { label: '权威投影 · 空映射失败关闭', value: 'EMPTY' },
]
const workspace = ref<'DESIGN' | 'RUNTIME'>('DESIGN')
const dark = ref(false)
const device = ref<DesignerDevice>('desktop')
const activeModule = ref('')
const runtimeMode = ref<RuntimeMode>('CREATE')
const policyScenario = ref<PolicyScenario>('SCHEMA')
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
const fieldRuntimePolicy = computed<FormFieldRuntimePolicyMap | undefined>(() =>
  buildFieldRuntimePolicy(document.value, policyScenario.value),
)

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

function handleSubmit(projection: DesignerSubmissionProjection): void {
  console.info(projection)
  showMessage(`宿主已收到提交投影，排除 ${projection.excludedFieldIds.length} 个字段`)
}

function buildFieldRuntimePolicy(
  formDocument: DesignerDocument,
  scenario: PolicyScenario,
): FormFieldRuntimePolicyMap | undefined {
  if (scenario === 'SCHEMA') return undefined
  if (scenario === 'EMPTY') return {}
  const rootCode = formDocument.dataSchema.rootEntity.code
  const rootFields = formDocument.dataSchema.fields.filter((field) => field.entityCode === rootCode)
  return Object.fromEntries(
    formDocument.dataSchema.fields.map((field) => {
      if (scenario === 'ALL_EDITABLE') return [field.id, { accessLevel: 'EDITABLE' as const }]
      if (field.componentType === 'file') return [field.id, { accessLevel: 'READ_ONLY' as const }]
      if (field.entityCode !== rootCode) {
        const siblingIndex = formDocument.dataSchema.fields
          .filter((item) => item.entityCode === field.entityCode)
          .findIndex((item) => item.id === field.id)
        return [
          field.id,
          { accessLevel: siblingIndex === 0 ? ('READ_ONLY' as const) : ('EDITABLE' as const) },
        ]
      }
      const index = rootFields.findIndex((item) => item.id === field.id)
      if (index === 0) return [field.id, { accessLevel: 'EDITABLE' as const, required: true }]
      if (index === 1) return [field.id, { accessLevel: 'READ_ONLY' as const }]
      if (index === 2) return [field.id, { accessLevel: 'HIDDEN' as const }]
      return [field.id, { accessLevel: 'EDITABLE' as const }]
    }),
  )
}

function createPlaygroundDocument(): DesignerDocument {
  const value = createDemoDesignerDocument('dx-form-playground')
  value.name = 'Form Gen 独立组件示例'
  value.dataSchema.source = {
    provider: 'dx-bpm',
    sourceId:
      'expense-application-master-data-model-very-long-identity-for-narrow-inspector-2026-candidate',
    sourceRevision: 17,
  }
  const subtable = createNodeFromComponent(value, 'row-subtable', {
    label: '费用明细',
    configuration: { allowCreate: true, allowCopy: true, allowDelete: true, showIndex: true },
  })
  if (subtable?.nodeType === 'CONTAINER') {
    const relationCode =
      typeof subtable.configuration.relationCode === 'string'
        ? subtable.configuration.relationCode
        : ''
    const entityCode = value.dataSchema.relations.find((relation) => relation.code === relationCode)
      ?.childEntity.code
    const itemName = createNodeFromComponent(value, 'text', {
      label: '费用项目',
      entityCode,
      configuration: { placeholder: '请输入费用项目' },
    })
    const itemAmount = createNodeFromComponent(value, 'number', {
      label: '金额',
      entityCode,
      configuration: { precision: 2, currencyPrefix: '¥' },
    })
    if (itemName) subtable.slots[0]?.children.push(itemName)
    if (itemAmount) subtable.slots[0]?.children.push(itemAmount)
    value.uiSchema.root.push(subtable)
  }
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
