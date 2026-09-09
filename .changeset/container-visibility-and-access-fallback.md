---
'@daxiangme/form-core': minor
'@daxiangme/form-adapter': minor
'el-form-gen': minor
---

容器支持条件显隐，隐藏后内部字段不校验、不提交。字段权限彻底只有可编辑、只读、隐藏三个值，并新增 `fieldRuntimePolicyFallback`（默认隐藏）。破坏性变更：移除 `FormFieldRuntimePolicy.required`，旧 BPM `REQUIRED` 映射为 `EDITABLE`，必填改由设计文档控制。
