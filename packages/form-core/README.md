# @daxiangme/form-core

## 0.3 关系运行协议

关系会话使用稳定运行行标识、独立持久化身份和完整祖先链隔离各集合实例，统一管理嵌套编辑、基线、显式操作、权限与保存回执。多对多关联记录与共享目标实体分别具有身份及字段授权，`LINK` / `UNLINK` 不隐含目标实体编辑或删除。

提交按实际修改生成 `CREATE`、`UPDATE`、`DELETE`、`LINK`、`UNLINK` 意图；分页、隐藏或加载失败导致的行缺失不代表删除。成功回执原位补齐身份、版本和值后建立干净基线，确定拒绝保留输入，未知结果通过原批次查询恢复。

0.2 预览行标识不是持久化主键，旧平面集合只能按明确的根作用域迁移。宿主必须提供新关系权限，迁移不会自动开放关系操作。参见[关系接入文档](https://github.com/daxiangme/form-builder/blob/main/docs/relations.md)。

`el-form-gen` 的内部文档、布局、行为、诊断、事件与运行端口模块。普通 Vue 应用请安装 [`el-form-gen`](https://www.npmjs.com/package/el-form-gen)，不必单独导入本包。

```ts
import { createEmptyDesignerDocument, decodeDesignerDocument } from 'el-form-gen'

const document = createEmptyDesignerDocument('expense-form', '费用申请')
const decoded = decodeDesignerDocument(document)
```

Core 不依赖 Vue、Element Plus、HTTP 客户端、Router 或任何 BPM 宿主类型。
