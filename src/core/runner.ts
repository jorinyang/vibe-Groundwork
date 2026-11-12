/** 运行器：抽事实 → 建探针 → 跑判定 → 出结果。 */
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import type { BootHandle, CheckOutcome, Level, RunOptions, VibConfig } from './types.ts'
import type { CheckContext, ExecResult, FactsBag, HttpResult } from './context.ts'
import { loadConfig } from './config.ts'
import { boot } from './boot.ts'
import { collectProjectFacts } from '../facts/project.ts'
import { collectEnvFacts } from '../facts/env.ts'
import { collectRouteFacts } from '../facts/routes.ts'
import { collectMigrationFacts } from '../facts/migrations.ts'
import { collectDeployFacts } from '../facts/deploy.ts'
import { selectChecks } from './registry.ts'

export type RunResult = {
  target: string
  config: VibConfig
  outcomes: CheckOutcome[]
  summary: {
    passed: number
    failed: number
    na: number
    naNotApplicable: number
    naNotConfigured: number
    error: number
    rigorScore: number
    failedRules: number
  }
}

function execShell(command: string, cwd: string, timeoutMs: number): Promise<ExecResult> {
  return new Promise((resolvePromise) => {
    const started = Date.now()
    const shell = process.platform === 'win32' ? 'cmd' : 'sh'
    const flag = process.platform === 'win32' ? '/c' : '-c'
    // Windows 控制台默认 GBK，会把中文报错变成乱码，导致「命令不存在」这类
    // 判定失效。先切 UTF-8 代码页再执行。
    const full = process.platform === 'win32' ? `chcp 65001 >nul & ${command}` : command
    const child = spawn(shell, [flag, full], {
      cwd,
      windowsHide: true,
      env: { ...process.env, CI: '1', NO_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let out = ''
    const timer = setTimeout(() => {
      try {
        child.kill('SIGKILL')
      } catch {
        /* noop */
      }
      out += `\n[timeout] 超过 ${timeoutMs}ms 已终止`
    }, timeoutMs)
    child.stdout?.on('data', (d) => (out += d.toString()))
    child.stderr?.on('data', (d) => (out += d.toString()))
    child.on('close', (code) => {
      clearTimeout(timer)
      resolvePromise({ code: code ?? 1, output: out, durationMs: Date.now() - started })
    })
    child.on('error', () => {
      clearTimeout(timer)
      resolvePromise({ code: 127, output: out || '命令无法启动', durationMs: Date.now() - started })
    })
  })
}

export async function runProject(opts: RunOptions): Promise<RunResult> {
  const target = resolve(opts.root)
  const config = await loadConfig(target)

  const facts: FactsBag = {
    project: await collectProjectFacts(target),
    env: await collectEnvFacts(target, config.envExample),
    routes: await collectRouteFacts(target),
    migrations: await collectMigrationFacts(target),
    deploy: await collectDeployFacts(target),
  }

  // 行为探针：boot 懒启动，整轮只启动一次
  let booted: BootHandle | null = null
  const ensureBoot = async (): Promise<BootHandle> => {
    if (booted) return booted
    if (opts.skipBehavioral) return { ok: false, error: '已禁用行为判定（--no-behavioral）', stop: async () => {} }
    booted = await boot(config, target)
    return booted
  }

  const probe: CheckContext['probe'] = {
    async http(path: string, init?: RequestInit): Promise<HttpResult> {
      const handle = await ensureBoot()
      if (!handle.ok || !handle.baseUrl) {
        throw new Error(handle.error ?? '项目未能启动')
      }
      const url = `${handle.baseUrl}${path.startsWith('/') ? path : '/' + path}`
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(8000) })
      const text = await res.text()
      let json: unknown = null
      try {
        json = JSON.parse(text)
      } catch {
        /* 非 JSON */
      }
      return { status: res.status, text, json, contentType: res.headers.get('content-type') ?? '' }
    },
    exec: (command: string, cwd?: string) =>
      execShell(command, cwd ?? target, opts.timeoutMs ?? 180_000),
    ensureBoot,
  }

  const checks = selectChecks((opts.profile ?? config.level ?? 'L2') as Level, opts.only)
  const outcomes: CheckOutcome[] = []

  try {
    for (const check of checks) {
      const started = Date.now()
      try {
        const r = await check.run({ root: target, config, facts, probe })
        outcomes.push({
          meta: check.meta,
          status: r.status,
          rules: r.rules,
          durationMs: Date.now() - started,
        })
      } catch (err) {
        outcomes.push({
          meta: check.meta,
          status: 'error',
          rules: [
            {
              check: check.meta.id,
              rule: 'runtime-error',
              status: 'error',
              weight: 0,
              message: `判定执行异常：${(err as Error)?.message ?? err}`,
              evidence: [],
            },
          ],
          durationMs: Date.now() - started,
        })
      }
    }
  } finally {
    await probe.ensureBoot().then((h) => h.stop()).catch(() => {})
  }

  const passed = outcomes.filter((o) => o.status === 'pass').length
  const failed = outcomes.filter((o) => o.status === 'fail').length
  const na = outcomes.filter((o) => o.status === 'na').length
  const naRules = outcomes.flatMap((o) => o.rules).filter((r) => r.status === 'na')
  const naNotConfigured = naRules.filter((r) => r.naKind === 'not-configured').length
  const naNotApplicable = naRules.filter((r) => r.naKind === 'not-applicable').length
  const error = outcomes.filter((o) => o.status === 'error').length
  const failedRules = outcomes.flatMap((o) => o.rules).filter((r) => r.status === 'fail').length

  const scored = outcomes.filter((o) => o.status !== 'na' && o.status !== 'error')
  const rigorScore =
    scored.length === 0
      ? 0
      : Math.round(
          (scored.reduce(
            (sum, o) =>
              sum +
              ({ existence: 0, static: 5, behavioral: 8, adversarial: 10 } as Record<string, number>)[
                o.meta.rigor
              ],
            0,
          ) /
            scored.length) *
            10,
        ) / 10

  return {
    target,
    config,
    outcomes,
    summary: { passed, failed, na, naNotApplicable, naNotConfigured, error, rigorScore, failedRules },
  }
}
