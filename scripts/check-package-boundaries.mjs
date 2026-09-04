import { readFile, readdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const workspaceRoot = fileURLToPath(new URL('..', import.meta.url))
const requireFromFormVue = createRequire(
  new URL('../packages/el-form-gen/package.json', import.meta.url),
)
const remixIconCollection = requireFromFormVue('@iconify-json/ri').icons
const checks = [
  {
    directory: 'packages/form-core/src',
    forbidden: [
      [/from\s+['"]vue(?:\/|['"])/u, 'form-core 不得依赖 Vue'],
      [/from\s+['"]element-plus(?:\/|['"])/u, 'form-core 不得依赖 Element Plus'],
      [/axios|pinia|vue-router/u, 'form-core 不得依赖 HTTP、Router 或 Pinia'],
    ],
  },
  {
    directory: 'packages/form-adapter/src',
    forbidden: [
      [/from\s+['"]vue(?:\/|['"])/u, 'form-adapter 不得依赖 Vue'],
      [/from\s+['"]element-plus(?:\/|['"])/u, 'form-adapter 不得依赖 Element Plus'],
      [/@\/|axios/u, 'form-adapter 不得依赖宿主别名或 Axios'],
    ],
  },
  {
    directory: 'packages/el-form-gen/src',
    forbidden: [
      [/@\//u, 'el-form-gen 不得使用宿主源码别名'],
      [/--dx-/u, 'el-form-gen 不得依赖 DX BPM 主题 Token'],
      [/agilebpm|dstz/u, 'el-form-gen 不得复用旧工程运行命名'],
    ],
  },
  ...['form-core', 'form-adapter', 'el-form-gen'].map((packageName) => ({
    directory: `packages/${packageName}/dist`,
    forbidden: [
      [/@\//u, '发布产物不得保留宿主源码别名'],
      [/--dx-/u, '发布产物不得依赖 DX BPM 主题 Token'],
      [/agilebpm|dstz/u, '发布产物不得保留旧工程运行命名'],
    ],
  })),
]

const failures = []
for (const check of checks) {
  const files = await collectSourceFiles(join(workspaceRoot, check.directory))
  for (const file of files) {
    const source = await readFile(file, 'utf8')
    for (const [pattern, message] of check.forbidden) {
      if (pattern.test(source)) failures.push(`${relative(workspaceRoot, file)}: ${message}`)
    }
  }
}

for (const directory of ['packages/form-core/src', 'packages/el-form-gen/src']) {
  const files = await collectSourceFiles(join(workspaceRoot, directory))
  for (const file of files) {
    const source = await readFile(file, 'utf8')
    for (const match of source.matchAll(/ri:([a-z0-9-]+)/gu)) {
      const iconName = match[1]
      if (!remixIconCollection.icons[iconName] && !remixIconCollection.aliases?.[iconName]) {
        failures.push(
          `${relative(workspaceRoot, file)}: 图标 ri:${iconName} 未随包提供，会触发外部 CDN 请求`,
        )
      }
    }
  }
}

if (failures.length > 0) {
  process.stderr.write(`${failures.join('\n')}\n`)
  process.exitCode = 1
} else {
  process.stdout.write('包依赖边界检查通过\n')
}

async function collectSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const target = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...(await collectSourceFiles(target)))
    else if (['.ts', '.vue', '.css', '.scss', '.js', '.map'].includes(extname(entry.name)))
      files.push(target)
  }
  return files
}
