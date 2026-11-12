/**
 * 处方执行器。
 *
 * 三条铁律：
 *   1. 红灯能力永不允许自动执行，只出说明
 *   2. 执行前必须打快照，失败可一键回滚
 *   3. 每一步都要能告诉人「改了什么、为什么」
 */
import { mkdir, copyFile, writeFile, readFile, readdir } from 'node:fs/promises'
import { join, dirname, relative } from 'node:path'
import type { CheckOutcome, Risk } from '../core/types.ts'
import type { RunResult } from '../core/runner.ts'
import { parseYaml, readText } from '../core/util.ts'
import { collectEnvFacts } from '../facts/env.ts'

export type PrescriptionStep = {
  id: string
  why: string
  when?: string
  action: 'create-file' | 'append-lines' | 'generate' | 'run-command' | 'patch-instruction'
  path?: string
  content?: string[]
  template?: string
  generator?: 'env-example' | 'env-example-merge' | 'agents-md'
  command?: string
  target?: string
}

export type Prescription = {
  id: string
  risk: Risk
  steps: PrescriptionStep[]
}

export type FixPlanEntry = {
  checkId: string
  risk: Risk
  steps: PrescriptionStep[]
  status: 'executable' | 'blocked-risk' | 'no-prescription'
}

export type FixReport = {
  entries: FixPlanEntry[]
  executed: { step: string; action: string; ok: boolean; note: string }[]
  snapshotDir: string | null
}

const RISK_RANK: Record<Risk, number> = { green: 1, yellow: 2, red: 3 }

export async function loadPrescription(capDir: string | null): Promise<Prescription | null> {
  if (!capDir) return null
  const txt = await readText(join(capDir, 'prescription.yaml'))
  if (!txt) return null
  const raw = parseYaml(txt) as Record<string, unknown>
  if (!raw.id || !raw.risk) return null
  const steps = (raw.steps as unknown[]) ?? []
  return {
    id: String(raw.id),
    risk: raw.risk as Risk,
    steps: (steps as Record<string, unknown>[]).map((s, i) => ({
      id: String(s.id ?? i + 1),
      why: String(s.why ?? ''),
      when: s.when ? String(s.when) : undefined,
      action: String(s.action ?? 'patch-instruction') as PrescriptionStep['action'],
      path: s.path ? String(s.path) : undefined,
      content: Array.isArray(s.content) ? (s.content as string[]) : undefined,
      template: s.template ? String(s.template) : undefined,
      generator: s.generator ? (String(s.generator) as PrescriptionStep['generator']) : undefined,
      command: s.command ? String(s.command) : undefined,
      target: s.target ? String(s.target) : undefined,
    })),
  }
}

function interpolate(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`)
}

/** 能力 id → 能力目录（capabilities/NN-<id>）。目录名带序号，所以扫描匹配。 */
export async function resolveCapDir(capsDir: string, id: string): Promise<string | null> {
  let entries
  try {
    entries = await readdir(capsDir, { withFileTypes: true })
  } catch {
    return null
  }
  const hit = entries.find((e) => e.isDirectory() && (e.name === id || e.name.endsWith(`-${id}`)))
  return hit ? join(capsDir, hit.name) : null
}

export async function buildFixPlan(
  result: RunResult,
  capsDir: string,
  allowRisk: Risk,
): Promise<FixPlanEntry[]> {
  const entries: FixPlanEntry[] = []
  for (const outcome of result.outcomes) {
    if (outcome.status !== 'fail') continue
    const capDir = await resolveCapDir(capsDir, outcome.meta.id)
    const rx = await loadPrescription(capDir)
    if (!rx) {
      entries.push({
        checkId: outcome.meta.id,
        risk: outcome.meta.risk,
        steps: [],
        status: 'no-prescription',
      })
      continue
    }
    const failedRules = new Set(outcome.rules.filter((r) => r.status === 'fail').map((r) => r.rule))
    const steps = rx.steps.filter((s) => {
      if (!s.when) return true
      const rule = s.when.replace(/^rule\s+/, '').trim()
      return failedRules.has(rule)
    })
    const blocked = RISK_RANK[rx.risk] > RISK_RANK[allowRisk]
    entries.push({
      checkId: outcome.meta.id,
      risk: rx.risk,
      steps,
      status: steps.length === 0 ? 'no-prescription' : blocked ? 'blocked-risk' : 'executable',
    })
  }
  return entries
}

async function snapshot(root: string, files: string[]): Promise<string> {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const dir = join(root, '.vibe/snapshots', stamp)
  for (const f of files) {
    const src = join(root, f)
    const dst = join(dir, f)
    await mkdir(dirname(dst), { recursive: true })
    try {
      await copyFile(src, dst)
    } catch {
      await writeFile(dst + '.absent', '')
    }
  }
  return dir
}

async function generate(
  name: PrescriptionStep['generator'],
  root: string,
  vars: Record<string, string>,
): Promise<string | null> {
  if (name === 'env-example') {
    const facts = await collectEnvFacts(root)
    if (!facts.used.length) return null
    const lines = ['# 环境变量（依据代码引用自动生成）', '']
    for (const u of facts.used) lines.push(`${u.name}=`)
    return lines.join('\n') + '\n'
  }
  if (name === 'env-example-merge') {
    const facts = await collectEnvFacts(root)
    const existing = new Set(facts.declared)
    const missing = facts.used.map((u) => u.name).filter((n) => !existing.has(n))
    if (!missing.length) return null
    const lines = ['# 以下变量被代码引用但此前未声明（vibe fix 补充）', '']
    for (const n of missing) lines.push(`${n}=`)
    return lines.join('\n') + '\n'
  }
  if (name === 'agents-md') {
    return [
      `# AGENTS.md · ${vars.projectName}`,
      '',
      '## 这个项目是什么',
      '',
      `${vars.stack} 项目。开工前先看 README。`,
      '',
      '## 怎么跑',
      '',
      '```',
      'cp .env.example .env',
      '```',
      '',
      '## 不许做',
      '',
      '- 不许把密钥写进代码或提交 `.env`',
      '- 不许在业务代码里直接改表结构，schema 变更只走迁移',
      '- 不许留下只跑通一次的一次性脚本',
      '',
      '## 改动流程',
      '',
      '1. 改代码 · 2. 本地快检全绿 · 3. `vibe check --path .`',
      '',
    ].join('\n')
  }
  return null
}

export async function applyFixPlan(
  root: string,
  plan: FixPlanEntry[],
  opts: { apply: boolean; vars: Record<string, string> },
): Promise<FixReport> {
  const executable = plan.filter((p) => p.status === 'executable')
  const executed: FixReport['executed'] = []

  if (!opts.apply) {
    for (const p of plan) {
      for (const s of p.steps) {
        executed.push({
          step: `${p.checkId}#${s.id}`,
          action: s.action,
          ok: false,
          note: `计划（未执行）：${s.why}`,
        })
      }
    }
    return { entries: plan, executed, snapshotDir: null }
  }

  const touched = new Set<string>()
  for (const p of executable) for (const s of p.steps) if (s.path) touched.add(s.path)
  const snapshotDir = touched.size ? await snapshot(root, [...touched]) : null

  for (const p of executable) {
    for (const s of p.steps) {
      const label = `${p.checkId}#${s.id}`
      try {
        if (s.action === 'generate' && s.path && s.generator) {
          const content = await generate(s.generator, root, opts.vars)
          if (!content) {
            executed.push({ step: label, action: s.action, ok: false, note: `生成器 ${s.generator} 无内容可写` })
            continue
          }
          const full = join(root, s.path)
          await mkdir(dirname(full), { recursive: true })
          const prev = await readText(full)
          if (prev !== null && s.generator === 'env-example-merge') {
            await writeFile(full, prev + (prev.endsWith('\n') ? '' : '\n') + content, 'utf8')
            executed.push({ step: label, action: s.action, ok: true, note: `补充 ${s.path}` })
          } else if (prev !== null) {
            executed.push({ step: label, action: s.action, ok: false, note: `${s.path} 已存在，跳过` })
          } else {
            await writeFile(full, content, 'utf8')
            executed.push({ step: label, action: s.action, ok: true, note: `生成 ${s.path}` })
          }
        } else if (s.action === 'create-file' && s.path) {
          const full = join(root, s.path)
          try {
            await readFile(full, 'utf8')
            executed.push({ step: label, action: s.action, ok: false, note: `${s.path} 已存在，跳过` })
            continue
          } catch {
            /* 不存在，继续 */
          }
          await mkdir(dirname(full), { recursive: true })
          let content = (s.content ?? []).join('\n')
          if (s.template) {
            const tpl = await readText(join(root, s.template))
            if (tpl) content = tpl
          }
          const interp = interpolate(content, opts.vars)
          await writeFile(full, interp.endsWith('\n') ? interp : interp + '\n', 'utf8')
          executed.push({ step: label, action: s.action, ok: true, note: `创建 ${s.path}` })
        } else if (s.action === 'append-lines' && s.path && s.content) {
          const full = join(root, s.path)
          const prev = (await readText(full)) ?? ''
          await mkdir(dirname(full), { recursive: true })
          const block = interpolate(s.content.join('\n'), opts.vars)
          await writeFile(full, prev + (prev && !prev.endsWith('\n') ? '\n' : '') + block + '\n', 'utf8')
          executed.push({ step: label, action: s.action, ok: true, note: `追加到 ${s.path}` })
        } else if (s.action === 'run-command' && s.command) {
          executed.push({ step: label, action: s.action, ok: false, note: `需要人工执行：${s.command}` })
        } else {
          executed.push({
            step: label,
            action: s.action,
            ok: false,
            note: `需要人工执行：${s.target ?? s.why}`,
          })
        }
      } catch (err) {
        executed.push({ step: label, action: s.action, ok: false, note: `失败：${(err as Error)?.message ?? err}` })
      }
    }
  }

  return { entries: plan, executed, snapshotDir }
}

export function renderPlan(report: FixReport): string {
  const lines: string[] = ['修复计划']
  for (const e of report.entries) {
    const label =
      e.status === 'executable'
        ? '可执行'
        : e.status === 'blocked-risk'
          ? `${e.risk === 'red' ? '红档' : '黄档'}·需人工确认`
          : '无处方'
    lines.push('')
    lines.push(`[${label}] ${e.checkId}  (risk: ${e.risk})`)
    if (!e.steps.length) lines.push('   （没有可自动执行的步骤，需要人工处理）')
    for (const s of e.steps) {
      lines.push(`   ${s.id}. ${s.why}`)
      if (s.path) lines.push(`      → ${s.action} ${s.path}`)
      if (s.generator) lines.push(`      → generate ${s.generator}`)
      if (s.command) lines.push(`      → ${s.command}`)
      if (s.target) lines.push(`      → ${s.target}`)
    }
  }
  if (report.snapshotDir) {
    lines.push('')
    lines.push(`快照：${relative(process.cwd(), report.snapshotDir)}`)
  }
  return lines.join('\n')
}
