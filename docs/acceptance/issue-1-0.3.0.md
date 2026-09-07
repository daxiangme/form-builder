# Issue #1 0.3.0 验收记录

记录日期：2026-09-05。工作分支：`feat/issue-1-relations`。源码基线：`61ea891`（已发布 0.2.0）上的未提交实现。需求来源：[GitHub Issue #1](https://github.com/daxiangme/form-builder/issues/1)。宿主接入契约见[关系接入文档](../relations.md)。

本轮**组件验收已完成到可交付代码与消费构建**；**尚未发布到 npm registry**，也**尚未做真实 DX BPM 服务端联调**。仓库不新增或运行自动化测试代码。

## 版本与安装

三个发布包必须使用同一版本，不要覆盖已发布的 `0.2.0`：

| 包                        | 版本    | 精确内部依赖                                                  |
| ------------------------- | ------- | ------------------------------------------------------------- |
| `el-form-gen`             | `0.3.0` | `@daxiangme/form-core@0.3.0`、`@daxiangme/form-adapter@0.3.0` |
| `@daxiangme/form-core`    | `0.3.0` | 无运行时依赖                                                  |
| `@daxiangme/form-adapter` | `0.3.0` | `@daxiangme/form-core@0.3.0`                                  |

普通 Vue 宿主只安装主包：

```bash
pnpm add el-form-gen@0.3.0
```

尚未安装 Peer Dependencies 时：

```bash
pnpm add el-form-gen@0.3.0 vue@^3.5.0 element-plus@^2.11.0
```

```ts
import 'el-form-gen/style.css'
import {
  ElFormDesigner,
  ElFormRenderer,
  createDesignerRuntimeSession,
  createLocalRelationFormAdapter,
  migrateDesignerDocument,
} from 'el-form-gen'
```

不要从 `@daxiangme/form-core` 或 `@daxiangme/form-adapter` 作为应用入口导入。当前 registry 尚无 `0.3.0`；发布前请使用本仓库构建的 tarball，见下文消费工程。

## 公共 API 与迁移

新关系模式入口：

```ts
const session = createDesignerRuntimeSession({
  document,
  initialState,
  mode: 'EDIT',
  fieldRuntimePolicy,
  relationRuntimePolicy,
  adapters,
  adapterContext,
})
```

```vue
<ElFormRenderer :session="session" show-toolbar @submission="save" />
```

| 入口       | 行为                                                                                                |
| ---------- | --------------------------------------------------------------------------------------------------- |
| 新模式     | 只传 `session` 与展示属性；事件为 `submission`。`prepareSubmission` / `applyReceipt` 处理原子批次。 |
| 旧一级模式 | 继续使用 `document`、`modelValue`、`update:modelValue`、`submit`。旧 `rowId` 只是客户端身份。       |
| 混用       | TypeScript 互斥 Props；运行时给出诊断，不启动双值仓。                                               |

保存回执示例：

```ts
async function save(batch: DesignerSubmissionBatch): Promise<void> {
  const receipt: DesignerSaveReceipt = await saveAtomicBatch(batch)
  session.applyReceipt(receipt)
}
```

网络结果未知时回执 `status: 'UNKNOWN'`，随后 `session.dispatch({ type: 'RESOLVE_SUBMISSION' })`。`AFTER_SUBMIT` 仍表示投影已发出；`AFTER_COMMIT` 只在匹配的成功回执应用后执行。

设计文档升级为 `documentVersion: '2.0'`。旧文档：

```ts
const { document, diagnostics } = migrateDesignerDocument(oldDocument)
```

保留原 document / entity / relation / node / field ID。`1.0` 缺失的关系种类补为 `ONE_TO_MANY`。预览 `rowId` 不能猜成数据库主键；旧平面 `collections[containerId]` 只能迁到根作用域一级集合。

## 仓库验收

在当前工作树执行：

```bash
pnpm verify
pnpm check:boundaries
```

| 门禁                                        | 结果 |
| ------------------------------------------- | ---- |
| Prettier                                    | 通过 |
| ESLint（`--max-warnings=0`）                | 通过 |
| Stylelint                                   | 通过 |
| 包依赖边界（含构建后 dist）                 | 通过 |
| 四包 `typecheck`                            | 通过 |
| Core / Adapter / 主包 / playground 生产构建 | 通过 |

非阻断构建提示：

- `FormModalShell.vue` 产物中 Vue `resolveDirective` 导入未使用。
- playground 压缩 chunk 超过 500 kB。

二者都不证明关系能力，也不构成发布阻断。

## 组件验收

会话内核与本地关系 Adapter 在仓库外 Node 脚本中按公开 API 复现（不写入仓库测试）。结果 **22/22**：

| 场景                                                    | 结果 |
| ------------------------------------------------------- | ---- |
| 两个父行的任务值互不串扰                                | 通过 |
| 只改当前行产生 `UPDATE`，不产生 `CREATE`                | 通过 |
| 确定拒绝保留脏值并解锁                                  | 通过 |
| `REVERT_FIELD` 后无提交批次                             | 通过 |
| 成功回执不替换 `clientRowKey`；再次保存无操作           | 通过 |
| 新父与新子同批 `CREATE`，回填后 UI 身份稳定             | 通过 |
| 连续保存不再重复 `CREATE`                               | 通过 |
| 复制父行清除持久身份；多对多产生 `LINK`，不复制共享目标 | 通过 |
| `UNLINK` 只解除当前关联，共享目标仍在                   | 通过 |
| 隐藏项目 B 不产生对该子树的 `DELETE`                    | 通过 |

Playground 演示入口：

- 本地服务 `http://127.0.0.1:8801/`
- 工作区「关系设计」绑定 `createRelationPlaygroundDocument()`
- 工作区「关系表单」绑定 `RelationPlayground`：独立授权、保存成功/拒绝/冲突/未知回执、分页候选、懒加载与加载失败

设计器关系入口已同步：

- 字段树按父实体递归展示一对多、多对多关联字段和共享目标字段；共享目标不再出现「生成子表」
- 行子表画布把字段列和嵌套子关系分区：字段形成列，子关系在「运行时在行展开区呈现」区域
- 表达式与事件动作可选 `ROOT` / `CURRENT_ROW` / `ANCESTOR`（祖先层数 1 为直接父行）
- 检查器可把关系改为 `MANY_TO_MANY` 并选择共享目标实体

本环境没有交互式浏览器驱动，未能代替真人点击、拖拽、弹层确认和跨页勾选。上述 UI 已通过源码、生产产物字符串和 Vite 模块 HTTP 200 核对；运行语义以会话脚本为准。

## 消费工程验收

将本次构建的三个 tarball 安装到仓库外工程 `/tmp/dx-form-0.3.0-consumer`：

- `daxiangme-form-core-0.3.0.tgz`
- `daxiangme-form-adapter-0.3.0.tgz`
- `el-form-gen-0.3.0.tgz`

`pnpm-lock.yaml` 只出现上述 file tarball，没有 `registry.npmjs.org/@daxiangme/form-core` 或 `form-adapter`。消费工程只从 `el-form-gen` 导入 `ElFormRenderer`、`createDesignerRuntimeSession`、`createLocalRelationFormAdapter`、`migrateDesignerDocument` 及提交/回执类型。

| 检查                                      | 结果 |
| ----------------------------------------- | ---- |
| `pnpm typecheck`（`vue-tsc`）             | 通过 |
| `pnpm build`（`vue-tsc` + Vite 生产构建） | 通过 |

该消费工程的浏览器页面未在本环境打开。组件交互请用仓库 playground 或把同一 tarball 装进宿主后人工操作。

## 发布准备（尚未执行）

registry 当前没有 `0.3.0`。门禁通过后按固定版本组同时发布，不要只发其中一个包：

```bash
pnpm verify
pnpm check:boundaries
# 确认三个 package.json 均为 0.3.0，锁文件已同步
pnpm --filter @daxiangme/form-core publish --access public
pnpm --filter @daxiangme/form-adapter publish --access public
pnpm --filter el-form-gen publish --access public
```

发布后的宿主安装命令即为 `pnpm add el-form-gen@0.3.0`。发布前可用：

```bash
pnpm add /path/to/el-form-gen-0.3.0.tgz
pnpm add /path/to/daxiangme-form-core-0.3.0.tgz
pnpm add /path/to/daxiangme-form-adapter-0.3.0.tgz
```

并在 `package.json` 的 `pnpm.overrides` 中把两个内部包钉到本次 tarball，避免误解析到旧 registry 版本。

## 未完成项

| 项目                                           | 状态         | 责任                                                         |
| ---------------------------------------------- | ------------ | ------------------------------------------------------------ |
| 三包 npm 发布 `0.3.0`                          | 未执行       | 仓库维护者                                                   |
| 真实 DX BPM 传输、事务、幂等、最终鉴权和审批流 | 未联调       | 宿主。工厂仍通过 `extras` 注入关系端口，不猜测业务 HTTP 路径 |
| Playground / 消费工程的真人浏览器点击闭环      | 本环境未完成 | 发布前建议在桌面和移动视口各走一遍关系设计与关系表单         |
| 边保存边编辑、三方归并                         | 首版明确不做 | 后续增强                                                     |

组件验收与宿主验收必须分开：本仓库证明文档、会话、Renderer 和 Adapter 端口；BPM 在收到正式 `0.3.0` 与最终契约后，再用真实持久化证明事务和审批。
