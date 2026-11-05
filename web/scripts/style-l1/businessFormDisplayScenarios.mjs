import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { openERPAppearance, setERPFormDisplay } from './themeAssertions.mjs'
import { closeBusinessFormPage } from './businessFormPageAssertions.mjs'
import { waitForFiniteAnimations } from './browserReadiness.mjs'
import { verifyMobileNavigationMotion } from './slidingMotionAssertions.mjs'

const visibleSections = (editor) => editor.locator('[data-form-section]:visible').evaluateAll((nodes) => nodes.map((node) => node.dataset.formSection))

async function chooseSection(page, editor, title) {
  await editor.getByRole('tab').filter({ hasText: title }).click()
  await page.waitForFunction(({ root, title }) => [...root.querySelectorAll('[data-form-section]')].filter((node) => !node.hidden).every((node) => node.dataset.formSection === title), { root: await editor.elementHandle(), title })
}

async function waitForDisplay(page, value) {
  await page.waitForFunction((value) => JSON.parse(localStorage.getItem('admin_erp_preferences') || '{}').appearance?.formDisplay === value, value)
}

export function createBusinessFormDisplayScenarios({ customerRuntimeEffectiveSession, outputDir }) {
  const common = {
    auth: 'admin',
    effectiveSession: {
      ...customerRuntimeEffectiveSession,
      pages: [...customerRuntimeEffectiveSession.pages, 'production-orders', 'finance-payments'],
    },
  }
  return [
    ...['light', 'dark'].map((themeMode) => ({
      ...common,
      name: `business-form-display-production-${themeMode}`,
      path: '/erp/production/orders',
      themeMode,
      viewport: themeMode === 'light' ? { width: 1920, height: 1080 } : { width: 800, height: 900 },
      deviceScaleFactor: themeMode === 'light' ? 2 : 1,
      verify: async (page) => {
        await page.getByRole('button', { name: '新建生产订单' }).click()
        const editor = page.locator('.erp-business-form-page:not([hidden])')
        await editor.locator('[data-form-display="all"]').waitFor()
        assert.equal(await editor.locator('[aria-label="编辑页显示"]').count(), 0, '显示方式统一从账号外观设置调整')
        const all = await visibleSections(editor)
        assert.ok(all.length >= 3)
        assert.equal(await editor.locator('[data-form-display]').getAttribute('data-form-display'), 'all')
        assert.equal(await editor.getAttribute('data-unsaved'), 'false')
        const note = editor.getByRole('textbox', { name: '备注', exact: true })
        await note.fill('切换区域与全屏后仍保留的草稿')
        const noteHandle = await note.elementHandle()
        await setERPFormDisplay(page, 'section')
        await waitForDisplay(page, 'section')
        assert.deepEqual(await visibleSections(editor), ['备注'])
        if (themeMode === 'light') {
          await verifyMobileNavigationMotion(page, assert, '.erp-business-form-page:not([hidden]) .erp-business-form-page__section-tabs', 0)
          await verifyMobileNavigationMotion(page, assert, '.erp-business-form-page:not([hidden]) .erp-business-form-page__section-tabs', 2, true)
        }
        await chooseSection(page, editor, '生产计划')
        await chooseSection(page, editor, '备注')
        assert.equal(await noteHandle.evaluate((node) => node.isConnected), true)
        assert.equal(await note.inputValue(), '切换区域与全屏后仍保留的草稿')
        await editor.getByRole('button', { name: '全屏编辑', exact: true }).click()
        assert.deepEqual(await visibleSections(editor), ['备注'])
        await editor.getByRole('button', { name: '退出全屏', exact: true }).click()
        assert.equal(await noteHandle.evaluate((node) => node.isConnected), true)
        await editor.getByRole('button', { name: '创建草稿', exact: true }).click()
        await editor.locator('[data-form-section="生产计划"]:visible .ant-form-item-has-error').waitFor()
        await page.waitForFunction((node) => !!document.activeElement?.closest('.ant-form-item-has-error') && node.contains(document.activeElement), await editor.elementHandle())
        await editor.getByRole('textbox', { name: /生产单号/u }).fill('MO-FORM-DISPLAY')
        await chooseSection(page, editor, '备注')
        await editor.getByRole('button', { name: '创建草稿', exact: true }).click()
        await editor.locator('[data-form-section="生产明细"]:visible .ant-form-item-has-error').first().waitFor()
        await page.waitForFunction((node) => !!node.querySelector('.erp-business-form-page__section-errors'), await editor.elementHandle())

        await setERPFormDisplay(page, 'all')
        await waitForDisplay(page, 'all')
        assert.deepEqual(await visibleSections(editor), all)
        assert.equal(await note.inputValue(), '切换区域与全屏后仍保留的草稿')
        await setERPFormDisplay(page, 'section')
        assert.equal((await visibleSections(editor)).length, 1)
        assert.equal(await editor.getAttribute('data-unsaved'), 'true')
        await waitForFiniteAnimations(page)
        await page.screenshot({ path: `${outputDir}/form-display-${themeMode}.png`, fullPage: true })
        await writeFile(`${outputDir}/form-display-${themeMode}.json`, JSON.stringify({ sections: all, selected: await visibleSections(editor), preference: 'section', keptDraft: true }, null, 2))
        await closeBusinessFormPage(page, editor)
        await page.reload()
        await page.getByRole('button', { name: '新建生产订单' }).click()
        await editor.locator('[data-form-display="section"]').waitFor()
        assert.equal((await visibleSections(editor)).length, 1, 'server profile restores the saved preference after refresh')
        assert.equal(await editor.getAttribute('data-unsaved'), 'false', 'the display preference cannot dirty a fresh document')
        assert.equal(await editor.getAttribute('data-fullscreen'), null)
        await closeBusinessFormPage(page, editor)
      },
    })),
    ...[
      ['bom', '/erp/purchase/material-bom', '新建 BOM'],
      ['sales', '/erp/sales/project-orders/sales-orders', '新建订单'],
      ['sales-mobile', '/erp/sales/project-orders/sales-orders', '新建订单'],
    ].map(([key, path, trigger]) => ({
      ...common,
      name: `business-form-display-${key}`,
      path,
      viewport: key === 'bom' ? { width: 1920, height: 1080 } : key === 'sales-mobile' ? { width: 390, height: 844 } : { width: 1440, height: 900 },
      deviceScaleFactor: key === 'bom' ? 2 : 1,
      adminProfile: { erp_preferences: { appearance: { formDisplay: 'section' } } },
      verify: async (page) => {
        await page.getByRole('button', { name: trigger }).click()
        const editor = page.locator('.erp-business-form-page:not([hidden])')
        await editor.locator('[data-form-display="section"]').waitFor()
        assert.equal(await editor.locator('[aria-label="编辑页显示"]').count(), 0)
        assert.equal((await visibleSections(editor)).length, 1)
        const tabs = editor.getByRole('tablist', { name: '表单页签', exact: true })
        await tabs.waitFor()
        const firstTab = tabs.getByRole('tab').first()
        const lastTab = tabs.getByRole('tab').last()
        await firstTab.focus()
        await firstTab.press('End')
        await page.waitForFunction((root) => [...root.querySelectorAll('[role="tab"]')].at(-1)?.getAttribute('aria-selected') === 'true', await tabs.elementHandle())
        const navigation = await tabs.boundingBox()
        const selected = await lastTab.boundingBox()
        assert.ok(selected.x >= navigation.x - 1 && selected.x + selected.width <= navigation.x + navigation.width + 1, '键盘选择会将当前页签横向滚入视野')
        assert.equal(await tabs.evaluate((root) => root.scrollWidth > root.clientWidth), key === 'sales-mobile', '窄屏使用页签条自身横向滚动')
        if (key === 'sales') {
          await page.setViewportSize({ width: 390, height: 844 })
          await page.waitForFunction((root) => {
            const selected = root.querySelector('[aria-selected="true"]').getBoundingClientRect()
            const bounds = root.getBoundingClientRect()
            return selected.left >= bounds.left - 1 && selected.right <= bounds.right + 1
          }, await tabs.elementHandle())
          await page.setViewportSize({ width: 1440, height: 900 })
        }
        const count = await editor.locator('[data-form-section]').count()
        await setERPFormDisplay(page, 'all')
        await waitForDisplay(page, 'all')
        assert.equal((await visibleSections(editor)).length, count)
        assert.equal(await editor.getAttribute('data-unsaved'), 'false')
        if (key === 'bom') {
          await setERPFormDisplay(page, 'section')
          await waitForDisplay(page, 'section')
          await chooseSection(page, editor, '订单与制表资料')
          await waitForFiniteAnimations(page)
          await page.screenshot({ path: `${outputDir}/form-display-bom-4k.png`, fullPage: true })
        }
        await closeBusinessFormPage(page, editor)
      },
    })),
    {
      ...common,
      name: 'business-form-display-save-retry',
      path: '/erp/purchase/material-bom',
      viewport: { width: 1440, height: 900 },
      beforeNavigate: async (page) => {
        let failed = false
        await page.route('**/rpc/admin', async (route) => {
          const body = route.request().postDataJSON()
          if (body.method !== 'set_erp_appearance' || failed) return route.fallback()
          failed = true
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { code: 500, message: 'save unavailable', data: {} } }) })
        })
      },
      verify: async (page) => {
        await page.getByRole('button', { name: '新建 BOM' }).click()
        const editor = page.locator('.erp-business-form-page:not([hidden])')
        assert.equal(await editor.locator('[aria-label="编辑页显示"]').count(), 0)
        await openERPAppearance(page)
        const dialog = page.getByRole('dialog', { name: '外观与密度', exact: true })
        const control = dialog.locator('[aria-label="编辑页显示"]')
        await control.getByText('页签', { exact: true }).click()
        const error = dialog.getByRole('alert')
        await error.waitFor()
        assert.match(await error.innerText(), /外观设置未保存到账号，请重试。/u)
        assert.equal((await visibleSections(editor)).length, 1)
        assert.equal(await editor.getAttribute('data-unsaved'), 'false')
        await error.getByRole('button', { name: '重试', exact: true }).click()
        await waitForDisplay(page, 'section')
        await error.waitFor({ state: 'hidden' })
        await dialog.getByRole('button', { name: '关闭', exact: true }).click()
        await dialog.waitFor({ state: 'hidden' })
        await closeBusinessFormPage(page, editor)
      },
    },
    {
      ...common,
      name: 'business-form-display-short',
      path: '/erp/finance/payments',
      viewport: { width: 1440, height: 900 },
      adminProfile: { erp_preferences: { appearance: { formDisplay: 'section' } } },
      verify: async (page) => {
        await page.getByRole('button', { name: '登记收付款' }).click()
        const editor = page.locator('.erp-business-form-page:not([hidden])')
        await editor.getByRole('heading', { name: '登记收付款' }).waitFor()
        assert.equal(await editor.locator('[aria-label="编辑页显示"]').count(), 0)
        assert.equal((await visibleSections(editor)).length, await editor.locator('[data-form-section]').count())
        await closeBusinessFormPage(page, editor)
      },
    },
  ]
}
