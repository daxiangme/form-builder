import { computed, ref, shallowRef, type Ref } from 'vue'
import {
  cloneDesignerDocument,
  decodeDesignerDocument,
  serializeDesignerDocument,
} from '@daxiangme/form-core'
import type { DesignerDocument, DesignerDocumentDecodeResult } from '@daxiangme/form-core'

/** 独立设计器命令引擎。文档之外的路由、接口和权限状态不得进入该模块。 */
export interface DesignerEngine {
  document: Ref<DesignerDocument>
  selectedNodeId: Ref<string>
  dirty: Readonly<Ref<boolean>>
  canUndo: Readonly<Ref<boolean>>
  canRedo: Readonly<Ref<boolean>>
  execute: (mutation: (draft: DesignerDocument) => void) => void
  commitExternalMutation: () => void
  replaceDocument: (document: DesignerDocument, keepHistory?: boolean) => void
  undo: () => void
  redo: () => void
  markClean: () => void
}

/**
 * 创建文档快照驱动的命令引擎。
 *
 * @param initialDocument 初始独立设计文档。
 * @param historyLimit 最大历史快照数量。
 * @returns 可由工作台装配的命令、历史、选择和脏状态。
 */
export function useDesignerEngine(
  initialDocument: DesignerDocument,
  historyLimit = 80,
): DesignerEngine {
  const document = shallowRef(cloneDesignerDocument(initialDocument))
  const selectedNodeId = ref('')
  const initialSnapshot = serializeDesignerDocument(document.value)
  const history = ref<string[]>([initialSnapshot])
  const historyIndex = ref(0)
  const cleanSnapshot = ref(initialSnapshot)
  const dirty = computed(() => serializeDesignerDocument(document.value) !== cleanSnapshot.value)
  const canUndo = computed(() => historyIndex.value > 0)
  const canRedo = computed(() => historyIndex.value < history.value.length - 1)

  /** 在克隆草稿中执行原子修改并提交一个历史快照。 */
  function execute(mutation: (draft: DesignerDocument) => void): void {
    const draft = cloneDesignerDocument(document.value)
    mutation(draft)
    commitDocument(draft)
  }

  /** 记录拖拽库已经完成的受控数组修改。 */
  function commitExternalMutation(): void {
    commitDocument(cloneDesignerDocument(document.value), true)
  }

  /** 替换完整文档；导入保留为可撤销命令，初始化或恢复则重置历史。 */
  function replaceDocument(next: DesignerDocument, keepHistory = false): void {
    if (keepHistory) {
      commitDocument(cloneDesignerDocument(next))
      return
    }
    const snapshot = serializeDesignerDocument(next)
    document.value = cloneDesignerDocument(next)
    history.value = [snapshot]
    historyIndex.value = 0
    cleanSnapshot.value = snapshot
    selectedNodeId.value = ''
  }

  /** 撤销最近一次命令。 */
  function undo(): void {
    if (!canUndo.value) return
    historyIndex.value -= 1
    restoreSnapshot(history.value[historyIndex.value]!)
  }

  /** 重做最近一次被撤销的命令。 */
  function redo(): void {
    if (!canRedo.value) return
    historyIndex.value += 1
    restoreSnapshot(history.value[historyIndex.value]!)
  }

  /** 将当前文档标记为已保存基线。 */
  function markClean(): void {
    cleanSnapshot.value = serializeDesignerDocument(document.value)
  }

  function commitDocument(next: DesignerDocument, allowSameSnapshot = false): void {
    const snapshot = serializeDesignerDocument(next)
    const current = history.value[historyIndex.value]
    document.value = next
    if (!allowSameSnapshot && snapshot === current) return
    if (snapshot === current) return
    history.value = history.value.slice(0, historyIndex.value + 1)
    history.value.push(snapshot)
    if (history.value.length > historyLimit) history.value.shift()
    historyIndex.value = history.value.length - 1
  }

  function restoreSnapshot(snapshot: string): void {
    const parsed = JSON.parse(snapshot) as unknown
    const decoded = decodeDesignerDocument(parsed)
    if (!decoded.document) return
    document.value = decoded.document
    if (!selectedNodeExists(document.value, selectedNodeId.value)) selectedNodeId.value = ''
  }

  return {
    document,
    selectedNodeId,
    dirty,
    canUndo,
    canRedo,
    execute,
    commitExternalMutation,
    replaceDocument,
    undo,
    redo,
    markClean,
  }
}

/** 将未知导入内容转换为可替换文档。 */
export function decodeDesignerImport(source: string): DesignerDocumentDecodeResult {
  try {
    return decodeDesignerDocument(JSON.parse(source) as unknown)
  } catch {
    return {
      diagnostics: [
        { severity: 'ERROR', code: 'IMPORT_JSON', message: '导入文件不是合法 JSON', path: '$' },
      ],
    }
  }
}

function selectedNodeExists(document: DesignerDocument, nodeId: string): boolean {
  if (!nodeId) return false
  const visit = (nodes: DesignerDocument['uiSchema']['root']): boolean => {
    for (const node of nodes) {
      if (node.id === nodeId) return true
      if (node.nodeType === 'CONTAINER' && node.slots.some((slot) => visit(slot.children)))
        return true
    }
    return false
  }
  return [
    document.uiSchema.root,
    ...document.uiSchema.overlays.map((overlay) => overlay.root),
  ].some(visit)
}
