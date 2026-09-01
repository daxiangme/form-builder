import { evaluateDesignerCondition, evaluateDesignerExpression } from './expression'
import type {
  DesignerDataSourceDefinition,
  DesignerDocument,
  DesignerEventActionStep,
  DesignerEventFlow,
  DesignerEventStep,
  DesignerExpression,
  DesignerExpressionRuntimeContext,
  DesignerRuntimeAdapters,
  DesignerRuntimeValueStore,
} from './types'

const MAX_EVENT_DEPTH = 20
const MAX_EVENT_STEPS = 200

/** 事件流运行 Host；所有可能产生外部副作用的能力均由显式回调或 Adapter 提供。 */
export interface DesignerEventRuntimeHost {
  document: DesignerDocument
  valueStore: DesignerRuntimeValueStore
  variables: Record<string, unknown>
  currentRow?: Record<string, unknown>
  expressionContext: DesignerExpressionRuntimeContext['context']
  adapters?: DesignerRuntimeAdapters
  validate?: () => Promise<boolean>
  submit?: () => Promise<void>
  reset?: () => void
  print?: () => void
  message?: (message: string, level: 'SUCCESS' | 'INFO' | 'WARNING' | 'ERROR') => void
  openModule?: (moduleCode: string) => void
  confirmModule?: (moduleCode: string) => void
  cancelModule?: (moduleCode: string) => void
}

/** 事件流执行结果。 */
export interface DesignerEventExecutionResult {
  completed: boolean
  blocked: boolean
  executedStepIds: string[]
  errors: string[]
}

/**
 * 执行声明式事件流。
 *
 * 运行器限制最大深度、步骤数量和同一流重复进入；未提供的外部能力失败关闭。
 */
export async function executeDesignerEventFlow(
  flow: DesignerEventFlow,
  host: DesignerEventRuntimeHost,
  activeFlowIds: Set<string> = new Set(),
): Promise<DesignerEventExecutionResult> {
  if (!flow.enabled) return { completed: true, blocked: false, executedStepIds: [], errors: [] }
  if (activeFlowIds.has(flow.id)) {
    return {
      completed: false,
      blocked: true,
      executedStepIds: [],
      errors: ['事件流发生重复进入，已终止执行'],
    }
  }
  activeFlowIds.add(flow.id)
  const result: DesignerEventExecutionResult = {
    completed: false,
    blocked: false,
    executedStepIds: [],
    errors: [],
  }
  let visited = 0
  const runtime = (): DesignerExpressionRuntimeContext => ({
    fields: host.valueStore.fields,
    variables: host.variables,
    context: host.expressionContext,
    currentRow: host.currentRow,
  })
  const executeSteps = async (steps: DesignerEventStep[], depth: number): Promise<boolean> => {
    if (depth > MAX_EVENT_DEPTH) throw new Error('事件流嵌套深度超过限制')
    for (const step of steps) {
      visited += 1
      if (visited > MAX_EVENT_STEPS) throw new Error('事件流步骤数量超过限制')
      result.executedStepIds.push(step.id)
      if (step.stepType === 'CONDITION') {
        const branch = step.branches.find((item) =>
          evaluateDesignerCondition(item.condition, runtime()),
        )
        const continued = await executeSteps(branch?.steps ?? step.elseSteps, depth + 1)
        if (!continued) return false
        continue
      }
      if (step.guard && !evaluateDesignerCondition(step.guard, runtime())) {
        if (step.guardFailure === 'SKIP') continue
        result.blocked = true
        result.errors.push(`${step.name}的执行条件未满足`)
        return false
      }
      try {
        await executeAction(step, host, runtime())
      } catch (error) {
        result.errors.push(`${step.name}：${error instanceof Error ? error.message : '执行失败'}`)
        if (step.onError === 'STOP') {
          result.blocked = true
          return false
        }
      }
    }
    return true
  }
  try {
    result.completed = await executeSteps(flow.steps, 0)
  } catch (error) {
    result.blocked = true
    result.errors.push(error instanceof Error ? error.message : '事件流执行失败')
  } finally {
    activeFlowIds.delete(flow.id)
  }
  return result
}

async function executeAction(
  step: DesignerEventActionStep,
  host: DesignerEventRuntimeHost,
  runtime: DesignerExpressionRuntimeContext,
): Promise<void> {
  const configuration = step.configuration
  if (step.actionType === 'SET_FIELD') {
    const fieldId = requiredText(configuration.fieldId, '目标字段')
    assignFieldValue(host, fieldId, cloneValue(resolveActionValue(configuration, runtime)))
    return
  }
  if (step.actionType === 'CLEAR_FIELD') {
    const fieldId = requiredText(configuration.fieldId, '目标字段')
    assignFieldValue(host, fieldId, null)
    return
  }
  if (step.actionType === 'COPY_FIELD') {
    const sourceFieldId = requiredText(configuration.sourceFieldId, '来源字段')
    const targetFieldId = requiredText(configuration.targetFieldId, '目标字段')
    assignFieldValue(host, targetFieldId, cloneValue(readFieldValue(host, sourceFieldId)))
    return
  }
  if (step.actionType === 'SET_VARIABLE') {
    const variableCode = requiredText(configuration.variableCode, '变量编码')
    host.variables[variableCode] = cloneValue(resolveActionValue(configuration, runtime))
    return
  }
  if (step.actionType === 'VALIDATE') {
    if (!host.validate) throw new Error('当前 Host 未提供表单验证能力')
    if (!(await host.validate())) throw new Error('表单验证未通过')
    return
  }
  if (step.actionType === 'SUBMIT') {
    if (!host.submit) throw new Error('当前 Host 未提供提交能力')
    await host.submit()
    return
  }
  if (step.actionType === 'RESET') {
    if (!host.reset) throw new Error('当前 Host 未提供重置能力')
    host.reset()
    return
  }
  if (step.actionType === 'PRINT') {
    if (!host.print) throw new Error('当前 Host 未提供打印能力')
    host.print()
    return
  }
  if (step.actionType === 'MESSAGE') {
    if (!host.message) throw new Error('当前 Host 未提供消息能力')
    host.message(requiredText(configuration.message, '消息内容'), messageLevel(configuration.level))
    return
  }
  if (step.actionType === 'OPEN_MODULE') {
    if (!host.openModule) throw new Error('当前 Host 未提供模块打开能力')
    host.openModule(requiredText(configuration.moduleCode, '模块编码'))
    return
  }
  if (step.actionType === 'CONFIRM_MODULE') {
    if (!host.confirmModule) throw new Error('当前 Host 未提供模块确认能力')
    host.confirmModule(requiredText(configuration.moduleCode, '模块编码'))
    return
  }
  if (step.actionType === 'CANCEL_MODULE') {
    if (!host.cancelModule) throw new Error('当前 Host 未提供模块取消能力')
    host.cancelModule(requiredText(configuration.moduleCode, '模块编码'))
    return
  }
  if (step.actionType === 'NAVIGATE_RESOURCE') {
    const adapter = host.adapters?.hostAction
    if (!adapter) throw new Error('当前 Host 未提供同应用资源导航能力')
    await adapter.navigateResource(
      requiredText(configuration.resourceCode, '资源编码'),
      configuration.openInNewPage === true,
    )
    return
  }
  if (step.actionType === 'REFRESH_DATA_SOURCE') {
    const adapter = host.adapters?.dataSource
    if (!adapter) throw new Error('当前 Host 未提供数据源能力')
    const definition = resolveDataSource(host.document, configuration.dataSourceCode)
    const output = await adapter.execute(definition, resolveMappedInput(definition, runtime))
    for (const mapping of definition.outputMappings) {
      if (mapping.target.startsWith('field:')) {
        assignFieldValue(
          host,
          mapping.target.slice('field:'.length),
          cloneValue(output[mapping.source]),
        )
      } else if (mapping.target.startsWith('variable:')) {
        host.variables[mapping.target.slice('variable:'.length)] = cloneValue(
          output[mapping.source],
        )
      }
    }
    return
  }
  if (step.actionType === 'HOST_ACTION') {
    const adapter = host.adapters?.hostAction
    if (!adapter) throw new Error('当前 Host 未提供业务动作能力')
    await adapter.execute(requiredText(configuration.actionCode, '动作编码'), {
      fields: cloneValue(host.valueStore.fields),
      variables: cloneValue(host.variables),
    })
  }
}

function readFieldValue(host: DesignerEventRuntimeHost, fieldId: string): unknown {
  return host.currentRow && fieldId in host.currentRow
    ? host.currentRow[fieldId]
    : host.valueStore.fields[fieldId]
}

function assignFieldValue(host: DesignerEventRuntimeHost, fieldId: string, value: unknown): void {
  if (host.currentRow && fieldId in host.currentRow) host.currentRow[fieldId] = value
  else host.valueStore.fields[fieldId] = value
}

function resolveActionValue(
  configuration: Record<string, unknown>,
  runtime: DesignerExpressionRuntimeContext,
): unknown {
  const expression = configuration.expression
  if (isRecord(expression))
    return evaluateDesignerExpression(expression as unknown as DesignerExpression, runtime)
  return configuration.value ?? null
}

function resolveDataSource(
  document: DesignerDocument,
  code: unknown,
): DesignerDataSourceDefinition {
  const sourceCode = requiredText(code, '数据源编码')
  const definition = document.dataSources.find((item) => item.code === sourceCode)
  if (!definition) throw new Error(`数据源 ${sourceCode} 不存在`)
  return definition
}

function resolveMappedInput(
  definition: DesignerDataSourceDefinition,
  runtime: DesignerExpressionRuntimeContext,
): Record<string, unknown> {
  const input: Record<string, unknown> = {}
  for (const mapping of definition.inputMappings) {
    if (mapping.source.startsWith('field:'))
      input[mapping.target] = runtime.fields[mapping.source.slice(6)]
    else if (mapping.source.startsWith('variable:')) {
      input[mapping.target] = runtime.variables[mapping.source.slice(9)]
    }
  }
  return input
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label}未配置`)
  return value.trim()
}

function messageLevel(value: unknown): 'SUCCESS' | 'INFO' | 'WARNING' | 'ERROR' {
  return ['SUCCESS', 'INFO', 'WARNING', 'ERROR'].includes(String(value))
    ? (value as 'SUCCESS' | 'INFO' | 'WARNING' | 'ERROR')
    : 'INFO'
}

function cloneValue<T>(value: T): T {
  if (value === undefined || value === null) return value
  if (typeof globalThis.structuredClone === 'function') {
    try {
      return globalThis.structuredClone(value)
    } catch {
      // 文件句柄等宿主对象无法结构化克隆时使用保守递归策略。
    }
  }
  if (Array.isArray(value)) return value.map((item) => cloneValue(item)) as T
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        cloneValue(item),
      ]),
    ) as T
  }
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
