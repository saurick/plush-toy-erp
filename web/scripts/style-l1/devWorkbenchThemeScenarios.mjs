import assert from 'node:assert/strict'
import { ERP_ACCENTS } from '../../src/common/theme/erpAppearance.mjs'
import { openERPAppearance } from './themeAssertions.mjs'
import { assertReadableOnBackground } from './colorAssertions.mjs'
import { installPermissionRelationshipMock } from './permissionRelationshipScenarios.mjs'

export async function selectAppearance(page, mode, accent) {
  await openERPAppearance(page)
  const dialog = page.getByRole('dialog', { name: '外观与密度' })
  await dialog.getByText(mode === 'dark' ? '暗色' : '浅色', { exact: true }).click()
  await dialog.getByRole('button', { name: ERP_ACCENTS[accent].label, exact: true }).click()
  await dialog.getByRole('button', { name: '关闭', exact: true }).click()
  await dialog.waitFor({ state: 'hidden' })
  await page.waitForFunction(({ mode, accent }) => {
    const root = document.documentElement.dataset
    return root.erpTheme === mode && root.erpAccent === accent
  }, { mode, accent })
}

export async function assertPaint(page, selector, expected, { visibleBackground = false } = {}) {
  await page.locator(selector).first().waitFor()
  const paints = await page.locator(selector).evaluateAll((elements, { expected, visibleBackground }) => {
    const probe = document.createElement('span')
    probe.hidden = true
    for (const [property, token] of Object.entries(expected)) {
      probe.style[property] = `var(${token})`
    }
    document.body.append(probe)
    const reference = getComputedStyle(probe)
    const result = elements.map((element) => {
      const style = getComputedStyle(element)
      return Object.keys(expected).map((property) => {
        let actual = style[property]
        if (property === 'backgroundColor' && visibleBackground) {
          let parent = element.parentElement
          while (actual === 'rgba(0, 0, 0, 0)' && parent) {
            actual = getComputedStyle(parent).backgroundColor
            parent = parent.parentElement
          }
        }
        return { property, actual, expected: reference[property] }
      })
    })
    probe.remove()
    return result.flat()
  }, { expected, visibleBackground })
  for (const paint of paints) {
    assert.equal(paint.actual, paint.expected, `${selector} ${paint.property} 应跟随当前主题`)
  }
}

export function createDevWorkbenchThemeScenarios({ assertNoHorizontalOverflow }) {
  return ['light', 'dark'].map((mode) => ({
    name: `dev-workbench-accent-${mode}`,
    path: '/__dev/docs?path=scripts%2Fimport%2FREADME.md',
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
    beforeNavigate: installPermissionRelationshipMock,
    verify: async (page) => {
      const docsURL = page.url()
      const selectedShell = '.erp-dev-docs-tree__doc-shell--active'
      const selected = `${selectedShell} .erp-dev-docs-tree__doc`
      await page.locator(selected).waitFor()
      const pin = page.locator('.erp-dev-docs-pin-button')
      if (await pin.getAttribute('aria-pressed') !== 'true') await pin.click()
      await page.locator('.erp-dev-docs-pinned > summary').click()
      const initialBox = await page.locator('.erp-dev-docs-sidebar').boundingBox()

      for (const accent of Object.keys(ERP_ACCENTS)) {
        await selectAppearance(page, mode, accent)
        await assertPaint(page, selected, { backgroundColor: '--erp-primary-soft', color: '--erp-primary-strong' }, { visibleBackground: true })
        await assertPaint(page, `${selected} .erp-dev-docs-tree__doc-title`, { color: '--erp-primary-strong' })
        await assertPaint(page, `${selectedShell} .erp-dev-docs-row-pin`, { color: '--erp-primary' })
        await assertPaint(page, '.erp-dev-docs-pinned__item--active .erp-dev-docs-pinned__open', { backgroundColor: '--erp-primary-soft', color: '--erp-primary-strong' }, { visibleBackground: true })
        await assertPaint(page, '.erp-dev-docs-pinned__item--active .erp-dev-docs-pinned__title', { color: '--erp-primary-strong' })
        await page.locator('[data-dev-doc-dir="scripts/import"]').hover()
        await assertPaint(page, '[data-dev-doc-dir="scripts/import"]', { backgroundColor: '--erp-interactive-bg-hover' })
        const codePaint = await page.locator('.erp-dev-docs-markdown pre').first().evaluate((element) => ({
          color: getComputedStyle(element.querySelector('code')).color,
          background: getComputedStyle(element).backgroundColor,
        }))
        assertReadableOnBackground(codePaint.color, codePaint.background, '文档代码须清楚可读')
        assert.deepEqual(await page.locator('.erp-dev-docs-sidebar').boundingBox(), initialBox, '换色不改变目录布局')
      }
      await page.reload()
      await assertPaint(page, selected, { backgroundColor: '--erp-primary-soft', color: '--erp-primary-strong' }, { visibleBackground: true })
      await assertNoHorizontalOverflow(page, `workbench-accent-${mode}-docs`)

      await page.goto(new URL('/__dev/testing?view=commands', docsURL).href)
      for (const accent of ['pink', 'blue']) {
        await selectAppearance(page, mode, accent)
        await assertPaint(page, '.erp-dev-testing-filter__item--active', {
          borderTopColor: '--erp-primary', backgroundColor: '--erp-primary-soft', color: '--erp-primary-strong',
        })
        const command = page.locator('.erp-dev-testing-command-block__details').first()
        if (await command.getAttribute('open') === null) await command.locator('summary').click()
        await assertPaint(page, '.erp-dev-testing-command-block pre:visible', { color: '--erp-text', backgroundColor: '--erp-surface-bg-soft' })
      }
      await assertNoHorizontalOverflow(page, `workbench-accent-${mode}-testing`)

      await page.goto(new URL('/__dev/permission-relationships', docsURL).href)
      for (const accent of ['blue', 'pink']) {
        await selectAppearance(page, mode, accent)
        await assertPaint(page, '.erp-dev-permission-relationships-header__icon', {
          backgroundColor: '--erp-primary-soft', color: '--erp-primary-strong',
        })
      }
      await assertNoHorizontalOverflow(page, `workbench-accent-${mode}-permissions`)
      await page.goto(docsURL)
      await assertPaint(page, selected, { backgroundColor: '--erp-primary-soft', color: '--erp-primary-strong' }, { visibleBackground: true })
    },
  }))
}
