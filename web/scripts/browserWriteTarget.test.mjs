import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import test from 'node:test'
import { chromium } from 'playwright'
import {
  browserWriteOrigin,
  verifyDatabaseRuntimeIdentity,
  bindBrowserWriteBackend,
} from '../../scripts/qa/browser-write-target.mjs'
import { buildYoyoosunLocalEntryAudit } from './yoyoosunLocalEntryAudit.mjs'
import { assertNoUnexpectedHTTPFailures, closeSession } from '../../scripts/qa/exception-flow-real-write-browser.mjs'

test('forwarding failures remain failures without exposing request headers', async () => {
  let handler
  await bindBrowserWriteBackend({ route: async (_pattern, callback) => { handler = callback } }, 'http://127.0.0.1:8300')
  await assert.rejects(handler({
    request: () => ({ url: () => 'http://127.0.0.1:15201/rpc/workflow' }),
    fetch: async () => { throw new Error('authorization: Bearer synthetic-sensitive-value') },
  }), (error) => {
    assert.equal(error.message, 'browser RPC forwarding failed')
    assert.equal(error.cause, undefined)
    assert.ok(!error.stack.includes('synthetic-sensitive-value'))
    return true
  })
})

test('owned forwarding failures are collected and leave no pending request', async () => {
  let handler
  const failures = []
  const binding = await bindBrowserWriteBackend({ route: async (_pattern, callback) => { handler = callback } }, 'http://127.0.0.1:8300', { onForwardError: (failure) => failures.push({ status: 0, ...failure }) })
  await handler({
    request: () => ({ url: () => 'http://127.0.0.1:15201/rpc/workflow', postDataJSON: () => ({ method: 'get_task_board' }) }),
    fetch: async () => { throw new Error('authorization: Bearer synthetic-sensitive-value') },
    abort: async () => {},
  })
  assert.deepEqual(failures, [{ status: 0, pathname: '/rpc/workflow', rpcMethod: 'get_task_board', reason: 'forwarding_failed' }])
  assert.equal(binding.pending.size, 0)
  assert.throws(() => assertNoUnexpectedHTTPFailures(failures), /forwarding_failed/u)
})

test('real forwarded response drains before exception browser context disposal', async () => {
  let releaseResponse
  let markReceived
  let responseEnded = false
  let disposed = false
  const received = new Promise((resolve) => { markReceived = resolve })
  const readyToRespond = new Promise((resolve) => { releaseResponse = resolve })
  const backend = createServer(async (request, response) => {
    if (request.url.startsWith('/rpc/')) {
      markReceived()
      await readyToRespond
      responseEnded = true
      response.setHeader('content-type', 'application/json')
      response.end('{"result":{"code":0}}')
      return
    }
    response.end('<!doctype html><title>owned RPC lifecycle test</title>')
  })
  await new Promise((resolve) => backend.listen(0, '127.0.0.1', resolve))
  let browser
  try {
    const origin = `http://127.0.0.1:${backend.address().port}`
    browser = await chromium.launch({ headless: true })
    const context = await browser.newContext()
    const binding = await bindBrowserWriteBackend(context, origin)
    const page = await context.newPage()
    page.pendingRPC = binding.pending
    page.rpcResponses = binding.pending
    await page.goto(origin)
    const request = page.evaluate(() => fetch('/rpc/workflow', { method: 'POST', body: '{}' }).then((response) => response.text())).catch(() => null)
    await received
    const closing = closeSession({
      page,
      context: {
        unrouteAll: (options) => context.unrouteAll(options),
        close: async () => {
          assert.equal(responseEnded, true)
          disposed = true
          await context.close()
        },
      },
      httpFailures: [],
    }, 'real pending response')
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(disposed, false)
    releaseResponse()
    await closing
    await request
    assert.equal(disposed, true)
  } finally {
    releaseResponse()
    await browser?.close()
    await new Promise((resolve) => backend.close(resolve))
  }
})

test('browser writes reject remote and unknown database identities before fetching', async () => {
  let calls = 0
  const fetchImpl = () => {
    calls++
    throw new Error('must not fetch')
  }
  for (const url of [
    'https://example.com',
    'http://localhost.example.com',
    'ftp://localhost',
    'http://user:secret@localhost',
  ]) {
    assert.throws(() => browserWriteOrigin(url), /loopback/)
  }
  await assert.rejects(
    verifyDatabaseRuntimeIdentity(
      { backendURL: 'http://localhost', databaseName: 'customer_prod' },
      fetchImpl
    ),
    /database name/
  )
  assert.equal(calls, 0)
})

test('browser RPC uses the verified backend even when the frontend points elsewhere', async () => {
  let frontendWrites = 0
  let backendWrites = 0
  const frontend = createServer((req, res) => {
    if (req.url.startsWith('/rpc')) frontendWrites++
    res.end('<html><body>fixture</body></html>')
  })
  const backend = createServer((req, res) => {
    if (req.url === '/readyz/runtime-identity') {
      res.setHeader('X-ERP-Runtime-Identity-Proof', 'matched-v1')
      res.end('runtime identity matched')
    } else {
      backendWrites++
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ target: 'verified' }))
    }
  })
  await Promise.all(
    [frontend, backend].map(
      (server) =>
        new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    )
  )
  let browser
  try {
    const backendURL = `http://127.0.0.1:${backend.address().port}`
    await verifyDatabaseRuntimeIdentity({
      backendURL,
      databaseName: 'plush_erp_acceptance_target_test_dev',
    })
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()
    await bindBrowserWriteBackend(page, backendURL)
    await page.goto(`http://127.0.0.1:${frontend.address().port}`)
    const value = await page.evaluate(async () =>
      (await fetch('/rpc/admin', { method: 'POST', body: '{}' })).json()
    )
    assert.equal(value.target, 'verified')
    assert.equal(backendWrites, 1)
    assert.equal(frontendWrites, 0)
  } finally {
    await browser?.close()
    await Promise.all(
      [frontend, backend].map(
        (server) => new Promise((resolve) => server.close(resolve))
      )
    )
  }
})

test('external entry audit preserves HTTPS and hostname rather than auditing a local port', async () => {
  const urls = []
  const report = await buildYoyoosunLocalEntryAudit(
    {
      baseURL: 'https://preview.example.com/erp',
      backendHealthURL: 'http://127.0.0.1:8300/healthz',
    },
    {
      fetchText: async (url) => {
        urls.push(url)
        return {
          ok: true,
          status: 200,
          contentType: 'application/javascript',
          body: 'window.__PLUSH_ERP_CUSTOMER_CONFIG__ = { customerKey: "yoyoosun" }',
        }
      },
      fetchHead: async (url) => {
        urls.push(url)
        return { ok: true, status: 200, contentType: 'image/svg+xml' }
      },
      getPortProcess: () => {
        throw new Error('external target has no local process')
      },
    }
  )
  assert.equal(report.ports[0].url, 'https://preview.example.com/erp')
  assert.ok(urls.includes('https://preview.example.com/customer-config.js'))
  assert.ok(urls.every((url) => !url.includes('localhost')))
})
