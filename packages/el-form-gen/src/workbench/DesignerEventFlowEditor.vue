<template>
  <DModal
    v-model="visibleModel"
    title="设置事件"
    width="min(1180px, calc(100vw - 32px))"
    confirm-text="保存全部事件"
    :flush-content-vertical="true"
    @confirm="save"
  >
    <DesignerEventFlowWorkbench
      v-model="draftFlows"
      :document="document"
      :selected-node-id="selectedNodeId"
      :capabilities="capabilities"
    />
  </DModal>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import DModal from '../infrastructure/FormModalShell.vue'
import type { DesignerFieldBehaviorCapabilities } from '@daxiangme/form-core'
import type { DesignerDocument, DesignerEventFlow } from '@daxiangme/form-core'
import DesignerEventFlowWorkbench from './DesignerEventFlowWorkbench.vue'

defineOptions({ name: 'DesignerEventFlowEditor' })

const props = defineProps<{
  document: DesignerDocument
  selectedNodeId: string
  capabilities: DesignerFieldBehaviorCapabilities
}>()
const emit = defineEmits<{ save: [flows: DesignerEventFlow[]] }>()
const visibleModel = defineModel<boolean>({ default: false })
const draftFlows = ref<DesignerEventFlow[]>([])

watch(visibleModel, (visible) => {
  if (visible) draftFlows.value = cloneValue(props.document.eventFlows)
})

function save(): void {
  emit('save', cloneValue(draftFlows.value))
  visibleModel.value = false
}

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
</script>
