import type {
  FormAssetReference,
  FormLocationPickerSession,
  FormLocationValue,
  FormRuntimeAdapters,
  FormScanReadiness,
} from '@daxiangme/form-core'
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
  const scanReadiness = (): FormScanReadiness =>
    options.scanReady === false
      ? { ready: false, unreadyReason: options.scanUnreadyReason || '扫码设备未就绪' }
      : { ready: true }

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
    ocr: {
      async recognize(request) {
        return {
          name: '张三',
          amount: '128.50',
          fileName: request.file.name,
        }
      },
    },
    scan: {
      readiness: () => scanReadiness(),
      subscribeReadiness(listener) {
        listener(scanReadiness())
        return () => undefined
      },
      async scan(request) {
        const hint =
          request.parameter == null || request.parameter === ''
            ? '输入用于本地预览的扫码结果'
            : `输入扫码结果（入参 ${String(request.parameter)}）`
        const text = globalThis.prompt(hint)
        if (!text) throw new Error('已取消本地扫码预览')
        return { text }
      },
    },
    location: {
      async locate(request) {
        if (!globalThis.navigator?.geolocation) throw new Error('当前浏览器不支持定位')
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          globalThis.navigator.geolocation.getCurrentPosition(
            resolve,
            () => reject(new Error('浏览器未授权或无法获取定位')),
            {
              enableHighAccuracy: request.enableHighAccuracy === true,
              timeout: request.timeoutMilliseconds || 10_000,
              maximumAge: 60_000,
            },
          )
        })
        return createLocalLocationValue({
          longitude: position.coords.longitude,
          latitude: position.coords.latitude,
          accuracyMeters: position.coords.accuracy,
          source: 'CURRENT',
        })
      },
      async pick(request) {
        const seed = request.initial ?? request.defaultCenter
        const picked = await openLocalLocationPicker(seed, request.initial)
        if (!picked) return undefined
        return picked
      },
      async bindPicker(request) {
        const seed = request.initial ?? request.defaultCenter
        return mountLocalLocationCanvas(request.canvas, seed, request.initial, request.onChange)
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

function createLocalLocationValue(input: {
  longitude: number
  latitude: number
  accuracyMeters?: number
  source: 'CURRENT' | 'PICK'
}): FormLocationValue {
  return {
    longitude: input.longitude,
    latitude: input.latitude,
    coordinateSystem: 'GCJ02',
    address: '北京市东城区东华门街道',
    name: input.source === 'PICK' ? '地图选点' : '当前位置',
    province: '北京市',
    city: '北京市',
    district: '东城区',
    township: '东华门街道',
    streetAddress: '东华门街道',
    adcode: '110101',
    adcodePath: ['110000', '110100', '110101'],
    source: input.source,
    collectedAt: new Date().toISOString(),
    provider: 'local-preview',
    accuracyMeters: input.accuracyMeters,
  }
}

function mountLocalLocationCanvas(
  canvas: HTMLElement,
  seed?: { longitude: number; latitude: number },
  initial?: FormLocationValue,
  onChange?: (value: FormLocationValue) => void,
): FormLocationPickerSession {
  const center = {
    longitude: initial?.longitude ?? seed?.longitude ?? 116.397428,
    latitude: initial?.latitude ?? seed?.latitude ?? 39.90923,
  }
  let current = createLocalLocationValue({
    longitude: center.longitude,
    latitude: center.latitude,
    source: 'PICK',
  })
  if (initial?.address) {
    current = {
      ...current,
      address: initial.address,
      name: initial.name ?? initial.address,
      province: initial.province,
      city: initial.city,
      district: initial.district,
      township: initial.township,
      streetAddress: initial.streetAddress,
      adcode: initial.adcode,
      adcodePath: initial.adcodePath,
    }
  }
  canvas.replaceChildren()
  const surface = document.createElement('div')
  surface.className = 'daxiang-form-local-location-canvas'
  surface.style.cssText =
    'position:relative;height:100%;min-height:320px;cursor:crosshair;overflow:hidden;background:linear-gradient(90deg,rgba(64,158,255,.08) 1px,transparent 1px),linear-gradient(rgba(64,158,255,.08) 1px,transparent 1px),linear-gradient(180deg,#e8f3ff,#f5f7fa);background-size:48px 48px,48px 48px,auto;'
  const pin = document.createElement('div')
  pin.style.cssText =
    'position:absolute;left:50%;top:50%;width:18px;height:18px;border-radius:50% 50% 50% 0;transform:translate(-50%,-100%) rotate(-45deg);background:var(--el-color-primary,#409eff);box-shadow:0 4px 10px rgba(15,23,42,.25);'
  const hint = document.createElement('span')
  hint.style.cssText =
    'position:absolute;right:12px;bottom:12px;left:12px;color:var(--el-text-color-secondary,#6b7280);font-size:12px;text-align:center;'
  hint.textContent = '本地预览地图，点击或搜索后确认'
  surface.append(pin, hint)
  canvas.append(surface)
  onChange?.(current)
  const onClick = () => {
    current = { ...current, source: 'PICK', collectedAt: new Date().toISOString() }
    onChange?.(current)
  }
  surface.addEventListener('click', onClick)
  let destroyed = false
  return {
    async search(keyword) {
      const text = keyword.trim()
      if (!text) return
      current = {
        ...current,
        address: text,
        name: text,
        source: 'PICK',
        collectedAt: new Date().toISOString(),
      }
      onChange?.(current)
    },
    getValue: () => current,
    destroy() {
      if (destroyed) return
      destroyed = true
      surface.removeEventListener('click', onClick)
      canvas.replaceChildren()
    },
  }
}

function openLocalLocationPicker(
  seed?: { longitude: number; latitude: number },
  initial?: FormLocationValue,
): Promise<FormLocationValue | undefined> {
  if (typeof document === 'undefined') throw new Error('当前环境无法打开地图选点')
  return new Promise((resolve) => {
    const overlay = document.createElement('div')
    overlay.className = 'daxiang-form daxiang-form-local-location-picker'
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:4000;display:grid;place-items:center;background:rgba(15,23,42,.45);'
    const dialog = document.createElement('div')
    dialog.style.cssText =
      'display:grid;grid-template-rows:auto auto minmax(280px,1fr) auto;width:60%;max-width:calc(100vw - 32px);min-height:min(560px,calc(100vh - 48px));overflow:hidden;background:var(--el-bg-color,#fff);border-radius:8px;box-shadow:0 12px 32px rgba(15,23,42,.2);'
    const title = document.createElement('header')
    title.style.cssText =
      'display:flex;align-items:center;justify-content:space-between;padding:16px 16px 0;font-size:16px;font-weight:600;'
    title.textContent = '地图选点'
    const search = document.createElement('div')
    search.style.cssText =
      'display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;padding:16px;'
    const input = document.createElement('input')
    input.type = 'text'
    input.placeholder = '请输入地址搜索，或点击地图选点'
    input.value = initial?.address ?? ''
    input.style.cssText =
      'height:32px;padding:0 12px;border:1px solid var(--el-border-color,#dcdfe6);border-radius:4px;'
    const searchButton = document.createElement('button')
    searchButton.type = 'button'
    searchButton.textContent = '搜索地点'
    search.append(input, searchButton)
    const mapHost = document.createElement('div')
    mapHost.style.cssText = 'min-height:280px;margin:0 16px;border-radius:6px;overflow:hidden;'
    const actions = document.createElement('div')
    actions.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;padding:16px;'
    const cancel = document.createElement('button')
    cancel.type = 'button'
    cancel.textContent = '取消'
    const confirm = document.createElement('button')
    confirm.type = 'button'
    confirm.textContent = '确认'
    actions.append(cancel, confirm)
    dialog.append(title, search, mapHost, actions)
    overlay.append(dialog)
    let currentValue: FormLocationValue | undefined
    const session = mountLocalLocationCanvas(mapHost, seed, initial, (value) => {
      currentValue = value
      if (value.address) input.value = value.address
    })
    const finish = (value: FormLocationValue | undefined) => {
      session.destroy()
      overlay.remove()
      resolve(value)
    }
    searchButton.addEventListener('click', () => {
      void session.search(input.value)
    })
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') void session.search(input.value)
    })
    cancel.addEventListener('click', () => finish(undefined))
    confirm.addEventListener('click', () => finish(currentValue ?? session.getValue()))
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) finish(undefined)
    })
    document.body.append(overlay)
  })
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
