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

function requestServer({ port, pathname, method = 'GET', headers = {}, body }) {
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: pathname,
        method,
        headers,
      },
      (response) => {
        const chunks = []
        response.on('data', (chunk) => chunks.push(chunk))
        response.once('end', () => {
          resolve({
            body: Buffer.concat(chunks).toString('utf8'),
            headers: response.headers,
            statusCode: response.statusCode,
          })
        })
      }
    )
    request.once('error', reject)
    if (body) request.write(body)
    request.end()
  })
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

test(
  'production static server proxies safely and reports backend readiness',
  { timeout: 10_000 },
  async (t) => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'serve-static-app-'))
    const port = await reservePort()
    const backendPort = await reservePort()
    let readinessStatus = 200
    let removedRequestHeader
    await writeFile(
      path.join(root, 'index.html'),
      '<!doctype html><title>ok</title>'
    )

    const backend = http.createServer((request, response) => {
      if (request.url === '/readyz') {
        response.writeHead(readinessStatus)
        response.end(readinessStatus === 200 ? 'ready' : 'not ready')
        return
      }
      if (request.url === '/rpc/echo') {
        removedRequestHeader = request.headers['x-remove-me']
        response.writeHead(201, {
          connection: 'x-remove-response',
          'x-remove-response': 'secret',
          'x-visible': 'yes',
        })
        request.pipe(response)
        return
      }
      if (request.url === '/rpc/slow-upload') {
        request.resume()
        request.once('end', () => {
          response.writeHead(200)
          response.end('uploaded')
        })
        return
      }
      if (request.url === '/templates/slow') {
        return
      }
      response.writeHead(404)
      response.end()
    })
    await new Promise((resolve, reject) => {
      backend.once('error', reject)
      backend.listen(backendPort, '127.0.0.1', resolve)
    })

    const child = spawn(process.execPath, [scriptPath], {
      env: {
        ...process.env,
        API_ORIGIN: `http://127.0.0.1:${backendPort}`,
        HOST: '127.0.0.1',
        PORT: String(port),
        PROXY_TIMEOUT_MS: '100',
        READINESS_TIMEOUT_MS: '2000',
        STATIC_ROOT: root,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const completion = new Promise((resolve, reject) => {
      child.once('error', reject)
      child.once('close', (code, signal) => resolve({ code, signal }))
    })
    t.after(async () => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGTERM')
        await completion.catch(() => {})
      }
      await new Promise((resolve) => backend.close(resolve))
      await rm(root, { recursive: true, force: true })
    })

    await waitForHealth(port)
    assert.equal(
      (await requestServer({ port, pathname: '/readyz' })).statusCode,
      200
    )

    readinessStatus = 503
    assert.equal(
      (await requestServer({ port, pathname: '/readyz' })).statusCode,
      503
    )

    const proxied = await requestServer({
      port,
      pathname: '/rpc/echo',
      method: 'POST',
      headers: {
        connection: 'x-remove-me',
        'content-type': 'text/plain',
        'x-remove-me': 'secret',
      },
      body: 'proxied body',
    })
    assert.equal(proxied.statusCode, 201)
    assert.equal(proxied.body, 'proxied body')
    assert.equal(removedRequestHeader, undefined)
    assert.equal(proxied.headers['x-remove-response'], undefined)
    assert.equal(proxied.headers['x-visible'], 'yes')

    const knownOversized = await requestServer({
      port,
      pathname: '/rpc/echo',
      method: 'POST',
      headers: { 'content-length': String(2 * 1024 * 1024 + 1) },
      body: 'small',
    })
    assert.equal(knownOversized.statusCode, 413)

    const chunkedOversized = await requestServer({
      port,
      pathname: '/rpc/slow-upload',
      method: 'POST',
      body: Buffer.alloc(2 * 1024 * 1024 + 1, 'a'),
    })
    assert.equal(
      chunkedOversized.statusCode,
      413,
      JSON.stringify(chunkedOversized)
    )

    const timedOut = await requestServer({
      port,
      pathname: '/templates/slow',
    })
    assert.equal(timedOut.statusCode, 504)
  }
)
