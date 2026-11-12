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
  /**
   * 仅 status=na 时有意义。
   * - not-applicable：项目根本不需要这项能力（不碰数据库、没有 HTTP 服务）
   * - not-configured：需要配置/环境才能判定，配好之后可以验
   * 这两者混为一谈，用户就会以为「全绿」。
   */
  naKind?: 'not-applicable' | 'not-configured'
  /** not-configured 时给出的具体配置指引 */
  howToEnable?: string
}

export type CheckMeta = {
  id: string
  title: string
  levels: Level[]
  rigor: Rigor
  weight: number
  /** 修复风险等级，决定处方能否自动执行 */
  risk: Risk
  /**
   * 是否计入 rigor 均分。
   * 文档型能力（项目宪法）天然只能静态判定，计进去会永久拉低均分，
   * 但它仍然要跑、要显示。false 表示「不计入质量分」。
   */
  core?: boolean
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
  stack: 'node' | 'python' | 'go' | 'ruby' | 'rust' | 'java' | 'unknown'
  level: Level
  /** 启动命令，行为判定需要 */
  start?: { command: string; cwd?: string; env?: Record<string, string> }
  /** 就绪探测 */
  ready?: { url: string; timeoutMs: number }
  /** 健康检查路径 */
  healthPath?: string
  /** 受保护路由样本，用于权限探针 */
  protectedPath?: string
  /** SQLite 数据库路径，配置后启用迁移行为判定 */
  dbPath?: string
  /** 本地快检命令 */
  fastcheck: string[]
  envExample: string
  /** 相对路径前缀，扫描时跳过（vendored 库、独立部署子工程等） */
  ignorePaths?: string[]
  /** 配置是否来自项目自己的 .vibe/config.yaml（true 时推断值不算「已声明」） */
  explicitConfig?: boolean
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
