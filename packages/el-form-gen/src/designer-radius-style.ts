import type { CSSProperties } from 'vue'
import { designerRadiusCssValue } from '@daxiangme/form-core'
import type { DesignerRadiusValue } from '@daxiangme/form-core'

/** 控件圆角自定义像素时挂到表单根上的主题类。 */
export const DESIGNER_CONTROL_RADIUS_CUSTOM_CLASS = 'daxiang-form-control-radius-custom'

/** 弹窗圆角自定义像素时挂到对话框根上的主题类。 */
export const DESIGNER_DIALOG_RADIUS_CUSTOM_CLASS = 'daxiang-form-dialog-radius-custom'

/**
 * 将控件圆角写入表单根节点：跟随系统不覆盖主题变量，自定义像素只作用在字段控件上。
 */
export function designerControlRadiusBind(radius: DesignerRadiusValue): {
  class: string
  style: CSSProperties
} {
  if (radius === 'THEME') return { class: '', style: {} }
  return {
    class: DESIGNER_CONTROL_RADIUS_CUSTOM_CLASS,
    style: { '--daxiang-form-control-radius': `${radius}px` },
  }
}

/**
 * 将弹窗圆角写入外壳：跟随系统继续消费 `--el-border-radius-base`。
 */
export function designerDialogRadiusBind(radius: DesignerRadiusValue | undefined): {
  class: string
  style: CSSProperties
} {
  const value = radius ?? 'THEME'
  if (value === 'THEME') return { class: '', style: {} }
  return {
    class: DESIGNER_DIALOG_RADIUS_CUSTOM_CLASS,
    style: { '--daxiang-form-dialog-radius': designerRadiusCssValue(value) },
  }
}
