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
        const before = await page.evaluate(() => ({ scroll: scrollY, top: document.querySelector('[data-graph-node="purchase_quality"]').getBoundingClientRect().top }))
        await opener.click()
        const detail = page.getByRole('region', { name: '交接规则与验证' })
        await expect(detail).toBeVisible()
        await expect(detail).toHaveAttribute('aria-busy', 'false')
        const after = await page.evaluate(() => ({ scroll: scrollY, top: document.querySelector('[data-graph-node="purchase_quality"]').getBoundingClientRect().top }))
        assert(Math.abs(after.scroll - before.scroll) <= 1 && Math.abs(after.top - before.top) <= 1, '展开规则不自动滚离原图或当前对象')
        assert.equal(await detail.evaluate((element) => Boolean(element.closest('[data-topic-relation]'))), true, '规则在所属交接中查看')
        await expect(detail).toContainText('库存由仓库另行入账')
        await expect(detail).toContainText('未采集')
        assert(
          new URL(page.url()).searchParams.get('flow_topic_step') ===
            'purchase_quality:posts_fact:purchase_accepted'
        )
        await detail
          .locator('[data-step-rule="purchase-quality-handoff"] summary')
          .click()
        await expect(
          detail.getByRole('table', { name: '逐行检验与待入库交接的验证结果' })
        ).toBeVisible()
        await assertNoHorizontalOverflow(page)
        await detail.scrollIntoViewIfNeeded()
        await page.screenshot({
          path: path.join(outputDir, 'dev-purchase-chain-quality-detail-4k.png'),
          fullPage: false,
        })
        await page.reload()
        await expect(detail).toBeVisible()
        await topic.getByRole('button', { name: '收起IQC 确认本行检验通过的规则与验证', exact: true }).click()
        await expect(detail).toHaveCount(0)
        await topic.locator('[data-graph-node="purchase_accepted"]').click()
        await topic
          .getByRole('button', {
            name: '查看仓库确认本次合格行入库的规则与验证',
            exact: true,
          })
          .click()
        await expect(detail).toContainText('待检与不合格行保留后续处理')
        assert.equal(await detail.getByRole('link').count(), 0, '规则与证据在原位查看，不恢复已经移除的通用报告跳转')
        await page.setViewportSize({ width: 1280, height: 900 })
        await assertNoHorizontalOverflow(page)
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
