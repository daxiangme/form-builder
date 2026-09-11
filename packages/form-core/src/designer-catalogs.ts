import { DESIGNER_COMPONENTS } from './component-registry'
import type {
  DesignerComponentRegistration,
  DesignerDiagnostic,
  FormDesignerCatalogs,
  FormDesignerComponentCatalogItem,
  FormDesignerHostCapabilities,
} from './types'

/** 应用设计资源目录后的组件列表与诊断。 */
export interface DesignerCatalogResolution {
  components: DesignerComponentRegistration[]
  diagnostics: DesignerDiagnostic[]
}

const DEPRECATED_COMPONENT_CAPABILITIES: Array<{
  key: keyof FormDesignerHostCapabilities
  componentTypes: string[]
  reason: string
}> = [
  { key: 'upload', componentTypes: ['file'], reason: '当前宿主未提供上传能力' },
  { key: 'ocr', componentTypes: ['ocr'], reason: '当前宿主未提供 OCR 能力' },
  {
    key: 'scan',
    componentTypes: ['scan-code'],
    reason: '当前宿主未提供扫码能力',
  },
  {
    key: 'location',
    componentTypes: ['position'],
    reason: '当前宿主未提供定位能力',
  },
  {
    key: 'dynamicOptions',
    componentTypes: ['dynamic-select', 'dynamic-cascade'],
    reason: '当前宿主未提供动态选项能力',
  },
  {
    key: 'challenge',
    componentTypes: ['captcha'],
    reason: '当前宿主未提供验证码渠道',
  },
  {
    key: 'personalSignature',
    componentTypes: ['signature'],
    reason: '当前宿主未提供个人签名能力',
  },
  {
    key: 'regionCascade',
    componentTypes: ['region'],
    reason: '当前宿主未提供地区级联能力',
  },
  {
    key: 'directory',
    componentTypes: ['user', 'role', 'organization', 'post'],
    reason: '当前宿主未提供目录查询能力',
  },
]

const DEPRECATED_ADAPTER_CAPABILITIES: Array<{
  key: keyof FormDesignerHostCapabilities
  adapter: string
}> = [
  { key: 'remoteValidation', adapter: 'remoteValidation' },
  { key: 'dataSource', adapter: 'dataSource' },
  { key: 'dateRange', adapter: 'dateRange' },
]

/**
 * 将宿主目录与内置注册表求交集。
 *
 * 组件可用性只认 `catalogs.components` 三态。未知组件类型只产生诊断，不会动态注册或执行。
 * 未提供组件目录时保留内置注册表。`capabilities` 已废弃：`false` 仍会把对应组件收成 `CONDITIONAL` 并覆盖原因。
 *
 * @param catalogs 宿主加载的纯数据目录
 * @returns 可展示的内置组件副本和失败关闭诊断
 */
export function resolveDesignerCatalogComponents(
  catalogs?: FormDesignerCatalogs,
): DesignerCatalogResolution {
  const diagnostics: DesignerDiagnostic[] = []
  const catalogItems = catalogs?.components
  const byType = new Map(DESIGNER_COMPONENTS.map((item) => [item.componentType, item]))
  const resolved = new Map<string, DesignerComponentRegistration>()

  if (catalogItems?.length) {
    applyExplicitComponentCatalog(catalogItems, byType, resolved, diagnostics)
  } else {
    for (const item of DESIGNER_COMPONENTS) {
      resolved.set(item.componentType, { ...item })
    }
  }

  diagnoseDeprecatedCapabilities(catalogs, diagnostics)
  applyCapabilityOverrides(catalogs, resolved)
  return {
    components: DESIGNER_COMPONENTS.map(
      (item) =>
        resolved.get(item.componentType) ?? {
          ...item,
          availability: 'UNAVAILABLE',
          unavailableReason: item.unavailableReason || '当前目录未开放此组件',
        },
    ),
    diagnostics,
  }
}

/**
 * 按稳定组件编码读取目录解析后的注册项。
 *
 * 未传入目录时与内置注册表一致。未知编码返回 `undefined`，不会动态注册。
 *
 * @param componentType 内置组件编码
 * @param catalogs 宿主加载的纯数据目录
 * @returns 解析后的组件副本；未注册时为空
 */
export function findDesignerCatalogComponent(
  componentType: string,
  catalogs?: FormDesignerCatalogs,
): DesignerComponentRegistration | undefined {
  return resolveDesignerCatalogComponents(catalogs).components.find(
    (item) => item.componentType === componentType,
  )
}

/**
 * 只接受与内置注册表相交的组件覆盖，未知类型失败关闭。
 *
 * @param catalogItems 宿主声明的组件覆盖
 * @param byType 内置注册表
 * @param resolved 输出副本
 * @param diagnostics 未知类型诊断
 */
function applyExplicitComponentCatalog(
  catalogItems: FormDesignerComponentCatalogItem[],
  byType: Map<string, DesignerComponentRegistration>,
  resolved: Map<string, DesignerComponentRegistration>,
  diagnostics: DesignerDiagnostic[],
): void {
  for (const item of catalogItems) {
    const registration = byType.get(item.componentType)
    if (!registration) {
      diagnostics.push({
        severity: 'ERROR',
        code: 'CATALOG_UNKNOWN_COMPONENT',
        message: `目录声明了未知组件类型 ${item.componentType}，已失败关闭且不会动态执行`,
        path: `$.catalogs.components.${item.componentType}`,
      })
      continue
    }
    resolved.set(item.componentType, {
      ...registration,
      availability: item.availability,
      unavailableReason: item.unavailableReason ?? registration.unavailableReason,
    })
  }
  for (const item of DESIGNER_COMPONENTS) {
    if (resolved.has(item.componentType)) continue
    resolved.set(item.componentType, {
      ...item,
      availability: 'UNAVAILABLE',
      unavailableReason: '当前目录未开放此组件',
    })
  }
}

/**
 * 对仍传入的历史能力开关发出废弃诊断。
 *
 * @param catalogs 宿主目录
 * @param diagnostics 输出诊断
 */
function diagnoseDeprecatedCapabilities(
  catalogs: FormDesignerCatalogs | undefined,
  diagnostics: DesignerDiagnostic[],
): void {
  const capabilities = catalogs?.capabilities
  if (!capabilities) return
  for (const target of DEPRECATED_COMPONENT_CAPABILITIES) {
    if (!Object.hasOwn(capabilities, target.key)) continue
    diagnostics.push({
      severity: 'WARNING',
      code: 'CATALOG_DEPRECATED_CAPABILITY',
      message: `capabilities.${target.key} 已废弃，请改用 catalogs.components 中 ${target.componentTypes.join('、')} 的三态`,
      path: `$.catalogs.capabilities.${target.key}`,
    })
  }
  for (const target of DEPRECATED_ADAPTER_CAPABILITIES) {
    if (!Object.hasOwn(capabilities, target.key)) continue
    diagnostics.push({
      severity: 'WARNING',
      code: 'CATALOG_DEPRECATED_CAPABILITY',
      message: `capabilities.${target.key} 已废弃且不会影响组件目录，请通过 adapters.${target.adapter} 声明运行能力`,
      path: `$.catalogs.capabilities.${target.key}`,
    })
  }
}

/**
 * 按宿主能力开关把缺少真实端口的组件收紧为条件可用。
 *
 * 仅兼容历史 `capabilities`：显式 `false` 会覆盖为 `CONDITIONAL` 并替换原因。
 *
 * @param catalogs 宿主目录
 * @param resolved 已解析组件副本
 */
function applyCapabilityOverrides(
  catalogs: FormDesignerCatalogs | undefined,
  resolved: Map<string, DesignerComponentRegistration>,
): void {
  const capabilities = catalogs?.capabilities
  if (!capabilities) return
  for (const target of DEPRECATED_COMPONENT_CAPABILITIES) {
    if (capabilities[target.key] !== false) continue
    for (const componentType of target.componentTypes) {
      const current = resolved.get(componentType)
      if (!current || current.availability === 'UNAVAILABLE') continue
      resolved.set(componentType, {
        ...current,
        availability: 'CONDITIONAL',
        unavailableReason: target.reason,
      })
    }
  }
}
