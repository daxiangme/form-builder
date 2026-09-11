---
title: 采集组件
description: OCR、定位、扫码与签名的设计配置、宿主 Adapter 注入与字段值保存约定。
outline: deep
---

# 采集组件

OCR、定位、扫码和签名用来从设备或外部服务取数，再写入表单。设计器只保存「用不用、怎么映射」；识别接口、地图 Key、扫码外壳和上传鉴权全部由宿主通过 Adapter 注入。

本文面向接入 `el-form-gen` 的 Vue 宿主，可直接作为后续 VitePress 文档站点的一页。权限投影与关系保存见[关系表单宿主接入](../relations.md)。

## 职责划分

| 谁            | 保存什么                                            | 不保存什么                 |
| ------------- | --------------------------------------------------- | -------------------------- |
| 设计文档      | 识别类型、输出字段、回填映射、签名存储方式          | URL、Token、回调、地图 Key |
| 宿主 Adapter  | 请求实现、Key、设备外壳                             | 表单字段结构               |
| 运行值 / 提交 | 识别结果、定位 VO、扫码字符串、签名数据或 `assetId` | 业务接口地址               |

属性面板右侧的接入提示（`hostSetupHint`）只提醒宿主该注入哪个端口，不会写进 Schema。缺少对应 Adapter 时，控件仍显示静态外观，真实动作失败关闭。

## 接入总览

普通应用只从 `el-form-gen` 导入。本地预览可直接使用包内工厂；生产环境实现同一套端口。

```ts
import {
  createLocalPreviewFormAdapter,
  createAmapLocationAdapter,
  type FormRuntimeAdapters,
} from 'el-form-gen'

const { adapters, dispose } = createLocalPreviewFormAdapter()
```

```vue
<ElFormDesigner
  v-model="document"
  :adapters="adapters"
  :adapter-context="adapterContext"
  @save-request="handleSave"
/>

<ElFormRenderer
  v-model="value"
  :document="document"
  :adapters="adapters"
  :adapter-context="adapterContext"
  @submit="handleSubmit"
/>
```

走关系会话时，Adapter 在创建会话时注入，不要再传给 `ElFormRenderer`：

```ts
const session = createDesignerRuntimeSession({
  document,
  mode: 'CREATE',
  adapters,
  adapterContext,
})
```

设计器「保存」发出的是 `DesignerDocument`，由宿主自己持久化。采集结果不走第二套通道，和普通字段一起进入 `v-model` 或会话提交。

## 设计态怎么配

1. 从组件库拖入 OCR、定位、扫码或手写签名。
2. 在画布上选中字段，右侧配置输出字段、回填映射、存储方式等。
3. 把识别结果、地址等要回填的目标字段一并放到同一实体（通常是主表）。
4. 保存文档。检查诊断：映射目标不存在、跨实体、`sourceKey` 未声明会报错。

扫码、OCR、定位在目录里默认是「需接入业务能力」。这只表示静态内核不会自己调摄像头或识别服务，不阻止保存。运行期是否可用由 Adapter 决定。

## OCR

识别接口由 `adapters.ocr.recognize` 一步完成。宿主在自己的实现里持有 URL 与鉴权；`recognitionType` 只是设计态提示，允许自定义值。

### 设计配置

| 配置                           | 作用                                                               |
| ------------------------------ | ------------------------------------------------------------------ |
| `recognitionType`              | 通用文字 / 身份证 / 银行卡 / 营业执照 / 发票，或宿主约定的自定义值 |
| `resultKeys`                   | 手动声明接口返回键，例如 `{ key: 'name', name: '姓名' }`           |
| `fieldMappings`                | `{ sourceKey, targetFieldId }`，把识别结果写到其他字段             |
| `retainOriginal`               | 为真时额外调用 `adapters.asset.upload`，结果里带 `originalAssetId` |
| `allowResultEditing`           | 是否允许填报人改识别 JSON                                          |
| `confirmOverwriteOnAssignment` | 目标字段已有不同值时是否弹出覆盖确认，默认开启                     |

### 宿主实现

```ts
const adapters: FormRuntimeAdapters = {
  ocr: {
    async recognize({ file, fieldCode, context }) {
      return hostRecognizeInvoice(file, { fieldCode, recordToken: context.recordToken })
    },
  },
  asset: hostAssetAdapter, // retainOriginal 为真时需要
}
```

`recognize` 返回普通对象即可，例如 `{ name: '张三', amount: '128.50' }`。组件按 `fieldMappings` 做受控回填；本字段保存完整识别结果。

## 定位

定位值是固定结构 `FormLocationValue`，坐标系固定 `GCJ02`，并作为自描述字段写出。Adapter 返回完整 VO，组件按 `outputFields` 裁剪后写入本字段，再按 `fieldMappings` 回填其它字段。

```ts
interface FormLocationValue {
  longitude: number
  latitude: number
  coordinateSystem: 'GCJ02'
  address?: string
  name?: string
  province?: string
  city?: string
  district?: string
  township?: string
  streetAddress?: string
  adcode?: string
  adcodePath?: string[]
  source?: 'CURRENT' | 'PICK'
  collectedAt?: string
  provider?: string
  accuracyMeters?: number
}
```

定位控件是只读输入框，回显地址；后缀按钮为「地图选点」，点击后打开选点弹窗。弹窗由渲染层提供外壳：顶部地址框与「搜索地点」、中间地图画布、底部取消/确认。弹窗默认宽度为视口的 60%，可在右侧「选点弹窗宽度」里改。弹窗外壳圆角默认 16px，并跟随表单「控件圆角 / 全局圆角」：自定义像素时与控件一致，跟随系统时仍为 16px。地图 SDK 挂到画布节点上，走 `adapters.location.bindPicker`；未实现该方法时回退到宿主自己的 `pick` 界面。未开启选点时，后缀改为「获取位置」并调用 `locate`。

新建字段默认勾选：经度、纬度、地址、省、市、区，以及 `provider`、`collectedAt`、`source`。只勾经度或纬度之一、输出与映射同时为空，诊断会报错。`adcodePath` 可映射到地区字段，`province` 等映射到文本字段。

### 设计配置

| 配置                             | 作用                                                       |
| -------------------------------- | ---------------------------------------------------------- |
| `mapProvider`                    | 声明高德 / 腾讯 / 百度，不保存 Key                         |
| `allowManualPick`                | 后缀显示「地图选点」并打开选点弹窗；关闭后改为获取当前位置 |
| `pickerDialogWidth`              | 选点弹窗相对视口宽度，默认 60%，可在右侧输入 30–100        |
| 弹窗外壳圆角                     | 默认 16px，跟随表单控件圆角 / playground 全局圆角          |
| `showCoordinates`                | 没有地址时是否在输入框回退显示经纬度                       |
| `defaultCenter`                  | 选点默认中心，格式 `经度,纬度`                             |
| `enableHighAccuracy` / `timeout` | 传给 `locate`                                              |
| `outputFields`                   | 写入本字段的 VO 键                                         |
| `fieldMappings`                  | 回填到其他字段                                             |
| `confirmOverwriteOnAssignment`   | 回填覆盖确认，默认开启                                     |

### 宿主实现

需要真实地图时，Key 由调用方传入。包内高德工厂通过动态脚本加载 SDK，不增加 npm 依赖：

```ts
import { createAmapLocationAdapter } from 'el-form-gen'

const adapters: FormRuntimeAdapters = {
  location: createAmapLocationAdapter({
    key: hostAmapKey,
    securityJsCode: hostAmapSecurityJsCode, // 可选
  }),
}
```

自己实现时：

```ts
import type { FormRuntimeAdapters } from 'el-form-gen'

const adapters: FormRuntimeAdapters = {
  location: {
    async locate({ enableHighAccuracy, timeoutMilliseconds, context }) {
      return hostLocate({ enableHighAccuracy, timeoutMilliseconds, context })
    },
    async bindPicker({ canvas, initial, defaultCenter, onChange, context }) {
      return hostBindMapCanvas({ canvas, initial, defaultCenter, onChange, context })
    },
    async pick({ initial, defaultCenter, requestedFields, context }) {
      const picked = await hostOpenMapPicker({ initial, defaultCenter, requestedFields, context })
      return picked // 用户取消时返回 undefined；已实现 bindPicker 时 Vue 不会走这里
    },
  },
}
```

浏览器定位若是 WGS84，Adapter 内换算成 GCJ02 后再返回。

## 扫码

扫码值是字符串。值改造继续走字段上的 `valueRules`，不引入全局方法表。

### 设计配置

| 配置                                     | 作用                                             |
| ---------------------------------------- | ------------------------------------------------ |
| `formats`                                | 条码格式多选，传给 `scan`                        |
| `scanParameterFieldId`                   | 同实体另一字段，运行时取其当前值作为 `parameter` |
| `allowManualInput` / `allowModification` | 是否允许手工输入或改结果                         |

### 宿主实现

```ts
const adapters: FormRuntimeAdapters = {
  scan: {
    readiness: () => ({ ready: true }),
    subscribeReadiness(listener) {
      listener({ ready: true })
      return () => undefined
    },
    async scan({ fieldCode, formats, parameter, context }) {
      const text = await hostScan({ fieldCode, formats, parameter, context })
      return { text }
    },
  },
}
```

未实现 `readiness` 时视为就绪，保持向后兼容。未就绪时按钮禁用，并把 `unreadyReason` 展示给填报人。

## 签名与文件

手写签名在表单上只回显已确认的图片：未签时显示「点击签名」，已签后显示签名图，可「重签」或「清除」。点击后打开弹窗手写，确认才写入字段；取消不改原值。设计态同样展示该回显面，但不打开弹窗。

默认 `storageMode: 'INLINE_BASE64'`，字段值是 `data:image/png;base64,...`。切换为 `ASSET` 后，确认时才把画布转成文件并调用 `adapters.asset.upload`，字段值改为 `assetId`；详情回显通过 `asset.resolve` 的 `downloadUrl`。缺少资产端口时，文件模式会禁用并提示。

审批意见里的签名走同一套弹窗，仍只保存内联图片，不走资产上传。复用个人签名需要 `adapters.personalSignature`，入口在弹窗内，确认后才写入字段。

文件字段本身只持久化 `assetId` 列表，上传、解析、下载全部经 `adapters.asset`。

## 受控回填

OCR 与定位共用一套 `{ sourceKey, targetFieldId }` 映射，运行期写入规则：

- 目标 `accessLevel` 不是 `EDITABLE`：跳过，产生运行问题。
- 目标带 `FORMULA` 值规则：跳过。
- 目标已有且不同值：默认走 `adapters.linkageConfirmation.confirmOverwrite`；可在字段上关闭 `confirmOverwriteOnAssignment`。

未提供确认 Adapter 时，本地预览会使用浏览器 `confirm`。

## 表达式子属性

表达式的字段节点可带一级 `valueKey`。定位、审批意见使用静态键集合；OCR 使用该字段自己的 `resultKeys`。文件和签名的值不是对象，配置了 `valueKey` 会诊断为错误。依赖收集仍按 `fieldId`，不按子属性拆分。

## 运行期宿主必填

`fieldRuntimePolicy` 可带 `required: true`，只能加严文档必填；`false` 与缺省都忽略。隐藏或只读时仍自动取消必填。BPM 的 `permission='b'` 应对应 `{ accessLevel: 'EDITABLE', required: true }`。完整权限表见[关系接入文档的权限投影](../relations.md#权限投影)。

## 提交里的值

采集结果与其它字段一起出现在运行值仓里，键是字段 ID。

| 组件         | 字段值                                                |
| ------------ | ----------------------------------------------------- |
| OCR          | 识别结果对象；保留原图时含 `originalAssetId`          |
| 定位         | 裁剪后的 `FormLocationValue`（含 `coordinateSystem`） |
| 扫码         | 字符串                                                |
| 签名（内联） | 图片 Data URL                                         |
| 签名（文件） | `assetId` 字符串                                      |
| 映射目标     | 被回填后的文本、金额或地区值                          |

定位值结构从自由对象变为固定 VO，属于破坏性变更。消费方应按 `FormLocationValue` 读数，不要再假设只有经纬度两个键。

## DX BPM

`createDxBpmFormAdapter` 已包含附件上传和 OCR 的 HTTP 路径。扫码与定位没有包内默认实现，通过 `extras` 注入；缺少端口时对应控件失败关闭。

```ts
import { createAmapLocationAdapter, createDxBpmFormAdapter } from 'el-form-gen'

const adapters = createDxBpmFormAdapter({
  transport,
  context,
  extras: {
    location: createAmapLocationAdapter({ key: hostAmapKey }),
    scan: hostScanAdapter,
  },
})
```

## Playground

仓库 `playground/element-plus-vue3` 可对照：

- 内联签名、文件签名，以及「意见+签名」审批意见；点击后弹窗手写，确认才回显
- 地图选点，并把地址、省市区回填到其它字段
- 票据识别回填姓名和金额
- 「扫码未就绪」场景禁用扫码按钮

本地预览 OCR 会返回演示数据（姓名张三、金额 128.50）；选点在浏览器里用输入框模拟坐标。卸载 Playground 时调用 `dispose()`，释放本地 Object URL。
