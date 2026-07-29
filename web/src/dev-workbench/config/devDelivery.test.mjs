import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  DEV_DELIVERY_ACTION_API_PATH,
  DEV_DELIVERY_OPERATION_API_PREFIX,
  DEV_DELIVERY_SESSION_API_PATH,
  DEV_DELIVERY_SOURCE_PATH,
  DEV_DELIVERY_SUMMARY_API_PATH,
  DEV_VERSION_CENTER_ROUTE,
  createDeliveryIdempotencyKey,
  createDevDeliveryClient,
  defaultReleaseVersion,
  deliveryStatusPresentation,
  deliveryVersionActionKind,
  formatDeliveryBytes,
  shortGitSha,
  validateDevDeliverySummary,
} from './devDelivery.mjs'

const SHA = 'a'.repeat(40)

function response(payload, ok = true) {
  return {
    ok,
    async json() {
      return payload
    },
  }
}

function summaryFixture() {
  return {
    schemaVersion: 'plush.dev-delivery-summary/v1',
    status: 'success',
    generatedAt: '2026-07-29T01:00:00.000Z',
    repository: {
      commit: SHA,
      dirty: false,
      fingerprint: 'b'.repeat(64),
    },
    versions: [
      {
        schemaVersion: 'plush.delivery-version/v1',
        status: 'published',
        tag: `artifact-${SHA}`,
        gitSha: SHA,
        version: '2026.07.29-1',
        publishedAt: '2026-07-29T01:00:00.000Z',
        url: `https://github.com/saurick/plush-toy-erp/releases/tag/artifact-${SHA}`,
        assets: ['release-manifest.json'],
        completeAssets: true,
      },
    ],
    target: null,
    operations: [
      {
        id: '11111111-1111-4111-8111-111111111111',
        action: 'release',
        target: 'github-release',
        gitSha: SHA,
        version: '2026.07.29-1',
        status: 'passed',
        revision: 3,
        createdAt: '2026-07-29T01:00:00.000Z',
        updatedAt: '2026-07-29T01:02:00.000Z',
        issues: [],
        events: [],
        confirmationRequired: '',
        terminal: true,
      },
    ],
    issues: [],
    boundaries: {
      provider: 'github',
      target: 'test-133',
      browserShellAccess: false,
      targetBuildAllowed: false,
      automaticRetryAllowed: false,
      automaticDatabaseDownMigration: false,
    },
  }
}

test('version center uses fixed dev-only routes and engineering truth source', () => {
  assert.equal(DEV_VERSION_CENTER_ROUTE, '/__dev/version-center')
  assert.equal(DEV_DELIVERY_SESSION_API_PATH, '/__dev/api/delivery/session')
  assert.equal(DEV_DELIVERY_SUMMARY_API_PATH, '/__dev/api/delivery/summary')
  assert.equal(DEV_DELIVERY_ACTION_API_PATH, '/__dev/api/delivery/actions')
  assert.equal(
    DEV_DELIVERY_OPERATION_API_PREFIX,
    '/__dev/api/delivery/operations'
  )
  assert.equal(
    DEV_DELIVERY_SOURCE_PATH,
    'docs/engineering/研发效能工作台与CI-CD设计.md'
  )
})

test('delivery summary requires provider, target and no-shell boundaries', () => {
  assert.equal(validateDevDeliverySummary(summaryFixture()).status, 'success')
  assert.throws(
    () =>
      validateDevDeliverySummary({
        ...summaryFixture(),
        boundaries: {
          ...summaryFixture().boundaries,
          browserShellAccess: true,
        },
      }),
    /contract/u
  )
  assert.throws(
    () =>
      validateDevDeliverySummary({
        ...summaryFixture(),
        versions: [
          {
            ...summaryFixture().versions[0],
            gitSha: 'not-a-sha',
          },
        ],
      }),
    /version/u
  )
})

test('delivery client reuses one CSRF session and posts only the fixed action envelope', async () => {
  const requests = []
  const client = createDevDeliveryClient({
    async fetchImpl(url, options) {
      requests.push({ url, options })
      if (url === DEV_DELIVERY_SESSION_API_PATH) {
        return response({
          schemaVersion: 'plush.dev-delivery-session/v1',
          csrfToken: 'c'.repeat(43),
          target: 'test-133',
        })
      }
      if (url === DEV_DELIVERY_SUMMARY_API_PATH) {
        return response(summaryFixture())
      }
      if (url.startsWith(DEV_DELIVERY_OPERATION_API_PREFIX)) {
        return response({
          schemaVersion: 'plush.dev-delivery-operation-result/v1',
          operation: summaryFixture().operations[0],
        })
      }
      return response({
        schemaVersion: 'plush.dev-delivery-action-result/v1',
        action: 'dispatch-release',
      })
    },
  })
  assert.equal((await client.summary()).versions.length, 1)
  assert.equal(
    (
      await client.operation(
        '11111111-1111-4111-8111-111111111111'
      )
    ).status,
    'passed'
  )
  await client.action('dispatch-release', {
    gitSha: SHA,
    version: '2026.07.29-1',
    idempotencyKey: 'version-center:release:fixed-0001',
  })
  await client.action('dispatch-release', {
    gitSha: SHA,
    version: '2026.07.29-1',
    idempotencyKey: 'version-center:release:fixed-0001',
  })
  assert.equal(
    requests.filter(
      (request) => request.url === DEV_DELIVERY_SESSION_API_PATH
    ).length,
    1
  )
  assert.equal(
    requests.filter((request) =>
      request.url.startsWith(DEV_DELIVERY_OPERATION_API_PREFIX)
    ).length,
    1
  )
  const posts = requests.filter(
    (request) => request.url === DEV_DELIVERY_ACTION_API_PATH
  )
  assert.equal(posts.length, 2)
  assert.equal(posts[0].options.method, 'POST')
  assert.equal(posts[0].options.headers['x-csrf-token'], 'c'.repeat(43))
  assert.deepEqual(JSON.parse(posts[0].options.body), {
    action: 'dispatch-release',
    payload: {
      gitSha: SHA,
      version: '2026.07.29-1',
      idempotencyKey: 'version-center:release:fixed-0001',
    },
  })
})

test('delivery presentation helpers are deterministic and bounded', () => {
  assert.equal(
    createDeliveryIdempotencyKey(
      'promote',
      () => '11111111-1111-4111-8111-111111111111'
    ),
    'version-center:promote:11111111-1111-4111-8111-111111111111'
  )
  assert.equal(defaultReleaseVersion(new Date(2026, 6, 29)), '2026.07.29-1')
  assert.equal(shortGitSha(SHA), 'aaaaaaaaaaaa')
  assert.equal(shortGitSha('bad'), '未证明')
  assert.equal(formatDeliveryBytes(30 * 1024 ** 3), '30.0 GiB')
  assert.equal(deliveryStatusPresentation('not_proven').label, '结果未证明')
})

test('version actions distinguish newer promotion from older rollback', () => {
  const current = {
    gitSha: 'b'.repeat(40),
    publishedAt: '2026-07-29T02:00:00.000Z',
  }
  assert.equal(
    deliveryVersionActionKind(
      {
        gitSha: SHA,
        publishedAt: '2026-07-29T03:00:00.000Z',
      },
      current
    ),
    'promote'
  )
  assert.equal(
    deliveryVersionActionKind(
      {
        gitSha: SHA,
        publishedAt: '2026-07-29T01:00:00.000Z',
      },
      current
    ),
    'rollback'
  )
  assert.equal(deliveryVersionActionKind(current, current), 'current')
  assert.equal(
    deliveryVersionActionKind(
      { gitSha: SHA, publishedAt: '' },
      current
    ),
    'blocked'
  )
  assert.equal(
    deliveryVersionActionKind({ gitSha: SHA, publishedAt: '' }, null),
    'promote'
  )
})

test('version center page does not expose shell, SSH or arbitrary target inputs', () => {
  const source = readFileSync(
    new URL('../pages/DevVersionCenterPage.jsx', import.meta.url),
    'utf8'
  )
  assert.match(source, /exact SHA/u)
  assert.match(source, /test-133/u)
  assert.match(source, /查看详情/u)
  assert.match(source, /确认回滚/u)
  assert.doesNotMatch(
    source,
    /(?:spawn|child_process|192[.]168|\/home\/simon)/iu
  )
  assert.doesNotMatch(source, /name=["'](?:host|path|command|target)["']/iu)
})
