<template>
  <section class="designer-outline">
    <ElTree
      v-if="items.length > 0"
      :data="items"
      node-key="id"
      default-expand-all
      highlight-current
      :current-node-key="selectedNodeId"
      :expand-on-click-node="false"
      @node-click="selectNode"
    >
      <template #default="{ data }">
        <span class="designer-outline__node">
          <DxSvgIcon :icon="data.children.length > 0 ? 'ri:folder-line' : 'ri:input-field'" />
          <span>{{ data.label }}</span>
          <small>{{ data.typeLabel }}</small>
        </span>
      </template>
    </ElTree>
    <ElEmpty v-else description="画布暂无节点" :image-size="56" />
  </section>
</template>

<script setup lang="ts">
import DxSvgIcon from '../infrastructure/FormIcon.vue'
import type { DesignerOutlineItem } from '@daxiangme/form-core'

defineOptions({ name: 'DesignerOutline' })

defineProps<{ items: DesignerOutlineItem[]; selectedNodeId: string }>()
const emit = defineEmits<{ select: [nodeId: string] }>()

function selectNode(data: DesignerOutlineItem): void {
  emit('select', data.id)
}
</script>

<style scoped>
.designer-outline {
  min-height: 0;
  flex: 1 1 0;
  padding: var(--daxiang-form-space-2);
  overflow: auto;
}

.designer-outline__node {
  display: grid;
  width: 100%;
  min-width: 0;
  align-items: center;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: var(--daxiang-form-space-2);
}

.designer-outline__node span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.designer-outline__node small {
  color: var(--el-text-color-secondary);
  font-size: 11px;
}
</style>
