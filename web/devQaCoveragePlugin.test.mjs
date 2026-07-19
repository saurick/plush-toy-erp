import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  DEV_QA_COVERAGE_API_PATH,
  QA_COVERAGE_REPORT_SCHEMA,
  buildRepositoryFingerprint,
  createDevQaCoverageMiddleware,
  createDevQaCoveragePlugin,
  isLoopbackHostHeader,
  isLoopbackRemoteAddress,
  resolveCoverageFreshness,
  resolveDevQaCoverageReportPath,
} from './devQaCoveragePlugin.mjs'
import { createERPViteConfig } from './vite.shared.mjs'

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

test('loopback checks accept IPv4, IPv6, and IPv4-mapped remotes only', () => {
  for (const address of [
    '127.0.0.1',
    '127.42.9.7',
    '::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '0:0:0:0:0:ffff:7f00:1',
  ]) {
    assert.equal(isLoopbackRemoteAddress(address), true, address)
  }
  for (const address of [
    '',
    '0.0.0.0',
    '10.0.0.2',
    '192.168.1.8',
    '::',
    '::ffff:10.0.0.2',
  ]) {
    assert.equal(isLoopbackRemoteAddress(address), false, address)
  }
})

test('Host checks reject DNS rebinding and malformed loopback lookalikes', () => {
  for (const host of [
    'localhost',
    'LOCALHOST:5175',
    '127.0.0.1',
    '127.22.3.4:65535',
    '[::1]',
    '[::1]:5175',
  ]) {
    assert.equal(isLoopbackHostHeader(host), true, host)
  }
  for (const host of [
    '',
    '0.0.0.0:5175',
    'localhost.evil',
    '127.0.0.1.evil',
    'localhost@evil.test',
    '[::ffff:127.0.0.1]:5175',
    '[::1].evil',
    '127.0.0.1:0',
    '127.0.0.1:65536',
  ]) {
    assert.equal(isLoopbackHostHeader(host), false, host)
  }
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
    message: '该开发接口仅支持 GET',
  })
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
