#!/usr/bin/env node
/**
 * 判定器的正反测试。
 *
 * 每个用例都是一个临时生成的最小项目，断言「该失败的必须失败、该通过的必须通过」。
 * 只测静态规则（--no-behavioral），行为判定另有专门的 boot 场景。
 */
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { runProject } from '../src/core/runner.ts'

const ROOT = join(tmpdir(), 'vibe-groundwork-tests')

function files(spec) {
  return spec
}

const CASES = [
  {
    name: 'good · 六项静态规则基本到位',
    files: {
      'AGENTS.md': `# AGENTS.md

## 这个项目是什么
node 项目

## 怎么跑
\`\`\`
node app.mjs
\`\`\`

## 目录结构
| 路径 | 职责 |
|---|---|
| app.mjs | 入口 |

## 不许做
- 不许提交 .env
`,
      '.env.example': 'PORT=\nDB_PATH=\n',
      'README.md': '# good\n\n```\nnode app.mjs\n```\n',
      'package.json': JSON.stringify({ name: 'good', scripts: {} }, null, 2),
      'app.mjs': `import http from 'node:http'
const need = ['PORT', 'DB_PATH']
for (const k of need) { if (!process.env[k]) throw new Error('missing required env ' + k) }
const routes = ['/health', '/api/users']
const server = http.createServer((req, res) => {
  const pathname = req.url.split('?')[0]
  if (pathname === '/health') { res.end(JSON.stringify({ status: 'ok', checks: { db: 'up' } })); return }
  if (pathname.startsWith('/api/')) { res.statusCode = 401; res.end('{}'); return }
  res.statusCode = 404; res.end('{}')
})
server.listen(process.env.PORT ?? 0)
`,
      'db/migrations.ts': `export const migrations = [
  { name: "001_core", sql: "CREATE TABLE a (id TEXT)" },
  { name: "002_more", sql: "ALTER TABLE a ADD COLUMN b TEXT" },
]
`,
    },
    expect: {
      'project-constitution': 'pass',
      'env-contract': 'pass',
      'migration-discipline': 'pass',
    },
  },
  {
    name: 'bad · SPA 兜底吞掉未知路由',
    files: {
      'AGENTS.md': '# A\n\n## 怎么跑\nnpm start\n\n## 目录\n| a | b |\n\n## 不许做\n- x\n',
      'app.mjs': `import express from 'express'
const app = express()
app.get('/health', (req, res) => res.json({ status: 'ok' }))
app.get('*', (req, res) => res.sendFile('index.html'))
`,
    },
    expect: { 'authz-default-deny': 'fail' },
    expectRuleFail: { 'authz-default-deny': 'no-blanket-fallback' },
  },
  {
    name: 'bad · 代码引用变量但无模板',
    files: {
      'AGENTS.md': '# A\n\n## 怎么跑\nnode a.mjs\n\n## 目录\n\n## 不许做\n',
      'a.mjs': 'const p = process.env.SECRET_TOKEN\nconsole.log(p)\n',
    },
    expect: { 'env-contract': 'fail' },
    expectRuleFail: { 'env-contract': 'example-exists' },
  },
  {
    name: 'bad · 迁移声明顺序与序号相反',
    files: {
      'AGENTS.md': '# A\n\n## 怎么跑\nnode a.mjs\n\n## 目录\n\n## 不许做\n',
      'a.mjs': 'console.log(1)\n',
      'db/migrations.ts': `export const migrations = [
  { name: "002_second", sql: "ALTER TABLE t ADD c TEXT" },
  { name: "001_core", sql: "CREATE TABLE t (id TEXT)" },
]
`,
    },
    expect: { 'migration-discipline': 'fail' },
    expectRuleFail: { 'migration-discipline': 'monotonic-order' },
  },
  {
    name: 'na · 纯静态站，不碰数据库',
    files: {
      'AGENTS.md': '# A\n\n## 怎么跑\nopen index.html\n\n## 目录\n\n## 不许做\n',
      'index.html': '<h1>hi</h1>\n',
    },
    expect: { 'migration-discipline': 'na' },
  },
]

async function materialize(dir, spec) {
  for (const [rel, content] of Object.entries(spec)) {
    const full = join(dir, rel)
    await mkdir(join(full, '..'), { recursive: true })
    await writeFile(full, content, 'utf8')
  }
}

let failed = 0
console.log('vibe-groundwork 判定测试\n')

for (const c of CASES) {
  const dir = join(ROOT, c.name.replace(/[^\w\u4e00-\u9fa5]+/g, '_'))
  await rm(dir, { recursive: true, force: true })
  await mkdir(dir, { recursive: true })
  await materialize(dir, c.files)

  const result = await runProject({ root: dir, skipBehavioral: true, profile: 'L3' })
  const byId = new Map(result.outcomes.map((o) => [o.meta.id, o]))
  const problems = []

  for (const [id, want] of Object.entries(c.expect)) {
    const got = byId.get(id)
    if (!got) {
      problems.push(`${id}: 没有跑这项`)
      continue
    }
    if (got.status !== want) problems.push(`${id}: 期望 ${want}，实际 ${got.status}`)
  }

  for (const [id, rule] of Object.entries(c.expectRuleFail ?? {})) {
    const got = byId.get(id)
    const hit = got?.rules.find((r) => r.rule === rule && r.status === 'fail')
    if (!hit) problems.push(`${id}.${rule}: 期望失败，实际没有`)
  }

  if (problems.length === 0) {
    console.log(`  ok   ${c.name}`)
  } else {
    failed++
    console.log(`  FAIL ${c.name}`)
    for (const p of problems) console.log(`       - ${p}`)
  }
  await rm(dir, { recursive: true, force: true })
}

console.log('')
console.log(failed === 0 ? `全部通过（${CASES.length} 个用例）` : `${failed} 个用例失败`)
process.exit(failed === 0 ? 0 : 1)
