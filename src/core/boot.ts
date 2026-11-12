/** 行为判定的启动器：拉起项目、等就绪、用完关掉。 */
import { spawn } from 'node:child_process'
import type { BootHandle, VibConfig } from './types.ts'

const DEFAULT_READY_TIMEOUT = 20_000

async function waitFor(url: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(1500) })
      if (res.status > 0) return true
    } catch {
      /* 还没起来 */
    }
    await new Promise((r) => setTimeout(r, 400))
  }
  return false
}

/**
 * 启动项目。
 * 起不来不是「判定失败」，是「无法判定」——上层必须报成 na 并给出原因，
 * 绝不允许静默当作通过。
 */
export async function boot(cfg: VibConfig, root: string): Promise<BootHandle> {
  if (!cfg.start?.command) {
    return { ok: false, error: '未配置启动命令（.vibe/config.yaml 的 start.command）', stop: async () => {} }
  }
  const baseUrl = cfg.ready?.url?.replace(/\/$/, '')
  if (!baseUrl) {
    // 没有就绪地址就没法确定「什么时候可以开始探」，硬猜只会产生误报
    return { ok: false, error: '未配置 ready.url（.vibe/config.yaml），无法做行为判定', stop: async () => {} }
  }

  const timeoutMs = cfg.ready?.timeoutMs ?? DEFAULT_READY_TIMEOUT
  const cwd = cfg.start.cwd ? `${root}/${cfg.start.cwd}` : root
  const shell = process.platform === 'win32' ? 'cmd' : 'sh'
  const flag = process.platform === 'win32' ? '/c' : '-c'

  const child = spawn(shell, [flag, cfg.start.command], {
    cwd,
    env: { ...process.env, NODE_ENV: 'test', VIBE_CHECK: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })

  let log = ''
  child.stdout?.on('data', (d) => (log += d.toString()))
  child.stderr?.on('data', (d) => (log += d.toString()))

  const stop = async () => {
    try {
      if (process.platform === 'win32' && child.pid) {
        spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true })
      } else {
        child.kill('SIGTERM')
      }
    } catch {
      /* 忽略清理失败 */
    }
  }

  const ok = await waitFor(baseUrl, timeoutMs)
  if (!ok) {
    const tail = log.slice(-400)
    await stop()
    return {
      ok: false,
      error: `等待 ${baseUrl} 就绪超时（${timeoutMs}ms）${tail ? `；日志尾部：${tail}` : ''}`,
      stop: async () => {},
    }
  }
  return { ok: true, baseUrl, stop }
}
