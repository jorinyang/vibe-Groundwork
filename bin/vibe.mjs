#!/usr/bin/env node
/** npx / 全局安装入口：跑编译后的 dist。 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { existsSync } from 'node:fs'

const here = dirname(fileURLToPath(import.meta.url))
const entry = join(here, '..', 'dist', 'cli.js')

if (!existsSync(entry)) {
  console.error('未找到 dist/cli.js。本地开发请先 `npm run build`；安装后出现说明包不完整。')
  process.exit(2)
}

const child = spawn(process.execPath, [entry, ...process.argv.slice(2)], { stdio: 'inherit' })
child.on('close', (code) => process.exit(code ?? 0))
child.on('error', (err) => {
  console.error('启动失败:', err.message)
  process.exit(2)
})
