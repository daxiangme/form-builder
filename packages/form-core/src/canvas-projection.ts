import type {
  DesignerCanvasCell,
  DesignerCanvasGap,
  DesignerCanvasProjection,
  DesignerDevice,
  DesignerLayoutNode,
} from './types'

const GRID_COLUMNS = 24

/**
 * 将顺序布局节点投影为只读 24 栅格行。
 *
 * 投影只负责设计态定位和空白落点，权威顺序、跨度与偏移仍保存在 UI Schema 中。
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
    const span = clampGridValue(grid.span, 1, GRID_COLUMNS)
    const offset = clampGridValue(grid.offset, 0, GRID_COLUMNS - 1)

    // 当前行剩余空间不足时换行；偏移在新行重新解释，避免节点溢出 24 栅格。
    if (cursor > 0 && cursor + offset + span > GRID_COLUMNS) {
      appendTrailingGap(gaps, row, cursor, index)
      row += 1
      cursor = 0
    }

    const start = Math.min(GRID_COLUMNS - span, cursor + offset)
    if (start > cursor) gaps.push({ index, row, start: cursor, span: start - cursor })
    cells.push({ nodeId: node.id, index, row, start, span })
    cursor = start + span

    if (cursor >= GRID_COLUMNS) {
      row += 1
      cursor = 0
    }
  }

  if (nodes.length === 0) return { cells, gaps, rowCount: 1 }
  if (cursor > 0) appendTrailingGap(gaps, row, cursor, nodes.length)
  return { cells, gaps, rowCount: Math.max(1, row + (cursor > 0 ? 1 : 0)) }
}

function appendTrailingGap(
  gaps: DesignerCanvasGap[],
  row: number,
  cursor: number,
  index: number,
): void {
  if (cursor >= GRID_COLUMNS) return
  gaps.push({ index, row, start: cursor, span: GRID_COLUMNS - cursor })
}

function clampGridValue(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return minimum
  return Math.max(minimum, Math.min(maximum, Math.trunc(value)))
}
