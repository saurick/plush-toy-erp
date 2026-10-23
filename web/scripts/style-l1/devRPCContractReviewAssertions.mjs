import { RPC_CONTRACT_REVIEW_API } from '../../src/dev-workbench/config/devRPCContractReview.mjs'
import {
  DEV_PRESSURE_ACTIONS,
  DEV_TESTING_FIXED_ACTIONS,
  DEV_TESTING_GIT_HOOK_CHECKS,
} from '../../src/dev-workbench/config/devTestingOperation.mjs'

const METHOD = 'inventory.list_inventory_lots'
const REPOSITORY = { commit: 'a'.repeat(40), fingerprint: 'b'.repeat(64), dirty: true }
const OPERATION_ID = '4b6c68e0-e060-4d4e-adb8-3b31c48d0a04'

function review(range, { synchronized, executed, noChanges }) {
  const staged = range === 'staged'
  return {
    kind: 'plush.rpc-contract-review', range, base: REPOSITORY.commit,
    repository: REPOSITORY, current: true, readAt: '2026-10-19T10:00:00Z', methodCount: 1,
    changes: staged || noChanges ? [] : [{
      key: METHOD, label: '查询库存批次', kind: 'changed',
      source: 'server/internal/service/jsonrpc_inventory.go',
      fields: [{ path: 'response.result.data.total.type', kind: 'changed', before: 'integer', after: 'string' }],
      consumers: [{ key: METHOD, path: 'web/src/erp/api/inventoryApi.mjs', line: 43 }],
    }],
    checks: [
      { key: 'catalog', status: 'passed', message: '后端与正式方法表一致' },
      { key: 'generated', status: staged ? 'missing' : synchronized ? 'passed' : 'failed',
        message: staged ? '暂存范围没有接口相关改动' : synchronized ? '检查通过' : '接口字段合同未同步' },
      { key: 'staging', status: 'missing', message: '暂存范围没有接口改动' },
    ],
    files: [{ path: 'server/docs/api.md', worktreeChanged: true, staged: false }],
    execution: {
      status: 'passed', current: executed && !staged, registered: [METHOD],
      methods: [{ key: METHOD, test: `TestRPCDocumentedExamples/${METHOD}`, status: 'passed', cases: [{ name: 'documented', status: 'passed' }] }],
      receipt: 'output/dev-workbench/contracts/examples.json', finishedAt: '2026-10-19T10:00:00Z',
    },
  }
}
function operation(status) {
  return {
    kind: 'plush.dev-qa-testing-operation-public', id: OPERATION_ID,
    action: 'rpc-examples', status, outcome: status === 'completed' ? 'passed' : null,
    repository: REPOSITORY, revision: status === 'completed' ? 2 : 1,
    createdAt: '2026-10-19T10:00:00Z', updatedAt: '2026-10-19T10:00:01Z',
    stage: status === 'completed' ? 'finished' : 'running',
    finishedAt: status === 'completed' ? '2026-10-19T10:00:01Z' : null,
    exitCode: status === 'completed' ? 0 : null,
    message: status === 'completed' ? '已登记接口样例执行通过，回执已绑定本次源码身份' : '样例核对正在执行',
  }
}

export async function verifyRPCContractReviewWorkspace(page, { assert, assertNoHorizontalOverflow }) {
  const originalViewport = page.viewportSize()
  const pattern = `**${RPC_CONTRACT_REVIEW_API}?*`
  const testingPattern = '**/__dev/api/qa/testing'
  let failRead = false
  const state = { synchronized: false, executed: false, noChanges: false }
  let lastOperation = null
  let starts = 0
  const reportRoute = (route) => failRead
    ? route.fulfill({ status: 500, json: { message: 'fixture read unavailable' } })
    : route.fulfill({ json: review(new URL(route.request().url()).searchParams.get('range'), state) })
  const testingRoute = (route) => route.fulfill({ json: {
    kind: 'plush.dev-qa-testing-summary', busy: { active: false, kind: '', profile: '' },
    operations: Object.fromEntries([...DEV_TESTING_FIXED_ACTIONS, ...DEV_PRESSURE_ACTIONS].map(
      (action) => [action.key, action.key === 'rpc-examples' ? lastOperation : null]
    )),
    hooks: {
      expectedHooksPath: '.githooks', configuredHooksPath: '.githooks', status: 'ready',
      checks: DEV_TESTING_GIT_HOOK_CHECKS.map(({ key }) => ({ key, status: 'ready' })),
    },
  } })
  const sessionPattern = '**/__dev/api/qa/testing/session'
  const actionPattern = '**/__dev/api/qa/testing/actions'
  const operationPattern = `**/__dev/api/qa/testing/operations/${OPERATION_ID}`
  const sessionRoute = (route) => route.fulfill({ json: {
    kind: 'plush.dev-qa-testing-session', apiPath: '/__dev/api/qa/testing', csrfToken: 'c'.repeat(48),
  } })
  const actionRoute = (route) => {
    starts += 1
    const body = route.request().postDataJSON()
    assert.equal(body.action, 'rpc-examples')
    assert.deepEqual(Object.keys(body.payload), ['idempotencyKey'])
    assert.match(body.payload.idempotencyKey, /^testing:rpc-examples:/u)
    assert.equal(route.request().headers()['x-csrf-token'], 'c'.repeat(48))
    lastOperation = operation('running')
    return route.fulfill({ json: { kind: 'plush.dev-qa-testing-action-result', action: 'rpc-examples', reused: false, operation: lastOperation } })
  }
  const operationRoute = (route) => {
    state.executed = true
    state.synchronized = true
    lastOperation = operation('completed')
    return route.fulfill({ json: { kind: 'plush.dev-qa-testing-operation-result', operation: lastOperation } })
  }
  const routes = [[pattern, reportRoute], [testingPattern, testingRoute], [sessionPattern, sessionRoute], [actionPattern, actionRoute], [operationPattern, operationRoute]]
  for (const [url, handler] of routes) await page.route(url, handler)
  try {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto(new URL(`/__dev/integration?view=changes&change=${METHOD}`, page.url()).href)
    const workspace = page.locator('.erp-dev-rpc-review')
    const examples = workspace.getByRole('region', { name: '样例执行核对', exact: true })
    const run = examples.getByRole('button', { name: '运行样例核对', exact: true })
    await workspace.getByText('1 项合同检查需要修正', { exact: true }).waitFor()
    await workspace.getByRole('cell', { name: 'string', exact: true }).waitFor()
    await examples.getByText('本轮未验证', { exact: true }).waitFor()
    assert.equal(await workspace.getByRole('region', { name: '样例执行核对', exact: true }).count(), 1)
    assert.equal(await workspace.locator('.erp-dev-rpc-review__checks > section').count(), 3)
    assert.equal(await workspace.getByText('实际执行结果', { exact: true }).count(), 0)
    const history = examples.locator('.erp-dev-rpc-review__evidence')
    assert.equal(await history.getByText('历史通过', { exact: true }).isVisible(), false)
    await history.locator('summary').click()
    await history.getByText('历史通过', { exact: true }).waitFor()
    await history.locator('summary').click()
    await assertNoHorizontalOverflow(page, '合并后的接口检查、样例执行与合同差异')

    await run.click()
    await examples.getByText('运行中', { exact: true }).waitFor()
    await examples.getByText('本次回执覆盖当前比较对象，结果仅适用于已登记的样例。', { exact: false }).waitFor()
    assert.equal(starts, 1, '样例执行使用原固定动作且只启动一次')
    assert.equal(await examples.locator('.erp-dev-rpc-review__section-head').getByText('通过', { exact: true }).count(), 1)
    assert.equal(await workspace.getByText('已登记接口样例执行通过，回执已绑定本次源码身份', { exact: false }).count(), 0,
      '旧执行消息不能覆盖当前回执结论')
    assert.equal(new URL(page.url()).pathname, '/__dev/integration', '直接在接口页执行，不跨页')

    await workspace.locator('.erp-dev-rpc-review__toolbar .ant-select-selector').click()
    await page.getByText('HEAD → 暂存快照', { exact: true }).last().click()
    await workspace.getByText('暂无暂存的接口改动', { exact: true }).waitFor()
    await workspace.getByText('暂无相关暂存', { exact: true }).waitFor()
    await examples.getByText('本轮未验证', { exact: true }).waitFor()
    assert.equal(await run.isDisabled(), true)
    assert.equal(starts, 1, '暂存视图不能执行工作区样例')
    await page.reload()
    await workspace.getByText('暂无暂存的接口改动', { exact: true }).waitFor()
    assert.equal(new URL(page.url()).searchParams.get('contractRange'), 'staged')

    await workspace.locator('.erp-dev-rpc-review__toolbar .ant-select-selector').click()
    await page.getByText('HEAD → 工作区', { exact: true }).last().click()
    await workspace.getByText('1 个接口有变化', { exact: true }).waitFor()
    failRead = true
    await workspace.getByRole('button', { name: '重新读取', exact: true }).click()
    await workspace.getByText('接口合同检查读取失败', { exact: true }).waitFor()
    failRead = false
    state.noChanges = true
    await workspace.getByRole('button', { name: '重试', exact: true }).click()
    await workspace.getByText('本轮无接口合同变化', { exact: true }).waitFor()
    await run.waitFor()
    assert.equal(await run.isEnabled(), true, '无接口变化也保留整体检查与执行入口')
    assert.equal(await workspace.locator('.erp-dev-rpc-review__checks > section').count(), 3)
    await workspace.locator('.erp-dev-rpc-review__files > summary').click()
    await workspace.getByRole('cell', { name: 'server/docs/api.md', exact: true }).waitFor()
    await page.setViewportSize({ width: 760, height: 900 })
    await assertNoHorizontalOverflow(page, '窄窗口接口检查与暂存文件')
    await page.setViewportSize({ width: 1280, height: 900 })

    await page.getByRole('link', { name: '测试执行', exact: true }).click()
    await page.getByRole('heading', { name: '测试执行', exact: true }).waitFor()
    assert.equal(await page.getByRole('tab', { name: '接口合同', exact: true }).count(), 0)
    await page.getByRole('tab', { name: '本轮验证', exact: true }).click()
    const summaryRow = page.locator('[data-action-key="rpc-examples"]')
    await summaryRow.getByRole('link', { name: '查看并运行', exact: true }).click()
    await workspace.getByText('本轮无接口合同变化', { exact: true }).waitFor()
    assert.equal(new URL(page.url()).pathname, '/__dev/integration')
    assert.equal(starts, 1, '摘要跳转不启动执行')
    await assertNoHorizontalOverflow(page, '从本轮验证返回同一合同工作区')
  } finally {
    for (const [url, handler] of routes) await page.unroute(url, handler)
    if (originalViewport) await page.setViewportSize(originalViewport)
  }
}
