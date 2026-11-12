/** 人读报告：一屏内看完结论与证据。 */
import type { CheckOutcome } from '../core/types.ts'
import type { RunResult } from '../core/runner.ts'

const VERSION = '0.1.0'

function tag(status: string): string {
  if (status === 'pass') return 'PASS'
  if (status === 'fail') return 'FAIL'
  if (status === 'na') return 'N/A '
  return 'ERR '
}

export function renderHuman(result: RunResult): string {
  const lines: string[] = []
  lines.push(`vibe-check ${VERSION}`)
  lines.push(`目标  ${result.target}`)
  lines.push(`配置  栈=${result.config.stack}  级别=${result.config.level}`)
  lines.push('')

  for (const o of result.outcomes) {
    lines.push(
      `[${tag(o.status)}] ${o.meta.id.padEnd(22)} ${o.meta.title}  ·  ${o.meta.rigor}  ·  ${o.durationMs}ms`,
    )
    for (const r of o.rules) {
      if (r.status === 'pass' && r.weight === 0) continue
      const mark = r.status === 'pass' ? 'ok  ' : r.status === 'fail' ? 'FAIL' : r.status === 'na' ? 'n/a ' : 'ERR '
      lines.push(`   ${mark} ${r.rule.padEnd(34)} ${r.message}`)
      for (const e of r.evidence.slice(0, 4)) lines.push(`        · ${e}`)
      if (r.evidence.length > 4) lines.push(`        · ...另有 ${r.evidence.length - 4} 项`)
    }
    lines.push('')
  }

  const s = result.summary
  lines.push('──────────────────────────────────────────')
  lines.push(
    `通过 ${s.passed}  未通过 ${s.failed}  不适用 ${s.na}  异常 ${s.error}  ·  rigor 均分 ${s.rigorScore}/10`,
  )
  lines.push(
    s.failed > 0
      ? `结论  ${s.failed} 项能力未通过（${s.failedRules} 条规则失败）`
      : s.error > 0
        ? `结论  有 ${s.error} 项无法判定，需人工确认`
        : '结论  全部通过（或不适用）',
  )
  if (s.rigorScore > 0 && s.rigorScore < 7) {
    lines.push('提示  rigor 均分低于 7 分，这套判定目前偏静态，容易伪造')
  }
  return lines.join('\n')
}

export function renderJson(result: RunResult): string {
  return JSON.stringify(
    {
      version: VERSION,
      target: result.target,
      config: result.config,
      summary: result.summary,
      outcomes: result.outcomes,
    },
    null,
    2,
  )
}

export function summarizeFinding(o: CheckOutcome): string {
  const failed = o.rules.filter((r) => r.status === 'fail')
  if (!failed.length) return `${o.meta.id}: ${o.status}`
  return `${o.meta.id}: ${failed.map((f) => f.rule).join(', ')}`
}
