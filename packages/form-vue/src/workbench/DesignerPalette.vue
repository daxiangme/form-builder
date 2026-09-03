<template>
  <section class="designer-palette">
    <div class="designer-palette__search">
      <ElInput v-model="keyword" clearable placeholder="搜索组件">
        <template #prefix><DxSvgIcon icon="ri:search-line" /></template>
      </ElInput>
    </div>
    <div class="designer-palette__scroll">
      <section v-if="!keyword" class="designer-palette__templates-section">
        <header>
          <span>常用模板</span>
          <small>快速开始</small>
        </header>
        <div class="designer-palette__templates">
          <button type="button" @click="emit('apply-template', 'TWO_COLUMN')">
            <DxSvgIcon icon="ri:layout-column-line" />双列表单
          </button>
          <button type="button" @click="emit('apply-template', 'SECTIONED')">
            <DxSvgIcon icon="ri:layout-row-line" />分组表单
          </button>
          <button type="button" @click="emit('apply-template', 'SHOWCASE')">
            <DxSvgIcon icon="ri:apps-2-line" />能力示例
          </button>
        </div>
      </section>

      <ElCollapse v-model="expandedGroups" class="designer-palette__groups">
        <ElCollapseItem v-for="group in groups" :key="group.code" :name="group.code">
          <template #title>
            <span class="designer-palette__group-title"
              >{{ group.label }}<small>{{ group.items.length }}</small></span
            >
          </template>
          <div class="designer-palette__items">
            <ElTooltip
              v-for="item in group.items"
              :key="item.componentType"
              :content="componentTooltip(item)"
              popper-class="designer-palette-tooltip"
              placement="right"
            >
              <button
                type="button"
                :aria-label="componentAriaLabel(item)"
                :draggable="item.availability !== 'UNAVAILABLE'"
                :disabled="item.availability === 'UNAVAILABLE'"
                :class="{ 'is-conditional': item.availability === 'CONDITIONAL' }"
                @click="emit('add', item.componentType)"
                @dragstart="beginDrag($event, item.componentType)"
              >
                <DxSvgIcon :icon="item.icon" />
                <span>{{ item.name }}</span>
                <span
                  v-if="item.availability !== 'AVAILABLE'"
                  class="designer-palette__status"
                  :class="`is-${item.availability.toLowerCase()}`"
                  aria-hidden="true"
                >
                  <DxSvgIcon icon="ri:plug-line" />
                </span>
              </button>
            </ElTooltip>
          </div>
        </ElCollapseItem>
      </ElCollapse>
      <ElEmpty
        v-if="groups.every((group) => group.items.length === 0)"
        description="没有匹配的组件"
        :image-size="48"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import DxSvgIcon from '../infrastructure/FormIcon.vue'
import { resolveDesignerCatalogComponents } from '@daxiangme/form-core'
import type {
  DesignerComponentGroup,
  DesignerComponentRegistration,
  FormDesignerCatalogs,
} from '@daxiangme/form-core'

defineOptions({ name: 'DesignerPalette' })

const props = defineProps<{
  catalogs?: FormDesignerCatalogs
}>()
const emit = defineEmits<{
  add: [componentType: string]
  'apply-template': [templateCode: 'TWO_COLUMN' | 'SECTIONED' | 'SHOWCASE']
}>()
const keyword = ref('')
const expandedGroups = ref<DesignerComponentGroup[]>([
  'LAYOUT',
  'BASIC',
  'ADVANCED',
  'DYNAMIC',
  'SUBTABLE',
  'AUXILIARY',
])
const GROUPS: Array<{ code: DesignerComponentGroup; label: string }> = [
  { code: 'LAYOUT', label: '布局组件' },
  { code: 'BASIC', label: '基础组件' },
  { code: 'ADVANCED', label: '高级组件' },
  { code: 'DYNAMIC', label: '动态组件' },
  { code: 'SUBTABLE', label: '子表组件' },
  { code: 'AUXILIARY', label: '辅助组件' },
]
const catalogComponents = computed(
  () => resolveDesignerCatalogComponents(props.catalogs).components,
)
const groups = computed(() => {
  const query = keyword.value.trim().toLowerCase()
  return GROUPS.map((group) => ({
    ...group,
    items: catalogComponents.value.filter(
      (item) =>
        item.group === group.code &&
        (!query || item.name.includes(query) || item.componentType.includes(query)),
    ),
  }))
})

/** 使用稳定 MIME 向画布传递组件编码，不把临时节点写入 Schema。 */
function beginDrag(event: DragEvent, componentType: string): void {
  event.dataTransfer?.setData('application/x-daxiang-form-component', componentType)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy'
}

/** 说明组件在静态设计器中的可用状态及缺失能力。 */
function componentTooltip(item: DesignerComponentRegistration): string {
  if (item.availability === 'CONDITIONAL') {
    return `${item.name} · 需接入：${item.unavailableReason}`
  }
  if (item.availability === 'UNAVAILABLE') {
    return `${item.name} · 不可用：${item.unavailableReason}`
  }
  return `${item.name}：点击或拖入画布`
}

/** 为键盘和读屏用户补充与视觉徽标一致的状态说明。 */
function componentAriaLabel(item: DesignerComponentRegistration): string {
  if (item.availability === 'CONDITIONAL') return `${item.name}，需接入业务能力`
  if (item.availability === 'UNAVAILABLE') return `${item.name}，当前不可用`
  return item.name
}
</script>

<style scoped>
.designer-palette {
  display: flex;
  min-height: 0;
  flex: 1 1 0;
  flex-direction: column;
  padding-block-start: var(--daxiang-form-space-3);
}

.designer-palette__search {
  padding-inline: var(--daxiang-form-space-3);
}

.designer-palette__scroll {
  min-height: 0;
  flex: 1 1 0;
  padding: var(--daxiang-form-space-3) var(--daxiang-form-space-2) 0 var(--daxiang-form-space-3);
  overflow: auto;
}

.designer-palette__templates-section > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--daxiang-form-space-2);
  color: var(--el-text-color-primary);
  font-weight: 600;
}

.designer-palette__templates-section > header small,
.designer-palette__group-title small {
  color: var(--el-text-color-secondary);
  font-weight: 400;
}

.designer-palette__groups {
  margin-top: var(--daxiang-form-space-3);
  border: 0;
}

.designer-palette__groups :deep(.el-collapse-item__header) {
  height: 40px;
  border: 0;
  font-weight: 600;
}

.designer-palette__groups :deep(.el-collapse-item__wrap) {
  border: 0;
}

.designer-palette__groups :deep(.el-collapse-item__content) {
  padding-bottom: var(--daxiang-form-space-3);
}

.designer-palette__group-title {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: space-between;
  padding-right: var(--daxiang-form-space-2);
}

.designer-palette__items,
.designer-palette__templates {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--daxiang-form-space-1);
}

.designer-palette__items button,
.designer-palette__templates button {
  position: relative;
  display: flex;
  min-width: 0;
  min-height: 54px;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  padding: var(--daxiang-form-space-1);
  color: var(--el-text-color-regular);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--el-border-radius-base);
  cursor: grab;
  gap: 2px;
  font: inherit;
  font-size: 12px;
  transition:
    color var(--el-transition-duration-fast),
    background-color var(--el-transition-duration-fast),
    border-color var(--el-transition-duration-fast);
}

.designer-palette__items button {
  min-height: 54px;
}

.designer-palette__items button > :deep(svg),
.designer-palette__templates button > :deep(svg) {
  font-size: 18px;
}

.designer-palette__items button:hover:not(:disabled),
.designer-palette__templates button:hover {
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  border-color: transparent;
}

.designer-palette__items button:disabled {
  color: var(--el-text-color-disabled);
  cursor: not-allowed;
  opacity: 0.7;
}

.designer-palette__status {
  position: absolute;
  top: 4px;
  right: 4px;
  display: inline-flex;
  width: 16px;
  height: 16px;
  align-items: center;
  justify-content: center;
  color: var(--el-color-warning);
  font-size: 15px;
}

.designer-palette__status.is-unavailable {
  color: var(--el-text-color-disabled);
}

:global(.designer-palette-tooltip) {
  max-width: 280px;
  line-height: 1.6;
  white-space: normal;
  overflow-wrap: anywhere;
}

@media (width <= 1365px) {
  .designer-palette {
    padding-block-start: var(--daxiang-form-space-2);
  }

  .designer-palette__search {
    padding-inline: var(--daxiang-form-space-2);
  }

  .designer-palette__scroll {
    padding-inline-start: var(--daxiang-form-space-2);
  }

  .designer-palette__items,
  .designer-palette__templates {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (prefers-reduced-motion: reduce) {
  .designer-palette__items button,
  .designer-palette__templates button {
    transition: none;
  }
}
</style>
