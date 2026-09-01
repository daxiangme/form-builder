<template>
  <div
    class="dx-step-progress"
    :class="[
      `is-${direction}`,
      `is-finish-${finishStatus}`,
      { 'is-compact': compact, 'is-disabled': disabled },
    ]"
  >
    <ol v-if="items.length" class="dx-step-progress__list" aria-label="步骤进度">
      <li
        v-for="(item, index) in items"
        :key="String(item.value)"
        class="dx-step-progress__item"
        :class="stepState(index)"
      >
        <button
          type="button"
          class="dx-step-progress__trigger"
          :disabled="disabled || item.disabled"
          :aria-current="index === activeIndex ? 'step' : undefined"
          @click="selectStep(item)"
        >
          <span class="dx-step-progress__marker" aria-hidden="true">
            <DxSvgIcon v-if="index < activeIndex && completedIcon" :icon="completedIcon" />
            <span v-else>{{ index + 1 }}</span>
          </span>
          <span class="dx-step-progress__content">
            <strong>{{ item.label }}</strong>
            <small v-if="showDescription && item.description">{{ item.description }}</small>
          </span>
        </button>
        <span
          v-if="index < items.length - 1"
          class="dx-step-progress__tail"
          :class="{ 'is-complete': index < activeIndex }"
          aria-hidden="true"
        />
      </li>
    </ol>
    <span v-else class="dx-step-progress__empty">暂无步骤</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import DxSvgIcon from '../../infrastructure/FormIcon.vue'

defineOptions({ name: 'DxStepProgress' })

type StepValue = string | number | boolean

interface StepProgressItem {
  label: string
  value: StepValue
  description?: string | null
  disabled?: boolean
}

const props = withDefaults(
  defineProps<{
    modelValue: unknown
    items: StepProgressItem[]
    direction?: 'horizontal' | 'vertical'
    finishStatus?: 'wait' | 'process' | 'finish' | 'error' | 'success'
    compact?: boolean
    showDescription?: boolean
    disabled?: boolean
  }>(),
  {
    direction: 'horizontal',
    finishStatus: 'success',
    compact: false,
    showDescription: true,
    disabled: false,
  },
)

const emit = defineEmits<{ 'update:modelValue': [value: StepValue] }>()

const activeIndex = computed(() => {
  const index = props.items.findIndex((item) => sameStepValue(item.value, props.modelValue))
  return index >= 0 ? index : 0
})

const completedIcon = computed(() => {
  if (props.finishStatus === 'wait') return ''
  return props.finishStatus === 'error' ? 'ri:close-line' : 'ri:check-line'
})

/** 根据当前值生成稳定的完成、当前与等待状态，供视觉和辅助技术共同识别。 */
function stepState(index: number): string {
  if (index < activeIndex.value) return 'is-complete'
  return index === activeIndex.value ? 'is-current' : 'is-wait'
}

/** 运行态允许选择未禁用步骤，设计态通过 disabled 阻断数据变更。 */
function selectStep(item: StepProgressItem): void {
  if (props.disabled || item.disabled) return
  emit('update:modelValue', item.value)
}

/** 兼容数据库字符值与 Schema 数字值表达同一选项。 */
function sameStepValue(left: StepValue, right: unknown): boolean {
  return left === right || String(left) === String(right ?? '')
}
</script>

<style scoped>
.dx-step-progress {
  --step-progress-finish-color: var(--el-color-primary);
  --step-progress-finish-fill: var(--el-color-primary-light-9);

  width: 100%;
  min-width: 0;
}

.dx-step-progress.is-finish-success {
  --step-progress-finish-color: var(--el-color-success);
  --step-progress-finish-fill: var(--el-color-success-light-9);
}

.dx-step-progress.is-finish-error {
  --step-progress-finish-color: var(--el-color-danger);
  --step-progress-finish-fill: var(--el-color-danger-light-9);
}

.dx-step-progress__list {
  display: flex;
  width: 100%;
  min-width: 0;
  padding: 0;
  margin: 0;
  list-style: none;
}

.dx-step-progress__item {
  position: relative;
  min-width: 0;
  flex: 1 1 0;
}

.dx-step-progress__trigger {
  position: relative;
  z-index: 1;
  display: flex;
  width: 100%;
  min-width: 0;
  align-items: center;
  padding: 0;
  color: var(--el-text-color-secondary);
  background: transparent;
  border: 0;
  cursor: pointer;
  font: inherit;
}

.dx-step-progress__trigger:disabled {
  cursor: default;
}

.dx-step-progress__marker {
  display: inline-flex;
  width: 24px;
  height: 24px;
  flex: 0 0 24px;
  align-items: center;
  justify-content: center;
  color: var(--el-text-color-placeholder);
  background: var(--el-fill-color-blank);
  border: 1px solid var(--el-border-color);
  border-radius: 50%;
  font-size: 12px;
  font-weight: 600;
  transition:
    color var(--el-transition-duration-fast),
    background-color var(--el-transition-duration-fast),
    border-color var(--el-transition-duration-fast);
}

.dx-step-progress__marker > :deep(svg) {
  width: 14px;
  height: 14px;
}

.dx-step-progress__content {
  display: flex;
  min-width: 0;
  flex-direction: column;
  line-height: 1.35;
}

.dx-step-progress__content strong,
.dx-step-progress__content small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dx-step-progress__content strong {
  color: inherit;
  font-size: 13px;
  font-weight: 500;
}

.dx-step-progress__content small {
  margin-top: 2px;
  color: var(--el-text-color-placeholder);
  font-size: 11px;
}

.dx-step-progress__tail {
  position: absolute;
  z-index: 0;
  background: var(--el-border-color-light);
  transition: background-color var(--el-transition-duration-fast);
}

.dx-step-progress__tail.is-complete {
  background: var(--step-progress-finish-color);
}

.dx-step-progress__item.is-complete .dx-step-progress__marker {
  color: var(--step-progress-finish-color);
  background: var(--step-progress-finish-fill);
  border-color: var(--step-progress-finish-color);
}

.dx-step-progress__item.is-complete .dx-step-progress__content strong {
  color: var(--el-text-color-regular);
}

.dx-step-progress__item.is-current .dx-step-progress__marker {
  color: var(--el-color-white);
  background: var(--el-color-primary);
  border-color: var(--el-color-primary);
  box-shadow: 0 0 0 3px var(--el-color-primary-light-9);
}

.dx-step-progress__item.is-current .dx-step-progress__content strong {
  color: var(--el-color-primary);
  font-weight: 600;
}

.dx-step-progress__item.is-wait
  .dx-step-progress__trigger:not(:disabled):hover
  .dx-step-progress__marker {
  color: var(--el-color-primary);
  border-color: var(--el-color-primary-light-5);
}

.dx-step-progress.is-horizontal .dx-step-progress__trigger {
  flex-direction: column;
  gap: 6px;
  text-align: center;
}

.dx-step-progress.is-horizontal .dx-step-progress__tail {
  top: 11px;
  right: calc(-50% + 18px);
  left: calc(50% + 18px);
  height: 2px;
}

.dx-step-progress.is-horizontal.is-compact .dx-step-progress__trigger {
  gap: 4px;
}

.dx-step-progress.is-horizontal.is-compact .dx-step-progress__marker {
  width: 20px;
  height: 20px;
  flex-basis: 20px;
}

.dx-step-progress.is-horizontal.is-compact .dx-step-progress__tail {
  top: 9px;
  right: calc(-50% + 16px);
  left: calc(50% + 16px);
}

.dx-step-progress.is-horizontal.is-compact .dx-step-progress__content strong {
  font-size: 12px;
}

.dx-step-progress.is-vertical .dx-step-progress__list {
  flex-direction: column;
  gap: var(--daxiang-form-space-3);
}

.dx-step-progress.is-vertical .dx-step-progress__trigger {
  gap: var(--daxiang-form-space-2);
  text-align: left;
}

.dx-step-progress.is-vertical .dx-step-progress__tail {
  top: 30px;
  bottom: calc(var(--daxiang-form-space-3) * -1 + 2px);
  left: 11px;
  width: 2px;
}

.dx-step-progress__empty {
  display: inline-flex;
  min-height: 32px;
  align-items: center;
  color: var(--el-text-color-placeholder);
  font-size: 12px;
}

@media (prefers-reduced-motion: reduce) {
  .dx-step-progress__marker,
  .dx-step-progress__tail {
    transition: none;
  }
}
</style>
