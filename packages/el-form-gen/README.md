# el-form-gen

> Visual Form Designer and Runtime Renderer for Vue 3 + Element Plus

`el-form-gen` 是 Form Gen 的唯一推荐使用入口，提供可嵌入的拖拽式设计器、Schema 驱动运行渲染器、弹窗与抽屉模块、字段规则和声明式事件流。**Form Gen** 包含设计器与运行渲染器，不表示代码生成。

![Form Builder 设计器总览](https://raw.githubusercontent.com/daxiangme/form-builder/v0.1.1/docs/assets/screenshots/designer-overview.png)

## 安装

已有 Vue 3 和 Element Plus 的应用只需要安装主包：

```bash
pnpm add el-form-gen
```

主包要求 Vue `^3.5.0` 和 Element Plus `^2.11.0`。新建工程或尚未安装这两个 Peer Dependencies 时，可以一次性安装：

```bash
pnpm add el-form-gen vue element-plus
```

按需宿主（`unplugin-vue-components` 等）只需引入包自身样式。入口会副作用导入所用 Element Plus 组件的 `style/css`，宿主已有的 `--el-*` 变量和全局 `.el-*` 补丁会作用在设计器上，**不必**全量 `element-plus/dist/index.css`，也**不必** `app.use(ElementPlus)`：

```ts
import 'el-form-gen/style.css'
import { ElFormDesigner, ElFormRenderer } from 'el-form-gen'
```

已经全量引入 Element Plus 样式的工程仍然兼容，可继续：

```ts
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import 'el-form-gen/style.css'
```

## 注册组件

库构建会为模板用到的 Element Plus 控件注入对应 `style/css` 副作用导入。按需宿主直接导入两个公共组件即可：

```ts
import { createApp } from 'vue'
import { ElFormDesigner, ElFormRenderer } from 'el-form-gen'

import App from './App.vue'

createApp(App).mount('#app')
```

已经全量 `app.use(ElementPlus)` 的工程仍然兼容。默认导出 `ElFormGenPlugin` 只把 `ElFormDesigner` / `ElFormRenderer` 注册为全局组件，不负责安装 Element Plus：

```ts
import { createApp } from 'vue'
import ElFormGenPlugin from 'el-form-gen'

import App from './App.vue'

createApp(App).use(ElFormGenPlugin).mount('#app')
```

新包不再导出无前缀兼容别名。

## 设计表单

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { ElFormDesigner, createDemoDesignerDocument, type DesignerDocument } from 'el-form-gen'

const document = ref<DesignerDocument>(createDemoDesignerDocument('purchase-application'))

function handleSave(nextDocument: DesignerDocument) {
  document.value = nextDocument
}
</script>

<template>
  <div class="designer-host">
    <ElFormDesigner v-model="document" @save-request="handleSave" />
  </div>
</template>

<style scoped>
.designer-host {
  height: 100vh;
}
</style>
```

`ElFormDesigner` 使用受控 `modelValue`，负责编辑文档并发出保存、导出与诊断事件；业务持久化由宿主决定。

## 渲染表单

```vue
<script setup lang="ts">
import { ref } from 'vue'
import {
  ElFormRenderer,
  createDemoDesignerDocument,
  type DesignerRuntimeValueStore,
  type DesignerSubmissionProjection,
  type FormFieldRuntimePolicyMap,
} from 'el-form-gen'

const document = createDemoDesignerDocument('purchase-application')
const value = ref<DesignerRuntimeValueStore>({ fields: {}, collections: {} })
const fieldRuntimePolicy: FormFieldRuntimePolicyMap | undefined = undefined

function handleSubmit(projection: DesignerSubmissionProjection) {
  console.info(projection)
}
</script>

<template>
  <ElFormRenderer
    v-model="value"
    :document="document"
    mode="CREATE"
    :field-runtime-policy="fieldRuntimePolicy"
    @submit="handleSubmit"
  />
</template>
```

`ElFormRenderer` 使用同一份文档渲染新增、编辑、只读和详情状态，并输出稳定的提交投影。

## 三态字段权限

运行策略以字段 ID 为键。未传 `fieldRuntimePolicy` 时按独立表单 Schema 工作；传入后视为完整权威投影，缺失或非法字段（含历史 `REQUIRED`）按 `HIDDEN` 失败关闭。

- `HIDDEN`：不渲染、不校验、不提交。
- `READ_ONLY`：只展示，拒绝输入、附件、子表和事件流写入，也不进入用户提交。
- `EDITABLE`：正常校验和提交；`required: true` 仅作为独立必填标志。

公式可以刷新只读展示，但不能放宽宿主权限。旧 BPM `REQUIRED` 必须由宿主映射为 `{ accessLevel: 'EDITABLE', required: true }`。

## 模块、规则与事件

主表单、弹窗与抽屉共用同一份 `DesignerDocument 1.0`。字段高级配置集中管理状态条件、公式与联动、验证规则、提交策略和组件事件；事件使用可视化步骤与条件分支表达。

![弹窗与抽屉模块设计](https://raw.githubusercontent.com/daxiangme/form-builder/v0.1.1/docs/assets/screenshots/overlay-module-designer.png)

![字段高级配置](https://raw.githubusercontent.com/daxiangme/form-builder/v0.1.1/docs/assets/screenshots/advanced-field-config.png)

![声明式事件流](https://raw.githubusercontent.com/daxiangme/form-builder/v0.1.1/docs/assets/screenshots/event-flow-designer.png)

## 运行效果与主题

弹窗和抽屉在运行态使用真实 Element Plus 外壳。组件默认消费 Element Plus CSS Variables，深色模式直接跟随宿主的 `html.dark`。

新建文档默认标签位于顶部且左对齐。圆角取值是 `THEME` 或 0～32 的 4 的倍数像素：`THEME` 跟随宿主 `--el-border-radius-base`；旧档位 `NONE` / `SMALL` / `BASE` / `LARGE` 解码为 0 / 4 / 8 / 12。自定义像素会写入 `--daxiang-form-container-radius` 等变量，而不是空的档位 class。

![表单运行预览](https://raw.githubusercontent.com/daxiangme/form-builder/v0.1.1/docs/assets/screenshots/runtime-preview.png)

![Element Plus 深色主题](https://raw.githubusercontent.com/daxiangme/form-builder/v0.1.1/docs/assets/screenshots/dark-theme.png)

## 宿主能力 Adapter

基础设计与渲染不要求额外安装 Adapter。上传、目录、数据源、远程验证、OCR、扫码、定位、导航和业务动作需要宿主通过 `FormRuntimeAdapters` 注入相应端口；缺少端口时保留配置和静态外观，真实动作会明确失败关闭。

主包同时导出文档门面、运行类型以及 `createLocalPreviewFormAdapter` / `createDxBpmFormAdapter`：

```ts
import {
  createEmptyDesignerDocument,
  createDxBpmFormAdapter,
  decodeDesignerDocument,
  diagnoseDesignerDocument,
  serializeDesignerDocument,
  type DesignerDocument,
  type FormRuntimeAdapters,
} from 'el-form-gen'
```

## 后续 DX BPM 接入

本轮不修改 DX BPM。后续请：把依赖换成 `el-form-gen`；把权限键从字段路径映射到字段 ID；把旧 `REQUIRED` 写成 `{ accessLevel: 'EDITABLE', required: true }`。

## 高级扩展与内部架构

内部依赖固定为 `el-form-gen -> form-core` 且 `el-form-gen -> form-adapter -> form-core`。纯 TypeScript 文档内核和宿主适配工厂继续以 `@daxiangme/form-core` 与 `@daxiangme/form-adapter` 作为传递依赖发布；普通 Vue 应用无需单独安装它们。

当前版本支持 Vue 3、Element Plus 与现代 ESM 浏览器工程，不承诺 CommonJS、SSR 或其他 UI 框架。

## License

[MIT](https://github.com/daxiangme/form-builder/blob/v0.1.1/LICENSE) © 2026 daxiangme
