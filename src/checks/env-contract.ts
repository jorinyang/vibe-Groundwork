/** Check · 环境变量契约：声明的和用到的对不对得上，启动时会不会炸。 */
import type { CheckContext } from '../core/context.ts'
import type { CheckImpl } from '../core/context.ts'
import type { Finding, Status } from '../core/types.ts'

export const meta: CheckImpl['meta'] = {
  id: 'env-contract',
  title: '环境变量契约',
  levels: ['L1', 'L2', 'L3'],
  rigor: 'behavioral',
  weight: 2,
  risk: 'green',
}

export async function run(ctx: CheckContext): Promise<{ status: Status; rules: Finding[] }> {
  const f = ctx.facts.env
  const rules: Finding[] = []

  // 根本不读环境变量的项目，不该被要求有模板
  const usesEnv = f.used.length > 0 || f.declared.length > 0
  if (!usesEnv) {
    rules.push({
      check: meta.id,
      rule: 'na-no-env',
      status: 'na',
      weight: 0,
      naKind: 'not-applicable',
      message: '项目不读取任何环境变量，本能力不适用',
      evidence: [],
    })
    return { status: 'na', rules }
  }

  rules.push({
    check: meta.id,
    rule: 'example-exists',
    status: f.exampleFile ? 'pass' : 'fail',
    weight: 3,
    message: f.exampleFile
      ? `存在环境变量模板：${f.exampleFile}`
      : '没有 .env.example，别人克隆下来不知道要配哪些变量',
    evidence: f.exampleFile ? [f.exampleFile] : ['.env.example'],
  })

  if (f.exampleFile) {
    // 模板有变量、代码里一个都没识别到 —— 不是通过，是「这个语言的读取方式还不支持」
    if (f.used.length === 0 && f.declared.length > 0) {
      rules.push({
        check: meta.id,
        rule: 'declared-covers-used',
        status: 'na',
        weight: 0,
        naKind: 'not-configured',
        message: `模板声明了 ${f.declared.length} 个变量，但没识别到代码里的读取（该语言的读取方式可能还不在支持范围）`,
        evidence: f.declared.slice(0, 6),
        howToEnable: '当前支持 JS/TS、Python、Go、Ruby、Java、Rust 的常见读取写法；其他语言需要补 Facts 适配器',
      })
    } else {
      rules.push({
        check: meta.id,
        rule: 'declared-covers-used',
        status: f.missing.length === 0 ? 'pass' : 'fail',
        weight: 3,
        message:
          f.missing.length === 0
            ? `代码读取的 ${new Set(f.used.map((u) => u.name)).size} 个变量全部已声明`
            : `有 ${f.missing.length} 个变量被代码读取但没在模板里声明`,
        evidence: f.missing.slice(0, 8).map((n) => {
          const where = f.used.find((u) => u.name === n)?.file
          return where ? `${n}  (${where})` : n
        }),
      })
    }
  }

  rules.push({
    check: meta.id,
    rule: 'startup-validation',
    status: f.hasStartupValidation ? 'pass' : 'fail',
    weight: 2,
    message: f.hasStartupValidation
      ? '存在启动时环境校验'
      : '没有启动时校验，缺变量会在运行时才炸，且报错位置离原因很远',
    evidence: f.validationEvidence,
  })

  // 声明了但没用：只提示，不判失败（可能是给运维留的）
  if (f.unused.length > 0) {
    rules.push({
      check: meta.id,
      rule: 'unused-declared',
      status: 'pass',
      weight: 1,
      message: `有 ${f.unused.length} 个变量声明了但代码里没读到（可能是预留）`,
      evidence: f.unused.slice(0, 8),
    })
  }

  // 行为判定：把声明过的变量全部拿掉，项目应该立刻失败退出
  const clearKeys = f.declared.length ? f.declared : []
  const canProbe = !!ctx.config.start?.command && clearKeys.length > 0
  if (!canProbe) {
    rules.push({
      check: meta.id,
      rule: 'fails-fast-on-missing-env',
      status: 'na',
      weight: 0,
      naKind: 'not-configured',
      message: ctx.config.start?.command
        ? '模板里没有声明任何变量，无法做「缺变量是否快速失败」的验证'
        : '未配置启动命令，无法做行为验证',
      evidence: [],
      howToEnable: [
        '在 .vibe/config.yaml 里补上启动配置，本项会真的删掉变量再启动一次：',
        '  start:',
        '    command: "npm start"',
        '  ready:',
        '    url: "http://127.0.0.1:3000/"',
      ].join('\n'),
    })
  } else {
    // 先跑「缺变量」的那次，此时端口是空的，避免和后面正常启动抢端口
    const res = await ctx.probe.spawnExpectExit({ clearKeys, waitMs: 8000 })
    const portConflict = /EADDRINUSE|address already in use|端口.*占用/i.test(res.log)
    if (portConflict) {
      rules.push({
        check: meta.id,
        rule: 'fails-fast-on-missing-env',
        status: 'na',
        weight: 0,
        naKind: 'not-configured',
        message: '启动时端口被占用，无法判断是「缺变量退出」还是「端口冲突退出」',
        evidence: res.log.slice(-300).split('\n').slice(-4),
        howToEnable: '先停掉占用该端口的进程，或改 .vibe/config.yaml 里的 PORT',
      })
    } else {
      const fastFail = res.exited && res.code !== 0 && res.code !== null
      const stillAlive = !res.exited
      rules.push({
        check: meta.id,
        rule: 'fails-fast-on-missing-env',
        status: fastFail ? 'pass' : 'fail',
        weight: 3,
        message: fastFail
          ? `删掉 ${clearKeys.length} 个声明变量后，项目在 ${Math.round(res.durationMs / 100) / 10}s 内以非零码退出——缺变量会快速失败`
          : stillAlive
            ? `删掉 ${clearKeys.length} 个声明变量后，项目仍然启动成功——环境变量没有启动校验，问题会推迟到运行时才炸`
            : `删掉变量后项目退出码为 ${res.code}（期望非零）`,
        evidence: res.log.slice(-400).split('\n').slice(-6),
      })
    }
  }

  const failed = rules.filter((r) => r.status === 'fail')
  return { status: failed.length ? 'fail' : 'pass', rules }
}
