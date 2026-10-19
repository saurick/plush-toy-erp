import { RPC_CONTRACT_REVIEW_API } from '../../src/dev-workbench/config/devRPCContractReview.mjs'
import {
  DEV_PRESSURE_ACTIONS,
  DEV_TESTING_FIXED_ACTIONS,
  DEV_TESTING_GIT_HOOK_CHECKS,
} from '../../src/dev-workbench/config/devTestingOperation.mjs'

const METHOD = 'inventory.list_inventory_lots'

function review(range, synchronized) {
  const staged = range === 'staged'
  return {
    kind: 'plush.rpc-contract-review',
    range,
    base: 'a'.repeat(40),
    repository: {
      commit: 'a'.repeat(40),
      fingerprint: 'b'.repeat(64),
      dirty: true,
    },
    current: true,
    readAt: '2026-10-19T10:00:00Z',
    methodCount: 1,
    changes: staged
      ? []
      : [
          {
            key: METHOD,
            label: '查询库存批次',
            kind: 'changed',
            source: 'server/internal/service/jsonrpc_inventory.go',
            fields: [
              {
                path: 'response.result.data.total.type',
                kind: 'changed',
                before: 'integer',
                after: 'string',
              },
            ],
            consumers: [
              {
                key: METHOD,
                path: 'web/src/erp/api/inventoryApi.mjs',
                line: 43,
              },
            ],
          },
        ],
    checks: [
      { key: 'catalog', status: 'passed', message: '后端与正式方法表一致' },
      {
        key: 'generated',
        status: staged ? 'missing' : synchronized ? 'passed' : 'failed',
        message: staged
          ? '暂存范围没有接口相关改动'
          : synchronized
            ? '检查通过'
            : '接口字段合同未同步',
      },
      { key: 'staging', status: 'missing', message: '暂存范围没有接口改动' },
    ],
    files: [
      { path: 'server/docs/api.md', worktreeChanged: true, staged: false },
    ],
    execution: {
      status: staged ? 'passed' : 'missing',
      current: false,
      registered: staged ? [] : [METHOD],
      methods: staged
        ? [
            {
              key: METHOD,
              test: `TestRPCDocumentedExamples/${METHOD}`,
              status: 'passed',
              cases: [{ name: 'documented', status: 'passed' }],
            },
          ]
        : [],
      receipt: staged ? 'output/dev-workbench/contracts/examples.json' : null,
    },
  }
}

export async function verifyRPCContractReviewWorkspace(
  page,
  { assert, assertNoHorizontalOverflow }
) {
  const originalViewport = page.viewportSize()
  const pattern = `**${RPC_CONTRACT_REVIEW_API}?*`
  const testingPattern = '**/__dev/api/qa/testing'
  let failRead = false
  let synchronized = false
  const reportRoute = (route) =>
    failRead
      ? route.fulfill({
          status: 500,
          json: { message: 'fixture read unavailable' },
        })
      : route.fulfill({
          json: review(
            new URL(route.request().url()).searchParams.get('range'),
            synchronized
          ),
        })
  const testingRoute = (route) =>
    route.fulfill({
      json: {
        kind: 'plush.dev-qa-testing-summary',
        busy: { active: false, kind: '', profile: '' },
        operations: Object.fromEntries(
          [...DEV_TESTING_FIXED_ACTIONS, ...DEV_PRESSURE_ACTIONS].map(
            (action) => [action.key, null]
          )
        ),
        hooks: {
          expectedHooksPath: '.githooks',
          configuredHooksPath: '.githooks',
          status: 'ready',
          checks: DEV_TESTING_GIT_HOOK_CHECKS.map(({ key }) => ({
            key,
            status: 'ready',
          })),
        },
      },
    })
  await page.route(pattern, reportRoute)
  await page.route(testingPattern, testingRoute)
  try {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto(
      new URL(`/__dev/integration?view=changes&change=${METHOD}`, page.url())
        .href
    )
    const workspace = page.locator('.erp-dev-rpc-review')
    await workspace.getByText('1 项合同检查需要修正', { exact: true }).waitFor()
    await workspace.getByRole('cell', { name: 'string', exact: true }).waitFor()
    await assertNoHorizontalOverflow(page, '接口合同差异与长方法标识')
    await page.getByRole('tab', { name: '样例核对', exact: true }).click()
    await workspace
      .getByText('尚无样例执行回执；关联测试名称不能代替实际执行。', {
        exact: true,
      })
      .waitFor()
    await workspace
      .getByRole('link', { name: '到改动验证执行样例核对', exact: true })
      .click()
    await page.getByRole('heading', { name: '改动验证', exact: true }).waitFor()
    await workspace
      .getByRole('button', { name: '运行样例核对', exact: true })
      .waitFor()
    assert.equal(
      new URL(page.url()).searchParams.get('change'),
      METHOD,
      '跨页保留当前接口'
    )
    assert.equal(
      await workspace
        .getByRole('button', { name: '运行样例核对', exact: true })
        .isEnabled(),
      true,
      '固定动作就绪后可在工作区执行'
    )
    await workspace
      .locator('.erp-dev-rpc-review__toolbar .ant-select-selector')
      .click()
    await page.getByText('HEAD → 暂存快照', { exact: true }).last().click()
    await workspace.getByText('暂无暂存的接口改动', { exact: true }).waitFor()
    await workspace.getByText('历史通过', { exact: true }).waitFor()
    assert.equal(
      await workspace
        .getByRole('button', { name: '运行样例核对', exact: true })
        .isDisabled(),
      true,
      '暂存视图不执行工作区样例或补造暂存通过'
    )
    await assertNoHorizontalOverflow(page, '暂存快照与文件范围')
    await page.reload()
    await workspace.getByText('暂无暂存的接口改动', { exact: true }).waitFor()
    assert.equal(
      new URL(page.url()).searchParams.get('contractRange'),
      'staged'
    )
    await workspace
      .locator('.erp-dev-rpc-review__toolbar .ant-select-selector')
      .click()
    await page.getByText('HEAD → 工作区', { exact: true }).last().click()
    await workspace.getByText('1 项合同检查需要修正', { exact: true }).waitFor()
    failRead = true
    await workspace
      .getByRole('button', { name: '重新读取', exact: true })
      .click()
    await workspace.getByText('接口合同检查读取失败', { exact: true }).waitFor()
    failRead = false
    synchronized = true
    await workspace.getByRole('button', { name: '重试', exact: true }).click()
    await workspace
      .getByText('目录与字段检查未发现阻断项', { exact: true })
      .waitFor()
    await workspace
      .getByRole('link', { name: '回到合同差异', exact: true })
      .click()
    await page.getByRole('tab', { name: '合同差异', exact: true }).waitFor()
    await workspace.getByRole('cell', { name: 'string', exact: true }).waitFor()
    assert.equal(new URL(page.url()).searchParams.get('change'), METHOD)
  } finally {
    await page.unroute(pattern, reportRoute)
    await page.unroute(testingPattern, testingRoute)
    if (originalViewport) await page.setViewportSize(originalViewport)
  }
}
