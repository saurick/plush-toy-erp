import {
  DEV_PRESSURE_CHECKS,
  DEV_PRESSURE_FINGERPRINTS,
} from '../../src/dev-workbench/config/devPressure.mjs'
import { DEV_TESTING_GIT_HOOK_CHECKS } from '../../src/dev-workbench/config/devTestingOperation.mjs'

const ID = '123e4567-e89b-42d3-a456-426614174000'
function pressureFixture() {
  const metrics = {
    requests: 100,
    successes: 100,
    failures: 0,
    successfulRps: 3.56,
    p95Ms: 549,
    p99Ms: 589,
  }
  const levels = ['ramp', 'capacity', 'recovery'].map((key) => ({
    key,
    concurrency: 4,
    elapsedMs: key === 'capacity' ? 600634 : 12000,
    targetDurationMs: key === 'capacity' ? 600000 : null,
    pacingMs: 1000,
    accepted: true,
    operations: metrics,
    rpc: { ...metrics, successfulRps: 6.41 },
    flows: {
      ...metrics,
      requests: 10,
      successes: 10,
      p95Ms: 2170,
      p99Ms: 2300,
    },
    completedBusinessFlows: 214,
    methods: [
      {
        ...metrics,
        name: 'sales_order.finance_review_engineering_material_request',
      },
      { ...metrics, name: `sales_order.get_${'long_method_name_'.repeat(8)}` },
    ],
    limits: {
      p95Ms: 1000,
      p99Ms: 2000,
      minSuccessfulRps: 1,
      minMethodSamples: 5,
    },
  }))
  return {
    id: 'history-capacity',
    profile: 'capacity',
    comparisonKey: 'd'.repeat(64),
    dataset: { dataScale: 'growth',
totalOrders: 362,
      working: { orders: 262, ordinaryOrders: 174, complexOrders: 88, orderItems: 878, demandSources: 17592 },
      history: { orders: 100, ordinaryOrders: 66, complexOrders: 34, orderItems: 338, demandSources: 6792, purchaseOrders: 80, purchaseItems: 120, states: { PREVIEW: 20, SUBMITTED: 20, BOSS_APPROVED: 20, APPROVED: 40 } },
      reads: { target: { workflowTasks: 15000, productionFacts: 6000, financeFacts: 6000, attachments: 1000 }, actual: { workflowTasks: 15000, productionFacts: 6000, financeFacts: 6000, attachments: 1000 } },
      complexity: { ordinary: { lines: 1, bomParts: 4, sources: 4 }, complex: { lines: 8, bomParts: 24, sources: 192 } },
      storage: { databaseBytes: 345678901, businessTableBytes: 12345678 } },
    status: 'passed',
    freshness: 'changed',
    startedAt: '2026-10-02T10:00:00Z',
    completedAt: '2026-10-02T10:10:00Z',
    changed: ['build'],
    unknown: [],
    candidate: {
      commit: 'a'.repeat(40),
      treeState: 'dirty',
      migration: '20260927100348',
      binarySHA256: 'b'.repeat(64),
      fingerprints: Object.fromEntries(
        Object.keys(DEV_PRESSURE_FINGERPRINTS)
          .filter((key) => key !== 'commit')
          .map((key) => [key, 'b'.repeat(64)])
      ),
    },
    engineering: { passed: true, levels },
    reads: { passed: true, levels },
    failureStage: null,
    steps: [],
    checks: {
      ...Object.fromEntries(
        Object.keys(DEV_PRESSURE_CHECKS).map((key) => [key, true])
      ),
      concurrency: 20,
    },
    database: {
      before: { inventoryTxns: 0 },
      after: { inventoryTxns: 0, purchaseOrders: 472 },
    },
    runtime: { maxHeapBytes: null },
    environment: {
      backend: { gomaxprocs: 4, maxOpenConnections: 20 },
      containers: [],
    },
  }
}

export function createDevPressureScenarios({
  assert,
  assertNoHorizontalOverflow,
}) {
  let mode = 'history'
    let operation = null
    let actionRequests = []
    let reportReads = 0
    let deferredRead = null
    let releaseDeferred = null
  const report = pressureFixture()
  const baseline = { ...report, id: 'history-baseline', dataScale: 'baseline', historyOrders: 20, main: report.engineering.levels[1] }
  const different = { ...baseline, id: 'different-host', comparisonKey: 'e'.repeat(64) }
  const envelope = () => ({
    schemaVersion: 'plush.dev-pressure-reports/v1',
    reports: mode === 'empty' ? [] : [report, baseline, different],
    report:
      mode === 'empty' || mode === 'running'
        ? null
        : mode === 'failed'
          ? {
              ...report,
              status: 'failed',
              failureStage: 'engineering-pressure',
              checks: { ...report.checks, databaseConsistency: false },
            }
          : report,
    progress:
      mode === 'running'
        ? {
            phase: 'engineering-data',
            status: 'running',
            updatedAt: '2026-10-02T10:05:00Z',
            stage: 'orders',
            completedSteps: ['build', 'containers'],
            completed: 20,
            total: 42,
            targetDurationMs: null,
          }
        : null,
    invalidCount: 0,
  })
  const reply = (route, value, status = 200) =>
    route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(value),
    })
  return [
    {
      name: 'dev-pressure-desktop',
      path: '/__dev/testing?view=pressure',
      viewport: { width: 1440, height: 900 },
      beforeNavigate: async (page) => {
        mode = 'history'
        operation = null
        actionRequests = []
        reportReads = 0
        await page.route(
          '**/__dev/api/qa/testing/pressure-reports*',
          async (route) => {
            reportReads++
            if (mode === 'deferred') {
              deferredRead = route
              return new Promise((resolve) => {
                releaseDeferred = resolve
              })
            }
            await reply(
              route,
              mode === 'read-error' ? { schemaVersion: 'invalid' } : envelope()
            )
          }
        )
        await page.route('**/__dev/api/qa/testing', (route) =>
          reply(route, {
            schemaVersion: 'plush.dev-qa-testing-summary/v2',
            busy: {
              active: Boolean(operation),
              kind: operation ? 'testing' : '',
              profile: operation ? 'pressure-quick' : '',
            },
            hooks: {
              status: 'ready',
              expectedHooksPath: '.githooks',
              configuredHooksPath: '.githooks',
              checks: DEV_TESTING_GIT_HOOK_CHECKS.map(({ key }) => ({
                key,
                status: 'ready',
              })),
            },
            operations: {
              fast: null,
              'role-access': null,
              'field-linkage': null,
              'pressure-quick': operation,
              'pressure-capacity': null,
            },
          })
        )
        await page.route('**/__dev/api/qa/testing/session', (route) =>
          reply(route, {
            schemaVersion: 'plush.dev-qa-testing-session/v1',
            apiPath: '/__dev/api/qa/testing',
            csrfToken: 'c'.repeat(48),
          })
        )
        await page.route('**/__dev/api/qa/testing/actions', (route) => {
          actionRequests.push(route.request().postDataJSON())
          mode = 'running'
          operation = {
            schemaVersion: 'plush.dev-qa-testing-operation-public/v1',
            id: ID,
            action: 'pressure-quick',
            dataScale: 'growth',
            repository: {
              commit: 'a'.repeat(40),
              dirty: true,
              fingerprint: 'b'.repeat(64),
            },
            status: 'running',
            stage: 'running',
            outcome: null,
            exitCode: null,
            revision: 2,
            createdAt: '2026-10-02T10:00:00Z',
            updatedAt: '2026-10-02T10:00:01Z',
            finishedAt: null,
            message: '正在运行短档压力测试',
          }
          return reply(route, {
            schemaVersion: 'plush.dev-qa-testing-action-result/v1',
            action: 'pressure-quick',
            reused: false,
            operation,
          })
        })
        await page.route('**/__dev/api/qa/testing/operations/*', (route) =>
          reply(route, {
            schemaVersion: 'plush.dev-qa-testing-operation-result/v1',
            operation,
          })
        )
      },
      verify: async (page) => {
        const panel = page.locator('.erp-dev-pressure-panel')
        await panel
          .getByText('历史候选 · 源码已变化', { exact: true })
          .waitFor()
        assert.equal(await panel.locator('.erp-dev-pressure-metric').count(), 4)
        await panel.getByRole('table', { name: '每方法延迟与样本' }).waitFor()
        await panel.getByRole('table', { name: '历史背景与当轮订单池' }).waitFor()
        await panel.getByRole('combobox', { name: '比较基准报告' }).press('ArrowDown')
        await page.locator('.ant-select-dropdown:visible').getByText('基础 · 容量 · history-baseline', { exact: true }).click()
        await panel.getByRole('table', { name: '不同数据规模的 API 延迟变化' }).waitFor()
        await assertNoHorizontalOverflow(page, '压力报告长方法与规模比较')
        await panel.getByRole('combobox', { name: '比较基准报告' }).press('ArrowDown')
        await page.locator('.ant-select-dropdown:visible').getByText('基础 · 容量 · different-host', { exact: true }).click()
        await panel.getByText('源码、负载或运行环境不同，不能归因于数据规模。', { exact: true }).waitFor()
        assert.equal(await panel.getByRole('table', { name: '不同数据规模的 API 延迟变化' }).count(), 0)
        await assertNoHorizontalOverflow(page, '压力报告长方法与摘要')
        const nav = page.locator('.erp-dev-testing-primary-nav')
          const before = await nav.boundingBox()
        const reload = () =>
          panel
            .getByRole('button', { name: '重新读取报告', exact: true })
            .click()
        mode = 'failed'
        await reload()
        await panel
          .getByText('该次压力测试未形成完整通过证据', { exact: true })
          .waitFor()
        await panel
          .getByText('停止于：业务负载与对账。', { exact: false })
          .waitFor()
        mode = 'read-error'
        await reload()
        await panel
          .getByText('压力测试报告读取失败，请重新读取或检查本地开发服务。', {
            exact: true,
          })
          .waitFor()
        assert.equal(
          await panel.locator('.erp-dev-pressure-metric').count(),
          4,
          '读失败应保留已读历史结果'
        )
        mode = 'empty'
        await reload()
        await panel
          .getByText('尚无可读压力测试报告；运行短档回归生成第一份证据。', {
            exact: true,
          })
          .waitFor()
        assert.equal(actionRequests.length, 0, '读报告和重新读取不得发起运行')
        mode = 'history'
        await reload()
        await panel
          .getByText('历史候选 · 源码已变化', { exact: true })
          .waitFor()
        await panel.getByRole('combobox', { name: '数据规模', exact: true }).press('ArrowDown')
        await page.locator('.ant-select-dropdown:visible').getByText('增长 · 100 张历史单', { exact: true }).click()
        await panel
          .getByRole('button', { name: '运行短档回归', exact: true })
          .click()
        await panel.getByText('业务造数 · 20 / 42', { exact: true }).waitFor()
        assert.equal(actionRequests.length, 1)
        assert.equal(actionRequests[0].action, 'pressure-quick')
        assert.deepEqual(Object.keys(actionRequests[0].payload), [
          'idempotencyKey', 'dataScale',
        ])
        assert.equal(actionRequests[0].payload.dataScale, 'growth')
        assert.equal(
          await panel
            .getByRole('button', { name: '运行 10 分钟容量', exact: true })
            .isDisabled(),
          true
        )
        await page.reload()
        await panel.getByText('业务造数 · 20 / 42', { exact: true }).waitFor()
        assert.equal(actionRequests.length, 1, '刷新恢复运行状态不得重新启动')
        const requestsBeforeSwitch = reportReads
        const motion = await nav.evaluate(async (root) => {
          const group = root.querySelector('.ant-segmented-group')
          const read = () =>
            new DOMMatrixReadOnly(getComputedStyle(group, '::before').transform)
              .m41
          const initial = read()
            const samples = []
          group.querySelector('.ant-segmented-item').click()
          for (let index = 0; index < 30; index++) {
            await new Promise((resolve) => requestAnimationFrame(resolve))
            samples.push(read())
          }
          return { initial, final: samples.at(-1), samples }
        })
        assert(
          Math.abs(motion.initial - motion.final) > 5,
          '压力测试页签应移动到本轮验证'
        )
        assert(
          motion.samples.some(
            (x) =>
              Math.abs(x - motion.initial) > 1 && Math.abs(x - motion.final) > 1
          ),
          '真实切换应存在动画中间帧'
        )
        await page.getByRole('table', { name: '固定检查与独立证据' }).waitFor()
        assert.equal(await page.locator('.erp-dev-pressure-panel').count(), 0)
        const after = await nav.boundingBox()
        assert(
          Math.abs(before.x - after.x) < 1 &&
            Math.abs(before.width - after.width) < 1,
          '主页签几何保持稳定'
        )
        assert(reportReads >= requestsBeforeSwitch)
        await page.emulateMedia({ reducedMotion: 'reduce' })
        await nav.getByText('压力测试', { exact: true }).click()
        const duration = await nav
          .locator('.ant-segmented-group')
          .evaluate(
            (group) => getComputedStyle(group, '::before').transitionDuration
          )
        assert(
          duration.split(',').every((value) => parseFloat(value) === 0),
          '减少动态效果时应关闭位移动画'
        )
        await panel.waitFor()
        operation = null
        mode = 'deferred'
        await reload()
        while (!deferredRead) await page.waitForTimeout(20)
        await nav.getByText('本轮验证', { exact: true }).click()
        await reply(deferredRead, { schemaVersion: 'invalid' }).catch(() => {})
        releaseDeferred()
        assert.equal(
          await page
            .getByText('压力测试报告读取失败，请重新读取或检查本地开发服务。', {
              exact: true,
            })
            .count(),
          0,
          '离开后旧响应不能污染新视图'
        )
        await assertNoHorizontalOverflow(page, '压测返回本轮验证')
      },
    },
  ]
}
