export function createDevRoleFlowScenarios({ assert, outputDir, path }) {
  return [false, true].map((mobile) => ({
    name: `dev-order-role-flow-${mobile ? 'mobile' : 'desktop'}`,
    path: '/__dev/status-flows?view=chain&chain=all',
    viewport: mobile ? { width: 390, height: 844 } : { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
    verify: async (page) => {
      const guide = page.locator('#task-fulfillment-guide')
      await guide.getByRole('heading', { name: '订单全流程', exact: true }).waitFor()
      const nodes = guide.locator('.erp-dev-fulfillment-guide__steps > li')
      const count = await nodes.count()
      assert(count >= 14, '完整业务骨架必须可见')
      assert.equal(await page.locator('[data-business-chain-topics]').evaluate((node) => node.open), false)
      const chooseRole = async (name) => {
        await guide.locator('.erp-dev-fulfillment-guide__role .ant-select-selector').click()
        await page.locator('.ant-select-dropdown:visible').getByText(name, { exact: true }).click()
        await page.locator('.ant-select-dropdown:visible').waitFor({ state: 'hidden' })
      }
      await chooseRole('仓库')
      await page.waitForURL(/flow_role=warehouse/u)
      assert.equal(await nodes.count(), count, '选择岗位仍保留完整业务骨架')
      await guide.locator('li[data-role-match="true"]').filter({ hasText: '正式成品入库' }).waitFor()
      await guide.locator('li[data-role-match="false"]').filter({ hasText: '皮套检验' }).waitFor()
      await page.reload()
      await guide.getByRole('combobox', { name: '关注岗位' }).waitFor()
      assert.match(await guide.locator('.erp-dev-fulfillment-guide__role').innerText(), /仓库/u)
      await chooseRole('财务')
      const result = guide.locator('.erp-dev-fulfillment-guide__result')
      await result.getByText('工程用料两级审核', { exact: true }).waitFor()
      assert.match(await result.innerText(), /重新经过老板和财务审核/u)
      assert.equal(await result.locator('a[href$="stage_key=engineering"]').count(), 1)
      await guide.getByRole('button', { name: /放行与实际发货/u }).click()
      await result.getByText('出货财务放行', { exact: true }).waitFor()
      assert.match(await result.innerText(), /不算已经发货/u)
      await guide.locator('.ant-segmented-item').filter({ hasText: /^异常处理$/u }).click()
      await guide.getByText('质量异常方案审批', { exact: true }).waitFor()
      await guide.locator('.ant-segmented-item').filter({ hasText: /^报废放弃$/u }).click()
      assert.match(await guide.innerText(), /实际执行报废/u)
      assert.match(await guide.innerText(), /待复检与已闭环分别记录/u)
      await guide.locator('.ant-segmented-item').filter({ hasText: /^完整流程$/u }).click()
      const metrics = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }))
      assert(metrics.scroll <= metrics.width + 1, `岗位流程页面横向溢出: ${JSON.stringify(metrics)}`)
      await page.screenshot({ path: path.join(outputDir, `order-role-flow-${mobile ? 'mobile' : 'desktop'}-4k.png`), fullPage: mobile, scale: 'device' })
    },
  }))
}
