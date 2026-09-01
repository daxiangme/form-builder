import type { FormRuntimeAdapterContext } from '@daxiangme/form-core'

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
}

/** 本地预览 Adapter 的交互选项。 */
export interface CreateLocalPreviewFormAdapterOptions {
  confirmOverwrite?: (message: string) => Promise<boolean>
}
