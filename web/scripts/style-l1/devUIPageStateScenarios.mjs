import { UI_DESIGN_MOBILE_STATES } from '../../src/dev-workbench/config/devUIDesign.mjs'
import { chooseUIDesignState as simulate } from './devUIDesignNavigation.mjs'

const frameSelector = 'iframe[title="ERP 最新可交互设计"]'

async function choosePageState(page, label) {
  await page.locator('.erp-page-state-examples .ant-select-selector').click()
  await page.locator('.ant-select-dropdown:visible').getByText(label, { exact: true }).click()
}

function watchBusinessRequests(page) {
  const requests = []
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/rpc/')) requests.push(request.url())
  })
  return requests
}

export function createDevUIPageStateScenarios({ assert, assertNoHorizontalOverflow, outputDir, path }) {
  const screenshot = async (page, name) => {
    await assertNoHorizontalOverflow(page)
    await page.screenshot({ path: path.join(outputDir, `${name}-4k.png`), animations: 'disabled' })
  }
  const shared = { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 }
  return [
    {
      ...shared,
      name: 'dev-ui-design-state-select',
      path: '/__dev/ui-design',
      verify: async (page) => {
        const requests = watchBusinessRequests(page)
        const frame = page.frameLocator(frameSelector)
        const select = page.locator('.erp-dev-ui-design-state-select')
        const input = select.getByRole('combobox', { name: '状态模拟', exact: true })
        await input.waitFor()
        await frame.getByRole('button', { name: '销售管理', exact: true }).click()
        assert.equal(await select.locator('.ant-select-selection-placeholder').innerText(), '状态模拟')
        await simulate(page, '读取失败')
        await frame.getByRole('button', { name: '重新读取', exact: true }).waitFor()
        assert.equal(await select.locator('.app-select__label').innerText(), '状态模拟')
        assert.equal(await select.locator('.ant-select-selection-item').innerText(), '读取失败')
        await select.locator('.ant-select-selector').click()
        const popup = page.locator('.ant-select-dropdown:visible')
        await popup.locator('.ant-select-item-option-content').first().waitFor()
        assert.equal(await popup.locator('.ant-select-item-option-selected').innerText(), '读取失败')
        await input.press('Escape')
        await popup.waitFor({ state: 'hidden' })
        await frame.getByRole('button', { name: '重新读取', exact: true }).click()
        await select.locator('.ant-select-selection-item').filter({ hasText: '正常' }).waitFor()
        await simulate(page, '空结果')
        await frame.getByText('当前筛选没有记录', { exact: true }).waitFor()
        await select.locator('.ant-select-clear').click()
        await frame.locator('.data-surface').waitFor()
        assert.equal(await select.locator('.ant-select-selection-placeholder').innerText(), '状态模拟')
        assert.equal(await select.locator('.ant-select-clear').count(), 0)
        await simulate(page, '无权限')
        await frame.getByText('当前账号无权查看此页面', { exact: true }).waitFor()
        await page.getByRole('tab', { name: '设计说明', exact: true }).click()
        await page.getByRole('tab', { name: '可交互设计', exact: true }).click()
        assert.equal(await select.locator('.ant-select-selection-item').innerText(), '无权限')
        await page.getByRole('button', { name: /全屏预览/ }).click()
        await simulate(page, '正常')
        await select.locator('.ant-select-selector').click()
        await page.locator('.ant-select-dropdown:visible .ant-select-item-option-content').first().waitFor()
        await input.press('Escape')
        await page.getByRole('dialog', { name: '交互设计全屏预览', exact: true }).waitFor()
        await page.getByRole('button', { name: /退出全屏/ }).click()
        await page.getByRole('button', { name: /重置演示/ }).click()
        await frame.getByRole('heading', { name: '工作台', exact: true }).waitFor()
        assert.equal(await select.locator('.ant-select-selection-placeholder').innerText(), '状态模拟')
        for (const width of [1440, 1280]) {
          await page.setViewportSize({ width, height: 900 })
          await simulate(page, '读取失败')
          assert(await select.locator('.ant-select-selection-item').evaluate((node) => node.scrollWidth <= node.clientWidth + 1), '状态名称不被用途和清空入口截断')
          await assertNoHorizontalOverflow(page)
          await select.locator('.ant-select-clear').click()
        }
        await page.setViewportSize({ width: 1920, height: 1080 })
        await screenshot(page, 'ui-design-state-select')
        assert.deepEqual(requests, [])
      },
    },
    {
      ...shared,
      name: 'dev-ui-page-states-controls',
      path: '/__dev/ui-design?page=controls&control=empty',
      verify: async (page) => {
        const requests = watchBusinessRequests(page)
        const phone = page.getByRole('region', { name: '手机页面状态样例', exact: true })
        const stateSelect = page.locator('.erp-page-state-examples .ant-select')
        await stateSelect.locator('.ant-select-clear').click()
        assert.equal(await stateSelect.locator('.ant-select-selection-placeholder').textContent(), '页面状态')
        assert.equal(await phone.count(), 0, '清空页面状态后收起所选样例')
        await page.getByText('请选择页面状态', { exact: true }).waitFor()
        await choosePageState(page, '首次加载')
        const skeleton = phone.getByTestId('mobile-role-task-skeleton')
        await skeleton.waitFor()
        await page.evaluate(() => document.fonts.ready)
        const toolbar = phone.locator('.erp-page-state-phone__toolbar')
        const tabs = await phone.getByRole('tablist').elementHandle()
        const initialBox = await toolbar.boundingBox()
        assert.equal(await skeleton.locator('.mobile-role-skeleton__row').count(), 4)
        assert.equal(await skeleton.locator('button,a,input,[tabindex]').count(), 0)
        assert.equal(await skeleton.evaluate((node) => node.getAnimations({ subtree: true }).length), 4)
        await screenshot(page, 'controls-mobile-loading')
        await page.getByRole('button', { name: '完成读取', exact: true }).click()
        const cards = phone.locator('.erp-mobile-list-item')
        await cards.first().waitFor()
        assert.equal(await cards.count(), 4)
        assert.deepEqual(await toolbar.boundingBox(), initialBox)
        assert.equal(await tabs.evaluate((node) => node.isConnected), true)
        await cards.first().getByRole('button').click()
        const selected = await cards.first().elementHandle()
        const scroll = phone.locator('.erp-page-state-phone__scroll')
        await scroll.evaluate((node) => { node.scrollTop = 80 })
        const scrollTop = await scroll.evaluate((node) => node.scrollTop)
        await choosePageState(page, '刷新已有内容')
        assert(await stateSelect.locator('.ant-select-selection-item').evaluate((node) => node.scrollWidth <= node.clientWidth + 1), '页面状态的长选项不被用途前缀截断')
        assert.equal(await phone.getByTestId('mobile-role-task-list').getAttribute('aria-busy'), 'true')
        assert.equal(await selected.evaluate((node) => node.isConnected), true)
        assert.equal(await scroll.evaluate((node) => node.scrollTop), scrollTop)
        assert.equal(await skeleton.count(), 0)
        await scroll.evaluate((node) => { node.scrollTop = 0 })
        await screenshot(page, 'controls-mobile-refreshing')
        await scroll.evaluate((node) => { node.scrollTop = 80 })
        await choosePageState(page, '刷新失败')
        const refreshError = phone.getByRole('alert').filter({ hasText: '刷新失败' })
        await refreshError.waitFor()
        assert((await refreshError.boundingBox()).y >= (await scroll.boundingBox()).y, '滚动后仍可看到刷新失败提示')
        assert.equal(await selected.evaluate((node) => node.isConnected), true)
        await scroll.evaluate((node) => { node.scrollTop = 0 })
        await screenshot(page, 'controls-mobile-refresh-error')
        await phone.getByRole('button', { name: '重试读取', exact: true }).click()
        assert.equal(await selected.evaluate((node) => node.isConnected), true)
        await phone.getByText('当前选择：核对样品资料', { exact: true }).waitFor()
        await scroll.evaluate((node) => { node.scrollTop = 0 })
        await screenshot(page, 'controls-mobile-data')
        await phone.getByRole('tab', { name: '已办', exact: true }).click()
        await phone.getByRole('status').filter({ hasText: '正在加载已办任务' }).waitFor()
        assert.equal(await cards.count(), 0)
        assert.equal(await tabs.evaluate((node) => node.isConnected), true)
        assert.deepEqual(await toolbar.boundingBox(), initialBox)
        await screenshot(page, 'controls-mobile-switching')
        for (const [label, text, key] of [
          ['尚无记录', '当前范围暂无记录', 'empty'],
          ['筛选无结果', '没有符合条件的记录', 'filtered'],
          ['首次读取失败', '本次读取失败，条件已保留', 'error'],
        ]) {
          await choosePageState(page, label)
          await phone.getByText(text, { exact: true }).waitFor()
          assert.equal(await cards.count(), 0)
          await screenshot(page, `controls-mobile-${key}`)
          if (key !== 'empty') {
            await phone.getByRole('button', { name: key === 'error' ? '重试读取' : '清除条件', exact: true }).click()
            await cards.first().waitFor()
          }
        }
        await choosePageState(page, '筛选无结果')
        const filter = phone.getByRole('button', { name: '需要关注', exact: true })
        assert.equal(await filter.getAttribute('aria-pressed'), 'true')
        await choosePageState(page, '首次读取失败')
        assert.equal(await filter.getAttribute('aria-pressed'), 'true', '失败保留当前筛选')
        await phone.getByRole('button', { name: '重试读取', exact: true }).click()
        assert.equal(await filter.getAttribute('aria-pressed'), 'true', '重试保留当前筛选')
        await choosePageState(page, '筛选无结果')
        await phone.getByRole('button', { name: '清除条件', exact: true }).click()
        assert.equal(await filter.getAttribute('aria-pressed'), 'false')
        await choosePageState(page, '首次加载')
        await page.getByLabel('手机样例宽度', { exact: true }).getByText('320px', { exact: true }).click()
        assert.equal(Math.round((await phone.boundingBox()).width), 320)
        assert(await phone.evaluate((node) => node.scrollWidth <= node.clientWidth), '320px 样例不得横向溢出')
        await screenshot(page, 'controls-mobile-loading-320')
        await page.getByLabel('控件样例主题', { exact: true }).getByText('深色', { exact: true }).click()
        await screenshot(page, 'controls-mobile-loading-dark')
        await page.emulateMedia({ reducedMotion: 'reduce' })
        assert.equal(await skeleton.evaluate((node) => node.getAnimations({ subtree: true }).length), 0)
        await choosePageState(page, '切换栏目')
        assert.equal(await phone.getByTestId('mobile-role-task-list-loading').evaluate((node) => node.getAnimations({ subtree: true }).length), 0)
        await page.emulateMedia({ reducedMotion: 'no-preference' })
        await page.getByLabel('控件样例主题', { exact: true }).getByText('浅色', { exact: true }).click()
        await page.getByLabel('页面状态设备', { exact: true }).getByText('电脑切页', { exact: true }).click()
        const desktop = page.getByRole('region', { name: '电脑切页样例', exact: true })
        await desktop.getByText('正在打开销售订单', { exact: true }).waitFor()
        await screenshot(page, 'controls-desktop-route-loading')
        await desktop.getByRole('button', { name: '工作台', exact: true }).click()
        await desktop.getByText('工作台已就绪', { exact: true }).waitFor()
        await screenshot(page, 'controls-desktop-data')
        await choosePageState(page, '读取失败')
        await desktop.getByRole('alert').waitFor()
        await screenshot(page, 'controls-desktop-error')
        await desktop.getByRole('button', { name: '重试读取', exact: true }).click()
        await desktop.getByText('工作台已就绪', { exact: true }).waitFor()
        await stateSelect.locator('.ant-select-clear').click()
        assert.equal(await desktop.count(), 0, '电脑样例同样允许清空并保留选择入口')
        await choosePageState(page, '正常')
        await desktop.getByText('销售订单已就绪', { exact: true }).waitFor()
        assert.deepEqual(requests, [], '共享组件样例不得请求业务接口')
        await page.getByRole('link', { name: '查看图解说明', exact: true }).click()
        await page.getByText('规范原文', { exact: true }).click()
        await page.getByRole('heading', { name: /状态与恢复/ }).waitFor()
        await page.getByText('同一查询刷新', { exact: true }).waitFor()
        await screenshot(page, 'page-states-design-specification')
      },
    },
    {
      ...shared,
      name: 'dev-ui-page-states-mobile-preview',
      path: '/__dev/ui-design?page=mobile-tasks',
      verify: async (page) => {
        const requests = watchBusinessRequests(page)
        const frame = page.frameLocator(frameSelector)
        await frame.locator('.rm-task-card').first().waitFor()
        const navigation = await frame.locator('.rm-view-tabs[aria-label="任务状态"]').elementHandle()
        const controlsBox = await frame.locator('.rm-list-controls').boundingBox()
        for (const { key, label } of UI_DESIGN_MOBILE_STATES) {
          await simulate(page, label)
          const cards = frame.locator('.rm-task-card:not(.rm-task-skeleton)')
          assert.equal(await frame.locator('.rm-task-list').getAttribute('aria-busy'), String(['loading', 'switching', 'refreshing'].includes(key)))
          if (key === 'loading') {
            assert.equal(await frame.locator('.rm-task-skeleton').count(), 4)
            assert.equal(await frame.locator('.rm-task-skeleton button').count(), 0)
          } else if (['data', 'refreshing', 'refresh-error'].includes(key)) {
            assert(await cards.count() > 0)
          } else {
            assert.equal(await cards.count(), 0)
          }
          assert.equal(await navigation.evaluate((node) => node.isConnected), true)
          assert.deepEqual(await frame.locator('.rm-list-controls').boundingBox(), controlsBox)
          assert(await frame.locator('.role-mobile-device').evaluate((node) => node.scrollWidth <= node.clientWidth), '手机预览不得横向溢出')
          await screenshot(page, `preview-mobile-${key}`)
          if (key.includes('error')) {
            await frame.getByRole('button', { name: '重新读取', exact: true }).click()
            await cards.first().waitFor()
            assert.equal(await frame.getByRole('alert').count(), 0)
          }
          if (key === 'filtered') {
            await frame.getByRole('button', { name: '清除条件', exact: true }).click()
            await cards.first().waitFor()
          }
        }
        const card = await frame.locator('.rm-task-card').first().elementHandle()
        await simulate(page, '刷新已有内容')
        assert.equal(await card.evaluate((node) => node.isConnected), true)
        await simulate(page, '刷新失败')
        assert.equal(await card.evaluate((node) => node.isConnected), true)
        await frame.getByRole('button', { name: '重新读取', exact: true }).click()
        assert.equal(await card.evaluate((node) => node.isConnected), true)
        assert.deepEqual(requests, [])
        await page.getByRole('link', { name: '页面状态样例', exact: true }).click()
        await page.getByRole('heading', { name: '页面状态', exact: true }).waitFor()
      },
    },
    {
      ...shared,
      name: 'dev-ui-page-states-desktop-preview',
      path: '/__dev/ui-design?page=workspace',
      verify: async (page) => {
        const requests = watchBusinessRequests(page)
        const frame = page.frameLocator(frameSelector)
        await frame.locator('#view table').first().waitFor()
        await simulate(page, '切页等待')
        await frame.getByText('正在打开工作台', { exact: true }).waitFor()
        await screenshot(page, 'preview-desktop-route-loading')
        await frame.getByRole('button', { name: '销售管理', exact: true }).click()
        await frame.getByRole('group', { name: '销售订单视图', exact: true }).waitFor()
        assert.equal(await frame.getByText('正在打开工作台', { exact: true }).count(), 0)
        await screenshot(page, 'preview-desktop-navigation-restored')
        await simulate(page, '读取失败')
        await frame.getByRole('button', { name: '重新读取', exact: true }).click()
        await frame.getByRole('group', { name: '销售订单视图', exact: true }).waitFor()
        await page.getByRole('button', { name: /重置演示/ }).click()
        await frame.getByRole('heading', { name: '工作台', exact: true }).waitFor()
        assert.deepEqual(requests, [])
      },
    },
  ]
}
