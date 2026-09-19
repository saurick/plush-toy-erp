import path from 'node:path'
import { stylePaginatedRpcData, styleRpcResult } from './rpcMockResult.mjs'
import {
  assertBusinessFormPage,
  closeBusinessFormPage,
} from './businessFormPageAssertions.mjs'

export function createOutsourcingFormFieldsScenarios({
  assert,
  assertNoHorizontalOverflow,
  customerRuntimeEffectiveSession,
  outputDir,
}) {
  return [1440, 720].map((width) => {
    let releaseContacts
    let contactsReady
    let contactGate
    let contactsRequested = false
    const name = `outsourcing-form-fields-${width === 1440 ? 'desktop' : 'narrow'}`
    return {
      name,
      auth: 'admin',
      path: '/erp/purchase/processing-contracts',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width, height: 900 },
      beforeNavigate: async (page) => {
        contactsRequested = false
        contactGate = new Promise((resolve) => {
          contactsReady = resolve
        })
        await page.route('**/rpc/masterdata', async (route) => {
          const { id, method, params = {} } = route.request().postDataJSON()
          let data
          if (method === 'list_suppliers') {
            data = stylePaginatedRpcData(
              [
                {
                  id: 1,
                  code: 'SUP-1',
                  name: '模拟甲加工厂',
                  supplier_type: 'outsourcing',
                  is_active: true,
                  default_payment_term_days: 30,
                },
                {
                  id: 2,
                  code: 'SUP-2',
                  name: '模拟乙加工厂',
                  supplier_type: 'outsourcing',
                  is_active: true,
                  default_payment_term_days: 60,
                },
                {
                  id: 3,
                  code: 'SUP-3',
                  name: '模拟未设账期加工厂',
                  supplier_type: 'outsourcing',
                  is_active: true,
                  default_payment_term_days: null,
                },
              ],
              'suppliers',
              params
            )
          } else if (
            method === 'list_contacts_by_owner' &&
            params.owner_type === 'SUPPLIER' &&
            Number(params.owner_id) === 2
          ) {
            contactsRequested = true
            await new Promise((resolve) => {
              releaseContacts = resolve
              contactsReady()
            })
            data = stylePaginatedRpcData(
              [
                {
                  id: 20,
                  name: '晚到的默认联系人',
                  phone: '020-00000000',
                  is_primary: true,
                  is_active: true,
                },
              ],
              'contacts',
              params
            )
          } else return route.fallback()
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              jsonrpc: '2.0',
              id,
              result: styleRpcResult(data),
            }),
          })
        })
      },
      verify: async (page) => {
        const selectOption = async (input, text) => {
          await input
            .locator(
              'xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " ant-select ")][1]'
            )
            .locator('.ant-select-selector')
            .click()
          await page
            .locator(
              '.ant-select-dropdown:visible .ant-select-item-option-content'
            )
            .getByText(text, { exact: true })
            .click()
          await page.locator('.ant-select-dropdown:visible').waitFor({ state: 'hidden' })
        }
        const clearSelect = async (input) => {
          const select = input.locator(
            'xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " ant-select ")][1]'
          )
          await select.hover()
          await select.locator('.ant-select-clear').click()
        }
        const row = page
          .locator('.erp-business-data-table-card .ant-table-tbody tr')
          .filter({ hasText: 'SIM-OUTSOURCE-CONTRACT-L1' })
          .first()
        await row.dblclick()
        const editor = page.locator('.erp-business-form-page:not([hidden])')
        await editor
          .getByRole('heading', { name: '编辑加工合同', exact: true })
          .waitFor()
        await assertBusinessFormPage(page, editor)
        const price = editor.locator('input#items_0_unit_price')
        const quantity = editor.locator('input#items_0_outsourcing_quantity')
        const amount = editor.getByRole('textbox', { name: '第 1 行加工金额' })
        assert.equal(Number(await amount.inputValue()), 36)
        await price.fill('')
        assert.equal(await amount.inputValue(), '')
        await price.fill('-1')
        await editor
          .getByText('请输入不小于 0 的单价，最多 6 位小数', { exact: true })
          .waitFor()
        await price.fill('0')
        assert.equal(Number(await amount.inputValue()), 0)
        await quantity.fill('0')
        await editor
          .getByText('请输入大于 0 的数量，最多 6 位小数', { exact: true })
          .waitFor()
        await quantity.fill('12')
        const unit = editor.locator('input#items_0_unit_id')
        assert.equal(await unit.isDisabled(), true)
        await editor.locator('.erp-line-item-details summary').first().click()
        await editor
          .getByLabel('行备注', { exact: true })
          .fill('保留的逐行备注')
        await clearSelect(editor.locator('input#items_0_product_sku_id'))
        assert.equal(await unit.isDisabled(), false)
        assert.equal(
          await editor.locator('input#items_0_sku_code_snapshot').inputValue(),
          ''
        )
        await selectOption(editor.locator('input#items_0_process_id'), '车缝')
        assert.equal(
          await editor
            .locator('input#items_0_process_name_snapshot')
            .inputValue(),
          '车缝'
        )
        await clearSelect(editor.locator('input#items_0_process_id'))
        assert.equal(
          await editor
            .locator('input#items_0_process_category_snapshot')
            .inputValue(),
          ''
        )
        await selectOption(editor.locator('input#items_0_process_id'), '手工')
        await selectOption(editor.locator('input#items_0_subject_type'), '材料')
        assert.equal(
          await editor
            .locator('input#items_0_product_no_snapshot')
            .inputValue(),
          ''
        )
        assert.equal(
          await editor.locator('input#items_0_sku_code_snapshot').inputValue(),
          ''
        )
        assert.equal(
          await editor.getByLabel('行备注', { exact: true }).inputValue(),
          '保留的逐行备注'
        )
        await editor.locator('input#payment_term_days').fill('30')
        const contactResponse = page.waitForResponse(
          (response) =>
            response.url().endsWith('/rpc/masterdata') &&
            response.request().postDataJSON()?.method ===
              'list_contacts_by_owner' &&
            Number(response.request().postDataJSON()?.params?.owner_id) === 2
        )
        await selectOption(
          editor.locator('input#supplier_id'),
          'SUP-2 / 模拟乙加工厂'
        )
        assert.equal(
          await editor.locator('input#payment_term_days').inputValue(),
          '60'
        )
        await contactGate
        await editor
          .locator('input#supplier_snapshot_contact_name')
          .fill('合同自定联系人')
        assert.equal(contactsRequested, true)
        releaseContacts()
        await (await contactResponse).finished()
        await editor.locator('input#supplier_snapshot_contact_name').click()
        await page
          .locator(
            '.ant-select-dropdown:visible .ant-select-item-option-content'
          )
          .getByText(/晚到的默认联系人/u)
          .waitFor()
        assert.equal(
          await editor
            .locator('input#supplier_snapshot_contact_name')
            .inputValue(),
          '合同自定联系人'
        )
        await editor
          .locator('input#supplier_snapshot_contact_name')
          .press('Tab')
        await selectOption(
          editor.locator('input#supplier_id'),
          'SUP-3 / 模拟未设账期加工厂'
        )
        assert.equal(
          await editor.locator('input#payment_term_days').inputValue(),
          ''
        )
        await editor.locator('input#payment_term_days').fill('45')
        await editor.locator('.erp-line-item-details summary').first().click()
        await editor.getByText('已填备注', { exact: true }).waitFor()
        await assertNoHorizontalOverflow(page)
        await page.screenshot({
          path: path.join(outputDir, `${name}-editor.png`),
          fullPage: true,
        })
        await closeBusinessFormPage(page, editor)
      },
    }
  })
}
