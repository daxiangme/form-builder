import { DESIGNER_COMPONENTS } from './component-registry'
import type {
  DesignerComponentRegistration,
  DesignerDiagnostic,
  FormDesignerCatalogs,
  FormDesignerComponentCatalogItem,
} from './types'

/** 应用设计资源目录后的组件列表与诊断。 */
export interface DesignerCatalogResolution {
  components: DesignerComponentRegistration[]
  diagnostics: DesignerDiagnostic[]
}

/**
 * 将宿主目录与内置注册表求交集。
 *
 * 未知组件类型只产生诊断，不会动态注册或执行。未提供组件目录时保留内置注册表，
 * 再按宿主能力开关收紧上传、OCR、扫码、定位等条件能力。
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
 * 按宿主能力开关把缺少真实端口的组件收紧为条件不可用。
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
  const capabilityTargets: Array<{
    enabled: boolean | undefined
    componentTypes: string[]
    reason: string
  }> = [
    { enabled: capabilities.upload, componentTypes: ['file'], reason: '当前宿主未提供上传能力' },
    { enabled: capabilities.ocr, componentTypes: ['ocr'], reason: '当前宿主未提供 OCR 能力' },
    { enabled: capabilities.scan, componentTypes: ['scan-code'], reason: '当前宿主未提供扫码能力' },
    {
      enabled: capabilities.location,
      componentTypes: ['position'],
      reason: '当前宿主未提供定位能力',
    },
    {
      enabled: capabilities.dynamicOptions,
      componentTypes: ['dynamic-select', 'dynamic-cascade'],
      reason: '当前宿主未提供动态选项能力',
    },
    {
      enabled: capabilities.challenge,
      componentTypes: ['captcha'],
      reason: '当前宿主未提供验证码渠道',
    },
    {
      enabled: capabilities.personalSignature,
      componentTypes: ['signature'],
      reason: '当前宿主未提供个人签名能力',
    },
    {
      enabled: capabilities.regionCascade,
      componentTypes: ['region'],
      reason: '当前宿主未提供地区级联能力',
    },
    {
      enabled: capabilities.directory,
      componentTypes: ['user', 'role', 'organization', 'post'],
      reason: '当前宿主未提供目录查询能力',
    },
  ]
  for (const target of capabilityTargets) {
    if (target.enabled !== false) continue
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
