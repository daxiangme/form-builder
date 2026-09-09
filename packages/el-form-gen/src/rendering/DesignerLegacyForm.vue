<template>
  <div v-if="initializationError" class="daxiang-form">
    <ElEmpty :description="initializationError" />
  </div>
  <DesignerSessionForm
    v-else-if="ownedSession"
    :key="ownedSession.getSnapshot().sessionId"
    :session="ownedSession"
    :device="device"
    :active-module="requestedModule"
    :overlay-only="overlayOnly"
    :show-toolbar="showToolbar"
    legacy
    @legacy-submit="submitLegacy"
    @legacy-reset="resetLegacy"
    @action="emit('action', $event)"
    @runtime-warning="emit('runtime-warning', $event)"
    @overlay-closed="emit('overlay-closed')"
    @overlay-open-failed="emit('overlay-open-failed', $event)"
  />
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import {
  createDesignerRuntimeSession,
  type DesignerActionBarButton,
  type DesignerRuntimeSession,
  type DesignerRuntimeValueStore,
  type DesignerSubmissionProjection,
} from '@daxiangme/form-core'
import DesignerSessionForm from './DesignerSessionForm.vue'
import type { ElFormRendererLegacyProps } from './el-form-renderer-props'
import {
  cloneLegacyRuntimeValue,
  createLegacyRuntimeInput,
  legacyRuntimeValuesEqual,
  projectLegacyRuntimeValue,
  restoreLegacySubmissionIdentities,
  type LegacyRuntimeIdentity,
} from './legacy-runtime-bridge'

defineOptions({ name: 'DesignerLegacyForm' })
const props = withDefaults(defineProps<ElFormRendererLegacyProps>(), {
  mode: 'CREATE',
  device: 'desktop',
  activeModule: '',
  initialOverlayCode: '',
  overlayOnly: false,
  showToolbar: false,
})
const emit = defineEmits<{
  /** 仅业务值发生实际变化时输出旧一级快照。 */
  'update:modelValue': [value: DesignerRuntimeValueStore]
  /** 经过统一会话校验和权限过滤的旧提交投影。 */
  submit: [projection: DesignerSubmissionProjection]
  /** 旧重置语义下重新初始化得到的快照。 */
  reset: [value: DesignerRuntimeValueStore]
  /** 保留旧动作栏通知。 */
  action: [action: DesignerActionBarButton['action']]
  /** 不包含宿主不透明引用的运行诊断。 */
  'runtime-warning': [message: string]
  /** 兼容旧弹层关闭通知。 */
  'overlay-closed': []
  /** 兼容旧弹层打开失败通知。 */
  'overlay-open-failed': [message: string]
}>()
const ownedSession = shallowRef<DesignerRuntimeSession>()
const initializationError = ref('')
const requestedModule = computed(() => props.activeModule || props.initialOverlayCode)
let identities = new Map<string, LegacyRuntimeIdentity>()
let unsubscribe: (() => void) | undefined
let lastObserved: DesignerRuntimeValueStore | undefined
let lastEmitted: DesignerRuntimeValueStore | undefined
let disposed = false

function replaceSession(
  controlled: DesignerRuntimeValueStore | undefined,
  includeDefaults: boolean,
): DesignerRuntimeSession | undefined {
  unsubscribe?.()
  unsubscribe = undefined
  ownedSession.value?.dispose()
  ownedSession.value = undefined
  initializationError.value = ''
  lastEmitted = undefined
  try {
    const input = createLegacyRuntimeInput(props.document, controlled, includeDefaults)
    const session = createDesignerRuntimeSession({
      document: input.document,
      initialState: input.value,
      mode: props.mode,
      compatibility: 'LEGACY',
      fieldRuntimePolicy: props.fieldRuntimePolicy,
      fieldRuntimePolicyFallback: props.fieldRuntimePolicyFallback,
      adapters: props.adapters,
      adapterContext: props.adapterContext,
    })
    identities = input.identities
    ownedSession.value = session
    lastObserved = projectLegacyRuntimeValue(session.getSnapshot().value, identities)
    unsubscribe = session.subscribe((snapshot) => {
      if (disposed || ownedSession.value !== session) return
      publishValue(projectLegacyRuntimeValue(snapshot.value, identities))
    })
    return session
  } catch {
    initializationError.value =
      '旧表单无法建立运行会话，请检查文档结构与一级运行值。嵌套关系和多对多需要使用 session 入口。'
    emit('runtime-warning', initializationError.value)
    if (props.overlayOnly && requestedModule.value)
      emit('overlay-open-failed', initializationError.value)
    return undefined
  }
}

function publishValue(value: DesignerRuntimeValueStore): void {
  if (legacyRuntimeValuesEqual(value, lastObserved)) return
  lastObserved = cloneLegacyRuntimeValue(value)
  lastEmitted = cloneLegacyRuntimeValue(value)
  emit('update:modelValue', cloneLegacyRuntimeValue(value))
}

function submitLegacy(projection: DesignerSubmissionProjection): void {
  emit('submit', restoreLegacySubmissionIdentities(projection, identities))
}

async function resetLegacy(): Promise<void> {
  const previous = lastObserved
  const session = replaceSession(props.modelValue, true)
  if (!session) return
  await session.dispatch({ type: 'FORM_EVENT', event: 'RESET' })
  if (disposed || ownedSession.value !== session) return
  const value = projectLegacyRuntimeValue(session.getSnapshot().value, identities)
  if (!legacyRuntimeValuesEqual(previous, value)) {
    lastObserved = undefined
    publishValue(value)
  }
  emit('reset', cloneLegacyRuntimeValue(value))
}

watch(
  () => props.document,
  () => {
    replaceSession(props.modelValue, true)
  },
  { deep: true, immediate: true },
)
watch(
  () => props.modelValue,
  (value) => {
    if (
      !value ||
      legacyRuntimeValuesEqual(value, lastEmitted) ||
      legacyRuntimeValuesEqual(value, lastObserved)
    )
      return
    replaceSession(value, false)
  },
  { deep: true },
)
watch(
  () => props.mode,
  (mode) => {
    ownedSession.value?.updateRuntimePolicy({ mode })
  },
)
watch(
  () => props.fieldRuntimePolicy,
  (fieldRuntimePolicy) => {
    ownedSession.value?.updateRuntimePolicy({ fieldRuntimePolicy })
  },
  { deep: true },
)
watch(
  () => props.fieldRuntimePolicyFallback,
  (fieldRuntimePolicyFallback) => {
    ownedSession.value?.updateRuntimePolicy({ fieldRuntimePolicyFallback })
  },
)
watch(
  [() => props.adapters, () => props.adapterContext],
  () => {
    const value = ownedSession.value
      ? projectLegacyRuntimeValue(ownedSession.value.getSnapshot().value, identities)
      : props.modelValue
    replaceSession(value, false)
  },
  { deep: true },
)

onBeforeUnmount(() => {
  disposed = true
  unsubscribe?.()
  ownedSession.value?.dispose()
})
</script>
