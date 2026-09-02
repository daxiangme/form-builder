# Form Builder

> Visual Form Designer and Schema-Driven Renderer for Vue 3 + Element Plus

Form Builder 是面向 Vue 3 与 Element Plus 的开源可视化低代码表单设计器。它提供拖拽式设计工作台、Schema 驱动运行渲染、验证与公式联动、事件流、弹窗与抽屉模块，以及由宿主注入的文件上传和业务能力。

## 特性

- 可嵌入的拖拽式表单设计器和运行渲染器。
- 统一的 `DesignerDocument 1.0` 表单文档与严格诊断。
- 状态条件、公式计算、字段联动、验证规则和事件流。
- 主表单、弹窗、抽屉、行子表和块子表布局。
- 文件上传、数据源、远程验证和宿主动作 Adapter 端口。
- Vue 3、TypeScript、Element Plus 深浅主题与受控圆角。
- 现代 ESM、类型声明和独立 CSS 发布产物。

## Packages

| Package                                                                            | Description                                    |
| ---------------------------------------------------------------------------------- | ---------------------------------------------- |
| [`@daxiangme/form-core`](https://www.npmjs.com/package/@daxiangme/form-core)       | 表单文档、布局、规则、诊断、事件流与运行端口。 |
| [`@daxiangme/form-vue`](https://www.npmjs.com/package/@daxiangme/form-vue)         | Vue 3 + Element Plus 设计器与运行渲染器。      |
| [`@daxiangme/form-adapter`](https://www.npmjs.com/package/@daxiangme/form-adapter) | 本地预览与宿主系统适配实现。                   |

当前版本只支持 Vue 3、Element Plus 与现代 ESM 浏览器工程，不承诺 CommonJS、SSR 或其他 UI 框架。

## 安装

```bash
pnpm add @daxiangme/form-core @daxiangme/form-vue @daxiangme/form-adapter vue element-plus
```

样式应按以下顺序引入：

```ts
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import '@daxiangme/form-vue/style.css'
```

## Vue Plugin

```ts
import { createApp } from 'vue'
import ElementPlus from 'element-plus'
import { DaxiangFormVue } from '@daxiangme/form-vue'

import App from './App.vue'

createApp(App).use(ElementPlus).use(DaxiangFormVue).mount('#app')
```

`FormDesigner` 使用受控 `modelValue` 维护表单文档；`FormRenderer` 使用受控运行值仓渲染表单。上传、目录、OCR、扫码、定位、导航和业务动作都通过 Adapter 显式注入，组件不会在 Schema 中保存接口地址、Token 或可执行脚本。

## 本地开发

```bash
corepack enable
pnpm install
pnpm verify
pnpm --filter @daxiangme/form-playground dev
```

Playground 不使用 Mock 服务。本地 Adapter 的文件、目录、扫码与定位能力都在当前浏览器会话内运行。

## License

[MIT](./LICENSE) © 2026 daxiangme
