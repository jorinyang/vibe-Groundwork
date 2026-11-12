/** Facts · 环境变量契约：声明了什么、代码用了什么、启动时校验没有。 */
import { walk, readText, rel, hasCodeExt, isTestPath } from '../core/util.ts'

export type EnvFacts = {
  exampleFile: string | null
  declared: string[]
  used: { name: string; file: string }[]
  missing: string[]
  unused: string[]
  hasStartupValidation: boolean
  validationEvidence: string[]
}

/** process.env.X / process.env["X"] / os.environ["X"] / os.getenv("X") */
const USAGE_PATTERNS = [
  /process\.env\.([A-Z][A-Z0-9_]{1,})/g,
  /process\.env\[\s*["'`]([A-Z][A-Z0-9_]{1,})["'`]\s*\]/g,
  /os\.environ\[\s*["']([A-Z][A-Z0-9_]{1,})["']\s*\]/g,
  /os\.environ\.get\(\s*["']([A-Z][A-Z0-9_]{1,})["']/g,
  /os\.getenv\(\s*["']([A-Z][A-Z0-9_]{1,})["']/g,
  /import\.meta\.env\.([A-Z][A-Z0-9_]{1,})/g,
]

const EXAMPLE_CANDIDATES = ['.env.example', '.env.sample', '.env.template', 'env.example']
const EXAMPLE_DIRS = ['', 'deploy/', 'ops/', 'infra/', 'docker/', 'config/', 'conf/']

/**
 * 运维脚本里的变量不属于「应用环境变量契约」。
 * 把它们算进来会让契约永远对不上，是典型误报来源。
 */
const TOOLING_DIR_RE = /^(\.?deploy[a-z]*|scripts?|tools?|ops|bin|ci|\.github)\//i
const EXAMPLE_LINE = /^\s*([A-Z][A-Z0-9_]{1,})\s*=/gm
const VALIDATION_HINTS =
  /(requiredEnv|missing\s*[:=]|Missing required env|必须(配置|设置)?环境变量|envSchema|zod.*process\.env|throw new Error\([^)]*env)/i

export async function collectEnvFacts(root: string, exampleName = '.env.example'): Promise<EnvFacts> {
  // 1) 声明的变量
  let exampleFile: string | null = null
  let declared: string[] = []
  const candidates = [exampleName, ...EXAMPLE_CANDIDATES]
  outer: for (const dir of EXAMPLE_DIRS) {
    for (const name of candidates) {
      const relPath = `${dir}${name}`
      const txt = await readText(`${root}/${relPath}`)
      if (!txt) continue
      exampleFile = relPath
      const names: string[] = []
      let m: RegExpExecArray | null
      EXAMPLE_LINE.lastIndex = 0
      while ((m = EXAMPLE_LINE.exec(txt)) !== null) names.push(m[1])
      declared = [...new Set(names)]
      break outer
    }
  }

  // 2) 代码里用到的变量
  const files = (await walk(root)).filter(hasCodeExt)
  const usedMap = new Map<string, string>()
  let hasStartupValidation = false
  const validationEvidence: string[] = []

  for (const f of files) {
    const r = rel(root, f)
    if (TOOLING_DIR_RE.test(r) || isTestPath(r)) continue
    const txt = await readText(f)
    if (!txt) continue
    for (const pat of USAGE_PATTERNS) {
      pat.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = pat.exec(txt)) !== null) {
        const name = m[1]
        if (!usedMap.has(name)) usedMap.set(name, r)
      }
    }
    if (VALIDATION_HINTS.test(txt) && /env/i.test(r + txt.slice(0, 200))) {
      if (validationEvidence.length < 3) validationEvidence.push(r)
      hasStartupValidation = true
    }
  }

  const used = [...usedMap.entries()].map(([name, file]) => ({ name, file }))
  const declaredSet = new Set(declared)
  const usedNames = new Set(used.map((u) => u.name))

  return {
    exampleFile,
    declared,
    used,
    missing: used.filter((u) => !declaredSet.has(u.name)).map((u) => u.name),
    unused: declared.filter((d) => !usedNames.has(d)),
    hasStartupValidation,
    validationEvidence,
  }
}
