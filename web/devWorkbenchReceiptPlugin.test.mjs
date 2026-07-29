import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  buildDevWorkbenchReceipt,
  writeDevWorkbenchReceipt,
} from '../scripts/qa/dev-workbench-receipt.mjs'
import {
  DEV_WORKBENCH_RECEIPT_API_PATH,
  createDevWorkbenchReceiptMiddleware,
  createDevWorkbenchReceiptPlugin,
  resolveDevWorkbenchReceiptDirectory,
  resolveDevWorkbenchReceiptPath,
} from './devWorkbenchReceiptPlugin.mjs'
import {
  DEV_WORKBENCH_SERVE_PLUGIN_NAMES,
  createDevWorkbenchServePlugins,
} from './devWorkbenchPlugins.mjs'
import { createERPViteConfig } from './vite.shared.mjs'

const COMMIT = 'a'.repeat(40)
const REPOSITORY = Object.freeze({
  comparisonRange: '',
  gitCommit: COMMIT,
  treeState: 'clean',
})

async function createProject(t) {
  const projectRoot = await mkdtemp(
    path.join(os.tmpdir(), 'plush-dev-workbench-receipt-')
  )
  t.after(async () => {
    await rm(projectRoot, { recursive: true, force: true })
  })
  return projectRoot
}

function buildReceipt(projectRoot, overrides = {}) {
  return buildDevWorkbenchReceipt({
    durationMs: 12,
    finishedAt: 1_100,
    gate: 'full',
    gitContext: REPOSITORY,
    invariants: ['zero skipped'],
    metrics: {},
    notProven: ['target environment release'],
    profile: 'full',
    repoRoot: projectRoot,
    startedAt: 1_000,
    status: 'passed',
    summary: { executed: 2, passed: 2, failed: 0, skipped: 0 },
    ...overrides,
  })
}

async function writeReceipt(projectRoot, receipt) {
  const directory = resolveDevWorkbenchReceiptDirectory(projectRoot)
  await mkdir(directory, { recursive: true })
  const target = resolveDevWorkbenchReceiptPath(directory, receipt.gate)
  writeDevWorkbenchReceipt(target, receipt)
  return target
}

function requestMiddleware(
  middleware,
  {
    url = DEV_WORKBENCH_RECEIPT_API_PATH,
    method = 'GET',
    host = '127.0.0.1:5175',
    remoteAddress = '127.0.0.1',
  } = {}
) {
  return new Promise((resolve, reject) => {
    const responseHeaders = {}
    let settled = false
    const finish = (result) => {
      if (settled) return
      settled = true
      resolve(result)
    }
    const response = {
      statusCode: 200,
      setHeader(name, value) {
        responseHeaders[String(name).toLowerCase()] = value
      },
      end(body = '') {
        finish({
          statusCode: this.statusCode,
          headers: responseHeaders,
          body: String(body),
          nextCalled: false,
        })
      },
    }
    const request = {
      url,
      method,
      headers: { host },
      socket: { remoteAddress },
    }
    const next = () =>
      finish({
        statusCode: response.statusCode,
        headers: responseHeaders,
        body: '',
        nextCalled: true,
      })
    Promise.resolve(middleware(request, response, next)).catch(reject)
  })
}

test('receipt middleware exposes fixed current and historical slots only', async (t) => {
  const projectRoot = await createProject(t)
  await writeReceipt(projectRoot, buildReceipt(projectRoot))
  await writeReceipt(
    projectRoot,
    buildReceipt(projectRoot, {
      gate: 'browser',
      gitContext: { ...REPOSITORY, gitCommit: 'b'.repeat(40) },
      profile: 'production-boundary',
    })
  )
  const middleware = createDevWorkbenchReceiptMiddleware({
    projectRoot,
    readRepositoryState: async () => REPOSITORY,
  })
  const response = await requestMiddleware(middleware, {
    url: `${DEV_WORKBENCH_RECEIPT_API_PATH}?path=/private/receipt.json`,
  })
  assert.equal(response.statusCode, 200)
  assert.equal(response.headers['cache-control'], 'no-store')
  const body = JSON.parse(response.body)
  assert.equal(body.status, 'success')
  assert.equal(body.repository.gitCommit, COMMIT)
  assert.deepEqual(
    body.receipts.map(({ freshness, receipt }) => [
      receipt.gate,
      freshness,
    ]),
    [
      ['full', 'current'],
      ['browser', 'historical'],
    ]
  )
  assert.doesNotMatch(response.body, /private\/receipt/u)
})

test('receipt middleware rejects remote, write, invalid and absent input', async (t) => {
  const projectRoot = await createProject(t)
  const middleware = createDevWorkbenchReceiptMiddleware({
    projectRoot,
    readRepositoryState: async () => REPOSITORY,
  })
  const remote = await requestMiddleware(middleware, {
    remoteAddress: '10.0.0.8',
  })
  assert.equal(remote.statusCode, 403)

  const write = await requestMiddleware(middleware, { method: 'POST' })
  assert.equal(write.statusCode, 405)
  assert.equal(write.headers.allow, 'GET')

  const missing = await requestMiddleware(middleware)
  assert.equal(missing.statusCode, 200)
  assert.equal(JSON.parse(missing.body).status, 'missing')

  const directory = resolveDevWorkbenchReceiptDirectory(projectRoot)
  await mkdir(directory, { recursive: true })
  await writeFile(
    resolveDevWorkbenchReceiptPath(directory, 'full'),
    '{"schemaVersion":"unsupported","token":"secret"}\n'
  )
  const invalid = await requestMiddleware(middleware)
  assert.equal(invalid.statusCode, 500)
  assert.doesNotMatch(invalid.body, /token|secret|unsupported/u)
})

test('receipt middleware falls through unrelated paths and plugin is serve-only', async () => {
  const middleware = createDevWorkbenchReceiptMiddleware({
    projectRoot: '/unused/project',
  })
  const response = await requestMiddleware(middleware, {
    url: '/assets/application.js',
  })
  assert.equal(response.nextCalled, true)
  assert.equal(createDevWorkbenchReceiptPlugin().apply, 'serve')
})

test('development serve registry is exact and absent from all builds', async () => {
  assert.deepEqual(
    createDevWorkbenchServePlugins({
      command: 'build',
      mode: 'development',
      projectRoot: '/unused/project',
    }),
    []
  )
  assert.deepEqual(
    createDevWorkbenchServePlugins({
      command: 'serve',
      mode: 'production',
      projectRoot: '/unused/project',
    }),
    []
  )

  const configFactory = createERPViteConfig('desktop')
  const pluginNames = (config) => config.plugins.map((plugin) => plugin.name)
  const developmentServe = await configFactory({
    command: 'serve',
    mode: 'development',
  })
  const developmentBuild = await configFactory({
    command: 'build',
    mode: 'development',
  })
  const productionBuild = await configFactory({
    command: 'build',
    mode: 'production',
  })
  const installedServePlugins = pluginNames(developmentServe).filter((name) =>
    DEV_WORKBENCH_SERVE_PLUGIN_NAMES.includes(name)
  )
  assert.deepEqual(installedServePlugins, [
    'plush-dev-customer-import-dry-run-api',
    'plush-dev-qa-coverage',
    'plush-dev-workbench-receipts',
    'plush-dev-delivery-bridge',
  ])
  for (const config of [developmentBuild, productionBuild]) {
    assert.deepEqual(
      pluginNames(config).filter((name) =>
        DEV_WORKBENCH_SERVE_PLUGIN_NAMES.includes(name)
      ),
      []
    )
  }
})
