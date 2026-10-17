import fs from 'node:fs/promises'
import {
  DEV_SECONDARY_NAV_ITEMS,
  DEV_WORKSPACE_NAV_ITEMS,
} from '../../src/dev-workbench/config/devRoutes.mjs'
import { installPermissionRelationshipMock } from './permissionRelationshipScenarios.mjs'
import { assertFulfillmentChainGeometry } from './fulfillmentChainAssertions.mjs'
import { verifyMobileNavigationMotion as verifySlidingMotion } from './slidingMotionAssertions.mjs'

export function createDevWorkbenchDensityScenarios({
  assert,
  assertNoHorizontalOverflow,
  outputDir,
  path,
}) {
  return [
    {
      name: 'dev-workbench-density-desktop-light',
      path: '/__dev',
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
      beforeNavigate: installPermissionRelationshipMock,
      verify: async (page) => {
        const routes = [...DEV_WORKSPACE_NAV_ITEMS, ...DEV_SECONDARY_NAV_ITEMS]
        const measurements = []
        for (const { route, label } of routes) {
          if (new URL(page.url()).pathname !== route) {
            await page.goto(new URL(route, page.url()).href)
          }
          const root = page.locator('.erp-dev-workspace-page')
          await root.locator(':scope > header h1').waitFor()
          if (route === '/__dev/project-skills') {
            await root.locator('.erp-dev-skills__health').waitFor()
          }
          const geometry = await root.evaluate((element) => {
            const header = element.querySelector(':scope > header')
            const headerBox = header.getBoundingClientRect()
            const content = [...element.children].find(
              (child) =>
                child !== header &&
                child.tagName !== 'NAV' &&
                child.getBoundingClientRect().height > 0 &&
                getComputedStyle(child).visibility !== 'hidden'
            )
            const currentRoute = element.querySelector(
              '.erp-dev-workspace-nav [aria-current="page"]'
            )
            const currentStyle = currentRoute
              ? getComputedStyle(currentRoute)
              : null
            return {
              headerHeight: headerBox.height,
              headerAccentWidth: Number.parseFloat(
                getComputedStyle(header).borderInlineStartWidth
              ),
              themedHeader:
                getComputedStyle(header).backgroundColor !==
                getComputedStyle(element).backgroundColor,
              hasExactRoute: Boolean(currentRoute),
              currentRouteDistinct: currentRoute
                ? (() => {
                    const idle = element.querySelector(
                      '.erp-dev-workspace-nav__secondary-route:not([aria-current])'
                    )
                    const idleStyle = getComputedStyle(idle)
                    return (
                      currentStyle.backgroundColor !==
                        idleStyle.backgroundColor &&
                      currentStyle.color !== idleStyle.color
                    )
                  })()
                : true,
              currentRouteMarker: currentStyle?.boxShadow.includes('inset'),
              currentRouteColor: currentStyle?.color,
              currentRouteBackground: currentStyle?.backgroundColor,
              gap: content.getBoundingClientRect().top - headerBox.bottom,
              toolbar: (() => {
                const toolbar =
                  element.querySelector('.erp-dev-workbench-toolbar') ||
                  header.querySelector(
                    '.erp-dev-workbench-header-context:has([role="tablist"])'
                  )
                if (!toolbar) return null
                const nav = toolbar.querySelector('[role="tablist"]')
                const context = toolbar.querySelector(
                  '.erp-dev-customer-scope, .erp-dev-delivery-facts'
                )
                const navBox = nav.getBoundingClientRect()
                const contextBox = context.getBoundingClientRect()
                return {
                  height: toolbar.getBoundingClientRect().height,
                  centerDelta: Math.abs(
                    navBox.top +
                      navBox.height / 2 -
                      (contextBox.top + contextBox.height / 2)
                  ),
                }
              })(),
              headerContext: Boolean(
                header.querySelector('.erp-dev-workbench-header-context')
              ),
              standaloneContext: Boolean(
                element.querySelector(':scope > .erp-dev-delivery-context')
              ),
            }
          })
          measurements.push({ route, label, ...geometry })
          // 多组筛选、配置步骤及固定目标按内容换行，仍只占一个页头。
          const maximumHeaderHeight = [
            '/__dev/customer-config',
            '/__dev/product-core',
            '/__dev/version-center',
          ].includes(route)
            ? 96
            : 52
          assert(
            geometry.headerHeight <= maximumHeaderHeight,
            `${label}页头应保持紧凑：${geometry.headerHeight}px`
          )
          assert(
            geometry.gap >= 7 && geometry.gap <= 9,
            `${label}页头后只保留一层区块间距：${geometry.gap}px`
          )
          assert.equal(
            geometry.headerAccentWidth,
            1,
            `${label}页头应保留细边框`
          )
          assert(geometry.themedHeader, `${label}页头应有主题浅底层次`)
          if (geometry.hasExactRoute) {
            assert(
              geometry.currentRouteMarker && geometry.currentRouteDistinct,
              `${label}当前导航应有主题色与位置标记`
            )
          }
          const headerControls = {
            '/__dev': '.erp-dev-overview-library__toolbar',
            '/__dev/product-core': '.erp-dev-product-core-toolbar',
            '/__dev/project-skills': '.erp-dev-skills__health',
            '/__dev/customer-config': '.erp-dev-customer-stagebar',
            '/__dev/drill-recovery': '[aria-label="安全与恢复任务"]',
          }[route]
          if (headerControls) {
            assert.equal(
              await root.locator(`:scope > header ${headerControls}`).count(),
              1,
              `${label}的筛选、状态或主导航应直接并入页头`
            )
          }
          if (route === '/__dev/project-skills') {
            const selection = await root
              .locator('.erp-dev-skills__item[aria-pressed="true"]')
              .evaluate((element) => {
                const style = getComputedStyle(element)
                return {
                  marker: style.boxShadow.includes('inset'),
                  size: Number.parseFloat(
                    getComputedStyle(element.querySelector('span')).fontSize
                  ),
                }
              })
            assert(
              selection.marker && selection.size >= 14,
              'Skill 目录保留当前标记和可读的说明文字'
            )
          }
          if (route === '/__dev/testing') {
            assert.equal(
              await root.locator('.erp-dev-testing-reader__toolbar').count(),
              0,
              '改动验证不应保留空的辅助操作栏'
            )
          }
          if (
            ['/__dev/drill-recovery', '/__dev/database-migration'].includes(
              route
            )
          ) {
            assert(geometry.toolbar, `${label}的范围和页签应共用操作栏`)
            assert(
              geometry.toolbar.height <= 52,
              `${label}合并后的操作栏应保持一行`
            )
            assert(
              geometry.toolbar.centerDelta <= 1,
              `${label}范围与页签应垂直对齐`
            )
            await verifySlidingMotion(
              page,
              assert,
              route === '/__dev/drill-recovery'
                ? 'header .erp-dev-workbench-header-context [role="tablist"]'
                : '.erp-dev-workbench-toolbar [role="tablist"]',
              1
            )
            await verifySlidingMotion(
              page,
              assert,
              route === '/__dev/drill-recovery'
                ? 'header .erp-dev-workbench-header-context [role="tablist"]'
                : '.erp-dev-workbench-toolbar [role="tablist"]',
              0,
              true
            )
          }
          if (
            [
              '/__dev/customer-config',
              '/__dev/version-center',
              '/__dev/delivery',
            ].includes(route)
          ) {
            assert(geometry.headerContext, `${label}范围应合并到页头`)
            assert.equal(
              geometry.standaloneContext,
              false,
              `${label}不应重复单列范围栏`
            )
          }
          await assertNoHorizontalOverflow(page, label)
        }

        for (const [route, action] of [
          ['/__dev/drill-recovery', '核验目标'],
          ['/__dev/version-center', '刷新状态'],
        ]) {
          await page.goto(new URL(`${route}?customer=unknown`, page.url()).href)
          await page.getByText('未登记甲方：unknown', { exact: true }).waitFor()
          assert.equal(
            await page
              .getByRole('button', { name: action, exact: true })
              .isEnabled(),
            false
          )
          const warning = page.locator('.erp-dev-customer-scope > .ant-alert')
          const geometry = await warning.evaluate((element) => {
            const parent = element
              .closest('.erp-dev-workbench-toolbar, header')
              .getBoundingClientRect()
            const alert = element.getBoundingClientRect()
            return {
              bottom: alert.bottom,
              parentBottom: parent.bottom,
              clipped: element.scrollHeight > element.clientHeight + 1,
            }
          })
          assert(
            geometry.bottom <= geometry.parentBottom + 1 && !geometry.clipped,
            '合并范围后仍需完整显示无效客户警告'
          )
          await assertNoHorizontalOverflow(page, `${route} 无效客户`)
        }

        await page.goto(new URL('/__dev', page.url()).href)
        const directory = page.getByRole('table', { name: '全部开发工具' })
        await directory.locator('tbody tr').first().waitFor()
        const rows = await directory
          .locator('tbody tr')
          .evaluateAll((elements) =>
            elements.map((element) => element.getBoundingClientRect().height)
          )
        assert(rows.length > 0)
        assert(
          rows.every((height) => height <= 44),
          '工具目录应使用紧凑行高'
        )
        await page
          .getByRole('textbox', { name: '搜索全部开发工具' })
          .fill('不存在的工具名称')
        await page.getByText('没有匹配的工具', { exact: true }).waitFor()
        await page
          .getByRole('button', { name: '清除筛选', exact: true })
          .first()
          .click()
        await directory.waitFor()

        await page.goto(
          new URL('/__dev/status-flows?view=chain&chain=all', page.url()).href
        )
        const guide = page.locator('.erp-dev-fulfillment-guide')
        await guide.waitFor()
        await assertFulfillmentChainGeometry(guide)
        const chain = await guide.evaluate((element) => ({
          height: element.getBoundingClientRect().height,
          cards: [...element.querySelectorAll('[data-stage-card]')].map(
            (card) => card.getBoundingClientRect().height
          ),
        }))
        assert(chain.height <= 760, '桌面总链应在一屏内保留主要结构')
        assert(
          chain.cards.every((height) => height >= 60 && height <= 88),
          '节点压缩留白后仍应容纳标题与异常入口'
        )
        await assertNoHorizontalOverflow(page, '压缩后的业务链')

        for (const route of [
          '/__dev',
          '/__dev/product-core',
          '/__dev/customer-config',
          '/__dev/drill-recovery',
          '/__dev/project-skills',
        ]) {
          await page.setViewportSize({ width: 1024, height: 800 })
          await page.goto(new URL(route, page.url()).href)
          await page.locator('.erp-dev-workspace-page > header h1').waitFor()
          await assertNoHorizontalOverflow(page, `${route} 窄窗口换行`)
        }
        await fs.writeFile(
          path.join(outputDir, 'workbench-layout-metrics.json'),
          JSON.stringify(measurements, null, 2)
        )
        await page.setViewportSize({ width: 1920, height: 1080 })
        for (const [route, name] of [
          ['/__dev', 'overview'],
          ['/__dev/product-core', 'product-core'],
          ['/__dev/customer-config', 'customer'],
          ['/__dev/drill-recovery', 'recovery'],
          ['/__dev/project-skills', 'skills'],
        ]) {
          await page.goto(new URL(route, page.url()).href)
          await page.locator('.erp-dev-workspace-page > header h1').waitFor()
          if (name === 'skills')
            await page.locator('.erp-dev-skills__health').waitFor()
          await page.screenshot({
            path: path.join(outputDir, `workbench-${name}-native.png`),
            fullPage: false,
          })
        }
      },
    },
  ]
}
