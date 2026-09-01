import type { FormAssetReference, FormRuntimeAdapters } from '@daxiangme/form-core'
import type { CreateLocalPreviewFormAdapterOptions } from '../types'

/** 带资源释放能力的本地预览 Adapter。 */
export interface LocalPreviewFormAdapterHandle {
  adapters: FormRuntimeAdapters
  dispose: () => void
}

/**
 * 创建只使用浏览器内存的预览 Adapter。
 *
 * 文件不会发起网络请求；Object URL 只在当前页面会话有效，调用方卸载 Playground 时应执行 dispose。
 */
export function createLocalPreviewFormAdapter(
  options: CreateLocalPreviewFormAdapterOptions = {},
): LocalPreviewFormAdapterHandle {
  const assets = new Map<string, { reference: FormAssetReference; file: File; objectUrl: string }>()

  const adapters: FormRuntimeAdapters = {
    asset: {
      async upload(request) {
        const assetId = createLocalAssetId()
        const objectUrl = URL.createObjectURL(request.file)
        const reference: FormAssetReference = {
          assetId,
          name: request.file.name,
          size: request.file.size,
          contentType: request.file.type || undefined,
          downloadUrl: objectUrl,
        }
        assets.set(assetId, { reference, file: request.file, objectUrl })
        return { ...reference }
      },
      async resolve(request) {
        return request.assetIds.map((assetId) => {
          const asset = assets.get(assetId)
          return asset ? { ...asset.reference } : { assetId, name: assetId, size: 0 }
        })
      },
      async download(request) {
        const asset = assets.get(request.assetId)
        if (!asset) throw new Error(`本地预览中不存在文件 ${request.assetId}`)
        return {
          kind: 'BLOB',
          blob: asset.file,
          fileName: asset.reference.name,
          contentType: asset.reference.contentType,
        }
      },
    },
    linkageConfirmation: {
      confirmOverwrite: async (request) => {
        const message = `字段“${request.fieldLabel}”已有值，是否使用联动计算结果覆盖？`
        if (options.confirmOverwrite) return options.confirmOverwrite(message)
        return globalThis.confirm(message)
      },
    },
    directory: {
      async query(request) {
        const keyword = request.keyword.trim().toLowerCase()
        const source = localDirectoryItems(request.subjectType)
        const filtered = keyword
          ? source.filter((item) =>
              `${item.label} ${item.description ?? ''}`.toLowerCase().includes(keyword),
            )
          : source
        const offset = Math.max(0, request.pageNo - 1) * request.pageSize
        return {
          items: filtered.slice(offset, offset + request.pageSize),
          totalCount: filtered.length,
        }
      },
    },
    scan: {
      async scan() {
        const text = globalThis.prompt('输入用于本地预览的扫码结果')
        if (!text) throw new Error('已取消本地扫码预览')
        return { text }
      },
    },
    location: {
      async locate() {
        if (!globalThis.navigator?.geolocation) throw new Error('当前浏览器不支持定位')
        return new Promise((resolve, reject) => {
          globalThis.navigator.geolocation.getCurrentPosition(
            (position) =>
              resolve({
                longitude: position.coords.longitude,
                latitude: position.coords.latitude,
              }),
            () => reject(new Error('浏览器未授权或无法获取定位')),
            { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
          )
        })
      },
    },
  }

  return {
    adapters,
    dispose() {
      for (const asset of assets.values()) URL.revokeObjectURL(asset.objectUrl)
      assets.clear()
    },
  }
}

function createLocalAssetId(): string {
  return `local_${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}_${Math.random().toString(36).slice(2)}`}`
}

function localDirectoryItems(subjectType: string): Array<{
  id: string
  label: string
  description?: string
}> {
  const catalog: Record<string, Array<{ id: string; label: string; description?: string }>> = {
    user: [
      { id: 'user-1', label: '林晓岚', description: '产品中心 · 产品经理' },
      { id: 'user-2', label: '陈睿', description: '研发中心 · 前端工程师' },
      { id: 'user-3', label: '周宁', description: '财务中心 · 财务主管' },
    ],
    role: [
      { id: 'role-1', label: '流程管理员', description: '本地预览角色' },
      { id: 'role-2', label: '部门负责人', description: '本地预览角色' },
    ],
    organization: [
      { id: 'org-1', label: '产品中心', description: '一级组织' },
      { id: 'org-2', label: '研发中心', description: '一级组织' },
    ],
    post: [
      { id: 'post-1', label: '产品经理', description: '产品中心' },
      { id: 'post-2', label: '前端工程师', description: '研发中心' },
    ],
    'process-reference': [
      { id: 'process-1', label: '采购申请 #20260901001', description: '审批中' },
    ],
    'form-reference': [{ id: 'form-1', label: '供应商档案 · 华东供应链', description: '正式记录' }],
    'custom-data': [{ id: 'data-1', label: '示例记录 A', description: '本地自定义数据' }],
    'data-dialog': [{ id: 'dialog-1', label: '数据行 001', description: '本地数据对话框' }],
  }
  return catalog[subjectType] ?? []
}
