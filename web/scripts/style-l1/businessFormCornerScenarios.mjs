import { writeFile } from 'node:fs/promises'
import { openBusinessFormModeEditor } from './businessFormModeScenarios.mjs'
import { assertBusinessFormCorners } from './businessFormCornerAssertions.mjs'

const views = [
  { suffix: 'desktop', viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2, themeMode: 'light' },
  { suffix: 'mobile', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, themeMode: 'light' },
  { suffix: 'dark', viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2, themeMode: 'dark' },
  { suffix: 'mobile-dark', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, themeMode: 'dark' },
]

export function createBusinessFormCornerScenarios(deps, documents, modeScenarios) {
  return documents.flatMap(([key]) => {
    const mode = modeScenarios.some((entry) => entry.name === `business-form-mode-${key}-edit`) ? 'edit' : 'view'
    const source = modeScenarios.find((entry) => entry.name === `business-form-mode-${key}-${mode}`)
    return views.map(({ suffix, ...appearance }) => ({
      ...source,
      ...appearance,
      name: `business-form-corners-${key}-${suffix}`,
      verify: async (page) => {
        const editor = await openBusinessFormModeEditor(page, key, mode)
        const evidence = await assertBusinessFormCorners(page, editor)
        const name = `business-form-corners-${key}-${suffix}`
        await deps.assertNoHorizontalOverflow(page, name)
        await writeFile(`${deps.outputDir}/${name}.json`, JSON.stringify({ key, mode, ...appearance, ...evidence }, null, 2))
        await page.screenshot({ path: `${deps.outputDir}/${name}.png`, fullPage: true })
      },
    }))
  })
}
