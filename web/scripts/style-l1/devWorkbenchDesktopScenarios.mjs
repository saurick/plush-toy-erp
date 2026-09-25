import {
  DEV_BUSINESS_USABILITY_ROUTE,
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

const SPECIALIZED_ROUTES = new Set([
  DEV_BUSINESS_USABILITY_ROUTE,
  DEV_DRILL_RECOVERY_ROUTE,
  DEV_QUALITY_GATES_ROUTE,
  DEV_STATUS_FLOWS_ROUTE,
  DEV_VERSION_CENTER_ROUTE,
])

const DESKTOP_HEADING_BY_ROUTE = Object.freeze({
  [DEV_GOVERNANCE_ROUTE]: '这次改动该怎么做？',
  [DEV_TESTING_ROUTE]: '质量验证工作台',
  [DEV_DATA_PREPARATION_ROUTE]: '准备回归数据',
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
      if (item.route === DEV_PRODUCT_ENGINEERING_ROUTE) {
        assert.equal(
          await page.locator('.erp-dev-product-task').count(),
          7,
          '产品工程问题视角应完整显示七个并列入口'
        )
        assert.equal(
          await page.locator('.erp-dev-product-task__index').count(),
          0,
          '并列产品问题不能显示为虚假的执行序号'
        )
      }
      if (item.route === DEV_QUALITY_ROUTE) {
        assert.equal(
          await page.locator('.erp-dev-quality-task').count(),
          3,
          '质量验证首页应完整显示改动验证、质量门禁和测试数据'
        )
        assert.equal(
          await page
            .locator('.erp-dev-quality-task a[href="/__dev/quality-gates"]')
            .count(),
          1,
          '质量验证首页应提供质量门禁入口'
        )
      }
      await assertNoHorizontalOverflow(page, item.route)
    },
  }))
}
