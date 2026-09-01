import type {
  DesignerContainerNode,
  DesignerField,
  DesignerSubtableColumn,
  DesignerSubtableRow,
} from './types'

/** 子表栅格可选区域；序号列和操作列必须与数据列一起生成同一模板。 */
export interface DesignerSubtableGridOptions {
  showIndex?: boolean
  showActions?: boolean
  indexWidth?: number
  actionWidth?: number
}

/** 子表表头、编辑行和详情行共用的 CSS Grid 布局结果。 */
export interface DesignerSubtableGridLayout {
  template: string
  minimumWidth: string
}

/** 子表列投影的设计态与运行态可见性选项。 */
export interface DesignerSubtableProjectionOptions {
  /** 设计态可保留历史隐藏字段以便用户修复；运行态必须保持关闭。 */
  includeHidden?: boolean
}

/**
 * 将容器的命名插槽投影为稳定子表列。
 *
 * 只有字段节点可以形成数据列；布局节点由 DropPolicy 拒绝，历史异常节点在投影阶段失败关闭，
 * 不会被伪装为可编辑文本列。缺失字段仍保留列身份并标记为失效，方便设计态定位问题。
 *
 * @param container 子表容器节点。
 * @param fields 文档中的本地字段集合。
 * @param slotCode 可选命名插槽；省略时使用首个插槽。
 * @param options 设计态或运行态的可见性选项。
 * @returns 不持有可变节点引用的稳定列投影。
 */
export function projectDesignerSubtableColumns(
  container: DesignerContainerNode,
  fields: readonly DesignerField[],
  slotCode?: string,
  options: DesignerSubtableProjectionOptions = {},
): DesignerSubtableColumn[] {
  if (container.slots.length !== 1 || container.slots[0]?.slotCode !== 'content') return []
  const slot = slotCode
    ? container.slots.find((item) => item.slotCode === slotCode)
    : container.slots[0]
  const fieldMap = new Map(fields.map((field) => [field.id, field]))
  const columnFieldIds = new Set<string>()

  for (const node of slot?.children ?? []) {
    if (node.nodeType !== 'FIELD' || columnFieldIds.has(node.fieldId)) return []
    columnFieldIds.add(node.fieldId)
  }

  return (slot?.children ?? []).flatMap((node) => {
    if (node.nodeType !== 'FIELD') return []
    const field = fieldMap.get(node.fieldId)
    if (!options.includeHidden && (field?.display.hidden || field?.componentType === 'hidden'))
      return []
    return [
      {
        columnId: node.id,
        fieldId: node.fieldId,
        fieldKey: field?.key ?? node.fieldId,
        label: field?.label ?? '失效字段',
        componentType: field?.componentType ?? 'unknown',
        semanticType: field?.semanticType ?? 'STRING',
      },
    ]
  })
}

/**
 * 为子表所有呈现模式生成同一个列模板和最小宽度。
 *
 * @param columns 稳定列投影。
 * @param options 序号列、操作列及其宽度配置。
 * @returns 可直接绑定到表格滚动内容和每一行的布局参数。
 */
export function createDesignerSubtableGridLayout(
  columns: readonly DesignerSubtableColumn[],
  options: DesignerSubtableGridOptions = {},
): DesignerSubtableGridLayout {
  const indexWidth = normalizeFixedWidth(options.indexWidth, 56)
  const actionWidth = normalizeFixedWidth(options.actionWidth, 120)
  const dataTracks = columns.map((column) => `minmax(${columnMinimumWidth(column)}px, 1fr)`)
  const tracks = [
    ...(options.showIndex ? [`${indexWidth}px`] : []),
    ...dataTracks,
    ...(options.showActions ? [`${actionWidth}px`] : []),
  ]
  const minimumWidth =
    (options.showIndex ? indexWidth : 0) +
    columns.reduce((total, column) => total + columnMinimumWidth(column), 0) +
    (options.showActions ? actionWidth : 0)

  return {
    template: tracks.length > 0 ? tracks.join(' ') : 'minmax(160px, 1fr)',
    minimumWidth: `${Math.max(minimumWidth, 160)}px`,
  }
}

/**
 * 按当前列结构创建一条只存在于预览副本中的空白子表行。
 *
 * @param columns 当前子表列投影。
 * @param seedValues 可选初始值；未声明列不会被擅自写入。
 * @returns 具有全新行身份和值容器的子表行。
 */
export function createDesignerSubtableRow(
  columns: readonly DesignerSubtableColumn[],
  seedValues: Readonly<Record<string, unknown>> = {},
): DesignerSubtableRow {
  return {
    rowId: createRuntimeRowId(),
    values: Object.fromEntries(
      columns.map((column) => [column.fieldId, cloneRuntimeValue(seedValues[column.fieldId])]),
    ),
  }
}

/**
 * 深复制一条子表行并分配新身份，避免复制后的字段值与源行共享可变引用。
 *
 * @param source 源子表行。
 * @returns 可独立编辑的新子表行。
 */
export function cloneDesignerSubtableRow(source: DesignerSubtableRow): DesignerSubtableRow {
  return {
    rowId: createRuntimeRowId(),
    values: cloneRuntimeValue(source.values) as Record<string, unknown>,
  }
}

/** 根据控件的实际输入宽度给出列下限，避免日期范围、文件等控件被过度压缩。 */
function columnMinimumWidth(column: DesignerSubtableColumn): number {
  if (
    ['date-range', 'date-multiple', 'file', 'signature', 'rich-text'].includes(column.componentType)
  ) {
    return 220
  }
  if (['LONG_TEXT', 'ARRAY', 'OBJECT'].includes(column.semanticType)) return 200
  if (['DATE', 'DATE_TIME'].includes(column.semanticType)) return 180
  return 160
}

/** 固定列宽仅接受合理正数，避免异常配置破坏整个表格投影。 */
function normalizeFixedWidth(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
}

/** 生成仅用于当前浏览器预览会话的稳定行身份。 */
function createRuntimeRowId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID()
  return `row-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** 优先使用浏览器结构化克隆；无法克隆的宿主对象保留引用，避免破坏文件等本地值。 */
function cloneRuntimeValue<T>(value: T): T {
  if (value === undefined || value === null) return value
  if (typeof globalThis.structuredClone === 'function') {
    try {
      return globalThis.structuredClone(value)
    } catch {
      // 文件句柄等宿主对象可能无法结构化克隆，继续使用保守递归策略。
    }
  }
  if (Array.isArray(value)) return value.map((item) => cloneRuntimeValue(item)) as T
  if (value instanceof Date) return new Date(value.getTime()) as T
  if (Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        cloneRuntimeValue(item),
      ]),
    ) as T
  }
  return value
}
