/** Facts · 部署纪律：部署能不能一条命令复现，还是一堆一次性脚本。 */
import { readdir } from 'node:fs/promises'
import { join, basename } from 'node:path'
import { walk, readText, rel, exists } from '../core/util.ts'

export type DeployFacts = {
  deployDirs: string[]
  deployFileCount: number
  oneShotScripts: string[]
  entry: { file: string; kind: 'dockerfile' | 'compose' | 'script' | 'task' } | null
  rollback: { found: boolean; evidence: string[] }
  documented: boolean
  containerized: boolean
}

const DEPLOY_DIR_RE = /^(deploy|deploys|deployment|deployments|ops|infra|infrastructure|scripts?)$/i
/** 一次性脚本：按「动词-具体名」命名，典型特征是每上一个功能加一个 */
const ONESHOT_RE = /^(apply|clean|diag|hotfix|patch|fix|oneoff|tmp)[-_][\w.-]+\.(sh|bash|mjs|cjs|js|py|ts)$/i
const ENTRY_NAMES = [
  'deploy.sh',
  'deploy.mjs',
  'release.sh',
  'release.mjs',
  'publish.mjs',
  'install.sh',
  'compose.yaml',
  'docker-compose.yml',
  'docker-compose.yaml',
  'Dockerfile',
]
const ROLLBACK_RE = /(rollback|回滚|revert|上一版|previous version|回退)/i
const DOC_RE = /(部署|deploy|上线|release|发布流程)/i

export async function collectDeployFacts(root: string): Promise<DeployFacts> {
  const files = await walk(root)
  const deployDirs: string[] = []
  const oneShotScripts: string[] = []
  let deployFileCount = 0

  for (const f of files) {
    const parts = rel(root, f).split('/')
    const dirs = parts.slice(0, -1)
    const idx = dirs.findIndex((s) => DEPLOY_DIR_RE.test(s))
    if (idx === -1) continue
    const d = dirs.slice(0, idx + 1).join('/')
    if (!deployDirs.includes(d)) deployDirs.push(d)
    deployFileCount++
    if (ONESHOT_RE.test(basename(f))) oneShotScripts.push(rel(root, f))
  }

  // 根目录的一次性脚本也算（有些项目图省事丢在根上）
  for (const f of files) {
    const r = rel(root, f)
    if (r.includes('/')) continue
    if (ONESHOT_RE.test(basename(f))) oneShotScripts.push(r)
  }

  // 可复现入口
  let entry: DeployFacts['entry'] = null
  for (const name of ENTRY_NAMES) {
    for (const dir of ['', ...deployDirs.map((d) => d + '/')]) {
      const p = `${root}/${dir}${name}`
      if (await exists(p)) {
        const kind =
          /dockerfile/i.test(name) ? 'dockerfile' : /compose/i.test(name) ? 'compose' : 'script'
        entry = { file: `${dir}${name}`, kind }
        break
      }
    }
    if (entry) break
  }
  if (!entry) {
    const pkg = await readText(join(root, 'package.json'))
    if (pkg && /"deploy"\s*:/.test(pkg)) entry = { file: 'package.json#scripts.deploy', kind: 'task' }
  }
  if (!entry) {
    const mk = await readText(join(root, 'Makefile'))
    if (mk && /^deploy:/m.test(mk)) entry = { file: 'Makefile#deploy', kind: 'task' }
  }

  // 回滚线索：部署脚本/文档里提到回滚
  const evidence: string[] = []
  for (const f of files) {
    const r = rel(root, f)
    if (r.split('/').length > 2) continue
    if (!/\.(md|sh|mjs|js|py|yml|yaml|json)$/i.test(r)) continue
    const txt = await readText(f)
    if (!txt) continue
    if (ROLLBACK_RE.test(txt)) evidence.push(r)
    if (evidence.length >= 3) break
  }

  // 部署文档
  let documented = false
  const docCandidates = files.filter((f) => /\.md$/i.test(f) && rel(root, f).split('/').length <= 2)
  for (const f of docCandidates.slice(0, 20)) {
    const txt = await readText(f)
    if (txt && /(部署|deploy)/i.test(txt) && DOC_RE.test(txt)) {
      documented = true
      break
    }
  }

  return {
    deployDirs,
    deployFileCount,
    oneShotScripts: [...new Set(oneShotScripts)],
    entry,
    rollback: { found: evidence.length > 0, evidence },
    documented,
    containerized: entry?.kind === 'dockerfile' || entry?.kind === 'compose',
  }
}

/** 供 CLI 显示：部署目录下文件数 */
export async function countDeployFiles(root: string, dir: string): Promise<number> {
  try {
    const entries = await readdir(join(root, dir))
    return entries.length
  } catch {
    return 0
  }
}
