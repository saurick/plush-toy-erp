import { assertInactivePrintStylesDoNotHideApp } from './styleIsolationAssertions.mjs'

const DEV_FLOW_STATE_OBSERVATORY_PATH =
  '/__dev/status-flows?view=chain&chain=all'
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

function startNoWriteAudit(page, store) {
  const requests = []
  store.set(page, requests)
  page.on('request', (request) => {
    if (WRITE_METHODS.has(request.method().toUpperCase())) {
      requests.push({ method: request.method(), url: request.url() })
    }
  })
}

export function createDevFlowStateObservatoryScenarios({
  assert,
  assertNoHorizontalOverflow,
  expectText,
}) {
  const writeRequestsByPage = new WeakMap()

  return [
    {
      name: 'dev-flow-state-observatory-desktop-light',
      path: DEV_FLOW_STATE_OBSERVATORY_PATH,
      viewport: { width: 1440, height: 900 },
      beforeNavigate: async (page) => {
        startNoWriteAudit(page, writeRequestsByPage)
      },
      verify: async (page) => {
        await expectText(page, '业务链观察')
        const root = page.locator('[data-dev-flow-state-observatory]')
        await root.waitFor({ state: 'visible', timeout: 10_000 })
        assert.equal(
          await page.locator('.erp-dev-environment-evidence').count(),
          0,
          '业务链观察子页不应重复常驻环境事实'
        )
        assert.equal(
          await root.count(),
          1,
          '业务链观察页应提供唯一桌面内容根节点'
        )
        await assertNoHorizontalOverflow(
          page,
          'dev-flow-state-observatory-desktop-light'
        )
        await assertInactivePrintStylesDoNotHideApp(page)
        await page.goto(new URL('/__dev/status-flows?view=states&flow=source.sales_order', page.url()).href)
        const filters = page.getByRole('group', { name: '状态转换筛选' })
        const graph = page.locator('.erp-dev-flow-state-graph')
        await graph.locator('[data-mermaid-status="rendered"]').waitFor()
        assert.equal(await filters.getByRole('button', { name: /^正常推进 /u }).getAttribute('aria-pressed'), 'true')
        assert(!(await graph.locator('.erp-markdown-mermaid__canvas > svg').textContent()).includes('取消'))
        await filters.getByRole('button', { name: /^全部 /u }).click()
        await graph.locator('[data-mermaid-status="rendered"]').waitFor()
        assert((await graph.locator('.erp-markdown-mermaid__canvas > svg').textContent()).includes('取消'))
        await filters.getByRole('button', { name: /^异常与纠正 /u }).click()
        await graph.locator('[data-mermaid-status="rendered"]').waitFor()
        assert((await graph.locator('.erp-markdown-mermaid__canvas > svg').textContent()).includes('取消'))
        await page.getByRole('button', { name: /^草稿，/u }).click()
        await filters.getByRole('button', { name: /^当前状态 /u, pressed: true }).waitFor()
        await graph.locator('[data-mermaid-status="rendered"]').waitFor()
        assert.equal(await filters.getByRole('button', { name: /^当前状态 /u }).getAttribute('aria-pressed'), 'true')
        await filters.getByRole('button', { name: /^正常推进 /u }).click()
        await graph.locator('[data-mermaid-status="rendered"]').waitFor()
        await assertNoHorizontalOverflow(page, 'focused-state-rules')

        assert.deepEqual(
          writeRequestsByPage.get(page) || [],
          [],
          '业务链观察桌面 smoke 不得发出写请求'
        )
      },
    },
  ]
}
