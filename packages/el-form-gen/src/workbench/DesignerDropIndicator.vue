<template>
  <div class="designer-drop-indicator" :class="`is-${placement.toLowerCase()}`" aria-hidden="true">
    <span>放置到这里</span>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'DesignerDropIndicator' })

defineProps<{ placement: 'BEFORE' | 'AFTER' }>()
</script>

<style scoped>
.designer-drop-indicator {
  position: absolute;
  z-index: 8;
  right: 0;
  left: 0;
  height: 2px;
  pointer-events: none;
  color: var(--el-color-primary);
  background: var(--el-color-primary);
}

.designer-drop-indicator::before {
  position: absolute;
  top: 50%;
  left: -4px;
  width: 8px;
  height: 8px;
  content: '';
  background: var(--el-color-primary);
  border-radius: 50%;
  transform: translateY(-50%);
}

.designer-drop-indicator.is-before {
  top: -5px;
}

.designer-drop-indicator.is-after {
  bottom: -5px;
}

.designer-drop-indicator span {
  position: absolute;
  top: 50%;
  left: 50%;
  padding: 0 var(--daxiang-form-space-1);
  background: var(--el-bg-color);
  font-size: 11px;
  line-height: 18px;
  transform: translate(-50%, -50%);
  white-space: nowrap;
}
</style>
