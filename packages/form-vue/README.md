# @daxiangme/form-vue

Vue 3 + Element Plus 的 DX Form 设计器和运行渲染器。

```bash
pnpm add @daxiangme/form-core @daxiangme/form-vue vue element-plus
```

样式顺序固定为：

```ts
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import '@daxiangme/form-vue/style.css'
```

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { createEmptyDesignerDocument, type DesignerRuntimeValueStore } from '@daxiangme/form-core'
import { FormDesigner, FormRenderer } from '@daxiangme/form-vue'

const document = ref(createEmptyDesignerDocument('form-1'))
const value = ref<DesignerRuntimeValueStore>({ fields: {}, collections: {} })
</script>

<template>
  <FormDesigner v-model="document" @save-request="saveDocument" />
  <FormRenderer v-model="value" :document="document" mode="CREATE" />
</template>
```

`FormDesigner` 只发出保存和导出请求，不代替宿主调用业务接口。`FormRenderer` 的文件、目录、OCR、扫码、定位、远程验证和导航能力都通过 `FormRuntimeAdapters` 显式注入；缺少端口时操作失败关闭。

深色模式直接跟随 Element Plus 的 `html.dark`，包内不维护第二套主题状态。

`FormDesigner` 会占满直接父容器；消费方需要为该父容器提供确定高度，但不要求父容器使用 Flex 布局。
