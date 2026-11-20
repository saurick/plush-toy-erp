import { writeFile } from 'node:fs/promises'
import { openBusinessFormModeEditor } from './businessFormModeScenarios.mjs'
import { assertBusinessFormCorners } from './businessFormCornerAssertions.mjs'
import { setERPFormDisplay } from './themeAssertions.mjs'
import { assertReadableOnBackground } from './colorAssertions.mjs'

const views = [
  { suffix: 'desktop', viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2, themeMode: 'light' },
  { suffix: 'mobile', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, themeMode: 'light' },
  { suffix: 'dark', viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2, themeMode: 'dark' },
  { suffix: 'mobile-dark', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, themeMode: 'dark' },
]

export function createBusinessFormCornerScenarios(deps, documents, modeScenarios) {
  return documents.flatMap(([key, , triggerName]) => {
    const mode = modeScenarios.some((entry) => entry.name === `business-form-mode-${key}-edit`) ? 'edit' : 'view'
    const source = modeScenarios.find((entry) => entry.name === `business-form-mode-${key}-${mode}`)
    const modes = ['sales', 'purchase', 'outsourcing', 'shipment'].includes(key) ? [mode, 'create'] : [mode]
    return modes.flatMap((editorMode) => views.map(({ suffix, ...appearance }) => {
      const name = `business-form-corners-${key}${editorMode === 'create' ? '-create' : ''}-${suffix}`
      return {
        ...source,
        ...appearance,
        name,
        verify: async (page) => {
          const verifyDarkSales = key === 'sales' && suffix === 'dark' && editorMode === 'edit'
          if (verifyDarkSales) {
            const details = await openBusinessFormModeEditor(page, key, 'view')
            const overlay = await details.locator('.ant-modal-content').evaluate((node) => getComputedStyle(node).backgroundColor)
            const list = await page.locator('.erp-business-data-table-card').evaluate((node) => getComputedStyle(node).backgroundColor)
            deps.assert.match(overlay, /^rgb\(/u, '暗色详情弹窗使用不透明浮层色')
            deps.assert.notEqual(overlay, list, '暗色详情弹窗要与下方列表区分')
            await details.getByRole('button', { name: '关闭', exact: true }).last().click()
            await details.waitFor({ state: 'hidden' })
          }
          let editor
          if (editorMode === 'create') {
            await page.getByRole('button', { name: triggerName }).click()
            editor = page.locator('.erp-business-form-page:not([hidden])')
            await editor.waitFor()
          } else {
            editor = await openBusinessFormModeEditor(page, key, mode)
          }
          if (verifyDarkSales) {
            const field = editor.getByRole('textbox', { name: '客户订单号', exact: true })
            const paint = () => field.evaluate((node) => {
              const style = getComputedStyle(node.closest('.ant-input-affix-wrapper') || node)
              return { background: style.backgroundColor, border: style.borderTopColor, shadow: style.boxShadow }
            })
            const idle = await paint()
            const surface = await editor.evaluate((node) => getComputedStyle(node).backgroundColor)
            deps.assert.notEqual(idle.background, surface)
            const hint = editor.locator('.ant-form-item-extra').filter({ hasText: /运费/u }).first()
            assertReadableOnBackground(await hint.evaluate((node) => getComputedStyle(node).color), surface, '暗色表单说明可读')
            await field.focus()
            deps.assert.equal(await field.evaluate((node) => node === document.activeElement), true)
            deps.assert.notDeepEqual(await paint(), idle, '暗色输入框需要清楚显示键盘焦点')
            await field.blur()
          }
          const evidence = await assertBusinessFormCorners(page, editor)
          if (editorMode === 'create') {
            await setERPFormDisplay(page, 'section')
            await editor.getByRole('tablist', { name: '表单页签', exact: true }).waitFor()
            evidence.tabbed = await assertBusinessFormCorners(page, editor)
            const detail = evidence.sections.find(({ edges }) => edges[0]?.mode === 'inline')
            if (detail) await editor.getByRole('tab', { name: detail.title, exact: true }).click()
          }
          await deps.assertNoHorizontalOverflow(page, name)
          await writeFile(`${deps.outputDir}/${name}.json`, JSON.stringify({ key, mode: editorMode, ...appearance, ...evidence }, null, 2))
          await page.screenshot({ path: `${deps.outputDir}/${name}.png`, fullPage: true })
        },
      }
    }))
  })
}
