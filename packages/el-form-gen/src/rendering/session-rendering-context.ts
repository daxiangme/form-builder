import type { InjectionKey } from 'vue'

/** 内部渲染树共享的提交入口；旧事件请求使用与动作栏相同的投影流程。 */
export const sessionSubmitKey: InjectionKey<() => Promise<void>> = Symbol('form-session-submit')
