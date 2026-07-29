import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import test from 'node:test'

import {
  DEV_QA_COVERAGE_ACTION_API_PATH,
  DEV_QA_COVERAGE_API_PATH,
  DEV_QA_COVERAGE_OPERATION_API_PREFIX,
  DEV_QA_COVERAGE_SESSION_API_PATH,
  QA_COVERAGE_REPORT_SCHEMA,
  buildRepositoryFingerprint,
  createDevQaCoverageMiddleware,
  createDevQaCoveragePlugin,
  createDevQaCoverageService,
  resolveCoverageFreshness,
  resolveDevQaCoverageReportPath,
  validateDevQaCoverageAction,
} from './devQaCoveragePlugin.mjs'
import { createERPViteConfig } from '../vite.shared.mjs'

const COMMIT = 'a'.repeat(40)
const STATUS_BYTES = Buffer.from(' M web/example.mjs\0', 'utf8')
const REPOSITORY_SNAPSHOT = {
  commit: COMMIT,
  porcelainBytes: STATUS_BYTES,
  trackedDiffBytes: Buffer.from('tracked-diff-v1', 'utf8'),
  untrackedEntries: [],
}
const REPOSITORY = {
  commit: COMMIT,
  dirty: true,
  fingerprint: buildRepositoryFingerprint(REPOSITORY_SNAPSHOT),
}

const buildReport = (overrides = {}) => ({
  schemaVersion: QA_COVERAGE_REPORT_SCHEMA,
  repository: REPOSITORY,
  summary: { sectionCount: 3 },
  ...overrides,
})

async function createProject(t) {
  const projectRoot = await mkdtemp(
    path.join(os.tmpdir(), 'plush-dev-qa-coverage-')
  )
  t.after(async () => {
    await rm(projectRoot, { recursive: true, force: true })
  })
  return projectRoot
}

async function writeReport(projectRoot, report) {
  const reportPath = resolveDevQaCoverageReportPath(projectRoot)
  await mkdir(path.dirname(reportPath), { recursive: true })
  await writeFile(reportPath, `${JSON.stringify(report)}\n`)
  return reportPath
}

function requestMiddleware(
  middleware,
  {
    url = DEV_QA_COVERAGE_API_PATH,
    method = 'GET',
    host = '127.0.0.1:5175',
    remoteAddress = '127.0.0.1',
    headers = {},
    body = '',
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
      headers: { ...headers, host },
      socket: { remoteAddress },
      async *[Symbol.asyncIterator]() {
        if (body) yield Buffer.from(body)
      },
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

test('repository fingerprint includes shared tracked diff snapshot bytes', () => {
  const expected = buildRepositoryFingerprint(REPOSITORY_SNAPSHOT)
  assert.match(expected, /^[0-9a-f]{64}$/u)
  assert.notEqual(
    buildRepositoryFingerprint({
      ...REPOSITORY_SNAPSHOT,
      trackedDiffBytes: Buffer.from('tracked-diff-v2', 'utf8'),
    }),
    expected
  )
})

test('middleware rejects spoofed remote and Host before reading the report', async () => {
  let reads = 0
  const middleware = createDevQaCoverageMiddleware({
    projectRoot: '/unused/project',
    readReport: async () => {
      reads += 1
      return buildReport()
    },
    readRepositoryState: async () => REPOSITORY,
  })

  const remoteSpoof = await requestMiddleware(middleware, {
    remoteAddress: '10.0.0.8',
    host: 'localhost:5175',
    headers: { 'x-forwarded-for': '127.0.0.1' },
  })
  assert.equal(remoteSpoof.statusCode, 403)

  const hostSpoof = await requestMiddleware(middleware, {
    remoteAddress: '::ffff:127.0.0.1',
    host: 'coverage.attacker.test',
  })
  assert.equal(hostSpoof.statusCode, 403)
  assert.equal(reads, 0)
})

test('middleware returns 405 for non-GET loopback requests', async () => {
  const middleware = createDevQaCoverageMiddleware({
    projectRoot: '/unused/project',
  })
  const response = await requestMiddleware(middleware, { method: 'POST' })
  assert.equal(response.statusCode, 405)
  assert.equal(response.headers.allow, 'GET')
  assert.equal(response.headers['cache-control'], 'no-store')
  assert.deepEqual(JSON.parse(response.body), {
    status: 'failed',
    message: '该开发接口不支持当前请求方法',
  })
})

test('coverage action contract accepts only a fixed baseline idempotency intent', () => {
  const valid = {
    action: 'collect',
    payload: {
      idempotencyKey:
        'coverage:collect:baseline:123e4567-e89b-42d3-a456-426614174000',
    },
  }
  assert.deepEqual(validateDevQaCoverageAction(valid), valid)
  for (const invalid of [
    { ...valid, command: 'node arbitrary.mjs' },
    {
      action: 'collect',
      payload: { ...valid.payload, profile: 'strict' },
    },
    {
      action: 'collect',
      payload: { ...valid.payload, path: '/private/report.json' },
    },
    {
      action: 'shell',
      payload: valid.payload,
    },
  ]) {
    assert.throws(
      () => validateDevQaCoverageAction(invalid),
      /unsupported|allowlisted/u
    )
  }
})

test('coverage action middleware requires same-origin CSRF and exact JSON', async () => {
  const csrfToken = 's'.repeat(43)
  const operation = {
    schemaVersion: 'plush.dev-qa-coverage-operation-public/v1',
    id: '123e4567-e89b-42d3-a456-426614174000',
    status: 'queued',
  }
  const calls = []
  const service = {
    latestOperation: () => null,
    readOperation: () => operation,
    async act(value) {
      calls.push(value)
      return {
        schemaVersion: 'plush.dev-qa-coverage-action-result/v1',
        action: 'collect',
        reused: false,
        operation,
      }
    },
  }
  const middleware = createDevQaCoverageMiddleware({
    projectRoot: '/unused/project',
    csrfToken,
    service,
  })
  const session = await requestMiddleware(middleware, {
    url: DEV_QA_COVERAGE_SESSION_API_PATH,
  })
  assert.equal(session.statusCode, 200)
  assert.equal(JSON.parse(session.body).csrfToken, csrfToken)

  const body = JSON.stringify({
    action: 'collect',
    payload: {
      idempotencyKey:
        'coverage:collect:baseline:123e4567-e89b-42d3-a456-426614174000',
    },
  })
  const missingOrigin = await requestMiddleware(middleware, {
    url: DEV_QA_COVERAGE_ACTION_API_PATH,
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-csrf-token': csrfToken,
    },
    body,
  })
  assert.equal(missingOrigin.statusCode, 403)
  assert.equal(calls.length, 0)

  const valid = await requestMiddleware(middleware, {
    url: DEV_QA_COVERAGE_ACTION_API_PATH,
    method: 'POST',
    headers: {
      origin: 'http://127.0.0.1:5175',
      'sec-fetch-site': 'same-origin',
      'content-type': 'application/json',
      'x-csrf-token': csrfToken,
    },
    body,
  })
  assert.equal(valid.statusCode, 202)
  assert.equal(calls.length, 1)
  assert.equal(JSON.parse(valid.body).operation.id, operation.id)

  const injected = await requestMiddleware(middleware, {
    url: DEV_QA_COVERAGE_ACTION_API_PATH,
    method: 'POST',
    headers: {
      origin: 'http://127.0.0.1:5175',
      'sec-fetch-site': 'same-origin',
      'content-type': 'application/json',
      'x-csrf-token': csrfToken,
    },
    body: JSON.stringify({
      action: 'collect',
      payload: {
        idempotencyKey:
          'coverage:collect:baseline:223e4567-e89b-42d3-a456-426614174000',
        args: ['--strict'],
      },
    }),
  })
  assert.equal(injected.statusCode, 400)
  assert.equal(calls.length, 1)

  const queryInjected = await requestMiddleware(middleware, {
    url: `${DEV_QA_COVERAGE_ACTION_API_PATH}?profile=strict`,
    method: 'POST',
    headers: {
      origin: 'http://127.0.0.1:5175',
      'sec-fetch-site': 'same-origin',
      'content-type': 'application/json',
      'x-csrf-token': csrfToken,
    },
    body,
  })
  assert.equal(queryInjected.statusCode, 400)
  assert.equal(calls.length, 1)
})

test('operation GET reads only the fixed persisted operation projection', async () => {
  const operation = {
    schemaVersion: 'plush.dev-qa-coverage-operation-public/v1',
    id: '123e4567-e89b-42d3-a456-426614174000',
    status: 'running',
  }
  let receivedId = ''
  const middleware = createDevQaCoverageMiddleware({
    projectRoot: '/unused/project',
    service: {
      latestOperation: () => operation,
      readOperation(operationId) {
        receivedId = operationId
        return operation
      },
      act: async () => null,
    },
  })
  const response = await requestMiddleware(middleware, {
    url: `${DEV_QA_COVERAGE_OPERATION_API_PREFIX}/${operation.id}?path=/private`,
  })
  assert.equal(response.statusCode, 200)
  assert.equal(receivedId, operation.id)
  assert.equal(JSON.parse(response.body).operation.status, 'running')
})

function createFakeChild(pid = 9876) {
  const child = new EventEmitter()
  child.pid = pid
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  return child
}

async function waitForOperation(service, operationId, expectedStatus) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const operation = service.readOperation(operationId)
    if (operation.status === expectedStatus) return operation
    await new Promise((resolve) => setTimeout(resolve, 2))
  }
  throw new Error(`operation did not reach ${expectedStatus}`)
}

test('coverage service spawns only the fixed collector and persists stages', async (t) => {
  const projectRoot = await createProject(t)
  const child = createFakeChild()
  const spawns = []
  let tick = 0
  const service = createDevQaCoverageService({
    projectRoot,
    processId: 7654,
    processAlive: (pid) => pid === 7654 || pid === child.pid,
    now: () => new Date(Date.UTC(2026, 6, 29, 6, 0, tick++)),
    readRepositoryState: async () => REPOSITORY,
    readReport: async () => buildReport(),
    resolveNodeRuntime: () => '/project-toolchain/node',
    spawnProcess(command, args, options) {
      spawns.push({ command, args, options })
      return child
    },
  })
  const intent = {
    action: 'collect',
    payload: {
      idempotencyKey:
        'coverage:collect:baseline:323e4567-e89b-42d3-a456-426614174000',
    },
  }
  const started = await service.act(intent)
  assert.equal(started.operation.status, 'running')
  assert.equal(started.reused, false)
  assert.equal(spawns.length, 1)
  assert.equal(spawns[0].command, '/project-toolchain/node')
  assert.deepEqual(spawns[0].args, [
    'scripts/qa/test-coverage-collect.mjs',
    '--profile',
    'baseline',
    '--write',
  ])
  assert.equal(spawns[0].options.cwd, projectRoot)
  assert.equal(
    spawns[0].options.env.PATH.split(path.delimiter)[0],
    '/project-toolchain'
  )
  assert.equal(JSON.stringify(spawns[0]).includes(intent.payload.idempotencyKey), false)

  const concurrent = await service.act({
    action: 'collect',
    payload: {
      idempotencyKey:
        'coverage:collect:baseline:423e4567-e89b-42d3-a456-426614174000',
    },
  })
  assert.equal(concurrent.reused, true)
  assert.equal(concurrent.operation.id, started.operation.id)
  assert.equal(spawns.length, 1)

  child.stderr.write('[qa:test-coverage-collect] stage=go\n')
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(service.readOperation(started.operation.id).stage, 'go')
  child.stderr.write('[qa:test-coverage-collect] stage=aggregate\n')
  child.stderr.end()
  child.emit('close', 2)
  const completed = await waitForOperation(
    service,
    started.operation.id,
    'completed'
  )
  assert.equal(completed.outcome, 'issues')
  assert.equal(completed.exitCode, 2)
  assert.doesNotMatch(
    JSON.stringify(completed),
    /idempotency|childPid|ownerPid|stdout|stderr|scripts\/qa/u
  )

  const replay = await service.act(intent)
  assert.equal(replay.reused, true)
  assert.equal(replay.operation.id, started.operation.id)
  assert.equal(spawns.length, 1)
})

test('coverage service fails closed when published report identity mismatches', async (t) => {
  const projectRoot = await createProject(t)
  const child = createFakeChild(8765)
  const service = createDevQaCoverageService({
    projectRoot,
    processId: 6543,
    processAlive: () => true,
    readRepositoryState: async () => REPOSITORY,
    readReport: async () =>
      buildReport({
        repository: { ...REPOSITORY, fingerprint: 'c'.repeat(64) },
      }),
    resolveNodeRuntime: () => '/project-toolchain/node',
    spawnProcess: () => child,
  })
  const started = await service.act({
    action: 'collect',
    payload: {
      idempotencyKey:
        'coverage:collect:baseline:523e4567-e89b-42d3-a456-426614174000',
    },
  })
  child.stderr.end()
  child.emit('close', 0)
  const failed = await waitForOperation(
    service,
    started.operation.id,
    'failed'
  )
  assert.match(failed.message, /代码发生变化|报告未更新/u)
  assert.equal(failed.outcome, null)
})

test('middleware reads only output/qa/coverage/latest.json', async () => {
  const projectRoot = path.join(os.tmpdir(), 'fixed-project-root')
  let receivedPath = ''
  const middleware = createDevQaCoverageMiddleware({
    projectRoot,
    readReport: async (reportPath) => {
      receivedPath = reportPath
      return buildReport()
    },
    readRepositoryState: async () => REPOSITORY,
  })
  const response = await requestMiddleware(middleware, {
    url: `${DEV_QA_COVERAGE_API_PATH}?path=/Users/simon/private.json`,
  })
  assert.equal(response.statusCode, 200)
  assert.equal(
    receivedPath,
    path.join(projectRoot, 'output', 'qa', 'coverage', 'latest.json')
  )
  assert.doesNotMatch(response.body, /Users\/simon/u)
})

test('middleware distinguishes current and stale repository state', async () => {
  const currentMiddleware = createDevQaCoverageMiddleware({
    projectRoot: '/unused/project',
    readReport: async () => buildReport(),
    readRepositoryState: async () => REPOSITORY,
  })
  const current = await requestMiddleware(currentMiddleware, {
    remoteAddress: '::ffff:127.0.0.1',
    host: '[::1]:5175',
  })
  assert.equal(current.statusCode, 200)
  assert.equal(JSON.parse(current.body).status, 'current')
  assert.equal(current.headers['cache-control'], 'no-store')

  const staleRepository = { ...REPOSITORY, dirty: false }
  const staleMiddleware = createDevQaCoverageMiddleware({
    projectRoot: '/unused/project',
    readReport: async () => buildReport(),
    readRepositoryState: async () => staleRepository,
  })
  const stale = await requestMiddleware(staleMiddleware)
  assert.equal(stale.statusCode, 200)
  assert.equal(JSON.parse(stale.body).status, 'stale')
  assert.equal(
    resolveCoverageFreshness(buildReport(), staleRepository),
    'stale'
  )
})

test('middleware returns safe missing response for an absent fixed report', async (t) => {
  const projectRoot = await createProject(t)
  const middleware = createDevQaCoverageMiddleware({ projectRoot })
  const response = await requestMiddleware(middleware)
  assert.equal(response.statusCode, 404)
  assert.deepEqual(JSON.parse(response.body), {
    status: 'missing',
    message: '覆盖率报告尚未生成',
    operation: null,
  })
})

test('middleware fails closed for oversized and invalid-schema reports', async (t) => {
  const oversizedRoot = await createProject(t)
  await writeReport(oversizedRoot, buildReport({ padding: 'x'.repeat(1024) }))
  const oversized = await requestMiddleware(
    createDevQaCoverageMiddleware({
      projectRoot: oversizedRoot,
      maxReportBytes: 128,
      readRepositoryState: async () => REPOSITORY,
    })
  )
  assert.equal(oversized.statusCode, 500)
  assert.deepEqual(JSON.parse(oversized.body), {
    status: 'failed',
    message: '覆盖率报告不可用，请重新生成',
    operation: null,
  })

  const invalidRoot = await createProject(t)
  await writeReport(invalidRoot, {
    schemaVersion: 'unsupported/v1',
    repoRoot: '/Users/simon/private/project',
    token: 'github_pat_do-not-return',
  })
  const invalid = await requestMiddleware(
    createDevQaCoverageMiddleware({
      projectRoot: invalidRoot,
      readRepositoryState: async () => REPOSITORY,
    })
  )
  assert.equal(invalid.statusCode, 500)
  assert.doesNotMatch(invalid.body, /Users|simon|github_pat|token/u)
})

test('middleware rejects restricted fields even when the schema is valid', async (t) => {
  const projectRoot = await createProject(t)
  await writeReport(
    projectRoot,
    buildReport({ repoRoot: '/Users/simon/projects/plush-toy-erp' })
  )
  const response = await requestMiddleware(
    createDevQaCoverageMiddleware({
      projectRoot,
      readRepositoryState: async () => REPOSITORY,
    })
  )
  assert.equal(response.statusCode, 500)
  assert.doesNotMatch(response.body, /Users|simon|repoRoot/u)
})

test('middleware rejects ambiguous blended overall coverage keys', async (t) => {
  const projectRoot = await createProject(t)
  await writeReport(
    projectRoot,
    buildReport({ summary: { overallPercent: 99 } })
  )
  const response = await requestMiddleware(
    createDevQaCoverageMiddleware({
      projectRoot,
      readRepositoryState: async () => REPOSITORY,
    })
  )
  assert.equal(response.statusCode, 500)
  assert.doesNotMatch(response.body, /overallPercent|99/u)
})

test('middleware rejects remote URLs from otherwise valid reports', async (t) => {
  for (const remote of [
    'http://10.0.0.9/private-report',
    'see https://example.test/private-report',
    'fetch git@example.test:private/repository.git',
  ]) {
    const projectRoot = await createProject(t)
    await writeReport(projectRoot, buildReport({ evidence: remote }))
    const response = await requestMiddleware(
      createDevQaCoverageMiddleware({
        projectRoot,
        readRepositoryState: async () => REPOSITORY,
      })
    )
    assert.equal(response.statusCode, 500, remote)
    assert.doesNotMatch(
      response.body,
      /example|10\.0\.0\.9|private|http:|git@/u
    )
  }
})

test('middleware rejects absolute paths regardless of report key name', async (t) => {
  const projectRoot = await createProject(t)
  await writeReport(projectRoot, buildReport({ note: '/etc/private-report' }))
  const response = await requestMiddleware(
    createDevQaCoverageMiddleware({
      projectRoot,
      readRepositoryState: async () => REPOSITORY,
    })
  )
  assert.equal(response.statusCode, 500)
  assert.doesNotMatch(response.body, /etc|private-report/u)
})

test('middleware rejects absolute paths embedded in commands and notes', async (t) => {
  for (const embeddedPath of [
    'node /Users/simon/private.mjs',
    'read /home/runner/private.json',
    'run C:\\Users\\simon\\private.mjs',
    'read \\\\server\\share\\private.json',
  ]) {
    const projectRoot = await createProject(t)
    await writeReport(projectRoot, buildReport({ note: embeddedPath }))
    const response = await requestMiddleware(
      createDevQaCoverageMiddleware({
        projectRoot,
        readRepositoryState: async () => REPOSITORY,
      })
    )
    assert.equal(response.statusCode, 500, embeddedPath)
    assert.doesNotMatch(response.body, /Users|home|server|private/u)
  }
})

test('unrelated paths fall through and plugin is serve-only', async () => {
  const middleware = createDevQaCoverageMiddleware({
    projectRoot: '/unused/project',
  })
  const response = await requestMiddleware(middleware, {
    url: '/assets/application.js',
  })
  assert.equal(response.nextCalled, true)
  assert.equal(createDevQaCoveragePlugin().apply, 'serve')
})

test('ERP Vite config installs coverage middleware only for development serve', async () => {
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

  assert.equal(
    pluginNames(developmentServe).includes('plush-dev-qa-coverage'),
    true
  )
  assert.equal(
    pluginNames(developmentBuild).includes('plush-dev-qa-coverage'),
    false
  )
  assert.equal(
    pluginNames(productionBuild).includes('plush-dev-qa-coverage'),
    false
  )
})
