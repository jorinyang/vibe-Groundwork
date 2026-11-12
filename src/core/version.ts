/** 版本号唯一来源：读 package.json，避免各处硬编码漂移。 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)))

function read(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, '..', 'package.json'), 'utf8')) as { version?: string }
    return pkg.version ?? '0.0.0'
  } catch {
    return '0.0.0'
  }
}

export const VERSION = read()
