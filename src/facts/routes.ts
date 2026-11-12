/** Facts · 路由与鉴权：路由有多少、健康端点在哪、有没有兜底 200。 */
import { walk, readText, rel, hasCodeExt, isTestPath } from '../core/util.ts'

export type RouteFacts = {
  framework: string | null
  routes: { method: string; path: string; file: string }[]
  guarded: number
  middleware: string[]
  healthCandidates: string[]
  protectedSample: string | null
  /** SPA 兜底：未知路由返回 200 + index.html，会让「未注册路由返回 404」永远失败 */
  hasSpaFallback: boolean
}

const HTTP_VERBS = 'get|post|put|patch|delete|all|options'
const EXPRESS_RE = new RegExp(
  `\\b(?:app|router|server|fastify|route)\\.(${HTTP_VERBS})\\(\\s*["'\`]([^"'\`]+)["'\`]`,
  'g',
)
const DECORATOR_RE = new RegExp(
  `@(?:app|router|bp|blueprint)\\.(${HTTP_VERBS})\\(\\s*["']([^"']+)["']`,
  'g',
)
const HEALTH_RE = /\/(health|healthz|ready|readiness|live|alive|ping)\b/i
const AUTH_HINT_RE =
  /\b(requireAuth|requireLogin|authenticate|isAuthenticated|authGuard|verifyToken|verifyJwt|jwtMiddleware|ensureAuth|loginRequired)\b/
const MIDDLEWARE_RE = /\b(?:app|router|server)\.use\(\s*([A-Za-z_$][\w$]*)/g
const SPA_FALLBACK_RE =
  /\.get\(\s*["'`]\*["'`]|app\.use\(\s*\(\s*(?:req|request)\s*,\s*(?:res|response)\s*\)\s*=>[^)]*sendFile|sendFile\([^)]*index\.html/
/** 任何文件里出现的健康端点字面量 */
const HEALTH_LITERAL_RE =
  /["'`]([^"'`\s]*\/(?:health|healthz|ready|readiness|live|alive|ping))["'`]/gi
/** 原生 node http / 手写路由：pathname 比对 */
const PLAIN_NODE_RE =
  /(?:pathname|req\.url|request\.url)[^\n]{0,48}?["'`](\/[^"'`\s]{1,80})["'`]/g

export async function collectRouteFacts(root: string): Promise<RouteFacts> {
  const files = (await walk(root)).filter(hasCodeExt)
  const routes: RouteFacts['routes'] = []
  const middleware = new Set<string>()
  const healthCandidates: string[] = []
  let guarded = 0
  let hasSpaFallback = false
  let framework: string | null = null

  for (const f of files) {
    const r = rel(root, f)
    if (isTestPath(r)) continue
    const txt = await readText(f)
    if (!txt) continue

    for (const re of [EXPRESS_RE, DECORATOR_RE]) {
      re.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = re.exec(txt)) !== null) {
        const method = m[1].toUpperCase()
        const path = m[2]
        routes.push({ method, path, file: r })
        if (!framework) {
          if (re === DECORATOR_RE) framework = /fastapi|flask/i.test(txt) ? 'python-web' : 'python-web'
          else framework = /fastify/.test(txt) ? 'fastify' : 'express'
        }
        if (HEALTH_RE.test(path) && !healthCandidates.includes(path)) healthCandidates.push(path)
      }
    }

    MIDDLEWARE_RE.lastIndex = 0
    let mm: RegExpExecArray | null
    while ((mm = MIDDLEWARE_RE.exec(txt)) !== null) middleware.add(mm[1])

    HEALTH_LITERAL_RE.lastIndex = 0
    let hm: RegExpExecArray | null
    while ((hm = HEALTH_LITERAL_RE.exec(txt)) !== null) {
      const p = hm[1]
      if (!healthCandidates.includes(p)) healthCandidates.push(p)
    }

    PLAIN_NODE_RE.lastIndex = 0
    let pm: RegExpExecArray | null
    while ((pm = PLAIN_NODE_RE.exec(txt)) !== null) {
      const p = pm[1]
      if (!routes.some((x) => x.path === p && x.file === r)) {
        routes.push({ method: '*', path: p, file: r })
        framework = framework ?? 'node-http'
      }
    }

    if (AUTH_HINT_RE.test(txt)) guarded++
    if (SPA_FALLBACK_RE.test(txt)) hasSpaFallback = true
  }

  // Next.js App Router：按文件路径推路由
  for (const f of files) {
    const r = rel(root, f)
    const m = /^(?:src\/)?app\/(api\/.*)\/route\.(ts|js)$/.exec(r)
    if (m) {
      const p = '/' + m[1].replace(/\/route\.(ts|js)$/, '')
      routes.push({ method: '*', path: p, file: r })
      framework = framework ?? 'next-app'
      if (HEALTH_RE.test(p) && !healthCandidates.includes(p)) healthCandidates.push(p)
    }
  }

  const protectedSample =
    routes.find((x) => !HEALTH_RE.test(x.path) && /(admin|api|private|manage|user)/i.test(x.path))?.path ??
    routes.find((x) => !HEALTH_RE.test(x.path))?.path ??
    null

  return {
    framework,
    routes,
    guarded,
    middleware: [...middleware],
    healthCandidates,
    protectedSample,
    hasSpaFallback,
  }
}
