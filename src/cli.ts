/**
 * vibe-check CLI · 第一版只做一条能力：数据迁移纪律
 *
 * 用法：
 *   node src/cli.ts check --path <项目目录> [--json]
 *
 * 退出码：0 = 通过或不适用；1 = 有失败项；2 = 用法错误
 */
import { resolve } from 'node:path'
import { collectMigrationFacts } from './facts/migrations.ts'
import { checkMigrationDiscipline } from './checks/migration-discipline.ts'
import type { CheckResult } from './checks/migration-discipline.ts'

const VERSION = '0.0.1'

function parseArgs(argv: string[]) {
  const out: { cmd: string; path?: string; json: boolean } = { cmd: argv[0] ?? '', json: false }
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--path' || a === '-p') out.path = argv[++i]
    else if (a === '--json') out.json = true
  }
  return out
}

function mark(status: string): string {
  if (status === 'pass') return 'PASS'
  if (status === 'fail') return 'FAIL'
  return 'N/A '
}

function printHuman(target: string, results: CheckResult[]) {
  console.log(`vibe-check ${VERSION}`)
  console.log(`目标: ${target}`)
  console.log('')
  for (const r of results) {
    console.log(`[${mark(r.status)}] ${r.id}  ${r.title}`)
    for (const rule of r.rules) {
      const tag = rule.status === 'pass' ? 'ok  ' : rule.status === 'fail' ? 'FAIL' : 'n/a '
      console.log(`   ${tag} ${rule.id.padEnd(20)} ${rule.message}`)
      for (const e of rule.evidence.slice(0, 5)) console.log(`        · ${e}`)
      if (rule.evidence.length > 5) console.log(`        · ...另有 ${rule.evidence.length - 5} 项`)
    }
    console.log('')
  }
  const failedChecks = results.filter((r) => r.status === 'fail')
  const failedRules = results.flatMap((r) => r.rules).filter((x) => x.status === 'fail').length
  console.log(
    failedChecks.length > 0
      ? `结论: ${failedChecks.length} 项能力未通过（${failedRules} 条规则失败）`
      : '结论: 全部通过（或不适用）',
  )
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.cmd !== 'check') {
    console.error('用法: vibe-check check --path <项目目录> [--json]')
    process.exit(2)
  }
  if (!args.path) {
    console.error('缺少 --path')
    process.exit(2)
  }

  const target = resolve(args.path)
  const facts = await collectMigrationFacts(target)
  const results = [checkMigrationDiscipline(facts)]

  if (args.json) {
    console.log(JSON.stringify({ version: VERSION, target, facts, results }, null, 2))
  } else {
    printHuman(target, results)
  }

  process.exit(results.some((r) => r.status === 'fail') ? 1 : 0)
}

main().catch((err) => {
  console.error('执行失败:', err?.message ?? err)
  process.exit(2)
})
