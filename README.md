# el-form-gen

> Visual Form Designer and Runtime Renderer for Vue 3 + Element Plus

`el-form-gen` 是面向 Vue 3 与 Element Plus 的开源可视化表单设计器与运行渲染器。**Form Gen** 表示设计与运行渲染，不表示代码生成。

普通 Vue 应用只安装和导入这一个包。内部模块 `@daxiangme/form-core` 与 `@daxiangme/form-adapter` 会作为传递依赖安装，无需单独导入。

## 功能一览

- 可嵌入的拖拽式表单设计器 `ElFormDesigner` 和运行渲染器 `ElFormRenderer`。
- 统一的 `DesignerDocument 2.0` 文档、严格编解码与诊断。
- 主表单、弹窗、抽屉、响应式栅格、行子表、块子表，以及嵌套关系与多对多。
- 状态条件、公式计算、字段联动、验证规则与声明式事件流。
- Element Plus 控件、浅色/深色主题和受控圆角样式。新建文档默认顶部左对齐；`THEME` 跟随宿主 `--el-border-radius-base`，自定义圆角为 0～32 的 4 的倍数 px，旧档位 `NONE` / `SMALL` / `BASE` / `LARGE` 解码为 0 / 4 / 8 / 12。
- 文件、数据源、远程验证、OCR、扫码、定位、导航、动态选项、日期范围、验证码、个人签名、地区级联与宿主动作 Adapter 端口。采集组件的设计配置、注入与取值见[采集组件](docs/guide/capture.md)。
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

全局注册名是 `ElFormDesigner` 与 `ElFormRenderer`。

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

顶栏左侧默认空白。需要标题、返回按钮等内容时，使用 `header-leading` 插槽；窄屏收纳设计器按钮时该插槽仍会保留。

```vue
<ElFormDesigner v-model="document" @save-request="handleSave">
  <template #header-leading="{ documentName, dirty }">
    <ElButton @click="goBack">返回</ElButton>
    <span>{{ documentName }}</span>
  </template>
</ElFormDesigner>
```

`header-leading` 是 `ElFormDesigner` 目前唯一的插槽。作用域参数 `documentName` 是当前文档名称，`dirty` 表示是否有未保存修改。

## 设计器组件目录

`ElFormDesigner` 的 `catalogs.components` 是组件可用性的唯一真源。把服务端三态原样写入即可，不要把 `CONDITIONAL` 猜成 `capabilities` 布尔值，也不要维护 `scan` 对 `scan-code` 这类对照表。

- `AVAILABLE`：设计态可选，不展示原因。
- `CONDITIONAL`：设计态可选，必须展示 `unavailableReason`；不阻止保存。运行期是否可用由 Adapter、权限或设备决定。
- `UNAVAILABLE`：设计态不可选；画布已有节点保留并告警。

传入非空 `components` 时，未列出的内置组件会变为 `UNAVAILABLE`。覆盖个别组件时，请先从内置目录复制其余项：

```ts
import {
  ElFormDesigner,
  resolveDesignerCatalogComponents,
  type FormDesignerCatalogs,
} from 'el-form-gen'

const catalogs: FormDesignerCatalogs = {
  components: resolveDesignerCatalogComponents().components.map((item) =>
    item.componentType === 'scan-code'
      ? {
          componentType: 'scan-code',
          availability: 'CONDITIONAL',
          unavailableReason: '需要 BarcodeDetector 支持',
        }
      : {
          componentType: item.componentType,
          availability: item.availability,
          unavailableReason: item.unavailableReason || undefined,
        },
  ),
}
```

`catalogs.capabilities` 已废弃：重叠键仅为兼容收紧（`false` 仍会收成 `CONDITIONAL` 并覆盖原因）；`remoteValidation`、`dataSource`、`dateRange` 不会影响组件目录，请改用 `adapters`。

## 渲染表单

推荐用 `createDesignerRuntimeSession` 创建运行会话，再交给 `ElFormRenderer`。会话持有文档、值、模式和权限；保存走 `@submission` 回执，`@submit` 只表示前端投影，不代表持久化成功。

```vue
<script setup lang="ts">
import { onBeforeUnmount } from 'vue'
import {
  ElFormRenderer,
  createDemoDesignerDocument,
  createDesignerRuntimeSession,
  type DesignerSaveReceipt,
  type DesignerSubmissionBatch,
} from 'el-form-gen'

const document = createDemoDesignerDocument('purchase-application')
const session = createDesignerRuntimeSession({
  document,
  mode: 'CREATE',
})

async function save(batch: DesignerSubmissionBatch): Promise<void> {
  const receipt: DesignerSaveReceipt = await saveAtomicBatch(batch)
  session.applyReceipt(receipt)
}

onBeforeUnmount(() => {
  session.dispose()
})
</script>

<template>
  <ElFormRenderer :session="session" show-toolbar @submission="save" />
</template>
```

`saveAtomicBatch` 是宿主自己的保存逻辑，不是组件库导出函数。没有初始值的 `CREATE` 会创建新根行；`EDIT` / `READ_ONLY` / `DETAIL` 需要宿主提供初始身份和版本。卸载 Renderer 不会销毁会话，宿主不再使用时再调用 `session.dispose()`。

没有嵌套关系、多对多或共享目标时，仍可用 `document` + `v-model` 渲染独立表单：

```vue
<ElFormRenderer v-model="value" :document="document" mode="CREATE" @submit="handleSubmit" />
```

嵌套关系、多对多选择和共享目标必须走会话入口。会话统一处理逐行权限、祖先上下文、隔离草稿、显式差量和原子保存回执。完整 API 与保存示例见[关系接入文档](docs/relations.md)。

## 三态字段权限

运行策略以字段 **ID** 为键。设计文档不保存权限；设计器与运行渲染器分离，宿主把三态访问级别作为第二份输入传给运行组件。

未传 `fieldRuntimePolicy` 时，渲染器按独立表单 Schema 工作：文档必填、条件规则、公式只读和运行模式继续生效，字段默认可编辑。

一旦传入策略对象（包括 `{}`）：

- 键缺失走 `fieldRuntimePolicyFallback`，默认 `HIDDEN`（不渲染、不校验、不提交）。只传关心的字段时须显式设为 `EDITABLE`，此时未列出字段按文档可编辑并继承 `required`。
- 非法 `accessLevel` 仍按 `HIDDEN` 失败关闭，不会被 fallback 放宽。
- 权限只能收紧：设计时隐藏或只读的字段，运行时传入 `EDITABLE` 无效。
- 宿主 `required: true` 只能加严必填；`false` 与缺省均忽略。隐藏或只读时仍自动取消必填。

| 访问级别    | 渲染     | 校验               | 用户提交   | 输入 / 附件 / 子表 / 事件写入 |
| ----------- | -------- | ------------------ | ---------- | ----------------------------- |
| `HIDDEN`    | 不渲染   | 不校验             | 不提交     | 拒绝                          |
| `READ_ONLY` | 详情内容 | 不校验             | 不提交     | 拒绝                          |
| `EDITABLE`  | 正常     | 设计文档必填与规则 | 按提交策略 | 允许                          |

整表运行模式 `READ_ONLY` 仍保留表单布局，但去掉上传、扫码、签名、选点等操作按钮；普通字段显示为禁用控件，也可在设计器「只读展示」中改为纯文本。整表 `DETAIL` 是详情页。新增或编辑下某个字段宿主权限为 `READ_ONLY` 时，仅该字段按详情内容展示。

必填来自表单设计，也可由宿主 `required: true` 加严。隐藏或只读字段自动不必填。文档里的条件规则 `target: 'REQUIRED'` 仍然属于 Schema。同一字段在可编辑 / 只读 / 隐藏下的红星、校验、提交以及 `session.updateRuntimePolicy` 示例见[关系接入文档的权限投影](docs/relations.md#权限投影)。

公式（`FORMULA`）可以刷新只读字段的展示值，但不能放宽宿主权限。联动（`LINKAGE`）和事件流写入必须遵守 `HIDDEN` / `READ_ONLY`。文档 `display.readonly` 仍可进入提交；宿主 `READ_ONLY` 不会进入用户提交。

```ts
const fieldRuntimePolicy: FormFieldRuntimePolicyMap = {
  [titleFieldId]: { accessLevel: 'EDITABLE' },
  [amountFieldId]: { accessLevel: 'EDITABLE', required: true },
  [secretFieldId]: { accessLevel: 'HIDDEN' },
}

session.updateRuntimePolicy({ fieldRuntimePolicy })
```

切换权限时调用 `session.updateRuntimePolicy`，不要重建会话。

## 模块化表单

除主表单外，同一份文档还能设计弹窗与抽屉。模块拥有独立布局、数据草稿和运行外壳，可由声明式事件流打开。

![弹窗与抽屉模块设计](https://raw.githubusercontent.com/daxiangme/form-builder/v0.1.1/docs/assets/screenshots/overlay-module-designer.png)

## 字段规则与事件流

字段高级配置集中管理状态条件、公式与联动、验证规则、提交策略和组件事件。分组、标签页和子表等容器可配置条件显隐；隐藏容器内的字段自动视为不可见，因此不校验、不提交。单个标签页的显隐尚未支持。规则在保存前经过诊断，事件使用可视化步骤与条件分支表达，不在 Schema 中保存自由 JavaScript。

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

OCR、定位、扫码和签名只在 Schema 里声明映射与输出字段，接口与凭据由宿主 Adapter 注入。设计配置、端口签名、提交值形态和 DX BPM `extras` 见[采集组件](docs/guide/capture.md)。

本地预览工厂从主包导入：

```ts
import { createLocalPreviewFormAdapter, type FormRuntimeAdapters } from 'el-form-gen'

const { adapters, dispose } = createLocalPreviewFormAdapter()
```

生产环境由宿主实现 `FormRuntimeAdapters` 的相应端口，并在创建会话时注入。传输生命周期由宿主负责，不要把 Token、URL 或回调写入表单文档。

## 文档工具

主包同时导出常用 Core 门面，无需额外安装或导入其他包：

```ts
import {
  createEmptyDesignerDocument,
  decodeDesignerDocument,
  diagnoseDesignerDocument,
  resolveDesignerCatalogComponents,
  serializeDesignerDocument,
  type DesignerDocument,
  type FormDesignerCatalogs,
  type FormRuntimeAdapters,
} from 'el-form-gen'
```

## 高级扩展与内部架构

内部依赖固定为 `el-form-gen -> form-core` 且 `el-form-gen -> form-adapter -> form-core`：

- `@daxiangme/form-core` 是纯 TypeScript 文档、规则、诊断和运行端口深模块。
- `@daxiangme/form-adapter` 提供本地预览与宿主适配工厂。

普通 Vue 应用始终从 `el-form-gen` 开始。当前版本支持 Vue 3、Element Plus 与现代 ESM 浏览器工程，不承诺 CommonJS、SSR 或其他 UI 框架。

## License

[MIT](./LICENSE) © 2026 daxiangme
