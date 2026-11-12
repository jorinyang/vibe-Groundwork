/** 读取项目配置：优先 .vibe/config.yaml，否则从项目自身推断默认值。 */
import { join } from 'node:path'
import type { Level, VibConfig } from './types.ts'
import { parseYaml, readText, walk } from './util.ts'

export const DEFAULT_CONFIG: VibConfig = {
  name: '',
  stack: 'unknown',
  level: 'L2',
  fastcheck: [],
  envExample: '.env.example',
}

async function inferFromPackage(root: string): Promise<Partial<VibConfig> | null> {
  const txt = await readText(join(root, 'package.json'))
  if (!txt) return null
  let pkg: Record<string, unknown>
  try {
    pkg = JSON.parse(txt)
  } catch {
    return null
  }
  const scripts = (pkg.scripts ?? {}) as Record<string, string>
  const fastcheck: string[] = []
  if (scripts.lint) fastcheck.push('npm run lint --silent')
  if (scripts.typecheck) fastcheck.push('npm run typecheck --silent')
  if (scripts['check-types']) fastcheck.push('npm run check-types --silent')
  if (!fastcheck.length && scripts.build) fastcheck.push('npm run build --silent')

  const start = scripts.start
    ? { command: 'npm start' }
    : scripts.dev
      ? { command: 'npm run dev' }
      : undefined

  return {
    stack: 'node',
    name: (pkg.name as string) ?? '',
    fastcheck,
    start,
    healthPath: '/api/health',
  }
}

async function inferFromPython(root: string): Promise<Partial<VibConfig> | null> {
  const py = await readText(join(root, 'pyproject.toml'))
  const req = await readText(join(root, 'requirements.txt'))
  if (!py && !req) return null
  const fastcheck: string[] = []
  if (await readText(join(root, 'pyproject.toml'))) {
    fastcheck.push('python -m ruff check .')
  }
  return { stack: 'python', fastcheck, healthPath: '/health' }
}

/**
 * 没有 package.json / pyproject 的项目，靠文件特征与 Dockerfile 兜底。
 * 目标：plain node 项目也能被识别和启动，否则行为判定永远 N/A。
 */
async function inferFromFiles(root: string): Promise<Partial<VibConfig> | null> {
  const files = await walk(root)
  const nodeFiles = files.filter((f) => /\.(mjs|cjs|js|ts)$/.test(f))
  if (nodeFiles.length === 0) return null

  const out: Partial<VibConfig> = { stack: 'node', name: root.split(/[\\/]/).filter(Boolean).pop() ?? 'project' }

  const df = await readText(join(root, 'Dockerfile'))
  if (df) {
    const cmd = /CMD\s+\[([^\]]+)\]/.exec(df) ?? /CMD\s+(.+)/.exec(df)
    const copyDir = /COPY\s+([A-Za-z0-9_.\-\/]+)\/\s+\/app\/?/i.exec(df)
    if (cmd) {
      const parts = cmd[1]
        .split(',')
        .map((s) => s.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean)
      if (parts.length) {
        out.start = { command: parts.join(' '), cwd: copyDir?.[1] ?? undefined }
      }
    }
  }

  if (!out.start) {
    const entry = files.find((f) => /(?:^|[\\/])(?:server|index|main)\.(?:mjs|cjs|js)$/.test(f))
    if (entry) out.start = { command: `node ${entry.split(/[\\/]/).pop()}`, cwd: undefined }
  }

  // 纯 node 项目没有 lint，用语法检查兜底（保留相对路径，别丢目录）
  const firstMjs = files.find((f) => /\.mjs$/.test(f))
  out.fastcheck = firstMjs
    ? ['node --check ' + firstMjs.slice(root.length).replace(/^[\\/]/, '').replace(/\\/g, '/')]
    : []
  return out
}

export async function loadConfig(root: string): Promise<VibConfig> {
  let cfg: VibConfig = { ...DEFAULT_CONFIG }

  const inferred =
    (await inferFromPackage(root)) ?? (await inferFromPython(root)) ?? (await inferFromFiles(root)) ?? {}
  cfg = { ...cfg, ...inferred }

  const vibTxt = await readText(join(root, '.vibe/config.yaml'))
  if (vibTxt) {
    cfg.explicitConfig = true
    const parsed = parseYaml(vibTxt) as Record<string, unknown>
    const merged: Record<string, unknown> = { ...cfg, ...parsed }
    // start / ready 是嵌套对象，单独合并，避免被整体覆盖成字符串
    if (parsed.start && typeof parsed.start === 'object') {
      merged.start = { ...(cfg.start ?? {}), ...(parsed.start as object) }
    }
    if (typeof merged.level === 'string' && /^L[123]$/.test(merged.level)) {
      merged.level = merged.level as Level
    }
    // 项目自己写了配置却没指定健康路径 → 清空推断值，避免「默认值冒充已声明」
    if (parsed.healthPath === undefined) merged.healthPath = ''
    cfg = merged as unknown as VibConfig
  }

  if (!cfg.name) cfg.name = root.split(/[\\/]/).filter(Boolean).pop() ?? 'project'
  cfg.fastcheck = Array.isArray(cfg.fastcheck) ? cfg.fastcheck : []
  return cfg
}

/** 写一份可编辑的初始配置。 */
export function renderConfig(cfg: VibConfig): string {
  const lines: string[] = [
    '# vibe-Groundwork 项目配置',
    `name: "${cfg.name}"`,
    `stack: ${cfg.stack}`,
    `level: ${cfg.level}`,
    '',
  ]
  if (cfg.start) {
    lines.push('start:')
    lines.push(`  command: "${cfg.start.command}"`)
    if (cfg.start.cwd) lines.push(`  cwd: "${cfg.start.cwd}"`)
  }
  if (cfg.ready) {
    lines.push('ready:')
    lines.push(`  url: "${cfg.ready.url}"`)
    lines.push(`  timeoutMs: ${cfg.ready.timeoutMs}`)
  }
  lines.push(`healthPath: "${cfg.healthPath ?? '/health'}"`)
  if (cfg.protectedPath) lines.push(`protectedPath: "${cfg.protectedPath}"`)
  lines.push('fastcheck:')
  for (const c of cfg.fastcheck) lines.push(`  - "${c}"`)
  lines.push(`envExample: "${cfg.envExample}"`)
  lines.push('')
  return lines.join('\n')
}
