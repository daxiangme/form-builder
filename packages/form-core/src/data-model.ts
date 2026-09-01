import { findDesignerComponent } from './component-registry'
import { createDefaultDesignerFieldBehavior } from './document-advanced'
import type {
  DesignerDataEntity,
  DesignerDiagnostic,
  DesignerDocument,
  DesignerField,
  DesignerFieldNode,
  DesignerInitialDataModel,
  DesignerInitialEntity,
  DesignerInitialField,
  DesignerLayoutNode,
  DesignerOneToManyRelation,
  DesignerRelationPatch,
  DesignerRootEntityPatch,
  DesignerSourceMetadataIndex,
} from './types'

/** Core 允许持久化的语义编码格式，不接受数据库表达式或路径。 */
export const DESIGNER_IDENTIFIER_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,63}$/

const SUBTABLE_COMPONENT_TYPES = new Set(['row-subtable', 'block-subtable'])

/** 首次参数初始化和来源索引构建的结果。 */
export interface DesignerDataModelPreparation {
  document: DesignerDocument
  sourceMetadata: DesignerSourceMetadataIndex
  diagnostics: DesignerDiagnostic[]
  initialized: boolean
}

/** 创建只包含本地主实体的数据模型目录。 */
export function createLocalDesignerDataSchema(name: string): DesignerDocument['dataSchema'] {
  return {
    rootEntity: {
      id: createProtocolId('entity'),
      code: 'main',
      name: name || '主实体',
    },
    relations: [],
    fields: [],
  }
}

/**
 * 规范化旧草稿的数据模型身份和一级子表关系。
 *
 * 该函数只补缺失值；已经存在但非法的值交给文档诊断失败关闭，避免静默修复用户输入。
 */
export function normalizeDesignerDataModel(document: DesignerDocument): void {
  const schema = document.dataSchema as DesignerDocument['dataSchema'] | undefined
  if (!schema || !Array.isArray(schema.fields)) return
  const rawSchema = schema as unknown as Record<string, unknown>
  if (!('rootEntity' in rawSchema)) {
    schema.rootEntity = createLocalDesignerDataSchema(document.name).rootEntity
  }
  if (!('relations' in rawSchema)) schema.relations = []
  const relations = Array.isArray(schema.relations) ? schema.relations : []
  const validRelations = relations.filter(isOneToManyRelation)
  validRelations.forEach((relation) => {
    if (!relation.loadMode) relation.loadMode = 'SYNC'
  })
  if (!isDataEntity(schema.rootEntity)) return
  schema.fields.forEach((field, index) => {
    if (!field.entityCode) field.entityCode = schema.rootEntity.code
    if (typeof field.primaryKey !== 'boolean') field.primaryKey = false
    if (typeof field.systemField !== 'boolean') field.systemField = false
    if (!Number.isFinite(field.displayOrder)) field.displayOrder = index
  })

  const relationCodes = new Set(validRelations.map((relation) => relation.code))
  const entityCodes = new Set([
    schema.rootEntity.code,
    ...validRelations.map((relation) => relation.childEntity.code),
  ])
  let relationSerial = 1
  walkNodes(document.uiSchema.root, (node) => {
    if (node.nodeType !== 'CONTAINER' || !SUBTABLE_COMPONENT_TYPES.has(node.componentType)) return
    const configuredCode =
      typeof node.configuration.relationCode === 'string' &&
      DESIGNER_IDENTIFIER_PATTERN.test(node.configuration.relationCode)
        ? node.configuration.relationCode
        : ''
    let relation = configuredCode
      ? validRelations.find((item) => item.code === configuredCode)
      : undefined
    // v3 已经属于新协议；缺失或非法关系必须由诊断失败关闭，不能再按旧草稿规则静默重建。
    if (!relation && node.configurationVersion >= 3) return
    if (!relation) {
      const relationCode =
        configuredCode || nextRelationCode(schema.rootEntity.code, relationCodes, relationSerial)
      while (relationCodes.has(`${schema.rootEntity.code}_detail_${relationSerial}`))
        relationSerial += 1
      const childCode = nextChildEntityCode(entityCodes, relationSerial)
      relation = {
        id: createProtocolId('relation'),
        code: relationCode,
        name: relationTitle(node) || `明细关系 ${relationSerial}`,
        parentEntityId: schema.rootEntity.id,
        childEntity: {
          id: createProtocolId('entity'),
          code: childCode,
          name: relationTitle(node) || `明细实体 ${relationSerial}`,
        },
        loadMode: 'SYNC',
      }
      relations.push(relation)
      validRelations.push(relation)
      relationCodes.add(relation.code)
      entityCodes.add(relation.childEntity.code)
      relationSerial += 1
    }
    node.configuration.relationCode = relation.code
    if (node.configurationVersion < 3) node.configurationVersion = 3
    for (const slot of node.slots) {
      for (const child of slot.children) {
        if (child.nodeType !== 'FIELD') continue
        const field = schema.fields.find((item) => item.id === child.fieldId)
        if (field) field.entityCode = relation.childEntity.code
      }
    }
  })
}

/**
 * 以首次复制语义应用 Host 参数，并建立非持久化物理来源索引。
 *
 * 已存在字段、布局、关系或外部来源身份时不会覆盖当前文档；参数变化也不会形成命令历史。
 */
export function prepareDesignerDataModel(
  source: DesignerDocument,
  initialDataModel?: DesignerInitialDataModel,
): DesignerDataModelPreparation {
  const document = cloneDocument(source)
  normalizeDesignerDataModel(document)
  if (!initialDataModel) {
    return {
      document,
      sourceMetadata: emptySourceMetadata(),
      diagnostics: [],
      initialized: false,
    }
  }
  const diagnostics = diagnoseInitialDataModel(initialDataModel)
  if (diagnostics.some((item) => item.severity === 'ERROR')) {
    return {
      document,
      sourceMetadata: emptySourceMetadata(),
      diagnostics,
      initialized: false,
    }
  }
  const canInitialize =
    !document.dataSchema.source &&
    document.dataSchema.fields.length === 0 &&
    document.dataSchema.relations.length === 0 &&
    document.uiSchema.root.length === 0
  if (canInitialize) applyInitialDataModel(document, initialDataModel)
  const sourceMetadata = buildSourceMetadataIndex(document, initialDataModel)
  return { document, sourceMetadata, diagnostics, initialized: canInitialize }
}

/** 为新建子表建立独立的一级一对多关系，并将稳定 relationCode 写入节点配置。 */
export function ensureDesignerSubtableRelation(
  document: DesignerDocument,
  node: Extract<DesignerLayoutNode, { nodeType: 'CONTAINER' }>,
): DesignerOneToManyRelation | undefined {
  if (!SUBTABLE_COMPONENT_TYPES.has(node.componentType)) return undefined
  const configuredCode =
    typeof node.configuration.relationCode === 'string' ? node.configuration.relationCode : ''
  const existing = document.dataSchema.relations.find(
    (relation) => relation.code === configuredCode,
  )
  if (existing) {
    node.configurationVersion = 3
    return existing
  }
  const relationSerial = nextRelationSerial(document)
  const relationCodes = new Set(document.dataSchema.relations.map((relation) => relation.code))
  const entityCodes = new Set([
    document.dataSchema.rootEntity.code,
    ...document.dataSchema.relations.map((relation) => relation.childEntity.code),
  ])
  const relation: DesignerOneToManyRelation = {
    id: createProtocolId('relation'),
    code: nextRelationCode(document.dataSchema.rootEntity.code, relationCodes, relationSerial),
    name: relationTitle(node) || `明细关系 ${relationSerial}`,
    parentEntityId: document.dataSchema.rootEntity.id,
    childEntity: {
      id: createProtocolId('entity'),
      code: nextChildEntityCode(entityCodes, relationSerial),
      name: relationTitle(node) || `明细实体 ${relationSerial}`,
    },
    loadMode: 'SYNC',
  }
  document.dataSchema.relations.push(relation)
  node.configuration = { ...node.configuration, relationCode: relation.code }
  node.configurationVersion = 3
  return relation
}

/** 复制子表时生成新的本地关系和子实体，禁止两个可写子表共享同一关系。 */
export function duplicateDesignerSubtableRelation(
  document: DesignerDocument,
  source: Extract<DesignerLayoutNode, { nodeType: 'CONTAINER' }>,
  copy: Extract<DesignerLayoutNode, { nodeType: 'CONTAINER' }>,
): void {
  if (!SUBTABLE_COMPONENT_TYPES.has(copy.componentType)) return
  const sourceCode =
    typeof source.configuration.relationCode === 'string' ? source.configuration.relationCode : ''
  const sourceRelation = document.dataSchema.relations.find(
    (relation) => relation.code === sourceCode,
  )
  copy.configuration = { ...copy.configuration, relationCode: '' }
  const relation = ensureDesignerSubtableRelation(document, copy)
  if (!relation) return
  if (sourceRelation) {
    relation.name = `${sourceRelation.name}副本`
    relation.childEntity.name = `${sourceRelation.childEntity.name}副本`
  }
  for (const slot of copy.slots) {
    for (const child of slot.children) {
      if (child.nodeType !== 'FIELD') continue
      const field = document.dataSchema.fields.find((item) => item.id === child.fieldId)
      if (!field) continue
      field.entityCode = relation.childEntity.code
      field.bindingStatus = 'UNBOUND'
      field.primaryKey = false
      field.systemField = false
      delete field.binding
    }
  }
}

/** 返回目标落点对应的数据实体编码。 */
export function resolveDesignerTargetEntityCode(
  document: DesignerDocument,
  containerId: string | null,
): string | undefined {
  if (!containerId) return document.dataSchema.rootEntity.code
  const container = findNode(document.uiSchema.root, containerId)
  if (!container || container.nodeType !== 'CONTAINER') return undefined
  if (!SUBTABLE_COMPONENT_TYPES.has(container.componentType))
    return document.dataSchema.rootEntity.code
  const relationCode =
    typeof container.configuration.relationCode === 'string'
      ? container.configuration.relationCode
      : ''
  return document.dataSchema.relations.find((relation) => relation.code === relationCode)
    ?.childEntity.code
}

/** 校验字段从当前实体作用域移动到目标作用域是否被允许。 */
export function designerFieldScopeDropRejection(
  document: DesignerDocument,
  field: DesignerField,
  targetContainerId: string | null,
): string {
  const targetEntityCode = resolveDesignerTargetEntityCode(document, targetContainerId)
  if (!targetEntityCode) return '目标子表尚未绑定有效关系'
  if (field.entityCode === targetEntityCode) return ''
  return `字段属于实体 ${field.entityCode}，不能放入实体 ${targetEntityCode} 的布局`
}

/** 收集已经在画布中放置的一级子表关系编码。 */
export function collectPlacedRelationCodes(nodes: DesignerLayoutNode[]): Set<string> {
  const result = new Set<string>()
  walkNodes(nodes, (node) => {
    if (node.nodeType !== 'CONTAINER' || !SUBTABLE_COMPONENT_TYPES.has(node.componentType)) return
    if (typeof node.configuration.relationCode === 'string')
      result.add(node.configuration.relationCode)
  })
  return result
}

/** 查找已放置的关系容器。 */
export function findSubtableNodeByRelationCode(
  nodes: DesignerLayoutNode[],
  relationCode: string,
): Extract<DesignerLayoutNode, { nodeType: 'CONTAINER' }> | undefined {
  for (const node of nodes) {
    if (node.nodeType === 'CONTAINER') {
      if (
        SUBTABLE_COMPONENT_TYPES.has(node.componentType) &&
        node.configuration.relationCode === relationCode
      ) {
        return node
      }
      for (const slot of node.slots) {
        const found = findSubtableNodeByRelationCode(slot.children, relationCode)
        if (found) return found
      }
    }
  }
  return undefined
}

/** 将未放置字段放入其所属主实体或已存在的子表容器。 */
export function placeDesignerDataField(
  document: DesignerDocument,
  fieldId: string,
): DesignerFieldNode | undefined {
  if (isFieldPlaced(document.uiSchema.root, fieldId)) return undefined
  const field = document.dataSchema.fields.find((item) => item.id === fieldId)
  if (!field) return undefined
  const registration = findDesignerComponent(field.componentType)
  if (
    !registration ||
    registration.nodeKind !== 'FIELD' ||
    registration.availability === 'UNAVAILABLE'
  ) {
    return undefined
  }
  const node: DesignerFieldNode = {
    nodeType: 'FIELD',
    id: createProtocolId('node'),
    fieldId: field.id,
    layout: {
      pc: {
        span: registration.defaultSpan,
        offset: 0,
        showLabel: registration.defaultShowLabel,
        labelPosition: 'INHERIT',
      },
      mobile: {
        span: 24,
        offset: 0,
        showLabel: registration.defaultShowLabel,
        labelPosition: 'INHERIT',
      },
    },
  }
  if (field.entityCode === document.dataSchema.rootEntity.code) {
    document.uiSchema.root.push(node)
    return node
  }
  const relation = document.dataSchema.relations.find(
    (item) => item.childEntity.code === field.entityCode,
  )
  const container = relation
    ? findSubtableNodeByRelationCode(document.uiSchema.root, relation.code)
    : undefined
  const content = container?.slots.find((slot) => slot.slotCode === 'content')
  if (!content) return undefined
  content.children.push(node)
  return node
}

/** 以一个事务修改主实体身份，并同步主实体字段作用域。 */
export function updateDesignerRootEntity(
  document: DesignerDocument,
  patch: DesignerRootEntityPatch,
): string {
  const root = document.dataSchema.rootEntity
  const nextCode = patch.code ?? root.code
  if (!DESIGNER_IDENTIFIER_PATTERN.test(nextCode)) return '主实体编码格式不正确'
  if (document.dataSchema.relations.some((relation) => relation.childEntity.code === nextCode)) {
    return '主实体编码不能与子实体编码重复'
  }
  if (patch.name !== undefined && !patch.name.trim()) return '主实体名称不能为空'
  const previousCode = root.code
  root.code = nextCode
  if (patch.name !== undefined) root.name = patch.name.trim()
  if (previousCode !== nextCode) {
    document.dataSchema.fields.forEach((field) => {
      if (field.entityCode === previousCode) field.entityCode = nextCode
    })
  }
  return ''
}

/** 以一个事务修改一级子表关系及子实体身份，并同步引用和字段作用域。 */
export function updateDesignerRelation(
  document: DesignerDocument,
  currentCode: string,
  patch: DesignerRelationPatch,
): string {
  const relation = document.dataSchema.relations.find((item) => item.code === currentCode)
  if (!relation) return '当前子表关系不存在'
  const nextRelationCode = patch.code ?? relation.code
  const nextChildCode = patch.childEntityCode ?? relation.childEntity.code
  if (!DESIGNER_IDENTIFIER_PATTERN.test(nextRelationCode)) return '关系编码格式不正确'
  if (!DESIGNER_IDENTIFIER_PATTERN.test(nextChildCode)) return '子实体编码格式不正确'
  if (
    document.dataSchema.relations.some(
      (item) => item.id !== relation.id && item.code === nextRelationCode,
    )
  ) {
    return '关系编码不能重复'
  }
  if (
    nextChildCode === document.dataSchema.rootEntity.code ||
    document.dataSchema.relations.some(
      (item) => item.id !== relation.id && item.childEntity.code === nextChildCode,
    )
  ) {
    return '子实体编码不能与其他实体重复'
  }
  if (patch.name !== undefined && !patch.name.trim()) return '关系名称不能为空'
  if (patch.childEntityName !== undefined && !patch.childEntityName.trim())
    return '子实体名称不能为空'
  const previousRelationCode = relation.code
  const previousChildCode = relation.childEntity.code
  relation.code = nextRelationCode
  relation.childEntity.code = nextChildCode
  if (patch.name !== undefined) relation.name = patch.name.trim()
  if (patch.childEntityName !== undefined) relation.childEntity.name = patch.childEntityName.trim()
  walkNodes(document.uiSchema.root, (node) => {
    if (
      node.nodeType === 'CONTAINER' &&
      SUBTABLE_COMPONENT_TYPES.has(node.componentType) &&
      node.configuration.relationCode === previousRelationCode
    ) {
      node.configuration.relationCode = nextRelationCode
    }
  })
  if (previousChildCode !== nextChildCode) {
    document.dataSchema.fields.forEach((field) => {
      if (field.entityCode === previousChildCode) field.entityCode = nextChildCode
    })
  }
  return ''
}

/** 对持久化数据模型目录执行实体、关系和字段作用域诊断。 */
export function diagnoseDesignerDataModel(document: DesignerDocument): DesignerDiagnostic[] {
  const diagnostics: DesignerDiagnostic[] = []
  const schema = document.dataSchema
  pushUnknownProperties(
    schema.rootEntity,
    ['id', 'code', 'name'],
    '$.dataSchema.rootEntity',
    diagnostics,
  )
  diagnoseEntity(schema.rootEntity, '$.dataSchema.rootEntity', diagnostics)
  if (schema.source) {
    pushUnknownProperties(
      schema.source,
      ['provider', 'sourceId', 'sourceRevision'],
      '$.dataSchema.source',
      diagnostics,
    )
    if (!schema.source.provider || !schema.source.sourceId) {
      diagnostics.push(error('DATA_MODEL_SOURCE', '数据模型来源身份不完整', '$.dataSchema.source'))
    }
    if (
      schema.source.sourceRevision !== undefined &&
      (!Number.isInteger(schema.source.sourceRevision) || schema.source.sourceRevision < 0)
    ) {
      diagnostics.push(
        error(
          'DATA_MODEL_SOURCE_REVISION',
          '来源版本必须是非负整数',
          '$.dataSchema.source.sourceRevision',
        ),
      )
    }
  }
  const relationIds = new Set<string>()
  const relationCodes = new Set<string>()
  const entityIds = new Set<string>([schema.rootEntity.id])
  const entityCodes = new Set<string>([schema.rootEntity.code])
  for (const [index, rawRelation] of schema.relations.entries()) {
    const path = `$.dataSchema.relations[${index}]`
    if (!isOneToManyRelation(rawRelation)) {
      diagnostics.push(error('RELATION_TYPE', '一级子表关系必须是完整对象', path))
      continue
    }
    const relation = rawRelation
    pushUnknownProperties(
      relation,
      ['id', 'code', 'name', 'parentEntityId', 'childEntity', 'loadMode'],
      path,
      diagnostics,
    )
    pushUnknownProperties(
      relation.childEntity,
      ['id', 'code', 'name'],
      `${path}.childEntity`,
      diagnostics,
    )
    if (!relation.id || relationIds.has(relation.id))
      diagnostics.push(error('RELATION_ID', '关系主键为空或重复', `${path}.id`))
    else relationIds.add(relation.id)
    if (!DESIGNER_IDENTIFIER_PATTERN.test(relation.code) || relationCodes.has(relation.code)) {
      diagnostics.push(error('RELATION_CODE', '关系编码格式不正确或重复', `${path}.code`))
    } else relationCodes.add(relation.code)
    if (!relation.name) diagnostics.push(error('RELATION_NAME', '关系名称不能为空', `${path}.name`))
    if (relation.parentEntityId !== schema.rootEntity.id) {
      diagnostics.push(
        error('RELATION_PARENT', '一级子表的父实体必须是主实体', `${path}.parentEntityId`),
      )
    }
    diagnoseEntity(relation.childEntity, `${path}.childEntity`, diagnostics)
    if (entityIds.has(relation.childEntity.id)) {
      diagnostics.push(error('ENTITY_ID_DUPLICATE', '实体主键不能重复', `${path}.childEntity.id`))
    } else entityIds.add(relation.childEntity.id)
    if (entityCodes.has(relation.childEntity.code)) {
      diagnostics.push(
        error('ENTITY_CODE_DUPLICATE', '实体编码不能重复', `${path}.childEntity.code`),
      )
    } else entityCodes.add(relation.childEntity.code)
    if (!['SYNC', 'ASYNC'].includes(relation.loadMode)) {
      diagnostics.push(error('RELATION_LOAD_MODE', '关系加载方式不正确', `${path}.loadMode`))
    }
  }
  for (const [index, field] of schema.fields.entries()) {
    if (!entityCodes.has(field.entityCode)) {
      diagnostics.push(
        error(
          'FIELD_ENTITY_REFERENCE',
          '字段引用了不存在的语义实体',
          `$.dataSchema.fields[${index}].entityCode`,
        ),
      )
    }
  }
  diagnoseLayoutDataScopes(document, diagnostics)
  return diagnostics
}

function applyInitialDataModel(
  document: DesignerDocument,
  initial: DesignerInitialDataModel,
): void {
  document.dataSchema = {
    source: {
      provider: initial.provider,
      sourceId: initial.sourceId,
      sourceRevision: initial.sourceRevision,
    },
    rootEntity: toDataEntity(initial.rootEntity),
    relations: initial.relations.map((relation) => ({
      id: relation.relationId,
      code: relation.relationCode,
      name: relation.relationName,
      parentEntityId: relation.parentEntityId,
      childEntity: toDataEntity(relation.childEntity),
      loadMode: relation.loadMode ?? 'SYNC',
    })),
    fields: [],
  }
  document.dataSchema.fields.push(
    ...createInitialFields(document, initial.rootEntity),
    ...initial.relations.flatMap((relation) => createInitialFields(document, relation.childEntity)),
  )
}

function createInitialFields(
  document: DesignerDocument,
  entity: DesignerInitialEntity,
): DesignerField[] {
  return [...entity.fields]
    .sort((left, right) => (left.displayOrder ?? 0) - (right.displayOrder ?? 0))
    .map((field, index) => createInitialField(document, entity, field, index))
}

function createInitialField(
  document: DesignerDocument,
  entity: DesignerInitialEntity,
  initial: DesignerInitialField,
  index: number,
): DesignerField {
  const registration = findDesignerComponent(initial.defaultComponentType)!
  return {
    id: createProtocolId('field'),
    entityCode: entity.entityCode,
    key: initial.fieldCode,
    label: initial.fieldName,
    semanticType: initial.semanticType,
    componentType: registration.componentType,
    configurationVersion: registration.configurationVersion,
    configuration: cloneRecord(registration.defaultConfiguration),
    defaultValue: defaultValueFor(initial.semanticType),
    helpText: '',
    required: initial.required === true,
    validation: {},
    behavior: createDefaultDesignerFieldBehavior(),
    display: {
      placeholder: '',
      hidden: registration.componentType === 'hidden',
      readonly:
        initial.readonly === true || initial.primaryKey === true || initial.systemField === true,
    },
    bindingStatus: 'BOUND',
    primaryKey: initial.primaryKey === true,
    systemField: initial.systemField === true,
    displayOrder: initial.displayOrder ?? index,
    binding: {
      provider: document.dataSchema.source!.provider,
      sourceId: document.dataSchema.source!.sourceId,
      sourceRevision: document.dataSchema.source!.sourceRevision,
      fieldId: initial.fieldId,
      fieldPath: `${entity.entityCode}.${initial.fieldCode}`,
      sourceDataType: initial.sourceDataType,
    },
  }
}

function buildSourceMetadataIndex(
  document: DesignerDocument,
  initial: DesignerInitialDataModel,
): DesignerSourceMetadataIndex {
  if (
    document.dataSchema.source?.provider !== initial.provider ||
    document.dataSchema.source.sourceId !== initial.sourceId
  ) {
    return emptySourceMetadata()
  }
  const index: DesignerSourceMetadataIndex = {
    provider: initial.provider,
    sourceId: initial.sourceId,
    sourceRevision: initial.sourceRevision,
    entities: {},
    fields: {},
    relations: {},
  }
  const initialEntities = [
    initial.rootEntity,
    ...initial.relations.map((relation) => relation.childEntity),
  ]
  for (const entity of initialEntities) {
    const dataEntity =
      document.dataSchema.rootEntity.id === entity.entityId
        ? document.dataSchema.rootEntity
        : document.dataSchema.relations.find(
            (relation) => relation.childEntity.id === entity.entityId,
          )?.childEntity
    if (dataEntity) index.entities[dataEntity.id] = { physicalTableName: entity.physicalTableName }
    for (const initialField of entity.fields) {
      const field = document.dataSchema.fields.find(
        (item) => item.binding?.fieldId === initialField.fieldId,
      )
      if (field) index.fields[field.id] = { physicalColumnName: initialField.physicalColumnName }
    }
  }
  for (const initialRelation of initial.relations) {
    const relation = document.dataSchema.relations.find(
      (item) => item.id === initialRelation.relationId,
    )
    if (relation) {
      index.relations[relation.id] = {
        keyMappings: (initialRelation.keyMappings ?? []).map((mapping) => ({ ...mapping })),
      }
    }
  }
  return index
}

function diagnoseInitialDataModel(initial: DesignerInitialDataModel): DesignerDiagnostic[] {
  const diagnostics: DesignerDiagnostic[] = []
  if (!isPlainRecord(initial)) {
    return [error('INITIAL_TYPE', '首次数据模型参数必须是对象', '$.initialDataModel')]
  }
  if (
    typeof initial.provider !== 'string' ||
    !initial.provider ||
    typeof initial.sourceId !== 'string' ||
    !initial.sourceId
  ) {
    diagnostics.push(error('INITIAL_SOURCE', '首次数据模型参数缺少来源身份', '$.initialDataModel'))
  }
  if (
    initial.sourceRevision !== undefined &&
    (!Number.isInteger(initial.sourceRevision) || initial.sourceRevision < 0)
  ) {
    diagnostics.push(
      error(
        'INITIAL_SOURCE_REVISION',
        '首次来源版本必须是非负整数',
        '$.initialDataModel.sourceRevision',
      ),
    )
  }
  if (!isInitialEntityShape(initial.rootEntity)) {
    diagnostics.push(
      error('INITIAL_ROOT_ENTITY', '首次主实体结构不完整', '$.initialDataModel.rootEntity'),
    )
    return diagnostics
  }
  if (!Array.isArray(initial.relations)) {
    diagnostics.push(
      error('INITIAL_RELATIONS', '首次关系目录必须是数组', '$.initialDataModel.relations'),
    )
    return diagnostics
  }
  const entityIds = new Set<string>()
  const entityCodes = new Set<string>()
  const fieldIds = new Set<string>()
  diagnoseInitialEntity(
    initial.rootEntity,
    '$.initialDataModel.rootEntity',
    diagnostics,
    entityIds,
    entityCodes,
    fieldIds,
  )
  const relationIds = new Set<string>()
  const relationCodes = new Set<string>()
  initial.relations.forEach((relation, index) => {
    const path = `$.initialDataModel.relations[${index}]`
    if (!isInitialRelationShape(relation)) {
      diagnostics.push(error('INITIAL_RELATION_TYPE', '首次一级关系结构不完整', path))
      return
    }
    if (!relation.relationId || relationIds.has(relation.relationId)) {
      diagnostics.push(error('INITIAL_RELATION_ID', '关系主键为空或重复', `${path}.relationId`))
    } else relationIds.add(relation.relationId)
    if (
      !DESIGNER_IDENTIFIER_PATTERN.test(relation.relationCode) ||
      relationCodes.has(relation.relationCode)
    ) {
      diagnostics.push(
        error('INITIAL_RELATION_CODE', '关系编码格式不正确或重复', `${path}.relationCode`),
      )
    } else relationCodes.add(relation.relationCode)
    if (!relation.relationName)
      diagnostics.push(error('INITIAL_RELATION_NAME', '关系名称不能为空', `${path}.relationName`))
    if (relation.parentEntityId !== initial.rootEntity.entityId) {
      diagnostics.push(
        error('INITIAL_RELATION_PARENT', '只允许主实体到一级子实体关系', `${path}.parentEntityId`),
      )
    }
    diagnoseInitialEntity(
      relation.childEntity,
      `${path}.childEntity`,
      diagnostics,
      entityIds,
      entityCodes,
      fieldIds,
    )
    if (relation.loadMode !== undefined && !['SYNC', 'ASYNC'].includes(relation.loadMode)) {
      diagnostics.push(
        error('INITIAL_RELATION_LOAD_MODE', '关系加载方式不正确', `${path}.loadMode`),
      )
    }
    const parentFieldIds = new Set(initial.rootEntity.fields.map((field) => field.fieldId))
    const childFieldIds = new Set(relation.childEntity.fields.map((field) => field.fieldId))
    const keyMappings = Array.isArray(relation.keyMappings) ? relation.keyMappings : []
    if (relation.keyMappings !== undefined && !Array.isArray(relation.keyMappings)) {
      diagnostics.push(
        error('INITIAL_RELATION_KEY_MAPPINGS', '关系键映射必须是数组', `${path}.keyMappings`),
      )
    }
    keyMappings.forEach((mapping, mappingIndex) => {
      const mappingPath = `${path}.keyMappings[${mappingIndex}]`
      if (!isPlainRecord(mapping)) {
        diagnostics.push(error('INITIAL_RELATION_KEY_MAPPING', '关系键映射必须是对象', mappingPath))
        return
      }
      if (!parentFieldIds.has(mapping.parentFieldId)) {
        diagnostics.push(
          error(
            'INITIAL_RELATION_PARENT_FIELD',
            '键映射引用了不存在的主实体字段',
            `${mappingPath}.parentFieldId`,
          ),
        )
      }
      if (!childFieldIds.has(mapping.childFieldId)) {
        diagnostics.push(
          error(
            'INITIAL_RELATION_CHILD_FIELD',
            '键映射引用了不存在的子实体字段',
            `${mappingPath}.childFieldId`,
          ),
        )
      }
    })
  })
  return diagnostics
}

function diagnoseInitialEntity(
  entity: DesignerInitialEntity,
  path: string,
  diagnostics: DesignerDiagnostic[],
  entityIds: Set<string>,
  entityCodes: Set<string>,
  fieldIds: Set<string>,
): void {
  if (!entity.entityId || entityIds.has(entity.entityId))
    diagnostics.push(error('INITIAL_ENTITY_ID', '实体主键为空或重复', `${path}.entityId`))
  else entityIds.add(entity.entityId)
  if (!DESIGNER_IDENTIFIER_PATTERN.test(entity.entityCode) || entityCodes.has(entity.entityCode)) {
    diagnostics.push(error('INITIAL_ENTITY_CODE', '实体编码格式不正确或重复', `${path}.entityCode`))
  } else entityCodes.add(entity.entityCode)
  if (!entity.entityName)
    diagnostics.push(error('INITIAL_ENTITY_NAME', '实体名称不能为空', `${path}.entityName`))
  const fieldCodes = new Set<string>()
  entity.fields.forEach((field, index) => {
    const fieldPath = `${path}.fields[${index}]`
    if (!isPlainRecord(field)) {
      diagnostics.push(error('INITIAL_FIELD_TYPE', '首次字段描述必须是对象', fieldPath))
      return
    }
    if (!field.fieldId || fieldIds.has(field.fieldId))
      diagnostics.push(
        error('INITIAL_FIELD_ID', '字段主键为空或跨实体重复', `${fieldPath}.fieldId`),
      )
    else fieldIds.add(field.fieldId)
    if (!DESIGNER_IDENTIFIER_PATTERN.test(field.fieldCode) || fieldCodes.has(field.fieldCode)) {
      diagnostics.push(
        error('INITIAL_FIELD_CODE', '同一实体字段编码格式不正确或重复', `${fieldPath}.fieldCode`),
      )
    } else fieldCodes.add(field.fieldCode)
    const registration = findDesignerComponent(field.defaultComponentType)
    if (
      !registration ||
      registration.nodeKind !== 'FIELD' ||
      registration.availability === 'UNAVAILABLE' ||
      !registration.compatibleSemanticTypes.includes(field.semanticType)
    ) {
      diagnostics.push(
        error(
          'INITIAL_FIELD_COMPONENT',
          '字段默认控件未注册、不可用或语义不兼容',
          `${fieldPath}.defaultComponentType`,
        ),
      )
    }
  })
}

function diagnoseLayoutDataScopes(
  document: DesignerDocument,
  diagnostics: DesignerDiagnostic[],
): void {
  const relationUsage = new Set<string>()
  const relations = document.dataSchema.relations.filter(isOneToManyRelation)
  const visit = (nodes: DesignerLayoutNode[], entityCode: string, path: string): void => {
    nodes.forEach((node, index) => {
      const nodePath = `${path}[${index}]`
      if (node.nodeType === 'FIELD') {
        const field = document.dataSchema.fields.find((item) => item.id === node.fieldId)
        if (field && field.entityCode !== entityCode) {
          diagnostics.push(
            error(
              'FIELD_ENTITY_SCOPE',
              `字段属于 ${field.entityCode}，当前布局作用域为 ${entityCode}`,
              nodePath,
            ),
          )
        }
        return
      }
      if (SUBTABLE_COMPONENT_TYPES.has(node.componentType)) {
        const relationCode =
          typeof node.configuration.relationCode === 'string' ? node.configuration.relationCode : ''
        const relation = relations.find((item) => item.code === relationCode)
        if (!relation) {
          diagnostics.push(
            error(
              'SUBTABLE_RELATION_REFERENCE',
              '子表引用了不存在的关系',
              `${nodePath}.configuration.relationCode`,
            ),
          )
          return
        }
        if (relationUsage.has(relation.code)) {
          diagnostics.push(
            error(
              'SUBTABLE_RELATION_DUPLICATE',
              '同一关系不能绑定两个可写子表',
              `${nodePath}.configuration.relationCode`,
            ),
          )
        }
        relationUsage.add(relation.code)
        node.slots.forEach((slot, slotIndex) =>
          visit(
            slot.children,
            relation.childEntity.code,
            `${nodePath}.slots[${slotIndex}].children`,
          ),
        )
        return
      }
      node.slots.forEach((slot, slotIndex) =>
        visit(slot.children, entityCode, `${nodePath}.slots[${slotIndex}].children`),
      )
    })
  }
  visit(document.uiSchema.root, document.dataSchema.rootEntity.code, '$.uiSchema.root')
}

function diagnoseEntity(
  entity: DesignerDataEntity,
  path: string,
  diagnostics: DesignerDiagnostic[],
): void {
  if (!entity?.id) diagnostics.push(error('ENTITY_ID', '实体主键不能为空', `${path}.id`))
  if (!entity?.name) diagnostics.push(error('ENTITY_NAME', '实体名称不能为空', `${path}.name`))
  if (!DESIGNER_IDENTIFIER_PATTERN.test(entity?.code ?? '')) {
    diagnostics.push(
      error('ENTITY_CODE', '实体编码必须以字母开头且只能包含字母、数字和下划线', `${path}.code`),
    )
  }
}

function nextRelationSerial(document: DesignerDocument): number {
  const used = new Set(document.dataSchema.relations.map((relation) => relation.childEntity.code))
  let serial = 1
  while (used.has(`detail_${serial}`)) serial += 1
  return serial
}

function nextRelationCode(rootCode: string, used: Set<string>, start: number): string {
  let serial = Math.max(1, start)
  let code = `${rootCode}_detail_${serial}`
  while (used.has(code)) {
    serial += 1
    code = `${rootCode}_detail_${serial}`
  }
  return code
}

function nextChildEntityCode(used: Set<string>, start: number): string {
  let serial = Math.max(1, start)
  let code = `detail_${serial}`
  while (used.has(code)) {
    serial += 1
    code = `detail_${serial}`
  }
  return code
}

function relationTitle(node: Extract<DesignerLayoutNode, { nodeType: 'CONTAINER' }>): string {
  return typeof node.configuration.title === 'string' ? node.configuration.title.trim() : ''
}

function toDataEntity(entity: DesignerInitialEntity): DesignerDataEntity {
  return { id: entity.entityId, code: entity.entityCode, name: entity.entityName }
}

function findNode(nodes: DesignerLayoutNode[], nodeId: string): DesignerLayoutNode | undefined {
  for (const node of nodes) {
    if (node.id === nodeId) return node
    if (node.nodeType !== 'CONTAINER') continue
    for (const slot of node.slots) {
      const found = findNode(slot.children, nodeId)
      if (found) return found
    }
  }
  return undefined
}

function isFieldPlaced(nodes: DesignerLayoutNode[], fieldId: string): boolean {
  return nodes.some((node) => {
    if (node.nodeType === 'FIELD') return node.fieldId === fieldId
    return node.slots.some((slot) => isFieldPlaced(slot.children, fieldId))
  })
}

function walkNodes(nodes: DesignerLayoutNode[], visitor: (node: DesignerLayoutNode) => void): void {
  for (const node of nodes) {
    visitor(node)
    if (node.nodeType === 'CONTAINER') {
      node.slots.forEach((slot) => walkNodes(slot.children, visitor))
    }
  }
}

function defaultValueFor(type: DesignerField['semanticType']): unknown {
  if (type === 'ARRAY') return []
  if (type === 'BOOLEAN') return false
  if (type === 'NUMBER' || type === 'OBJECT') return null
  return ''
}

function emptySourceMetadata(): DesignerSourceMetadataIndex {
  return { provider: '', sourceId: '', entities: {}, fields: {}, relations: {} }
}

function error(code: string, message: string, path: string): DesignerDiagnostic {
  return { severity: 'ERROR', code, message, path }
}

function pushUnknownProperties(
  source: object,
  allowed: string[],
  path: string,
  diagnostics: DesignerDiagnostic[],
): void {
  const allowedKeys = new Set(allowed)
  Object.keys(source).forEach((key) => {
    if (!allowedKeys.has(key)) {
      diagnostics.push(
        error('DATA_MODEL_UNKNOWN_PROPERTY', `数据模型不允许属性 ${key}`, `${path}.${key}`),
      )
    }
  })
}

function isDataEntity(value: unknown): value is DesignerDataEntity {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const entity = value as Record<string, unknown>
  return (
    typeof entity.id === 'string' &&
    typeof entity.code === 'string' &&
    typeof entity.name === 'string'
  )
}

function isInitialEntityShape(value: unknown): value is DesignerInitialEntity {
  return isPlainRecord(value) && Array.isArray(value.fields)
}

function isInitialRelationShape(
  value: unknown,
): value is DesignerInitialDataModel['relations'][number] {
  return isPlainRecord(value) && isInitialEntityShape(value.childEntity)
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isOneToManyRelation(value: unknown): value is DesignerOneToManyRelation {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const relation = value as Record<string, unknown>
  return (
    typeof relation.id === 'string' &&
    typeof relation.code === 'string' &&
    typeof relation.name === 'string' &&
    typeof relation.parentEntityId === 'string' &&
    isDataEntity(relation.childEntity)
  )
}

function cloneRecord(source: Readonly<Record<string, unknown>>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(source)) as Record<string, unknown>
}

function cloneDocument(document: DesignerDocument): DesignerDocument {
  return JSON.parse(JSON.stringify(document)) as DesignerDocument
}

function createProtocolId(prefix: string): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replaceAll('-', '')
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`
  return `${prefix}-${random}`
}
