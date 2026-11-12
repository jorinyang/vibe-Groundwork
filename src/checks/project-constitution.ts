/** Check · 项目宪法：agent 进这个仓库，能不能在一屏内知道规矩。 */
import type { CheckContext, CheckImpl } from '../core/context.ts'
import type { Finding, Status } from '../core/types.ts'

export const meta: CheckImpl['meta'] = {
  id: 'project-constitution',
  title: '项目宪法',
  levels: ['L1', 'L2', 'L3'],
  rigor: 'static',
  weight: 2,
  risk: 'green',
  /**
   * 文档型能力：只能静态判定。
   * 不计入 rigor 均分，否则会永久拉低质量分；但仍然要跑、要显示。
   */
  core: false,
}

const MAX_LINES = 150

export async function run(ctx: CheckContext): Promise<{ status: Status; rules: Finding[] }> {
  const facts = ctx.facts.project
  const rules: Finding[] = []
  const a = facts.agents

  rules.push({
    check: meta.id,
    rule: 'agents-file-exists',
    status: a ? 'pass' : 'fail',
    weight: 3,
    message: a
      ? `存在 agent 入口：${a.file}`
      : '根目录没有 AGENTS.md / CLAUDE.md，agent 每次进场都要重新猜规矩',
    evidence: a ? [a.file] : ['AGENTS.md', 'CLAUDE.md', '.cursorrules'],
  })

  if (a) {
    rules.push({
      check: meta.id,
      rule: 'agents-one-screen',
      status: a.lines <= MAX_LINES ? 'pass' : 'fail',
      weight: 2,
      message:
        a.lines <= MAX_LINES
          ? `入口 ${a.lines} 行，一屏可读`
          : `入口 ${a.lines} 行，超过 ${MAX_LINES} 行会被跳读`,
      evidence: [`${a.file}: ${a.lines} 行`],
    })

    const need: ('run' | 'forbidden' | 'layout')[] = ['run', 'forbidden', 'layout']
    const missing = need.filter((n) => !a.sections.includes(n))
    const label = { run: '怎么跑', forbidden: '不许做', layout: '目录结构' }
    rules.push({
      check: meta.id,
      rule: 'agents-covers-basics',
      status: missing.length === 0 ? 'pass' : 'fail',
      weight: 2,
      message:
        missing.length === 0
          ? '入口覆盖：怎么跑 / 不许做 / 目录结构'
          : `入口缺少：${missing.map((m) => label[m]).join('、')}`,
      evidence: a.sections,
    })
  }

  rules.push({
    check: meta.id,
    rule: 'readme-runnable',
    status: facts.readme?.hasRun ? 'pass' : 'fail',
    weight: 2,
    message: facts.readme
      ? facts.readme.hasRun
        ? 'README 写了怎么跑'
        : 'README 没有可执行的运行指令'
      : '没有 README',
    evidence: facts.readme ? [facts.readme.file] : [],
  })

  const failed = rules.filter((r) => r.status === 'fail')
  return { status: failed.length ? 'fail' : 'pass', rules }
}
