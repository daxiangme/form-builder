# @daxiangme/form-adapter

DX Form 的本地预览和 DX BPM 宿主适配实现。传输生命周期由宿主提供，Adapter 不保存 Token，也不创建 Axios 实例。

```bash
pnpm add @daxiangme/form-core @daxiangme/form-adapter
```

```ts
import { createDxBpmFormAdapter } from '@daxiangme/form-adapter'

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
