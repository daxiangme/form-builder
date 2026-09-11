<template>
  <ElButton v-bind="$attrs">
    <template v-if="icon || $slots.icon" #icon>
      <slot name="icon">
        <DxSvgIcon v-if="icon" :icon="icon" />
      </slot>
    </template>
    <slot />
  </ElButton>
</template>

<script setup lang="ts">
import DxSvgIcon from './FormIcon.vue'

defineOptions({ name: 'FormButton', inheritAttrs: false })

defineProps<{
  /**
   * Remix Icon 名称，放入 Element Plus 按钮的 `icon` 插槽，由组件负责图标与文字间距。
   */
  icon?: string
}>()
</script>
