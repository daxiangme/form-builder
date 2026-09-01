<template>
  <section class="designer-module-manager">
    <header>
      <div>
        <strong>模块管理</strong>
        <small>主体之外可设计弹窗或抽屉，由声明式事件打开。</small>
      </div>
    </header>
    <div class="designer-module-manager__scroll">
      <button
        type="button"
        class="designer-module-manager__item"
        :class="{ 'is-active': activeViewCode === 'main' }"
        @click="emit('select', 'main')"
      >
        <DxSvgIcon icon="ri:file-list-3-line" />
        <span><strong>主体</strong><small>主表单</small></span>
        <DxSvgIcon v-if="activeViewCode === 'main'" icon="ri:check-line" />
      </button>
      <article
        v-for="module in document.uiSchema.overlays"
        :key="module.id"
        class="designer-module-manager__module"
        :class="{ 'is-active': activeViewCode === module.code }"
      >
        <button type="button" @click="emit('select', module.code)">
          <DxSvgIcon
            :icon="module.kind === 'DIALOG' ? 'ri:window-line' : 'ri:layout-right-2-line'"
          />
          <span
            ><strong>{{ module.name }}</strong
            ><small>{{ module.code }}</small></span
          >
          <DxSvgIcon v-if="activeViewCode === module.code" icon="ri:check-line" />
        </button>
        <div>
          <ElTooltip content="复制模块">
            <ElButton
              text
              circle
              aria-label="复制模块"
              @click.stop="emit('duplicate', module.code)"
            >
              <DxSvgIcon icon="ri:file-copy-line" />
            </ElButton>
          </ElTooltip>
          <ElTooltip content="删除模块">
            <ElButton
              text
              circle
              type="danger"
              aria-label="删除模块"
              @click.stop="emit('delete', module.code)"
            >
              <DxSvgIcon icon="ri:delete-bin-line" />
            </ElButton>
          </ElTooltip>
        </div>
      </article>
      <ElEmpty
        v-if="document.uiSchema.overlays.length === 0"
        description="暂无弹窗或抽屉模块"
        :image-size="56"
      />
      <footer class="designer-module-manager__add">
        <ElDropdown trigger="click" @command="addModule">
          <ElButton text>
            <DxSvgIcon icon="ri:add-line" />
            添加模块
            <DxSvgIcon icon="ri:arrow-down-s-line" />
          </ElButton>
          <template #dropdown>
            <ElDropdownMenu>
              <ElDropdownItem command="DIALOG">
                <DxSvgIcon icon="ri:window-line" />弹窗
              </ElDropdownItem>
              <ElDropdownItem command="DRAWER">
                <DxSvgIcon icon="ri:layout-right-2-line" />抽屉
              </ElDropdownItem>
            </ElDropdownMenu>
          </template>
        </ElDropdown>
      </footer>
    </div>
  </section>
</template>

<script setup lang="ts">
import DxSvgIcon from '../infrastructure/FormIcon.vue'
import type { DesignerDocument, DesignerOverlayModule } from '@daxiangme/form-core'

defineOptions({ name: 'DesignerModuleManager' })

defineProps<{ document: DesignerDocument; activeViewCode: string }>()
const emit = defineEmits<{
  select: [viewCode: string]
  add: [kind: DesignerOverlayModule['kind']]
  duplicate: [moduleCode: string]
  delete: [moduleCode: string]
}>()

function addModule(command: string | number | object): void {
  if (command === 'DIALOG' || command === 'DRAWER') emit('add', command)
}
</script>

<style scoped>
.designer-module-manager {
  display: flex;
  width: 100%;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
}

.designer-module-manager > header {
  display: flex;
  padding: var(--daxiang-form-space-3);
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.designer-module-manager > header > div,
.designer-module-manager__item span,
.designer-module-manager__module button span {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.designer-module-manager small {
  color: var(--el-text-color-secondary);
  font-size: 11px;
}

.designer-module-manager__scroll {
  min-height: 0;
  flex: 1 1 0;
  padding: var(--daxiang-form-space-2);
  overflow: hidden auto;
}

.designer-module-manager__item,
.designer-module-manager__module > button {
  display: grid;
  width: 100%;
  min-width: 0;
  align-items: center;
  padding: var(--daxiang-form-space-2);
  color: var(--el-text-color-regular);
  text-align: left;
  background: transparent;
  border: 0;
  border-radius: var(--el-border-radius-base);
  cursor: pointer;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: var(--daxiang-form-space-2);
}

.designer-module-manager__item:hover,
.designer-module-manager__item.is-active,
.designer-module-manager__module.is-active > button {
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}

.designer-module-manager__module {
  display: grid;
  align-items: center;
  border-bottom: 1px solid var(--el-border-color-extra-light);
  grid-template-columns: minmax(0, 1fr) auto;
}

.designer-module-manager__module > div {
  display: flex;
}

.designer-module-manager__add {
  padding-top: var(--daxiang-form-space-2);
  border-top: 1px solid var(--el-border-color-extra-light);
}

.designer-module-manager__add .el-button {
  justify-content: flex-start;
  padding-inline: var(--daxiang-form-space-2);
}
</style>
