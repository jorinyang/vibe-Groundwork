/** Check · 权限默认拒绝：未注册的路由要 404，受保护的路由要 401。 */
import type { CheckContext, CheckImpl } from '../core/context.ts'
import type { Finding, Status } from '../core/types.ts'

export const meta: CheckImpl['meta'] = {
  id: 'authz-default-deny',
  title: '权限默认拒绝',
  levels: ['L3'],
  rigor: 'adversarial',
  weight: 3,
  risk: 'red',
}

const UNKNOWN_PROBE = '/__vibe_probe_nonexistent__'
const AUTH_CODES = new Set([401, 403])

export async function run(ctx: CheckContext): Promise<{ status: Status; rules: Finding[] }> {
  const rules: Finding[] = []
  const rc = ctx.facts.routes

  rules.push({
    check: meta.id,
    rule: 'routes-discovered',
    status: rc.routes.length > 0 ? 'pass' : 'na',
    weight: 2,
    message:
      rc.routes.length > 0
        ? `抽取到 ${rc.routes.length} 条路由（${rc.framework ?? '未知框架'}）`
        : '没有抽取到任何路由，无法判定（可能不是 HTTP 服务）',
    evidence: rc.routes.slice(0, 5).map((r) => `${r.method} ${r.path}`),
  })

  if (rc.routes.length === 0) {
    return { status: 'na', rules }
  }

  rules.push({
    check: meta.id,
    rule: 'auth-mechanism-exists',
    status: rc.guarded > 0 || rc.middleware.length > 0 ? 'pass' : 'fail',
    weight: 2,
    message:
      rc.guarded > 0 || rc.middleware.length > 0
        ? `检测到鉴权/中间件痕迹：${rc.middleware.slice(0, 4).join(', ') || `${rc.guarded} 个文件`}`
        : '没有检测到任何鉴权中间件',
    evidence: rc.middleware.slice(0, 6),
  })

  rules.push({
    check: meta.id,
    rule: 'no-blanket-fallback',
    status: rc.hasSpaFallback ? 'fail' : 'pass',
    weight: 3,
    message: rc.hasSpaFallback
      ? '检测到 SPA 兜底路由（* → index.html），未知 API 路径会返回 200 而不是 404，前端拿到 HTML 当 JSON 解析'
      : '没有 SPA 通配兜底，未知路径不会被吞成 200',
    evidence: rc.hasSpaFallback ? ['通配路由兜底到 index.html'] : [],
  })

  const boot = await ctx.probe.ensureBoot()
  if (!boot.ok) {
    rules.push({
      check: meta.id,
      rule: 'behavioral-probe',
      status: 'na',
      weight: 0,
      message: `无法启动项目，跳过越权探针：${boot.error ?? '未知原因'}`,
      evidence: [],
    })
    const failedStatic = rules.filter((r) => r.status === 'fail')
    return { status: failedStatic.length ? 'fail' : 'na', rules }
  }

  try {
    // 探针 1：未知路由必须 404，不能是 200
    const unknown = await ctx.probe.http(UNKNOWN_PROBE)
    const unknownOk = unknown.status === 404
    rules.push({
      check: meta.id,
      rule: 'unknown-route-404',
      status: unknownOk ? 'pass' : 'fail',
      weight: 3,
      message: unknownOk
        ? `GET ${UNKNOWN_PROBE} → 404`
        : `GET ${UNKNOWN_PROBE} → ${unknown.status}，未知路径没有被默认拒绝`,
      evidence: [unknown.text.slice(0, 160)],
    })

    // 探针 2：受保护路由无凭证必须 401/403
    const target = ctx.config.protectedPath ?? rc.protectedSample
    if (target) {
      const res = await ctx.probe.http(target).catch(() => null)
      if (!res) {
        rules.push({
          check: meta.id,
          rule: 'protected-route-denies-anonymous',
          status: 'na',
          weight: 0,
          message: `受保护路由 ${target} 请求失败，跳过`,
          evidence: [],
        })
      } else {
        const denies = AUTH_CODES.has(res.status)
        rules.push({
          check: meta.id,
          rule: 'protected-route-denies-anonymous',
          status: denies ? 'pass' : 'fail',
          weight: 3,
          message: denies
            ? `无凭证访问 ${target} → ${res.status}，已被拒绝`
            : `无凭证访问 ${target} → ${res.status}，数据可能直接暴露`,
          evidence: [res.text.slice(0, 160)],
        })
      }

      const badToken = await ctx.probe
        .http(target, { headers: { Authorization: 'Bearer vibe-invalid-token' } })
        .catch(() => null)
      if (badToken) {
        const deniesBad = AUTH_CODES.has(badToken.status)
        rules.push({
          check: meta.id,
          rule: 'protected-route-rejects-bad-token',
          status: deniesBad ? 'pass' : 'fail',
          weight: 2,
          message: deniesBad
            ? `伪造凭证访问 ${target} → ${badToken.status}，被拒绝`
            : `伪造凭证访问 ${target} → ${badToken.status}，凭证没有真验证`,
          evidence: [badToken.text.slice(0, 160)],
        })
      }
    }

    const failed = rules.filter((r) => r.status === 'fail')
    return { status: failed.length ? 'fail' : 'pass', rules }
  } finally {
    await boot.stop()
  }
}
