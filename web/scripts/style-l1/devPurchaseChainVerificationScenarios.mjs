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
      path: '/__dev/business-topics?flow_topic=purchase_to_inventory',
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
        const topic = page.locator(
          '[data-topic-diagram="purchase_to_inventory"]'
        )
        await expect(topic.locator('[data-business-flow]')).toHaveAttribute(
          'data-graph-status',
          'rendered'
        )
        await topic.locator('[data-graph-node="purchase_quality"]').click()
        const opener = topic.getByRole('button', {
          name: '查看IQC 确认本行检验通过的规则与验证',
          exact: true,
        })
        await opener.click()
        const detail = page.getByRole('region', { name: '交接规则与验证' })
        const actions = page.getByRole('navigation', { name: '本链关联动作' })
        await expect(detail).toBeVisible()
        await expect(actions).toBeVisible()
        await expect(detail).toHaveAttribute('aria-busy', 'false')
        await expect(detail.getByRole('table', { name: '当前动作的分层验证证据' })).toBeVisible()
        assert.equal(new URL(page.url()).searchParams.get('flow_topic_step'), 'purchase_quality:posts_fact:purchase_accepted')
        await detail.getByRole('tab', { name: '办理规则', exact: true }).click()
        await expect(detail).toContainText('品质')
        await expect(detail).toContainText('检验')
        await detail.getByRole('tab', { name: '验证证据', exact: true }).click()
        await detail.getByText('具名检查项与执行结果', { exact: true }).click()
        await expect(detail.locator('[data-step-rule="purchase-quality-handoff"]')).toBeVisible()
        await assertNoHorizontalOverflow(page)
        await detail.scrollIntoViewIfNeeded()
        await page.screenshot({
          path: path.join(outputDir, 'dev-purchase-chain-quality-detail-4k.png'),
          fullPage: false,
        })
        await page.reload()
        await expect(detail).toBeVisible()
        await detail.getByRole('button', { name: '返回关系图', exact: true }).click()
        await expect(detail).toHaveCount(0)
        await topic.locator('[data-graph-node="purchase_accepted"]').click()
        await topic.getByRole('button', {
          name: '查看仓库确认本次合格行入库的规则与验证',
          exact: true,
        }).click()
        await detail.getByRole('tab', { name: '办理规则', exact: true }).click()
        await expect(detail).toContainText('待检与不合格行保留后续处理')
        await detail.getByRole('tab', { name: '验证证据', exact: true }).click()
        const reportLink = detail.getByRole('link', { name: '查看所选动作的链路实测报告', exact: true })
        await expect(reportLink).toHaveAttribute('href', /chain=purchase_to_inventory&step=/u)
        await page.setViewportSize({ width: 1280, height: 900 })
        await assertNoHorizontalOverflow(page)
        await detail.getByRole('button', { name: '返回关系图', exact: true }).click()
        await topic
          .locator('[data-graph-node="purchase_payable_draft"]')
          .click()
        await expect(detail).toHaveCount(0)
        await topic
          .getByRole('button', {
            name: '查看财务确认并过账应付的规则与验证',
            exact: true,
          })
          .click()
        await detail.getByRole('tab', { name: '办理规则', exact: true }).click()
        await expect(detail).toContainText('采购应付来源、计价与过账')
        await page.setViewportSize({ width: 1024, height: 900 })
        await assertNoHorizontalOverflow(page)
        assert.deepEqual(
          writes.get(page),
          [],
          '图示、规则与证据页面不得执行业务写入'
        )
      },
    },
  ]
}
