<template>
  <section class="designer-tabs-frame" :class="`is-${type || 'line'}`">
    <div class="designer-tabs-frame__nav" role="tablist" aria-label="布局页签">
      <button
        v-for="(item, index) in items"
        :id="tabId(index)"
        :key="item.id"
        class="designer-tabs-frame__tab"
        :class="{ 'is-active': item.slotCode === modelValue }"
        type="button"
        role="tab"
        :aria-controls="panelId"
        :aria-selected="item.slotCode === modelValue"
        :tabindex="item.slotCode === modelValue ? 0 : -1"
        @click.stop="selectSlot(item.slotCode)"
        @keydown.left.prevent="selectRelative(index, -1)"
        @keydown.right.prevent="selectRelative(index, 1)"
        @keydown.home.prevent="selectRelative(0, 0)"
        @keydown.end.prevent="selectRelative(items.length - 1, 0)"
      >
        {{ item.label }}
      </button>
    </div>

    <div
      v-if="activeItem"
      :id="panelId"
      class="designer-tabs-frame__content"
      role="tabpanel"
      :aria-labelledby="tabId(activeIndex)"
    >
      <slot :item="activeItem" />
    </div>
    <div v-else class="designer-tabs-frame__empty">暂无页签</div>
  </section>
</template>

<script setup lang="ts">
import { computed, useId } from 'vue'
import type { DesignerLayoutSlot } from '@daxiangme/form-core'

defineOptions({ name: 'DesignerTabsFrame' })

const props = defineProps<{
  modelValue: string
  items: DesignerLayoutSlot[]
  type?: 'card' | 'border-card'
}>()

const emit = defineEmits<{
  'update:modelValue': [slotCode: string]
}>()

const frameId = useId()
const activeIndex = computed(() =>
  props.items.findIndex((item) => item.slotCode === props.modelValue),
)
const activeItem = computed(() => props.items[activeIndex.value])
const panelId = `${frameId}-panel`

function tabId(index: number): string {
  return `${frameId}-tab-${index}`
}

function selectSlot(slotCode: string): void {
  if (slotCode !== props.modelValue) emit('update:modelValue', slotCode)
}

function selectRelative(currentIndex: number, offset: number): void {
  if (props.items.length === 0) return
  const nextIndex = Math.min(props.items.length - 1, Math.max(0, currentIndex + offset))
  selectSlot(props.items[nextIndex]?.slotCode ?? '')
}
</script>

<style scoped>
.designer-tabs-frame {
  min-width: 0;
  padding: var(--daxiang-form-space-2);
}

.designer-tabs-frame__nav {
  display: flex;
  min-width: 0;
  align-items: end;
  overflow-x: auto;
  border-bottom: 1px solid var(--el-border-color-light);
}

.designer-tabs-frame__tab {
  position: relative;
  flex: 0 0 auto;
  min-height: 34px;
  padding: 0 var(--daxiang-form-space-3);
  color: var(--el-text-color-regular);
  background: transparent;
  border: 0;
  cursor: pointer;
  font: inherit;
  transition:
    color var(--el-transition-duration-fast),
    background-color var(--el-transition-duration-fast);
}

.designer-tabs-frame__tab:hover,
.designer-tabs-frame__tab:focus-visible {
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  outline: none;
}

.designer-tabs-frame__tab.is-active {
  color: var(--el-color-primary);
  font-weight: 500;
}

.designer-tabs-frame__tab.is-active::after {
  position: absolute;
  right: var(--daxiang-form-space-2);
  bottom: -1px;
  left: var(--daxiang-form-space-2);
  height: 2px;
  background: var(--el-color-primary);
  content: '';
}

.designer-tabs-frame.is-card .designer-tabs-frame__tab,
.designer-tabs-frame.is-border-card .designer-tabs-frame__tab {
  border: 1px solid transparent;
  border-bottom: 0;
}

.designer-tabs-frame.is-card .designer-tabs-frame__tab.is-active,
.designer-tabs-frame.is-border-card .designer-tabs-frame__tab.is-active {
  background: var(--el-bg-color);
  border-color: var(--el-border-color-light);
}

.designer-tabs-frame.is-card .designer-tabs-frame__tab.is-active::after,
.designer-tabs-frame.is-border-card .designer-tabs-frame__tab.is-active::after {
  display: none;
}

.designer-tabs-frame.is-border-card .designer-tabs-frame__content {
  padding: var(--daxiang-form-space-2);
  border: 1px solid var(--el-border-color-light);
  border-top: 0;
}

.designer-tabs-frame__content {
  min-width: 0;
  padding-top: var(--daxiang-form-space-2);
}

.designer-tabs-frame__empty {
  min-height: 44px;
  padding: var(--daxiang-form-space-3);
  color: var(--el-text-color-secondary);
  text-align: center;
}

@media (prefers-reduced-motion: reduce) {
  .designer-tabs-frame__tab {
    transition: none;
  }
}
</style>
