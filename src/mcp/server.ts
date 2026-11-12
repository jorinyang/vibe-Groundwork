#!/usr/bin/env node
/**
 * vibe MCP server（stdio，换行分隔 JSON-RPC）。
 *
 * 暴露三个工具给 agent：
 *   vibe_scan    扫一个项目，返回结构化结论
 *   vibe_fix     生成修复计划；apply=true 时执行可执行步骤并复扫
 *   vibe_explain 取某项能力的一页说明
 */
import { createInterface } from 'node:readline'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runProject } from '../core/runner.ts'
import { CHECKS } from '../core/registry.ts'
import { applyFixPlan, buildFixPlan, renderPlan, resolveCapDir } from '../prescribe/runner.ts'
import { readText } from '../core/util.ts'
import type { Level, Risk } from '../core/types.ts'

const REPO_ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))))
const CAPS_DIR = join(REPO_ROOT, 'capabilities')
const VERSION = '0.1.0'

type JsonRpc = { jsonrpc: '2.0'; id?: number | string; method: string; params?: Record<string, unknown> }

function send(msg: unknown) {
  process.stdout.write(JSON.stringify(msg) + '\n')
}

const TOOLS = [
  {
    name: 'vibe_scan',
    description:
      '对项目做工程化一致性扫描。返回每项能力的状态、失败规则与证据。用于判断「这个项目还差哪几项工程化」。',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '项目目录绝对路径' },
        profile: { type: 'string', enum: ['L1', 'L2', 'L3'], description: '目标级别，默认 L2' },
        only: { type: 'array', items: { type: 'string' }, description: '只跑指定能力' },
        noBehavioral: { type: 'boolean', description: '跳过需要启动项目的判定' },
      },
      required: ['path'],
    },
  },
  {
    name: 'vibe_fix',
    description:
      '针对失败项生成修复计划。apply=false 只返回计划；apply=true 执行可执行步骤（受 allowRisk 限制）并自动复扫。',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '项目目录绝对路径' },
        apply: { type: 'boolean', description: '是否真的执行，默认 false' },
        allowRisk: {
          type: 'string',
          enum: ['green', 'yellow', 'red'],
          description: '允许自动执行到的最高风险等级，默认 green',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'vibe_explain',
    description: '取某项能力的一页说明：为什么存在、必须达到什么行为、怎么验、常见抄错。',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: '能力 id，例如 authz-default-deny' } },
      required: ['id'],
    },
  },
] as const

async function callTool(name: string, args: Record<string, unknown>) {
  const path = String(args.path ?? '')
  if (name === 'vibe_scan') {
    if (!path) throw new Error('缺少 path')
    const result = await runProject({
      root: path,
      profile: (args.profile as Level) ?? undefined,
      only: Array.isArray(args.only) ? (args.only as string[]) : undefined,
      skipBehavioral: Boolean(args.noBehavioral),
    })
    const payload = {
      target: result.target,
      level: result.config.level,
      summary: result.summary,
      checks: result.outcomes.map((o) => ({
        id: o.meta.id,
        status: o.status,
        rigor: o.meta.rigor,
        risk: o.meta.risk,
        failedRules: o.rules.filter((r) => r.status === 'fail').map((r) => ({
          rule: r.rule,
          message: r.message,
          evidence: r.evidence.slice(0, 5),
        })),
      })),
    }
    return JSON.stringify(payload, null, 2)
  }

  if (name === 'vibe_fix') {
    if (!path) throw new Error('缺少 path')
    const result = await runProject({ root: path, skipBehavioral: true })
    if (result.summary.failed === 0) return '没有需要修复的项。'
    const plan = await buildFixPlan(result, CAPS_DIR, (args.allowRisk as Risk) ?? 'green')
    const report = await applyFixPlan(path, plan, {
      apply: Boolean(args.apply),
      vars: {
        projectName: result.config.name,
        stack: result.config.stack,
        target: result.target,
        date: new Date().toISOString().slice(0, 10),
      },
    })
    const lines = [renderPlan(report)]
    if (report.executed.length) {
      lines.push('', '执行结果：')
      for (const e of report.executed) lines.push(`  ${e.ok ? 'ok  ' : 'skip'} ${e.step}  ${e.note}`)
    }
    if (args.apply) {
      const after = await runProject({ root: path, skipBehavioral: true })
      lines.push('', `复扫：未通过 ${after.summary.failed} 项 / 通过 ${after.summary.passed} 项`)
    }
    return lines.join('\n')
  }

  if (name === 'vibe_explain') {
    const id = String(args.id ?? '')
    const cap = CHECKS.find((c) => c.meta.id === id)
    if (!cap) return `未知能力：${id}。可用：${CHECKS.map((c) => c.meta.id).join(', ')}`
    const dir = await resolveCapDir(CAPS_DIR, id)
    const spec = dir ? await readText(join(dir, 'SPEC.md')) : null
    return spec ?? `（${id} 还没有 SPEC.md）`
  }

  throw new Error(`未知工具：${name}`)
}

async function handle(msg: JsonRpc) {
  switch (msg.method) {
    case 'initialize':
      send({
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'vibe-groundwork', version: VERSION },
        },
      })
      return
    case 'notifications/initialized':
      return
    case 'tools/list':
      send({ jsonrpc: '2.0', id: msg.id, result: { tools: TOOLS } })
      return
    case 'tools/call': {
      const params = (msg.params ?? {}) as Record<string, unknown>
      const name = String(params.name ?? '')
      const args = (params.arguments ?? {}) as Record<string, unknown>
      try {
        const text = await callTool(name, args)
        send({ jsonrpc: '2.0', id: msg.id, result: { content: [{ type: 'text', text }], isError: false } })
      } catch (err) {
        send({
          jsonrpc: '2.0',
          id: msg.id,
          result: { content: [{ type: 'text', text: `执行失败：${(err as Error)?.message ?? err}` }], isError: true },
        })
      }
      return
    }
    case 'ping':
      send({ jsonrpc: '2.0', id: msg.id, result: {} })
      return
    default:
      if (msg.id !== undefined) {
        send({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: `未知方法：${msg.method}` } })
      }
  }
}

const rl = createInterface({ input: process.stdin })
rl.on('line', (line) => {
  const t = line.trim()
  if (!t) return
  let msg: JsonRpc
  try {
    msg = JSON.parse(t)
  } catch {
    return
  }
  handle(msg).catch((err) => {
    if (msg.id !== undefined) {
      send({ jsonrpc: '2.0', id: msg.id, error: { code: -32603, message: String(err?.message ?? err) } })
    }
  })
})
