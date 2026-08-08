const NOW = '2026-08-09T08:00:00.000Z'
const OPERATION_ID = '11111111-1111-4111-8111-111111111111'

const repository = Object.freeze({
  commit: '0d3f91e24d82133ba8ff1893ad6333fd7d6d1c54',
  dirty: true,
  fingerprint: 'b'.repeat(64),
})

function qualityOperation(status = 'running') {
  const terminal = ['failed', 'passed', 'cancelled', 'timed_out'].includes(
    status
  )
  return {
    schemaVersion: 'plush.dev-quality-gate-operation-public/v1',
    id: OPERATION_ID,
    profile: 'strict',
    repository,
    status,
    stage: 'web',
    stageTimings: [
      {
        id: 'strict_profile',
        label: '严格门禁配置',
        status: 'passed',
        startedAt: '2026-08-09T07:55:00.000Z',
        finishedAt: '2026-08-09T07:55:10.000Z',
        durationMs: 10_000,
      },
      {
        id: 'environment_profile',
        label: '环境与工具链准备',
        status: 'passed',
        startedAt: '2026-08-09T07:55:10.000Z',
        finishedAt: '2026-08-09T07:56:00.000Z',
        durationMs: 50_000,
      },
      {
        id: 'web',
        label: 'Web 测试与生产构建',
        status:
          status === 'failed'
            ? 'failed'
            : status === 'running'
              ? 'running'
              : 'passed',
        startedAt: '2026-08-09T07:56:00.000Z',
        finishedAt: status === 'running' ? null : '2026-08-09T08:00:00.000Z',
        durationMs: status === 'running' ? null : 240_000,
      },
    ],
    receipt: null,
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

export function createQualityGateStyleSummary(mode = 'idle') {
  const operation = mode === 'idle' ? null : qualityOperation(mode)
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
          { id: 'environment_profile', label: '环境与工具链准备' },
          { id: 'shared', label: '共享基础检查' },
          { id: 'secrets', label: '敏感信息扫描' },
          { id: 'web', label: 'Web 测试与生产构建' },
          { id: 'browser', label: '浏览器回归' },
          { id: 'server', label: '隔离数据库、迁移与 Server 测试' },
          { id: 'govulncheck', label: 'Go 可达漏洞检查' },
        ],
      },
      strict: {
        timeoutMs: 10_800_000,
        stages: [
          { id: 'strict_profile', label: '严格门禁配置' },
          { id: 'environment_profile', label: '环境与工具链准备' },
          { id: 'shared', label: '共享基础检查' },
          { id: 'secrets', label: '敏感信息扫描' },
          { id: 'web', label: 'Web 测试与生产构建' },
          { id: 'browser', label: '浏览器回归' },
          { id: 'server', label: '隔离数据库、迁移与 Server 测试' },
          { id: 'govulncheck', label: 'Go 可达漏洞检查' },
        ],
      },
    },
    currentOperation: active ? operation : null,
    operations: operation ? [operation] : [],
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
    return {
      viewportWidth: document.documentElement.clientWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      tabClientWidth: tabList?.clientWidth || 0,
      tabScrollWidth: tabList?.scrollWidth || 0,
      tabHeight: tabList?.getBoundingClientRect().height || 0,
      tableClientWidth: table?.clientWidth || 0,
      tableScrollWidth: table?.scrollWidth || 0,
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
        const tabs = page.getByRole('tab')
        assert.equal(await tabs.count(), 3)
        assert.equal(
          await page
            .getByRole('tab', { name: '运行与结果' })
            .getAttribute('aria-selected'),
          'true'
        )
        await page.getByRole('tab', { name: '运行与结果' }).focus()
        await page.keyboard.press('ArrowRight')
        await page.waitForURL('**/quality-gates?view=governance')
        await page.keyboard.press('ArrowLeft')
        await page.waitForURL('**/quality-gates?view=run')
        await page.keyboard.press('End')
        await page.waitForURL('**/quality-gates?view=gaps')
        await page.keyboard.press('Home')
        await page.waitForURL('**/quality-gates?view=run')
        await page.keyboard.press('ArrowRight')
        await page.waitForURL('**/quality-gates?view=governance')
        await page.goBack()
        await page.waitForURL('**/quality-gates?view=run')
        await page.goForward()
        await page.waitForURL('**/quality-gates?view=governance')
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
      },
    },
    {
      name: 'dev-quality-gates-run-mobile-390',
      path: '/__dev/quality-gates?view=run&profile=strict',
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
