/**
 * Facts 抽取 · 数据迁移
 *
 * 这是四段流水线的第一段：只负责把项目里「和迁移有关的事实」抽出来，
 * 不做任何判断。判断在 checks/ 里，那一段不许碰具体文件。
 */
import { readdir, readFile } from 'node:fs/promises'
import { join, basename, extname } from 'node:path'

export type AdHocScript = { file: string; hasSql: boolean }
export type InCodeRegistry = { file: string; names: string[] }

export type MigrationFacts = {
  root: string
  hasDatabase: boolean
  ddlFiles: string[]
  sqlFileCount: number
  migrationDirs: string[]
  inCodeRegistries: InCodeRegistry[]
  adHocScripts: AdHocScript[]
  migrationNames: string[]
}

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.nuxt',
  'coverage', 'vendor', '__pycache__', '.venv', 'venv', '.cache',
])

const CODE_EXT = new Set([
  '.ts', '.tsx', '.js', '.mjs', '.cjs', '.py', '.sh', '.sql',
  '.go', '.rb', '.php', '.java', '.kt',
])

const DDL_RE = /\b(CREATE\s+TABLE|ALTER\s+TABLE|DROP\s+TABLE|CREATE\s+INDEX)\b/i
/** DDL 只有在数据库执行上下文里才算数，避免把检查器/文档里的 SQL 当建表 */
const SQL_CONTEXT_RE =
  /\b(sqlite3|psql|mysql|mongosh|knex|prisma|sequelize|typeorm|pg|better-sqlite3)\b|\.(exec|query|prepare|all|get|run)\(/i
/** 一次性脚本是否真的动了数据库：DDL、DML，或调用数据库客户端 */
const SQL_TOUCH_RE = new RegExp(
  [
    '\\b(CREATE|ALTER|DROP)\\s+TABLE\\b',
    '\\b(INSERT\\s+INTO|UPDATE\\s+\\w+\\s+SET|DELETE\\s+FROM)\\b',
    '\\b(sqlite3|psql|mysql|mongosh)\\b',
  ].join('|'),
  'i',
)
const SCRIPT_DIR_RE = /^(deploy|deploys|scripts?|tools?|ops|bin)$/i
const ADHOC_NAME_RE = /^(apply|migrate|migration|patch|alter|fix|add|update-schema)[-_.]/i
const MIGRATION_DIR_RE = /^(migrations?|alembic|prisma|db[_-]?migrations?|sql[_-]?migrations?)$/i
const NAME_RE = /name\s*:\s*["'`]([^"'`]{1,80})["'`]/g

/** 递归收集文件，跳过依赖与构建产物。 */
async function walk(dir: string, depth = 0, out: string[] = []): Promise<string[]> {
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

function rel(root: string, p: string): string {
  return p.slice(root.length).replace(/^[\\/]/, '').replace(/\\/g, '/')
}

function hasCodeExt(p: string): boolean {
  return CODE_EXT.has(extname(p).toLowerCase())
}

export async function collectMigrationFacts(root: string): Promise<MigrationFacts> {
  const files = await walk(root)
  const codeFiles = files.filter(hasCodeExt)

  const ddlFiles: string[] = []
  const migrationDirs: string[] = []
  const adHocScripts: AdHocScript[] = []
  const inCodeRegistries: InCodeRegistry[] = []
  const migrationNames: string[] = []
  let sqlFileCount = 0

  for (const f of files) {
    if (basename(f).toLowerCase().endsWith('.sql')) sqlFileCount++
  }

  // 迁移目录：路径里任意一层命中即算（alembic/versions/xxx 的父层是 versions）
  for (const f of files) {
    const parts = rel(root, f).split('/')
    if (parts.length < 2) continue
    const dirs = parts.slice(0, -1)
    const idx = dirs.findIndex((s) => MIGRATION_DIR_RE.test(s))
    if (idx === -1) continue
    const d = dirs.slice(0, idx + 1).join('/')
    if (!migrationDirs.includes(d)) migrationDirs.push(d)
  }

  const isTest = (p: string) =>
    /(^|\/)(tests?|__tests__|spec|fixtures?|mocks?|examples?|samples?)(\/|$)/i.test(p) ||
    /\.(test|spec)\.[a-z]+$/i.test(p)

  for (const f of codeFiles) {
    const r = rel(root, f)
    if (isTest(r)) continue
    let text = ''
    try {
      text = await readFile(f, 'utf8')
    } catch {
      continue
    }

    // 只有「真的在跟数据库打交道」的文件才算出 DDL：
    // 数据库调用、迁移注册表，或执行上下文。否则检查器自己代码里的
    // 正则字面量会被当成建表语句（自伤）。
    const inMigrationModule = /migrations?\s*[:=]/i.test(text)
    if (DDL_RE.test(text) && (SQL_CONTEXT_RE.test(text) || inMigrationModule)) ddlFiles.push(r)

    const dirName = r.split('/').slice(0, -1).pop() ?? ''
    const inScriptDir = SCRIPT_DIR_RE.test(dirName)
    const looksAdHoc = ADHOC_NAME_RE.test(basename(f))

    if (inScriptDir && looksAdHoc) {
      adHocScripts.push({ file: r, hasSql: SQL_TOUCH_RE.test(text) })
    }

    // 代码内迁移注册表：文件名含 migrat，且同时出现 sql 与 name 字段
    const looksRegistry =
      /migrat/i.test(basename(f)) &&
      /sql\s*[:=]/i.test(text) &&
      /name\s*:/.test(text) &&
      (/.sql/.test(text) || /CREATE\s+TABLE/i.test(text))

    if (looksRegistry) {
      const names: string[] = []
      let m: RegExpExecArray | null
      NAME_RE.lastIndex = 0
      while ((m = NAME_RE.exec(text)) !== null) names.push(m[1])
      inCodeRegistries.push({ file: r, names })
      for (const n of names) if (!migrationNames.includes(n)) migrationNames.push(n)
    }
  }

  return {
    root,
    hasDatabase: ddlFiles.length > 0 || sqlFileCount > 0 || migrationDirs.length > 0,
    ddlFiles,
    sqlFileCount,
    migrationDirs,
    inCodeRegistries,
    adHocScripts,
    migrationNames,
  }
}
