import {
  createDesignerCollectionKey,
  createDesignerTargetKey,
  type DesignerCollectionScope,
  type DesignerOperationReceipt,
  type DesignerRelationCandidate,
  type DesignerRelationRequest,
  type DesignerRelationValueStore,
  type DesignerRuntimeIssue,
  type DesignerRuntimeRow,
  type DesignerRuntimeTarget,
  type DesignerRuntimeTargetReference,
  type DesignerSaveReceipt,
  type DesignerSubmissionBatch,
  type DesignerSubmissionOperation,
  type FormRuntimeAdapters,
} from '@daxiangme/form-core'

/** 内存保存演示场景；UNKNOWN 模拟服务端已提交但客户端未收到回执。 */
export type LocalRelationSaveScenario = 'SUCCESS' | 'REJECTED' | 'CONFLICT' | 'UNKNOWN'

/** 候选选择演示场景；STALE 在确认校验时拒绝已有选择。 */
export type LocalRelationSelectionScenario = 'READY' | 'EMPTY' | 'ERROR' | 'STALE'

/** 创建纯内存关系 Adapter 的公开虚拟数据选项，不得传入真实宿主引用。 */
export interface CreateLocalRelationFormAdapterOptions {
  /** 初始运行数据；工厂保存独立副本。 */
  initialState: DesignerRelationValueStore
  /** 可供不同父行关联的公开虚拟候选。 */
  candidates: DesignerRelationCandidate[]
  /** 每次候选或关系加载的页大小，默认 2。 */
  pageSize?: number
  /** 模拟异步响应的延迟毫秒数，默认 250。 */
  delayMs?: number
}

/** 带原子保存、场景切换和资源清理的本地关系 Adapter。 */
export interface LocalRelationFormAdapterHandle {
  /** 可直接注入 Core 会话的关系端口。 */
  adapters: FormRuntimeAdapters
  /** 使用提交身份和幂等标识保存完整批次；不访问网络。 */
  save: (batch: DesignerSubmissionBatch, signal?: AbortSignal) => Promise<DesignerSaveReceipt>
  /** 切换后续保存的演示结果；已处理批次仍返回原结果。 */
  setSaveScenario: (scenario: LocalRelationSaveScenario) => void
  /** 切换后续候选查询和确认的演示场景。 */
  setSelectionScenario: (scenario: LocalRelationSelectionScenario) => void
  /** 模拟后续关系加载失败，已持有的行和未保存修改保持原样。 */
  setCollectionLoadFailure: (failed: boolean) => void
  /** 取消尚未完成的本地请求并释放内存，不修改宿主会话。 */
  dispose: () => void
}

interface RememberedSubmission {
  fingerprint: string
  receipt: DesignerSaveReceipt
}

/**
 * 创建纯内存关系 Adapter，用于真实交互演示。
 *
 * 候选引用按父行生成公开演示标识；保存先在副本验证和执行整个批次，成功后一次替换。
 * 此实现不提供生产鉴权或数据库持久化，宿主应实现相同 Core 端口。
 */
export function createLocalRelationFormAdapter(
  options: CreateLocalRelationFormAdapterOptions,
): LocalRelationFormAdapterHandle {
  const pageSize = boundedInteger(options.pageSize, 2, 1, 100)
  const delayMs = boundedInteger(options.delayMs, 250, 0, 10_000)
  let persisted = clone(options.initialState)
  const candidates = clone(options.candidates)
  const submissions = new Map<string, RememberedSubmission>()
  const pending = new Set<AbortController>()
  let saveScenario: LocalRelationSaveScenario = 'SUCCESS'
  let selectionScenario: LocalRelationSelectionScenario = 'READY'
  let collectionLoadFailure = false
  let serial = 0
  let disposed = false
  seedTargets(persisted, candidates)

  const adapters: FormRuntimeAdapters = {
    relationData: {
      async loadCollection(request) {
        await pause(request.signal)
        if (collectionLoadFailure) throw new Error('演示关系数据暂时无法加载')
        const collection = persisted.collections[createDesignerCollectionKey(request.scope)]
        const rows = collection?.rows ?? []
        const offset = readCursor(request.cursor)
        const page = rows.slice(offset, offset + pageSize)
        const hasMore = offset + pageSize < rows.length
        return {
          rows: page.map((row) => withCurrentTarget(row, request)),
          complete: !hasMore,
          cursor: hasMore ? String(offset + pageSize) : undefined,
          totalCount: rows.length,
        }
      },
    },
    relationSelection: {
      async queryCandidates(request) {
        await pause(request.signal)
        if (selectionScenario === 'ERROR')
          throw new Error('演示候选服务暂时不可用，请切换场景后重试')
        const keyword = request.keyword.trim().toLocaleLowerCase()
        const available =
          selectionScenario === 'EMPTY'
            ? []
            : candidates.filter((candidate) =>
                candidate.label.toLocaleLowerCase().includes(keyword),
              )
        const offset = readCursor(request.cursor)
        const hasMore = offset + pageSize < available.length
        return {
          items: available
            .slice(offset, offset + pageSize)
            .map((candidate) => resolveCandidate(candidate, request)),
          cursor: hasMore ? String(offset + pageSize) : undefined,
          totalCount: available.length,
        }
      },
      async resolveReferences(request) {
        await pause(request.signal)
        const items: DesignerRelationCandidate[] = []
        const issues: DesignerRuntimeIssue[] = []
        for (const reference of request.references) {
          const candidate = findCandidate(reference)
          if (candidate) items.push(resolveCandidate(candidate, request))
          else issues.push(selectionIssue(request.scope, '关联成员已不可访问，原关联仍保留'))
        }
        return { items, issues }
      },
      async validateSelection(request) {
        await pause(request.signal)
        const items: DesignerRelationCandidate[] = []
        const issues: DesignerRuntimeIssue[] = []
        const seen = new Set<string>()
        for (const selected of request.candidates) {
          const candidate = findCandidate(selected)
          const current = candidate ? resolveCandidate(candidate, request) : undefined
          if (
            selectionScenario === 'STALE' ||
            !current ||
            current.disabled ||
            current.version !== selected.version
          ) {
            issues.push(selectionIssue(request.scope, '候选已过期或不再允许关联，请刷新后重新选择'))
            continue
          }
          const key = createDesignerTargetKey(current.entityId, current.identity)
          if (!seen.has(key)) items.push(current)
          seen.add(key)
        }
        return { items, issues }
      },
    },
    submissionStatus: {
      async resolve(request) {
        await pause(request.signal)
        const previous = submissions.get(submissionKey(request.batch))
        if (previous && previous.fingerprint === JSON.stringify(request.batch))
          return clone(previous.receipt)
        return {
          sessionId: request.batch.sessionId,
          submissionId: request.batch.submissionId,
          status: 'UNKNOWN',
          message: '原批次尚无确定结果，继续保留输入和保存状态',
        }
      },
    },
  }

  return {
    adapters,
    async save(batch, signal) {
      const scenario = saveScenario
      await pause(signal)
      const key = submissionKey(batch)
      const fingerprint = JSON.stringify(batch)
      const previous = submissions.get(key)
      if (previous) {
        if (previous.fingerprint !== fingerprint)
          return refusal(batch, 'REJECTED', '同一幂等标识不能用于不同的提交内容')
        return clone(previous.receipt)
      }
      if (scenario === 'REJECTED' || scenario === 'CONFLICT') {
        const receipt = refusal(
          batch,
          scenario,
          scenario === 'REJECTED'
            ? '演示服务拒绝本次保存，输入已保留'
            : '演示记录版本冲突，输入已保留，请处理后再次提交',
        )
        submissions.set(key, { fingerprint, receipt })
        return clone(receipt)
      }
      const next = clone(persisted)
      const receipts: DesignerOperationReceipt[] = []
      const completed = new Set<string>()
      try {
        for (const operation of batch.operations) {
          if (
            completed.has(operation.operationId) ||
            operation.dependsOn.some((id) => !completed.has(id))
          ) {
            throw new Error('提交操作身份重复或依赖顺序不正确')
          }
          receipts.push(persistOperation(next, persisted, operation, () => ++serial))
          completed.add(operation.operationId)
        }
      } catch (error) {
        const receipt = refusal(
          batch,
          'CONFLICT',
          error instanceof Error ? error.message : '演示保存无法完成，输入已保留',
        )
        submissions.set(key, { fingerprint, receipt })
        return clone(receipt)
      }
      persisted = next
      for (const item of receipts) {
        if (!item.target) continue
        const target =
          persisted.targets[createDesignerTargetKey(item.target.entityId, item.target.identity)]
        if (target)
          item.target = { ...item.target, version: target.version, values: clone(target.values) }
      }
      const receipt: DesignerSaveReceipt = {
        sessionId: batch.sessionId,
        submissionId: batch.submissionId,
        status: 'SUCCESS',
        operations: receipts,
      }
      submissions.set(key, { fingerprint, receipt })
      return scenario === 'UNKNOWN'
        ? {
            sessionId: batch.sessionId,
            submissionId: batch.submissionId,
            status: 'UNKNOWN',
            message: '已模拟回执丢失，请查询原批次结果恢复',
          }
        : clone(receipt)
    },
    setSaveScenario(scenario) {
      saveScenario = scenario
    },
    setSelectionScenario(scenario) {
      selectionScenario = scenario
    },
    setCollectionLoadFailure(failed) {
      collectionLoadFailure = failed
    },
    dispose() {
      disposed = true
      for (const controller of pending) controller.abort()
      pending.clear()
      submissions.clear()
      candidates.length = 0
      persisted.collections = {}
      persisted.targets = {}
      persisted.root.values = {}
    },
  }

  function findCandidate(
    reference: DesignerRuntimeTargetReference,
  ): DesignerRelationCandidate | undefined {
    return candidates.find(
      (candidate) =>
        candidate.entityId === reference.entityId && candidate.identity === reference.identity,
    )
  }

  function resolveCandidate(
    candidate: DesignerRelationCandidate,
    request: DesignerRelationRequest,
  ): DesignerRelationCandidate {
    const target =
      persisted.targets[createDesignerTargetKey(candidate.entityId, candidate.identity)]
    return {
      ...clone(candidate),
      reference: `demo-reference:${request.parent.clientRowKey}:${candidate.identity}`,
      version: target?.version ?? candidate.version,
      values: clone(target?.values ?? candidate.values ?? {}),
    }
  }

  function withCurrentTarget(
    row: DesignerRuntimeRow,
    request: DesignerRelationRequest,
  ): DesignerRuntimeRow {
    const result = clone(row)
    if (result.target) {
      const candidate = findCandidate(result.target)
      if (candidate) result.target = resolveCandidate(candidate, request)
    }
    return result
  }

  async function pause(signal?: AbortSignal): Promise<void> {
    if (disposed || signal?.aborted) throw new DOMException('本地关系请求已取消', 'AbortError')
    const controller = new AbortController()
    const relay = () => controller.abort()
    signal?.addEventListener('abort', relay, { once: true })
    pending.add(controller)
    try {
      await new Promise<void>((resolve, reject) => {
        const finish = () => {
          controller.signal.removeEventListener('abort', cancel)
          resolve()
        }
        const timer = globalThis.setTimeout(finish, delayMs)
        const cancel = () => {
          globalThis.clearTimeout(timer)
          reject(new DOMException('本地关系请求已取消', 'AbortError'))
        }
        controller.signal.addEventListener('abort', cancel, { once: true })
      })
    } finally {
      signal?.removeEventListener('abort', relay)
      pending.delete(controller)
    }
  }
}

function persistOperation(
  state: DesignerRelationValueStore,
  baseline: DesignerRelationValueStore,
  operation: DesignerSubmissionOperation,
  nextId: () => number,
): DesignerOperationReceipt {
  const receipt: DesignerOperationReceipt = {
    operationId: operation.operationId,
    clientRowKey: operation.clientRowKey,
  }
  const values = normalizeValues(operation.values ?? {})
  if (operation.subject === 'TARGET') {
    if (operation.operation !== 'UPDATE' || !operation.target)
      throw new Error('共享目标只支持独立授权的修改')
    const key = createDesignerTargetKey(operation.target.entityId, operation.target.identity)
    const target = state.targets[key]
    if (!target || baseline.targets[key]?.version !== operation.expectedVersion)
      throw new Error('共享成员版本已变化，请重新确认修改')
    target.values = { ...target.values, ...values }
    target.version = `demo-version-${nextId()}`
    for (const collection of Object.values(state.collections)) {
      for (const row of collection.rows) {
        if (row.target?.entityId === target.entityId && row.target.identity === target.identity) {
          row.target.version = target.version
          row.target.values = clone(target.values)
        }
      }
    }
    return {
      ...receipt,
      version: target.version,
      values,
      target: { ...operation.target, version: target.version, values },
    }
  }
  const collection = operation.scope
    ? state.collections[createDesignerCollectionKey(operation.scope)]
    : undefined
  const existing =
    operation.subject === 'ROOT'
      ? state.root
      : collection?.rows.find((row) => row.clientRowKey === operation.clientRowKey)
  if (operation.operation === 'CREATE' || operation.operation === 'LINK') {
    if (existing && (existing.recordRef || existing.associationRef))
      throw new Error('演示行已经保存，不能重复新增')
    if (operation.operation === 'LINK') {
      if (!operation.target) throw new Error('关联操作缺少目标身份')
      const target =
        state.targets[createDesignerTargetKey(operation.target.entityId, operation.target.identity)]
      const originalTarget =
        baseline.targets[
          createDesignerTargetKey(operation.target.entityId, operation.target.identity)
        ]
      if (!target || originalTarget?.version !== operation.target.version)
        throw new Error('关联候选版本已变化，请重新选择')
      if (
        collection?.rows.some(
          (row) =>
            row.target?.entityId === operation.target?.entityId &&
            row.target?.identity === operation.target?.identity,
        )
      )
        throw new Error('当前父行已关联该成员')
    }
    const row: DesignerRuntimeRow = {
      clientRowKey: operation.clientRowKey,
      values,
      version: `demo-version-${nextId()}`,
      ...(operation.operation === 'LINK'
        ? { associationRef: `demo-association-${nextId()}`, target: clone(operation.target) }
        : { recordRef: `demo-record-${nextId()}` }),
    }
    if (operation.subject === 'ROOT') state.root = row
    else {
      if (!operation.scope) throw new Error('关系操作缺少集合地址')
      const parentKey = operation.scope.ancestorRowKeys.at(-1)
      if (!parentKey || !findRow(state, parentKey)) throw new Error('新增关系行的父行尚未保存')
      const key = createDesignerCollectionKey(operation.scope)
      const targetCollection = state.collections[key] ?? {
        scope: clone(operation.scope),
        relationPath: [...operation.relationPath],
        rows: [],
        loadState: 'COMPLETE' as const,
      }
      targetCollection.rows.push(row)
      targetCollection.totalCount = targetCollection.rows.length
      state.collections[key] = targetCollection
    }
    return {
      ...receipt,
      recordRef: row.recordRef,
      associationRef: row.associationRef,
      version: row.version,
      values,
      target: row.target,
    }
  }
  if (!existing || existing.version !== operation.expectedVersion)
    throw new Error('记录或关联版本已变化，请重新确认修改')
  if (
    (operation.recordRef !== undefined && operation.recordRef !== existing.recordRef) ||
    (operation.associationRef !== undefined && operation.associationRef !== existing.associationRef)
  )
    throw new Error('记录或关联身份不匹配')
  if (operation.operation === 'DELETE' || operation.operation === 'UNLINK') {
    if (!collection) throw new Error('不能通过关系删除操作删除根记录')
    if (operation.operation === 'UNLINK' && !existing.target)
      throw new Error('解除操作仅适用于关联记录')
    const descendants = Object.entries(state.collections).filter(([, item]) =>
      item.scope.ancestorRowKeys.includes(existing.clientRowKey),
    )
    if (!operation.cascade && descendants.some(([, item]) => item.rows.length > 0))
      throw new Error('父行仍有子数据，宿主未声明级联删除')
    for (const [key] of descendants) delete state.collections[key]
    collection.rows = collection.rows.filter((row) => row.clientRowKey !== existing.clientRowKey)
    collection.totalCount = collection.rows.length
    return receipt
  }
  existing.values = { ...existing.values, ...values }
  existing.version = `demo-version-${nextId()}`
  return {
    ...receipt,
    recordRef: existing.recordRef,
    associationRef: existing.associationRef,
    version: existing.version,
    values,
    target: existing.target,
  }
}

function findRow(
  state: DesignerRelationValueStore,
  rowKey: string,
): DesignerRuntimeRow | undefined {
  return state.root.clientRowKey === rowKey
    ? state.root
    : Object.values(state.collections)
        .flatMap((collection) => collection.rows)
        .find((row) => row.clientRowKey === rowKey)
}

function seedTargets(
  state: DesignerRelationValueStore,
  candidates: DesignerRelationCandidate[],
): void {
  const targets: DesignerRuntimeTargetReference[] = [...candidates]
  for (const collection of Object.values(state.collections))
    for (const row of collection.rows) if (row.target) targets.push(row.target)
  for (const target of targets) {
    const key = createDesignerTargetKey(target.entityId, target.identity)
    const existing = state.targets[key]
    if (existing && existing.version !== target.version)
      throw new Error('演示初始共享成员版本不一致')
    const value: DesignerRuntimeTarget = {
      entityId: target.entityId,
      identity: target.identity,
      version: target.version,
      values: { ...target.values, ...existing?.values },
    }
    state.targets[key] = value
  }
}

function normalizeValues(values: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key,
      typeof value === 'string' ? value.trim() : clone(value),
    ]),
  )
}

function submissionKey(batch: DesignerSubmissionBatch): string {
  return JSON.stringify([batch.sessionId, batch.idempotencyKey])
}

function refusal(
  batch: DesignerSubmissionBatch,
  status: 'REJECTED' | 'CONFLICT',
  message: string,
): DesignerSaveReceipt {
  return {
    sessionId: batch.sessionId,
    submissionId: batch.submissionId,
    status,
    issues: [{ code: `LOCAL_SAVE_${status}`, message }],
  }
}

function selectionIssue(scope: DesignerCollectionScope, message: string): DesignerRuntimeIssue {
  return { code: 'LOCAL_SELECTION_UNAVAILABLE', message, scope: clone(scope) }
}

function boundedInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  return value !== undefined && Number.isInteger(value)
    ? Math.min(maximum, Math.max(minimum, value))
    : fallback
}

function readCursor(cursor: string | undefined): number {
  if (cursor === undefined) return 0
  const offset = Number(cursor)
  if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('演示分页位置无效，请重新查询')
  return offset
}

function clone<T>(value: T): T {
  return structuredClone(value)
}
