/** 人读报告：一屏内看完结论与证据。 */
import type { CheckOutcome } from '../core/types.ts'
import type { RunResult } from '../core/runner.ts'
import { VERSION } from '../core/version.ts'

function tag(status: string): string {
  if (status === 'pass') return 'PASS'
  if (status === 'fail') return 'FAIL'
  if (status === 'na') return 'N/A '
  return 'ERR '
}

function naLabel(naKind?: string): string {
  if (naKind === 'not-applicable') return '不适用'
  if (naKind === 'not-configured') return '待配置'
  return '跳过'
}

export function renderHuman(result: RunResult): string {
  const lines: string[] = []
  lines.push(`vibe-check ${VERSION}`)
  lines.push(`目标  ${result.target}`)
  lines.push(`配置  栈=${result.config.stack}  级别=${result.config.level}`)
  lines.push('')

  const pendingConfig: string[] = []

  for (const o of result.outcomes) {
    lines.push(
      `[${tag(o.status)}] ${o.meta.id.padEnd(22)} ${o.meta.title}  ·  ${o.meta.rigor}  ·  ${o.durationMs}ms`,
    )
    for (const r of o.rules) {
      if (r.status === 'pass' && r.weight === 0) continue
      const mark =
        r.status === 'pass' ? 'ok  ' : r.status === 'fail' ? 'FAIL' : r.status === 'na' ? 'n/a ' : 'ERR '
      const suffix = r.status === 'na' ? `  [${naLabel(r.naKind)}]` : ''
      lines.push(`   ${mark} ${r.rule.padEnd(32)} ${r.message}${suffix}`)
      for (const e of r.evidence.slice(0, 4)) lines.push(`        · ${e}`)
      if (r.evidence.length > 4) lines.push(`        · ...另有 ${r.evidence.length - 4} 项`)
      if (r.status === 'na' && r.naKind === 'not-configured' && r.howToEnable) {
        for (const gl of r.howToEnable.split('\n')) lines.push(`        ▸ ${gl}`)
        pendingConfig.push(`   · ${o.meta.title}：${r.message}`)
      }
    }
    lines.push('')
  }

  const s = result.summary
  lines.push('──────────────────────────────────────────')
  lines.push(
    `通过 ${s.passed}  未通过 ${s.failed}  不适用 ${s.na}  异常 ${s.error}  ·  rigor 均分 ${s.rigorScore}/10`,
  )
  if (s.na > 0) {
    lines.push(
      `其中不适用 ${s.naNotApplicable} 条（项目不需要）· 待配置 ${s.naNotConfigured} 条（配好能多验）`,
    )
  }

  if (s.failed > 0) {
    lines.push(`结论  ${s.failed} 项能力未通过（${s.failedRules} 条规则失败）`)
  } else if (s.error > 0) {
    lines.push(`结论  有 ${s.error} 项无法判定，需人工确认`)
  } else if (s.naNotConfigured > 0) {
    lines.push(`结论  没有失败项，但有 ${s.naNotConfigured} 条未验证（不是通过，是没验）`)
  } else {
    lines.push('结论  全部通过（或不适用）')
  }

  if (pendingConfig.length > 0) {
    lines.push('')
    lines.push('要真正验到这些项，补一条配置即可：')
    for (const p of pendingConfig) lines.push(p)
    lines.push('   → 细节见上方每条 [待配置] 的 ▸ 提示')
  }

  if (s.rigorScore > 0 && s.rigorScore < 7) {
    lines.push('提示  rigor 均分低于 7 分，这套判定目前偏静态，容易伪造')
  }
  return lines.join('\n')
}

export function renderJson(result: RunResult): string {
  return JSON.stringify(
    {
      schema: 'vibe-check/report@2',
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
