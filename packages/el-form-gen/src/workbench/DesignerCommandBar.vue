<template>
  <header class="designer-command-bar" :class="`is-density-${density}`">
    <div v-if="$slots.leading" class="designer-command-bar__leading">
      <slot name="leading" />
    </div>
    <div v-if="density !== 'minimal'" class="designer-command-bar__tools">
      <ElSelect
        v-if="density === 'full'"
        class="designer-command-bar__device"
        :model-value="viewport"
        aria-label="画布视口"
        @update:model-value="changeViewport"
      >
        <ElOption v-for="option in viewportOptions" :key="option.value" v-bind="option" />
      </ElSelect>
      <ElButtonGroup v-if="density === 'full'">
        <ElTooltip content="显示或隐藏栅格">
          <FormButton
            :type="gridVisible ? 'primary' : 'default'"
            plain
            aria-label="切换栅格"
            icon="ri:grid-line"
            @click="emit('toggle-grid')"
          />
        </ElTooltip>
        <ElTooltip content="缩小画布">
          <FormButton
            :disabled="zoom <= 50"
            aria-label="缩小画布"
            icon="ri:zoom-out-line"
            @click="emit('update:zoom', zoom - 10)"
          />
        </ElTooltip>
        <ElButton
          class="designer-command-bar__zoom"
          aria-label="恢复 100%"
          @click="emit('update:zoom', 100)"
        >
          {{ zoom }}%
        </ElButton>
        <ElTooltip content="放大画布">
          <FormButton
            :disabled="zoom >= 150"
            aria-label="放大画布"
            icon="ri:zoom-in-line"
            @click="emit('update:zoom', zoom + 10)"
          />
        </ElTooltip>
        <ElTooltip content="适应可用宽度">
          <FormButton aria-label="适应可用宽度" icon="ri:aspect-ratio-line" @click="emit('fit')" />
        </ElTooltip>
        <ElTooltip content="等分当前容器字段">
          <FormButton
            aria-label="等分当前容器字段"
            icon="ri:layout-column-line"
            @click="emit('equal-layout')"
          />
        </ElTooltip>
      </ElButtonGroup>
      <ElButtonGroup>
        <ElTooltip content="撤销（⌘Z）">
          <FormButton
            :disabled="!canUndo"
            aria-label="撤销"
            icon="ri:arrow-go-back-line"
            @click="emit('undo')"
          />
        </ElTooltip>
        <ElTooltip content="重做（⇧⌘Z）">
          <FormButton
            :disabled="!canRedo"
            aria-label="重做"
            icon="ri:arrow-go-forward-line"
            @click="emit('redo')"
          />
        </ElTooltip>
      </ElButtonGroup>
    </div>
    <div class="designer-command-bar__actions">
      <ElSpace :size="density === 'minimal' ? 8 : 12">
        <FormButton icon="ri:eye-line" aria-label="预览" @click="emit('preview')">
          <span v-if="density !== 'minimal'">预览</span>
        </FormButton>
        <FormButton type="primary" icon="ri:save-3-line" aria-label="保存" @click="emit('save')">
          <span v-if="density !== 'minimal'">保存</span>
        </FormButton>
        <ElDropdown trigger="click" @command="handleMoreCommand">
          <FormButton aria-label="更多设计操作" icon="ri:more-fill" />
          <template #dropdown>
            <ElDropdownMenu>
              <template v-if="density !== 'full'">
                <ElDropdownItem
                  v-for="option in viewportOptions"
                  :key="option.value"
                  :command="`viewport:${option.value}`"
                  :class="{ 'is-active': viewport === option.value }"
                >
                  <DxSvgIcon icon="ri:aspect-ratio-line" />视口 · {{ option.label }}
                </ElDropdownItem>
                <ElDropdownItem command="toggle-grid">
                  <DxSvgIcon icon="ri:grid-line" />{{ gridVisible ? '隐藏栅格' : '显示栅格' }}
                </ElDropdownItem>
                <ElDropdownItem command="zoom-out" :disabled="zoom <= 50">
                  <DxSvgIcon icon="ri:zoom-out-line" />缩小画布
                </ElDropdownItem>
                <ElDropdownItem command="reset-zoom">
                  <DxSvgIcon icon="ri:aspect-ratio-line" />恢复 100%
                </ElDropdownItem>
                <ElDropdownItem command="zoom-in" :disabled="zoom >= 150">
                  <DxSvgIcon icon="ri:zoom-in-line" />放大画布
                </ElDropdownItem>
                <ElDropdownItem command="fit">
                  <DxSvgIcon icon="ri:aspect-ratio-line" />适应可用宽度
                </ElDropdownItem>
                <ElDropdownItem command="equal-layout">
                  <DxSvgIcon icon="ri:layout-column-line" />等分当前容器字段
                </ElDropdownItem>
              </template>
              <template v-if="density === 'minimal'">
                <ElDropdownItem command="undo" :disabled="!canUndo">
                  <DxSvgIcon icon="ri:arrow-go-back-line" />撤销
                </ElDropdownItem>
                <ElDropdownItem command="redo" :disabled="!canRedo">
                  <DxSvgIcon icon="ri:arrow-go-forward-line" />重做
                </ElDropdownItem>
              </template>
              <ElDropdownItem command="import" :divided="density !== 'full'">
                <DxSvgIcon icon="ri:upload-2-line" />导入 JSON
              </ElDropdownItem>
              <ElDropdownItem command="export">
                <DxSvgIcon icon="ri:download-2-line" />导出 JSON
              </ElDropdownItem>
              <ElDropdownItem command="schema">
                <DxSvgIcon icon="ri:code-s-slash-line" />Schema 工具
              </ElDropdownItem>
              <ElDropdownItem command="batch-defaults">
                <DxSvgIcon icon="ri:list-settings-line" />批量默认值
              </ElDropdownItem>
              <ElDropdownItem command="print">
                <DxSvgIcon icon="ri:printer-line" />打印预览
              </ElDropdownItem>
              <ElDropdownItem divided command="clear">
                <DxSvgIcon icon="ri:delete-bin-line" />清空设计
              </ElDropdownItem>
            </ElDropdownMenu>
          </template>
        </ElDropdown>
      </ElSpace>
    </div>
  </header>
</template>

<script setup lang="ts">
import DxSvgIcon from '../infrastructure/FormIcon.vue'
import FormButton from '../infrastructure/FormButton.vue'
import type { DesignerCanvasViewportPreset } from './workbench-preferences'

/** 顶栏按设计器实际宽度收纳次要操作，避免窄屏裁切。 */
export type DesignerCommandBarDensity = 'full' | 'compact' | 'minimal'

const viewportOptions: { label: string; value: DesignerCanvasViewportPreset }[] = [
  { label: '自适应 PC', value: 'FIT' },
  { label: 'PC · 1920', value: 'PC_1920' },
  { label: 'PC · 1440', value: 'PC_1440' },
  { label: 'PC · 1280', value: 'PC_1280' },
  { label: 'PC · 1024', value: 'PC_1024' },
  { label: '移动 · 440', value: 'MOBILE_440' },
  { label: '移动 · 375', value: 'MOBILE_375' },
]

defineOptions({ name: 'DesignerCommandBar' })

defineSlots<{
  /** 顶栏左侧宿主区；窄屏收纳工具按钮时仍保留。 */
  leading?: () => unknown
}>()

const props = withDefaults(
  defineProps<{
    canUndo: boolean
    canRedo: boolean
    viewport: DesignerCanvasViewportPreset
    zoom: number
    gridVisible: boolean
    /** 顶栏密度；由工作区宽度计算，不跟浏览器窗口走。 */
    density?: DesignerCommandBarDensity
  }>(),
  { density: 'full' },
)
const emit = defineEmits<{
  'update:viewport': [viewport: DesignerCanvasViewportPreset]
  'update:zoom': [zoom: number]
  'toggle-grid': []
  fit: []
  'equal-layout': []
  'batch-defaults': []
  schema: []
  print: []
  undo: []
  redo: []
  import: []
  export: []
  clear: []
  preview: []
  save: []
}>()

function changeViewport(value: string | number | boolean | undefined): void {
  if (
    typeof value === 'string' &&
    ['FIT', 'PC_1920', 'PC_1440', 'PC_1280', 'PC_1024', 'MOBILE_440', 'MOBILE_375'].includes(value)
  ) {
    emit('update:viewport', value as DesignerCanvasViewportPreset)
  }
}

function handleMoreCommand(command: string | number | object): void {
  if (typeof command !== 'string') return
  if (command.startsWith('viewport:')) {
    changeViewport(command.slice('viewport:'.length))
    return
  }
  if (command === 'toggle-grid') emit('toggle-grid')
  if (command === 'zoom-out') emit('update:zoom', props.zoom - 10)
  if (command === 'zoom-in') emit('update:zoom', props.zoom + 10)
  if (command === 'reset-zoom') emit('update:zoom', 100)
  if (command === 'fit') emit('fit')
  if (command === 'equal-layout') emit('equal-layout')
  if (command === 'undo') emit('undo')
  if (command === 'redo') emit('redo')
  if (command === 'import') emit('import')
  if (command === 'export') emit('export')
  if (command === 'schema') emit('schema')
  if (command === 'batch-defaults') emit('batch-defaults')
  if (command === 'print') emit('print')
  if (command === 'clear') emit('clear')
}
</script>

<style scoped>
.designer-command-bar {
  display: grid;
  min-width: 0;
  min-height: 54px;
  flex: 0 0 auto;
  align-items: center;
  padding: 0 var(--daxiang-form-space-3);
  background: var(--el-bg-color);
  border-bottom: 1px solid var(--el-border-color-lighter);
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  gap: var(--daxiang-form-space-3);
}

.designer-command-bar.is-density-compact {
  grid-template-columns: minmax(0, 1fr) auto auto;
}

.designer-command-bar.is-density-minimal {
  grid-template-columns: minmax(0, 1fr) auto;
}

.designer-command-bar__leading,
.designer-command-bar__tools,
.designer-command-bar__actions {
  display: flex;
  min-width: 0;
  align-items: center;
}

.designer-command-bar__leading {
  justify-self: stretch;
}

.designer-command-bar__tools {
  justify-content: center;
  gap: var(--daxiang-form-space-2);
}

.designer-command-bar__actions {
  justify-content: flex-end;
}

.designer-command-bar.is-density-minimal .designer-command-bar__actions {
  justify-self: end;
}

.designer-command-bar__device {
  width: 138px;
}

.designer-command-bar__zoom {
  min-width: 58px;
  font-variant-numeric: tabular-nums;
}

.designer-command-bar :deep(.el-dropdown-menu__item.is-active) {
  color: var(--el-color-primary);
}
</style>
