# Issue #1 修复分析与实施方案

调研日期：2026-09-05。需求来源：[GitHub Issue #1：支持 N 层关系行身份、多对多关联及权限化提交](https://github.com/daxiangme/form-builder/issues/1)。源码基线：`61ea891b0ced6373d7a420681dc474420a9afaed`。以下“当前行为”依据该提交；“建议”是待实施契约，不是已经发布的 API。

本报告是静态源码核对与实施设计，未做功能复现、未实现新能力。遵守仓库 AGENTS.md：不新增、修改、生成或运行自动化测试代码。本轮仅新增这份分析文档；已执行现有静态检查、类型检查和生产构建，结果见文末。

## 当前 Issue 与结论

查询时仓库 `daxiangme/form-builder` 有 1 个未关闭 Issue，即 #1；该 Issue 没有评论，也没有未关闭 PR。Issue 创建和更新时间均为 2026-09-05。本地 `main` 与查询时远端 HEAD 一致，均为上述源码基线；三个发布包当前均为 `0.2.0`。[Issue](https://github.com/daxiangme/form-builder/issues/1)、[Core 包](https://github.com/daxiangme/form-builder/blob/61ea891b0ced6373d7a420681dc474420a9afaed/packages/form-core/package.json)、[Adapter 包](https://github.com/daxiangme/form-builder/blob/61ea891b0ced6373d7a420681dc474420a9afaed/packages/form-adapter/package.json)、[主包](https://github.com/daxiangme/form-builder/blob/61ea891b0ced6373d7a420681dc474420a9afaed/packages/el-form-gen/package.json)

这是横跨设计协议、运行会话和宿主端口的能力升级。现有模型刻意实现“一级一对多的预览副本”，Issue 要求“可持久化、可授权、可提交差量的关系图”。仅增加 `parentRowId` 无法提供集合隔离、持久身份、关联身份、变更基线和回执处理；如果只扩展 Renderer，还会被现有设计诊断拒绝。[需求](https://github.com/daxiangme/form-builder/issues/1)、[现有运行类型](https://github.com/daxiangme/form-builder/blob/61ea891b0ced6373d7a420681dc474420a9afaed/packages/form-core/src/types.ts#L50-L85)

建议把 #1 作为总验收项，按“契约 → Core 会话 → 设计器与 Renderer → M:N Adapter → 联合验收与发布”分阶段交付。权限、变更和回执的类型必须在第一阶段一起确定；实现阶段可以拆分，不能等 UI 完成后才补权限和保存语义。本轮没有创建子 Issue 或远端 PR。

## 已证实的 Core 根因与遗漏风险

| 范围                     | 当前代码与影响                                                                                                                                                                            | 必须一并修复                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 集合作用域和身份         | `DesignerSubtableRow` 只有预览 `rowId`、`values`；`collections` 仅按布局容器 ID 存数组，没有父链、持久身份、关联身份、版本和加载完整性。                                                  | 引入独立集合实例、不可变客户端行身份、持久身份和不透明运行元数据；字段值不得承载关系图。见 [types.ts:50–85](https://github.com/daxiangme/form-builder/blob/61ea891b0ced6373d7a420681dc474420a9afaed/packages/form-core/src/types.ts#L50-L85)。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 关系目录                 | 每条关系内嵌一个 `childEntity`；文档校验强制所有父实体都是 root，并禁止重复子实体 ID/code；首次 Host 参数校验也强制 root，键映射只从 root 取父字段。                                      | 设计文档与首次参数共同采用可引用实体目录/关系图，允许关系从任一合法当前实体开始；M:N 共享目标不可按重复实体报错。见 [types.ts:265](https://github.com/daxiangme/form-builder/blob/61ea891b0ced6373d7a420681dc474420a9afaed/packages/form-core/src/types.ts#L265-L273)、[data-model.ts:459–518](https://github.com/daxiangme/form-builder/blob/61ea891b0ced6373d7a420681dc474420a9afaed/packages/form-core/src/data-model.ts#L459-L518)、[data-model.ts:719–765](https://github.com/daxiangme/form-builder/blob/61ea891b0ced6373d7a420681dc474420a9afaed/packages/form-core/src/data-model.ts#L719-L765)。                                                                                                                                                                                                                           |
| 新建、复制、移动设计节点 | 新建关系固定 `parentEntityId: root.id`；复制关系只重分配直接字段；落在普通容器时实体解析直接返回 root，不能继承更上层子表作用域。                                                         | 由布局祖先解析最近关系上下文；新建/复制整个关系子图，重写后代字段和关系引用；移动在实际父实体作用域验证。见 [data-model.ts:163–250](https://github.com/daxiangme/form-builder/blob/61ea891b0ced6373d7a420681dc474420a9afaed/packages/form-core/src/data-model.ts#L163-L250)。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 设计保存、拖拽和列投影   | 保存诊断要求子表直接子节点全为 FIELD；DropPolicy 拒绝所有嵌套容器；列投影碰到任意非 FIELD 就返回空列；布局深度另有固定 6 层上限。                                                         | 同时修改三个入口。保留数据列投影，另建行内容/嵌套关系投影；避免把关系容器伪装为字段列。统一公开深度/行数限制，超限返回诊断，禁止静默裁剪。见 [designer-document.ts:1192–1206](https://github.com/daxiangme/form-builder/blob/61ea891b0ced6373d7a420681dc474420a9afaed/packages/form-core/src/designer-document.ts#L1192-L1206)、[designer-document.ts:1320–1340](https://github.com/daxiangme/form-builder/blob/61ea891b0ced6373d7a420681dc474420a9afaed/packages/form-core/src/designer-document.ts#L1320-L1340)、[subtable-projection.ts:40–59](https://github.com/daxiangme/form-builder/blob/61ea891b0ced6373d7a420681dc474420a9afaed/packages/form-core/src/subtable-projection.ts#L40-L59)。                                                                                                                                  |
| 布局数据作用域诊断       | `diagnoseLayoutDataScopes` 会递归切换子实体，但不核对关系的父实体与当前位置是否吻合，且入口只遍历主体 root。当前一级限制遮住了这部分不足。                                                | 新模型下核对当前实体→关系→目标实体完整路径；主体与弹层均需校验；明确同一关系多视图复用与重复可写布局规则。见 [data-model.ts:825–885](https://github.com/daxiangme/form-builder/blob/61ea891b0ced6373d7a420681dc474420a9afaed/packages/form-core/src/data-model.ts#L825-L885)。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 复制运行行               | 新行和复制行只生成一个新 `rowId`，复制 `values`，没有后代集合或持久元数据规则。                                                                                                           | 区分“编辑草稿克隆”与“复制成新业务行”；后者递归生成新客户端身份，清除被复制行的持久身份/版本。M:N 的目标引用不能误变为新目标实体。见 [subtable-projection.ts:107–135](https://github.com/daxiangme/form-builder/blob/61ea891b0ced6373d7a420681dc474420a9afaed/packages/form-core/src/subtable-projection.ts#L107-L135)。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 表达式语义               | 只有 ROOT / CURRENT_ROW；诊断只接收 `allowCurrentRow` 布尔，能判断“是不是任意子实体”，不能判断“是否当前子实体或合法祖先”；上下文直接持有根值与当前行值。                                  | 引入带实体/关系路径的作用域引用与读值解析器，CURRENT_ROW 仅匹配当前实体；ANCESTOR 必须沿当前父链解析，不能任意寻址其他父行；显式拦截无权字段读取。见 [expression.ts:25–28](https://github.com/daxiangme/form-builder/blob/61ea891b0ced6373d7a420681dc474420a9afaed/packages/form-core/src/expression.ts#L25-L28)、[expression.ts:63–135](https://github.com/daxiangme/form-builder/blob/61ea891b0ced6373d7a420681dc474420a9afaed/packages/form-core/src/expression.ts#L63-L135)、[types.ts:739–743](https://github.com/daxiangme/form-builder/blob/61ea891b0ced6373d7a420681dc474420a9afaed/packages/form-core/src/types.ts#L739-L743)。                                                                                                                                                                                            |
| 计算/校验/事件           | 根与当前行计算分开、权限回调只收 `fieldId`；COMPARE_FIELD 固定读取 root；反馈键只拼 view/container/row/field；事件读写按 `fieldId in currentRow` 推断作用域，缺失的子字段可能写入根值仓。 | 同一个 RowContext 驱动读写、依赖失效、比较、远程校验、反馈和事件。不能通过“值是否存在”判断所属实体；异步结果必须核对会话/作用域/请求代次，避免迟到结果写回错误行。见 [validation.ts:68–163](https://github.com/daxiangme/form-builder/blob/61ea891b0ced6373d7a420681dc474420a9afaed/packages/form-core/src/validation.ts#L68-L163)、[validation.ts:23–32](https://github.com/daxiangme/form-builder/blob/61ea891b0ced6373d7a420681dc474420a9afaed/packages/form-core/src/validation.ts#L23-L32)、[validation.ts:357–360](https://github.com/daxiangme/form-builder/blob/61ea891b0ced6373d7a420681dc474420a9afaed/packages/form-core/src/validation.ts#L357-L360)、[event-flow.ts:262–270](https://github.com/daxiangme/form-builder/blob/61ea891b0ced6373d7a420681dc474420a9afaed/packages/form-core/src/event-flow.ts#L262-L270)。 |
| 提交                     | 提交是 fields + collections 全量快照；每个字段只算一个全局状态，所有行共用过滤结果；按可见布局的直接 FIELD 列过滤集合；未知容器退回全局字段集；没有基线、改动字段、显式删除、版本和回执。 | 新增严格的变更投影，按实例/行/字段检查权限与有效关系；只提交改动字段和显式操作；缺页、隐藏和未加载不等于删除。见 [submission.ts:24–81](https://github.com/daxiangme/form-builder/blob/61ea891b0ced6373d7a420681dc474420a9afaed/packages/form-core/src/submission.ts#L24-L81)、[types.ts:769–774](https://github.com/daxiangme/form-builder/blob/61ea891b0ced6373d7a420681dc474420a9afaed/packages/form-core/src/types.ts#L769-L774)。                                                                                                                                                                                                                                                                                                                                                                                               |
| 权限特殊规则             | 现有 fieldRuntimePolicy 未传时按独立表单运行，传入后缺字段关闭；技术 hidden 字段在提交里无条件保留，优先级高于宿主 READ_ONLY/HIDDEN。                                                     | 保持现有字段策略入口；托管关系模式中任何提交都必须服从宿主授权，技术 hidden 不可豁免。权限收紧后的脏值保留并阻断/提示，不能过滤掉后宣称保存成功。旧行为变化应记录迁移说明。见 [field-access.ts:96–115](https://github.com/daxiangme/form-builder/blob/61ea891b0ced6373d7a420681dc474420a9afaed/packages/form-core/src/field-access.ts#L96-L115)、[submission.ts:26–38](https://github.com/daxiangme/form-builder/blob/61ea891b0ced6373d7a420681dc474420a9afaed/packages/form-core/src/submission.ts#L26-L38)。                                                                                                                                                                                                                                                                                                                      |

## 建议先冻结的公共契约

以下概念用于讨论契约，类型和函数名称是建议名。实现开始前应形成可被外部 TypeScript 消费方导入的正式中文 TSDoc 类型，避免 BPM 先猜 API。

### 1. 设计定义与运行会话分离

- **设计定义**：唯一实体目录 + 关系目录；关系为判别联合，一对多引用父实体/子实体，多对多分别引用父实体、关联记录实体与目标实体。实体身份与关系身份不依赖节点位置，不加入 URL、Token 或宿主业务类型。关系嵌套按实际引用校验，不把每个新关系都复制成新的共享实体。
- **渲染上下文**：集合实例采用 `scope = (containerId, 完整祖先 clientRowKey 链)`，同时携带根开始的关系路径进行实体校验。`containerId` 单独只定位布局控件，不能唯一标识运行集合；统一由 Core 分配/解析 scope，不让 Renderer/Adapter 各自拼接字符串。
- **行身份**：不可变 `clientRowKey` 用于整个编辑会话内的 Vue key、选中、展开、校验与父链。持久 `recordRef`、关联 `associationRef`、目标 `targetRef` 与 `expectedVersion` 各自独立；回执填充/更新持久身份，绝不替换客户端 key。根记录也需要运行身份，才能表达“新根 + 新子”一次保存。
- **运行会话**：包含当前值、已确认基线、显式操作意图、集合加载覆盖范围、脏值及冲突状态。建议由 Core session 持有基线和操作记录，Renderer 暴露受控会话句柄；`modelValue` 只是值快照，普通回传不确认保存。外部重载与保存回执使用不同入口。不透明定位/版本引用使用可序列化运行元数据，不解析、不输出到日志/截图、不写入 Schema。
- **加载覆盖**：明确未加载、加载中、完整/部分、失败，以及分页游标；追加页或权限裁剪只改变已知覆盖范围，不产生删除意图。集合限制应区分已加载行数与宿主总行数，未知总数不能当作零。

这些分离直接对应 Issue 的父行隔离、稳定回填、共享实体和不透明元数据要求。现有协议已把物理来源索引与设计文档分开，应延续该边界。[需求](https://github.com/daxiangme/form-builder/issues/1)、[运行之外的来源索引](https://github.com/daxiangme/form-builder/blob/61ea891b0ced6373d7a420681dc474420a9afaed/packages/form-core/src/types.ts#L1164-L1176)

### 2. 范围化命令内核

建议 Core 提供少量明确操作：定位集合/行、创建行、写字段、复制子树、删除子树、关联/解除、创建编辑草稿、确认草稿、取消草稿、投影变更、应用保存回执。Vue 控件负责展示和发命令；所有入口，包括字段事件和 Adapter 回写，经过同一作用域与权限检查。

- 创建/复制新行生成新客户端 key；持久原行标识和版本清除，后代按关系所有权递归处理。复制 M:N 关联时可以在 LINK 授权后建立“新关联到原目标”，不能复制共享目标实体，也不能沿用原关联身份。后代未加载完整时必须先补齐已授权数据，或明确拒绝完整复制，不能宣称只复制可见行就是完整子树。
- `initialRows`/默认值只在明确 CREATE 初始化时产生待新增意图；EDIT 回填已有数据或加载未完成时，不能把缺失集合当成新行生成请求。
- 删除未保存新行消除其待创建子树，不生成对服务端不存在记录的 DELETE；删除持久父行记录显式子树意图。只有宿主明确提供级联能力时才用级联意图；需要逐行删除而后代未加载完整时阻断并返回诊断，不能从可见快照猜测全部后代。
- 弹层草稿保留客户端 key 和初始基线，但使用独立值副本与子集合副本；确认只合并打开时绑定的父行作用域。确认前检查源行仍存在、权限仍允许、源值是否变化；取消丢弃草稿。不能复用“复制成新记录”的函数制作编辑草稿。
- 事件上下文携带当前关系路径、当前行和祖先链；字段动作必须明确 ROOT/CURRENT_ROW/ANCESTOR 目标。缺失值仍属于其声明实体，不能退回写根值仓。根/祖先修改引起的计算仅对后代相关实例传播，不污染同级其他父链。

现有实现把行创建/复制放在列投影中，把事件写入直接落到 Record，应在上述迁移中收敛，而不是再向大型 Vue 组件扩展一组平行写法。[当前复制](https://github.com/daxiangme/form-builder/blob/61ea891b0ced6373d7a420681dc474420a9afaed/packages/form-core/src/subtable-projection.ts#L113-L135)、[当前事件写入](https://github.com/daxiangme/form-builder/blob/61ea891b0ced6373d7a420681dc474420a9afaed/packages/form-core/src/event-flow.ts#L268-L270)

### 3. 权限决策

保留 `fieldRuntimePolicy` 作为既有字段默认投影，并新增按集合/具体行解析的宿主权威策略。最终可执行操作为运行模式、设计配置、关系集合权限、具体行权限与字段权限的交集。隐藏/只读继承只能收紧，不能由事件、公式、子级授权或控件 `allowCreate` 绕过。缺少新关系授权时，新关系操作默认拒绝；纯预览和遗留模式的行为需明确区分，不能靠“没传策略”隐式进入具备新权限的托管模式。

CREATE、UPDATE、DELETE、LINK、UNLINK 分开。M:N 关联行字段 UPDATE 与共享目标实体 UPDATE 也必须具有不同操作主体和不同授权；能选择候选项只意味着能 LINK。行隐藏不把内存记录变成待删除；当前行只读不影响其他行的编辑；非法脏值保留在会话，返回可定位的问题并阻断提交，不能静默抛弃。

行可见性与行可编辑性分别计算；字段的隐藏、只读、可写及独立 `required` 都需要具体行作用域。相同字段在父行 A 下可以必填、在父行 B 下可以非必填，不能共用一份全局必填结果；必填仅在当前字段实际可写时生效。

表达式读取按当前授权上下文解析。无权字段不注入可读上下文；不可从其他父行搜同名字段“补全”缺失值。服务端仍执行最终鉴权，组件策略仅承担交互与提交约束。[需求权限边界](https://github.com/daxiangme/form-builder/issues/1)、[既有字段策略收紧逻辑](https://github.com/daxiangme/form-builder/blob/61ea891b0ced6373d7a420681dc474420a9afaed/packages/form-core/src/field-access.ts#L118-L163)

### 4. 显式变更与回执

建议新增判别联合的变更集合，至少覆盖以下语义：

| 操作   | 必备信息                                                        | 宿主消费规则                                                           |
| ------ | --------------------------------------------------------------- | ---------------------------------------------------------------------- |
| CREATE | 操作标识、集合/关系路径、父客户端身份、当前客户端身份、可写初值 | 可以引用同批次尚无持久身份的新父记录。                                 |
| UPDATE | 行/实体主体、持久引用、预期版本、实际变化的可写字段             | 未包含字段保持原值；空值清空必须与字段缺席区分。                       |
| DELETE | 持久行引用、预期版本、关系路径、明确子树/级联语义               | 不从数组缺席推断；宿主执行约束/级联，组件不臆造未加载子记录。          |
| LINK   | 父身份、独立关联客户端身份、已授权目标引用、可写关联初值        | 建立关系，不创建右实体；同父同关系同目标去重，不同父允许关联同一目标。 |
| UNLINK | 当前父与关联身份、关联预期版本、目标引用                        | 仅解除该关联，不删除共享目标。                                         |

投影器依据“已确认基线 + 当前值 + 显式意图”计算有效操作，而非原样重播所有 UI 点击：先创建后删除的新行相消；先 LINK 后 UNLINK 的未保存关联相消；编辑后改回基线不生成 UPDATE。顺序由依赖图产生：新父先于新子/关联，显式非级联删除时子先于父，解除关系须遵守宿主约束。根字段也应输出差量，不能把所有根值作为必然更新。

回执至少包括会话/批次标识、每项操作结果、客户端身份→持久身份映射、最终值、最新版本和可定位错误。首版建议在 `prepareSubmission` 后冻结该会话全部写命令，包括 UI、事件、联动和弹层确认，同时继续接收权限更新；回执必须匹配当前 session + submissionId。完整成功原位回填、建立新基线并解锁；连续保存无变化时不重复 CREATE/LINK。冲突/拒绝保留输入和旧预期版本后解锁，显式展示并等待重新加载/人工解决，不自动重放覆盖。旧会话或旧批次回执不得写入当前会话。首版应明确原子批次约定，拒绝把部分成功当全部成功；边保存边编辑与三方归并留作后续增强。

这套语义是建议新增的运行 API，不能直接把既有 `projectDesignerSubmission` 的返回类型原地改成不同结构而不迁移全部消费方。[需求提交与回执](https://github.com/daxiangme/form-builder/issues/1)、[当前公开投影](https://github.com/daxiangme/form-builder/blob/61ea891b0ced6373d7a420681dc474420a9afaed/packages/form-core/src/types.ts#L769-L774)

## 兼容和迁移建议

1. **设计文档显式版本化。** 当前 `DESIGNER_DOCUMENT_VERSION` 是 `1.0`，旧子表配置存在 v3 及旧草稿补齐逻辑。新增实体目录/关系种类/表达式作用域后应升级协议并提供纯函数迁移，保留原 document/entity/relation/node/field ID，不能把正常旧文档当成非法新文档。旧迁移只解释旧协议；新版本缺失或非法关系继续失败关闭。[版本声明](https://github.com/daxiangme/form-builder/blob/61ea891b0ced6373d7a420681dc474420a9afaed/packages/form-core/src/types.ts#L1-L2)、[现有迁移保护](https://github.com/daxiangme/form-builder/blob/61ea891b0ced6373d7a420681dc474420a9afaed/packages/form-core/src/data-model.ts#L45-L119)
2. **旧值仓适配只承诺无歧义一级数据。** 可把旧 `collections[containerId]` 映射到根上下文的一级集合；旧 `rowId` 只能保留为客户端身份，不能推断它是数据库身份。已保存行进入新差量模式前，必须由宿主补齐持久身份与版本；不得把所有旧行当 CREATE。反向导出遇到 N 层/M:N 返回诊断，不扁平化丢数据。
3. **过渡期保留旧快照接口。** 新增明确的关系运行模型/变更投影入口，并将旧类型/函数标记兼容范围。不要用多个可选字段把两种语义混成不可判别状态。受控 `modelValue` 更新需区分外部重载、保存回执和用户本地更新，避免每次 v-model echo 都重置基线。
4. **首次模型参数同步升级。** 需要迁移 `DesignerInitialDataModel`、字段页生成布局请求、关系修改命令、sourceMetadata 索引和公开导出。当前首次参数把每条关系的子实体字段展开，父 keyMappings 又固定使用 root，无法只改最终文档结构。[初始化参数](https://github.com/daxiangme/form-builder/blob/61ea891b0ced6373d7a420681dc474420a9afaed/packages/form-core/src/types.ts#L1136-L1176)、[首次应用](https://github.com/daxiangme/form-builder/blob/61ea891b0ced6373d7a420681dc474420a9afaed/packages/form-core/src/data-model.ts#L522-L546)
5. **同步发布全套包。** 建议使用统一新次版本，例如 `0.3.0`，最终版本在契约定稿后确定，不能覆盖 0.2.0。仓库 Changesets 已把三个包设为固定版本组；同步更新包版本、精确内部依赖及锁文件，附旧一级表单和新关系模式的迁移文档。[固定版本组](https://github.com/daxiangme/form-builder/blob/61ea891b0ced6373d7a420681dc474420a9afaed/.changeset/config.json#L5)

## Renderer 与设计器改造

| 迁移面           | 当前限制与源码                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | 建议实施                                                                                                                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 数据读取与初始化 | 子表读取 `collections[container.id]`；初始化虽然递归遍历布局，每层仍写入同一全局容器数组。[RuntimeNode:546](https://github.com/daxiangme/form-builder/blob/61ea891b0ced6373d7a420681dc474420a9afaed/packages/el-form-gen/src/rendering/DesignerRuntimeNode.vue#L546-L548)、[PreviewForm:978](https://github.com/daxiangme/form-builder/blob/61ea891b0ced6373d7a420681dc474420a9afaed/packages/el-form-gen/src/rendering/DesignerPreviewForm.vue#L978-L994)                                                                                                                                                                                                   | RuntimeNode 接收完整行上下文；从 session 定位具体集合实例，控件通过命令更新。字段树、关系新建和布局生成一起改为当前父实体上下文。                                                             |
| 嵌套布局         | 行子表与块子表均遍历字段列，没有在每行内递归渲染子关系。[RuntimeNode:154](https://github.com/daxiangme/form-builder/blob/61ea891b0ced6373d7a420681dc474420a9afaed/packages/el-form-gen/src/rendering/DesignerRuntimeNode.vue#L154)、[RuntimeNode:214](https://github.com/daxiangme/form-builder/blob/61ea891b0ced6373d7a420681dc474420a9afaed/packages/el-form-gen/src/rendering/DesignerRuntimeNode.vue#L214)                                                                                                                                                                                                                                               | 块子表渲染完整行布局；行子表保留字段列，增加行展开的子关系区域。与设计保存、DropPolicy、列/行内容投影一起支持，不能遇到嵌套节点就静默忽略。                                                   |
| 权限和反馈       | 状态按全局 fieldId 计算；集合写入用“任一字段可写”判断，空集合直接放行。[PreviewForm:809](https://github.com/daxiangme/form-builder/blob/61ea891b0ced6373d7a420681dc474420a9afaed/packages/el-form-gen/src/rendering/DesignerPreviewForm.vue#L809-L819)、[PreviewForm:861](https://github.com/daxiangme/form-builder/blob/61ea891b0ced6373d7a420681dc474420a9afaed/packages/el-form-gen/src/rendering/DesignerPreviewForm.vue#L861-L873)                                                                                                                                                                                                                      | 每行分别求最终字段状态；集合操作有独立授权。控件、事件、校验、联动和提交共用同一决策，反馈绑定完整 scope 与稳定行 key。                                                                       |
| 弹层草稿         | 行草稿只复制 values，collections 为空；确认只回写 values。整表草稿确认则替换整个值仓。[PreviewForm:650](https://github.com/daxiangme/form-builder/blob/61ea891b0ced6373d7a420681dc474420a9afaed/packages/el-form-gen/src/rendering/DesignerPreviewForm.vue#L650-L688)                                                                                                                                                                                                                                                                                                                                                                                        | 草稿绑定父行作用域并包含子树；确认前检查原行/权限/基线，按作用域合并，取消只丢弃草稿。主体始终保持唯一运行会话。                                                                              |
| 事件新旧值       | 单元格更新创建新 row 对象，但紧接着 CHANGE 事件仍携带原 row；静态代码显示事件可能使用旧值，需要人工复现确认。[RowSubtable:315](https://github.com/daxiangme/form-builder/blob/61ea891b0ced6373d7a420681dc474420a9afaed/packages/el-form-gen/src/form/controls/DxFormRowSubtable.vue#L315-L321)、[RuntimeNode:617](https://github.com/daxiangme/form-builder/blob/61ea891b0ced6373d7a420681dc474420a9afaed/packages/el-form-gen/src/rendering/DesignerRuntimeNode.vue#L617-L618)                                                                                                                                                                              | 先执行 session 写命令，再用稳定地址触发事件，由 session 读取最新值。避免把可过期的行对象当事件身份。                                                                                          |
| 保存与生命周期   | submit 发出后即执行 AFTER_SUBMIT 并释放 submitting；没有宿主保存回执入口。文档和 activeModule 变化会重新初始化。[PreviewForm:389](https://github.com/daxiangme/form-builder/blob/61ea891b0ced6373d7a420681dc474420a9afaed/packages/el-form-gen/src/rendering/DesignerPreviewForm.vue#L389-L405)、[PreviewForm:513](https://github.com/daxiangme/form-builder/blob/61ea891b0ced6373d7a420681dc474420a9afaed/packages/el-form-gen/src/rendering/DesignerPreviewForm.vue#L513-L532)、[公开 Props](https://github.com/daxiangme/form-builder/blob/61ea891b0ced6373d7a420681dc474420a9afaed/packages/el-form-gen/src/rendering/el-form-renderer-props.ts#L11-L30) | 新增准备提交、确认回执、报告失败的公开能力；保存成功必须由回执确认。旧 AFTER_SUBMIT 保留“投影发出”语义或明确迁移，不能悄悄改义。区分模块切换与文档会话替换；重置/卸载取消请求并让旧响应失效。 |

设计器还需迁移关系字段树、主体/子实体创建入口以及表达式选择器：当前字段树展示一级关系，创建关系入口限制主体，表达式仅 ROOT/CURRENT_ROW。[字段树](https://github.com/daxiangme/form-builder/blob/61ea891b0ced6373d7a420681dc474420a9afaed/packages/el-form-gen/src/workbench/DesignerFieldTree.vue#L264)、[设计器入口](https://github.com/daxiangme/form-builder/blob/61ea891b0ced6373d7a420681dc474420a9afaed/packages/el-form-gen/src/FormDesigner.vue#L732-L756)、[表达式编辑器](https://github.com/daxiangme/form-builder/blob/61ea891b0ced6373d7a420681dc474420a9afaed/packages/el-form-gen/src/workbench/DesignerExpressionEditor.vue#L48)

当前初始行数量还会被截到 20。新限制应同时覆盖设计诊断与运行期，明确区分布局深度、关系深度、已加载总行数，超限不能截断后宣称成功。[初始行限制](https://github.com/daxiangme/form-builder/blob/61ea891b0ced6373d7a420681dc474420a9afaed/packages/el-form-gen/src/rendering/DesignerPreviewForm.vue#L1047-L1052)

## Adapter 与多对多边界

现有目录查询只提供关键词、分页、简单 id/label 条目；没有关系实例、关联记录身份、目标版本或关联授权。现有选择器固定第一页 100 项，确认时只从当前查询结果查找已选项，不能直接承接跨页/跨搜索的多对多选择。[目录端口](https://github.com/daxiangme/form-builder/blob/61ea891b0ced6373d7a420681dc474420a9afaed/packages/form-core/src/types.ts#L866)、[选择器实现](https://github.com/daxiangme/form-builder/blob/61ea891b0ced6373d7a420681dc474420a9afaed/packages/el-form-gen/src/rendering/DesignerLocalPickerField.vue#L112-L140)

建议在 Core 定义以下细粒度能力，名称是提议，尚未发布：

- `relationData.loadCollection`：按关系路径和完整父行作用域加载现有关联/子行，返回身份、版本、覆盖范围与分页信息，区分空数据和未加载/失败。
- `relationSelection.queryCandidates`：按 scope、关键词、分页和取消信号查询授权候选。UI 分别保存结果页与跨页已选集合，晚到响应不得覆盖新查询。
- `relationSelection.resolveReferences`：独立回显已有目标引用。已失效或无权访问返回明确状态，不能从当前页找不到就当成用户解除关联。
- 可选的选择有效性检查：确认 LINK 前检查过期候选，最终保存仍由宿主重新鉴权和校验版本。选择器只产生本地 LINK/UNLINK 意图，统一保存前不执行远端关系写操作。

多对多必须分清父行、关联记录、共享右实体三种身份；关联字段和右实体字段使用不同的所属实体、更新目标、版本与权限。两个父行引用同一右实体时，UNLINK 只删除当前关联。复制父行时仅在获得 LINK 权限后复制关联为“指向同一目标的新关联”，不复制右实体、不沿用旧关联身份；权限不足应明确阻断。

DX BPM 工厂已有 `extras` 注入路径，可以承接 Core 定义好的端口。未确定宿主协议前不猜 HTTP 路径；通用 Renderer 不处理审批动作、修订存储、数据库或租户鉴权。本地 Adapter 提供内存示例和取消/清理能力；不把宿主不透明引用写进演示数据。主包的显式导出必须补齐全部新类型及 Renderer 句柄。[工厂扩展](https://github.com/daxiangme/form-builder/blob/61ea891b0ced6373d7a420681dc474420a9afaed/packages/form-adapter/src/dx-bpm/create-dx-bpm-form-adapter.ts#L199)、[主包公共导出](https://github.com/daxiangme/form-builder/blob/61ea891b0ced6373d7a420681dc474420a9afaed/packages/el-form-gen/src/index.ts#L23)、[责任边界](https://github.com/daxiangme/form-builder/issues/1)

## 联合实施顺序与完成条件

| 阶段                 | 工作                                                                                                                          | 阶段出口                                                                                                     |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 1. 契约              | 冻结设计关系图、实例上下文、不可变客户端身份、持久元数据、权限、变更与回执类型；明确旧协议迁移和受控状态规则。                | 中文 TSDoc 与可编译的宿主消费示例能表示新父+新子、两个父关联同一目标、冲突回执，不使用 any。                 |
| 2. Core 会话         | 实现集合/行定位、基线、权限决策、字段变更、子树复制/删除、关联意图、草稿、显式变更投影及回执归并。                            | 所有读写使用同一上下文；权限从命令到投影一致；回执不更换 UI 身份；缺席行不产生 DELETE。                      |
| 3. 设计器与 Renderer | 迁移文档/首次模型/DropPolicy/关系字段树/行内容投影；实现嵌套 UI；表达式、计算、比较、校验、事件、反馈与生命周期接入 session。 | 能创建、保存、重开 N 层表单；同容器不同父行互不串扰；弹层取消不污染主值仓；非法父链和超限明确诊断。          |
| 4. M:N 与宿主接入    | 实现候选查询、已有引用回显、分页/搜索/取消、LINK/UNLINK；接入集合/行授权与保存回执，补齐本地示例和 DX 扩展。                  | 两父关联同目标互不影响；关联字段与目标字段权限分离；拒绝过期选择；新父/新关联同批回填，重复保存无重复 LINK。 |
| 5. 联合验收与发布    | 完整公共导出、中文 TSDoc、迁移文档、人工验收和独立 tarball 消费构建；同步发布三包新版本并提供宿主接入清单。                   | Issue 全部验收项具备证据；包外只导入 el-form-gen 即可编译；BPM 收到正式版本和最终契约后进行真实持久化联调。  |

## Core 需一并迁移的文件

- `packages/form-core/src/types.ts`、`index.ts`：设计/运行/权限/表达式/反馈/变更/回执公开类型与导出。
- `packages/form-core/src/data-model.ts`：旧文档规范化、首次模型导入/校验、实体与关系更新、布局作用域、复制/放置；不能遗漏 sourceMetadata 和 keyMappings。
- `packages/form-core/src/designer-document.ts`、`component-registry.ts`、`designer-catalogs.ts`、`property-editor-presets.ts`：保存诊断、拖拽规则、生成关系布局、组件能力和深度/行数约束。
- `packages/form-core/src/subtable-projection.ts`、`canvas-projection.ts`：数据列与嵌套行内容拆分、设计态投影；运行会话内核应与 CSS 列布局算法分开。
- `packages/form-core/src/expression.ts`、`validation.ts`、`field-behavior.ts`、`document-advanced.ts`：声明式作用域、依赖关系、校验与规则编辑默认值/诊断。
- `packages/form-core/src/event-flow.ts`、`field-access.ts`、`submission.ts`：统一读写路由、实例化权限、显式变更和回执。
- `packages/form-core/src/overlay-module.ts`：设计模块复制/引用的关系上下文规则；运行草稿由会话内核承接。
- 包 README、主包类型转导出、宿主消费示例：旧一级契约与新关系契约必须能独立安装编译，不依赖仓库内部源文件。

该清单依据上述已证实调用链和 [Core 公共导出](https://github.com/daxiangme/form-builder/blob/61ea891b0ced6373d7a420681dc474420a9afaed/packages/form-core/src/index.ts#L1-L21)。Renderer/Adapter 文件范围见前两节；实现时应从 session 入口逐条迁移调用方，避免新旧值仓并行写入。

## 验证结果与后续验收

本轮在当前源码基线上运行 `pnpm verify`，退出码为 0，以下检查全部通过：格式、ESLint、Stylelint、包依赖边界、四个工作区项目类型检查、Core/Adapter/主包与 playground 生产构建。该命令不包含自动化测试。[验证脚本](https://github.com/daxiangme/form-builder/blob/61ea891b0ced6373d7a420681dc474420a9afaed/package.json#L26-L34)

构建有两项非阻断警告：`FormModalShell.vue` 编译产物中的 Vue `resolveDirective` 导入未使用，以及 playground 压缩后 chunk 超过 500 kB。它们未导致构建失败，也不能证明 N 层/M:N 已受支持。本轮没有进行功能复现、浏览器人工验收或 tarball 消费构建；这些是实现后的必要门禁，不能由本次编译通过代替。

实施后的人工验收至少覆盖以下组合，并记录输入、操作、界面结果与提交/回执摘要；敏感引用应脱敏：

1. 根→子→孙→更深层；两个父行中同容器分别编辑、计算、比较和校验，含祖先引用。
2. 新根/新父/新子一次保存，回填后顺序、展开、选中和错误定位稳定；再次保存不重复 CREATE/LINK。
3. 单字段更新只提交差量；改回基线无 UPDATE；隐藏、只读、空页、分页外、未加载和失败加载都不产生误删。
4. 复制完整子树并生成新身份；未加载后代复制被明确处理；父删除按宿主级联/约束执行，未保存新增后删除相消。
5. 行/整表弹层确认与取消，其他父行同时发生更新、源行被删除、权限变更时不错误覆盖。
6. 两父关联同目标，解除一方不影响另一方；跨搜索/跨页选择、去重、候选过期、关联字段与目标字段不同授权。
7. 同字段在不同父行的必填、可见、可编辑状态分别生效；权限收紧后脏输入保留且非法提交被阻断。冲突/拒绝保留输入，不自动重放；切文档、重置或卸载后的旧回执、旧校验和旧候选查询不得回写。
8. 旧一级文档和值仓明确迁移；主题和模式保持兼容；无 Token/URL/业务类型进入设计文档。

发布前把三个包打成实际 tarball，在仓库外的新消费工程安装主包及其声明的 peer dependencies，并让两个精确内部依赖解析到本次 tarball；确认没有 workspace 链接或旧 registry 版本混入。消费工程只从 `el-form-gen` 导入公共 API，执行类型检查和生产构建，再完成真实浏览器人工验收。交付清单包含版本号、安装命令、最终类型/事件/API、迁移说明与验证证据；服务端事务、幂等、最终授权和真实 BPM 联调属于宿主验收范围。[Issue 验收与交付要求](https://github.com/daxiangme/form-builder/issues/1)
