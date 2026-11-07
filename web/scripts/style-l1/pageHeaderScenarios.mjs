import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { getNavigationSections } from '../../src/erp/config/seedData.mjs'
import { assertBusinessHeaderCompact } from './businessTableAssertions.mjs'
import { waitForFiniteAnimations } from './browserReadiness.mjs'

async function measureHeaderSpacing(page) {
  const header = page.locator('.erp-business-page-header-card:not(.erp-business-page-header-card--secondary)').first()
  await header.waitFor()
  await waitForFiniteAnimations(page)
  return header.evaluate((node) => {
    const inFlow = (element) => element.getBoundingClientRect().height > 0 &&
      !['absolute', 'fixed'].includes(getComputedStyle(element).position)
    let content = node.nextElementSibling
    while (content && !inFlow(content)) content = content.nextElementSibling
    if (content?.matches('.erp-business-page-layout')) {
      content = [...content.children].find(inFlow)
    }
    const headerBox = node.getBoundingClientRect()
    return {
      title: node.querySelector('h1')?.textContent,
      expectedGap: parseFloat(getComputedStyle(node).getPropertyValue('--erp-page-gap')),
      gap: content ? content.getBoundingClientRect().top - headerBox.bottom : null,
      contentClass: content?.className,
    }
  })
}

export function createPageHeaderScenarios({ customerRuntimeEffectiveSession, assertNoHorizontalOverflow, outputDir }) {
  const headers = [
    ['customers', '/erp/master/partners/customers', '基础资料', 'light'],
    ['workbench', '/erp/dashboard', '工作台', 'light'],
    ['product-core', '/erp/dashboard', '工作台', 'light'],
    ['tasks', '/erp/task-board?mode=todo', '任务管理', 'light'],
    ['tasks', '/erp/task-board?mode=todo', '任务管理', 'dark'],
    ['progress', '/erp/business-dashboard', '进度看板', 'light'],
    ['permissions', '/erp/system/permissions', '权限管理', 'light'],
    ['permissions-narrow', '/erp/system/permissions', '权限管理', 'dark', 390],
    ['customer-config', '/__dev/customer-config', '客户配置', 'light'],
  ].map(([key, route, title, themeMode, width = 1920]) => ({
    name: `page-header-${key}-${themeMode}`,
    path: route,
    ...(route.startsWith('/erp') ? {
      auth: 'admin',
      ...(key === 'product-core' ? {} : { effectiveSession: customerRuntimeEffectiveSession }),
    } : {}),
    themeMode,
    viewport: { width, height: 1080 },
    deviceScaleFactor: 2,
    verify: async (page) => {
      const header = page.locator(route.startsWith('/erp')
        ? '.erp-business-page-header-card:not(.erp-business-page-header-card--secondary)'
        : '.erp-dev-workspace-page > header')
      await header.getByRole('heading', { name: title, exact: true }).waitFor()
      const frame = await header.evaluate((element) => {
        const style = getComputedStyle(element)
        return {
          bottomBorder: Number.parseFloat(style.borderBottomWidth),
          bottomRadius: Number.parseFloat(style.borderBottomLeftRadius),
        }
      })
      assert(frame.bottomBorder >= 1 && frame.bottomRadius >= 8, '独立页头应保留完整边框与圆角')
      const tabs = header.locator('.erp-sliding-tabs, .erp-sliding-segmented, .erp-sliding-tab-list').first()
      if (key === 'product-core') {
        await page.getByRole('heading', { name: '系统功能总览', exact: true }).waitFor()
        assert.equal(await page.locator('.erp-product-core-metric').count(), 0)
        await page.getByRole('button', { name: /^销售订单/ }).click()
        await page.waitForURL('**/erp/sales/project-orders/sales-orders')
        await page.goBack()
        await header.getByRole('heading', { name: title, exact: true }).waitFor()
      } else {
        await tabs.waitFor()
        const titleBox = await header.getByRole('heading', { name: title, exact: true }).boundingBox()
        const tabsBox = await tabs.boundingBox()
        if (width > 1000) {
          assert(tabsBox.x >= titleBox.x + titleBox.width, '宽屏标题与主要页签应在同一页头横向排列')
          assert(Math.abs(tabsBox.y + tabsBox.height / 2 - titleBox.y - titleBox.height / 2) < 8, '标题与页签应垂直居中')
        }
      }
      if (key === 'tasks') {
        assert.equal(await page.locator('.erp-task-board-lane-count').count(), 0)
        assert.equal(await page.locator('.erp-task-progress-rail__value').count(), 3)
        await page.locator('.erp-task-progress-rail [data-lane="exception"]').click()
        await page.waitForURL(/lane=exception/)
        await page.getByRole('button', { name: /^(全部待办|全部分类)$/u, exact: true }).click()
        await page.locator('.erp-task-board-lanes--focused').waitFor()
      }
      assert.equal(await header.locator('.erp-business-page-header-card__stat').count(), 0)
      if (route.startsWith('/erp')) {
        assert.equal(await page.locator('.erp-admin-breadcrumb').count(), 0, '顶栏不重复正文标题')
        await assertBusinessHeaderCompact(page, { scenarioName: key })
      }
      if (key.startsWith('permissions')) {
        await tabs.getByRole('tab', { name: '员工账号', exact: true }).click()
        await page.getByRole('tab', { name: '员工账号', exact: true, selected: true }).waitFor()
        await tabs.getByRole('tab', { name: '岗位设置', exact: true }).click()
        await page.getByRole('tab', { name: '岗位设置', exact: true, selected: true }).waitFor()
        assert.equal(await tabs.locator('.erp-permission-tabs__count').count(), 0)
      }
      await header.getByRole('heading', { name: title, exact: true }).click()
      await assertNoHorizontalOverflow(page)
    },
  }))
  const businessPages = getNavigationSections().flatMap((section) => section.items)
    .filter((entry) => entry.path.startsWith('/erp/') && entry.key !== 'print-center')
    .concat({ key: 'history', path: '/erp/history', label: '历史记录中心' })
  const spacing = [
    { key: 'desktop', width: 1920, themeMode: 'light', pages: businessPages },
    { key: 'narrow-dark', width: 390, themeMode: 'dark', pages: businessPages.filter((entry) => ['shipments', 'inventory', 'finance-payments', 'permission-center'].includes(entry.key)) },
  ].map(({ key, width, themeMode, pages }) => ({
    name: `page-header-business-spacing-${key}`,
    path: pages[0].path,
    auth: 'admin',
    effectiveSession: customerRuntimeEffectiveSession,
    viewport: { width, height: 1080 },
    deviceScaleFactor: 2,
    themeMode,
    verify: async (page) => {
      const results = []
      for (const entry of pages) {
        if (new URL(page.url()).pathname !== entry.path) {
          await page.goto(new URL(entry.path, page.url()).href)
        }
        await page.locator('.erp-business-page-header-card:not(.erp-business-page-header-card--secondary)').first().waitFor()
        await page.waitForFunction(() => [...document.querySelectorAll('.erp-admin-content .ant-spin-spinning')].every((node) => !node.checkVisibility()))
        const metrics = { page: entry.label, path: entry.path, ...await measureHeaderSpacing(page) }
        results.push(metrics)
        console.info(`[style:l1:header-spacing] ${entry.key}: ${metrics.gap}px / ${metrics.expectedGap}px`)
        assert(metrics.gap !== null && Math.abs(metrics.gap - metrics.expectedGap) <= 0.5,
          `页头与首个内容区必须保留一次统一间距：${JSON.stringify(metrics)}`)
        await assertNoHorizontalOverflow(page)
        if (entry.key === 'shipments') {
          await page.screenshot({ path: `${outputDir}/page-header-spacing-shipment-${key}.png`, animations: 'disabled' })
        }
      }
      await writeFile(`${outputDir}/page-header-spacing-${key}.json`, JSON.stringify(results, null, 2))
    },
  }))
  const contentViews = [
    ['products', '/erp/master/products', ['产品基础信息', '产品规格']],
    ['outsourcing', '/erp/purchase/processing-contracts', ['加工合同', '加工明细']],
    ['receivables', '/erp/finance/receivables', ['账款列表', '到期顺序']],
    ['payables', '/erp/finance/payables', ['账款列表', '到期顺序']],
  ].map(([key, route, labels]) => ({
    name: `page-tabs-content-${key}`,
    path: route,
    auth: 'admin',
    effectiveSession: customerRuntimeEffectiveSession,
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
    verify: async (page) => {
      const navigation = page.locator('.erp-business-operation-panel__content-switch').getByRole('tablist')
      await navigation.getByRole('tab', { name: labels[0], exact: true }).waitFor()
      const navigationNode = await navigation.elementHandle()
      const results = []
      for (const width of [1920, 1280, 390]) {
        await page.setViewportSize({ width, height: 1080 })
        for (const label of [labels[1], labels[0]]) {
          await navigation.getByRole('tab', { name: label, exact: true }).click()
          await navigation.getByRole('tab', { name: label, exact: true, selected: true }).waitFor()
          assert.equal(await navigationNode.evaluate((node) => node.isConnected), true, '内容切换保持同一查询区分类条')
          assert.equal(await navigation.getAttribute('class').then((value) => value.includes('erp-navigation-chips')), true)
          assert.equal(await page.locator('.erp-business-page-header-card--secondary').count(), 0, '页内分类不在模块页头下重复创建标题卡')
          await page.locator('.erp-business-operation-panel__search input').first().waitFor()
          const metrics = await measureHeaderSpacing(page)
          assert.ok(metrics.gap !== null && Math.abs(metrics.gap - metrics.expectedGap) <= 0.5, `${key}/${label}: ${JSON.stringify(metrics)}`)
          await assertNoHorizontalOverflow(page)
          results.push({ width, label, ...metrics })
        }
        if (width === 1920 || width === 390) {
          await page.screenshot({ path: `${outputDir}/page-tabs-${key}-${width}.png` })
        }
        if (width === 1920) {
          const heading = await page.locator('.erp-business-page-header-card:not(.erp-business-page-header-card--secondary)').first().boundingBox()
          const command = await page.locator('.erp-business-operation-panel__command').first().boundingBox()
          await page.screenshot({ path: `${outputDir}/page-tabs-${key}-header.png`, clip: { x: heading.x, y: heading.y, width: heading.width, height: command.y + command.height - heading.y } })
        }
      }
      await writeFile(`${outputDir}/page-tabs-${key}.json`, JSON.stringify(results, null, 2))
    },
  }))
  const primaryNavigation = {
    name: 'page-tabs-independent-entries',
    path: '/erp/dashboard',
    auth: 'admin',
    effectiveSession: customerRuntimeEffectiveSession,
    viewport: { width: 1920, height: 1080 },
    verify: async (page) => {
      const results = []
      for (const [route, selector, labels] of [
        ['/erp/dashboard', '.erp-business-page-header-card', ['待办', '业务汇总']],
        ['/erp/task-board?mode=todo', '.erp-task-management-header', ['待我处理', '待我审批', '流程跟踪']],
        ['/erp/business-dashboard', '.erp-business-page-header-card', ['订单交付', '生产执行', '经营统计']],
        ['/erp/production/progress', '.erp-business-module-header', ['生产订单', '生产执行', '生产记录', '异常处理']],
        ['/erp/finance/payments', '.erp-business-page-header-card', ['应收', '应付', '收付款', '对账', '发票']],
        ['/erp/system/permissions', '.erp-business-page-header-card', ['岗位设置', '员工账号', '岗位导航']],
        ['/erp/help-center', '.erp-help-navigation-header', ['操作图解', '业务使用手册']],
      ]) {
        await page.goto(new URL(route, page.url()).href)
        for (const label of labels) {
          const tab = page.getByRole('tab', { name: label, exact: true })
          await tab.waitFor()
          assert.equal(await tab.evaluate((node, headerSelector) => Boolean(node.closest(headerSelector)), selector), true, `${route}: ${label} 属于标题区的独立业务入口`)
        }
        results.push({ route, labels })
      }
      await writeFile(`${outputDir}/page-tabs-independent.json`, JSON.stringify(results, null, 2))
    },
  }
  return [...headers, ...spacing, ...contentViews, primaryNavigation]
}
