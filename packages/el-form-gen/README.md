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

## 设计器插槽

`ElFormDesigner` 目前只有一个插槽：`header-leading`，位于顶栏最左侧。

默认不渲染文档标题或返回按钮。宿主不传时左侧为空白；传入后无论顶栏如何收纳预览、保存等内置按钮，这块区域都会保留，适合放返回、页面标题或宿主自己的操作。

作用域参数：

- `documentName`：当前设计文档名称。
- `dirty`：是否有未保存修改。

```vue
<ElFormDesigner v-model="document" @save-request="handleSave">
  <template #header-leading="{ documentName, dirty }">
    <ElButton @click="goBack">返回</ElButton>
    <span>{{ documentName }}</span>
  </template>
</ElFormDesigner>
```

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

推荐用 `createDesignerRuntimeSession` 创建运行会话，再交给 `ElFormRenderer`。会话持有文档、值、模式和权限；保存走 `@submission` 回执。

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

`saveAtomicBatch` 是宿主自己的保存逻辑。没有嵌套关系时，仍可用 `document` + `v-model`：

```vue
<ElFormRenderer v-model="value" :document="document" mode="CREATE" @submit="handleSubmit" />
```

嵌套关系、多对多和共享目标必须走会话入口。完整 API 与保存示例见[关系接入文档](https://github.com/daxiangme/form-builder/blob/main/docs/relations.md)。

## 三态字段权限

运行策略以字段 ID 为键。设计文档不保存权限；`ElFormDesigner` 与 `ElFormRenderer` 分离，宿主把 `{ accessLevel: 'EDITABLE' | 'READ_ONLY' | 'HIDDEN' }` 作为第二份输入传给运行组件。

未传 `fieldRuntimePolicy` 时按独立表单 Schema 工作，全部字段默认可编辑，再由设计时的隐藏、只读、必填和条件规则收紧。

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

整表运行模式 `READ_ONLY` 仍保留表单布局，但去掉上传、扫码、签名、选点等操作按钮；普通字段显示为禁用控件，也可在设计器「只读展示」中改为纯文本。整表 `DETAIL` 是详情页。新增或编辑下某个字段宿主权限为 `READ_ONLY` 时，仅该字段按详情内容展示，不受「只读展示」影响。

必填来自表单设计，也可由宿主 `required: true` 加严。隐藏或只读字段自动不必填。同一字段在可编辑 / 只读 / 隐藏下的对照表与 `session.updateRuntimePolicy` 示例见[关系接入文档的权限投影](https://github.com/daxiangme/form-builder/blob/main/docs/relations.md#权限投影)。

公式可以刷新只读展示，但不能放宽宿主权限。

```ts
const fieldRuntimePolicy: FormFieldRuntimePolicyMap = {
  [titleFieldId]: { accessLevel: 'EDITABLE' },
  [amountFieldId]: { accessLevel: 'EDITABLE', required: true },
  [secretFieldId]: { accessLevel: 'HIDDEN' },
}

session.updateRuntimePolicy({ fieldRuntimePolicy })
```

切换权限时调用 `session.updateRuntimePolicy`，不要重建会话。

## 模块、规则与事件

主表单、弹窗与抽屉共用同一份 `documentVersion: '2.0'` 设计文档。字段高级配置集中管理状态条件、公式与联动、验证规则、提交策略和组件事件；分组、标签页和子表等容器可配置条件显隐。隐藏容器内的字段自动视为不可见，因此不校验、不提交。单个标签页的显隐尚未支持。事件使用可视化步骤与条件分支表达。

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

主包同时导出文档门面、运行类型以及本地预览工厂：

```ts
import {
  createEmptyDesignerDocument,
  createLocalPreviewFormAdapter,
  decodeDesignerDocument,
  diagnoseDesignerDocument,
  serializeDesignerDocument,
  type DesignerDocument,
  type FormRuntimeAdapters,
} from 'el-form-gen'

const { adapters, dispose } = createLocalPreviewFormAdapter()
```

生产环境由宿主实现 `FormRuntimeAdapters`，并在创建会话时注入。不要把 Token、URL 或回调写入表单文档。OCR、定位、扫码与签名的配置、注入和提交值见[采集组件](../../docs/guide/capture.md)。可选的高德定位工厂：

```ts
import { createAmapLocationAdapter } from 'el-form-gen'

const location = createAmapLocationAdapter({ key: hostAmapKey })
```

## 高级扩展与内部架构

内部依赖固定为 `el-form-gen -> form-core` 且 `el-form-gen -> form-adapter -> form-core`。纯 TypeScript 文档内核和宿主适配工厂继续以 `@daxiangme/form-core` 与 `@daxiangme/form-adapter` 作为传递依赖发布；普通 Vue 应用无需单独安装它们。

当前版本支持 Vue 3、Element Plus 与现代 ESM 浏览器工程，不承诺 CommonJS、SSR 或其他 UI 框架。

## License

[MIT](https://github.com/daxiangme/form-builder/blob/v0.1.1/LICENSE) © 2026 daxiangme
