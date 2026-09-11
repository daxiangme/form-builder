import type {
  DesignerDiagnostic,
  DesignerDocument,
  DesignerExpression,
  DesignerExpressionFunction,
  DesignerExpressionRuntimeContext,
  DesignerField,
} from './types'
import { findDesignerComponent } from './component-registry'
import { resolveDesignerFieldValueKeys } from './field-assignment'

const MAX_EXPRESSION_DEPTH = 20
const MAX_EXPRESSION_NODES = 200

/** 计算声明式表达式；未知函数、越界深度或非法数值运算会失败关闭。 */
export function evaluateDesignerExpression(
  expression: DesignerExpression,
  runtime: DesignerExpressionRuntimeContext,
): unknown {
  let visited = 0
  const evaluate = (node: DesignerExpression, depth: number): unknown => {
    visited += 1
    if (depth > MAX_EXPRESSION_DEPTH || visited > MAX_EXPRESSION_NODES) {
      throw new Error('表达式复杂度超过限制')
    }
    if (node.kind === 'LITERAL') return node.value
    if (node.kind === 'FIELD') {
      const fieldValue = runtime.readField
        ? runtime.readField(node.fieldId, node.scope, node.ancestorDepth)
        : node.scope === 'ANCESTOR'
          ? readAncestorField(runtime, node.fieldId, node.ancestorDepth)
          : node.scope === 'CURRENT_ROW'
            ? runtime.currentRow?.[node.fieldId]
            : runtime.fields[node.fieldId]
      if (!node.valueKey) return fieldValue
      if (typeof fieldValue !== 'object' || fieldValue === null || Array.isArray(fieldValue)) {
        return undefined
      }
      return (fieldValue as Record<string, unknown>)[node.valueKey]
    }
    if (node.kind === 'VARIABLE') return runtime.variables[node.variableCode]
    if (node.kind === 'CONTEXT') return runtime.context[node.key]
    const values = node.arguments.map((argument) => evaluate(argument, depth + 1))
    return evaluateCall(node.function, values)
  }
  return evaluate(expression, 0)
}

/** 将表达式结果按布尔条件解释；异常和非布尔结果一律视为不成立。 */
export function evaluateDesignerCondition(
  expression: DesignerExpression | undefined,
  runtime: DesignerExpressionRuntimeContext,
): boolean {
  if (!expression) return true
  try {
    return evaluateDesignerExpression(expression, runtime) === true
  } catch {
    return false
  }
}

/** 收集表达式直接读取的字段主键。 */
export function collectDesignerExpressionFieldIds(expression: DesignerExpression): Set<string> {
  const result = new Set<string>()
  const visit = (node: DesignerExpression): void => {
    if (node.kind === 'FIELD') result.add(node.fieldId)
    if (node.kind === 'CALL') node.arguments.forEach(visit)
  }
  visit(expression)
  return result
}

/** 诊断表达式节点、字段/变量引用、作用域和复杂度。 */
export function diagnoseDesignerExpression(
  expression: unknown,
  document: DesignerDocument,
  path: string,
  options: {
    allowCurrentRow: boolean
    /** 当前字段所属实体；提供后当前行引用必须属于同一实体。 */
    currentEntityCode?: string
    /** 从直接父实体开始的合法祖先链。 */
    ancestorEntityCodes?: readonly string[]
  } = { allowCurrentRow: false },
): DesignerDiagnostic[] {
  const diagnostics: DesignerDiagnostic[] = []
  const fieldIds = new Set(
    Array.isArray(document.dataSchema?.fields)
      ? document.dataSchema.fields.map((field) => field.id)
      : [],
  )
  const fieldsById = new Map(
    Array.isArray(document.dataSchema?.fields)
      ? document.dataSchema.fields.map((field) => [field.id, field] as const)
      : [],
  )
  const variableCodes = new Set(
    Array.isArray(document.variables) ? document.variables.map((variable) => variable.code) : [],
  )
  let visited = 0
  const visit = (node: unknown, nodePath: string, depth: number): void => {
    visited += 1
    if (depth > MAX_EXPRESSION_DEPTH || visited > MAX_EXPRESSION_NODES) {
      diagnostics.push(error('EXPRESSION_COMPLEXITY', '表达式复杂度超过限制', nodePath))
      return
    }
    if (!isRecord(node) || typeof node.kind !== 'string') {
      diagnostics.push(error('EXPRESSION_NODE', '表达式节点必须是带 kind 的对象', nodePath))
      return
    }
    if (node.kind === 'LITERAL') {
      unknownKeys(node, ['kind', 'value'], nodePath, diagnostics)
      if (!isLiteral(node.value))
        diagnostics.push(error('EXPRESSION_LITERAL', '字面量类型不受支持', nodePath))
      return
    }
    if (node.kind === 'FIELD') {
      unknownKeys(
        node,
        ['kind', 'fieldId', 'scope', 'ancestorDepth', 'valueKey'],
        nodePath,
        diagnostics,
      )
      if (typeof node.fieldId !== 'string' || !fieldIds.has(node.fieldId)) {
        diagnostics.push(
          error('EXPRESSION_FIELD', '表达式引用了不存在的字段', `${nodePath}.fieldId`),
        )
      }
      if (!['ROOT', 'CURRENT_ROW', 'ANCESTOR'].includes(String(node.scope))) {
        diagnostics.push(error('EXPRESSION_SCOPE', '字段表达式作用域不正确', `${nodePath}.scope`))
      } else if (node.scope === 'CURRENT_ROW' && !options.allowCurrentRow) {
        diagnostics.push(
          error('EXPRESSION_SCOPE', '当前上下文不允许读取子表当前行', `${nodePath}.scope`),
        )
      } else {
        const field = fieldsById.get(String(node.fieldId))
        const rootEntityCode = document.dataSchema?.rootEntity?.code
        if (node.scope === 'ANCESTOR') {
          const depth = node.ancestorDepth
          if (!options.allowCurrentRow || !Number.isSafeInteger(depth) || Number(depth) < 1) {
            diagnostics.push(
              error(
                'EXPRESSION_ANCESTOR',
                '祖先引用必须具有有效的父链层数',
                `${nodePath}.ancestorDepth`,
              ),
            )
          } else if (
            options.ancestorEntityCodes
              ? options.ancestorEntityCodes[Number(depth) - 1] !== field?.entityCode
              : options.currentEntityCode &&
                field &&
                !hasAncestorEntity(
                  document,
                  options.currentEntityCode,
                  field.entityCode,
                  Number(depth),
                )
          ) {
            diagnostics.push(
              error('EXPRESSION_ANCESTOR', '字段不属于指定祖先实体', `${nodePath}.fieldId`),
            )
          }
        } else if (node.ancestorDepth !== undefined) {
          diagnostics.push(
            error(
              'EXPRESSION_ANCESTOR',
              '只有祖先作用域可以配置父链层数',
              `${nodePath}.ancestorDepth`,
            ),
          )
        }
        const sameAssociation = document.dataSchema.relations.some(
          (relation) =>
            relation.kind === 'MANY_TO_MANY' &&
            [relation.childEntity.code, relation.targetEntity.code].includes(
              options.currentEntityCode ?? '',
            ) &&
            [relation.childEntity.code, relation.targetEntity.code].includes(
              field?.entityCode ?? '',
            ),
        )
        if (
          node.scope === 'CURRENT_ROW' &&
          options.currentEntityCode &&
          field &&
          field.entityCode !== options.currentEntityCode &&
          !sameAssociation
        ) {
          diagnostics.push(
            error('EXPRESSION_SCOPE', '当前行引用必须属于当前实体', `${nodePath}.fieldId`),
          )
        }
        if (
          field &&
          rootEntityCode &&
          node.scope === 'CURRENT_ROW' &&
          field.entityCode === rootEntityCode
        ) {
          diagnostics.push(
            error('EXPRESSION_SCOPE', '当前行作用域只能读取子实体字段', `${nodePath}.scope`),
          )
        }
        if (
          field &&
          rootEntityCode &&
          node.scope === 'ROOT' &&
          field.entityCode !== rootEntityCode
        ) {
          diagnostics.push(
            error('EXPRESSION_SCOPE', '主表作用域不能读取子实体字段', `${nodePath}.scope`),
          )
        }
        diagnoseExpressionValueKey(node, field, nodePath, diagnostics)
      }
      return
    }
    if (node.kind === 'VARIABLE') {
      unknownKeys(node, ['kind', 'variableCode'], nodePath, diagnostics)
      if (typeof node.variableCode !== 'string' || !variableCodes.has(node.variableCode)) {
        diagnostics.push(
          error('EXPRESSION_VARIABLE', '表达式引用了不存在的表单变量', `${nodePath}.variableCode`),
        )
      }
      return
    }
    if (node.kind === 'CONTEXT') {
      unknownKeys(node, ['kind', 'key'], nodePath, diagnostics)
      if (
        !['RUNTIME_MODE', 'DEVICE', 'CURRENT_USER_ID', 'CURRENT_TENANT_ID', 'NOW'].includes(
          String(node.key),
        )
      ) {
        diagnostics.push(error('EXPRESSION_CONTEXT', '表达式上下文键不受支持', `${nodePath}.key`))
      }
      return
    }
    if (node.kind === 'CALL') {
      unknownKeys(node, ['kind', 'function', 'arguments'], nodePath, diagnostics)
      if (!isDesignerExpressionFunction(node.function)) {
        diagnostics.push(error('EXPRESSION_FUNCTION', '表达式函数不受支持', `${nodePath}.function`))
      }
      if (!Array.isArray(node.arguments)) {
        diagnostics.push(
          error('EXPRESSION_ARGUMENTS', '表达式参数必须是数组', `${nodePath}.arguments`),
        )
        return
      }
      if (
        isDesignerExpressionFunction(node.function) &&
        !validFunctionArgumentCount(node.function, node.arguments.length)
      ) {
        diagnostics.push(
          error('EXPRESSION_ARITY', '表达式函数参数数量不正确', `${nodePath}.arguments`),
        )
      }
      node.arguments.forEach((argument, index) =>
        visit(argument, `${nodePath}.arguments[${index}]`, depth + 1),
      )
      return
    }
    diagnostics.push(error('EXPRESSION_KIND', `不支持表达式节点 ${node.kind}`, `${nodePath}.kind`))
  }
  visit(expression, path, 0)
  return diagnostics
}

/** 诊断字段计算依赖，并返回可安全执行的拓扑顺序。 */
export function resolveDesignerFieldEvaluationOrder(document: DesignerDocument): {
  orderedFields: DesignerField[]
  diagnostics: DesignerDiagnostic[]
} {
  const fieldsWithRules = document.dataSchema.fields.filter(
    (field) => field.behavior.valueRules.length > 0,
  )
  const byId = new Map(fieldsWithRules.map((field) => [field.id, field]))
  const dependencies = new Map<string, Set<string>>()
  for (const field of fieldsWithRules) {
    const fieldDependencies = new Set<string>()
    for (const rule of field.behavior.valueRules) {
      for (const fieldId of collectDesignerExpressionFieldIds(rule.expression)) {
        if (byId.has(fieldId)) fieldDependencies.add(fieldId)
      }
      if (rule.condition) {
        for (const fieldId of collectDesignerExpressionFieldIds(rule.condition)) {
          if (byId.has(fieldId)) fieldDependencies.add(fieldId)
        }
      }
    }
    dependencies.set(field.id, fieldDependencies)
  }
  const orderedFields: DesignerField[] = []
  const diagnostics: DesignerDiagnostic[] = []
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const visit = (fieldId: string, trail: string[]): void => {
    if (visited.has(fieldId)) return
    if (visiting.has(fieldId)) {
      diagnostics.push(
        error(
          'FIELD_VALUE_RULE_CYCLE',
          `字段计算存在循环依赖：${[...trail, fieldId].join(' → ')}`,
          '$.dataSchema.fields',
        ),
      )
      return
    }
    visiting.add(fieldId)
    for (const dependency of dependencies.get(fieldId) ?? []) visit(dependency, [...trail, fieldId])
    visiting.delete(fieldId)
    visited.add(fieldId)
    const field = byId.get(fieldId)
    if (field) orderedFields.push(field)
  }
  fieldsWithRules.forEach((field) => visit(field.id, []))
  return { orderedFields, diagnostics }
}

function evaluateCall(name: DesignerExpressionFunction, values: unknown[]): unknown {
  if (name === 'AND') return values.every(Boolean)
  if (name === 'OR') return values.some(Boolean)
  if (name === 'NOT') return !values[0]
  if (name === 'EQ') return values[0] === values[1]
  if (name === 'NE') return values[0] !== values[1]
  if (name === 'GT') return comparable(values[0]) > comparable(values[1])
  if (name === 'GTE') return comparable(values[0]) >= comparable(values[1])
  if (name === 'LT') return comparable(values[0]) < comparable(values[1])
  if (name === 'LTE') return comparable(values[0]) <= comparable(values[1])
  if (name === 'EMPTY') return isEmpty(values[0])
  if (name === 'NOT_EMPTY') return !isEmpty(values[0])
  if (name === 'IN') return Array.isArray(values[1]) && values[1].includes(values[0])
  if (name === 'CONTAINS') {
    return typeof values[0] === 'string'
      ? values[0].includes(String(values[1] ?? ''))
      : Array.isArray(values[0]) && values[0].includes(values[1])
  }
  if (name === 'ADD') return numeric(values[0]) + numeric(values[1])
  if (name === 'SUBTRACT') return numeric(values[0]) - numeric(values[1])
  if (name === 'MULTIPLY') return numeric(values[0]) * numeric(values[1])
  if (name === 'DIVIDE') {
    const divisor = numeric(values[1])
    if (divisor === 0) throw new Error('除数不能为零')
    return numeric(values[0]) / divisor
  }
  if (name === 'CONCAT') return values.map((value) => String(value ?? '')).join('')
  if (name === 'COALESCE') return values.find((value) => !isEmpty(value)) ?? null
  if (name === 'LENGTH')
    return typeof values[0] === 'string' || Array.isArray(values[0]) ? values[0].length : 0
  if (name === 'IF') return values[0] ? values[1] : values[2]
  throw new Error(`不支持表达式函数 ${name}`)
}

function numeric(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('表达式数值参数不正确')
  return value
}

function comparable(value: unknown): number | string {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') return value
  throw new Error('表达式比较参数不正确')
}

function isEmpty(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
  )
}

function isLiteral(value: unknown): boolean {
  return value === null || ['string', 'number', 'boolean'].includes(typeof value)
}

function isDesignerExpressionFunction(value: unknown): boolean {
  return [
    'AND',
    'OR',
    'NOT',
    'EQ',
    'NE',
    'GT',
    'GTE',
    'LT',
    'LTE',
    'EMPTY',
    'NOT_EMPTY',
    'IN',
    'CONTAINS',
    'ADD',
    'SUBTRACT',
    'MULTIPLY',
    'DIVIDE',
    'CONCAT',
    'COALESCE',
    'LENGTH',
    'IF',
  ].includes(String(value))
}

function hasAncestorEntity(
  document: DesignerDocument,
  currentEntityCode: string,
  targetEntityCode: string,
  depth: number,
): boolean {
  const entities = new Map(document.dataSchema.entities.map((entity) => [entity.id, entity.code]))
  let codes = new Set([currentEntityCode])
  const seen = new Map<string, number>()
  for (let level = 0; level < depth; level += 1) {
    const key = JSON.stringify([...codes].sort())
    const previous = seen.get(key)
    if (previous !== undefined) {
      const cycle = level - previous
      const remaining = (depth - level) % cycle
      if (remaining === 0) return codes.has(targetEntityCode)
      level = depth - remaining
    } else seen.set(key, level)
    codes = new Set(
      document.dataSchema.relations.flatMap((relation) => {
        const matches =
          codes.has(relation.childEntity.code) ||
          (relation.kind === 'MANY_TO_MANY' && codes.has(relation.targetEntity.code))
        const parent = matches ? entities.get(relation.parentEntityId) : undefined
        return parent ? [parent] : []
      }),
    )
    if (codes.size === 0) return false
  }
  return codes.has(targetEntityCode)
}

function readAncestorField(
  runtime: DesignerExpressionRuntimeContext,
  fieldId: string,
  ancestorDepth: number | undefined,
): unknown {
  if (!Number.isInteger(ancestorDepth) || !ancestorDepth || ancestorDepth < 1) {
    throw new Error('祖先层数不正确')
  }
  const ancestor = runtime.ancestors?.[ancestorDepth - 1]
  if (!ancestor) throw new Error('祖先作用域不存在')
  return ancestor[fieldId]
}

function diagnoseExpressionValueKey(
  node: Record<string, unknown>,
  field: DesignerField | undefined,
  nodePath: string,
  diagnostics: DesignerDiagnostic[],
): void {
  if (node.valueKey === undefined) return
  if (typeof node.valueKey !== 'string' || !node.valueKey) {
    diagnostics.push(
      error('EXPRESSION_FIELD_VALUE_KEY', '对象字段属性名不正确', `${nodePath}.valueKey`),
    )
    return
  }
  if (!field) return
  const registration = findDesignerComponent(field.componentType)
  const keys = resolveDesignerFieldValueKeys(field, registration?.valueKeys)
  if (keys.length === 0) {
    if (field.componentType === 'ocr') {
      diagnostics.push(
        error(
          'EXPRESSION_FIELD_VALUE_KEY',
          'OCR 字段尚未声明接口返回值，不能读取属性',
          `${nodePath}.valueKey`,
        ),
      )
      return
    }
    diagnostics.push(
      error(
        'EXPRESSION_FIELD_VALUE_KEY',
        `${field.label}不是对象值字段，不能读取属性`,
        `${nodePath}.valueKey`,
      ),
    )
    return
  }
  if (!keys.includes(node.valueKey)) {
    diagnostics.push(
      error(
        'EXPRESSION_FIELD_VALUE_KEY',
        `属性 ${node.valueKey} 不属于 ${field.label}`,
        `${nodePath}.valueKey`,
      ),
    )
  }
}

function validFunctionArgumentCount(value: unknown, count: number): boolean {
  if (['NOT', 'EMPTY', 'NOT_EMPTY', 'LENGTH'].includes(String(value))) return count === 1
  if (value === 'IF') return count === 3
  if (['AND', 'OR', 'CONCAT', 'COALESCE'].includes(String(value))) return count >= 2 && count <= 8
  return count === 2
}

function unknownKeys(
  source: Record<string, unknown>,
  allowedKeys: string[],
  path: string,
  diagnostics: DesignerDiagnostic[],
): void {
  const allowed = new Set(allowedKeys)
  for (const key of Object.keys(source)) {
    if (!allowed.has(key))
      diagnostics.push(error('EXPRESSION_UNKNOWN_PROPERTY', `不支持属性 ${key}`, `${path}.${key}`))
  }
}

function error(code: string, message: string, path: string): DesignerDiagnostic {
  return { severity: 'ERROR', code, message, path }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
