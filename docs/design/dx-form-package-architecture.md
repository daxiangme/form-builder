# DX Form 包架构设计

## 模块与依赖

`form-core` 是纯 TypeScript 深模块；`form-vue` 和 `form-adapter` 只通过 Core 的稳定接口协作，彼此不依赖。宿主通过独立 Adapter 端口改变文件、数据源、远程验证、导航与业务动作行为。

依赖方向固定为 `form-vue -> form-core <- form-adapter`。`form-vue` 与 `form-adapter` 不直接交叉依赖，宿主在装配层把 Adapter 传入 Vue 组件。

## 公共组件契约

- `FormDesigner` 通过 `modelValue` 受控维护 `DesignerDocument`，发出文档更新、诊断、脏状态、保存请求和导出请求。
- `FormRenderer` 通过 `modelValue` 受控维护 `DesignerRuntimeValueStore`，发出值更新、提交投影、重置、动作和运行警告。
- 设计器的弹窗、抽屉、模块画布、高级行为、事件流和命令历史与运行渲染共用同一份 `DesignerDocument 1.0`。

## Schema 约束

`DesignerDocument 1.0` 只保存稳定、可序列化、可诊断的数据。接口地址、HTTP 方法、Token、函数、自由 CSS、任意组件属性与可执行脚本不得进入 Schema。

## 主题

Vue 包以 `.daxiang-form` 为样式命名空间，以 `--daxiang-form-*` 映射 Element Plus CSS Variables。深浅模式跟随宿主的 Element Plus `html.dark` 状态，不维护第二套主题状态。

设计器根节点占满宿主提供的容器高度；宿主只需为直接容器给出确定高度，不要求该容器必须是 Flex。所有 Remix Icon 必须由包内集合解析，未知图标在发布边界扫描中失败，运行时不得回退到公共 CDN。

## 文件资源

文件字段只保存稳定资源标识。上传、元数据解析和下载经 `FormAssetAdapter` 注入；字段移除只移除引用，物理生命周期由宿主和服务端治理。

DX BPM Adapter 只使用已验证的发布表单附件和 OCR 路径。当前项目未提供稳定运行协议的远程验证、数据源执行、目录和 Host 动作不生成占位请求，对应端口保持缺失并失败关闭。

## 发布边界

三个公开包锁步发布。公开 `package.json` 使用精确同版本依赖，pnpm workspace 只在本地把这些依赖链接到同仓包；tarball 和 Registry 中不得出现 `workspace:` 协议。发布顺序固定为 Core、Adapter、Vue，先进入 `next`，公开消费复验后再提升为 `latest`。

## 首发基线

2026-09-02 已公开发布 `@daxiangme/form-core`、`@daxiangme/form-adapter` 和 `@daxiangme/form-vue` 的 `0.1.0` 版本，`next` 与 `latest` 均指向该版本。公开消费工程使用 Vue 3、Element Plus、包内 Vue Plugin、运行值仓和本地 Adapter 完成类型检查与生产构建；后续三个包继续采用锁步版本，任何已发布内容变更均通过新版本交付，不覆盖或撤销历史版本。
