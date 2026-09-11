import type { FormRuntimeAdapterContext, FormRuntimeAdapters } from '@daxiangme/form-core'

/** 由宿主实现的最小传输请求；Adapter 不创建 HTTP 客户端，也不保存认证信息。 */
export interface FormTransportRequest {
  method: 'GET' | 'POST'
  path: string
  query?: Readonly<Record<string, string | number | boolean | undefined>>
  body?: unknown
}

/** 下载传输结果。 */
export interface FormTransportDownload {
  blob: Blob
  fileName?: string
  contentType?: string
}

/** DX BPM Adapter 唯一依赖的传输端口。 */
export interface FormTransport {
  request: (request: FormTransportRequest) => Promise<unknown>
  download: (
    request: Omit<FormTransportRequest, 'method' | 'body'>,
  ) => Promise<FormTransportDownload>
}

/** 创建 DX BPM Adapter 时由宿主注入的运行上下文和可选页面能力。 */
export interface CreateDxBpmFormAdapterOptions {
  transport: FormTransport
  context: FormRuntimeAdapterContext
  navigateResource?: (resourceCode: string, openInNewPage: boolean) => Promise<void>
  confirmOverwrite?: (message: string) => Promise<boolean>
  /**
   * 由宿主补齐关系、目录、扫码、定位与数据源等端口。
   *
   * 扫码与定位没有包内默认实现：缺少 extras.scan / extras.location 时对应控件失败关闭。
   * 地图 Key、OCR 鉴权与扫码外壳都由宿主在 extras 实现中持有，不要写进表单配置。
   */
  extras?: FormRuntimeAdapters
}

/** 本地预览 Adapter 的交互选项。 */
export interface CreateLocalPreviewFormAdapterOptions {
  confirmOverwrite?: (message: string) => Promise<boolean>
  /** 本地扫码是否就绪；缺省为就绪。 */
  scanReady?: boolean
  /** 扫码未就绪时展示给填报人的原因。 */
  scanUnreadyReason?: string
}
