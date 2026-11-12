/** Facts · 项目基线：宪法、README、许可、容器、质量设施、git 状态。 */
import { execFile } from 'node:child_process'
import { readdir } from 'node:fs/promises'
import { join, basename } from 'node:path'
import { promisify } from 'node:util'
import { walk, readText, rel, countLines } from '../core/util.ts'

const execFileAsync = promisify(execFile)

export type ProjectFacts = {
  root: string
  rootFiles: string[]
  agents: { file: string; lines: number; sections: string[] } | null
  readme: { file: string; lines: number; hasRun: boolean } | null
  license: string | null
  docker: { dockerfile: boolean; compose: boolean; dockerignore: boolean }
  quality: { testFiles: number; lintConfigs: string[]; tsconfig: boolean }
  git: { hasRepo: boolean; tags: number }
}

const AGENT_FILES = ['AGENTS.md', 'CLAUDE.md', 'AGENT.md', '.cursorrules']
const RUN_HINTS = /(npm (run|start|i\b)|yarn|pnpm|node |python |uv |docker compose|docker-compose|make |go run)/i

async function gitInfo(root: string): Promise<{ hasRepo: boolean; tags: number }> {
  try {
    await execFileAsync('git', ['-C', root, 'rev-parse', '--git-dir'], { timeout: 4000 })
  } catch {
    return { hasRepo: false, tags: 0 }
  }
  try {
    const { stdout } = await execFileAsync('git', ['-C', root, 'tag'], { timeout: 4000 })
    return { hasRepo: true, tags: stdout.split('\n').filter(Boolean).length }
  } catch {
    return { hasRepo: true, tags: 0 }
  }
}

export async function collectProjectFacts(root: string): Promise<ProjectFacts> {
  const files = await walk(root)
  const rootFiles: string[] = []
  try {
    const entries = await readdir(root, { withFileTypes: true })
    for (const e of entries) if (e.isFile()) rootFiles.push(e.name)
  } catch {
    /* 根目录读不到 */
  }

  // 项目宪法
  let agents: ProjectFacts['agents'] = null
  for (const name of AGENT_FILES) {
    const p = join(root, name)
    const txt = await readText(p)
    if (!txt) continue
    const sections: string[] = []
    if (/^#{1,3}\s/m.test(txt)) sections.push('headings')
    if (/(怎么跑|如何运行|quick ?start|getting started|install)/i.test(txt)) sections.push('run')
    if (/(不许|禁止|不要做|do not|must not)/i.test(txt)) sections.push('forbidden')
    if (/(目录|结构|structure|layout)/i.test(txt)) sections.push('layout')
    agents = { file: name, lines: countLines(txt), sections }
    break
  }

  // README
  let readme: ProjectFacts['readme'] = null
  for (const name of ['README.md', 'readme.md', 'README.MD']) {
    const txt = await readText(join(root, name))
    if (!txt) continue
    readme = { file: name, lines: countLines(txt), hasRun: RUN_HINTS.test(txt) }
    break
  }

  // 许可
  const licenseFile = rootFiles.find((f) => /^(LICEN[CS]E|COPYING)/i.test(f))
  let license: string | null = null
  if (licenseFile) {
    const txt = await readText(join(root, licenseFile))
    if (txt) {
      if (/Apache License/i.test(txt)) license = 'Apache-2.0'
      else if (/MIT License/i.test(txt)) license = 'MIT'
      else if (/GNU GENERAL PUBLIC LICENSE/i.test(txt)) license = 'GPL'
      else license = 'other'
    }
  }

  // 质量设施
  let testFiles = 0
  const lintConfigs: string[] = []
  for (const f of files) {
    const b = basename(f).toLowerCase()
    if (/\.(test|spec)\.(ts|tsx|js|mjs|cjs|py)$/.test(b)) testFiles++
    if (/^(eslint\.config|\.eslintrc|biome\.json|\.prettierrc|ruff\.toml)/.test(b)) lintConfigs.push(rel(root, f))
  }

  return {
    root,
    rootFiles,
    agents,
    readme,
    license,
    docker: {
      dockerfile: rootFiles.some((f) => /^dockerfile$/i.test(f)),
      compose: rootFiles.some((f) => /^(docker-)?compose\.ya?ml$/i.test(f)),
      dockerignore: rootFiles.some((f) => f === '.dockerignore'),
    },
    quality: {
      testFiles,
      lintConfigs: [...new Set(lintConfigs)],
      tsconfig: rootFiles.some((f) => /^tsconfig.*\.json$/.test(f)),
    },
    git: await gitInfo(root),
  }
}
