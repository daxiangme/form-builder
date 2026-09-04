import { createApp } from 'vue'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import 'el-form-gen/style.css'
import App from './App.vue'
import './playground.css'

createApp(App).use(ElementPlus).mount('#app')
