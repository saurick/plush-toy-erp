import { expect } from 'playwright/test'
import path from 'node:path'
import { RpcErrorCode } from '../../src/common/consts/errorCodes.js'
import { verifyMobileNavigationMotion } from './slidingMotionAssertions.mjs'

export function createPaymentMethodScenarios({ assert, assertNoHorizontalOverflow, outputDir, customerRuntimeEffectiveSession }) {
  const inputScenarios = [
    ['supplier', '/erp/master/partners/suppliers', '新建供应商', 'default_payment_method', 'default_payment_term_days', 'light', 1440],
    ['purchase', '/erp/purchase/accessories', '新建采购订单', 'payment_method', 'payment_term_days', 'light', 1440],
    ['customer', '/erp/master/partners/customers', '新建客户', 'default_payment_method', 'default_payment_term_days', 'light', 1440],
    ['sales', '/erp/sales/project-orders/sales-orders', '新建订单', 'payment_method', 'payment_term_days', 'light', 1440],
    ['supplier-dark', '/erp/master/partners/suppliers', '新建供应商', 'default_payment_method', 'default_payment_term_days', 'dark', 768],
    ['purchase-dark', '/erp/purchase/accessories', '新建采购订单', 'payment_method', 'payment_term_days', 'dark', 768],
  ].map(([key, url, createLabel, methodField, daysField, themeMode, width]) => {
    let failRead = key === 'supplier-dark'
    return {
      name: `payment-method-${key}`,
      path: url,
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      themeMode,
      viewport: { width, height: 900 },
      beforeNavigate: async (page) => {
        await page.route('**/rpc/masterdata', async (route) => {
          const body = route.request().postDataJSON() || {}
          if (body.method !== 'list_payment_methods') return route.fallback()
          if (failRead) {
            return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { code: 50000, message: '服务暂不可用', data: {} } }) })
          }
          const methods = ['商业承兑', '跨页历史方式'].filter((value) => value.includes(String(body.params?.keyword || '').trim()))
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { code: 0, message: 'OK', data: { methods, has_more: false, keyword_not_recommended: false, can_manage: false } } }) })
        })
      },
      verify: async (page) => {
        await page.getByRole('button', { name: createLabel }).click()
        const form = page.locator('.erp-business-form-page:not([hidden])')
        const method = form.locator(`#${methodField}`)
        const days = form.locator(`#${daysField}`)
        await method.waitFor({ state: 'visible' })
        await expect(method).toHaveAttribute('maxlength', '128')
        if (key === 'supplier-dark') {
          await expect(page.getByText('历史方式读取失败，仍可直接输入')).toBeVisible()
          failRead = false
          await page.getByRole('button', { name: '重试', exact: true }).click()
        }
        await days.fill('45')
        await method.click()
        await expect(page.locator('.ant-select-dropdown:visible .ant-select-item-option-content').filter({ hasText: /^跨页历史方式$/u })).toBeVisible()
        await method.fill('商业承兑')
        const savedOption = page.locator('.ant-select-dropdown:visible .ant-select-item-option-content').filter({ hasText: /^商业承兑$/u })
        await savedOption.click()
        await expect(method).toHaveValue('商业承兑')
        await expect(days).toHaveValue('45')
        await method.fill('信用证示例')
        await page.locator('.ant-select-dropdown:visible .ant-select-item-option-content').filter({ hasText: '使用「信用证示例」' }).click()
        await expect(method).toHaveValue('信用证示例')
        await expect(days).toHaveValue('45')
        await method.fill('')
        await expect(method).toHaveValue('')
        await expect(days).toHaveValue('45')
        await method.fill('双方约定的超长付款方式名称'.repeat(7))
        await expect(page.locator('.ant-select-dropdown:visible .erp-payment-method-input__new-option')).toBeVisible()
        await days.fill('0')
        await days.press('Tab')
        await expect(days).toHaveValue('0')
        const geometry = await method.evaluate((input) => {
          const shell = input.closest('.ant-select')
          const region = input.closest('.erp-business-form-section')
          return { height: shell.getBoundingClientRect().height, width: shell.getBoundingClientRect().width, available: region?.clientWidth || document.documentElement.clientWidth }
        })
        assert(geometry.height >= 30 && geometry.height <= 44, `payment method height ${geometry.height}`)
        assert(geometry.width <= geometry.available, 'payment method exceeds its section')
        await assertNoHorizontalOverflow(page)
        await form.screenshot({ path: path.join(outputDir, `payment-method-${key}.png`) })
      },
    }
  })
  const managementScenarios = [
    ['sales', '/erp/sales/project-orders/sales-orders', '新建订单', 'payment_method', 'payment_term_days', 'light', 1440],
    ['supplier', '/erp/master/partners/suppliers', '新建供应商', 'default_payment_method', 'default_payment_term_days', 'light', 1440],
    ['customer-dark', '/erp/master/partners/customers', '新建客户', 'default_payment_method', 'default_payment_term_days', 'dark', 768],
    ['purchase-narrow', '/erp/purchase/accessories', '新建采购订单', 'payment_method', 'payment_term_days', 'light', 390],
    ['reader', '/erp/sales/project-orders/sales-orders', '新建订单', 'payment_method', 'payment_term_days', 'light', 1440],
  ].map(([key, url, createLabel, methodField, daysField, themeMode, width]) => {
    const reader = key === 'reader'
    const readerActions = ['sales_order.read', 'sales_order.create', 'sales_order.update', 'sales_order_item.read', 'customer.read', 'product.read', 'product_sku.read', 'field.sales_commercial.read']
    const recommendations = new Map(['aa', '银行转账', '合同约定的较长付款方式名称'.repeat(8)].map((method) => [method, { method, is_recommended: true, version: 0 }]))
    let failRead = key === 'customer-dark'
    let failMutation = key === 'sales'
    let mutations = 0
    return {
      name: `payment-management-${key}`,
      path: url,
      auth: 'admin',
      adminProfile: reader ? { is_super_admin: false, permissions: readerActions, roles: [{ role_key: 'sales', name: '业务' }] } : { is_super_admin: true },
      effectiveSession: {
        ...customerRuntimeEffectiveSession,
        actions: [...customerRuntimeEffectiveSession.actions.filter((action) => action !== 'payment_method.manage'), ...(reader ? readerActions : ['payment_method.manage'])],
      },
      themeMode,
      viewport: { width, height: 900 },
      beforeNavigate: async (page) => {
        await page.route('**/rpc/masterdata', async (route) => {
          const body = route.request().postDataJSON() || {}
          const params = body.params || {}
          const reply = (data, code = 0, message = 'OK') => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { code, message, data } }) })
          if (body.method === 'list_payment_methods') return reply({ methods: [...recommendations.values()].filter((item) => item.is_recommended && item.method.includes(params.keyword)).map((item) => item.method), has_more: false, keyword_not_recommended: recommendations.get(params.keyword)?.is_recommended === false, can_manage: !reader })
          if (body.method === 'list_payment_method_recommendations') {
            if (failRead) { failRead = false; return reply({}, 50000, '服务暂不可用') }
            return reply({ items: [...recommendations.values()].filter((item) => item.is_recommended === params.is_recommended && item.method.includes(params.keyword)), has_more: false })
          }
          if (body.method === 'set_payment_method_recommendation') {
            mutations += 1
            assert(!reader, 'reader must never manage recommendations')
            if (failMutation) { failMutation = false; return reply({}, RpcErrorCode.RESOURCE_VERSION_CONFLICT, '付款方式推荐状态已变化，请刷新后重试') }
            const previous = recommendations.get(params.method)
            assert.equal(previous.version, params.expected_version)
            const item = { method: params.method, is_recommended: params.is_recommended, version: previous.version + 1 }
            recommendations.set(item.method, item)
            return reply({ item })
          }
          return route.fallback()
        })
      },
      verify: async (page) => {
        await page.getByRole('button', { name: createLabel }).click()
        const form = page.locator('.erp-business-form-page:not([hidden])')
        const method = form.locator(`#${methodField}`)
        const days = form.locator(`#${daysField}`)
        await method.fill('aa')
        await days.fill('45')
        const quote = form.locator('#price_condition_note')
        if (await quote.count()) await quote.fill('返回后应保留的报价草稿')
        if (reader) {
          await expect(form.getByRole('button', { name: '管理付款方式', exact: true })).toHaveCount(0)
          await expect(method).toHaveValue('aa')
          assert.equal(mutations, 0)
          return
        }
        const manage = form.getByRole('button', { name: '管理付款方式', exact: true })
        await expect(manage).toBeVisible()
        const metrics = await method.evaluate((input) => {
          const row = input.closest('.erp-payment-method-input')
          const button = row.querySelector('button')
          return { row: row.getBoundingClientRect().toJSON(), input: input.closest('.ant-select').getBoundingClientRect().toJSON(), button: button.getBoundingClientRect().toJSON() }
        })
        assert(metrics.input.right <= metrics.button.left + 1 || metrics.input.bottom <= metrics.button.top + 1, `management entry overlaps input ${JSON.stringify(metrics)}`)
        assert(metrics.button.right <= metrics.row.right + 1, `management entry clipped ${JSON.stringify(metrics)}`)
        await expect(page.locator('.ant-select-dropdown:visible')).toHaveCount(0)
        await form.screenshot({ path: path.join(outputDir, `payment-management-${key}-entry.png`) })
        await manage.click()
        const dialog = page.getByRole('dialog', { name: '管理付款方式' })
        await expect(dialog).toBeVisible()
        if (key === 'customer-dark') {
          await expect(dialog.getByText('付款方式读取失败，已保留上次结果')).toBeVisible()
          await dialog.getByRole('button', { name: '重试', exact: true }).click()
        }
        await expect(dialog.getByRole('button', { name: '不再推荐 aa', exact: true })).toBeEnabled()
        const search = dialog.getByRole('textbox', { name: '搜索付款方式', exact: true })
        await expect(search.locator('..')).toHaveClass(/erp-search-input/u)
        await search.fill('aa')
        await search.press('Enter')
        await expect(dialog.getByRole('button', { name: '不再推荐 银行转账', exact: true })).toHaveCount(0)
        await expect(dialog.getByRole('button', { name: '不再推荐 aa', exact: true })).toBeEnabled()
        await dialog.getByRole('button', { name: '清除搜索', exact: true }).click()
        await expect(dialog.getByRole('button', { name: '不再推荐 银行转账', exact: true })).toBeEnabled()
        const searchLayout = await dialog.locator('.erp-payment-method-manager__search').evaluate((node) => {
          const bounds = node.getBoundingClientRect()
          return [...node.children].map((child) => {
            const box = child.getBoundingClientRect()
            return { contained: box.left >= bounds.left - 1 && box.right <= bounds.right + 1 }
          })
        })
        assert(searchLayout.every((box) => box.contained), '付款方式搜索和刷新按钮不得超出弹窗内容')
        if (key === 'sales') {
          await dialog.getByRole('button', { name: '不再推荐 aa', exact: true }).click()
          await expect(dialog.getByText('付款方式推荐状态已变化，请刷新后重试')).toBeVisible()
          await dialog.getByRole('button', { name: '刷新', exact: true }).click()
          await expect(dialog.getByRole('button', { name: '不再推荐 aa', exact: true })).toBeEnabled()
        }
        await dialog.getByRole('button', { name: '不再推荐 aa', exact: true }).click()
        await expect(dialog.getByRole('button', { name: '不再推荐 aa', exact: true })).toHaveCount(0)
        await dialog.getByRole('button', { name: '撤销', exact: true }).click()
        await expect(dialog.getByRole('button', { name: '不再推荐 aa', exact: true })).toBeEnabled()
        await dialog.getByRole('button', { name: '不再推荐 aa', exact: true }).click()
        await expect(dialog.getByRole('button', { name: '不再推荐 aa', exact: true })).toHaveCount(0)
        await verifyMobileNavigationMotion(page, assert, '.erp-payment-method-manager .erp-sliding-tabs', 1)
        await expect(dialog.getByRole('button', { name: '恢复推荐 aa', exact: true })).toBeEnabled()
        await dialog.screenshot({ path: path.join(outputDir, `payment-management-${key}-hidden.png`) })
        await dialog.getByRole('button', { name: '返回填写', exact: true }).click()
        await expect(dialog).toHaveCount(0)
        await expect(method).toHaveValue('aa')
        await expect(days).toHaveValue('45')
        if (await quote.count()) await expect(quote).toHaveValue('返回后应保留的报价草稿')
        await method.click()
        await method.fill('')
        await method.fill('aa')
        await expect(page.getByText('保存不会恢复推荐')).toBeVisible()
        const popup = await page.locator('.ant-select-dropdown:visible').boundingBox()
        const anchor = await method.evaluate((input) => input.closest('.ant-select').getBoundingClientRect().toJSON())
        assert(Math.abs(popup.x - anchor.x) < 2, `payment dropdown detached horizontally ${JSON.stringify({ popup, anchor })}`)
        assert(Math.abs(popup.y - anchor.bottom) < 16 || Math.abs(popup.y + popup.height - anchor.y) < 16, `payment dropdown detached vertically ${JSON.stringify({ popup, anchor })}`)
        await method.press('Escape')
        await manage.click()
        await expect(dialog.getByRole('tab', { name: '可选', exact: true })).toHaveAttribute('aria-selected', 'true')
        await verifyMobileNavigationMotion(page, assert, '.erp-payment-method-manager .erp-sliding-tabs', 1, true)
        await dialog.getByRole('button', { name: '恢复推荐 aa', exact: true }).click()
        await expect(dialog.getByRole('button', { name: '恢复推荐 aa', exact: true })).toHaveCount(0)
        await dialog.getByRole('button', { name: '返回填写', exact: true }).click()
        await expect(method).toHaveValue('aa')
        await expect(days).toHaveValue('45')
        await assertNoHorizontalOverflow(page)
      },
    }
  })
  return [...inputScenarios, ...managementScenarios]
}
