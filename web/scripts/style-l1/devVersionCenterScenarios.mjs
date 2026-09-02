import { validateDevDeliverySummary } from '../../src/dev-workbench/config/devDelivery.mjs'
import { createQualityGateStyleSummary } from './devQualityGateScenarios.mjs'

const ASSETS = [
  'checksums.sha256',
  'release-artifact.json',
  'release-manifest.json',
  'release-rehearsal.json',
  'sbom.cdx.json',
  'server-image.tar',
  'web-image.tar',
]

function deliverySha(index) {
  return index.toString(16).padStart(40, '0')
}

function buildPerformance() {
  return {
    schemaVersion: 'plush.release-build-performance/v1',
    durationMs: 240_000,
    cacheMode: 'gha',
    completedVertexCount: 20,
    cacheHitCount: 16,
    cacheMissCount: 4,
    cacheHitRateBasisPoints: 8_000,
  }
}

function operationMetrics({ transferred = false } = {}) {
  return {
    transferBytes: transferred ? 620_000_000 : null,
    transferDurationMs: transferred ? 62_000 : null,
    transferBytesPerSecond: transferred ? 10_000_000 : null,
    serverArchiveBytes: transferred ? 510_000_000 : null,
    webArchiveBytes: transferred ? 110_000_000 : null,
    backupSizeBytes: transferred ? 84_000_000 : null,
    serverDigest: transferred ? `sha256:${'c'.repeat(64)}` : null,
    webDigest: transferred ? `sha256:${'d'.repeat(64)}` : null,
    buildPerformance: null,
  }
}

function operationIdempotency(
  operationId,
  { attempt = 1, retryOfOperationId = null, requestCount = 1 } = {}
) {
  return {
    attempt,
    retryOfOperationId,
    rootOperationId: retryOfOperationId || operationId,
    requestCount,
    reuseCount: requestCount - 1,
    basis: ['action', 'target', 'git_sha', 'version', 'delivery_inputs'],
  }
}

function operationRetry(status) {
  const allowed = ['failed', 'blocked'].includes(status)
  return {
    allowed,
    reason: allowed
      ? 'explicit_retry_available'
      : status === 'not_proven'
        ? 'target_readback_required'
        : status === 'passed'
          ? 'terminal_no_retry_needed'
          : 'operation_in_progress',
  }
}

export function createVersionCenterSummary() {
  const versions = Array.from({ length: 14 }, (_, offset) => {
    const sequence = 14 - offset
    const gitSha = deliverySha(sequence)
    return {
      schemaVersion: 'plush.delivery-version/v1',
      status: 'published',
      tag: `artifact-${gitSha}`,
      gitSha,
      version: `2026.08.08-${String(sequence)}`,
      publishedAt: new Date(Date.UTC(2026, 7, 8, sequence, 0, 0)).toISOString(),
      url: `https://github.com/saurick/plush-toy-erp/releases/tag/artifact-${gitSha}`,
      assets: ASSETS,
      artifactSummary: {
        totalBytes: 1_300_000_000 + sequence,
        serverImageBytes: 1_000_000_000,
        webImageBytes: 220_000_000,
        sbomBytes: 10_000,
      },
      buildPerformance: buildPerformance(),
      imageDigests: {
        server: `sha256:${'c'.repeat(64)}`,
        web: `sha256:${'d'.repeat(64)}`,
      },
      completeAssets: true,
      promotionEligible: true,
    }
  })
  const currentVersion = versions[7]
  versions.forEach((version, index) => {
    if (index < 7) {
      version.actionClass = 'promote'
      version.actionReason = 'candidate_descends_from_current'
    } else if (index === 7) {
      version.actionClass = 'current'
      version.actionReason = 'exact_sha_current'
    } else {
      version.actionClass = 'rollback'
      version.actionReason = 'candidate_is_ancestor_of_current'
    }
    version.actionsByTarget = {
      'customer-test-133': {
        actionClass: version.actionClass,
        actionReason: version.actionReason,
      },
      'demo-133': {
        actionClass: version.actionClass,
        actionReason: version.actionReason,
      },
    }
  })
  const readyVersion = versions[6]
  const openOperation = {
    id: 'f0000001-0000-4000-8000-000000000001',
    action: 'promote',
    target: 'customer-test-133',
    gitSha: readyVersion.gitSha,
    version: readyVersion.version,
    status: 'ready',
    terminal: false,
    revision: 2,
    createdAt: '2026-08-09T01:00:00.000Z',
    updatedAt: '2026-08-09T01:00:30.000Z',
    durationMs: 30_000,
    confirmationRequired: `DEPLOY ${readyVersion.gitSha} TO customer-test-133`,
    stages: [
      {
        id: 'preflight',
        label: '固定目标只读预检',
        status: 'ready',
        durationMs: 30_000,
      },
    ],
    issues: [],
    events: [
      {
        status: 'ready',
        at: '2026-08-09T01:00:30.000Z',
        message:
          'promotion plan is eligible and requires explicit confirmation',
      },
    ],
    metrics: operationMetrics(),
    idempotency: operationIdempotency('f0000001-0000-4000-8000-000000000001', {
      requestCount: 2,
    }),
    retry: operationRetry('ready'),
  }
  const historyOperations = Array.from({ length: 12 }, (_, offset) => {
    const sequence = offset + 1
    const version = versions[offset + 1]
    const isPromotion = sequence % 2 === 1
    const status = sequence === 1 ? 'failed' : 'passed'
    const operationId = `a${String(sequence).padStart(7, '0')}-0000-4000-8000-${String(sequence).padStart(12, '0')}`
    return {
      id: operationId,
      action: isPromotion ? 'promote' : 'release',
      target: isPromotion ? 'customer-test-133' : 'github-release',
      gitSha: version.gitSha,
      version: version.version,
      status,
      terminal: true,
      revision: 3,
      createdAt: new Date(
        Date.UTC(2026, 7, 8, 13 - offset, 0, 0)
      ).toISOString(),
      updatedAt: new Date(
        Date.UTC(2026, 7, 8, 13 - offset, 0, 2)
      ).toISOString(),
      durationMs: 120_000,
      confirmationRequired: null,
      stages: [
        {
          id: 'completed',
          label: isPromotion
            ? '部署与基础运行核验'
            : 'GitHub release pipeline accepted; waiting for terminal assets',
          status,
          durationMs: 120_000,
        },
      ],
      issues:
        status === 'failed'
          ? [
              {
                code: 'release_dispatch_failed',
                level: 'error',
                message: '发布调度失败，未写入任何 demo/test 目标',
              },
            ]
          : [],
      events: [
        {
          status,
          at: new Date(Date.UTC(2026, 7, 8, 13 - offset, 0, 2)).toISOString(),
          message:
            status === 'failed'
              ? 'promotion preparation failed without starting a target write'
              : isPromotion
                ? 'target promotion and basic runtime verification passed'
                : 'immutable GitHub release and complete assets are published',
        },
      ],
      metrics: operationMetrics({ transferred: isPromotion }),
      idempotency: operationIdempotency(operationId, {
        requestCount: sequence === 2 ? 3 : 1,
      }),
      retry: operationRetry(status),
    }
  })
  const targetPreflight = ({
    target,
    purpose,
    endpoint,
    containerPrefix,
    trialTarget,
  }) => ({
    schemaVersion: 'plush.target-preflight/v1',
    generatedAt: '2026-08-09T02:00:00.000Z',
    status: 'passed',
    target,
    purpose,
    customer: 'yoyoosun',
    trialTarget,
    remote: {
      runtime: {
        serverSha: currentVersion.gitSha,
        webSha: currentVersion.gitSha,
      },
      capacity: {
        availableBytes: 80_000_000_000,
        minimumAvailableBytes: 20_000_000_000,
      },
      publicEntry: {
        status: 'passed',
        container: `${containerPrefix}${currentVersion.gitSha.slice(0, 8)}`,
        gitSha: currentVersion.gitSha,
        health: 'passed',
        provider: 'passed',
        endpoint,
      },
    },
  })
  const customerTestTarget = targetPreflight({
    target: 'customer-test-133',
    purpose: 'customer-clean-acceptance',
    endpoint: 'https://test.yoyoosun.net',
    containerPrefix: 'plush-toy-erp-test-web-public-',
    trialTarget: 'none',
  })
  const demoTarget = targetPreflight({
    target: 'demo-133',
    purpose: 'project-demo-simulated',
    endpoint: 'https://demo.yoyoosun.net',
    containerPrefix: 'plush-toy-erp-demo-web-public-',
    trialTarget: 'customer-trial-133',
  })

  return validateDevDeliverySummary({
    schemaVersion: 'plush.dev-delivery-summary/v1',
    status: 'success',
    generatedAt: '2026-08-09T02:00:00.000Z',
    releaseVersionPolicy: {
      schemaVersion: 'plush.release-version-catalog/v1',
      timeZone: 'Asia/Shanghai',
      date: '2026.08.09',
      nextVersion: '2026.08.09-1',
      officialVersionCount: versions.length,
      dateVersionCount: 0,
    },
    repository: {
      commit: versions[0].gitSha,
      dirty: false,
      fingerprint: 'b'.repeat(64),
    },
    versions,
    target: demoTarget,
    targets: [
      {
        key: 'demo-133',
        purpose: 'project-demo-simulated',
        endpoint: 'https://demo.yoyoosun.net',
        preflight: demoTarget,
        initializationPreflight: null,
      },
      {
        key: 'customer-test-133',
        purpose: 'customer-clean-acceptance',
        endpoint: 'https://test.yoyoosun.net',
        preflight: customerTestTarget,
        initializationPreflight: null,
      },
    ],
    operations: [openOperation, ...historyOperations],
    timings: {
      schemaVersion: 'plush.delivery-pipeline-timings/v1',
      generatedAt: '2026-08-09T02:00:00.000Z',
      runs: [
        {
          id: 9_001,
          attempt: 1,
          workflow: 'release',
          event: 'workflow_dispatch',
          status: 'completed',
          conclusion: 'success',
          gitSha: versions[0].gitSha,
          createdAt: '2026-08-09T01:00:00.000Z',
          startedAt: '2026-08-09T01:00:10.000Z',
          finishedAt: '2026-08-09T01:08:10.000Z',
          queueMs: 10_000,
          durationMs: 480_000,
          url: 'https://github.com/saurick/plush-toy-erp/actions/runs/9001',
          jobs: [
            {
              id: 9_101,
              name: 'Exact-SHA strict quality',
              status: 'completed',
              conclusion: 'success',
              startedAt: '2026-08-09T01:00:10.000Z',
              finishedAt: '2026-08-09T01:03:10.000Z',
              durationMs: 180_000,
              steps: [
                {
                  number: 1,
                  name: 'Run the exact-SHA strict terminal once',
                  status: 'completed',
                  conclusion: 'success',
                  startedAt: '2026-08-09T01:00:10.000Z',
                  finishedAt: '2026-08-09T01:03:10.000Z',
                  durationMs: 180_000,
                },
              ],
            },
            {
              id: 9_102,
              name: 'Publish immutable artifact set',
              status: 'completed',
              conclusion: 'success',
              startedAt: '2026-08-09T01:03:10.000Z',
              finishedAt: '2026-08-09T01:08:00.000Z',
              durationMs: 290_000,
              steps: [
                {
                  number: 1,
                  name: 'Build both images',
                  status: 'completed',
                  conclusion: 'success',
                  startedAt: '2026-08-09T01:03:10.000Z',
                  finishedAt: '2026-08-09T01:07:10.000Z',
                  durationMs: 240_000,
                },
                {
                  number: 2,
                  name: 'Publish assets',
                  status: 'completed',
                  conclusion: 'success',
                  startedAt: '2026-08-09T01:07:10.000Z',
                  finishedAt: '2026-08-09T01:08:00.000Z',
                  durationMs: 50_000,
                },
              ],
            },
          ],
        },
      ],
    },
    issues: [],
    boundaries: {
      provider: 'github',
      releaseDispatchAllowed: true,
      target: 'demo-133',
      targets: ['demo-133', 'customer-test-133'],
      browserShellAccess: false,
      targetBuildAllowed: false,
      automaticRetryAllowed: false,
    },
  })
}

export async function installDeliverySummaryRoute(page, onRequest = () => {}) {
  const summary = createVersionCenterSummary()
  await page.route('**/__dev/api/delivery/summary', async (route) => {
    onRequest()
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(summary),
    })
  })
  return summary
}

export async function installDataPreparationContractFailureRoute(page) {
  await page.route('**/__dev/api/data-preparation/summary', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        schemaVersion: 'plush.dev-data-preparation-summary/v1',
      }),
    })
  })
}

export async function installSummaryRoute(page, onRequest = () => {}) {
  const summary = await installDeliverySummaryRoute(page, onRequest)
  const qualityGateSummary = createQualityGateStyleSummary('passed')
  const strictReceipt = {
    ...qualityGateSummary.operations[0].receipt,
    gitCommit: summary.repository.commit,
  }
  qualityGateSummary.repository = {
    ...qualityGateSummary.repository,
    commit: summary.repository.commit,
    dirty: false,
  }
  qualityGateSummary.proofs.strict = {
    profile: 'strict',
    status: 'passed',
    current: true,
    releaseEligible: true,
    reused: true,
    receipt: strictReceipt,
  }
  qualityGateSummary.status = {
    ...qualityGateSummary.status,
    tone: 'success',
    title: '当前发布 SHA 已通过严格门禁',
    releaseEligible: true,
  }
  await page.route('**/__dev/api/qa/quality-gates', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(qualityGateSummary),
    })
  })
  await page.route('**/__dev/api/delivery/operations/*', async (route) => {
    const operationId = new URL(route.request().url()).pathname
      .split('/')
      .at(-1)
    const operation = summary.operations.find((item) => item.id === operationId)
    await route.fulfill({
      status: operation ? 200 : 404,
      contentType: 'application/json',
      body: JSON.stringify(
        operation
          ? {
              schemaVersion: 'plush.dev-delivery-operation-result/v1',
              operation,
            }
          : { message: 'Operation 不存在' }
      ),
    })
  })
}

async function waitForView(page, view) {
  await page.waitForURL((url) => url.searchParams.get('view') === view, {
    timeout: 10_000,
  })
  await page
    .getByRole('tab', {
      name:
        view === 'versions'
          ? '版本与部署'
          : view === 'pipeline'
            ? '流水线耗时'
            : '操作记录',
    })
    .waitFor({ state: 'visible', timeout: 10_000 })
}

export function createDevVersionCenterScenarios({
  assert,
  assertNoHorizontalOverflow,
  expectHeading,
}) {
  let summaryRequests = 0

  return [
    {
      name: 'dev-version-center-tabs-pagination-desktop',
      path: '/__dev/version-center',
      viewport: { width: 1440, height: 900 },
      beforeNavigate: async (page) => {
        summaryRequests = 0
        await installSummaryRoute(page, () => {
          summaryRequests += 1
        })
      },
      verify: async (page) => {
        await expectHeading(page, '版本发布与部署中心')
        await waitForView(page, 'versions')
        await page
          .locator('.erp-dev-version-workspace')
          .waitFor({ state: 'visible' })
        const evidenceNote = page.locator(
          '.erp-dev-version-workspace__evidence-note'
        )
        await evidenceNote.waitFor({ state: 'visible', timeout: 10_000 })
        assert.equal(
          (await evidenceNote.textContent())?.replace(/\s+/gu, ' ').trim(),
          'CI/CD 证据分两处查看：流水线耗时看 GitLab 的 CI 检查、构建和制品发布耗时；操作记录看工作台发起的发布、目标部署、回滚和数据重建结果。'
        )
        const evidenceNoteBox = await evidenceNote.boundingBox()
        const tabNavigationBox = await page
          .locator('.erp-dev-version-workspace .ant-tabs-nav')
          .boundingBox()
        assert(evidenceNoteBox && tabNavigationBox)
        assert(
          evidenceNoteBox.y + evidenceNoteBox.height <= tabNavigationBox.y + 1,
          'CI/CD 说明不得覆盖页签'
        )
        assert.equal(
          await page.locator('.erp-dev-environment-evidence').count(),
          0
        )
        const initialSummaryRequests = summaryRequests
        assert(initialSummaryRequests > 0)

        const targetSelector = page.getByLabel('切换当前操作目标')
        await targetSelector
          .getByText('test 甲方测试验收', { exact: true })
          .click()
        await page.getByText('test 数据方式', { exact: true }).waitFor()
        await page
          .getByText('普通部署默认保留现有数据', { exact: true })
          .waitFor()
        assert.equal(
          await page
            .getByRole('button', { name: '清空并重建测试数据' })
            .isDisabled(),
          true,
          'an existing target operation must keep the destructive action disabled'
        )

        await page.getByRole('tab', { name: '操作记录' }).click()
        await waitForView(page, 'history')
        await page
          .locator('.erp-dev-version-tab--history')
          .waitFor({ state: 'visible' })
        assert.equal(await evidenceNote.isVisible(), true)

        await page.getByRole('tab', { name: '流水线耗时' }).click()
        await waitForView(page, 'pipeline')
        assert.equal(await evidenceNote.isVisible(), true)
        const timingDetails = page.locator('.erp-dev-pipeline-timing__details')
        await timingDetails.waitFor({ state: 'visible' })
        assert.equal(
          await timingDetails.evaluate((element) => element.open),
          false
        )
        await timingDetails.locator(':scope > summary').click()
        assert.equal(
          await timingDetails.evaluate((element) => element.open),
          true
        )

        await page.getByRole('tab', { name: '版本与部署' }).click()
        await waitForView(page, 'versions')
        await page
          .locator('.erp-dev-version-tab--versions .ant-pagination-item-2')
          .click()
        await page
          .locator('.erp-dev-version-tab--versions')
          .getByText('2026.08.08-8', { exact: true })
          .waitFor()
        assert.equal(summaryRequests, initialSummaryRequests)
        await assertNoHorizontalOverflow(
          page,
          'dev-version-center-tabs-pagination-desktop'
        )
        await page.getByRole('tab', { name: '流水线耗时' }).click()
        await waitForView(page, 'pipeline')
        await page
          .locator('.erp-dev-pipeline-timing')
          .waitFor({ state: 'visible' })
        assert.equal(await evidenceNote.isVisible(), true)
        await assertNoHorizontalOverflow(
          page,
          'dev-version-center-tabs-pagination-desktop-pipeline'
        )
      },
    },
  ]
}
