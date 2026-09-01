import type {
  FormAssetReference,
  FormRuntimeAdapterContext,
  FormRuntimeAdapters,
} from '@daxiangme/form-core'
import type { CreateDxBpmFormAdapterOptions } from '../types'

interface DxAttachmentPayload {
  fileId: string
  name: string
  contentType: string
  sizeBytes: number
}

/**
 * 使用 DX BPM 已发布表单协议创建运行 Adapter。
 *
 * 认证、租户、错误拦截和响应包络生命周期全部由 FormTransport 负责；本模块只解释表单领域路径和数据。
 */
export function createDxBpmFormAdapter(
  options: CreateDxBpmFormAdapterOptions,
): FormRuntimeAdapters {
  const metadata = new Map<string, FormAssetReference>()
  const basePath = runtimePath(options.context)
  const adapters: FormRuntimeAdapters = {
    asset: {
      async upload(request) {
        const body = new FormData()
        body.append('fieldCode', request.fieldCode)
        if (request.context.recordToken) body.append('recordToken', request.context.recordToken)
        const processTaskId = extensionText(request.context, 'processTaskId')
        if (processTaskId) body.append('processTaskId', processTaskId)
        body.append('file', request.file)
        const response = await options.transport.request({
          method: 'POST',
          path: `${basePath}/attachments`,
          body,
        })
        const attachment = decodeAttachment(response)
        const reference: FormAssetReference = {
          assetId: attachment.fileId,
          name: attachment.name,
          size: attachment.sizeBytes,
          contentType: attachment.contentType,
        }
        metadata.set(reference.assetId, reference)
        return { ...reference }
      },
      async resolve(request) {
        return request.assetIds.map((assetId) => ({
          ...(metadata.get(assetId) ?? { assetId, name: assetId, size: 0 }),
        }))
      },
      async download(request) {
        const recordToken = requireContextText(
          request.context,
          'recordToken',
          '请先保存记录后再下载附件',
        )
        const fieldCode = request.fieldCode
        const download = await options.transport.download({
          path: `${basePath}/records/${segment(recordToken)}/attachments/${segment(fieldCode)}/content`,
          query: {
            fileId: request.assetId,
            processTaskId: extensionText(request.context, 'processTaskId'),
          },
        })
        return {
          kind: 'BLOB',
          blob: download.blob,
          fileName: download.fileName ?? metadata.get(request.assetId)?.name ?? request.assetId,
          contentType: download.contentType,
        }
      },
    },
    ocr: {
      async recognize(request) {
        const fieldCode = request.fieldCode
        const body = new FormData()
        body.append('file', request.file)
        const response = await options.transport.request({
          method: 'POST',
          path: `${basePath}/fields/${segment(fieldCode)}/ocr`,
          query: {
            recordToken: request.context.recordToken,
            processTaskId: extensionText(request.context, 'processTaskId'),
          },
          body,
        })
        return requireRecord(unwrapDxPayload(response), 'OCR 响应')
      },
    },
    linkageConfirmation: {
      confirmOverwrite: async (request) => {
        const message = `字段“${request.fieldLabel}”已有值，是否使用联动计算结果覆盖？`
        if (options.confirmOverwrite) return options.confirmOverwrite(message)
        return globalThis.confirm(message)
      },
    },
  }
  if (options.navigateResource) {
    adapters.navigation = {
      navigate: (request) => options.navigateResource!(request.resourceCode, request.openInNewPage),
    }
    adapters.hostAction = {
      execute: async () => {
        throw new Error('宿主未配置声明式动作执行器')
      },
      navigateResource: options.navigateResource,
    }
  }
  return adapters
}

function runtimePath(context: FormRuntimeAdapterContext): string {
  const applicationCode = requireContextText(context, 'applicationCode', '缺少 applicationCode')
  const resourceCode = requireContextText(context, 'resourceCode', '缺少 resourceCode')
  return `/application-portal/${segment(applicationCode)}/forms/${segment(resourceCode)}`
}

function decodeAttachment(response: unknown): DxAttachmentPayload {
  const value = requireRecord(unwrapDxPayload(response), '附件上传响应')
  const fileId = requirePayloadText(value.fileId, 'fileId')
  const name = requirePayloadText(value.name, 'name')
  const contentType = requirePayloadText(value.contentType, 'contentType')
  if (
    typeof value.sizeBytes !== 'number' ||
    !Number.isFinite(value.sizeBytes) ||
    value.sizeBytes < 0
  ) {
    throw new Error('附件上传响应 sizeBytes 不合法')
  }
  return { fileId, name, contentType, sizeBytes: value.sizeBytes }
}

function unwrapDxPayload(response: unknown): unknown {
  if (typeof response !== 'object' || response === null || Array.isArray(response)) return response
  const source = response as Record<string, unknown>
  if (!('code' in source)) return response
  if (source.code !== 0) {
    throw new Error(typeof source.msg === 'string' && source.msg ? source.msg : 'DX BPM 请求失败')
  }
  return source.data
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label}必须是对象`)
  }
  return value as Record<string, unknown>
}

function requirePayloadText(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`附件上传响应 ${label} 不合法`)
  return value
}

function requireContextText(
  context: FormRuntimeAdapterContext,
  key: keyof FormRuntimeAdapterContext,
  message: string,
): string {
  const value = context[key]
  if (typeof value !== 'string' || !value.trim()) throw new Error(message)
  return value
}

function extensionText(context: FormRuntimeAdapterContext, key: string): string {
  const value = context.extension?.[key]
  return typeof value === 'string' ? value : ''
}

function segment(value: string): string {
  return encodeURIComponent(value)
}
