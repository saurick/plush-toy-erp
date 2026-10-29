import { openTestingDetails, closeTestingDetails } from './devTestingDetailsActions.mjs'

export function createDevTestingGuideScenarios({ assert, assertNoHorizontalOverflow }) {
  const writes = new WeakMap()
  return [{
    name: 'dev-testing-guide-minimal-desktop-light',
    path: '/__dev/testing?view=guide&customer=yoyoosun',
    viewport: { width: 1280, height: 720 },
    beforeNavigate: async (page) => {
      writes.set(page, [])
      await page.addInitScript(() => {
        window.testingCopiedCommands = []
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (value) => { window.testingCopiedCommands.push(value) } } })
      })
      await page.route('**/__dev/api/**', (route) => {
        if (route.request().method() === 'GET') return route.fallback()
        writes.get(page).push(route.request().url())
        return route.fulfill({ status: 409, json: {} })
      })
    },
    verify: async (page) => {
      const directory = page.getByRole('navigation', { name: '测试指引目录', exact: true })
      await directory.waitFor()
      assert.deepEqual(await directory.getByRole('button').allTextContents(), ['测试方式', '真机回归', '增长验证', '验证范围', '常用命令'])
      assert.equal(await page.getByRole('tablist', { name: '测试指引主题', exact: true }).count(), 0)
      await directory.getByRole('button', { name: '测试方式', exact: true }).click()
      const methods = page.getByRole('table', { name: '自动化测试方式', exact: true })
      await methods.waitFor()
      assert.equal(await methods.getByRole('columnheader').count(), 2)
      assert.equal(await directory.getByRole('button', { name: '测试方式' }).getAttribute('aria-pressed'), 'true')
      const first = methods.getByRole('rowheader').first().getByRole('button')
      const label = (await first.innerText()).trim()
      let details = await openTestingDetails(page, first, label)
      await details.getByText('当前入口', { exact: true }).waitFor()
      await details.getByText('结果边界', { exact: true }).waitFor()
      assert.equal(await page.getByRole('dialog').count(), 0, '短说明不打开抽屉')
      await closeTestingDetails(page)
      await page.waitForFunction((name) => document.activeElement?.textContent.trim() === name, label)
      details = await openTestingDetails(page, first, label)
      await page.reload()
      await details.getByText('结果边界', { exact: true }).waitFor()
      assert.equal(new URL(page.url()).searchParams.get('guide'), 'methods')
      await closeTestingDetails(page)
      await directory.waitFor()
      assert.equal(await directory.getByRole('button').count(), 5, '原位查看后目录仍可直接选择')
      await directory.getByRole('button', { name: '常用命令', exact: true }).click()
      const preset = page.locator('.erp-dev-testing-presets article').first()
      await preset.getByRole('button', { name: '复制', exact: true }).click()
      const copied = await page.evaluate(() => window.testingCopiedCommands)
      assert.equal(copied.length, 1)
      assert(copied[0].trim().length > 0 && !copied[0].includes('undefined'))
      await page.getByRole('button', { name: '查专项命令', exact: true }).click()
      const command = page.locator('.erp-dev-testing-command-block').first()
      const commandDetails = await openTestingDetails(page, command.locator('summary'))
      const commandText = await commandDetails.locator('pre code').innerText()
      await closeTestingDetails(page)
      await command.getByRole('button', { name: '复制', exact: true }).click()
      assert.equal(await page.evaluate(() => window.testingCopiedCommands.at(-1)), commandText, '命令查看与复制使用同一固定文本')
      await page.getByRole('navigation', { name: '测试指引目录', exact: true }).getByRole('button', { name: '常用命令', exact: true }).click()
      await directory.waitFor()
      await page.setViewportSize({ width: 1100, height: 800 })
      await assertNoHorizontalOverflow(page, '测试指引目录与资料恢复')
      assert.deepEqual(writes.get(page), [], '查看、返回、恢复和复制不能运行检查')
    },
  }]
}
