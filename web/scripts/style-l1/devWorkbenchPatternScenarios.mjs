export function createDevWorkbenchPatternScenarios({ assert, assertNoHorizontalOverflow }) {
  return [{
    name: 'dev-workbench-patterns-desktop-light',
    path: '/__dev/ui-design?page=workbench',
    viewport: { width: 1280, height: 720 },
    verify: async (page) => {
      const writes = []
      page.on('request', (request) => {
        if (!['GET', 'HEAD'].includes(request.method()) && new URL(request.url()).pathname.startsWith('/__dev/api/')) writes.push(request.url())
      })
      const samples = page.getByRole('region', { name: '效能工作台统一设计', exact: true })
      const setState = async (label) => {
        await samples.locator('.ant-select').filter({ has: page.getByRole('combobox', { name: '样板状态', exact: true }) }).click()
        await page.locator('.ant-select-dropdown:visible').getByText(label, { exact: true }).click()
      }
      const selectPattern = async (name) => {
        await samples.getByRole('tab', { name, exact: true }).click()
        await samples.getByRole('region', { name: `${name}样板`, exact: true }).waitFor()
      }
      await samples.waitFor()
      const tabs = await samples.locator('.ant-tabs-nav').elementHandle()
      for (const width of [1024, 1280, 1920]) {
        await page.setViewportSize({ width, height: 900 })
        const bounds = await samples.evaluate((node) => {
          const toolbar = document.querySelector('.erp-dev-ui-design-workbench-toolbar').getBoundingClientRect()
          const box = node.getBoundingClientRect()
          return { gap: box.top - toolbar.bottom, top: box.top, fonts: [...node.querySelectorAll('td, dt, dd, p, h2, h3')].filter((e) => e.getBoundingClientRect().height).map((e) => parseFloat(getComputedStyle(e).fontSize)) }
        })
        assert(bounds.gap >= 0 && bounds.gap <= 16, JSON.stringify(bounds))
        assert(bounds.top < 200, '样板直接接在工具栏下，不能被空白推离首屏')
        assert(bounds.fonts.every((font) => font >= 14), '密度不能通过缩小正文获得')
        await assertNoHorizontalOverflow(page)
      }
      await page.setViewportSize({ width: 1280, height: 720 })
      const directory = samples.getByRole('region', { name: '目录与检索样板', exact: true })
      await directory.locator('.ant-table-row-expand-icon').first().click()
      await directory.getByText('默认、操作、恢复与边界场景；对应版本和浏览器实测记录。', { exact: true }).waitFor()
      await directory.getByRole('textbox', { name: '搜索样板门禁', exact: true }).fill('不存在的检查')
      await directory.getByRole('button', { name: '搜索', exact: true }).click()
      await directory.getByText('没有匹配结果', { exact: true }).waitFor()
      await directory.getByRole('button', { name: '清除搜索', exact: true }).click()
      await directory.locator('.ant-table-row').first().waitFor()
      assert.equal(await directory.locator('.ant-table-row').count(), 3)
      await setState('读取失败')
      await samples.getByRole('alert').getByText('读取失败，当前结果尚未核实', { exact: true }).waitFor()
      await samples.getByRole('button', { name: '重新读取', exact: true }).click()
      await directory.locator('.ant-table-row').first().waitFor()
      assert.equal(await directory.locator('.ant-table-row').count(), 3)

      await selectPattern('执行与诊断')
      assert(await tabs.evaluate((node) => node.isConnected), '切换页面类型不能重建页签条')
      const execution = samples.getByRole('region', { name: '执行与诊断样板', exact: true })
      await execution.getByRole('button', { name: '运行演示诊断', exact: true }).click()
      await execution.getByText('正在检查页面与浏览器', { exact: true }).waitFor()
      assert.equal(await execution.getByRole('button', { name: '运行演示诊断', exact: true }).isEnabled(), false)
      assert.equal(await execution.getByRole('combobox', { name: '样板诊断范围', exact: true }).isEnabled(), false)
      await execution.getByRole('button', { name: '模拟本阶段完成', exact: true }).click()
      await execution.getByText('第一失败：浏览器检查未通过', { exact: true }).waitFor()
      await execution.getByRole('button', { name: '模拟修正问题', exact: true }).click()
      assert.equal(await execution.getByText('本次演示诊断通过', { exact: true }).count(), 0)
      await execution.getByRole('button', { name: '运行演示诊断', exact: true }).click()
      await execution.getByRole('button', { name: '模拟本阶段完成', exact: true }).click()
      await execution.getByText('本次演示诊断通过', { exact: true }).waitFor()
      await execution.getByRole('button', { name: '运行演示诊断', exact: true }).click()
      await execution.getByRole('button', { name: '取消运行', exact: true }).click()
      await execution.getByText('运行已取消', { exact: true }).waitFor()

      await selectPattern('结果与核验')
      const evidence = samples.getByRole('region', { name: '结果与核验样板', exact: true })
      assert.equal(await evidence.getByText('通过', { exact: true }).count(), 1)
      await evidence.getByText('未核实', { exact: true }).waitFor()
      await evidence.getByText('未采集', { exact: true }).waitFor()
      await setState('历史 / 待核实')
      await evidence.getByText('这是上次记录，不能证明当前状态', { exact: true }).waitFor()
      assert.equal(await evidence.getByText('通过', { exact: true }).count(), 0)
      await evidence.getByRole('button', { name: '重新核对', exact: true }).first().click()
      await evidence.getByText('通过', { exact: true }).waitFor()
      await evidence.getByRole('button', { name: '查看证据说明', exact: true }).click()
      await evidence.getByRole('heading', { name: '证据说明', exact: true }).waitFor()

      await selectPattern('阅读与关系')
      const reading = samples.getByRole('region', { name: '阅读与关系样板', exact: true })
      await reading.getByRole('button', { name: '关联阅读：目标环境读回', exact: true }).click()
      await reading.getByRole('heading', { name: '目标环境读回', exact: true }).waitFor()
      await reading.getByRole('button', { name: '关联阅读：CI 证明什么', exact: true }).click()
      await reading.getByRole('heading', { name: 'CI 证明什么', exact: true }).waitFor()
      await setState('无数据')
      await reading.getByText('此主题暂无资料', { exact: true }).waitFor()
      await page.reload()
      await samples.getByRole('tab', { name: '阅读与关系', exact: true }).waitFor()
      assert.equal(await samples.getByRole('tab', { name: '阅读与关系', exact: true }).getAttribute('aria-selected'), 'true')
      await reading.getByRole('button', { name: '返回已有主题', exact: true }).click()
      await setState('首次读取')
      await samples.getByText('正在读取当前范围', { exact: true }).waitFor()
      await page.getByRole('button', { name: '重置演示', exact: true }).click()
      await reading.getByRole('heading', { name: 'CI 证明什么', exact: true }).waitFor()

      const switcher = await page.locator('.erp-dev-ui-design-workbench-toolbar').elementHandle()
      await page.getByText('整体交互预览', { exact: true }).click()
      await page.frameLocator('iframe[title="ERP 最新可交互设计"]').getByRole('navigation', { name: '效能工作台主导航', exact: true }).waitFor()
      assert(await switcher.evaluate((node) => node.isConnected), '样板与整体预览切换保留切换栏')
      await page.getByText('统一页面样板', { exact: true }).click()
      await samples.waitFor()
      await samples.getByText('阅读统一设计约定', { exact: true }).count()
      assert.equal(writes.length, 0, '设计样板不能调用运行、采集、发布或业务写接口')
      await assertNoHorizontalOverflow(page)
    },
  }]
}
