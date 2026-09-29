import { getContrastRatio, parseRgb } from './colorAssertions.mjs'
import { RpcErrorCode } from '../../src/common/consts/errorCodes.generated.js'

export function createEmptyStateScenarios({
  assert,
  assertNoHorizontalOverflow,
  customerRuntimeEffectiveSession,
  outputDir,
  path,
}) {
  async function inspectEmpty(page, description) {
    const snapshot = await page.waitForFunction((description) => {
      const node = [...document.querySelectorAll('.erp-empty')].find(
        (candidate) => candidate.textContent.includes(description)
      )
      if (!node || !node.getClientRects().length) return null
      const image = node.querySelector('.ant-empty-image')
      const text = node.querySelector('.ant-empty-description')
      if (!image || !text) return null
      let surface = node
      while (
        surface.parentElement &&
        getComputedStyle(surface).backgroundColor === 'rgba(0, 0, 0, 0)'
      ) {
        surface = surface.parentElement
      }
      return {
        font: getComputedStyle(text).fontSize,
        color: getComputedStyle(text).color,
        background: getComputedStyle(surface).backgroundColor,
        padding: getComputedStyle(node).padding,
        imageHeight: image.getBoundingClientRect().height,
        imageVisible: getComputedStyle(image).display !== 'none',
        overflow: node.scrollWidth - node.clientWidth,
      }
    }, description)
    const actual = await snapshot.jsonValue()
    await snapshot.dispose()
    assert.equal(actual.font, '14px')
    assert.equal(actual.imageHeight, 40)
    assert.equal(actual.padding, '24px 16px')
    assert.ok(actual.imageVisible)
    assert.ok(actual.overflow <= 1)
    assert.ok(
      getContrastRatio(parseRgb(actual.color), parseRgb(actual.background)) >=
        4.5,
      `空状态文字对比度：${JSON.stringify(actual)}`
    )
    return actual
  }
  return [
    ...['light', 'dark'].map((themeMode) => ({
      name: `empty-states-mobile-${themeMode}`,
      path: '/m/boss/tasks',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      workflowTaskFixtures: [],
      hasTouch: true,
      themeMode,
      viewport: { width: 390, height: 844 },
      verify: async (page) => {
        await page.getByTestId('mobile-role-nav-tasks').click()
        const todo = await inspectEmpty(page, '当前筛选下暂无任务')
        await page
          .getByLabel('任务状态', { exact: true })
          .getByText('已办', { exact: true })
          .click()
        assert.deepEqual(await inspectEmpty(page, '暂无已办任务'), todo)
        await page.getByTestId('mobile-role-nav-messages').click()
        const risk = await inspectEmpty(page, '暂无风险任务')
        assert.equal(risk.color, todo.color)
        assert.equal(
          await page.locator('.mobile-role-message-section--warning').count(),
          0
        )
        await page.screenshot({
          path: path.join(outputDir, `empty-risk-${themeMode}.png`),
        })
        await page.getByRole('tab', { name: /超时/ }).click()
        await inspectEmpty(page, '暂无超时任务')
        await page.getByTestId('mobile-role-nav-progress').click()
        await inspectEmpty(page, '当前范围暂无记录')
        for (const width of [320, 430]) {
          await page.setViewportSize({ width, height: 844 })
          await inspectEmpty(page, '当前范围暂无记录')
          await assertNoHorizontalOverflow(
            page,
            `empty-mobile-${themeMode}-${width}`
          )
        }
        await page.getByTestId('mobile-role-nav-tasks').click()
        await page
          .getByLabel('任务状态', { exact: true })
          .getByText('待办', { exact: true })
          .click()
        let fail = true
        await page.route('**/rpc/workflow', async (route) => {
          const body = route.request().postDataJSON()
          if (!fail || body.method !== 'list_role_tasks') {
            return route.fallback()
          }
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: body.id,
              result: { code: RpcErrorCode.INTERNAL, message: '模拟读取失败' },
            }),
          })
        })
        await page
          .getByRole('searchbox', { name: '搜索订单、产品、物料或款号' })
          .fill('错误恢复样例')
        await page
          .getByRole('alert')
          .filter({ hasText: '任务加载失败' })
          .waitFor()
        assert.equal(
          await page.getByText('当前筛选下暂无任务', { exact: true }).count(),
          0,
          '读取失败不能同时显示空结果'
        )
        fail = false
        await page
          .getByRole('button', { name: '重新加载', exact: true })
          .click()
        await inspectEmpty(page, '当前筛选下暂无任务')
      },
    })),
    {
      name: 'empty-states-desktop',
      path: '/erp/business-dashboard',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      workflowTaskFixtures: [],
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await inspectEmpty(page, '当前范围暂无记录')
        await inspectEmpty(page, '暂无可查看的阶段摘要')
        await assertNoHorizontalOverflow(page, 'empty-desktop-progress')
        await page.screenshot({
          path: path.join(outputDir, 'empty-desktop.png'),
        })
      },
    },
    {
      name: 'dev-ui-design-workbench',
      path: '/__dev/ui-design?page=workbench',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        const frame = page.frameLocator('iframe[title="ERP 最新可交互设计"]')
        await frame
          .getByRole('heading', { name: '总览', level: 1, exact: true })
          .waitFor()
        assert.equal(
          await frame.locator('#topbar .crumb').count(),
          0,
          '效能工作台内容区拥有主标题时，顶栏不应重复当前页面名称'
        )
        await frame
          .getByRole('button', { name: '查看质量验证', exact: true })
          .click()
        await frame.getByRole('tab', { name: '执行记录', exact: true }).click()
        await frame.getByRole('button', { name: '查看质量门禁证据' }).click()
        await frame
          .getByRole('dialog', { name: '质量门禁 · 证据详情' })
          .waitFor()
        await page.keyboard.press('Escape')
        assert.equal(
          await frame.locator(':focus').getAttribute('aria-label'),
          '查看质量门禁证据'
        )
        await frame
          .getByRole('button', { name: '产品工程', exact: true })
          .click()
        await frame
          .getByRole('textbox', { name: '搜索工作台条目' })
          .fill('不存在的条目')
        await frame.getByText('当前范围暂无记录', { exact: true }).waitFor()
        await frame.getByRole('button', { name: '清除当前筛选' }).click()
        await frame.getByRole('button', { name: '查看权限关系证据' }).waitFor()
        await frame
          .getByRole('button', { name: '交付运行', exact: true })
          .click()
        assert.ok(
          await frame.getByRole('button', { name: '核对并准备' }).isDisabled()
        )
        const lockFlowTrigger = frame.getByRole('button', {
          name: '查看 Git 索引锁流程',
          exact: true,
        })
        await lockFlowTrigger.click()
        const lockFlowDialog = frame.getByRole('dialog', {
          name: 'Git 索引锁恢复流程',
          exact: true,
        })
        await lockFlowDialog.waitFor()
        await lockFlowDialog
          .getByRole('img', {
            name: 'Git index.lock 检查与恢复流程',
            exact: true,
          })
          .waitFor()
        await lockFlowDialog
          .getByText('owner 已结束且现场稳定？', { exact: true })
          .waitFor()
        await lockFlowDialog
          .getByRole('button', { name: '返回版本发布', exact: true })
          .click()
        await lockFlowDialog.waitFor({ state: 'hidden' })
        assert.equal(
          await frame.locator(':focus').getAttribute('data-action'),
          'dev-lock-flow'
        )
        const tabs = await frame.locator('.dev-design-tabs').elementHandle()
        const motion = tabs.evaluate(async (node) => {
          const samples = []
          const start = performance.now()
          while (performance.now() - start < 500) {
            await new Promise(requestAnimationFrame)
            const rect = node.getBoundingClientRect()
            samples.push({
              left: parseFloat(getComputedStyle(node, '::before').left),
              width: rect.width,
              height: rect.height,
              connected: node.isConnected,
            })
          }
          return samples
        })
        await frame
          .getByRole('tab', { name: '数据库迁移', exact: true })
          .click()
        const samples = await motion
        const first = samples[0]
        const last = samples.at(-1)
        assert.ok(
          samples.every(
            (sample) =>
              sample.connected &&
              sample.width === first.width &&
              sample.height === first.height
          )
        )
        assert.ok(
          samples.some(
            (sample) =>
              sample.left > first.left + 1 && sample.left < last.left - 1
          ),
          '滑块应经过真实中间位置'
        )
        assert.ok(
          await tabs.evaluate((node) => node.isConnected),
          '切换保留同一条页签'
        )
        await page.emulateMedia({ reducedMotion: 'reduce' })
        assert.equal(
          await tabs.evaluate(
            (node) => getComputedStyle(node, '::before').transitionProperty
          ),
          'none'
        )
        await frame
          .getByRole('tab', { name: '数据库迁移', exact: true })
          .press('End')
        assert.equal(
          await frame
            .getByRole('tab', { name: '演练与恢复', exact: true })
            .getAttribute('aria-selected'),
          'true'
        )
        await frame
          .getByRole('tab', { name: '演练与恢复', exact: true })
          .press('ArrowLeft')
        await page.emulateMedia({ reducedMotion: 'no-preference' })
        await frame
          .getByRole('combobox', { name: '前置证据样例' })
          .selectOption('ready')
        await frame.getByRole('button', { name: '核对并准备' }).click()
        await frame
          .getByRole('dialog', { name: '核对数据库迁移计划' })
          .waitFor()
        await frame.getByRole('button', { name: '取消', exact: true }).click()
        assert.equal(
          await frame.getByRole('button', { name: '读取演示结果' }).count(),
          0
        )
        await frame.getByRole('button', { name: '核对并准备' }).click()
        await frame
          .getByRole('button', { name: '确认演示', exact: true })
          .click()
        assert.ok(
          await frame.getByRole('button', { name: '核对并准备' }).isDisabled()
        )
        await frame
          .getByRole('tab', { name: '演练与恢复', exact: true })
          .click()
        await frame.getByRole('button', { name: '读取演示结果' }).waitFor()
        await frame
          .getByRole('combobox', { name: '工作台状态预览' })
          .selectOption('error')
        await frame.getByRole('alert').waitFor()
        assert.equal(
          await frame.getByText('当前范围暂无记录', { exact: true }).count(),
          0
        )
        await frame.getByRole('button', { name: '读取演示结果' }).waitFor()
        await frame
          .getByRole('button', { name: '重新读取', exact: true })
          .click()
        await frame.getByRole('button', { name: '总览', exact: true }).click()
        await frame.getByRole('button', { name: '读取演示结果' }).click()
        await frame.getByRole('dialog', { name: '演示操作回执' }).waitFor()
        await frame
          .getByRole('button', { name: '返回工作台', exact: true })
          .click()
        await assertNoHorizontalOverflow(page, 'dev-design-workbench')
        assert.ok(
          await frame
            .locator('body')
            .evaluate(
              () => document.documentElement.scrollWidth <= window.innerWidth
            )
        )
        await page.screenshot({
          path: path.join(outputDir, 'dev-ui-workbench.png'),
        })
      },
    },
    {
      name: 'dev-ui-design-purchase-heading',
      path: '/__dev/ui-design',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        const frame = page.frameLocator('iframe[title="ERP 最新可交互设计"]')
        await frame
          .getByRole('button', { name: '采购管理', exact: true })
          .click()
        const heading = frame.getByRole('heading', {
          name: '采购订单',
          level: 1,
          exact: true,
        })
        await heading.waitFor()
        assert.equal(await heading.count(), 1)
        assert.equal(
          await frame.locator('#topbar .crumb').count(),
          0,
          '采购交互稿内容区拥有主标题时，顶栏不应重复当前页面名称'
        )
        await page.screenshot({
          path: path.join(outputDir, 'dev-ui-purchase-heading.png'),
        })
      },
    },
  ]
}
