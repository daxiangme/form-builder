import { findDesignerComponent } from './component-registry'
import {
  createLocalDesignerDataSchema,
  diagnoseDesignerDataModel,
  duplicateDesignerSubtableRelation,
  ensureDesignerSubtableRelation,
  normalizeDesignerDataModel,
  placeDesignerDataField,
  resolveDesignerTargetEntityCode,
} from './data-model'
import {
  createDefaultDesignerFieldBehavior,
  DEFAULT_DESIGNER_ACTION_BAR,
  DEFAULT_DESIGNER_SUBMIT_POLICY,
  diagnoseDesignerAdvancedDocument,
  normalizeDesignerAdvancedDocument,
} from './document-advanced'
import {
  DESIGNER_DOCUMENT_VERSION,
  type DesignerComponentRegistration,
  type DesignerContainerNode,
  type DesignerDiagnostic,
  type DesignerDeviceGrid,
  type DesignerDocument,
  type DesignerDocumentDecodeResult,
  type DesignerDropTarget,
  type DesignerField,
  type DesignerFieldNode,
  type DesignerGenerateLayoutRequest,
  type DesignerLayoutNode,
  type DesignerLayoutSlot,
  type DesignerOutlineItem,
  type DesignerPropertyDefinition,
  type DesignerResponsiveGrid,
} from './types'

const DEFAULT_APPEARANCE: DesignerDocument['appearance'] = {
  labelPosition: 'LEFT',
  labelWidth: 100,
  labelSuffix: '',
  labelAlign: 'RIGHT',
  defaultPlaceholder: '',
  gridGutter: 16,
  rowGap: 8,
  defaultPcSpan: 12,
  defaultMobileSpan: 24,
  readonlyDisplayMode: 'CONTROL',
  size: 'DEFAULT',
  controlRadius: 'THEME',
  containerStyle: 'NONE',
  containerRadius: 'BASE',
}

const SURFACE_CONTAINER_COMPONENT_TYPES = new Set([
  'group',
  'tabs',
  'row-subtable',
  'block-subtable',
])

/** 创建一份不含业务绑定的空设计文档。 */
export function createEmptyDesignerDocument(
  documentId: string,
  name = '自定义表单设计',
): DesignerDocument {
  return {
    documentVersion: DESIGNER_DOCUMENT_VERSION,
    id: documentId,
    name,
    description: '',
    dataSchema: createLocalDesignerDataSchema(name),
    uiSchema: { root: [], overlays: [] },
    appearance: deepClone(DEFAULT_APPEARANCE),
    submitPolicy: deepClone(DEFAULT_DESIGNER_SUBMIT_POLICY),
    actionBar: deepClone(DEFAULT_DESIGNER_ACTION_BAR),
    variables: [],
    dataSources: [],
    eventFlows: [],
    i18n: { enabled: false, defaultLocale: 'zh-CN', locales: ['zh-CN'], entries: [] },
    actions: [],
    extensions: {},
  }
}

/** 创建首次打开时用于产品验收的扁平栅格示例。 */
export function createDemoDesignerDocument(documentId: string): DesignerDocument {
  const document = createEmptyDesignerDocument(documentId)
  const samples: Array<[string, string, Partial<Record<string, unknown>>]> = [
    ['text', '申请主题', { placeholder: '请输入申请主题' }],
    ['select', '申请类型', {}],
    ['textarea', '申请说明', { rows: 4 }],
    ['number', '申请金额', { precision: 2, currencyPrefix: '¥', thousandsSeparator: true }],
    ['date', '期望完成日期', {}],
    ['file', '相关附件', {}],
  ]
  for (const [componentType, label, configuration] of samples) {
    const created = createNodeFromComponent(document, componentType, { label, configuration })
    if (created) document.uiSchema.root.push(created)
  }
  return document
}

/** 根据注册项原子创建本地字段或容器节点。 */
export function createNodeFromComponent(
  document: DesignerDocument,
  componentType: string,
  overrides: { label?: string; configuration?: Record<string, unknown>; entityCode?: string } = {},
): DesignerLayoutNode | undefined {
  const registration = findDesignerComponent(componentType)
  if (!registration || registration.availability === 'UNAVAILABLE') return undefined
  if (registration.nodeKind === 'CONTAINER') {
    const node = createContainerNode(registration, overrides.configuration)
    ensureDesignerSubtableRelation(document, node)
    return node
  }
  const field = createDesignerField(document, registration, overrides)
  document.dataSchema.fields.push(field)
  return createFieldNode(field, registration.defaultSpan, registration.defaultShowLabel)
}

/** 在指定根或命名插槽中插入节点。 */
export function insertDesignerNode(
  document: DesignerDocument,
  node: DesignerLayoutNode,
  target: DesignerDropTarget,
): boolean {
  if (locateNode(document.uiSchema.root, node.id)) return false
  if (detachedDesignerNodeDropRejection(document, node, target)) return false
  const collection = resolveDropCollection(document, target)
  if (!collection) return false
  collection.splice(target.index, 0, node)
  positionDesignerNodeAtColumn(collection, node.id, target.columnStart)
  return true
}

/** 原子移动现有节点，并阻止容器移动到自身后代。 */
export function moveDesignerNode(
  document: DesignerDocument,
  nodeId: string,
  target: DesignerDropTarget,
): boolean {
  const located = locateNode(document.uiSchema.root, nodeId)
  if (!located) return false
  if (designerNodeDropRejection(document, nodeId, target)) return false
  const targetCollection = resolveDropCollection(document, target)
  if (!targetCollection) return false
  const [node] = located.collection.splice(located.index, 1)
  if (!node) return false
  let targetIndex = Math.max(0, Math.min(target.index, targetCollection.length))
  if (targetCollection === located.collection && located.index < target.index) targetIndex -= 1
  targetCollection.splice(Math.max(0, targetIndex), 0, node)
  positionDesignerNodeAtColumn(targetCollection, node.id, target.columnStart)
  return true
}

/**
 * 判断现有节点是否可以进入指定容器。
 *
 * @param nodes 当前完整布局树。
 * @param nodeId 被移动节点标识。
 * @param targetContainerId 目标容器标识；根布局传空值。
 * @returns 不会形成自身后代循环时返回 `true`。
 */
export function canMoveDesignerNode(
  nodes: DesignerLayoutNode[],
  nodeId: string,
  targetContainerId: string | null,
): boolean {
  if (!targetContainerId) return true
  const located = locateNode(nodes, nodeId)
  return Boolean(located && !nodeContainsContainer(located.node, targetContainerId))
}

/**
 * 校验组件目录中的新组件能否放入目标容器。
 *
 * @param document 当前设计文档。
 * @param componentType 待创建的稳定组件编码。
 * @param target 包含目标容器、命名插槽、索引和可选栅格列的完整落点。
 * @returns 空字符串表示允许，否则返回可直接展示的拒绝原因。
 */
export function designerComponentDropRejection(
  document: DesignerDocument,
  componentType: string,
  target: DesignerDropTarget,
): string {
  const registration = findDesignerComponent(componentType)
  if (!registration) return `组件 ${componentType} 未注册`
  if (registration.availability === 'UNAVAILABLE') return registration.unavailableReason
  const targetRejection = dropTargetRejection(document, target)
  if (targetRejection) return targetRejection
  return targetContainerDropRejection(
    document,
    target.containerId,
    registration.nodeKind,
    componentType,
    false,
    0,
    undefined,
  )
}

/**
 * 校验现有设计节点能否移动到目标容器。
 *
 * @param document 当前设计文档。
 * @param nodeId 待移动节点标识。
 * @param target 包含目标容器、命名插槽、索引和可选栅格列的完整落点。
 * @returns 空字符串表示允许，否则返回可直接展示的拒绝原因。
 */
export function designerNodeDropRejection(
  document: DesignerDocument,
  nodeId: string,
  target: DesignerDropTarget,
): string {
  const located = locateNode(document.uiSchema.root, nodeId)
  if (!located) return '拖动节点不存在'
  const targetRejection = dropTargetRejection(document, target)
  if (targetRejection) return targetRejection
  const sourceNode = located.node
  if (target.containerId && nodeContainsContainer(sourceNode, target.containerId)) {
    return '不能把布局移动到自身或其后代'
  }
  if (sourceNode.nodeType === 'CONTAINER') {
    const registration = findDesignerComponent(sourceNode.componentType)
    if (!registration || registration.nodeKind !== 'CONTAINER') return '拖动布局组件未注册'
    if (registration.availability === 'UNAVAILABLE') return registration.unavailableReason
    return targetContainerDropRejection(
      document,
      target.containerId,
      'CONTAINER',
      sourceNode.componentType,
      false,
      nodeSubtreeDepth(sourceNode),
      undefined,
    )
  }
  const fieldId = sourceNode.fieldId
  const field = document.dataSchema.fields.find((item) => item.id === fieldId)
  if (!field) return '字段定义不存在'
  const registration = findDesignerComponent(field.componentType)
  if (!registration || registration.nodeKind !== 'FIELD') return '拖动字段组件未注册'
  if (registration.availability === 'UNAVAILABLE') return registration.unavailableReason
  return targetContainerDropRejection(
    document,
    target.containerId,
    'FIELD',
    field.componentType,
    field.display.hidden,
    0,
    field.entityCode,
  )
}

/** 从布局移除节点；字段仍保留在字段页以支持重新放置。 */
export function removeDesignerNode(
  document: DesignerDocument,
  nodeId: string,
): DesignerLayoutNode | undefined {
  return removeNodeFromCollection(document.uiSchema.root, nodeId)
}

/** 将未放置字段重新加入根布局。 */
export function restoreDesignerFieldNode(
  document: DesignerDocument,
  fieldId: string,
): DesignerFieldNode | undefined {
  return placeDesignerDataField(document, fieldId)
}

/** 为尚未放置的一级关系创建行子表或块子表容器。 */
export function createDesignerRelationContainer(
  document: DesignerDocument,
  relationCode: string,
  componentType: 'row-subtable' | 'block-subtable',
): DesignerContainerNode | undefined {
  const relation = document.dataSchema.relations.find((item) => item.code === relationCode)
  if (!relation) return undefined
  const alreadyPlaced = findRelationContainer(document.uiSchema.root, relationCode)
  if (alreadyPlaced) return alreadyPlaced
  const node = createNodeFromComponent(document, componentType, {
    configuration: { relationCode, title: relation.childEntity.name },
  })
  if (node?.nodeType !== 'CONTAINER') return undefined
  document.uiSchema.root.push(node)
  return node
}

/**
 * 将字段页选择的主实体字段和一级子关系作为一个布局事务写入文档。
 *
 * 已放置字段和关系会被跳过；主键、系统字段不会被自动生成成普通可写控件。
 */
export function generateDesignerDataModelLayout(
  document: DesignerDocument,
  request: DesignerGenerateLayoutRequest,
): { createdNodeIds: string[]; skippedFieldIds: string[] } {
  const createdNodeIds: string[] = []
  const skippedFieldIds: string[] = []
  for (const selection of request.relations) {
    const alreadyPlaced = findRelationContainer(document.uiSchema.root, selection.relationCode)
    const node = createDesignerRelationContainer(
      document,
      selection.relationCode,
      selection.componentType,
    )
    if (node && !alreadyPlaced) createdNodeIds.push(node.id)
  }
  for (const fieldId of request.fieldIds) {
    const field = document.dataSchema.fields.find((item) => item.id === fieldId)
    if (!field || field.primaryKey || field.systemField) {
      skippedFieldIds.push(fieldId)
      continue
    }
    const node = placeDesignerDataField(document, fieldId)
    if (node) createdNodeIds.push(node.id)
    else skippedFieldIds.push(fieldId)
  }
  return { createdNodeIds: [...new Set(createdNodeIds)], skippedFieldIds }
}

/** 永久删除未放置字段，防止布局中出现悬空引用。 */
export function deleteUnplacedDesignerField(document: DesignerDocument, fieldId: string): boolean {
  if (collectPlacedFieldIds(document.uiSchema.root).has(fieldId)) return false
  const index = document.dataSchema.fields.findIndex((item) => item.id === fieldId)
  if (index < 0 || document.dataSchema.fields[index]?.bindingStatus !== 'UNBOUND') return false
  document.dataSchema.fields.splice(index, 1)
  return true
}

/** 复制节点及其字段引用，确保复制后的数据字段保持独立。 */
export function duplicateDesignerNode(
  document: DesignerDocument,
  nodeId: string,
): DesignerLayoutNode | undefined {
  const located = locateNode(document.uiSchema.root, nodeId)
  if (!located) return undefined
  const copy = cloneNodeWithFields(document, located.node)
  located.collection.splice(located.index + 1, 0, copy)
  return copy
}

/** 查找当前布局中的节点。 */
export function findDesignerNode(
  nodes: DesignerLayoutNode[],
  nodeId: string,
): DesignerLayoutNode | undefined {
  return locateNode(nodes, nodeId)?.node
}

/** 返回当前文档已经放置到布局中的字段主键。 */
export function collectPlacedFieldIds(nodes: DesignerLayoutNode[]): Set<string> {
  const result = new Set<string>()
  walkNodes(nodes, (node) => {
    if (node.nodeType === 'FIELD') result.add(node.fieldId)
  })
  return result
}

/** 将布局树投影成大纲数据。 */
export function createDesignerOutline(document: DesignerDocument): DesignerOutlineItem[] {
  const fields = new Map(document.dataSchema.fields.map((field) => [field.id, field]))
  const project = (node: DesignerLayoutNode): DesignerOutlineItem => {
    if (node.nodeType === 'FIELD') {
      const field = fields.get(node.fieldId)
      const registration = field ? findDesignerComponent(field.componentType) : undefined
      return {
        id: node.id,
        label: field?.label ?? '失效字段',
        typeLabel: registration?.name ?? '未知组件',
        children: [],
      }
    }
    const registration = findDesignerComponent(node.componentType)
    return {
      id: node.id,
      label: containerLabel(node, registration),
      typeLabel: registration?.name ?? node.componentType,
      children: node.slots.flatMap((slot) => slot.children.map(project)),
    }
  }
  return document.uiSchema.root.map(project)
}

/** 同步标签页配置与 typed slots，保留仍然存在的标签内容。 */
export function synchronizeContainerSlots(node: DesignerContainerNode): void {
  if (node.componentType !== 'tabs') return
  const configured = normalizeOptions(node.configuration.tabs)
  const labels = configured.length > 0 ? configured.map((item) => item.label) : ['标签页 1']
  const current = [...node.slots]
  node.slots = labels.map((label, index) => ({
    id: current[index]?.id ?? createDesignerId('slot'),
    slotCode: current[index]?.slotCode ?? `tab-${index + 1}`,
    label,
    children: current[index]?.children ?? [],
  }))
}

/** 对未知输入进行解码和完整结构诊断。 */
export function decodeDesignerDocument(source: unknown): DesignerDocumentDecodeResult {
  if (!isRecord(source)) {
    return { diagnostics: [diagnostic('ERROR', 'DOCUMENT_TYPE', '导入内容必须是 JSON 对象', '$')] }
  }
  try {
    const normalized = normalizeDesignerDocument(source)
    const diagnostics = diagnoseDesignerDocumentInternal(normalized)
    if (diagnostics.some((item) => item.severity === 'ERROR')) return { diagnostics }
    return { document: normalized, diagnostics }
  } catch {
    return {
      diagnostics: [
        diagnostic('ERROR', 'DOCUMENT_CLONE', '导入内容必须是可序列化的 JSON 数据', '$'),
      ],
    }
  }
}

/**
 * 校验未知文档输入的版本、字段、组件、布局、typed slots 和引用完整性。
 *
 * 该入口承担导入边界，任何非法结构都必须返回诊断而不能把类型异常抛给工作台。
 */
export function diagnoseDesignerDocument(source: unknown): DesignerDiagnostic[] {
  try {
    return diagnoseDesignerDocumentInternal(
      isRecord(source) ? normalizeDesignerDocument(source) : source,
    )
  } catch {
    return [diagnostic('ERROR', 'DOCUMENT_DIAGNOSTIC', '导入内容结构异常，无法完成安全诊断', '$')]
  }
}

function diagnoseDesignerDocumentInternal(source: unknown): DesignerDiagnostic[] {
  const result: DesignerDiagnostic[] = []
  if (!isRecord(source)) {
    result.push(diagnostic('ERROR', 'DOCUMENT_TYPE', '设计文档必须是对象', '$'))
    return result
  }
  if (source.documentVersion !== DESIGNER_DOCUMENT_VERSION) {
    result.push(
      diagnostic(
        'ERROR',
        'DOCUMENT_VERSION',
        `仅支持 ${DESIGNER_DOCUMENT_VERSION} 版本文档`,
        '$.documentVersion',
      ),
    )
  }
  if (
    typeof source.id !== 'string' ||
    !source.id ||
    typeof source.name !== 'string' ||
    !source.name
  ) {
    result.push(diagnostic('ERROR', 'DOCUMENT_IDENTITY', '文档标识和名称不能为空', '$'))
  }
  if (typeof source.description !== 'string') {
    result.push(diagnostic('ERROR', 'DOCUMENT_DESCRIPTION', '文档说明必须是文本', '$.description'))
  }
  const dataSchema = isRecord(source.dataSchema) ? source.dataSchema : undefined
  const uiSchema = isRecord(source.uiSchema) ? source.uiSchema : undefined
  const fields = dataSchema && Array.isArray(dataSchema.fields) ? dataSchema.fields : undefined
  const root = uiSchema && Array.isArray(uiSchema.root) ? uiSchema.root : undefined
  if (!fields || !root)
    result.push(diagnostic('ERROR', 'DOCUMENT_SCHEMA', '文档缺少 dataSchema 或 uiSchema', '$'))
  if (uiSchema) {
    diagnoseUnknownProperties(
      uiSchema,
      ['root', 'overlays'],
      '$.uiSchema',
      'UI_SCHEMA_UNKNOWN_PROPERTY',
      result,
    )
    if (!Array.isArray(uiSchema.overlays)) {
      result.push(
        diagnostic('ERROR', 'UI_SCHEMA_OVERLAYS', '弹层模块必须是数组', '$.uiSchema.overlays'),
      )
    }
  }
  if (dataSchema) {
    diagnoseUnknownProperties(
      dataSchema,
      ['source', 'rootEntity', 'relations', 'fields'],
      '$.dataSchema',
      'DATA_SCHEMA_UNKNOWN_PROPERTY',
      result,
    )
    if (!isRecord(dataSchema.rootEntity)) {
      result.push(
        diagnostic('ERROR', 'ROOT_ENTITY', '数据模型缺少主实体', '$.dataSchema.rootEntity'),
      )
    }
    if (!Array.isArray(dataSchema.relations)) {
      result.push(
        diagnostic(
          'ERROR',
          'RELATION_CATALOG',
          '一级子表关系目录必须是数组',
          '$.dataSchema.relations',
        ),
      )
    }
  }
  if (!isRecord(source.appearance)) {
    result.push(diagnostic('ERROR', 'DOCUMENT_APPEARANCE', '文档缺少表单外观配置', '$.appearance'))
  } else {
    diagnoseAppearance(source.appearance, '$.appearance', result)
  }
  if (!Array.isArray(source.actions))
    result.push(diagnostic('ERROR', 'DOCUMENT_ACTIONS', '声明式动作必须是数组', '$.actions'))
  if (!isRecord(source.extensions))
    result.push(diagnostic('ERROR', 'DOCUMENT_EXTENSIONS', '扩展配置必须是对象', '$.extensions'))
  const fieldIds = new Set<string>()
  const fieldKeys = new Set<string>()
  const fieldMap = new Map<string, DesignerField>()
  for (const [index, rawField] of (fields ?? []).entries()) {
    const path = `$.dataSchema.fields[${index}]`
    if (!isRecord(rawField)) {
      result.push(diagnostic('ERROR', 'FIELD_TYPE', '字段定义必须是对象', path))
      continue
    }
    const field = rawField as unknown as DesignerField
    diagnoseUnknownProperties(
      rawField,
      [
        'id',
        'entityCode',
        'key',
        'label',
        'semanticType',
        'componentType',
        'configurationVersion',
        'configuration',
        'defaultValue',
        'helpText',
        'required',
        'validation',
        'behavior',
        'display',
        'bindingStatus',
        'primaryKey',
        'systemField',
        'displayOrder',
        'binding',
      ],
      path,
      'FIELD_UNKNOWN_PROPERTY',
      result,
    )
    if (typeof field.id !== 'string' || !field.id || fieldIds.has(field.id)) {
      result.push(diagnostic('ERROR', 'FIELD_ID', '字段主键为空或重复', `${path}.id`))
    } else {
      fieldIds.add(field.id)
      fieldMap.set(field.id, field)
    }
    const scopedFieldKey = `${field.entityCode}\u0000${field.key}`
    if (typeof field.key !== 'string' || !field.key || fieldKeys.has(scopedFieldKey)) {
      result.push(diagnostic('ERROR', 'FIELD_KEY', '字段编码为空或重复', `${path}.key`))
    } else {
      fieldKeys.add(scopedFieldKey)
    }
    if (typeof field.entityCode !== 'string' || !field.entityCode) {
      result.push(
        diagnostic('ERROR', 'FIELD_ENTITY', '字段所属实体编码不能为空', `${path}.entityCode`),
      )
    }
    if (typeof field.label !== 'string' || !field.label) {
      result.push(diagnostic('ERROR', 'FIELD_LABEL', '字段名称不能为空', `${path}.label`))
    }
    if (typeof field.helpText !== 'string' || typeof field.required !== 'boolean') {
      result.push(diagnostic('ERROR', 'FIELD_METADATA', '字段帮助文字或必填配置类型不正确', path))
    }
    if (
      !['UNBOUND', 'BOUND', 'STALE', 'INCOMPATIBLE', 'MISSING'].includes(
        String(field.bindingStatus),
      )
    ) {
      result.push(
        diagnostic('ERROR', 'FIELD_BINDING_STATUS', '字段绑定状态不正确', `${path}.bindingStatus`),
      )
    }
    if (field.binding !== undefined) diagnoseFieldBinding(field.binding, `${path}.binding`, result)
    if (typeof field.primaryKey !== 'boolean' || typeof field.systemField !== 'boolean') {
      result.push(
        diagnostic('ERROR', 'FIELD_SOURCE_FLAGS', '字段主键或系统字段标识类型不正确', path),
      )
    }
    if (!Number.isFinite(field.displayOrder)) {
      result.push(
        diagnostic(
          'ERROR',
          'FIELD_DISPLAY_ORDER',
          '字段显示顺序必须是有限数字',
          `${path}.displayOrder`,
        ),
      )
    }
    const hasConfiguration = isRecord(field.configuration)
    if (!hasConfiguration)
      result.push(
        diagnostic('ERROR', 'FIELD_CONFIGURATION', '字段配置必须是对象', `${path}.configuration`),
      )
    const display = isRecord(field.display) ? field.display : undefined
    if (!display) {
      result.push(diagnostic('ERROR', 'FIELD_DISPLAY', '字段展示配置必须是对象', `${path}.display`))
    } else {
      diagnoseFieldDisplay(display, `${path}.display`, result)
    }
    if (!isRecord(field.validation)) {
      result.push(
        diagnostic('ERROR', 'FIELD_VALIDATION', '字段校验配置必须是对象', `${path}.validation`),
      )
    } else {
      diagnoseFieldValidation(field.validation, `${path}.validation`, result)
    }
    const registration =
      typeof field.componentType === 'string'
        ? findDesignerComponent(field.componentType)
        : undefined
    if (!registration || registration.nodeKind !== 'FIELD') {
      result.push(
        diagnostic(
          'ERROR',
          'FIELD_COMPONENT',
          `字段组件 ${field.componentType} 未注册`,
          `${path}.componentType`,
        ),
      )
      continue
    }
    if (hasConfiguration) {
      diagnoseComponentConfiguration(
        registration,
        field.configuration,
        `${path}.configuration`,
        result,
      )
    }
    if (field.configurationVersion !== registration.configurationVersion) {
      result.push(
        diagnostic(
          'ERROR',
          'FIELD_CONFIGURATION_VERSION',
          `${registration.name}配置版本不兼容`,
          `${path}.configurationVersion`,
        ),
      )
    }
    if (!registration.compatibleSemanticTypes.includes(field.semanticType)) {
      result.push(
        diagnostic(
          'ERROR',
          'FIELD_SEMANTIC_TYPE',
          `${registration.name}不兼容 ${field.semanticType}`,
          `${path}.semanticType`,
        ),
      )
    }
    if (registration.availability !== 'AVAILABLE') {
      result.push(diagnostic('WARNING', 'FIELD_CAPABILITY', registration.unavailableReason, path))
    }
    if (field.componentType === 'hidden' && display?.hidden !== true) {
      result.push(
        diagnostic(
          'ERROR',
          'HIDDEN_COMPONENT_VISIBILITY',
          '隐藏字段组件必须保持隐藏展示状态',
          `${path}.display.hidden`,
        ),
      )
    }
  }
  const nodeIds = new Set<string>()
  if (root)
    diagnoseNodes(root, '$.uiSchema.root', fieldIds, fieldMap, nodeIds, result, 0, new WeakSet())
  if (uiSchema && Array.isArray(uiSchema.overlays)) {
    for (const [index, overlay] of uiSchema.overlays.entries()) {
      if (!isRecord(overlay) || !Array.isArray(overlay.root)) continue
      diagnoseNodes(
        overlay.root,
        `$.uiSchema.overlays[${index}].root`,
        fieldIds,
        fieldMap,
        nodeIds,
        result,
        0,
        new WeakSet(),
      )
    }
  }
  if (
    fields &&
    root &&
    dataSchema &&
    isRecord(dataSchema.rootEntity) &&
    Array.isArray(dataSchema.relations)
  ) {
    result.push(...diagnoseDesignerDataModel(source as unknown as DesignerDocument))
  }
  result.push(...diagnoseDesignerAdvancedDocument(source as unknown as DesignerDocument))
  return result
}

/** 使用 JSON 往返克隆设计文档，确保 Core 状态不携带 Vue 代理。 */
export function cloneDesignerDocument(document: DesignerDocument): DesignerDocument {
  return deepClone(document)
}

/** 生成稳定排序的设计文档快照。 */
export function serializeDesignerDocument(document: DesignerDocument): string {
  return JSON.stringify(document)
}

/** 生成 Core 内部唯一标识；结果不承担数据库主键语义。 */
export function createDesignerId(prefix: string): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replaceAll('-', '')
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`
  return `${prefix}-${random}`
}

function createDesignerField(
  document: DesignerDocument,
  registration: DesignerComponentRegistration,
  overrides: { label?: string; configuration?: Record<string, unknown>; entityCode?: string },
): DesignerField {
  const entityCode = overrides.entityCode ?? document.dataSchema.rootEntity.code
  const serial = nextFieldSerial(document, registration.componentType, entityCode)
  return {
    id: createDesignerId('field'),
    entityCode,
    key: `${registration.componentType.replaceAll('-', '_')}_${serial}`,
    label: overrides.label ?? `${registration.name}${serial}`,
    semanticType: registration.semanticType,
    componentType: registration.componentType,
    configurationVersion: registration.configurationVersion,
    configuration: { ...deepClone(registration.defaultConfiguration), ...overrides.configuration },
    defaultValue: defaultValueFor(registration.semanticType),
    helpText: '',
    required: false,
    validation: {},
    behavior: createDefaultDesignerFieldBehavior(),
    display: { placeholder: '', hidden: registration.componentType === 'hidden', readonly: false },
    bindingStatus: 'UNBOUND',
    primaryKey: false,
    systemField: false,
    displayOrder: document.dataSchema.fields.length,
  }
}

function createFieldNode(
  field: DesignerField,
  defaultSpan: number,
  defaultShowLabel: boolean,
): DesignerFieldNode {
  return {
    nodeType: 'FIELD',
    id: createDesignerId('node'),
    fieldId: field.id,
    layout: createResponsiveGrid(defaultSpan, defaultShowLabel),
  }
}

function createContainerNode(
  registration: DesignerComponentRegistration,
  configuration: Record<string, unknown> | undefined,
): DesignerContainerNode {
  const node: DesignerContainerNode = {
    nodeType: 'CONTAINER',
    id: createDesignerId('node'),
    componentType: registration.componentType,
    configurationVersion: registration.configurationVersion,
    configuration: { ...deepClone(registration.defaultConfiguration), ...configuration },
    layout: createResponsiveGrid(24, registration.defaultShowLabel),
    slots: createDefaultSlots(registration),
  }
  synchronizeContainerSlots(node)
  return node
}

function createDefaultSlots(registration: DesignerComponentRegistration): DesignerLayoutSlot[] {
  if (!registration.acceptsChildren) return []
  if (registration.componentType === 'tabs') {
    return [1, 2].map((index) => ({
      id: createDesignerId('slot'),
      slotCode: `tab-${index}`,
      label: `标签页 ${index}`,
      children: [],
    }))
  }
  return [{ id: createDesignerId('slot'), slotCode: 'content', label: '内容', children: [] }]
}

function createResponsiveGrid(pcSpan: number, showLabel: boolean): DesignerResponsiveGrid {
  return {
    pc: { span: pcSpan, offset: 0, showLabel, labelPosition: 'INHERIT' },
    mobile: { span: 24, offset: 0, showLabel, labelPosition: 'INHERIT' },
  }
}

function positionDesignerNodeAtColumn(
  collection: DesignerLayoutNode[],
  nodeId: string,
  columnStart: number | undefined,
): void {
  if (columnStart === undefined) return
  const nodeIndex = collection.findIndex((item) => item.id === nodeId)
  const node = collection[nodeIndex]
  if (!node || nodeIndex < 0) return
  const desiredStart = Math.max(0, Math.min(23, Math.trunc(columnStart)))
  const span = Math.max(1, Math.min(24, node.layout.pc.span))
  let cursor = 0
  for (const previous of collection.slice(0, nodeIndex)) {
    const previousSpan = Math.max(1, Math.min(24, previous.layout.pc.span))
    const previousOffset = Math.max(0, Math.min(23, previous.layout.pc.offset))
    if (cursor > 0 && cursor + previousOffset + previousSpan > 24) cursor = 0
    cursor = Math.min(24, cursor + previousOffset + previousSpan)
    if (cursor >= 24) cursor = 0
  }
  node.layout.pc.offset = Math.max(0, Math.min(24 - span, desiredStart - cursor))
}

function defaultValueFor(type: DesignerField['semanticType']): unknown {
  if (type === 'ARRAY') return []
  if (type === 'BOOLEAN') return false
  if (type === 'NUMBER') return null
  if (type === 'OBJECT') return null
  return ''
}

function nextFieldSerial(
  document: DesignerDocument,
  componentType: string,
  entityCode: string,
): number {
  const prefix = componentType.replaceAll('-', '_')
  let serial = 1
  while (
    document.dataSchema.fields.some(
      (field) => field.entityCode === entityCode && field.key === `${prefix}_${serial}`,
    )
  )
    serial += 1
  return serial
}

function findContainerSlot(
  nodes: DesignerLayoutNode[],
  containerId: string,
  slotCode: string,
): DesignerLayoutSlot | undefined {
  for (const node of nodes) {
    if (node.nodeType !== 'CONTAINER') continue
    if (node.id === containerId) return node.slots.find((slot) => slot.slotCode === slotCode)
    for (const slot of node.slots) {
      const found = findContainerSlot(slot.children, containerId, slotCode)
      if (found) return found
    }
  }
  return undefined
}

function findRelationContainer(
  nodes: DesignerLayoutNode[],
  relationCode: string,
): DesignerContainerNode | undefined {
  for (const node of nodes) {
    if (node.nodeType !== 'CONTAINER') continue
    if (
      ['row-subtable', 'block-subtable'].includes(node.componentType) &&
      node.configuration.relationCode === relationCode
    ) {
      return node
    }
    for (const slot of node.slots) {
      const found = findRelationContainer(slot.children, relationCode)
      if (found) return found
    }
  }
  return undefined
}

function locateNode(
  nodes: DesignerLayoutNode[],
  nodeId: string,
): { node: DesignerLayoutNode; collection: DesignerLayoutNode[]; index: number } | undefined {
  const index = nodes.findIndex((node) => node.id === nodeId)
  if (index >= 0) return { node: nodes[index]!, collection: nodes, index }
  for (const node of nodes) {
    if (node.nodeType !== 'CONTAINER') continue
    for (const slot of node.slots) {
      const found = locateNode(slot.children, nodeId)
      if (found) return found
    }
  }
  return undefined
}

function removeNodeFromCollection(
  nodes: DesignerLayoutNode[],
  nodeId: string,
): DesignerLayoutNode | undefined {
  const found = locateNode(nodes, nodeId)
  if (!found) return undefined
  return found.collection.splice(found.index, 1)[0]
}

function cloneNodeWithFields(
  document: DesignerDocument,
  node: DesignerLayoutNode,
): DesignerLayoutNode {
  if (node.nodeType === 'FIELD') {
    const source = document.dataSchema.fields.find((field) => field.id === node.fieldId)
    if (!source) return { ...deepClone(node), id: createDesignerId('node') }
    const copy = deepClone(source)
    copy.id = createDesignerId('field')
    copy.key = uniqueFieldKey(document, source.entityCode, `${source.key}_copy`)
    copy.label = `${source.label}副本`
    document.dataSchema.fields.push(copy)
    return { ...deepClone(node), id: createDesignerId('node'), fieldId: copy.id }
  }
  const copy = deepClone(node)
  copy.id = createDesignerId('node')
  copy.slots = copy.slots.map((slot) => ({
    ...slot,
    id: createDesignerId('slot'),
    children: slot.children.map((child) => cloneNodeWithFields(document, child)),
  }))
  if (typeof copy.configuration.title === 'string')
    copy.configuration.title = `${copy.configuration.title}副本`
  duplicateDesignerSubtableRelation(document, node, copy)
  return copy
}

function uniqueFieldKey(document: DesignerDocument, entityCode: string, preferred: string): string {
  let key = preferred
  let serial = 2
  while (
    document.dataSchema.fields.some((field) => field.entityCode === entityCode && field.key === key)
  ) {
    key = `${preferred}_${serial}`
    serial += 1
  }
  return key
}

function walkNodes(nodes: DesignerLayoutNode[], visitor: (node: DesignerLayoutNode) => void): void {
  for (const node of nodes) {
    visitor(node)
    if (node.nodeType === 'CONTAINER') {
      for (const slot of node.slots) walkNodes(slot.children, visitor)
    }
  }
}

function nodeContainsContainer(node: DesignerLayoutNode, containerId: string): boolean {
  if (node.nodeType !== 'CONTAINER') return false
  if (node.id === containerId) return true
  return node.slots.some((slot) =>
    slot.children.some((child) => nodeContainsContainer(child, containerId)),
  )
}

/** 返回节点自身以下的最大相对层级，叶子节点为 0。 */
function nodeSubtreeDepth(node: DesignerLayoutNode): number {
  if (node.nodeType !== 'CONTAINER') return 0
  return node.slots.reduce(
    (maximum, slot) =>
      Math.max(maximum, ...slot.children.map((child) => 1 + nodeSubtreeDepth(child)), 0),
    0,
  )
}

/** 查找节点在根布局中的零基层级。 */
function findNodeDepth(nodes: DesignerLayoutNode[], nodeId: string, depth = 0): number | undefined {
  for (const node of nodes) {
    if (node.id === nodeId) return depth
    if (node.nodeType !== 'CONTAINER') continue
    for (const slot of node.slots) {
      const found = findNodeDepth(slot.children, nodeId, depth + 1)
      if (found !== undefined) return found
    }
  }
  return undefined
}

function diagnoseNodes(
  nodes: unknown,
  path: string,
  fieldIds: Set<string>,
  fieldMap: Map<string, DesignerField>,
  nodeIds: Set<string>,
  result: DesignerDiagnostic[],
  depth: number,
  seenNodes: WeakSet<object>,
): void {
  if (!Array.isArray(nodes)) {
    result.push(diagnostic('ERROR', 'LAYOUT_COLLECTION', '布局 children 必须是数组', path))
    return
  }
  if (depth > 6) result.push(diagnostic('ERROR', 'LAYOUT_DEPTH', '布局嵌套不能超过 6 层', path))
  for (const [index, rawNode] of nodes.entries()) {
    const nodePath = `${path}[${index}]`
    if (!isRecord(rawNode)) {
      result.push(diagnostic('ERROR', 'NODE_TYPE', '布局节点必须是对象', nodePath))
      continue
    }
    if (seenNodes.has(rawNode)) {
      result.push(diagnostic('ERROR', 'NODE_CYCLE', '布局节点不能形成循环引用', nodePath))
      continue
    }
    seenNodes.add(rawNode)
    const node = rawNode as unknown as DesignerLayoutNode
    if (typeof node.id !== 'string' || !node.id || nodeIds.has(node.id)) {
      result.push(diagnostic('ERROR', 'NODE_ID', '布局节点主键为空或重复', `${nodePath}.id`))
    } else {
      nodeIds.add(node.id)
    }
    if (node.nodeType === 'FIELD') {
      diagnoseUnknownProperties(
        rawNode,
        ['nodeType', 'id', 'fieldId', 'layout'],
        nodePath,
        'FIELD_NODE_UNKNOWN_PROPERTY',
        result,
      )
      if (typeof node.fieldId !== 'string' || !fieldIds.has(node.fieldId))
        result.push(
          diagnostic('ERROR', 'FIELD_REFERENCE', '布局引用了不存在的字段', `${nodePath}.fieldId`),
        )
      diagnoseGrid(node.layout, `${nodePath}.layout`, result)
      continue
    }
    if (node.nodeType !== 'CONTAINER') {
      result.push(
        diagnostic(
          'ERROR',
          'NODE_TYPE',
          '布局节点类型只能是 FIELD 或 CONTAINER',
          `${nodePath}.nodeType`,
        ),
      )
      continue
    }
    diagnoseUnknownProperties(
      rawNode,
      [
        'nodeType',
        'id',
        'componentType',
        'configurationVersion',
        'configuration',
        'layout',
        'slots',
        'eventBindings',
      ],
      nodePath,
      'CONTAINER_NODE_UNKNOWN_PROPERTY',
      result,
    )
    const registration =
      typeof node.componentType === 'string' ? findDesignerComponent(node.componentType) : undefined
    if (!registration || registration.nodeKind !== 'CONTAINER') {
      result.push(
        diagnostic(
          'ERROR',
          'CONTAINER_COMPONENT',
          `布局组件 ${node.componentType} 未注册`,
          `${nodePath}.componentType`,
        ),
      )
    } else {
      if (node.configurationVersion !== registration.configurationVersion) {
        result.push(
          diagnostic(
            'ERROR',
            'CONTAINER_CONFIGURATION_VERSION',
            `${registration.name}配置版本不兼容`,
            `${nodePath}.configurationVersion`,
          ),
        )
      }
      if (registration.availability !== 'AVAILABLE') {
        result.push(
          diagnostic('WARNING', 'CONTAINER_CAPABILITY', registration.unavailableReason, nodePath),
        )
      }
      if (!isRecord(node.configuration)) {
        result.push(
          diagnostic(
            'ERROR',
            'CONTAINER_CONFIGURATION',
            `${registration.name}配置必须是对象`,
            `${nodePath}.configuration`,
          ),
        )
      } else {
        diagnoseComponentConfiguration(
          registration,
          node.configuration,
          `${nodePath}.configuration`,
          result,
        )
      }
      if (!Array.isArray(node.slots)) {
        result.push(
          diagnostic(
            'ERROR',
            'CONTAINER_SLOTS',
            `${registration.name}命名插槽必须是数组`,
            `${nodePath}.slots`,
          ),
        )
      }
    }
    diagnoseGrid(node.layout, `${nodePath}.layout`, result)
    const slots = Array.isArray(node.slots) ? node.slots : []
    const slotCodes = new Set<string>()
    const slotIds = new Set<string>()
    if (registration?.nodeKind === 'CONTAINER') {
      if (!registration.acceptsChildren && slots.length > 0) {
        result.push(
          diagnostic(
            'ERROR',
            'LEAF_CONTAINER_SLOT',
            `${registration.name}不能携带命名插槽或子节点`,
            `${nodePath}.slots`,
          ),
        )
      } else if (registration.acceptsChildren && node.componentType !== 'tabs') {
        if (slots.length !== 1 || slots[0]?.slotCode !== 'content') {
          result.push(
            diagnostic(
              'ERROR',
              'CONTENT_CONTAINER_SLOT',
              `${registration.name}必须且只能包含一个 content 命名插槽`,
              `${nodePath}.slots`,
            ),
          )
        }
      } else if (node.componentType === 'tabs' && slots.length === 0) {
        result.push(
          diagnostic('ERROR', 'TABS_SLOT', '标签页至少需要一个命名插槽', `${nodePath}.slots`),
        )
      }
    }
    for (const [slotIndex, rawSlot] of slots.entries()) {
      const slotPath = `${nodePath}.slots[${slotIndex}]`
      if (!isRecord(rawSlot)) {
        result.push(diagnostic('ERROR', 'SLOT_TYPE', '命名插槽必须是对象', slotPath))
        continue
      }
      const slot = rawSlot as unknown as DesignerLayoutSlot
      if (typeof slot.id !== 'string' || !slot.id || slotIds.has(slot.id))
        result.push(diagnostic('ERROR', 'SLOT_ID', '命名插槽主键为空或重复', `${slotPath}.id`))
      else slotIds.add(slot.id)
      if (typeof slot.label !== 'string')
        result.push(
          diagnostic('ERROR', 'SLOT_LABEL', '命名插槽标签必须是文本', `${slotPath}.label`),
        )
      if (typeof slot.slotCode !== 'string' || !slot.slotCode)
        result.push(diagnostic('ERROR', 'SLOT_CODE', '命名插槽编码不能为空', slotPath))
      else if (slotCodes.has(slot.slotCode))
        result.push(
          diagnostic(
            'ERROR',
            'SLOT_CODE_DUPLICATE',
            '同一容器内命名插槽编码不能重复',
            `${nodePath}.slots[${slotIndex}].slotCode`,
          ),
        )
      else slotCodes.add(slot.slotCode)
      diagnoseUnknownProperties(
        rawSlot,
        ['id', 'slotCode', 'label', 'children'],
        slotPath,
        'SLOT_UNKNOWN_PROPERTY',
        result,
      )
      if (!Array.isArray(slot.children)) {
        result.push(
          diagnostic(
            'ERROR',
            'SLOT_CHILDREN',
            '命名插槽 children 必须是数组',
            `${slotPath}.children`,
          ),
        )
        continue
      }
      if (['row-subtable', 'block-subtable'].includes(node.componentType)) {
        const columnFieldIds = new Set<string>()
        for (const [childIndex, rawChild] of slot.children.entries()) {
          const childPath = `${nodePath}.slots[${slotIndex}].children[${childIndex}]`
          if (!isRecord(rawChild)) {
            result.push(
              diagnostic('ERROR', 'SUBTABLE_CHILD_TYPE', '子表子节点必须是对象', childPath),
            )
            continue
          }
          const child = rawChild as unknown as DesignerLayoutNode
          if (child.nodeType !== 'FIELD') {
            result.push(diagnostic('ERROR', 'SUBTABLE_CHILD', '子表只能包含字段节点', childPath))
            continue
          }
          if (columnFieldIds.has(child.fieldId)) {
            result.push(
              diagnostic(
                'ERROR',
                'SUBTABLE_COLUMN_DUPLICATE',
                '同一子表不能重复引用同一个字段列',
                `${childPath}.fieldId`,
              ),
            )
          }
          columnFieldIds.add(child.fieldId)
          const childField = fieldMap.get(child.fieldId)
          const childDisplay =
            childField && isRecord(childField.display) ? childField.display : undefined
          if (childDisplay?.hidden === true || childField?.componentType === 'hidden') {
            result.push(
              diagnostic(
                'WARNING',
                'SUBTABLE_HIDDEN_FIELD',
                '隐藏字段保留在设计结构中，但不会作为运行子表列展示',
                childPath,
              ),
            )
          }
        }
      }
      diagnoseNodes(
        slot.children,
        `${nodePath}.slots[${slotIndex}].children`,
        fieldIds,
        fieldMap,
        nodeIds,
        result,
        depth + 1,
        seenNodes,
      )
    }
  }
}

/** 对尚未进入布局树的节点执行与移动操作一致的落点约束。 */
function detachedDesignerNodeDropRejection(
  document: DesignerDocument,
  node: DesignerLayoutNode,
  target: DesignerDropTarget,
): string {
  const targetRejection = dropTargetRejection(document, target)
  if (targetRejection) return targetRejection
  if (node.nodeType === 'CONTAINER') {
    const registration = findDesignerComponent(node.componentType)
    if (!registration || registration.nodeKind !== 'CONTAINER') return '待插入布局组件未注册'
    if (registration.availability === 'UNAVAILABLE') return registration.unavailableReason
    return targetContainerDropRejection(
      document,
      target.containerId,
      'CONTAINER',
      node.componentType,
      false,
      nodeSubtreeDepth(node),
      undefined,
    )
  }
  const field = document.dataSchema.fields.find((item) => item.id === node.fieldId)
  if (!field) return '待插入节点引用的字段不存在'
  const registration = findDesignerComponent(field.componentType)
  if (!registration || registration.nodeKind !== 'FIELD') return '待插入字段组件未注册'
  if (registration.availability === 'UNAVAILABLE') return registration.unavailableReason
  return targetContainerDropRejection(
    document,
    target.containerId,
    'FIELD',
    field.componentType,
    field.display.hidden,
    0,
    field.entityCode,
  )
}

/** 校验目标插槽、索引和空白栅格坐标，写入口不会再依赖 UI 预检查。 */
function dropTargetRejection(document: DesignerDocument, target: DesignerDropTarget): string {
  if (!Number.isInteger(target.index)) return '目标位置索引无效'
  if (
    target.columnStart !== undefined &&
    (!Number.isInteger(target.columnStart) || target.columnStart < 0 || target.columnStart > 23)
  ) {
    return '目标栅格起始列必须为 0～23 的整数'
  }
  const collection = resolveDropCollection(document, target)
  if (!collection) return target.containerId ? '目标命名插槽不存在' : '根布局目标无效'
  if (target.index < 0 || target.index > collection.length) return '目标位置超出可插入范围'
  return ''
}

/** 解析经过 DropPolicy 校验的真实写入集合。 */
function resolveDropCollection(
  document: DesignerDocument,
  target: DesignerDropTarget,
): DesignerLayoutNode[] | undefined {
  if (!target.containerId) return target.slotCode === 'root' ? document.uiSchema.root : undefined
  return findContainerSlot(document.uiSchema.root, target.containerId, target.slotCode)?.children
}

/** 对根布局或显式容器执行统一落点约束。 */
function targetContainerDropRejection(
  document: DesignerDocument,
  targetContainerId: string | null,
  sourceKind: DesignerComponentRegistration['nodeKind'],
  sourceComponentType: string,
  sourceHidden: boolean,
  sourceSubtreeDepth: number,
  sourceEntityCode: string | undefined,
): string {
  const targetDepth = targetContainerId
    ? findNodeDepth(document.uiSchema.root, targetContainerId)
    : -1
  if (targetContainerId && targetDepth === undefined) return '目标容器不存在'
  if ((targetDepth ?? -1) + 1 + sourceSubtreeDepth > 6) return '布局嵌套不能超过 6 层'
  if (sourceKind === 'FIELD' && sourceEntityCode) {
    const targetEntityCode = resolveDesignerTargetEntityCode(document, targetContainerId)
    if (!targetEntityCode) return '目标子表尚未绑定有效关系'
    if (sourceEntityCode !== targetEntityCode) {
      return `字段属于实体 ${sourceEntityCode}，不能放入实体 ${targetEntityCode} 的布局`
    }
  }
  if (!targetContainerId) return ''
  const target = findDesignerNode(document.uiSchema.root, targetContainerId)
  if (!target || target.nodeType !== 'CONTAINER') return '目标容器不存在'
  const targetRegistration = findDesignerComponent(target.componentType)
  if (!targetRegistration?.acceptsChildren)
    return `${targetRegistration?.name ?? '目标组件'}不接受子节点`
  if (!['row-subtable', 'block-subtable'].includes(target.componentType)) return ''
  if (sourceKind !== 'FIELD') return '子表只能接收字段，不能嵌套布局组件'
  if (sourceHidden || sourceComponentType === 'hidden') return '隐藏字段不能作为子表可见列'
  return ''
}

/** 按当前注册版本的白名单、控件类型和约束诊断组件配置。 */
function diagnoseComponentConfiguration(
  registration: DesignerComponentRegistration,
  configuration: Record<string, unknown>,
  path: string,
  result: DesignerDiagnostic[],
): void {
  const definitions = new Map(registration.properties.map((item) => [item.key, item]))
  const allowedKeys = new Set([
    ...Object.keys(registration.defaultConfiguration),
    ...definitions.keys(),
  ])
  diagnoseUnknownProperties(
    configuration,
    allowedKeys,
    path,
    'COMPONENT_CONFIGURATION_UNKNOWN_PROPERTY',
    result,
  )
  for (const [key, value] of Object.entries(configuration)) {
    if (!allowedKeys.has(key)) continue
    const definition = definitions.get(key)
    if (definition) {
      diagnosePropertyValue(
        registration,
        definition,
        value,
        registration.defaultConfiguration[key] === null,
        `${path}.${key}`,
        result,
      )
      continue
    }
    diagnoseInferredConfigurationValue(
      registration,
      key,
      registration.defaultConfiguration[key],
      value,
      `${path}.${key}`,
      result,
    )
  }
  diagnoseRelatedConfigurationValues(registration, configuration, path, result)
}

function diagnosePropertyValue(
  registration: DesignerComponentRegistration,
  definition: DesignerPropertyDefinition,
  value: unknown,
  nullable: boolean,
  path: string,
  result: DesignerDiagnostic[],
): void {
  if (value === null && nullable) return
  const editor = definition.editor
  if (editor.type === 'IDENTIFIER') {
    if (typeof value !== 'string' || !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(value)) {
      result.push(
        diagnostic(
          'ERROR',
          'COMPONENT_CONFIGURATION_IDENTIFIER',
          `${registration.name}的“${definition.label}”必须以字母开头且只能包含字母、数字和下划线`,
          path,
        ),
      )
    }
    return
  }
  if (
    ['TEXT', 'TEXTAREA', 'COLOR', 'DATE_FORMAT', 'FILE_TYPES', 'RESOURCE_REFERENCE'].includes(
      editor.type,
    )
  ) {
    if (typeof value !== 'string')
      pushConfigurationTypeDiagnostic(registration, definition.label, path, result)
    return
  }
  if (editor.type === 'URL') {
    if (typeof value !== 'string') {
      pushConfigurationTypeDiagnostic(registration, definition.label, path, result)
      return
    }
    if (value && !isHttpsUrl(value)) {
      result.push(
        diagnostic(
          'ERROR',
          'COMPONENT_CONFIGURATION_HTTPS_URL',
          `${registration.name}的“${definition.label}”只允许完整 HTTPS 地址`,
          path,
        ),
      )
    }
    return
  }
  if (editor.type === 'BOOLEAN') {
    if (typeof value !== 'boolean')
      pushConfigurationTypeDiagnostic(registration, definition.label, path, result)
    return
  }
  if (
    editor.type === 'NUMBER' ||
    editor.type === 'PRESET_NUMBER' ||
    editor.type === 'GRID_SPAN' ||
    editor.type === 'GRID_OFFSET'
  ) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      pushConfigurationTypeDiagnostic(registration, definition.label, path, result)
      return
    }
    const minimum = 'minimum' in editor ? editor.minimum : undefined
    const maximum = 'maximum' in editor ? editor.maximum : undefined
    if ((minimum !== undefined && value < minimum) || (maximum !== undefined && value > maximum)) {
      result.push(
        diagnostic(
          'ERROR',
          'COMPONENT_CONFIGURATION_RANGE',
          `${registration.name}的“${definition.label}”超出允许范围`,
          path,
        ),
      )
    }
    return
  }
  if (editor.type === 'SELECT' || editor.type === 'SEGMENTED') {
    const optionValues = editor.options.map((item) => item.value)
    if (
      !optionValues.some((optionValue) => optionValue === value) &&
      editor.legacyValuePolicy !== 'PRESERVE'
    ) {
      result.push(
        diagnostic(
          'ERROR',
          'COMPONENT_CONFIGURATION_ENUM',
          `${registration.name}的“${definition.label}”不是受支持的选项`,
          path,
        ),
      )
    }
    return
  }
  if (editor.type === 'OPTIONS') {
    diagnoseConfigurationOptions(registration, definition.label, value, path, result, new WeakSet())
  }
}

/** 复验同一组件内部的成对配置，避免各属性单独合法但组合后失去业务语义。 */
function diagnoseRelatedConfigurationValues(
  registration: DesignerComponentRegistration,
  configuration: Record<string, unknown>,
  path: string,
  result: DesignerDiagnostic[],
): void {
  diagnoseOrderedConfigurationPair(
    registration,
    configuration,
    'minimum',
    'maximum',
    '最小值',
    '最大值',
    path,
    result,
  )
  diagnoseOrderedConfigurationPair(
    registration,
    configuration,
    'minHeight',
    'maxHeight',
    '最小高度',
    '最大高度',
    path,
    result,
  )
  diagnoseOrderedConfigurationPair(
    registration,
    configuration,
    'minLength',
    'maxLength',
    '最小长度',
    '最大长度',
    path,
    result,
  )
  const minimumSelections = configuration.minimumSelections
  const maximumSelections = configuration.maximumSelections
  if (
    isFiniteNumber(minimumSelections) &&
    isFiniteNumber(maximumSelections) &&
    maximumSelections > 0 &&
    minimumSelections > maximumSelections
  ) {
    result.push(
      diagnostic(
        'ERROR',
        'COMPONENT_CONFIGURATION_RELATION',
        `${registration.name}的最少选择不能大于最多选择`,
        `${path}.minimumSelections`,
      ),
    )
  }
}

function diagnoseOrderedConfigurationPair(
  registration: DesignerComponentRegistration,
  configuration: Record<string, unknown>,
  minimumKey: string,
  maximumKey: string,
  minimumLabel: string,
  maximumLabel: string,
  path: string,
  result: DesignerDiagnostic[],
): void {
  const minimum = configuration[minimumKey]
  const maximum = configuration[maximumKey]
  if (!isFiniteNumber(minimum) || !isFiniteNumber(maximum) || minimum <= maximum) return
  result.push(
    diagnostic(
      'ERROR',
      'COMPONENT_CONFIGURATION_RELATION',
      `${registration.name}的${minimumLabel}不能大于${maximumLabel}`,
      `${path}.${minimumKey}`,
    ),
  )
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

function diagnoseConfigurationOptions(
  registration: DesignerComponentRegistration,
  label: string,
  source: unknown,
  path: string,
  result: DesignerDiagnostic[],
  seen: WeakSet<object>,
): void {
  if (!Array.isArray(source)) {
    pushConfigurationTypeDiagnostic(registration, label, path, result)
    return
  }
  if (seen.has(source)) {
    result.push(
      diagnostic('ERROR', 'COMPONENT_CONFIGURATION_CYCLE', `${label}不能形成循环引用`, path),
    )
    return
  }
  seen.add(source)
  for (const [index, item] of source.entries()) {
    const itemPath = `${path}[${index}]`
    if (['string', 'number', 'boolean'].includes(typeof item)) continue
    if (!isRecord(item)) {
      result.push(
        diagnostic(
          'ERROR',
          'COMPONENT_CONFIGURATION_OPTION',
          `${registration.name}的“${label}”包含无效选项`,
          itemPath,
        ),
      )
      continue
    }
    diagnoseUnknownProperties(
      item,
      ['label', 'value', 'description', 'disabled', 'children'],
      itemPath,
      'COMPONENT_CONFIGURATION_OPTION_UNKNOWN_PROPERTY',
      result,
    )
    if (
      typeof item.label !== 'string' ||
      !['string', 'number', 'boolean'].includes(typeof item.value)
    ) {
      result.push(
        diagnostic(
          'ERROR',
          'COMPONENT_CONFIGURATION_OPTION',
          `${registration.name}的“${label}”选项必须包含文本标签和标量值`,
          itemPath,
        ),
      )
    }
    if (
      item.description !== undefined &&
      item.description !== null &&
      typeof item.description !== 'string'
    ) {
      result.push(
        diagnostic(
          'ERROR',
          'COMPONENT_CONFIGURATION_OPTION',
          '选项说明必须是文本',
          `${itemPath}.description`,
        ),
      )
    }
    if (item.disabled !== undefined && typeof item.disabled !== 'boolean') {
      result.push(
        diagnostic(
          'ERROR',
          'COMPONENT_CONFIGURATION_OPTION',
          '选项禁用状态必须是布尔值',
          `${itemPath}.disabled`,
        ),
      )
    }
    if (item.children !== undefined) {
      diagnoseConfigurationOptions(
        registration,
        label,
        item.children,
        `${itemPath}.children`,
        result,
        seen,
      )
    }
  }
}

function diagnoseInferredConfigurationValue(
  registration: DesignerComponentRegistration,
  key: string,
  expected: unknown,
  value: unknown,
  path: string,
  result: DesignerDiagnostic[],
): void {
  const matches = Array.isArray(expected)
    ? Array.isArray(value)
    : expected === null
      ? value === null
      : typeof value === typeof expected
  if (!matches || (typeof value === 'number' && !Number.isFinite(value))) {
    result.push(
      diagnostic(
        'ERROR',
        'COMPONENT_CONFIGURATION_TYPE',
        `${registration.name}的“${key}”类型不正确`,
        path,
      ),
    )
  }
}

function pushConfigurationTypeDiagnostic(
  registration: DesignerComponentRegistration,
  label: string,
  path: string,
  result: DesignerDiagnostic[],
): void {
  result.push(
    diagnostic(
      'ERROR',
      'COMPONENT_CONFIGURATION_TYPE',
      `${registration.name}的“${label}”类型不正确`,
      path,
    ),
  )
}

function diagnoseFieldDisplay(
  display: Record<string, unknown>,
  path: string,
  result: DesignerDiagnostic[],
): void {
  diagnoseUnknownProperties(
    display,
    ['placeholder', 'hidden', 'readonly'],
    path,
    'FIELD_DISPLAY_UNKNOWN_PROPERTY',
    result,
  )
  if (
    typeof display.hidden !== 'boolean' ||
    typeof display.readonly !== 'boolean' ||
    typeof display.placeholder !== 'string'
  ) {
    result.push(diagnostic('ERROR', 'FIELD_DISPLAY_VALUE', '字段展示配置类型不正确', path))
  }
}

function diagnoseFieldValidation(
  validation: Record<string, unknown>,
  path: string,
  result: DesignerDiagnostic[],
): void {
  diagnoseUnknownProperties(
    validation,
    ['minimumLength', 'maximumLength', 'minimum', 'maximum', 'pattern', 'message'],
    path,
    'FIELD_VALIDATION_UNKNOWN_PROPERTY',
    result,
  )
  for (const key of ['minimumLength', 'maximumLength'] as const) {
    const value = validation[key]
    if (value !== undefined && (!Number.isInteger(value) || (value as number) < 0)) {
      result.push(
        diagnostic('ERROR', 'FIELD_VALIDATION_NUMBER', `${key} 必须是非负整数`, `${path}.${key}`),
      )
    }
  }
  for (const key of ['minimum', 'maximum'] as const) {
    const value = validation[key]
    if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value))) {
      result.push(
        diagnostic('ERROR', 'FIELD_VALIDATION_NUMBER', `${key} 必须是有限数值`, `${path}.${key}`),
      )
    }
  }
  for (const key of ['pattern', 'message'] as const) {
    const value = validation[key]
    if (value !== undefined && typeof value !== 'string') {
      result.push(
        diagnostic('ERROR', 'FIELD_VALIDATION_TEXT', `${key} 必须是文本`, `${path}.${key}`),
      )
    }
  }
}

function diagnoseFieldBinding(source: unknown, path: string, result: DesignerDiagnostic[]): void {
  if (!isRecord(source)) {
    result.push(diagnostic('ERROR', 'FIELD_BINDING', '字段绑定必须是对象', path))
    return
  }
  diagnoseUnknownProperties(
    source,
    ['provider', 'sourceId', 'fieldId', 'fieldPath', 'sourceDataType', 'sourceRevision'],
    path,
    'FIELD_BINDING_UNKNOWN_PROPERTY',
    result,
  )
  for (const key of ['provider', 'sourceId', 'fieldId', 'fieldPath', 'sourceDataType'] as const) {
    if (typeof source[key] !== 'string' || !source[key]) {
      result.push(
        diagnostic('ERROR', 'FIELD_BINDING_VALUE', '字段绑定标识不能为空', `${path}.${key}`),
      )
    }
  }
  if (source.sourceRevision !== undefined && !Number.isInteger(source.sourceRevision)) {
    result.push(
      diagnostic(
        'ERROR',
        'FIELD_BINDING_VALUE',
        '字段来源版本必须是整数',
        `${path}.sourceRevision`,
      ),
    )
  }
}

function diagnoseUnknownProperties(
  source: Record<string, unknown>,
  allowedKeys: Iterable<string>,
  path: string,
  code: string,
  result: DesignerDiagnostic[],
): void {
  const allowed = new Set(allowedKeys)
  for (const key of Object.keys(source)) {
    if (allowed.has(key)) continue
    result.push(diagnostic('ERROR', code, `不支持属性 ${key}`, `${path}.${key}`))
  }
}

/** 校验表单级外观配置，避免合法 JSON 在渲染阶段才因异常类型失败。 */
function diagnoseAppearance(
  appearance: Record<string, unknown>,
  path: string,
  result: DesignerDiagnostic[],
): void {
  diagnoseUnknownProperties(
    appearance,
    [
      'labelPosition',
      'labelWidth',
      'labelSuffix',
      'labelAlign',
      'defaultPlaceholder',
      'gridGutter',
      'rowGap',
      'defaultPcSpan',
      'defaultMobileSpan',
      'readonlyDisplayMode',
      'size',
      'controlRadius',
      'containerStyle',
      'containerRadius',
    ],
    path,
    'APPEARANCE_UNKNOWN_PROPERTY',
    result,
  )
  if (!['TOP', 'LEFT', 'RIGHT'].includes(String(appearance.labelPosition)))
    result.push(
      diagnostic('ERROR', 'APPEARANCE_LABEL_POSITION', '标签位置不正确', `${path}.labelPosition`),
    )
  if (!['LEFT', 'RIGHT'].includes(String(appearance.labelAlign)))
    result.push(
      diagnostic('ERROR', 'APPEARANCE_LABEL_ALIGN', '标签对齐方式不正确', `${path}.labelAlign`),
    )
  if (!['CONTROL', 'TEXT'].includes(String(appearance.readonlyDisplayMode)))
    result.push(
      diagnostic(
        'ERROR',
        'APPEARANCE_READONLY_MODE',
        '只读展示方式不正确',
        `${path}.readonlyDisplayMode`,
      ),
    )
  if (!['SMALL', 'DEFAULT', 'LARGE'].includes(String(appearance.size)))
    result.push(diagnostic('ERROR', 'APPEARANCE_SIZE', '控件尺寸不正确', `${path}.size`))
  if (!['THEME', 'NONE', 'SMALL', 'BASE', 'LARGE'].includes(String(appearance.controlRadius)))
    result.push(
      diagnostic('ERROR', 'APPEARANCE_CONTROL_RADIUS', '控件圆角不正确', `${path}.controlRadius`),
    )
  if (!['NONE', 'BORDERED', 'SHADOW'].includes(String(appearance.containerStyle)))
    result.push(
      diagnostic(
        'ERROR',
        'APPEARANCE_CONTAINER_STYLE',
        '默认容器样式不正确',
        `${path}.containerStyle`,
      ),
    )
  if (!['THEME', 'NONE', 'SMALL', 'BASE', 'LARGE'].includes(String(appearance.containerRadius)))
    result.push(
      diagnostic(
        'ERROR',
        'APPEARANCE_CONTAINER_RADIUS',
        '默认容器圆角不正确',
        `${path}.containerRadius`,
      ),
    )
  for (const [key, minimum, maximum] of [
    ['labelWidth', 0, 320],
    ['gridGutter', 0, 64],
    ['rowGap', 0, 64],
    ['defaultPcSpan', 1, 24],
    ['defaultMobileSpan', 1, 24],
  ] as const) {
    const value = appearance[key]
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value < minimum ||
      value > maximum
    ) {
      result.push(
        diagnostic('ERROR', 'APPEARANCE_NUMBER', `${key} 数值范围不正确`, `${path}.${key}`),
      )
    }
  }
  if (
    typeof appearance.labelSuffix !== 'string' ||
    typeof appearance.defaultPlaceholder !== 'string'
  )
    result.push(diagnostic('ERROR', 'APPEARANCE_TEXT', '表单外观文本配置类型不正确', path))
}

function diagnoseGrid(layout: unknown, path: string, result: DesignerDiagnostic[]): void {
  if (!isRecord(layout)) {
    result.push(diagnostic('ERROR', 'GRID_TYPE', '响应式栅格配置必须是对象', path))
    return
  }
  diagnoseUnknownProperties(layout, ['pc', 'mobile'], path, 'GRID_UNKNOWN_PROPERTY', result)
  for (const device of ['pc', 'mobile'] as const) {
    const rawGrid = layout[device]
    if (!isRecord(rawGrid)) {
      result.push(
        diagnostic(
          'ERROR',
          'GRID_DEVICE_TYPE',
          `${device} 栅格配置必须是对象`,
          `${path}.${device}`,
        ),
      )
      continue
    }
    diagnoseUnknownProperties(
      rawGrid,
      ['span', 'offset', 'showLabel', 'labelPosition'],
      `${path}.${device}`,
      'GRID_DEVICE_UNKNOWN_PROPERTY',
      result,
    )
    const grid = rawGrid as unknown as DesignerDeviceGrid
    const validSpan = Number.isInteger(grid.span) && grid.span >= 1 && grid.span <= 24
    const validOffset = Number.isInteger(grid.offset) && grid.offset >= 0 && grid.offset <= 23
    if (!validSpan) {
      result.push(
        diagnostic(
          'ERROR',
          'GRID_SPAN',
          `${device} 跨度必须为 1～24 的整数`,
          `${path}.${device}.span`,
        ),
      )
    }
    if (!validOffset) {
      result.push(
        diagnostic(
          'ERROR',
          'GRID_OFFSET',
          `${device} 偏移必须为 0～23 的整数`,
          `${path}.${device}.offset`,
        ),
      )
    }
    if (validSpan && validOffset && grid.span + grid.offset > 24) {
      result.push(
        diagnostic(
          'ERROR',
          'GRID_RANGE',
          `${device} 偏移与跨度之和不能超过 24`,
          `${path}.${device}`,
        ),
      )
    }
    if (typeof grid.showLabel !== 'boolean') {
      result.push(
        diagnostic(
          'ERROR',
          'GRID_SHOW_LABEL',
          `${device} 标签显示状态必须是布尔值`,
          `${path}.${device}.showLabel`,
        ),
      )
    }
    if (!['INHERIT', 'TOP', 'LEFT', 'RIGHT'].includes(String(grid.labelPosition))) {
      result.push(
        diagnostic(
          'ERROR',
          'GRID_LABEL_POSITION',
          `${device} 标签位置不正确`,
          `${path}.${device}.labelPosition`,
        ),
      )
    }
  }
}

function containerLabel(
  node: DesignerContainerNode,
  registration: DesignerComponentRegistration | undefined,
): string {
  const title = node.configuration.title ?? node.configuration.text
  return typeof title === 'string' && title.trim()
    ? title
    : (registration?.name ?? node.componentType)
}

function normalizeOptions(source: unknown): Array<{ label: string; value: unknown }> {
  if (!Array.isArray(source)) return []
  return source.map((item, index) => {
    if (isRecord(item))
      return { label: String(item.label ?? `标签页 ${index + 1}`), value: item.value }
    return { label: String(item), value: item }
  })
}

function diagnostic(
  severity: DesignerDiagnostic['severity'],
  code: string,
  message: string,
  path: string,
): DesignerDiagnostic {
  return { severity, code, message, path }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 规范化设计文档的兼容默认值，并保证不修改调用方持有的原始对象。
 *
 * 旧文档缺少的新外观字段按原视觉补齐，并将四类表面容器的 v1 配置迁移为 v2。
 * 已存在但非法的值保持原样，由诊断层失败关闭；原始 localStorage 只会在用户保存时被替换。
 */
function normalizeDesignerDocument(source: unknown): DesignerDocument {
  const normalized = deepClone(source) as unknown
  if (!isRecord(normalized)) return normalized as DesignerDocument
  normalizeDesignerAdvancedDocument(normalized)
  normalizeDesignerAppearance(normalized.appearance)
  if (isRecord(normalized.uiSchema) && Array.isArray(normalized.uiSchema.root)) {
    normalizeSurfaceContainerConfigurations(normalized.uiSchema.root)
    if (isRecord(normalized.dataSchema) && Array.isArray(normalized.dataSchema.fields)) {
      normalizeDesignerDataModel(normalized as unknown as DesignerDocument)
    }
  }
  return normalized as unknown as DesignerDocument
}

function normalizeDesignerAppearance(source: unknown): void {
  if (!isRecord(source)) return
  if (!('rowGap' in source)) source.rowGap = DEFAULT_APPEARANCE.rowGap
  if (!('controlRadius' in source)) source.controlRadius = 'THEME'
  if (!('containerStyle' in source)) source.containerStyle = 'NONE'
  // 旧文档没有容器圆角概念，继续跟随系统才能保持首次加载的原视觉。
  if (!('containerRadius' in source)) source.containerRadius = 'THEME'
}

function normalizeSurfaceContainerConfigurations(nodes: unknown[]): void {
  for (const source of nodes) {
    if (!isRecord(source) || source.nodeType !== 'CONTAINER') continue
    if (
      source.configurationVersion === 1 &&
      SURFACE_CONTAINER_COMPONENT_TYPES.has(String(source.componentType)) &&
      isRecord(source.configuration)
    ) {
      // v1 分组原有样式继续保留；Tabs 与子表过去没有外层样式，统一补为 NONE。
      if (!('surfaceStyle' in source.configuration)) source.configuration.surfaceStyle = 'NONE'
      if (!('surfaceRadius' in source.configuration)) source.configuration.surfaceRadius = 'THEME'
      source.configurationVersion = 2
    }
    if (!Array.isArray(source.slots)) continue
    for (const slot of source.slots) {
      if (isRecord(slot) && Array.isArray(slot.children))
        normalizeSurfaceContainerConfigurations(slot.children)
    }
  }
}

function deepClone<T>(source: T): T {
  return JSON.parse(JSON.stringify(source)) as T
}
