import { getContrastRatio, parseRgb } from './colorAssertions.mjs'
import { mobileAppearanceScenario } from './mobileAppearanceScenario.mjs'
import { createMobileSurfaceScenarios } from './mobileSurfaceScenarios.mjs'
import { createGlobalSurfaceScenarios } from './globalSurfaceScenarios.mjs'

export function createHighFidelityScenarios({
  assert,
  customerRuntimeEffectiveSession,
  outputDir,
  path,
  assertNoHorizontalOverflow,
}) {
  const shot = (page, name) =>
    page.screenshot({ path: path.join(outputDir, `${name}.png`) })
  const settle = (page) =>
    page.evaluate(async () => {
      await document.fonts.ready
      await Promise.all(
        document
          .getAnimations()
          .filter(
            (animation) => animation.effect?.getTiming().iterations !== Infinity
          )
          .map((animation) => animation.finished.catch(() => {}))
      )
    })
  return [
    ...createGlobalSurfaceScenarios({
      assert,
      customerRuntimeEffectiveSession,
      outputDir,
      path,
    }),
    ...createMobileSurfaceScenarios({
      assert,
      assertNoHorizontalOverflow,
      customerRuntimeEffectiveSession,
      outputDir,
      path,
    }),
    mobileAppearanceScenario({
      assert,
      path,
      outputDir,
      effectiveSession: customerRuntimeEffectiveSession,
    }),
    {
      name: 'high-fidelity-desktop-appearance',
      path: '/erp/sales/project-orders/sales-orders',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        const row = page
          .locator('.erp-business-data-table-card tbody tr[data-row-key]')
          .first()
        await row.waitFor()
        await settle(page)
        const dimensions = await page.evaluate(() => {
          const rect = (selector) => {
            const b = document.querySelector(selector).getBoundingClientRect()
            return { x: b.x, y: b.y, w: b.width, h: b.height, bottom: b.bottom }
          }
          return {
            sidebar: rect('.erp-admin-sider'),
            header: rect('.erp-admin-header'),
            table: rect('.erp-business-data-table-card'),
            row: rect('tbody tr[data-row-key]'),
            search: rect(
              '.erp-business-operation-panel__search .ant-input-affix-wrapper'
            ),
          }
        })
        assert.equal(dimensions.sidebar.w, 206, '高保真侧栏宽度')
        assert.equal(dimensions.header.h, 48, '高保真顶栏高度')
        assert.equal(dimensions.search.h, 34, '桌面检索控件高度')
        assert.equal(dimensions.row.h, 52, '标准行密度')
        assert.ok(
          dimensions.table.y <= 230 && dimensions.table.bottom >= 886,
          `表格占据主体并将分页放在底部：${JSON.stringify(dimensions)}`
        )
        await shot(page, 'high-fidelity-sales-standard')

        const filter = page.locator(
          '.erp-business-operation-panel button[aria-haspopup="dialog"]'
        )
        await filter.click()
        const filterDialog = page.getByRole('dialog', { name: '筛选条件' })
        await filterDialog.waitFor()
        await filterDialog
          .getByRole('button', { name: '完成', exact: true })
          .focus()
        await page.keyboard.press('Tab')
        assert.ok(
          await filterDialog.evaluate((el) =>
            el.contains(document.activeElement)
          ),
          '筛选键盘焦点留在当前层'
        )
        await page.keyboard.press('Escape')
        await filterDialog.waitFor({ state: 'hidden' })
        assert.ok(
          await filter.evaluate((el) => el === document.activeElement),
          '关闭筛选恢复触发焦点'
        )

        const appearanceTrigger = page.getByRole('button', {
          name: '外观与密度',
          exact: true,
        })
        await appearanceTrigger.click()
        const appearance = page.getByRole('dialog', { name: '外观与密度' })
        await appearance.waitFor()
        for (const [label, key] of [
          ['绿色', 'green'],
          ['黄色', 'yellow'],
          ['粉色', 'pink'],
          ['橙色', 'orange'],
          ['紫色', 'purple'],
          ['蓝色', 'blue'],
        ]) {
          await appearance
            .getByRole('button', { name: label, exact: true })
            .click()
          await page.waitForFunction(
            (accent) => document.documentElement.dataset.erpAccent === accent,
            key
          )
          await settle(page)
          const paint = await page
            .getByRole('button', { name: /新建订单/ })
            .evaluate((element) => {
              const s = getComputedStyle(element)
              return { foreground: s.color, background: s.backgroundColor }
            })
          assert.ok(
            getContrastRatio(
              parseRgb(paint.foreground),
              parseRgb(paint.background)
            ) >= 4.5,
            `${label}主按钮文字可读: ${JSON.stringify(paint)}`
          )
        }
        await appearance.getByText('紧凑', { exact: true }).click()
        await page.waitForFunction(
          () =>
            document
              .querySelector('tbody tr[data-row-key]')
              .getBoundingClientRect().height === 42
        )
        await appearance
          .getByRole('button', { name: '完成', exact: true })
          .click()
        await appearance.waitFor({ state: 'hidden' })
        assert.ok(
          await appearanceTrigger.evaluate(
            (el) => el === document.activeElement
          ),
          '关闭外观设置恢复触发按钮焦点'
        )
        await shot(page, 'high-fidelity-sales-compact')
        await page.reload()
        await row.waitFor()
        assert.equal(
          await row.evaluate((el) => el.getBoundingClientRect().height),
          42,
          '刷新保留密度'
        )
        await appearanceTrigger.press('Enter')
        await appearance.waitFor()
        await appearance.getByText('暗色', { exact: true }).click()
        await page.keyboard.press('Escape')
        await appearance.waitFor({ state: 'hidden' })
        assert.ok(
          await appearanceTrigger.evaluate(
            (el) => el === document.activeElement
          ),
          'Escape 关闭外观设置恢复触发按钮焦点'
        )
        await settle(page)

        const secondaryButton = await page
          .getByRole('button', { name: '刷新当前页' })
          .evaluate((node) => {
            const style = getComputedStyle(node)
            return {
              background: style.backgroundColor,
              surface: style.getPropertyValue('--erp-surface-bg'),
              foreground: style.color,
            }
          })
        assert.deepEqual(
          parseRgb(secondaryButton.background),
          parseRgb(secondaryButton.surface),
          '深色普通按钮与内容面使用同一中性色'
        )
        assert.ok(
          getContrastRatio(
            parseRgb(secondaryButton.foreground),
            parseRgb(secondaryButton.background)
          ) >= 4.5,
          '深色普通按钮文字清晰'
        )
        await shot(page, 'high-fidelity-sales-dark')
        await assertNoHorizontalOverflow(page, 'high-fidelity-sales-dark')
        for (const width of [320, 390, 768]) {
          await page.setViewportSize({ width, height: 844 })
          await settle(page)
          const header = await page
            .locator('.erp-admin-header')
            .evaluate((node) => {
              const box = node.getBoundingClientRect()
              return {
                height: box.height,
                controls: [...node.querySelectorAll('button')]
                  .filter((button) => button.getClientRects().length)
                  .map((button) => {
                    const rect = button.getBoundingClientRect()
                    return {
                      name:
                        button.getAttribute('aria-label') || button.textContent,
                      contained:
                        rect.left >= box.left &&
                        rect.right <= box.right &&
                        rect.top >= box.top &&
                        rect.bottom <= box.bottom,
                    }
                  }),
              }
            })
          assert.equal(header.height, 48, '窄屏仍保持顶栏高度')
          assert.ok(
            header.controls.every((control) => control.contained),
            `${width}px 顶栏操作完整可见: ${JSON.stringify(header)}`
          )
          await shot(page, `high-fidelity-sales-narrow-${width}`)
        }
      },
    },
    ...[
      '/__dev',
      '/__dev/product-engineering',
      '/__dev/quality',
      '/__dev/delivery',
      '/__dev/ui-design',
    ].map((route) => ({
      name: `high-fidelity-dev-${route.split('/').at(-1)}`,
      path: route,
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        const navigation = page.locator('.erp-dev-workspace-nav')
        await navigation.waitFor()
        await settle(page)
        const dimensions = await navigation.boundingBox()
        assert.equal(dimensions.x, 0, '效能工作台侧栏贴边')
        assert.equal(dimensions.y, 0, '效能工作台侧栏从顶部开始')
        assert.equal(dimensions.width, 206, '效能工作台复用高保真侧栏宽度')
        assert.equal(dimensions.height, 900, '效能工作台侧栏覆盖可视区')
        await assertNoHorizontalOverflow(page, route)
        await shot(page, `high-fidelity-dev-${route.split('/').at(-1)}-desktop`)
        const actions = page.locator(
          '.erp-dev-product-task__action, .erp-dev-quality-task__action'
        )
        if (await actions.count()) {
          for (const mode of ['light', 'dark']) {
            await page.evaluate(
              (next) => localStorage.setItem('plush_erp_theme_mode', next),
              mode
            )
            await page.reload()
            await actions.first().waitFor()
            await settle(page)
            for (const paint of await actions.evaluateAll((nodes) =>
              nodes.map((node) => {
                const style = getComputedStyle(node)
                return {
                  height: node.getBoundingClientRect().height,
                  radius: style.borderRadius,
                  foreground: style.color,
                  background: style.backgroundColor,
                }
              })
            )) {
              assert.equal(paint.height, 34, '效能工作台桌面主动作高度')
              assert.equal(paint.radius, '8px', '效能工作台主动作圆角')
              assert.ok(
                getContrastRatio(
                  parseRgb(paint.foreground),
                  parseRgb(paint.background)
                ) >= 4.5,
                `${mode}效能主动作文字对比度: ${JSON.stringify(paint)}`
              )
            }
            await shot(
              page,
              `high-fidelity-dev-${route.split('/').at(-1)}-${mode}`
            )
          }
          await page.evaluate(() =>
            localStorage.setItem('plush_erp_theme_mode', 'light')
          )
          await page.reload()
          await navigation.waitFor()
          await settle(page)
        }
        await page.setViewportSize({ width: 390, height: 844 })
        await assertNoHorizontalOverflow(page, `${route}-mobile`)
        await shot(page, `high-fidelity-dev-${route.split('/').at(-1)}-mobile`)
      },
    })),
  ]
}
