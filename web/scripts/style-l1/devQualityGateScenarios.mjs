const NOW = '2026-08-09T08:00:00.000Z'
const OPERATION_ID = '11111111-1111-4111-8111-111111111111'
const HISTORY_OPERATION_IDS = Object.freeze([
  OPERATION_ID,
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
])

const repository = Object.freeze({
  commit: '0d3f91e24d82133ba8ff1893ad6333fd7d6d1c54',
  dirty: true,
  fingerprint: 'b'.repeat(64),
})
const historicalRepository = Object.freeze({
  commit: 'f'.repeat(40),
  dirty: false,
  fingerprint: 'a'.repeat(64),
})

function passedStage(id, label, startedAt, finishedAt, durationMs) {
  return Object.freeze({
    id,
    label,
    status: 'passed',
    startedAt,
    finishedAt,
    durationMs,
  })
}

const PRE_WEB_STAGE_TIMINGS = Object.freeze([
  passedStage(
    'strict_profile',
    '严格门禁配置',
    '2026-08-09T07:55:00.000Z',
    '2026-08-09T07:55:10.000Z',
    10_000
  ),
  passedStage(
    'shellcheck',
    'Shell 静态检查',
    '2026-08-09T07:55:10.000Z',
    '2026-08-09T07:55:15.000Z',
    5_000
  ),
  passedStage(
    'shfmt',
    'Shell 格式检查',
    '2026-08-09T07:55:15.000Z',
    '2026-08-09T07:55:20.000Z',
    5_000
  ),
  passedStage(
    'yamllint',
    'YAML 静态检查',
    '2026-08-09T07:55:20.000Z',
    '2026-08-09T07:55:25.000Z',
    5_000
  ),
  passedStage(
    'environment_profile',
    '环境与工具链准备',
    '2026-08-09T07:55:25.000Z',
    '2026-08-09T07:55:45.000Z',
    20_000
  ),
  passedStage(
    'shared',
    '共享基础检查',
    '2026-08-09T07:55:45.000Z',
    '2026-08-09T07:55:55.000Z',
    10_000
  ),
  passedStage(
    'secrets',
    '敏感信息扫描',
    '2026-08-09T07:55:55.000Z',
    '2026-08-09T07:56:00.000Z',
    5_000
  ),
])
const PASSED_WEB_STAGE_TIMING = passedStage(
  'web',
  'Web 测试与生产构建',
  '2026-08-09T07:56:00.000Z',
  '2026-08-09T07:58:00.000Z',
  120_000
)
const POST_WEB_STAGE_TIMINGS = Object.freeze([
  passedStage(
    'browser',
    '浏览器回归',
    '2026-08-09T07:58:00.000Z',
    '2026-08-09T07:58:30.000Z',
    30_000
  ),
  passedStage(
    'server',
    '隔离数据库、迁移与 Server 测试',
    '2026-08-09T07:58:30.000Z',
    '2026-08-09T07:59:50.000Z',
    80_000
  ),
  passedStage(
    'govulncheck',
    'Go 可达漏洞检查',
    '2026-08-09T07:59:50.000Z',
    NOW,
    10_000
  ),
])

function qualityOperation(
  status = 'running',
  operationRepository = repository
) {
  const terminal = ['failed', 'passed', 'cancelled', 'timed_out'].includes(
    status
  )
  const stageTimings =
    status === 'passed'
      ? [
          ...PRE_WEB_STAGE_TIMINGS,
          PASSED_WEB_STAGE_TIMING,
          ...POST_WEB_STAGE_TIMINGS,
        ]
      : [
          ...PRE_WEB_STAGE_TIMINGS,
          {
            id: 'web',
            label: 'Web 测试与生产构建',
            status: status === 'failed' ? 'failed' : 'running',
            startedAt: '2026-08-09T07:56:00.000Z',
            finishedAt: status === 'running' ? null : NOW,
            durationMs: status === 'running' ? null : 240_000,
          },
        ]
  const receiptStatus = ['failed', 'passed'].includes(status) ? status : null
  return {
    schemaVersion: 'plush.dev-quality-gate-operation-public/v1',
    id: OPERATION_ID,
    profile: 'strict',
    repository: operationRepository,
    status,
    stage: status === 'passed' ? 'govulncheck' : 'web',
    stageTimings,
    receipt: receiptStatus
      ? {
          profile: 'strict',
          status: receiptStatus,
          gitCommit: operationRepository.commit,
          treeState: operationRepository.dirty ? 'dirty' : 'clean',
          durationMs: 300_000,
          finishedAt: NOW,
          executed: status === 'passed' ? 11 : 8,
          passed: status === 'passed' ? 11 : 7,
          failed: status === 'failed' ? 1 : 0,
          skipped: 0,
          environmentFingerprint: 'e'.repeat(64),
          bottleneckStageId: 'web',
          stageTimings,
        }
      : null,
    cleanup: terminal
      ? { status: 'complete', message: '进程组和运行锁已完成清理读回' }
      : { status: 'pending', message: '等待运行结束后清理' },
    firstFailure: status === 'failed' ? 'Web 测试与生产构建未通过' : '',
    cancelRequestedAt: null,
    revision: 3,
    createdAt: '2026-08-09T07:55:00.000Z',
    updatedAt: NOW,
    finishedAt: terminal ? NOW : null,
    message:
      status === 'failed'
        ? 'Web 测试与生产构建未通过，请修复后重新运行'
        : status === 'running'
          ? '正在运行 Web 测试与生产构建'
          : '质量门禁已通过',
  }
}

function historicalQualityOperation(id, durationMs, createdAt, finishedAt) {
  const operation = qualityOperation('passed', historicalRepository)
  return {
    ...operation,
    id,
    createdAt,
    updatedAt: finishedAt,
    finishedAt,
    receipt: {
      ...operation.receipt,
      durationMs,
      finishedAt,
    },
  }
}

export function createQualityGateStyleSummary(mode = 'idle') {
  const historicalOperations = [
    historicalQualityOperation(
      HISTORY_OPERATION_IDS[0],
      300_000,
      '2026-08-09T07:55:00.000Z',
      NOW
    ),
    historicalQualityOperation(
      HISTORY_OPERATION_IDS[1],
      345_000,
      '2026-08-09T06:54:15.000Z',
      '2026-08-09T07:00:00.000Z'
    ),
    historicalQualityOperation(
      HISTORY_OPERATION_IDS[2],
      270_000,
      '2026-08-09T05:55:30.000Z',
      '2026-08-09T06:00:00.000Z'
    ),
  ]
  const operations =
    mode === 'idle'
      ? []
      : mode === 'history'
        ? historicalOperations
        : [qualityOperation(mode)]
  const operation = operations[0] || null
  const active = mode === 'running'
  return {
    schemaVersion: 'plush.dev-quality-gates-summary/v1',
    generatedAt: NOW,
    repository,
    environment: {
      disposableDatabaseReady: true,
      message: '一次性数据库环境已就绪',
    },
    busy: active
      ? { active: true, kind: 'quality', profile: 'strict' }
      : { active: false, kind: '', profile: '' },
    profiles: {
      full: {
        timeoutMs: 5_400_000,
        stages: [
          {
            id: 'environment_profile',
            label: '环境与工具链准备',
            parallel: false,
          },
          { id: 'shared', label: '共享基础检查', parallel: true },
          { id: 'secrets', label: '敏感信息扫描', parallel: false },
          { id: 'web', label: 'Web 测试与生产构建', parallel: true },
          { id: 'browser', label: '浏览器回归', parallel: false },
          {
            id: 'server',
            label: '隔离数据库、迁移与 Server 测试',
            parallel: true,
          },
          { id: 'govulncheck', label: 'Go 可达漏洞检查', parallel: false },
        ],
        substeps: {
          shared: [
            { id: 'repository_guards', label: '仓库与生成物守卫' },
            { id: 'node_tests', label: 'Scripts Node 合同测试' },
            { id: 'script_boundaries', label: '脚本与私有化边界' },
            { id: 'customer_config', label: '客户配置合同' },
          ],
          web: [
            { id: 'eslint', label: 'JavaScript 静态检查' },
            { id: 'stylelint', label: '样式静态检查' },
            { id: 'web_test', label: 'Web 自动化测试' },
            { id: 'production_build', label: 'Web 生产构建' },
            { id: 'production_boundary', label: 'DEV 与生产隔离检查' },
          ],
        },
      },
      strict: {
        timeoutMs: 10_800_000,
        stages: [
          { id: 'strict_profile', label: '严格门禁配置', parallel: false },
          { id: 'shellcheck', label: 'Shell 静态检查', parallel: false },
          { id: 'shfmt', label: 'Shell 格式检查', parallel: false },
          { id: 'yamllint', label: 'YAML 静态检查', parallel: false },
          {
            id: 'environment_profile',
            label: '环境与工具链准备',
            parallel: false,
          },
          { id: 'shared', label: '共享基础检查', parallel: true },
          { id: 'secrets', label: '敏感信息扫描', parallel: false },
          { id: 'web', label: 'Web 测试与生产构建', parallel: true },
          { id: 'browser', label: '浏览器回归', parallel: false },
          {
            id: 'server',
            label: '隔离数据库、迁移与 Server 测试',
            parallel: true,
          },
          { id: 'govulncheck', label: 'Go 可达漏洞检查', parallel: false },
        ],
        substeps: {
          shared: [
            { id: 'repository_guards', label: '仓库与生成物守卫' },
            { id: 'node_tests', label: 'Scripts Node 合同测试' },
            { id: 'script_boundaries', label: '脚本与私有化边界' },
            { id: 'customer_config', label: '客户配置合同' },
          ],
          web: [
            { id: 'eslint', label: 'JavaScript 静态检查' },
            { id: 'stylelint', label: '样式静态检查' },
            { id: 'web_test', label: 'Web 自动化测试' },
            { id: 'production_build', label: 'Web 生产构建' },
            { id: 'production_boundary', label: 'DEV 与生产隔离检查' },
          ],
        },
      },
    },
    currentOperation: active ? operation : null,
    operations,
    proofs: {
      full: {
        profile: 'full',
        status: 'missing',
        current: false,
        releaseEligible: false,
        reused: false,
        receipt: null,
      },
      strict: {
        profile: 'strict',
        status: 'missing',
        current: false,
        releaseEligible: false,
        reused: false,
        receipt: null,
      },
    },
    status: {
      tone: active ? 'info' : mode === 'failed' ? 'warning' : 'warning',
      title: active
        ? '严格门禁正在运行'
        : mode === 'failed'
          ? '最近严格门禁未通过'
          : '工作区还有未提交改动',
      description: active
        ? '正在运行 Web 测试与生产构建'
        : mode === 'failed'
          ? '请先修复第一失败阶段，再重新运行。'
          : '可以验证当前改动，但结果不能作为固定版本发布证明。',
      recommendation: active
        ? '等待当前运行结束；如确需停止，请使用取消运行。'
        : '运行严格门禁，先确认当前改动没有质量阻断。',
      releaseEligible: false,
      notProven: ['干净 exact SHA', '目标环境发布', '客户 UAT'],
    },
  }
}

function governance() {
  const statistics = {
    sampleCount: 2,
    medianDurationMs: 704_000,
    slowerDurationMs: 760_000,
    enoughSamples: false,
    environmentFingerprint: 'e'.repeat(64),
    treeState: 'dirty',
  }
  return {
    schemaVersion: 'plush.quality-gate-governance/v1',
    catalogSchemaVersion: 'plush.quality-gate-catalog/v1',
    filter: 'relevant',
    q: '',
    changedCount: 18,
    rows: [
      {
        key: 'strict',
        label: '严格门禁',
        prevents: '发版前工具链、Shell、YAML 和完整质量证据缺失',
        trigger: '准备发版或需要严格发布候选证据时',
        riskLevel: 'high',
        profiles: ['strict'],
        sources: ['scripts/qa/strict.sh', '.github/workflows/release.yml'],
        evidence: 'dev-workbench-receipt/v1',
        blocks: '当前版本进入版本发布',
        relationship: '在 full 主路径前增加严格静态检查',
        exitCondition: '不能因耗时或近期无失败删除',
        highConsequence: true,
        current: false,
        recentResult: 'missing',
        statistics,
        advice: '有独立高风险价值，建议保留',
      },
      {
        key: 'browser-experience',
        label: '页面与真实浏览器',
        prevents: '路由、交互、暗色、移动端和真实渲染回归',
        trigger: '用户可见页面或样式变化时',
        riskLevel: 'high',
        profiles: ['full', 'strict'],
        sources: ['web/scripts/styleL1.mjs'],
        evidence: 'browser stage and scenario evidence',
        blocks: '用户可见页面交付',
        relationship: '静态测试不能替代真实浏览器',
        exitCondition: '只有等价真实浏览器证据稳定接入后才能替代',
        highConsequence: false,
        current: false,
        recentResult: 'missing',
        statistics,
        advice: '暂无足够样本',
      },
    ],
    complexity: [
      {
        key: 'strict-sample-shortage',
        gateKeys: ['strict'],
        signal: '暂无足够样本',
        detail: '严格门禁的同环境、同工作区状态样本少于 3 次，暂不判断趋势。',
        recommendation: '需要人工确认，不能自动删除',
        severity: 'info',
      },
      {
        key: 'strict-full-layering',
        gateKeys: ['full', 'strict'],
        signal: '共享同一 full 主路径',
        detail: 'strict 复用 full，不复制第二份测试列表。',
        recommendation: '有独立高风险价值，建议保留',
        severity: 'success',
      },
    ],
  }
}

function gaps() {
  return {
    schemaVersion: 'plush.quality-gate-gap-analysis/v1',
    range: 'current',
    risk: 'all',
    changedCount: 18,
    highestLevel: 'T5',
    requiresFull: true,
    matched: true,
    categories: [
      {
        key: 'frontend',
        label: '前端页面',
        risk: '静态检查通过仍可能遗漏真实交互、错误态和移动端布局问题。',
        highRisk: false,
        gates: ['browser-experience', 'full'],
        evidence: [
          '页面合同测试',
          '错误边界',
          '真实浏览器',
          '浅色与深色',
          '移动端、长文本和失败态',
        ],
        matchedCount: 12,
        gateResults: [
          {
            gateKey: 'browser-experience',
            label: '页面与真实浏览器',
            status: 'missing',
          },
          { gateKey: 'full', label: '完整门禁', status: 'missing' },
        ],
        status: 'missing',
        missing: ['browser-experience', 'full'],
      },
      {
        key: 'test-data',
        label: '测试数据',
        risk: '一次性数据库清理不完整会留下错误现场。',
        highRisk: true,
        gates: ['test-data-isolation', 'full'],
        evidence: [
          '固定 profile',
          '一次性数据库',
          'run identity 与 TTL',
          '成功和失败清理',
          'cleanup readback',
        ],
        matchedCount: 3,
        gateResults: [
          {
            gateKey: 'test-data-isolation',
            label: '测试数据隔离',
            status: 'missing',
          },
          { gateKey: 'full', label: '完整门禁', status: 'missing' },
        ],
        status: 'missing',
        missing: ['test-data-isolation', 'full'],
      },
    ],
    boundaries: [
      '本地门禁结果不证明目标环境发布',
      '部署 smoke 与回滚证据需要固定目标读回',
      '自动化通过不替代客户 UAT 与签收',
    ],
  }
}

async function installQualityRoutes(page, mode, counters) {
  await page.route('**/__dev/api/qa/quality-gates**', async (route) => {
    const url = new URL(route.request().url())
    let payload
    if (url.pathname.endsWith('/governance')) {
      counters.governance += 1
      payload = governance()
    } else if (url.pathname.endsWith('/gaps')) {
      counters.gaps += 1
      payload = gaps()
    } else {
      counters.summary += 1
      payload = createQualityGateStyleSummary(mode)
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(payload),
    })
  })
}

async function qualityGeometry(page) {
  return page.evaluate(() => {
    const tabList = document.querySelector('.erp-dev-quality-tabs')
    const table = document.querySelector('.ant-table-container')
    const flowSteps = [
      ...document.querySelectorAll('.erp-dev-quality-flow__step'),
    ]
    const firstFlowStyle = flowSteps[0] ? getComputedStyle(flowSteps[0]) : null
    const flowLefts = new Set(
      flowSteps.map((step) => Math.round(step.getBoundingClientRect().left))
    )
    return {
      viewportWidth: document.documentElement.clientWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      tabClientWidth: tabList?.clientWidth || 0,
      tabScrollWidth: tabList?.scrollWidth || 0,
      tabHeight: tabList?.getBoundingClientRect().height || 0,
      tableClientWidth: table?.clientWidth || 0,
      tableScrollWidth: table?.scrollWidth || 0,
      flowStepCount: flowSteps.length,
      flowColumnCount: flowLefts.size,
      flowStepBackground: firstFlowStyle?.backgroundColor || '',
      flowStepColor: firstFlowStyle?.color || '',
      currentFlowStepCount: document.querySelectorAll(
        '.erp-dev-quality-flow__step[aria-current="step"]'
      ).length,
      flowPassedCount: document.querySelectorAll(
        '.erp-dev-quality-flow__step[data-status="passed"]'
      ).length,
      flowRunningCount: document.querySelectorAll(
        '.erp-dev-quality-flow__step[data-status="running"]'
      ).length,
      flowFailedCount: document.querySelectorAll(
        '.erp-dev-quality-flow__step[data-status="failed"]'
      ).length,
      flowPendingCount: document.querySelectorAll(
        '.erp-dev-quality-flow__step[data-status="pending"]'
      ).length,
      flowNotRunCount: document.querySelectorAll(
        '.erp-dev-quality-flow__step[data-status="not_run"]'
      ).length,
      terminalPassedCount: document.querySelectorAll(
        '.erp-dev-quality-flow__terminal-item[data-status="passed"]'
      ).length,
      terminalFailedCount: document.querySelectorAll(
        '.erp-dev-quality-flow__terminal-item[data-status="failed"]'
      ).length,
      terminalPendingCount: document.querySelectorAll(
        '.erp-dev-quality-flow__terminal-item[data-status="pending"]'
      ).length,
      durationSegmentCount: document.querySelectorAll(
        '.erp-dev-quality-duration__segment'
      ).length,
      fixedSubstepDisclosureCount: document.querySelectorAll(
        '.erp-dev-quality-flow__substeps'
      ).length,
      historyTrendBarCount: document.querySelectorAll(
        '.erp-dev-quality-history-trend__bar'
      ).length,
      coverageMatrixCount: document.querySelectorAll(
        '.erp-dev-quality-coverage table'
      ).length,
      coverageMissingCount: document.querySelectorAll(
        '.erp-dev-quality-coverage__status[data-tone="missing"]'
      ).length,
      coverageNeutralCount: document.querySelectorAll(
        '.erp-dev-quality-coverage__status[data-tone="neutral"]'
      ).length,
      managedDiagramCount: document.querySelectorAll(
        '.erp-dev-quality-managed-database .erp-markdown-mermaid'
      ).length,
    }
  })
}

export function createDevQualityGateScenarios({
  assert,
  assertNoHorizontalOverflow,
  expectHeading,
  outputDir,
  path,
}) {
  return [
    {
      name: 'dev-quality-gates-run-light-desktop',
      path: '/__dev/quality-gates?view=run',
      viewport: { width: 1440, height: 900 },
      beforeNavigate: async (page) => {
        const counters = { summary: 0, governance: 0, gaps: 0 }
        page.__qualityCounters = counters
        await installQualityRoutes(page, 'idle', counters)
      },
      verify: async (page) => {
        await expectHeading(page, '质量门禁')
        const runStrictButton = page.getByRole('button', {
          name: '运行严格门禁',
        })
        await runStrictButton.waitFor()
        await runStrictButton.click({ trial: true })
        const strictHelpButton = page.getByRole('button', {
          name: '为什么优先推荐严格门禁',
        })
        await strictHelpButton.waitFor()
        assert.equal(
          await page.getByText('为什么推荐这个门禁', { exact: true }).count(),
          0
        )
        const [strictButtonBox, strictHelpBox] = await Promise.all([
          runStrictButton.boundingBox(),
          strictHelpButton.boundingBox(),
        ])
        assert(strictButtonBox, '严格门禁按钮应有可见布局')
        assert(strictHelpBox, '严格门禁问号应有可见布局')
        assert(
          strictHelpBox.x >= strictButtonBox.x + strictButtonBox.width - 1,
          JSON.stringify({ strictButtonBox, strictHelpBox })
        )
        assert(
          Math.abs(
            strictHelpBox.y +
              strictHelpBox.height / 2 -
              (strictButtonBox.y + strictButtonBox.height / 2)
          ) <= 1,
          JSON.stringify({ strictButtonBox, strictHelpBox })
        )
        const helpTooltip = page.getByRole('tooltip')
        await strictHelpButton.hover()
        await helpTooltip.getByText(/严格门禁比完整门禁多检查工具链/u).waitFor()
        await page.screenshot({
          path: path.join(
            outputDir,
            'dev-quality-gates-strict-help-tooltip-desktop.png'
          ),
        })
        await page.mouse.move(0, 0)
        await helpTooltip.waitFor({ state: 'hidden' })
        await strictHelpButton.focus()
        await helpTooltip.getByText(/严格门禁比完整门禁多检查工具链/u).waitFor()
        assert.equal(
          await strictHelpButton.evaluate(
            (element) => document.activeElement === element
          ),
          true
        )
        await runStrictButton.focus()
        await helpTooltip.waitFor({ state: 'hidden' })
        const tabs = page.getByRole('tab')
        assert.equal(await tabs.count(), 3)
        assert.equal(
          await page
            .getByRole('tab', { name: '运行与结果' })
            .getAttribute('aria-selected'),
          'true'
        )
        const initialTabViewport = await page.evaluate(() => ({
          panelTop: document
            .querySelector('[role="tabpanel"]')
            ?.getBoundingClientRect().top,
          scrollY: window.scrollY,
          tabTop: document
            .querySelector('.erp-dev-quality-tabs')
            ?.getBoundingClientRect().top,
        }))
        const assertTabViewportStable = async (transition) => {
          const current = await page.evaluate(() => ({
            panelTop: document
              .querySelector('[role="tabpanel"]')
              ?.getBoundingClientRect().top,
            scrollY: window.scrollY,
            tabTop: document
              .querySelector('.erp-dev-quality-tabs')
              ?.getBoundingClientRect().top,
          }))
          assert.equal(
            current.scrollY,
            initialTabViewport.scrollY,
            `${transition}: ${JSON.stringify({ initialTabViewport, current })}`
          )
          assert(
            Math.abs(current.tabTop - initialTabViewport.tabTop) <= 1,
            `${transition}: ${JSON.stringify({ initialTabViewport, current })}`
          )
          assert(
            Math.abs(current.panelTop - initialTabViewport.panelTop) <= 1,
            `${transition}: ${JSON.stringify({ initialTabViewport, current })}`
          )
        }
        await page.getByRole('tab', { name: '门禁治理' }).click()
        await page.waitForURL(
          '**/quality-gates?view=governance&filter=relevant'
        )
        await page.getByRole('tabpanel', { name: '门禁治理' }).waitFor()
        await assertTabViewportStable('click run-to-governance')
        await page.screenshot({
          path: path.join(
            outputDir,
            'dev-quality-gates-tab-stable-desktop.png'
          ),
        })
        await page
          .getByRole('tab', { name: '门禁治理', selected: true })
          .press('ArrowLeft')
        await page.waitForURL('**/quality-gates?view=run')
        await page.getByRole('tabpanel', { name: '运行与结果' }).waitFor()
        await assertTabViewportStable('keyboard governance-to-run')
        await page
          .getByRole('tab', { name: '运行与结果', selected: true })
          .press('End')
        await page.waitForURL(
          '**/quality-gates?view=gaps&range=current&risk=all'
        )
        await page
          .getByRole('tab', { name: '覆盖缺口', selected: true })
          .press('Home')
        await page.waitForURL('**/quality-gates?view=run')
        await page
          .getByRole('tab', { name: '运行与结果', selected: true })
          .press('ArrowRight')
        await page.waitForURL(
          '**/quality-gates?view=governance&filter=relevant'
        )
        await page.goBack()
        await page.waitForURL('**/quality-gates?view=run')
        await page.goForward()
        await page.waitForURL(
          '**/quality-gates?view=governance&filter=relevant'
        )
        await page.reload({ waitUntil: 'domcontentloaded' })
        await page.getByRole('tab', { name: '门禁治理' }).waitFor()
        assert.equal(
          await page
            .getByRole('tab', { name: '门禁治理' })
            .getAttribute('aria-selected'),
          'true'
        )
        await page.goBack()
        await page.waitForURL('**/quality-gates?view=run')
        await page.getByRole('button', { name: '运行严格门禁' }).waitFor()
        await page.getByText('严格门禁附加检查', { exact: true }).waitFor()
        await page.getByText('完整门禁共用主路径', { exact: true }).waitFor()
        await page.getByText('正式回执', { exact: true }).first().waitFor()
        await page.getByText('资源清理', { exact: true }).first().waitFor()
        let metrics = await qualityGeometry(page)
        assert.equal(metrics.flowStepCount, 11, JSON.stringify(metrics))
        assert.equal(metrics.durationSegmentCount, 0, JSON.stringify(metrics))
        assert.equal(metrics.managedDiagramCount, 0, JSON.stringify(metrics))
        const managedGuide = page.locator('.erp-dev-quality-managed-database')
        await managedGuide
          .getByText('查看本机托管数据库的静态运行与清理流程', {
            exact: true,
          })
          .click()
        await page
          .getByText('静态工作原理，不代表当前运行状态', { exact: true })
          .waitFor()
        await managedGuide
          .locator('.erp-markdown-mermaid[data-mermaid-status="rendered"]')
          .waitFor()
        metrics = await qualityGeometry(page)
        assert.equal(metrics.managedDiagramCount, 1, JSON.stringify(metrics))
        await managedGuide.screenshot({
          path: path.join(
            outputDir,
            'dev-quality-gates-managed-database-guide-desktop.png'
          ),
        })
        await managedGuide
          .getByText('查看本机托管数据库的静态运行与清理流程', {
            exact: true,
          })
          .click()
        await page.screenshot({
          path: path.join(outputDir, 'dev-quality-gates-run-light-desktop.png'),
          fullPage: true,
        })
        await assertNoHorizontalOverflow(
          page,
          'dev-quality-gates-run-light-desktop'
        )
      },
    },
    {
      name: 'dev-quality-gates-governance-dark-running',
      path: '/__dev/quality-gates?view=governance',
      themeMode: 'dark',
      viewport: { width: 1440, height: 900 },
      beforeNavigate: async (page) => {
        const counters = { summary: 0, governance: 0, gaps: 0 }
        page.__qualityCounters = counters
        await installQualityRoutes(page, 'running', counters)
      },
      verify: async (page) => {
        await expectHeading(page, '质量门禁')
        await page.getByRole('button', { name: '返回运行' }).waitFor()
        await page.getByRole('table').waitFor()
        assert.equal(await page.getByText('Stable key').count(), 0)
        await page.getByText('暂无足够样本', { exact: true }).last().waitFor()
        assert.equal(page.__qualityCounters.gaps, 0)
        await page.screenshot({
          path: path.join(
            outputDir,
            'dev-quality-gates-governance-dark-running.png'
          ),
          fullPage: true,
        })
        await assertNoHorizontalOverflow(
          page,
          'dev-quality-gates-governance-dark-running'
        )
        await page.getByRole('button', { name: '返回运行' }).click()
        await page.waitForURL('**/quality-gates?view=run')
        const currentStep = page.locator(
          '.erp-dev-quality-flow__step[aria-current="step"]'
        )
        await currentStep.waitFor()
        assert.equal(await currentStep.count(), 1)
        await currentStep.getByText('Web 测试与生产构建').waitFor()
        const metrics = await qualityGeometry(page)
        assert.equal(metrics.flowPassedCount, 7, JSON.stringify(metrics))
        assert.equal(metrics.flowRunningCount, 1, JSON.stringify(metrics))
        assert.equal(metrics.flowPendingCount, 3, JSON.stringify(metrics))
        assert.equal(metrics.flowFailedCount, 0, JSON.stringify(metrics))
        assert.equal(metrics.terminalPendingCount, 2, JSON.stringify(metrics))
        assert.equal(metrics.durationSegmentCount, 7, JSON.stringify(metrics))
        assert.equal(
          metrics.fixedSubstepDisclosureCount,
          2,
          JSON.stringify(metrics)
        )
        await page.screenshot({
          path: path.join(outputDir, 'dev-quality-gates-run-dark-running.png'),
          fullPage: true,
        })
        await assertNoHorizontalOverflow(
          page,
          'dev-quality-gates-run-dark-running'
        )
      },
    },
    {
      name: 'dev-quality-gates-run-mobile-390',
      path: '/__dev/quality-gates?view=run&profile=strict',
      themeMode: 'dark',
      viewport: { width: 390, height: 844 },
      beforeNavigate: async (page) => {
        await installQualityRoutes(page, 'failed', {
          summary: 0,
          governance: 0,
          gaps: 0,
        })
      },
      verify: async (page) => {
        await expectHeading(page, '质量门禁')
        const strictHelpButton = page.getByRole('button', {
          name: '为什么优先推荐严格门禁',
        })
        await strictHelpButton.waitFor()
        const strictHelpBox = await strictHelpButton.boundingBox()
        assert(strictHelpBox, '移动端严格门禁问号应保持可见')
        assert(
          strictHelpBox.x + strictHelpBox.width <= 391,
          JSON.stringify(strictHelpBox)
        )
        await page.getByText('第一失败：Web 测试与生产构建未通过').waitFor()
        const metrics = await qualityGeometry(page)
        assert(
          metrics.tabScrollWidth <= metrics.tabClientWidth + 1,
          JSON.stringify(metrics)
        )
        assert(metrics.tabHeight <= 55, JSON.stringify(metrics))
        assert(
          metrics.documentWidth <= metrics.viewportWidth + 1,
          JSON.stringify(metrics)
        )
        assert(
          metrics.bodyWidth <= metrics.viewportWidth + 1,
          JSON.stringify(metrics)
        )
        assert(
          metrics.tableScrollWidth >= metrics.tableClientWidth,
          JSON.stringify(metrics)
        )
        assert.equal(metrics.flowStepCount, 11, JSON.stringify(metrics))
        assert.equal(metrics.flowColumnCount, 1, JSON.stringify(metrics))
        assert.equal(metrics.currentFlowStepCount, 0, JSON.stringify(metrics))
        assert.equal(metrics.flowPassedCount, 7, JSON.stringify(metrics))
        assert.equal(metrics.flowFailedCount, 1, JSON.stringify(metrics))
        assert.equal(metrics.flowNotRunCount, 3, JSON.stringify(metrics))
        assert.equal(metrics.flowPendingCount, 0, JSON.stringify(metrics))
        assert.equal(metrics.terminalPassedCount, 1, JSON.stringify(metrics))
        assert.equal(metrics.terminalFailedCount, 1, JSON.stringify(metrics))
        assert.equal(metrics.durationSegmentCount, 8, JSON.stringify(metrics))
        assert.equal(
          metrics.fixedSubstepDisclosureCount,
          2,
          JSON.stringify(metrics)
        )
        assert.notEqual(
          metrics.flowStepBackground,
          'rgb(255, 255, 255)',
          JSON.stringify(metrics)
        )
        assert.notEqual(
          metrics.flowStepBackground,
          metrics.flowStepColor,
          JSON.stringify(metrics)
        )
        await page.getByText('未执行', { exact: true }).first().waitFor()
        await page.getByText('最长阶段', { exact: true }).waitFor()
        await page.getByText('终态证明', { exact: true }).waitFor()
        await page.screenshot({
          path: path.join(outputDir, 'dev-quality-gates-run-mobile-390.png'),
          fullPage: true,
        })
        await assertNoHorizontalOverflow(
          page,
          'dev-quality-gates-run-mobile-390'
        )
      },
    },
    {
      name: 'dev-quality-gates-gaps-mobile-320',
      path: '/__dev/quality-gates?view=gaps',
      viewport: { width: 320, height: 800 },
      beforeNavigate: async (page) => {
        await installQualityRoutes(page, 'idle', {
          summary: 0,
          governance: 0,
          gaps: 0,
        })
      },
      verify: async (page) => {
        await expectHeading(page, '质量门禁')
        await page.getByText('当前改动', { exact: true }).first().waitFor()
        await page.getByText('仍缺必需门禁').first().waitFor()
        const metrics = await qualityGeometry(page)
        assert(
          metrics.tabScrollWidth <= metrics.tabClientWidth + 1,
          JSON.stringify(metrics)
        )
        assert(metrics.tabHeight <= 55, JSON.stringify(metrics))
        assert(
          metrics.documentWidth <= metrics.viewportWidth + 1,
          JSON.stringify(metrics)
        )
        assert(
          metrics.bodyWidth <= metrics.viewportWidth + 1,
          JSON.stringify(metrics)
        )
        assert.equal(metrics.coverageMatrixCount, 1, JSON.stringify(metrics))
        assert.equal(metrics.coverageMissingCount, 4, JSON.stringify(metrics))
        assert.equal(metrics.coverageNeutralCount, 2, JSON.stringify(metrics))
        await page.getByText('— 未运行', { exact: true }).first().waitFor()
        await page.getByText('· 不适用', { exact: true }).first().waitFor()
        await page.screenshot({
          path: path.join(outputDir, 'dev-quality-gates-gaps-mobile-320.png'),
          fullPage: true,
        })
        await assertNoHorizontalOverflow(
          page,
          'dev-quality-gates-gaps-mobile-320'
        )
      },
    },
    {
      name: 'dev-quality-gates-run-history-light',
      path: '/__dev/quality-gates?view=run&profile=strict',
      viewport: { width: 1440, height: 900 },
      beforeNavigate: async (page) => {
        await installQualityRoutes(page, 'history', {
          summary: 0,
          governance: 0,
          gaps: 0,
        })
      },
      verify: async (page) => {
        await expectHeading(page, '质量门禁')
        await page.getByText('历史运行', { exact: true }).waitFor()
        await page
          .getByText(
            '这是旧版本的历史运行记录，不代表当前版本；请以当前仓库身份的正式回执为准。',
            { exact: true }
          )
          .waitFor()
        const metrics = await qualityGeometry(page)
        assert.equal(metrics.flowStepCount, 11, JSON.stringify(metrics))
        assert.equal(metrics.flowPassedCount, 11, JSON.stringify(metrics))
        assert.equal(metrics.flowNotRunCount, 0, JSON.stringify(metrics))
        assert.equal(metrics.currentFlowStepCount, 0, JSON.stringify(metrics))
        assert.equal(metrics.terminalPassedCount, 2, JSON.stringify(metrics))
        assert.equal(metrics.durationSegmentCount, 11, JSON.stringify(metrics))
        assert.equal(metrics.historyTrendBarCount, 3, JSON.stringify(metrics))
        await page.getByText('3 个可比样本', { exact: true }).waitFor()
        await page.screenshot({
          path: path.join(outputDir, 'dev-quality-gates-run-history-light.png'),
          fullPage: true,
        })
        await assertNoHorizontalOverflow(
          page,
          'dev-quality-gates-run-history-light'
        )
      },
    },
    {
      name: 'dev-quality-gates-invalid-query-fail-closed',
      path: '/__dev/quality-gates?view=run&command=unsafe',
      viewport: { width: 390, height: 844 },
      beforeNavigate: async (page) => {
        await installQualityRoutes(page, 'idle', {
          summary: 0,
          governance: 0,
          gaps: 0,
        })
      },
      verify: async (page) => {
        await page.getByText('当前质量门禁链接无效或已经过期').waitFor()
        assert.equal(
          await page.getByRole('button', { name: '运行严格门禁' }).isDisabled(),
          true
        )
        await page.getByRole('button', { name: '安全返回默认视图' }).click()
        await page.waitForURL('**/quality-gates?view=run')
      },
    },
  ]
}
