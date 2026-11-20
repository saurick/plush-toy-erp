import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

export async function probeBrowserSmokeURL(url, { timeoutMs = 3000 } = {}) {
  const startedAt = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      redirect: 'manual',
      signal: controller.signal,
    })
    return {
      ok: response.ok || response.status === 302 || response.status === 304,
      status: response.status,
      elapsedMs: Date.now() - startedAt,
      error: '',
    }
  } catch (error) {
    return {
      ok: false,
      status: 0,
      elapsedMs: Date.now() - startedAt,
      error:
        error?.name === 'AbortError'
          ? 'timeout'
          : String(error?.message || error),
    }
  } finally {
    clearTimeout(timer)
  }
}

export async function writeBrowserSmokeJsonReport(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(`${filePath}.tmp`, `${JSON.stringify(payload, null, 2)}\n`)
  await fs.rename(`${filePath}.tmp`, filePath)
}

export function startBrowserSmokeDevServer({ webDir, port, backendURL, onLog }) {
  const child = spawn(
    'pnpm',
    [
      'exec',
      'vite',
      '--config',
      'vite.config.mjs',
      '--host',
      '127.0.0.1',
      '--port',
      String(port),
      '--strictPort',
    ],
    {
      cwd: webDir,
      env: {
        ...process.env,
        BROWSER: 'none',
        ...(backendURL === undefined ? {} : { API_ORIGIN: backendURL }),
        ERP_VITE_PORT: String(port),
        ERP_VITE_HMR_CLIENT_PORT: String(port),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  )
  child.stdout.on('data', (chunk) => {
    onLog(chunk.toString())
  })
  child.stderr.on('data', (chunk) => {
    onLog(chunk.toString())
  })
  child.on('exit', (code) => {
    if (code !== null && code !== 0) {
      onLog(`\n[vite exited with code ${code}]`)
    }
  })
  return child
}

export async function stopBrowserSmokeDevServer(child) {
  if (!child) return
  if (child.exitCode === null) {
    child.kill('SIGTERM')
    await Promise.race([
      new Promise((resolve) => child.once('exit', resolve)),
      delay(3000),
    ])
  }
  if (child.exitCode === null) {
    child.kill('SIGKILL')
  }
}
