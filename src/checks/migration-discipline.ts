/** Check · 数据迁移纪律：schema 变更能不能从仓库重现。 */
import type { CheckContext, CheckImpl } from '../core/context.ts'
import type { Finding, Status } from '../core/types.ts'

export const meta: CheckImpl['meta'] = {
  id: 'migration-discipline',
  title: '数据迁移纪律',
  levels: ['L2', 'L3'],
  rigor: 'static',
  weight: 3,
  risk: 'yellow',
}

function seqOf(name: string): number | null {
  const m = /^(\d{1,4})/.exec(name)
  return m ? Number(m[1]) : null
}

export async function run(ctx: CheckContext): Promise<{ status: Status; rules: Finding[] }> {
  const f = ctx.facts.migrations
  const rules: Finding[] = []

  rules.push({
    check: meta.id,
    rule: 'na-database',
    status: f.hasDatabase ? 'pass' : 'na',
    weight: 0,
    message: f.hasDatabase
      ? '项目存在数据库痕迹，进入迁移纪律判定'
      : '未发现任何数据库痕迹，本能力不适用',
    evidence: f.hasDatabase ? [...f.ddlFiles, ...f.migrationDirs].slice(0, 5) : [],
  })

  if (!f.hasDatabase) {
    return { status: 'na', rules }
  }

  const adHocWithSql = f.adHocScripts.filter((s) => s.hasSql)
  rules.push({
    check: meta.id,
    rule: 'no-adhoc-sql',
    status: adHocWithSql.length === 0 ? 'pass' : 'fail',
    weight: 3,
    message:
      adHocWithSql.length === 0
        ? '未发现含 SQL 的一次性脚本'
        : `发现 ${adHocWithSql.length} 个含 SQL 的一次性脚本，数据结构变更没有走版本化通道`,
    evidence: adHocWithSql.slice(0, 8).map((s) => s.file),
  })

  const hasVersionedSource = f.migrationDirs.length > 0 || f.inCodeRegistries.length > 0
  rules.push({
    check: meta.id,
    rule: 'versioned-source',
    status: hasVersionedSource ? 'pass' : 'fail',
    weight: 3,
    message: hasVersionedSource
      ? '存在版本化迁移来源'
      : '既没有迁移目录，也没有代码内迁移注册表，schema 无法从仓库重现',
    evidence: [...f.migrationDirs, ...f.inCodeRegistries.map((r) => r.file)].slice(0, 5),
  })

  if (f.migrationNames.length > 1) {
    const seqs = f.migrationNames.map(seqOf)
    const numbered = seqs.filter((n): n is number => n !== null)
    let firstBreak = -1
    for (let i = 1; i < numbered.length; i++) {
      if (numbered[i] < numbered[i - 1]) {
        firstBreak = i
        break
      }
    }
    const mono = numbered.length < 2 || firstBreak === -1
    const prevName = firstBreak === -1 ? '' : f.migrationNames[firstBreak - 1]
    const currName = firstBreak === -1 ? '' : f.migrationNames[firstBreak]
    rules.push({
      check: meta.id,
      rule: 'monotonic-order',
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
  return { status: failed.length ? 'fail' : 'pass', rules }
}
