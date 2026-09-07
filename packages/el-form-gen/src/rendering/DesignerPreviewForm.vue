<template>
  <div v-if="inputError" class="daxiang-form">
    <ElAlert type="error" :closable="false" :title="inputError" />
  </div>
  <DesignerSessionForm
    v-else-if="session"
    :session="session"
    :device="device"
    :active-module="activeModule"
    :overlay-only="overlayOnly"
    :show-toolbar="showToolbar"
    @submission="emit('submission', $event)"
    @runtime-warning="emit('runtime-warning', $event)"
    @overlay-closed="emit('overlay-closed')"
    @overlay-open-failed="emit('overlay-open-failed', $event)"
    @action="emit('action', $event)"
  />
  <DesignerLegacyForm
    v-else-if="legacyProps"
    v-bind="legacyProps"
    @update:model-value="emit('update:modelValue', $event)"
    @submit="emit('submit', $event)"
    @reset="emit('reset', $event)"
    @action="emit('action', $event)"
    @runtime-warning="emit('runtime-warning', $event)"
    @overlay-closed="emit('overlay-closed')"
    @overlay-open-failed="emit('overlay-open-failed', $event)"
  />
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'
import type {
  DesignerActionBarButton,
  DesignerRuntimeValueStore,
  DesignerSubmissionBatch,
  DesignerSubmissionProjection,
} from '@daxiangme/form-core'
import type { ElFormRendererLegacyProps, ElFormRendererProps } from './el-form-renderer-props'
import DesignerLegacyForm from './DesignerLegacyForm.vue'
import DesignerSessionForm from './DesignerSessionForm.vue'

defineOptions({ name: 'ElFormRenderer' })
const props = defineProps<ElFormRendererProps>()
const emit = defineEmits<{
  /** 旧一级表单快照更新。 */
  'update:modelValue': [value: DesignerRuntimeValueStore]
  /** 旧一级快照提交，不表示持久化成功。 */
  submit: [projection: DesignerSubmissionProjection]
  /** 新关系模式待持久化的原子批次。 */
  submission: [batch: DesignerSubmissionBatch]
  /** 旧模式重置结果。 */
  reset: [value: DesignerRuntimeValueStore]
  /** 旧模式动作栏事件。 */
  action: [action: DesignerActionBarButton['action']]
  /** 运行诊断，不含宿主不透明引用。 */
  'runtime-warning': [message: string]
  /** 模块已关闭。 */
  'overlay-closed': []
  /** 旧预览模块无法打开。 */
  'overlay-open-failed': [message: string]
}>()

const inputError = computed(() => {
  if (props.session) {
    if (
      props.document !== undefined ||
      props.modelValue !== undefined ||
      props.mode !== undefined ||
      props.fieldRuntimePolicy !== undefined ||
      props.adapters !== undefined ||
      props.adapterContext !== undefined ||
      props.initialOverlayCode !== undefined
    )
      return 'session 与 document、modelValue、mode、权限或 Adapter 输入不能混用'
    return ''
  }
  if (!props.document) return '请提供 document 或已创建的 runtime session'
  if (
    props.document.dataSchema.relations.some(
      (relation) =>
        relation.kind === 'MANY_TO_MANY' ||
        relation.parentEntityId !== props.document!.dataSchema.rootEntity.id,
    )
  )
    return '嵌套关系和多对多表单需要通过 session 入口运行，不能转换为一级快照'
  return ''
})
const legacyProps = computed<ElFormRendererLegacyProps | undefined>(() =>
  props.session || !props.document ? undefined : (props as ElFormRendererLegacyProps),
)
watch(
  inputError,
  (message) => {
    if (message) emit('runtime-warning', message)
  },
  { immediate: true },
)
</script>
