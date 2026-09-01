import type { DesignerPropertyOption } from './types'

/** 属性面板共用的标准间距预设，单位为 px。 */
export const DESIGNER_SPACING_PRESETS = numberOptions([0, 4, 8, 12, 16, 24, 32, 48], (value) =>
  value === 0 ? '无间距 · 0 px' : `${spacingName(value)} · ${value} px`,
)

/** 属性面板共用的标准字号预设，单位为 px。 */
export const DESIGNER_FONT_SIZE_PRESETS = numberOptions(
  [12, 14, 16, 18, 20, 24, 28, 32, 36, 48],
  (value) => `${value} px`,
)

/** 子表和引用列表共用的分页数量预设。 */
export const DESIGNER_PAGE_SIZE_PRESETS = numberOptions(
  [5, 10, 20, 50, 100],
  (value) => `${value} 条/页`,
)

/** 子表初始记录数量预设。 */
export const DESIGNER_INITIAL_COUNT_PRESETS = numberOptions([0, 1, 2, 3, 5, 10, 20], (value) =>
  value === 0 ? '不预置' : `${value} 条`,
)

/** 文本和意见控件共用的长度预设。 */
export const DESIGNER_LENGTH_PRESETS = numberOptions(
  [50, 100, 255, 500, 1000, 2000, 5000, 10000],
  (value) => `${value} 字符`,
)

/** 多选控件共用的数量上限预设。 */
export const DESIGNER_SELECTION_COUNT_PRESETS = numberOptions(
  [1, 3, 5, 10, 20, 50, 100],
  (value) => `${value} 项`,
)

/** 支持 0 表示不限制的多选数量预设。 */
export const DESIGNER_OPTIONAL_SELECTION_COUNT_PRESETS: DesignerPropertyOption[] = [
  { label: '不限', value: 0 },
  ...DESIGNER_SELECTION_COUNT_PRESETS,
]

/** 文件大小预设，单位为 MB。 */
export const DESIGNER_FILE_SIZE_PRESETS = numberOptions(
  [1, 5, 10, 20, 50, 100, 200, 500, 1024],
  (value) => `${value} MB`,
)

/** 浏览器定位超时预设，存储值继续使用毫秒。 */
export const DESIGNER_TIMEOUT_PRESETS = numberOptions([3000, 5000, 10000, 30000, 60000], (value) =>
  value < 60000 ? `${value / 1000} 秒` : '60 秒',
)

/** PC 端 24 栅格跨度预设。 */
export const DESIGNER_PC_SPAN_PRESETS: DesignerPropertyOption[] = [
  { label: '1/4 · 6/24', value: 6 },
  { label: '1/3 · 8/24', value: 8 },
  { label: '1/2 · 12/24', value: 12 },
  { label: '2/3 · 16/24', value: 16 },
  { label: '3/4 · 18/24', value: 18 },
  { label: '整行 · 24/24', value: 24 },
]

/** 移动端 24 栅格跨度预设。 */
export const DESIGNER_MOBILE_SPAN_PRESETS: DesignerPropertyOption[] = [
  { label: '半行 · 12/24', value: 12 },
  { label: '整行 · 24/24', value: 24 },
]

/** 数字字段的货币代码；运行时再映射为展示符号。 */
export const DESIGNER_CURRENCY_PRESETS: DesignerPropertyOption[] = [
  { label: '无货币', value: '' },
  { label: 'CNY · 人民币', value: 'CNY' },
  { label: 'USD · 美元', value: 'USD' },
  { label: 'EUR · 欧元', value: 'EUR' },
  { label: 'GBP · 英镑', value: 'GBP' },
  { label: 'JPY · 日元', value: 'JPY' },
  { label: 'HKD · 港币', value: 'HKD' },
  { label: 'TWD · 新台币', value: 'TWD' },
]

/** 附件类型编辑器支持的已知扩展名和快捷分组。 */
export const DESIGNER_FILE_TYPE_OPTIONS: Array<{
  label: string
  extensions: string[]
  group: boolean
}> = [
  { label: '图片', extensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp'], group: true },
  { label: '文档', extensions: ['.doc', '.docx', '.txt', '.rtf'], group: true },
  { label: '表格', extensions: ['.xls', '.xlsx', '.csv'], group: true },
  { label: '演示', extensions: ['.ppt', '.pptx'], group: true },
  { label: 'PDF', extensions: ['.pdf'], group: true },
  { label: '压缩包', extensions: ['.zip', '.rar', '.7z'], group: true },
  ...[
    '.jpg',
    '.jpeg',
    '.png',
    '.gif',
    '.webp',
    '.doc',
    '.docx',
    '.txt',
    '.rtf',
    '.xls',
    '.xlsx',
    '.csv',
    '.ppt',
    '.pptx',
    '.pdf',
    '.zip',
    '.rar',
    '.7z',
  ].map((extension) => ({ label: extension.toUpperCase(), extensions: [extension], group: false })),
]

/**
 * 根据日期组件的当前语义返回合法显示格式。
 *
 * @param sourceValue 日期类型或日期范围类型。
 * @returns 可供属性编辑器展示的受控格式。
 */
export function designerDateFormatOptions(sourceValue: unknown): DesignerPropertyOption[] {
  if (sourceValue === 'datetime' || sourceValue === 'DATETIME') {
    return [
      { label: '年-月-日 时:分', value: 'YYYY-MM-DD HH:mm' },
      { label: '年-月-日 时:分:秒', value: 'YYYY-MM-DD HH:mm:ss' },
      { label: '年/月/日 时:分', value: 'YYYY/MM/DD HH:mm' },
    ]
  }
  if (sourceValue === 'month') {
    return [
      { label: '年-月', value: 'YYYY-MM' },
      { label: '年/月', value: 'YYYY/MM' },
      { label: '年月', value: 'YYYY年MM月' },
    ]
  }
  if (sourceValue === 'year') return [{ label: '年份', value: 'YYYY' }]
  return [
    { label: '年-月-日', value: 'YYYY-MM-DD' },
    { label: '年/月/日', value: 'YYYY/MM/DD' },
    { label: '年月日', value: 'YYYY年MM月DD日' },
  ]
}

/**
 * 为预设选择追加合法的历史当前值，避免打开旧草稿时出现空白或自动迁移。
 *
 * @param options 当前编辑器允许产生的预设选项。
 * @param current 文档中已经存在的值。
 * @param formatCurrent 历史值显示函数。
 * @returns 保留原选项顺序并在必要时前置“当前值”的新数组。
 */
export function includeDesignerCurrentOption(
  options: readonly DesignerPropertyOption[],
  current: unknown,
  formatCurrent: (value: string | number | boolean) => string = (value) => String(value),
): DesignerPropertyOption[] {
  if (!['string', 'number', 'boolean'].includes(typeof current)) return [...options]
  const primitive = current as string | number | boolean
  if (options.some((option) => option.value === primitive)) return [...options]
  return [{ label: `当前值 · ${formatCurrent(primitive)}`, value: primitive }, ...options]
}

/**
 * 生成数值型受控选项。
 *
 * @param values 数值集合。
 * @param labeler 显示文案函数。
 * @returns Element Plus 可直接消费的稳定选项。
 */
export function numberOptions(
  values: number[],
  labeler: (value: number) => string,
): DesignerPropertyOption[] {
  return values.map((value) => ({ value, label: labeler(value) }))
}

function spacingName(value: number): string {
  if (value <= 4) return '极紧凑'
  if (value <= 8) return '紧凑'
  if (value <= 16) return '标准'
  if (value <= 24) return '宽松'
  return '大间距'
}
