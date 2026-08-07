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
  formatDeliveryDuration,
  shortGitSha,
  summarizePipelineTimings,
  validateDevDeliverySummary,
  validatePipelineTimings,
} from './devDelivery.mjs'
import {
  clearDevSummarySnapshot,
  formatDevSummaryCheckedAt,
  loadDevSummarySnapshot,
  readDevSummarySnapshot,
  updateDevSummarySnapshot,
} from './devSummarySnapshot.mjs'

const SHA = 'a'.repeat(40)
const versionCenterPageSource = readFileSync(
  new URL('../pages/DevVersionCenterPage.jsx', import.meta.url),
  'utf8'
)
const databaseMigrationPageSource = readFileSync(
  new URL('../pages/DevDatabaseMigrationPage.jsx', import.meta.url),
  'utf8'
)

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
        durationMs: 120_000,
        stages: [
          {
            id: 'release_dispatch',
            label: 'GitHub 发布调度',
            status: 'passed',
            durationMs: 10_000,
          },
        ],
        issues: [],
        events: [],
        confirmationRequired: '',
        terminal: true,
      },
    ],
    timings: null,
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
    (await client.operation('11111111-1111-4111-8111-111111111111')).status,
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
    requests.filter((request) => request.url === DEV_DELIVERY_SESSION_API_PATH)
      .length,
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
  assert.equal(formatDeliveryDuration(950), '950 ms')
  assert.equal(formatDeliveryDuration(5_400), '5.4 秒')
  assert.equal(formatDeliveryDuration(125_000), '2 分 5 秒')
  assert.equal(deliveryStatusPresentation('not_proven').label, '结果未证明')
})

test('pipeline timings validate nested stages and identify the measured bottleneck', () => {
  const timings = {
    schemaVersion: 'plush.delivery-pipeline-timings/v1',
    generatedAt: '2026-08-08T03:00:00.000Z',
    runs: [
      {
        id: 321,
        attempt: 1,
        workflow: 'release',
        event: 'workflow_dispatch',
        status: 'completed',
        conclusion: 'success',
        gitSha: SHA,
        createdAt: '2026-08-08T02:00:00.000Z',
        startedAt: '2026-08-08T02:00:10.000Z',
        finishedAt: '2026-08-08T02:10:10.000Z',
        queueMs: 10_000,
        durationMs: 600_000,
        url: 'https://github.com/saurick/plush-toy-erp/actions/runs/321',
        jobs: [
          {
            id: 654,
            name: 'Publish immutable release',
            status: 'completed',
            conclusion: 'success',
            startedAt: '2026-08-08T02:00:20.000Z',
            finishedAt: '2026-08-08T02:10:00.000Z',
            durationMs: 580_000,
            steps: [
              {
                number: 1,
                name: 'Build both images',
                status: 'completed',
                conclusion: 'success',
                startedAt: '2026-08-08T02:00:30.000Z',
                finishedAt: '2026-08-08T02:08:30.000Z',
                durationMs: 480_000,
              },
              {
                number: 2,
                name: 'Publish assets',
                status: 'completed',
                conclusion: 'success',
                startedAt: '2026-08-08T02:08:30.000Z',
                finishedAt: '2026-08-08T02:10:00.000Z',
                durationMs: 90_000,
              },
            ],
          },
        ],
      },
    ],
  }
  assert.strictEqual(validatePipelineTimings(timings), timings)
  const summary = summarizePipelineTimings(timings)
  assert.equal(summary.sampleCount, 1)
  assert.equal(summary.medianDurationMs, 600_000)
  assert.equal(summary.bottleneck.name, 'Build both images')
  assert.match(summary.optimizationHint, /耗时最长/u)
  assert.throws(
    () =>
      validatePipelineTimings({
        ...timings,
        runs: [{ ...timings.runs[0], url: 'https://example.com/run/321' }],
      }),
    /run/u
  )
})

test('dev summary snapshots stay in memory, deduplicate refreshes and retain the last good result', async () => {
  const key = 'test-summary'
  const checkedAt = '2026-08-07T03:04:05.000Z'
  clearDevSummarySnapshot(key)
  let loads = 0
  const firstLoad = loadDevSummarySnapshot(
    key,
    async () => {
      loads += 1
      await Promise.resolve()
      return { status: 'success', revision: 1 }
    },
    { now: () => checkedAt }
  )
  const repeatedLoad = loadDevSummarySnapshot(key, async () => {
    throw new Error('同一缓存键不应重复读取')
  })

  assert.strictEqual(repeatedLoad, firstLoad)
  const snapshot = await firstLoad
  assert.equal(loads, 1)
  assert.deepEqual(snapshot, {
    summary: { status: 'success', revision: 1 },
    checkedAt,
  })
  assert.strictEqual(readDevSummarySnapshot(key), snapshot)

  const updated = updateDevSummarySnapshot(key, (summary) => ({
    ...summary,
    revision: 2,
  }))
  assert.equal(updated.checkedAt, checkedAt)
  assert.equal(updated.summary.revision, 2)

  await assert.rejects(
    loadDevSummarySnapshot(key, async () => {
      throw new Error('offline')
    }),
    /offline/u
  )
  assert.strictEqual(readDevSummarySnapshot(key), updated)
  assert.equal(formatDevSummaryCheckedAt('not-a-date'), '尚未核对')
  assert.notEqual(formatDevSummaryCheckedAt(checkedAt), '尚未核对')
  clearDevSummarySnapshot(key)
  assert.equal(readDevSummarySnapshot(key), null)
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
    deliveryVersionActionKind({ gitSha: SHA, publishedAt: '' }, current),
    'blocked'
  )
  assert.equal(
    deliveryVersionActionKind({ gitSha: SHA, publishedAt: '' }, null),
    'promote'
  )
})

test('version center page does not expose shell, SSH or arbitrary target inputs', () => {
  const source = versionCenterPageSource
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

test('delivery pages expose one canonical dangerous action and lock concurrent mutations', () => {
  assert.equal(
    databaseMigrationPageSource.match(/确认升级并重启/gu)?.length,
    2,
    'one ready-state button and its confirmation modal may share the action label'
  )
  assert.equal(
    databaseMigrationPageSource.match(/setConfirmationOperation\(record\)/gu)
      ?.length || 0,
    0,
    'operation history must stay read-only'
  )
  assert.match(
    databaseMigrationPageSource,
    /cancelButtonProps=\{\{[\s\S]*?disabled:[\s\S]*?execute:/u
  )
  assert.match(databaseMigrationPageSource, /danger: true/u)

  assert.match(versionCenterPageSource, /mutationInFlightRef/u)
  assert.match(versionCenterPageSource, /hasOpenOperation/u)
  assert.match(versionCenterPageSource, /POLLING_OPERATION_STATUSES/u)
  assert.match(versionCenterPageSource, /setOperationPollError/u)
  assert.match(
    versionCenterPageSource,
    /danger: confirmOperation\?\.action === 'rollback'/u
  )
  assert.doesNotMatch(
    versionCenterPageSource,
    /danger: confirmOperation\?\.action === 'promote'/u
  )
  assert.match(
    versionCenterPageSource,
    /cancelButtonProps=\{\{[\s\S]*?disabled: actionKey === 'dispatch-release'/u
  )
})

test('delivery pages keep cached summaries visible while rechecking and gate writes on fresh state', () => {
  for (const source of [versionCenterPageSource, databaseMigrationPageSource]) {
    assert.match(source, /readDevSummarySnapshot/u)
    assert.match(source, /loadDevSummarySnapshot/u)
    assert.match(source, /loading=\{initialLoading\}/u)
    assert.match(source, /正在后台核对/u)
    assert.match(source, /summaryFresh/u)
    assert.match(source, /上次结果，写操作已停用/u)
    assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB/u)
  }
  assert.match(
    versionCenterPageSource,
    /const canDispatch = Boolean\([\s\S]*?summaryFresh/u
  )
  assert.match(
    databaseMigrationPageSource,
    /const canPrepare =[\s\S]*?summaryFresh/u
  )
  assert.match(
    databaseMigrationPageSource,
    /disabled=\{!summaryFresh \|\| Boolean\(actionKey\)\}/u
  )
})
