<template>
  <div class="designer-static-control" :class="{ 'is-readonly': readonlyMode }">
    <DesignerDetailField
      v-if="presentsAsPlainValue"
      compact
      :field="field"
      :model-value="modelValue"
      :show-label="false"
      :show-help="false"
      :adapters="adapters"
      :adapter-context="adapterContext"
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
        <FormButton
          :loading="assetUploading"
          :disabled="controlDisabled || !assetAdapter"
          icon="ri:upload-2-line"
        >
          选择文件
        </FormButton>
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

      <div v-else-if="componentType === 'signature'" class="designer-static-control__signature">
        <DesignerSignatureSurface
          :preview-src="signaturePreviewSrc"
          :has-value="Boolean(signatureValue)"
          :disabled="controlDisabled || signatureAssetBlocked"
          :loading="capabilityLoading"
          @open="openSignatureDialog('field')"
          @clear="clearSignature"
        />
        <small v-if="signatureAssetBlocked">资产模式需要宿主注入 adapters.asset</small>
        <small v-else-if="mode === 'DESIGN'">设计态不打开签名弹窗，运行时点击后手写</small>
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
        <DesignerSignatureSurface
          v-if="textConfiguration('mode') !== 'OPINION'"
          :preview-src="opinionSignature"
          :has-value="Boolean(opinionSignature)"
          :disabled="controlDisabled"
          :loading="capabilityLoading"
          @open="openSignatureDialog('opinion')"
          @clear="clearOpinionSignature"
        />
        <small v-if="mode === 'DESIGN' && textConfiguration('mode') !== 'OPINION'">
          设计态不打开签名弹窗，运行时点击后手写
        </small>
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
        :control-radius="controlRadius"
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

      <div v-else-if="componentType === 'scan-code'" class="designer-static-control__scan">
        <ElInput
          :model-value="textValue"
          :disabled="
            controlDisabled ||
            (!booleanConfiguration('allowManualInput') &&
              !booleanConfiguration('allowModification'))
          "
          placeholder="扫码结果"
          @update:model-value="updateValue"
        >
          <template #append>
            <ElTooltip :content="scanButtonTip">
              <FormButton
                :disabled="controlDisabled || !adapters?.scan || !scanReady"
                aria-label="扫码"
                icon="ri:qr-scan-2-line"
                @click="scanCode"
              />
            </ElTooltip>
          </template>
        </ElInput>
        <small v-if="scanUnreadyReason" class="el-upload__tip">{{ scanUnreadyReason }}</small>
      </div>

      <div v-else-if="componentType === 'ocr'" class="designer-static-control__ocr">
        <ElUpload
          action="#"
          :auto-upload="false"
          :disabled="controlDisabled || !adapters?.ocr"
          @change="recognizeImage"
        >
          <FormButton
            :disabled="controlDisabled || !adapters?.ocr"
            :loading="capabilityLoading"
            icon="ri:image-add-line"
          >
            选择识别图片
          </FormButton>
          <template #tip>
            <div class="el-upload__tip">{{ ocrCapabilityTip }}</div>
          </template>
        </ElUpload>
        <ElInput
          v-if="ocrResultText"
          type="textarea"
          :model-value="ocrResultText"
          :rows="4"
          :disabled="controlDisabled || !booleanConfiguration('allowResultEditing')"
          @update:model-value="updateOcrResultText"
        />
      </div>

      <div v-else-if="componentType === 'position'" class="designer-static-control__position">
        <ElInput
          :model-value="positionAddressText"
          :placeholder="positionPlaceholder"
          readonly
          :disabled="controlDisabled"
        >
          <template #append>
            <ElTooltip :content="positionActionTip">
              <FormButton
                :disabled="positionActionDisabled"
                :loading="capabilityLoading"
                :aria-label="positionActionLabel"
                :icon="positionActionIcon"
                @click="runPositionAction"
              >
                {{ positionActionLabel }}
              </FormButton>
            </ElTooltip>
          </template>
        </ElInput>
        <small v-if="positionCapabilityTip">{{ positionCapabilityTip }}</small>
        <DesignerLocationPickerDialog
          v-model="locationPickerVisible"
          :field="field"
          :adapters="adapters"
          :adapter-context="adapterContext"
          :initial="locationInitialValue"
          :default-center="parseDefaultCenter(textConfiguration('defaultCenter'))"
          :requested-fields="locationOutputFields()"
          :control-radius="controlRadius"
          @confirm="applyLocationValue"
          @runtime-warning="emit('runtime-warning', $event)"
        />
      </div>

      <div
        v-else-if="componentType === 'online-document'"
        class="designer-static-control__unavailable"
      >
        <ElButton disabled>在线文档不可用</ElButton>
        <small>当前部署未配置 Web Office 服务</small>
      </div>

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

      <div v-else class="designer-static-control__unavailable">
        <ElButton disabled>{{ componentName }}不可用</ElButton>
        <small>{{ componentName }}缺少独立渲染器，已失败关闭且不能回退为文本框</small>
      </div>

      <DesignerSignatureDialog
        v-if="
          componentType === 'signature' ||
          (componentType === 'opinion' && textConfiguration('mode') !== 'OPINION')
        "
        v-model="signatureDialogVisible"
        :field="field"
        :adapters="adapters"
        :adapter-context="adapterContext"
        :control-radius="controlRadius"
        :initial-value="signatureDialogInitialValue"
        :preview-src="signatureDialogPreviewSrc"
        :line-width="signatureDialogLineWidth"
        :pen-color="signatureDialogPenColor"
        :allow-personal-signature="signatureDialogAllowPersonal"
        @confirm="confirmSignatureDialog"
        @runtime-warning="emit('runtime-warning', $event)"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { CascaderOption, UploadFile, UploadUserFile } from 'element-plus'
import DxSvgIcon from '../infrastructure/FormIcon.vue'
import FormButton from '../infrastructure/FormButton.vue'
import { findDesignerComponent } from '@daxiangme/form-core'
import { formatDesignerNumber, resolveDesignerNumberPrecision } from '@daxiangme/form-core'
import {
  cropFormLocationValue,
  FORM_LOCATION_DEFAULT_OUTPUT_FIELDS,
  isFormLocationField,
} from '@daxiangme/form-core'
import DesignerLocationPickerDialog from './DesignerLocationPickerDialog.vue'
import type {
  DesignerField,
  DesignerOption,
  DesignerRadiusValue,
  DesignerRuntimeAdapters,
  DesignerRuntimeMode,
  FormAssetAdapter,
  FormAssetReference,
  FormLocationField,
  FormLocationValue,
  FormRuntimeAdapterContext,
  FormScanReadiness,
} from '@daxiangme/form-core'
import DxStepProgress from '../form/controls/DxStepProgress.vue'
import DesignerDetailField from './DesignerDetailField.vue'
import DesignerSignatureDialog from './DesignerSignatureDialog.vue'
import DesignerSignatureSurface from './DesignerSignatureSurface.vue'
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
    fieldValues?: Record<string, unknown>
    /** 表单控件圆角，选点等弹窗外壳与全局圆角对齐。 */
    controlRadius?: DesignerRadiusValue
  }>(),
  { appearanceMode: 'CONTROL', adapterContext: () => ({}), fieldValues: () => ({}) },
)

const emit = defineEmits<{
  'update:modelValue': [value: unknown]
  'apply-field-assignments': [source: Record<string, unknown>]
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
const ACTION_FIELD_TYPES = new Set([
  'file',
  'signature',
  'opinion',
  'scan-code',
  'ocr',
  'position',
  'rich-text',
  ...localPickerTypes,
])
const controlDisabled = computed(
  () =>
    props.mode === 'DESIGN' ||
    props.mode === 'READ_ONLY' ||
    props.mode === 'DETAIL' ||
    props.field.display.readonly,
)
/** 整表只读或字段已锁定时去掉采集、上传、选点等操作入口。设计态仍展示按钮便于对照。 */
const hideActions = computed(() => controlDisabled.value && props.mode !== 'DESIGN')
const readonlyMode = computed(() => props.mode === 'READ_ONLY' || props.field.display.readonly)
/** 整表只读且配置为纯文本，或只读下的采集/选择类字段，改为详情内容。 */
const presentsAsPlainValue = computed(
  () =>
    (readonlyMode.value && props.appearanceMode === 'TEXT') ||
    (hideActions.value && ACTION_FIELD_TYPES.has(componentType.value)),
)
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
const signatureUsesAsset = computed(() => textConfiguration('storageMode') === 'ASSET')
const signatureAssetBlocked = computed(
  () => signatureUsesAsset.value && props.mode !== 'DESIGN' && !assetAdapter.value,
)
const scanReady = ref(true)
const scanUnreadyReason = ref('')
const scanButtonTip = computed(() => {
  if (!props.adapters?.scan) return '宿主未配置扫码 Adapter'
  if (!scanReady.value) return scanUnreadyReason.value || '扫码设备未就绪'
  return '扫描二维码或条码'
})
const positionCapabilityTip = computed(() => {
  if (props.mode === 'DESIGN') return '设计态不打开地图，运行时由宿主定位 Adapter 接管'
  if (!props.adapters?.location) return '宿主未配置定位 Adapter'
  if (
    booleanConfiguration('allowManualPick') &&
    !props.adapters.location.pick &&
    !props.adapters.location.bindPicker
  ) {
    return '当前宿主只支持获取当前位置，未提供地图选点'
  }
  return ''
})
const positionUsesPick = computed(() => booleanConfiguration('allowManualPick'))
const positionActionLabel = computed(() => (positionUsesPick.value ? '地图选点' : '获取位置'))
const positionActionIcon = computed(() =>
  positionUsesPick.value ? 'ri:map-2-line' : 'ri:map-pin-line',
)
const positionActionTip = computed(() => {
  if (props.mode === 'DESIGN') {
    return positionUsesPick.value ? '运行时点击后打开地图选点' : '运行时获取当前位置'
  }
  if (!props.adapters?.location) return '宿主未配置定位 Adapter'
  if (
    positionUsesPick.value &&
    !props.adapters.location.pick &&
    !props.adapters.location.bindPicker
  ) {
    return '当前宿主只支持获取当前位置'
  }
  return positionUsesPick.value ? '打开地图选择位置' : '获取当前位置'
})
const positionActionDisabled = computed(
  () => controlDisabled.value || capabilityLoading.value || !props.adapters?.location,
)
const locationPickerVisible = ref(false)
const signatureDialogVisible = ref(false)
const signatureDialogKind = ref<'field' | 'opinion'>('field')
const locationInitialValue = computed(() =>
  isLocationValue(props.modelValue) ? props.modelValue : undefined,
)
const positionPlaceholder = '请选择位置'
const positionAddressText = computed(() => {
  if (typeof props.modelValue !== 'object' || props.modelValue === null) return ''
  const value = props.modelValue as Record<string, unknown>
  const address = typeof value.address === 'string' ? value.address.trim() : ''
  if (address) return address
  const name = typeof value.name === 'string' ? value.name.trim() : ''
  if (name) return name
  if (!booleanConfiguration('showCoordinates')) return ''
  if (value.longitude == null || value.latitude == null) return ''
  return `${value.longitude}, ${value.latitude}`
})
const ocrCapabilityTip = computed(() => {
  if (!props.adapters?.ocr) return '宿主未配置 OCR Adapter'
  return booleanConfiguration('retainOriginal')
    ? '识别结果由 OCR Adapter 返回；勾选保留原图时会额外上传图片'
    : '识别结果由 OCR Adapter 返回'
})
let unsubscribeScan: (() => void) | undefined
const resolvedAssets = ref<FormAssetReference[]>([])
const assetUploading = ref(false)
const capabilityLoading = ref(false)
const signaturePreviewSrc = computed(() => {
  if (signatureValue.value.startsWith('data:image/')) return signatureValue.value
  if (/^(https?:|blob:)/i.test(signatureValue.value)) return signatureValue.value
  const asset = resolvedAssets.value.find((item) => item.assetId === signatureValue.value)
  return asset?.downloadUrl ?? ''
})
const signatureDialogInitialValue = computed(() =>
  signatureDialogKind.value === 'opinion' ? opinionSignature.value : signatureValue.value,
)
const signatureDialogPreviewSrc = computed(() =>
  signatureDialogKind.value === 'opinion' ? opinionSignature.value : signaturePreviewSrc.value,
)
const signatureDialogLineWidth = computed(() =>
  signatureDialogKind.value === 'opinion' ? 2 : numberConfiguration('lineWidth') || 2,
)
const signatureDialogPenColor = computed(() =>
  signatureDialogKind.value === 'opinion' ? '#111827' : textConfiguration('penColor') || '#111827',
)
const signatureDialogAllowPersonal = computed(
  () =>
    signatureDialogKind.value === 'field' && booleanConfiguration('allowPersonalSignatureReuse'),
)
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
const ocrResultText = computed(() => {
  if (typeof props.modelValue !== 'object' || props.modelValue === null) return ''
  try {
    return JSON.stringify(props.modelValue, null, 2)
  } catch {
    return ''
  }
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

function openSignatureDialog(kind: 'field' | 'opinion'): void {
  if (controlDisabled.value) return
  if (kind === 'field' && signatureAssetBlocked.value) return
  signatureDialogKind.value = kind
  signatureDialogVisible.value = true
}

function clearSignature(): void {
  void updateSignature('')
}

function clearOpinionSignature(): void {
  updateOpinionSignature('')
}

async function confirmSignatureDialog(payload: {
  value: string
  asset?: FormAssetReference
}): Promise<void> {
  if (signatureDialogKind.value === 'opinion') {
    updateOpinionSignature(payload.value)
    return
  }
  if (payload.asset) {
    resolvedAssets.value = [
      ...resolvedAssets.value.filter((item) => item.assetId !== payload.asset?.assetId),
      payload.asset,
    ]
  }
  await updateSignature(payload.value)
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

/** 新协议只输出 assetId；旧对象值只在内存中读取兼容字段。签名资产模式把字符串值当作 assetId。 */
function normalizeAssetIds(value: unknown): string[] {
  if (
    signatureUsesAsset.value &&
    typeof value === 'string' &&
    value.trim() &&
    !value.startsWith('data:')
  ) {
    return [value]
  }
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

onBeforeUnmount(() => {
  unsubscribeScan?.()
})

watch(
  () => [props.field.id, props.adapters, componentType.value],
  () => {
    void loadRemoteCatalogs()
  },
)

watch(
  () => props.adapters?.scan,
  (adapter) => {
    unsubscribeScan?.()
    unsubscribeScan = undefined
    if (!adapter) {
      scanReady.value = true
      scanUnreadyReason.value = ''
      return
    }
    const apply = (state: FormScanReadiness) => {
      scanReady.value = state.ready
      scanUnreadyReason.value = state.ready ? '' : (state.unreadyReason ?? '扫码设备未就绪')
    }
    if (adapter.readiness) apply(adapter.readiness({ context: props.adapterContext }))
    else {
      scanReady.value = true
      scanUnreadyReason.value = ''
    }
    if (adapter.subscribeReadiness) {
      unsubscribeScan = adapter.subscribeReadiness(apply, { context: props.adapterContext })
    }
  },
  { immediate: true },
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

async function scanCode(): Promise<void> {
  if (!props.adapters?.scan || controlDisabled.value || !scanReady.value) return
  try {
    const formats = stringArrayConfiguration('formats')
    const parameterFieldId = textConfiguration('scanParameterFieldId')
    const result = await props.adapters.scan.scan({
      fieldId: props.field.id,
      fieldCode: props.field.key,
      formats: formats.length ? formats : undefined,
      parameter: parameterFieldId ? props.fieldValues?.[parameterFieldId] : undefined,
      context: props.adapterContext,
    })
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
    const payload: Record<string, unknown> = { ...result }
    if (booleanConfiguration('retainOriginal')) {
      if (!assetAdapter.value) {
        emit('runtime-warning', '保留原图需要宿主注入 adapters.asset')
      } else {
        const asset = await assetAdapter.value.upload({
          file: file.raw,
          fieldId: props.field.id,
          fieldCode: props.field.key,
          policyRef: textConfiguration('assetPolicyRef') || undefined,
          context: props.adapterContext,
        })
        payload.originalAssetId = asset.assetId
      }
    }
    updateValue(payload)
    emit('apply-field-assignments', payload)
  } catch (error) {
    reportAssetFailure(error, 'OCR 识别失败')
  } finally {
    capabilityLoading.value = false
  }
}

async function runPositionAction(): Promise<void> {
  if (booleanConfiguration('allowManualPick') && props.adapters?.location?.bindPicker) {
    locationPickerVisible.value = true
    return
  }
  if (booleanConfiguration('allowManualPick') && props.adapters?.location?.pick) {
    await pickPosition()
    return
  }
  await locatePosition()
}

async function locatePosition(): Promise<void> {
  if (!props.adapters?.location || controlDisabled.value || capabilityLoading.value) return
  capabilityLoading.value = true
  try {
    const result = await props.adapters.location.locate({
      enableHighAccuracy: booleanConfiguration('enableHighAccuracy'),
      timeoutMilliseconds: numberConfiguration('timeout') || undefined,
      context: props.adapterContext,
    })
    applyLocationValue({
      ...result,
      source: result.source ?? 'CURRENT',
      collectedAt: result.collectedAt ?? new Date().toISOString(),
    })
  } catch (error) {
    reportAssetFailure(error, '定位失败')
  } finally {
    capabilityLoading.value = false
  }
}

async function pickPosition(): Promise<void> {
  const pick = props.adapters?.location?.pick
  if (!pick || controlDisabled.value || capabilityLoading.value) return
  capabilityLoading.value = true
  try {
    const result = await pick({
      fieldId: props.field.id,
      fieldCode: props.field.key,
      provider: textConfiguration('mapProvider') || undefined,
      initial: isLocationValue(props.modelValue) ? props.modelValue : undefined,
      defaultCenter: parseDefaultCenter(textConfiguration('defaultCenter')),
      requestedFields: locationOutputFields(),
      context: props.adapterContext,
    })
    if (!result) return
    applyLocationValue({ ...result, source: result.source ?? 'PICK' })
  } catch (error) {
    reportAssetFailure(error, '地图选点失败')
  } finally {
    capabilityLoading.value = false
  }
}

async function updateSignature(dataUrl: string): Promise<void> {
  if (controlDisabled.value) return
  if (!signatureUsesAsset.value) {
    updateValue(dataUrl)
    return
  }
  if (!dataUrl) {
    updateValue('')
    return
  }
  if (!dataUrl.startsWith('data:')) {
    updateValue(dataUrl)
    return
  }
  const adapter = assetAdapter.value
  if (!adapter) {
    emit('runtime-warning', '资产模式需要宿主注入 adapters.asset')
    return
  }
  capabilityLoading.value = true
  try {
    const asset = await adapter.upload({
      file: dataUrlToFile(dataUrl, `${props.field.key || 'signature'}.png`),
      fieldId: props.field.id,
      fieldCode: props.field.key,
      policyRef: textConfiguration('assetPolicyRef') || undefined,
      context: props.adapterContext,
    })
    resolvedAssets.value = [
      ...resolvedAssets.value.filter((item) => item.assetId !== asset.assetId),
      asset,
    ]
    updateValue(asset.assetId)
  } catch (error) {
    reportAssetFailure(error, '签名上传失败')
  } finally {
    capabilityLoading.value = false
  }
}

function updateOcrResultText(value: string): void {
  if (controlDisabled.value || !booleanConfiguration('allowResultEditing')) return
  try {
    const parsed: unknown = JSON.parse(value)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      emit('runtime-warning', '识别结果必须是对象')
      return
    }
    updateValue(parsed)
  } catch {
    emit('runtime-warning', '识别结果不是合法 JSON')
  }
}

function applyLocationValue(result: FormLocationValue): void {
  updateValue(cropFormLocationValue(result, locationOutputFields()))
  emit('apply-field-assignments', { ...result })
}

function locationOutputFields(): FormLocationField[] {
  const configured = stringArrayConfiguration('outputFields').filter(isFormLocationField)
  return configured.length ? configured : [...FORM_LOCATION_DEFAULT_OUTPUT_FIELDS]
}

function stringArrayConfiguration(key: string): string[] {
  const value = props.field.configuration[key]
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

function parseDefaultCenter(value: string): { longitude: number; latitude: number } | undefined {
  const parts = value
    .split(/[,，\s]+/u)
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item))
  if (parts.length < 2) return undefined
  return { longitude: parts[0]!, latitude: parts[1]! }
}

function isLocationValue(value: unknown): value is FormLocationValue {
  if (typeof value !== 'object' || value === null) return false
  const source = value as Record<string, unknown>
  return typeof source.longitude === 'number' && typeof source.latitude === 'number'
}

function dataUrlToFile(dataUrl: string, fileName: string): File {
  const [header, body] = dataUrl.split(',')
  const mime = /data:([^;]+)/u.exec(header ?? '')?.[1] ?? 'image/png'
  const binary = atob(body ?? '')
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return new File([bytes], fileName, { type: mime })
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

.designer-static-control__unavailable {
  display: grid;
  gap: var(--daxiang-form-space-2);
}

.designer-static-control__unavailable small {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.designer-static-control__signature small {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.designer-static-control__serial,
.designer-static-control__signature,
.designer-static-control__opinion,
.designer-static-control__ocr,
.designer-static-control__scan,
.designer-static-control__position {
  display: grid;
  gap: var(--daxiang-form-space-2);
}

.designer-static-control__position small,
.designer-static-control__ocr .el-upload {
  grid-column: 1 / -1;
}

.designer-static-control__position :deep(.el-input-group__append) {
  padding: 0;
}

.designer-static-control__position :deep(.el-input-group__append .el-button) {
  margin: 0;
  border: none;
  border-radius: 0;
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
</style>
