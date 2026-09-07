# @daxiangme/form-adapter

`el-form-gen` 的内部本地预览和 DX BPM 宿主适配实现。普通 Vue 应用请从 [`el-form-gen`](https://www.npmjs.com/package/el-form-gen) 导入工厂函数。传输生命周期由宿主提供，Adapter 不保存 Token，也不创建 Axios 实例。

```ts
import { createDxBpmFormAdapter, createLocalPreviewFormAdapter } from 'el-form-gen'

const adapters = createDxBpmFormAdapter({
  transport: {
    request: ({ method, path, query, body }) =>
      dxHttp.request({ method, url: path, params: query, data: body }),
    download: ({ path, query }) => dxHttp.download(path, { params: query }),
  },
  context: { applicationCode: 'expense', resourceCode: 'expense-form', recordToken },
})
```

`createLocalPreviewFormAdapter()` 返回 `{ adapters, dispose }`；其文件只保存在当前页面的内存与 Object URL 中，不会产生业务网络请求。

## 0.3 关系表单接入

关系数据加载、候选查询、已选回显、确认前校验及原子保存通过 Core 定义的关系端口接入。候选页和已选集合相互独立，取消查询不生成关联操作；选择现有实体产生 `LINK`，解除关系产生 `UNLINK`，均不删除共享目标实体。

DX BPM 工厂通过 `extras` 注入宿主实现的关系端口，不在包内猜测业务 HTTP 地址。候选鉴权、版本、幂等、事务和保存结果查询由宿主负责。宿主引用只能存在运行值或 Adapter 上下文，不得写入 Schema 或日志。

`createLocalRelationFormAdapter({ initialState, candidates })` 返回 `{ adapters, save, setSaveScenario, setSelectionScenario, dispose }`，使用独立内存副本提供分页、回显、确认校验和原子保存。保存场景为 `SUCCESS`、`REJECTED`、`CONFLICT`、`UNKNOWN`；最后一种模拟已经提交但回执丢失，通过 `adapters.submissionStatus.resolve` 可取回原批次结果。该工厂仅用于公开虚拟数据演示，不提供生产鉴权或数据库持久化。

0.2 的平面子表值需要显式迁移；预览 `rowId` 不能猜作持久化主键。三个发布包必须保持版本一致，普通 Vue 应用继续仅从 `el-form-gen` 导入。完整身份、权限、回执及迁移约定参见[关系接入文档](https://github.com/daxiangme/form-builder/blob/main/docs/relations.md)。
