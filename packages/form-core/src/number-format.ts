/** 数字字段格式化所需的受控配置。 */
export interface DesignerNumberFormatConfiguration {
  precision?: unknown
  currencyPrefix?: unknown
  thousandsSeparator?: unknown
  uppercaseRmb?: unknown
}

/**
 * 将数字字段值格式化为设计、只读与详情共用的展示文本。
 *
 * @param value 原始数字值。
 * @param configuration 数字组件的受控格式配置。
 * @returns 包含精度、千分位、货币前缀和可选人民币大写的展示文本。
 */
export function formatDesignerNumber(
  value: number,
  configuration: DesignerNumberFormatConfiguration,
): string {
  if (!Number.isFinite(value)) return '—'
  const precision = resolveDesignerNumberPrecision(configuration)
  const displayValue = Number(value.toFixed(precision))
  const formatted =
    configuration.thousandsSeparator === true
      ? displayValue.toLocaleString('zh-CN', {
          minimumFractionDigits: precision,
          maximumFractionDigits: precision,
        })
      : displayValue.toFixed(precision)
  const configuredCurrency =
    typeof configuration.currencyPrefix === 'string' ? configuration.currencyPrefix : ''
  const prefix = DESIGNER_CURRENCY_SYMBOLS[configuredCurrency] ?? configuredCurrency
  const uppercase =
    configuration.uppercaseRmb === true ? `（${formatDesignerRmbUppercase(displayValue)}）` : ''
  return `${prefix}${formatted}${uppercase}`
}

/**
 * 解析数字输入与展示共同使用的有效精度。
 *
 * @param configuration 数字组件的受控格式配置。
 * @returns 0～10 之间的整数；人民币大写只影响附加文本，不改变字段输入和主显示精度。
 */
export function resolveDesignerNumberPrecision(
  configuration: DesignerNumberFormatConfiguration,
): number {
  return normalizePrecision(configuration.precision)
}

/**
 * 将数字转换为人民币大写文本。
 *
 * @param value 待转换金额。
 * @returns 人民币大写文本；超出受控范围时返回明确说明。
 */
export function formatDesignerRmbUppercase(value: number): string {
  if (!Number.isFinite(value) || Math.abs(value) > 9999999999999.99) return '超出大写金额范围'
  const negative = value < 0 ? '负' : ''
  const totalFen = Math.round(Math.abs(value) * 100)
  const integer = Math.floor(totalFen / 100)
  const jiao = Math.floor((totalFen % 100) / 10)
  const fen = totalFen % 10
  const integerText = integer === 0 ? '零' : formatRmbInteger(integer)
  if (jiao === 0 && fen === 0) return `${negative}${integerText}元整`
  const fractionText = `${jiao > 0 ? `${RMB_DIGITS[jiao]}角` : integer > 0 && fen > 0 ? '零' : ''}${
    fen > 0 ? `${RMB_DIGITS[fen]}分` : ''
  }`
  return `${negative}${integerText}元${fractionText}`
}

const RMB_DIGITS = '零壹贰叁肆伍陆柒捌玖'
const RMB_GROUP_UNITS = ['', '万', '亿', '兆']
const RMB_POSITION_UNITS = ['', '拾', '佰', '仟']
const DESIGNER_CURRENCY_SYMBOLS: Record<string, string> = {
  CNY: '¥',
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  HKD: 'HK$',
  TWD: 'NT$',
}

/**
 * 将非负整数转换为人民币整数部分。
 *
 * @param value 非负整数。
 * @returns 不包含“元”的人民币整数文本。
 */
function formatRmbInteger(value: number): string {
  const groups: number[] = []
  let remaining = value
  while (remaining > 0) {
    groups.push(remaining % 10000)
    remaining = Math.floor(remaining / 10000)
  }
  let result = ''
  let pendingZero = false
  for (let index = groups.length - 1; index >= 0; index -= 1) {
    const group = groups[index] ?? 0
    if (group === 0) {
      if (result) pendingZero = true
      continue
    }
    if (result && (pendingZero || group < 1000)) result += RMB_DIGITS[0]
    result += `${formatRmbGroup(group)}${RMB_GROUP_UNITS[index] ?? ''}`
    pendingZero = false
  }
  return result
}

/**
 * 格式化单个四位人民币数字分组。
 *
 * @param value 0～9999 的整数。
 * @returns 分组内的大写文本。
 */
function formatRmbGroup(value: number): string {
  let result = ''
  let pendingZero = false
  for (let position = 3; position >= 0; position -= 1) {
    const digit = Math.floor(value / 10 ** position) % 10
    if (digit === 0) {
      if (result) pendingZero = true
      continue
    }
    if (pendingZero) result += RMB_DIGITS[0]
    result += `${RMB_DIGITS[digit]}${RMB_POSITION_UNITS[position]}`
    pendingZero = false
  }
  return result
}

/**
 * 规范化受控的小数精度。
 *
 * @param value 原始配置值。
 * @returns 0～10 之间的整数精度。
 */
function normalizePrecision(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  return Math.max(0, Math.min(10, Math.trunc(value)))
}
