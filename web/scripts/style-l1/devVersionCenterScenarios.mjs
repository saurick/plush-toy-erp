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
  await page.route('**/__dev/api/qa/quality-gates', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(createQualityGateStyleSummary('idle')),
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
        assert.equal(desktopSummaryRequests, 1)

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
        await page.screenshot({
          path: path.join(
            outputDir,
            'dev-version-center-tabs-pagination-desktop-pipeline.png'
          ),
          fullPage: true,
        })

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
        assert.equal(await currentOperation.isVisible(), true)
        assert.equal(desktopSummaryRequests, 1)

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
        assert.equal(mobileSummaryRequests, 1)

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
        await assertNoHorizontalOverflow(
          page,
          'dev-version-center-tabs-pagination-mobile-dark'
        )
      },
    },
  ]
}
