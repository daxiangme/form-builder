# 关系表单宿主接入

关系运行能力由 Core 管理值仓、身份、权限、编辑意图和保存回执，由 Renderer 提供嵌套交互，由宿主 Adapter 加载及保存业务数据。组件不解释审批动作、数据库表结构、业务权限码或业务 HTTP 地址。

## 公开接入入口

普通 Vue 宿主只从 `el-form-gen` 导入：

```ts
import {
  createDesignerRuntimeSession,
  type DesignerRelationValueStore,
  type DesignerSaveReceipt,
  type DesignerSubmissionBatch,
  type FormRuntimeAdapters,
} from 'el-form-gen'

const session = createDesignerRuntimeSession({
  document,
  initialState,
  mode: 'EDIT',
  fieldRuntimePolicy,
  relationRuntimePolicy,
  adapters,
  adapterContext,
})

async function save(batch: DesignerSubmissionBatch): Promise<void> {
  const receipt: DesignerSaveReceipt = await saveAtomicBatch(batch)
  session.applyReceipt(receipt)
}
```

```vue
<ElFormRenderer :session="session" show-toolbar @submission="save" />
```

`document` 是 `DesignerDocument`；`initialState` 是 `DesignerRelationValueStore`；`adapters` 是 `FormRuntimeAdapters`。`saveAtomicBatch` 是宿主自己的保存逻辑，不是组件库导出函数。网络错误没有确定执行结果时，应向 `applyReceipt` 传入原 `sessionId`、`submissionId` 和 `status: 'UNKNOWN'`。

宿主动作也可直接调用 `await session.prepareSubmission()`。返回 `null` 时不要调用保存接口，检查 `session.getSnapshot().issues` 了解阻断原因或确认没有修改。保存完成后调用 `session.applyReceipt(receipt)`；查询未知结果使用 `session.dispatch({ type: 'RESOLVE_SUBMISSION' })`，由 `adapters.submissionStatus.resolve` 查询原批次。

`session.subscribe` 返回解除订阅函数。宿主不再使用会话时调用 `session.dispose()`，同时清理自己持有的 Adapter；卸载某个 Renderer 不应销毁仍被宿主持有的会话。

默认限制为关系深度 16、布局深度 32、整个会话已加载行数 10,000。可在创建会话时通过 `limits` 明确调整；超限返回诊断，不静默截断。

## 会话 API

`createDesignerRuntimeSession(options)` 接受 `document`、`initialState`、`mode`、`fieldRuntimePolicy`、`fieldRuntimePolicyFallback`、`relationRuntimePolicy`、`adapters`、`adapterContext` 和 `limits`。`EDIT` / `READ_ONLY` / `DETAIL` 需要宿主提供初始身份及版本。没有初始值的 `CREATE` 创建新根行。`compatibility: 'LEGACY'` 仅供旧一级桥接使用，不应用于关系保存。

| 方法或属性                                                     | 用途                                                                    |
| -------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `document` / `mode` / `adapters` / `adapterContext` / `limits` | 读取会话配置，文档和上下文不作为可写入口                                |
| `getSnapshot()`                                                | 获取修订、状态、完整运行图、脏标记、诊断、反馈、当前批次和草稿身份      |
| `subscribe(listener)`                                          | 订阅后续快照，返回取消订阅函数                                          |
| `dispatch(command)`                                            | 串行执行作用域命令，返回 `ok`、`issues` 及创建所得 `rowKey` / `draftId` |
| `updateRuntimePolicy(policy)`                                  | 更新模式、字段策略、缺省回退或关系策略；保存冻结期间也接受收紧          |
| `readRow(rowKey)`                                              | 获取当前路径可见的普通及共享字段，隐藏行返回 `undefined`                |
| `readFieldState(rowKey, fieldId)`                              | 获取具体行上的可见、必填、禁用及访问级别                                |
| `readNodeState(rowKey, nodeId)`                                | 获取布局容器的条件显示状态                                              |
| `readPolicy(scope, rowKey?)`                                   | 获取集合或行的权限交集                                                  |
| `scopeFor(containerId, parentRowKey)`                          | 获取由完整父链确定的集合地址                                            |
| `readCollection(scope)`                                        | 获取经过可见性投影的集合，包含分页与加载状态                            |
| `queryCandidates(scope, keyword, cursor?, signal?)`            | 查询候选页，不改动已选项                                                |
| `getDraft(draftId)`                                            | 获取隔离草稿会话                                                        |
| `prepareSubmission()`                                          | 生成并冻结原子批次；校验失败或没有提交变化返回 `null`                   |
| `applyReceipt(receipt)`                                        | 消费匹配回执，成功原位更新身份、值及基线                                |
| `reset()`                                                      | 恢复最近成功基线；保存结果未确定时拒绝                                  |
| `dispose()`                                                    | 取消请求并销毁订阅和草稿                                                |
| `projectLegacySubmission()`                                    | 仅旧桥接使用；输出旧投影，不进入持久化保存阶段                          |

`getSnapshot().value` 是宿主级完整数据。自定义 UI、表达式和显示逻辑必须消费 `readRow` / `readCollection`，不要把完整缓存作为可见字段源。

| `dispatch` 命令                  | 关键参数                                                            |
| -------------------------------- | ------------------------------------------------------------------- |
| `SET_FIELD`                      | `rowKey, fieldId, value`，清空使用 `null`                           |
| `REVERT_FIELD`                   | `rowKey, fieldId`，明确撤销该字段脏修改                             |
| `CREATE_ROW`                     | `scope, values?`                                                    |
| `COPY_ROW` / `DELETE_ROW`        | `rowKey`                                                            |
| `LINK`                           | `scope, candidates, signal?`，确认前重新鉴权                        |
| `UNLINK`                         | `rowKey`，只解除当前关联                                            |
| `LOAD_COLLECTION`                | `scope, more?, signal?`                                             |
| `RESOLVE_REFERENCES`             | `scope, signal?`，已有引用回显                                      |
| `MERGE_COLLECTION`               | `scope, rows, complete, cursor?, totalCount?`，宿主显式合并加载数据 |
| `EVENT`                          | `nodeId, event, rowKey`                                             |
| `FORM_EVENT`                     | `event`，声明式生命周期事件                                         |
| `BEGIN_DRAFT`                    | `rowKey, moduleCode?`                                               |
| `CONFIRM_DRAFT` / `CANCEL_DRAFT` | `draftId`                                                           |
| `RESOLVE_SUBMISSION`             | 查询原批次，无新的幂等标识                                          |

事件字段引用支持 `ROOT`、`CURRENT_ROW` 与 `ANCESTOR`；祖先表达式使用 `ancestorDepth: 1` 访问直接父行，`2` 访问上两层。`SET_FIELD` / `CLEAR_FIELD` 动作配置 `scope, ancestorDepth?`；`COPY_FIELD` 分别配置 `sourceScope, sourceAncestorDepth?, targetScope, targetAncestorDepth?`。按字段 ID 推导的旧默认作用域只在当前行和真实祖先链内查找。

`ElFormRenderer` 的新入口只接受 `session` 以及 `device`、`activeModule`、`overlayOnly`、`showToolbar` 展示属性，事件为 `submission`、`runtime-warning`、`overlay-closed`、`overlay-open-failed` 和动作通知 `action`。旧入口接受 `document` / `modelValue` 等原属性，继续发出 `update:modelValue`、`submit`、`reset`。TypeScript 互斥 Props 与运行诊断同时阻止两套输入混用。

## 身份与作用域

每行具有在当前运行会话内不变的运行标识，以及独立、可回填的持久化身份。运行标识用于组件渲染、展开、选择、校验、草稿和父子定位；持久化身份和版本由宿主提供，组件不推断其格式或版本顺序。

集合实例由布局容器和完整祖先运行标识链确定。同一孙表容器在父行 A、B 下形成两个集合实例，不得使用 `containerId` 单独存储、缓存或定位行。保存成功只补齐身份、版本和最终值，不替换运行标识，也不销毁整份文档。

公开类型分别为 `DesignerRuntimeRow.clientRowKey`、`recordRef` / `associationRef`、`version` 和 `DesignerCollectionScope`。祖先链包含根行标识。使用 `session.scopeFor(containerId, parentRowKey)` 获取合法地址，使用 `createDesignerCollectionKey(scope)` 构造初始集合索引；共享目标索引使用 `createDesignerTargetKey(entityId, identity)`，不要自行拼接字符串。

复制行会生成新的运行标识，并清除复制所得行的持久化身份及版本。复制一对多后代时递归建立新行；复制多对多关系时保留右实体引用、建立新的关联意图，不复制共享右实体。复制范围尚未完整加载时应先加载；无权重新关联的关系不能静默跳过。

## 多对多关系

必须分别保存父行、关联记录和共享右实体的身份。关联记录的业务字段属于关系行，右实体字段属于共享目标。`LINK` 建立关系，`UNLINK` 解除当前关系；两者都不删除共享目标实体。

同一实体类型与稳定目标身份在会话中对应同一个共享目标。不同父行中的展示、表达式读取、字段校验和修改仍通过各自路径的授权投影；共享缓存不代表共享权限。关联操作权限不授予目标实体编辑权。

目标字段修改记录授权来源作用域，提交时按目标身份去重。来源关系被解除、删除或撤销权限后，相关修改需要处理，不能从另一父行借用授权。不同路径返回同一目标的不同版本时应报告冲突，组件不会猜测哪个版本更新。

`TARGET` 操作的 `fieldOrigins[fieldId]` 携带该字段来源的 `scope`、`rowKey`、`reference` 和已有 `associationRef`。同一个目标操作的字段可以来自不同合法父行；宿主须使用各字段自己的引用，不能用操作级 `target.reference` 覆盖所有来源。先执行 `REVERT_FIELD` 明确撤销，才可以从另一条授权路径重新编辑。

## 候选选择与加载

候选查询由 Adapter 接收完整关系作用域、关键词、分页参数和取消信号。候选页与已选集合独立保存，切换页码、搜索和失败加载不会清空其他页的选择。确认选择前重新校验候选引用；已选回显使用独立解析能力，不能只在当前候选页查找。

对应端口为 `adapters.relationData.loadCollection` 与 `adapters.relationSelection.queryCandidates / resolveReferences / validateSelection`。关系请求携带 `scope`、`relationPath`、直接父行 `parent`、`context` 和 `signal`。候选使用 `DesignerRelationCandidate`，其 `identity` 用于共享目标去重，`reference` 是当前路径的授权引用。`validateSelection` 返回有效候选和明确 `issues`，不执行持久化关联。

宿主只返回当前调用路径可查看和可关联的候选。已过期、被撤销权限或失效的选择需要明确拒绝。关闭选择器、切换文档和卸载时取消请求；无法取消的旧响应也必须通过会话/请求标识隔离。

加载状态区分未加载、加载中、成功、失败和已加载范围。缺少一行不代表删除，尤其不能从分页、隐藏、只读、失败加载或权限裁剪后的集合快照推断删除。部分字段回显也不能解释为清空未返回的字段。

## 权限投影

继续使用以字段 ID 为键的 `fieldRuntimePolicy`，每项只有 `accessLevel: 'EDITABLE' | 'READ_ONLY' | 'HIDDEN'`。设计文档不保存权限；必填由设计配置决定，节点权限不能临时把字段变成必填。

未传映射时字段默认可编辑。传入映射后键缺失走 `fieldRuntimePolicyFallback`（默认 `HIDDEN`）；非法值仍按 `HIDDEN` 失败关闭。权限只能收紧：设计时隐藏或只读的字段，节点传可编辑无效。

流程审批有两种接入方式：

- **完整投影**：节点权限里补齐表单所有字段，缺省隐藏可以当作配置遗漏的保护网。
- **部分投影**：只传节点上做过特殊控制的字段，同时把 `fieldRuntimePolicyFallback` 设为 `EDITABLE`。

切换审批节点时使用 `session.updateRuntimePolicy({ fieldRuntimePolicy })`，不要替换整个会话。

容器条件显隐会进一步收紧字段状态：隐藏分组、标签页或子表后，内部字段视为不可见，因此不校验、不提交、拒绝写入。同一字段出现在多处时，任一可见路径即可显示。单个标签页的显隐尚未支持。

新的关系权限以集合实例和具体行作用域为键，分别声明可见性、`CREATE`、`UPDATE`、`DELETE`、`LINK`、`UNLINK`，以及关联字段和目标字段权限。

最终权限同时受运行模式、宿主策略和文档配置限制。`allowCreate`、`allowDelete` 等仅能收紧权限；缺失新关系授权时不开放新的写能力。一个字段可写不能推出整行可删，也不能推出可关联共享实体。

`relationRuntimePolicy` 为 `FormRelationRuntimePolicyResolver`，按 `ROOT`、`COLLECTION`、`ROW` 上下文返回 `FormRelationRuntimePolicy`。共享目标必须独立设置 `targetEditable` 和完整的 `targetFields`；字段在该映射中缺失时拒绝写入。策略变化使用 `session.updateRuntimePolicy`，不要用替换整个会话掩盖脏值冲突。

权限改变后，已录入的脏值应保留并附带阻断原因，不能静默丢弃或继续提交。组件提供交互约束；服务端仍须重新鉴权、验证行范围和版本。

## 保存与回执

宿主接收显式变更批次，区分 `CREATE`、`UPDATE`、`DELETE`、`LINK`、`UNLINK`。修改只包含实际变化且当前可写的字段；未提交字段保持不变。新子行通过运行标识引用新父行，宿主按依赖顺序执行。

删除来自明确的用户意图。未知后代的级联处理必须由宿主声明；没有级联承诺时不允许组件根据局部缓存假装完成子树删除。

首版保存使用原子批次。准备提交后冻结会话写命令，包含输入、复制、删除、弹层确认、事件和联动写入。宿主回执使用原提交标识匹配，成功时返回所有确认操作及最终身份、版本和值。组件原位合并后建立干净基线；重复保存不会重放之前的新增或关联。

确定拒绝、版本冲突和权限拒绝保留输入与意图，只解除保存冻结，不建立成功基线，也不自动重试覆盖最新值。网络结果未知时保留原批次与幂等标识，继续查询原批次结果；不能把超时当成未执行并创建新批次。旧会话的迟到回执不能污染新文档。

普通 `submit` 事件表示生成前端投影，不代表数据库提交成功。审批保存、同意、拒绝等动作由宿主决定何时准备提交和如何消费回执；动作弹窗复用当前表单会话。

宿主应按以下顺序处理批次：

1. 以 `idempotencyKey` 查询或建立请求记录，核验 `protocolVersion` 和原子事务支持。
2. 按 `dependsOn` 执行操作，维护 `clientRowKey → recordRef / associationRef` 映射，以便新子行引用本批次新父行。
3. 逐项验证关系范围、独立操作权限、字段权限、`expectedVersion` 及共享字段的 `fieldOrigins`。
4. 全部成功后提交事务，为每个操作返回匹配的 `operationId` 和 `clientRowKey`。非删除操作返回最终 `version`；`CREATE` 返回 `recordRef`，`LINK` 返回 `associationRef`。
5. 返回如下回执；响应不确定时查询原批次，不创建新事务重试。

```ts
const receipt: DesignerSaveReceipt = {
  sessionId: batch.sessionId,
  submissionId: batch.submissionId,
  status: 'SUCCESS',
  operations: committedOperations.map((item) => ({
    operationId: item.operationId,
    clientRowKey: item.clientRowKey,
    recordRef: item.recordRef,
    associationRef: item.associationRef,
    version: item.version,
    values: item.normalizedValues,
    target: item.target,
  })),
}
session.applyReceipt(receipt)
```

`committedOperations` 是宿主事务结果，非库提供变量。删除与解除也必须返回对应操作身份，但可以省略最终字段和版本。部分成功不符合首版原子协议；不完整成功回执会保留冻结与原批次。`AFTER_SUBMIT` 仍表示投影已发出，`AFTER_COMMIT` 仅在匹配成功回执应用后执行。

## 旧数据迁移

0.2 的 `DesignerSubtableRow.rowId` 是预览副本标识，不能自动识别为数据库主键。宿主需要明确提供已保存行的身份和版本；不要把普通 `values` 中的某个字段猜作主键。

旧 `collections: Record<containerId, rows>` 只能迁移为根作用域下的一级集合。同一容器具有多个父作用域时必须提供新版集合身份，不支持把子集合偷偷塞进普通字段值。

旧文档和旧一级表单按兼容入口处理。新增关系种类、共享目标字段与嵌套布局需要使用新版语义模型；迁移后不默认获得新的关系权限。不支持的结构应返回诊断，不能截断后继续保存。

旧 BPM 把必填编码成第四种权限值 `REQUIRED`。现在只能映射为 `EDITABLE`，必填须在表单设计里配置。如果旧流程靠节点级 `REQUIRED` 实现「仅该节点必填」，迁移后这个差异会丢失。

新设计文档使用 `documentVersion: '2.0'`，关系类型区分 `ONE_TO_MANY` 与 `MANY_TO_MANY`，实体统一登记于 `dataSchema.entities`。M:N 的 `childEntity` 表示关联记录实体，`targetEntity` 表示共享目标；运行值版本独立为 `runtimeVersion: '1.0'`，保存操作版本独立为 `protocolVersion: '1.0'`。

使用 `migrateDesignerDocument(oldDocument)` 或 `decodeDesignerDocument(oldDocument)` 获取 `{ document?, diagnostics }`；先处理 `ERROR` 诊断，再保存迁移结果。`1.0` 缺失的关系种类补为 `ONE_TO_MANY`，从现有根及子实体构造 `entities`，已有文档、实体、关系、节点和字段 ID 保留。迁移函数不修改传入对象。三种文档诊断入口均接受第二参数 `DesignerDocumentLimits`，可与会话限制保持一致。

三个发布包需要使用相同的新版本：`el-form-gen`、`@daxiangme/form-core` 和 `@daxiangme/form-adapter`。普通 Vue 宿主从 `el-form-gen` 导入公共能力，不依赖仓库源码路径或修改 `node_modules`。不要覆盖已发布的 0.2.0。

## 宿主边界与验收

DX BPM 工厂允许通过 `extras` 注入关系端口。业务路径、认证、租户、响应包络、幂等记录、事务和审批语义均由宿主管理；组件包不为尚未确定的服务端协议拼接地址。

不透明宿主引用只存在运行值和 Adapter 上下文中，不写入设计文档、Schema、演示数据、日志或公开截图。仓库关系演示仅使用公开虚拟记录。

交付前使用格式、Lint、类型检查、生产构建、真实浏览器人工操作及仓库外 tarball 消费构建。应人工核对不同父行下的孙表隔离、复制与弹层取消、共享目标的独立授权编辑、分页选择、身份回填、拒绝后保留输入、未知结果恢复和连续保存不重放。仓库不新增或运行自动化测试代码。

本轮组件验收、仓库验收、消费工程验收与未完成项见[Issue #1 0.3.0 验收记录](acceptance/issue-1-0.3.0.md)。
