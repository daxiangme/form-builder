import type {
  DesignerComponentGroup,
  DesignerComponentRegistration,
  DesignerPropertyEditor,
  DesignerPropertyDefinition,
  DesignerPropertyOption,
  DesignerSemanticType,
} from './types'
import {
  DESIGNER_CURRENCY_PRESETS,
  DESIGNER_FILE_SIZE_PRESETS,
  DESIGNER_FONT_SIZE_PRESETS,
  DESIGNER_INITIAL_COUNT_PRESETS,
  DESIGNER_LENGTH_PRESETS,
  DESIGNER_OPTIONAL_SELECTION_COUNT_PRESETS,
  DESIGNER_PAGE_SIZE_PRESETS,
  DESIGNER_SELECTION_COUNT_PRESETS,
  DESIGNER_SPACING_PRESETS,
  DESIGNER_TIMEOUT_PRESETS,
  numberOptions,
} from './property-editor-presets'

const TEXT_OPTIONS: DesignerPropertyDefinition[] = [
  property('placeholder', '占位提示', 'BASIC', 'TEXT'),
  property('clearable', '允许清空', 'DISPLAY', 'BOOLEAN'),
  property('maxLength', '最大长度', 'DATA', presetNumberEditor(DESIGNER_LENGTH_PRESETS, 0, 10000)),
]
const STATIC_OPTIONS: DesignerPropertyDefinition[] = [
  property('options', '选项', 'DATA', 'OPTIONS'),
  property('placeholder', '占位提示', 'BASIC', 'TEXT'),
  property('clearable', '允许清空', 'DISPLAY', 'BOOLEAN'),
]
const DIRECTORY_OPTIONS: DesignerPropertyDefinition[] = [
  property('selectionMode', '选择模式', 'DATA', 'SELECT', {
    options: selectOptions(['SINGLE', 'MULTIPLE'], ['单选', '多选']),
  }),
  property(
    'maxSelections',
    '最多选择',
    'DATA',
    presetNumberEditor(DESIGNER_SELECTION_COUNT_PRESETS, 1, 100, {
      visibleWhen: (configuration) => configuration.selectionMode === 'MULTIPLE',
    }),
  ),
  property('buttonText', '按钮文字', 'DISPLAY', 'TEXT'),
  property('scope', '数据范围', 'CAPABILITY', 'SELECT', {
    options: selectOptions(['CURRENT_TENANT', 'CURRENT_ORGANIZATION'], ['当前租户', '当前组织']),
  }),
]
const CONDITIONAL_REASON =
  '静态 Core 未接入业务 Adapter；可以完成设计配置，运行预览不会请求远程数据'
const CONTAINER_APPEARANCE_PROPERTIES: DesignerPropertyDefinition[] = [
  property('surfaceStyle', '容器样式', 'DISPLAY', {
    type: 'SELECT',
    options: [
      ...selectOptions(
        ['INHERIT', 'NONE', 'BORDERED', 'SHADOW'],
        ['跟随表单', '无', '边框', '阴影'],
      ),
      { label: '填充（旧配置）', value: 'FILLED', disabled: true } satisfies DesignerPropertyOption,
    ],
  }),
  property('surfaceRadius', '容器圆角', 'DISPLAY', {
    type: 'RADIUS',
    includeInherit: true,
  }),
]

/** 45 类独立表单组件的完整静态注册表。 */
export const DESIGNER_COMPONENTS: readonly DesignerComponentRegistration[] = Object.freeze([
  container(
    'group',
    '分组',
    'ri:layout-row-line',
    'LAYOUT',
    true,
    'SURFACE',
    {
      title: '分组',
      collapsible: false,
      defaultCollapsed: false,
      surfaceStyle: 'INHERIT',
      surfaceRadius: 'INHERIT',
      columns: 2,
      columnGap: 16,
    },
    [
      property('title', '分组标题', 'BASIC', 'TEXT'),
      property('collapsible', '允许折叠', 'DISPLAY', 'BOOLEAN'),
      property('defaultCollapsed', '默认折叠', 'DISPLAY', {
        type: 'BOOLEAN',
        visibleWhen: (configuration) => configuration.collapsible === true,
      }),
      property(
        'columns',
        '默认列数',
        'DISPLAY',
        presetNumberEditor(
          numberOptions([1, 2, 3, 4], (value) => `${value} 列`),
          1,
          4,
        ),
      ),
      property(
        'columnGap',
        '列间距',
        'DISPLAY',
        presetNumberEditor(DESIGNER_SPACING_PRESETS, 0, 48, { unit: 'px' }),
      ),
    ],
  ),
  container(
    'tabs',
    '标签页',
    'ri:folder-line',
    'LAYOUT',
    true,
    'SURFACE',
    {
      tabsType: '',
      tabs: ['标签页 1', '标签页 2'],
      surfaceStyle: 'INHERIT',
      surfaceRadius: 'INHERIT',
    },
    [
      property('tabsType', '标签样式', 'DISPLAY', 'SELECT', {
        options: selectOptions(['', 'card', 'border-card'], ['简洁', '卡片', '边框卡片']),
      }),
      property('tabs', '标签页', 'DATA', 'OPTIONS'),
    ],
  ),
  container(
    'row-subtable',
    '行子表',
    'ri:table-line',
    'SUBTABLE',
    true,
    'SURFACE',
    {
      title: '行子表',
      allowCreate: true,
      allowDelete: true,
      allowCopy: true,
      showIndex: true,
      pagination: false,
      pageSize: 10,
      initialRows: 0,
      relationCode: '',
      surfaceStyle: 'INHERIT',
      surfaceRadius: 'INHERIT',
    },
    [
      property('title', '子表标题', 'BASIC', 'TEXT'),
      property('allowCreate', '允许新增行', 'CAPABILITY', 'BOOLEAN'),
      property('allowDelete', '允许删除行', 'CAPABILITY', 'BOOLEAN'),
      property('allowCopy', '允许复制行', 'CAPABILITY', 'BOOLEAN'),
      property('showIndex', '显示序号', 'DISPLAY', 'BOOLEAN'),
      property('pagination', '启用分页', 'DISPLAY', 'BOOLEAN'),
      property(
        'pageSize',
        '每页行数',
        'DISPLAY',
        presetNumberEditor(DESIGNER_PAGE_SIZE_PRESETS, 1, 100, {
          visibleWhen: (configuration) => configuration.pagination === true,
        }),
      ),
      property(
        'initialRows',
        '初始行数',
        'DATA',
        presetNumberEditor(DESIGNER_INITIAL_COUNT_PRESETS, 0, 20),
      ),
    ],
    'AVAILABLE',
    '',
    3,
  ),
  container(
    'block-subtable',
    '块子表',
    'ri:layout-grid-line',
    'SUBTABLE',
    true,
    'SURFACE',
    {
      title: '块子表',
      allowCreate: true,
      allowDelete: true,
      allowCopy: true,
      initialRows: 0,
      deepEditMode: 'INLINE',
      relationCode: '',
      surfaceStyle: 'INHERIT',
      surfaceRadius: 'INHERIT',
    },
    [
      property('title', '子表标题', 'BASIC', 'TEXT'),
      property('allowCreate', '允许新增', 'CAPABILITY', 'BOOLEAN'),
      property('allowDelete', '允许删除', 'CAPABILITY', 'BOOLEAN'),
      property('allowCopy', '允许复制', 'CAPABILITY', 'BOOLEAN'),
      property(
        'initialRows',
        '初始块数',
        'DATA',
        presetNumberEditor(DESIGNER_INITIAL_COUNT_PRESETS, 0, 20),
      ),
      property('deepEditMode', '编辑方式', 'DISPLAY', 'SELECT', {
        options: selectOptions(['INLINE', 'DIALOG'], ['行内', '弹窗']),
      }),
    ],
    'AVAILABLE',
    '',
    3,
  ),
  container(
    'title',
    '标题',
    'ri:heading',
    'AUXILIARY',
    false,
    'NONE',
    {
      text: '标题',
      level: 3,
      fontSize: 20,
      fontColor: '',
      fontWeight: 'semibold',
      align: 'left',
    },
    [
      property('text', '标题文字', 'BASIC', 'TEXT'),
      property(
        'level',
        '标题级别',
        'DISPLAY',
        presetNumberEditor(
          numberOptions([1, 2, 3, 4, 5, 6], (value) => `H${value}`),
          1,
          6,
        ),
      ),
      property(
        'fontSize',
        '字号',
        'DISPLAY',
        presetNumberEditor(DESIGNER_FONT_SIZE_PRESETS, 12, 48, { unit: 'px' }),
      ),
      property('fontColor', '文字颜色', 'DISPLAY', 'COLOR'),
      property('fontWeight', '字重', 'DISPLAY', 'SELECT', {
        options: selectOptions(
          ['normal', 'medium', 'semibold', 'bold'],
          ['常规', '中等', '半粗', '粗体'],
        ),
      }),
      property('align', '对齐', 'DISPLAY', 'SELECT', {
        options: selectOptions(['left', 'center', 'right'], ['左', '中', '右']),
      }),
    ],
  ),
  container(
    'divider',
    '分隔线',
    'ri:separator',
    'AUXILIARY',
    false,
    'NONE',
    { text: '', position: 'left', borderStyle: 'solid' },
    [
      property('text', '分隔文字', 'BASIC', 'TEXT'),
      property('position', '文字位置', 'DISPLAY', 'SELECT', {
        options: selectOptions(['left', 'center', 'right'], ['左', '中', '右']),
      }),
      property('borderStyle', '线条样式', 'DISPLAY', 'SELECT', {
        options: selectOptions(['solid', 'dashed', 'dotted'], ['实线', '虚线', '点线']),
      }),
    ],
  ),
  container(
    'alert',
    '提示',
    'ri:alert-line',
    'AUXILIARY',
    false,
    'NONE',
    { title: '提示内容', type: 'info', effect: 'light', showIcon: true, closable: false },
    [
      property('title', '提示内容', 'BASIC', 'TEXTAREA'),
      property('type', '提示类型', 'DISPLAY', 'SELECT', {
        options: selectOptions(
          ['success', 'warning', 'info', 'error'],
          ['成功', '警告', '信息', '错误'],
        ),
      }),
      property('effect', '显示效果', 'DISPLAY', 'SELECT', {
        options: selectOptions(['light', 'dark'], ['浅色', '深色']),
      }),
      property('showIcon', '显示图标', 'DISPLAY', 'BOOLEAN'),
      property('closable', '允许关闭', 'CAPABILITY', 'BOOLEAN'),
    ],
  ),
  container(
    'button',
    '按钮',
    'ri:cursor-line',
    'AUXILIARY',
    false,
    'NONE',
    {
      text: '按钮',
      buttonType: 'primary',
      plain: false,
      round: false,
      disabled: false,
      align: 'left',
    },
    [
      property('text', '按钮文字', 'BASIC', 'TEXT'),
      property('buttonType', '按钮类型', 'DISPLAY', 'SELECT', {
        options: selectOptions(
          ['primary', 'success', 'warning', 'danger', 'info'],
          ['主要', '成功', '警告', '危险', '信息'],
        ),
      }),
      property('plain', '朴素按钮', 'DISPLAY', 'BOOLEAN'),
      property('round', '圆角按钮', 'DISPLAY', 'BOOLEAN'),
      property('disabled', '禁用', 'CAPABILITY', 'BOOLEAN'),
      property('align', '对齐', 'DISPLAY', 'SELECT', {
        options: selectOptions(['left', 'center', 'right'], ['左', '中', '右']),
      }),
    ],
  ),
  unavailableContainer(
    'captcha',
    '验证码',
    'ri:shield-check-line',
    '当前部署未配置短信或邮箱验证码渠道',
  ),
  container(
    'iframe',
    '外部页面',
    'ri:window-line',
    'AUXILIARY',
    false,
    'NONE',
    {
      title: '外部页面',
      url: '',
      height: 480,
      allowForms: true,
      allowPopups: false,
      allowScripts: false,
    },
    [
      property('title', '无障碍标题', 'BASIC', 'TEXT'),
      property('url', 'HTTPS 地址', 'DATA', { type: 'URL', maxLength: 2048 }),
      property(
        'height',
        '高度',
        'DISPLAY',
        presetNumberEditor(
          numberOptions([160, 240, 320, 480, 600, 800, 1000, 1200], (value) => `${value} px`),
          160,
          1200,
          { unit: 'px' },
        ),
      ),
      property('allowForms', '允许表单提交', 'CAPABILITY', 'BOOLEAN'),
      property('allowPopups', '允许弹窗', 'CAPABILITY', 'BOOLEAN'),
      property('allowScripts', '允许脚本', 'CAPABILITY', 'BOOLEAN'),
    ],
    'CONDITIONAL',
    '静态 Core 不加载任意外部 URL',
  ),

  field(
    'text',
    '单行文本',
    'ri:input-field',
    'BASIC',
    'STRING',
    {
      placeholder: '请输入',
      clearable: true,
      minLength: 0,
      maxLength: 255,
      prefix: '',
      suffix: '',
      trim: true,
    },
    [
      ...TEXT_OPTIONS,
      property(
        'minLength',
        '最小长度',
        'DATA',
        presetNumberEditor([{ label: '不限制', value: 0 }, ...DESIGNER_LENGTH_PRESETS], 0, 10000),
      ),
      property('prefix', '前缀', 'DISPLAY', 'TEXT'),
      property('suffix', '后缀', 'DISPLAY', 'TEXT'),
      property('trim', '去除首尾空格', 'DATA', 'BOOLEAN'),
    ],
  ),
  field(
    'textarea',
    '多行文本',
    'ri:align-left',
    'BASIC',
    'LONG_TEXT',
    { placeholder: '请输入', rows: 4, autosize: false, showWordLimit: true, maxLength: 2000 },
    [
      ...TEXT_OPTIONS,
      property(
        'rows',
        '行数',
        'DISPLAY',
        presetNumberEditor(
          numberOptions([2, 3, 4, 5, 6, 8, 10, 12, 16, 20], (value) => `${value} 行`),
          2,
          20,
        ),
      ),
      property('autosize', '自动高度', 'DISPLAY', 'BOOLEAN'),
      property('showWordLimit', '显示字数', 'DISPLAY', 'BOOLEAN'),
    ],
    24,
  ),
  field(
    'select',
    '下拉选择',
    'ri:list-check-3',
    'BASIC',
    'STRING',
    { options: defaultOptions(), clearable: true, filterable: true, placeholder: '请选择' },
    [...STATIC_OPTIONS, property('filterable', '允许搜索', 'DISPLAY', 'BOOLEAN')],
  ),
  field(
    'multi-select',
    '多选下拉',
    'ri:list-check',
    'BASIC',
    'ARRAY',
    {
      options: defaultOptions(),
      clearable: true,
      filterable: true,
      maxSelections: 0,
      collapseTags: true,
      placeholder: '请选择',
    },
    [
      ...STATIC_OPTIONS,
      property('filterable', '允许搜索', 'DISPLAY', 'BOOLEAN'),
      property(
        'maxSelections',
        '最多选择',
        'DATA',
        presetNumberEditor(DESIGNER_OPTIONAL_SELECTION_COUNT_PRESETS, 0, 100),
      ),
      property('collapseTags', '折叠标签', 'DISPLAY', 'BOOLEAN'),
    ],
  ),
  field(
    'checkbox',
    '复选框',
    'ri:checkbox-multiple-line',
    'BASIC',
    'ARRAY',
    {
      options: defaultOptions(),
      optionStyle: 'DEFAULT',
      minimumSelections: 0,
      maximumSelections: 0,
    },
    [
      property('options', '选项', 'DATA', 'OPTIONS'),
      property('optionStyle', '样式', 'DISPLAY', 'SELECT', {
        options: selectOptions(['DEFAULT', 'BUTTON'], ['普通', '按钮']),
      }),
      property(
        'minimumSelections',
        '最少选择',
        'DATA',
        presetNumberEditor(
          [{ label: '不限制', value: 0 }, ...DESIGNER_SELECTION_COUNT_PRESETS],
          0,
          100,
        ),
      ),
      property(
        'maximumSelections',
        '最多选择',
        'DATA',
        presetNumberEditor(DESIGNER_OPTIONAL_SELECTION_COUNT_PRESETS, 0, 100),
      ),
    ],
  ),
  field(
    'radio',
    '单选框',
    'ri:radio-button-line',
    'BASIC',
    'STRING',
    { options: defaultOptions(), optionStyle: 'DEFAULT', clearable: false },
    [
      property('options', '选项', 'DATA', 'OPTIONS'),
      property('optionStyle', '样式', 'DISPLAY', 'SELECT', {
        options: selectOptions(['DEFAULT', 'BUTTON'], ['普通', '按钮']),
      }),
      property('clearable', '允许清空', 'DISPLAY', 'BOOLEAN'),
    ],
  ),
  field(
    'date',
    '日期',
    'ri:calendar-line',
    'BASIC',
    'DATE',
    { dateType: 'date', format: 'YYYY-MM-DD', clearable: true, defaultNow: false },
    [
      property('dateType', '日期类型', 'DATA', 'SELECT', {
        options: selectOptions(
          ['date', 'datetime', 'month', 'year'],
          ['日期', '日期时间', '月份', '年份'],
        ),
      }),
      property('format', '显示格式', 'DISPLAY', { type: 'DATE_FORMAT', sourceKey: 'dateType' }),
      property('clearable', '允许清空', 'DISPLAY', 'BOOLEAN'),
      property('defaultNow', '默认当前时间', 'DATA', 'BOOLEAN'),
    ],
  ),
  field(
    'serial-number',
    '流水号',
    'ri:sort-number-asc',
    'BASIC',
    'STRING',
    { generationTiming: 'ON_CREATE', showCode: false, codeType: 'BARCODE' },
    [
      property('generationTiming', '生成时机', 'DATA', 'SELECT', {
        options: selectOptions(['ON_CREATE', 'ON_SUBMIT'], ['创建时', '提交时']),
      }),
      property('showCode', '显示条码', 'DISPLAY', 'BOOLEAN'),
      property('codeType', '条码类型', 'DISPLAY', 'SELECT', {
        options: selectOptions(['BARCODE', 'QRCODE'], ['条形码', '二维码']),
        visibleWhen: (configuration) => configuration.showCode === true,
      }),
    ],
    12,
    'CONDITIONAL',
    CONDITIONAL_REASON,
  ),
  field(
    'file',
    '文件',
    'ri:attachment-2',
    'BASIC',
    'FILE',
    {
      maxCount: 5,
      maxSizeMb: 20,
      accept: '',
      displayMode: 'BUTTON',
      allowReadOnlyDownload: true,
      assetPolicyRef: '',
    },
    [
      property(
        'maxCount',
        '最大文件数',
        'DATA',
        presetNumberEditor(DESIGNER_SELECTION_COUNT_PRESETS, 1, 100),
      ),
      property(
        'maxSizeMb',
        '单文件大小',
        'DATA',
        presetNumberEditor(DESIGNER_FILE_SIZE_PRESETS, 1, 1024, { unit: 'MB' }),
      ),
      property('accept', '允许附件类型', 'DATA', {
        type: 'FILE_TYPES',
        legacyValuePolicy: 'PRESERVE',
      }),
      property('displayMode', '展示方式', 'DISPLAY', 'SELECT', {
        options: selectOptions(['BUTTON', 'DRAG'], ['按钮', '拖放']),
      }),
      property('allowReadOnlyDownload', '只读允许下载', 'CAPABILITY', 'BOOLEAN'),
      property('assetPolicyRef', '文件策略', 'CAPABILITY', {
        type: 'RESOURCE_REFERENCE',
        resourceType: 'ASSET_POLICY',
        unavailableReason: '文件策略 Adapter 尚未接入',
      }),
    ],
    24,
  ),
  field(
    'number',
    '数字',
    'ri:hashtag',
    'BASIC',
    'NUMBER',
    {
      minimum: null,
      maximum: null,
      step: 1,
      precision: 0,
      controls: false,
      controlsPosition: 'RIGHT',
      currencyPrefix: '',
      thousandsSeparator: false,
      uppercaseRmb: false,
    },
    [
      property('minimum', '最小值', 'DATA', 'NUMBER'),
      property('maximum', '最大值', 'DATA', 'NUMBER'),
      property('step', '步长', 'DATA', 'NUMBER', { minimum: 0 }),
      property(
        'precision',
        '精度',
        'DATA',
        presetNumberEditor(
          numberOptions([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], (value) => `${value} 位`),
          0,
          10,
        ),
      ),
      property('controls', '显示步进按钮', 'DISPLAY', 'BOOLEAN'),
      property('controlsPosition', '按钮位置', 'DISPLAY', 'SELECT', {
        options: selectOptions(['DEFAULT', 'RIGHT'], ['两侧', '右侧']),
        visibleWhen: (configuration) => configuration.controls === true,
      }),
      property('currencyPrefix', '货币', 'DISPLAY', {
        type: 'SELECT',
        options: DESIGNER_CURRENCY_PRESETS,
        legacyValuePolicy: 'PRESERVE',
      }),
      property('thousandsSeparator', '千分位', 'DISPLAY', 'BOOLEAN'),
      property('uppercaseRmb', '人民币大写', 'DISPLAY', 'BOOLEAN'),
    ],
  ),
  field(
    'switch',
    '开关',
    'ri:toggle-line',
    'BASIC',
    'BOOLEAN',
    {
      activeValue: true,
      inactiveValue: false,
      activeText: '',
      inactiveText: '',
      activeColor: '',
      inactiveColor: '',
    },
    [
      property('activeText', '开启文字', 'DISPLAY', 'TEXT'),
      property('inactiveText', '关闭文字', 'DISPLAY', 'TEXT'),
      property('activeColor', '开启颜色', 'DISPLAY', 'COLOR'),
      property('inactiveColor', '关闭颜色', 'DISPLAY', 'COLOR'),
    ],
  ),
  field(
    'rate',
    '评分',
    'ri:star-line',
    'BASIC',
    'NUMBER',
    { max: 5, allowHalf: false, showText: false },
    [
      property(
        'max',
        '最大分值',
        'DATA',
        presetNumberEditor(
          numberOptions([3, 5, 7, 10, 20], (value) => `${value} 分`),
          1,
          20,
        ),
      ),
      property('allowHalf', '允许半星', 'DATA', 'BOOLEAN'),
      property('showText', '显示分值', 'DISPLAY', 'BOOLEAN'),
    ],
  ),
  field(
    'steps',
    '步骤',
    'ri:list-ordered-2',
    'BASIC',
    'NUMBER',
    {
      options: stepOptions(),
      direction: 'horizontal',
      simple: true,
      finishStatus: 'success',
      showDescription: true,
    },
    [
      property('options', '步骤', 'DATA', 'OPTIONS'),
      property('direction', '方向', 'DISPLAY', 'SELECT', {
        options: selectOptions(['horizontal', 'vertical'], ['水平', '垂直']),
      }),
      property('simple', '简洁模式', 'DISPLAY', 'BOOLEAN'),
      property('showDescription', '显示说明', 'DISPLAY', 'BOOLEAN'),
    ],
    24,
  ),
  field(
    'rich-text',
    '富文本',
    'ri:text',
    'BASIC',
    'LONG_TEXT',
    { minHeight: 180, maxHeight: 600, toolbarPreset: 'STANDARD', allowImages: false },
    [
      property(
        'minHeight',
        '最小高度',
        'DISPLAY',
        presetNumberEditor(
          numberOptions([120, 160, 180, 240, 320, 480, 600, 800, 1000], (value) => `${value} px`),
          120,
          1000,
          { unit: 'px' },
        ),
      ),
      property(
        'maxHeight',
        '最大高度',
        'DISPLAY',
        presetNumberEditor(
          numberOptions(
            [120, 160, 180, 240, 320, 480, 600, 800, 1000, 1200, 1600],
            (value) => `${value} px`,
          ),
          120,
          1600,
          { unit: 'px' },
        ),
      ),
      property('toolbarPreset', '工具栏', 'CAPABILITY', 'SELECT', {
        options: selectOptions(['BASIC', 'STANDARD', 'FULL'], ['基础', '标准', '完整']),
      }),
      property('allowImages', '允许图片', 'CAPABILITY', 'BOOLEAN'),
    ],
    24,
  ),
  field('hidden', '隐藏字段', 'ri:eye-off-line', 'BASIC', 'STRING', { submit: true }, [
    property('submit', '提交字段', 'DATA', 'BOOLEAN'),
  ]),

  directoryField('user', '用户', 'ri:user-line'),
  directoryField('role', '角色', 'ri:admin-line'),
  directoryField('organization', '组织', 'ri:organization-chart', [
    property('cascade', '组织级联', 'DISPLAY', 'BOOLEAN'),
  ]),
  directoryField('post', '岗位', 'ri:briefcase-line'),
  field(
    'custom-data',
    '自定义数据',
    'ri:braces-line',
    'ADVANCED',
    'OBJECT',
    { selectionMode: 'SINGLE', maxSelections: 20, buttonText: '选择数据', displayColumns: [] },
    [
      ...DIRECTORY_OPTIONS.filter((item) => item.key !== 'scope'),
      property('displayColumns', '展示列', 'DATA', 'OPTIONS'),
    ],
    12,
    'CONDITIONAL',
    CONDITIONAL_REASON,
  ),
  field(
    'date-range',
    '日期范围',
    'ri:calendar-event-line',
    'ADVANCED',
    'ARRAY',
    {
      rangeType: 'DATE',
      format: 'YYYY-MM-DD',
      separator: '至',
      statisticsEnabled: false,
      statisticsUnit: 'DAY',
    },
    [
      property('rangeType', '范围类型', 'DATA', 'SELECT', {
        options: selectOptions(['DATE', 'DATETIME'], ['日期', '日期时间']),
      }),
      property('format', '显示格式', 'DISPLAY', { type: 'DATE_FORMAT', sourceKey: 'rangeType' }),
      property('separator', '分隔符', 'DISPLAY', {
        type: 'SEGMENTED',
        options: selectOptions(['至', '～', '—'], ['至', '～', '—']),
        legacyValuePolicy: 'PRESERVE',
      }),
      property('statisticsEnabled', '计算时长', 'CAPABILITY', 'BOOLEAN'),
      property('statisticsUnit', '统计单位', 'CAPABILITY', 'SELECT', {
        options: selectOptions(['DAY', 'HOUR', 'MINUTE'], ['天', '小时', '分钟']),
        visibleWhen: (configuration) => configuration.statisticsEnabled === true,
      }),
    ],
  ),
  field(
    'date-multiple',
    '多日期',
    'ri:calendar-schedule-line',
    'ADVANCED',
    'ARRAY',
    { format: 'YYYY-MM-DD', maximumSelections: 20 },
    [
      property('format', '显示格式', 'DISPLAY', { type: 'DATE_FORMAT', sourceKey: 'dateType' }),
      property(
        'maximumSelections',
        '最多日期数',
        'DATA',
        presetNumberEditor(DESIGNER_SELECTION_COUNT_PRESETS, 1, 100),
      ),
    ],
  ),
  field(
    'signature',
    '手写签名',
    'ri:quill-pen-line',
    'ADVANCED',
    'FILE',
    { lineWidth: 2, penColor: '#111827', allowPersonalSignatureReuse: false },
    [
      property(
        'lineWidth',
        '笔画宽度',
        'DISPLAY',
        presetNumberEditor(
          numberOptions([1, 2, 3, 4, 6, 8, 10, 12], (value) => `${value} px`),
          1,
          12,
          {
            unit: 'px',
          },
        ),
      ),
      property('penColor', '笔画颜色', 'DISPLAY', 'COLOR'),
      property('allowPersonalSignatureReuse', '允许复用个人签名', 'CAPABILITY', 'BOOLEAN'),
    ],
    24,
  ),
  field(
    'opinion',
    '审批意见',
    'ri:chat-quote-line',
    'ADVANCED',
    'OBJECT',
    {
      mode: 'OPINION',
      rows: 4,
      maxLength: 2000,
      opinionRequired: false,
      signatureRequired: false,
      allowRepeatSignature: false,
    },
    [
      property('mode', '意见模式', 'DATA', 'SELECT', {
        options: selectOptions(['OPINION', 'SIGNATURE', 'COMBINED'], ['意见', '签名', '意见+签名']),
      }),
      property(
        'rows',
        '输入行数',
        'DISPLAY',
        presetNumberEditor(
          numberOptions([2, 3, 4, 5, 6, 8, 10, 12], (value) => `${value} 行`),
          2,
          12,
        ),
      ),
      property(
        'maxLength',
        '最大长度',
        'DATA',
        presetNumberEditor(DESIGNER_LENGTH_PRESETS, 1, 10000),
      ),
      property('opinionRequired', '意见必填', 'DATA', 'BOOLEAN'),
      property('signatureRequired', '签名必填', 'DATA', 'BOOLEAN'),
    ],
    24,
  ),
  referenceField('process-reference', '流程引用', 'ri:flow-chart'),
  field(
    'region',
    '区域',
    'ri:map-2-line',
    'ADVANCED',
    'ARRAY',
    {
      checkStrictly: false,
      multiple: false,
      maximumLevel: 3,
      showFullPath: true,
      separator: ' / ',
    },
    [
      property('checkStrictly', '任意层级可选', 'DATA', 'BOOLEAN'),
      property('multiple', '允许多选', 'DATA', 'BOOLEAN'),
      property(
        'maximumLevel',
        '最大层级',
        'DATA',
        presetNumberEditor(
          numberOptions([1, 2, 3, 4, 5], (value) => `${value} 级`),
          1,
          5,
        ),
      ),
      property('showFullPath', '显示完整路径', 'DISPLAY', 'BOOLEAN'),
      property('separator', '路径分隔符', 'DISPLAY', {
        type: 'SEGMENTED',
        options: selectOptions([' / ', ' > ', ' - '], ['/', '>', '-']),
        legacyValuePolicy: 'PRESERVE',
        visibleWhen: (configuration) => configuration.showFullPath === true,
      }),
    ],
    12,
    'CONDITIONAL',
    CONDITIONAL_REASON,
  ),
  field(
    'dictionary-tree',
    '字典树',
    'ri:node-tree',
    'ADVANCED',
    'ARRAY',
    { dictionaryKey: '', checkStrictly: false, multiple: false },
    [
      property('dictionaryKey', '业务字典', 'DATA', {
        type: 'RESOURCE_REFERENCE',
        resourceType: 'DICTIONARY',
        unavailableReason: '静态 Core 未接入业务字典 Adapter；已有字典编码保持只读',
      }),
      property('checkStrictly', '父子不联动', 'DATA', 'BOOLEAN'),
      property('multiple', '允许多选', 'DATA', 'BOOLEAN'),
    ],
    12,
    'CONDITIONAL',
    CONDITIONAL_REASON,
  ),
  unavailableField(
    'online-document',
    '在线文档',
    'ri:file-word-2-line',
    '当前部署未配置 Web Office 服务',
  ),
  referenceField('form-reference', '表单引用', 'ri:file-list-3-line'),
  field(
    'scan-code',
    '扫码',
    'ri:qr-scan-2-line',
    'ADVANCED',
    'STRING',
    { allowManualInput: true, allowModification: true, displayMode: 'INPUT', formats: ['qr_code'] },
    [
      property('allowManualInput', '允许手工输入', 'CAPABILITY', 'BOOLEAN'),
      property('allowModification', '允许修改结果', 'CAPABILITY', 'BOOLEAN'),
      property('displayMode', '显示方式', 'DISPLAY', 'SELECT', {
        options: selectOptions(['INPUT', 'LABEL', 'HIDDEN'], ['输入框', '文字', '隐藏']),
      }),
    ],
    12,
    'CONDITIONAL',
    '静态 Core 不申请摄像头权限',
  ),
  field(
    'ocr',
    'OCR',
    'ri:scan-line',
    'ADVANCED',
    'OBJECT',
    { recognitionType: 'BASIC_GENERAL', retainOriginal: true, allowResultEditing: true },
    [
      property('recognitionType', '识别类型', 'CAPABILITY', 'SELECT', {
        options: selectOptions(
          ['BASIC_GENERAL', 'ID_CARD', 'BANK_CARD', 'BUSINESS_LICENSE', 'INVOICE'],
          ['通用文字', '身份证', '银行卡', '营业执照', '发票'],
        ),
      }),
      property('retainOriginal', '保留原图', 'DATA', 'BOOLEAN'),
      property('allowResultEditing', '允许修改结果', 'CAPABILITY', 'BOOLEAN'),
    ],
    24,
    'CONDITIONAL',
    '静态 Core 不调用百度 OCR',
  ),
  field(
    'position',
    '定位',
    'ri:map-pin-line',
    'ADVANCED',
    'OBJECT',
    { enableHighAccuracy: true, timeout: 10000 },
    [
      property('enableHighAccuracy', '高精度定位', 'CAPABILITY', 'BOOLEAN'),
      property(
        'timeout',
        '定位超时',
        'CAPABILITY',
        presetNumberEditor(DESIGNER_TIMEOUT_PRESETS, 1000, 60000, { unit: '秒' }),
      ),
    ],
    12,
    'CONDITIONAL',
    '静态 Core 不申请浏览器定位权限',
  ),

  field(
    'dynamic-select',
    '动态选择',
    'ri:database-2-line',
    'DYNAMIC',
    'ARRAY',
    { options: defaultOptions(), multiple: false, multipleLimit: 20, clearable: true },
    [
      property('options', '静态演示选项', 'DATA', 'OPTIONS'),
      property('multiple', '允许多选', 'DATA', 'BOOLEAN'),
      property(
        'multipleLimit',
        '最多选择',
        'DATA',
        presetNumberEditor(DESIGNER_SELECTION_COUNT_PRESETS, 1, 100, {
          visibleWhen: (configuration) => configuration.multiple === true,
        }),
      ),
      property('clearable', '允许清空', 'DISPLAY', 'BOOLEAN'),
    ],
    12,
    'CONDITIONAL',
    CONDITIONAL_REASON,
  ),
  field(
    'dynamic-cascade',
    '动态级联',
    'ri:git-merge-line',
    'DYNAMIC',
    'ARRAY',
    {
      options: cascadeOptions(),
      multiple: false,
      checkStrictly: false,
      showAllLevels: true,
      separator: ' / ',
    },
    [
      property('options', '静态演示选项', 'DATA', 'OPTIONS'),
      property('multiple', '允许多选', 'DATA', 'BOOLEAN'),
      property('checkStrictly', '父子不联动', 'DATA', 'BOOLEAN'),
      property('showAllLevels', '显示完整路径', 'DISPLAY', 'BOOLEAN'),
      property('separator', '路径分隔符', 'DISPLAY', {
        type: 'SEGMENTED',
        options: selectOptions([' / ', ' > ', ' - '], ['/', '>', '-']),
        legacyValuePolicy: 'PRESERVE',
        visibleWhen: (configuration) => configuration.showAllLevels === true,
      }),
    ],
    12,
    'CONDITIONAL',
    CONDITIONAL_REASON,
  ),
  field(
    'data-dialog',
    '数据对话框',
    'ri:table-view',
    'DYNAMIC',
    'OBJECT',
    {
      options: defaultOptions(),
      selectionMode: 'SINGLE',
      maxSelections: 20,
      buttonText: '选择数据',
    },
    [
      property('options', '静态演示数据', 'DATA', 'OPTIONS'),
      property('selectionMode', '选择模式', 'DATA', 'SELECT', {
        options: selectOptions(['SINGLE', 'MULTIPLE'], ['单选', '多选']),
      }),
      property(
        'maxSelections',
        '最多选择',
        'DATA',
        presetNumberEditor(DESIGNER_SELECTION_COUNT_PRESETS, 1, 100, {
          visibleWhen: (configuration) => configuration.selectionMode === 'MULTIPLE',
        }),
      ),
      property('buttonText', '按钮文字', 'DISPLAY', 'TEXT'),
    ],
    12,
    'CONDITIONAL',
    CONDITIONAL_REASON,
  ),
])

if (DESIGNER_COMPONENTS.length !== 45) {
  throw new Error(`独立表单设计器必须注册 45 类组件，当前为 ${DESIGNER_COMPONENTS.length} 类`)
}

/** 按稳定组件编码读取注册项。 */
export function findDesignerComponent(
  componentType: string,
): DesignerComponentRegistration | undefined {
  return DESIGNER_COMPONENTS.find((item) => item.componentType === componentType)
}

/** 按语义类型返回允许切换的字段组件。 */
export function compatibleDesignerComponents(
  semanticType: DesignerSemanticType,
): DesignerComponentRegistration[] {
  return DESIGNER_COMPONENTS.filter(
    (item) => item.nodeKind === 'FIELD' && item.compatibleSemanticTypes.includes(semanticType),
  )
}

function field(
  componentType: string,
  name: string,
  icon: string,
  group: DesignerComponentGroup,
  semanticType: DesignerSemanticType,
  defaultConfiguration: Record<string, unknown>,
  properties: DesignerPropertyDefinition[],
  defaultSpan = 12,
  availability: DesignerComponentRegistration['availability'] = 'AVAILABLE',
  unavailableReason = '',
): DesignerComponentRegistration {
  return registration({
    componentType,
    name,
    icon,
    group,
    nodeKind: 'FIELD',
    semanticType,
    compatibleSemanticTypes: compatibleTypes(semanticType),
    defaultConfiguration,
    defaultSpan,
    defaultShowLabel: componentType !== 'steps' && componentType !== 'hidden',
    detailLabelPolicy: componentType === 'steps' ? 'HIDE' : 'INHERIT',
    containerAppearance: 'NONE',
    availability,
    unavailableReason,
    acceptsChildren: false,
    supportedEvents: ['CHANGE', 'BLUR', 'FOCUS'],
    properties,
  })
}

function directoryField(
  componentType: string,
  name: string,
  icon: string,
  extra: DesignerPropertyDefinition[] = [],
): DesignerComponentRegistration {
  return field(
    componentType,
    name,
    icon,
    'ADVANCED',
    'REFERENCE',
    {
      selectionMode: 'SINGLE',
      maxSelections: 20,
      scope: 'CURRENT_TENANT',
      buttonText: `选择${name}`,
    },
    [...DIRECTORY_OPTIONS, ...extra],
    12,
    'CONDITIONAL',
    CONDITIONAL_REASON,
  )
}

function referenceField(
  componentType: string,
  name: string,
  icon: string,
): DesignerComponentRegistration {
  return field(
    componentType,
    name,
    icon,
    'ADVANCED',
    'REFERENCE',
    { selectionMode: 'SINGLE', maxSelections: 20, pageSize: 20, buttonText: `选择${name}` },
    [
      property('selectionMode', '选择模式', 'DATA', 'SELECT', {
        options: selectOptions(['SINGLE', 'MULTIPLE'], ['单选', '多选']),
      }),
      property(
        'maxSelections',
        '最多选择',
        'DATA',
        presetNumberEditor(DESIGNER_SELECTION_COUNT_PRESETS, 1, 100, {
          visibleWhen: (configuration) => configuration.selectionMode === 'MULTIPLE',
        }),
      ),
      property(
        'pageSize',
        '每页数量',
        'DATA',
        presetNumberEditor(DESIGNER_PAGE_SIZE_PRESETS, 5, 100),
      ),
      property('buttonText', '按钮文字', 'DISPLAY', 'TEXT'),
    ],
    12,
    'CONDITIONAL',
    CONDITIONAL_REASON,
  )
}

function container(
  componentType: string,
  name: string,
  icon: string,
  group: DesignerComponentGroup,
  acceptsChildren: boolean,
  containerAppearance: DesignerComponentRegistration['containerAppearance'],
  defaultConfiguration: Record<string, unknown>,
  properties: DesignerPropertyDefinition[],
  availability: DesignerComponentRegistration['availability'] = 'AVAILABLE',
  unavailableReason = '',
  configurationVersion = containerAppearance === 'SURFACE' ? 2 : 1,
): DesignerComponentRegistration {
  return registration(
    {
      componentType,
      name,
      icon,
      group,
      nodeKind: 'CONTAINER',
      semanticType: 'OBJECT',
      compatibleSemanticTypes: [],
      defaultConfiguration,
      defaultSpan: 24,
      defaultShowLabel: false,
      detailLabelPolicy: 'HIDE',
      containerAppearance,
      availability,
      unavailableReason,
      acceptsChildren,
      supportedEvents: componentType === 'button' ? ['CLICK'] : [],
      properties:
        containerAppearance === 'SURFACE'
          ? [...CONTAINER_APPEARANCE_PROPERTIES, ...properties]
          : properties,
    },
    configurationVersion,
  )
}

function unavailableField(
  componentType: string,
  name: string,
  icon: string,
  reason: string,
): DesignerComponentRegistration {
  return field(
    componentType,
    name,
    icon,
    'ADVANCED',
    'FILE',
    { readonly: true },
    [],
    24,
    'UNAVAILABLE',
    reason,
  )
}

function unavailableContainer(
  componentType: string,
  name: string,
  icon: string,
  reason: string,
): DesignerComponentRegistration {
  return container(
    componentType,
    name,
    icon,
    'AUXILIARY',
    false,
    'NONE',
    {},
    [],
    'UNAVAILABLE',
    reason,
  )
}

function registration(
  source: Omit<DesignerComponentRegistration, 'configurationVersion'>,
  configurationVersion = 1,
): DesignerComponentRegistration {
  return { ...source, configurationVersion }
}

function property(
  key: string,
  label: string,
  section: DesignerPropertyDefinition['section'],
  editor: DesignerPropertyEditor['type'] | DesignerPropertyEditor,
  extra: LegacyPropertyExtra = {},
): DesignerPropertyDefinition {
  return {
    key,
    label,
    section,
    description: extra.description,
    editor: typeof editor === 'string' ? legacyPropertyEditor(editor, extra) : editor,
  }
}

interface LegacyPropertyExtra {
  description?: string
  minimum?: number
  maximum?: number
  step?: number
  options?: DesignerPropertyOption[]
  visibleWhen?: (configuration: Readonly<Record<string, unknown>>) => boolean
  maxLength?: number
  unit?: string
}

function legacyPropertyEditor(
  type: DesignerPropertyEditor['type'],
  extra: LegacyPropertyExtra,
): DesignerPropertyEditor {
  const shared = {
    visibleWhen: extra.visibleWhen,
    legacyValuePolicy: 'PRESERVE' as const,
  }
  if (type === 'TEXT') return { type, maxLength: extra.maxLength, ...shared }
  if (type === 'TEXTAREA') return { type, maxLength: extra.maxLength, ...shared }
  if (type === 'NUMBER') {
    return {
      type,
      minimum: extra.minimum,
      maximum: extra.maximum,
      step: extra.step,
      unit: extra.unit,
      ...shared,
    }
  }
  if (type === 'SELECT' || type === 'SEGMENTED') {
    return { type, options: extra.options ?? [], ...shared, legacyValuePolicy: 'REJECT' }
  }
  if (type === 'PRESET_NUMBER') {
    return {
      type,
      options: extra.options ?? [],
      minimum: extra.minimum,
      maximum: extra.maximum,
      unit: extra.unit,
      ...shared,
    }
  }
  if (type === 'DATE_FORMAT') return { type, sourceKey: 'dateType', ...shared }
  if (type === 'RESOURCE_REFERENCE') {
    return {
      type,
      resourceType: 'FORM',
      unavailableReason: '资源 Adapter 尚未接入',
      ...shared,
    }
  }
  if (type === 'GRID_SPAN') return { type, device: 'desktop', ...shared }
  if (type === 'GRID_OFFSET') return { type, spanKey: 'span', ...shared }
  if (type === 'URL') return { type, maxLength: extra.maxLength, ...shared }
  return { type, ...shared }
}

function selectOptions(
  values: Array<string | number | boolean>,
  labels: string[],
): Array<{ label: string; value: string | number | boolean }> {
  return values.map((value, index) => ({ value, label: labels[index] ?? String(value) }))
}

function presetNumberEditor(
  options: DesignerPropertyOption[],
  minimum: number,
  maximum: number,
  extra: Pick<
    Extract<DesignerPropertyEditor, { type: 'PRESET_NUMBER' }>,
    'unit' | 'visibleWhen'
  > = {},
): DesignerPropertyEditor {
  return {
    type: 'PRESET_NUMBER',
    options,
    minimum,
    maximum,
    unit: extra.unit,
    visibleWhen: extra.visibleWhen,
    legacyValuePolicy: 'PRESERVE',
  }
}

function defaultOptions(): Array<{ label: string; value: string }> {
  return [
    { label: '选项一', value: 'option-1' },
    { label: '选项二', value: 'option-2' },
    { label: '选项三', value: 'option-3' },
  ]
}

function stepOptions(): Array<{ label: string; value: number }> {
  return [
    { label: '步骤一', value: 0 },
    { label: '步骤二', value: 1 },
    { label: '步骤三', value: 2 },
  ]
}

function cascadeOptions(): Array<{
  label: string
  value: string
  children?: Array<{ label: string; value: string }>
}> {
  return [
    {
      label: '分类一',
      value: 'category-1',
      children: [
        { label: '子项一', value: 'category-1-1' },
        { label: '子项二', value: 'category-1-2' },
      ],
    },
  ]
}

function compatibleTypes(semanticType: DesignerSemanticType): DesignerSemanticType[] {
  if (semanticType === 'STRING') return ['STRING', 'REFERENCE']
  if (semanticType === 'LONG_TEXT') return ['LONG_TEXT', 'STRING']
  if (semanticType === 'NUMBER') return ['NUMBER']
  if (semanticType === 'BOOLEAN') return ['BOOLEAN']
  if (semanticType === 'DATE') return ['DATE', 'DATE_TIME']
  if (semanticType === 'DATE_TIME') return ['DATE_TIME', 'DATE']
  if (semanticType === 'FILE') return ['FILE']
  if (semanticType === 'REFERENCE') return ['REFERENCE', 'STRING', 'ARRAY', 'OBJECT']
  if (semanticType === 'ARRAY') return ['ARRAY', 'REFERENCE']
  return [semanticType]
}
