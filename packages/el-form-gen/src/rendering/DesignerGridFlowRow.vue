<template>
  <ElRow :class="rowClass" :gutter="gutter" :style="rowStyle">
    <template v-for="item in flow" :key="item.key">
      <ElCol
        v-if="item.kind === 'gap'"
        :span="item.span"
        class="daxiang-form-grid-gap"
        aria-hidden="true"
      />
      <slot v-else :node="item.node" />
    </template>
  </ElRow>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from 'vue'
import { flattenDesignerCanvasFlow } from '@daxiangme/form-core'
import type { DesignerDevice, DesignerLayoutNode } from '@daxiangme/form-core'

defineOptions({ name: 'DesignerGridFlowRow' })

const props = defineProps<{
  /** 当前实际占据栅格的顺序节点。 */
  nodes: DesignerLayoutNode[]
  /** 当前呈现设备。 */
  device: DesignerDevice
  /** Element Plus 栅格间距。 */
  gutter: number
  /** 行与行之间的间距，单位 px。 */
  rowGap?: number
  /** 附加到行容器的 class。 */
  rowClass?: string | Record<string, boolean> | (string | Record<string, boolean>)[]
}>()

const flow = computed(() => flattenDesignerCanvasFlow(props.nodes, props.device))
const rowStyle = computed<CSSProperties | undefined>(() =>
  props.rowGap == null ? undefined : { rowGap: `${props.rowGap}px` },
)

defineSlots<{
  default(props: { node: DesignerLayoutNode }): unknown
}>()
</script>
