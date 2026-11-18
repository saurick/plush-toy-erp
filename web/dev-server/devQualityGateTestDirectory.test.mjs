import { Readable } from 'node:stream'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createDevQualityGateMiddleware } from './devQualityGatePlugin.mjs'
import { readQualityGateTestDirectory } from './devQualityGateTestDirectory.mjs'
import { normalizeQualityGateTestDirectory } from '../src/dev-workbench/config/devQualityGateDirectory.mjs'

test('test directory reuses discovery, reflects file changes and distinguishes missing registrations', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'plush-test-directory-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const file = async (name) => {
    await mkdir(path.dirname(path.join(root, name)), { recursive: true })
    await writeFile(
      path.join(root, name),
      'throw new Error("must not execute tests")'
    )
  }
  await Promise.all(
    [
      'scripts/known.test.mjs',
      'scripts/new.test.mjs',
      'scripts/only.test.mjs',
      'scripts/node_modules/excluded.test.mjs',
      'web/src/view.test.mjs',
      'web/output/excluded.test.mjs',
      'server/internal/rules_test.go',
      'server/vendor/excluded_test.go',
    ].map(file)
  )
  await symlink(path.join(root, 'server'), path.join(root, 'server', 'loop'))
  const options = {
    nodeGroups: {
      fast: ['scripts/known.test.mjs', 'scripts/deleted.test.mjs'],
    },
    explicitTests: ['scripts/only.test.mjs'],
  }
  const first = normalizeQualityGateTestDirectory(
    await readQualityGateTestDirectory(root, options)
  )
  assert.equal(first.files.length, 6)
  assert.deepEqual(first.missingRoots, [])
  assert.equal(
    first.files.find((item) => item.path === 'scripts/new.test.mjs').group,
    'unregistered'
  )
  assert.equal(
    first.files.find((item) => item.path === 'scripts/deleted.test.mjs')
      .present,
    false
  )
  assert.equal(
    first.files.find((item) => item.path === 'scripts/only.test.mjs').group,
    'explicit'
  )
  assert(
    first.files.every(
      (item) => !path.isAbsolute(item.path) && !item.path.includes('excluded')
    )
  )
  await rm(path.join(root, 'scripts/known.test.mjs'))
  await file('web/src/added.test.mjs')
  const second = await readQualityGateTestDirectory(root, options)
  assert.equal(
    second.files.find((item) => item.path === 'scripts/known.test.mjs').present,
    false
  )
  assert.equal(second.files.filter((item) => item.group === 'web').length, 2)
})

test('missing source trees and duplicate group registration remain explicit', async (t) => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), 'plush-test-directory-missing-')
  )
  t.after(() => rm(root, { recursive: true, force: true }))
  const report = await readQualityGateTestDirectory(root, {
    nodeGroups: {
      fast: ['scripts/a.test.mjs'],
      release: ['scripts/a.test.mjs'],
    },
    explicitTests: [],
  })
  assert.deepEqual(report.missingRoots, ['scripts', 'server', 'web'])
  assert.deepEqual(report.files, [
    { path: 'scripts/a.test.mjs', group: 'duplicate', present: false },
  ])
})

function middlewareResponse() {
  return {
    statusCode: 200,
    headers: {},
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value
    },
    end(body) {
      this.body = String(body)
    },
  }
}

function middlewareRequest({ body = '', headers = {}, method, url }) {
  const request = Readable.from(body ? [body] : [])
  request.method = method
  request.url = url
  request.headers = { host: '127.0.0.1:5175', ...headers }
  request.socket = { remoteAddress: '127.0.0.1' }
  return request
}

test('test-directory middleware is read-only, validates queries and never exposes filesystem errors', async () => {
  let reads = 0
  const report = { kind: 'plush.quality-gate-test-directory', readAt: '2026-11-18T00:00:00Z', missingRoots: [], files: [] }
  const middleware = createDevQualityGateMiddleware({ projectRoot: '/example', service: {}, readTestDirectory: async () => { reads += 1; return report } })
  const response = middlewareResponse()
  await middleware(middlewareRequest({ method: 'GET', url: '/__dev/api/qa/quality-gates/test-directory' }), response, () => assert.fail('route must be handled'))
  assert.equal(response.statusCode, 200)
  assert.deepEqual(JSON.parse(response.body), report)
  for (const request of [
    { method: 'GET', url: '/__dev/api/qa/quality-gates/test-directory?path=/private' },
    { method: 'POST', url: '/__dev/api/qa/quality-gates/test-directory' },
    { method: 'GET', url: '/__dev/api/qa/quality-gates/test-directory', headers: { host: 'outside.example' } },
  ]) {
    const rejected = middlewareResponse()
    await middleware(middlewareRequest(request), rejected, () => assert.fail('route must be handled'))
    assert(rejected.statusCode >= 400)
  }
  assert.equal(reads, 1)
  const failed = middlewareResponse()
  const broken = createDevQualityGateMiddleware({ projectRoot: '/example', service: {}, readTestDirectory: async () => { throw new Error('/private/credentials unreadable') } })
  await broken(middlewareRequest({ method: 'GET', url: '/__dev/api/qa/quality-gates/test-directory' }), failed, () => {})
  assert(failed.statusCode >= 400)
  assert.doesNotMatch(failed.body, /credentials|\/private/u)
})
