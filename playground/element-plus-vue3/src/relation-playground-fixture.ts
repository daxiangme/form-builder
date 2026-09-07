import {
  createEmptyDesignerDocument,
  createDesignerCollectionKey,
  createDesignerTargetKey,
  createNodeFromComponent,
  type DesignerCollectionScope,
  type DesignerDocument,
  type DesignerLayoutNode,
  type DesignerRelationCandidate,
  type DesignerRelationValueStore,
  type DesignerRuntimeCollection,
  type DesignerRuntimeRow,
  type FormFieldRuntimePolicyMap,
  type FormRelationRuntimePolicyResolver,
} from 'el-form-gen'

/** 关系演示使用的公开虚拟实体、容器和字段标识。 */
export const RELATION_PLAYGROUND_IDS = {
  containers: {
    projects: 'demo-projects',
    tasks: 'demo-tasks',
    steps: 'demo-steps',
    members: 'demo-members',
  },
  fields: {
    title: 'demo-title',
    projectName: 'demo-project-name',
    taskName: 'demo-task-name',
    taskEcho: 'demo-task-echo',
    stepName: 'demo-step-name',
    stepContext: 'demo-step-context',
    memberRole: 'demo-member-role',
    personName: 'demo-person-name',
    personEmail: 'demo-person-email',
  },
} as const

type ContainerNode = Extract<DesignerLayoutNode, { nodeType: 'CONTAINER' }>

/** 关系演示中可以切换的权威权限场景。 */
export type RelationPlaygroundPolicyScenario =
  'INDEPENDENT' | 'ALL' | 'READ_ONLY' | 'NO_LINK' | 'HIDDEN_B' | 'REVOKE_A' | 'NO_CASCADE'

/** 创建跨页候选；标识、姓名和邮箱全部为公开虚拟数据。 */
export function createRelationPlaygroundCandidates(): DesignerRelationCandidate[] {
  const names = ['林晓岚', '陈睿', '周宁', '方怡', '顾青']
  const { fields } = RELATION_PLAYGROUND_IDS
  return names.map((label, index) => ({
    entityId: 'demo-entity-person',
    identity: `demo-person-${index + 1}`,
    reference: `demo-candidate-${index + 1}`,
    version: 1,
    label,
    values: {
      [fields.personName]: label,
      [fields.personEmail]: `member${index + 1}@example.invalid`,
    },
  }))
}

/** 创建两个项目下相互隔离的任务、步骤和指向同一成员的关联。 */
export function createRelationPlaygroundState(): DesignerRelationValueStore {
  const { containers, fields } = RELATION_PLAYGROUND_IDS
  const rootKey = 'demo-root'
  const projectA = 'demo-project-a'
  const projectB = 'demo-project-b'
  const taskA = 'demo-task-a'
  const taskB = 'demo-task-b'
  const candidate = createRelationPlaygroundCandidates()[0]!
  const root: DesignerRuntimeRow = {
    clientRowKey: rootKey,
    recordRef: 'demo-record-root',
    version: 1,
    values: { [fields.title]: '秋季协作计划' },
  }
  const collection = (
    containerId: string,
    ancestorRowKeys: string[],
    relationPath: string[],
    rows: DesignerRuntimeRow[],
  ): DesignerRuntimeCollection => ({
    scope: { containerId, ancestorRowKeys },
    relationPath,
    rows,
    loadState: 'COMPLETE',
    totalCount: rows.length,
  })
  const row = (clientRowKey: string, fieldId: string, value: string): DesignerRuntimeRow => ({
    clientRowKey,
    recordRef: `${clientRowKey}-record`,
    version: 1,
    values: { [fieldId]: value },
  })
  const member = (parent: string, role: string): DesignerRuntimeRow => ({
    clientRowKey: `${parent}-member`,
    associationRef: `${parent}-association`,
    version: 1,
    values: { [fields.memberRole]: role },
    target: { ...candidate, reference: `demo-reference:${parent}:${candidate.identity}` },
  })
  const collections = [
    collection(
      containers.projects,
      [rootKey],
      ['demo-relation-projects'],
      [
        row(projectA, fields.projectName, '项目 A · 产品升级'),
        row(projectB, fields.projectName, '项目 B · 用户服务'),
      ],
    ),
    collection(
      containers.tasks,
      [rootKey, projectA],
      ['demo-relation-projects', 'demo-relation-tasks'],
      [row(taskA, fields.taskName, '梳理产品需求')],
    ),
    collection(
      containers.tasks,
      [rootKey, projectB],
      ['demo-relation-projects', 'demo-relation-tasks'],
      [row(taskB, fields.taskName, '收集用户反馈')],
    ),
    collection(
      containers.steps,
      [rootKey, projectA, taskA],
      ['demo-relation-projects', 'demo-relation-tasks', 'demo-relation-steps'],
      [row('demo-step-a', fields.stepName, '整理项目 A 的访谈记录')],
    ),
    collection(
      containers.steps,
      [rootKey, projectB, taskB],
      ['demo-relation-projects', 'demo-relation-tasks', 'demo-relation-steps'],
      [row('demo-step-b', fields.stepName, '整理项目 B 的服务记录')],
    ),
    collection(
      containers.members,
      [rootKey, projectA],
      ['demo-relation-projects', 'demo-relation-members'],
      [member(projectA, '产品负责人')],
    ),
    collection(
      containers.members,
      [rootKey, projectB],
      ['demo-relation-projects', 'demo-relation-members'],
      [member(projectB, '顾问')],
    ),
  ]
  return {
    runtimeVersion: '1.0',
    root,
    collections: Object.fromEntries(
      collections.map((item) => [createDesignerCollectionKey(item.scope), item]),
    ),
    targets: {
      [createDesignerTargetKey(candidate.entityId, candidate.identity)]: {
        entityId: candidate.entityId,
        identity: candidate.identity,
        version: candidate.version,
        values: candidate.values ?? {},
      },
    },
  }
}

/** 创建字段完整策略；示例权限不会隐式开放未声明字段。 */
export function createRelationPlaygroundFieldPolicy(
  document: DesignerDocument,
): FormFieldRuntimePolicyMap {
  return Object.fromEntries(
    document.dataSchema.fields.map((field) => [field.id, { accessLevel: 'EDITABLE' as const }]),
  )
}

/** 创建按父行作用域隔离的权限：默认仅项目 A 可以编辑共享成员。 */
export function createRelationPlaygroundPolicy(
  document: DesignerDocument,
  scenario: RelationPlaygroundPolicyScenario,
): FormRelationRuntimePolicyResolver {
  const fields = createRelationPlaygroundFieldPolicy(document)
  return (context) => {
    const writable = scenario !== 'READ_ONLY'
    const projectB = belongsToProjectB(context.scope) || context.rowKey === 'demo-project-b'
    const mayEditTarget =
      writable && (scenario === 'ALL' || (scenario === 'REVOKE_A' ? projectB : !projectB))
    return {
      visible: !(scenario === 'HIDDEN_B' && projectB),
      editable: writable,
      cascadeDelete: scenario !== 'NO_CASCADE',
      operations: {
        CREATE: writable,
        UPDATE: writable,
        DELETE: writable,
        LINK: writable && scenario !== 'NO_LINK',
        UNLINK: writable && scenario !== 'NO_LINK',
      },
      fields,
      targetEditable: mayEditTarget,
      targetFields: {
        [RELATION_PLAYGROUND_IDS.fields.personName]: {
          accessLevel: mayEditTarget ? 'EDITABLE' : 'READ_ONLY',
        },
        [RELATION_PLAYGROUND_IDS.fields.personEmail]: {
          accessLevel: mayEditTarget ? 'EDITABLE' : 'READ_ONLY',
        },
      },
    }
  }
}

function belongsToProjectB(scope: DesignerCollectionScope | undefined): boolean {
  return scope?.ancestorRowKeys.includes('demo-project-b') ?? false
}

/** 创建包含三级一对多和共享成员关联的纯语义设计文档，不保存运行身份或权限。 */
export function createRelationPlaygroundDocument(): DesignerDocument {
  const document = createEmptyDesignerDocument('relation-playground')
  document.name = '项目协作关系表单'
  document.description = '公开虚拟数据：项目、任务、步骤与共享成员。'
  const root = { id: 'demo-entity-application', code: 'application', name: '协作申请' }
  const project = { id: 'demo-entity-project', code: 'project', name: '项目' }
  const task = { id: 'demo-entity-task', code: 'task', name: '任务' }
  const step = { id: 'demo-entity-step', code: 'step', name: '执行步骤' }
  const assignment = { id: 'demo-entity-assignment', code: 'assignment', name: '项目成员关联' }
  const person = { id: 'demo-entity-person', code: 'person', name: '共享成员' }
  document.dataSchema.rootEntity = root
  const { containers, fields } = RELATION_PLAYGROUND_IDS
  const projects = addContainer(document, containers.projects, '项目', 'block-subtable', 'projects')
  const tasks = addContainer(document, containers.tasks, '项目任务', 'row-subtable', 'tasks')
  const steps = addContainer(document, containers.steps, '任务步骤', 'block-subtable', 'steps')
  const members = addContainer(
    document,
    containers.members,
    '关联成员',
    'block-subtable',
    'members',
  )
  document.uiSchema.root = [addField(document, fields.title, '申请名称', root.code), projects]
  projects.slots[0]!.children = [
    addField(document, fields.projectName, '项目名称', project.code),
    tasks,
    members,
  ]
  tasks.slots[0]!.children = [
    addField(document, fields.taskName, '任务名称', task.code),
    addField(document, fields.taskEcho, '最近输入的任务名称', task.code),
    steps,
  ]
  steps.slots[0]!.children = [
    addField(document, fields.stepName, '步骤内容', step.code),
    addField(document, fields.stepContext, '所属项目与任务', step.code),
  ]
  members.slots[0]!.children = [
    addField(document, fields.memberRole, '在本项目中的职责', assignment.code),
    addField(document, fields.personName, '共享成员姓名', person.code),
    addField(document, fields.personEmail, '共享联系邮箱', person.code),
  ]
  document.dataSchema.entities = [root, project, task, step, assignment, person]
  const contextField = document.dataSchema.fields.find((field) => field.id === fields.stepContext)!
  contextField.behavior.submitBehavior = 'EXCLUDE'
  contextField.behavior.valueRules = [
    {
      id: 'demo-step-context-formula',
      mode: 'FORMULA',
      expression: {
        kind: 'CALL',
        function: 'CONCAT',
        arguments: [
          { kind: 'FIELD', scope: 'ANCESTOR', ancestorDepth: 2, fieldId: fields.projectName },
          { kind: 'LITERAL', value: ' / ' },
          { kind: 'FIELD', scope: 'ANCESTOR', ancestorDepth: 1, fieldId: fields.taskName },
        ],
      },
    },
  ]
  const stepField = document.dataSchema.fields.find((field) => field.id === fields.stepName)!
  stepField.behavior.stateRules = [
    {
      id: 'demo-step-required',
      target: 'REQUIRED',
      valueWhenTrue: true,
      valueWhenFalse: false,
      condition: {
        kind: 'CALL',
        function: 'CONTAINS',
        arguments: [
          { kind: 'FIELD', scope: 'ANCESTOR', ancestorDepth: 2, fieldId: fields.projectName },
          { kind: 'LITERAL', value: '项目 A' },
        ],
      },
    },
  ]
  const taskField = document.dataSchema.fields.find((field) => field.id === fields.taskName)!
  taskField.behavior.eventBindings.CHANGE = 'demo_latest_task_name'
  document.eventFlows.push({
    id: 'demo-latest-task-name',
    code: 'demo_latest_task_name',
    name: '即时输入回显',
    enabled: true,
    trigger: { scope: 'COMPONENT', event: 'CHANGE', nodeId: `${fields.taskName}-node` },
    steps: [
      {
        id: 'demo-copy-task-name',
        stepType: 'ACTION',
        name: '记录当前任务名称',
        actionType: 'COPY_FIELD',
        configuration: {
          sourceFieldId: fields.taskName,
          sourceScope: 'CURRENT_ROW',
          targetFieldId: fields.taskEcho,
          targetScope: 'CURRENT_ROW',
        },
        guardFailure: 'BLOCK',
        onError: 'STOP',
      },
    ],
  })
  document.dataSchema.relations = [
    {
      kind: 'ONE_TO_MANY',
      id: 'demo-relation-projects',
      code: 'projects',
      name: '申请项目',
      parentEntityId: root.id,
      childEntity: project,
      loadMode: 'SYNC',
    },
    {
      kind: 'ONE_TO_MANY',
      id: 'demo-relation-tasks',
      code: 'tasks',
      name: '项目任务',
      parentEntityId: project.id,
      childEntity: task,
      loadMode: 'SYNC',
    },
    {
      kind: 'ONE_TO_MANY',
      id: 'demo-relation-steps',
      code: 'steps',
      name: '任务步骤',
      parentEntityId: task.id,
      childEntity: step,
      loadMode: 'SYNC',
    },
    {
      kind: 'MANY_TO_MANY',
      id: 'demo-relation-members',
      code: 'members',
      name: '项目成员',
      parentEntityId: project.id,
      childEntity: assignment,
      targetEntity: person,
      loadMode: 'SYNC',
    },
  ]
  return document
}

function addContainer(
  document: DesignerDocument,
  id: string,
  title: string,
  componentType: 'row-subtable' | 'block-subtable',
  relationCode: string,
): ContainerNode {
  const node = createNodeFromComponent(document, componentType, {
    label: title,
    configuration: { title, relationCode, allowCreate: true, allowCopy: true, allowDelete: true },
  })
  if (!node || node.nodeType !== 'CONTAINER') throw new Error(`无法创建演示容器 ${title}`)
  node.id = id
  node.configuration.relationCode = relationCode
  return node
}

function addField(
  document: DesignerDocument,
  id: string,
  label: string,
  entityCode: string,
): DesignerLayoutNode {
  const node = createNodeFromComponent(document, 'text', { label, entityCode })
  if (!node || node.nodeType !== 'FIELD') throw new Error(`无法创建演示字段 ${label}`)
  const field = document.dataSchema.fields.find((item) => item.id === node.fieldId)
  if (!field) throw new Error(`演示字段 ${label} 缺少定义`)
  field.id = id
  field.key = id.replaceAll('-', '_')
  node.fieldId = id
  node.id = `${id}-node`
  return node
}
