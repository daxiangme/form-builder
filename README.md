# DX Form

DX Form 是面向 Vue 3 与 Element Plus 的声明式表单设计、运行和宿主适配组件集合。

## Packages

- `@daxiangme/form-core`：表单文档、布局、规则、诊断、事件与运行端口。
- `@daxiangme/form-vue`：Vue 3 + Element Plus 设计器与运行渲染器。
- `@daxiangme/form-adapter`：本地预览与 DX BPM 宿主适配实现。

当前首发版本只支持现代 ESM 浏览器工程，不承诺 CommonJS、SSR 或其他 UI 框架。

## 开发

```bash
corepack enable
pnpm install
pnpm verify
pnpm --filter @daxiangme/form-playground dev
```

Playground 不使用 Mock 服务；本地 Adapter 的文件、目录、扫码与定位能力都在当前浏览器会话内运行。
