<template>
  <section class="designer-field-tree">
    <div class="designer-field-tree__search">
      <ElInput v-model="keyword" clearable placeholder="搜索名称、编码或类型">
        <template #prefix><DxSvgIcon icon="ri:search-line" /></template>
      </ElInput>
    </div>
    <div class="designer-field-tree__summary">
      <span>字段 {{ document.dataSchema.fields.length }} · 未放置 {{ unplacedCount }}</span>
      <ElButton
        link
        type="primary"
        :disabled="generationCandidateCount === 0"
        @click="openGenerator"
      >
        一键生成布局
      </ElButton>
    </div>
    <div class="designer-field-tree__scroll">
      <section
        v-for="group in filteredGroups"
        :key="group.entity.id"
        class="designer-field-tree__group"
      >
        <header class="designer-field-tree__group-header">
          <button type="button" @click="toggleGroup(group.entity.id)">
            <DxSvgIcon
              :icon="
                expandedGroups[group.entity.id] ? 'ri:arrow-down-s-line' : 'ri:arrow-right-s-line'
              "
            />
            <DxSvgIcon icon="ri:folder-3-fill" class="designer-field-tree__folder" />
            <span>
              <strong>{{ group.entity.name }}</strong>
              <small>{{ group.entity.code }}</small>
            </span>
            <ElTooltip
              v-if="group.relation"
              :content="`一级一对多子表 · ${group.relation.name}`"
              placement="right"
            >
              <span class="designer-field-tree__child-badge">
                <DxSvgIcon icon="ri:git-branch-line" />子
              </span>
            </ElTooltip>
          </button>
          <ElTooltip
            v-if="group.relation && !placedRelationCodes.has(group.relation.code)"
            content="先创建子表容器，再手动放置该实体字段"
          >
            <ElButton
              link
              type="primary"
              aria-label="创建行子表"
              @click="emit('create-relation', group.relation.code, 'row-subtable')"
            >
              <DxSvgIcon icon="ri:add-box-line" />
            </ElButton>
          </ElTooltip>
        </header>
        <div v-if="expandedGroups[group.entity.id]" class="designer-field-tree__group-body">
          <div v-if="hasSourceMetadata(group)" class="designer-field-tree__source">
            <span v-if="entityPhysicalName(group.entity.id)">
              物理表 · {{ entityPhysicalName(group.entity.id) }}
            </span>
            <span v-for="mapping in relationMappingLabels(group.relation?.id)" :key="mapping">
              {{ mapping }}
            </span>
          </div>
          <button
            v-for="field in group.fields"
            :key="field.id"
            type="button"
            class="designer-field-tree__item"
            :class="{
              'is-selected': selectedFieldId === field.id,
              'is-unplaced': !placedFieldIds.has(field.id),
            }"
            @click="emit('select', field.id)"
          >
            <DxSvgIcon :icon="componentIcon(field.componentType)" />
            <span>
              <strong>{{ field.label }}</strong>
              <small>
                {{ field.key }} · {{ semanticTypeLabel(field.semanticType) }}
                <template v-if="fieldPhysicalName(field.id)">
                  · {{ fieldPhysicalName(field.id) }}</template
                >
              </small>
            </span>
            <span class="designer-field-tree__trailing">
              <ElTooltip
                v-if="field.primaryKey"
                content="主键字段默认不生成可写控件"
                placement="right"
              >
                <span class="designer-field-tree__state is-restricted">
                  <DxSvgIcon icon="ri:key-2-line" />主键
                </span>
              </ElTooltip>
              <ElTooltip
                v-else-if="field.systemField"
                content="系统字段默认不生成可写控件"
                placement="right"
              >
                <span class="designer-field-tree__state is-restricted">
                  <DxSvgIcon icon="ri:lock-line" />系统
                </span>
              </ElTooltip>
              <ElTooltip
                v-else-if="field.display.readonly"
                content="该字段放置后保持只读"
                placement="right"
              >
                <span class="designer-field-tree__state">
                  <DxSvgIcon icon="ri:eye-line" />只读
                </span>
              </ElTooltip>
              <ElTooltip
                v-else-if="field.bindingStatus !== 'UNBOUND'"
                content="字段来自首次传入的数据模型"
                placement="right"
              >
                <span class="designer-field-tree__state is-source" aria-label="来源字段">
                  <DxSvgIcon icon="ri:link-m" />
                </span>
              </ElTooltip>
              <span
                v-if="canRestoreField(field, group.relation) || canDeleteField(field)"
                class="designer-field-tree__actions"
              >
                <ElTooltip
                  v-if="canRestoreField(field, group.relation)"
                  :content="group.relation ? '放置到已绑定子表' : '放置到主实体布局'"
                >
                  <ElButton link aria-label="重新放置" @click.stop="emit('restore', field.id)">
                    <DxSvgIcon icon="ri:add-line" />
                  </ElButton>
                </ElTooltip>
                <ElTooltip v-if="canDeleteField(field)" content="永久删除未放置本地字段">
                  <ElButton
                    link
                    type="danger"
                    aria-label="删除字段"
                    @click.stop="emit('delete', field.id)"
                  >
                    <DxSvgIcon icon="ri:delete-bin-line" />
                  </ElButton>
                </ElTooltip>
              </span>
            </span>
          </button>
          <ElEmpty
            v-if="group.fields.length === 0"
            description="当前实体没有匹配字段"
            :image-size="48"
          />
        </div>
      </section>
      <ElEmpty v-if="filteredGroups.length === 0" description="当前没有匹配字段" :image-size="56" />
    </div>

    <DModal
      v-model="generatorVisible"
      title="一键生成数据模型布局"
      width="min(840px, calc(100vw - 32px))"
      confirm-text="生成布局"
      :confirm-disabled="selectedFieldIds.length === 0 && selectedRelationCodes.length === 0"
      @confirm="confirmGenerate"
    >
      <ElAlert
        type="info"
        :closable="false"
        show-icon
        title="只添加尚未放置的字段和关系；主键、系统字段不会生成普通可写控件。"
      />
      <section
        v-for="group in groups"
        :key="group.entity.id"
        class="designer-field-tree__generator-group"
      >
        <header>
          <span class="designer-field-tree__generator-identity">
            <DxSvgIcon icon="ri:folder-3-line" />
            <strong>{{ group.entity.name }}</strong>
            <ElTag v-if="group.relation" effect="plain" type="warning">子</ElTag>
          </span>
          <ElCheckbox
            :model-value="isGeneratedGroupFullySelected(group)"
            :indeterminate="isGeneratedGroupPartiallySelected(group)"
            :disabled="generationFields(group).length === 0"
            @change="toggleGeneratedGroup(group, Boolean($event))"
          >
            {{ isGeneratedGroupFullySelected(group) ? '取消全选' : '全选' }}
          </ElCheckbox>
          <div v-if="group.relation" class="designer-field-tree__generator-relation">
            <ElCheckbox
              :model-value="selectedRelationCodes.includes(group.relation.code)"
              @change="toggleGeneratedRelation(group.relation.code, Boolean($event))"
            >
              生成子表
            </ElCheckbox>
            <ElSelect v-model="relationComponentTypes[group.relation.code]">
              <ElOption label="行子表" value="row-subtable" />
              <ElOption label="块子表" value="block-subtable" />
            </ElSelect>
          </div>
        </header>
        <ElCheckboxGroup v-model="selectedFieldIds" class="designer-field-tree__generator-fields">
          <ElCheckbox v-for="field in generationFields(group)" :key="field.id" :value="field.id">
            {{ field.label }}
            <small>{{ field.key }}</small>
          </ElCheckbox>
        </ElCheckboxGroup>
      </section>
    </DModal>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import DModal from '../infrastructure/FormModalShell.vue'
import DxSvgIcon from '../infrastructure/FormIcon.vue'
import { findDesignerComponent } from '@daxiangme/form-core'
import type {
  DesignerDataEntity,
  DesignerDocument,
  DesignerField,
  DesignerGenerateLayoutRequest,
  DesignerOneToManyRelation,
  DesignerSemanticType,
  DesignerSourceMetadataIndex,
} from '@daxiangme/form-core'

defineOptions({ name: 'DesignerFieldTree' })

interface DesignerFieldGroup {
  entity: DesignerDataEntity
  relation?: DesignerOneToManyRelation
  fields: DesignerField[]
}

const props = defineProps<{
  document: DesignerDocument
  sourceMetadata: DesignerSourceMetadataIndex
  placedFieldIds: Set<string>
  placedRelationCodes: Set<string>
  selectedFieldId: string
}>()
const emit = defineEmits<{
  select: [fieldId: string]
  restore: [fieldId: string]
  delete: [fieldId: string]
  'create-relation': [relationCode: string, componentType: 'row-subtable' | 'block-subtable']
  'generate-layout': [request: DesignerGenerateLayoutRequest]
}>()
const keyword = ref('')
const expandedGroups = reactive<Record<string, boolean>>({})
const generatorVisible = ref(false)
const selectedFieldIds = ref<string[]>([])
const selectedRelationCodes = ref<string[]>([])
const relationComponentTypes = reactive<Record<string, 'row-subtable' | 'block-subtable'>>({})

const groups = computed<DesignerFieldGroup[]>(() => {
  const root = props.document.dataSchema.rootEntity
  return [
    { entity: root, fields: fieldsForEntity(root.code) },
    ...props.document.dataSchema.relations.map((relation) => ({
      entity: relation.childEntity,
      relation,
      fields: fieldsForEntity(relation.childEntity.code),
    })),
  ]
})
const filteredGroups = computed(() => {
  const query = keyword.value.trim().toLowerCase()
  if (!query) return groups.value
  return groups.value
    .map((group) => {
      const groupMatches = `${group.entity.name} ${group.entity.code} ${group.relation?.name ?? ''}`
        .toLowerCase()
        .includes(query)
      return {
        ...group,
        fields: groupMatches
          ? group.fields
          : group.fields.filter((field) =>
              `${field.label} ${field.key} ${field.semanticType} ${field.componentType}`
                .toLowerCase()
                .includes(query),
            ),
      }
    })
    .filter(
      (group) =>
        group.fields.length > 0 ||
        `${group.entity.name} ${group.entity.code}`.toLowerCase().includes(query),
    )
})
const unplacedCount = computed(
  () =>
    props.document.dataSchema.fields.filter((field) => !props.placedFieldIds.has(field.id)).length,
)
const generationCandidateCount = computed(() =>
  groups.value.reduce((count, group) => count + generationFields(group).length, 0),
)

watch(
  groups,
  (items) => {
    items.forEach((group) => {
      if (!(group.entity.id in expandedGroups)) expandedGroups[group.entity.id] = true
      if (group.relation && !relationComponentTypes[group.relation.code]) {
        relationComponentTypes[group.relation.code] = 'row-subtable'
      }
    })
  },
  { immediate: true },
)

function fieldsForEntity(entityCode: string): DesignerField[] {
  return props.document.dataSchema.fields
    .filter((field) => field.entityCode === entityCode)
    .sort((left, right) => left.displayOrder - right.displayOrder)
}

function generationFields(group: DesignerFieldGroup): DesignerField[] {
  return group.fields.filter(
    (field) => !props.placedFieldIds.has(field.id) && !field.primaryKey && !field.systemField,
  )
}

function canRestoreField(field: DesignerField, relation?: DesignerOneToManyRelation): boolean {
  if (props.placedFieldIds.has(field.id) || field.primaryKey || field.systemField) return false
  return !relation || props.placedRelationCodes.has(relation.code)
}

function canDeleteField(field: DesignerField): boolean {
  return !props.placedFieldIds.has(field.id) && field.bindingStatus === 'UNBOUND'
}

function toggleGroup(entityId: string): void {
  expandedGroups[entityId] = !expandedGroups[entityId]
}

function openGenerator(): void {
  selectedFieldIds.value = groups.value.flatMap((group) =>
    generationFields(group).map((field) => field.id),
  )
  selectedRelationCodes.value = groups.value
    .filter(
      (group) =>
        group.relation &&
        !props.placedRelationCodes.has(group.relation.code) &&
        generationFields(group).length > 0,
    )
    .map((group) => group.relation!.code)
  generatorVisible.value = true
}

function toggleGeneratedRelation(relationCode: string, selected: boolean): void {
  selectedRelationCodes.value = selected
    ? [...new Set([...selectedRelationCodes.value, relationCode])]
    : selectedRelationCodes.value.filter((code) => code !== relationCode)
}

function isGeneratedGroupFullySelected(group: DesignerFieldGroup): boolean {
  const fieldIds = generationFields(group).map((field) => field.id)
  return (
    fieldIds.length > 0 && fieldIds.every((fieldId) => selectedFieldIds.value.includes(fieldId))
  )
}

function isGeneratedGroupPartiallySelected(group: DesignerFieldGroup): boolean {
  const fieldIds = generationFields(group).map((field) => field.id)
  const selectedCount = fieldIds.filter((fieldId) =>
    selectedFieldIds.value.includes(fieldId),
  ).length
  return selectedCount > 0 && selectedCount < fieldIds.length
}

function toggleGeneratedGroup(group: DesignerFieldGroup, selected: boolean): void {
  const groupFieldIds = new Set(generationFields(group).map((field) => field.id))
  const otherSelectedIds = selectedFieldIds.value.filter((fieldId) => !groupFieldIds.has(fieldId))
  selectedFieldIds.value = selected ? [...otherSelectedIds, ...groupFieldIds] : otherSelectedIds
}

function confirmGenerate(): void {
  emit('generate-layout', {
    fieldIds: [...selectedFieldIds.value],
    relations: selectedRelationCodes.value.map((relationCode) => ({
      relationCode,
      componentType: relationComponentTypes[relationCode] ?? 'row-subtable',
    })),
  })
  generatorVisible.value = false
}

function componentIcon(componentType: string): string {
  return findDesignerComponent(componentType)?.icon ?? 'ri:error-warning-line'
}

function entityPhysicalName(entityId: string): string {
  return props.sourceMetadata.entities[entityId]?.physicalTableName ?? ''
}

function hasSourceMetadata(group: DesignerFieldGroup): boolean {
  return Boolean(
    entityPhysicalName(group.entity.id) || relationMappingLabels(group.relation?.id).length,
  )
}

function fieldPhysicalName(fieldId: string): string {
  return props.sourceMetadata.fields[fieldId]?.physicalColumnName ?? ''
}

function relationMappingLabels(relationId?: string): string[] {
  if (!relationId) return []
  return (props.sourceMetadata.relations[relationId]?.keyMappings ?? []).map((mapping) => {
    const parent = props.document.dataSchema.fields.find(
      (field) => field.binding?.fieldId === mapping.parentFieldId,
    )
    const child = props.document.dataSchema.fields.find(
      (field) => field.binding?.fieldId === mapping.childFieldId,
    )
    return `关联字段 · ${parent?.label ?? mapping.parentFieldId} → ${child?.label ?? mapping.childFieldId}`
  })
}

function semanticTypeLabel(type: DesignerSemanticType): string {
  return {
    STRING: '文本',
    LONG_TEXT: '长文本',
    NUMBER: '数字',
    BOOLEAN: '布尔',
    DATE: '日期',
    DATE_TIME: '日期时间',
    FILE: '文件',
    REFERENCE: '引用',
    OBJECT: '对象',
    ARRAY: '多值',
  }[type]
}
</script>

<style scoped>
.designer-field-tree {
  display: flex;
  min-height: 0;
  flex: 1 1 0;
  flex-direction: column;
  padding-block-start: var(--daxiang-form-space-2);
}

.designer-field-tree__search {
  padding-inline: var(--daxiang-form-space-3);
}

.designer-field-tree__summary {
  display: flex;
  min-height: 32px;
  align-items: center;
  justify-content: space-between;
  padding: var(--daxiang-form-space-1) var(--daxiang-form-space-3);
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.designer-field-tree__scroll {
  min-height: 0;
  flex: 1 1 0;
  padding: 0 var(--daxiang-form-space-2) var(--daxiang-form-space-3) var(--daxiang-form-space-3);
  overflow: auto;
}

.designer-field-tree__group + .designer-field-tree__group {
  margin-top: var(--daxiang-form-space-1);
}

.designer-field-tree__group-header {
  display: grid;
  min-height: 38px;
  align-items: center;
  grid-template-columns: minmax(0, 1fr) auto;
}

.designer-field-tree__group-header > button:first-child {
  display: grid;
  min-width: 0;
  align-items: center;
  padding: var(--daxiang-form-space-1) 0;
  color: var(--el-text-color-primary);
  background: transparent;
  border: 0;
  cursor: pointer;
  grid-template-columns: auto auto minmax(0, 1fr) auto;
  gap: var(--daxiang-form-space-1);
  text-align: left;
}

.designer-field-tree__folder {
  color: var(--el-color-primary);
}

.designer-field-tree__group-header span:not(.designer-field-tree__child-badge) {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.designer-field-tree__group-header small,
.designer-field-tree__source,
.designer-field-tree__item small,
.designer-field-tree__generator-fields small {
  color: var(--el-text-color-secondary);
  font-size: 11px;
}

.designer-field-tree__child-badge {
  display: inline-flex;
  align-items: center;
  color: var(--el-color-primary);
  font-size: 10px;
  gap: 2px;
}

.designer-field-tree__source {
  display: flex;
  padding: 0 var(--daxiang-form-space-2) var(--daxiang-form-space-1) 32px;
  flex-wrap: wrap;
  gap: var(--daxiang-form-space-1) var(--daxiang-form-space-2);
}

.designer-field-tree__group-body {
  padding-inline-start: var(--daxiang-form-space-2);
}

.designer-field-tree__item {
  display: grid;
  width: 100%;
  min-height: 40px;
  align-items: center;
  padding: var(--daxiang-form-space-1) var(--daxiang-form-space-2);
  color: var(--el-text-color-regular);
  background: transparent;
  border: 0;
  border-radius: var(--el-border-radius-base);
  cursor: pointer;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: var(--daxiang-form-space-1);
  text-align: left;
}

.designer-field-tree__item:hover,
.designer-field-tree__item.is-selected {
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}

.designer-field-tree__item > span:nth-child(2) {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.designer-field-tree__item > svg {
  font-size: 16px;
}

.designer-field-tree__item strong,
.designer-field-tree__item small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.designer-field-tree__item strong {
  font-size: 13px;
  line-height: 18px;
}

.designer-field-tree__item small {
  line-height: 14px;
}

.designer-field-tree__trailing,
.designer-field-tree__actions,
.designer-field-tree__state {
  display: flex;
  align-items: center;
}

.designer-field-tree__trailing {
  gap: var(--daxiang-form-space-1);
}

.designer-field-tree__actions {
  gap: 2px;
}

.designer-field-tree__state {
  color: var(--el-text-color-secondary);
  font-size: 10px;
  gap: 2px;
  white-space: nowrap;
}

.designer-field-tree__state.is-restricted {
  color: var(--el-color-warning-dark-2);
}

.designer-field-tree__state.is-source {
  color: var(--el-color-success);
  font-size: 13px;
}

.designer-field-tree__generator-group {
  padding: var(--daxiang-form-space-3) 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.designer-field-tree__generator-group > header {
  display: grid;
  align-items: center;
  grid-template-columns: minmax(0, 1fr) auto minmax(220px, auto);
  gap: var(--daxiang-form-space-2);
}

.designer-field-tree__generator-identity,
.designer-field-tree__generator-relation {
  display: flex;
  align-items: center;
  gap: var(--daxiang-form-space-1);
}

.designer-field-tree__generator-relation {
  justify-content: flex-end;
}

.designer-field-tree__generator-relation :deep(.el-select) {
  width: 140px;
}

.designer-field-tree__generator-fields {
  display: grid;
  padding-top: var(--daxiang-form-space-2);
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--daxiang-form-space-1) var(--daxiang-form-space-3);
}

.designer-field-tree__generator-fields :deep(.el-checkbox) {
  min-width: 0;
  margin-right: 0;
}

.designer-field-tree__generator-fields small {
  margin-left: var(--daxiang-form-space-1);
}
</style>
