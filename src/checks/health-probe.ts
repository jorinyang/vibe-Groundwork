/** Check · 健康检查：进程活着 ≠ 依赖可用。 */
import type { CheckContext, CheckImpl } from '../core/context.ts'
import type { Finding, Status } from '../core/types.ts'

export const meta: CheckImpl['meta'] = {
  id: 'health-probe',
  title: '健康检查',
  levels: ['L2', 'L3'],
  rigor: 'behavioral',
  weight: 2,
  risk: 'green',
}

const DEP_KEYS = ['checks', 'dependencies', 'deps', 'db', 'database', 'redis', 'upstream', 'components']

export async function run(ctx: CheckContext): Promise<{ status: Status; rules: Finding[] }> {
  const rules: Finding[] = []
  const candidates = ctx.facts.routes.healthCandidates
  // 推断出来的默认路径不算「已声明」，否则这条永远通过
  const configured = ctx.config.explicitConfig ? ctx.config.healthPath || undefined : undefined
  const path = candidates[0] ?? configured

  // 没有 HTTP 服务的项目（库、静态站、纯脚本）不该被要求健康端点
  if (ctx.facts.routes.routes.length === 0 && !configured) {
    rules.push({
      check: meta.id,
      rule: 'na-no-http-server',
      status: 'na',
      weight: 0,
      naKind: 'not-applicable',
      message: '未发现 HTTP 路由，本能力不适用',
      evidence: [],
    })
    return { status: 'na', rules }
  }

  rules.push({
    check: meta.id,
    rule: 'health-endpoint-declared',
    status: path ? 'pass' : 'fail',
    weight: 2,
    message: path ? `健康端点：${path}` : '没有发现健康检查端点，部署系统无法判断该不该切流量',
    evidence: candidates.length ? candidates : ['期望 /health 或 /healthz'],
  })

  if (!path) return { status: 'fail', rules }

  const boot = await ctx.probe.ensureBoot()
  if (!boot.ok) {
    rules.push({
      check: meta.id,
      rule: 'behavioral-probe',
      status: 'na',
      weight: 0,
      naKind: 'not-configured',
      message: `无法启动项目，跳过健康探针：${boot.error ?? '未知原因'}`,
      evidence: [],
      howToEnable: [
        '在项目根目录的 .vibe/config.yaml 里补上启动与就绪配置：',
        '  start:',
        '    command: "npm start"        # 实际启动命令',
        '    cwd: "apps/api"             # 可选，子目录启动',
        '  ready:',
        '    url: "http://127.0.0.1:3000/api/health"',
        '    timeoutMs: 20000',
        '配好后本能力会真正起服务打请求，不再跳过。',
      ].join('\n'),
    })
    return { status: 'na', rules }
  }

  try {
    const res = await ctx.probe.http(path)
    const healthy = res.status === 200
    rules.push({
      check: meta.id,
      rule: 'health-returns-200',
      status: healthy ? 'pass' : 'fail',
      weight: 2,
      message: healthy ? `GET ${path} → 200` : `GET ${path} → ${res.status}`,
      evidence: [res.text.slice(0, 200)],
    })

    let body: Record<string, unknown> | null = null
    if (res.json && typeof res.json === 'object') body = res.json as Record<string, unknown>

    const hasStatus = !!body && ('status' in body || 'ok' in body || 'healthy' in body)
    rules.push({
      check: meta.id,
      rule: 'health-structured',
      status: hasStatus ? 'pass' : 'fail',
      weight: 2,
      message: hasStatus
        ? '健康响应含状态字段，可被自动化读取'
        : '健康响应没有结构化状态字段，只能靠人看',
      evidence: [body ? Object.keys(body).join(', ') : res.text.slice(0, 120)],
    })

    const depKey = body ? DEP_KEYS.find((k) => k in body) : undefined
    rules.push({
      check: meta.id,
      rule: 'health-distinguishes-deps',
      status: depKey ? 'pass' : 'fail',
      weight: 2,
      message: depKey
        ? `健康响应含依赖信息（${depKey}），能区分「进程活着」和「依赖可用」`
        : '健康响应只有「活着」，挂掉的数据库不会被发现',
      evidence: [],
    })

    const failed = rules.filter((r) => r.status === 'fail')
    return { status: failed.length ? 'fail' : 'pass', rules }
  } finally {
    await boot.stop()
  }
}
