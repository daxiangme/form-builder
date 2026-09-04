# @daxiangme/form-core

`el-form-gen` 的内部文档、布局、行为、诊断、事件与运行端口模块。普通 Vue 应用请安装 [`el-form-gen`](https://www.npmjs.com/package/el-form-gen)，不必单独导入本包。

```ts
import { createEmptyDesignerDocument, decodeDesignerDocument } from 'el-form-gen'

const document = createEmptyDesignerDocument('expense-form', '费用申请')
const decoded = decodeDesignerDocument(document)
```

Core 不依赖 Vue、Element Plus、HTTP 客户端、Router 或任何 BPM 宿主类型。
