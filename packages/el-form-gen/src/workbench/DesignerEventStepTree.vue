<template>
  <div class="designer-event-step-tree">
    <article
      v-for="step in steps"
      :key="step.id"
      class="designer-event-step-tree__step"
      :class="{ 'is-selected': selectedStepId === step.id }"
    >
      <button type="button" @click="emit('select', step)">
        <DxSvgIcon
          :icon="step.stepType === 'ACTION' ? 'ri:play-circle-line' : 'ri:git-branch-line'"
        />
        <span>
          <strong>{{ step.name }}</strong>
          <small>{{
            step.stepType === 'ACTION' ? actionLabel(step.actionType) : '条件分支'
          }}</small>
        </span>
      </button>
      <ElButton text type="danger" aria-label="删除步骤" @click="removeStep(step.id)">
        <DxSvgIcon icon="ri:delete-bin-line" />
      </ElButton>
      <div v-if="step.stepType === 'CONDITION'" class="designer-event-step-tree__branches">
        <section v-for="branch in step.branches" :key="branch.id">
          <header><DxSvgIcon icon="ri:git-branch-line" />{{ branch.name }}</header>
          <DesignerEventStepTree
            :steps="branch.steps"
            :selected-step-id="selectedStepId"
            @select="emit('select', $event)"
            @delete="emit('delete', $event)"
            @update:steps="updateBranchSteps(step.id, branch.id, $event)"
          />
        </section>
        <section>
          <header><DxSvgIcon icon="ri:corner-down-right-line" />其他情况</header>
          <DesignerEventStepTree
            :steps="step.elseSteps"
            :selected-step-id="selectedStepId"
            @select="emit('select', $event)"
            @delete="emit('delete', $event)"
            @update:steps="updateElseSteps(step.id, $event)"
          />
        </section>
      </div>
    </article>
    <ElDropdown trigger="click" @command="addStep">
      <ElButton class="designer-event-step-tree__add" text>
        <DxSvgIcon icon="ri:add-circle-line" />添加步骤
      </ElButton>
      <template #dropdown>
        <ElDropdownMenu>
          <ElDropdownItem command="ACTION"
            ><DxSvgIcon icon="ri:play-circle-line" />动作</ElDropdownItem
          >
          <ElDropdownItem command="CONDITION"
            ><DxSvgIcon icon="ri:git-branch-line" />条件</ElDropdownItem
          >
        </ElDropdownMenu>
      </template>
    </ElDropdown>
  </div>
</template>

<script setup lang="ts">
import DxSvgIcon from '../infrastructure/FormIcon.vue'
import type { DesignerEventActionType, DesignerEventStep } from '@daxiangme/form-core'

defineOptions({ name: 'DesignerEventStepTree' })

const props = defineProps<{ steps: DesignerEventStep[]; selectedStepId: string }>()
const emit = defineEmits<{
  select: [step: DesignerEventStep]
  delete: [stepId: string]
  'update:steps': [steps: DesignerEventStep[]]
}>()

function addStep(command: string | number | object): void {
  if (command === 'ACTION') {
    const step: DesignerEventStep = {
      id: createId('action'),
      stepType: 'ACTION',
      name: '显示消息',
      actionType: 'MESSAGE',
      configuration: { message: '操作已完成', level: 'SUCCESS' },
      guardFailure: 'SKIP',
      onError: 'STOP',
    }
    emit('update:steps', [...props.steps, step])
    emit('select', step)
  }
  if (command === 'CONDITION') {
    const step: DesignerEventStep = {
      id: createId('condition'),
      stepType: 'CONDITION',
      name: '条件判断',
      branches: [
        {
          id: createId('branch'),
          name: '条件 1',
          condition: { kind: 'LITERAL', value: true },
          steps: [],
        },
      ],
      elseSteps: [],
    }
    emit('update:steps', [...props.steps, step])
    emit('select', step)
  }
}

function removeStep(stepId: string): void {
  emit(
    'update:steps',
    props.steps.filter((step) => step.id !== stepId),
  )
  emit('delete', stepId)
}

function updateBranchSteps(stepId: string, branchId: string, steps: DesignerEventStep[]): void {
  emit(
    'update:steps',
    props.steps.map((step) => {
      if (step.id !== stepId || step.stepType !== 'CONDITION') return step
      return {
        ...step,
        branches: step.branches.map((branch) =>
          branch.id === branchId ? { ...branch, steps } : branch,
        ),
      }
    }),
  )
}

function updateElseSteps(stepId: string, steps: DesignerEventStep[]): void {
  emit(
    'update:steps',
    props.steps.map((step) =>
      step.id === stepId && step.stepType === 'CONDITION' ? { ...step, elseSteps: steps } : step,
    ),
  )
}

function actionLabel(type: DesignerEventActionType): string {
  return {
    SET_FIELD: '设置字段',
    CLEAR_FIELD: '清空字段',
    COPY_FIELD: '复制字段',
    SET_VARIABLE: '设置变量',
    VALIDATE: '验证表单',
    SUBMIT: '提交表单',
    RESET: '重置表单',
    PRINT: '打印',
    MESSAGE: '显示消息',
    OPEN_MODULE: '打开模块',
    CONFIRM_MODULE: '确认模块',
    CANCEL_MODULE: '取消模块',
    NAVIGATE_RESOURCE: '资源导航',
    REFRESH_DATA_SOURCE: '刷新数据源',
    HOST_ACTION: 'Host 动作',
  }[type]
}

function createId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().replaceAll('-', '')}`
}
</script>

<style scoped>
.designer-event-step-tree {
  display: flex;
  flex-direction: column;
  gap: var(--daxiang-form-space-2);
}

.designer-event-step-tree__step {
  display: grid;
  overflow: hidden;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--el-border-radius-base);
  grid-template-columns: minmax(0, 1fr) auto;
}

.designer-event-step-tree__step.is-selected {
  border-color: var(--el-color-primary);
  box-shadow: 0 0 0 1px var(--el-color-primary-light-5);
}

.designer-event-step-tree__step > button {
  display: grid;
  min-width: 0;
  align-items: center;
  padding: var(--daxiang-form-space-2);
  color: var(--el-text-color-regular);
  text-align: left;
  background: transparent;
  border: 0;
  cursor: pointer;
  grid-template-columns: auto minmax(0, 1fr);
  gap: var(--daxiang-form-space-2);
}

.designer-event-step-tree__step > button span {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.designer-event-step-tree__step small {
  color: var(--el-text-color-secondary);
  font-size: 11px;
}

.designer-event-step-tree__branches {
  padding: var(--daxiang-form-space-2);
  background: var(--el-fill-color-extra-light);
  border-top: 1px solid var(--el-border-color-lighter);
  grid-column: 1 / -1;
}

.designer-event-step-tree__branches section + section {
  margin-top: var(--daxiang-form-space-2);
}

.designer-event-step-tree__branches header {
  display: flex;
  align-items: center;
  padding-bottom: var(--daxiang-form-space-1);
  color: var(--el-text-color-secondary);
  gap: var(--daxiang-form-space-1);
  font-size: 12px;
}

.designer-event-step-tree__add {
  align-self: center;
  color: var(--el-color-primary);
}
</style>
