import type {
  DesignerCanvasCell,
  DesignerCanvasFlowItem,
  DesignerCanvasGap,
  DesignerCanvasProjection,
  DesignerDevice,
  DesignerLayoutNode,
} from './types'

/** 设计器与运行态共用的 24 列栅格。 */
export const DESIGNER_GRID_COLUMNS = 24

/**
 * 将顺序布局节点投影为只读 24 栅格行。
 *
 * 投影只负责定位和空白落点，权威顺序、跨度与偏移仍保存在 UI Schema 中。
 * 偏移是相对上一节点的左留白；当前行剩余列不足以放下「偏移 + 跨度」时换行，
 * 并从新行第 0 列起排，不再把偏移带到新行。
 *
 * @param nodes 当前根或命名插槽中的顺序节点。
 * @param device 当前设计设备。
 * @returns 可供画布渲染的节点单元、空白单元和总行数。
 */
export function projectDesignerCanvas(
  nodes: DesignerLayoutNode[],
  device: DesignerDevice,
): DesignerCanvasProjection {
  const cells: DesignerCanvasCell[] = []
  const gaps: DesignerCanvasGap[] = []
  let row = 0
  let cursor = 0

  for (const [index, node] of nodes.entries()) {
    const grid = node.layout[device === 'mobile' ? 'mobile' : 'pc']
    const span = clampGridValue(grid.span, 1, DESIGNER_GRID_COLUMNS)
    const offset = clampGridValue(grid.offset, 0, DESIGNER_GRID_COLUMNS - 1)
    const wrapped = cursor > 0 && cursor + offset + span > DESIGNER_GRID_COLUMNS

    if (wrapped) {
      appendTrailingGap(gaps, row, cursor, index)
      row += 1
      cursor = 0
    }

    const start = wrapped ? 0 : Math.min(DESIGNER_GRID_COLUMNS - span, cursor + offset)
    if (start > cursor) gaps.push({ index, row, start: cursor, span: start - cursor })
    cells.push({ nodeId: node.id, index, row, start, span })
    cursor = start + span

    if (cursor >= DESIGNER_GRID_COLUMNS) {
      row += 1
      cursor = 0
    }
  }

  if (nodes.length === 0) return { cells, gaps, rowCount: 1 }
  if (cursor > 0) appendTrailingGap(gaps, row, cursor, nodes.length)
  return { cells, gaps, rowCount: Math.max(1, row + (cursor > 0 ? 1 : 0)) }
}

/**
 * 按前序节点推进 24 栅格光标，换行规则与 {@link projectDesignerCanvas} 一致。
 *
 * 当前行剩余列放不下「偏移 + 跨度」时换行，新行只按跨度占用，偏移不带到新行。
 *
 * @param cursor 前序节点结束后的列游标，满行时为 0。
 * @param offset 当前节点偏移列数。
 * @param span 当前节点跨度。
 * @returns 该节点结束后的列游标。
 */
export function advanceDesignerGridCursor(cursor: number, offset: number, span: number): number {
  const nextSpan = clampGridValue(span, 1, DESIGNER_GRID_COLUMNS)
  const nextOffset = clampGridValue(offset, 0, DESIGNER_GRID_COLUMNS - 1)
  if (cursor > 0 && cursor + nextOffset + nextSpan > DESIGNER_GRID_COLUMNS) {
    return nextSpan >= DESIGNER_GRID_COLUMNS ? 0 : nextSpan
  }
  const next = Math.min(DESIGNER_GRID_COLUMNS, cursor + nextOffset + nextSpan)
  return next >= DESIGNER_GRID_COLUMNS ? 0 : next
}

/**
 * 将栅格投影摊成运行态 ElRow 可用的「空白列 + 节点」顺序流。
 *
 * 行尾未填满的空白不输出，避免在最后一个控件后再插入空列。换行前吃掉本行剩余的空白会输出，
 * 以便 Element Plus 列在同一 flex 行被占满后自然换到下一行顶格。
 *
 * @param nodes 当前实际占据栅格的顺序节点。
 * @param device 当前呈现设备。
 * @returns 空白列与节点交替的渲染序列。
 */
export function flattenDesignerCanvasFlow(
  nodes: DesignerLayoutNode[],
  device: DesignerDevice,
): DesignerCanvasFlowItem[] {
  const projection = projectDesignerCanvas(nodes, device)
  const items: DesignerCanvasFlowItem[] = []

  for (const cell of projection.cells) {
    const node = nodes[cell.index]
    if (!node) continue
    const precedingGaps = projection.gaps
      .filter(
        (gap) =>
          gap.index === cell.index &&
          (gap.row < cell.row || (gap.row === cell.row && gap.start < cell.start)),
      )
      .sort((left, right) => left.row - right.row || left.start - right.start)
    for (const gap of precedingGaps) {
      items.push({
        kind: 'gap',
        key: `gap:${cell.nodeId}:${gap.row}:${gap.start}`,
        span: gap.span,
      })
    }
    items.push({ kind: 'node', key: node.id, node, span: cell.span })
  }

  return items
}

function appendTrailingGap(
  gaps: DesignerCanvasGap[],
  row: number,
  cursor: number,
  index: number,
): void {
  if (cursor >= DESIGNER_GRID_COLUMNS) return
  gaps.push({ index, row, start: cursor, span: DESIGNER_GRID_COLUMNS - cursor })
}

function clampGridValue(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return minimum
  return Math.max(minimum, Math.min(maximum, Math.trunc(value)))
}
