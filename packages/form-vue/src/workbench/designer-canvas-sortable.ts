/** 设计画布 Sortable 共用组，允许节点在根布局与容器插槽之间互相放入。 */
export const DESIGNER_CANVAS_SORTABLE_GROUP = {
  name: 'daxiang-form-designer-canvas',
  pull: true,
  put: true,
} as const

/** 根列表空态捕获半径，便于把节点拖到画布底部空白处。 */
export const DESIGNER_CANVAS_EMPTY_INSERT_THRESHOLD = 48

/**
 * 嵌套插槽不向外扩展空列表吸附，避免拖出分组时被空槽吸回。
 * 放入空分组仍看插槽自身高度，不依赖该半径。
 */
export const DESIGNER_CANVAS_NESTED_EMPTY_INSERT_THRESHOLD = 0

/** 嵌套反转交换比例，指针靠近分组上下沿时优先落到父级列表。 */
export const DESIGNER_CANVAS_SWAP_THRESHOLD = 0.65

/** 嵌套插槽边缘内缩，指针越出后拒绝继续放入当前容器。 */
export const DESIGNER_CANVAS_NESTED_ESCAPE_PX = 8
