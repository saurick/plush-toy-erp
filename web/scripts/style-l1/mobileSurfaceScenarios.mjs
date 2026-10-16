import { getContrastRatio, parseRgb } from './colorAssertions.mjs'
import { waitForFiniteAnimations } from './browserReadiness.mjs'

export function createMobileSurfaceScenarios({
  assert,
  assertNoHorizontalOverflow,
  customerRuntimeEffectiveSession,
  outputDir,
  path,
}) {
  const assertSurface = async (locator, token, label) => {
    await locator.waitFor()
    const paint = await locator.evaluate((element, variable) => {
      const style = getComputedStyle(element)
      let surface = element
      while (
        surface.parentElement &&
        getComputedStyle(surface).backgroundColor === 'rgba(0, 0, 0, 0)'
      ) {
        surface = surface.parentElement
      }
      return {
        expected: style
          .getPropertyValue(variable)
          .trim()
          .replace(
            /^#([0-9a-f]{3})$/i,
            (_, digits) =>
              `#${[...digits].map((digit) => digit + digit).join('')}`
          ),
        background: getComputedStyle(surface).backgroundColor,
        color: style.color,
      }
    }, token)
    assert.deepEqual(
      parseRgb(paint.background),
      parseRgb(paint.expected),
      `${label}沿用所属层级底色: ${JSON.stringify(paint)}`
    )
    assert.ok(
      getContrastRatio(parseRgb(paint.color), parseRgb(paint.background)) >=
        4.5,
      `${label}文字保持可读`
    )
  }
  const shot = (page, name) =>
    page.screenshot({ path: path.join(outputDir, `${name}.png`) })

  return [
    ...['light', 'dark'].map((themeMode) => ({
      name: `mobile-surface-${themeMode}`,
      path: '/m/boss/tasks',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      hasTouch: true,
      themeMode,
      viewport: { width: 390, height: 844 },
      workflowTaskFixtures: Array.from({ length: 12 }, (_, index) => ({
        id: 8800 + index,
        version: 1,
        task_code: `TASK-SURFACE-${index + 1}`,
        task_name: `核对长名称材料采购订单的交期与到货说明 ${index + 1}`,
        task_group: 'material_check',
        owner_role_key: 'boss',
        task_status_key: index === 11 ? 'done' : 'blocked',
        source_type: 'sales_order',
        source_id: 1,
        source_no: 'SO-0001',
        created_at: 1788840000,
        payload: {},
        block_reason: '面料交期尚未确认，等待责任岗位补充到货日期',
      })),
      verify: async (page) => {
        await page.getByTestId('mobile-role-nav-tasks').click()
        const card = page.locator('.mobile-task-list-row').first()
        await card.waitFor()
        const canvas = () =>
          assertSurface(
            page.locator('.mobile-role-tasks-page'),
            '--erp-page-bg',
            '移动页面'
          )
        const assertTaskSurfaces = async () => {
          await canvas()
          for (const selector of [
            '.mobile-role-task-query',
            '.mobile-workspace-task-views',
            '.mobile-task-list-toolbar',
            '.mobile-task-results',
          ]) {
            await assertSurface(
              page.locator(selector),
              '--erp-page-bg',
              selector
            )
          }
          await assertSurface(card, '--erp-surface-bg', '任务卡片')
          await assertSurface(
            page.getByTestId('mobile-role-bottom-nav'),
            '--erp-surface-bg',
            '底部导航'
          )
        }
        for (const width of [320, 390, 430]) {
          await page.setViewportSize({ width, height: 844 })
          await waitForFiniteAnimations(page)
          await assertTaskSurfaces()
          await assertNoHorizontalOverflow(
            page,
            `mobile-surface-${themeMode}-${width}`
          )
          const geometry = await page.evaluate(() => {
            const box = (selector) =>
              document.querySelector(selector).getBoundingClientRect().toJSON()
            return {
              search: box('.mobile-role-task-query'),
              tabs: box('.mobile-workspace-task-views'),
              results: box('.mobile-task-results'),
            }
          })
          assert.equal(geometry.search.x, geometry.tabs.x, '搜索和页签左对齐')
          assert.equal(
            geometry.tabs.x,
            geometry.results.x,
            '操作区和数据区左对齐'
          )
          assert.equal(
            geometry.search.right,
            geometry.results.right,
            '操作区和数据区右对齐'
          )
        }
        await page.setViewportSize({ width: 390, height: 844 })
        await shot(page, `mobile-surface-${themeMode}-tasks`)
        await page.getByTestId('mobile-role-scroll').evaluate((node) => {
          node.scrollTop = 300
        })
        await waitForFiniteAnimations(page)
        const sticky = await page
          .getByTestId('mobile-task-list-toolbar')
          .evaluate((node) => ({
            background: getComputedStyle(node).backgroundColor,
            top: node.getBoundingClientRect().top,
            scrollTop: node
              .closest('.mobile-role-tasks-page__scroll')
              .getBoundingClientRect().top,
          }))
        assert.ok(
          Math.abs(sticky.top - sticky.scrollTop) <= 1,
          `筛选栏吸顶: ${JSON.stringify(sticky)}`
        )
        assert.ok(!sticky.background.includes('rgba'), '吸顶背景不透明')
        await assertSurface(
          page.getByTestId('mobile-task-list-toolbar'),
          '--erp-page-bg',
          '吸顶筛选栏'
        )
        await page.getByTestId('mobile-role-scroll').evaluate((node) => {
          node.scrollTop = 0
        })

        await page.getByTestId('mobile-task-list-filter-trigger').click()
        const filters = page.getByRole('dialog', {
          name: '筛选任务',
          exact: true,
        })
        await assertSurface(filters, '--erp-surface-bg', '筛选浮层')
        await page.keyboard.press('Escape')
        await filters.waitFor({ state: 'hidden' })
        await card.click()
        await page.locator('.mobile-role-tasks-page--detail').waitFor()
        await canvas()
        await assertSurface(
          page.locator('.mobile-task-flow-header'),
          '--erp-surface-bg',
          '详情导航区'
        )
        await assertSurface(
          page.locator('.mobile-role-tasks-page__detail-main'),
          '--erp-page-bg',
          '详情数据区'
        )
        await assertSurface(
          page.locator('.erp-mobile-card').first(),
          '--erp-surface-bg',
          '详情卡片'
        )
        await assertSurface(
          page.locator('.mobile-role-action-bar'),
          '--erp-surface-bg',
          '详情操作区'
        )
        await shot(page, `mobile-surface-${themeMode}-detail`)
        await page
          .getByRole('button', { name: '催办任务', exact: true })
          .click()
        await page.getByTestId('mobile-task-action-screen').waitFor()
        await canvas()
        await assertSurface(
          page.locator('.mobile-role-tasks-page__detail-main'),
          '--erp-page-bg',
          '办理数据区'
        )
        await assertSurface(
          page.locator('.mobile-role-action-bar'),
          '--erp-surface-bg',
          '办理操作区'
        )
        await page.locator('.mobile-task-flow-back').click()
        await page.getByTestId('mobile-task-detail-screen').waitFor()
        await page.locator('.mobile-task-flow-back').click()
        await card.waitFor()

        await page.getByRole('searchbox').fill('未匹配背景回归检查')
        await page.getByText('当前筛选下暂无任务', { exact: true }).waitFor()
        await canvas()
        await assertSurface(
          page.locator('.mobile-task-results'),
          '--erp-page-bg',
          '无结果数据区'
        )
        await page.getByRole('searchbox').fill('')
        await card.waitFor()
        await page
          .getByLabel('任务状态', { exact: true })
          .getByText('已办', { exact: true })
          .click()
        await page.locator('.mobile-task-history').waitFor()
        await canvas()
        await assertSurface(
          page.locator('.mobile-task-history'),
          '--erp-page-bg',
          '已办数据区'
        )
        await page.getByTestId('mobile-role-nav-messages').click()
        await assertSurface(
          page.locator('.mobile-role-messages'),
          '--erp-page-bg',
          '风险数据区'
        )
        await page.getByTestId('mobile-role-nav-progress').click()
        await assertSurface(
          page.locator('.mobile-progress-controls'),
          '--erp-page-bg',
          '进度操作区'
        )
        await assertSurface(
          page.locator('.mobile-progress-list'),
          '--erp-page-bg',
          '进度数据区'
        )
        await page.getByTestId('mobile-role-nav-mine').click()
        await canvas()
        await assertSurface(
          page.locator('.mobile-mine-card').first(),
          '--erp-surface-bg',
          '我的资料卡片'
        )
        await page.getByTestId('mobile-role-nav-tasks').click()
        await page
          .getByLabel('任务状态', { exact: true })
          .getByText('待办', { exact: true })
          .click()
        await card.waitFor()
        await assertTaskSurfaces()
      },
    })),
    {
      name: 'dev-ui-design-mobile-surfaces',
      path: '/__dev/ui-design',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        const frame = page.frameLocator('iframe[title="ERP 最新可交互设计"]')
        await frame.getByRole('button', { name: '手机端', exact: true }).click()
        for (const selector of [
          '.rm-query',
          '.rm-quick-filters',
          '.rm-task-list',
        ]) {
          await assertSurface(frame.locator(selector), '--canvas', selector)
        }
        await assertSurface(
          frame.locator('.rm-task-card').first(),
          '--surface',
          '设计稿任务卡片'
        )
        await frame.getByRole('button', { name: '进度', exact: true }).click()
        await assertSurface(
          frame.locator('.rm-progress-controls'),
          '--canvas',
          '设计稿进度操作区'
        )
        await assertSurface(
          frame.locator('.rm-progress-list'),
          '--canvas',
          '设计稿进度数据区'
        )
        await frame.getByRole('button', { name: /任务，/ }).click()
        await frame.locator('.rm-task-card').first().click()
        await assertSurface(
          frame.locator('.rm-flow-scroll'),
          '--canvas',
          '设计稿详情数据区'
        )
        await assertSurface(
          frame.locator('.rm-section').first(),
          '--surface',
          '设计稿详情卡片'
        )
        await frame.getByRole('button', { name: '返回', exact: true }).click()
        await assertNoHorizontalOverflow(page, 'UI交互设计移动样例')
        await shot(page, 'dev-ui-design-mobile-surfaces')
      },
    },
  ]
}
