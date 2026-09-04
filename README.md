# el-form-gen

> Visual Form Designer and Runtime Renderer for Vue 3 + Element Plus

`el-form-gen` 是面向 Vue 3 与 Element Plus 的开源可视化表单设计器与运行渲染器。**Form Gen** 表示设计与运行渲染，不表示代码生成。

普通 Vue 应用只安装和导入这一个包。内部模块 `@daxiangme/form-core` 与 `@daxiangme/form-adapter` 会作为传递依赖安装，无需单独导入。

## 功能一览

- 可嵌入的拖拽式表单设计器 `ElFormDesigner` 和运行渲染器 `ElFormRenderer`。
- 统一的 `DesignerDocument 1.0` 文档、严格编解码与诊断。
- 主表单、弹窗、抽屉、响应式栅格、行子表和块子表。
- 状态条件、公式计算、字段联动、验证规则与声明式事件流。
- Element Plus 控件、浅色/深色主题和受控圆角样式。新建文档默认顶部左对齐；`THEME` 跟随宿主 `--el-border-radius-base`，自定义圆角为 0～32 的 4 的倍数 px，旧档位 `NONE` / `SMALL` / `BASE` / `LARGE` 解码为 0 / 4 / 8 / 12。
- 文件、数据源、远程验证、OCR、扫码、定位、导航、动态选项、日期范围、验证码、个人签名、地区级联与宿主动作 Adapter 端口。
- 运行模式 `CREATE` / `EDIT` / `READ_ONLY` / `DETAIL`，以及按字段 ID 生效的三态运行策略 `HIDDEN` / `READ_ONLY` / `EDITABLE`。
- 现代 ESM、完整 TypeScript 类型声明和独立 CSS 产物。

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

按需宿主（`unplugin-vue-components` 等）只需引入包自身样式。入口会副作用导入所用 Element Plus 组件的 `style/css`，宿主已有的 `--el-*` 变量和全局 `.el-*` 补丁会作用在设计器上，不必全量 `element-plus/dist/index.css`，也不必 `app.use(ElementPlus)`：

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

```ts
import { createApp } from 'vue'
import { ElFormDesigner, ElFormRenderer } from 'el-form-gen'

import App from './App.vue'

createApp(App).mount('#app')
```

已经全量 `app.use(ElementPlus)` 的工程可以继续全局安装，或使用默认导出 `ElFormGenPlugin` 只注册两个公共组件：

```ts
import { createApp } from 'vue'
import ElementPlus from 'element-plus'
import ElFormGenPlugin from 'el-form-gen'

import App from './App.vue'

createApp(App).use(ElementPlus).use(ElFormGenPlugin).mount('#app')
```

全局注册名是 `ElFormDesigner` 与 `ElFormRenderer`。新包不再导出无前缀兼容别名。

## 设计表单

`ElFormDesigner` 使用受控 `modelValue`。组件负责编辑文档并发出保存、导出与诊断事件，业务持久化由宿主决定。

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { ElFormDesigner, createDemoDesignerDocument, type DesignerDocument } from 'el-form-gen'

const document = ref<DesignerDocument>(createDemoDesignerDocument('purchase-application'))
const catalogs = undefined

function handleSave(nextDocument: DesignerDocument) {
  document.value = nextDocument
}
</script>

<template>
  <div class="designer-host">
    <ElFormDesigner v-model="document" :catalogs="catalogs" @save-request="handleSave" />
  </div>
</template>

<style scoped>
.designer-host {
  height: 100vh;
}
</style>
```

## 渲染表单

`ElFormRenderer` 使用同一份文档渲染新增、编辑、只读和详情状态，并输出稳定的提交投影。

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

## 三态字段权限

运行策略以字段 **ID** 为键，而不是 `fieldPath` 或字段编码。

未传 `fieldRuntimePolicy` 时，渲染器按独立表单 Schema 工作：文档必填、条件规则、公式只读和运行模式继续生效。

一旦传入策略对象（包括 `{}`），该映射视为完整权威投影：

- 缺失字段、非法 `accessLevel`（含历史 `REQUIRED`）按 `HIDDEN` 失败关闭。
- 包内**不会**把旧 `REQUIRED` 自动映射为可编辑。

| 访问级别    | 渲染   | 校验                     | 用户提交   | 输入 / 附件 / 子表 / 事件写入 |
| ----------- | ------ | ------------------------ | ---------- | ----------------------------- |
| `HIDDEN`    | 不渲染 | 不校验                   | 不提交     | 拒绝                          |
| `READ_ONLY` | 只展示 | 不校验                   | 不提交     | 拒绝                          |
| `EDITABLE`  | 正常   | Schema + 宿主 `required` | 按提交策略 | 允许                          |

`required` 是独立校验标志，不再编码为第四种访问级别。仅当 `accessLevel` 为 `EDITABLE` 且运行模式为 `CREATE` / `EDIT` 时，`required: true` 会强制必填。文档里的条件规则 `target: 'REQUIRED'` 仍然属于 Schema，不是宿主权限。

公式（`FORMULA`）可以刷新只读字段的展示值，但不能放宽宿主权限。联动（`LINKAGE`）和事件流写入必须遵守 `HIDDEN` / `READ_ONLY`。文档 `display.readonly` 仍可进入提交；宿主 `READ_ONLY` 不会进入用户提交。

```ts
const fieldRuntimePolicy: FormFieldRuntimePolicyMap = {
  [titleFieldId]: { accessLevel: 'EDITABLE', required: true },
  [amountFieldId]: { accessLevel: 'READ_ONLY' },
  [secretFieldId]: { accessLevel: 'HIDDEN' },
}
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

本地预览和 DX BPM 工厂都从主包导入：

```ts
import {
  createLocalPreviewFormAdapter,
  createDxBpmFormAdapter,
  type FormRuntimeAdapters,
} from 'el-form-gen'

const { adapters, dispose } = createLocalPreviewFormAdapter()

const bpmAdapters: FormRuntimeAdapters = createDxBpmFormAdapter({
  transport: {
    request: ({ method, path, query, body }) =>
      dxHttp.request({ method, url: path, params: query, data: body }),
    download: ({ path, query }) => dxHttp.download(path, { params: query }),
  },
  context: { applicationCode: 'expense', resourceCode: 'expense-form', recordToken },
})
```

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
} from 'el-form-gen'
```

## 从 @daxiangme/form-vue 迁移

1. 将依赖替换为 `el-form-gen@^0.2.0`。
2. 样式改为 `import 'el-form-gen/style.css'`。
3. 组件与插件改为 `ElFormDesigner`、`ElFormRenderer`、`ElFormGenPlugin`；无前缀别名已删除。
4. 渲染器 prop `fieldAccess` 改为 `fieldRuntimePolicy`。
5. 旧访问级别 `REQUIRED` 映射为 `{ accessLevel: 'EDITABLE', required: true }`。

## 后续 DX BPM 接入

本仓库本轮不修改 DX BPM。后续接入请严格按下列方式替换：

1. 宿主依赖改为 `el-form-gen`，不再安装 `@daxiangme/form-vue`。
2. 运行策略的键必须是表单字段 **ID**，不要用数据模型 `fieldPath`。需要先把 BPM 字段路径解析到 `DesignerField.id`。
3. 历史节点权限 `REQUIRED` 转换为 `{ accessLevel: 'EDITABLE', required: true }`。`HIDDEN` 与 `READ_ONLY` 保持原语义。
4. 通过 `createDxBpmFormAdapter` 注入传输端口；Token、租户和 Axios 生命周期仍由宿主负责。

## 高级扩展与内部架构

内部依赖固定为 `el-form-gen -> form-core` 且 `el-form-gen -> form-adapter -> form-core`：

- `@daxiangme/form-core` 是纯 TypeScript 文档、规则、诊断和运行端口深模块。
- `@daxiangme/form-adapter` 提供本地预览与 DX BPM 宿主适配工厂。

普通 Vue 应用始终从 `el-form-gen` 开始。当前版本支持 Vue 3、Element Plus 与现代 ESM 浏览器工程，不承诺 CommonJS、SSR 或其他 UI 框架。

## License

[MIT](./LICENSE) © 2026 daxiangme
