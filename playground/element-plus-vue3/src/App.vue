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
      <ElSelect
        v-if="workspace === 'RUNTIME'"
        v-model="captureScenario"
        class="playground-policy"
        aria-label="采集验收场景"
      >
        <ElOption
          v-for="option in captureScenarioOptions"
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
        v-if="workspace === 'DESIGN'"
        v-model="catalogScenario"
        class="playground-catalog"
        aria-label="设计器目录场景"
      >
        <ElOption
          v-for="option in catalogScenarioOptions"
          :key="option.value"
          :label="option.label"
          :value="option.value"
        />
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
        :catalogs="designerCatalogs"
        :adapters="localAdapter.adapters"
        :adapter-context="adapterContext"
        @save-request="showMessage('设计文档已交给宿主保存')"
        @export-request="showMessage('设计文档已交给宿主导出')"
      >
        <template #header-leading="{ documentName, dirty }">
          <span class="playground-designer-title" :title="documentName">
            {{ documentName }}
            <i v-if="dirty" aria-label="存在未保存修改" />
          </span>
        </template>
      </ElFormDesigner>
    </section>

    <section v-else-if="workspace === 'RELATION_DESIGN'" class="playground-workspace is-designer">
      <ElFormDesigner
        v-model="relationDocument"
        @save-request="showMessage('关系设计文档已交给宿主保存')"
      >
        <template #header-leading="{ documentName, dirty }">
          <span class="playground-designer-title" :title="documentName">
            {{ documentName }}
            <i v-if="dirty" aria-label="存在未保存修改" />
          </span>
        </template>
      </ElFormDesigner>
    </section>
    <section v-else-if="workspace === 'RELATIONS'" class="playground-workspace is-runtime">
      <RelationPlayground :device="device" />
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
        :field-runtime-policy-fallback="fieldRuntimePolicyFallback"
        :adapters="runtimeAdapters"
        :adapter-context="adapterContext"
        show-toolbar
        @submit="handleSubmit"
        @overlay-closed="activeModule = ''"
      />
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import RelationPlayground from './RelationPlayground.vue'
import { createRelationPlaygroundDocument } from './relation-playground-fixture'
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
  resolveDesignerCatalogComponents,
  type DesignerLayoutNode,
  type DesignerDevice,
  type DesignerDocument,
  type DesignerRuntimeMode,
  type DesignerRuntimeValueStore,
  type DesignerSubmissionProjection,
  type FormDesignerCatalogs,
  type FormFieldAccessFallback,
  type FormFieldRuntimePolicyMap,
} from 'el-form-gen'

type RuntimeMode = Exclude<DesignerRuntimeMode, 'DESIGN'>
type PolicyScenario =
  'SCHEMA' | 'ALL_EDITABLE' | 'MIXED' | 'EMPTY' | 'PARTIAL_EDITABLE' | 'HOST_REQUIRED'
type CatalogScenario = 'NONE' | 'COMPONENTS' | 'CAPABILITIES'
type CaptureScenario = 'READY' | 'SCAN_UNREADY'

const workspaceOptions = [
  { label: '设计器', value: 'DESIGN' },
  { label: '运行态', value: 'RUNTIME' },
  { label: '关系设计', value: 'RELATION_DESIGN' },
  { label: '关系表单', value: 'RELATIONS' },
]
const policyScenarioOptions: Array<{ label: string; value: PolicyScenario }> = [
  { label: '独立 Schema（不传策略）', value: 'SCHEMA' },
  { label: '权威投影 · 全可编辑', value: 'ALL_EDITABLE' },
  { label: '权威投影 · 三态权限', value: 'MIXED' },
  { label: '部分投影 · 回退可编辑', value: 'PARTIAL_EDITABLE' },
  { label: '权威投影 · 空映射失败关闭', value: 'EMPTY' },
  { label: '权威投影 · 宿主强制必填', value: 'HOST_REQUIRED' },
]
const captureScenarioOptions: Array<{ label: string; value: CaptureScenario }> = [
  { label: '采集端口就绪', value: 'READY' },
  { label: '扫码未就绪', value: 'SCAN_UNREADY' },
]
const catalogScenarioOptions: Array<{ label: string; value: CatalogScenario }> = [
  { label: '无目录', value: 'NONE' },
  { label: '仅 components 三态', value: 'COMPONENTS' },
  { label: '叠 capabilities.scan=false', value: 'CAPABILITIES' },
]
const workspace = ref<'DESIGN' | 'RUNTIME' | 'RELATION_DESIGN' | 'RELATIONS'>('DESIGN')
const catalogScenario = ref<CatalogScenario>('NONE')
const dark = ref(false)
const device = ref<DesignerDevice>('desktop')
const activeModule = ref('')
const runtimeMode = ref<RuntimeMode>('CREATE')
const policyScenario = ref<PolicyScenario>('SCHEMA')
const captureScenario = ref<CaptureScenario>('READY')
const runtimeValue = ref<DesignerRuntimeValueStore>({ fields: {}, collections: {} })
const document = ref<DesignerDocument>(createPlaygroundDocument())
const relationDocument = ref<DesignerDocument>(createRelationPlaygroundDocument())
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
const fieldRuntimePolicyFallback = computed<FormFieldAccessFallback | undefined>(() =>
  policyScenario.value === 'PARTIAL_EDITABLE' ? 'EDITABLE' : undefined,
)
const designerCatalogs = computed<FormDesignerCatalogs | undefined>(() =>
  buildDesignerCatalogs(catalogScenario.value),
)
const runtimeAdapters = computed(() => {
  if (captureScenario.value !== 'SCAN_UNREADY' || !localAdapter.adapters.scan) {
    return localAdapter.adapters
  }
  return {
    ...localAdapter.adapters,
    scan: {
      ...localAdapter.adapters.scan,
      readiness: () => ({
        ready: false,
        unreadyReason: '扫码枪未连接（验收场景）',
      }),
      subscribeReadiness(listener: (state: { ready: boolean; unreadyReason?: string }) => void) {
        listener({ ready: false, unreadyReason: '扫码枪未连接（验收场景）' })
        return () => undefined
      },
    },
  }
})

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

function handleSubmit(projection: DesignerSubmissionProjection): void {
  console.info(projection)
  showMessage(`宿主已收到提交投影，排除 ${projection.excludedFieldIds.length} 个字段`)
}

function buildDesignerCatalogs(scenario: CatalogScenario): FormDesignerCatalogs | undefined {
  if (scenario === 'NONE') return undefined
  const components = resolveDesignerCatalogComponents().components.map((item) => {
    if (item.componentType === 'scan-code') {
      return {
        componentType: 'scan-code',
        availability: 'CONDITIONAL' as const,
        unavailableReason: '需要 BarcodeDetector 支持',
      }
    }
    if (item.componentType === 'ocr') {
      return {
        componentType: 'ocr',
        availability: 'UNAVAILABLE' as const,
        unavailableReason: '当前目录未开放 OCR',
      }
    }
    return {
      componentType: item.componentType,
      availability: item.availability,
      unavailableReason: item.unavailableReason || undefined,
    }
  })
  if (scenario === 'CAPABILITIES') {
    return { components, capabilities: { scan: false } }
  }
  return { components }
}

function buildFieldRuntimePolicy(
  formDocument: DesignerDocument,
  scenario: PolicyScenario,
): FormFieldRuntimePolicyMap | undefined {
  if (scenario === 'SCHEMA') return undefined
  if (scenario === 'EMPTY') return {}
  const rootCode = formDocument.dataSchema.rootEntity.code
  const rootFields = formDocument.dataSchema.fields.filter((field) => field.entityCode === rootCode)
  if (scenario === 'PARTIAL_EDITABLE') {
    const first = rootFields[0]
    return first ? { [first.id]: { accessLevel: 'READ_ONLY' } } : {}
  }
  if (scenario === 'HOST_REQUIRED') {
    const target = rootFields.find((field) => field.required !== true) ?? rootFields[0]
    return Object.fromEntries(
      formDocument.dataSchema.fields.map((field) => [
        field.id,
        field.id === target?.id
          ? { accessLevel: 'EDITABLE' as const, required: true }
          : { accessLevel: 'EDITABLE' as const },
      ]),
    )
  }
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
      if (index === 1) return [field.id, { accessLevel: 'READ_ONLY' as const }]
      if (index === 2) return [field.id, { accessLevel: 'HIDDEN' as const }]
      return [field.id, { accessLevel: 'EDITABLE' as const }]
    }),
  )
}

function appendCaptureDemoFields(document: DesignerDocument): void {
  const recognizedName = createNodeFromComponent(document, 'text', { label: '识别姓名' })
  const recognizedAmount = createNodeFromComponent(document, 'text', { label: '识别金额' })
  const locationAddress = createNodeFromComponent(document, 'text', { label: '定位地址' })
  const locationRegion = createNodeFromComponent(document, 'text', { label: '定位省市区' })
  const inlineSignature = createNodeFromComponent(document, 'signature', { label: '内联签名' })
  const assetSignature = createNodeFromComponent(document, 'signature', {
    label: '文件签名',
    configuration: { storageMode: 'ASSET' },
  })
  const combinedOpinion = createNodeFromComponent(document, 'opinion', {
    label: '审批意见',
    configuration: { mode: 'COMBINED' },
  })
  const location = createNodeFromComponent(document, 'position', {
    label: '现场定位',
    configuration: {
      allowManualPick: true,
      showCoordinates: true,
      fieldMappings: [
        { sourceKey: 'address', targetFieldId: layoutFieldId(locationAddress) },
        { sourceKey: 'province', targetFieldId: layoutFieldId(locationRegion) },
      ].filter((item) => item.targetFieldId),
    },
  })
  const ocr = createNodeFromComponent(document, 'ocr', {
    label: '票据识别',
    configuration: {
      retainOriginal: true,
      resultKeys: [
        { key: 'name', name: '姓名' },
        { key: 'amount', name: '金额' },
      ],
      fieldMappings: [
        { sourceKey: 'name', targetFieldId: layoutFieldId(recognizedName) },
        { sourceKey: 'amount', targetFieldId: layoutFieldId(recognizedAmount) },
      ].filter((item) => item.targetFieldId),
    },
  })
  for (const node of [
    recognizedName,
    recognizedAmount,
    locationAddress,
    locationRegion,
    inlineSignature,
    assetSignature,
    combinedOpinion,
    location,
    ocr,
  ]) {
    if (node) document.uiSchema.root.push(node)
  }
}

function layoutFieldId(node: DesignerLayoutNode | undefined): string {
  return node?.nodeType === 'FIELD' ? node.fieldId : ''
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
  const scanCode = createNodeFromComponent(value, 'scan-code', {
    label: '资产扫码',
    configuration: { allowManualInput: true },
  })
  if (scanCode) value.uiSchema.root.push(scanCode)
  appendCaptureDemoFields(value)
  const typeField = value.dataSchema.fields.find((field) => field.label === '申请类型')
  const noteField = value.dataSchema.fields.find((field) => field.label === '申请说明')
  if (noteField) noteField.required = true
  const noteIndex = value.uiSchema.root.findIndex(
    (node) => node.nodeType === 'FIELD' && node.fieldId === noteField?.id,
  )
  const group = createNodeFromComponent(value, 'group', {
    configuration: { title: '申请说明（选择类型后显示）' },
  })
  if (group?.nodeType === 'CONTAINER' && noteIndex >= 0) {
    const [noteNode] = value.uiSchema.root.splice(noteIndex, 1)
    if (noteNode) group.slots[0]?.children.push(noteNode)
    if (typeField) {
      group.behavior = {
        stateRules: [
          {
            id: 'playground-note-visible',
            target: 'VISIBLE',
            valueWhenTrue: true,
            valueWhenFalse: false,
            condition: {
              kind: 'CALL',
              function: 'NOT_EMPTY',
              arguments: [{ kind: 'FIELD', fieldId: typeField.id, scope: 'ROOT' }],
            },
          },
        ],
      }
    }
    value.uiSchema.root.splice(noteIndex, 0, group)
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
