<template>
  <aside class="designer-inspector">
    <ElTabs v-model="activeTabModel" class="designer-inspector__tabs">
      <ElTabPane label="组件配置" name="component">
        <div
          v-if="selectedNode && registration"
          ref="componentScrollRef"
          class="designer-inspector__scroll"
        >
          <nav class="designer-inspector__section-nav" aria-label="属性分区">
            <ElTooltip
              v-for="item in inspectorNavigation"
              :key="item.name"
              :content="item.label"
              placement="bottom"
            >
              <button
                type="button"
                :class="{ 'is-active': activeSection === item.name }"
                :aria-label="item.label"
                @click="jumpToSection(item.name)"
              >
                <DxSvgIcon :icon="item.icon" />
              </button>
            </ElTooltip>
          </nav>
          <header class="designer-inspector__identity">
            <DxSvgIcon :icon="registration.icon" />
            <div>
              <strong>{{ selectedField?.label || registration.name }}</strong>
              <small
                >{{ registration.componentType }} · 配置 v{{
                  registration.configurationVersion
                }}</small
              >
            </div>
          </header>
          <ElAlert
            v-if="registration.availability !== 'AVAILABLE'"
            :type="registration.availability === 'UNAVAILABLE' ? 'warning' : 'info'"
            :closable="false"
            show-icon
            :title="registration.unavailableReason"
          />

          <ElCollapse v-model="openedSections">
            <ElCollapseItem
              v-if="selectedField"
              id="designer-inspector-section-identity"
              title="字段身份"
              name="identity"
            >
              <ElForm label-position="top">
                <ElFormItem label="字段名称" required>
                  <ElInput
                    :model-value="selectedField.label"
                    maxlength="80"
                    @update:model-value="updateField({ label: $event })"
                  />
                </ElFormItem>
                <ElFormItem label="字段编码" required>
                  <ElInput
                    :model-value="selectedField.key"
                    maxlength="64"
                    @update:model-value="updateField({ key: normalizeKey($event) })"
                  />
                </ElFormItem>
                <ElFormItem label="语义类型">
                  <ElInput :model-value="selectedField.semanticType" disabled />
                </ElFormItem>
                <ElFormItem label="展示控件">
                  <ElSelect
                    :model-value="selectedField.componentType"
                    @update:model-value="changeComponent"
                  >
                    <ElOption
                      v-for="item in compatibleComponents"
                      :key="item.componentType"
                      :label="item.name"
                      :value="item.componentType"
                      :disabled="item.availability === 'UNAVAILABLE'"
                    />
                  </ElSelect>
                </ElFormItem>
                <ElFormItem label="绑定状态">
                  <ElTag
                    effect="plain"
                    :type="selectedField.bindingStatus === 'UNBOUND' ? 'info' : 'success'"
                  >
                    {{ selectedField.entityCode }} ·
                    {{ selectedField.bindingStatus === 'UNBOUND' ? '本地字段' : '来源字段' }}
                  </ElTag>
                </ElFormItem>
              </ElForm>
            </ElCollapseItem>

            <ElCollapseItem
              v-if="selectedField"
              id="designer-inspector-section-advanced"
              title="高级能力"
              name="advanced"
            >
              <div class="designer-inspector__advanced-actions">
                <div>
                  <span>数据联动与计算</span>
                  <small>{{ selectedField.behavior.valueRules.length }} 条规则</small>
                  <ElButton plain @click="emit('open-field-advanced')">配置</ElButton>
                </div>
                <div>
                  <span>隐藏 / 必填 / 禁用条件</span>
                  <small>{{ selectedField.behavior.stateRules.length }} 条规则</small>
                  <ElButton plain @click="emit('open-field-advanced')">配置</ElButton>
                </div>
                <div>
                  <span>验证规则</span>
                  <small>与必填独立 · {{ selectedField.behavior.validationRules.length }} 条</small>
                  <ElButton plain @click="emit('open-field-advanced')">配置</ElButton>
                </div>
                <div>
                  <span>组件事件</span>
                  <small
                    >{{ Object.keys(selectedField.behavior.eventBindings).length }} 个绑定</small
                  >
                  <ElButton plain @click="emit('open-event-editor')">设置事件</ElButton>
                </div>
              </div>
            </ElCollapseItem>

            <ElCollapseItem
              v-else-if="registration.supportedEvents?.length"
              id="designer-inspector-section-advanced"
              title="事件能力"
              name="advanced"
            >
              <div class="designer-inspector__container-events">
                <div>
                  <ElTag v-for="event in registration.supportedEvents" :key="event" effect="plain">
                    {{ componentEventLabel(event) }}
                  </ElTag>
                </div>
                <small>事件使用声明式动作与条件步骤，不执行自由脚本。</small>
                <ElButton plain @click="emit('open-event-editor')">设置事件</ElButton>
              </div>
            </ElCollapseItem>

            <ElCollapseItem
              v-if="selectedRelation"
              id="designer-inspector-section-relation"
              title="主子关系"
              name="relation"
            >
              <ElForm label-position="top">
                <ElFormItem label="关系名称" required>
                  <ElInput
                    :model-value="selectedRelation.name"
                    maxlength="80"
                    @update:model-value="updateRelation({ name: $event })"
                  />
                </ElFormItem>
                <ElFormItem label="关系编码" required>
                  <DesignerPropertyEditorHost
                    :definition="identifierDefinitions.relationCode"
                    :model-value="selectedRelation.code"
                    @update:model-value="updateRelation({ code: String($event) })"
                  />
                </ElFormItem>
                <ElFormItem label="父实体">
                  <ElInput
                    :model-value="`${document.dataSchema.rootEntity.name} · ${document.dataSchema.rootEntity.code}`"
                    disabled
                  />
                </ElFormItem>
                <ElFormItem label="子实体名称" required>
                  <ElInput
                    :model-value="selectedRelation.childEntity.name"
                    maxlength="80"
                    @update:model-value="updateRelation({ childEntityName: $event })"
                  />
                </ElFormItem>
                <ElFormItem label="子实体编码" required>
                  <DesignerPropertyEditorHost
                    :definition="identifierDefinitions.childEntityCode"
                    :model-value="selectedRelation.childEntity.code"
                    @update:model-value="updateRelation({ childEntityCode: String($event) })"
                  />
                </ElFormItem>
                <div class="designer-inspector__two-columns">
                  <ElFormItem label="关系类型">
                    <ElInput model-value="一对多" disabled />
                  </ElFormItem>
                  <ElFormItem label="加载方式">
                    <ElInput
                      :model-value="selectedRelation.loadMode === 'ASYNC' ? '异步' : '同步'"
                      disabled
                    />
                  </ElFormItem>
                </div>
                <ElTag effect="plain" :type="document.dataSchema.source ? 'success' : 'warning'">
                  {{
                    document.dataSchema.source
                      ? '来源关系 · 待服务端解析'
                      : '本地关系 · 待服务端解析'
                  }}
                </ElTag>
              </ElForm>
            </ElCollapseItem>

            <ElCollapseItem
              v-if="selectedField"
              id="designer-inspector-section-field-basic"
              title="基础与校验"
              name="field-basic"
            >
              <ElForm label-position="top">
                <ElFormItem label="帮助文字">
                  <ElInput
                    :model-value="selectedField.helpText"
                    maxlength="300"
                    @update:model-value="updateField({ helpText: $event })"
                  />
                </ElFormItem>
                <ElFormItem label="占位提示">
                  <ElInput
                    :model-value="selectedField.display.placeholder"
                    maxlength="160"
                    @update:model-value="updateDisplay('placeholder', $event)"
                  />
                </ElFormItem>
                <ElFormItem label="必填">
                  <ElSwitch
                    :model-value="selectedField.required"
                    @update:model-value="updateField({ required: Boolean($event) })"
                  />
                </ElFormItem>
                <ElFormItem label="只读">
                  <ElSwitch
                    :model-value="selectedField.display.readonly"
                    @update:model-value="updateDisplay('readonly', Boolean($event))"
                  />
                </ElFormItem>
                <ElFormItem label="隐藏">
                  <ElSwitch
                    :model-value="selectedField.display.hidden"
                    @update:model-value="updateDisplay('hidden', Boolean($event))"
                  />
                </ElFormItem>
                <ElFormItem label="默认值">
                  <DesignerFieldDefaultValueEditor
                    :field="selectedField"
                    @update:model-value="updateField({ defaultValue: $event })"
                  />
                </ElFormItem>
                <ElFormItem label="校验提示">
                  <ElInput
                    :model-value="selectedField.validation.message ?? ''"
                    @update:model-value="updateValidation('message', $event)"
                  />
                </ElFormItem>
              </ElForm>
            </ElCollapseItem>

            <ElCollapseItem
              v-for="section in propertySections"
              :key="section.code"
              :id="`designer-inspector-section-configuration-${section.code}`"
              :title="section.label"
              :name="`configuration-${section.code}`"
            >
              <ElForm label-position="top">
                <ElFormItem
                  v-for="definition in section.items"
                  :key="definition.key"
                  :label="definition.label"
                >
                  <DesignerPropertyEditorHost
                    :definition="definition"
                    :model-value="configurationValue(definition.key)"
                    :configuration="selectedConfiguration"
                    @update:model-value="updateConfiguration(definition.key, $event)"
                  />
                  <small v-if="definition.description">{{ definition.description }}</small>
                </ElFormItem>
              </ElForm>
            </ElCollapseItem>

            <div
              v-if="selectedContainerAppearance"
              class="designer-inspector__effective-appearance"
            >
              <DxSvgIcon icon="ri:palette-line" />
              <span>
                当前生效：{{ containerStyleLabel(selectedContainerAppearance.style) }} ·
                {{ radiusLabel(selectedContainerAppearance.radius) }}
              </span>
              <small>
                样式{{
                  selectedContainerAppearance.styleSource === 'FORM' ? '跟随表单' : '组件覆盖'
                }}， 圆角{{
                  selectedContainerAppearance.radiusSource === 'FORM' ? '跟随表单' : '组件覆盖'
                }}
              </small>
            </div>

            <ElCollapseItem id="designer-inspector-section-layout" title="响应式布局" name="layout">
              <div class="designer-inspector__device-grid">
                <template v-for="deviceName in ['pc', 'mobile'] as const" :key="deviceName">
                  <strong>{{ deviceName === 'pc' ? 'PC' : '移动端' }}</strong>
                  <ElForm label-position="top">
                    <div class="designer-inspector__two-columns">
                      <ElFormItem label="跨度">
                        <DesignerPropertyEditorHost
                          :definition="gridSpanDefinition(deviceName)"
                          :model-value="selectedNode.layout[deviceName].span"
                          :configuration="{ ...selectedNode.layout[deviceName] }"
                          @update:model-value="updateGrid(deviceName, 'span', Number($event))"
                        />
                      </ElFormItem>
                      <ElFormItem label="偏移">
                        <DesignerPropertyEditorHost
                          :definition="gridOffsetDefinition"
                          :model-value="selectedNode.layout[deviceName].offset"
                          :configuration="{ ...selectedNode.layout[deviceName] }"
                          @update:model-value="updateGrid(deviceName, 'offset', Number($event))"
                        />
                      </ElFormItem>
                    </div>
                    <ElFormItem :label="layoutShowLabelText">
                      <ElSwitch
                        :model-value="selectedNode.layout[deviceName].showLabel"
                        @update:model-value="updateGrid(deviceName, 'showLabel', Boolean($event))"
                      />
                    </ElFormItem>
                    <ElFormItem label="标签位置">
                      <ElSelect
                        :model-value="selectedNode.layout[deviceName].labelPosition"
                        @update:model-value="updateGrid(deviceName, 'labelPosition', $event)"
                      >
                        <ElOption label="继承表单" value="INHERIT" />
                        <ElOption label="顶部" value="TOP" />
                        <ElOption label="左侧" value="LEFT" />
                        <ElOption label="右侧" value="RIGHT" />
                      </ElSelect>
                    </ElFormItem>
                  </ElForm>
                </template>
              </div>
            </ElCollapseItem>
          </ElCollapse>
        </div>
        <div v-else-if="activeModule" class="designer-inspector__scroll">
          <header class="designer-inspector__identity">
            <DxSvgIcon
              :icon="activeModule.kind === 'DIALOG' ? 'ri:window-line' : 'ri:layout-right-2-line'"
            />
            <div>
              <strong>{{ activeModule.name }}</strong>
              <small
                >{{ activeModule.kind === 'DIALOG' ? '弹窗模块' : '抽屉模块' }} ·
                {{ activeModule.code }}</small
              >
            </div>
          </header>
          <ElForm label-position="top">
            <ElDivider content-position="left">模块配置</ElDivider>
            <ElFormItem label="模块名称" required>
              <ElInput v-model="moduleNameDraft" maxlength="80" @blur="commitModuleName" />
            </ElFormItem>
            <ElFormItem label="模块编码" required>
              <ElInput v-model="moduleCodeDraft" maxlength="64" @blur="commitModuleCode" />
            </ElFormItem>
            <ElFormItem label="模块类型">
              <ElInput :model-value="activeModule.kind === 'DIALOG' ? '弹窗' : '抽屉'" disabled />
            </ElFormItem>
            <ElFormItem label="数据草稿">
              <ElSelect
                :model-value="activeModule.dataContext"
                @update:model-value="
                  emit('update-module', activeModule.code, { dataContext: $event })
                "
              >
                <ElOption label="主表草稿" value="FORM_DRAFT" />
                <ElOption label="当前子表行草稿" value="SUBTABLE_ROW_DRAFT" />
              </ElSelect>
            </ElFormItem>
            <ElFormItem :label="activeModule.kind === 'DIALOG' ? '弹窗最大宽度' : '抽屉最大宽度'">
              <ElInputNumber
                :model-value="activeModule.width"
                :min="320"
                :max="1200"
                :step="20"
                controls-position="right"
                @change="updateModuleWidth(activeModule.code, $event)"
              />
              <small>设计外壳优先占满可用空间，达到此上限后居中展示；运行预览沿用该配置值。</small>
            </ElFormItem>
            <ElFormItem v-if="activeModule.kind === 'DIALOG'" label="弹窗圆角">
              <DesignerPropertyEditorHost
                :definition="moduleRadiusDefinition"
                :model-value="activeModule.radius ?? 'THEME'"
                @update:model-value="updateModuleRadius(activeModule.code, $event)"
              />
              <small
                >跟随系统时消费宿主 --el-border-radius-base；自定义值须为 0～32 的 4 的倍数。</small
              >
            </ElFormItem>
            <ElFormItem v-if="activeModule.kind === 'DIALOG'" label="运行最大高度">
              <ElSelect
                :model-value="activeModule.maxHeightPreset ?? 'VIEWPORT'"
                @update:model-value="updateModuleMaxHeight(activeModule.code, $event)"
              >
                <ElOption label="紧凑 · 60vh" value="COMPACT" />
                <ElOption label="标准 · 72vh" value="STANDARD" />
                <ElOption label="宽松 · 84vh" value="SPACIOUS" />
                <ElOption label="适应视口" value="VIEWPORT" />
              </ElSelect>
              <small>仅在运行预览和实际使用时限制弹窗高度；设计画布始终完整展开。</small>
            </ElFormItem>
          </ElForm>
        </div>
        <ElEmpty
          v-else
          class="designer-inspector__empty"
          description="选择画布节点后配置属性"
          :image-size="64"
        />
      </ElTabPane>

      <ElTabPane label="表单配置" name="form">
        <div class="designer-inspector__scroll">
          <ElForm label-position="top">
            <ElFormItem label="表单名称" required>
              <ElInput
                :model-value="document.name"
                maxlength="80"
                @update:model-value="emit('update-document', { name: $event })"
              />
            </ElFormItem>
            <ElFormItem label="表单说明">
              <ElInput
                :model-value="document.description"
                type="textarea"
                :rows="3"
                maxlength="300"
                @update:model-value="emit('update-document', { description: $event })"
              />
            </ElFormItem>
            <ElDivider content-position="left">主实体</ElDivider>
            <ElFormItem label="主实体名称" required>
              <ElInput
                :model-value="document.dataSchema.rootEntity.name"
                maxlength="80"
                @update:model-value="updateRootEntity({ name: $event })"
              />
            </ElFormItem>
            <ElFormItem label="主实体编码" required>
              <DesignerPropertyEditorHost
                :definition="identifierDefinitions.rootEntityCode"
                :model-value="document.dataSchema.rootEntity.code"
                @update:model-value="updateRootEntity({ code: String($event) })"
              />
            </ElFormItem>
            <ElFormItem label="数据模型来源">
              <DesignerDataModelSourceIdentity :source="document.dataSchema.source" />
            </ElFormItem>
            <ElDivider content-position="left">标签</ElDivider>
            <ElFormItem label="默认位置">
              <DesignerPropertyEditorHost
                :definition="appearanceDefinitions.labelPosition"
                :model-value="document.appearance.labelPosition"
                @update:model-value="updateAppearance('labelPosition', $event)"
              />
            </ElFormItem>
            <ElFormItem label="标签宽度">
              <DesignerPropertyEditorHost
                :definition="appearanceDefinitions.labelWidth"
                :model-value="document.appearance.labelWidth"
                @update:model-value="updateAppearance('labelWidth', Number($event))"
              />
            </ElFormItem>
            <ElFormItem label="标签后缀">
              <ElInput
                :model-value="document.appearance.labelSuffix"
                maxlength="4"
                @update:model-value="updateAppearance('labelSuffix', $event)"
              />
            </ElFormItem>
            <ElFormItem label="标签对齐">
              <DesignerPropertyEditorHost
                :definition="appearanceDefinitions.labelAlign"
                :model-value="document.appearance.labelAlign"
                @update:model-value="updateAppearance('labelAlign', $event)"
              />
            </ElFormItem>
            <ElDivider content-position="left">栅格与控件</ElDivider>
            <div class="designer-inspector__two-columns">
              <ElFormItem label="列间距">
                <DesignerPropertyEditorHost
                  :definition="appearanceDefinitions.gridGutter"
                  :model-value="document.appearance.gridGutter"
                  @update:model-value="updateAppearance('gridGutter', Number($event))"
                />
              </ElFormItem>
              <ElFormItem label="字段行距">
                <DesignerPropertyEditorHost
                  :definition="appearanceDefinitions.rowGap"
                  :model-value="document.appearance.rowGap"
                  @update:model-value="updateAppearance('rowGap', Number($event))"
                />
              </ElFormItem>
            </div>
            <div class="designer-inspector__two-columns">
              <ElFormItem label="PC 默认跨度">
                <DesignerPropertyEditorHost
                  :definition="appearanceDefinitions.defaultPcSpan"
                  :model-value="document.appearance.defaultPcSpan"
                  @update:model-value="updateAppearance('defaultPcSpan', Number($event))"
                />
              </ElFormItem>
              <ElFormItem label="移动默认跨度">
                <DesignerPropertyEditorHost
                  :definition="appearanceDefinitions.defaultMobileSpan"
                  :model-value="document.appearance.defaultMobileSpan"
                  @update:model-value="updateAppearance('defaultMobileSpan', Number($event))"
                />
              </ElFormItem>
            </div>
            <ElFormItem label="控件尺寸">
              <DesignerPropertyEditorHost
                :definition="appearanceDefinitions.size"
                :model-value="document.appearance.size"
                @update:model-value="updateAppearance('size', $event)"
              />
            </ElFormItem>
            <ElFormItem label="只读展示">
              <DesignerPropertyEditorHost
                :definition="appearanceDefinitions.readonlyDisplayMode"
                :model-value="document.appearance.readonlyDisplayMode"
                @update:model-value="updateAppearance('readonlyDisplayMode', $event)"
              />
            </ElFormItem>
            <ElFormItem label="默认占位提示">
              <ElInput
                :model-value="document.appearance.defaultPlaceholder"
                @update:model-value="updateAppearance('defaultPlaceholder', $event)"
              />
            </ElFormItem>
            <ElDivider content-position="left">外观</ElDivider>
            <ElFormItem label="控件圆角">
              <DesignerPropertyEditorHost
                :definition="appearanceDefinitions.controlRadius"
                :model-value="document.appearance.controlRadius"
                @update:model-value="updateAppearance('controlRadius', $event)"
              />
            </ElFormItem>
            <ElFormItem label="默认容器样式">
              <DesignerPropertyEditorHost
                :definition="appearanceDefinitions.containerStyle"
                :model-value="document.appearance.containerStyle"
                @update:model-value="updateAppearance('containerStyle', $event)"
              />
            </ElFormItem>
            <ElFormItem label="默认容器圆角">
              <DesignerPropertyEditorHost
                :definition="appearanceDefinitions.containerRadius"
                :model-value="document.appearance.containerRadius"
                @update:model-value="updateAppearance('containerRadius', $event)"
              />
            </ElFormItem>
            <div
              class="designer-inspector__appearance-preview"
              :class="controlRadiusBind.class"
              :style="controlRadiusBind.style"
            >
              <div :class="formContainerAppearanceClasses" :style="formContainerRadiusStyle">
                <span>容器外观预览</span>
                <ElInput model-value="字段控件" readonly />
              </div>
            </div>
            <div class="designer-inspector__bulk-appearance">
              <ElButton
                :disabled="surfaceContainerCount === 0"
                @click="openApplyContainerAppearance"
              >
                应用到全部容器
              </ElButton>
              <small>清除组件独立设置，使后续表单外观调整继续联动。</small>
            </div>
            <ElDivider content-position="left">提交与动作栏</ElDivider>
            <ElFormItem label="提交时忽略普通隐藏字段">
              <ElSwitch
                :model-value="document.submitPolicy.ignoreHiddenFields"
                @update:model-value="
                  emit('update-submit-policy', { ignoreHiddenFields: Boolean($event) })
                "
              />
              <small>技术隐藏字段仍提交；字段“忽略提交”始终优先。</small>
            </ElFormItem>
            <ElFormItem label="显示运行按钮">
              <ElSwitch
                :model-value="document.actionBar.visible"
                @update:model-value="emit('update-action-bar', { visible: Boolean($event) })"
              />
            </ElFormItem>
            <div class="designer-inspector__two-columns">
              <ElFormItem label="按钮位置">
                <ElSelect
                  :model-value="document.actionBar.position"
                  @update:model-value="emit('update-action-bar', { position: $event })"
                >
                  <ElOption label="顶部" value="TOP" /><ElOption label="底部" value="BOTTOM" />
                  <ElOption label="顶部和底部" value="BOTH" />
                </ElSelect>
              </ElFormItem>
              <ElFormItem label="按钮对齐">
                <ElSelect
                  :model-value="document.actionBar.align"
                  @update:model-value="emit('update-action-bar', { align: $event })"
                >
                  <ElOption label="左侧" value="LEFT" /><ElOption label="居中" value="CENTER" />
                  <ElOption label="右侧" value="RIGHT" />
                </ElSelect>
              </ElFormItem>
            </div>
            <div class="designer-inspector__action-buttons">
              <ElCheckbox
                v-for="button in document.actionBar.buttons"
                :key="button.action"
                :model-value="button.enabled"
                @update:model-value="updateActionButton(button.action, Boolean($event))"
                >{{ button.label }}</ElCheckbox
              >
            </div>
            <ElDivider content-position="left">全局高级能力</ElDivider>
            <div class="designer-inspector__global-actions">
              <ElButton plain @click="emit('open-event-editor')"
                ><DxSvgIcon icon="ri:flashlight-line" />表单事件</ElButton
              >
              <ElButton plain @click="emit('open-global-advanced')"
                ><DxSvgIcon icon="ri:database-2-line" />变量 / 数据源 / 国际化</ElButton
              >
              <ElButton plain @click="emit('open-schema')"
                ><DxSvgIcon icon="ri:code-s-slash-line" />Schema 工具</ElButton
              >
            </div>
          </ElForm>
        </div>
      </ElTabPane>
    </ElTabs>

    <DModal
      v-model="applyAppearanceVisible"
      title="应用表单外观到全部容器"
      width="440px"
      confirm-text="应用"
      :confirm-disabled="applyAppearanceDimensions.length === 0 || surfaceContainerCount === 0"
      @confirm="confirmApplyContainerAppearance"
    >
      <ElAlert
        type="info"
        :closable="false"
        show-icon
        :title="`检测到 ${surfaceContainerCount} 个支持外观的显式容器`"
        description="所选维度会恢复为跟随表单，包括历史填充样式；操作可整体撤销。"
      />
      <ElCheckboxGroup v-model="applyAppearanceDimensions" class="designer-inspector__bulk-options">
        <ElCheckbox value="STYLE">容器样式</ElCheckbox>
        <ElCheckbox value="RADIUS">容器圆角</ElCheckbox>
      </ElCheckboxGroup>
    </DModal>
  </aside>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue'
import DModal from '../infrastructure/FormModalShell.vue'
import DxSvgIcon from '../infrastructure/FormIcon.vue'
import { compatibleDesignerComponents, findDesignerComponent } from '@daxiangme/form-core'
import {
  countDesignerSurfaceContainers,
  designerContainerAppearanceClasses,
  designerContainerRadiusStyle,
  designerRadiusValueLabel,
  isDesignerRadiusValue,
  resolveDesignerContainerAppearance,
} from '@daxiangme/form-core'
import { DESIGNER_SPACING_PRESETS, numberOptions } from '@daxiangme/form-core'
import { designerControlRadiusBind } from '../designer-radius-style'
import type {
  DesignerComponentEvent,
  DesignerComponentRegistration,
  DesignerContainerAppearanceDimension,
  DesignerContainerNode,
  DesignerContainerStyleOverride,
  DesignerDocument,
  DesignerField,
  DesignerLayoutNode,
  DesignerOneToManyRelation,
  DesignerOverlayMaxHeightPreset,
  DesignerOverlayModule,
  DesignerPropertyDefinition,
  DesignerRadiusValue,
  DesignerRelationPatch,
  DesignerRootEntityPatch,
} from '@daxiangme/form-core'
import DesignerFieldDefaultValueEditor from './DesignerFieldDefaultValueEditor.vue'
import DesignerPropertyEditorHost from './DesignerPropertyEditorHost.vue'
import DesignerDataModelSourceIdentity from './DesignerDataModelSourceIdentity.vue'

defineOptions({ name: 'DesignerInspector' })

const props = defineProps<{
  document: DesignerDocument
  selectedNode?: DesignerLayoutNode
  selectedField?: DesignerField
  activeModule?: DesignerOverlayModule
  activeTab?: 'component' | 'form'
}>()
const emit = defineEmits<{
  'update-document': [patch: Partial<DesignerDocument>]
  'update-appearance': [key: keyof DesignerDocument['appearance'], value: unknown]
  'update-field': [patch: Partial<DesignerField>]
  'change-component': [componentType: string]
  'update-node': [patch: Partial<DesignerContainerNode>]
  'update-configuration': [key: string, value: unknown]
  'update-grid': [device: 'pc' | 'mobile', key: string, value: unknown]
  'apply-container-appearance': [dimensions: DesignerContainerAppearanceDimension[]]
  'update-root-entity': [patch: DesignerRootEntityPatch]
  'update-relation': [relationCode: string, patch: DesignerRelationPatch]
  'update-submit-policy': [patch: Partial<DesignerDocument['submitPolicy']>]
  'update-action-bar': [patch: Partial<DesignerDocument['actionBar']>]
  'update-module': [moduleCode: string, patch: Partial<DesignerOverlayModule>]
  'open-field-advanced': []
  'open-event-editor': []
  'open-global-advanced': []
  'open-schema': []
  'update:active-tab': [tab: 'component' | 'form']
}>()
const internalActiveTab = ref<'component' | 'form'>('component')
const activeTabModel = computed({
  get: () => props.activeTab ?? internalActiveTab.value,
  set: (value: string) => {
    if (value !== 'component' && value !== 'form') return
    internalActiveTab.value = value
    emit('update:active-tab', value)
  },
})
const componentScrollRef = ref<HTMLElement>()
const openedSections = ref(['identity', 'field-basic', 'relation', 'configuration-BASIC', 'layout'])
const activeSection = ref('identity')
const applyAppearanceVisible = ref(false)
const applyAppearanceDimensions = ref<DesignerContainerAppearanceDimension[]>(['STYLE', 'RADIUS'])
const moduleNameDraft = ref('')
const moduleCodeDraft = ref('')
const identifierDefinitions = {
  rootEntityCode: propertyDefinition('rootEntityCode', '主实体编码', {
    type: 'IDENTIFIER',
    maxLength: 64,
  }),
  relationCode: propertyDefinition('relationCode', '关系编码', {
    type: 'IDENTIFIER',
    maxLength: 64,
  }),
  childEntityCode: propertyDefinition('childEntityCode', '子实体编码', {
    type: 'IDENTIFIER',
    maxLength: 64,
  }),
} satisfies Record<string, DesignerPropertyDefinition>
const appearanceDefinitions = {
  labelPosition: propertyDefinition('labelPosition', '默认位置', {
    type: 'SEGMENTED',
    options: [
      { label: '顶部', value: 'TOP' },
      { label: '左侧', value: 'LEFT' },
      { label: '右侧', value: 'RIGHT' },
    ],
  }),
  labelWidth: propertyDefinition('labelWidth', '标签宽度', {
    type: 'PRESET_NUMBER',
    options: numberOptions([80, 100, 120, 160, 200], (value) => `${value} px`),
    minimum: 0,
    maximum: 320,
    unit: 'px',
    legacyValuePolicy: 'PRESERVE',
  }),
  labelAlign: propertyDefinition('labelAlign', '标签对齐', {
    type: 'SEGMENTED',
    options: [
      { label: '左对齐', value: 'LEFT' },
      { label: '右对齐', value: 'RIGHT' },
    ],
  }),
  gridGutter: propertyDefinition('gridGutter', '列间距', {
    type: 'PRESET_NUMBER',
    options: DESIGNER_SPACING_PRESETS,
    minimum: 0,
    maximum: 64,
    unit: 'px',
    legacyValuePolicy: 'PRESERVE',
  }),
  rowGap: propertyDefinition('rowGap', '字段行距', {
    type: 'PRESET_NUMBER',
    options: DESIGNER_SPACING_PRESETS,
    minimum: 0,
    maximum: 64,
    unit: 'px',
    legacyValuePolicy: 'PRESERVE',
  }),
  defaultPcSpan: propertyDefinition('defaultPcSpan', 'PC 默认跨度', {
    type: 'GRID_SPAN',
    device: 'desktop',
    legacyValuePolicy: 'PRESERVE',
  }),
  defaultMobileSpan: propertyDefinition('defaultMobileSpan', '移动默认跨度', {
    type: 'GRID_SPAN',
    device: 'mobile',
    legacyValuePolicy: 'PRESERVE',
  }),
  size: propertyDefinition('size', '控件尺寸', {
    type: 'SELECT',
    options: [
      { label: '小', value: 'SMALL' },
      { label: '默认', value: 'DEFAULT' },
      { label: '大', value: 'LARGE' },
    ],
  }),
  readonlyDisplayMode: propertyDefinition('readonlyDisplayMode', '只读展示', {
    type: 'SELECT',
    options: [
      { label: '禁用控件', value: 'CONTROL' },
      { label: '纯文本', value: 'TEXT' },
    ],
  }),
  controlRadius: propertyDefinition('controlRadius', '控件圆角', {
    type: 'RADIUS',
  }),
  containerStyle: propertyDefinition('containerStyle', '默认容器样式', {
    type: 'SEGMENTED',
    options: [
      { label: '无', value: 'NONE' },
      { label: '边框', value: 'BORDERED' },
      { label: '阴影', value: 'SHADOW' },
    ],
  }),
  containerRadius: propertyDefinition('containerRadius', '默认容器圆角', {
    type: 'RADIUS',
  }),
} satisfies Record<string, DesignerPropertyDefinition>
const moduleRadiusDefinition = propertyDefinition('radius', '弹窗圆角', {
  type: 'RADIUS',
})
const gridOffsetDefinition = propertyDefinition('offset', '偏移', {
  type: 'GRID_OFFSET',
  spanKey: 'span',
  legacyValuePolicy: 'PRESERVE',
})
const registration = computed<DesignerComponentRegistration | undefined>(() => {
  if (props.selectedField) return findDesignerComponent(props.selectedField.componentType)
  if (props.selectedNode?.nodeType === 'CONTAINER')
    return findDesignerComponent(props.selectedNode.componentType)
  return undefined
})
const compatibleComponents = computed(() =>
  props.selectedField ? compatibleDesignerComponents(props.selectedField.semanticType) : [],
)
const selectedConfiguration = computed(
  () =>
    props.selectedField?.configuration ??
    (props.selectedNode?.nodeType === 'CONTAINER' ? props.selectedNode.configuration : {}),
)
const selectedRelation = computed<DesignerOneToManyRelation | undefined>(() => {
  const node = props.selectedNode
  if (
    node?.nodeType !== 'CONTAINER' ||
    !['row-subtable', 'block-subtable'].includes(node.componentType)
  ) {
    return undefined
  }
  const relationCode =
    typeof node.configuration.relationCode === 'string' ? node.configuration.relationCode : ''
  return props.document.dataSchema.relations.find((relation) => relation.code === relationCode)
})
const propertySections = computed(() => {
  const definitions = registration.value?.properties ?? []
  const labels: Record<DesignerPropertyDefinition['section'], string> = {
    BASIC: '组件基础',
    DATA: '数据能力',
    DISPLAY: '显示效果',
    CAPABILITY: '专属能力',
  }
  return (Object.keys(labels) as DesignerPropertyDefinition['section'][])
    .map((code) => ({
      code,
      label: labels[code],
      items: definitions.filter(
        (item) =>
          item.section === code &&
          (!item.editor.visibleWhen || item.editor.visibleWhen(selectedConfiguration.value)),
      ),
    }))
    .filter((section) => section.items.length > 0)
})
const inspectorNavigation = computed(() => {
  const items = [] as Array<{ name: string; label: string; icon: string }>
  if (props.selectedField) {
    items.push(
      { name: 'identity', label: '字段身份', icon: 'ri:file-settings-line' },
      { name: 'field-basic', label: '基础与校验', icon: 'ri:equalizer-2-line' },
      { name: 'advanced', label: '高级能力', icon: 'ri:flashlight-line' },
    )
  } else if (registration.value?.supportedEvents?.length) {
    items.push({ name: 'advanced', label: '事件能力', icon: 'ri:flashlight-line' })
  }
  if (selectedRelation.value) {
    items.push({ name: 'relation', label: '主子关系', icon: 'ri:git-branch-line' })
  }
  const icons: Record<DesignerPropertyDefinition['section'], string> = {
    BASIC: 'ri:settings-3-line',
    DATA: 'ri:database-2-line',
    DISPLAY: 'ri:font-size-2',
    CAPABILITY: 'ri:flashlight-line',
  }
  for (const section of propertySections.value) {
    items.push({
      name: `configuration-${section.code}`,
      label: section.label,
      icon: icons[section.code],
    })
  }
  items.push({ name: 'layout', label: '响应式布局', icon: 'ri:layout-grid-line' })
  return items
})
const layoutShowLabelText = computed(() =>
  registration.value?.componentType === 'steps' ? '显示外层字段标题' : '显示标签',
)
const selectedContainerAppearance = computed(() => {
  const selectedNode = props.selectedNode
  return selectedNode?.nodeType === 'CONTAINER'
    ? resolveDesignerContainerAppearance(props.document.appearance, selectedNode)
    : undefined
})
const surfaceContainerCount = computed(() => countDesignerSurfaceContainers(props.document))
const formContainerAppearanceClasses = computed(() =>
  designerContainerAppearanceClasses({
    style: props.document.appearance.containerStyle,
    radius: props.document.appearance.containerRadius,
    styleSource: 'FORM',
    radiusSource: 'FORM',
  }),
)
const formContainerRadiusStyle = computed(() =>
  designerContainerRadiusStyle(props.document.appearance.containerRadius),
)
const controlRadiusBind = computed(() =>
  designerControlRadiusBind(props.document.appearance.controlRadius),
)

watch(
  () => [props.activeModule?.id, props.activeModule?.name, props.activeModule?.code] as const,
  ([, name, code]) => {
    moduleNameDraft.value = name ?? ''
    moduleCodeDraft.value = code ?? ''
  },
  { immediate: true },
)

function updateField(patch: Partial<DesignerField>): void {
  emit('update-field', patch)
}

function changeComponent(value: string): void {
  emit('change-component', value)
}

function updateDisplay(key: keyof DesignerField['display'], value: unknown): void {
  if (!props.selectedField) return
  emit('update-field', { display: { ...props.selectedField.display, [key]: value } })
}

function updateValidation(key: keyof DesignerField['validation'], value: unknown): void {
  if (!props.selectedField) return
  emit('update-field', { validation: { ...props.selectedField.validation, [key]: value } })
}

function updateConfiguration(key: string, value: unknown): void {
  emit('update-configuration', key, value)
}

function updateGrid(device: 'pc' | 'mobile', key: string, value: unknown): void {
  emit('update-grid', device, key, value)
}

function updateAppearance(key: keyof DesignerDocument['appearance'], value: unknown): void {
  emit('update-appearance', key, value)
}

function updateRootEntity(patch: DesignerRootEntityPatch): void {
  emit('update-root-entity', patch)
}

function updateRelation(patch: DesignerRelationPatch): void {
  if (!selectedRelation.value) return
  emit('update-relation', selectedRelation.value.code, patch)
}

/** 失焦时一次提交模块名称；校验拒绝后恢复文档中的权威值。 */
async function commitModuleName(): Promise<void> {
  const module = props.activeModule
  if (!module) return
  emit('update-module', module.code, { name: moduleNameDraft.value.trim() })
  await nextTick()
  moduleNameDraft.value = props.activeModule?.name ?? ''
}

/** 失焦时一次提交模块编码；编码变化由工作区统一同步事件引用。 */
async function commitModuleCode(): Promise<void> {
  const module = props.activeModule
  if (!module) return
  emit('update-module', module.code, { code: moduleCodeDraft.value.trim() })
  await nextTick()
  moduleCodeDraft.value = props.activeModule?.code ?? ''
}

/** 仅提交有效模块宽度，避免清空数字输入时产生非法文档值。 */
function updateModuleWidth(moduleCode: string, value: number | undefined): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) return
  emit('update-module', moduleCode, { width: value })
}

/** 仅提交跟随系统或合法 4 的倍数像素，拒绝自由数值。 */
function updateModuleRadius(moduleCode: string, value: unknown): void {
  if (!isDesignerRadiusValue(value)) return
  emit('update-module', moduleCode, { radius: value })
}

/** 仅提交受控弹窗运行高度档位，设计画布不会消费该值。 */
function updateModuleMaxHeight(moduleCode: string, value: unknown): void {
  if (!['COMPACT', 'STANDARD', 'SPACIOUS', 'VIEWPORT'].includes(String(value))) return
  emit('update-module', moduleCode, {
    maxHeightPreset: value as DesignerOverlayMaxHeightPreset,
  })
}

function updateActionButton(
  action: DesignerDocument['actionBar']['buttons'][number]['action'],
  enabled: boolean,
): void {
  emit('update-action-bar', {
    buttons: props.document.actionBar.buttons.map((button) =>
      button.action === action ? { ...button, enabled } : button,
    ),
  })
}

function openApplyContainerAppearance(): void {
  applyAppearanceDimensions.value = ['STYLE', 'RADIUS']
  applyAppearanceVisible.value = true
}

function confirmApplyContainerAppearance(): void {
  if (applyAppearanceDimensions.value.length === 0) return
  emit('apply-container-appearance', [...applyAppearanceDimensions.value])
  applyAppearanceVisible.value = false
}

function configurationValue(key: string): unknown {
  return selectedConfiguration.value[key]
}

function gridSpanDefinition(device: 'pc' | 'mobile'): DesignerPropertyDefinition {
  return propertyDefinition('span', '跨度', {
    type: 'GRID_SPAN',
    device: device === 'pc' ? 'desktop' : 'mobile',
    legacyValuePolicy: 'PRESERVE',
  })
}

function propertyDefinition(
  key: string,
  label: string,
  editor: DesignerPropertyDefinition['editor'],
): DesignerPropertyDefinition {
  return { key, label, section: 'DISPLAY', editor }
}

function containerStyleLabel(style: Exclude<DesignerContainerStyleOverride, 'INHERIT'>): string {
  return { NONE: '无容器', BORDERED: '边框', SHADOW: '阴影', FILLED: '历史填充' }[style]
}

function radiusLabel(radius: DesignerRadiusValue): string {
  return designerRadiusValueLabel(radius)
}

function normalizeKey(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/^([0-9])/, '_$1')
}

function componentEventLabel(event: DesignerComponentEvent): string {
  return { CHANGE: '值变化', BLUR: '失焦', FOCUS: '聚焦', CLICK: '点击' }[event]
}

async function jumpToSection(name: string): Promise<void> {
  activeSection.value = name
  if (!openedSections.value.includes(name)) openedSections.value = [...openedSections.value, name]
  await nextTick()
  componentScrollRef.value
    ?.querySelector<HTMLElement>(`#designer-inspector-section-${name}`)
    ?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    })
}
</script>

<style scoped>
.designer-inspector {
  display: flex;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--el-bg-color);
}

.designer-inspector__tabs {
  display: flex;
  width: 100%;
  min-height: 0;
  flex-direction: column;
}

.designer-inspector__tabs :deep(.el-tabs__header) {
  flex: 0 0 auto;
  padding: 0 var(--daxiang-form-space-3);
  margin-bottom: 0;
}

.designer-inspector__tabs :deep(.el-tabs__content),
.designer-inspector__tabs :deep(.el-tab-pane) {
  display: flex;
  width: 100%;
  min-width: 0;
  min-height: 0;
  flex: 1 1 0;
  overflow: hidden;
}

.designer-inspector__scroll {
  width: 100%;
  min-width: 0;
  min-height: 0;
  flex: 1 1 0;
  padding: var(--daxiang-form-space-3);
  overflow: hidden auto;
  overscroll-behavior: contain;
}

.designer-inspector__empty {
  display: flex;
  width: 100%;
  min-width: 0;
  min-height: 0;
  flex: 1 1 0;
  align-items: center;
  justify-content: center;
}

.designer-inspector__container-events {
  display: flex;
  flex-direction: column;
  gap: var(--daxiang-form-space-2);
}

.designer-inspector__container-events > div {
  display: flex;
  flex-wrap: wrap;
  gap: var(--daxiang-form-space-1);
}

.designer-inspector__container-events small {
  color: var(--el-text-color-secondary);
}

.designer-inspector__section-nav {
  position: sticky;
  z-index: 4;
  top: calc(var(--daxiang-form-space-3) * -1);
  display: flex;
  align-items: center;
  padding: var(--daxiang-form-space-2) 0;
  margin-bottom: var(--daxiang-form-space-2);
  background: var(--el-bg-color);
  border-bottom: 1px solid var(--el-border-color-lighter);
  gap: var(--daxiang-form-space-1);
}

.designer-inspector__section-nav button {
  display: inline-flex;
  width: 32px;
  height: 32px;
  align-items: center;
  justify-content: center;
  color: var(--el-text-color-secondary);
  background: transparent;
  border: 0;
  border-radius: var(--el-border-radius-base);
  cursor: pointer;
}

.designer-inspector__section-nav button:hover,
.designer-inspector__section-nav button.is-active {
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}

.designer-inspector__identity {
  display: grid;
  align-items: center;
  padding-bottom: var(--daxiang-form-space-3);
  grid-template-columns: auto minmax(0, 1fr);
  gap: var(--daxiang-form-space-2);
}

.designer-inspector__identity > div {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.designer-inspector__identity small,
.designer-inspector :deep(.el-form-item small) {
  color: var(--el-text-color-secondary);
  font-size: 11px;
}

.designer-inspector :deep(.el-select),
.designer-inspector :deep(.el-input-number),
.designer-inspector :deep(.el-segmented) {
  width: 100%;
}

.designer-inspector :deep(.el-form-item) {
  margin-bottom: var(--daxiang-form-space-3);
}

.designer-inspector :deep(.el-form-item__content) {
  width: 100%;
  min-width: 0;
}

.designer-inspector :deep(.el-collapse-item__header) {
  height: 42px;
  font-weight: 600;
}

.designer-inspector__two-columns {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--daxiang-form-space-2);
}

.designer-inspector__device-grid > strong {
  display: block;
  padding: var(--daxiang-form-space-2) 0;
  color: var(--el-text-color-primary);
}

.designer-inspector__effective-appearance {
  display: grid;
  align-items: center;
  padding: var(--daxiang-form-space-2);
  margin: var(--daxiang-form-space-2) 0;
  color: var(--el-text-color-regular);
  background: var(--el-fill-color-light);
  border-radius: var(--el-border-radius-base);
  grid-template-columns: auto minmax(0, 1fr);
  gap: var(--daxiang-form-space-1) var(--daxiang-form-space-2);
}

.designer-inspector__effective-appearance small {
  grid-column: 2;
}

.designer-inspector__appearance-preview {
  padding: var(--daxiang-form-space-2);
  margin-bottom: var(--daxiang-form-space-3);
  background: var(--el-fill-color-extra-light);
  border: 1px dashed var(--el-border-color);
  border-radius: var(--el-border-radius-base);
}

.designer-inspector__appearance-preview > div {
  display: grid;
  padding: var(--daxiang-form-space-3);
  gap: var(--daxiang-form-space-2);
}

.designer-inspector__appearance-preview > .is-surface-none {
  padding: 0;
}

.designer-inspector__appearance-preview > .is-surface-bordered {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--daxiang-form-container-radius);
}

.designer-inspector__appearance-preview > .is-surface-shadow {
  background: var(--el-bg-color);
  border-radius: var(--daxiang-form-container-radius);
  box-shadow: var(--el-box-shadow-light);
}

.designer-inspector__appearance-preview span {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.designer-inspector__bulk-appearance {
  display: flex;
  align-items: flex-start;
  flex-direction: column;
  gap: var(--daxiang-form-space-1);
}

.designer-inspector__bulk-appearance small {
  color: var(--el-text-color-secondary);
  font-size: 11px;
}

.designer-inspector__bulk-options {
  display: flex;
  padding-top: var(--daxiang-form-space-3);
  flex-direction: column;
  gap: var(--daxiang-form-space-2);
}

.designer-inspector__advanced-actions,
.designer-inspector__global-actions {
  display: flex;
  flex-direction: column;
  gap: var(--daxiang-form-space-2);
}

.designer-inspector__advanced-actions > div {
  display: grid;
  align-items: center;
  padding: var(--daxiang-form-space-2);
  background: var(--el-fill-color-extra-light);
  border-radius: var(--el-border-radius-base);
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--daxiang-form-space-1) var(--daxiang-form-space-2);
}

.designer-inspector__advanced-actions small {
  grid-column: 1;
}

.designer-inspector__advanced-actions .el-button {
  grid-column: 2;
  grid-row: 1 / span 2;
}

.designer-inspector__action-buttons {
  display: flex;
  margin-bottom: var(--daxiang-form-space-3);
  flex-wrap: wrap;
  gap: var(--daxiang-form-space-2);
}

.designer-inspector__global-actions .el-button {
  width: 100%;
  justify-content: flex-start;
  margin-left: 0;
}
</style>
