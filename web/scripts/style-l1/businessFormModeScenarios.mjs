import { writeFile } from 'node:fs/promises'
import { waitForFiniteAnimations } from './browserReadiness.mjs'
import { assertBusinessSectionInteractions } from './businessFormSectionAssertions.mjs'
import { closeBusinessFormPage } from './businessFormPageAssertions.mjs'

const MASTER_DATA = new Set(['customers', 'suppliers', 'materials', 'products', 'product-skus', 'processes'])
const IMMUTABLE_FACTS = new Set(['quality', 'payment'])

export async function openBusinessFormModeEditor(page, key, mode) {
  const rows = page.locator('.erp-business-data-table-card .ant-table-tbody > tr.ant-table-row')
  const row = key === 'bom' && mode !== 'view' ? rows.filter({ hasText: '草稿' }).first() : rows.first()
  await row.waitFor()
  await row.locator('input[type="radio"], input[type="checkbox"]').first().check()
  const selector = mode === 'copy' ? '[data-business-action-key="copy"]' : `[data-business-action-role="${mode}"]`
  let action = page.locator(`${selector}:visible`).first()
  if (!(await action.count())) {
    await page.getByRole('button', { name: /^更多操作(?:，共 \d+ 项)?$/u }).click()
    action = page.locator(`${selector}:visible`).first()
  }
  await action.click()
  const editor = page.locator('.erp-business-form-page:not([hidden]), .ant-modal:visible').last()
  await editor.waitFor()
  await editor.locator('.ant-spin-spinning').first().waitFor({ state: 'hidden' })
  await editor.locator('.erp-business-detail-items__loading').waitFor({ state: 'hidden' })
  return editor
}

export function createBusinessFormModeScenarios(deps, documents) {
  const cases = []
  for (const [key, route] of documents) {
    for (const mode of ['edit', 'view', ...(key === 'bom' ? ['copy'] : [])]) {
      if (mode === 'edit' && IMMUTABLE_FACTS.has(key)) continue
      const readOnlyMaster = mode === 'view' && MASTER_DATA.has(key)
      const session = deps.customerRuntimeEffectiveSession
      const readActions = session.actions.filter((action) => /(?:\.read|\.access)$/u.test(action))
      const effectiveSession = {
        ...session,
        pages: [...session.pages, 'processes', 'production-orders', 'finance-payments'],
        ...(readOnlyMaster ? { actions: readActions } : {}),
      }
      cases.push({
        name: `business-form-mode-${key}-${mode}`,
        path: route,
        auth: 'admin',
        effectiveSession,
        ...(readOnlyMaster ? { adminProfile: { is_super_admin: false, permissions: readActions } } : {}),
        viewport: { width: 1440, height: 900 },
        verify: async (page) => {
          const editor = await openBusinessFormModeEditor(page, key, mode)
          if (key === 'bom') {
            deps.assert.equal(await editor.getByRole('combobox', { name: /产品/u }).isDisabled(), true, `BOM ${mode} must preserve its product identity`)
          }
          await waitForFiniteAnimations(page)
          const initialUnsaved = await editor.getAttribute('data-unsaved')
          const sections = await assertBusinessSectionInteractions(page, editor)
          if (await editor.getAttribute('data-business-form-page')) {
            deps.assert.equal(await editor.getAttribute('data-unsaved'), initialUnsaved, 'section browsing preserves the initial draft state')
          }
          await page.screenshot({ path: `${deps.outputDir}/business-form-mode-${key}-${mode}.png`, fullPage: true })
          await deps.assertNoHorizontalOverflow(page, `business-form-mode-${key}-${mode}`)
          await writeFile(`${deps.outputDir}/business-form-mode-${key}-${mode}.json`, JSON.stringify({ key, mode, initialUnsaved, sections, container: sections.length ? 'sectioned' : 'flat' }, null, 2))
          if (await editor.getAttribute('data-business-form-page')) await closeBusinessFormPage(page, editor)
          else await editor.getByRole('button', { name: '关闭', exact: true }).last().click()
        },
      })
    }
  }
  const salesView = cases.find((entry) => entry.name === 'business-form-mode-sales-view')
  return [...cases, {
    ...salesView,
    name: 'business-form-mode-sales-view-4k',
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
  }]
}
