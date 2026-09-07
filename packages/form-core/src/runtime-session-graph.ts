import type {
  DesignerContainerNode,
  DesignerDocument,
  DesignerLayoutNode,
  DesignerRelation,
} from './types'
import type {
  DesignerCollectionScope,
  DesignerRelationValueStore,
  DesignerRuntimeIssue,
  DesignerRuntimeLimits,
  DesignerRuntimeRow,
} from './runtime-session-types'

/** 为完整集合地址生成无分隔符歧义的稳定键，不包含任何宿主引用。 */
export function createDesignerCollectionKey(scope: DesignerCollectionScope): string {
  return JSON.stringify([scope.containerId, scope.ancestorRowKeys])
}

/** 为共享目标实体生成会话缓存键；不使用路径授权引用作为实体身份。 */
export function createDesignerTargetKey(entityId: string, identity: string): string {
  return JSON.stringify([entityId, identity])
}

/** 生成基于不可变客户端身份的校验反馈键。 */
export function createDesignerRuntimeFeedbackKey(rowKey: string, fieldId: string): string {
  return JSON.stringify([rowKey, fieldId])
}

/** 会话内节点和语义关系的固定对应关系。 */
export interface RuntimeContainerDefinition {
  node: DesignerContainerNode
  relation: DesignerRelation
  parentContainerId?: string
  relationPath: string[]
  /** 行模块可从同一语义实体的不同布局路径打开。 */
  parentContexts?: Array<{ containerId?: string; relationPath: string[] }>
}

/** 运行行的索引地址；链包含该行自身。 */
export interface RuntimeRowAddress {
  row: DesignerRuntimeRow
  entityId: string
  chain: string[]
  scope?: DesignerCollectionScope
  definition?: RuntimeContainerDefinition
}

/** 仅含受控消息和客户端地址的内部失败。 */
export class RuntimeSessionFailure extends Error {
  readonly issue: DesignerRuntimeIssue
  constructor(issue: DesignerRuntimeIssue) {
    super(issue.message)
    this.issue = issue
  }
}

/** 抛出不包含宿主错误或不透明引用的运行失败。 */
export function failRuntime(
  code: string,
  message: string,
  address: Partial<DesignerRuntimeIssue> = {},
): never {
  throw new RuntimeSessionFailure({ ...address, code, message })
}

/** 复制运行值，保留文件等宿主值对象的正常类型。 */
export function cloneRuntime<T>(value: T): T {
  if (value === undefined || value === null || typeof value !== 'object') return value
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value)
    } catch {
      /* Vue 代理及宿主对象使用递归副本。 */
    }
  }
  if (value instanceof Date) return new Date(value.getTime()) as T
  if (Array.isArray(value)) return value.map(cloneRuntime) as T
  if (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, cloneRuntime(item)]),
    ) as T
  }
  return value
}

/** 对运行字段执行结构相等比较，不序列化或打印宿主引用。 */
export function runtimeValuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (left instanceof Date && right instanceof Date) return left.getTime() === right.getTime()
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false
  if (Array.isArray(left) !== Array.isArray(right)) return false
  if (
    !Array.isArray(left) &&
    (Object.getPrototypeOf(left) !== Object.prototype ||
      Object.getPrototypeOf(right) !== Object.prototype)
  )
    return false
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  if (leftKeys.length !== rightKeys.length) return false
  return leftKeys.every(
    (key) =>
      Object.hasOwn(right, key) &&
      runtimeValuesEqual(
        (left as Record<string, unknown>)[key],
        (right as Record<string, unknown>)[key],
      ),
  )
}

/** 生成不含业务身份的会话内主键。 */
export function createRuntimeKey(prefix: string): string {
  return `${prefix}-${globalThis.crypto.randomUUID()}`
}

/** 索引布局中的所有关系容器，并核对真实父实体和资源限制。 */
export function indexRuntimeContainers(
  document: DesignerDocument,
  limits: DesignerRuntimeLimits,
): Map<string, RuntimeContainerDefinition> {
  const result = new Map<string, RuntimeContainerDefinition>()
  const visit = (
    nodes: DesignerLayoutNode[],
    parent?: RuntimeContainerDefinition,
    depth = 0,
    module = false,
  ): void => {
    if (depth > limits.maxLayoutDepth)
      failRuntime('LAYOUT_DEPTH', '布局深度超过运行限制', { nodeId: nodes[0]?.id })
    for (const node of nodes) {
      if (node.nodeType !== 'CONTAINER') continue
      let current = parent
      if (['row-subtable', 'block-subtable'].includes(node.componentType)) {
        const relation = document.dataSchema.relations.find(
          (item) => item.code === node.configuration.relationCode,
        )
        if (!relation) failRuntime('RELATION_MISSING', '关系容器缺少有效关系定义')
        if (
          relation.parentEntityId !==
          (parent?.relation.childEntity.id ?? document.dataSchema.rootEntity.id)
        ) {
          failRuntime('RELATION_SCOPE', '关系容器与父实体作用域不一致')
        }
        const relationPath = [...(parent?.relationPath ?? []), relation.id]
        if (relationPath.length > limits.maxRelationDepth)
          failRuntime('RELATION_DEPTH', '关系深度超过运行限制', { nodeId: node.id })
        current = { node, relation, parentContainerId: parent?.node.id, relationPath }
        const existing = result.get(node.id)
        if (existing && !module) failRuntime('CONTAINER_DUPLICATE', '关系容器身份重复')
        if (existing) {
          existing.parentContexts ??= [
            { containerId: existing.parentContainerId, relationPath: [...existing.relationPath] },
          ]
          if (
            !existing.parentContexts.some(
              (context) =>
                context.containerId === current?.parentContainerId &&
                runtimeValuesEqual(context.relationPath, relationPath),
            )
          )
            existing.parentContexts.push({ containerId: current.parentContainerId, relationPath })
        } else result.set(node.id, current)
      }
      for (const slot of node.slots) visit(slot.children, current, depth + 1, module)
    }
  }
  visit(document.uiSchema.root)
  for (const overlay of document.uiSchema.overlays) {
    if (overlay.dataContext === 'FORM_DRAFT') visit(overlay.root)
  }
  // 行模块按显式实体上下文继承实际父关系路径；同一模块从不同父实例打开时保持集合隔离。
  for (const overlay of document.uiSchema.overlays) {
    if (overlay.dataContext !== 'SUBTABLE_ROW_DRAFT') continue
    const parents = [...result.values()].filter(
      (definition) => definition.relation.childEntity.id === overlay.contextEntityId,
    )
    if (overlay.contextEntityId === document.dataSchema.rootEntity.id)
      visit(overlay.root, undefined, 0, true)
    else for (const parent of parents) visit(overlay.root, parent, 0, true)
  }
  return result
}

/** 按当前父容器解析行模块的具体关系路径。 */
export function runtimeDefinitionForParent(
  definition: RuntimeContainerDefinition,
  parent?: RuntimeRowAddress,
): RuntimeContainerDefinition | undefined {
  if (!definition.parentContexts)
    return definition.parentContainerId === parent?.scope?.containerId ? definition : undefined
  const context = definition.parentContexts.find(
    (candidate) =>
      candidate.containerId === parent?.scope?.containerId &&
      runtimeValuesEqual(
        candidate.relationPath.slice(0, -1),
        parent?.definition?.relationPath ?? [],
      ),
  )
  return context
    ? {
        ...definition,
        parentContainerId: context.containerId,
        relationPath: [...context.relationPath],
      }
    : undefined
}

/** 建立当前值仓的行索引，同时拒绝孤儿集合、错父链及重复客户端身份。 */
export function indexRuntimeRows(
  value: DesignerRelationValueStore,
  definitions: Map<string, RuntimeContainerDefinition>,
  rootEntityId: string,
  limits: DesignerRuntimeLimits,
): Map<string, RuntimeRowAddress> {
  if (
    value.runtimeVersion !== '1.0' ||
    !value.root?.clientRowKey ||
    !isRuntimeRecord(value.root.values)
  )
    failRuntime('RUNTIME_FORMAT', '运行快照结构或版本不正确')
  const result = new Map<string, RuntimeRowAddress>([
    [
      value.root.clientRowKey,
      { row: value.root, entityId: rootEntityId, chain: [value.root.clientRowKey] },
    ],
  ])
  const collections = Object.entries(value.collections).sort(
    ([, left], [, right]) => left.scope.ancestorRowKeys.length - right.scope.ancestorRowKeys.length,
  )
  for (const [key, collection] of collections) {
    const sourceDefinition = definitions.get(collection.scope.containerId)
    const parentKey = collection.scope.ancestorRowKeys.at(-1)
    const parent = parentKey ? result.get(parentKey) : undefined
    const definition = sourceDefinition
      ? runtimeDefinitionForParent(sourceDefinition, parent)
      : undefined
    if (
      !definition ||
      !parent ||
      parent.entityId !== definition.relation.parentEntityId ||
      parent.scope?.containerId !== definition.parentContainerId ||
      !runtimeValuesEqual(parent.chain, collection.scope.ancestorRowKeys) ||
      key !== createDesignerCollectionKey(collection.scope) ||
      !runtimeValuesEqual(definition.relationPath, collection.relationPath)
    ) {
      failRuntime('COLLECTION_SCOPE', '集合父链、布局位置或关系路径不正确', {
        scope: collection.scope,
      })
    }
    if (!Array.isArray(collection.rows))
      failRuntime('COLLECTION_ROWS', '集合行结构不正确', { scope: collection.scope })
    for (const row of collection.rows) {
      if (!row.clientRowKey || !isRuntimeRecord(row.values) || result.has(row.clientRowKey))
        failRuntime('ROW_IDENTITY', '行客户端身份为空、重复或字段值不正确', {
          scope: collection.scope,
        })
      result.set(row.clientRowKey, {
        row,
        entityId: definition.relation.childEntity.id,
        chain: [...parent.chain, row.clientRowKey],
        scope: collection.scope,
        definition,
      })
    }
  }
  if (result.size > limits.maxLoadedRows) {
    const last = [...result.values()].at(-1)
    failRuntime('ROW_LIMIT', '已加载行数超过运行限制', {
      rowKey: last?.row.clientRowKey,
      scope: last?.scope,
    })
  }
  const identities = new Set<string>()
  for (const item of result.values()) {
    const persistent = item.row.associationRef ?? item.row.recordRef
    if (!persistent) continue
    const key = JSON.stringify([
      item.entityId,
      item.row.associationRef ? 'ASSOCIATION' : 'ROW',
      persistent,
    ])
    if (identities.has(key))
      failRuntime('PERSISTENT_IDENTITY_DUPLICATE', '同一拥有实体或关联记录不能重复装载为两行', {
        rowKey: item.row.clientRowKey,
      })
    identities.add(key)
  }
  return result
}

/** 判断输入是否为普通字段记录。 */
export function isRuntimeRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
