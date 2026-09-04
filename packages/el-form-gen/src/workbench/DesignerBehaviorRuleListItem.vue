<template>
  <article
    class="designer-behavior-rule-list-item"
    :class="{ 'is-active': active }"
    tabindex="0"
    role="button"
    @click="$emit('click')"
    @keydown.enter="$emit('click')"
  >
    <div class="designer-behavior-rule-list-item__identity">
      <strong>{{ title }}</strong>
      <small>{{ summary }}</small>
    </div>
    <ElSwitch
      v-if="enabled !== undefined"
      :model-value="enabled"
      aria-label="启停规则"
      @click.stop
      @update:model-value="$emit('toggle')"
    />
    <div v-if="diagnostics.length > 0" class="designer-behavior-rule-list-item__diagnostics">
      <ElTag
        v-for="item in diagnostics.slice(0, 2)"
        :key="`${item.code}:${item.path}`"
        :type="item.severity === 'ERROR' ? 'danger' : 'warning'"
        effect="plain"
      >
        {{ item.message }}
      </ElTag>
    </div>
    <footer @click.stop>
      <ElButton text :disabled="moveUpDisabled" aria-label="上移规则" @click="$emit('move-up')">
        <DxSvgIcon icon="ri:arrow-up-line" />
      </ElButton>
      <ElButton text :disabled="moveDownDisabled" aria-label="下移规则" @click="$emit('move-down')">
        <DxSvgIcon icon="ri:arrow-down-line" />
      </ElButton>
      <ElButton text aria-label="复制规则" @click="$emit('copy')">
        <DxSvgIcon icon="ri:file-copy-line" />
      </ElButton>
      <ElButton text type="danger" aria-label="删除规则" @click="$emit('delete')">
        <DxSvgIcon icon="ri:delete-bin-line" />
      </ElButton>
    </footer>
  </article>
</template>

<script setup lang="ts">
import DxSvgIcon from '../infrastructure/FormIcon.vue'
import type { DesignerFieldBehaviorDiagnostic } from '@daxiangme/form-core'

defineOptions({ name: 'DesignerBehaviorRuleListItem' })
defineProps<{
  active: boolean
  title: string
  summary: string
  diagnostics: DesignerFieldBehaviorDiagnostic[]
  enabled?: boolean
  moveUpDisabled: boolean
  moveDownDisabled: boolean
}>()
defineEmits<{ click: []; toggle: []; copy: []; delete: []; 'move-up': []; 'move-down': [] }>()
</script>

<style scoped>
.designer-behavior-rule-list-item {
  display: grid;
  align-items: start;
  padding: var(--daxiang-form-space-2);
  margin-bottom: var(--daxiang-form-space-2);
  background: var(--el-fill-color-extra-light);
  border: 1px solid transparent;
  border-radius: var(--el-border-radius-base);
  cursor: pointer;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--daxiang-form-space-2);
}

.designer-behavior-rule-list-item.is-active {
  background: var(--el-color-primary-light-9);
  border-color: var(--el-color-primary-light-5);
}

.designer-behavior-rule-list-item__identity {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.designer-behavior-rule-list-item__identity strong,
.designer-behavior-rule-list-item__identity small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.designer-behavior-rule-list-item__identity small {
  color: var(--el-text-color-secondary);
}

.designer-behavior-rule-list-item__diagnostics,
.designer-behavior-rule-list-item footer {
  display: flex;
  min-width: 0;
  grid-column: 1 / -1;
  gap: var(--daxiang-form-space-1);
}

.designer-behavior-rule-list-item__diagnostics {
  flex-direction: column;
}

.designer-behavior-rule-list-item__diagnostics :deep(.el-tag) {
  display: block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
}

.designer-behavior-rule-list-item footer {
  justify-content: flex-end;
}
</style>
