import { writeFile } from 'node:fs/promises'
import { waitForFiniteAnimations } from './browserReadiness.mjs'

const BUSINESS_ROUTES = [
  'dashboard',
  'task-board',
  'business-dashboard',
  'master/partners/customers',
  'master/partners/suppliers',
  'master/materials',
  'master/products',
  'sales/project-orders/sales-orders',
  'purchase/accessories',
  'purchase/material-bom',
  'purchase/processing-contracts',
  'production/orders',
  'production/progress',
  'production/scheduling',
  'production/exceptions',
  'production/quality-inspections',
  'warehouse/inbound',
  'warehouse/inventory',
  'warehouse/shipments',
  'warehouse/shipping-release',
  'warehouse/outbound',
  'finance/reconciliation',
  'finance/payments',
  'finance/payables',
  'finance/receivables',
  'finance/invoices',
  'system/permissions',
  'system/audit-logs',
  'history',
  'help-center',
  'print-center',
]

export function createGlobalSurfaceScenarios({
  assert,
  customerRuntimeEffectiveSession,
  outputDir,
  path,
}) {
  const pages = ['light', 'dark'].map((themeMode) => ({
    name: `global-surfaces-${themeMode}`,
    path: '/erp/dashboard',
    auth: 'admin',
    effectiveSession: customerRuntimeEffectiveSession,
    themeMode,
    viewport: { width: 1440, height: 900 },
    verify: async (page) => {
      const report = []
      for (const route of BUSINESS_ROUTES) {
        if (!page.url().endsWith(`/erp/${route}`)) {
          await page.goto(new URL(`/erp/${route}`, page.url()).href)
        }
        await page.locator('.erp-admin-outlet').waitFor()
        await page.waitForLoadState('networkidle')
        await waitForFiniteAnimations(page)
        const result = await page.evaluate(() => {
          const root = document.querySelector('.erp-admin-outlet')
          const paint = (node) => {
            const css = getComputedStyle(node)
            const box = node.getBoundingClientRect()
            return {
              tag: node.tagName,
              class: typeof node.className === 'string' ? node.className : '',
              background: css.backgroundColor,
              image: css.backgroundImage,
              color: css.color,
              radius: css.borderRadius,
              padding: css.padding,
              borderWidth: css.borderWidth,
              overflow: css.overflow,
              paper: Boolean(
                node.closest(
                  '.erp-template-guide__thumbnail, .erp-print-center-paper-preview'
                )
              ),
              box: { x: box.x, y: box.y, width: box.width, height: box.height },
            }
          }
          const visible = [...root.querySelectorAll('*')].filter((node) => {
            const r = node.getBoundingClientRect()
            const css = getComputedStyle(node)
            return (
              r.width > 15 &&
              r.height > 10 &&
              r.bottom > 0 &&
              r.y < innerHeight &&
              r.right > 0 &&
              r.x < innerWidth &&
              css.visibility !== 'hidden' &&
              css.display !== 'none'
            )
          })
          const strayLight = visible.map(paint).filter((item) => {
            if (item.paper) return false
            const channels = item.background.match(
              /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/
            )
            return (
              channels &&
              channels.slice(1, 4).every((value) => Number(value) >= 225) &&
              (channels[4] === undefined || Number(channels[4]) > 0.7)
            )
          })
          const surfaces = [
            ...root.querySelectorAll(
              '.erp-business-page-header-card,.erp-business-operation-panel,.erp-business-data-table-card,' +
                '.erp-dashboard-surface,.erp-task-board-lane,.erp-permission-section,.erp-audit-command,' +
                '.erp-business-visualization,.erp-permission-tabs>.ant-tabs-nav'
            ),
          ].map(paint)
          const navigationSurfaces = [
            ...root.querySelectorAll(
              '.erp-workbench-view-toolbar, .erp-progress-controls, ' +
                '.erp-permission-toolbar, .erp-business-view-surface__toolbar, ' +
                '.erp-business-module-tabs, .erp-business-page-navigation'
            ),
          ].map(paint)
          const nestedNavigation = [
            ...root.querySelectorAll(
              '.erp-operational-visual-toolbar, .erp-operational-visual-toolbar__secondary'
            ),
          ].map((node) => {
            let parent = node.parentElement
            let background = 'rgba(0, 0, 0, 0)'
            while (parent && background === 'rgba(0, 0, 0, 0)') {
              background = getComputedStyle(parent).backgroundColor
              parent = parent.parentElement
            }
            return { ...paint(node), parentBackground: background }
          })
          const navigationAlignment = [
            ...root.querySelectorAll(
              '.erp-workbench-view-toolbar, .erp-progress-toolbar, .erp-permission-toolbar'
            ),
          ].map((node) => {
            const box = node.getBoundingClientRect()
            const control = node.firstElementChild.getBoundingClientRect()
            const css = getComputedStyle(node)
            return {
              class: node.className,
              inset: control.x - box.x,
              contentInset: parseFloat(css.paddingLeft) + parseFloat(css.borderLeftWidth),
            }
          })
          const topNavigation = [
            ...root.querySelectorAll(
              '.erp-business-module-tabs, .erp-workbench-view-toolbar .erp-sliding-segmented, ' +
                '.erp-progress-toolbar .erp-sliding-segmented, .erp-permission-tabs'
            ),
          ].map((node) => {
            const tabs = node.classList.contains('erp-sliding-tabs')
            const segmented = node.classList.contains('erp-sliding-segmented')
            const group = tabs
              ? node.querySelector('.ant-tabs-nav-list')
              : segmented
                ? node.querySelector('.ant-segmented-group')
                : node
            const track = tabs ? group : node
            const selected = group.querySelector(
              '.ant-tabs-tab-active, .erp-segmented-item-selected, [role="tab"][aria-selected="true"]'
            )
            const label =
              selected.querySelector(
                '.ant-tabs-tab-btn, .ant-segmented-item-label'
              ) || selected
            const trackStyle = getComputedStyle(track)
            const sliderStyle = getComputedStyle(group, '::before')
            const labelStyle = getComputedStyle(label)
            return {
              background: trackStyle.backgroundColor,
              border: trackStyle.border,
              radius: trackStyle.borderRadius,
              height: track.getBoundingClientRect().height,
              padding: trackStyle.padding,
              selectedBackground: sliderStyle.backgroundColor,
              selectedRadius: sliderStyle.borderRadius,
              selectedShadow: sliderStyle.boxShadow,
              selectedHeight: selected.getBoundingClientRect().height,
              fontSize: labelStyle.fontSize,
              fontWeight: labelStyle.fontWeight,
              color: labelStyle.color,
            }
          })
          const tableNavigationInsets = [
            ...root.querySelectorAll(
              '.erp-business-data-table-card .ant-tabs-nav-list, ' +
                '.erp-business-page-navigation .ant-tabs-nav-list, ' +
                '.erp-business-page-layout > .erp-sliding-tabs .ant-tabs-nav-list'
            ),
          ].map((node) => {
            const surface =
              node.closest('.erp-business-data-table-card') ||
              node.closest('.erp-business-page-navigation') ||
              node.closest('.erp-business-page-layout > .erp-sliding-tabs')
            const box = surface.getBoundingClientRect()
            const control = node.getBoundingClientRect()
            const css = getComputedStyle(surface)
            return {
              labels: node.innerText,
              left: control.left - box.left - parseFloat(css.borderLeftWidth),
              top: control.top - box.top - parseFloat(css.borderTopWidth),
            }
          })
          const tokenColor = (name) => {
            const hex = getComputedStyle(root)
              .getPropertyValue(name)
              .trim()
              .replace('#', '')
            const full =
              hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex
            return `rgb(${[0, 2, 4].map((index) => parseInt(full.slice(index, index + 2), 16)).join(', ')})`
          }
          const corners = [
            ...root.querySelectorAll(
              '.erp-business-page-header-card, .erp-business-data-table-card'
            ),
          ].map((node) => {
            const box = node.getBoundingClientRect()
            const hit = document.elementFromPoint(box.left + 1, box.top + 1)
            const outside = hit && !node.contains(hit)
            let background = 'rgba(0, 0, 0, 0)'
            for (
              let parent = hit;
              parent && background === 'rgba(0, 0, 0, 0)';
              parent = parent.parentElement
            ) {
              background = getComputedStyle(parent).backgroundColor
            }
            return { class: node.className, outside, background }
          })
          return {
            title: root.innerText.slice(0, 160),
            strayLight,
            surfaces,
            navigationSurfaces,
            nestedNavigation,
            navigationAlignment,
            topNavigation,
            tableNavigationInsets,
            corners,
            surfaceColor: tokenColor('--erp-surface-bg'),
            pageColor: tokenColor('--erp-page-bg'),
            theme: document.documentElement.dataset.erpTheme,
            paper: visible
              .filter((node) => node.matches('.erp-material-contract-paper'))
              .map(paint),
          }
        })
        assert.equal(result.theme, themeMode, `${route} 使用指定主题`)
        assert.ok(
          result.title.length > 20 &&
            !/页面不存在|页面加载失败/.test(result.title),
          `${route} 内容已加载`
        )
        for (const surface of result.surfaces) {
          assert.equal(
            surface.background,
            result.surfaceColor,
            `${route}: ${surface.class} 使用内容面`
          )
        }
        for (const surface of result.navigationSurfaces) {
          assert.equal(
            surface.background,
            result.surfaceColor,
            `${route}: ${surface.class} 使用完整操作区内容面`
          )
          assert.equal(surface.padding, '10px 12px')
          assert.equal(surface.radius, '10px')
          assert.equal(surface.borderWidth, '1px')
        }
        for (const surface of result.nestedNavigation) {
          assert.equal(
            surface.background,
            'rgba(0, 0, 0, 0)',
            `${route}: ${surface.class} 在已有内容面内不重复铺底`
          )
          assert.equal(
            surface.parentBackground,
            result.surfaceColor,
            `${route}: ${surface.class} 由外层内容面承载`
          )
        }
        for (const navigation of result.navigationAlignment) {
          assert.ok(
            Math.abs(navigation.inset - navigation.contentInset) < 1,
            `${route}: ${navigation.class} 与操作区内部左边界对齐`
          )
        }
        for (const navigation of result.topNavigation) {
          assert.equal(navigation.height, 38, `${route}: 顶部切换整组高度`)
          assert.equal(
            navigation.selectedHeight,
            30,
            `${route}: 顶部切换选项高度`
          )
          assert.equal(navigation.radius, '9px')
          assert.equal(navigation.selectedRadius, '6px')
          assert.equal(navigation.padding, '3px')
          assert.equal(navigation.fontSize, '14px')
          assert.notEqual(navigation.background, navigation.selectedBackground)
          assert.notEqual(navigation.background, result.pageColor)
          const first = report.find((item) => item.topNavigation.length)
            ?.topNavigation[0]
          if (first) {
            assert.deepEqual(
              navigation,
              first,
              `${route}: 与工作台共用底轨、选中背景、边框、圆角、尺寸和文字样式`
            )
          }
        }
        for (const navigation of result.tableNavigationInsets) {
          assert.ok(
            navigation.left >= 11.5 && navigation.top >= 9.5,
            `${route}: 页签与卡片左上边缘保留阅读间距 ${JSON.stringify(navigation)}`
          )
        }
        for (const corner of result.corners) {
          assert.ok(corner.outside, `${route} 卡片内部不能越过圆角绘制`)
          assert.equal(
            corner.background,
            result.pageColor,
            `${route} 圆角外沿用页面底色`
          )
        }
        for (const paper of result.paper) {
          assert.equal(
            paper.background,
            'rgb(255, 255, 255)',
            '主题切换保留真实打印纸面白底'
          )
        }
        report.push({ route, ...result })
        if (
          [
            'dashboard',
            'business-dashboard',
            'production/orders',
            'finance/reconciliation',
            'task-board',
            'master/products',
            'purchase/processing-contracts',
            'warehouse/inventory',
            'finance/payments',
            'sales/project-orders/sales-orders',
            'system/permissions',
          ].includes(route)
        ) {
          await page.screenshot({
            path: path.join(
              outputDir,
              `global-surfaces-${themeMode}-${route.replaceAll('/', '-')}.png`
            ),
          })
        }
      }
      await writeFile(
        path.join(outputDir, `global-surfaces-${themeMode}.json`),
        JSON.stringify(report, null, 2)
      )
      assert.equal(report.length, BUSINESS_ROUTES.length)
      if (themeMode === 'dark') {
        const failures = report.filter((item) => item.strayLight.length)
        assert.deepEqual(
          failures.map((item) => ({
            route: item.route,
            surfaces: item.strayLight.map((node) => ({
              class: node.class,
              background: node.background,
            })),
          })),
          [],
          '暗色页面不残留浅色背景块'
        )
      }
    },
  }))
  const overlays = ['light', 'dark'].map((themeMode) => ({
    name: `global-surface-overlays-${themeMode}`,
    path: '/erp/master/materials',
    auth: 'admin',
    effectiveSession: customerRuntimeEffectiveSession,
    themeMode,
    viewport: { width: 1440, height: 900 },
    verify: async (page) => {
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 900 })
        const trigger = page
          .locator('.erp-business-operation-panel__actions')
          .getByRole('button', { name: /列设置/u })
          .first()
        await trigger.click()
        const dialog = page.getByRole('dialog', { name: /^列设置/u })
        await dialog.waitFor()
        await waitForFiniteAnimations(page)
        const metrics = await dialog.evaluate((node) => {
          const container = node.querySelector('.ant-modal-content')
          const box = node.getBoundingClientRect()
          const css = getComputedStyle(container)
          const color = (token) => {
            const hex = css.getPropertyValue(token).trim().replace('#', '')
            const full =
              hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex
            return `rgb(${[0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)).join(', ')})`
          }
          return {
            expected: color('--erp-surface-bg'),
            rowBackground: color('--erp-surface-bg-soft'),
            background: css.backgroundColor,
            overflow: css.overflow,
            inViewport:
              box.left >= 0 &&
              box.right <= innerWidth &&
              box.top >= 0 &&
              box.bottom <= innerHeight,
            rows: [
              ...node.querySelectorAll('.erp-business-column-order-modal__row'),
            ].map((row) => getComputedStyle(row).backgroundColor),
          }
        })
        assert.ok(metrics.inViewport, `${width}px 列设置完整可见`)
        assert.equal(metrics.overflow, 'hidden', '弹窗内容按外层圆角裁切')
        assert.equal(
          metrics.background,
          metrics.expected,
          '列设置弹窗使用主题内容面'
        )
        assert.ok(metrics.rows.length > 0, '已加载可设置列')
        for (const color of metrics.rows) {
          assert.equal(
            color,
            metrics.rowBackground,
            '列设置条目在明暗主题中均使用弱分组底色'
          )
        }
        await page.screenshot({
          path: path.join(
            outputDir,
            `global-surface-columns-${themeMode}-${width}.png`
          ),
        })
        await page.keyboard.press('Escape')
        await dialog.waitFor({ state: 'hidden' })
        assert.ok(
          await trigger.evaluate((node) => node === document.activeElement),
          '关闭列设置恢复原触发按钮焦点'
        )

        const filter = page.locator(
          '.erp-business-operation-panel button[aria-haspopup="dialog"]'
        )
        await filter.click()
        const filterDialog = page.getByRole('dialog', { name: '筛选条件' })
        await filterDialog.waitFor()
        await waitForFiniteAnimations(page)
        const filterSurface = await filterDialog.evaluate((node) => {
          const surface = node.closest('.ant-popover-inner')
          const css = getComputedStyle(surface)
          const box = surface.getBoundingClientRect()
          return {
            background: css.backgroundColor,
            inViewport: box.left >= 0 && box.right <= innerWidth,
          }
        })
        assert.ok(filterSurface.inViewport, `${width}px 筛选浮层没有越出屏幕`)
        assert.notEqual(
          filterSurface.background,
          'rgba(0, 0, 0, 0)',
          '浮层背景不透出底层内容'
        )
        if (themeMode === 'dark') {
          assert.notEqual(
            filterSurface.background,
            'rgb(255, 255, 255)',
            '暗色筛选浮层不残留白底'
          )
        }
        await page.keyboard.press('Escape')
        await filterDialog.waitFor({ state: 'hidden' })
      }
    },
  }))
  return [...pages, ...overlays]
}
