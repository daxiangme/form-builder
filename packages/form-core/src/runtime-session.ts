import { decodeDesignerDocument } from './designer-document'
import { executeDesignerEventFlow } from './event-flow'
import {
  evaluateDesignerCondition,
  evaluateDesignerExpression,
  resolveDesignerFieldEvaluationOrder,
} from './expression'
import {
  applyDesignerFieldAccess,
  isDesignerRuntimeWriteBlocked,
  readDesignerFieldRuntimePolicy,
} from './field-access'
import {
  resolveDesignerFieldState,
  validateDesignerField,
  projectDesignerFieldFeedback,
} from './validation'
import { projectDesignerSubmission } from './submission'
import type {
  DesignerExpression,
  DesignerExpressionFieldScope,
  DesignerExpressionRuntimeContext,
  DesignerField,
  DesignerFormEvent,
  DesignerLayoutNode,
  DesignerResolvedFieldState,
  DesignerSubmissionProjection,
  FormFieldRuntimePolicy,
  FormFieldRuntimePolicyMap,
} from './types'
import type {
  CreateDesignerRuntimeSessionOptions,
  DesignerCollectionScope,
  DesignerRelationCandidate,
  DesignerRelationRequest,
  DesignerRelationValueStore,
  DesignerRuntimeCollection,
  DesignerRuntimeCommand,
  DesignerRuntimeCommandResult,
  DesignerRuntimeIssue,
  DesignerRuntimeLimits,
  DesignerRuntimeRow,
  DesignerRuntimeSession,
  DesignerRuntimeSnapshot,
  DesignerSaveReceipt,
  DesignerSubmissionBatch,
  DesignerSubmissionOperation,
  FormRelationRuntimePolicy,
  FormRelationRuntimePolicyResolver,
} from './runtime-session-types'
import {
  cloneRuntime,
  createDesignerCollectionKey,
  createDesignerRuntimeFeedbackKey,
  createDesignerTargetKey,
  createRuntimeKey,
  failRuntime,
  indexRuntimeContainers,
  indexRuntimeRows,
  runtimeDefinitionForParent,
  RuntimeSessionFailure,
  runtimeValuesEqual,
} from './runtime-session-graph'
import type { RuntimeRowAddress } from './runtime-session-graph'

export {
  createDesignerCollectionKey,
  createDesignerRuntimeFeedbackKey,
  createDesignerTargetKey,
} from './runtime-session-graph'

const EMPTY_POLICY: FormRelationRuntimePolicy = { visible: false, editable: false, operations: {} }
const OPERATION_NAMES = ['CREATE', 'UPDATE', 'DELETE', 'LINK', 'UNLINK'] as const
type TargetOrigins = Record<
  string,
  Record<string, { scope: DesignerCollectionScope; rowKey: string }>
>
type Removal = { address: RuntimeRowAddress; cascade: boolean; operation: 'DELETE' | 'UNLINK' }
type DraftRecord = {
  session: DesignerRuntimeSession
  value: DesignerRelationValueStore
  rowKey: string
  moduleCode?: string
}
const sessionInternals = new WeakMap<
  DesignerRuntimeSession,
  {
    origins: () => TargetOrigins
    removals: () => Removal[]
    lockForConfirmation: () => Promise<() => void>
    fieldState: (rowKey: string, fieldId: string) => DesignerResolvedFieldState
  }
>()

/**
 * 创建唯一拥有关系值、基线、权限、草稿及原子保存批次的纯 TypeScript 会话。
 *
 * 所有业务写入必须经 dispatch；返回的行和快照均为副本。宿主负责最终鉴权和持久化。
 */
export function createDesignerRuntimeSession(
  options: CreateDesignerRuntimeSessionOptions,
): DesignerRuntimeSession {
  return createSession(options)
}

function createSession(
  options: CreateDesignerRuntimeSessionOptions,
  draftRoot?: string,
): DesignerRuntimeSession {
  const limits: DesignerRuntimeLimits = {
    maxRelationDepth: 16,
    maxLayoutDepth: 32,
    maxLoadedRows: 10000,
    ...options.limits,
  }
  const decoded = decodeDesignerDocument(options.document, limits)
  if (!decoded.document) {
    const first = decoded.diagnostics.find((diagnostic) => diagnostic.severity === 'ERROR')
    failRuntime(
      first?.code ?? 'DOCUMENT_INVALID',
      first?.message ?? '设计文档未通过结构校验，无法创建运行会话',
      { path: first?.path },
    )
  }
  const document = decoded.document
  if (Object.values(limits).some((value) => !Number.isInteger(value) || value < 1))
    failRuntime('LIMIT_INVALID', '运行资源限制必须为正整数')
  const definitions = indexRuntimeContainers(document, limits)
  const legacy = options.compatibility === 'LEGACY'
  if (
    legacy &&
    [...definitions.values()].some(
      (definition) =>
        definition.relationPath.length > 1 || definition.relation.kind === 'MANY_TO_MANY',
    )
  )
    failRuntime('LEGACY_RELATION_UNSUPPORTED', '旧快照模式仅支持一级一对多关系')
  const fields = new Map(document.dataSchema.fields.map((field) => [field.id, field]))
  const entityById = new Map(document.dataSchema.entities.map((entity) => [entity.id, entity]))
  const adapters = options.adapters ?? {}
  const adapterContext = cloneRuntime(options.adapterContext ?? {})
  const sessionId = createRuntimeKey('session')
  let mode = options.mode ?? 'CREATE'
  let globalFields = options.fieldRuntimePolicy
  let policyResolver = options.relationRuntimePolicy
  let status: DesignerRuntimeSnapshot['status'] = 'READY'
  let revision = 0
  let baselineRevision = 0
  let epoch = 0
  let pendingSubmission: DesignerSubmissionBatch | undefined
  let issues: DesignerRuntimeIssue[] = []
  let feedbacks: DesignerRuntimeSnapshot['feedbacks'] = {}
  const listeners = new Set<(snapshot: DesignerRuntimeSnapshot) => void>()
  const requests = new Set<AbortController>()
  const loading = new Map<string, AbortController>()
  const activeFlows = new Set<string>()
  const drafts = new Map<string, DraftRecord>()
  const consumedSubmissions = new Set<string>()
  let activeDraft: { draftId: string; rowKey: string; moduleCode?: string } | undefined
  let origins: TargetOrigins = {}
  let removals: Removal[] = []
  let commandQueue = Promise.resolve()
  let submitRequested = false
  let preparation: Promise<DesignerSubmissionBatch | null> | undefined
  let legacyPreparation: Promise<DesignerSubmissionProjection | null> | undefined
  let draftLocked = false
  const changedFieldAddresses = new Set<string>()
  let value: DesignerRelationValueStore = options.initialState
    ? cloneRuntime(options.initialState)
    : {
        runtimeVersion: '1.0',
        root: { clientRowKey: createRuntimeKey('row'), values: {} },
        collections: {},
        targets: {},
      }
  if (!options.initialState && mode !== 'CREATE')
    failRuntime('INITIAL_STATE_REQUIRED', '编辑或只读模式必须提供已有运行值与身份')
  let rows = indexRuntimeRows(value, definitions, document.dataSchema.rootEntity.id, limits)
  const persistedAtStart = Boolean(options.initialState)
  validateStoredIdentities(persistedAtStart && !draftRoot && mode !== 'CREATE' && !legacy)
  mergeInitialTargets()
  if (!options.initialState) value.root.values = defaultValues(document.dataSchema.rootEntity.id)
  ensureCollections()
  let baseline = cloneRuntime(value)
  // 没有持久身份的新增根保留在快照内，由投影器显式生成 CREATE。
  const variables: Record<string, unknown> = Object.fromEntries(
    document.variables.map((variable) => [variable.code, cloneRuntime(variable.initialValue)]),
  )

  function rebuild(): void {
    rows = indexRuntimeRows(value, definitions, document.dataSchema.rootEntity.id, limits)
  }
  function address(rowKey: string): RuntimeRowAddress {
    const found = rows.get(rowKey)
    if (!found) failRuntime('ROW_MISSING', '当前行已不存在', { rowKey })
    return found
  }
  function assertUsable(): void {
    if (status === 'DISPOSED') failRuntime('SESSION_DISPOSED', '运行会话已销毁')
  }
  function assertWritable(internal = false): void {
    assertUsable()
    if (isDesignerRuntimeWriteBlocked(mode)) failRuntime('MODE_READ_ONLY', '当前模式不允许修改数据')
    if (status !== 'READY' && !(internal && status === 'PREPARING'))
      failRuntime('SUBMISSION_LOCKED', '保存结果尚未确认，当前表单已暂停修改')
  }
  function assertDraftScope(item: RuntimeRowAddress): void {
    if (draftRoot && !item.chain.includes(draftRoot))
      failRuntime('DRAFT_SCOPE', '草稿不能修改当前编辑子树之外的数据', {
        rowKey: item.row.clientRowKey,
      })
  }
  function safeIssue(error: unknown): DesignerRuntimeIssue {
    return error instanceof RuntimeSessionFailure
      ? cloneRuntime(error.issue)
      : { code: 'RUNTIME_FAILED', message: '运行操作未完成，请检查当前状态后重试' }
  }
  function emit(): void {
    revision += 1
    if (status === 'DISPOSED') return
    for (const listener of [...listeners]) {
      try {
        listener(snapshot())
      } catch {
        /* 订阅者失败不能破坏已执行的会话命令。 */
      }
    }
  }
  function snapshot(): DesignerRuntimeSnapshot {
    return cloneRuntime({
      sessionId,
      revision,
      baselineRevision,
      status:
        status === 'READY' && (preparation || legacyPreparation || draftLocked)
          ? 'PREPARING'
          : status,
      value,
      dirty: isDirty(),
      issues,
      feedbacks,
      pendingSubmission,
      activeDraft,
    })
  }
  function isDirty(): boolean {
    if (
      removals.length ||
      (!legacy && !value.root.recordRef) ||
      !runtimeValuesEqual(
        submittableValues(value.root.values),
        submittableValues(baseline.root.values),
      )
    )
      return true
    for (const [key, collection] of Object.entries(value.collections)) {
      const previous = baseline.collections[key]
      if (!legacy && collection.rows.some((row) => !row.recordRef && !row.associationRef))
        return true
      if (
        !runtimeValuesEqual(
          collection.rows.map((row) => ({
            clientRowKey: row.clientRowKey,
            values: submittableValues(row.values),
          })),
          (previous?.rows ?? []).map((row) => ({
            clientRowKey: row.clientRowKey,
            values: submittableValues(row.values),
          })),
        )
      )
        return true
    }
    return !runtimeValuesEqual(
      Object.fromEntries(
        Object.entries(value.targets).map(([key, target]) => [
          key,
          submittableValues(target.values),
        ]),
      ),
      Object.fromEntries(
        Object.entries(baseline.targets).map(([key, target]) => [
          key,
          submittableValues(target.values),
        ]),
      ),
    )
  }
  function submittableValues(source: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(source).filter(
        ([fieldId]) => fields.get(fieldId)?.behavior.submitBehavior !== 'EXCLUDE',
      ),
    )
  }
  function defaultValues(entityId: string): Record<string, unknown> {
    const code = entityById.get(entityId)?.code
    return Object.fromEntries(
      document.dataSchema.fields
        .filter((field) => field.entityCode === code && field.defaultValue !== undefined)
        .map((field) => [field.id, cloneRuntime(field.defaultValue)]),
    )
  }
  function validateValues(values: Record<string, unknown>, entityId: string): void {
    const code = entityById.get(entityId)?.code
    for (const fieldId of Object.keys(values))
      if (fields.get(fieldId)?.entityCode !== code)
        failRuntime('FIELD_ENTITY', '字段不属于当前实体', { fieldId })
  }
  function validateStoredIdentities(existing: boolean): void {
    for (const item of rows.values()) {
      validateValues(item.row.values, item.entityId)
      const many = item.definition?.relation.kind === 'MANY_TO_MANY'
      if (existing && !(many ? item.row.associationRef : item.row.recordRef))
        failRuntime('PERSISTENT_IDENTITY_REQUIRED', '已有数据必须提供明确的持久身份', {
          rowKey: item.row.clientRowKey,
        })
      if ((item.row.recordRef || item.row.associationRef) && item.row.version === undefined)
        failRuntime('VERSION_REQUIRED', '已有记录必须提供预期版本', {
          rowKey: item.row.clientRowKey,
        })
      if (many && !item.row.target)
        failRuntime('TARGET_REQUIRED', '关联记录缺少共享目标身份', {
          rowKey: item.row.clientRowKey,
        })
      if (!many && item.row.target)
        failRuntime('TARGET_SCOPE', '普通拥有记录不能携带关联目标', {
          rowKey: item.row.clientRowKey,
        })
    }
  }
  function mergeTarget(row: DesignerRuntimeRow): void {
    if (!row.target) return
    const target = row.target
    if (!target.entityId || !target.identity || !target.reference || target.version === undefined)
      failRuntime('TARGET_IDENTITY', '共享目标身份、引用或版本不完整', { rowKey: row.clientRowKey })
    const item = rows.get(row.clientRowKey)
    if (
      item?.definition?.relation.kind === 'MANY_TO_MANY' &&
      item.definition.relation.targetEntity.id !== target.entityId
    )
      failRuntime('TARGET_ENTITY', '共享目标不属于当前关系定义', { rowKey: row.clientRowKey })
    const key = createDesignerTargetKey(target.entityId, target.identity)
    const current = value.targets[key]
    if (current && current.version !== target.version)
      failRuntime('TARGET_VERSION_CONFLICT', '同一共享目标出现不同版本，请重新加载后处理', {
        rowKey: row.clientRowKey,
      })
    validateValues(target.values ?? {}, target.entityId)
    if (current) {
      for (const [fieldId, fieldValue] of Object.entries(target.values ?? {})) {
        if (origins[key]?.[fieldId]) {
          if (!runtimeValuesEqual(baseline.targets[key]?.values[fieldId], fieldValue))
            failRuntime('TARGET_VALUE_CONFLICT', '共享目标的加载值与脏字段基线冲突', {
              rowKey: row.clientRowKey,
              fieldId,
            })
          continue
        }
        if (
          Object.hasOwn(current.values, fieldId) &&
          !runtimeValuesEqual(current.values[fieldId], fieldValue)
        )
          failRuntime('TARGET_VALUE_CONFLICT', '同一共享目标的已加载字段不一致', {
            rowKey: row.clientRowKey,
            fieldId,
          })
        current.values[fieldId] = cloneRuntime(fieldValue)
      }
    } else
      value.targets[key] = {
        entityId: target.entityId,
        identity: target.identity,
        version: target.version,
        values: cloneRuntime(target.values ?? {}),
      }
    delete target.values
  }
  function mergeInitialTargets(): void {
    for (const item of rows.values()) mergeTarget(item.row)
  }
  function ensureCollections(): void {
    rebuild()
    for (const item of [...rows.values()]) {
      for (const definition of definitions.values()) {
        const scopedDefinition = runtimeDefinitionForParent(definition, item)
        if (!scopedDefinition || definition.relation.parentEntityId !== item.entityId) continue
        const scope = { containerId: definition.node.id, ancestorRowKeys: [...item.chain] }
        const key = createDesignerCollectionKey(scope)
        if (value.collections[key]) continue
        const isNew = !item.row.recordRef && !item.row.associationRef
        value.collections[key] = {
          scope,
          relationPath: [...scopedDefinition.relationPath],
          rows: [],
          loadState: isNew ? 'COMPLETE' : 'UNLOADED',
        }
      }
    }
    rebuild()
  }
  function scopeFor(containerId: string, parentRowKey: string): DesignerCollectionScope {
    const parent = address(parentRowKey)
    const definition = definitions.get(containerId)
    if (
      !definition ||
      definition.relation.parentEntityId !== parent.entityId ||
      !runtimeDefinitionForParent(definition, parent)
    )
      failRuntime('COLLECTION_SCOPE', '目标关系不属于当前父行', { rowKey: parentRowKey })
    return { containerId, ancestorRowKeys: [...parent.chain] }
  }
  function collectionFor(scope: DesignerCollectionScope): DesignerRuntimeCollection {
    const parentKey = scope.ancestorRowKeys.at(-1)
    if (!parentKey || !runtimeValuesEqual(scopeFor(scope.containerId, parentKey), scope))
      failRuntime('COLLECTION_SCOPE', '集合父链不正确', { scope })
    const collection = value.collections[createDesignerCollectionKey(scope)]
    if (!collection) failRuntime('COLLECTION_MISSING', '集合实例不存在', { scope })
    return collection
  }

  function resolvedPolicy(
    context: Parameters<FormRelationRuntimePolicyResolver>[0],
  ): FormRelationRuntimePolicy {
    try {
      const raw = policyResolver?.(cloneRuntime(context))
      if (!raw) {
        if (legacy)
          return {
            visible: true,
            editable: true,
            operations: { CREATE: true, UPDATE: true, DELETE: true },
            cascadeDelete: false,
          }
        if (context.kind === 'ROOT' && !policyResolver)
          return { visible: true, editable: true, operations: { CREATE: true, UPDATE: true } }
        return cloneRuntime(EMPTY_POLICY)
      }
      return {
        visible: raw.visible === true,
        editable: raw.editable === true,
        operations: Object.fromEntries(
          OPERATION_NAMES.map((operation) => [operation, raw.operations?.[operation] === true]),
        ),
        fields: raw.fields,
        targetEditable: raw.targetEditable === true,
        targetFields: raw.targetFields,
        cascadeDelete: raw.cascadeDelete === true,
      }
    } catch {
      return cloneRuntime(EMPTY_POLICY)
    }
  }
  function rootPolicy(): FormRelationRuntimePolicy {
    return resolvedPolicy({ kind: 'ROOT', rowKey: value.root.clientRowKey })
  }
  function readPolicy(scope: DesignerCollectionScope, rowKey?: string): FormRelationRuntimePolicy {
    collectionFor(scope)
    const definition = definitions.get(scope.containerId)!
    const collectionPolicy = resolvedPolicy({
      kind: 'COLLECTION',
      scope,
      relationId: definition.relation.id,
    })
    let result = collectionPolicy
    if (rowKey) {
      const item = address(rowKey)
      if (!runtimeValuesEqual(item.scope, scope))
        failRuntime('ROW_SCOPE', '当前行不属于指定集合', { scope, rowKey })
      const rowPolicy = resolvedPolicy({
        kind: 'ROW',
        scope,
        rowKey,
        relationId: definition.relation.id,
      })
      result = {
        visible: collectionPolicy.visible && rowPolicy.visible,
        editable: collectionPolicy.editable && rowPolicy.editable,
        operations: Object.fromEntries(
          OPERATION_NAMES.map((operation) => [
            operation,
            collectionPolicy.operations[operation] === true &&
              rowPolicy.operations[operation] === true,
          ]),
        ),
        fields: intersectFieldMaps(collectionPolicy.fields, rowPolicy.fields),
        targetEditable:
          collectionPolicy.targetEditable === true && rowPolicy.targetEditable === true,
        targetFields: intersectFieldMaps(
          collectionPolicy.targetFields,
          rowPolicy.targetFields,
          true,
        ),
        cascadeDelete: collectionPolicy.cascadeDelete === true && rowPolicy.cascadeDelete === true,
      }
    }
    const inherited = rootPolicy()
    result.visible &&= inherited.visible
    result.editable &&= inherited.editable
    for (const ancestorKey of scope.ancestorRowKeys.slice(1)) {
      const ancestor = address(ancestorKey)
      const parentPolicy = resolvedPolicy({
        kind: 'ROW',
        scope: ancestor.scope,
        rowKey: ancestorKey,
        relationId: ancestor.definition?.relation.id,
      })
      const parentCollectionPolicy = resolvedPolicy({
        kind: 'COLLECTION',
        scope: ancestor.scope,
        relationId: ancestor.definition?.relation.id,
      })
      result.visible &&= parentPolicy.visible && parentCollectionPolicy.visible
      result.editable &&= parentPolicy.editable && parentCollectionPolicy.editable
    }
    if (isDesignerRuntimeWriteBlocked(mode)) result.editable = false
    if (definition.node.configuration.allowCreate === false) {
      result.operations.CREATE = false
      result.operations.LINK = false
    }
    if (definition.node.configuration.allowDelete === false) {
      result.operations.DELETE = false
      result.operations.UNLINK = false
    }
    return cloneRuntime(result)
  }
  function ownPolicy(item: RuntimeRowAddress): FormRelationRuntimePolicy {
    return item.scope ? readPolicy(item.scope, item.row.clientRowKey) : rootPolicy()
  }
  function fieldPolicy(item: RuntimeRowAddress, field: DesignerField): FormFieldRuntimePolicy {
    const policy = ownPolicy(item)
    const isTarget = item.row.target?.entityId === entityByCode(field.entityCode)
    const belongs = field.entityCode === entityById.get(item.entityId)?.code || isTarget
    if (!belongs || !policy.visible) return { accessLevel: 'HIDDEN' }
    const local = readDesignerFieldRuntimePolicy(
      isTarget ? (policy.targetFields ?? {}) : policy.fields,
      field.id,
    )
    const global = readDesignerFieldRuntimePolicy(globalFields, field.id)
    const intersection = intersectFieldPolicy(global, local)
    if (
      intersection.accessLevel === 'EDITABLE' &&
      (!policy.editable ||
        (isTarget && !policy.targetEditable) ||
        isDesignerRuntimeWriteBlocked(mode))
    )
      return { accessLevel: 'READ_ONLY' }
    return intersection
  }
  function entityByCode(code: string): string | undefined {
    return document.dataSchema.entities.find((entity) => entity.code === code)?.id
  }
  function rawField(item: RuntimeRowAddress, fieldId: string): unknown {
    const field = fields.get(fieldId)
    if (!field || fieldPolicy(item, field).accessLevel === 'HIDDEN')
      failRuntime('FIELD_READ_DENIED', '当前作用域无权读取此字段', {
        rowKey: item.row.clientRowKey,
        fieldId,
      })
    if (field.entityCode === entityById.get(item.entityId)?.code) return item.row.values[fieldId]
    const target = item.row.target
    if (!target || target.entityId !== entityByCode(field.entityCode))
      failRuntime('FIELD_SCOPE', '字段不属于当前行或授权祖先', {
        rowKey: item.row.clientRowKey,
        fieldId,
      })
    return value.targets[createDesignerTargetKey(target.entityId, target.identity)]?.values[fieldId]
  }
  function inferredAddress(item: RuntimeRowAddress, fieldId: string): RuntimeRowAddress {
    const entity = fields.get(fieldId)?.entityCode
    if (
      entity === entityById.get(item.entityId)?.code ||
      entity === (item.row.target ? entityById.get(item.row.target.entityId)?.code : undefined)
    )
      return item
    for (const rowKey of [...item.chain].reverse()) {
      const parent = address(rowKey)
      if (entity === entityById.get(parent.entityId)?.code) return parent
    }
    return failRuntime('FIELD_SCOPE', '字段不属于当前行或祖先实体', {
      rowKey: item.row.clientRowKey,
      fieldId,
    })
  }
  function expressionRuntime(item: RuntimeRowAddress): DesignerExpressionRuntimeContext {
    return {
      fields: {},
      currentRow: item.scope ? {} : undefined,
      variables,
      context: { RUNTIME_MODE: mode, NOW: new Date().toISOString() },
      readField(fieldId, scope, ancestorDepth) {
        const target =
          scope === 'ROOT'
            ? address(value.root.clientRowKey)
            : scope === 'CURRENT_ROW'
              ? item
              : Number.isInteger(ancestorDepth) && Number(ancestorDepth) > 0
                ? rows.get(item.chain[item.chain.length - 1 - Number(ancestorDepth)])
                : undefined
        if (!target || (scope === 'CURRENT_ROW' && !item.scope))
          failRuntime('EXPRESSION_SCOPE', '表达式引用的行作用域不存在', {
            rowKey: item.row.clientRowKey,
            fieldId,
          })
        return rawField(target, fieldId)
      },
    }
  }
  function readFieldState(
    rowKey: string,
    fieldId: string,
    ignoreStatus = false,
  ): DesignerResolvedFieldState {
    const item = address(rowKey)
    const field = fields.get(fieldId)
    if (!field) return { visible: false, required: false, disabled: true, accessLevel: 'HIDDEN' }
    const host = fieldPolicy(item, field)
    const state = applyDesignerFieldAccess(
      field,
      resolveDesignerFieldState(field, expressionRuntime(item)),
      { mode, policy: host },
    )
    const target = item.row.target?.entityId === entityByCode(field.entityCode)
    const policy = ownPolicy(item)
    const operation =
      item.row.recordRef || item.row.associationRef ? 'UPDATE' : item.row.target ? 'LINK' : 'CREATE'
    if (
      (!target && policy.operations[operation] !== true) ||
      (target && !policy.targetEditable) ||
      (!ignoreStatus &&
        (status !== 'READY' || Boolean(preparation || legacyPreparation || draftLocked)))
    )
      state.disabled = true
    if (state.disabled) state.required = false
    return state
  }
  function readableRow(item: RuntimeRowAddress): DesignerRuntimeRow | undefined {
    if (!ownPolicy(item).visible) return undefined
    const visibleValues: Record<string, unknown> = {}
    for (const field of fields.values()) {
      const state = readFieldState(item.row.clientRowKey, field.id)
      if (state.visible && state.accessLevel !== 'HIDDEN')
        visibleValues[field.id] = cloneRuntime(rawField(item, field.id))
    }
    return { ...cloneRuntime(item.row), values: visibleValues }
  }
  function requireOperation(
    item: RuntimeRowAddress,
    operation: DesignerSubmissionOperation['operation'],
  ): void {
    assertDraftScope(item)
    const policy = ownPolicy(item)
    if (!policy.visible || !policy.editable || policy.operations[operation] !== true)
      failRuntime('OPERATION_DENIED', '宿主权限不允许当前操作', {
        rowKey: item.row.clientRowKey,
        scope: item.scope,
      })
  }
  function requireCollectionOperation(
    scope: DesignerCollectionScope,
    operation: DesignerSubmissionOperation['operation'],
  ): void {
    assertDraftScope(address(scope.ancestorRowKeys.at(-1)!))
    const policy = readPolicy(scope)
    if (!policy.visible || !policy.editable || policy.operations[operation] !== true)
      failRuntime('OPERATION_DENIED', '宿主权限不允许当前集合操作', { scope })
  }
  function setField(
    rowKey: string,
    fieldId: string,
    next: unknown,
    internal = false,
    formula = false,
  ): void {
    assertWritable(internal)
    const item = address(rowKey)
    assertDraftScope(item)
    const field = fields.get(fieldId)
    if (!field) failRuntime('FIELD_MISSING', '字段定义不存在', { rowKey, fieldId })
    const state = applyDesignerFieldAccess(
      field,
      resolveDesignerFieldState(field, expressionRuntime(item)),
      { mode, policy: fieldPolicy(item, field) },
    )
    if ((!formula && (state.disabled || !state.visible)) || state.accessLevel !== 'EDITABLE')
      failRuntime('FIELD_WRITE_DENIED', '当前字段不可写，输入已保留', { rowKey, fieldId })
    const isTarget = item.row.target?.entityId === entityByCode(field.entityCode)
    if (isTarget) {
      if (!ownPolicy(item).targetEditable || !item.scope || !item.row.target)
        failRuntime('TARGET_WRITE_DENIED', '当前路径无权编辑共享目标', { rowKey, fieldId })
      const key = createDesignerTargetKey(item.row.target.entityId, item.row.target.identity)
      const previousOrigin = origins[key]?.[fieldId]
      if (previousOrigin) {
        const previousRow = rows.get(previousOrigin.rowKey)
        const previousState = previousRow
          ? readFieldState(previousOrigin.rowKey, fieldId, true)
          : undefined
        if (
          !previousRow ||
          !runtimeValuesEqual(previousRow.scope, previousOrigin.scope) ||
          previousState?.accessLevel !== 'EDITABLE' ||
          previousState.disabled
        )
          failRuntime(
            'TARGET_ORIGIN_REVOKED',
            '共享目标改动的原授权来源已失效，请先明确还原字段再编辑',
            { rowKey: previousOrigin.rowKey, fieldId },
          )
      }
      value.targets[key].values[fieldId] = cloneRuntime(next)
      for (const linked of rows.values())
        if (
          linked.row.target?.entityId === item.row.target.entityId &&
          linked.row.target.identity === item.row.target.identity
        )
          changedFieldAddresses.add(
            createDesignerRuntimeFeedbackKey(linked.row.clientRowKey, fieldId),
          )
      origins[key] ??= {}
      if (runtimeValuesEqual(next, baseline.targets[key]?.values[fieldId]))
        delete origins[key][fieldId]
      else origins[key][fieldId] ??= { scope: cloneRuntime(item.scope), rowKey }
    } else {
      requireOperation(
        item,
        item.row.recordRef || item.row.associationRef
          ? 'UPDATE'
          : item.row.target
            ? 'LINK'
            : 'CREATE',
      )
      item.row.values[fieldId] = cloneRuntime(next)
      changedFieldAddresses.add(createDesignerRuntimeFeedbackKey(rowKey, fieldId))
    }
    delete feedbacks[createDesignerRuntimeFeedbackKey(rowKey, fieldId)]
  }

  function addRow(
    scope: DesignerCollectionScope,
    seed: Record<string, unknown> = {},
    target?: DesignerRelationCandidate,
    initializeChildren = true,
  ): string {
    const collection = collectionFor(scope)
    const definition = definitions.get(scope.containerId)!
    const many = definition.relation.kind === 'MANY_TO_MANY'
    if (many !== Boolean(target))
      failRuntime(
        'RELATION_OPERATION',
        many ? '多对多关系必须通过关联候选创建' : '拥有关系不能执行关联操作',
        { scope },
      )
    requireCollectionOperation(scope, many ? 'LINK' : 'CREATE')
    validateValues(seed, definition.relation.childEntity.id)
    const row: DesignerRuntimeRow = {
      clientRowKey: createRuntimeKey('row'),
      values: {},
      ...(target
        ? {
            target: {
              entityId: target.entityId,
              identity: target.identity,
              reference: target.reference,
              version: target.version,
              values: cloneRuntime(target.values),
            },
          }
        : {}),
    }
    collection.rows.push(row)
    rebuild()
    mergeTarget(row)
    const defaults = { ...defaultValues(definition.relation.childEntity.id), ...seed }
    for (const [fieldId, fieldValue] of Object.entries(defaults)) {
      const field = fields.get(fieldId)!
      if (fieldPolicy(address(row.clientRowKey), field).accessLevel === 'EDITABLE')
        row.values[fieldId] = cloneRuntime(fieldValue)
      else if (Object.hasOwn(seed, fieldId))
        failRuntime('FIELD_WRITE_DENIED', '初始值包含当前不可写字段', {
          scope,
          rowKey: row.clientRowKey,
          fieldId,
        })
    }
    ensureCollections()
    if (initializeChildren) seedInitialRows(row.clientRowKey)
    return row.clientRowKey
  }
  function seedInitialRows(parentRowKey: string): void {
    for (const collection of Object.values(value.collections).filter(
      (item) => item.scope.ancestorRowKeys.at(-1) === parentRowKey,
    )) {
      if (collection.rows.length || collection.loadState !== 'COMPLETE') continue
      const definition = definitions.get(collection.scope.containerId)!
      const count = definition.node.configuration.initialRows ?? 0
      if (
        typeof count !== 'number' ||
        !Number.isInteger(count) ||
        count < 0 ||
        count > limits.maxLoadedRows
      )
        failRuntime('INITIAL_ROWS_LIMIT', '初始行数配置不合法或超过运行上限', {
          scope: collection.scope,
        })
      if (count && definition.relation.kind === 'MANY_TO_MANY')
        failRuntime('INITIAL_ASSOCIATION', '关联关系不能凭空生成初始关联，请先选择授权目标', {
          scope: collection.scope,
        })
      for (let index = 0; index < count; index += 1) addRow(collection.scope)
    }
  }
  function descendantCollections(
    rowKey: string,
    store = value,
  ): Array<[string, DesignerRuntimeCollection]> {
    return Object.entries(store.collections).filter(([, collection]) =>
      collection.scope.ancestorRowKeys.includes(rowKey),
    )
  }
  function assertCompleteSubtree(rowKey: string): void {
    if (descendantCollections(rowKey).some(([, collection]) => collection.loadState !== 'COMPLETE'))
      failRuntime('SUBTREE_INCOMPLETE', '后代数据尚未完整加载，不能执行完整子树操作', { rowKey })
  }
  async function copyRow(rowKey: string): Promise<string> {
    const source = address(rowKey)
    if (!source.scope || source.row.target)
      failRuntime('COPY_RELATION', '关联记录在同一父行下不能重复关联；请复制其拥有父行', { rowKey })
    assertCompleteSubtree(rowKey)
    assertDraftScope(source)
    const sourceValue = cloneRuntime(value)
    const copy = async (
      original: DesignerRuntimeRow,
      destination: DesignerCollectionScope,
    ): Promise<string> => {
      const originalAddress = address(original.clientRowKey)
      if (!ownPolicy(originalAddress).visible)
        failRuntime('COPY_READ_DENIED', '当前子树包含不可读取的行，不能完整复制', {
          rowKey: original.clientRowKey,
        })
      const copiedValues = Object.fromEntries(
        Object.entries(original.values).filter(([fieldId]) => {
          const field = fields.get(fieldId)
          return (
            field &&
            !field.primaryKey &&
            !field.systemField &&
            fieldPolicy(originalAddress, field).accessLevel !== 'HIDDEN'
          )
        }),
      )
      const newKey = original.target
        ? (
            await link(
              destination,
              [{ ...cloneRuntime(original.target), label: '已关联记录' }],
              copiedValues,
              undefined,
              false,
            )
          )[0]
        : addRow(destination, copiedValues, undefined, false)
      if (!newKey) failRuntime('COPY_ASSOCIATION_DUPLICATE', '复制后的父路径存在重复关联')
      for (const [, child] of Object.entries(sourceValue.collections).filter(
        ([, collection]) => collection.scope.ancestorRowKeys.at(-1) === original.clientRowKey,
      )) {
        const childScope = scopeFor(child.scope.containerId, newKey)
        for (const childRow of child.rows) await copy(childRow, childScope)
      }
      return newKey
    }
    const newKey = await copy(source.row, source.scope)
    const collection = collectionFor(source.scope)
    const appended = collection.rows.find((row) => row.clientRowKey === newKey)!
    collection.rows = collection.rows.filter((row) => row.clientRowKey !== newKey)
    collection.rows.splice(
      collection.rows.findIndex((row) => row.clientRowKey === rowKey) + 1,
      0,
      appended,
    )
    rebuild()
    return newKey
  }
  function removeRow(rowKey: string, unlink: boolean): void {
    const item = address(rowKey)
    if (!item.scope) failRuntime('ROOT_DELETE', '表单不提供根记录删除操作')
    if (Boolean(item.row.target) !== unlink)
      failRuntime('RELATION_OPERATION', '关联记录必须使用解除关联，拥有记录必须使用删除', {
        rowKey,
      })
    requireOperation(item, unlink ? 'UNLINK' : 'DELETE')
    const affectedKeys = new Set(
      [...rows.values()]
        .filter((candidate) => candidate.chain.includes(rowKey))
        .map((candidate) => candidate.row.clientRowKey),
    )
    for (const targetOrigins of Object.values(origins)) {
      const dirty = Object.entries(targetOrigins).find(([, origin]) =>
        affectedKeys.has(origin.rowKey),
      )
      if (dirty)
        failRuntime(
          'TARGET_DIRTY_ORIGIN',
          '当前行是共享目标改动的授权来源，请先保存或还原目标字段',
          { rowKey: dirty[1].rowKey, scope: dirty[1].scope, fieldId: dirty[0] },
        )
    }
    const cascade = ownPolicy(item).cascadeDelete === true
    if (!cascade) assertCompleteSubtree(rowKey)
    const affected = [...rows.values()]
      .filter((candidate) => candidate.chain.includes(rowKey))
      .sort((left, right) => right.chain.length - left.chain.length)
    for (const child of affected) {
      const persisted = Boolean(child.row.recordRef || child.row.associationRef)
      const operation = child.row.target ? 'UNLINK' : 'DELETE'
      if (!cascade) requireOperation(child, operation)
      if (persisted && (!cascade || child.row.clientRowKey === rowKey))
        removals.push({
          address: cloneRuntime(child),
          cascade: cascade && child.row.clientRowKey === rowKey,
          operation,
        })
    }
    for (const [key] of descendantCollections(rowKey)) delete value.collections[key]
    const collection = collectionFor(item.scope)
    collection.rows = collection.rows.filter((row) => row.clientRowKey !== rowKey)
    for (const [draftId, draft] of drafts) if (affectedKeys.has(draft.rowKey)) cancelDraft(draftId)
    rebuild()
  }
  function requestContext(
    scope: DesignerCollectionScope,
    controller: AbortController,
  ): DesignerRelationRequest {
    const collection = collectionFor(scope)
    const parent = address(scope.ancestorRowKeys.at(-1)!).row
    return {
      scope: cloneRuntime(scope),
      relationPath: [...collection.relationPath],
      parent: cloneRuntime(parent),
      context: cloneRuntime(adapterContext),
      signal: controller.signal,
    }
  }
  function controllerFor(signal?: AbortSignal): {
    controller: AbortController
    release: () => void
  } {
    const controller = new AbortController()
    const cancel = (): void => controller.abort()
    signal?.addEventListener('abort', cancel, { once: true })
    if (signal?.aborted) controller.abort()
    requests.add(controller)
    return {
      controller,
      release() {
        requests.delete(controller)
        signal?.removeEventListener('abort', cancel)
      },
    }
  }
  function assertRequest(controller: AbortController, requestEpoch: number): void {
    assertUsable()
    if (controller.signal.aborted || requestEpoch !== epoch)
      failRuntime('REQUEST_CANCELLED', '请求已失效，未写入返回结果')
  }
  function mergeCollection(
    command: Extract<DesignerRuntimeCommand, { type: 'MERGE_COLLECTION' }>,
  ): void {
    const collection = collectionFor(command.scope)
    if (!readPolicy(command.scope).visible)
      failRuntime('COLLECTION_HIDDEN', '当前集合不可访问', { scope: command.scope })
    const definition = definitions.get(command.scope.containerId)!
    const baseCollection = baseline.collections[createDesignerCollectionKey(command.scope)] ?? {
      ...cloneRuntime(collection),
      rows: [],
    }
    const incomingKeys = new Set<string>()
    for (const source of command.rows) {
      const incoming = cloneRuntime(source)
      const persistent =
        definition.relation.kind === 'MANY_TO_MANY' ? incoming.associationRef : incoming.recordRef
      if (!persistent || incoming.version === undefined)
        failRuntime('LOADED_IDENTITY', '加载记录必须具有持久身份与预期版本', {
          scope: command.scope,
        })
      if (!incoming.clientRowKey || incomingKeys.has(incoming.clientRowKey))
        failRuntime('ROW_IDENTITY', '加载页包含重复或缺失的客户端身份', { scope: command.scope })
      incomingKeys.add(incoming.clientRowKey)
      validateValues(incoming.values, definition.relation.childEntity.id)
      const current = collection.rows.find(
        (row) =>
          row.clientRowKey === incoming.clientRowKey ||
          (definition.relation.kind === 'MANY_TO_MANY'
            ? row.associationRef === persistent
            : row.recordRef === persistent),
      )
      if (current) {
        const previous = baseCollection.rows.find(
          (row) => row.clientRowKey === current.clientRowKey,
        )
        if (
          previous &&
          !runtimeValuesEqual(current.values, previous.values) &&
          (current.version !== incoming.version ||
            !runtimeValuesEqual(previous.values, incoming.values))
        )
          failRuntime('LOAD_DIRTY_CONFLICT', '加载结果与未保存输入冲突，已保留当前输入', {
            rowKey: current.clientRowKey,
            scope: command.scope,
          })
        incoming.clientRowKey = current.clientRowKey
        if (!previous || runtimeValuesEqual(current.values, previous.values))
          Object.assign(current, incoming)
      } else {
        if (rows.has(incoming.clientRowKey))
          failRuntime('ROW_IDENTITY', '加载行身份已在其他集合使用', { scope: command.scope })
        collection.rows.push(incoming)
      }
      rebuild()
      const installed = address(incoming.clientRowKey).row
      mergeTarget(installed)
      const oldIndex = baseCollection.rows.findIndex(
        (row) => row.clientRowKey === incoming.clientRowKey,
      )
      const cleanRow = { ...cloneRuntime(incoming), target: cloneRuntime(installed.target) }
      if (oldIndex >= 0) baseCollection.rows[oldIndex] = cleanRow
      else baseCollection.rows.push(cleanRow)
      if (installed.target) {
        const targetKey = createDesignerTargetKey(
          installed.target.entityId,
          installed.target.identity,
        )
        if (!origins[targetKey] || !Object.keys(origins[targetKey]).length)
          baseline.targets[targetKey] = cloneRuntime(value.targets[targetKey])
      }
    }
    collection.loadState = command.complete ? 'COMPLETE' : 'PARTIAL'
    collection.cursor = command.cursor
    collection.hasMore = !command.complete
    collection.totalCount = command.totalCount
    delete collection.error
    Object.assign(baseCollection, {
      loadState: collection.loadState,
      cursor: command.cursor,
      hasMore: !command.complete,
      totalCount: command.totalCount,
    })
    baseline.collections[createDesignerCollectionKey(command.scope)] = baseCollection
    ensureCollections()
    for (const [key, child] of Object.entries(value.collections))
      if (!baseline.collections[key] && !child.rows.length)
        baseline.collections[key] = cloneRuntime(child)
  }
  async function loadCollection(
    scope: DesignerCollectionScope,
    more = false,
    signal?: AbortSignal,
  ): Promise<void> {
    if (!adapters.relationData)
      failRuntime('RELATION_ADAPTER_MISSING', '宿主未提供关系加载能力', { scope })
    const collection = collectionFor(scope)
    if (!readPolicy(scope).visible) failRuntime('COLLECTION_HIDDEN', '当前集合不可访问', { scope })
    const key = createDesignerCollectionKey(scope)
    loading.get(key)?.abort()
    const request = controllerFor(signal)
    loading.set(key, request.controller)
    const requestEpoch = epoch
    collection.loadState = 'LOADING'
    emit()
    try {
      const result = await adapters.relationData.loadCollection({
        ...requestContext(scope, request.controller),
        cursor: more ? collection.cursor : undefined,
      })
      assertRequest(request.controller, requestEpoch)
      if (status !== 'READY') failRuntime('SUBMISSION_LOCKED', '保存期间不能写入迟到的加载结果')
      mergeCollection({ type: 'MERGE_COLLECTION', scope, ...result })
      if (definitions.get(scope.containerId)?.relation.kind === 'MANY_TO_MANY')
        await resolveReferences(scope)
    } catch (error) {
      if (!request.controller.signal.aborted && status !== 'DISPOSED' && requestEpoch === epoch) {
        collection.loadState = 'FAILED'
        collection.error = '关系数据加载失败，已有输入已保留'
      }
      throw error instanceof RuntimeSessionFailure
        ? error
        : new RuntimeSessionFailure({
            code: 'COLLECTION_LOAD_FAILED',
            message: '关系数据加载失败，已有输入已保留',
            scope,
          })
    } finally {
      request.release()
      if (loading.get(key) === request.controller) loading.delete(key)
    }
  }
  async function queryCandidates(
    scope: DesignerCollectionScope,
    keyword: string,
    cursor?: string,
    signal?: AbortSignal,
  ) {
    assertUsable()
    requireCollectionOperation(scope, 'LINK')
    if (
      definitions.get(scope.containerId)?.relation.kind !== 'MANY_TO_MANY' ||
      !adapters.relationSelection
    )
      failRuntime('SELECTION_ADAPTER_MISSING', '当前关系没有关联候选能力', { scope })
    const request = controllerFor(signal)
    const requestEpoch = epoch
    try {
      const result = await adapters.relationSelection.queryCandidates({
        ...requestContext(scope, request.controller),
        keyword,
        cursor,
      })
      assertRequest(request.controller, requestEpoch)
      requireCollectionOperation(scope, 'LINK')
      return cloneRuntime(result)
    } catch (error) {
      throw error instanceof RuntimeSessionFailure
        ? error
        : new RuntimeSessionFailure({
            code: 'CANDIDATE_QUERY_FAILED',
            message: '候选加载失败，请重试',
            scope,
          })
    } finally {
      request.release()
    }
  }
  async function resolveReferences(
    scope: DesignerCollectionScope,
    signal?: AbortSignal,
  ): Promise<void> {
    if (!adapters.relationSelection)
      failRuntime('SELECTION_ADAPTER_MISSING', '宿主未提供已关联记录回显能力', { scope })
    if (!readPolicy(scope).visible) failRuntime('COLLECTION_HIDDEN', '当前集合不可访问', { scope })
    const collection = collectionFor(scope)
    const references = collection.rows.flatMap((row) =>
      row.target ? [cloneRuntime(row.target)] : [],
    )
    if (!references.length) return
    const request = controllerFor(signal)
    const requestEpoch = epoch
    try {
      const result = await adapters.relationSelection.resolveReferences({
        ...requestContext(scope, request.controller),
        references,
      })
      assertRequest(request.controller, requestEpoch)
      if (status !== 'READY') failRuntime('SUBMISSION_LOCKED', '保存期间不能写入迟到的回显结果')
      if (result.issues.length)
        failRuntime(
          'REFERENCE_RESOLVE_FAILED',
          '部分关联不可访问或已失效，已保留原关联，请重新确认',
          { scope },
        )
      const resolved = new Map(
        result.items.map((item) => [createDesignerTargetKey(item.entityId, item.identity), item]),
      )
      for (const row of collection.rows) {
        if (!row.target) continue
        const item = resolved.get(createDesignerTargetKey(row.target.entityId, row.target.identity))
        if (!item)
          failRuntime('REFERENCE_RESOLVE_FAILED', '部分关联未能回显，已保留原关联', {
            scope,
            rowKey: row.clientRowKey,
          })
        if (item.disabled)
          failRuntime('REFERENCE_RESOLVE_FAILED', '部分关联已不可访问，已保留原关联', {
            scope,
            rowKey: row.clientRowKey,
          })
        row.target = {
          entityId: item.entityId,
          identity: item.identity,
          reference: item.reference,
          version: item.version,
          values: cloneRuntime(item.values),
        }
        mergeTarget(row)
        const key = createDesignerTargetKey(item.entityId, item.identity)
        baseline.targets[key] ??= cloneRuntime(value.targets[key])
        for (const [fieldId, fieldValue] of Object.entries(value.targets[key].values))
          if (!origins[key]?.[fieldId])
            baseline.targets[key].values[fieldId] = cloneRuntime(fieldValue)
        const clean = baseline.collections[createDesignerCollectionKey(scope)]?.rows.find(
          (entry) => entry.clientRowKey === row.clientRowKey,
        )
        if (clean) clean.target = cloneRuntime(row.target)
      }
    } finally {
      request.release()
    }
  }
  async function link(
    scope: DesignerCollectionScope,
    candidates: DesignerRelationCandidate[],
    associationValues: Record<string, unknown> = {},
    signal?: AbortSignal,
    initializeChildren = true,
  ): Promise<string[]> {
    requireCollectionOperation(scope, 'LINK')
    const definition = definitions.get(scope.containerId)!
    if (definition.relation.kind !== 'MANY_TO_MANY' || !adapters.relationSelection)
      failRuntime('LINK_ADAPTER_MISSING', '宿主未提供关联选择确认能力', { scope })
    const targetEntityId = definition.relation.targetEntity.id
    if (candidates.some((candidate) => candidate.disabled || candidate.entityId !== targetEntityId))
      failRuntime('CANDIDATE_REJECTED', '候选项不可选或不属于目标实体', { scope })
    const request = controllerFor(signal)
    const requestEpoch = epoch
    try {
      const result = await adapters.relationSelection.validateSelection({
        ...requestContext(scope, request.controller),
        candidates: cloneRuntime(candidates),
      })
      assertRequest(request.controller, requestEpoch)
      assertWritable()
      if (result.issues.length || result.items.length !== candidates.length)
        failRuntime('SELECTION_REJECTED', '部分候选已失效或无权关联，请重新选择', { scope })
      const expected = new Set(
        candidates.map((candidate) =>
          createDesignerTargetKey(candidate.entityId, candidate.identity),
        ),
      )
      const accepted = new Set<string>()
      const created: string[] = []
      for (const candidate of result.items) {
        const key = createDesignerTargetKey(candidate.entityId, candidate.identity)
        if (!expected.has(key) || accepted.has(key) || candidate.disabled)
          failRuntime('SELECTION_REJECTED', '候选确认结果与当前选择不一致', { scope })
        accepted.add(key)
        const exists = collectionFor(scope).rows.some(
          (row) =>
            row.target?.entityId === candidate.entityId &&
            row.target.identity === candidate.identity,
        )
        if (!exists) created.push(addRow(scope, associationValues, candidate, initializeChildren))
      }
      return created
    } finally {
      request.release()
    }
  }

  function beginDraft(rowKey: string, moduleCode?: string): string {
    const module = moduleCode
      ? document.uiSchema.overlays.find((item) => item.code === moduleCode)
      : undefined
    if (moduleCode && !module) failRuntime('MODULE_MISSING', '弹层模块不存在')
    const rootKey = module?.dataContext === 'FORM_DRAFT' ? value.root.clientRowKey : rowKey
    const item = address(rootKey)
    assertDraftScope(item)
    if (module?.dataContext === 'SUBTABLE_ROW_DRAFT' && module.contextEntityId !== item.entityId)
      failRuntime('MODULE_SCOPE', '弹层上下文与当前行实体不一致', { rowKey })
    if (!ownPolicy(item).visible) failRuntime('ROW_HIDDEN', '当前行不可访问', { rowKey })
    if (activeDraft) failRuntime('DRAFT_ALREADY_OPEN', '请先确认或取消当前弹层草稿')
    const draftId = createRuntimeKey('draft')
    const child = createSession(
      {
        ...options,
        document,
        initialState: value,
        mode,
        fieldRuntimePolicy: globalFields,
        relationRuntimePolicy: policyResolver,
      },
      rootKey,
    )
    drafts.set(draftId, { session: child, value: cloneRuntime(value), rowKey: rootKey, moduleCode })
    activeDraft = { draftId, rowKey: rootKey, moduleCode }
    return draftId
  }
  function cancelDraft(draftId: string): void {
    drafts.get(draftId)?.session.dispose()
    drafts.delete(draftId)
    if (activeDraft?.draftId === draftId) activeDraft = undefined
  }
  async function confirmDraft(draftId: string): Promise<void> {
    const draft = drafts.get(draftId)
    if (!draft) failRuntime('DRAFT_MISSING', '当前弹层草稿已不存在')
    const release = await sessionInternals.get(draft.session)!.lockForConfirmation()
    try {
      mergeDraft(draftId, draft)
    } finally {
      release()
    }
  }
  function mergeDraft(draftId: string, draft: DraftRecord): void {
    assertWritable()
    const current = address(draft.rowKey)
    assertDraftScope(current)
    const previousRows = indexRuntimeRows(
      draft.value,
      definitions,
      document.dataSchema.rootEntity.id,
      limits,
    )
    const previous = previousRows.get(draft.rowKey)
    if (
      !previous ||
      !runtimeValuesEqual(current.row, previous.row) ||
      !runtimeValuesEqual(
        descendantCollections(draft.rowKey),
        descendantCollections(draft.rowKey, draft.value),
      )
    )
      failRuntime('DRAFT_CONFLICT', '草稿打开后原行或子树已变化，请保留输入并重新处理', {
        rowKey: draft.rowKey,
      })
    const next = draft.session.getSnapshot().value
    const nextRows = indexRuntimeRows(next, definitions, document.dataSchema.rootEntity.id, limits)
    const replacement = nextRows.get(draft.rowKey)
    if (!replacement) failRuntime('DRAFT_SOURCE_DELETED', '草稿不能删除自己的编辑根行')
    for (const row of nextRows.values()) {
      if (!row.chain.includes(draft.rowKey)) continue
      const before = previousRows.get(row.row.clientRowKey)
      if (!before && row.scope) {
        const policy = draft.session.readPolicy(row.scope, row.row.clientRowKey)
        if (
          !policy.visible ||
          !policy.editable ||
          policy.operations[row.row.target ? 'LINK' : 'CREATE'] !== true
        )
          failRuntime('DRAFT_PERMISSION_CHANGED', '草稿新增行已失去当前操作权限', {
            rowKey: row.row.clientRowKey,
            scope: row.scope,
          })
      }
      for (const fieldId of Object.keys(row.row.values)) {
        if (runtimeValuesEqual(row.row.values[fieldId], before?.row.values[fieldId])) continue
        const state = sessionInternals.get(draft.session)!.fieldState(row.row.clientRowKey, fieldId)
        const formula = fields
          .get(fieldId)
          ?.behavior.valueRules.some((rule) => rule.mode === 'FORMULA')
        if (state.accessLevel !== 'EDITABLE' || (state.disabled && !formula))
          failRuntime('DRAFT_PERMISSION_CHANGED', '草稿中的改动已不具备当前写权限', {
            rowKey: row.row.clientRowKey,
            fieldId,
          })
      }
    }
    const childInternals = sessionInternals.get(draft.session)!
    for (const removal of childInternals.removals()) {
      const original = rows.get(removal.address.row.clientRowKey)
      if (!original) failRuntime('DRAFT_SOURCE_DELETED', '草稿中的待删除原行已不存在')
      requireOperation(original, removal.operation)
      if (removal.cascade && !ownPolicy(original).cascadeDelete)
        failRuntime('DRAFT_PERMISSION_CHANGED', '草稿的级联删除授权已失效', {
          rowKey: original.row.clientRowKey,
        })
    }
    for (const [key, targetOrigins] of Object.entries(childInternals.origins())) {
      for (const [fieldId, origin] of Object.entries(targetOrigins)) {
        if (
          !runtimeValuesEqual(
            value.targets[key]?.values[fieldId],
            draft.value.targets[key]?.values[fieldId],
          )
        )
          failRuntime('DRAFT_TARGET_CONFLICT', '草稿打开后共享目标字段已变化', {
            rowKey: origin.rowKey,
            fieldId,
          })
        const state = childInternals.fieldState(origin.rowKey, fieldId)
        if (state.disabled || state.accessLevel !== 'EDITABLE')
          failRuntime('DRAFT_PERMISSION_CHANGED', '共享目标字段已不具备当前写权限', {
            rowKey: origin.rowKey,
            fieldId,
          })
      }
    }
    Object.assign(current.row, cloneRuntime(replacement.row))
    for (const [key] of descendantCollections(draft.rowKey)) delete value.collections[key]
    for (const [key, collection] of descendantCollections(draft.rowKey, next))
      value.collections[key] = cloneRuntime(collection)
    for (const [key, targetOrigins] of Object.entries(childInternals.origins())) {
      value.targets[key] ??= cloneRuntime(next.targets[key])
      origins[key] ??= {}
      for (const [fieldId, origin] of Object.entries(targetOrigins)) {
        value.targets[key].values[fieldId] = cloneRuntime(next.targets[key].values[fieldId])
        origins[key][fieldId] = cloneRuntime(origin)
      }
    }
    for (const [key, target] of Object.entries(next.targets))
      if (!value.targets[key]) value.targets[key] = cloneRuntime(target)
    removals.push(...cloneRuntime(childInternals.removals()))
    rebuild()
    cancelDraft(draftId)
  }

  async function calculate(phase: 'INITIALIZE' | 'CHANGE', internal = false): Promise<void> {
    const order = resolveDesignerFieldEvaluationOrder(document)
    if (order.diagnostics.length) failRuntime('VALUE_RULE_CYCLE', '字段计算存在循环依赖')
    const startEpoch = epoch
    for (const item of [...rows.values()].sort(
      (left, right) => left.chain.length - right.chain.length,
    )) {
      if (draftRoot && !item.chain.includes(draftRoot)) continue
      for (const field of order.orderedFields) {
        if (
          field.entityCode !== entityById.get(item.entityId)?.code &&
          field.entityCode !==
            (item.row.target ? entityById.get(item.row.target.entityId)?.code : undefined)
        )
          continue
        for (const rule of field.behavior.valueRules) {
          if (
            phase === 'CHANGE' &&
            !expressionChanged(rule.expression, item) &&
            (!rule.condition || !expressionChanged(rule.condition, item))
          )
            continue
          const runtime = expressionRuntime(item)
          if (rule.condition && !evaluateDesignerCondition(rule.condition, runtime)) continue
          if (fieldPolicy(item, field).accessLevel !== 'EDITABLE') continue
          const next = cloneRuntime(evaluateDesignerExpression(rule.expression, runtime))
          const current = rawField(item, field.id)
          if (runtimeValuesEqual(next, current)) continue
          if (
            rule.mode === 'LINKAGE' &&
            current !== undefined &&
            current !== null &&
            current !== ''
          ) {
            if (rule.overwritePolicy === 'EMPTY_ONLY' || phase === 'INITIALIZE') continue
            if (rule.overwritePolicy === 'CONFIRM') {
              if (!adapters.linkageConfirmation)
                failRuntime('LINKAGE_CONFIRMATION_REQUIRED', '宿主未提供联动覆盖确认能力', {
                  rowKey: item.row.clientRowKey,
                  fieldId: field.id,
                })
              const accepted = await adapters.linkageConfirmation.confirmOverwrite({
                fieldId: field.id,
                fieldLabel: field.label,
                currentValue: cloneRuntime(current),
                nextValue: next,
              })
              if (epoch !== startEpoch) failRuntime('CALCULATION_STALE', '计算上下文已失效')
              if (!accepted) continue
            }
          }
          setField(item.row.clientRowKey, field.id, next, internal, rule.mode === 'FORMULA')
        }
      }
    }
  }
  function expressionChanged(expression: DesignerExpression, item: RuntimeRowAddress): boolean {
    if (expression.kind === 'CALL')
      return expression.arguments.some((argument) => expressionChanged(argument, item))
    if (expression.kind === 'VARIABLE' || expression.kind === 'CONTEXT')
      return changedFieldAddresses.has('$context')
    if (expression.kind !== 'FIELD') return false
    const source = actionAddress(
      item,
      expression.fieldId,
      expression.scope,
      expression.ancestorDepth,
    )
    return changedFieldAddresses.has(
      createDesignerRuntimeFeedbackKey(source.row.clientRowKey, expression.fieldId),
    )
  }
  async function validate(
    internal = false,
    trigger: 'SUBMIT' | 'CHANGE' | 'BLUR' = 'SUBMIT',
    rowKey?: string,
    onlyFieldId?: string,
  ): Promise<void> {
    const startEpoch = epoch
    if (trigger === 'SUBMIT') feedbacks = {}
    const failures: DesignerRuntimeIssue[] = []
    for (const item of rows.values()) {
      if (draftRoot && !item.chain.includes(draftRoot)) continue
      if (rowKey && item.row.clientRowKey !== rowKey) continue
      if (!ownPolicy(item).visible) continue
      for (const field of fields.values()) {
        if (onlyFieldId && field.id !== onlyFieldId) continue
        const state = readFieldState(item.row.clientRowKey, field.id, internal)
        if (!state.visible || state.disabled) continue
        const results = await validateDesignerField(
          field,
          rawField(item, field.id),
          trigger,
          expressionRuntime(item),
          {
            state,
            remoteAdapter: adapters.remoteValidation,
            redactRemoteMessages: true,
            assertActive() {
              if (epoch !== startEpoch || status === 'DISPOSED')
                failRuntime('VALIDATION_STALE', '验证上下文已失效')
            },
            readComparisonField: (fieldId) => rawField(inferredAddress(item, fieldId), fieldId),
            resolveCollectionRows(containerId) {
              const scope = scopeFor(containerId, item.row.clientRowKey)
              const collection = collectionFor(scope)
              return collection.loadState === 'COMPLETE'
                ? collection.rows.length
                : collection.totalCount
            },
          },
        )
        const feedback = projectDesignerFieldFeedback(results)
        delete feedbacks[createDesignerRuntimeFeedbackKey(item.row.clientRowKey, field.id)]
        if (feedback)
          feedbacks[createDesignerRuntimeFeedbackKey(item.row.clientRowKey, field.id)] = feedback
        if (results.some((result) => result.severity === 'ERROR'))
          failures.push({
            code: 'VALIDATION_FAILED',
            message: feedback?.error ?? '字段验证未通过',
            rowKey: item.row.clientRowKey,
            scope: item.scope,
            fieldId: field.id,
          })
      }
    }
    if (failures.length) {
      issues = failures
      throw new RuntimeSessionFailure(failures[0])
    }
  }
  async function runEvents(
    event: DesignerFormEvent | Extract<DesignerRuntimeCommand, { type: 'EVENT' }>,
    internal = false,
  ): Promise<void> {
    const item = address(
      typeof event === 'string' ? (draftRoot ?? value.root.clientRowKey) : event.rowKey,
    )
    const node = typeof event === 'string' ? undefined : findLayoutNode(event.nodeId)
    const eventField = node?.nodeType === 'FIELD' ? fields.get(node.fieldId) : undefined
    const boundFlow =
      eventField && typeof event !== 'string'
        ? eventField.behavior.eventBindings[event.event]
        : undefined
    const relevant = document.eventFlows.filter((flow) =>
      typeof event === 'string'
        ? flow.trigger.scope === 'FORM' && flow.trigger.event === event
        : (flow.trigger.scope === 'COMPONENT' &&
            flow.trigger.event === event.event &&
            flow.trigger.nodeId === event.nodeId) ||
          flow.code === boundFlow,
    )
    const token = epoch
    for (const flow of relevant) {
      const result = await executeDesignerEventFlow(
        flow,
        {
          document,
          valueStore: { fields: {}, collections: {} },
          variables,
          runtimeMode: event === 'AFTER_SUBMIT' && !legacy ? 'READ_ONLY' : mode,
          adapters,
          expressionContext: {},
          redactErrors: true,
          expressionRuntime: () => expressionRuntime(address(item.row.clientRowKey)),
          assertActive() {
            if (epoch !== token || status === 'DISPOSED')
              failRuntime('EVENT_STALE', '事件上下文已失效')
          },
          readField: (fieldId, scope, depth) =>
            rawField(actionAddress(item, fieldId, scope, depth), fieldId),
          writeField: (fieldId, next, scope, depth) =>
            setField(
              actionAddress(item, fieldId, scope, depth).row.clientRowKey,
              fieldId,
              next,
              internal,
            ),
          writeVariable(code, next) {
            assertWritable(internal)
            variables[code] = cloneRuntime(next)
            changedFieldAddresses.add('$context')
          },
          isFieldWritable(fieldId, scope, depth) {
            const target = actionAddress(item, fieldId, scope, depth)
            const field = fields.get(fieldId)
            return field ? fieldPolicy(target, field).accessLevel === 'EDITABLE' : false
          },
          validate: async () => {
            await validate(internal)
            return true
          },
          submit: async () => {
            if (
              internal ||
              status !== 'READY' ||
              event === 'AFTER_COMMIT' ||
              event === 'AFTER_SUBMIT'
            )
              failRuntime('EVENT_RECURSIVE_SUBMIT', '保存生命周期不能递归发起新保存')
            submitRequested = true
          },
          reset: () => {
            if (event === 'RESET') failRuntime('EVENT_RECURSIVE_RESET', '重置生命周期不能递归重置')
            const result = reset()
            if (!result.ok) throw new RuntimeSessionFailure(result.issues[0])
          },
          openModule: (moduleCode) => {
            beginDraft(item.row.clientRowKey, moduleCode)
          },
          confirmModule: async (moduleCode) => {
            assertWritable(internal)
            if (activeDraft?.moduleCode === moduleCode) await confirmDraft(activeDraft.draftId)
          },
          cancelModule: (moduleCode) => {
            if (activeDraft?.moduleCode === moduleCode) cancelDraft(activeDraft.draftId)
          },
        },
        activeFlows,
      )
      if (result.blocked || result.errors.length)
        failRuntime('EVENT_FAILED', '表单事件未完成，请检查事件配置与当前权限', {
          rowKey: item.row.clientRowKey,
        })
    }
    if (
      typeof event !== 'string' &&
      eventField &&
      (event.event === 'CHANGE' || event.event === 'BLUR')
    ) {
      await calculate('CHANGE', internal)
      await validate(internal, event.event, item.row.clientRowKey, eventField.id)
    }
  }
  function findLayoutNode(nodeId: string): DesignerLayoutNode | undefined {
    const visit = (nodes: DesignerLayoutNode[]): DesignerLayoutNode | undefined => {
      for (const node of nodes) {
        if (node.id === nodeId) return node
        if (node.nodeType === 'CONTAINER')
          for (const slot of node.slots) {
            const found = visit(slot.children)
            if (found) return found
          }
      }
    }
    return (
      visit(document.uiSchema.root) ??
      document.uiSchema.overlays.map((overlay) => visit(overlay.root)).find(Boolean)
    )
  }
  function actionAddress(
    item: RuntimeRowAddress,
    fieldId: string,
    scope?: DesignerExpressionFieldScope,
    depth?: number,
  ): RuntimeRowAddress {
    if (!scope) return inferredAddress(item, fieldId)
    if (scope === 'ROOT') return address(value.root.clientRowKey)
    if (scope === 'CURRENT_ROW') return item
    if (!Number.isInteger(depth) || !depth || depth < 1 || depth >= item.chain.length)
      failRuntime('EVENT_ANCESTOR', '字段事件祖先作用域不存在', {
        rowKey: item.row.clientRowKey,
        fieldId,
      })
    return address(item.chain[item.chain.length - 1 - depth])
  }

  function changedValues(
    current: Record<string, unknown>,
    previous: Record<string, unknown>,
  ): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(current)
        .filter(([fieldId, next]) => !runtimeValuesEqual(next, previous[fieldId]))
        .map(([fieldId, next]) => [fieldId, cloneRuntime(next === undefined ? null : next)]),
    )
  }
  function writableProjection(
    item: RuntimeRowAddress,
    values: Record<string, unknown>,
  ): Record<string, unknown> {
    const output: Record<string, unknown> = {}
    for (const [fieldId, fieldValue] of Object.entries(values)) {
      const field = fields.get(fieldId)
      if (field?.behavior.submitBehavior === 'EXCLUDE') continue
      const state = field ? readFieldState(item.row.clientRowKey, fieldId, true) : undefined
      if (!field || !state || state.accessLevel !== 'EDITABLE')
        failRuntime(
          'DIRTY_PERMISSION_REVOKED',
          '存在已失去写权限的改动，请恢复授权或明确还原字段',
          { rowKey: item.row.clientRowKey, scope: item.scope, fieldId },
        )
      const formula = field.behavior.valueRules.some((rule) => rule.mode === 'FORMULA')
      if ((!state.visible && field.componentType !== 'hidden') || (state.disabled && !formula))
        failRuntime('DIRTY_FIELD_DISABLED', '存在当前不可提交的字段改动，请先处理', {
          rowKey: item.row.clientRowKey,
          scope: item.scope,
          fieldId,
        })
      output[fieldId] = cloneRuntime(fieldValue)
    }
    return output
  }
  function projectOperations(): DesignerSubmissionOperation[] {
    const result: DesignerSubmissionOperation[] = []
    const baselineRows = indexRuntimeRows(
      baseline,
      definitions,
      document.dataSchema.rootEntity.id,
      limits,
    )
    const creates = new Map<string, string>()
    for (const item of [...rows.values()].sort(
      (left, right) => left.chain.length - right.chain.length,
    )) {
      const previous = baselineRows.get(item.row.clientRowKey)
      const isNew = !item.row.recordRef && !item.row.associationRef
      const next = submittableValues(
        isNew
          ? cloneRuntime(item.row.values)
          : changedValues(item.row.values, previous?.row.values ?? {}),
      )
      if (!isNew && !Object.keys(next).length) continue
      const operation = isNew ? (item.row.target ? 'LINK' : 'CREATE') : 'UPDATE'
      requireOperation(item, operation)
      const values = writableProjection(item, next)
      if (!isNew && !Object.keys(values).length) continue
      const operationId = createRuntimeKey('operation')
      const parentRowKey = item.scope?.ancestorRowKeys.at(-1)
      const parentCreate = parentRowKey ? creates.get(parentRowKey) : undefined
      result.push({
        operationId,
        operation,
        subject: !item.scope ? 'ROOT' : item.row.target ? 'ASSOCIATION' : 'ROW',
        entityId: item.entityId,
        clientRowKey: item.row.clientRowKey,
        scope: cloneRuntime(item.scope),
        relationPath: [...(item.definition?.relationPath ?? [])],
        relationId: item.definition?.relation.id,
        parentRowKey,
        recordRef: item.row.recordRef,
        associationRef: item.row.associationRef,
        expectedVersion: item.row.version,
        target: cloneRuntime(item.row.target),
        values,
        dependsOn: parentCreate ? [parentCreate] : [],
      })
      if (isNew) creates.set(item.row.clientRowKey, operationId)
    }
    for (const [key, target] of Object.entries(value.targets)) {
      const changed = submittableValues(
        changedValues(target.values, baseline.targets[key]?.values ?? {}),
      )
      if (!Object.keys(changed).length) continue
      const fieldOrigins: NonNullable<DesignerSubmissionOperation['fieldOrigins']> = {}
      let source: RuntimeRowAddress | undefined
      for (const fieldId of Object.keys(changed)) {
        const origin = origins[key]?.[fieldId]
        if (!origin) continue // 新加载的目标字段只作为展示基线，不成为 UPDATE。
        const item = address(origin.rowKey)
        if (
          !runtimeValuesEqual(item.scope, origin.scope) ||
          item.row.target?.identity !== target.identity ||
          item.row.target.entityId !== target.entityId
        )
          failRuntime('TARGET_ORIGIN_INVALID', '共享目标改动的授权来源已失效', {
            rowKey: origin.rowKey,
            fieldId,
          })
        const state = readFieldState(origin.rowKey, fieldId, true)
        if (state.disabled || state.accessLevel !== 'EDITABLE')
          failRuntime('TARGET_PERMISSION_REVOKED', '共享目标改动已失去来源路径的写权限', {
            rowKey: origin.rowKey,
            fieldId,
          })
        fieldOrigins[fieldId] = {
          ...cloneRuntime(origin),
          reference: item.row.target.reference,
          associationRef: item.row.associationRef,
        }
        source ??= item
      }
      if (!source) continue
      result.push({
        operationId: createRuntimeKey('operation'),
        operation: 'UPDATE',
        subject: 'TARGET',
        entityId: target.entityId,
        clientRowKey: source.row.clientRowKey,
        scope: cloneRuntime(source.scope),
        relationPath: [...source.definition!.relationPath],
        relationId: source.definition!.relation.id,
        parentRowKey: source.scope!.ancestorRowKeys.at(-1),
        target: cloneRuntime(source.row.target),
        expectedVersion: target.version,
        values: Object.fromEntries(
          Object.keys(fieldOrigins).map((fieldId) => [fieldId, changed[fieldId]]),
        ),
        fieldOrigins,
        dependsOn: Object.values(fieldOrigins).flatMap((origin) =>
          creates.has(origin.rowKey) ? [creates.get(origin.rowKey)!] : [],
        ),
      })
    }
    for (const removal of removals) {
      const item = removal.address
      // 删除行不在当前索引中，仍以原完整地址重新向宿主求取当前操作权限。
      const collectionPolicy = resolvedPolicy({
        kind: 'COLLECTION',
        scope: item.scope,
        relationId: item.definition!.relation.id,
      })
      const rowPolicy = resolvedPolicy({
        kind: 'ROW',
        scope: item.scope,
        rowKey: item.row.clientRowKey,
        relationId: item.definition!.relation.id,
      })
      const rootAccess = rootPolicy()
      if (
        !rootAccess.visible ||
        !rootAccess.editable ||
        isDesignerRuntimeWriteBlocked(mode) ||
        item.definition!.node.configuration.allowDelete === false
      )
        failRuntime('DELETE_PERMISSION_REVOKED', '根记录或关系配置已不允许删除操作', {
          rowKey: item.row.clientRowKey,
          scope: item.scope,
        })
      for (const ancestorKey of item.chain.slice(1, -1)) {
        const ancestor =
          rows.get(ancestorKey) ??
          removals.find((candidate) => candidate.address.row.clientRowKey === ancestorKey)?.address
        if (!ancestor)
          failRuntime('DELETE_ANCESTOR_MISSING', '删除操作的祖先上下文已失效', {
            rowKey: item.row.clientRowKey,
          })
        const ancestorCollection = resolvedPolicy({
          kind: 'COLLECTION',
          scope: ancestor.scope,
          relationId: ancestor.definition!.relation.id,
        })
        const ancestorRow = resolvedPolicy({
          kind: 'ROW',
          scope: ancestor.scope,
          rowKey: ancestorKey,
          relationId: ancestor.definition!.relation.id,
        })
        if (
          !ancestorCollection.visible ||
          !ancestorCollection.editable ||
          !ancestorRow.visible ||
          !ancestorRow.editable
        )
          failRuntime('DELETE_PERMISSION_REVOKED', '删除操作的祖先权限已收紧', {
            rowKey: item.row.clientRowKey,
          })
      }
      if (
        !collectionPolicy.visible ||
        !collectionPolicy.editable ||
        !rowPolicy.visible ||
        !rowPolicy.editable ||
        !collectionPolicy.operations[removal.operation] ||
        !rowPolicy.operations[removal.operation] ||
        (removal.cascade && (!rowPolicy.cascadeDelete || !collectionPolicy.cascadeDelete))
      )
        failRuntime('DELETE_PERMISSION_REVOKED', '删除或解除操作的权限已改变，当前输入已保留', {
          rowKey: item.row.clientRowKey,
          scope: item.scope,
        })
      result.push({
        operationId: createRuntimeKey('operation'),
        operation: removal.operation,
        subject: item.row.target ? 'ASSOCIATION' : 'ROW',
        entityId: item.entityId,
        clientRowKey: item.row.clientRowKey,
        scope: cloneRuntime(item.scope),
        relationPath: [...item.definition!.relationPath],
        relationId: item.definition!.relation.id,
        parentRowKey: item.scope!.ancestorRowKeys.at(-1),
        recordRef: item.row.recordRef,
        associationRef: item.row.associationRef,
        expectedVersion: item.row.version,
        target: cloneRuntime(item.row.target),
        cascade: removal.cascade,
        dependsOn: [],
      })
    }
    const deletes = result.filter(
      (operation) => operation.operation === 'DELETE' || operation.operation === 'UNLINK',
    )
    for (const parent of deletes)
      parent.dependsOn = deletes
        .filter((child) => child.parentRowKey === parent.clientRowKey)
        .map((child) => child.operationId)
    return result
  }

  function prepareSubmission(): Promise<DesignerSubmissionBatch | null> {
    if (preparation) return preparation
    if (legacyPreparation || draftLocked) return Promise.resolve(null)
    preparation = commandQueue.then(performPreparation).finally(() => {
      preparation = undefined
      emit()
    })
    emit()
    return preparation
  }
  async function performPreparation(): Promise<DesignerSubmissionBatch | null> {
    try {
      assertWritable()
      if (legacy) failRuntime('LEGACY_SUBMISSION', '旧快照模式不支持关系原子保存批次')
      if (draftRoot) failRuntime('DRAFT_SUBMISSION', '弹层草稿必须确认到主会话后统一保存')
      if (drafts.size) failRuntime('DRAFT_PENDING', '仍有未确认的弹层草稿，不能保存')
      status = 'PREPARING'
      issues = []
      emit()
      await runEvents('BEFORE_SUBMIT', true)
      await calculate('CHANGE', true)
      await validate(true)
      const operations = projectOperations()
      if (!operations.length) {
        status = 'READY'
        emit()
        return null
      }
      const submissionId = createRuntimeKey('submission')
      pendingSubmission = {
        protocolVersion: '1.0',
        sessionId,
        submissionId,
        idempotencyKey: submissionId,
        baseRevision: baselineRevision,
        operations,
      }
      const batch = cloneRuntime(pendingSubmission)
      status = 'SUBMITTING'
      emit()
      try {
        await runEvents('AFTER_SUBMIT')
      } catch (error) {
        issues.push(safeIssue(error))
        emit()
      }
      return batch
    } catch (error) {
      if (status === 'PREPARING') status = 'READY'
      const issue = safeIssue(error)
      if (
        !issues.some(
          (current) =>
            current.code === issue.code &&
            current.rowKey === issue.rowKey &&
            current.fieldId === issue.fieldId,
        )
      )
        issues.push(issue)
      emit()
      return null
    }
  }
  function applyReceipt(receipt: DesignerSaveReceipt): DesignerRuntimeCommandResult {
    try {
      assertUsable()
      if (receipt.sessionId !== sessionId) failRuntime('RECEIPT_SESSION', '保存回执不属于当前会话')
      if (consumedSubmissions.has(receipt.submissionId)) return { ok: true, issues: [] }
      if (!pendingSubmission || pendingSubmission.submissionId !== receipt.submissionId)
        failRuntime('RECEIPT_BATCH', '保存回执不匹配当前提交批次')
      if (receipt.status === 'UNKNOWN') {
        status = 'UNKNOWN'
        issues = [
          {
            code: 'SUBMISSION_UNKNOWN',
            message: '保存结果尚未确认，请查询原批次结果；当前输入已保留',
          },
        ]
        emit()
        return { ok: false, issues: cloneRuntime(issues) }
      }
      if (receipt.status === 'REJECTED' || receipt.status === 'CONFLICT') {
        status = 'READY'
        pendingSubmission = undefined
        issues = receipt.issues.length
          ? receipt.issues.map((issue) => ({
              code: receipt.status === 'CONFLICT' ? 'SAVE_CONFLICT' : 'SAVE_REJECTED',
              message:
                receipt.status === 'CONFLICT'
                  ? '保存存在版本冲突，当前输入已保留'
                  : '宿主拒绝此次保存，当前输入已保留',
              rowKey: issue.rowKey && rows.has(issue.rowKey) ? issue.rowKey : undefined,
              fieldId: issue.fieldId && fields.has(issue.fieldId) ? issue.fieldId : undefined,
            }))
          : [{ code: 'SAVE_REJECTED', message: '保存未成功，当前输入已保留' }]
        emit()
        return { ok: false, issues: cloneRuntime(issues) }
      }
      if (receipt.status !== 'SUCCESS') failRuntime('RECEIPT_STATUS', '保存回执状态不正确')
      if (receipt.operations.length !== pendingSubmission.operations.length)
        failRuntime('RECEIPT_PARTIAL', '原子保存回执缺少操作结果，不能确认成功')
      const results = new Map(receipt.operations.map((result) => [result.operationId, result]))
      if (results.size !== receipt.operations.length)
        failRuntime('RECEIPT_DUPLICATE', '保存回执存在重复操作结果')
      const next = cloneRuntime(value)
      const nextRows = indexRuntimeRows(
        next,
        definitions,
        document.dataSchema.rootEntity.id,
        limits,
      )
      for (const operation of pendingSubmission.operations) {
        const result = results.get(operation.operationId)
        if (!result || result.clientRowKey !== operation.clientRowKey)
          failRuntime('RECEIPT_IDENTITY', '保存回执的操作或客户端行身份不匹配')
        if (operation.operation === 'DELETE' || operation.operation === 'UNLINK') continue
        if (result.version === undefined) failRuntime('RECEIPT_VERSION', '成功回执必须提供最终版本')
        validateValues(result.values ?? {}, operation.entityId)
        const item = nextRows.get(operation.clientRowKey)
        if (!item) failRuntime('RECEIPT_ROW', '待确认的行已不存在')
        if (operation.subject === 'TARGET') {
          const target = item.row.target
          if (!target) failRuntime('RECEIPT_TARGET', '共享目标回执缺少对应关系')
          if (
            result.target &&
            (result.target.identity !== target.identity ||
              result.target.entityId !== target.entityId)
          )
            failRuntime('RECEIPT_TARGET', '成功回执不能替换共享目标身份')
          const targetKey = createDesignerTargetKey(target.entityId, target.identity)
          const cached = next.targets[targetKey]
          cached.version = result.version
          Object.assign(
            cached.values,
            cloneRuntime(operation.values ?? {}),
            cloneRuntime(result.values ?? {}),
          )
          for (const linked of nextRows.values())
            if (
              linked.row.target?.entityId === target.entityId &&
              linked.row.target.identity === target.identity
            )
              linked.row.target.version = result.version
          if (result.target)
            item.row.target = {
              ...cloneRuntime(result.target),
              version: result.version,
              values: undefined,
            }
        } else {
          if (operation.operation === 'CREATE' && !result.recordRef)
            failRuntime('RECEIPT_RECORD', '新增记录回执缺少持久身份')
          if (operation.operation === 'LINK' && !result.associationRef)
            failRuntime('RECEIPT_ASSOCIATION', '新增关联回执缺少关联身份')
          if (result.recordRef) item.row.recordRef = result.recordRef
          if (result.associationRef) item.row.associationRef = result.associationRef
          item.row.version = result.version
          Object.assign(
            item.row.values,
            cloneRuntime(operation.values ?? {}),
            cloneRuntime(result.values ?? {}),
          )
          if (result.target) {
            if (
              !item.row.target ||
              result.target.entityId !== item.row.target.entityId ||
              result.target.identity !== item.row.target.identity
            )
              failRuntime('RECEIPT_TARGET', '回执不能更换当前关联目标')
            item.row.target = { ...cloneRuntime(result.target), values: undefined }
            const key = createDesignerTargetKey(result.target.entityId, result.target.identity)
            const cached = next.targets[key]
            if (cached && result.target.version !== cached.version) {
              cached.version = result.target.version
              Object.assign(cached.values, cloneRuntime(result.target.values ?? {}))
            }
          }
        }
      }
      indexRuntimeRows(next, definitions, document.dataSchema.rootEntity.id, limits)
      value = next
      rebuild()
      baseline = cloneRuntime(value)
      baselineRevision += 1
      origins = {}
      removals = []
      issues = []
      feedbacks = {}
      consumedSubmissions.add(receipt.submissionId)
      pendingSubmission = undefined
      status = 'READY'
      emit()
      void (preparation ?? Promise.resolve()).then(() =>
        dispatch({ type: 'FORM_EVENT', event: 'AFTER_COMMIT' }),
      )
      return { ok: true, issues: [] }
    } catch (error) {
      const issue = safeIssue(error)
      if (
        pendingSubmission &&
        receipt.sessionId === sessionId &&
        receipt.submissionId === pendingSubmission.submissionId &&
        receipt.status === 'SUCCESS'
      )
        status = 'UNKNOWN'
      issues = [issue]
      emit()
      return { ok: false, issues: [issue] }
    }
  }
  async function resolveSubmission(): Promise<void> {
    if (!pendingSubmission || !['SUBMITTING', 'UNKNOWN'].includes(status))
      failRuntime('SUBMISSION_MISSING', '当前没有待确认的保存批次')
    if (!adapters.submissionStatus)
      failRuntime('SUBMISSION_STATUS_MISSING', '宿主未提供保存结果查询能力')
    const request = controllerFor()
    const requestEpoch = epoch
    try {
      const receipt = await adapters.submissionStatus.resolve({
        batch: cloneRuntime(pendingSubmission),
        context: cloneRuntime(adapterContext),
        signal: request.controller.signal,
      })
      assertRequest(request.controller, requestEpoch)
      const result = applyReceipt(receipt)
      if (!result.ok && receipt.status !== 'UNKNOWN')
        throw new RuntimeSessionFailure(result.issues[0])
    } catch (error) {
      if (pendingSubmission && status !== 'DISPOSED') status = 'UNKNOWN'
      throw error instanceof RuntimeSessionFailure
        ? error
        : new RuntimeSessionFailure({
            code: 'SUBMISSION_UNKNOWN',
            message: '原保存结果仍未确认，请稍后查询原批次',
          })
    } finally {
      request.release()
    }
  }
  function reset(): DesignerRuntimeCommandResult {
    try {
      if (preparation || legacyPreparation || draftLocked)
        failRuntime('SUBMISSION_LOCKED', '表单正在准备保存，不能重置')
      assertWritable()
      epoch += 1
      requests.forEach((controller) => controller.abort())
      requests.clear()
      for (const draftId of [...drafts.keys()]) cancelDraft(draftId)
      value = cloneRuntime(baseline)
      for (const key of Object.keys(variables)) delete variables[key]
      for (const variable of document.variables)
        variables[variable.code] = cloneRuntime(variable.initialValue)
      origins = {}
      removals = []
      issues = []
      feedbacks = {}
      rebuild()
      emit()
      void dispatch({ type: 'FORM_EVENT', event: 'RESET' })
      return { ok: true, issues: [] }
    } catch (error) {
      return { ok: false, issues: [safeIssue(error)] }
    }
  }
  async function executeCommand(
    command: DesignerRuntimeCommand,
  ): Promise<DesignerRuntimeCommandResult> {
    assertUsable()
    if (command.type === 'RESOLVE_SUBMISSION') {
      await resolveSubmission()
      return { ok: true, issues: [] }
    }
    if (command.type === 'CANCEL_DRAFT') {
      cancelDraft(command.draftId)
      return { ok: true, issues: [] }
    }
    if (
      command.type === 'LOAD_COLLECTION' ||
      command.type === 'MERGE_COLLECTION' ||
      command.type === 'RESOLVE_REFERENCES' ||
      command.type === 'EVENT' ||
      command.type === 'FORM_EVENT' ||
      command.type === 'BEGIN_DRAFT'
    ) {
      if (status !== 'READY') failRuntime('SUBMISSION_LOCKED', '保存期间不能合并新的关系数据')
    } else assertWritable()
    let result: DesignerRuntimeCommandResult = { ok: true, issues: [] }
    if (command.type === 'SET_FIELD') setField(command.rowKey, command.fieldId, command.value)
    if (command.type === 'REVERT_FIELD') {
      const item = address(command.rowKey)
      assertDraftScope(item)
      const field = fields.get(command.fieldId)
      if (!field) failRuntime('FIELD_MISSING', '字段不存在')
      if (
        field.entityCode !== entityById.get(item.entityId)?.code &&
        (!item.row.target || field.entityCode !== entityById.get(item.row.target.entityId)?.code)
      )
        failRuntime('FIELD_SCOPE', '不能还原其他实体的字段', {
          rowKey: command.rowKey,
          fieldId: command.fieldId,
        })
      if (item.row.target && item.row.target.entityId === entityByCode(field.entityCode)) {
        const key = createDesignerTargetKey(item.row.target.entityId, item.row.target.identity)
        value.targets[key].values[command.fieldId] = cloneRuntime(
          baseline.targets[key]?.values[command.fieldId],
        )
        delete origins[key]?.[command.fieldId]
      } else {
        const clean = indexRuntimeRows(
          baseline,
          definitions,
          document.dataSchema.rootEntity.id,
          limits,
        ).get(command.rowKey)
        item.row.values[command.fieldId] = cloneRuntime(clean?.row.values[command.fieldId])
      }
    }
    if (command.type === 'CREATE_ROW')
      result = { ...result, rowKey: addRow(command.scope, command.values) }
    if (command.type === 'COPY_ROW') result = { ...result, rowKey: await copyRow(command.rowKey) }
    if (command.type === 'DELETE_ROW') removeRow(command.rowKey, false)
    if (command.type === 'UNLINK') removeRow(command.rowKey, true)
    if (command.type === 'LINK') await link(command.scope, command.candidates, {}, command.signal)
    if (command.type === 'LOAD_COLLECTION')
      await loadCollection(command.scope, command.more, command.signal)
    if (command.type === 'RESOLVE_REFERENCES')
      await resolveReferences(command.scope, command.signal)
    if (command.type === 'MERGE_COLLECTION') mergeCollection(command)
    if (command.type === 'BEGIN_DRAFT')
      result = { ...result, draftId: beginDraft(command.rowKey, command.moduleCode) }
    if (command.type === 'CONFIRM_DRAFT') await confirmDraft(command.draftId)
    if (command.type === 'EVENT') await runEvents(command)
    if (command.type === 'FORM_EVENT') {
      if (command.event === 'INITIALIZED' && !options.initialState && mode === 'CREATE')
        seedInitialRows(value.root.clientRowKey)
      await runEvents(command.event)
      if (command.event === 'INITIALIZED' && !isDesignerRuntimeWriteBlocked(mode))
        await calculate('INITIALIZE')
    }
    if (
      [
        'SET_FIELD',
        'CREATE_ROW',
        'COPY_ROW',
        'LINK',
        'CONFIRM_DRAFT',
        'EVENT',
        'FORM_EVENT',
      ].includes(command.type) &&
      !isDesignerRuntimeWriteBlocked(mode)
    )
      await calculate(
        ['CREATE_ROW', 'COPY_ROW', 'LINK', 'CONFIRM_DRAFT'].includes(command.type)
          ? 'INITIALIZE'
          : 'CHANGE',
      )
    if (command.type === 'FORM_EVENT' && command.event === 'INITIALIZED')
      baseline = cloneRuntime(value)
    if (submitRequested) {
      submitRequested = false
      if (legacy) result.submissionRequested = true
      else
        queueMicrotask(() => {
          void prepareSubmission()
        })
    }
    return result
  }
  function dispatch(command: DesignerRuntimeCommand): Promise<DesignerRuntimeCommandResult> {
    if (preparation || legacyPreparation || draftLocked)
      return Promise.resolve({
        ok: false,
        issues: [{ code: 'SUBMISSION_LOCKED', message: '表单正在准备保存，不能执行新的运行命令' }],
      })
    const task = commandQueue.then(async () => {
      changedFieldAddresses.clear()
      const backup = {
        value: cloneRuntime(value),
        baseline: cloneRuntime(baseline),
        origins: cloneRuntime(origins),
        removals: cloneRuntime(removals),
      }
      const commandEpoch = epoch
      try {
        const result = await executeCommand(command)
        // 聚焦、失焦等成功命令不能抹掉仍未解决的脏值授权诊断。
        // 冻结中的回执诊断由保存状态机维护，不能被查询命令覆盖。
        if (status === 'READY') refreshDirtyIssues(issues.length > 0)
        emit()
        return result
      } catch (error) {
        if (commandEpoch === epoch && command.type !== 'RESOLVE_SUBMISSION') {
          value = backup.value
          baseline = backup.baseline
          origins = backup.origins
          removals = backup.removals
          rebuild()
        }
        const issue = safeIssue(error)
        submitRequested = false
        if (
          command.type === 'LOAD_COLLECTION' &&
          commandEpoch === epoch &&
          issue.code !== 'REQUEST_CANCELLED'
        ) {
          const collection = value.collections[createDesignerCollectionKey(command.scope)]
          if (collection) {
            collection.loadState = 'FAILED'
            collection.error = '关系数据加载失败，已有输入已保留'
          }
        }
        issues = [issue]
        emit()
        return { ok: false, issues: [issue] }
      }
    })
    commandQueue = task.then(
      () => undefined,
      () => undefined,
    )
    return task
  }
  function refreshDirtyIssues(check: boolean): void {
    issues = []
    if (legacy || !check) return
    try {
      projectOperations()
    } catch (error) {
      issues = [safeIssue(error)]
    }
  }
  function projectLegacySubmission(): Promise<DesignerSubmissionProjection | null> {
    if (legacyPreparation) return legacyPreparation
    if (preparation || draftLocked) return Promise.resolve(null)
    legacyPreparation = commandQueue
      .then(async () => {
        try {
          assertWritable()
          if (!legacy) failRuntime('MANAGED_SUBMISSION', '关系会话必须使用显式操作提交')
          if (drafts.size) failRuntime('DRAFT_PENDING', '仍有未确认的弹层草稿')
          status = 'PREPARING'
          await runEvents('BEFORE_SUBMIT', true)
          await calculate('CHANGE', true)
          await validate(true)
          const rootStates = Object.fromEntries(
            document.dataSchema.fields.map((field) => [
              field.id,
              readFieldState(value.root.clientRowKey, field.id, true),
            ]),
          )
          const projection = projectDesignerSubmission(
            document,
            { fields: cloneRuntime(value.root.values), collections: {} },
            rootStates,
          )
          const excluded = new Set(projection.excludedFieldIds)
          for (const collection of Object.values(value.collections)) {
            const projectedRows = collection.rows.flatMap((row) => {
              if (!ownPolicy(address(row.clientRowKey)).visible) return []
              const states = Object.fromEntries(
                document.dataSchema.fields.map((field) => [
                  field.id,
                  readFieldState(row.clientRowKey, field.id, true),
                ]),
              )
              const projected = projectDesignerSubmission(
                document,
                {
                  fields: {},
                  collections: {
                    [collection.scope.containerId]: [
                      { rowId: row.clientRowKey, values: cloneRuntime(row.values) },
                    ],
                  },
                },
                states,
              )
              projected.excludedFieldIds.forEach((fieldId) => excluded.add(fieldId))
              return projected.collections[collection.scope.containerId] ?? []
            })
            projection.collections[collection.scope.containerId] = projectedRows
          }
          projection.excludedFieldIds = [...excluded]
          status = 'READY'
          issues = []
          return projection
        } catch (error) {
          if (status === 'PREPARING') status = 'READY'
          issues = [safeIssue(error)]
          return null
        }
      })
      .finally(() => {
        legacyPreparation = undefined
        emit()
      })
    emit()
    return legacyPreparation
  }
  const session: DesignerRuntimeSession = {
    get document() {
      return cloneRuntime(document)
    },
    get mode() {
      return mode
    },
    adapters,
    adapterContext,
    limits,
    getSnapshot: snapshot,
    subscribe(listener) {
      assertUsable()
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    dispatch,
    updateRuntimePolicy(policy) {
      assertUsable()
      if (policy.mode) mode = policy.mode
      if (Object.hasOwn(policy, 'fieldRuntimePolicy')) globalFields = policy.fieldRuntimePolicy
      if (Object.hasOwn(policy, 'relationRuntimePolicy'))
        policyResolver = policy.relationRuntimePolicy
      for (const draft of drafts.values()) draft.session.updateRuntimePolicy(policy)
      if (status === 'READY') refreshDirtyIssues(true)
      emit()
    },
    readRow(rowKey) {
      assertUsable()
      const item = rows.get(rowKey)
      return item ? readableRow(item) : undefined
    },
    readFieldState,
    readPolicy,
    scopeFor,
    readCollection(scope) {
      assertUsable()
      const collection = collectionFor(scope)
      if (!readPolicy(scope).visible)
        return {
          scope: cloneRuntime(scope),
          relationPath: [...collection.relationPath],
          rows: [],
          loadState: 'UNLOADED',
        }
      return {
        ...cloneRuntime(collection),
        rows: collection.rows.flatMap((row) => {
          const visible = readableRow(address(row.clientRowKey))
          return visible ? [visible] : []
        }),
      }
    },
    queryCandidates,
    getDraft: (draftId) => drafts.get(draftId)?.session,
    prepareSubmission,
    applyReceipt,
    reset,
    projectLegacySubmission,
    dispose() {
      if (status === 'DISPOSED') return
      epoch += 1
      requests.forEach((controller) => controller.abort())
      requests.clear()
      for (const draftId of [...drafts.keys()]) cancelDraft(draftId)
      status = 'DISPOSED'
      listeners.clear()
    },
  }
  sessionInternals.set(session, {
    origins: () => cloneRuntime(origins),
    removals: () => cloneRuntime(removals),
    fieldState: (rowKey, fieldId) => readFieldState(rowKey, fieldId, true),
    async lockForConfirmation() {
      if (draftLocked || preparation || legacyPreparation)
        failRuntime('DRAFT_BUSY', '草稿正在确认，请稍候')
      draftLocked = true
      emit()
      const release = () => {
        draftLocked = false
        if (status === 'PREPARING') status = 'READY'
        emit()
      }
      try {
        await commandQueue
        assertWritable()
        status = 'PREPARING'
        emit()
        await calculate('CHANGE', true)
        await validate(true)
        return release
      } catch (error) {
        release()
        throw error
      }
    },
  })
  if (!draftRoot) void dispatch({ type: 'FORM_EVENT', event: 'INITIALIZED' })
  return session
}

function intersectFieldPolicy(
  left?: FormFieldRuntimePolicy,
  right?: FormFieldRuntimePolicy,
): FormFieldRuntimePolicy {
  const levels = [left?.accessLevel ?? 'EDITABLE', right?.accessLevel ?? 'EDITABLE']
  return {
    accessLevel: levels.includes('HIDDEN')
      ? 'HIDDEN'
      : levels.includes('READ_ONLY')
        ? 'READ_ONLY'
        : 'EDITABLE',
    required: left?.required === true || right?.required === true,
  }
}

function intersectFieldMaps(
  left?: FormFieldRuntimePolicyMap,
  right?: FormFieldRuntimePolicyMap,
  complete = false,
): FormFieldRuntimePolicyMap | undefined {
  if (!left && !right) return complete ? {} : undefined
  return Object.fromEntries(
    [...new Set([...Object.keys(left ?? {}), ...Object.keys(right ?? {})])].map((fieldId) => [
      fieldId,
      intersectFieldPolicy(
        readDesignerFieldRuntimePolicy(left, fieldId),
        readDesignerFieldRuntimePolicy(right, fieldId),
      ),
    ]),
  )
}
