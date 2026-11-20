import { stylePaginatedRpcData } from './rpcMockResult.mjs'
import { currentBusinessDate } from '../../src/erp/utils/businessDate.mjs'
import { RpcErrorCode } from '../../src/common/consts/errorCodes.js'
import { closeBusinessFormPage } from './businessFormPageAssertions.mjs'

async function respond(route, id, data, message = 'OK', code = 0) {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      jsonrpc: '2.0',
      id,
      result: { code, message, data },
    }),
  })
}

export function createSalesOrderSubmissionScenarios({
  assert,
  customerRuntimeEffectiveSession,
  outputDir,
}) {
  let state
  return [
    {
      name: 'sales-order-draft-submit-repair',
      path: '/erp/sales/project-orders/sales-orders',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 3840, height: 2160 },
      beforeNavigate: async (page) => {
        state = {
          saves: [],
          starts: 0,
          executions: 0,
          node: null,
          order: {
            id: 1,
            order_no: 'SO-SUBMISSION-CHECK',
            customer_id: 1,
            customer_name: '提交校验客户',
            customer_snapshot: { name: '提交校验客户' },
            currency: 'CNY',
            lifecycle_status: 'draft',
            version: 1,
            order_date: Date.parse(`${currentBusinessDate()}T00:00:00Z`) / 1000,
            tax_mode: null,
            tax_rate: null,
            freight_terms: null,
            quoted_freight_amount: null,
            goods_amount: '3000',
            tax_amount: null,
            order_total: null,
          },
          items: [
            {
              id: 1,
              sales_order_id: 1,
              line_no: 1,
              requested_product_name: '提交校验玩具',
              product_id: 1,
              unit_id: 1,
              ordered_quantity: '100',
              unit_price: '30',
              amount: '3000',
              line_status: 'open',
            },
          ],
        }
        const instance = {
          id: 10,
          process_key: 'sales_order_acceptance',
          business_ref_type: 'sales_order',
          business_ref_id: 1,
          status: 'active',
        }
        await page.route('**/rpc/sales_order', async (route) => {
          const { id, method, params = {} } = route.request().postDataJSON()
          if (method === 'list_sales_orders') {
            return respond(
              route,
              id,
              stylePaginatedRpcData([state.order], 'sales_orders', params)
            )
          }
          if (method === 'get_sales_order') {
            return respond(route, id, { sales_order: state.order })
          }
          if (method === 'list_sales_order_items') {
            return respond(
              route,
              id,
              stylePaginatedRpcData(state.items, 'sales_order_items', params)
            )
          }
          if (method === 'save_sales_order_with_items') {
            state.saves.push(params)
            state.order = {
              ...state.order,
              ...params,
              order_date: Date.parse(params.order_date) / 1000,
              version: state.order.version + 1,
            }
            state.items = params.items.map((item) => ({
              ...state.items[0],
              ...item,
            }))
            return respond(route, id, {
              sales_order: state.order,
              sales_order_items: state.items,
            })
          }
          return route.fallback()
        })
        await page.route('**/rpc/customer_config', async (route) => {
          const { id, method, params = {} } = route.request().postDataJSON()
          if (method === 'get_sales_order_acceptance_process') {
            return respond(route, id, {
              process_context: state.node
                ? { process_instance: instance, nodes: [state.node] }
                : null,
            })
          }
          if (method === 'start_sales_order_acceptance_process') {
            state.starts += 1
            state.node = {
              id: 20,
              process_instance_id: 10,
              node_key: 'submit_sales_order',
              node_type: 'domain_command',
              status: 'active',
              version: 1,
            }
            return respond(route, id, {
              process_instance: instance,
              started_node: state.node,
              nodes: [state.node],
            })
          }
          if (method === 'execute_sales_order_acceptance_submit') {
            state.executions += 1
            assert.equal(params.expected_version, state.node.version)
            if (!state.order.tax_mode || !state.order.freight_terms) {
              state.node.version += 1
              return respond(
                route,
                id,
                {},
                '提交前请补齐：计税方式、报价是否含运费；保存草稿后重新提交',
                RpcErrorCode.INVALID_PARAM
              )
            }
            state.node = {
              ...state.node,
              version: state.node.version + 1,
              status: 'completed',
              outcome: 'sales_order.submitted',
            }
            state.order.lifecycle_status = 'submitted'
            return respond(route, id, {
              completed_node: state.node,
              nodes: [state.node],
            })
          }
          return route.fallback()
        })
      },
      verify: async (page) => {
        const selectValue = async (editor, label, option) => {
          await editor.getByLabel(label, { exact: true }).focus()
          await page.keyboard.press('ArrowDown')
          await page
            .locator('.ant-select-dropdown:visible')
            .getByText(option, { exact: true })
            .click()
        }
        const selectOrder = async () => {
          await page
            .getByText('SO-SUBMISSION-CHECK', { exact: false })
            .first()
            .click()
        }
        const editOrder = async () => {
          await selectOrder()
          let edit = page.locator('[data-business-action-key="edit"]:visible')
          if ((await edit.count()) === 0) {
            await page.getByRole('button', { name: /^更多操作，共/ }).click()
            edit = page.locator('[data-business-action-key="edit"]:visible')
          }
          await edit.click()
          const editor = page.locator('.erp-business-form-page:not([hidden])')
          await editor
            .getByRole('heading', { name: '编辑销售订单', exact: true })
            .waitFor()
          return editor
        }
        await page.getByRole('button', { name: /新建订单$/u }).click()
        const createEditor = page.locator(
          '.erp-business-form-page:not([hidden])'
        )
        await createEditor
          .getByRole('heading', { name: '新建销售订单', exact: true })
          .waitFor()
        await createEditor.getByRole('button', { name: /保存草稿$/ }).click()
        await createEditor
          .getByText('请选择计税方式', { exact: true })
          .last()
          .waitFor()
        await createEditor
          .getByText('请选择报价是否含运费', { exact: true })
          .waitFor()
        assert.equal(state.saves.length, 0, '新建时必须显示报价口径的阻断错误')
        await closeBusinessFormPage(page, createEditor)
        await selectOrder()
        await page
          .getByRole('button', { name: '提交订单', exact: true })
          .click()
        await page
          .getByText(
            '提交前请补齐：计税方式、报价是否含运费；保存草稿后重新提交',
            { exact: true }
          )
          .waitFor()
        assert.equal(state.order.lifecycle_status, 'draft')
        const editor = await editOrder()
        await editor.getByRole('button', { name: /保存草稿$/ }).click()
        await editor
          .getByText('请选择计税方式', { exact: true })
          .last()
          .waitFor()
        await editor
          .getByText('请选择报价是否含运费', { exact: true })
          .waitFor()
        assert.equal(
          state.saves.length,
          0,
          '缺少必要报价口径时，编辑保存也必须被阻止'
        )
        await selectValue(editor, '计税方式', '含税价')
        await editor.getByRole('button', { name: /保存草稿$/ }).click()
        await editor
          .getByText('选择含税或未税计价后，请填写税率', { exact: true })
          .waitFor()
        assert.equal(state.saves.length, 0, '条件必填未完成时不能发出保存请求')
        await editor.getByLabel('税率', { exact: true }).fill('13')
        await selectValue(editor, '计税方式', '不计税')
        assert.equal(
          await editor.getByLabel('税率', { exact: true }).inputValue(),
          ''
        )
        assert.equal(
          await editor.getByLabel('税率', { exact: true }).isDisabled(),
          true
        )
        await selectValue(editor, '计税方式', '含税价')
        await editor.getByLabel('税率', { exact: true }).fill('13')
        await selectValue(editor, '报价是否含运费', '报价不含运费（另计）')
        await editor.getByRole('button', { name: /保存草稿$/ }).click()
        await editor
          .getByText('请填写报价运费，无另计运费时填写 0', { exact: true })
          .waitFor()
        assert.equal(state.saves.length, 0)
        await editor.getByLabel('报价运费', { exact: true }).fill('25')
        await selectValue(editor, '报价是否含运费', '报价含运费')
        assert.equal(
          await editor.getByLabel('报价运费', { exact: true }).inputValue(),
          ''
        )
        const quantity = editor.getByLabel('订单数量', { exact: true })
        for (const invalid of ['0', '-1', ' ']) {
          await quantity.fill(invalid)
          await editor.getByRole('button', { name: /保存草稿$/ }).click()
          await editor
            .getByText('数量必须大于 0，且最多保留 6 位小数', { exact: true })
            .waitFor()
          assert.equal(state.saves.length, 0)
        }
        await quantity.fill('100')
        await editor
          .getByText('数量必须大于 0，且最多保留 6 位小数', { exact: true })
          .waitFor({ state: 'hidden' })
        await page.screenshot({
          path: `${outputDir}/sales-order-submission-fields-4k.png`,
        })
        await editor.getByRole('button', { name: /保存草稿$/ }).click()
        await editor.waitFor({ state: 'hidden' })
        assert.equal(state.saves.length, 1)
        await selectOrder()
        await page
          .getByRole('button', { name: '提交订单', exact: true })
          .click()
        await page
          .getByText('销售订单已提交，已进入审批流程', { exact: true })
          .waitFor()
        assert.equal(state.order.lifecycle_status, 'submitted')
        assert.equal(state.starts, 1, '修正后须复用已存在的接单流程')
        assert.equal(state.executions, 2)
        assert.equal(state.saves[0].tax_mode, 'INCLUSIVE')
        assert.equal(String(state.saves[0].tax_rate), '13')
        assert.equal(state.saves[0].quoted_freight_amount, undefined)
        assert.equal(String(state.saves[0].items[0].ordered_quantity), '100')
        assert.equal(String(state.saves[0].items[0].unit_price), '30')
      },
    },
  ]
}
