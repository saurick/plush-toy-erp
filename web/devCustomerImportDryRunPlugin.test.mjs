import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import test from 'node:test'

import {
  buildReleaseReadinessPaths,
  createDevCustomerImportDryRunPlugin,
  listReleaseBatches,
} from './devCustomerImportDryRunPlugin.mjs'

function collectHandlers(options = {}) {
  const handlers = new Map()
  createDevCustomerImportDryRunPlugin(options).configureServer({
    middlewares: {
      use(route, handler) {
        handlers.set(route, handler)
      },
    },
  })
  return handlers
}

function invoke(handler, { method = 'GET', url = '/', body } = {}) {
  return new Promise((resolve, reject) => {
    const req = Readable.from(
      body === undefined ? [] : [Buffer.from(JSON.stringify(body))]
    )
    req.method = method
    req.url = url
    req.on('error', reject)
    const headers = {}
    const res = {
      statusCode: 200,
      setHeader(name, value) {
        headers[name.toLowerCase()] = value
      },
      end(raw = '') {
        resolve({
          statusCode: res.statusCode,
          headers,
          body: raw ? JSON.parse(raw) : null,
        })
      },
    }
    Promise.resolve(handler(req, res)).catch(reject)
  })
}

test('release readiness paths bind one explicit registered batch', () => {
  assert.deepEqual(buildReleaseReadinessPaths('yoyoosun', '2026-07-11'), {
    releaseBatch: '2026-07-11',
    evidenceDir: path.join(
      'deployments',
      'yoyoosun',
      'evidence',
      'releases',
      '2026-07-11'
    ),
    manifestPath: path.join(
      'output',
      'customers',
      'yoyoosun',
      'customer-config-runtime-manifest.ui-release.2026-07-11.json'
    ),
  })
  assert.throws(
    () => buildReleaseReadinessPaths('yoyoosun', '../2026-07-11'),
    /Invalid release batch/
  )
  assert.throws(
    () => buildReleaseReadinessPaths('yoyoosun', ''),
    /Invalid release batch/
  )
})

test('release batch listing returns only direct date directories, newest first', async () => {
  const projectRoot = await mkdtemp(
    path.join(os.tmpdir(), 'plush-release-batches-')
  )
  const releaseRoot = path.join(
    projectRoot,
    'deployments',
    'yoyoosun',
    'evidence',
    'releases'
  )
  try {
    await mkdir(path.join(releaseRoot, '2026-07-03'), { recursive: true })
    await mkdir(path.join(releaseRoot, '2026-07-11'))
    await mkdir(path.join(releaseRoot, 'latest'))
    await writeFile(path.join(releaseRoot, '2026-07-12'), 'not a directory')
    assert.deepEqual(await listReleaseBatches(projectRoot, 'yoyoosun'), [
      '2026-07-11',
      '2026-07-03',
    ])
  } finally {
    await rm(projectRoot, { recursive: true, force: true })
  }
})

test('release batch API rejects unsupported customers and returns registered batches', async () => {
  const handlers = collectHandlers({
    projectRoot: '/workspace',
    releaseBatchLister: async (_root, customerKey) => {
      assert.equal(customerKey, 'yoyoosun')
      return ['2026-07-11', '2026-07-03']
    },
  })
  const handler = handlers.get('/__dev/api/customer-config/release-batches')

  const unsupported = await invoke(handler, {
    url: '/?customerKey=unknown',
  })
  assert.equal(unsupported.statusCode, 400)

  const response = await invoke(handler, {
    url: '/?customerKey=yoyoosun',
  })
  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.body.batches, ['2026-07-11', '2026-07-03'])
})

test('release readiness API requires a registered batch and forwards the exact value', async () => {
  const calls = []
  const handlers = collectHandlers({
    projectRoot: '/workspace',
    releaseBatchLister: async () => ['2026-07-11'],
    releaseReadinessRunner: async (projectRoot, customerKey, releaseBatch) => {
      calls.push({ projectRoot, customerKey, releaseBatch })
      return {
        status: 'ready',
        customerKey,
        releaseBatch,
        evidenceDir: `deployments/${customerKey}/evidence/releases/${releaseBatch}`,
      }
    },
  })
  const handler = handlers.get('/__dev/api/customer-config/release-readiness')

  const missing = await invoke(handler, {
    method: 'POST',
    body: { customerKey: 'yoyoosun' },
  })
  assert.equal(missing.statusCode, 400)
  assert.match(missing.body.message, /Unregistered release batch/)

  const traversal = await invoke(handler, {
    method: 'POST',
    body: { customerKey: 'yoyoosun', releaseBatch: '../2026-07-11' },
  })
  assert.equal(traversal.statusCode, 400)

  const ready = await invoke(handler, {
    method: 'POST',
    body: { customerKey: 'yoyoosun', releaseBatch: '2026-07-11' },
  })
  assert.equal(ready.statusCode, 200)
  assert.equal(ready.body.releaseBatch, '2026-07-11')
  assert.equal(ready.body.manifest, undefined)
  assert.deepEqual(calls, [
    {
      projectRoot: '/workspace',
      customerKey: 'yoyoosun',
      releaseBatch: '2026-07-11',
    },
  ])
})

test('local test manifest API only compiles for the matching loopback customer entry', async () => {
  const calls = []
  const handlers = collectHandlers({
    projectRoot: '/workspace',
    apiOrigin: 'http://127.0.0.1:8300',
    devCustomerKey: 'yoyoosun',
    runtimeManifestCompiler: async (projectRoot, customerKey) => {
      calls.push({ projectRoot, customerKey })
      return {
        status: 'success',
        customerKey,
        manifest: {
          customer_key: customerKey,
          revision:
            'yoyoosun-customer-package-v7.local-0123456789abcdef.runtime-v1',
        },
      }
    },
  })
  const handler = handlers.get(
    '/__dev/api/customer-config/runtime-manifest'
  )

  const response = await invoke(handler, {
    method: 'POST',
    body: { customerKey: 'yoyoosun' },
  })

  assert.equal(response.statusCode, 200)
  assert.equal(response.body.manifest.customer_key, 'yoyoosun')
  assert.deepEqual(calls, [
    { projectRoot: '/workspace', customerKey: 'yoyoosun' },
  ])
})

test('local test manifest API fails closed before compile for external backends', async () => {
  let compileCalls = 0
  const handlers = collectHandlers({
    projectRoot: '/workspace',
    apiOrigin: 'https://erp.example.com',
    devCustomerKey: 'yoyoosun',
    runtimeManifestCompiler: async () => {
      compileCalls += 1
      return { status: 'success' }
    },
  })
  const handler = handlers.get(
    '/__dev/api/customer-config/runtime-manifest'
  )

  const response = await invoke(handler, {
    method: 'POST',
    body: { customerKey: 'yoyoosun' },
  })

  assert.equal(response.statusCode, 403)
  assert.match(response.body.message, /loopback/u)
  assert.equal(compileCalls, 0)
})

test('local test manifest API requires start:yoyoosun customer context', async () => {
  let compileCalls = 0
  const handlers = collectHandlers({
    projectRoot: '/workspace',
    apiOrigin: 'http://localhost:8300',
    devCustomerKey: '',
    runtimeManifestCompiler: async () => {
      compileCalls += 1
      return { status: 'success' }
    },
  })
  const handler = handlers.get(
    '/__dev/api/customer-config/runtime-manifest'
  )

  const response = await invoke(handler, {
    method: 'POST',
    body: { customerKey: 'yoyoosun' },
  })

  assert.equal(response.statusCode, 403)
  assert.match(response.body.message, /start:yoyoosun/u)
  assert.equal(compileCalls, 0)
})
