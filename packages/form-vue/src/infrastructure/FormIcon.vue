<template>
  <Icon v-if="icon" :icon="icon" v-bind="$attrs" class="daxiang-form-icon" aria-hidden="true" />
</template>

<script setup lang="ts">
import { icons } from '@iconify-json/ri'
import { Icon, addCollection } from '@iconify/vue/offline'

defineOptions({ name: 'FormIcon', inheritAttrs: false })

defineProps<{
  /** 随包发布的 Remix Icon 名称，例如 `ri:add-line`。 */
  icon?: string
}>()

addCollection(icons)
</script>

<style scoped>
.daxiang-form-icon {
  display: inline-block;
  width: 1em;
  height: 1em;
  line-height: 1;
  vertical-align: -0.125em;
}
</style>
