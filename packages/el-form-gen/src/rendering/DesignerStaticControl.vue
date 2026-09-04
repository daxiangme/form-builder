<template>
  <div class="designer-static-control" :class="{ 'is-readonly': readonlyMode }">
    <DesignerDetailField
      v-if="readonlyMode && appearanceMode === 'TEXT'"
      compact
      :field="field"
      :model-value="modelValue"
      :show-label="false"
      :show-help="false"
    />

    <template v-else>
      <ElInput
        v-if="componentType === 'text'"
        :model-value="textValue"
        :placeholder="placeholder"
        :clearable="booleanConfiguration('clearable')"
        :maxlength="numberConfiguration('maxLength') || undefined"
        :disabled="controlDisabled"
        @update:model-value="updateValue"
      >
        <template v-if="textConfiguration('prefix')" #prepend>{{
          textConfiguration('prefix')
        }}</template>
        <template v-if="textConfiguration('suffix')" #append>{{
          textConfiguration('suffix')
        }}</template>
      </ElInput>
      <ElInput
        v-else-if="componentType === 'textarea'"
        :model-value="textValue"
        type="textarea"
        :rows="numberConfiguration('rows') || 4"
        :placeholder="placeholder"
        :maxlength="numberConfiguration('maxLength') || undefined"
        :show-word-limit="booleanConfiguration('showWordLimit')"
        :disabled="controlDisabled"
        @update:model-value="updateValue"
      />
      <div v-else-if="componentType === 'number'">
        <ElInputNumber
          :model-value="numberValue"
          :min="nullableNumberConfiguration('minimum')"
          :max="nullableNumberConfiguration('maximum')"
          :step="numberConfiguration('step') || 1"
          :precision="effectiveNumberPrecision"
          :controls="booleanConfiguration('controls')"
          :controls-position="textConfiguration('controlsPosition') === 'RIGHT' ? 'right' : ''"
          :disabled="controlDisabled"
          @update:model-value="updateValue"
        />
        <div v-if="numberSummary" class="designer-static-control__summary">
          {{ numberSummary }}
        </div>
      </div>

      <ElSelect
        v-else-if="['select', 'multi-select', 'dynamic-select'].includes(componentType)"
        :model-value="selectValue"
        :multiple="
          componentType !== 'select' &&
          (componentType !== 'dynamic-select' || booleanConfiguration('multiple'))
        "
        :multiple-limit="
          numberConfiguration('maxSelections') || numberConfiguration('multipleLimit') || 0
        "
        :clearable="booleanConfiguration('clearable')"
        :filterable="booleanConfiguration('filterable')"
        :placeholder="placeholder"
        :disabled="controlDisabled"
        :loading="optionLoading"
        @update:model-value="updateValue"
        @visible-change="(visible: boolean) => visible && loadDynamicOptions()"
      >
        <ElOption
          v-for="option in options"
          :key="String(option.value)"
          :label="option.label"
          :value="option.value"
          :disabled="option.disabled"
        />
      </ElSelect>

      <ElCheckboxGroup
        v-else-if="componentType === 'checkbox'"
        :model-value="arrayValue"
        :disabled="controlDisabled"
        @update:model-value="updateValue"
      >
        <template v-if="textConfiguration('optionStyle') === 'BUTTON'">
          <ElCheckboxButton
            v-for="option in options"
            :key="String(option.value)"
            :value="option.value"
          >
            {{ option.label }}
          </ElCheckboxButton>
        </template>
        <template v-else>
          <ElCheckbox v-for="option in options" :key="String(option.value)" :value="option.value">
            {{ option.label }}
          </ElCheckbox>
        </template>
      </ElCheckboxGroup>

      <ElRadioGroup
        v-else-if="componentType === 'radio'"
        :model-value="scalarValue"
        :disabled="controlDisabled"
        @update:model-value="updateValue"
      >
        <template v-if="textConfiguration('optionStyle') === 'BUTTON'">
          <ElRadioButton
            v-for="option in options"
            :key="String(option.value)"
            :value="option.value"
          >
            {{ option.label }}
          </ElRadioButton>
        </template>
        <template v-else>
          <ElRadio v-for="option in options" :key="String(option.value)" :value="option.value">
            {{ option.label }}
          </ElRadio>
        </template>
      </ElRadioGroup>

      <ElDatePicker
        v-else-if="componentType === 'date'"
        :model-value="dateValue"
        :type="datePickerType"
        :format="textConfiguration('format') || undefined"
        :placeholder="placeholder"
        :clearable="booleanConfiguration('clearable')"
        :disabled="controlDisabled"
        @update:model-value="updateValue"
      />
      <ElDatePicker
        v-else-if="componentType === 'date-range'"
        :model-value="arrayValue"
        :type="textConfiguration('rangeType') === 'DATETIME' ? 'datetimerange' : 'daterange'"
        :range-separator="textConfiguration('separator') || '至'"
        start-placeholder="开始日期"
        end-placeholder="结束日期"
        :disabled="controlDisabled"
        @update:model-value="updateDateRange"
      />
      <ElDatePicker
        v-else-if="componentType === 'date-multiple'"
        :model-value="arrayValue"
        type="dates"
        placeholder="选择多个日期"
        :disabled="controlDisabled"
        @update:model-value="updateValue"
      />

      <div v-else-if="componentType === 'serial-number'" class="designer-static-control__serial">
        <ElInput model-value="保存后自动生成" disabled>
          <template #prepend><DxSvgIcon icon="ri:sort-number-asc" /></template>
        </ElInput>
        <div v-if="booleanConfiguration('showCode')" class="designer-static-control__code-preview">
          <DxSvgIcon
            :icon="
              textConfiguration('codeType') === 'QRCODE' ? 'ri:qr-code-line' : 'ri:barcode-line'
            "
          />
          <small>{{
            textConfiguration('codeType') === 'QRCODE' ? '二维码预览' : '条形码预览'
          }}</small>
        </div>
      </div>
      <ElUpload
        v-else-if="componentType === 'file' && textConfiguration('displayMode') === 'DRAG'"
        drag
        action="#"
        :auto-upload="false"
        :limit="numberConfiguration('maxCount') || 5"
        :accept="textConfiguration('accept')"
        :disabled="controlDisabled || !assetAdapter || assetUploading"
        :file-list="fileList"
        @change="uploadSelectedFile"
        @remove="removeAsset"
        @preview="downloadAsset"
      >
        <DxSvgIcon class="designer-static-control__upload-icon" icon="ri:upload-cloud-2-line" />
        <div>拖入文件，或点击选择</div>
        <template #tip
          ><div class="el-upload__tip">{{ assetCapabilityTip }}</div></template
        >
      </ElUpload>
      <ElUpload
        v-else-if="componentType === 'file'"
        action="#"
        :auto-upload="false"
        :limit="numberConfiguration('maxCount') || 5"
        :accept="textConfiguration('accept')"
        :disabled="controlDisabled || !assetAdapter || assetUploading"
        :file-list="fileList"
        @change="uploadSelectedFile"
        @remove="removeAsset"
        @preview="downloadAsset"
      >
        <ElButton :loading="assetUploading" :disabled="controlDisabled || !assetAdapter">
          <DxSvgIcon icon="ri:upload-2-line" />选择文件
        </ElButton>
        <template #tip
          ><div class="el-upload__tip">{{ assetCapabilityTip }}</div></template
        >
      </ElUpload>
      <ElSwitch
        v-else-if="componentType === 'switch'"
        :model-value="booleanValue"
        :active-text="textConfiguration('activeText')"
        :inactive-text="textConfiguration('inactiveText')"
        :active-color="textConfiguration('activeColor') || undefined"
        :inactive-color="textConfiguration('inactiveColor') || undefined"
        :disabled="controlDisabled"
        @update:model-value="updateValue"
      />
      <ElRate
        v-else-if="componentType === 'rate'"
        :model-value="numberValue || 0"
        :max="numberConfiguration('max') || 5"
        :allow-half="booleanConfiguration('allowHalf')"
        :show-score="booleanConfiguration('showText')"
        :disabled="controlDisabled"
        @update:model-value="updateValue"
      />
      <DxStepProgress
        v-else-if="componentType === 'steps'"
        :model-value="scalarValue ?? 0"
        :items="options"
        :direction="textConfiguration('direction') === 'vertical' ? 'vertical' : 'horizontal'"
        :finish-status="stepFinishStatus"
        :compact="booleanConfiguration('simple')"
        :show-description="field.configuration.showDescription !== false"
        :disabled="controlDisabled"
        @update:model-value="updateValue"
      />
      <div v-else-if="componentType === 'rich-text'" class="designer-static-control__rich-text">
        <div class="designer-static-control__rich-toolbar">
          <DxSvgIcon icon="ri:bold" />
          <DxSvgIcon icon="ri:italic" />
          <DxSvgIcon icon="ri:list-unordered" />
          <DxSvgIcon icon="ri:link" />
        </div>
        <div
          class="designer-static-control__rich-content"
          :contenteditable="!controlDisabled"
          :data-placeholder="placeholder || '请输入富文本内容'"
          @input="updateRichText"
        >
          {{ textValue }}
        </div>
      </div>
      <ElTag v-else-if="componentType === 'hidden'" effect="plain" type="info">
        隐藏字段 · 运行时不展示
      </ElTag>

      <div v-else-if="componentType === 'signature'" class="designer-static-control__serial">
        <DesignerSignatureField
          :model-value="signatureValue"
          :disabled="controlDisabled"
          :line-width="numberConfiguration('lineWidth') || 2"
          :pen-color="textConfiguration('penColor') || '#111827'"
          @update:model-value="updateValue"
        />
        <ElButton
          v-if="booleanConfiguration('allowPersonalSignatureReuse')"
          :disabled="controlDisabled || !adapters?.personalSignature"
          :loading="capabilityLoading"
          @click="reusePersonalSignature"
        >
          使用个人签名
        </ElButton>
      </div>

      <div v-else-if="componentType === 'opinion'" class="designer-static-control__opinion">
        <ElInput
          v-if="textConfiguration('mode') !== 'SIGNATURE'"
          :model-value="opinionText"
          type="textarea"
          :rows="numberConfiguration('rows') || 4"
          :maxlength="numberConfiguration('maxLength') || 2000"
          placeholder="请输入审批意见"
          :disabled="controlDisabled"
          @update:model-value="updateOpinionText"
        />
        <DesignerSignatureField
          v-if="textConfiguration('mode') !== 'OPINION'"
          :model-value="opinionSignature"
          :disabled="controlDisabled"
          :line-width="2"
          pen-color="#111827"
          @update:model-value="updateOpinionSignature"
        />
        <ElTag effect="plain" type="info">审批上下文控件</ElTag>
      </div>

      <DesignerLocalPickerField
        v-else-if="localPickerTypes.includes(componentType)"
        :model-value="modelValue"
        :component-type="componentType"
        :icon="componentIcon"
        :button-text="buttonText"
        :disabled="controlDisabled"
        :multiple="localPickerMultiple"
        :adapter="adapters?.directory"
        :adapter-context="adapterContext"
        @update:model-value="updateValue"
        @runtime-warning="(message) => emit('runtime-warning', message)"
      />

      <ElCascader
        v-else-if="componentType === 'region'"
        :model-value="arrayValue"
        :options="regionOptions"
        :props="{
          multiple: booleanConfiguration('multiple'),
          checkStrictly: booleanConfiguration('checkStrictly'),
        }"
        :show-all-levels="booleanConfiguration('showFullPath')"
        :separator="textConfiguration('separator') || ' / '"
        placeholder="请选择省 / 市 / 区"
        :disabled="controlDisabled || !adapters?.region"
        @update:model-value="updateValue"
      />

      <ElTreeSelect
        v-else-if="componentType === 'dictionary-tree'"
        :model-value="modelValue"
        :data="dictionaryOptions"
        :multiple="booleanConfiguration('multiple')"
        :check-strictly="booleanConfiguration('checkStrictly')"
        show-checkbox
        check-on-click-node
        placeholder="请选择字典节点"
        :disabled="controlDisabled"
        @update:model-value="updateValue"
      />

      <ElInput
        v-else-if="componentType === 'scan-code'"
        :model-value="textValue"
        :disabled="controlDisabled || !booleanConfiguration('allowManualInput')"
        placeholder="扫码结果"
        @update:model-value="updateValue"
      >
        <template #append>
          <ElTooltip :content="adapters?.scan ? '扫描二维码或条码' : '宿主未配置扫码 Adapter'">
            <ElButton
              :disabled="controlDisabled || !adapters?.scan"
              aria-label="扫码"
              @click="scanCode"
            >
              <DxSvgIcon icon="ri:qr-scan-2-line" />
            </ElButton>
          </ElTooltip>
        </template>
      </ElInput>

      <div v-else-if="componentType === 'ocr'" class="designer-static-control__ocr">
        <ElUpload
          action="#"
          :auto-upload="false"
          :disabled="controlDisabled || !adapters?.ocr"
          @change="recognizeImage"
        >
          <ElButton :disabled="controlDisabled || !adapters?.ocr" :loading="capabilityLoading">
            <DxSvgIcon icon="ri:image-add-line" />选择识别图片
          </ElButton>
          <template #tip>
            <div class="el-upload__tip">
              {{ adapters?.ocr ? '识别结果由 OCR Adapter 返回' : '宿主未配置 OCR Adapter' }}
            </div>
          </template>
        </ElUpload>
      </div>

      <div v-else-if="componentType === 'position'" class="designer-static-control__position">
        <ElInput :model-value="positionSummary" disabled />
        <ElButton
          :disabled="controlDisabled || !adapters?.location"
          :loading="capabilityLoading"
          @click="locatePosition"
        >
          <DxSvgIcon icon="ri:map-pin-line" />获取位置
        </ElButton>
        <small>{{
          adapters?.location ? '运行时保存受控定位结果' : '宿主未配置定位 Adapter'
        }}</small>
      </div>

      <ElAlert
        v-else-if="componentType === 'online-document'"
        type="warning"
        :closable="false"
        show-icon
        title="在线文档不可用"
        description="当前部署未配置 Web Office 服务"
      />

      <ElCascader
        v-else-if="componentType === 'dynamic-cascade'"
        :model-value="arrayValue"
        :options="cascaderOptions"
        :props="{
          multiple: booleanConfiguration('multiple'),
          checkStrictly: booleanConfiguration('checkStrictly'),
        }"
        :show-all-levels="booleanConfiguration('showAllLevels')"
        :separator="textConfiguration('separator') || ' / '"
        :disabled="controlDisabled"
        @update:model-value="updateValue"
      />

      <ElAlert
        v-else
        type="error"
        :closable="false"
        show-icon
        :title="`${componentName}缺少独立渲染器`"
        description="该组件已失败关闭，不能回退为文本框"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import type { CascaderOption, UploadFile, UploadUserFile } from 'element-plus'
import DxSvgIcon from '../infrastructure/FormIcon.vue'
import { findDesignerComponent } from '@daxiangme/form-core'
import { formatDesignerNumber, resolveDesignerNumberPrecision } from '@daxiangme/form-core'
import type {
  DesignerField,
  DesignerOption,
  DesignerRuntimeAdapters,
  DesignerRuntimeMode,
  FormAssetAdapter,
  FormAssetReference,
  FormRuntimeAdapterContext,
} from '@daxiangme/form-core'
import DxStepProgress from '../form/controls/DxStepProgress.vue'
import DesignerDetailField from './DesignerDetailField.vue'
import DesignerSignatureField from './DesignerSignatureField.vue'
import DesignerLocalPickerField from './DesignerLocalPickerField.vue'

defineOptions({ name: 'DesignerStaticControl' })

const props = withDefaults(
  defineProps<{
    modelValue: unknown
    field: DesignerField
    mode: DesignerRuntimeMode
    appearanceMode?: 'CONTROL' | 'TEXT'
    adapters?: DesignerRuntimeAdapters
    adapterContext?: FormRuntimeAdapterContext
  }>(),
  { appearanceMode: 'CONTROL', adapterContext: () => ({}) },
)

const emit = defineEmits<{
  'update:modelValue': [value: unknown]
  'runtime-warning': [message: string]
}>()
const optionLoading = ref(false)
const remoteOptions = ref<DesignerOption[]>([])
const remoteRegionOptions = ref<CascaderOption[]>([])
const assetAdapter = computed<FormAssetAdapter | undefined>(() => props.adapters?.asset)
const registration = computed(() => findDesignerComponent(props.field.componentType))
const componentType = computed(() => props.field.componentType)
const componentName = computed(() => registration.value?.name ?? props.field.componentType)
const componentIcon = computed(() => registration.value?.icon ?? 'ri:error-warning-line')
const controlDisabled = computed(
  () =>
    props.mode === 'DESIGN' ||
    props.mode === 'READ_ONLY' ||
    props.mode === 'DETAIL' ||
    props.field.display.readonly,
)
const readonlyMode = computed(() => props.mode === 'READ_ONLY' || props.field.display.readonly)
const placeholder = computed(
  () => props.field.display.placeholder || textConfiguration('placeholder') || '请输入',
)
const textValue = computed(() => (typeof props.modelValue === 'string' ? props.modelValue : ''))
const numberValue = computed(() => (typeof props.modelValue === 'number' ? props.modelValue : null))
const effectiveNumberPrecision = computed(() =>
  resolveDesignerNumberPrecision(props.field.configuration),
)
const booleanValue = computed(() => Boolean(props.modelValue))
const arrayValue = computed(() => (Array.isArray(props.modelValue) ? props.modelValue : []))
const selectValue = computed<
  string | number | boolean | Array<string | number | boolean> | undefined
>(() => {
  if (Array.isArray(props.modelValue)) {
    return props.modelValue.filter((item): item is string | number | boolean =>
      ['string', 'number', 'boolean'].includes(typeof item),
    )
  }
  return ['string', 'number', 'boolean'].includes(typeof props.modelValue)
    ? (props.modelValue as string | number | boolean)
    : undefined
})
const scalarValue = computed<string | number | boolean | undefined>(() =>
  ['string', 'number', 'boolean'].includes(typeof props.modelValue)
    ? (props.modelValue as string | number | boolean)
    : undefined,
)
const stepFinishStatus = computed<'wait' | 'process' | 'finish' | 'error' | 'success'>(() => {
  const status = textConfiguration('finishStatus')
  return ['wait', 'process', 'finish', 'error', 'success'].includes(status)
    ? (status as 'wait' | 'process' | 'finish' | 'error' | 'success')
    : 'success'
})
const dateValue = computed(() =>
  props.modelValue instanceof Date || typeof props.modelValue === 'string' ? props.modelValue : '',
)
const options = computed<DesignerOption[]>(() =>
  remoteOptions.value.length
    ? remoteOptions.value
    : normalizeOptions(props.field.configuration.options),
)
const cascaderOptions = computed<CascaderOption[]>(() =>
  normalizeOptions(props.field.configuration.options).map(toCascaderOption),
)
const localPickerTypes = [
  'user',
  'role',
  'organization',
  'post',
  'custom-data',
  'process-reference',
  'form-reference',
  'data-dialog',
]
const localPickerMultiple = computed(() => textConfiguration('selectionMode') === 'MULTIPLE')
const regionOptions = computed<CascaderOption[]>(() =>
  remoteRegionOptions.value.length
    ? remoteRegionOptions.value
    : normalizeOptions(props.field.configuration.options).map(toCascaderOption),
)
const dictionaryOptions = computed(() => [
  {
    value: 'business',
    label: '业务分类',
    children: [
      { value: 'procurement', label: '采购' },
      { value: 'expense', label: '费用' },
    ],
  },
  {
    value: 'priority',
    label: '优先级',
    children: [
      { value: 'normal', label: '普通' },
      { value: 'urgent', label: '紧急' },
    ],
  },
])
const datePickerType = computed<'date' | 'datetime' | 'month' | 'year'>(() => {
  const type = textConfiguration('dateType')
  return ['date', 'datetime', 'month', 'year'].includes(type)
    ? (type as 'date' | 'datetime' | 'month' | 'year')
    : 'date'
})
const buttonText = computed(
  () =>
    textConfiguration('buttonText') ||
    (registration.value?.availability === 'UNAVAILABLE'
      ? '当前不可用'
      : `选择${componentName.value}`),
)
const opinionText = computed(() => {
  if (typeof props.modelValue === 'string') return props.modelValue
  if (typeof props.modelValue !== 'object' || props.modelValue === null) return ''
  const value = (props.modelValue as Record<string, unknown>).opinion
  return typeof value === 'string' ? value : ''
})
const opinionSignature = computed(() => {
  if (typeof props.modelValue !== 'object' || props.modelValue === null) return ''
  const value = (props.modelValue as Record<string, unknown>).signature
  return typeof value === 'string' ? value : ''
})
const signatureValue = computed(() =>
  typeof props.modelValue === 'string' ? props.modelValue : '',
)
const resolvedAssets = ref<FormAssetReference[]>([])
const assetUploading = ref(false)
const capabilityLoading = ref(false)
const assetIds = computed(() => normalizeAssetIds(props.modelValue))
const fileList = computed<UploadUserFile[]>(() => {
  return assetIds.value.map((assetId, index) => {
    const asset = resolvedAssets.value.find((item) => item.assetId === assetId)
    return {
      name: asset?.name ?? `文件 ${index + 1}`,
      uid: index + 1,
      size: asset?.size,
      url: asset?.downloadUrl,
      status: 'success' as const,
    }
  })
})
const assetCapabilityTip = computed(() => {
  if (props.mode === 'DESIGN') return '设计态不执行上传，运行时由宿主资产 Adapter 接管'
  return assetAdapter.value
    ? '文件将通过宿主注入的资产 Adapter 上传，表单值仅保存 assetId'
    : '宿主未配置文件能力，上传已禁用'
})
const positionSummary = computed(() => {
  if (typeof props.modelValue !== 'object' || props.modelValue === null) return '经度 — / 纬度 —'
  const value = props.modelValue as Record<string, unknown>
  const address = typeof value.address === 'string' && value.address ? ` / ${value.address}` : ''
  return `经度 ${String(value.longitude ?? '—')} / 纬度 ${String(value.latitude ?? '—')}${address}`
})
const numberSummary = computed(() => {
  if (numberValue.value === null) return ''
  if (
    !textConfiguration('currencyPrefix') &&
    !booleanConfiguration('thousandsSeparator') &&
    !booleanConfiguration('uppercaseRmb')
  ) {
    return ''
  }
  return formatDesignerNumber(numberValue.value, props.field.configuration)
})

watch(
  [assetIds, assetAdapter],
  async ([ids, adapter]) => {
    if (!adapter || ids.length === 0) {
      resolvedAssets.value = []
      return
    }
    try {
      resolvedAssets.value = await adapter.resolve({
        assetIds: ids,
        fieldId: props.field.id,
        fieldCode: props.field.key,
        context: props.adapterContext,
      })
    } catch (error) {
      reportAssetFailure(error, '文件信息解析失败')
    }
  },
  { immediate: true },
)

/** 向静态预览值容器回传交互结果；设计态控件已禁用。 */
function updateValue(value: unknown): void {
  if (controlDisabled.value) return
  emit('update:modelValue', value)
}

function updateOpinionText(value: string): void {
  if (controlDisabled.value) return
  const source =
    typeof props.modelValue === 'object' && props.modelValue !== null ? props.modelValue : {}
  emit('update:modelValue', { ...source, opinion: value })
}

function updateOpinionSignature(value: string): void {
  if (controlDisabled.value) return
  const source =
    typeof props.modelValue === 'object' && props.modelValue !== null ? props.modelValue : {}
  emit('update:modelValue', { ...source, signature: value })
}

function updateRichText(event: Event): void {
  if (controlDisabled.value) return
  updateValue((event.currentTarget as HTMLElement | null)?.innerText ?? '')
}

async function uploadSelectedFile(file: UploadFile): Promise<void> {
  if (controlDisabled.value || !assetAdapter.value || !file.raw || assetUploading.value) return
  assetUploading.value = true
  try {
    const asset = await assetAdapter.value.upload({
      file: file.raw,
      fieldId: props.field.id,
      fieldCode: props.field.key,
      policyRef: textConfiguration('assetPolicyRef') || undefined,
      context: props.adapterContext,
    })
    resolvedAssets.value = [
      ...resolvedAssets.value.filter((item) => item.assetId !== asset.assetId),
      asset,
    ]
    emit('update:modelValue', [...assetIds.value, asset.assetId])
  } catch (error) {
    reportAssetFailure(error, '文件上传失败')
  } finally {
    assetUploading.value = false
  }
}

/** 移除只修改字段引用，不触发服务端物理删除。 */
function removeAsset(file: UploadFile): void {
  if (controlDisabled.value) return
  const index = Math.max(0, Number(file.uid) - 1)
  emit(
    'update:modelValue',
    assetIds.value.filter((_, currentIndex) => currentIndex !== index),
  )
}

/** 下载始终通过 Adapter 获取受控 URL 或 Blob。 */
async function downloadAsset(file: UploadFile): Promise<void> {
  if (!assetAdapter.value) return
  const assetId = assetIds.value[Math.max(0, Number(file.uid) - 1)]
  if (!assetId) return
  try {
    const result = await assetAdapter.value.download({
      assetId,
      fieldId: props.field.id,
      fieldCode: props.field.key,
      context: props.adapterContext,
    })
    const url = result.kind === 'URL' ? result.url : URL.createObjectURL(result.blob)
    const link = document.createElement('a')
    link.href = url
    link.download = result.fileName ?? file.name
    link.rel = 'noopener noreferrer'
    link.click()
    if (result.kind === 'BLOB') URL.revokeObjectURL(url)
  } catch (error) {
    reportAssetFailure(error, '文件下载失败')
  }
}

/** 新协议只输出 assetId；旧对象值只在内存中读取兼容字段。 */
function normalizeAssetIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (typeof item === 'string' && item.trim()) return [item]
    if (typeof item !== 'object' || item === null) return []
    const assetId = (item as Record<string, unknown>).assetId
    return typeof assetId === 'string' && assetId.trim() ? [assetId] : []
  })
}

function reportAssetFailure(error: unknown, fallback: string): void {
  emit('runtime-warning', error instanceof Error ? error.message : fallback)
}

onMounted(() => {
  void loadRemoteCatalogs()
})

watch(
  () => [props.field.id, props.adapters, componentType.value],
  () => {
    void loadRemoteCatalogs()
  },
)

/** 加载动态选项、地区树和已选值回显；缺少 Adapter 时保留静态配置并警告。 */
async function loadRemoteCatalogs(): Promise<void> {
  if (componentType.value === 'dynamic-select' || componentType.value === 'dynamic-cascade') {
    await loadDynamicOptions(true)
  }
  if (componentType.value === 'region') {
    await loadRegionOptions()
  }
}

/** 查询动态选项；已选值通过 resolveValues 回显。 */
async function loadDynamicOptions(resolveSelected = false): Promise<void> {
  const adapter = props.adapters?.dynamicOption
  if (componentType.value !== 'dynamic-select' && componentType.value !== 'dynamic-cascade') return
  if (!adapter) {
    emit('runtime-warning', '当前宿主未提供动态选项 Adapter，已保留静态选项且禁止远程查询')
    return
  }
  if (optionLoading.value) return
  optionLoading.value = true
  try {
    const selected = Array.isArray(props.modelValue)
      ? props.modelValue.filter((item): item is string | number | boolean =>
          ['string', 'number', 'boolean'].includes(typeof item),
        )
      : ['string', 'number', 'boolean'].includes(typeof props.modelValue)
        ? [props.modelValue as string | number | boolean]
        : []
    const result = await adapter.query({
      fieldId: props.field.id,
      fieldCode: props.field.key,
      pageNo: 1,
      resolveValues: resolveSelected ? selected : [],
      context: props.adapterContext,
    })
    remoteOptions.value = result.items
  } catch (error) {
    reportAssetFailure(error, '动态选项查询失败')
  } finally {
    optionLoading.value = false
  }
}

/** 通过地区 Adapter 加载级联树；缺少端口时不使用演示数据。 */
async function loadRegionOptions(): Promise<void> {
  const adapter = props.adapters?.region
  if (!adapter) {
    emit('runtime-warning', '当前宿主未提供地区级联 Adapter，地区选择不可用')
    remoteRegionOptions.value = []
    return
  }
  try {
    if (adapter.loadTree) {
      const result = await adapter.loadTree({
        maximumLevel: numberConfiguration('maximumLevel') || 3,
        context: props.adapterContext,
      })
      remoteRegionOptions.value = result.items.map(toCascaderOption)
      return
    }
    if (!adapter.queryChildren) return
    const roots = await adapter.queryChildren({ context: props.adapterContext })
    remoteRegionOptions.value = roots.map(toCascaderOption)
  } catch (error) {
    reportAssetFailure(error, '地区数据加载失败')
  }
}

/** 日期范围变化后交给 Adapter 计算派生值，失败时只保留用户选择。 */
async function updateDateRange(value: unknown): Promise<void> {
  updateValue(value)
  const adapter = props.adapters?.dateRange
  if (!adapter || !Array.isArray(value) || value.length < 2) return
  try {
    await adapter.calculate({
      fieldId: props.field.id,
      fieldCode: props.field.key,
      startValue: String(value[0] ?? ''),
      endValue: String(value[1] ?? ''),
      context: props.adapterContext,
    })
  } catch (error) {
    reportAssetFailure(error, '日期范围计算失败')
  }
}

/** 复用账户中心个人签名；缺少 Adapter 时失败关闭。 */
async function reusePersonalSignature(): Promise<void> {
  const adapter = props.adapters?.personalSignature
  if (!adapter || controlDisabled.value) {
    emit('runtime-warning', '当前宿主未提供个人签名 Adapter')
    return
  }
  capabilityLoading.value = true
  try {
    const asset = await adapter.reuse({
      fieldId: props.field.id,
      fieldCode: props.field.key,
      context: props.adapterContext,
    })
    updateValue(asset.assetId)
  } catch (error) {
    reportAssetFailure(error, '个人签名复用失败')
  } finally {
    capabilityLoading.value = false
  }
}

async function scanCode(): Promise<void> {
  if (!props.adapters?.scan || controlDisabled.value) return
  try {
    const result = await props.adapters.scan.scan({ context: props.adapterContext })
    updateValue(result.text)
  } catch (error) {
    reportAssetFailure(error, '扫码失败')
  }
}

async function recognizeImage(file: UploadFile): Promise<void> {
  if (!props.adapters?.ocr || !file.raw || controlDisabled.value || capabilityLoading.value) return
  capabilityLoading.value = true
  try {
    const result = await props.adapters.ocr.recognize({
      file: file.raw,
      fieldId: props.field.id,
      fieldCode: props.field.key,
      provider: textConfiguration('provider') || undefined,
      context: props.adapterContext,
    })
    updateValue(result)
  } catch (error) {
    reportAssetFailure(error, 'OCR 识别失败')
  } finally {
    capabilityLoading.value = false
  }
}

async function locatePosition(): Promise<void> {
  if (!props.adapters?.location || controlDisabled.value || capabilityLoading.value) return
  capabilityLoading.value = true
  try {
    const result = await props.adapters.location.locate({ context: props.adapterContext })
    updateValue({ ...result, collectedAt: new Date().toISOString() })
  } catch (error) {
    reportAssetFailure(error, '定位失败')
  } finally {
    capabilityLoading.value = false
  }
}

function textConfiguration(key: string): string {
  const value = props.field.configuration[key]
  return typeof value === 'string' ? value : ''
}

function numberConfiguration(key: string): number {
  const value = props.field.configuration[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function nullableNumberConfiguration(key: string): number | undefined {
  const value = props.field.configuration[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function booleanConfiguration(key: string): boolean {
  return props.field.configuration[key] === true
}

function normalizeOptions(source: unknown): DesignerOption[] {
  if (!Array.isArray(source)) return []
  return source.map((item, index) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      return { label: String(item), value: String(item) }
    }
    const option = item as Record<string, unknown>
    return {
      label: String(option.label ?? `选项 ${index + 1}`),
      value: normalizeOptionValue(option.value, index),
      disabled: option.disabled === true,
      children: normalizeOptions(option.children),
    }
  })
}

function normalizeOptionValue(value: unknown, index: number): string | number | boolean {
  return ['string', 'number', 'boolean'].includes(typeof value)
    ? (value as string | number | boolean)
    : `option-${index + 1}`
}

function toCascaderOption(option: DesignerOption): CascaderOption {
  return {
    label: option.label,
    value: typeof option.value === 'boolean' ? String(option.value) : option.value,
    disabled: option.disabled,
    children: option.children?.map(toCascaderOption),
  }
}
</script>

<style scoped>
.designer-static-control,
.designer-static-control :deep(.el-select),
.designer-static-control :deep(.el-date-editor),
.designer-static-control :deep(.el-input-number),
.designer-static-control :deep(.el-cascader) {
  width: 100%;
}

.designer-static-control__readonly {
  display: inline-flex;
  min-height: 32px;
  align-items: center;
  color: var(--el-text-color-regular);
  overflow-wrap: anywhere;
}

.designer-static-control__summary,
.designer-static-control__position small {
  display: block;
  margin-top: var(--daxiang-form-space-1);
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.designer-static-control__rich-text {
  overflow: hidden;
  border: 1px solid var(--el-border-color);
  border-radius: var(--el-border-radius-base);
}

.designer-static-control__rich-toolbar {
  display: flex;
  align-items: center;
  padding: var(--daxiang-form-space-2);
  gap: var(--daxiang-form-space-3);
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color-light);
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.designer-static-control__rich-content {
  min-height: 140px;
  padding: var(--daxiang-form-space-3);
  outline: none;
}

.designer-static-control__rich-content:empty::before {
  color: var(--el-text-color-placeholder);
  content: attr(data-placeholder);
}

.designer-static-control__serial,
.designer-static-control__opinion,
.designer-static-control__position {
  display: grid;
  gap: var(--daxiang-form-space-2);
}

.designer-static-control__code-preview {
  display: flex;
  align-items: center;
  color: var(--el-text-color-secondary);
  gap: var(--daxiang-form-space-2);
}

.designer-static-control__code-preview > :first-child,
.designer-static-control__upload-icon {
  font-size: 28px;
}

.designer-static-control__position {
  grid-template-columns: minmax(0, 1fr) auto;
}

.designer-static-control__position small {
  grid-column: 1 / -1;
}
</style>
