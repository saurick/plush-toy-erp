import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import process from 'node:process'

import { appDefinitions } from '../src/erp/config/appRegistry.mjs'

const webDir = fileURLToPath(new URL('..', import.meta.url))
const webDirWithoutTrailingSlash = webDir.replace(/\/$/, '')
const mobileApps = appDefinitions.filter((app) => app.kind === 'mobile')
const children = []
let shuttingDown = false

function writeChunk(stream, prefix, chunk) {
  const text = String(chunk)
  const lines = text.split(/\r?\n/)
  lines.forEach((line, index) => {
    if (!line && index === lines.length - 1) {
      return
    }
    stream.write(`${prefix} ${line}\n`)
  })
}

function shutdown(exitCode = 0) {
  if (shuttingDown) {
    return
  }

  shuttingDown = true
  children.forEach((child) => {
    if (!child.killed) {
      child.kill('SIGTERM')
    }
  })

  setTimeout(() => process.exit(exitCode), 300).unref()
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function run(command, args) {
  return spawnSync(command, args, {
    encoding: 'utf8',
  })
}

function getListeningPids(port) {
  const result = run('lsof', ['-nP', `-tiTCP:${port}`, '-sTCP:LISTEN'])
  if (result.error) {
    throw result.error
  }

  return [...new Set(result.stdout.trim().split(/\s+/).filter(Boolean))]
}

function getProcessCommand(pid) {
  const result = run('ps', ['-p', pid, '-o', 'command='])
  if (result.error || result.status !== 0) {
    return ''
  }

  return result.stdout.trim()
}

function isProjectMobileViteProcess(command) {
  return (
    command.includes(`${webDirWithoutTrailingSlash}/node_modules/.bin/vite`) &&
    /vite\.mobile-[\w-]+\.config\.mjs/.test(command)
  )
}

function killProcess(pid, signal) {
  try {
    process.kill(Number(pid), signal)
  } catch (error) {
    if (error.code !== 'ESRCH') {
      throw error
    }
  }
}

function getProjectMobileViteProcesses() {
  const result = run('ps', ['ax', '-o', 'pid=', '-o', 'command='])
  if (result.error) {
    throw result.error
  }

  return result.stdout
    .split(/\r?\n/)
    .map((line) => {
      const match = line.match(/^\s*(\d+)\s+(.*)$/)
      if (!match) {
        return null
      }

      return {
        pid: match[1],
        command: match[2],
      }
    })
    .filter((item) => item && isProjectMobileViteProcess(item.command))
}

function getPortUsage() {
  const usage = []

  mobileApps.forEach((app) => {
    getListeningPids(app.port).forEach((pid) => {
      usage.push({
        app,
        pid,
        command: getProcessCommand(pid),
      })
    })
  })

  return usage
}

async function stopProjectMobileViteProcesses() {
  let targets
  try {
    targets = getProjectMobileViteProcesses()
  } catch (error) {
    console.warn(
      `无法检查旧的本项目移动端 Vite 进程：${error.message || String(error)}。将继续检查固定端口占用。`
    )
    return
  }

  if (targets.length === 0) {
    return
  }

  console.log('检测到旧的本项目移动端 Vite 进程，正在停止后重新启动：')
  targets.forEach((item) => {
    console.log(`- pid=${item.pid} ${item.command}`)
    killProcess(item.pid, 'SIGTERM')
  })

  for (let index = 0; index < 20; index += 1) {
    await sleep(100)
    if (getProjectMobileViteProcesses().length === 0) {
      return
    }
  }

  getProjectMobileViteProcesses().forEach((item) => {
    console.warn(`pid=${item.pid} 未及时退出，继续强制停止。`)
    killProcess(item.pid, 'SIGKILL')
  })

  await sleep(300)
}

async function releaseMobilePorts() {
  await stopProjectMobileViteProcesses()

  let remainingUsage
  try {
    remainingUsage = getPortUsage()
  } catch (error) {
    console.warn(
      `无法检查移动端固定端口占用：${error.message || String(error)}。将直接启动，若端口被占用会由 Vite 报错。`
    )
    return
  }

  if (remainingUsage.length === 0) {
    return
  }

  console.error('移动端固定端口仍被占用，已停止启动：')
  remainingUsage.forEach((item) => {
    console.error(
      `- ${item.app.shortTitle} ${item.app.port}: pid=${item.pid} ${item.command || '未知进程'}`
    )
  })
  process.exit(1)
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

await releaseMobilePorts()

console.log('已启动角色移动端聚合脚本，按 Ctrl+C 可一起停止。')
mobileApps.forEach((app) => {
  console.log(`- ${app.shortTitle}: http://localhost:${app.port}`)

  const scriptName = app.command.replace(/^pnpm\s+/, '')
  const prefix = `[${app.port} ${app.shortTitle}]`
  const child = spawn('pnpm', [scriptName], {
    cwd: webDir,
    env: {
      ...process.env,
      BROWSER: 'none',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  child.stdout.on('data', (chunk) => {
    writeChunk(process.stdout, prefix, chunk)
  })
  child.stderr.on('data', (chunk) => {
    writeChunk(process.stderr, prefix, chunk)
  })

  child.on('exit', (code, signal) => {
    if (shuttingDown) {
      return
    }
    if (code === 0 || signal === 'SIGTERM') {
      return
    }

    console.error(
      `${prefix} 进程异常退出，code=${code ?? 'null'} signal=${signal ?? 'null'}`
    )
    shutdown(code || 1)
  })

  children.push(child)
})
