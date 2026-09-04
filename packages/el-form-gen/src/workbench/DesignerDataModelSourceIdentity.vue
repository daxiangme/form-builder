<template>
  <div class="designer-data-model-source" :class="{ 'is-local': !source }">
    <ElTooltip :content="tooltip" placement="top-start" :disabled="!tooltip">
      <div class="designer-data-model-source__body">
        <span class="designer-data-model-source__name">{{ displayName }}</span>
        <span v-if="idPreview" class="designer-data-model-source__sep" aria-hidden="true">·</span>
        <span v-if="idPreview" class="designer-data-model-source__id">{{ idPreview }}</span>
        <span v-if="revisionText" class="designer-data-model-source__revision">{{
          revisionText
        }}</span>
      </div>
    </ElTooltip>
    <ElButton
      v-if="source"
      class="designer-data-model-source__copy"
      link
      :aria-label="copied ? '已复制来源身份' : '复制来源身份'"
      @click="copyIdentity"
    >
      <DxSvgIcon :icon="copied ? 'ri:check-line' : 'ri:file-copy-line'" />
    </ElButton>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import type { DesignerDataModelSource } from '@daxiangme/form-core'
import DxSvgIcon from '../infrastructure/FormIcon.vue'

defineOptions({ name: 'DesignerDataModelSourceIdentity' })

const props = defineProps<{
  source?: DesignerDataModelSource
}>()

const copied = ref(false)

const PROVIDER_LABELS: Record<string, string> = {
  'dx-bpm': 'DX BPM',
  dx_bpm: 'DX BPM',
  DX_BPM: 'DX BPM',
  daxiangme: '大象',
  local: '本地语义模型',
}

const displayName = computed(() => {
  if (!props.source) return '本地语义模型'
  return friendlyProvider(props.source.provider)
})

const idPreview = computed(() => {
  if (!props.source) return ''
  return abbreviateIdentity(props.source.sourceId)
})

const revisionText = computed(() => {
  const revision = props.source?.sourceRevision
  return revision === undefined ? '' : `r${revision}`
})

const fullIdentity = computed(() => {
  if (!props.source) return '本地语义模型'
  const revision = revisionText.value ? ` · ${revisionText.value}` : ''
  return `${friendlyProvider(props.source.provider)} · ${props.source.sourceId}${revision}`
})

const tooltip = computed(() => (props.source ? fullIdentity.value : ''))

/** 将宿主来源编码转为可读名称；未知编码保留原文。 */
function friendlyProvider(provider: string): string {
  return PROVIDER_LABELS[provider] ?? PROVIDER_LABELS[provider.toLowerCase()] ?? provider
}

/** 长身份 ID 保留首尾，中间省略，避免检查器窄栏撑破布局。 */
function abbreviateIdentity(value: string, head = 8, tail = 6): string {
  const ellipsis = '…'
  if (value.length <= head + tail + ellipsis.length) return value
  return `${value.slice(0, head)}${ellipsis}${value.slice(-tail)}`
}

/** 复制完整来源身份，便于宿主对照数据模型主键。 */
async function copyIdentity(): Promise<void> {
  if (!props.source) return
  try {
    await navigator.clipboard.writeText(fullIdentity.value)
    copied.value = true
    ElMessage.success('来源身份已复制')
    window.setTimeout(() => {
      copied.value = false
    }, 1600)
  } catch {
    ElMessage.error('浏览器未允许复制')
  }
}
</script>

<style scoped>
.designer-data-model-source {
  display: flex;
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  align-items: center;
  gap: var(--daxiang-form-space-1);
  padding: 0 8px;
  border: 1px solid var(--daxiang-form-border-light, var(--el-border-color-lighter));
  border-radius: var(--el-border-radius-base);
  background: var(--daxiang-form-fill-soft, var(--el-fill-color-extra-light));
  color: var(--daxiang-form-text, var(--el-text-color-primary));
}

.designer-data-model-source.is-local {
  color: var(--daxiang-form-muted, var(--el-text-color-secondary));
}

.designer-data-model-source :deep(.el-tooltip__trigger) {
  display: block;
  min-width: 0;
  flex: 1 1 auto;
}

.designer-data-model-source__body {
  display: flex;
  min-width: 0;
  align-items: baseline;
  gap: 6px;
  overflow: hidden;
  line-height: 28px;
  cursor: default;
}

.designer-data-model-source__name,
.designer-data-model-source__id,
.designer-data-model-source__revision {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.designer-data-model-source__name {
  flex: 0 1 auto;
  font-weight: 600;
}

.designer-data-model-source__sep {
  flex: 0 0 auto;
  color: var(--daxiang-form-muted, var(--el-text-color-secondary));
}

.designer-data-model-source__id {
  min-width: 0;
  flex: 1 1 auto;
  color: var(--daxiang-form-muted, var(--el-text-color-secondary));
  font-family: var(--el-font-family);
  font-variant-numeric: tabular-nums;
}

.designer-data-model-source__revision {
  flex: 0 0 auto;
  color: var(--daxiang-form-muted, var(--el-text-color-secondary));
}

.designer-data-model-source__copy {
  flex: 0 0 auto;
  margin-left: auto;
  color: var(--daxiang-form-muted, var(--el-text-color-secondary));
}
</style>
