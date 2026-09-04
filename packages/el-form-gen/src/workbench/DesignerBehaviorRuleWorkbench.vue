<template>
  <section class="designer-behavior-rule-workbench">
    <header>
      <div>
        <strong>{{ title }}</strong
        ><small>{{ description }}</small>
      </div>
      <slot name="add"
        ><ElButton plain @click="$emit('add')"
          ><DxSvgIcon icon="ri:add-line" />添加规则</ElButton
        ></slot
      >
    </header>
    <div v-if="!empty" class="designer-behavior-rule-workbench__body">
      <aside><slot name="list" /></aside>
      <main><slot name="detail" /></main>
    </div>
    <ElEmpty v-else description="尚未配置规则" :image-size="64" />
  </section>
</template>

<script setup lang="ts">
import DxSvgIcon from '../infrastructure/FormIcon.vue'

defineOptions({ name: 'DesignerBehaviorRuleWorkbench' })
defineProps<{ title: string; description: string; empty: boolean }>()
defineEmits<{ add: [] }>()
</script>

<style scoped>
.designer-behavior-rule-workbench {
  display: flex;
  min-height: 540px;
  flex-direction: column;
}

.designer-behavior-rule-workbench > header {
  display: flex;
  align-items: center;
  padding-bottom: var(--daxiang-form-space-3);
  justify-content: space-between;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.designer-behavior-rule-workbench > header > div {
  display: flex;
  flex-direction: column;
}

.designer-behavior-rule-workbench small {
  color: var(--el-text-color-secondary);
}

.designer-behavior-rule-workbench__body {
  display: grid;
  min-height: 0;
  flex: 1 1 0;
  grid-template-columns: 290px minmax(0, 1fr);
}

.designer-behavior-rule-workbench__body > aside {
  min-width: 0;
  padding: var(--daxiang-form-space-3) var(--daxiang-form-space-3) var(--daxiang-form-space-3) 0;
  overflow: auto;
  border-right: 1px solid var(--el-border-color-lighter);
}

.designer-behavior-rule-workbench__body > main {
  min-width: 0;
  padding: var(--daxiang-form-space-3) 0 var(--daxiang-form-space-3) var(--daxiang-form-space-4);
  overflow: auto;
}

@media (width <= 760px) {
  .designer-behavior-rule-workbench__body {
    display: flex;
    flex-direction: column;
  }

  .designer-behavior-rule-workbench__body > aside {
    max-height: 230px;
    padding-right: 0;
    border-right: 0;
    border-bottom: 1px solid var(--el-border-color-lighter);
  }

  .designer-behavior-rule-workbench__body > main {
    padding-left: 0;
  }
}
</style>
