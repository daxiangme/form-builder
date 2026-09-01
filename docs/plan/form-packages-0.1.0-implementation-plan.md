# DX Form 0.1.0 实施计划

## 目标

- [x] 建立独立 pnpm、Git 和 NPM 发布工程。
- [x] 迁移 `DesignerDocument 1.0` 与全部纯 TypeScript 行为到 `form-core`。
- [x] 迁移设计器和运行渲染到 `form-vue`，移除 BPM 私有依赖。
- [x] 实现本地预览与 DX BPM Adapter，补齐文件资源端口。
- [x] 完成 Playground、静态质量、构建、浏览器和 tarball 验收。
- [ ] 以 `next` 发布三个 0.1.0 包，验证后提升为 `latest`。

## 范围与非目标

- [x] 保留 DX BPM 当前表单源码，只把它作为只读迁移来源。
- [x] 保持 `DesignerDocument 1.0` JSON 外形和导入导出兼容。
- [x] 首版仅支持 Vue 3、Element Plus 和现代 ESM。
- [x] 不在本批替换 DX BPM 依赖、路由或运行 Host。
- [x] 不新增、修改、生成或运行自动化测试代码。

## 实施顺序

- [x] 完成工程、包元数据、依赖方向和正式设计基线。
- [x] 完成 Core 类型、编解码、命令、表达式、验证、事件和 Adapter 端口。
- [x] 完成 Vue 设计器、运行 Host、弹层、子表、Icon 和主题去业务化。
- [x] 完成 Local 与 DX BPM Adapter、上传解析下载和能力诊断。
- [x] 完成 Playground 的设计、运行、模块、主题和本地文件交互。
- [x] 完成 Prettier、ESLint、Stylelint、边界扫描、类型检查和生产构建。
- [x] 完成多视口、深浅主题、圆角、拖放、预览和高级行为浏览器验收。
- [x] 完成三个 tarball 的 dry-run、临时消费工程安装和生产构建。
- [ ] 完成 NPM 身份与 scope 门禁、next 发布、latest 提升及发布后复验。

## 阻塞项

- [ ] 当前 NPM 会话未登录；正式发布前由用户在本机完成登录和二次验证。

## 已取得证据

- [x] `pnpm verify` 覆盖格式、ESLint、Stylelint、包边界、类型和四个生产构建。
- [x] 依赖边界扫描同时校验发布产物无宿主别名、旧主题变量和外部 Iconify 回退。
- [x] Playground 覆盖 1280、1440、1920、390 窄屏、深色、左右栏、模块外壳、高级规则和本地资产上传。
- [x] 浏览器 Console 无错误或警告，本地模式无外部或业务请求。
- [x] 三个 tarball 仅包含 `dist`、README、LICENSE 与必要包元数据。
- [x] 全新 Vue 3 + Element Plus 工程通过 NPM 安装三个 tarball，并完成类型检查和生产构建。
