<template>
  <DModal
    v-model="visibleModel"
    title="Schema 工具"
    width="min(1040px, calc(100vw - 32px))"
    :show-footer="false"
    :flush-content-vertical="true"
  >
    <div class="designer-schema-inspector__actions">
      <ElButton @click="copySchema"><DxSvgIcon icon="ri:file-copy-line" />复制 JSON</ElButton>
      <ElButton @click="downloadSchema"><DxSvgIcon icon="ri:download-2-line" />下载 JSON</ElButton>
      <ElButton type="primary" plain @click="openImport"
        ><DxSvgIcon icon="ri:upload-2-line" />严格导入并比较</ElButton
      >
      <input
        ref="inputRef"
        type="file"
        accept="application/json,.json"
        hidden
        @change="readImport"
      />
    </div>
    <ElTabs v-model="activeTab" class="designer-schema-inspector">
      <ElTabPane label="只读预览" name="preview">
        <pre>{{ formattedDocument }}</pre>
      </ElTabPane>
      <ElTabPane :label="`诊断 ${diagnostics.length}`" name="diagnostics">
        <ElResult v-if="diagnostics.length === 0" icon="success" title="当前文档诊断通过" />
        <ul v-else>
          <li v-for="item in diagnostics" :key="`${item.code}:${item.path}`">
            <ElTag :type="item.severity === 'ERROR' ? 'danger' : 'warning'" effect="plain">{{
              item.severity
            }}</ElTag>
            <code>{{ item.path }}</code
            ><span>{{ item.message }}</span>
          </li>
        </ul>
      </ElTabPane>
      <ElTabPane :label="`导入差异 ${diffItems.length}`" name="diff">
        <ElAlert
          v-if="importDiagnostics.length > 0"
          type="error"
          :closable="false"
          show-icon
          title="导入文档未通过严格诊断"
          :description="importDiagnostics.map((item) => `${item.path}：${item.message}`).join('；')"
        />
        <template v-else-if="importDocument">
          <div class="designer-schema-inspector__diff-actions">
            <span>导入只在确认后形成一个可撤销命令，原草稿不会被后台改写。</span>
            <ElButton type="primary" @click="confirmImport">确认导入</ElButton>
          </div>
          <ul>
            <li v-for="item in diffItems" :key="item.path">
              <ElTag
                :type="
                  item.kind === 'ADDED' ? 'success' : item.kind === 'REMOVED' ? 'danger' : 'warning'
                "
                effect="plain"
                >{{ diffLabel(item.kind) }}</ElTag
              >
              <code>{{ item.path }}</code
              ><span>{{ item.summary }}</span>
            </li>
          </ul>
          <ElEmpty v-if="diffItems.length === 0" description="导入文档与当前文档一致" />
        </template>
        <ElEmpty v-else description="选择 JSON 文件后查看严格诊断与差异" />
      </ElTabPane>
    </ElTabs>
  </DModal>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import DModal from '../infrastructure/FormModalShell.vue'
import DxSvgIcon from '../infrastructure/FormIcon.vue'
import { diagnoseDesignerDocument } from '@daxiangme/form-core'
import { downloadDesignerText } from '../composables/local-draft'
import { decodeDesignerImport } from '../composables/use-designer-engine'
import type { DesignerDiagnostic, DesignerDocument } from '@daxiangme/form-core'

defineOptions({ name: 'DesignerSchemaInspector' })

const props = defineProps<{ document: DesignerDocument }>()
const emit = defineEmits<{ import: [document: DesignerDocument] }>()
const visibleModel = defineModel<boolean>({ default: false })
const activeTab = ref('preview')
const inputRef = ref<HTMLInputElement>()
const importDocument = ref<DesignerDocument>()
const importDiagnostics = ref<DesignerDiagnostic[]>([])
const formattedDocument = computed(() => JSON.stringify(props.document, null, 2))
const diagnostics = computed(() => diagnoseDesignerDocument(props.document))
const diffItems = computed(() =>
  importDocument.value ? diffValues(props.document, importDocument.value, '$').slice(0, 500) : [],
)

async function copySchema(): Promise<void> {
  try {
    await navigator.clipboard.writeText(formattedDocument.value)
    ElMessage.success('Schema JSON 已复制')
  } catch {
    ElMessage.error('浏览器未允许复制，请使用下载')
  }
}

function downloadSchema(): void {
  downloadDesignerText(
    formattedDocument.value,
    `form-designer-${safeFilename(props.document.id)}.json`,
  )
}

function openImport(): void {
  if (!inputRef.value) return
  inputRef.value.value = ''
  inputRef.value.click()
}

async function readImport(event: Event): Promise<void> {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  const decoded = decodeDesignerImport(await file.text())
  importDocument.value = decoded.document
  importDiagnostics.value = decoded.diagnostics.filter((item) => item.severity === 'ERROR')
  activeTab.value = 'diff'
}

function confirmImport(): void {
  if (!importDocument.value || importDiagnostics.value.length > 0) return
  emit('import', importDocument.value)
  visibleModel.value = false
}

interface SchemaDiffItem {
  path: string
  kind: 'ADDED' | 'REMOVED' | 'CHANGED'
  summary: string
}

function diffValues(left: unknown, right: unknown, path: string): SchemaDiffItem[] {
  if (JSON.stringify(left) === JSON.stringify(right)) return []
  if (Array.isArray(left) && Array.isArray(right)) {
    const result: SchemaDiffItem[] = []
    const length = Math.max(left.length, right.length)
    for (let index = 0; index < length; index += 1) {
      if (index >= left.length)
        result.push({ path: `${path}[${index}]`, kind: 'ADDED', summary: summarize(right[index]) })
      else if (index >= right.length)
        result.push({ path: `${path}[${index}]`, kind: 'REMOVED', summary: summarize(left[index]) })
      else result.push(...diffValues(left[index], right[index], `${path}[${index}]`))
    }
    return result
  }
  if (isRecord(left) && isRecord(right)) {
    const result: SchemaDiffItem[] = []
    const keys = new Set([...Object.keys(left), ...Object.keys(right)])
    for (const key of keys) {
      if (!(key in left))
        result.push({ path: `${path}.${key}`, kind: 'ADDED', summary: summarize(right[key]) })
      else if (!(key in right))
        result.push({ path: `${path}.${key}`, kind: 'REMOVED', summary: summarize(left[key]) })
      else result.push(...diffValues(left[key], right[key], `${path}.${key}`))
    }
    return result
  }
  return [{ path, kind: 'CHANGED', summary: `${summarize(left)} → ${summarize(right)}` }]
}

function summarize(value: unknown): string {
  const serialized = JSON.stringify(value)
  const text = serialized === undefined ? String(value) : serialized
  return text.length > 120 ? `${text.slice(0, 117)}…` : text
}

function diffLabel(kind: SchemaDiffItem['kind']): string {
  return { ADDED: '新增', REMOVED: '移除', CHANGED: '修改' }[kind]
}

function safeFilename(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_') || 'standalone'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
</script>

<style scoped>
.designer-schema-inspector__actions,
.designer-schema-inspector__diff-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding-bottom: var(--daxiang-form-space-3);
  gap: var(--daxiang-form-space-2);
}

.designer-schema-inspector {
  min-height: 620px;
}

.designer-schema-inspector pre {
  max-height: 560px;
  padding: var(--daxiang-form-space-3);
  margin: 0;
  overflow: auto;
  color: var(--el-text-color-regular);
  background: var(--el-fill-color-extra-light);
  border-radius: var(--el-border-radius-base);
  font-family: var(--el-font-family-monospace, ui-monospace, monospace);
  font-size: 12px;
  line-height: 1.65;
  white-space: pre;
}

.designer-schema-inspector ul {
  display: flex;
  padding: 0;
  margin: 0;
  flex-direction: column;
  list-style: none;
  gap: var(--daxiang-form-space-2);
}

.designer-schema-inspector li {
  display: grid;
  align-items: start;
  padding: var(--daxiang-form-space-2);
  background: var(--el-fill-color-extra-light);
  border-radius: var(--el-border-radius-base);
  grid-template-columns: auto minmax(160px, 0.6fr) minmax(0, 1fr);
  gap: var(--daxiang-form-space-2);
}

.designer-schema-inspector code {
  overflow-wrap: anywhere;
}

.designer-schema-inspector__diff-actions span {
  margin-right: auto;
  color: var(--el-text-color-secondary);
}
</style>
