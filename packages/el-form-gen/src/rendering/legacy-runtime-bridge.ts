import {
  createDesignerCollectionKey,
  createDesignerSubtableRow,
  decodeDesignerDocument,
  projectDesignerSubtableColumns,
  type DesignerContainerNode,
  type DesignerDocument,
  type DesignerLayoutNode,
  type DesignerRelationValueStore,
  type DesignerRuntimeCollection,
  type DesignerRuntimeRow,
  type DesignerRuntimeValueStore,
  type DesignerSubmissionProjection,
} from '@daxiangme/form-core'

/** 旧行身份与会话内全局唯一客户端身份之间的局部映射。 */
export interface LegacyRuntimeIdentity {
  /** 旧一级集合所属布局容器。 */
  containerId: string
  /** 宿主原先持有的预览行身份，不解释为持久化身份。 */
  rowId: string
}

/** 旧输入转换后的会话初始化参数及反向身份索引。 */
export interface LegacyRuntimeInput {
  /** 已完成版本迁移与诊断的设计文档。 */
  document: DesignerDocument
  /** 没有持久化身份的一级运行快照。 */
  value: DesignerRelationValueStore
  /** 以不可变客户端行身份索引旧行身份。 */
  identities: Map<string, LegacyRuntimeIdentity>
}

/**
 * 将旧一级输入转换为统一会话所需的运行图。
 *
 * 初次加载、文档切换与重置合并文档默认值；外部受控值替换时保持其原有稀疏字段语义。
 * 不允许借兼容入口传入嵌套关系或多对多，不从字段值猜测持久化身份。
 */
export function createLegacyRuntimeInput(
  source: DesignerDocument,
  controlled: DesignerRuntimeValueStore | undefined,
  includeDefaults = true,
): LegacyRuntimeInput {
  const decoded = decodeDesignerDocument(source)
  if (!decoded.document) throw new Error('旧表单文档未通过结构校验，无法建立运行会话')
  const document = decoded.document
  if (
    document.dataSchema.relations.some(
      (relation) =>
        relation.kind !== 'ONE_TO_MANY' ||
        relation.parentEntityId !== document.dataSchema.rootEntity.id,
    )
  )
    throw new Error('嵌套关系和多对多表单需要使用 session 入口')
  const containers = collectContainers([
    document.uiSchema.root,
    ...document.uiSchema.overlays.map((overlay) => overlay.root),
  ])
  const declared = new Set(containers.map((container) => container.id))
  if (Object.keys(controlled?.collections ?? {}).some((containerId) => !declared.has(containerId)))
    throw new Error('旧运行值包含设计文档中不存在的子表集合')
  const rootKey = `legacy-root-${crypto.randomUUID()}`
  const used = new Set([rootKey])
  const identities = new Map<string, LegacyRuntimeIdentity>()
  const defaults = includeDefaults
    ? Object.fromEntries(
        document.dataSchema.fields
          .filter((field) => field.entityCode === document.dataSchema.rootEntity.code)
          .map((field) => [field.id, cloneLegacyRuntimeValue(field.defaultValue)]),
      )
    : {}
  const root: DesignerRuntimeRow = {
    clientRowKey: rootKey,
    values: { ...defaults, ...cloneLegacyRuntimeValue(controlled?.fields ?? {}) },
  }
  const collections: Record<string, DesignerRuntimeCollection> = {}
  for (const container of containers) {
    const relation = document.dataSchema.relations.find(
      (item) => item.code === container.configuration.relationCode,
    )
    if (!relation) throw new Error('旧表单子表缺少有效语义关系')
    const scope = { containerId: container.id, ancestorRowKeys: [rootKey] }
    const initial =
      controlled?.collections[container.id] ??
      (includeDefaults ? initialRows(container, document) : [])
    const rows = initial.map((row) => {
      const clientRowKey =
        row.rowId && !used.has(row.rowId) ? row.rowId : `legacy-row-${crypto.randomUUID()}`
      used.add(clientRowKey)
      identities.set(clientRowKey, { containerId: container.id, rowId: row.rowId || clientRowKey })
      return { clientRowKey, values: cloneLegacyRuntimeValue(row.values) }
    })
    collections[createDesignerCollectionKey(scope)] = {
      scope,
      relationPath: [relation.id],
      rows,
      loadState: 'COMPLETE',
      totalCount: rows.length,
    }
  }
  return { document, value: { runtimeVersion: '1.0', root, collections, targets: {} }, identities }
}

/** 将会话快照映射回旧一级值，并恢复重复跨集合的旧行身份。 */
export function projectLegacyRuntimeValue(
  value: DesignerRelationValueStore,
  identities: ReadonlyMap<string, LegacyRuntimeIdentity>,
): DesignerRuntimeValueStore {
  const collections: DesignerRuntimeValueStore['collections'] = {}
  for (const collection of Object.values(value.collections)) {
    if (
      collection.scope.ancestorRowKeys.length !== 1 ||
      collection.scope.ancestorRowKeys[0] !== value.root.clientRowKey
    )
      throw new Error('不能将嵌套集合转换为旧一级快照')
    const containerId = collection.scope.containerId
    collections[containerId] = collection.rows.map((row) => ({
      rowId: originalRowId(row.clientRowKey, containerId, identities),
      values: cloneLegacyRuntimeValue(row.values),
    }))
  }
  return { fields: cloneLegacyRuntimeValue(value.root.values), collections }
}

/** 恢复旧提交投影中的宿主预览行身份，不改写字段权限过滤结果。 */
export function restoreLegacySubmissionIdentities(
  projection: DesignerSubmissionProjection,
  identities: ReadonlyMap<string, LegacyRuntimeIdentity>,
): DesignerSubmissionProjection {
  return {
    fields: cloneLegacyRuntimeValue(projection.fields),
    excludedFieldIds: [...projection.excludedFieldIds],
    collections: Object.fromEntries(
      Object.entries(projection.collections).map(([containerId, rows]) => [
        containerId,
        rows.map((row) => ({
          rowId: originalRowId(row.rowId, containerId, identities),
          values: cloneLegacyRuntimeValue(row.values),
        })),
      ]),
    ),
  }
}

/** 比较旧受控值，避免属性顺序变化或等值副本触发会话重建。 */
export function legacyRuntimeValuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (left instanceof Date && right instanceof Date) return left.getTime() === right.getTime()
  if (left instanceof File && right instanceof File)
    return (
      left.name === right.name &&
      left.size === right.size &&
      left.type === right.type &&
      left.lastModified === right.lastModified
    )
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false
  if (Array.isArray(left) !== Array.isArray(right)) return false
  if (!Array.isArray(left) && (!isPlainObject(left) || !isPlainObject(right))) return false
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key) =>
        Object.hasOwn(right, key) &&
        legacyRuntimeValuesEqual(
          (left as Record<string, unknown>)[key],
          (right as Record<string, unknown>)[key],
        ),
    )
  )
}

/** 创建与 Vue 代理隔离的旧值副本，同时保留日期和浏览器文件值。 */
export function cloneLegacyRuntimeValue<T>(value: T): T {
  if (value === undefined || value === null || typeof value !== 'object') return value
  if (value instanceof Date) return new Date(value.getTime()) as T
  if (value instanceof Blob) return value
  if (Array.isArray(value)) return value.map(cloneLegacyRuntimeValue) as T
  if (isPlainObject(value))
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, cloneLegacyRuntimeValue(item)]),
    ) as T
  return value
}

function collectContainers(roots: DesignerLayoutNode[][]): DesignerContainerNode[] {
  const found = new Map<string, DesignerContainerNode>()
  const visit = (nodes: DesignerLayoutNode[]): void => {
    for (const node of nodes) {
      if (node.nodeType !== 'CONTAINER') continue
      if (node.componentType === 'row-subtable' || node.componentType === 'block-subtable') {
        found.set(node.id, node)
        continue
      }
      for (const slot of node.slots) visit(slot.children)
    }
  }
  roots.forEach(visit)
  return [...found.values()]
}

function initialRows(container: DesignerContainerNode, document: DesignerDocument) {
  const count = container.configuration.initialRows
  const amount =
    typeof count === 'number' && Number.isFinite(count)
      ? Math.max(0, Math.min(20, Math.trunc(count)))
      : 0
  const columns = projectDesignerSubtableColumns(container, document.dataSchema.fields)
  const values = Object.fromEntries(
    columns.map((column) => [
      column.fieldId,
      document.dataSchema.fields.find((field) => field.id === column.fieldId)?.defaultValue,
    ]),
  )
  return Array.from({ length: amount }, () => createDesignerSubtableRow(columns, values))
}

function originalRowId(
  clientRowKey: string,
  containerId: string,
  identities: ReadonlyMap<string, LegacyRuntimeIdentity>,
): string {
  const original = identities.get(clientRowKey)
  return original?.containerId === containerId ? original.rowId : clientRowKey
}

function isPlainObject(value: object): boolean {
  return Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null
}
