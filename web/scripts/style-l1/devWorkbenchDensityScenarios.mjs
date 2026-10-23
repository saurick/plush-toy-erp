import fs from 'node:fs/promises'
import {
  DEV_SECONDARY_NAV_ITEMS,
  DEV_WORKSPACE_NAV_ITEMS,
} from '../../src/dev-workbench/config/devRoutes.mjs'
import { installPermissionRelationshipMock } from './permissionRelationshipScenarios.mjs'
import { installDatabaseMigrationFixture } from './devDeliveryWorkspaceScenarios.mjs'
import { assertFulfillmentChainGeometry } from './fulfillmentChainAssertions.mjs'
import { verifyMobileNavigationMotion as verifySlidingMotion } from './slidingMotionAssertions.mjs'

async function assertSidebarSelection(page, assert) {
  const selection = await page.locator('.erp-dev-workspace-nav').evaluate(async (nav) => {
    const current = nav.querySelector('[aria-current="page"]')
    await Promise.all(current.getAnimations().map((animation) => animation.finished.catch(() => {})))
    const idle = nav.querySelector('a:not([aria-current])')
    const style = getComputedStyle(current)
    const idleStyle = getComputedStyle(idle)
    const label = current.querySelector(':scope > span:last-child') || current
    return {
      count: nav.querySelectorAll('[aria-current="page"]').length,
      label: current.textContent.trim(),
      distinct:
        style.backgroundColor !== idleStyle.backgroundColor &&
        style.color !== idleStyle.color,
      visibleBorder: ['Top', 'Right', 'Bottom', 'Left'].some(
        (side) =>
          parseFloat(style[`border${side}Width`]) > 0 &&
          style[`border${side}Style`] !== 'none' &&
          style[`border${side}Color`] !== 'rgba(0, 0, 0, 0)'
      ),
      appearance: {
        background: style.backgroundColor,
        color: style.color,
        radius: style.borderRadius,
        shadow: style.boxShadow,
        weight: getComputedStyle(label).fontWeight,
      },
    }
  })
  assert.equal(selection.count, 1, '侧栏应只标记一个当前页面')
  assert(selection.distinct, `${selection.label}应以主题浅底和文字突出`)
  assert.equal(selection.visibleBorder, false, '侧栏选中项不应有描边')
  assert.equal(selection.appearance.shadow, 'none', '侧栏选中项不应有底部粗线')
  assert.equal(selection.appearance.radius, '8px', '侧栏沿用电脑版圆角')
  assert.equal(selection.appearance.weight, '650', '侧栏沿用电脑版选中文字字重')
  return selection
}

export function createDevWorkbenchDensityScenarios({
  assert,
  assertNoHorizontalOverflow,
  outputDir,
  path,
}) {
  return [
    {
      name: 'dev-workbench-sidebar-selection-desktop-light',
      path: '/__dev/product-engineering',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      verify: async (page) => {
        const nav = page.locator('.erp-dev-workspace-nav')
        const primary = nav.getByRole('link', { name: '产品与业务', exact: true })
        const secondary = nav.getByRole('link', { name: '产品能力', exact: true })
        await page.getByRole('heading', { name: '产品与业务', exact: true }).waitFor()
        const initial = await assertSidebarSelection(page, assert)
        assert.equal(initial.label, '产品与业务')
        assert.equal(await nav.getByRole('group', { name: /工作入口$/u }).count(), 4, '四个工作区的子入口始终展开')
        assert.equal(await nav.getByRole('group', { name: '产品与业务工作入口' }).count(), 1)
        const tools = nav.getByRole('button', { name: '页面工具', exact: true })
        await tools.click()
        const utilities = page.getByRole('group', { name: '页面工具', exact: true })
        await utilities.getByRole('button', { name: '复制当前页面链接', exact: true }).waitFor()
        await utilities.getByRole('button', { name: '复制当前页面链接', exact: true }).press('Escape')
        await utilities.waitFor({ state: 'hidden' })
        assert.equal(await tools.evaluate((button) => button === document.activeElement), true, '收起页面工具后恢复入口焦点')
        const originalBox = await secondary.boundingBox()
        await secondary.click()
        await page.getByRole('heading', { name: '产品能力', exact: true }).waitFor()
        const selected = await assertSidebarSelection(page, assert)
        assert.equal(selected.label, '产品能力')
        assert.deepEqual(selected.appearance, initial.appearance, '两级侧栏共用选中外观')
        assert.deepEqual(await secondary.boundingBox(), originalBox, '切换不改变菜单位置或尺寸')
        await secondary.press('Shift+Tab')
        const focus = await primary.evaluate((element) => ({
          visible: element.matches(':focus-visible'),
          outline: getComputedStyle(element).outlineWidth,
        }))
        assert(focus.visible && focus.outline === '2px', '键盘聚焦仍有清晰边框')
        await primary.press('Enter')
        await page.getByRole('heading', { name: '产品与业务', exact: true }).waitFor()
        assert.equal((await assertSidebarSelection(page, assert)).label, '产品与业务')
        await page.goBack()
        await page.getByRole('heading', { name: '产品能力', exact: true }).waitFor()
        assert.equal((await assertSidebarSelection(page, assert)).label, '产品能力')
        await page.reload()
        await page.getByRole('heading', { name: '产品能力', exact: true }).waitFor()
        await assertSidebarSelection(page, assert)
        assert.equal(await nav.getByRole('group', { name: /工作入口$/u }).count(), 4, '刷新后仍完整展开所有工作区')
        for (const label of ['开发资源', '测试验证', '交付运维', '总览', '产品与业务']) {
          await nav.getByRole('link', { name: label, exact: true }).click()
          await page.getByRole('heading', { name: label, exact: true }).waitFor()
          assert.equal(await nav.getByRole('group', { name: /工作入口$/u }).count(), 4, '切换页面不折叠其他工作区')
          assert.equal((await assertSidebarSelection(page, assert)).label, label)
        }
        await assertNoHorizontalOverflow(page, '效能工作台侧栏选中样式')
      },
    },
    {
      name: 'dev-workbench-density-desktop-light',
      path: '/__dev',
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
      beforeNavigate: async (page) => {
        await installPermissionRelationshipMock(page)
        await installDatabaseMigrationFixture(page)
        await page.route('**/__dev/api/qa/coverage{,/snapshot}', (route) => route.fulfill({ json: {
          status: 'missing', message: '当前布局样例没有覆盖报告',
        } }))
      },
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
                      '.erp-dev-workspace-nav a:not([aria-current])'
                    )
                    const idleStyle = getComputedStyle(idle)
                    return (
                      currentStyle.backgroundColor !==
                        idleStyle.backgroundColor &&
                      currentStyle.color !== idleStyle.color
                    )
                  })()
                : true,
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
            assert(geometry.currentRouteDistinct, `${label}当前导航应有主题浅底和文字强调`)
            await assertSidebarSelection(page, assert)
          }
          const headerControls = {
            '/__dev': '.erp-dev-overview-library__toolbar',
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
          if (route === '/__dev/product-core') {
            assert.equal(await root.locator('main > .erp-dev-product-core-toolbar').count(), 1, '能力筛选集中在目录上方')
          }
          if (route === '/__dev/project-skills') {
            const selection = await root
              .locator('.erp-dev-skills__item[aria-pressed="true"]')
              .evaluate((element) => {
                const style = getComputedStyle(element)
                return {
                  marker: style.boxShadow.includes('inset'),
                  size: Number.parseFloat(
                    getComputedStyle(element.querySelector('strong')).fontSize
                  ),
                }
              })
            assert(
              selection.marker && selection.size >= 14,
              'Skill 目录保留当前标记和可读的任务名称'
            )
          }
          if (route === '/__dev/testing') {
            assert.equal(
              await root.locator('.erp-dev-testing-reader__toolbar').count(),
              0,
              '测试执行不应保留空的辅助操作栏'
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
          details: [...element.querySelectorAll('[data-stage-card]')].map((card) => {
            const stage = card.closest('[data-chain-stage]')
            const entry = stage.querySelector('[data-stage-exception]')
            return {
              stage: stage.dataset.chainStage,
              height: card.getBoundingClientRect().height,
              exceptionHeight: entry?.getBoundingClientRect().height || null,
              exceptionGap: entry ? entry.getBoundingClientRect().top - card.getBoundingClientRect().bottom : null,
            }
          }),
        }))
        await fs.writeFile(path.join(outputDir, 'dev-density-chain-geometry.json'), `${JSON.stringify(chain, null, 2)}\n`)
        assert(chain.height <= 760, '桌面总链应在一屏内保留主要结构')
        assert(
          chain.cards.every((height) => height >= 60 && height <= 88),
          '正常入口保留标题与完整点击区域'
        )
        assert(chain.details.every((item) => item.exceptionGap === null || item.exceptionGap >= 8), '异常入口在主按钮外保留间距')
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
          if (name === 'skills') {
            await page.locator('.erp-dev-skills__health').waitFor()
          }
          await page.screenshot({
            path: path.join(outputDir, `workbench-${name}-native.png`),
            fullPage: false,
          })
        }
      },
    },
  ]
}
