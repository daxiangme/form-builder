import { findDesignerComponent } from './component-registry'
import { createDefaultDesignerFieldBehavior } from './document-advanced'
import type {
  DesignerDataEntity,
  DesignerDiagnostic,
  DesignerDocument,
  DesignerDocumentLimits,
  DesignerField,
  DesignerFieldNode,
  DesignerInitialDataModel,
  DesignerInitialEntity,
  DesignerInitialField,
  DesignerLayoutNode,
  DesignerRelation,
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
  const rootEntity = { id: createProtocolId('entity'), code: 'main', name: name || '主实体' }
  return {
    rootEntity,
    entities: [rootEntity],
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
  const legacy = String(document.documentVersion) === '1.0'
  if (!legacy) return
  if (!('rootEntity' in rawSchema)) {
    schema.rootEntity = createLocalDesignerDataSchema(document.name).rootEntity
  }
  if (!('relations' in rawSchema)) schema.relations = []
  const relations = Array.isArray(schema.relations) ? schema.relations : []
  for (const relation of relations) {
    if (isPlainRecord(relation) && !('kind' in relation))
      Object.assign(relation, { kind: 'ONE_TO_MANY' })
  }
  const validRelations = relations.filter(isDesignerRelation)
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
        kind: 'ONE_TO_MANY',
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
  if (!('entities' in rawSchema)) {
    schema.entities = [
      ...new Map(
        [
          schema.rootEntity,
          ...validRelations.flatMap((relation) =>
            relation.kind === 'MANY_TO_MANY'
              ? [relation.childEntity, relation.targetEntity]
              : [relation.childEntity],
          ),
        ].map((entity) => [entity.id, entity]),
      ).values(),
    ]
  }
  for (const overlay of document.uiSchema.overlays ?? []) {
    if (overlay.dataContext !== 'SUBTABLE_ROW_DRAFT' || overlay.contextEntityId) continue
    const codes = new Set<string>()
    const visit = (nodes: DesignerLayoutNode[]): void => {
      for (const node of nodes) {
        if (node.nodeType === 'FIELD') {
          const field = schema.fields.find((item) => item.id === node.fieldId)
          if (field) codes.add(field.entityCode)
        } else if (!SUBTABLE_COMPONENT_TYPES.has(node.componentType))
          node.slots.forEach((slot) => visit(slot.children))
      }
    }
    visit(overlay.root)
    if (codes.size === 1)
      overlay.contextEntityId = schema.entities.find((entity) => entity.code === [...codes][0])?.id
  }
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
  if (String(document.documentVersion) === '1.0') document.documentVersion = '2.0'
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
  parentEntityCode = document.dataSchema.rootEntity.code,
): DesignerRelation | undefined {
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
  const parentEntity = document.dataSchema.entities.find(
    (entity) => entity.code === parentEntityCode,
  )
  if (!parentEntity) return undefined
  const relationSerial = nextRelationSerial(document)
  const relationCodes = new Set(document.dataSchema.relations.map((relation) => relation.code))
  const entityCodes = new Set(document.dataSchema.entities.map((entity) => entity.code))
  const relation: DesignerRelation = {
    kind: 'ONE_TO_MANY',
    id: createProtocolId('relation'),
    code: nextRelationCode(parentEntity.code, relationCodes, relationSerial),
    name: relationTitle(node) || `明细关系 ${relationSerial}`,
    parentEntityId: parentEntity.id,
    childEntity: {
      id: createProtocolId('entity'),
      code: nextChildEntityCode(entityCodes, relationSerial),
      name: relationTitle(node) || `明细实体 ${relationSerial}`,
    },
    loadMode: 'SYNC',
  }
  document.dataSchema.relations.push(relation)
  document.dataSchema.entities.push(relation.childEntity)
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
  const sourceRelation = document.dataSchema.relations.find(
    (relation) => relation.code === source.configuration.relationCode,
  )
  const parent = document.dataSchema.entities.find(
    (entity) => entity.id === sourceRelation?.parentEntityId,
  )
  copy.configuration = { ...copy.configuration, relationCode: '' }
  const relation = ensureDesignerSubtableRelation(document, copy, parent?.code)
  if (!relation) return
  if (sourceRelation) {
    relation.name = `${sourceRelation.name}副本`
    relation.childEntity.name = `${sourceRelation.childEntity.name}副本`
    if (sourceRelation.kind === 'MANY_TO_MANY') {
      document.dataSchema.relations.splice(document.dataSchema.relations.indexOf(relation), 1, {
        ...relation,
        kind: 'MANY_TO_MANY',
        targetEntity: sourceRelation.targetEntity,
      })
    }
  }
  const reparent = (nodes: DesignerLayoutNode[]): void => {
    for (const child of nodes) {
      if (child.nodeType === 'FIELD') {
        const field = document.dataSchema.fields.find((item) => item.id === child.fieldId)
        if (
          !field ||
          (sourceRelation?.kind === 'MANY_TO_MANY' &&
            field.entityCode === sourceRelation.targetEntity.code)
        )
          continue
        field.entityCode = relation.childEntity.code
        field.bindingStatus = 'UNBOUND'
        field.primaryKey = false
        field.systemField = false
        delete field.binding
      } else if (SUBTABLE_COMPONENT_TYPES.has(child.componentType)) {
        const nested = document.dataSchema.relations.find(
          (item) => item.code === child.configuration.relationCode,
        )
        if (nested) nested.parentEntityId = relation.childEntity.id
      } else child.slots.forEach((slot) => reparent(slot.children))
    }
  }
  copy.slots.forEach((slot) => reparent(slot.children))
  synchronizeEntityReferences(document, relation.childEntity)
}

/** 返回目标落点对应的数据实体编码。 */
export function resolveDesignerTargetEntityCode(
  document: DesignerDocument,
  containerId: string | null,
): string | undefined {
  if (!containerId) return document.dataSchema.rootEntity.code
  const visit = (nodes: DesignerLayoutNode[], entityCode: string): string | undefined => {
    for (const node of nodes) {
      if (node.nodeType !== 'CONTAINER') continue
      let currentCode = entityCode
      if (SUBTABLE_COMPONENT_TYPES.has(node.componentType)) {
        const relation = document.dataSchema.relations.find(
          (item) => item.code === node.configuration.relationCode,
        )
        if (!relation) continue
        currentCode = relation.childEntity.code
      }
      if (node.id === containerId) return currentCode
      for (const slot of node.slots) {
        const found = visit(slot.children, currentCode)
        if (found) return found
      }
    }
    return undefined
  }
  return visit(document.uiSchema.root, document.dataSchema.rootEntity.code)
}

/** 校验字段从当前实体作用域移动到目标作用域是否被允许。 */
export function designerFieldScopeDropRejection(
  document: DesignerDocument,
  field: DesignerField,
  targetContainerId: string | null,
): string {
  const targetEntityCode = resolveDesignerTargetEntityCode(document, targetContainerId)
  if (!targetEntityCode) return '目标子表尚未绑定有效关系'
  if (resolveDesignerTargetEntityCodes(document, targetContainerId).includes(field.entityCode))
    return ''
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
  relationCode?: string,
): DesignerFieldNode | undefined {
  if (!relationCode && isFieldPlaced(document.uiSchema.root, fieldId)) return undefined
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
  if (!relationCode && field.entityCode === document.dataSchema.rootEntity.code) {
    document.uiSchema.root.push(node)
    return node
  }
  const candidates = document.dataSchema.relations
    .filter(
      (item) =>
        (!relationCode || item.code === relationCode) &&
        (item.childEntity.code === field.entityCode ||
          (item.kind === 'MANY_TO_MANY' && item.targetEntity.code === field.entityCode)),
    )
    .flatMap((relation) => {
      const container = findSubtableNodeByRelationCode(document.uiSchema.root, relation.code)
      return container ? [container] : []
    })
  const container = candidates.length === 1 ? candidates[0] : undefined
  const content = container?.slots.find((slot) => slot.slotCode === 'content')
  if (!content || isFieldPlaced(content.children, fieldId)) return undefined
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
  if (
    document.dataSchema.entities.some((entity) => entity.id !== root.id && entity.code === nextCode)
  ) {
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
  synchronizeEntityReferences(document, root)
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
    document.dataSchema.entities.some(
      (entity) => entity.id !== relation.childEntity.id && entity.code === nextChildCode,
    )
  ) {
    return '子实体编码不能与其他实体重复'
  }
  if (patch.name !== undefined && !patch.name.trim()) return '关系名称不能为空'
  if (patch.childEntityName !== undefined && !patch.childEntityName.trim())
    return '子实体名称不能为空'
  const nextKind = patch.kind ?? relation.kind
  const newTarget = patch.createTargetEntity
  if (
    newTarget &&
    (!DESIGNER_IDENTIFIER_PATTERN.test(newTarget.code) ||
      !newTarget.name.trim() ||
      document.dataSchema.entities.some((entity) => entity.code === newTarget.code))
  )
    return '共享实体名称或编码无效，编码必须唯一'
  const target = newTarget
    ? { id: createProtocolId('entity'), code: newTarget.code, name: newTarget.name.trim() }
    : patch.targetEntityId
      ? document.dataSchema.entities.find((entity) => entity.id === patch.targetEntityId)
      : relation.kind === 'MANY_TO_MANY'
        ? relation.targetEntity
        : undefined
  if (nextKind === 'MANY_TO_MANY' && (!target || target.id === relation.childEntity.id))
    return '请选择与关联记录不同的有效共享目标实体'
  if (
    relation.kind === 'MANY_TO_MANY' &&
    (nextKind !== 'MANY_TO_MANY' || target?.id !== relation.targetEntity.id)
  ) {
    const oldTargetCode = relation.targetEntity.code
    let hasTargetLayout = false
    for (const root of [
      document.uiSchema.root,
      ...document.uiSchema.overlays.map((overlay) => overlay.root),
    ])
      walkNodes(root, (node) => {
        if (node.nodeType !== 'CONTAINER' || node.configuration.relationCode !== relation.code)
          return
        const visit = (children: DesignerLayoutNode[]): void => {
          for (const child of children) {
            if (child.nodeType === 'FIELD') {
              if (
                document.dataSchema.fields.find((field) => field.id === child.fieldId)
                  ?.entityCode === oldTargetCode
              )
                hasTargetLayout = true
            } else if (!SUBTABLE_COMPONENT_TYPES.has(child.componentType))
              child.slots.forEach((slot) => visit(slot.children))
          }
        }
        node.slots.forEach((slot) => visit(slot.children))
      })
    if (hasTargetLayout) return '请先移除当前关系布局中的共享目标字段，再修改关系类型或目标实体'
  }
  const previousRelationCode = relation.code
  const previousChildCode = relation.childEntity.code
  relation.code = nextRelationCode
  relation.childEntity.code = nextChildCode
  if (patch.name !== undefined) relation.name = patch.name.trim()
  if (patch.childEntityName !== undefined) relation.childEntity.name = patch.childEntityName.trim()
  for (const root of [
    document.uiSchema.root,
    ...document.uiSchema.overlays.map((overlay) => overlay.root),
  ])
    walkNodes(root, (node) => {
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
  synchronizeEntityReferences(document, relation.childEntity)
  if (newTarget && target) document.dataSchema.entities.push(target)
  const replacement: DesignerRelation =
    nextKind === 'MANY_TO_MANY'
      ? { ...relation, kind: 'MANY_TO_MANY', targetEntity: target! }
      : {
          id: relation.id,
          code: relation.code,
          name: relation.name,
          parentEntityId: relation.parentEntityId,
          childEntity: relation.childEntity,
          loadMode: relation.loadMode,
          kind: 'ONE_TO_MANY',
        }
  document.dataSchema.relations.splice(
    document.dataSchema.relations.indexOf(relation),
    1,
    replacement,
  )
  return ''
}

/** 对持久化数据模型目录执行实体、关系和字段作用域诊断。 */
export function diagnoseDesignerDataModel(
  document: DesignerDocument,
  limits: DesignerDocumentLimits = {},
): DesignerDiagnostic[] {
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
  const entityIds = new Set<string>()
  const entityCodes = new Set<string>()
  const entities = Array.isArray(schema.entities) ? schema.entities : []
  if (!Array.isArray(schema.entities))
    diagnostics.push(
      error('ENTITY_CATALOG', '2.0 文档必须提供规范实体目录', '$.dataSchema.entities'),
    )
  entities.forEach((entity, index) => {
    const path = `$.dataSchema.entities[${index}]`
    if (!isDataEntity(entity)) {
      diagnostics.push(error('ENTITY_TYPE', '实体必须是完整语义对象', path))
      return
    }
    pushUnknownProperties(entity, ['id', 'code', 'name'], path, diagnostics)
    diagnoseEntity(entity, path, diagnostics)
    if (entityIds.has(entity.id))
      diagnostics.push(error('ENTITY_ID_DUPLICATE', '实体目录中 ID 不能重复', `${path}.id`))
    if (entityCodes.has(entity.code))
      diagnostics.push(error('ENTITY_CODE_DUPLICATE', '实体目录中编码不能重复', `${path}.code`))
    entityIds.add(entity.id)
    entityCodes.add(entity.code)
  })
  const checkReference = (entity: DesignerDataEntity, path: string): void => {
    const canonical = entities.find((item) => item.id === entity.id)
    if (!canonical || canonical.code !== entity.code || canonical.name !== entity.name)
      diagnostics.push(
        error('ENTITY_REFERENCE', '实体引用必须与规范目录中的身份、编码和名称一致', path),
      )
  }
  checkReference(schema.rootEntity, '$.dataSchema.rootEntity')
  for (const [index, relation] of schema.relations.entries()) {
    const path = `$.dataSchema.relations[${index}]`
    if (!isDesignerRelation(relation)) {
      diagnostics.push(error('RELATION_TYPE', '关系必须声明合法 kind 和完整实体引用', path))
      continue
    }
    pushUnknownProperties(
      relation,
      [
        'id',
        'code',
        'name',
        'parentEntityId',
        'childEntity',
        'loadMode',
        'kind',
        ...(relation.kind === 'MANY_TO_MANY' ? ['targetEntity'] : []),
      ],
      path,
      diagnostics,
    )
    if (!relation.id || relationIds.has(relation.id))
      diagnostics.push(error('RELATION_ID', '关系主键为空或重复', `${path}.id`))
    relationIds.add(relation.id)
    if (!DESIGNER_IDENTIFIER_PATTERN.test(relation.code) || relationCodes.has(relation.code))
      diagnostics.push(error('RELATION_CODE', '关系编码格式不正确或重复', `${path}.code`))
    relationCodes.add(relation.code)
    if (!relation.name) diagnostics.push(error('RELATION_NAME', '关系名称不能为空', `${path}.name`))
    if (!entityIds.has(relation.parentEntityId))
      diagnostics.push(
        error('RELATION_PARENT', '关系父实体必须存在于实体目录', `${path}.parentEntityId`),
      )
    pushUnknownProperties(
      relation.childEntity,
      ['id', 'code', 'name'],
      `${path}.childEntity`,
      diagnostics,
    )
    checkReference(relation.childEntity, `${path}.childEntity`)
    if (relation.kind === 'MANY_TO_MANY') {
      pushUnknownProperties(
        relation.targetEntity,
        ['id', 'code', 'name'],
        `${path}.targetEntity`,
        diagnostics,
      )
      checkReference(relation.targetEntity, `${path}.targetEntity`)
      if (relation.targetEntity.id === relation.childEntity.id)
        diagnostics.push(
          error('RELATION_TARGET', '关联实体与共享目标实体必须分开', `${path}.targetEntity`),
        )
    }
    if (!['SYNC', 'ASYNC'].includes(relation.loadMode))
      diagnostics.push(error('RELATION_LOAD_MODE', '关系加载方式不正确', `${path}.loadMode`))
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
  diagnoseLayoutDataScopes(document, diagnostics, limits.maxRelationDepth ?? 16)
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
    entities: initialEntityDirectory(initial).map(toDataEntity),
    relations: initial.relations.map((relation): DesignerRelation => ({
      ...(relation.kind === 'MANY_TO_MANY'
        ? { kind: 'MANY_TO_MANY', targetEntity: toDataEntity(relation.targetEntity) }
        : { kind: 'ONE_TO_MANY' }),
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
    ...initialEntityDirectory(initial).flatMap((entity) => createInitialFields(document, entity)),
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
  const initialEntities = initialEntityDirectory(initial)
  for (const entity of initialEntities) {
    const dataEntity = document.dataSchema.entities.find((item) => item.id === entity.entityId)
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
  if (initial.entities !== undefined && !Array.isArray(initial.entities))
    return [
      error('INITIAL_ENTITY_CATALOG', '首次实体目录必须是数组', '$.initialDataModel.entities'),
    ]
  const allEntities = initialEntityDirectory(initial)
  const definitions = new Map<string, DesignerInitialEntity>()
  const rawEntities = [
    initial.rootEntity,
    ...(initial.entities ?? []),
    ...initial.relations.flatMap((relation) =>
      isInitialRelationShape(relation)
        ? relation.kind === 'MANY_TO_MANY'
          ? [relation.childEntity, relation.targetEntity]
          : [relation.childEntity]
        : [],
    ),
  ]
  for (const entity of rawEntities) {
    if (!isInitialEntityShape(entity)) {
      diagnostics.push(
        error('INITIAL_ENTITY_TYPE', '首次实体目录必须包含完整实体', '$.initialDataModel.entities'),
      )
      continue
    }
    const previous = definitions.get(entity.entityId)
    if (previous && JSON.stringify(previous) !== JSON.stringify(entity))
      diagnostics.push(
        error(
          'INITIAL_ENTITY_CONFLICT',
          '同一实体 ID 的重复定义不一致',
          '$.initialDataModel.entities',
        ),
      )
    definitions.set(entity.entityId, entity)
  }
  allEntities.forEach((entity, index) =>
    diagnoseInitialEntity(
      entity,
      `$.initialDataModel.entities[${index}]`,
      diagnostics,
      entityIds,
      entityCodes,
      fieldIds,
    ),
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
    if (!entityIds.has(relation.parentEntityId)) {
      diagnostics.push(
        error('INITIAL_RELATION_PARENT', '关系父实体必须存在于实体目录', `${path}.parentEntityId`),
      )
    }
    if (relation.loadMode !== undefined && !['SYNC', 'ASYNC'].includes(relation.loadMode)) {
      diagnostics.push(
        error('INITIAL_RELATION_LOAD_MODE', '关系加载方式不正确', `${path}.loadMode`),
      )
    }
    const parentFieldIds = new Set(
      allEntities
        .find((entity) => entity.entityId === relation.parentEntityId)
        ?.fields.map((field) => field.fieldId) ?? [],
    )
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
            '键映射引用了不存在的父实体字段',
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
  maxDepth: number,
): void {
  const relations = document.dataSchema.relations.filter(isDesignerRelation)
  const visit = (
    nodes: DesignerLayoutNode[],
    entityId: string,
    path: string,
    chain: string[],
    used: Set<string>,
    targetCode?: string,
  ): void => {
    nodes.forEach((node, index) => {
      const nodePath = `${path}[${index}]`
      const entity = document.dataSchema.entities?.find((item) => item.id === entityId)
      if (node.nodeType === 'FIELD') {
        const field = document.dataSchema.fields.find((item) => item.id === node.fieldId)
        if (field && field.entityCode !== entity?.code && field.entityCode !== targetCode)
          diagnostics.push(
            error(
              'FIELD_ENTITY_SCOPE',
              `字段属于 ${field.entityCode}，当前布局作用域为 ${entity?.code ?? '未知实体'}`,
              nodePath,
            ),
          )
        return
      }
      let childEntityId = entityId
      let childTargetCode = targetCode
      let childChain = chain
      if (SUBTABLE_COMPONENT_TYPES.has(node.componentType)) {
        const relation = relations.find((item) => item.code === node.configuration.relationCode)
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
        if (relation.parentEntityId !== entityId)
          diagnostics.push(
            error(
              'SUBTABLE_RELATION_PARENT',
              '子表关系的父实体与当前布局作用域不一致',
              `${nodePath}.configuration.relationCode`,
            ),
          )
        const usageKey = JSON.stringify([...chain, relation.id])
        if (used.has(usageKey))
          diagnostics.push(
            error(
              'SUBTABLE_RELATION_DUPLICATE',
              '同一父行作用域不能绑定两个可写关系容器',
              nodePath,
            ),
          )
        used.add(usageKey)
        childChain = [...chain, relation.id]
        if (childChain.length > maxDepth) {
          diagnostics.push(error('RELATION_DEPTH', `关系嵌套不能超过 ${maxDepth} 层`, nodePath))
          return
        }
        childEntityId = relation.childEntity.id
        childTargetCode = relation.kind === 'MANY_TO_MANY' ? relation.targetEntity.code : undefined
      }
      node.slots.forEach((slot, slotIndex) =>
        visit(
          slot.children,
          childEntityId,
          `${nodePath}.slots[${slotIndex}].children`,
          childChain,
          used,
          childTargetCode,
        ),
      )
    })
  }
  visit(document.uiSchema.root, document.dataSchema.rootEntity.id, '$.uiSchema.root', [], new Set())
  for (const [index, overlay] of document.uiSchema.overlays.entries()) {
    const entityId =
      overlay.dataContext === 'SUBTABLE_ROW_DRAFT'
        ? overlay.contextEntityId
        : document.dataSchema.rootEntity.id
    if (!entityId || !document.dataSchema.entities?.some((entity) => entity.id === entityId)) {
      if (overlay.root.length > 0)
        diagnostics.push(
          error(
            'OVERLAY_ENTITY_CONTEXT',
            '行草稿必须选择存在的实体上下文',
            `$.uiSchema.overlays[${index}].contextEntityId`,
          ),
        )
      continue
    }
    visit(overlay.root, entityId, `$.uiSchema.overlays[${index}].root`, [], new Set())
  }
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
  return (
    isPlainRecord(value) &&
    isInitialEntityShape(value.childEntity) &&
    (value.kind === undefined ||
      value.kind === 'ONE_TO_MANY' ||
      (value.kind === 'MANY_TO_MANY' && isInitialEntityShape(value.targetEntity)))
  )
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isDesignerRelation(value: unknown): value is DesignerRelation {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const relation = value as Record<string, unknown>
  return (
    (relation.kind === 'ONE_TO_MANY' ||
      (relation.kind === 'MANY_TO_MANY' && isDataEntity(relation.targetEntity))) &&
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

/** 从首次参数归并实体，重复定义由参数诊断另行核对。 */
function initialEntityDirectory(initial: DesignerInitialDataModel): DesignerInitialEntity[] {
  const entries = [
    initial.rootEntity,
    ...(Array.isArray(initial.entities) ? initial.entities : []),
    ...initial.relations.flatMap((relation) =>
      isInitialRelationShape(relation)
        ? relation.kind === 'MANY_TO_MANY'
          ? [relation.childEntity, relation.targetEntity]
          : [relation.childEntity]
        : [],
    ),
  ]
  return [
    ...new Map(
      entries.filter(isInitialEntityShape).map((entity) => [entity.entityId, entity]),
    ).values(),
  ]
}

/** 同步规范实体目录及所有关系引用，避免编辑编码后留下分叉副本。 */
function synchronizeEntityReferences(document: DesignerDocument, entity: DesignerDataEntity): void {
  const schema = document.dataSchema
  for (const candidate of [
    schema.rootEntity,
    ...schema.entities,
    ...schema.relations.flatMap((relation) =>
      relation.kind === 'MANY_TO_MANY'
        ? [relation.childEntity, relation.targetEntity]
        : [relation.childEntity],
    ),
  ]) {
    if (candidate.id === entity.id) Object.assign(candidate, entity)
  }
}

/** 返回落点可呈现的字段实体编码；多对多同时允许关联实体与共享目标，写权限仍分别计算。 */
export function resolveDesignerTargetEntityCodes(
  document: DesignerDocument,
  containerId: string | null,
): string[] {
  if (!containerId) return [document.dataSchema.rootEntity.code]
  const visit = (nodes: DesignerLayoutNode[], codes: string[]): string[] | undefined => {
    for (const node of nodes) {
      if (node.nodeType !== 'CONTAINER') continue
      let next = codes
      if (SUBTABLE_COMPONENT_TYPES.has(node.componentType)) {
        const relation = document.dataSchema.relations.find(
          (item) => item.code === node.configuration.relationCode,
        )
        if (!relation) continue
        next =
          relation.kind === 'MANY_TO_MANY'
            ? [relation.childEntity.code, relation.targetEntity.code]
            : [relation.childEntity.code]
      }
      if (node.id === containerId) return next
      for (const slot of node.slots) {
        const found = visit(slot.children, next)
        if (found) return found
      }
    }
    return undefined
  }
  return visit(document.uiSchema.root, [document.dataSchema.rootEntity.code]) ?? []
}
