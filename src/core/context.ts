/** 判定运行上下文：facts 只读，probe 提供行为能力。 */
import type { BootHandle, VibConfig } from './types.ts'
import type { ProjectFacts } from '../facts/project.ts'
import type { EnvFacts } from '../facts/env.ts'
import type { RouteFacts } from '../facts/routes.ts'
import type { MigrationFacts } from '../facts/migrations.ts'

export type FactsBag = {
  project: ProjectFacts
  env: EnvFacts
  routes: RouteFacts
  migrations: MigrationFacts
}

export type HttpResult = {
  status: number
  text: string
  json: unknown
  contentType: string
}

export type ExecResult = {
  code: number
  output: string
  durationMs: number
}

export type Probe = {
  /** 相对于项目根的就绪地址；未就绪时抛错，由上层转成 na */
  http: (path: string, init?: RequestInit) => Promise<HttpResult>
  exec: (command: string, cwd?: string) => Promise<ExecResult>
  ensureBoot: () => Promise<BootHandle>
}

export type CheckContext = {
  root: string
  config: VibConfig
  facts: FactsBag
  probe: Probe
}

export type CheckImpl = {
  meta: {
    id: string
    title: string
    levels: ('L1' | 'L2' | 'L3')[]
    rigor: 'existence' | 'static' | 'behavioral' | 'adversarial'
    weight: number
    risk: 'green' | 'yellow' | 'red'
  }
  run: (ctx: CheckContext) => Promise<{ status: 'pass' | 'fail' | 'na'; rules: import('./types.ts').Finding[] }>
}
