import {
  DEV_BUSINESS_USABILITY_ROUTE,
  DEV_CUSTOMER_CONFIG_ROUTE,
  DEV_DATA_PREPARATION_ROUTE,
  DEV_DRILL_RECOVERY_ROUTE,
  DEV_GOVERNANCE_ROUTE,
  DEV_PAGE_TITLE_BY_ROUTE,
  DEV_PERMISSION_RELATIONSHIPS_ROUTE,
  DEV_PRODUCT_ENGINEERING_ROUTE,
  DEV_QUALITY_GATES_ROUTE,
  DEV_QUALITY_ROUTE,
  DEV_SECONDARY_NAV_ITEMS,
  DEV_STATUS_FLOWS_ROUTE,
  DEV_TESTING_ROUTE,
  DEV_VERSION_CENTER_ROUTE,
  DEV_WORKSPACE_NAV_ITEMS,
} from '../../src/dev-workbench/config/devRoutes.mjs'
import { verifyMobileNavigationMotion as verifySlidingMotion } from './slidingMotionAssertions.mjs'

const SPECIALIZED_ROUTES = new Set([
  DEV_BUSINESS_USABILITY_ROUTE,
  DEV_DRILL_RECOVERY_ROUTE,
  DEV_QUALITY_GATES_ROUTE,
  DEV_STATUS_FLOWS_ROUTE,
  DEV_VERSION_CENTER_ROUTE,
])

const DESKTOP_HEADING_BY_ROUTE = Object.freeze({
  '/__dev': '总览',
  [DEV_GOVERNANCE_ROUTE]: '改动指南',
  [DEV_TESTING_ROUTE]: '改动验证',
  [DEV_DATA_PREPARATION_ROUTE]: '测试数据',
})

const ORDINARY_DEV_ROUTES = Object.freeze(
  [...DEV_WORKSPACE_NAV_ITEMS, ...DEV_SECONDARY_NAV_ITEMS]
    .filter((item) => !SPECIALIZED_ROUTES.has(item.route))
    .map((item) => {
      return Object.freeze({
        key: item.key,
        route: item.route,
        expectedRoute: item.route,
        title:
          DESKTOP_HEADING_BY_ROUTE[item.route] ||
          DEV_PAGE_TITLE_BY_ROUTE[item.route] ||
          item.label,
      })
    })
)

export function createDevWorkbenchDesktopScenarios({
  assert,
  assertNoHorizontalOverflow,
  expectHeading,
}) {
  return ORDINARY_DEV_ROUTES.map((item) => ({
    name: `dev-page-${item.key}-desktop-light`,
    path: item.route,
    mockAdminRpc: item.route === DEV_PERMISSION_RELATIONSHIPS_ROUTE,
    viewport: { width: 1440, height: 900 },
    ...(item.route === DEV_TESTING_ROUTE
      ? {
          expectedConsoleErrorPatterns: [
            /console error.*net::ERR_FAILED.*\/__dev\/api\/qa\/coverage/u,
          ],
        }
      : {}),
    verify: async (page) => {
      await expectHeading(page, item.title)
      const root = page.locator('.erp-dev-workspace-page')
      await root.waitFor({ state: 'visible', timeout: 10_000 })
      assert.equal(
        await root.count(),
        1,
        `${item.route} 应只有一个工作台页面根节点`
      )
      assert.equal(
        new URL(page.url()).pathname.replace(/\/+$/u, '') || '/',
        item.expectedRoute.replace(/\/+$/u, '') || '/',
        `${item.route} 桌面 smoke 必须落到登记页面`
      )
      if (item.route === '/__dev') {
        const nav = page.locator('.erp-dev-workspace-nav')
        for (const entry of DEV_SECONDARY_NAV_ITEMS.filter(
          (entry) => entry.showInNavigation !== false
        )) {
          assert.equal(
            await nav.locator(`a[href="${entry.route}"]`).count(),
            1,
            `${entry.label} 应可直接进入`
          )
        }
        const search = page.getByRole('textbox', { name: '搜索全部开发工具' })
        await search.fill('质量门禁')
        await page
          .locator('table[aria-label="全部开发工具"] tbody tr')
          .first()
          .waitFor()
        await page.waitForFunction(
          () =>
            document.querySelectorAll(
              'table[aria-label="全部开发工具"] tbody tr'
            ).length === 1
        )
        assert.equal(
          await page
            .locator('table[aria-label="全部开发工具"] tbody tr')
            .count(),
          1
        )
        await page
          .getByRole('button', { name: '置顶质量门禁', exact: true })
          .click()
        await page.reload()
        await search.waitFor()
        assert.equal(await search.inputValue(), '质量门禁')
        assert.equal(
          await page
            .getByRole('button', { name: '取消置顶质量门禁', exact: true })
            .getAttribute('aria-pressed'),
          'true'
        )
        await page
          .getByRole('button', { name: '清除筛选', exact: true })
          .click()
        await verifySlidingMotion(
          page,
          assert,
          '.erp-dev-overview-view-tabs',
          1
        )
        assert.equal(
          await page
            .locator('table[aria-label="常用开发工具"] tbody tr')
            .count(),
          1
        )
        await page
          .getByRole('button', { name: '取消置顶质量门禁', exact: true })
          .click()
        await page
          .getByText('还没有常用工具，在全部工具中点击图钉即可添加。')
          .waitFor()
        await verifySlidingMotion(
          page,
          assert,
          '.erp-dev-overview-view-tabs',
          2,
          true
        )
        await page.getByRole('table', { name: '开发工具使用指南' }).waitFor()
        await verifySlidingMotion(
          page,
          assert,
          '.erp-dev-overview-view-tabs',
          0
        )
        await search.fill('不存在的工具名称')
        await page.getByText('没有匹配的工具', { exact: true }).waitFor()
        await page
          .getByRole('button', { name: '清除筛选', exact: true })
          .first()
          .click()
        await page
          .getByRole('button', { name: '查看质量门禁来源与边界', exact: true })
          .click()
        await page
          .locator('.ant-popover-inner')
          .getByText('质量门禁 · 来源与边界', { exact: true })
          .waitFor()
        await page
          .getByRole('button', { name: '查看质量门禁来源与边界', exact: true })
          .press('Escape')
        await page.locator('.ant-popover-inner').waitFor({ state: 'hidden' })
        await page
          .locator('.erp-dev-overview-library__toolbar .ant-select-selector')
          .click()
        await page.locator('.ant-select-dropdown [title="质量验证"]').click()
        assert.equal(new URL(page.url()).searchParams.get('group'), 'quality')
        await page.waitForFunction(
          () =>
            document.querySelectorAll(
              'table[aria-label="全部开发工具"] tbody tr'
            ).length === 4
        )
        assert.equal(
          await page
            .locator('table[aria-label="全部开发工具"] tbody tr')
            .count(),
          4
        )
        await page.reload()
        await page
          .locator('table[aria-label="全部开发工具"] tbody tr')
          .first()
          .waitFor()
        assert.equal(
          await page
            .locator('table[aria-label="全部开发工具"] tbody tr')
            .count(),
          4
        )
        await page
          .getByRole('table', { name: '全部开发工具' })
          .getByRole('link', { name: '质量门禁', exact: true })
          .click()
        await page.waitForURL('**/__dev/quality-gates')
        await page.goBack()
        await page.getByRole('table', { name: '全部开发工具' }).waitFor()
        assert.equal(new URL(page.url()).searchParams.get('group'), 'quality')
        assert.equal(
          await page
            .getByRole('table', { name: '全部开发工具' })
            .locator('tbody tr')
            .count(),
          4
        )
      }
      if (item.route === DEV_PRODUCT_ENGINEERING_ROUTE) {
        assert.equal(
          await page.locator('.erp-dev-tool-table tbody tr').count(),
          6,
          '产品工程应完整显示六个工具入口'
        )
        assert.equal(
          await page.locator('.erp-dev-product-task__index').count(),
          0,
          '并列工具不能显示为虚假的执行序号'
        )
        assert.equal(
          await page.getByRole('tablist', { name: '产品工程查看方式' }).count(),
          0,
          '产品工程工具应直接显示，不再要求选择查看方式'
        )
      }
      if (item.route === DEV_QUALITY_ROUTE) {
        assert.equal(
          await page.locator('.erp-dev-tool-table tbody tr').count(),
          3,
          '质量验证首页应完整显示改动验证、质量门禁和测试数据'
        )
        assert.equal(
          await page
            .locator(
              '[data-tool-key="quality-gates"] a[href="/__dev/quality-gates"]'
            )
            .count(),
          1,
          '质量验证首页应提供质量门禁入口'
        )
      }
      if (item.route === DEV_CUSTOMER_CONFIG_ROUTE) {
        await page
          .getByRole('tablist', { name: '客户配置工作任务' })
          .getByRole('tab', { name: /^检查配置包/u })
          .click()
        const preflight = page.locator('[data-dev-customer-view="包预检"]')
        await preflight.waitFor({ state: 'visible' })
        const sections = page.getByRole('tablist', { name: '配置预检任务' })
        for (const section of [
          { label: '包结构', key: 'package' },
          { label: '运行投影', key: 'runtime' },
          { label: '流程策略', key: 'flow' },
          { label: '包结构', key: 'package' },
        ]) {
          await sections
            .getByRole('tab', { name: new RegExp(`^${section.label}`, 'u') })
            .click()
          await page.waitForURL(
            (url) =>
              url.searchParams.get('view') === 'preflight' &&
              (url.searchParams.get('section') || 'package') === section.key
          )
          if (section.key === 'package') {
            const declarations = preflight
              .locator('.erp-dev-customer-db-target')
              .filter({
                has: page.getByText('策略 / 命令声明', { exact: true }),
              })
            assert((await declarations.innerText()).includes('仅预览'))
          } else if (section.key === 'runtime') {
            const catalog = preflight.locator('.erp-dev-customer-tool')
            assert(
              (
                await catalog
                  .filter({ has: page.getByText('策略目录', { exact: true }) })
                  .innerText()
              ).includes('仅声明式预览')
            )
            assert(
              (
                await catalog
                  .filter({
                    has: page.getByText('扩展点目录', { exact: true }),
                  })
                  .innerText()
              ).includes('当前未实现')
            )
          } else {
            const checks = preflight.locator('.erp-dev-customer-formal-gate')
            await checks
              .filter({ hasText: '仅声明式预览' })
              .first()
              .waitFor({ state: 'visible' })
            const previews = await checks
              .filter({ hasText: '仅声明式预览' })
              .allTextContents()
            assert(previews.length > 0)
            assert(previews.every((text) => text.includes('仅预览')))
            assert(
              (
                await checks.filter({ hasText: '当前未实现' }).innerText()
              ).includes('受控空目录')
            )
          }
          assert.doesNotMatch(
            await preflight.innerText(),
            /已登记绑定|实现来自已登记部署包/u
          )
          await assertNoHorizontalOverflow(
            page,
            `${item.route} ${section.label}`
          )
        }
        await page.reload()
        await preflight.waitFor({ state: 'visible' })
        assert.equal(new URL(page.url()).searchParams.get('view'), 'preflight')
        assert.equal(new URL(page.url()).searchParams.get('section'), null)
      }
      await assertNoHorizontalOverflow(page, item.route)
    },
  }))
}
