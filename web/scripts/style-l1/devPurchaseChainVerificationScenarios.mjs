import { expect } from 'playwright/test'

export function createDevPurchaseChainVerificationScenarios({
  assert,
  assertNoHorizontalOverflow,
  outputDir,
  path,
}) {
  const writes = new WeakMap()
  return [
    {
      name: 'dev-purchase-chain-verification',
      path: '/__dev/flow-explorer?chain=purchase_to_inventory',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      beforeNavigate: async (page) => {
        writes.set(page, [])
        page.on('request', (request) => {
          if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method()))
            writes.get(page).push(request.url())
        })
        await page.route('**/__dev/api/qa/coverage', (route) =>
          route.fulfill({ json: { status: 'missing' } })
        )
      },
      verify: async (page) => {
        const editor = page.getByRole('region', { name: '流程探索', exact: true })
        await expect(editor.getByRole('button', { name: '流程范围：采购下单到入库应付', exact: true })).toBeVisible()
        const drawer = page.getByRole('dialog', { name: '规则与验证', exact: true })
        const detail = drawer.getByRole('region', { name: '交接规则与验证' })
        const showAction = async (nodeLabel, stepKey) => {
          await editor.locator(`[data-design-node="step:${stepKey}"]`).click()
          const opener = editor.getByRole('button', { name: `查看${nodeLabel}的规则与验证`, exact: true })
          await opener.click()
          await expect(detail).toHaveAttribute('data-chain-step-verification', stepKey)
          assert.equal(new URL(page.url()).searchParams.get('step'), stepKey)
          return opener
        }
        const quality = 'purchase_quality:posts_fact:purchase_accepted'
        await showAction('IQC 确认本行检验通过', quality)
        await expect(drawer.getByRole('combobox', { name: '本链动作' })).toBeVisible()
        await expect(detail).toHaveAttribute('aria-busy', 'false')
        await expect(detail.getByRole('table', { name: '当前动作的分层验证证据' })).toBeVisible()
        await detail.getByRole('tab', { name: '办理规则', exact: true }).click()
        await expect(detail).toContainText('品质')
        await expect(detail).toContainText('检验')
        await page.reload()
        await expect(detail.getByRole('tab', { name: '办理规则', exact: true, selected: true })).toBeVisible()
        assert.equal(new URL(page.url()).searchParams.get('step'), quality)
        await detail.getByRole('tab', { name: '验证证据', exact: true }).click()
        await detail.getByText('具名检查项与执行结果', { exact: true }).click()
        await expect(detail.locator('[data-step-rule="purchase-quality-handoff"]')).toBeVisible()
        await assertNoHorizontalOverflow(page)
        await page.screenshot({
          path: path.join(outputDir, 'dev-purchase-chain-quality-detail-4k.png'),
          fullPage: false,
        })
        await drawer.getByRole('button', { name: '关闭', exact: true }).click()
        await expect(drawer).toBeHidden()

        const inbound = 'purchase_accepted:posts_fact:purchase_lot'
        const inboundOpener = await showAction('仓库确认本次合格行入库', inbound)
        await detail.getByRole('tab', { name: '办理规则', exact: true }).click()
        await expect(detail).toContainText('待检与不合格行保留后续处理')
        await drawer.getByRole('button', { name: '关闭', exact: true }).click()
        await expect(drawer).toBeHidden()
        await expect(inboundOpener).toBeFocused()
        await editor.getByRole('button', { name: '关闭画布说明', exact: true }).click()
        await showAction('财务确认并过账应付', 'purchase_payable_draft:posts_fact:purchase_payable')
        await detail.getByRole('tab', { name: '办理规则', exact: true }).click()
        await expect(detail).toContainText('采购应付来源、计价与过账')
        await detail.getByRole('tab', { name: '验证证据', exact: true }).click()
        const reportLink = detail.getByRole('link', { name: '查看所选动作的链路实测报告', exact: true })
        const reportURL = new URL(await reportLink.getAttribute('href'), page.url())
        assert.equal(reportURL.searchParams.get('chain'), 'purchase_to_inventory')
        assert.equal(reportURL.searchParams.get('step'), 'purchase_payable_draft:posts_fact:purchase_payable')
        await reportLink.click()
        await expect(page).toHaveURL((url) => url.pathname === '/__dev/business-chain-audit' && url.searchParams.get('step') === reportURL.searchParams.get('step'))
        await page.getByRole('button', { name: '返回 财务确认并过账应付', exact: true }).click()
        await expect(detail).toHaveAttribute('data-chain-step-verification', reportURL.searchParams.get('step'))
        const originalViewport = page.viewportSize()
        for (const width of [1280, 1024]) {
          await page.setViewportSize({ width, height: 900 })
          await assertNoHorizontalOverflow(page)
          await expect.poll(async () => {
            const bounds = await drawer.boundingBox()
            return Boolean(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width + 1)
          }).toBe(true)
        }
        await page.setViewportSize(originalViewport)
        assert.deepEqual(writes.get(page), [], '查看流程和核验报告保持只读')
      },
    },
  ]
}
