import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  DEV_DELIVERY_ACTION_API_PATH,
  DEV_DELIVERY_OPERATION_API_PREFIX,
  DEV_DELIVERY_SESSION_API_PATH,
  DEV_DELIVERY_SOURCE_PATH,
  DEV_DELIVERY_SUMMARY_API_PATH,
  DEV_VERSION_CENTER_HISTORY_PAGE_SIZE,
  DEV_VERSION_CENTER_ROUTE,
  DEV_VERSION_CENTER_VERSION_PAGE_SIZE,
  DEV_VERSION_CENTER_VIEW_HISTORY,
  DEV_VERSION_CENTER_VIEW_PIPELINE,
  DEV_VERSION_CENTER_VIEW_VERSIONS,
  createDeliveryIdempotencyKey,
  createDevDeliveryClient,
  deliveryOperationMessagePresentation,
  deliveryIdempotencyPresentation,
  deliveryPipelinePresentation,
  deliveryPipelineRunMode,
  deliveryPipelineRunModePresentation,
  deliveryRetryPresentation,
  deliveryStatusPresentation,
  deliveryTargetCachePresentation,
  deliveryVersionActionKind,
  findLatestTransferredPromotion,
  formatDeliveryBytes,
  formatDeliveryDuration,
  formatDeliveryPercent,
  formatDeliveryRate,
  formatDeliveryTimestamp,
  resolveDevVersionCenterView,
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
const workflowSources = ['ci.yml', 'release.yml'].map((name) =>
  readFileSync(
    new URL(`../../../../.github/workflows/${name}`, import.meta.url),
    'utf8'
  )
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
    releaseVersionPolicy: {
      schemaVersion: 'plush.release-version-catalog/v1',
      timeZone: 'Asia/Shanghai',
      date: '2026.07.29',
      nextVersion: '2026.07.29-2',
      officialVersionCount: 1,
      dateVersionCount: 1,
    },
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
        assets: [
          'checksums.sha256',
          'release-artifact.json',
          'release-manifest.json',
          'sbom.cdx.json',
          'server-image.tar',
          'web-image.tar',
        ],
        artifactSummary: {
          totalBytes: 1_265_345_566,
          serverImageBytes: 1_029_740_032,
          webImageBytes: 235_604_992,
          sbomBytes: 542,
        },
        buildPerformance: {
          schemaVersion: 'plush.release-build-performance/v1',
          durationMs: 240_000,
          cacheMode: 'gha',
          completedVertexCount: 20,
          cacheHitCount: 16,
          cacheMissCount: 4,
          cacheHitRateBasisPoints: 8_000,
        },
        imageDigests: {
          server: `sha256:${'c'.repeat(64)}`,
          web: `sha256:${'d'.repeat(64)}`,
        },
        completeAssets: true,
        promotionEligible: false,
        actionClass: 'blocked',
        actionReason: 'target_identity_unavailable',
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
        metrics: {
          transferBytes: 1_265_345_566,
          transferDurationMs: 65_000,
          transferBytesPerSecond: 19_466_855,
          serverArchiveBytes: 1_029_740_032,
          webArchiveBytes: 235_604_992,
          backupSizeBytes: 612_412,
          serverDigest: `sha256:${'c'.repeat(64)}`,
          webDigest: `sha256:${'d'.repeat(64)}`,
          buildPerformance: null,
        },
        issues: [],
        events: [
          {
            status: 'passed',
            at: '2026-07-29T01:02:00.000Z',
            message: 'immutable GitHub release is published',
          },
        ],
        idempotency: {
          attempt: 1,
          retryOfOperationId: null,
          rootOperationId: '11111111-1111-4111-8111-111111111111',
          requestCount: 2,
          reuseCount: 1,
          basis: ['action', 'target', 'git_sha', 'version', 'delivery_inputs'],
        },
        retry: {
          allowed: false,
          reason: 'terminal_no_retry_needed',
        },
        confirmationRequired: '',
        terminal: true,
      },
    ],
    timings: null,
    issues: [],
    boundaries: {
      provider: 'gitlab',
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

test('latest transferred promotion ignores same-SHA no-op receipts', () => {
  const alreadyCurrent = {
    action: 'promote',
    status: 'passed',
    durationMs: 2_650,
    metrics: {
      transferBytes: null,
      transferDurationMs: null,
    },
  }
  const targetWrite = {
    action: 'promote',
    status: 'passed',
    durationMs: 187_869,
    metrics: {
      transferBytes: 1_325_933_237,
      transferDurationMs: 114_267,
      transferBytesPerSecond: 11_603_816,
    },
  }

  assert.equal(
    findLatestTransferredPromotion([alreadyCurrent, targetWrite]),
    targetWrite
  )
  assert.equal(findLatestTransferredPromotion([alreadyCurrent]), null)
  assert.equal(findLatestTransferredPromotion(null), null)
})

test('target cache metrics require exact identity evidence and use Chinese presentation', () => {
  const metrics = {
    ...summaryFixture().operations[0].metrics,
    targetCacheHit: true,
    targetImageCacheHit: true,
    targetCacheSource: 'formal',
    avoidedTransferBytes: 1_325_933_239,
    avoidedTransferDurationMs: 114_267,
    avoidedTransferBaselineOperationId: '22222222-2222-4222-8222-222222222222',
    dockerLoadSkipped: true,
    cacheBasis: [
      'release_manifest_sha256',
      'archive_sha256',
      'registry_digest',
      'docker_content_id',
      'embedded_git_sha',
    ],
    stillExecutedChecks: ['migration', 'health', 'ready', 'public_entry'],
  }
  const summary = summaryFixture()
  summary.operations[0] = { ...summary.operations[0], metrics }
  assert.equal(validateDevDeliverySummary(summary).status, 'success')
  assert.deepEqual(deliveryTargetCachePresentation(metrics), {
    status: '目标缓存命中',
    source: '正式保留版本缓存',
    basis: [
      '发布清单校验和',
      '制品归档校验和',
      '镜像仓库摘要',
      'Docker 内容标识',
      '镜像内完整 Git SHA',
    ],
    stillExecuted: ['数据库迁移', '健康检查', '就绪检查', '公网入口读回'],
  })
  assert.throws(
    () =>
      validateDevDeliverySummary({
        ...summary,
        operations: [
          {
            ...summary.operations[0],
            metrics: { ...metrics, cacheBasis: ['archive_sha256'] },
          },
        ],
      }),
    /operation/u
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
  for (const publishedAt of ['', 'not-a-date', '2026-07-29']) {
    assert.throws(
      () =>
        validateDevDeliverySummary({
          ...summaryFixture(),
          versions: [
            {
              ...summaryFixture().versions[0],
              publishedAt,
            },
          ],
        }),
      /version/u
    )
  }
  const deployed = {
    ...summaryFixture(),
    target: {
      status: 'passed',
      remote: {
        runtime: { serverSha: SHA, webSha: SHA },
        publicEntry: {
          status: 'passed',
          container: `plush-toy-erp-web-public-${SHA.slice(0, 8)}`,
          gitSha: SHA,
          health: 'passed',
          provider: 'passed',
          endpoint: 'https://admin.yoyoosun.net',
        },
      },
    },
  }
  assert.equal(validateDevDeliverySummary(deployed).target.status, 'passed')
  assert.throws(
    () =>
      validateDevDeliverySummary({
        ...deployed,
        target: {
          ...deployed.target,
          remote: {
            ...deployed.target.remote,
            publicEntry: {
              ...deployed.target.remote.publicEntry,
              gitSha: 'f'.repeat(40),
            },
          },
        },
      }),
    /target evidence/u
  )
  const blockedTarget = {
    ...deployed,
    target: {
      ...deployed.target,
      status: 'blocked',
      remote: {
        runtime: { serverSha: SHA, webSha: 'unknown' },
        publicEntry: {
          ...deployed.target.remote.publicEntry,
          status: 'blocked',
          gitSha: 'unknown',
          health: 'failed',
          provider: 'failed',
        },
      },
    },
  }
  assert.equal(
    validateDevDeliverySummary(blockedTarget).target.status,
    'blocked'
  )
  assert.throws(
    () =>
      validateDevDeliverySummary({
        ...summaryFixture(),
        versions: [
          {
            ...summaryFixture().versions[0],
            buildPerformance: {
              ...summaryFixture().versions[0].buildPerformance,
              cacheHitCount: 19,
            },
          },
        ],
      }),
    /version/u
  )
})

test('delivery summary accepts dedicated database rebuild records without generic retry', () => {
  const summary = summaryFixture()
  summary.operations = [
    {
      ...summary.operations[0],
      action: 'rebuild-database',
      target: 'test-133',
      status: 'failed',
      stages: summary.operations[0].stages.map((stage) => ({
        ...stage,
        status: 'failed',
      })),
      events: [
        {
          status: 'failed',
          at: summary.operations[0].updatedAt,
          message: 'database rebuild failed within a recovered boundary',
        },
      ],
      retry: {
        allowed: false,
        reason: 'action_not_retryable',
      },
    },
  ]

  const operation = validateDevDeliverySummary(summary).operations[0]
  assert.equal(operation.action, 'rebuild-database')
  assert.deepEqual(operation.retry, {
    allowed: false,
    reason: 'action_not_retryable',
  })
})

test('delivery operations require timezone-bearing ordered event timestamps', () => {
  const assertInvalidTimeline = (change) => {
    const summary = summaryFixture()
    const operation = {
      ...summary.operations[0],
      events: summary.operations[0].events.map((event) => ({ ...event })),
    }
    summary.operations = [change(operation)]
    assert.throws(() => validateDevDeliverySummary(summary), /operation/u)
  }

  assertInvalidTimeline((operation) => ({
    ...operation,
    createdAt: '2026-07-29T01:00:00',
  }))
  assertInvalidTimeline((operation) => ({
    ...operation,
    updatedAt: '2026-07-29T00:59:00.000Z',
    events: [
      {
        ...operation.events[0],
        at: '2026-07-29T00:59:00.000Z',
      },
    ],
  }))
  assertInvalidTimeline((operation) => ({ ...operation, events: [] }))
  assertInvalidTimeline((operation) => ({
    ...operation,
    idempotency: { ...operation.idempotency, reuseCount: 3 },
  }))
  assertInvalidTimeline((operation) => ({
    ...operation,
    retry: { allowed: true, reason: 'explicit_retry_available' },
  }))
  assertInvalidTimeline((operation) => ({
    ...operation,
    events: [{ ...operation.events[0], at: '2026-07-29T01:02:00' }],
  }))
  assertInvalidTimeline((operation) => ({
    ...operation,
    events: [{ ...operation.events[0], status: 'running' }],
  }))
  assertInvalidTimeline((operation) => ({
    ...operation,
    events: [{ ...operation.events[0], message: '' }],
  }))
  assertInvalidTimeline((operation) => ({
    ...operation,
    events: [
      {
        status: 'running',
        at: '2026-07-29T01:01:30.000Z',
        message: 'operation is running',
      },
      {
        status: 'running',
        at: '2026-07-29T01:01:00.000Z',
        message: 'event order drifted',
      },
      operation.events[0],
    ],
  }))
  assertInvalidTimeline((operation) => ({
    ...operation,
    events: [
      {
        ...operation.events[0],
        at: '2026-07-29T01:01:59.000Z',
      },
    ],
  }))
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
  assert.equal(
    createDeliveryIdempotencyKey(
      'retry',
      () => '11111111-1111-4111-8111-111111111111'
    ),
    'version-center:retry:11111111-1111-4111-8111-111111111111'
  )
  assert.deepEqual(
    deliveryIdempotencyPresentation(summaryFixture().operations[0].idempotency),
    {
      label: '首次执行，已合并 1 个重复请求',
      basis: ['交付动作', '固定目标', 'Exact-SHA', '版本', '发布输入'],
    }
  )
  assert.equal(
    deliveryRetryPresentation({ reason: 'target_readback_required' }),
    '结果未知，必须先读回目标'
  )
  assert.equal(
    deliveryRetryPresentation({ reason: 'action_not_retryable' }),
    '该动作须返回专用流程处理，不能在此重试'
  )
  assert.equal(shortGitSha(SHA), 'aaaaaaaaaaaa')
  assert.equal(shortGitSha('bad'), '未证明')
  assert.equal(formatDeliveryBytes(30 * 1024 ** 3), '30.0 GiB')
  assert.equal(formatDeliveryBytes(512), '512 B')
  assert.equal(formatDeliveryRate(20 * 1024 ** 2), '20.0 MiB/s')
  assert.equal(formatDeliveryPercent(8_125), '81.3%')
  assert.equal(formatDeliveryDuration(950), '950 ms')
  assert.equal(formatDeliveryDuration(5_400), '5.4 秒')
  assert.equal(formatDeliveryDuration(125_000), '2 分 5 秒')
  assert.match(
    formatDeliveryTimestamp('2026-07-29T01:02:03.000Z'),
    /^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/u
  )
  assert.equal(
    formatDeliveryTimestamp('not-a-date', '发布时间未证明'),
    '发布时间未证明'
  )
  assert.equal(deliveryStatusPresentation('not_proven').label, '结果未证明')
  assert.equal(deliveryStatusPresentation('success').label, '成功')
  assert.equal(
    deliveryOperationMessagePresentation(
      'target promotion and basic runtime verification passed'
    ).label,
    '133 部署与基础运行核验已通过'
  )
  assert.equal(
    deliveryOperationMessagePresentation(
      'fresh database generation and basic runtime verification passed'
    ).label,
    '全新数据库代与基础运行核验已通过'
  )
  assert.match(
    deliveryOperationMessagePresentation('Future executor event').title,
    /Future executor event/u
  )
  assert.equal(
    deliveryPipelineRunModePresentation('exact_sha_reuse'),
    '相同 SHA 幂等复用'
  )
})

test('pipeline jobs and timing stages use Chinese-first presentation labels', () => {
  assert.equal(
    deliveryPipelinePresentation('plan').label,
    '可信提交范围与影响计划'
  )
  assert.equal(
    deliveryPipelinePresentation('publish_release').label,
    '发布不可变制品集'
  )
  for (const source of workflowSources) {
    const names = [...source.matchAll(/^(?: {4}name:| {6}- name:) (.+)$/gmu)]
      .map((match) => match[1].trim())
      .filter(Boolean)
    assert.ok(names.length > 0)
    for (const name of names) {
      const presentation = deliveryPipelinePresentation(name)
      assert.notEqual(
        presentation.label,
        '其他流水线环节',
        `${name} must have a Chinese presentation label`
      )
      assert.match(presentation.label, /\p{Script=Han}/u)
      assert.ok(presentation.title.includes(name))
    }
  }
  assert.equal(
    deliveryPipelinePresentation('Initialize containers').label,
    '初始化测试容器'
  )
  assert.equal(
    deliveryPipelinePresentation('Post Set up Node.js').label,
    '清理：准备 Node.js 工具链'
  )
  assert.equal(
    deliveryPipelinePresentation('Future GitHub step').label,
    '其他流水线环节'
  )
  assert.match(
    deliveryPipelinePresentation('Future GitHub step').title,
    /Future GitHub step/u
  )
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
        url: 'https://gitlab.saurick.me/saurick/plush-toy-erp/-/pipelines/321',
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
  assert.equal(summary.bottleneck.startedAt, '2026-08-08T02:00:30.000Z')
  assert.equal(summary.bottleneck.finishedAt, '2026-08-08T02:08:30.000Z')
  assert.equal(summary.criticalPath.durationMs, 600_000)
  assert.equal(summary.criticalPath.coveredDurationMs, 580_000)
  assert.equal(summary.criticalPath.schedulingGapMs, 20_000)
  assert.deepEqual(
    summary.criticalPath.jobs.map((job) => job.name),
    ['Publish immutable release']
  )
  assert.equal(summary.failureReason, null)
  assert.match(summary.optimizationHint, /耗时最长/u)
  const reuseRun = {
    ...timings.runs[0],
    id: 320,
    durationMs: 24_000,
    url: 'https://github.com/saurick/plush-toy-erp/actions/runs/320',
    jobs: [
      {
        ...timings.runs[0].jobs[0],
        id: 650,
        name: 'Exact-SHA strict quality',
        conclusion: 'skipped',
        durationMs: 0,
        steps: [],
      },
      {
        ...timings.runs[0].jobs[0],
        id: 651,
        name: 'Publish immutable artifact set',
        conclusion: 'skipped',
        durationMs: 0,
        steps: [],
      },
    ],
  }
  assert.equal(deliveryPipelineRunMode(reuseRun), 'exact_sha_reuse')
  assert.equal(
    deliveryPipelineRunMode({
      ...reuseRun,
      jobs: [
        { ...reuseRun.jobs[0], conclusion: 'failure', durationMs: 0 },
        reuseRun.jobs[1],
      ],
    }),
    'full_release'
  )
  const reuseSummary = summarizePipelineTimings({
    ...timings,
    runs: [reuseRun, timings.runs[0]],
  })
  assert.equal(reuseSummary.latestMode, 'exact_sha_reuse')
  assert.strictEqual(reuseSummary.analysisRun, timings.runs[0])
  assert.equal(reuseSummary.fullReleaseSampleCount, 1)
  assert.match(reuseSummary.optimizationHint, /不参与完整构建瓶颈判断/u)
  const mixedSummary = summarizePipelineTimings({
    ...timings,
    runs: [
      timings.runs[0],
      {
        ...timings.runs[0],
        id: 322,
        workflow: 'ci',
        durationMs: 60_000,
        url: 'https://github.com/saurick/plush-toy-erp/actions/runs/322',
      },
    ],
  })
  assert.equal(mixedSummary.sampleCount, 1)
  assert.equal(mixedSummary.medianDurationMs, 600_000)
  const failedRun = {
    ...timings.runs[0],
    conclusion: 'failure',
    jobs: [
      {
        ...timings.runs[0].jobs[0],
        conclusion: 'failure',
        steps: [
          {
            ...timings.runs[0].jobs[0].steps[0],
            conclusion: 'failure',
          },
          timings.runs[0].jobs[0].steps[1],
        ],
      },
    ],
  }
  assert.deepEqual(
    summarizePipelineTimings({ ...timings, runs: [failedRun] }).failureReason,
    {
      job: 'Publish immutable release',
      step: 'Build both images',
      startedAt: '2026-08-08T02:00:30.000Z',
    }
  )
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

test('version actions use Git ancestry classes rather than publication time', () => {
  const current = {
    gitSha: 'b'.repeat(40),
    actionClass: 'current',
    actionReason: 'exact_sha_current',
  }
  assert.equal(
    deliveryVersionActionKind({
      gitSha: SHA,
      publishedAt: '2026-07-29T01:00:00.000Z',
      actionClass: 'promote',
      actionReason: 'candidate_descends_from_current',
    }),
    'promote'
  )
  assert.equal(
    deliveryVersionActionKind({
      gitSha: SHA,
      publishedAt: '2026-07-29T03:00:00.000Z',
      actionClass: 'rollback',
      actionReason: 'candidate_is_ancestor_of_current',
    }),
    'rollback'
  )
  assert.equal(deliveryVersionActionKind(current), 'current')
  assert.equal(
    deliveryVersionActionKind({
      gitSha: SHA,
      actionClass: 'blocked',
      actionReason: 'git_histories_diverged',
    }),
    'blocked'
  )
  assert.equal(
    deliveryVersionActionKind({ gitSha: SHA, publishedAt: '' }),
    'blocked'
  )
})

test('version center page does not expose shell, SSH or arbitrary target inputs', () => {
  const source = versionCenterPageSource
  assert.match(source, /exact SHA/u)
  assert.match(source, /test-133/u)
  assert.match(source, /查看详情/u)
  assert.match(source, /确认回滚/u)
  assert.match(source, /公网入口/u)
  assert.match(source, /入口与 133 版本一致/u)
  assert.match(source, /headAlreadyPublished/u)
  assert.match(source, /当前 SHA 已发布并部署，无需重复发布/u)
  assert.match(source, /deliveryOperationMessagePresentation/u)
  assert.match(source, /重建 133 数据库/u)
  assert.match(source, /查看发布当前 SHA 说明/u)
  assert.match(source, /先发布制品，不会直接部署到 133/u)
  assert.match(source, /“准备部署”和“确认部署”/u)
  assert.match(source, /trigger=\{\['hover', 'click'\]\}/u)
  assert.match(source, /人工接管说明/u)
  assert.match(source, /人工接管与应急发布说明/u)
  assert.match(source, /四处操作各管什么/u)
  assert.match(source, /Codex \/ 本地终端/u)
  assert.match(source, /先判断能不能继续/u)
  assert.match(source, /本页不创建 commit、不 push/u)
  assert.match(source, /在本页部署到 test-133/u)
  assert.match(source, /应急不等于绕过/u)
  assert.match(source, /禁止 force push、跳过质量门禁/u)
  assert.match(source, /manualTakeoverTriggerRef/u)
  assert.match(source, /afterClose=\{\(\) =>/u)
  assert.match(
    source,
    /人工接管说明[\s\S]*?发布当前 SHA[\s\S]*?查看发布当前 SHA 说明[\s\S]*?<\/header>/u
  )
  assert.doesNotMatch(
    source,
    /(?:spawn|child_process|192[.]168|\/home\/simon)/iu
  )
  assert.doesNotMatch(source, /name=["'](?:host|path|command|target)["']/iu)
  assert.doesNotMatch(
    source,
    /client[.]action\(['"](?:manual|emergency|takeover)/iu
  )
})

test('version center keeps critical state visible and uses stable tab pagination contracts', () => {
  assert.equal(
    resolveDevVersionCenterView(''),
    DEV_VERSION_CENTER_VIEW_VERSIONS
  )
  assert.equal(
    resolveDevVersionCenterView('unexpected'),
    DEV_VERSION_CENTER_VIEW_VERSIONS
  )
  assert.equal(
    resolveDevVersionCenterView(DEV_VERSION_CENTER_VIEW_PIPELINE),
    DEV_VERSION_CENTER_VIEW_PIPELINE
  )
  assert.equal(
    resolveDevVersionCenterView(DEV_VERSION_CENTER_VIEW_HISTORY),
    DEV_VERSION_CENTER_VIEW_HISTORY
  )
  assert.equal(DEV_VERSION_CENTER_VERSION_PAGE_SIZE, 6)
  assert.equal(DEV_VERSION_CENTER_HISTORY_PAGE_SIZE, 10)

  assert.match(versionCenterPageSource, /useSearchParams/u)
  assert.match(versionCenterPageSource, /label: '版本与部署'/u)
  assert.match(versionCenterPageSource, /label: 'CI\/CD 效能'/u)
  assert.match(versionCenterPageSource, /label: '操作记录'/u)
  assert.match(versionCenterPageSource, /幂等与受控重试/u)
  assert.match(versionCenterPageSource, /OperationIdempotencyText/u)
  assert.match(versionCenterPageSource, /retry-operation/u)
  assert.match(versionCenterPageSource, /再次尝试/u)
  assert.doesNotMatch(versionCenterPageSource, /label: '幂等/u)
  assert.match(versionCenterPageSource, /openOperations[.]map/u)
  assert.match(versionCenterPageSource, /dataSource=\{historyOperations\}/u)
  assert.match(versionCenterPageSource, /DevPipelineStatusStrip/u)
  assert.match(versionCenterPageSource, /erp-dev-version-published-at/u)
  assert.match(versionCenterPageSource, /发布于/u)
  assert.match(
    versionCenterPageSource,
    /<DevDeliveryTimestamp[\s\S]*?value=\{record[.]publishedAt\}[\s\S]*?action="发布于"/u
  )
  assert.match(
    versionCenterPageSource,
    /value=\{strictProof[?][.]receipt[?][.]finishedAt\}/u
  )
  assert.match(
    versionCenterPageSource,
    /value=\{versions\[0\][?][.]publishedAt\}/u
  )
  assert.match(versionCenterPageSource, /value=\{operation[.]createdAt\}/u)
  assert.match(versionCenterPageSource, /value=\{operation[.]updatedAt\}/u)
  assert.match(
    versionCenterPageSource,
    /value=\{operationDetail[.]createdAt\}/u
  )
  assert.match(
    versionCenterPageSource,
    /value=\{operationDetail[.]updatedAt\}/u
  )
  assert.match(versionCenterPageSource, /value=\{event[.]at\}/u)
  assert.match(
    versionCenterPageSource,
    /pageSize: DEV_VERSION_CENTER_VERSION_PAGE_SIZE[\s\S]*showSizeChanger: false/u
  )
  assert.match(
    versionCenterPageSource,
    /pageSize: DEV_VERSION_CENTER_HISTORY_PAGE_SIZE[\s\S]*showSizeChanger: false/u
  )
  assert.match(
    versionCenterPageSource,
    /未结束操作始终保持可见[\s\S]*openOperations[.]map[\s\S]*DevPipelineStatusStrip[\s\S]*<Tabs/u
  )
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
  assert.match(versionCenterPageSource, /正式版本号（由发布目录自动生成）/u)
  assert.match(
    versionCenterPageSource,
    /value=\{releaseVersion\}[\s\S]*?readOnly/u
  )
  assert.doesNotMatch(versionCenterPageSource, /setReleaseVersion/u)
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
