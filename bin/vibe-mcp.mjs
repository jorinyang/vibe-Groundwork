#!/usr/bin/env node
/** MCP server 入口（stdio），跑编译后的 dist。 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { existsSync } from 'node:fs'

const here = dirname(fileURLToPath(import.meta.url))
const entry = join(here, '..', 'dist', 'mcp', 'server.js')

if (!existsSync(entry)) {
  console.error('未找到 dist/mcp/server.js。先 `npm run build`。')
  process.exit(2)
}

const child = spawn(process.execPath, [entry, ...process.argv.slice(2)], { stdio: 'inherit' })
child.on('close', (code) => process.exit(code ?? 0))
child.on('error', (err) => {
  console.error('启动失败:', err.message)
  process.exit(2)
})
