# DX Form Agent 指南

- 本仓库维护 `@daxiangme/form-core`、`@daxiangme/form-adapter` 与对外主包 `el-form-gen`。
- Core 不得依赖 Vue、Element Plus、HTTP、Router、Pinia 或任何业务工程类型。
- Vue 主包 `el-form-gen` 只负责 Vue 3 + Element Plus 的设计与运行渲染，不得解释业务接口。
- Adapter 包通过 Core 定义的细粒度端口连接宿主能力，不得把 Token、URL 或回调写入表单 Schema。
- 导出的函数、类型和 Vue 组件公共属性必须具有准确的中文 TSDoc。
- 样式必须位于 `.daxiang-form` 命名空间，并优先消费 Element Plus CSS Variables。
- 不新增、修改、生成或运行自动化测试代码；使用格式、Lint、类型检查、生产构建、浏览器人工验收和 tarball 消费构建作为质量门禁。
