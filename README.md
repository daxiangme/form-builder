# Form Builder

> Visual Form Designer and Schema-Driven Renderer for Vue 3 + Element Plus

Form Builder 是面向 Vue 3 与 Element Plus 的开源可视化低代码表单设计器。它把拖拽式设计工作台、Schema 驱动运行渲染、弹窗与抽屉模块、字段规则和声明式事件流封装为可直接嵌入业务系统的 Vue 组件。

## 功能一览

- 可嵌入的拖拽式表单设计器和运行渲染器。
- 统一的 `DesignerDocument 1.0` 文档、严格编解码与诊断。
- 主表单、弹窗、抽屉、响应式栅格、行子表和块子表。
- 状态条件、公式计算、字段联动、验证规则与声明式事件流。
- Element Plus 控件、浅色/深色主题和受控圆角样式。
- 文件、数据源、远程验证、OCR、扫码、定位、导航与宿主动作 Adapter 端口。
- 现代 ESM、完整 TypeScript 类型声明和独立 CSS 产物。

![Form Builder 设计器总览](https://raw.githubusercontent.com/daxiangme/form-builder/v0.1.1/docs/assets/screenshots/designer-overview.png)

## 安装

普通 Vue 应用只需要安装主包：

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

也可以跳过全局注册，直接按需导入 `FormDesigner` 和 `FormRenderer`。

## 设计表单

`FormDesigner` 使用受控 `modelValue`。组件负责编辑文档并发出保存、导出与诊断事件，业务持久化由宿主决定。

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

## 渲染表单

`FormRenderer` 使用同一份文档渲染新增、编辑、只读和详情状态，并输出稳定的提交投影。

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
  // 将稳定提交投影交给你的业务接口。
  console.info(projection)
}
</script>

<template>
  <FormRenderer v-model="value" :document="document" mode="CREATE" @submit="handleSubmit" />
</template>
```

## 模块化表单

除主表单外，同一份文档还能设计弹窗与抽屉。模块拥有独立布局、数据草稿和运行外壳，可由声明式事件流打开。

![弹窗与抽屉模块设计](https://raw.githubusercontent.com/daxiangme/form-builder/v0.1.1/docs/assets/screenshots/overlay-module-designer.png)

## 字段规则与事件流

字段高级配置集中管理状态条件、公式与联动、验证规则、提交策略和组件事件。规则在保存前经过诊断，事件使用可视化步骤与条件分支表达，不在 Schema 中保存自由 JavaScript。

![字段高级配置](https://raw.githubusercontent.com/daxiangme/form-builder/v0.1.1/docs/assets/screenshots/advanced-field-config.png)

![声明式事件流](https://raw.githubusercontent.com/daxiangme/form-builder/v0.1.1/docs/assets/screenshots/event-flow-designer.png)

## 运行效果

设计文档可以直接交给运行渲染器。弹窗和抽屉在运行态使用真实 Element Plus 外壳，支持独立内容滚动、确认与取消草稿语义。

![表单运行预览](https://raw.githubusercontent.com/daxiangme/form-builder/v0.1.1/docs/assets/screenshots/runtime-preview.png)

## Element Plus 主题

组件以 `.daxiang-form` 为样式命名空间，默认消费 Element Plus CSS Variables。深色模式直接跟随宿主的 `html.dark`，不维护第二套主题状态。

![Element Plus 深色主题](https://raw.githubusercontent.com/daxiangme/form-builder/v0.1.1/docs/assets/screenshots/dark-theme.png)

## 宿主能力 Adapter

基础设计与渲染不要求额外安装 Adapter。上传、目录、数据源、远程验证、OCR、扫码、定位、导航和业务动作需要宿主通过 `FormRuntimeAdapters` 注入相应端口；缺少端口时保留配置和静态外观，真实动作会明确失败关闭。

上传字段的 Schema 只保存数量、大小、类型、显示方式和可选策略引用。文件值只持久化稳定 `assetId`，不会把 URL、Method、Token 或回调写入表单文档。

## 文档工具

主包同时导出常用 Core 门面，无需额外安装或导入其他包：

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

Form Builder 内部保持 `form-vue -> form-core <- form-adapter` 的单向依赖：

- [`@daxiangme/form-core`](https://www.npmjs.com/package/@daxiangme/form-core) 是纯 TypeScript 文档、规则、诊断和运行端口深模块。
- [`@daxiangme/form-adapter`](https://www.npmjs.com/package/@daxiangme/form-adapter) 提供宿主适配工厂，适合需要自定义传输层或 DX BPM 上下文的集成方。

普通 Vue 应用始终从 [`@daxiangme/form-vue`](https://www.npmjs.com/package/@daxiangme/form-vue) 开始。当前版本支持 Vue 3、Element Plus 与现代 ESM 浏览器工程，不承诺 CommonJS、SSR 或其他 UI 框架。

## License

[MIT](./LICENSE) © 2026 daxiangme
