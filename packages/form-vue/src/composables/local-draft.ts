import { decodeDesignerDocument, serializeDesignerDocument } from '@daxiangme/form-core'
import type { DesignerDiagnostic, DesignerDocument } from '@daxiangme/form-core'

const STORAGE_PREFIX = 'daxiang-form:designer-document:v1:'

/** 本地草稿恢复结果；损坏原文必须保留给用户下载。 */
export interface DesignerDraftLoadResult {
  document?: DesignerDocument
  raw?: string
  diagnostics: DesignerDiagnostic[]
}

/** 按当前表单路由标识生成相互隔离的存储键。 */
export function designerDraftStorageKey(documentId: string): string {
  return `${STORAGE_PREFIX}${encodeURIComponent(documentId || 'standalone')}`
}

/** 从浏览器本地存储读取并校验独立设计器草稿。 */
export function loadDesignerDraft(documentId: string): DesignerDraftLoadResult {
  const raw = window.localStorage.getItem(designerDraftStorageKey(documentId))
  if (!raw) return { diagnostics: [] }
  try {
    const decoded = decodeDesignerDocument(JSON.parse(raw) as unknown)
    if (decoded.document) return { document: decoded.document, diagnostics: decoded.diagnostics }
    return { raw, diagnostics: decoded.diagnostics }
  } catch {
    return {
      raw,
      diagnostics: [
        { severity: 'ERROR', code: 'DRAFT_JSON', message: '本地草稿不是合法 JSON', path: '$' },
      ],
    }
  }
}

/** 显式保存规范化草稿；预览和导入均不得自动调用。 */
export function saveDesignerDraft(documentId: string, document: DesignerDocument): void {
  window.localStorage.setItem(
    designerDraftStorageKey(documentId),
    serializeDesignerDocument(document),
  )
}

/** 清除当前表单隔离草稿。 */
export function removeDesignerDraft(documentId: string): void {
  window.localStorage.removeItem(designerDraftStorageKey(documentId))
}

/** 下载规范化设计文档或损坏草稿原文。 */
export function downloadDesignerText(content: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}
