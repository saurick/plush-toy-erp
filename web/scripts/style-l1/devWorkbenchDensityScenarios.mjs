import fs from 'node:fs/promises'
import {
  DEV_PAGE_TITLE_BY_ROUTE,
  DEV_SECONDARY_NAV_ITEMS,
  DEV_WORKSPACE_NAV_ITEMS,
} from '../../src/dev-workbench/config/devRoutes.mjs'
import { installPermissionRelationshipMock } from './permissionRelationshipScenarios.mjs'
import { installDatabaseMigrationFixture } from './devDeliveryWorkspaceScenarios.mjs'
import { createDataPreparationBrowserFixture, installDataPreparationBrowserRoutes } from './devDataPreparationScenarios.mjs'
import { assertFulfillmentChainGeometry } from './fulfillmentChainAssertions.mjs'
import { verifyMobileNavigationMotion as verifySlidingMotion } from './slidingMotionAssertions.mjs'
import { createDevDisclosureScenarios } from './devDisclosureScenarios.mjs'
import { assertPlainDirectory, createDevWorkbenchDirectoryScenarios } from './devWorkbenchDirectoryScenarios.mjs'

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
      name: 'dev-workbench-action-placement-desktop-light',
      path: '/__dev/customer-config?customer=yoyoosun',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      beforeNavigate: async (page) => {
        await installPermissionRelationshipMock(page)
        await installDatabaseMigrationFixture(page)
        await installDataPreparationBrowserRoutes(page, createDataPreparationBrowserFixture())
        await page.route('**/__dev/api/qa/coverage{,/snapshot}', (route) => route.fulfill({ json: {
          status: 'missing', message: '布局验证不包含覆盖报告',
        } }))
      },
      verify: async (page) => {
        const routes = Object.keys(DEV_PAGE_TITLE_BY_ROUTE)
        const withNavigation = new Set([
          '/__dev', '/__dev/development-resources', '/__dev/delivery',
          '/__dev/customer-config', '/__dev/testing', '/__dev/business-chain-audit',
          '/__dev/quality-gates', '/__dev/data-preparation', '/__dev/drill-recovery',
          '/__dev/integration', '/__dev/ui-design', '/__dev/status-flows',
          '/__dev/version-center', '/__dev/database-migration',
        ])
        const measurements = []
        for (const route of routes) {
          await page.goto(new URL(route, page.url()).href)
          const root = page.locator('.erp-dev-workspace-page, .erp-dev-version-guide-page').first()
          await root.locator(':scope > header h1').waitFor()
          if (route === '/__dev/data-preparation') {
            await page.getByRole('tablist', { name: '测试数据视图', exact: true }).waitFor()
          }
          for (const width of [1024, 1280, 1920]) {
            await page.setViewportSize({ width, height: 1080 })
            const geometry = await root.evaluate((element) => {
              const visible = (node) => node.getBoundingClientRect().height > 0
              const header = element.querySelector(':scope > header')
              const headerBox = header.getBoundingClientRect()
              const titleBox = header.querySelector('.erp-dev-page-header__title').getBoundingClientRect()
              const navigation = [...header.querySelectorAll('.erp-dev-page-header__navigation [role="tablist"]')].filter(visible)
              const tools = [...header.querySelectorAll(':scope > .erp-dev-workbench-tools')].filter(visible)
              return {
                sharedHeaders: element.querySelectorAll(':scope > .erp-dev-page-header').length,
                separateNavigation: [...element.querySelectorAll(':scope > .erp-dev-workbench-toolbar [role="tablist"]')].filter(visible).length,
                headerHeight: headerBox.height,
                headerRightGap: element.getBoundingClientRect().right - headerBox.right,
                pagePaddingRight: parseFloat(getComputedStyle(element).paddingRight),
                titleFontSize: getComputedStyle(header.querySelector('h1')).fontSize,
                navigation: navigation.map((nav) => {
                  const box = nav.getBoundingClientRect()
                  const sameRow = Math.abs(box.top + box.height / 2 - titleBox.top - titleBox.height / 2) <= 1
                  return { label: nav.getAttribute('aria-label'), sameRow, left: box.left - headerBox.left, gap: box.left - titleBox.right, top: box.top - headerBox.top, bottom: headerBox.bottom - box.bottom }
                }),
                tools: tools.map((node) => ({ label: node.textContent.trim(), right: headerBox.right - node.getBoundingClientRect().right })),
                start: (() => {
                  const button = element.querySelector('.erp-dev-customer-start > button')
                  const title = element.querySelector('.erp-dev-customer-start h2')
                  if (!button || !title) return null
                  const actionBox = button.getBoundingClientRect()
                  const titleBox = title.getBoundingClientRect()
                  return { left: actionBox.left - titleBox.left, below: actionBox.top >= titleBox.bottom }
                })(),
              }
            })
            assert.equal(geometry.sharedHeaders, 1, `${route}使用一个共享页头`)
            assert(Math.abs(geometry.headerRightGap - geometry.pagePaddingRight) <= 1, `${route}页头铺满内容区，不继承旧宽度上限`)
            assert.equal(geometry.titleFontSize, '18px', `${route}沿用共享标题字号`)
            assert.equal(geometry.separateNavigation, 0, `${route}一级页签合并到页头`)
            assert.equal(geometry.navigation.length, withNavigation.has(route) ? 1 : 0, `${route}保留原有一级导航`)
            if (width === 1920) {
              const maximumHeight = ['/__dev/version-center', '/__dev/docs'].includes(route) ? 96 : 52
              assert(geometry.headerHeight <= maximumHeight, `${route}宽屏页头保持紧凑：${geometry.headerHeight}px`)
            }
            if (['/__dev/quality-gates', '/__dev/data-preparation', '/__dev/drill-recovery', '/__dev/version-center', '/__dev/database-migration', '/__dev/project-skills', '/__dev/permission-relationships'].includes(route)) {
              assert.equal(geometry.tools.length, 1, `${route}保留可见的辅助工具区`)
            }
            for (const nav of geometry.navigation) {
              assert(nav.top >= 4 && nav.bottom >= 4, `${route}导航完整位于页头内：${JSON.stringify(nav)}`)
              if (nav.sameRow) assert(nav.gap >= 8 && nav.gap <= 20, `${route}导航紧接标题：${JSON.stringify(nav)}`)
              else assert(nav.left >= 12 && nav.left <= 14, `${route}换行后从页头左侧开始：${JSON.stringify(nav)}`)
            }
            for (const tools of geometry.tools) {
              assert(tools.right >= 12 && tools.right <= 14, `${route}辅助工具保留在右侧：${JSON.stringify(tools)}`)
            }
            if (geometry.start) {
              assert(Math.abs(geometry.start.left) <= 1 && geometry.start.below, '开始检查配置在说明下方左对齐')
            }
            measurements.push({ route, width, ...geometry })
            await assertNoHorizontalOverflow(page, `${route} ${width}px 操作布局`)
          }
          if (withNavigation.has(route)) {
            const nav = root.locator('.erp-dev-page-header__navigation [role="tablist"]')
            const current = await nav.getByRole('tab', { selected: true }).innerText()
            const other = nav.locator('[role="tab"]:not([aria-selected="true"]):not([disabled])').first()
            const strip = await nav.elementHandle()
            const before = await nav.boundingBox()
            await other.click()
            assert(await strip.evaluate((node) => node.isConnected), `${route}切换保留原页签条`)
            await nav.getByRole('tab', { name: current, exact: true }).click()
            await nav.getByRole('tab', { name: current, exact: true, selected: true }).waitFor()
            const after = await nav.boundingBox()
            for (const key of ['x', 'y', 'width', 'height']) assert(Math.abs(before[key] - after[key]) <= 1, `${route}往返恢复导航${key}`)
            await assertNoHorizontalOverflow(page, `${route}页签往返`)
          }
          if (route === '/__dev/customer-config') {
            const nav = page.getByRole('tablist', { name: '客户配置工作任务', exact: true })
            const strip = await nav.elementHandle()
            const before = await nav.boundingBox()
            await page.screenshot({ path: path.join(outputDir, 'workbench-customer-config-4k.png') })
            await page.getByRole('button', { name: '开始检查配置', exact: true }).click()
            await nav.getByRole('tab', { name: /检查配置/u, selected: true }).waitFor()
            await nav.getByRole('tab', { name: '配置总览', exact: true }).click()
            await nav.getByRole('tab', { name: '配置总览', exact: true, selected: true }).waitFor()
            assert(await strip.evaluate((node) => node.isConnected), '往返切换保留同一页签条')
            const after = await nav.boundingBox()
            for (const key of ['x', 'y', 'width', 'height']) assert(Math.abs(before[key] - after[key]) <= 1, `往返切换保持页签${key}`)
          }
        }
        await fs.writeFile(path.join(outputDir, 'workbench-action-placement.json'), JSON.stringify(measurements, null, 2))
        await page.goto(new URL('/__dev/customer-config?customer=unknown', page.url()).href)
        await page.getByRole('heading', { name: '客户配置', exact: true }).waitFor()
        assert.equal(await page.locator('.erp-dev-customer-page > header [role="tablist"]').count(), 0, '无效客户不留下空的任务导航栏')
        await assertNoHorizontalOverflow(page, '无效客户配置')
      },
    },
    ...createDevWorkbenchDirectoryScenarios({ assert, assertNoHorizontalOverflow, outputDir, path }),
    ...createDevDisclosureScenarios({ assert, assertNoHorizontalOverflow, outputDir, path }),
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
        assert.equal(await nav.getByRole('button', { name: '页面工具', exact: true }).count(), 0)
        assert.equal(await page.getByRole('group', { name: '页面工具', exact: true }).count(), 0)
        await nav.getByRole('button', { name: '外观与密度', exact: true }).waitFor()
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
                const toolbar = header.querySelector('.erp-dev-page-header__navigation')
                const nav = toolbar?.querySelector('[role="tablist"]')
                if (!nav) return null
                return { height: nav.getBoundingClientRect().height }
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
          assert(geometry.themedHeader, `${label}页头沿用主题内容面`)
          if (geometry.hasExactRoute) {
            assert(geometry.currentRouteDistinct, `${label}当前导航应有主题浅底和文字强调`)
            await assertSidebarSelection(page, assert)
          }
          const headerControls = {
            '/__dev/project-skills': '.erp-dev-skills__health',
          }[route]
          if (headerControls) {
            assert.equal(
              await root.locator(`:scope > header ${headerControls}`).count(),
              1,
              `${label}的检查状态应与标题同组`
            )
          }
          if (route === '/__dev/product-core') {
            assert.equal(await root.locator('header > .erp-dev-product-core-toolbar').count(), 1, '能力筛选与标题共用页头')
          }
          if (route === '/__dev/project-skills') {
            await assertPlainDirectory(page, '.erp-dev-skills__item', assert)
            const size = await root
              .locator('.erp-dev-skills__item[aria-pressed="true"]')
              .evaluate((element) => Number.parseFloat(
                getComputedStyle(element.querySelector('strong')).fontSize
              ))
            assert(
              size >= 14,
              'Skill 目录保留可读的任务名称'
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
            assert(geometry.toolbar, `${label}的页签应并入共享页头`)
            assert(
              geometry.toolbar.height <= 52,
              `${label}合并后的操作栏应保持一行`
            )
            if (route === '/__dev/database-migration') {
              assert.equal(await root.locator('header [aria-label="数据库迁移视图"]').count(), 1, '迁移页签在页头，版本事实继续在内容区可见')
            } else {
              assert(geometry.headerContext, '安全与恢复的客户范围与标题同组')
            }
            await verifySlidingMotion(
              page,
              assert,
              route === '/__dev/drill-recovery'
                ? '.erp-dev-page-header [aria-label="安全与恢复任务"]'
                : '.erp-dev-page-header__navigation [role="tablist"]',
              1
            )
            await verifySlidingMotion(
              page,
              assert,
              route === '/__dev/drill-recovery'
                ? '.erp-dev-page-header [aria-label="安全与恢复任务"]'
                : '.erp-dev-page-header__navigation [role="tablist"]',
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
        await page
          .getByRole('textbox', { name: '搜索全部开发工具' }).press('Enter')
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
          chain.cards.every((height) => height >= 52 && height <= 88),
          '正常入口遵循 52px 最小高度，保留标题与完整点击区域'
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
