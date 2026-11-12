/** 最小工具集：YAML 子集解析、文件遍历、路径处理。零依赖。 */
import { readdir, readFile } from 'node:fs/promises'
import { join, basename, extname } from 'node:path'

export const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.nuxt',
  'coverage', 'vendor', '__pycache__', '.venv', 'venv', '.cache',
  'out', 'target', '.turbo', '.pnpm-store', '.vibe',
])

export const CODE_EXT = new Set([
  '.ts', '.tsx', '.js', '.mjs', '.cjs', '.py', '.sh', '.sql',
  '.go', '.rb', '.php', '.java', '.kt', '.vue', '.svelte',
])

export async function walk(dir: string, depth = 0, out: string[] = []): Promise<string[]> {
  if (depth > 8) return out
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    if (e.isSymbolicLink()) continue
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue
      await walk(join(dir, e.name), depth + 1, out)
    } else {
      out.push(join(dir, e.name))
    }
  }
  return out
}

export function rel(root: string, p: string): string {
  return p.slice(root.length).replace(/^[\\/]/, '').replace(/\\/g, '/')
}

export function hasCodeExt(p: string): boolean {
  return CODE_EXT.has(extname(p).toLowerCase())
}

export async function readText(p: string): Promise<string | null> {
  try {
    return await readFile(p, 'utf8')
  } catch {
    return null
  }
}

export async function exists(p: string): Promise<boolean> {
  try {
    await readdir(p)
    return true
  } catch {
    return false
  }
}

export function countLines(text: string): number {
  return text.replace(/\r\n/g, '\n').split('\n').length
}

export function basenameNoExt(p: string): string {
  const b = basename(p)
  const e = extname(b)
  return e ? b.slice(0, -e.length) : b
}

/**
 * 测试与样例代码不算「生产事实」。
 * 测试里的 express 片段、假 env 变量会把判定带偏，必须排除。
 */
export function isTestPath(relPath: string): boolean {
  if (/(^|\/)(tests?|__tests__|spec|fixtures?|mocks?|examples?|samples?)(\/|$)/i.test(relPath)) return true
  if (/\.(test|spec)\.[a-z]+$/i.test(relPath)) return true
  return false
}

export function pct(n: number, d: number): string {
  if (d === 0) return '0%'
  return `${Math.round((n / d) * 100)}%`
}

/**
 * YAML 子集解析器。
 * 支持：注释、嵌套 map、列表（含「列表项是 map」）、字符串/数字/布尔、内联 [a, b]。
 * 不支持锚点、多行字符串、流式 map —— 配置与处方里都不需要。
 */
export function parseYaml(src: string): Record<string, unknown> {
  const lines = src.replace(/\r\n/g, '\n').split('\n')
  let i = 0

  const blank = (s: string) => !s.trim() || s.trim().startsWith('#')
  const indentOf = (s: string) => s.match(/^ */)![0].length
  const next = (from: number) => {
    let k = from
    while (k < lines.length && blank(lines[k])) k++
    return k
  }
  const KEY_RE = /^[A-Za-z_][A-Za-z0-9_-]*$/

  const coerce = (raw: string): unknown => {
    let t = raw.trim()
    // 行尾注释：`risk: yellow   # 说明` —— 引号内的不动
    if (!/^["'].*["']$/.test(t)) {
      const m = /^(.*?)\s+#/.exec(t)
      if (m) t = m[1].trim()
    }
    if (t === '') return ''
    if (t === 'null' || t === '~') return null
    if (t === 'true') return true
    if (t === 'false') return false
    if (/^".*"$/.test(t) || /^'.*'$/.test(t)) return t.slice(1, -1)
    if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t)
    if (/^\[.*\]$/.test(t)) {
      const inner = t.slice(1, -1).trim()
      if (!inner) return []
      return inner.split(',').map((x) => coerce(x))
    }
    return t
  }

  function parseMap(indent: number): Record<string, unknown> {
    const obj: Record<string, unknown> = {}
    for (;;) {
      i = next(i)
      if (i >= lines.length) break
      const line = lines[i]
      if (indentOf(line) !== indent) break
      const t = line.trim()
      if (t.startsWith('- ') || t === '-') break
      const idx = t.indexOf(':')
      if (idx === -1) {
        i++
        continue
      }
      const key = t.slice(0, idx).trim()
      if (!KEY_RE.test(key)) {
        i++
        continue
      }
      const rest = t.slice(idx + 1).trim()
      i++
      if (rest === '') {
        const j = next(i)
        if (j < lines.length && indentOf(lines[j]) > indent) {
          i = j
          obj[key] = parseBlock(indentOf(lines[j]))
        } else {
          obj[key] = null
        }
      } else {
        obj[key] = coerce(rest)
      }
    }
    return obj
  }

  function parseArray(indent: number): unknown[] {
    const arr: unknown[] = []
    for (;;) {
      i = next(i)
      if (i >= lines.length) break
      const line = lines[i]
      if (indentOf(line) !== indent) break
      const t = line.trim()
      if (!(t === '-' || t.startsWith('- '))) break
      const rest = t === '-' ? '' : t.slice(2).trim()
      i++
      if (rest === '') {
        const j = next(i)
        if (j < lines.length && indentOf(lines[j]) > indent) {
          i = j
          arr.push(parseBlock(indentOf(lines[j])))
        } else {
          arr.push(null)
        }
        continue
      }
      const inlineKey = /^([A-Za-z_][A-Za-z0-9_-]*):(\s|$)/.exec(rest)
      if (inlineKey) {
        const obj: Record<string, unknown> = {}
        const key = inlineKey[1]
        const val = rest.slice(inlineKey[0].length).trim()
        obj[key] = val === '' ? null : coerce(val)
        const j = next(i)
        if (j < lines.length && indentOf(lines[j]) > indent) {
          i = j
          Object.assign(obj, parseMap(indentOf(lines[j])))
        }
        arr.push(obj)
      } else {
        arr.push(coerce(rest))
      }
    }
    return arr
  }

  function parseBlock(indent: number): unknown {
    const j = next(i)
    if (j >= lines.length) return null
    if (indentOf(lines[j]) < indent) return null
    const t = lines[j].trim()
    if (t === '-' || t.startsWith('- ')) return parseArray(indentOf(lines[j]))
    return parseMap(indentOf(lines[j]))
  }

  i = next(0)
  if (i >= lines.length) return {}
  return parseBlock(indentOf(lines[i])) as Record<string, unknown>
}
