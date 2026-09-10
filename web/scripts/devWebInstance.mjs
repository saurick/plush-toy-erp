import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { realpathSync } from 'node:fs'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { promisify } from 'node:util'
import { normalizeAPIOrigin } from '../../scripts/local-runtime-preflight-core.mjs'
import { canListenOnPort } from './localPort.mjs'

export const DEV_WEB_INSTANCE_PATH = '/__dev/api/web-instance'
const execFileAsync = promisify(execFile)

export function webInstanceSignature({
  projectRoot,
  apiOrigin,
  frontendOnly,
  viteArgs,
  customerKey = '',
}) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        root: realpathSync(projectRoot),
        apiOrigin: normalizeAPIOrigin(apiOrigin),
        frontendOnly: Boolean(frontendOnly),
        viteArgs,
        customerKey,
      })
    )
    .digest('hex')
}

export async function readWebInstance(port) {
  try {
    const response = await fetch(
      `http://127.0.0.1:${port}${DEV_WEB_INSTANCE_PATH}`,
      {
        signal: AbortSignal.timeout(1500),
        redirect: 'error',
        headers: { accept: 'application/json' },
      }
    )
    if (
      !response.ok ||
      !response.headers.get('content-type')?.includes('application/json')
    )
      return null
    let body = ''
    for await (const chunk of response.body) {
      body += Buffer.from(chunk).toString('utf8')
      if (body.length > 2048) return null
    }
    const instance = JSON.parse(body)
    return instance.kind === 'plush-web-dev' &&
      Number.isInteger(instance.pid) &&
      instance.pid > 0
      ? instance
      : null
  } catch {
    return null
  }
}

async function runInspection(command, args) {
  return execFileAsync(command, args, {
    encoding: 'utf8',
    timeout: 2000,
    maxBuffer: 8192,
  })
}

export async function inspectWebListeners(port, webRoot) {
  let stdout
  try {
    ;({ stdout } = await runInspection('lsof', [
      '-nP',
      '-a',
      `-iTCP:${port}`,
      '-sTCP:LISTEN',
      '-Fp',
    ]))
  } catch (error) {
    if (error.code === 1 && !error.stdout && !error.stderr) return []
    throw new Error('无法核对端口进程归属；需要可用的 lsof，未停止任何服务')
  }
  const pids = [
    ...new Set(
      stdout
        .split('\n')
        .filter((line) => /^p\d+$/u.test(line))
        .map((line) => Number(line.slice(1)))
    ),
  ]
  if (!pids.length) throw new Error('无法识别端口进程，未停止任何服务')
  const expectedCwd = realpathSync(webRoot)
  return Promise.all(
    pids.map(async (pid) => {
      const [{ stdout: cwdOutput }, { stdout: command }, { stdout: started }] =
        await Promise.all([
          runInspection('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn']),
          runInspection('ps', ['-p', String(pid), '-o', 'command=']),
          runInspection('ps', ['-p', String(pid), '-o', 'lstart=']),
        ])
      const cwd = cwdOutput
        .split('\n')
        .find((line) => line.startsWith('n'))
        ?.slice(1)
      // cwd 相同还不够：同目录内的任意 Node/Python 服务不能被当作 Vite 停掉。
      const viteCommand =
        /^(?:\S*\/)?node\s+(?:--import\s+\S*\/viteParentLifetime\.mjs\s+)?\S*\/(?:vite\/bin\/vite\.js|\.bin\/vite)(?:\s|$)/u.test(
          command.trim()
        )
      return {
        pid,
        cwd,
        command: command.trim(),
        started: started.trim(),
        owned: cwd === expectedCwd && viteCommand && Boolean(started.trim()),
      }
    })
  )
}

export async function stopWebInstance(
  port,
  webRoot,
  {
    inspect = inspectWebListeners,
    kill = (pid) => process.kill(pid, 'SIGTERM'),
    available = canListenOnPort,
    pause = delay,
  } = {}
) {
  const listeners = await inspect(port, webRoot)
  if (!listeners.length) {
    if (await available(port)) return
    throw new Error(`端口 ${port} 仍被占用，无法确认归属，未停止任何服务`)
  }
  if (listeners.some((entry) => !entry.owned)) {
    throw new Error(`端口 ${port} 属于其他程序或工作区，未停止任何服务`)
  }
  const current = await inspect(port, webRoot)
  if (JSON.stringify(current) !== JSON.stringify(listeners)) {
    throw new Error(`端口 ${port} 的占用者发生变化，未停止任何服务`)
  }
  for (const { pid } of listeners) kill(pid)
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (await available(port)) return
    await pause(100)
  }
  throw new Error(`端口 ${port} 尚未释放，请检查原服务终端；未强制结束进程`)
}

export async function prepareWebInstance(
  { port, projectRoot, signature, recoveryMode, restart },
  {
    available = canListenOnPort,
    readInstance = readWebInstance,
    stop = stopWebInstance,
  } = {}
) {
  if (await available(port)) return { reused: false }
  if (restart) {
    await stop(port, path.join(projectRoot, 'web'))
    return { reused: false }
  }
  const instance = await readInstance(port)
  if (
    instance?.signature === signature &&
    instance.recovery === Boolean(recoveryMode)
  ) {
    return { reused: true, pid: instance.pid }
  }
  throw new Error(
    `端口 ${port} 已被占用，现有服务无法确认或启动配置不同。需要重启本工作区前端时执行 pnpm start --restart；临时验证使用 pnpm start --isolated。未停止任何服务`
  )
}
