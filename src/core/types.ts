/** 全局类型：判定、事实、配置的共同语言。 */

export type Rigor = 'existence' | 'static' | 'behavioral' | 'adversarial'
export type Status = 'pass' | 'fail' | 'na' | 'error'
export type Risk = 'green' | 'yellow' | 'red'
export type Level = 'L1' | 'L2' | 'L3'

/** rigor 分值：核心判定平均必须 >= 7 */
export const RIGOR_SCORE: Record<Rigor, number> = {
  existence: 0,
  static: 5,
  behavioral: 8,
  adversarial: 10,
}

export type Finding = {
  check: string
  rule: string
  status: Status
  weight: number
  message: string
  evidence: string[]
}

export type CheckMeta = {
  id: string
  title: string
  levels: Level[]
  rigor: Rigor
  weight: number
  /** 修复风险等级，决定处方能否自动执行 */
  risk: Risk
}

export type CheckOutcome = {
  meta: CheckMeta
  status: Status
  rules: Finding[]
  durationMs: number
  /** 无法判定时的原因（boot 失败等），不许静默跳过 */
  skipReason?: string
}

export type VibConfig = {
  name: string
  stack: 'node' | 'python' | 'unknown'
  level: Level
  /** 启动命令，行为判定需要 */
  start?: { command: string; cwd?: string }
  /** 就绪探测 */
  ready?: { url: string; timeoutMs: number }
  /** 健康检查路径 */
  healthPath?: string
  /** 受保护路由样本，用于权限探针 */
  protectedPath?: string
  /** 本地快检命令 */
  fastcheck: string[]
  envExample: string
}

export type ProjectContext = {
  root: string
  config: VibConfig
  facts: Record<string, unknown>
  /** 行为判定用的启动器，按需懒启动 */
  ensureBoot: () => Promise<BootHandle>
}

export type BootHandle = {
  ok: boolean
  baseUrl?: string
  error?: string
  stop: () => Promise<void>
}

export type RunOptions = {
  root: string
  profile?: Level
  only?: string[]
  skipBehavioral?: boolean
  timeoutMs?: number
}
