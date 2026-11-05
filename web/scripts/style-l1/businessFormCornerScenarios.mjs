import { writeFile } from 'node:fs/promises'
import { openBusinessFormModeEditor } from './businessFormModeScenarios.mjs'
import { assertBusinessFormCorners } from './businessFormCornerAssertions.mjs'
import { setERPFormDisplay } from './themeAssertions.mjs'

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
          let editor
          if (editorMode === 'create') {
            await page.getByRole('button', { name: triggerName }).click()
            editor = page.locator('.erp-business-form-page:not([hidden])')
            await editor.waitFor()
          } else {
            editor = await openBusinessFormModeEditor(page, key, mode)
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
