#!/usr/bin/env node
/**
 * vibe-check CLI
 *
 *   vibe check   --path <dir> [--profile L1|L2|L3] [--only id] [--json] [--no-behavioral]
 *   vibe list
 *   vibe explain <id>
 *   vibe init    --path <dir> [--level L2]
 *   vibe fix     --path <dir> [--apply] [--allow-risk green|yellow|red]
 */
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdir, writeFile } from 'node:fs/promises'
import { runProject } from './core/runner.ts'
import { renderHuman, renderJson } from './report/human.ts'
import { CHECKS, PROFILE_LEVELS } from './core/registry.ts'
import { loadConfig, renderConfig } from './core/config.ts'
import { applyFixPlan, buildFixPlan, renderPlan, resolveCapDir } from './prescribe/runner.ts'
import { collectEnvFacts } from './facts/env.ts'
import { collectProjectFacts } from './facts/project.ts'
import { readText } from './core/util.ts'
import type { Level, Risk } from './core/types.ts'

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const CAPS_DIR = join(REPO_ROOT, 'capabilities')

type Args = {
  cmd: string
  positional: string[]
  path?: string
  profile?: Level
  only?: string[]
  json: boolean
  apply: boolean
  strict: boolean
  noBehavioral: boolean
  allowRisk: Risk
  level: Level
  timeoutMs?: number
}

function parseArgs(argv: string[]): Args {
  const out: Args = {
    cmd: argv[0] ?? '',
    positional: [],
    json: false,
    apply: false,
    strict: false,
    noBehavioral: false,
    allowRisk: 'green',
    level: 'L2',
  }
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--path' || a === '-p') out.path = argv[++i]
    else if (a === '--profile') out.profile = argv[++i] as Level
    else if (a === '--only') out.only = argv[++i].split(',')
    else if (a === '--json') out.json = true
    else if (a === '--apply') out.apply = true
    else if (a === '--strict') out.strict = true
    else if (a === '--no-behavioral') out.noBehavioral = true
    else if (a === '--allow-risk') out.allowRisk = argv[++i] as Risk
    else if (a === '--level') out.level = argv[++i] as Level
    else if (a === '--timeout') out.timeoutMs = Number(argv[++i])
    else if (!a.startsWith('-')) out.positional.push(a)
  }
  return out
}

function requirePath(args: Args): string {
  const p = args.path ?? args.positional[0]
  if (!p) {
    console.error('缺少 --path <项目目录>')
    process.exit(2)
  }
  return resolve(p)
}

async function cmdCheck(args: Args) {
  const root = requirePath(args)
  const result = await runProject({
    root,
    profile: args.profile,
    only: args.only,
    skipBehavioral: args.noBehavioral,
    timeoutMs: args.timeoutMs,
  })
  console.log(args.json ? renderJson(result) : renderHuman(result))
  const bad = result.summary.failed > 0
  // 默认不阻断：第一次运行只让人看见问题。
  // 要拿它当门禁，显式加 --strict（CI 里用）。
  if (bad && !args.strict && !args.json) {
    console.log('')
    console.log('（未阻断：默认只报告。要当门禁用，加 --strict）')
  }
  process.exit(bad && args.strict ? 1 : 0)
}

function cmdList() {
  console.log('能力清单\n')
  for (const c of CHECKS) {
    console.log(`  ${c.meta.id.padEnd(24)} ${c.meta.title.padEnd(10)} rigor=${c.meta.rigor.padEnd(12)} risk=${c.meta.risk.padEnd(7)} levels=${c.meta.levels.join(',')}`)
  }
  console.log('\n级别：L1 可再生 · L2 可部署 · L3 可运营')
  process.exit(0)
}

async function cmdExplain(args: Args) {
  const id = args.positional[0]
  if (!id) {
    console.error('用法: vibe explain <id>')
    process.exit(2)
  }
  const cap = CHECKS.find((c) => c.meta.id === id)
  if (!cap) {
    console.error(`未知能力: ${id}。用 vibe list 查看全部。`)
    process.exit(2)
  }
  const dir = await resolveCapDir(CAPS_DIR, id)
  const spec = dir ? await readText(join(dir, 'SPEC.md')) : null
  process.stdout.write(spec ?? `（${id} 还没有 SPEC.md）\n`)
  process.exit(0)
}

async function cmdInit(args: Args) {
  const root = requirePath(args)
  const config = await loadConfig(root)
  config.level = args.level
  await mkdir(join(root, '.vibe'), { recursive: true })
  await writeFile(join(root, '.vibe/config.yaml'), renderConfig(config), 'utf8')

  const pfacts = await collectProjectFacts(root)
  const efacts = await collectEnvFacts(root, config.envExample)
  const created: string[] = ['.vibe/config.yaml']

  if (!pfacts.agents) {
    const tpl = await readText(join(REPO_ROOT, 'templates/AGENTS.md.tpl'))
    if (tpl) {
      const content = tpl
        .replace(/\{\{projectName\}\}/g, config.name)
        .replace(/\{\{stack\}\}/g, config.stack)
        .replace(/\{\{commands\}\}/g, config.fastcheck.map((c) => `\`${c}\``).join(' · ') || '（还没配）')
      await writeFile(join(root, 'AGENTS.md'), content, 'utf8')
      created.push('AGENTS.md')
    }
  }

  if (!efacts.exampleFile && efacts.used.length > 0) {
    const lines = ['# 环境变量（由 vibe init 根据代码引用生成）', '']
    for (const u of efacts.used) lines.push(`${u.name}=`)
    await writeFile(join(root, '.env.example'), lines.join('\n') + '\n', 'utf8')
    created.push('.env.example')
  }

  console.log('已初始化：')
  for (const c of created) console.log(`  + ${c}`)
  console.log('\n下一步：')
  console.log(`  vibe check --path ${root}`)
  process.exit(0)
}

async function cmdFix(args: Args) {
  const root = requirePath(args)
  const result = await runProject({ root, skipBehavioral: args.noBehavioral, timeoutMs: args.timeoutMs })
  if (result.summary.failed === 0) {
    console.log('没有需要修复的项。')
    process.exit(0)
  }
  const plan = await buildFixPlan(result, CAPS_DIR, args.allowRisk)
  const report = await applyFixPlan(root, plan, {
    apply: args.apply,
    vars: {
      projectName: result.config.name,
      stack: result.config.stack,
      target: result.target,
      date: new Date().toISOString().slice(0, 10),
    },
  })
  console.log(renderPlan(report))
  if (args.apply) {
    console.log('')
    for (const e of report.executed) console.log(`  ${e.ok ? 'ok  ' : 'skip'} ${e.step}  ${e.note}`)
    console.log('\n复扫：')
    const after = await runProject({ root, skipBehavioral: true, timeoutMs: args.timeoutMs })
    console.log(renderHuman(after))
    process.exit(after.summary.failed > 0 ? 1 : 0)
  }
  console.log('\n这是计划。加 --apply 才会真的改文件。')
  process.exit(0)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  switch (args.cmd) {
    case 'check':
      return cmdCheck(args)
    case 'list':
      return cmdList()
    case 'explain':
      return cmdExplain(args)
    case 'init':
      return cmdInit(args)
    case 'fix':
      return cmdFix(args)
    default:
      console.error(`用法：
  vibe check   --path <dir> [--profile L1|L2|L3] [--only id] [--json] [--no-behavioral]
  vibe list
  vibe explain <id>
  vibe init    --path <dir> [--level L2]
  vibe fix     --path <dir> [--apply] [--allow-risk green|yellow|red]

级别：${Object.keys(PROFILE_LEVELS).join(' / ')}`)
      process.exit(2)
  }
}

main().catch((err) => {
  console.error('执行失败:', err?.stack ?? err)
  process.exit(2)
})
