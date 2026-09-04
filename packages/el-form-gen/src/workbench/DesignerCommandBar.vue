<template>
  <header class="designer-command-bar">
    <div class="designer-command-bar__leading">
      <slot name="leading" />
      <span class="designer-command-bar__title" :title="documentName">
        {{ documentName }}
        <i v-if="dirty" aria-label="存在未保存修改" />
      </span>
    </div>
    <div class="designer-command-bar__tools">
      <ElSelect
        class="designer-command-bar__device"
        :model-value="viewport"
        aria-label="画布视口"
        @update:model-value="changeViewport"
      >
        <ElOption label="自适应 PC" value="FIT" />
        <ElOption label="PC · 1920" value="PC_1920" />
        <ElOption label="PC · 1440" value="PC_1440" />
        <ElOption label="PC · 1280" value="PC_1280" />
        <ElOption label="PC · 1024" value="PC_1024" />
        <ElOption label="移动 · 440" value="MOBILE_440" />
        <ElOption label="移动 · 375" value="MOBILE_375" />
      </ElSelect>
      <ElButtonGroup>
        <ElTooltip content="显示或隐藏栅格">
          <ElButton
            :type="gridVisible ? 'primary' : 'default'"
            plain
            aria-label="切换栅格"
            @click="emit('toggle-grid')"
          >
            <DxSvgIcon icon="ri:grid-line" />
          </ElButton>
        </ElTooltip>
        <ElTooltip content="缩小画布">
          <ElButton
            :disabled="zoom <= 50"
            aria-label="缩小画布"
            @click="emit('update:zoom', zoom - 10)"
          >
            <DxSvgIcon icon="ri:zoom-out-line" />
          </ElButton>
        </ElTooltip>
        <ElButton
          class="designer-command-bar__zoom"
          aria-label="恢复 100%"
          @click="emit('update:zoom', 100)"
        >
          {{ zoom }}%
        </ElButton>
        <ElTooltip content="放大画布">
          <ElButton
            :disabled="zoom >= 150"
            aria-label="放大画布"
            @click="emit('update:zoom', zoom + 10)"
          >
            <DxSvgIcon icon="ri:zoom-in-line" />
          </ElButton>
        </ElTooltip>
        <ElTooltip content="适应可用宽度">
          <ElButton aria-label="适应可用宽度" @click="emit('fit')">
            <DxSvgIcon icon="ri:aspect-ratio-line" />
          </ElButton>
        </ElTooltip>
        <ElTooltip content="等分当前容器字段">
          <ElButton aria-label="等分当前容器字段" @click="emit('equal-layout')">
            <DxSvgIcon icon="ri:layout-column-line" />
          </ElButton>
        </ElTooltip>
      </ElButtonGroup>
      <ElButtonGroup>
        <ElTooltip content="撤销（⌘Z）">
          <ElButton :disabled="!canUndo" aria-label="撤销" @click="emit('undo')">
            <DxSvgIcon icon="ri:arrow-go-back-line" />
          </ElButton>
        </ElTooltip>
        <ElTooltip content="重做（⇧⌘Z）">
          <ElButton :disabled="!canRedo" aria-label="重做" @click="emit('redo')">
            <DxSvgIcon icon="ri:arrow-go-forward-line" />
          </ElButton>
        </ElTooltip>
      </ElButtonGroup>
    </div>
    <div class="designer-command-bar__actions">
      <ElSpace :size="12">
        <ElButton @click="emit('preview')"><DxSvgIcon icon="ri:eye-line" />预览</ElButton>
        <ElButton type="primary" @click="emit('save')"
          ><DxSvgIcon icon="ri:save-3-line" />保存</ElButton
        >
        <ElDropdown trigger="click" @command="handleMoreCommand">
          <ElButton aria-label="更多设计操作"><DxSvgIcon icon="ri:more-fill" /></ElButton>
          <template #dropdown>
            <ElDropdownMenu>
              <ElDropdownItem command="import"
                ><DxSvgIcon icon="ri:upload-2-line" />导入 JSON</ElDropdownItem
              >
              <ElDropdownItem command="export"
                ><DxSvgIcon icon="ri:download-2-line" />导出 JSON</ElDropdownItem
              >
              <ElDropdownItem command="schema"
                ><DxSvgIcon icon="ri:code-s-slash-line" />Schema 工具</ElDropdownItem
              >
              <ElDropdownItem command="batch-defaults"
                ><DxSvgIcon icon="ri:list-settings-line" />批量默认值</ElDropdownItem
              >
              <ElDropdownItem command="print"
                ><DxSvgIcon icon="ri:printer-line" />打印预览</ElDropdownItem
              >
              <ElDropdownItem divided command="clear"
                ><DxSvgIcon icon="ri:delete-bin-line" />清空设计</ElDropdownItem
              >
            </ElDropdownMenu>
          </template>
        </ElDropdown>
      </ElSpace>
    </div>
  </header>
</template>

<script setup lang="ts">
import DxSvgIcon from '../infrastructure/FormIcon.vue'
import type { DesignerCanvasViewportPreset } from './workbench-preferences'

defineOptions({ name: 'DesignerCommandBar' })

defineProps<{
  documentName: string
  dirty: boolean
  canUndo: boolean
  canRedo: boolean
  viewport: DesignerCanvasViewportPreset
  zoom: number
  gridVisible: boolean
}>()
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

.designer-command-bar__device {
  width: 138px;
}

.designer-command-bar__zoom {
  min-width: 58px;
  font-variant-numeric: tabular-nums;
}

.designer-command-bar__title {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  overflow: hidden;
  font-weight: 600;
  gap: var(--daxiang-form-space-2);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.designer-command-bar__title i {
  width: 7px;
  height: 7px;
  flex: 0 0 auto;
  background: var(--el-color-warning);
  border-radius: 50%;
}

@media (width <= 1080px) {
  .designer-command-bar {
    grid-template-columns: minmax(0, 1fr) minmax(0, auto);
    min-height: 96px;
  }

  .designer-command-bar__tools {
    grid-column: 1 / -1;
    grid-row: 2;
    justify-self: center;
  }
}
</style>
