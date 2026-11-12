/**
 * Check · 数据迁移纪律
 *
 * 只消费 facts，不读具体文件。这条约束是「非骨架项目也能通过」的机制保证。
 */
import type { MigrationFacts } from '../facts/migrations.ts'

export type RuleStatus = 'pass' | 'fail' | 'na'

export type RuleResult = {
  id: string
  status: RuleStatus
  weight: number
  message: string
  evidence: string[]
}

export type CheckResult = {
  id: string
  title: string
  status: RuleStatus
  rules: RuleResult[]
}

/** 从迁移名里抽序号，例如 034_rename_x -> 34 */
function seqOf(name: string): number | null {
  const m = /^(\d{1,4})/.exec(name)
  return m ? Number(m[1]) : null
}

export function checkMigrationDiscipline(facts: MigrationFacts): CheckResult {
  const rules: RuleResult[] = []

  // 规则 0：这个项目根本不碰数据库 —— 不适用，不判失败
  rules.push({
    id: 'na-database',
    status: facts.hasDatabase ? 'pass' : 'na',
    weight: 0,
    message: facts.hasDatabase
      ? '项目存在数据库痕迹，进入迁移纪律判定'
      : '未发现任何数据库痕迹，本能力不适用',
    evidence: facts.hasDatabase
      ? [...facts.ddlFiles, ...facts.migrationDirs].slice(0, 5)
      : [],
  })

  if (!facts.hasDatabase) {
    return { id: 'migration-discipline', title: '数据迁移纪律', status: 'na', rules }
  }

  // 规则 1：不许用一次性脚本改 schema
  const adHocWithSql = facts.adHocScripts.filter((s) => s.hasSql)
  rules.push({
    id: 'no-adhoc-sql',
    status: adHocWithSql.length === 0 ? 'pass' : 'fail',
    weight: 3,
    message:
      adHocWithSql.length === 0
        ? '未发现含 SQL 的一次性脚本'
        : `发现 ${adHocWithSql.length} 个含 SQL 的一次性脚本，schema 变更没有走版本化通道`,
    evidence: adHocWithSql.slice(0, 8).map((s) => s.file),
  })

  // 规则 2：必须存在版本化迁移来源（迁移目录，或代码内迁移注册表）
  const hasVersionedSource = facts.migrationDirs.length > 0 || facts.inCodeRegistries.length > 0
  rules.push({
    id: 'versioned-source',
    status: hasVersionedSource ? 'pass' : 'fail',
    weight: 3,
    message: hasVersionedSource
      ? '存在版本化迁移来源'
      : '既没有迁移目录，也没有代码内迁移注册表，schema 无法从仓库重现',
    evidence: [
      ...facts.migrationDirs.slice(0, 4),
      ...facts.inCodeRegistries.map((r) => r.file).slice(0, 4),
    ],
  })

  // 规则 3：迁移序号必须单调递增，否则执行顺序是错的
  if (facts.migrationNames.length > 1) {
    const seqs = facts.migrationNames.map(seqOf)
    const numbered = seqs.filter((n): n is number => n !== null)
    let firstBreak = -1
    for (let i = 1; i < numbered.length; i++) {
      if (numbered[i] < numbered[i - 1]) {
        firstBreak = i
        break
      }
    }
    const mono = numbered.length < 2 || firstBreak === -1
    const prevName = firstBreak === -1 ? '' : facts.migrationNames[firstBreak - 1]
    const currName = firstBreak === -1 ? '' : facts.migrationNames[firstBreak]
    rules.push({
      id: 'monotonic-order',
      status: mono ? 'pass' : 'fail',
      weight: 3,
      message: mono
        ? `${numbered.length} 条迁移序号单调递增`
        : `声明顺序与序号相反；运行器按数组顺序执行，全新数据库会先跑「${prevName}」再跑「${currName}」`,
      evidence: mono
        ? [`共 ${numbered.length} 条带序号的迁移`]
        : [`${prevName} → ${currName}`, `共 ${numbered.length} 条带序号的迁移`],
    })
  }

  const failed = rules.filter((r) => r.status === 'fail')
  return {
    id: 'migration-discipline',
    title: '数据迁移纪律',
    status: failed.length > 0 ? 'fail' : 'pass',
    rules,
  }
}
