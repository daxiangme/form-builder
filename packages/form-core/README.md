# @daxiangme/form-core

纯 TypeScript 的 DX Form 文档、布局、行为、诊断、事件与运行端口。

```bash
pnpm add @daxiangme/form-core
```

```ts
import { createEmptyDesignerDocument, decodeDesignerDocument } from '@daxiangme/form-core'

const document = createEmptyDesignerDocument('expense-form', '费用申请')
const decoded = decodeDesignerDocument(document)
```

Core 不依赖 Vue、Element Plus、HTTP 客户端、Router 或任何 BPM 宿主类型。
