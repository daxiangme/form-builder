<template>
  <DModal
    v-model="visibleModel"
    title="表单全局高级配置"
    width="min(980px, calc(100vw - 32px))"
    confirm-text="保存全局配置"
    :flush-content-vertical="true"
    @confirm="save"
  >
    <ElTabs v-model="activeTab" class="designer-global-advanced">
      <ElTabPane label="变量" name="variables">
        <section>
          <header>
            <span>表单变量只保存定义，运行值默认不进入提交数据。</span
            ><ElButton plain @click="addVariable">添加变量</ElButton>
          </header>
          <article v-for="(variable, index) in draft.variables" :key="variable.id">
            <ElInput v-model="variable.name" placeholder="变量名称" maxlength="80" />
            <ElInput v-model="variable.code" placeholder="变量编码" maxlength="64" />
            <ElSelect v-model="variable.valueType">
              <ElOption label="文本" value="STRING" /><ElOption label="数值" value="NUMBER" />
              <ElOption label="布尔" value="BOOLEAN" /><ElOption label="日期" value="DATE" />
              <ElOption label="对象" value="OBJECT" />
            </ElSelect>
            <ElInput
              :model-value="String(variable.initialValue ?? '')"
              placeholder="初始值"
              @change="variable.initialValue = parseInitialValue($event, variable.valueType)"
            />
            <ElButton text type="danger" @click="draft.variables.splice(index, 1)"
              ><DxSvgIcon icon="ri:delete-bin-line"
            /></ElButton>
          </article>
          <ElEmpty
            v-if="draft.variables.length === 0"
            description="暂无表单变量"
            :image-size="56"
          />
        </section>
      </ElTabPane>
      <ElTabPane label="数据源" name="dataSources">
        <section>
          <header>
            <span>只记录 Provider 与来源身份，不保存 URL、SQL、请求头或凭据。</span
            ><ElButton plain @click="addDataSource">添加数据源</ElButton>
          </header>
          <article
            v-for="(source, index) in draft.dataSources"
            :key="source.id"
            class="is-data-source"
          >
            <div class="designer-global-advanced__source-grid">
              <ElInput v-model="source.name" placeholder="名称" maxlength="80" />
              <ElInput v-model="source.code" placeholder="编码" maxlength="64" />
              <ElInput v-model="source.provider" placeholder="Provider" maxlength="64" />
              <ElInput v-model="source.sourceId" placeholder="来源 ID" maxlength="128" />
              <ElInputNumber
                v-model="source.sourceRevision"
                :min="0"
                placeholder="版本"
                controls-position="right"
              />
              <ElButton text type="danger" @click="draft.dataSources.splice(index, 1)"
                ><DxSvgIcon icon="ri:delete-bin-line"
              /></ElButton>
            </div>
            <ElCollapse>
              <ElCollapseItem title="输入映射" name="input">
                <div
                  v-for="(mapping, mappingIndex) in source.inputMappings"
                  :key="mappingIndex"
                  class="designer-global-advanced__mapping"
                >
                  <ElInput v-model="mapping.source" placeholder="field:字段ID / variable:编码" />
                  <ElInput v-model="mapping.target" placeholder="Adapter 输入名" />
                  <ElButton text type="danger" @click="source.inputMappings.splice(mappingIndex, 1)"
                    ><DxSvgIcon icon="ri:delete-bin-line"
                  /></ElButton>
                </div>
                <ElButton text @click="source.inputMappings.push({ source: '', target: '' })"
                  >添加输入映射</ElButton
                >
              </ElCollapseItem>
              <ElCollapseItem title="输出映射" name="output">
                <div
                  v-for="(mapping, mappingIndex) in source.outputMappings"
                  :key="mappingIndex"
                  class="designer-global-advanced__mapping"
                >
                  <ElInput v-model="mapping.source" placeholder="Adapter 输出名" />
                  <ElInput v-model="mapping.target" placeholder="field:字段ID / variable:编码" />
                  <ElButton
                    text
                    type="danger"
                    @click="source.outputMappings.splice(mappingIndex, 1)"
                    ><DxSvgIcon icon="ri:delete-bin-line"
                  /></ElButton>
                </div>
                <ElButton text @click="source.outputMappings.push({ source: '', target: '' })"
                  >添加输出映射</ElButton
                >
              </ElCollapseItem>
            </ElCollapse>
            <ElTag type="warning" effect="plain">运行需要 Host DataSource Adapter</ElTag>
          </article>
          <ElEmpty
            v-if="draft.dataSources.length === 0"
            description="暂无数据源"
            :image-size="56"
          />
        </section>
      </ElTabPane>
      <ElTabPane label="国际化" name="i18n">
        <section>
          <ElForm label-position="top">
            <ElFormItem label="启用国际化"><ElSwitch v-model="draft.i18n.enabled" /></ElFormItem>
            <ElFormItem label="语言列表">
              <ElSelect
                v-model="draft.i18n.locales"
                multiple
                filterable
                allow-create
                default-first-option
              >
                <ElOption
                  v-for="locale in draft.i18n.locales"
                  :key="locale"
                  :label="locale"
                  :value="locale"
                />
              </ElSelect>
            </ElFormItem>
            <ElFormItem label="默认语言">
              <ElSelect v-model="draft.i18n.defaultLocale">
                <ElOption
                  v-for="locale in draft.i18n.locales"
                  :key="locale"
                  :label="locale"
                  :value="locale"
                />
              </ElSelect>
            </ElFormItem>
          </ElForm>
          <header>
            <span>回退顺序：当前语言 → 默认语言 → 原文。</span>
            <div>
              <ElButton plain @click="seedI18nEntries">补齐表单词条</ElButton>
              <ElButton plain @click="addI18nEntry">添加词条</ElButton>
            </div>
          </header>
          <article v-for="(entry, index) in draft.i18n.entries" :key="index" class="is-i18n">
            <ElInput v-model="entry.key" placeholder="稳定词条 key" maxlength="64" />
            <ElInput
              v-for="locale in draft.i18n.locales"
              :key="locale"
              v-model="entry.values[locale]"
              :placeholder="locale"
              maxlength="300"
            />
            <ElButton text type="danger" @click="draft.i18n.entries.splice(index, 1)"
              ><DxSvgIcon icon="ri:delete-bin-line"
            /></ElButton>
          </article>
          <ElEmpty
            v-if="draft.i18n.entries.length === 0"
            description="暂无国际化词条"
            :image-size="56"
          />
        </section>
      </ElTabPane>
    </ElTabs>
  </DModal>
</template>

<script setup lang="ts">
import { ref, reactive, watch } from 'vue'
import DModal from '../infrastructure/FormModalShell.vue'
import DxSvgIcon from '../infrastructure/FormIcon.vue'
import {
  designerActionI18nKey,
  designerFieldHelpI18nKey,
  designerFieldLabelI18nKey,
  designerModuleI18nKey,
} from '@daxiangme/form-core'
import type {
  DesignerDataSourceDefinition,
  DesignerDocument,
  DesignerI18nConfiguration,
  DesignerVariableDefinition,
} from '@daxiangme/form-core'

defineOptions({ name: 'DesignerGlobalAdvancedEditor' })

const props = defineProps<{ document: DesignerDocument }>()
const emit = defineEmits<{
  save: [
    patch: {
      variables: DesignerVariableDefinition[]
      dataSources: DesignerDataSourceDefinition[]
      i18n: DesignerI18nConfiguration
    },
  ]
}>()
const visibleModel = defineModel<boolean>({ default: false })
const activeTab = ref('variables')
const draft = reactive({
  variables: [] as DesignerVariableDefinition[],
  dataSources: [] as DesignerDataSourceDefinition[],
  i18n: {
    enabled: false,
    defaultLocale: 'zh-CN',
    locales: ['zh-CN'],
    entries: [],
  } as DesignerI18nConfiguration,
})

watch(visibleModel, (visible) => {
  if (!visible) return
  draft.variables = cloneValue(props.document.variables)
  draft.dataSources = cloneValue(props.document.dataSources)
  draft.i18n = cloneValue(props.document.i18n)
})

function addVariable(): void {
  const serial = draft.variables.length + 1
  draft.variables.push({
    id: createId('variable'),
    code: `variable_${serial}`,
    name: `变量${serial}`,
    valueType: 'STRING',
    initialValue: '',
  })
}

function addDataSource(): void {
  const serial = draft.dataSources.length + 1
  draft.dataSources.push({
    id: createId('source'),
    code: `data_source_${serial}`,
    name: `数据源${serial}`,
    provider: '',
    sourceId: '',
    inputMappings: [],
    outputMappings: [],
  })
}

function addI18nEntry(): void {
  const serial = draft.i18n.entries.length + 1
  draft.i18n.entries.push({
    key: `label_${serial}`,
    values: Object.fromEntries(draft.i18n.locales.map((locale) => [locale, ''])),
  })
}

/** 按字段、动作栏和模块的稳定约定 key 补齐尚不存在的词条。 */
function seedI18nEntries(): void {
  const candidates = [
    ...props.document.dataSchema.fields.flatMap((field) => [
      { key: designerFieldLabelI18nKey(field.key), text: field.label },
      ...(field.helpText
        ? [{ key: designerFieldHelpI18nKey(field.key), text: field.helpText }]
        : []),
    ]),
    ...props.document.actionBar.buttons.map((button) => ({
      key: designerActionI18nKey(button.action),
      text: button.label,
    })),
    ...props.document.uiSchema.overlays.map((module) => ({
      key: designerModuleI18nKey(module.code),
      text: module.name,
    })),
  ]
  const existing = new Set(draft.i18n.entries.map((entry) => entry.key))
  for (const candidate of candidates) {
    if (existing.has(candidate.key)) continue
    draft.i18n.entries.push({
      key: candidate.key,
      values: Object.fromEntries(
        draft.i18n.locales.map((locale) => [
          locale,
          locale === draft.i18n.defaultLocale ? candidate.text : '',
        ]),
      ),
    })
    existing.add(candidate.key)
  }
}

function parseInitialValue(
  value: string,
  type: DesignerVariableDefinition['valueType'],
): string | number | boolean | null {
  if (type === 'NUMBER') return Number.isFinite(Number(value)) ? Number(value) : 0
  if (type === 'BOOLEAN') return value === 'true'
  return value || null
}

function save(): void {
  emit('save', cloneValue(draft))
  visibleModel.value = false
}

function createId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().replaceAll('-', '')}`
}

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
</script>

<style scoped>
.designer-global-advanced {
  min-height: 560px;
}

.designer-global-advanced section {
  display: flex;
  flex-direction: column;
  gap: var(--daxiang-form-space-3);
}

.designer-global-advanced section > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--el-text-color-secondary);
  gap: var(--daxiang-form-space-2);
}

.designer-global-advanced section > header > div {
  display: flex;
  gap: var(--daxiang-form-space-2);
}

.designer-global-advanced article {
  display: grid;
  align-items: center;
  padding: var(--daxiang-form-space-3);
  background: var(--el-fill-color-extra-light);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--el-border-radius-base);
  grid-template-columns: repeat(4, minmax(120px, 1fr)) auto;
  gap: var(--daxiang-form-space-2);
}

.designer-global-advanced article.is-data-source {
  display: flex;
  align-items: stretch;
  flex-direction: column;
}

.designer-global-advanced__source-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(100px, 1fr)) auto;
  gap: var(--daxiang-form-space-2);
}

.designer-global-advanced__mapping {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: var(--daxiang-form-space-2);
}

.designer-global-advanced article.is-i18n {
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)) auto;
}

.designer-global-advanced :deep(.el-select),
.designer-global-advanced :deep(.el-input-number) {
  width: 100%;
}
</style>
