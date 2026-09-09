import type {
  DesignerComponentEvent,
  DesignerDocument,
  DesignerFieldFeedback,
  DesignerFormEvent,
  DesignerResolvedFieldState,
  DesignerResolvedNodeState,
  DesignerRuntimeAdapters,
  DesignerRuntimeMode,
  DesignerSubmissionProjection,
  FormFieldAccessFallback,
  FormFieldRuntimePolicyMap,
  FormRuntimeAdapterContext,
} from './types'

/** 宿主不透明版本；Core 仅做相等比较和传递，不推断版本先后。 */
export type DesignerRuntimeVersion = string | number

/** 运行集合地址；父链从根记录开始，包含当前集合的直接父行。 */
export interface DesignerCollectionScope {
  /** 设计布局容器身份。 */
  containerId: string
  /** 从根到直接父行的稳定客户端身份链。 */
  ancestorRowKeys: string[]
}

/** 当前关联路径获授权的共享实体引用；reference 不能跨父行复用。 */
export interface DesignerRuntimeTargetReference {
  /** 目标实体定义身份。 */
  entityId: string
  /** 宿主提供的稳定目标身份，用于同一会话内去重。 */
  identity: string
  /** 当前关联路径的不透明授权引用。 */
  reference: string
  /** 目标实体预期版本。 */
  version: DesignerRuntimeVersion
  /** 加载输入中的已授权字段；会话归并后由共享实体缓存统一持有。 */
  values?: Record<string, unknown>
}

/** 具有不可变客户端身份的运行行；身份与业务字段分开。 */
export interface DesignerRuntimeRow {
  /** 整个会话中保持稳定，保存回执不得替换。 */
  clientRowKey: string
  /** 以字段 ID 为键的根、拥有实体或关联记录字段值。 */
  values: Record<string, unknown>
  /** 已持久化拥有实体的不透明记录引用。 */
  recordRef?: string
  /** 已持久化关联记录的不透明引用。 */
  associationRef?: string
  /** 当前记录或关联记录的预期版本。 */
  version?: DesignerRuntimeVersion
  /** 多对多共享目标引用，与当前关联记录的身份及版本独立。 */
  target?: DesignerRuntimeTargetReference
}

/** 共享目标实体的唯一运行副本；读取必须再经过当前路径权限投影。 */
export interface DesignerRuntimeTarget {
  /** 目标实体定义身份。 */
  entityId: string
  /** 稳定目标身份。 */
  identity: string
  /** 已知目标版本。 */
  version: DesignerRuntimeVersion
  /** 已加载字段；缺失字段不表示清空。 */
  values: Record<string, unknown>
}

/** 集合加载状态；空的完整集合与未加载集合具有不同语义。 */
export type DesignerCollectionLoadState = 'UNLOADED' | 'LOADING' | 'PARTIAL' | 'COMPLETE' | 'FAILED'

/** 具体父行下的集合实例。 */
export interface DesignerRuntimeCollection {
  /** 集合的完整地址。 */
  scope: DesignerCollectionScope
  /** 从根开始的关系 ID 路径。 */
  relationPath: string[]
  /** 当前已加载行，顺序为运行顺序。 */
  rows: DesignerRuntimeRow[]
  /** 加载覆盖状态。 */
  loadState: DesignerCollectionLoadState
  /** 后续页的不透明游标。 */
  cursor?: string
  /** 宿主报告的总行数；省略表示未知。 */
  totalCount?: number
  /** 是否还有未加载页。 */
  hasMore?: boolean
  /** 可显示且不含宿主引用的加载错误。 */
  error?: string
}

/** 版本化关系值快照；仅属于运行会话，不允许写入设计文档。 */
export interface DesignerRelationValueStore {
  /** 关系运行快照版本。 */
  runtimeVersion: '1.0'
  /** 根记录同样具有客户端身份和持久元数据。 */
  root: DesignerRuntimeRow
  /** 以 Core 生成的集合键索引具体集合实例。 */
  collections: Record<string, DesignerRuntimeCollection>
  /** 以 Core 生成的实体键索引共享目标。 */
  targets: Record<string, DesignerRuntimeTarget>
}

/** 关系写操作；目标实体 UPDATE 另外检查 targetEditable 和目标字段授权。 */
export type DesignerRelationOperation = 'CREATE' | 'UPDATE' | 'DELETE' | 'LINK' | 'UNLINK'

/** 宿主对集合或具体行的权威权限。 */
export interface FormRelationRuntimePolicy {
  /** 当前集合或行是否可见。 */
  visible: boolean
  /** 当前集合或行是否可编辑。 */
  editable: boolean
  /** 各操作独立授权，缺失项拒绝。 */
  operations: Partial<Record<DesignerRelationOperation, boolean>>
  /** 拥有实体或关联记录的字段策略；与全局策略求交。 */
  fields?: FormFieldRuntimePolicyMap
  /** 是否独立允许编辑共享目标；不由 LINK 或关联 UPDATE 推导。 */
  targetEditable?: boolean
  /** 共享目标字段的完整授权投影，缺失字段拒绝。 */
  targetFields?: FormFieldRuntimePolicyMap
  /** 宿主明确允许删除父行时级联处理未加载后代。 */
  cascadeDelete?: boolean
}

/** 同步权限解析地址，不暴露其他父行数据。 */
export interface DesignerRuntimePolicyContext {
  /** ROOT 表示根记录；COLLECTION 表示操作栏；ROW 表示具体行。 */
  kind: 'ROOT' | 'COLLECTION' | 'ROW'
  /** 非根上下文的集合地址。 */
  scope?: DesignerCollectionScope
  /** 当前行客户端身份。 */
  rowKey?: string
  /** 当前语义关系身份。 */
  relationId?: string
}

/** 按集合和行解析权限；返回 undefined 时关闭新的关系能力。 */
export type FormRelationRuntimePolicyResolver = (
  context: DesignerRuntimePolicyContext,
) => FormRelationRuntimePolicy | undefined

/** 运行资源限制；超限必须诊断，禁止静默裁剪。 */
export interface DesignerRuntimeLimits {
  /** 默认 16。 */
  maxRelationDepth: number
  /** 默认 32。 */
  maxLayoutDepth: number
  /** 默认 10,000，计算整个会话已加载行。 */
  maxLoadedRows: number
}

/** 可定位运行问题；消息不得包含宿主不透明引用。 */
export interface DesignerRuntimeIssue {
  /** 稳定诊断代码。 */
  code: string
  /** 用户可读中文消息。 */
  message: string
  /** 文档结构诊断的 JSON 路径。 */
  path?: string
  /** 发生结构限制或引用问题的布局节点。 */
  nodeId?: string
  /** 出错的集合地址。 */
  scope?: DesignerCollectionScope
  /** 出错行的客户端身份。 */
  rowKey?: string
  /** 出错字段身份。 */
  fieldId?: string
}

/** 共享目标脏字段的独立授权来源；宿主应逐字段核验引用所属父行。 */
export interface DesignerTargetFieldOrigin {
  /** 修改发生的完整集合作用域。 */
  scope: DesignerCollectionScope
  /** 授权来源关联行的客户端身份。 */
  rowKey: string
  /** 仅属于该路径的不透明授权引用，不能使用另一字段来源的引用替代。 */
  reference: string
  /** 来源关联已持久化时提供其身份，新 LINK 可通过 rowKey 在批次中解析。 */
  associationRef?: string
}

/** 待持久化的单项显式操作；不包含缺席即删除语义。 */
export interface DesignerSubmissionOperation {
  /** 批次内唯一操作身份。 */
  operationId: string
  /** CREATE、UPDATE、DELETE、LINK、UNLINK 的明确操作语义。 */
  operation: DesignerRelationOperation
  /** 根记录、拥有行、关联记录、共享目标分别处理。 */
  subject: 'ROOT' | 'ROW' | 'ASSOCIATION' | 'TARGET'
  /** 语义实体身份。 */
  entityId: string
  /** 当前操作行的客户端身份。 */
  clientRowKey: string
  /** 非根操作的集合地址。 */
  scope?: DesignerCollectionScope
  /** 根开始的关系身份路径。 */
  relationPath: string[]
  /** 当前关系身份。 */
  relationId?: string
  /** 可指向本批次新父行的客户端身份。 */
  parentRowKey?: string
  /** 当前持久记录引用。 */
  recordRef?: string
  /** 当前关联记录引用。 */
  associationRef?: string
  /** 当前主体预期版本。 */
  expectedVersion?: DesignerRuntimeVersion
  /** 关联目标引用，保存授权来源路径的引用。 */
  target?: DesignerRuntimeTargetReference
  /** 实际变化且可写字段；缺失字段保持原值，null 表示显式清空。 */
  values?: Record<string, unknown>
  /** 共享目标各脏字段的授权来源行。 */
  fieldOrigins?: Record<string, DesignerTargetFieldOrigin>
  /** 父删除明确交由宿主级联处理子树。 */
  cascade?: boolean
  /** 必须先成功执行的同批操作身份。 */
  dependsOn: string[]
}

/** 一次原子保存批次；同一批次身份同时用于宿主幂等与结果查询。 */
export interface DesignerSubmissionBatch {
  /** 操作协议版本。 */
  protocolVersion: '1.0'
  /** 来源会话身份。 */
  sessionId: string
  /** 稳定提交身份，未知结果时不得重新生成。 */
  submissionId: string
  /** 宿主保存必须使用的稳定幂等标识。 */
  idempotencyKey: string
  /** 本地已确认基线修订号。 */
  baseRevision: number
  /** 已按依赖顺序排列的显式操作。 */
  operations: DesignerSubmissionOperation[]
}

/** 成功回执中一项操作的最终身份、版本和规范化值。 */
export interface DesignerOperationReceipt {
  /** 对应批次操作身份。 */
  operationId: string
  /** 对应不可变客户端行身份。 */
  clientRowKey: string
  /** 新建或更新后的持久引用。 */
  recordRef?: string
  /** 新关联或更新后的关联引用。 */
  associationRef?: string
  /** 当前主体的最终版本。 */
  version?: DesignerRuntimeVersion
  /** 服务端最终字段值；未返回字段沿用本次已提交值。 */
  values?: Record<string, unknown>
  /** 目标引用和最终目标版本。 */
  target?: DesignerRuntimeTargetReference
}

/** 原子保存回执；部分成功不是受支持的成功结果。 */
export type DesignerSaveReceipt = {
  /** 来源会话身份。 */
  sessionId: string
  /** 必须匹配当前在途提交。 */
  submissionId: string
} & (
  | { status: 'SUCCESS'; operations: DesignerOperationReceipt[] }
  | { status: 'REJECTED' | 'CONFLICT'; issues: DesignerRuntimeIssue[] }
  | { status: 'UNKNOWN'; message?: string }
)

/** 关系候选；稳定身份与当前作用域授权引用分离。 */
export interface DesignerRelationCandidate extends DesignerRuntimeTargetReference {
  /** 不含敏感引用的候选显示名。 */
  label: string
  /** 宿主禁止选择时的显示状态。 */
  disabled?: boolean
}

/** 关系数据端口的共同请求上下文。 */
export interface DesignerRelationRequest {
  /** 具体集合地址。 */
  scope: DesignerCollectionScope
  /** 完整语义关系路径。 */
  relationPath: string[]
  /** 直接父行身份及运行元数据。 */
  parent: DesignerRuntimeRow
  /** 宿主上下文，不写入 Schema。 */
  context: FormRuntimeAdapterContext
  /** 取消请求；宿主传输应绑定该信号。 */
  signal: AbortSignal
}

/** 加载关系集合的细粒度宿主端口。 */
export interface FormRelationDataAdapter {
  /** 返回当前页与覆盖范围，不能把局部缺失解释成删除。 */
  loadCollection(request: DesignerRelationRequest & { cursor?: string }): Promise<{
    rows: DesignerRuntimeRow[]
    complete: boolean
    cursor?: string
    totalCount?: number
  }>
}

/** 多对多候选查询、回显和确认时重新鉴权端口。 */
export interface FormRelationSelectionAdapter {
  /** 查询独立候选页；已选集合不能依赖此页保存。 */
  queryCandidates(
    request: DesignerRelationRequest & { keyword: string; cursor?: string },
  ): Promise<{
    items: DesignerRelationCandidate[]
    cursor?: string
    totalCount?: number
  }>
  /** 回显已有引用；不可访问和失效引用通过 issue 表达，不自动解除。 */
  resolveReferences(
    request: DesignerRelationRequest & { references: DesignerRuntimeTargetReference[] },
  ): Promise<{
    items: DesignerRelationCandidate[]
    issues: DesignerRuntimeIssue[]
  }>
  /** 确认前重新核验选择，并返回当前路径的有效引用和版本。 */
  validateSelection(
    request: DesignerRelationRequest & { candidates: DesignerRelationCandidate[] },
  ): Promise<{
    items: DesignerRelationCandidate[]
    issues: DesignerRuntimeIssue[]
  }>
}

/** 查询未知保存结果；不执行新的持久化请求。 */
export interface FormSubmissionStatusAdapter {
  /** 使用原会话/提交身份恢复结果，查询失败或待处理时仍保持原批次。 */
  resolve(request: {
    batch: DesignerSubmissionBatch
    context: FormRuntimeAdapterContext
    signal: AbortSignal
  }): Promise<DesignerSaveReceipt>
}

/** 所有受控字段、关系、事件和草稿写入的统一命令。 */
export type DesignerRuntimeCommand =
  | { type: 'SET_FIELD'; rowKey: string; fieldId: string; value: unknown }
  | { type: 'REVERT_FIELD'; rowKey: string; fieldId: string }
  | { type: 'CREATE_ROW'; scope: DesignerCollectionScope; values?: Record<string, unknown> }
  | { type: 'COPY_ROW'; rowKey: string }
  | { type: 'DELETE_ROW'; rowKey: string }
  | {
      type: 'LINK'
      scope: DesignerCollectionScope
      candidates: DesignerRelationCandidate[]
      signal?: AbortSignal
    }
  | { type: 'UNLINK'; rowKey: string }
  | {
      type: 'LOAD_COLLECTION'
      scope: DesignerCollectionScope
      more?: boolean
      signal?: AbortSignal
    }
  | { type: 'RESOLVE_REFERENCES'; scope: DesignerCollectionScope; signal?: AbortSignal }
  | {
      type: 'MERGE_COLLECTION'
      scope: DesignerCollectionScope
      rows: DesignerRuntimeRow[]
      complete: boolean
      cursor?: string
      totalCount?: number
    }
  | { type: 'EVENT'; nodeId: string; event: DesignerComponentEvent; rowKey: string }
  | { type: 'FORM_EVENT'; event: DesignerFormEvent }
  | { type: 'BEGIN_DRAFT'; rowKey: string; moduleCode?: string }
  | { type: 'CONFIRM_DRAFT'; draftId: string }
  | { type: 'CANCEL_DRAFT'; draftId: string }
  | { type: 'RESOLVE_SUBMISSION' }

/** 命令结果；失败保留输入并提供不含宿主引用的诊断。 */
export interface DesignerRuntimeCommandResult {
  /** 是否成功执行。 */
  ok: boolean
  /** 新行或复制行的稳定客户端身份。 */
  rowKey?: string
  /** 新建编辑草稿身份。 */
  draftId?: string
  /** 旧入口事件请求提交；桥接层应生成旧投影、发出 submit，再派发 AFTER_SUBMIT。 */
  submissionRequested?: boolean
  /** 明确拒绝的原因。 */
  issues: DesignerRuntimeIssue[]
}

/** 会话观察快照；宿主可持有完整值，UI 必须使用 readRow/readFieldState 投影。 */
export interface DesignerRuntimeSnapshot {
  /** 稳定会话身份。 */
  sessionId: string
  /** 每次会话变化递增，用于视图刷新。 */
  revision: number
  /** 最近成功基线修订号。 */
  baselineRevision: number
  /** 当前保存阶段。 */
  status: 'READY' | 'PREPARING' | 'SUBMITTING' | 'UNKNOWN' | 'DISPOSED'
  /** 完整运行值，仅供宿主持有。 */
  value: DesignerRelationValueStore
  /** 是否有未确认的业务改动。 */
  dirty: boolean
  /** 当前诊断及冲突。 */
  issues: DesignerRuntimeIssue[]
  /** 按完整行地址与字段身份索引的反馈。 */
  feedbacks: Record<string, DesignerFieldFeedback>
  /** 尚未完成的原子保存批次。 */
  pendingSubmission?: DesignerSubmissionBatch
  /** 当前独立草稿；模块事件与 Renderer 共用同一草稿入口。 */
  activeDraft?: { draftId: string; rowKey: string; moduleCode?: string }
}

/** 运行会话初始化参数，依赖均由宿主注入。 */
export interface CreateDesignerRuntimeSessionOptions {
  /** 仅旧一级快照桥使用；不推断持久身份，不能生成关系保存批次。 */
  compatibility?: 'LEGACY'
  /** 设计文档；工厂复制并规范化，外部变更不重置当前会话。 */
  document: DesignerDocument
  /** 已有值及身份；省略仅适用于新增模式。 */
  initialState?: DesignerRelationValueStore
  /** 默认 CREATE。 */
  mode?: Exclude<DesignerRuntimeMode, 'DESIGN'>
  /** 既有全局字段策略。 */
  fieldRuntimePolicy?: FormFieldRuntimePolicyMap
  /**
   * 传入字段策略后未列出字段的缺省访问级别。
   *
   * 默认 HIDDEN。宿主只传关心的字段时须显式设为 EDITABLE。
   */
  fieldRuntimePolicyFallback?: FormFieldAccessFallback
  /** 具体关系集合/行的宿主权威策略。 */
  relationRuntimePolicy?: FormRelationRuntimePolicyResolver
  /** 可选细粒度宿主能力。 */
  adapters?: DesignerRuntimeAdapters
  /** 不写入文档的宿主上下文。 */
  adapterContext?: FormRuntimeAdapterContext
  /** 对默认资源上限的显式覆盖。 */
  limits?: Partial<DesignerRuntimeLimits>
}

/** Core 拥有唯一运行状态；Renderer 只订阅和派发命令。 */
export interface DesignerRuntimeSession {
  /** 会话绑定的规范化文档，只读使用。 */
  readonly document: DesignerDocument
  /** 当前运行模式。 */
  readonly mode: Exclude<DesignerRuntimeMode, 'DESIGN'>
  /** 当前宿主能力，供通用字段控件消费。 */
  readonly adapters: DesignerRuntimeAdapters
  /** 当前宿主上下文。 */
  readonly adapterContext: FormRuntimeAdapterContext
  /** 当前资源上限。 */
  readonly limits: DesignerRuntimeLimits
  /** 返回与内部可变状态隔离的快照。 */
  getSnapshot(): DesignerRuntimeSnapshot
  /** 订阅状态变化；返回解除函数，取消订阅不会销毁宿主持有的会话。 */
  subscribe(listener: (snapshot: DesignerRuntimeSnapshot) => void): () => void
  /** 通过同一权限与作用域入口执行命令。 */
  dispatch(command: DesignerRuntimeCommand): Promise<DesignerRuntimeCommandResult>
  /** 更新宿主策略；非法脏值保留并阻断，不被静默丢弃。 */
  updateRuntimePolicy(policy: {
    mode?: Exclude<DesignerRuntimeMode, 'DESIGN'>
    fieldRuntimePolicy?: FormFieldRuntimePolicyMap
    fieldRuntimePolicyFallback?: FormFieldAccessFallback
    relationRuntimePolicy?: FormRelationRuntimePolicyResolver
  }): void
  /** 返回权限过滤后的行视图，包含可见的共享目标字段。 */
  readRow(rowKey: string): DesignerRuntimeRow | undefined
  /** 当前行中的字段最终状态。 */
  readFieldState(rowKey: string, fieldId: string): DesignerResolvedFieldState
  /** 当前行中布局节点的条件显示状态。 */
  readNodeState(rowKey: string, nodeId: string): DesignerResolvedNodeState
  /** 读取具体集合/行的权限交集。 */
  readPolicy(scope: DesignerCollectionScope, rowKey?: string): FormRelationRuntimePolicy
  /** 按当前行获取子集合地址；由 Core 验证真实父链。 */
  scopeFor(containerId: string, parentRowKey: string): DesignerCollectionScope
  /** 读取当前作用域集合，隐藏行不暴露给视图。 */
  readCollection(scope: DesignerCollectionScope): DesignerRuntimeCollection
  /** 查询候选，不修改已选集合；调用方负责销毁时取消请求。 */
  queryCandidates(
    scope: DesignerCollectionScope,
    keyword: string,
    cursor?: string,
    signal?: AbortSignal,
  ): Promise<{ items: DesignerRelationCandidate[]; cursor?: string; totalCount?: number }>
  /** 读取会话内的独立编辑草稿，其变更只在确认后合并。 */
  getDraft(draftId: string): DesignerRuntimeSession | undefined
  /** 完成事件、计算、校验和权限检查；无改动返回 null，失败保留可定位诊断。 */
  prepareSubmission(): Promise<DesignerSubmissionBatch | null>
  /** 仅旧一级兼容桥使用：校验后生成原有快照投影，不表示持久化成功。 */
  projectLegacySubmission(): Promise<DesignerSubmissionProjection | null>
  /** 精确消费当前批次回执；成功建立基线，拒绝保留输入，未知结果保持冻结。 */
  applyReceipt(receipt: DesignerSaveReceipt): DesignerRuntimeCommandResult
  /** 恢复最近成功基线；在途保存期间拒绝重置。 */
  reset(): DesignerRuntimeCommandResult
  /** 取消请求、清除订阅和草稿，迟到结果不得再写入。 */
  dispose(): void
}
