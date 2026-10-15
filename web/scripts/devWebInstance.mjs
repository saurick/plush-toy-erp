import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, realpathSync, statSync } from 'node:fs'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import {
  findListenerPids,
  readProcessCwd,
  runProcessInspection as runInspection,
} from '../../scripts/dev-process-inspection.mjs'
import { normalizeAPIOrigin } from '../../scripts/local-runtime-preflight-core.mjs'
import { canListenOnPort } from './localPort.mjs'

export const DEV_WEB_INSTANCE_PATH = '/__dev/api/web-instance'

const RUNTIME_SOURCE_PATHS = [
  'web/dev-server',
  'web/vite.config.mjs',
  'web/vite.shared.mjs',
  'web/scripts/startWebDev.mjs',
  'web/scripts/startYoyoosunDev.mjs',
  'web/scripts/devWebInstance.mjs',
  'web/scripts/localPort.mjs',
  'web/scripts/viteParentLifetime.mjs',
  'web/src/dev-workbench/config/devRuntimeRecovery.mjs',
  'scripts/local-migration.mjs',
  'scripts/local-database-roles.mjs',
  'scripts/local-runtime-bundle.mjs',
  'scripts/local-runtime-build-inputs.mjs',
  'scripts/local-runtime-control.mjs',
  'scripts/local-runtime-start.mjs',
  'scripts/local-runtime-rehearsal.mjs',
  'scripts/local-runtime-console.mjs',
  'scripts/terminal-log.mjs',
  'scripts/local-runtime-preflight.mjs',
  'scripts/local-runtime-preflight-core.mjs',
  'scripts/qa/database-programmability.mjs',
  'scripts/qa/dev-database-migration-operation-store.mjs',
]

export function runtimeSourceSignature(projectRoot) {
  const hash = createHash('sha256')
  const include = (relativePath) => {
    const absolutePath = path.join(projectRoot, relativePath)
    let stats
    try {
      stats = statSync(absolutePath)
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
      hash.update(`${relativePath}\0missing\0`)
      return
    }
    if (stats.isFile()) {
      hash.update(`${relativePath}\0file\0`)
      hash.update(readFileSync(absolutePath))
      hash.update('\0')
      return
    }
    const entries = readdirSync(absolutePath, { withFileTypes: true })
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (
        entry.isDirectory() ||
        (entry.isFile() &&
          /\.(?:mjs|js)$/u.test(entry.name) &&
          !/\.test\.(?:mjs|js)$/u.test(entry.name))
      ) {
        include(path.join(relativePath, entry.name))
      }
    }
  }
  for (const source of RUNTIME_SOURCE_PATHS) include(source)
  return hash.digest('hex')
}

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
        // DEV plugins are loaded in Node and do not receive page HMR updates.
        runtimeSource: runtimeSourceSignature(projectRoot),
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
    ) {
      return null
    }
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

export async function inspectWebListeners(port, webRoot) {
  const pids = await findListenerPids(port)
  if (!pids.length) return []
  const expectedCwd = realpathSync(webRoot)
  return Promise.all(
    pids.map(async (pid) => {
      const [cwd, { stdout: command }, { stdout: started }] = await Promise.all(
        [
          readProcessCwd(pid),
          runInspection('ps', ['-p', String(pid), '-o', 'command=']),
          runInspection('ps', ['-p', String(pid), '-o', 'lstart=']),
        ]
      )
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
  {
    port,
    projectRoot,
    signature,
    recoveryMode,
    restart,
    replaceStale = false,
    restartCommand = 'pnpm start --local --restart',
  },
  {
    available = canListenOnPort,
    readInstance = readWebInstance,
    stop = stopWebInstance,
    writeLine = (line) => process.stdout.write(`${line}\n`),
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
  if (replaceStale) {
    await stop(port, path.join(projectRoot, 'web'))
    writeLine(
      `[start-web] 已停止本工作区旧前端，正在用当前配置重新启动（端口 ${port}）`
    )
    return { reused: false }
  }
  throw new Error(
    `端口 ${port} 已被占用，现有服务无法确认、启动配置不同或开发服务代码已更新。需要重新加载本工作区前端时执行 ${restartCommand}。未停止任何服务`
  )
}
