import { createApp } from 'vue'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import '@daxiangme/form-vue/style.css'
import App from './App.vue'
import './playground.css'

createApp(App).use(ElementPlus).mount('#app')
