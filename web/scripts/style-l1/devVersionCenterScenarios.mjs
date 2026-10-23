import { DEV_DELIVERY_TARGETS, deliveryOperationRetryPolicy, filterDevOperationHistory, validateDevDeliverySummary } from '../../src/dev-workbench/config/devDelivery.mjs'
import { CI_WORKFLOW_SECTIONS } from '../../src/dev-workbench/config/devCiWorkflow.mjs'
import { createQualityGateStyleSummary } from './devQualityGateScenarios.mjs'
import { verifyMobileNavigationMotion as verifySlidingMotion } from './slidingMotionAssertions.mjs'
import { assertMermaidFits, assertMermaidZoomMode, switchMermaidLayout, waitForMermaidFit } from './mermaidViewerAssertions.mjs'

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
    version.actionsByTarget = Object.fromEntries(DEV_DELIVERY_TARGETS.map(({ key }) => [
      key,
      ['demo-133', 'customer-test-133'].includes(key)
        ? { actionClass: version.actionClass, actionReason: version.actionReason }
        : { actionClass: 'blocked', actionReason: 'target_identity_unavailable' },
    ]))
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
  const scopedHistory = [
    ...historyOperations.filter((operation) => operation.action === 'release').map((operation) => ({ ...operation, action: 'promote', target: 'customer-test-133' })),
    ...historyOperations.slice(0, 3).map((operation) => ({ ...operation, action: 'promote', target: 'demo-133' })),
    ...historyOperations.slice(0, 2).map((operation) => ({ ...operation, action: 'promote', target: 'production-133' })),
    { ...historyOperations[0], action: 'promote', target: 'test-133' },
  ].map((operation, index) => {
    const id = `b0000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`
    return { ...operation, id, idempotency: operationIdempotency(id), retry: deliveryOperationRetryPolicy(operation) }
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
    kind: 'plush.dev-delivery-summary',
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
    targets: DEV_DELIVERY_TARGETS.map(({ key, purpose, endpoint }) => ({
      key,
      purpose,
      endpoint,
      preflight: key === 'demo-133' ? demoTarget : key === 'customer-test-133' ? customerTestTarget : null,
      initializationPreflight: null,
    })),
    operations: [openOperation, ...historyOperations, ...scopedHistory],
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
      targets: DEV_DELIVERY_TARGETS.map(({ key }) => key),
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
  await page.route('**/__dev/api/delivery/operations?*', async (route) => {
    const query = Object.fromEntries(
      new URL(route.request().url()).searchParams
    )
    const all = summary.operations.filter((operation) =>
      operation.target === (query.target || 'demo-133') &&
      ['passed', 'failed', 'blocked', 'not_proven'].includes(operation.status)
    )
    const matches = filterDevOperationHistory(all, query)
    const pageSize = Number(query.pageSize || 10)
    const current = Math.min(
      Number(query.page || 1),
      Math.max(1, Math.ceil(matches.length / pageSize))
    )
    const counts = Object.fromEntries(
      ['passed', 'failed', 'blocked', 'not_proven'].map((status) => [
        status,
        matches.filter((operation) => operation.status === status).length,
      ])
    )
    const durations = matches
      .filter((operation) => operation.status === 'passed')
      .map((operation) => operation.durationMs)
      .sort((a, b) => a - b)
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        kind: 'plush.dev-delivery-history',
        target: query.target || 'demo-133',
        integrity: { unreadableOperations: 0, unreadableRequests: 0 },
        generatedAt: summary.generatedAt,
        total: all.length,
        matched: matches.length,
        page: current,
        pageSize,
        statistics: {
          counts,
          passedDurationSamples: durations.length,
          passedDurationMedianMs: durations.length
            ? durations[Math.floor(durations.length / 2)]
            : null,
        },
        operations: matches.slice((current - 1) * pageSize, current * pageSize),
      }),
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
        kind: 'plush.dev-data-preparation-summary',
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
              kind: 'plush.dev-delivery-operation-result',
              operation,
            }
          : { message: 'Operation 不存在' }
      ),
    })
  })
  return summary
}

async function waitForView(page, view) {
  await page.waitForURL((url) => url.searchParams.get('view') === view, {
    timeout: 10_000,
  })
  const label = { versions: '版本与部署', overview: '发布检查', pipeline: '发布与部署耗时', history: '操作记录' }[view]
  await page.locator('[role="tab"][aria-selected="true"]').filter({ hasText: label }).waitFor({ state: 'visible', timeout: 10_000 })
}

async function assertManualGuideViewport(page, assert) {
  const metrics = await page
    .locator('.erp-dev-version-guide-content')
    .evaluate((node) => {
      const content = node.getBoundingClientRect()
      return {
        left: content.left,
        right: content.right,
        width: innerWidth,
        height: innerHeight,
        contentHeight: content.height,
        dialogs: document.querySelectorAll('[role="dialog"]').length,
        header: document
          .querySelector('.erp-dev-version-guide-page > header')
          .getBoundingClientRect()
          .toJSON(),
        toc: document
          .querySelector('.erp-dev-version-guide-toc')
          .getBoundingClientRect()
          .toJSON(),
        scrollTop: scrollY,
        contentTop: content.top,
      }
    })
  assert(
    metrics.left >= 0 && metrics.right <= metrics.width + 1,
    '指引正文应适配页面宽度'
  )
  assert(metrics.contentHeight > metrics.height, '长指引应使用完整页面阅读')
  assert.equal(metrics.dialogs, 0, '独立指引页不应保留原弹窗')
  assert(Math.abs(metrics.header.left - 16) <= 1, '标题栏应与页面左侧留白对齐')
  assert(
    Math.abs(metrics.header.right - (metrics.width - 16)) <= 1,
    '标题栏应铺满页面可用宽度'
  )
  if (metrics.width > 900) {
    assert(
      Math.abs(metrics.left - metrics.toc.right - 16) <= 1,
      '目录与正文应保持统一栏间距'
    )
    if (metrics.scrollTop === 0) {
      assert(
        Math.abs(metrics.contentTop - metrics.toc.top) <= 1,
        '目录与正文应齐顶'
      )
      assert(
        Math.abs(metrics.toc.top - metrics.header.bottom - 16) <= 1,
        '目录应与标题栏保持统一间距'
      )
    }
  }
}

async function verifyHistoryIsolationRecovery(page, assert, assertNoHorizontalOverflow) {
        await installSummaryRoute(page)
        await page.route('**/__dev/api/delivery/summary', (route) => route.fulfill({
          status: 503, contentType: 'application/json', body: JSON.stringify({ message: '目标摘要暂不可读' }),
        }))
        await page.goto(new URL('/__dev/version-center?view=history&target=demo-133&customer=yoyoosun', page.url()).href)
        const history = page.locator('.erp-dev-version-tab--history')
        await history.getByText('共 3 条记录', { exact: true }).waitFor()
        const chooseScope = async (label) => {
          await history.getByRole('combobox', { name: '记录归属', exact: true }).press('ArrowDown')
          await page.locator('.ant-select-dropdown').filter({ visible: true }).getByText(label, { exact: true }).click()
        }
        // Detail reads remain usable when every remote summary read fails.
        const detailRead = page.waitForResponse((response) => response.url().includes('/__dev/api/delivery/operations/') && response.url().includes('target=demo-133') && response.status() === 200)
        await history.getByRole('button', { name: '查看详情', exact: true }).first().click()
        assert.equal((await (await detailRead).json()).operation.target, 'demo-133')
        await page.getByRole('dialog').waitFor({ state: 'visible' })
        await page.getByRole('dialog').getByText('操作耗时', { exact: true }).waitFor()
        await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click()
        await page.getByRole('dialog').waitFor({ state: 'hidden' })
        for (const [label, count] of [['test 环境', 12], ['erp 正式环境', 2], ['历史制品 · GitHub', 6], ['历史目标 test-133', 1]]) {
          await chooseScope(label)
          await history.getByText(`共 ${count} 条记录`, { exact: true }).waitFor()
          const texts = await history.locator('tbody tr').allTextContents()
          assert.equal(texts.some((text) => text.includes(label === '历史制品 · GitHub' ? 'test 环境' : 'GitHub Release')), false)
        }
        assert.equal(await history.getByRole('button', { name: '再次尝试', exact: true }).count(), 0)
        await history.getByText(/原始目标已退役/u).waitFor()
        // An old response that finishes after switching scope must never replace it.
        let releaseDemo
        let sawDemo
        const demoStarted = new Promise((resolve) => { sawDemo = resolve })
        const gate = new Promise((resolve) => { releaseDemo = resolve })
        await page.route('**/__dev/api/delivery/operations?*', async (route) => {
          if (new URL(route.request().url()).searchParams.get('target') !== 'demo-133') return route.fallback()
          sawDemo()
          await gate
          return route.fallback().catch(() => {})
        })
        await chooseScope('demo 环境')
        await demoStarted
        await chooseScope('erp 正式环境')
        await history.getByText('共 2 条记录', { exact: true }).waitFor()
        releaseDemo()
        await history.getByRole('button', { name: '刷新记录', exact: true }).click()
        await history.getByText('共 2 条记录', { exact: true }).waitFor()
        let failing = true
        await page.route('**/__dev/api/delivery/operations?*', (route) => failing
          ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: '连接暂时中断' }) })
          : route.fallback())
        await history.getByRole('button', { name: '刷新记录', exact: true }).click()
        await history.getByText('当前显示上次成功读回的操作记录', { exact: true }).waitFor()
        assert.equal(await history.locator('tbody tr[data-row-key]').count(), 2)
        failing = false
        await history.getByRole('button', { name: '重试读取', exact: true }).click()
        await history.getByRole('button', { name: '刷新记录', exact: true }).waitFor()
        await history.getByText('共 2 条记录', { exact: true }).waitFor()
        await assertNoHorizontalOverflow(page, 'dev-version-history-isolation-recovery-desktop')

        const gitlabSummary = await installSummaryRoute(page)
        gitlabSummary.boundaries.provider = 'gitlab'
        gitlabSummary.timings.runs[0].url = 'https://gitlab.saurick.me/saurick/plush-toy-erp/-/pipelines/9001'
        const archived = gitlabSummary.operations.find((item) => item.target === 'demo-133' && item.status === 'passed')
        archived.gitlabRecord = { status: 'recorded', mode: 'historical', deploymentId: 77, environmentUrl: 'https://gitlab.saurick.me/saurick/plush-toy-erp/-/environments/2', deploymentUrl: 'https://gitlab.saurick.me/saurick/plush-toy-erp/-/environments/2', evidenceUrl: 'https://gitlab.saurick.me/saurick/plush-toy-erp/-/packages/99' }
        await page.goto(new URL('/__dev/version-center?view=pipeline&target=demo-133&customer=yoyoosun', page.url()).href)
        const nativeLink = page.getByRole('link', { name: '在 GitLab 查看全部任务与日志', exact: true })
        await nativeLink.waitFor()
        assert.equal(await nativeLink.getAttribute('href'), gitlabSummary.timings.runs[0].url)
        assert.equal(await page.locator('.erp-dev-pipeline-timing__details').count(), 0)
        await page.getByRole('tab', { name: '操作记录', exact: true }).click()
        const recordLink = history.getByRole('link', { name: 'GitLab #77', exact: true })
        await recordLink.waitFor()
        assert.equal(await recordLink.getAttribute('href'), archived.gitlabRecord.deploymentUrl)
        const row = history.getByRole('row').filter({ hasText: 'GitLab #77' })
        assert.equal(await row.getByRole('button', { name: '补录 GitLab', exact: true }).count(), 0)
        await row.getByRole('button', { name: '查看详情', exact: true }).click()
        await page.getByRole('dialog').getByText('已登记 GitLab', { exact: true }).waitFor()
        await page.getByRole('dialog').getByText(/历史补录：本页保留实际执行时间/u).waitFor()
        await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click()
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
      path: '/__dev/version-center?view=history&view=pipeline&history_action=promote&history_action=release',
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
      expectedConsoleErrorPatterns: [
        /console error \[path=\/__dev\/version-center\]: Failed to load resource: the server responded with a status of 503 .*\/__dev\/api\/delivery\/(?:operations\?|summary)/u,
      ],
      beforeNavigate: async (page) => {
        summaryRequests = 0
        await installSummaryRoute(page, () => {
          summaryRequests += 1
        })
      },
      verify: async (page) => {
        await expectHeading(page, '版本发布')
        await waitForView(page, 'versions')
        await page.waitForURL(
          (url) =>
            url.searchParams.getAll('view').length === 1 &&
            !url.searchParams.has('history_action'),
          { timeout: 10_000 }
        )
        await page
          .locator('.erp-dev-version-workspace')
          .waitFor({ state: 'visible' })
        assert.equal(
          await page
            .locator('.erp-dev-version-workspace > .erp-sliding-tabs > .ant-tabs-nav')
            .evaluate((node) => getComputedStyle(node).backgroundColor),
          'rgb(255, 255, 255)',
          '版本中心导航使用完整白色操作区'
        )
        const versionTableBox = await page
          .locator('.erp-dev-version-tab--versions .ant-card-head')
          .boundingBox()
        const tabNavigationBox = await page
          .locator('.erp-dev-version-workspace .ant-tabs-nav')
          .boundingBox()
        assert(versionTableBox && tabNavigationBox)
        assert(
          versionTableBox.y >= tabNavigationBox.y + tabNavigationBox.height &&
            versionTableBox.y < 500,
          '版本清单应紧邻任务栏并在首屏出现'
        )
        assert.equal(await page.getByRole('table', { name: '发布状态摘要' }).isVisible(), false)
        assert.equal(await page.getByRole('button', { name: '生成发布制品', exact: true }).count(), 1)
        assert.equal(await page.locator('.erp-dev-version-current-operation').count(), 0, 'another environment operation must not appear under demo')
        const versionTable = page.locator('.erp-dev-version-tab--versions .ant-table')
        assert.equal(await versionTable.getByRole('columnheader').count(), 4)
        assert.equal(await versionTable.getByRole('button', { name: '检查回滚', exact: true }).count(), 0)
        const artifactDetails = page.locator('.erp-dev-version-tab--versions .erp-dev-delivery-inline-details').first()
        assert.equal(await artifactDetails.evaluate((element) => element.open), false)
        await artifactDetails.getByText('制品信息', { exact: true }).click()
        await artifactDetails.getByText(/BuildKit/u).waitFor({ state: 'visible' })
        await artifactDetails.locator('time').waitFor({ state: 'visible' })
        await artifactDetails.getByText('制品信息', { exact: true }).click()
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
        await verifySlidingMotion(page, assert, '.erp-dev-version-workspace .ant-tabs-nav-list', 1)
        await waitForView(page, 'overview')
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
        assert.equal(await page.getByRole('button', { name: '生成发布制品', exact: true }).count(), 0)
        await page
          .locator('.erp-dev-version-tab--history')
          .waitFor({ state: 'visible' })
        assert.equal(await page.locator('.erp-dev-version-current-operation').isVisible(), true)

        const historyView = page.locator('.erp-dev-version-tab--history')
        await historyView.getByText('共 12 条记录', { exact: true }).waitFor()
        await historyView.locator('.ant-pagination-item-2').click()
        await historyView.getByText('2026.08.08-2', { exact: true }).waitFor()
        assert.equal(await historyView.getByRole('row').count(), 3)
        const historySearch = page.getByRole('textbox', { name: '搜索版本、SHA 或操作 ID' })
        await historySearch.fill('2026.08.08-1')
        await historySearch.press('Enter')
        await historyView.getByText('匹配 4 / 共 12 条记录', { exact: true }).waitFor()
        await historySearch.fill('does-not-exist')
        await historySearch.press('Enter')
        await historyView.getByText('没有符合筛选条件的记录，请调整或清空上方条件', { exact: true }).waitFor()
        await page.getByRole('button', { name: '清空筛选', exact: true }).click()
        await historyView.getByText('共 12 条记录', { exact: true }).waitFor()
        let historyUnavailable = true
        await page.route('**/__dev/api/delivery/operations?*', async (route) => {
          if (!historyUnavailable) return route.fallback()
          return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: '暂时不可读' }) })
        })
        await historySearch.fill('2026.08.08-9')
        await historySearch.press('Enter')
        await historyView.getByText('工作台操作记录当前不可读', { exact: true }).waitFor()
        assert.equal(await historySearch.inputValue(), '2026.08.08-9')
        assert.equal(await historyView.getByRole('table').count(), 0)
        assert.equal(await historyView.getByText('共 0 条记录', { exact: true }).count(), 0)
        historyUnavailable = false
        await historyView.getByRole('button', { name: '重试读取', exact: true }).click()
        await historyView.getByText('匹配 1 / 共 12 条记录', { exact: true }).waitFor()
        await page.getByRole('button', { name: '清空筛选', exact: true }).click()
        await historyView.getByText('共 12 条记录', { exact: true }).waitFor()

        await page.getByRole('tab', { name: '发布与部署耗时' }).click()
        await waitForView(page, 'pipeline')
        assert.equal(await page.locator('.erp-dev-version-current-operation').isVisible(), true)
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
        await versionTable
          .getByText('2026.08.08-8', { exact: true })
          .waitFor()
        const runningRow = versionTable.getByRole('row').filter({ hasText: '2026.08.08-7' })
        assert.equal(await runningRow.getByText('当前运行', { exact: true }).count(), 1)
        assert.equal(await runningRow.getByRole('button').count(), 0)
        const rollbackRow = versionTable.getByRole('row').filter({ hasText: '2026.08.08-6' })
        assert.equal(await rollbackRow.getByRole('button', { name: '检查回滚', exact: true }).count(), 1)
        assert.equal(await rollbackRow.getByRole('button', { name: '准备部署', exact: true }).count(), 0)
        assert.equal(summaryRequests, initialSummaryRequests)
        await assertNoHorizontalOverflow(
          page,
          'dev-version-center-tabs-pagination-desktop'
        )

        const guideTrigger = page.getByRole('link', {
          name: /操作指引/u,
        })
        assert.notEqual(await guideTrigger.getAttribute('target'), '_blank')
        assert.match(
          await guideTrigger.getAttribute('href'),
          /version-center\/guide\?customer=yoyoosun/u
        )
        const initialPageCount = page.context().pages().length
        const guideRequests = []
        const isolateGuideApi = async (route) => {
          if (!new URL(page.url()).pathname.endsWith('/guide')) return route.fallback()
          guideRequests.push(route.request().url())
          return route.abort()
        }
        await page.route('**/__dev/api/**', isolateGuideApi)
        await guideTrigger.click()
        await page.waitForURL((url) => url.pathname === '/__dev/version-center/guide')
        const guidePage = page
        try {
          await expectHeading(guidePage, '手动与应急发布指引')
          await guidePage.reload()
          await expectHeading(guidePage, '手动与应急发布指引')
          assert.match(await guidePage.title(), /手动与应急发布指引/u)
          assert.match(
            await guidePage
              .getByRole('link', { name: '返回版本发布' })
              .getAttribute('href'),
            /version-center\?customer=yoyoosun/u
          )
          const ciGuide = guidePage.getByRole('region', {
            name: 'CI/CD 流程与原理',
          })
          await ciGuide
            .locator('[data-section="delivery"] [data-mermaid-status="rendered"]')
            .waitFor()
          for (const diagram of await ciGuide.locator('.erp-markdown-mermaid').all()) {
            await waitForMermaidFit(guidePage, diagram)
            await assertMermaidFits(diagram, assert)
            await assertMermaidZoomMode(diagram, assert, 'fit-all')
          }
          await assertManualGuideViewport(guidePage, assert)
          for (const viewport of [
            { width: 1920, height: 1080 },
            { width: 1440, height: 500 },
          ]) {
            await guidePage.setViewportSize(viewport)
            await assertManualGuideViewport(guidePage, assert)
            for (const diagram of await ciGuide.locator('.erp-markdown-mermaid').all()) {
              await waitForMermaidFit(guidePage, diagram)
              await assertMermaidFits(diagram, assert)
            }
            if (viewport.width === 1920) {
              const layoutDiagram = ciGuide.locator('[data-section="ci-entry"] .erp-markdown-mermaid')
              await layoutDiagram.locator('[data-mermaid-zoom-action="fit"]').click()
              await guidePage.mouse.move(0, 0)
              await assertMermaidZoomMode(layoutDiagram, assert, 'fit')
              await layoutDiagram.scrollIntoViewIfNeeded()
              await layoutDiagram.locator('[data-mermaid-zoom-action="reset"]').click()
              await guidePage.mouse.move(0, 0)
              await assertMermaidZoomMode(layoutDiagram, assert, 'reset')
              await layoutDiagram.locator('[data-mermaid-zoom-action="fit-all"]').click()
              await assertMermaidZoomMode(layoutDiagram, assert, 'fit-all')
              await switchMermaidLayout(guidePage, layoutDiagram, assert)
              await layoutDiagram.scrollIntoViewIfNeeded()
              await switchMermaidLayout(guidePage, layoutDiagram, assert)
            }
          }
          await guidePage.setViewportSize({ width: 1440, height: 900 })
          assert.equal(
            await ciGuide.locator('.ant-collapse').count(),
            0,
            '独立阅读页不应提供折叠面板'
          )
          assert.equal(
            await ciGuide.locator('.erp-dev-ci-guide__chapter').count(),
            CI_WORKFLOW_SECTIONS.length
          )
          for (const section of CI_WORKFLOW_SECTIONS) {
            assert.equal(
              await ciGuide
                .getByRole('heading', { name: section.label, exact: true })
                .isVisible(),
              true,
              `${section.label}应直接展开可读`
            )
          }
          assert.equal(
            await ciGuide.locator('.erp-markdown-mermaid').count(),
            CI_WORKFLOW_SECTIONS.filter(({ chart }) => chart).length
          )
          const chapterNav = guidePage.getByRole('navigation', {
            name: '操作指引章节目录',
          })
          assert.equal(await guidePage.locator('.erp-dev-workspace-nav').count(), 0)
          assert.equal(
            await chapterNav.getByRole('link').count(),
            CI_WORKFLOW_SECTIONS.length + 7
          )
          assert.equal(
            await chapterNav.getByRole('link').evaluateAll((links) =>
              links.every((link) => {
                const href = link.getAttribute('href')
                return (
                  href.startsWith('#') &&
                  link.target !== '_blank' &&
                  document.getElementById(href.slice(1))
                )
              })
            ),
            true,
            '目录链接应在本页指向真实章节'
          )

          const parallelLink = chapterNav.getByRole('link', {
            name: 'Job 并行、汇总与等待',
            exact: true,
          })
          await guidePage.evaluate(() => window.scrollTo(0, 0))
          await parallelLink.click()
          const parallelHeading = ciGuide.getByRole('heading', {
            name: 'Job 并行、汇总与等待',
            exact: true,
          })
          await parallelHeading.waitFor()
          await guidePage.waitForFunction(() => {
            const { top } = document
              .getElementById('dev-version-guide-ci-parallel')
              .getBoundingClientRect()
            return top >= 0 && top <= 48
          })
          assert.equal(new URL(guidePage.url()).hash, '#dev-version-guide-ci-parallel')
          assert(await guidePage.evaluate(() => scrollY > 0), '点击章节目录应滚动整页正文')
          await guidePage.reload()
          await parallelHeading.waitFor()
          await guidePage.waitForFunction(() => {
            const top = document
              .getElementById('dev-version-guide-ci-parallel')
              ?.getBoundingClientRect().top
            return top >= 0 && top <= 48
          })

          for (const [title, id] of [
            ['四处操作各管什么', 'dev-version-takeover-scope-title'],
            ['先判断能不能继续', 'dev-version-takeover-conditions-title'],
            ['自动续办怎么交接', 'dev-version-takeover-automation-title'],
            ['Git 索引锁怎么处理', 'dev-version-takeover-lock-title'],
            ['手动操作顺序', 'dev-version-takeover-steps-title'],
            ['应急边界与交接', 'dev-version-guide-boundary'],
          ]) {
            await chapterNav.getByRole('link', { name: title, exact: true }).click()
            await guidePage.waitForFunction((targetId) => {
              const box = document.getElementById(targetId).getBoundingClientRect()
              return box.top >= 0 && box.top < innerHeight
            }, id)
            assert.equal(new URL(guidePage.url()).hash, `#${id}`)
          }
          assert.equal(
            page.context().pages().length,
            initialPageCount,
            '进入指引与章节跳转都不应新开标签页'
          )
          const automationSection = guidePage.getByRole('region', {
            name: '自动续办怎么交接',
          })
          await automationSection
            .locator('[data-mermaid-status="rendered"]')
            .waitFor({ state: 'visible', timeout: 10_000 })
          assert.equal(
            await automationSection.getByText(/先删除并读回本次心跳/u).isVisible(),
            true
          )
          const lockSection = guidePage.getByRole('region', {
            name: 'Git 索引锁怎么处理',
          })
          const lockDiagram = lockSection.locator('[data-mermaid-status="rendered"]')
          await lockDiagram.waitFor({ state: 'visible', timeout: 10_000 })
          const lockCanvas = lockSection.locator('.erp-markdown-mermaid__canvas')
          const previewZoom = Number(await lockCanvas.getAttribute('data-mermaid-zoom'))
          await lockSection
            .getByRole('button', {
              name: '放大Git index.lock 检查与恢复流程',
            })
            .click()
          assert(
            Number(await lockCanvas.getAttribute('data-mermaid-zoom')) > previewZoom
          )
          await lockSection
            .getByRole('button', {
              name: '重置Git index.lock 检查与恢复流程为 100%',
            })
            .click()
          assert.equal(await lockCanvas.getAttribute('data-mermaid-zoom'), '100')
          await switchMermaidLayout(
            guidePage,
            lockSection.locator('.erp-markdown-mermaid'),
            assert
          )
          await switchMermaidLayout(
            guidePage,
            lockSection.locator('.erp-markdown-mermaid'),
            assert
          )

          await guidePage.setViewportSize({ width: 480, height: 850 })
          await assertManualGuideViewport(guidePage, assert)
          const guideBody = guidePage.locator('.erp-dev-version-guide-content')
          assert.equal(
            await guideBody.evaluate((node) => node.scrollWidth <= node.clientWidth),
            true,
            '窄屏指引页不得被流程图撑宽'
          )
          assert.equal(
            await lockSection
              .locator('.erp-markdown-mermaid__viewport')
              .evaluate((node) => node.scrollWidth <= node.clientWidth + 2),
            true,
            '窄屏流程图应适配自身视口，不再被固定最小宽度撑开'
          )
          await assertNoHorizontalOverflow(guidePage, 'dev-version-guide-narrow')
          assert.deepEqual(guideRequests, [], '阅读指引不应读取实时操作或目标状态')
        } finally {
          await page.unroute('**/__dev/api/**', isolateGuideApi)
        }
        await page.setViewportSize({ width: 1440, height: 900 })
        await page.getByRole('link', { name: '返回版本发布' }).click()
        await expectHeading(page, '版本发布')
        await waitForView(page, 'versions')
        assert.equal(new URL(page.url()).searchParams.get('customer'), 'yoyoosun')
        assert.equal(page.context().pages().length, initialPageCount)
        await page.getByRole('tab', { name: '发布与部署耗时' }).click()
        await waitForView(page, 'pipeline')
        await page
          .locator('.erp-dev-pipeline-timing')
          .waitFor({ state: 'visible' })
        await verifySlidingMotion(page, assert, '.erp-dev-version-workspace .ant-tabs-nav-list', 3, true)
        await waitForView(page, 'history')
        assert.equal(new URL(page.url()).searchParams.get('target'), 'demo-133')
        assert.equal(await page.locator('.erp-dev-version-current-operation').count(), 0, 'returning to demo must not display the test operation')
        await assertNoHorizontalOverflow(
          page,
          'dev-version-center-tabs-pagination-desktop-pipeline'
        )
        await verifyHistoryIsolationRecovery(page, assert, assertNoHorizontalOverflow)
      },
    },
  ]
}
