/** 判定运行上下文：facts 只读，probe 提供行为能力。 */
import type { BootHandle, VibConfig } from './types.ts'
import type { ProjectFacts } from '../facts/project.ts'
import type { EnvFacts } from '../facts/env.ts'
import type { RouteFacts } from '../facts/routes.ts'
import type { MigrationFacts } from '../facts/migrations.ts'
import type { DeployFacts } from '../facts/deploy.ts'

export type FactsBag = {
  project: ProjectFacts
  env: EnvFacts
  routes: RouteFacts
  migrations: MigrationFacts
  deploy: DeployFacts
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

/** 起一个长驻进程跑一段时间，看它会不会自己退出 */
export type SpawnResult = {
  exited: boolean
  code: number | null
  log: string
  durationMs: number
}

export type Probe = {
  /** 相对于项目根的就绪地址；未就绪时抛错，由上层转成 na */
  http: (path: string, init?: RequestInit) => Promise<HttpResult>
  exec: (command: string, cwd?: string) => Promise<ExecResult>
  ensureBoot: () => Promise<BootHandle>
  /** 关掉整轮共享的启动实例（由运行器在末尾统一调用，判定里不要自己关） */
  stopBoot: () => Promise<void>
  /** 用「删掉指定环境变量」的环境起项目，观察它是否自己退出（验证缺变量是否快速失败） */
  spawnExpectExit: (opts: { clearKeys: string[]; waitMs: number }) => Promise<SpawnResult>
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
    /** 是否计入 rigor 均分；文档型能力设 false */
    core?: boolean
  }
  run: (ctx: CheckContext) => Promise<{ status: import('./types.ts').Status; rules: import('./types.ts').Finding[] }>
}
