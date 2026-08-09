import { validateDevDeliverySummary } from '../../src/dev-workbench/config/devDelivery.mjs'
import { createQualityGateStyleSummary } from './devQualityGateScenarios.mjs'

const ASSETS = [
  'release-manifest.json',
  'checksums.txt',
  'server-image.tar.zst',
  'web-image.tar.zst',
  'server-sbom.spdx.json',
  'web-sbom.spdx.json',
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

function createVersionCenterSummary() {
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
    }
  })
  const currentVersion = versions[7]
  const readyVersion = versions[6]
  const openOperation = {
    id: 'f0000001-0000-4000-8000-000000000001',
    action: 'promote',
    target: 'test-133',
    gitSha: readyVersion.gitSha,
    version: readyVersion.version,
    status: 'ready',
    terminal: false,
    revision: 2,
    createdAt: '2026-08-09T01:00:00.000Z',
    updatedAt: '2026-08-09T01:00:30.000Z',
    durationMs: 30_000,
    confirmationRequired: `DEPLOY ${readyVersion.gitSha} TO test-133`,
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
  }
  const historyOperations = Array.from({ length: 12 }, (_, offset) => {
    const sequence = offset + 1
    const version = versions[offset + 1]
    const isPromotion = sequence % 2 === 1
    return {
      id: `a${String(sequence).padStart(7, '0')}-0000-4000-8000-${String(sequence).padStart(12, '0')}`,
      action: isPromotion ? 'promote' : 'release',
      target: isPromotion ? 'test-133' : 'github-release',
      gitSha: version.gitSha,
      version: version.version,
      status: 'passed',
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
          label: isPromotion ? '部署与基础运行核验' : '不可变版本发布',
          status: 'passed',
          durationMs: 120_000,
        },
      ],
      issues: [],
      events: [
        {
          status: 'passed',
          at: new Date(Date.UTC(2026, 7, 8, 13 - offset, 0, 2)).toISOString(),
          message: isPromotion
            ? 'target promotion and basic runtime verification passed'
            : 'immutable GitHub release and complete assets are published',
        },
      ],
      metrics: operationMetrics({ transferred: isPromotion }),
    }
  })

  return validateDevDeliverySummary({
    schemaVersion: 'plush.dev-delivery-summary/v1',
    status: 'success',
    generatedAt: '2026-08-09T02:00:00.000Z',
    repository: {
      commit: versions[0].gitSha,
      dirty: false,
      fingerprint: 'b'.repeat(64),
    },
    versions,
    target: {
      status: 'passed',
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
          container: `plush-toy-erp-web-public-${currentVersion.gitSha.slice(0, 8)}`,
          gitSha: currentVersion.gitSha,
          health: 'passed',
          provider: 'passed',
          endpoint: 'https://admin.yoyoosun.net',
        },
      },
    },
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
      target: 'test-133',
      browserShellAccess: false,
      targetBuildAllowed: false,
      automaticRetryAllowed: false,
    },
  })
}

async function installSummaryRoute(page, onRequest) {
  const summary = createVersionCenterSummary()
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
  await page.route('**/__dev/api/delivery/summary', async (route) => {
    onRequest()
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(summary),
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
            ? 'CI/CD 效能'
            : '操作记录',
    })
    .waitFor({ state: 'visible', timeout: 10_000 })
}

async function waitForAntdModalMotion(page, modal) {
  const modalHandle = await modal.elementHandle()
  if (!modalHandle) {
    throw new Error('未找到可等待动画结束的人工接管弹窗')
  }
  try {
    await page.waitForFunction(
      (node) => {
        if (!(node instanceof HTMLElement) || !node.isConnected) return false
        const className = String(node.className || '')
        return (
          !className.includes('ant-zoom-enter') &&
          !className.includes('ant-zoom-appear')
        )
      },
      modalHandle,
      { timeout: 10_000 }
    )
  } finally {
    await modalHandle.dispose()
  }
}

function visibleTableRows(section) {
  return section.locator('.ant-table-tbody > tr.ant-table-row')
}

export function createDevVersionCenterScenarios({
  assert,
  assertNoHorizontalOverflow,
  clickERPThemeOption,
  expectHeading,
  outputDir,
  path,
}) {
  let desktopSummaryRequests = 0
  let mobileSummaryRequests = 0

  return [
    {
      name: 'dev-version-center-tabs-pagination-desktop',
      path: '/__dev/version-center',
      viewport: { width: 1440, height: 900 },
      beforeNavigate: async (page) => {
        desktopSummaryRequests = 0
        await installSummaryRoute(page, () => {
          desktopSummaryRequests += 1
        })
      },
      verify: async (page) => {
        await expectHeading(page, '版本发布与部署中心')
        await waitForView(page, 'versions')

        const versions = page.locator('.erp-dev-version-tab--versions')
        const currentOperation = page.locator(
          '.erp-dev-version-current-operation'
        )
        await versions.waitFor({ state: 'visible' })
        await currentOperation.waitFor({ state: 'visible' })
        assert.equal(await visibleTableRows(versions).count(), 6)
        assert.equal(
          await currentOperation
            .locator('.erp-dev-version-current-operation__item')
            .count(),
          1
        )
        const strictFinishedAt = page.locator(
          '.erp-dev-version-quality-gate-summary .erp-dev-quality-gate-finished-at time'
        )
        await strictFinishedAt.waitFor({ state: 'visible' })
        assert.equal(
          await strictFinishedAt.getAttribute('datetime'),
          '2026-08-09T08:00:00.000Z'
        )
        const latestVersionSummary = page
          .locator('.erp-dev-version-summary .ant-card')
          .filter({ hasText: 'GitHub 不可变版本' })
        const latestPublishedAt = latestVersionSummary.locator(
          '.erp-dev-latest-version-published-at time'
        )
        await latestPublishedAt.waitFor({ state: 'visible' })
        assert.equal(
          await latestPublishedAt.getAttribute('datetime'),
          '2026-08-08T14:00:00.000Z'
        )
        const currentOperationTimes = currentOperation.locator(
          '.erp-dev-current-operation-time time'
        )
        assert.equal(await currentOperationTimes.count(), 2)
        assert.deepEqual(await currentOperationTimes.allTextContents(), [
          '2026/08/09 09:00:00',
          '2026/08/09 09:00:30',
        ])
        assert.equal(
          await versions.locator('.ant-pagination-options').count(),
          0,
          '版本分页不应提供无意义的每页条数选择器'
        )
        assert.match(
          String(await versions.locator('.ant-pagination').textContent()),
          /1-6 \/ 共 14 个版本/u
        )
        assert.match(String(await currentOperation.textContent()), /确认部署/u)
        assert.match(String(await currentOperation.textContent()), /f0000001/u)
        const desktopVersionTimes = visibleTableRows(versions).locator(
          '.erp-dev-version-published-at time'
        )
        assert.equal(
          await desktopVersionTimes.count(),
          6,
          '当前页每个版本都应显示发布时间'
        )
        assert.match(
          String(await desktopVersionTimes.first().textContent()),
          /^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/u
        )
        assert.equal(
          await desktopVersionTimes.first().getAttribute('datetime'),
          '2026-08-08T14:00:00.000Z'
        )
        assert.equal(desktopSummaryRequests, 1)

        const desktopTakeoverButton = page.getByRole('button', {
          name: '人工接管说明',
        })
        await desktopTakeoverButton.focus()
        await desktopTakeoverButton.click()
        const desktopTakeoverDialog = page.getByRole('dialog', {
          name: '人工接管与应急发布说明',
        })
        await desktopTakeoverDialog.waitFor({
          state: 'visible',
          timeout: 10_000,
        })
        await waitForAntdModalMotion(page, desktopTakeoverDialog)
        await desktopTakeoverDialog
          .getByText('三处操作各管什么', { exact: true })
          .waitFor()
        await desktopTakeoverDialog
          .getByText('人工接管顺序', { exact: true })
          .waitFor()
        await desktopTakeoverDialog
          .getByText('应急不等于绕过', { exact: true })
          .waitFor()
        const desktopTakeoverMetrics = await desktopTakeoverDialog.evaluate(
          (dialog) => {
            const scope = dialog.querySelector(
              '.erp-dev-version-takeover-scope'
            )
            const rect = dialog.getBoundingClientRect()
            return {
              left: rect.left,
              right: rect.right,
              width: rect.width,
              viewportWidth: window.innerWidth,
              scopeColumns: scope
                ? getComputedStyle(scope).gridTemplateColumns
                : '',
              documentWidth: document.documentElement.scrollWidth,
            }
          }
        )
        assert.equal(
          desktopTakeoverMetrics.scopeColumns.trim().split(/\s+/u).length,
          3,
          `桌面人工接管职责应保持三列: ${JSON.stringify(desktopTakeoverMetrics)}`
        )
        assert(
          desktopTakeoverMetrics.left >= -1 &&
            desktopTakeoverMetrics.right <=
              desktopTakeoverMetrics.viewportWidth + 1,
          `桌面人工接管弹窗超出视口: ${JSON.stringify(desktopTakeoverMetrics)}`
        )
        await desktopTakeoverDialog.screenshot({
          path: path.join(
            outputDir,
            'dev-version-center-manual-takeover-desktop-light.png'
          ),
        })
        await assertNoHorizontalOverflow(
          page,
          'dev-version-center-manual-takeover-desktop-light'
        )
        await page.keyboard.press('Escape')
        await desktopTakeoverDialog.waitFor({ state: 'hidden' })
        await page.waitForFunction(() => {
          const active = document.activeElement
          return String(active?.textContent || '').includes('人工接管说明')
        })

        await page.screenshot({
          path: path.join(
            outputDir,
            'dev-version-center-tabs-pagination-desktop-versions.png'
          ),
          fullPage: true,
        })

        await page.getByRole('button', { name: '查看完整效能' }).click()
        await waitForView(page, 'pipeline')
        await page
          .getByRole('heading', { name: 'CI/CD 效能' })
          .waitFor({ state: 'visible' })
        assert.equal(desktopSummaryRequests, 1)
        assert.equal(await currentOperation.isVisible(), true)
        const pipeline = page.locator('.erp-dev-version-tab--pipeline')
        const fullTimingDetails = pipeline.locator(
          '.erp-dev-pipeline-timing__details'
        )
        await pipeline.getByText('观测关键路径').waitFor({ state: 'visible' })
        await pipeline.getByText('耗时最长环节').waitFor({ state: 'visible' })
        assert(
          (await pipeline.locator('time').count()) >= 4,
          'CI/CD 摘要应分别显示运行、发布、制品和部署事件时间'
        )
        assert.equal(
          await fullTimingDetails.evaluate((element) => element.open),
          false,
          '完整 job / step 首次进入应保持收起'
        )
        await page.screenshot({
          path: path.join(
            outputDir,
            'dev-version-center-tabs-pagination-desktop-pipeline.png'
          ),
          fullPage: true,
        })

        const fullTimingSummary = fullTimingDetails.locator(':scope > summary')
        await fullTimingSummary.focus()
        await page.keyboard.press('Enter')
        assert.equal(
          await fullTimingDetails.evaluate((element) => element.open),
          true,
          '完整 job / step 应支持键盘展开'
        )
        const jobDetails = pipeline.locator(
          '.erp-dev-pipeline-timing__jobs > details'
        )
        assert.equal(await jobDetails.count(), 2)
        assert.equal(
          await jobDetails.evaluateAll(
            (elements) => elements.filter((element) => element.open).length
          ),
          0,
          '打开完整列表后各 job 仍应默认收起'
        )
        const expandAll = pipeline.getByRole('button', { name: '全部展开' })
        const collapseAll = pipeline.getByRole('button', { name: '全部收起' })
        assert.equal(await expandAll.isEnabled(), true)
        assert.equal(await collapseAll.isDisabled(), true)
        await expandAll.click()
        await page.waitForFunction(() =>
          Array.from(
            document.querySelectorAll(
              '.erp-dev-pipeline-timing__jobs > details'
            )
          ).every((element) => element.open)
        )
        assert.equal(await collapseAll.isEnabled(), true)
        const firstStepTimeRange = pipeline
          .locator(
            '.erp-dev-pipeline-timing__job-steps .erp-dev-timing-bars__meta .ant-typography-secondary'
          )
          .first()
        await firstStepTimeRange.waitFor({ state: 'visible' })
        assert.match(
          String(await firstStepTimeRange.textContent()),
          /\d{2}:\d{2}:\d{2}–\d{2}:\d{2}:\d{2}/u
        )
        await page.screenshot({
          path: path.join(
            outputDir,
            'dev-version-center-tabs-pagination-desktop-pipeline-expanded.png'
          ),
          fullPage: true,
        })
        await collapseAll.click()
        assert.equal(
          await jobDetails.evaluateAll(
            (elements) => elements.filter((element) => element.open).length
          ),
          0,
          '全部收起应恢复 job 初始状态'
        )

        await page.getByRole('tab', { name: '操作记录' }).click()
        await waitForView(page, 'history')
        const history = page.locator('.erp-dev-version-tab--history')
        await history.waitFor({ state: 'visible' })
        assert.equal(await visibleTableRows(history).count(), 10)
        assert.equal(
          await history.locator('.ant-pagination-options').count(),
          0,
          '操作记录分页不应提供每页条数选择器'
        )
        assert.match(
          String(await history.locator('.ant-pagination').textContent()),
          /1-10 \/ 共 12 条记录/u
        )
        assert.doesNotMatch(String(await history.textContent()), /f0000001/u)
        const historyTimes = visibleTableRows(history).locator(
          '.erp-dev-operation-history-time time'
        )
        assert.equal(
          await historyTimes.count(),
          20,
          '每条历史操作都应同时显示开始与完成时间'
        )
        assert.deepEqual(
          await historyTimes.evaluateAll((elements) =>
            elements
              .slice(0, 2)
              .map((element) => element.getAttribute('datetime'))
          ),
          ['2026-08-08T13:00:00.000Z', '2026-08-08T13:00:02.000Z']
        )
        assert.equal(await currentOperation.isVisible(), true)
        assert.equal(desktopSummaryRequests, 1)

        await page.screenshot({
          path: path.join(
            outputDir,
            'dev-version-center-tabs-pagination-desktop-history-times.png'
          ),
          fullPage: true,
        })

        const firstHistoryDetailButton = visibleTableRows(history)
          .first()
          .getByRole('button', { name: '查看详情' })
        await firstHistoryDetailButton.focus()
        await firstHistoryDetailButton.click()
        const operationDrawer = page.locator('.ant-drawer-content').last()
        await operationDrawer.waitFor({ state: 'visible' })
        assert.equal(
          await operationDrawer
            .locator('.erp-dev-operation-detail-time time')
            .count(),
          2,
          '详情头部应显示开始与完成时间'
        )
        const operationEventTime = operationDrawer.locator(
          '.erp-dev-operation-event-time time'
        )
        assert.equal(await operationEventTime.count(), 1)
        assert.equal(
          await operationEventTime.getAttribute('datetime'),
          '2026-08-08T13:00:02.000Z'
        )
        assert.match(
          String(await operationEventTime.textContent()),
          /^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/u
        )
        await page.screenshot({
          path: path.join(
            outputDir,
            'dev-version-center-tabs-pagination-desktop-operation-detail-times.png'
          ),
          fullPage: true,
        })
        await page.keyboard.press('Escape')
        await operationDrawer.waitFor({ state: 'hidden' })
        await page.waitForFunction(() => {
          const firstButton = document.querySelector(
            '.erp-dev-version-tab--history .ant-table-tbody tr.ant-table-row button'
          )
          return document.activeElement === firstButton
        })

        await page.reload({ waitUntil: 'domcontentloaded' })
        await waitForView(page, 'history')
        await history.waitFor({ state: 'visible' })
        assert.equal(await visibleTableRows(history).count(), 10)
        assert.equal(await currentOperation.isVisible(), true)
        assert.equal(desktopSummaryRequests, 2)

        await page.getByRole('tab', { name: '版本与部署' }).click()
        await waitForView(page, 'versions')
        await versions.locator('.ant-pagination-item-2').click()
        await versions.getByText('2026.08.08-8', { exact: true }).waitFor()
        const firstVersionRow = visibleTableRows(versions).first()
        assert.match(
          String(await firstVersionRow.textContent()),
          /2026.08.08-8/u
        )
        assert.equal(await visibleTableRows(versions).count(), 6)
        assert.equal(
          await visibleTableRows(versions)
            .locator('.erp-dev-version-published-at time')
            .count(),
          6,
          '版本翻页后也应逐行保留发布时间'
        )
        assert.equal(desktopSummaryRequests, 2)

        const metrics = await page.evaluate(() => {
          const workspace = document.querySelector('.erp-dev-version-workspace')
          const table = document.querySelector(
            '.erp-dev-version-tab--versions .ant-table-container'
          )
          return {
            documentWidth: document.documentElement.scrollWidth,
            viewportWidth: window.innerWidth,
            workspaceWidth: workspace?.getBoundingClientRect().width || 0,
            tableClientWidth: table?.clientWidth || 0,
            tableScrollWidth: table?.scrollWidth || 0,
          }
        })
        assert(
          metrics.workspaceWidth > 0 &&
            metrics.workspaceWidth <= metrics.viewportWidth,
          `版本工作区宽度异常: ${JSON.stringify(metrics)}`
        )
        assert(
          metrics.tableScrollWidth >= metrics.tableClientWidth,
          `版本表格内部滚动尺寸异常: ${JSON.stringify(metrics)}`
        )
        assert(
          metrics.documentWidth <= metrics.viewportWidth + 2,
          `版本中心出现文档级横向溢出: ${JSON.stringify(metrics)}`
        )
        await assertNoHorizontalOverflow(
          page,
          'dev-version-center-tabs-pagination-desktop'
        )
      },
    },
    {
      name: 'dev-version-center-tabs-pagination-mobile-dark',
      path: '/__dev/version-center?view=history',
      viewport: { width: 390, height: 844 },
      beforeNavigate: async (page) => {
        mobileSummaryRequests = 0
        await installSummaryRoute(page, () => {
          mobileSummaryRequests += 1
        })
      },
      verify: async (page) => {
        await expectHeading(page, '版本发布与部署中心')
        await waitForView(page, 'history')
        await clickERPThemeOption(page, '暗色')

        const history = page.locator('.erp-dev-version-tab--history')
        const currentOperation = page.locator(
          '.erp-dev-version-current-operation'
        )
        await history.waitFor({ state: 'visible' })
        await currentOperation.waitFor({ state: 'visible' })
        assert.equal(await visibleTableRows(history).count(), 10)
        assert.equal(
          await currentOperation
            .locator('.erp-dev-version-current-operation__item')
            .count(),
          1
        )
        await currentOperation
          .getByRole('button', { name: '确认部署' })
          .waitFor({ state: 'visible' })
        assert.equal(
          await currentOperation
            .locator('.erp-dev-current-operation-time time')
            .count(),
          2,
          '移动端当前操作也应显示开始与更新时间'
        )
        assert.equal(
          await visibleTableRows(history)
            .locator('.erp-dev-operation-history-time time')
            .count(),
          20,
          '移动端历史表格应保留每条操作的开始与完成时间'
        )
        assert.equal(mobileSummaryRequests, 1)

        const mobileTakeoverButton = page.getByRole('button', {
          name: '人工接管说明',
        })
        await mobileTakeoverButton.focus()
        await mobileTakeoverButton.click()
        const mobileTakeoverDialog = page.getByRole('dialog', {
          name: '人工接管与应急发布说明',
        })
        await mobileTakeoverDialog.waitFor({
          state: 'visible',
          timeout: 10_000,
        })
        await waitForAntdModalMotion(page, mobileTakeoverDialog)
        const mobileTakeoverMetrics = await mobileTakeoverDialog.evaluate(
          (dialog) => {
            const scope = dialog.querySelector(
              '.erp-dev-version-takeover-scope'
            )
            const conditions = dialog.querySelector(
              '.erp-dev-version-takeover-conditions'
            )
            const rect = dialog.getBoundingClientRect()
            return {
              left: rect.left,
              right: rect.right,
              width: rect.width,
              viewportWidth: window.innerWidth,
              scopeColumns: scope
                ? getComputedStyle(scope).gridTemplateColumns
                : '',
              conditionColumns: conditions
                ? getComputedStyle(conditions).gridTemplateColumns
                : '',
              theme: document.documentElement.dataset.erpTheme,
            }
          }
        )
        assert.equal(mobileTakeoverMetrics.theme, 'dark')
        assert.equal(
          mobileTakeoverMetrics.scopeColumns.trim().split(/\s+/u).length,
          1,
          `移动端人工接管职责应改为单列: ${JSON.stringify(mobileTakeoverMetrics)}`
        )
        assert.equal(
          mobileTakeoverMetrics.conditionColumns.trim().split(/\s+/u).length,
          1,
          `移动端继续条件应改为单列: ${JSON.stringify(mobileTakeoverMetrics)}`
        )
        assert(
          mobileTakeoverMetrics.left >= -1 &&
            mobileTakeoverMetrics.right <=
              mobileTakeoverMetrics.viewportWidth + 1 &&
            mobileTakeoverMetrics.width >=
              mobileTakeoverMetrics.viewportWidth - 24,
          `移动端人工接管弹窗尺寸异常: ${JSON.stringify(mobileTakeoverMetrics)}`
        )
        await mobileTakeoverDialog.screenshot({
          path: path.join(
            outputDir,
            'dev-version-center-manual-takeover-mobile-dark.png'
          ),
        })
        await assertNoHorizontalOverflow(
          page,
          'dev-version-center-manual-takeover-mobile-dark'
        )
        await mobileTakeoverDialog
          .getByRole('button', { name: '我知道了' })
          .click()
        await mobileTakeoverDialog.waitFor({ state: 'hidden' })
        await page.waitForFunction(() => {
          const active = document.activeElement
          return String(active?.textContent || '').includes('人工接管说明')
        })

        await page.screenshot({
          path: path.join(
            outputDir,
            'dev-version-center-tabs-pagination-mobile-dark-history-times.png'
          ),
          fullPage: true,
        })

        const mobileHistoryDetailButton = visibleTableRows(history)
          .first()
          .getByRole('button', { name: '查看详情' })
        await mobileHistoryDetailButton.focus()
        await mobileHistoryDetailButton.click()
        const mobileOperationDrawer = page.locator('.ant-drawer-content').last()
        await mobileOperationDrawer.waitFor({ state: 'visible' })
        await page.waitForFunction(() => {
          const drawers = document.querySelectorAll('.ant-drawer-content')
          const drawer = drawers.item(drawers.length - 1)
          if (!drawer) return false
          const rect = drawer.getBoundingClientRect()
          return (
            rect.left >= -1 &&
            rect.right <= window.innerWidth + 1 &&
            rect.width <= window.innerWidth + 1
          )
        })
        assert.equal(
          await mobileOperationDrawer
            .locator('.erp-dev-operation-detail-time time')
            .count(),
          2
        )
        assert.equal(
          await mobileOperationDrawer
            .locator('.erp-dev-operation-event-time time')
            .count(),
          1
        )
        const mobileDrawerMetrics = await mobileOperationDrawer.evaluate(
          (element) => {
            const rect = element.getBoundingClientRect()
            return {
              left: rect.left,
              right: rect.right,
              width: rect.width,
              viewportWidth: window.innerWidth,
              documentWidth: document.documentElement.scrollWidth,
            }
          }
        )
        assert(
          mobileDrawerMetrics.left >= -1 &&
            mobileDrawerMetrics.right <=
              mobileDrawerMetrics.viewportWidth + 1 &&
            mobileDrawerMetrics.width <= mobileDrawerMetrics.viewportWidth + 1,
          `移动端操作详情超出视口: ${JSON.stringify(mobileDrawerMetrics)}`
        )
        assert(
          mobileDrawerMetrics.documentWidth <=
            mobileDrawerMetrics.viewportWidth + 2,
          `移动端操作详情造成文档级横向溢出: ${JSON.stringify(mobileDrawerMetrics)}`
        )
        await page.screenshot({
          path: path.join(
            outputDir,
            'dev-version-center-tabs-pagination-mobile-dark-operation-detail-times.png'
          ),
          fullPage: true,
        })
        await page.keyboard.press('Escape')
        await mobileOperationDrawer.waitFor({ state: 'hidden' })
        await page.waitForFunction(() => {
          const firstButton = document.querySelector(
            '.erp-dev-version-tab--history .ant-table-tbody tr.ant-table-row button'
          )
          return document.activeElement === firstButton
        })

        const metrics = await page.evaluate(() => {
          const statusGrid = document.querySelector(
            '.erp-dev-pipeline-status-strip__metrics'
          )
          const tabList = document.querySelector(
            '.erp-dev-version-workspace [role="tablist"]'
          )
          const table = document.querySelector(
            '.erp-dev-version-tab--history .ant-table-container'
          )
          return {
            theme: document.documentElement.dataset.erpTheme,
            statusColumns: statusGrid
              ? getComputedStyle(statusGrid).gridTemplateColumns
              : '',
            tabListWidth: tabList?.getBoundingClientRect().width || 0,
            viewportWidth: window.innerWidth,
            documentWidth: document.documentElement.scrollWidth,
            tableClientWidth: table?.clientWidth || 0,
            tableScrollWidth: table?.scrollWidth || 0,
          }
        })
        assert.equal(metrics.theme, 'dark')
        assert.equal(
          metrics.statusColumns.trim().split(/\s+/u).length,
          1,
          `移动端交付速览应为单列: ${JSON.stringify(metrics)}`
        )
        assert(
          metrics.tabListWidth <= metrics.viewportWidth,
          `移动端 Tab 导航宽度异常: ${JSON.stringify(metrics)}`
        )
        assert(
          metrics.tableScrollWidth >= metrics.tableClientWidth,
          `移动端操作表格内部滚动尺寸异常: ${JSON.stringify(metrics)}`
        )
        assert(
          metrics.documentWidth <= metrics.viewportWidth + 2,
          `移动端版本中心出现文档级横向溢出: ${JSON.stringify(metrics)}`
        )

        await page.getByRole('tab', { name: '版本与部署' }).click()
        await waitForView(page, 'versions')
        const versions = page.locator('.erp-dev-version-tab--versions')
        await versions.waitFor({ state: 'visible' })
        const mobileVersionTimes = visibleTableRows(versions).locator(
          '.erp-dev-version-published-at time'
        )
        assert.equal(
          await mobileVersionTimes.count(),
          6,
          '移动端当前页每个版本都应显示发布时间'
        )
        assert.match(
          String(await mobileVersionTimes.first().textContent()),
          /^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/u
        )
        const mobileVersionTimeMetrics = await mobileVersionTimes
          .first()
          .evaluate((element) => {
            const cell = element.closest('td')
            const timeRect = element.getBoundingClientRect()
            const cellRect = cell?.getBoundingClientRect()
            return {
              timeLeft: timeRect.left,
              timeRight: timeRect.right,
              cellLeft: cellRect?.left || 0,
              cellRight: cellRect?.right || 0,
              documentWidth: document.documentElement.scrollWidth,
              viewportWidth: window.innerWidth,
            }
          })
        assert(
          mobileVersionTimeMetrics.timeLeft >=
            mobileVersionTimeMetrics.cellLeft - 1 &&
            mobileVersionTimeMetrics.timeRight <=
              mobileVersionTimeMetrics.cellRight + 1,
          `移动端版本发布时间超出所属单元格: ${JSON.stringify(mobileVersionTimeMetrics)}`
        )
        assert(
          mobileVersionTimeMetrics.documentWidth <=
            mobileVersionTimeMetrics.viewportWidth + 2,
          `移动端版本时间造成文档级横向溢出: ${JSON.stringify(mobileVersionTimeMetrics)}`
        )
        await page.screenshot({
          path: path.join(
            outputDir,
            'dev-version-center-tabs-pagination-mobile-dark-versions.png'
          ),
          fullPage: true,
        })

        await page.getByRole('tab', { name: 'CI/CD 效能' }).click()
        await waitForView(page, 'pipeline')
        const pipeline = page.locator('.erp-dev-version-tab--pipeline')
        await pipeline.getByText('观测关键路径').waitFor({ state: 'visible' })
        await pipeline.getByText('耗时最长环节').waitFor({ state: 'visible' })
        assert.equal(
          await pipeline
            .locator('.erp-dev-pipeline-timing__details')
            .evaluate((element) => element.open),
          false,
          '移动端完整 job / step 也应默认收起'
        )
        const pipelineMetrics = await page.evaluate(() => {
          const pipelinePanel = document.querySelector(
            '.erp-dev-version-tab--pipeline'
          )
          const criticalPath = document.querySelector(
            '.erp-dev-pipeline-timing__critical-path'
          )
          return {
            documentWidth: document.documentElement.scrollWidth,
            viewportWidth: window.innerWidth,
            pipelineWidth: pipelinePanel?.getBoundingClientRect().width || 0,
            criticalPathWidth: criticalPath?.getBoundingClientRect().width || 0,
          }
        })
        assert(
          pipelineMetrics.pipelineWidth <= pipelineMetrics.viewportWidth &&
            pipelineMetrics.criticalPathWidth <= pipelineMetrics.pipelineWidth,
          `移动端 CI/CD 默认摘要宽度异常: ${JSON.stringify(pipelineMetrics)}`
        )
        assert(
          pipelineMetrics.documentWidth <= pipelineMetrics.viewportWidth + 2,
          `移动端 CI/CD 出现文档级横向溢出: ${JSON.stringify(pipelineMetrics)}`
        )
        await page.screenshot({
          path: path.join(
            outputDir,
            'dev-version-center-tabs-pagination-mobile-dark-pipeline.png'
          ),
          fullPage: true,
        })
        await assertNoHorizontalOverflow(
          page,
          'dev-version-center-tabs-pagination-mobile-dark'
        )
      },
    },
  ]
}
