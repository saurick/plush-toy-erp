import { ERP_ACCENTS } from '../../src/common/theme/erpAppearance.mjs'
import { getContrastRatio, parseRgb } from './colorAssertions.mjs'
import { waitForFiniteAnimations } from './browserReadiness.mjs'

export function mobileAppearanceScenario({
  assert,
  path,
  outputDir,
  effectiveSession,
}) {
  return {
    name: 'high-fidelity-mobile-appearance',
    path: '/m/boss/tasks',
    auth: 'admin',
    effectiveSession,
    visitsDevWorkbench: true,
    hasTouch: true,
    viewport: { width: 390, height: 844 },
    verify: async (page) => {
      await page.getByTestId('mobile-role-nav-mine').click()
      const settings = page.locator('.mobile-task-display-settings')
      await settings.waitFor()
      assert.equal(
        await settings.getByText('表格密度', { exact: true }).count(),
        0
      )
      assert.equal(await settings.getByRole('radiogroup').count(), 1)
      assert.equal(
        await settings.getByText('表格线条', { exact: true }).count(),
        0
      )
      assert.equal(
        await settings.getByRole('button').count(),
        6,
        '六种颜色直接可选'
      )
      for (const [mode, label] of [
        ['light', '浅色'],
        ['dark', '暗色'],
      ]) {
        await settings.getByText(label, { exact: true }).click()
        for (const [accent, { label: color }] of Object.entries(ERP_ACCENTS)) {
          const button = settings.getByRole('button', {
            name: color,
            exact: true,
          })
          await button.click()
          await page.waitForFunction(
            ({ mode, accent }) =>
              document.documentElement.dataset.erpTheme === mode &&
              document.documentElement.dataset.erpAccent === accent,
            { mode, accent }
          )
          await waitForFiniteAnimations(page)
          assert.equal(await button.getAttribute('aria-pressed'), 'true')
          const paint = await page
            .locator('.mobile-mine-card')
            .first()
            .evaluate((card) => {
              const css = getComputedStyle(card)
              const avatar = getComputedStyle(
                card.querySelector('.mobile-mine-avatar')
              )
              return {
                color: css.color,
                background: css.backgroundColor,
                avatar: avatar.color,
                expected: css.getPropertyValue('--erp-primary-strong'),
              }
            })
          assert.ok(
            getContrastRatio(
              parseRgb(paint.color),
              parseRgb(paint.background)
            ) >= 4.5,
            `${mode}/${color}资料文字可读`
          )
          assert.deepEqual(
            parseRgb(paint.avatar),
            parseRgb(paint.expected),
            `${mode}/${color}头像跟随主题`
          )
          await page.screenshot({
            path: path.join(
              outputDir,
              `mobile-appearance-${mode}-${accent}.png`
            ),
          })
        }
      }
      await page.reload()
      await settings.waitFor()
      assert.equal(
        await settings.getByText('表格密度', { exact: true }).count(),
        0
      )
      assert.equal(
        await settings
          .getByRole('radio', { name: '暗色', exact: true })
          .isChecked(),
        true
      )
      assert.equal(
        await settings
          .getByRole('button', { name: '紫色', exact: true })
          .getAttribute('aria-pressed'),
        'true'
      )
      for (const width of [320, 430]) {
        await page.setViewportSize({ width, height: 844 })
        await waitForFiniteAnimations(page)
        const metric = await settings.evaluate((node) => ({
          width: node.clientWidth,
          scroll: node.scrollWidth,
          colors: [
            ...node.querySelectorAll('.erp-appearance-swatches button'),
          ].map((button) => button.getBoundingClientRect().toJSON()),
        }))
        assert.ok(metric.scroll <= metric.width + 1, JSON.stringify(metric))
        assert.ok(
          metric.colors.every(
            (button) =>
              button.height >= 44 && button.left >= 0 && button.right <= width
          ),
          JSON.stringify(metric)
        )
        assert.equal(
          new Set(metric.colors.map((button) => button.y)).size,
          1,
          '六种主题色保持同一行'
        )
      }
      await page.setViewportSize({ width: 390, height: 844 })
      await settings.getByText('跟系统', { exact: true }).click()
      for (const colorScheme of ['light', 'dark']) {
        await page.emulateMedia({ colorScheme })
        await page.waitForFunction(
          (mode) => document.documentElement.dataset.erpTheme === mode,
          colorScheme
        )
      }
      await settings.getByText('浅色', { exact: true }).click()
      await page.getByTestId('mobile-role-nav-tasks').click()
      assert.equal(
        await page.getByRole('button', { name: /刷新任务|刷新进度/u }).count(),
        0
      )
      await page.getByTestId('mobile-task-list-filter-trigger').click()
      const filters = page.getByRole('dialog', {
        name: '筛选任务',
        exact: true,
      })
      await filters.waitFor()
      await waitForFiniteAnimations(page)
      await page.screenshot({
        path: path.join(outputDir, 'mobile-purple-task-filter.png'),
      })
      const searchBounds = await page.getByRole('searchbox').boundingBox()
      await page.mouse.click(
        searchBounds.x + searchBounds.width / 2,
        searchBounds.y + searchBounds.height / 2
      )
      await filters.waitFor({ state: 'hidden' })
      await waitForFiniteAnimations(page)
      assert.ok(
        await page
          .getByTestId('mobile-task-list-filter-trigger')
          .evaluate((node) => document.activeElement === node),
        '点搜索区域先关闭筛选，不穿透聚焦输入框'
      )
      await page.getByRole('searchbox').click()
      assert.ok(
        await page
          .getByRole('searchbox')
          .evaluate((node) => document.activeElement === node),
        '关闭筛选后再次点击搜索可正常输入'
      )

      for (const [url, surface] of [
        ['/erp/sales/project-orders/sales-orders', '.erp-admin-sider'],
        ['/__dev', '.erp-dev-workspace-nav'],
      ]) {
        await page.setViewportSize({ width: 1440, height: 900 })
        await page.goto(new URL(url, page.url()).href)
        await page.locator(surface).waitFor()
        await waitForFiniteAnimations(page)
        assert.equal(
          await page.locator('html').getAttribute('data-erp-accent'),
          'purple',
          '跨手机、桌面和效能工作台保留外观'
        )
        await page
          .getByRole('button', { name: '外观与密度', exact: true })
          .click()
        const dialog = page.getByRole('dialog', { name: '外观与密度' })
        await dialog.waitFor()
        await waitForFiniteAnimations(page)
        await dialog.getByText('紧凑', { exact: true }).click()
        await dialog.getByText('网格', { exact: true }).click()
        assert.equal(
          await page.locator('html').getAttribute('data-erp-table-lines'),
          'grid'
        )
        assert.equal(
          await page.locator('html').getAttribute('data-erp-density'),
          'compact',
          '桌面和效能工作台仍可设置表格密度'
        )
        assert.equal(
          await dialog
            .getByRole('button', { name: '紫色', exact: true })
            .getAttribute('aria-pressed'),
          'true'
        )
        await page.screenshot({
          path: path.join(
            outputDir,
            url === '/__dev'
              ? 'dev-purple-appearance.png'
              : 'desktop-purple-appearance.png'
          ),
        })
        await dialog.getByRole('button', { name: '完成', exact: true }).click()
      }

      await page.setViewportSize({ width: 390, height: 844 })
      await page.goto(new URL('/m/boss/tasks', page.url()).href)
      await page.getByTestId('mobile-role-nav-mine').click()
      await settings.waitFor()
      assert.equal(
        await settings.getByText('表格密度', { exact: true }).count(),
        0
      )
      await settings.getByRole('button', { name: '蓝色', exact: true }).click()
      await page.reload()
      await settings.waitFor()
      assert.equal(
        await page.locator('html').getAttribute('data-erp-density'),
        'compact',
        '手机切换主题和刷新不覆盖桌面密度偏好'
      )
      assert.equal(await settings.getByRole('radiogroup').count(), 1)
      assert.equal(
        await settings.getByText('表格线条', { exact: true }).count(),
        0
      )
      assert.equal(
        await page.locator('html').getAttribute('data-erp-table-lines'),
        'grid',
        '手机修改主题和刷新不覆盖桌面网格偏好'
      )
      await waitForFiniteAnimations(page)
      await page.screenshot({
        path: path.join(outputDir, 'mobile-display-settings.png'),
      })
    },
  }
}
