import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import http from 'node:http'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import test from 'node:test'

const scriptPath = path.join(import.meta.dirname, 'serveStaticApp.mjs')

async function reservePort() {
  const server = net.createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const port = server.address().port
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
  return port
}

function healthPassed(port) {
  return new Promise((resolve) => {
    const request = http.get(
      {
        hostname: '127.0.0.1',
        path: '/healthz',
        port,
        timeout: 250,
      },
      (response) => {
        response.resume()
        response.once('end', () => resolve(response.statusCode === 200))
      }
    )
    request.once('timeout', () => {
      request.destroy()
      resolve(false)
    })
    request.once('error', () => resolve(false))
  })
}

async function waitForHealth(port) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await healthPassed(port)) return
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  throw new Error('static server did not become healthy')
}

test(
  'production static server exits promptly and cleanly on SIGTERM',
  { timeout: 10_000 },
  async (t) => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'serve-static-app-'))
    const port = await reservePort()
    await writeFile(
      path.join(root, 'index.html'),
      '<!doctype html><title>ok</title>'
    )
    const child = spawn(process.execPath, [scriptPath], {
      env: {
        ...process.env,
        API_ORIGIN: '',
        HOST: '127.0.0.1',
        PORT: String(port),
        STATIC_ROOT: root,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8')
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8')
    })
    const completion = new Promise((resolve, reject) => {
      child.once('error', reject)
      child.once('close', (code, signal) => resolve({ code, signal }))
    })
    t.after(async () => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL')
        await completion.catch(() => {})
      }
      await rm(root, { recursive: true, force: true })
    })

    await waitForHealth(port)
    const startedAt = performance.now()
    assert.equal(child.kill('SIGTERM'), true)
    const result = await completion
    const durationMs = performance.now() - startedAt

    assert.deepEqual(result, { code: 0, signal: null }, stderr)
    assert(durationMs < 3_000, `SIGTERM shutdown took ${durationMs}ms`)
    assert.match(stdout, /shutdown signal=SIGTERM status=complete/u)
    assert.equal(stderr, '')
  }
)
