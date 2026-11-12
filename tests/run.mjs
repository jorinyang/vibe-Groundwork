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
    name: 'good-python · Flask 风格项目走同一套判定',
    files: {
      'AGENTS.md': '# PY\n\n## 怎么跑\nuvicorn app.main:app\n\n## 目录\n| app | 代码 |\n\n## 不许做\n- x\n',
      'README.md': '# py\n\n```\nuvicorn app.main:app\n```\n',
      '.env.example': 'DATABASE_URL=\nAPP_SECRET=\n',
      'pyproject.toml': '[project]\nname = "py-demo"\n',
      'app/main.py': `import os
from flask import Flask
app = Flask(__name__)

REQUIRED = ["DATABASE_URL", "APP_SECRET"]
for k in REQUIRED:
    if not os.environ.get(k):
        raise RuntimeError("missing required env " + k)

def authenticate(req):
    return bool(req.headers.get("authorization"))

@app.before_request
def guard():
    pass

@app.get("/health")
def health():
    return {"status": "ok", "checks": {"db": "up"}}

@app.get("/api/users")
def users():
    return []
`,
      'alembic/versions/001_init.py': `from alembic import op
import sqlalchemy as sa

def upgrade():
    op.create_table("t", sa.Column("id", sa.Text))
`,
    },
    expect: {
      'project-constitution': 'pass',
      'env-contract': 'pass',
      'migration-discipline': 'pass',
      // 行为探针跑不了时，整体只能是 na —— 不许把「没验」说成「通过」
      'authz-default-deny': 'na',
    },
    expectRulePass: {
      'authz-default-deny': ['auth-mechanism-exists', 'no-blanket-fallback'],
    },
  },
  {
    name: 'bad · 部署散成一堆一次性脚本',
    files: {
      'AGENTS.md': '# A\n\n## 怎么跑\nnode a.mjs\n\n## 目录\n| a | b |\n\n## 不许做\n- x\n',
      'README.md': '# a\n\n```\nnode a.mjs\n```\n',
      'a.mjs': 'console.log(1)\n',
      'deploy/apply-menu.sh': 'echo deploy\n',
      'deploy/apply-print.sh': 'echo deploy\n',
      'deploy/apply-report.sh': 'echo deploy\n',
      'deploy/apply-import.sh': 'echo deploy\n',
      'deploy/apply-export.sh': 'echo deploy\n',
      'deploy/apply-aging.sh': 'echo deploy\n',
      'deploy/apply-audit.sh': 'echo deploy\n',
    },
    expect: { 'deploy-discipline': 'fail' },
    expectRuleFail: { 'deploy-discipline': 'no-oneshot-crowd' },
  },
  {
    name: 'na · 仓库型项目没有部署痕迹',
    files: {
      'AGENTS.md': '# A\n\n## 怎么跑\nnpm test\n\n## 目录\n| a | b |\n\n## 不许做\n- x\n',
      'README.md': '# a\n\n```\nnpm test\n```\n',
      'src/index.mjs': 'export const a = 1\n',
    },
    expect: { 'deploy-discipline': 'na' },
    expectNaKind: { 'deploy-discipline': 'not-applicable' },
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
    if (got.status !== want) {
      problems.push(`${id}: 期望 ${want}，实际 ${got.status}`)
      for (const r of got.rules.filter((x) => x.status === 'fail')) {
        problems.push(`    ↳ ${r.rule}: ${r.message}`)
      }
    }
  }

  for (const [id, rule] of Object.entries(c.expectRuleFail ?? {})) {
    const got = byId.get(id)
    const hit = got?.rules.find((r) => r.rule === rule && r.status === 'fail')
    if (!hit) problems.push(`${id}.${rule}: 期望失败，实际没有`)
  }

  for (const [id, rules] of Object.entries(c.expectRulePass ?? {})) {
    const got = byId.get(id)
    for (const rule of rules) {
      const hit = got?.rules.find((r) => r.rule === rule)
      if (!hit) problems.push(`${id}.${rule}: 规则没有出现`)
      else if (hit.status === 'fail') problems.push(`${id}.${rule}: 期望通过，实际失败 — ${hit.message}`)
    }
  }

  for (const [id, kind] of Object.entries(c.expectNaKind ?? {})) {
    const got = byId.get(id)
    const naRules = got?.rules.filter((r) => r.status === 'na') ?? []
    const hit = naRules.find((r) => r.naKind === kind)
    if (!hit) {
      problems.push(
        `${id}: 期望有 naKind=${kind} 的规则，实际 ${naRules.map((r) => r.naKind ?? r.rule).join(',') || '无 na'}`,
      )
    }
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
