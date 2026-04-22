import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import process from 'node:process'

import { appDefinitions } from '../src/erp/config/appRegistry.mjs'

const webDir = fileURLToPath(new URL('..', import.meta.url))
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

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

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
