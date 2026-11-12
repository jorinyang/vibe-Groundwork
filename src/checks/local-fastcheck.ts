/** Check · 本地快检：项目自己有没有质量闸门，且这个闸门是绿的。 */
import type { CheckContext, CheckImpl } from '../core/context.ts'
import type { Finding, Status } from '../core/types.ts'
import { exists } from '../core/util.ts'
import { join } from 'node:path'

export const meta: CheckImpl['meta'] = {
  id: 'local-fastcheck',
  title: '本地快检',
  levels: ['L2', 'L3'],
  rigor: 'behavioral',
  weight: 2,
  risk: 'green',
}

export async function run(ctx: CheckContext): Promise<{ status: Status; rules: Finding[] }> {
  const rules: Finding[] = []
  const cmds = ctx.config.fastcheck ?? []

  if (cmds.length === 0) {
    rules.push({
      check: meta.id,
      rule: 'has-fastcheck',
      status: 'fail',
      weight: 3,
      message: '没有配置任何本地快检命令（lint / typecheck），改动无法在本地被挡住',
      evidence: ['在 .vibe/config.yaml 的 fastcheck 里配置'],
    })
    return { status: 'fail', rules }
  }

  rules.push({
    check: meta.id,
    rule: 'has-fastcheck',
    status: 'pass',
    weight: 2,
    message: `配置了 ${cmds.length} 条快检命令`,
    evidence: cmds,
  })

  // 依赖没装就跑命令，必然是「命令找不到」——这不是项目的问题，是不能判定
  const needsNodeDeps = cmds.some((c) => /\b(npm|pnpm|yarn|npx)\b/.test(c))
  if (needsNodeDeps && !(await exists(join(ctx.root, 'node_modules')))) {
    rules.push({
      check: meta.id,
      rule: 'deps-installed',
      status: 'na',
      weight: 0,
      naKind: 'not-configured',
      message: '未安装依赖（无 node_modules），跳过执行。先 `npm ci` 再跑本项',
      evidence: ['node_modules 不存在'],
      howToEnable: '在项目根目录执行 `npm ci`（或 pnpm i / yarn），然后重跑本检查',
    })
    return { status: 'na', rules }
  }

  let failed = false
  for (const cmd of cmds) {
    const res = await ctx.probe.exec(cmd, ctx.root)
    const ok = res.code === 0

    // 区分「闸门跑了但失败」和「闸门根本跑不起来」。
    // 后者是环境/依赖问题，判 N/A —— 判失败就是误报。
    //
    // Windows 中文环境下，cmd 的「命令不存在」提示是 GBK 字节被解成乱码，
    // 靠英文关键字抓不到，所以补一条：输出很短且几乎全是替换字符 → 视为跑不起来。
    const garbled = (res.output.match(/\uFFFD/g) ?? []).length
    const looksLikeMissingBinary =
      garbled >= 2 && res.output.length < 500 && res.code !== 0
    const cannotRun =
      /not recognized|不是内部或外部命令|command not found|Cannot find module|MODULE_NOT_FOUND|No such file or directory/i.test(
        res.output,
      ) || looksLikeMissingBinary
    if (cannotRun) {
      rules.push({
        check: meta.id,
        rule: 'toolchain-available',
        status: 'na',
        weight: 0,
        naKind: 'not-configured',
        message: `命令跑不起来（工具链缺失），跳过：「${cmd}」`,
        evidence: res.output.slice(-300).split('\n').slice(-4),
        howToEnable: '先完成依赖安装（如 `npm ci`），确认命令里用到的工具已装好',
      })
      continue
    }

    if (!ok) failed = true
    rules.push({
      check: meta.id,
      rule: 'fastcheck-executes',
      status: ok ? 'pass' : 'fail',
      weight: 3,
      message: ok
        ? `通过：${cmd}（${Math.round(res.durationMs / 100) / 10}s）`
        : `失败：${cmd}（退出码 ${res.code}）`,
      evidence: ok ? [] : res.output.slice(-600).split('\n').slice(-8),
    })
  }

  if (rules.some((r) => r.rule === 'toolchain-available') && !failed) {
    return { status: 'na', rules }
  }
  return { status: failed ? 'fail' : 'pass', rules }
}
