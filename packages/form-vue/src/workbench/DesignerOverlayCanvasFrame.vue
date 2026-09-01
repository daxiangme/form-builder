<template>
  <section
    class="designer-overlay-canvas-frame"
    :class="`is-${module.kind.toLowerCase()}`"
    @click.self="emit('select-frame')"
  >
    <article
      class="designer-overlay-canvas-frame__panel"
      :class="module.kind === 'DIALOG' ? designerDialogRadiusClass(module.radius) : undefined"
      :style="panelStyle"
      @click.self="emit('select-frame')"
    >
      <header class="designer-overlay-canvas-frame__header" @click="emit('select-frame')">
        <strong>{{ module.name }}</strong>
        <div aria-hidden="true">
          <span><DxSvgIcon icon="ri:fullscreen-line" /></span>
          <span><DxSvgIcon icon="ri:close-line" /></span>
        </div>
      </header>
      <div class="designer-overlay-canvas-frame__content" @click.self="emit('select-frame')">
        <slot />
      </div>
      <footer class="designer-overlay-canvas-frame__footer" aria-hidden="true">
        <ElButton tabindex="-1">取消</ElButton>
        <ElButton type="primary" tabindex="-1">确认</ElButton>
      </footer>
    </article>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { CSSProperties } from 'vue'
import DxSvgIcon from '../infrastructure/FormIcon.vue'
import { designerDialogRadiusClass } from '@daxiangme/form-core'
import type { DesignerOverlayModule } from '@daxiangme/form-core'

defineOptions({ name: 'DesignerOverlayCanvasFrame' })

const props = defineProps<{ module: DesignerOverlayModule }>()
const emit = defineEmits<{ 'select-frame': [] }>()

/**
 * 将持久化模块宽度作为设计外壳的最大宽度。
 *
 * 可用空间不足时外壳占满内容区，空间充足时再按配置上限居中展示，
 * 避免窄画布被固定像素宽度挤出，也避免宽画布仅在单侧留下大块空白。
 */
const panelStyle = computed<CSSProperties>(() => ({
  width: '100%',
  maxWidth: `${props.module.width}px`,
}))
</script>

<style scoped>
.designer-overlay-canvas-frame {
  box-sizing: border-box;
  display: flex;
  width: 100%;
  min-height: var(--designer-canvas-min-height, 640px);
  padding: var(--daxiang-form-space-2);
  background: color-mix(in srgb, var(--el-fill-color-light) 72%, transparent);
}

.designer-overlay-canvas-frame.is-dialog {
  align-items: center;
  justify-content: center;
}

.designer-overlay-canvas-frame.is-drawer {
  align-items: stretch;
  justify-content: center;
  padding: 0;
}

.designer-overlay-canvas-frame__panel {
  box-sizing: border-box;
  display: flex;
  max-width: 100%;
  min-height: calc(var(--designer-canvas-min-height, 640px) - 16px);
  min-width: 0;
  flex-direction: column;
  overflow: hidden;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-light);
  box-shadow: var(--el-box-shadow-light);
}

.is-dialog .designer-overlay-canvas-frame__panel {
  border-radius: var(--el-border-radius-base);
}

.is-drawer .designer-overlay-canvas-frame__panel {
  min-height: var(--designer-canvas-min-height, 640px);
  border-top: 0;
  border-right: 0;
  border-bottom: 0;
}

.designer-overlay-canvas-frame__header,
.designer-overlay-canvas-frame__footer {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  padding: 0 var(--daxiang-form-space-3);
  background: var(--el-bg-color);
}

.designer-overlay-canvas-frame__header {
  min-height: 54px;
  justify-content: space-between;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.designer-overlay-canvas-frame__header > div {
  display: flex;
  color: var(--el-text-color-secondary);
  gap: var(--daxiang-form-space-3);
  pointer-events: none;
}

.designer-overlay-canvas-frame__header span {
  display: inline-flex;
  width: 24px;
  height: 24px;
  align-items: center;
  justify-content: center;
}

.designer-overlay-canvas-frame__content {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1 1 0;
  padding: var(--daxiang-form-space-3);
  overflow: hidden auto;
  overscroll-behavior: contain;
  background: var(--el-bg-color);
}

.designer-overlay-canvas-frame__footer {
  min-height: 60px;
  justify-content: flex-end;
  border-top: 1px solid var(--el-border-color-lighter);
  gap: var(--daxiang-form-space-2);
  pointer-events: none;
}

@media (prefers-reduced-motion: reduce) {
  .designer-overlay-canvas-frame * {
    scroll-behavior: auto !important;
  }
}
</style>
