/** Check · 部署纪律：部署是不是一条命令，还是一堆一次性脚本。 */
import type { CheckContext, CheckImpl } from '../core/context.ts'
import type { Finding, Status } from '../core/types.ts'

export const meta: CheckImpl['meta'] = {
  id: 'deploy-discipline',
  title: '部署纪律',
  levels: ['L2', 'L3'],
  rigor: 'static',
  weight: 3,
  risk: 'yellow',
}

/** 一次性脚本数量的容忍线：超过就说明部署没有收敛成一条路径 */
const ONESHOT_LIMIT = 5

export async function run(ctx: CheckContext): Promise<{ status: Status; rules: Finding[] }> {
  const f = ctx.facts.deploy
  const rules: Finding[] = []

  const hasAnyDeploySignal = f.deployDirs.length > 0 || f.entry !== null || f.oneShotScripts.length > 0
  if (!hasAnyDeploySignal) {
    rules.push({
      check: meta.id,
      rule: 'na-no-deploy',
      status: 'na',
      weight: 0,
      naKind: 'not-applicable',
      message: '未发现任何部署痕迹（无部署目录、无部署入口），本能力不适用',
      evidence: [],
    })
    return { status: 'na', rules }
  }

  // 规则 1：存在一条可复现的部署入口
  rules.push({
    check: meta.id,
    rule: 'reproducible-entry',
    status: f.entry ? 'pass' : 'fail',
    weight: 3,
    message: f.entry
      ? `存在部署入口：${f.entry.file}（${f.entry.kind}）`
      : '没有任何部署入口：既没有 Dockerfile / compose，也没有 deploy.sh 或 scripts.deploy',
    evidence: f.entry ? [f.entry.file] : ['Dockerfile', 'docker-compose.yml', 'deploy.sh', 'package.json#scripts.deploy'],
  })

  // 规则 2：一次性脚本不能成灾
  const over = f.oneShotScripts.length - ONESHOT_LIMIT
  rules.push({
    check: meta.id,
    rule: 'no-oneshot-crowd',
    status: f.oneShotScripts.length <= ONESHOT_LIMIT ? 'pass' : 'fail',
    weight: 3,
    message:
      f.oneShotScripts.length <= ONESHOT_LIMIT
        ? `一次性脚本 ${f.oneShotScripts.length} 个，在容忍线（${ONESHOT_LIMIT}）以内`
        : `一次性脚本 ${f.oneShotScripts.length} 个，超出容忍线 ${over} 个 —— 每个功能加一个脚本，部署路径不可复现`,
    evidence: f.oneShotScripts.slice(0, 8),
  })

  // 规则 3：有回滚路径（容器化部署由平台承担，也算有）
  const rollbackOk = f.rollback.found || f.containerized
  rules.push({
    check: meta.id,
    rule: 'rollback-path',
    status: rollbackOk ? 'pass' : 'fail',
    weight: 2,
    message: rollbackOk
      ? f.rollback.found
        ? `存在回滚说明：${f.rollback.evidence.join(', ')}`
        : '容器化部署，回滚可由镜像 tag 承担'
      : '没有回滚路径：出问题时不知道退回哪个版本',
    evidence: f.rollback.evidence,
  })

  // 规则 4：部署有文档
  rules.push({
    check: meta.id,
    rule: 'deploy-documented',
    status: f.documented ? 'pass' : 'fail',
    weight: 2,
    message: f.documented ? '部署有文档说明' : '没有部署文档，换个人就不知道怎么发版',
    evidence: [],
  })

  const failed = rules.filter((r) => r.status === 'fail')
  return { status: failed.length ? 'fail' : 'pass', rules }
}
