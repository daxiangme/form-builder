# @daxiangme/form-vue

> Visual Form Designer and Schema-Driven Renderer for Vue 3 + Element Plus

`@daxiangme/form-vue` 是 Form Builder 的唯一推荐使用入口，提供可嵌入的拖拽式设计器、Schema 驱动运行渲染器、弹窗与抽屉模块、字段规则和声明式事件流。

![Form Builder 设计器总览](https://raw.githubusercontent.com/daxiangme/form-builder/v0.1.1/docs/assets/screenshots/designer-overview.png)

## 安装

```bash
pnpm add @daxiangme/form-vue vue element-plus
```

按以下顺序引入样式：

```ts
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import '@daxiangme/form-vue/style.css'
```

## 注册组件

```ts
import { createApp } from 'vue'
import ElementPlus from 'element-plus'
import { DaxiangFormVue } from '@daxiangme/form-vue'

import App from './App.vue'

createApp(App).use(ElementPlus).use(DaxiangFormVue).mount('#app')
```

## 设计表单

```vue
<script setup lang="ts">
import { ref } from 'vue'
import {
  FormDesigner,
  createDemoDesignerDocument,
  type DesignerDocument,
} from '@daxiangme/form-vue'

const document = ref<DesignerDocument>(createDemoDesignerDocument('purchase-application'))

function handleSave(nextDocument: DesignerDocument) {
  document.value = nextDocument
}
</script>

<template>
  <div class="designer-host">
    <FormDesigner v-model="document" @save-request="handleSave" />
  </div>
</template>

<style scoped>
.designer-host {
  height: 100vh;
}
</style>
```

`FormDesigner` 使用受控 `modelValue`，负责编辑文档并发出保存、导出与诊断事件；业务持久化由宿主决定。

## 渲染表单

```vue
<script setup lang="ts">
import { ref } from 'vue'
import {
  FormRenderer,
  createDemoDesignerDocument,
  type DesignerRuntimeValueStore,
  type DesignerSubmissionProjection,
} from '@daxiangme/form-vue'

const document = createDemoDesignerDocument('purchase-application')
const value = ref<DesignerRuntimeValueStore>({ fields: {}, collections: {} })

function handleSubmit(projection: DesignerSubmissionProjection) {
  console.info(projection)
}
</script>

<template>
  <FormRenderer v-model="value" :document="document" mode="CREATE" @submit="handleSubmit" />
</template>
```

`FormRenderer` 使用同一份文档渲染新增、编辑、只读和详情状态，并输出稳定的提交投影。

## 模块、规则与事件

主表单、弹窗与抽屉共用同一份 `DesignerDocument 1.0`。字段高级配置集中管理状态条件、公式与联动、验证规则、提交策略和组件事件；事件使用可视化步骤与条件分支表达。

![弹窗与抽屉模块设计](https://raw.githubusercontent.com/daxiangme/form-builder/v0.1.1/docs/assets/screenshots/overlay-module-designer.png)

![字段高级配置](https://raw.githubusercontent.com/daxiangme/form-builder/v0.1.1/docs/assets/screenshots/advanced-field-config.png)

![声明式事件流](https://raw.githubusercontent.com/daxiangme/form-builder/v0.1.1/docs/assets/screenshots/event-flow-designer.png)

## 运行效果与主题

弹窗和抽屉在运行态使用真实 Element Plus 外壳。组件默认消费 Element Plus CSS Variables，深色模式直接跟随宿主的 `html.dark`。

![表单运行预览](https://raw.githubusercontent.com/daxiangme/form-builder/v0.1.1/docs/assets/screenshots/runtime-preview.png)

![Element Plus 深色主题](https://raw.githubusercontent.com/daxiangme/form-builder/v0.1.1/docs/assets/screenshots/dark-theme.png)

## 宿主能力 Adapter

基础设计与渲染不要求额外安装 Adapter。上传、目录、数据源、远程验证、OCR、扫码、定位、导航和业务动作需要宿主通过 `FormRuntimeAdapters` 注入相应端口；缺少端口时保留配置和静态外观，真实动作会明确失败关闭。

主包同时导出常用文档门面和运行类型：

```ts
import {
  createEmptyDesignerDocument,
  decodeDesignerDocument,
  diagnoseDesignerDocument,
  serializeDesignerDocument,
  type DesignerDocument,
  type FormRuntimeAdapters,
} from '@daxiangme/form-vue'
```

## 高级扩展与内部架构

内部依赖固定为 `form-vue -> form-core <- form-adapter`。纯 TypeScript 文档内核和宿主适配工厂继续以 [`@daxiangme/form-core`](https://www.npmjs.com/package/@daxiangme/form-core) 与 [`@daxiangme/form-adapter`](https://www.npmjs.com/package/@daxiangme/form-adapter) 提供给高级集成方；普通 Vue 应用无需单独安装它们。

当前版本支持 Vue 3、Element Plus 与现代 ESM 浏览器工程，不承诺 CommonJS、SSR 或其他 UI 框架。

## License

[MIT](https://github.com/daxiangme/form-builder/blob/v0.1.1/LICENSE) © 2026 daxiangme
