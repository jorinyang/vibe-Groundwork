/** 能力注册表：新增一项能力，只改这里和 src/checks/。 */
import type { CheckImpl } from '../core/context.ts'
import * as constitution from '../checks/project-constitution.ts'
import * as envContract from '../checks/env-contract.ts'
import * as localFastcheck from '../checks/local-fastcheck.ts'
import * as migration from '../checks/migration-discipline.ts'
import * as health from '../checks/health-probe.ts'
import * as authz from '../checks/authz-default-deny.ts'

/** 顺序即展示顺序：从「有没有」到「挡不挡得住」。 */
export const CHECKS: CheckImpl[] = [
  constitution,
  envContract,
  localFastcheck,
  migration,
  health,
  authz,
]

export const PROFILE_LEVELS: Record<'L1' | 'L2' | 'L3', number> = {
  L1: 1,
  L2: 2,
  L3: 3,
}

/** 按级别筛选：L2 的 profile 包含所有 levels 里带 L1 或 L2 的检查。 */
export function selectChecks(profile: 'L1' | 'L2' | 'L3', only?: string[]): CheckImpl[] {
  const allowed = new Set<string>()
  for (const [level, rank] of Object.entries(PROFILE_LEVELS)) {
    if (rank <= PROFILE_LEVELS[profile]) allowed.add(level)
  }
  return CHECKS.filter((c) => {
    if (only?.length) return only.includes(c.meta.id)
    return c.meta.levels.some((l) => allowed.has(l))
  })
}
