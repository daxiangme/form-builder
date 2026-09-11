import type {
  FormLocationAdapter,
  FormLocationPickerSession,
  FormLocationValue,
} from '@daxiangme/form-core'

/** 高德定位 Adapter 的调用方选项。Key 由宿主传入，不进入表单文档。 */
export interface CreateAmapLocationAdapterOptions {
  /** 高德 JS API Key。 */
  key: string
  /** 高德 JS API 安全密钥，对应 `_AMapSecurityConfig.securityJsCode`。 */
  securityJsCode?: string
  /** 默认定位超时毫秒数。 */
  timeoutMilliseconds?: number
}

interface AmapLngLat {
  getLng: () => number
  getLat: () => number
}

interface AmapMarker {
  setPosition: (position: [number, number]) => void
}

interface AmapMap {
  destroy: () => void
  setCenter: (position: [number, number]) => void
  add: (overlay: AmapMarker) => void
  on: (event: string, handler: (event: { lnglat: AmapLngLat }) => void) => void
  resize?: () => void
}

interface AmapGeocoder {
  getAddress: (
    lnglat: [number, number],
    callback: (status: string, result: unknown) => void,
  ) => void
  getLocation: (address: string, callback: (status: string, result: unknown) => void) => void
}

interface AmapPlaceSearch {
  search: (keyword: string, callback: (status: string, result: unknown) => void) => void
}

interface AmapGeolocation {
  getCurrentPosition: (callback: (status: string, result: unknown) => void) => void
}

interface AmapHost {
  Map: new (container: HTMLElement, options: Record<string, unknown>) => AmapMap
  Marker: new (options: Record<string, unknown>) => AmapMarker
  Geocoder: new (options?: Record<string, unknown>) => AmapGeocoder
  PlaceSearch: new (options?: Record<string, unknown>) => AmapPlaceSearch
  Geolocation: new (options?: Record<string, unknown>) => AmapGeolocation
  plugin: (name: string | string[], callback: () => void) => void
}

interface AmapWindow {
  AMap?: AmapHost
  _AMapSecurityConfig?: { securityJsCode: string }
}

let amapLoader: Promise<AmapHost> | undefined

/**
 * 创建高德地图定位 Adapter。
 *
 * 通过动态脚本注入加载 SDK，不增加 npm 依赖。浏览器定位结果会换算为 GCJ02，再做逆地理编码。
 *
 * @param options 调用方持有的 Key 与安全密钥
 * @returns 可注入 `adapters.location` 的端口
 */
export function createAmapLocationAdapter(
  options: CreateAmapLocationAdapterOptions,
): FormLocationAdapter {
  const timeoutMilliseconds = options.timeoutMilliseconds ?? 10_000
  return {
    async locate(request) {
      const amap = await loadAmapSdk(options.key, options.securityJsCode)
      const located = await locateWithAmap(amap, {
        enableHighAccuracy: request.enableHighAccuracy === true,
        timeoutMilliseconds: request.timeoutMilliseconds || timeoutMilliseconds,
      })
      return geocodeLocation(amap, {
        ...located,
        source: 'CURRENT',
        provider: 'amap',
      })
    },
    async pick(request) {
      if (typeof document === 'undefined') throw new Error('当前环境无法打开地图选点')
      const amap = await loadAmapSdk(options.key, options.securityJsCode)
      return openAmapPickerDialog(amap, request.initial, request.defaultCenter)
    },
    async bindPicker(request) {
      const amap = await loadAmapSdk(options.key, options.securityJsCode)
      return createAmapPickerSession(
        amap,
        request.canvas,
        request.initial,
        request.defaultCenter,
        request.onChange,
      )
    },
  }
}

function loadAmapSdk(key: string, securityJsCode?: string): Promise<AmapHost> {
  const existing = (globalThis as AmapWindow).AMap
  if (existing) return Promise.resolve(existing)
  if (!amapLoader) {
    amapLoader = new Promise((resolve, reject) => {
      if (securityJsCode) {
        ;(globalThis as AmapWindow)._AMapSecurityConfig = { securityJsCode }
      }
      const script = document.createElement('script')
      script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(key)}`
      script.async = true
      script.onload = () => {
        const amap = (globalThis as AmapWindow).AMap
        if (!amap) {
          reject(new Error('高德地图 SDK 加载失败'))
          return
        }
        resolve(amap)
      }
      script.onerror = () => reject(new Error('高德地图 SDK 加载失败'))
      document.head.appendChild(script)
    })
  }
  return amapLoader
}

function loadPlugin(amap: AmapHost, name: string): Promise<void> {
  return new Promise((resolve) => {
    amap.plugin(name, () => resolve())
  })
}

async function locateWithAmap(
  amap: AmapHost,
  request: { enableHighAccuracy: boolean; timeoutMilliseconds: number },
): Promise<{ longitude: number; latitude: number; accuracyMeters?: number }> {
  await loadPlugin(amap, 'AMap.Geolocation')
  const geolocation = new amap.Geolocation({
    enableHighAccuracy: request.enableHighAccuracy,
    timeout: request.timeoutMilliseconds,
  })
  const located = await new Promise<{
    longitude: number
    latitude: number
    accuracyMeters?: number
  }>((resolve, reject) => {
    geolocation.getCurrentPosition((status, result) => {
      if (status === 'complete') {
        const parsed = parseAmapPosition(result)
        if (parsed) {
          resolve(parsed)
          return
        }
      }
      reject(new Error('高德定位失败'))
    })
  }).catch(async () => {
    const browser = await locateWithBrowser(request)
    return {
      ...wgs84ToGcj02(browser.longitude, browser.latitude),
      accuracyMeters: browser.accuracyMeters,
    }
  })
  return located
}

function locateWithBrowser(request: {
  enableHighAccuracy: boolean
  timeoutMilliseconds: number
}): Promise<{ longitude: number; latitude: number; accuracyMeters?: number }> {
  if (!globalThis.navigator?.geolocation) throw new Error('当前浏览器不支持定位')
  return new Promise((resolve, reject) => {
    globalThis.navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          longitude: position.coords.longitude,
          latitude: position.coords.latitude,
          accuracyMeters: position.coords.accuracy,
        }),
      () => reject(new Error('浏览器未授权或无法获取定位')),
      {
        enableHighAccuracy: request.enableHighAccuracy,
        timeout: request.timeoutMilliseconds,
        maximumAge: 60_000,
      },
    )
  })
}

async function createAmapPickerSession(
  amap: AmapHost,
  canvas: HTMLElement,
  initial: FormLocationValue | undefined,
  defaultCenter: { longitude: number; latitude: number } | undefined,
  onChange: (value: FormLocationValue) => void,
): Promise<FormLocationPickerSession> {
  const center: [number, number] = [
    initial?.longitude ?? defaultCenter?.longitude ?? 116.397428,
    initial?.latitude ?? defaultCenter?.latitude ?? 39.90923,
  ]
  canvas.style.minHeight = canvas.style.minHeight || '280px'
  canvas.style.height = canvas.style.height || '100%'
  const map = new amap.Map(canvas, { zoom: 16, center })
  const marker = new amap.Marker({ position: center })
  map.add(marker)
  map.resize?.()
  globalThis.setTimeout(() => map.resize?.(), 120)
  let current: FormLocationValue | undefined =
    initial && Number.isFinite(initial.longitude) && Number.isFinite(initial.latitude)
      ? { ...initial, source: 'PICK', provider: 'amap' }
      : undefined
  if (current) onChange(current)

  const applyLngLat = async (
    longitude: number,
    latitude: number,
    extra?: Partial<FormLocationValue>,
  ) => {
    marker.setPosition([longitude, latitude])
    map.setCenter([longitude, latitude])
    const value = await geocodeLocation(amap, {
      longitude,
      latitude,
      source: 'PICK',
      provider: 'amap',
    })
    current = extra ? { ...value, ...extra } : value
    onChange(current)
  }

  void applyLngLat(
    center[0],
    center[1],
    initial?.address ? { address: initial.address } : undefined,
  )
  map.on('click', (event) => {
    void applyLngLat(event.lnglat.getLng(), event.lnglat.getLat())
  })
  let destroyed = false

  return {
    async search(keyword) {
      const found = await searchAmapPlace(amap, keyword)
      if (!found) throw new Error('未找到该地点')
      await applyLngLat(found.longitude, found.latitude, {
        address: found.address,
        name: found.name,
      })
    },
    getValue: () => current,
    destroy() {
      if (destroyed) return
      destroyed = true
      map.destroy()
    },
  }
}

function openAmapPickerDialog(
  amap: AmapHost,
  initial?: FormLocationValue,
  defaultCenter?: { longitude: number; latitude: number },
): Promise<FormLocationValue | undefined> {
  return new Promise((resolve, reject) => {
    const overlay = document.createElement('div')
    overlay.className = 'daxiang-form daxiang-form-amap-picker'
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:4000;display:grid;place-items:center;background:rgba(15,23,42,.45);'
    const dialog = document.createElement('div')
    dialog.style.cssText =
      'display:grid;grid-template-rows:auto auto minmax(280px,1fr) auto;width:60%;max-width:calc(100vw - 32px);min-height:min(560px,calc(100vh - 48px));overflow:hidden;background:#fff;border-radius:8px;box-shadow:0 12px 32px rgba(15,23,42,.2);'
    const title = document.createElement('header')
    title.style.cssText = 'padding:16px 16px 0;font-size:16px;font-weight:600;'
    title.textContent = '地图选点'
    const search = document.createElement('div')
    search.style.cssText =
      'display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;padding:16px;'
    const input = document.createElement('input')
    input.type = 'text'
    input.placeholder = '请输入地址搜索，或点击地图选点'
    input.value = initial?.address ?? ''
    input.style.cssText = 'height:32px;padding:0 12px;border:1px solid #dcdfe6;border-radius:4px;'
    const searchButton = document.createElement('button')
    searchButton.type = 'button'
    searchButton.textContent = '搜索地点'
    search.append(input, searchButton)
    const mapHost = document.createElement('div')
    mapHost.style.cssText = 'min-height:280px;margin:0 16px;'
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
    document.body.append(overlay)
    let session: FormLocationPickerSession | undefined
    let currentValue: FormLocationValue | undefined
    const finish = (value: FormLocationValue | undefined) => {
      session?.destroy()
      overlay.remove()
      resolve(value)
    }
    void createAmapPickerSession(amap, mapHost, initial, defaultCenter, (value) => {
      currentValue = value
      if (value.address) input.value = value.address
    })
      .then((next) => {
        session = next
        searchButton.addEventListener('click', () => {
          void session?.search(input.value)
        })
        input.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') void session?.search(input.value)
        })
      })
      .catch((error) => {
        overlay.remove()
        reject(error)
      })
    cancel.addEventListener('click', () => finish(undefined))
    confirm.addEventListener('click', () => finish(currentValue ?? session?.getValue()))
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) finish(undefined)
    })
  })
}

async function searchAmapPlace(
  amap: AmapHost,
  keyword: string,
): Promise<{ longitude: number; latitude: number; address?: string; name?: string } | undefined> {
  const text = keyword.trim()
  if (!text) return undefined
  await loadPlugin(amap, 'AMap.PlaceSearch')
  const fromPlace = await new Promise<
    | {
        longitude: number
        latitude: number
        address?: string
        name?: string
      }
    | undefined
  >((resolve) => {
    const searcher = new amap.PlaceSearch({ pageSize: 1, pageIndex: 1, city: '全国' })
    searcher.search(text, (status, result) => {
      resolve(status === 'complete' ? parsePlaceSearch(result) : undefined)
    })
  })
  if (fromPlace) return fromPlace
  await loadPlugin(amap, 'AMap.Geocoder')
  const geocoder = new amap.Geocoder()
  return new Promise((resolve) => {
    geocoder.getLocation(text, (status, result) => {
      resolve(status === 'complete' ? parseGeocodeLocation(result) : undefined)
    })
  })
}

async function geocodeLocation(
  amap: AmapHost,
  input: {
    longitude: number
    latitude: number
    accuracyMeters?: number
    source: 'CURRENT' | 'PICK'
    provider: string
  },
): Promise<FormLocationValue> {
  await loadPlugin(amap, 'AMap.Geocoder')
  const geocoder = new amap.Geocoder()
  const address = await new Promise<Partial<FormLocationValue>>((resolve) => {
    geocoder.getAddress([input.longitude, input.latitude], (status, result) => {
      resolve(status === 'complete' ? parseAmapGeocode(result) : {})
    })
  })
  return {
    longitude: input.longitude,
    latitude: input.latitude,
    coordinateSystem: 'GCJ02',
    ...address,
    source: input.source,
    collectedAt: new Date().toISOString(),
    provider: input.provider,
    accuracyMeters: input.accuracyMeters,
  }
}

function parseAmapPosition(
  result: unknown,
): { longitude: number; latitude: number; accuracyMeters?: number } | undefined {
  if (typeof result !== 'object' || result === null) return undefined
  const source = result as Record<string, unknown>
  const position = source.position
  if (typeof position === 'object' && position !== null) {
    const lnglat = position as AmapLngLat
    if (typeof lnglat.getLng === 'function' && typeof lnglat.getLat === 'function') {
      return {
        longitude: lnglat.getLng(),
        latitude: lnglat.getLat(),
        accuracyMeters: typeof source.accuracy === 'number' ? source.accuracy : undefined,
      }
    }
  }
  return undefined
}

function parsePlaceSearch(
  result: unknown,
): { longitude: number; latitude: number; address?: string; name?: string } | undefined {
  if (typeof result !== 'object' || result === null) return undefined
  const poiList = (result as Record<string, unknown>).poiList
  if (typeof poiList !== 'object' || poiList === null) return undefined
  const pois = (poiList as Record<string, unknown>).pois
  if (!Array.isArray(pois) || typeof pois[0] !== 'object' || pois[0] === null) return undefined
  const poi = pois[0] as Record<string, unknown>
  const location = parseLngLat(poi.location)
  if (!location) return undefined
  return {
    ...location,
    address: textValue(poi.address) || textValue(poi.name) || undefined,
    name: textValue(poi.name) || undefined,
  }
}

function parseGeocodeLocation(
  result: unknown,
): { longitude: number; latitude: number; address?: string; name?: string } | undefined {
  if (typeof result !== 'object' || result === null) return undefined
  const geocodes = (result as Record<string, unknown>).geocodes
  if (!Array.isArray(geocodes) || typeof geocodes[0] !== 'object' || geocodes[0] === null) {
    return undefined
  }
  const geocode = geocodes[0] as Record<string, unknown>
  const location = parseLngLat(geocode.location)
  if (!location) return undefined
  const address = textValue(geocode.formattedAddress)
  return { ...location, address: address || undefined, name: address || undefined }
}

function parseLngLat(value: unknown): { longitude: number; latitude: number } | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const source = value as Record<string, unknown> & Partial<AmapLngLat>
  if (typeof source.getLng === 'function' && typeof source.getLat === 'function') {
    return { longitude: source.getLng(), latitude: source.getLat() }
  }
  const longitude = typeof source.lng === 'number' ? source.lng : source.longitude
  const latitude = typeof source.lat === 'number' ? source.lat : source.latitude
  if (typeof longitude !== 'number' || typeof latitude !== 'number') return undefined
  return { longitude, latitude }
}

function parseAmapGeocode(result: unknown): Partial<FormLocationValue> {
  if (typeof result !== 'object' || result === null) return {}
  const regeocode = (result as Record<string, unknown>).regeocode
  if (typeof regeocode !== 'object' || regeocode === null) return {}
  const source = regeocode as Record<string, unknown>
  const component =
    typeof source.addressComponent === 'object' && source.addressComponent !== null
      ? (source.addressComponent as Record<string, unknown>)
      : {}
  const province = textValue(component.province)
  const city = textValue(component.city) || province
  const district = textValue(component.district)
  const township = textValue(component.township)
  const street = `${textValue(component.street)}${textValue(component.streetNumber)}`
  const adcode = textValue(component.adcode)
  return {
    address: textValue(source.formattedAddress),
    name: textValue(source.formattedAddress),
    province,
    city,
    district,
    township,
    streetAddress: street || undefined,
    adcode: adcode || undefined,
    adcodePath: adcodePathFrom(adcode),
  }
}

function adcodePathFrom(adcode: string): string[] | undefined {
  if (!/^\d{6}$/u.test(adcode)) return undefined
  const province = `${adcode.slice(0, 2)}0000`
  const city = `${adcode.slice(0, 4)}00`
  return province === city ? [province, adcode] : [province, city, adcode]
}

function textValue(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0]
  return ''
}

const PI = Math.PI
const WGS84_A = 6378245
const WGS84_EE = 0.006693421622965943

function outOfChina(longitude: number, latitude: number): boolean {
  return longitude < 72.004 || longitude > 137.8347 || latitude < 0.8293 || latitude > 55.8271
}

function transformLatitude(longitude: number, latitude: number): number {
  let result =
    -100 +
    2 * longitude +
    3 * latitude +
    0.2 * latitude * latitude +
    0.1 * longitude * latitude +
    0.2 * Math.sqrt(Math.abs(longitude))
  result += ((20 * Math.sin(6 * longitude * PI) + 20 * Math.sin(2 * longitude * PI)) * 2) / 3
  result += ((20 * Math.sin(latitude * PI) + 40 * Math.sin((latitude / 3) * PI)) * 2) / 3
  result += ((160 * Math.sin((latitude / 12) * PI) + 320 * Math.sin((latitude * PI) / 30)) * 2) / 3
  return result
}

function transformLongitude(longitude: number, latitude: number): number {
  let result =
    300 +
    longitude +
    2 * latitude +
    0.1 * longitude * longitude +
    0.1 * longitude * latitude +
    0.1 * Math.sqrt(Math.abs(longitude))
  result += ((20 * Math.sin(6 * longitude * PI) + 20 * Math.sin(2 * longitude * PI)) * 2) / 3
  result += ((20 * Math.sin(longitude * PI) + 40 * Math.sin((longitude / 3) * PI)) * 2) / 3
  result +=
    ((150 * Math.sin((longitude / 12) * PI) + 300 * Math.sin((longitude / 30) * PI)) * 2) / 3
  return result
}

function wgs84ToGcj02(
  longitude: number,
  latitude: number,
): { longitude: number; latitude: number } {
  if (outOfChina(longitude, latitude)) return { longitude, latitude }
  let deltaLatitude = transformLatitude(longitude - 105, latitude - 35)
  let deltaLongitude = transformLongitude(longitude - 105, latitude - 35)
  const radianLatitude = (latitude / 180) * PI
  let magic = Math.sin(radianLatitude)
  magic = 1 - WGS84_EE * magic * magic
  const sqrtMagic = Math.sqrt(magic)
  deltaLatitude = (deltaLatitude * 180) / (((WGS84_A * (1 - WGS84_EE)) / (magic * sqrtMagic)) * PI)
  deltaLongitude = (deltaLongitude * 180) / ((WGS84_A / sqrtMagic) * Math.cos(radianLatitude) * PI)
  return { longitude: longitude + deltaLongitude, latitude: latitude + deltaLatitude }
}
