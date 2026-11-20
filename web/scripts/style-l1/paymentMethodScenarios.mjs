import { expect } from 'playwright/test'
import path from 'node:path'
import { RpcErrorCode } from '../../src/common/consts/errorCodes.js'
import { waitForFiniteAnimations } from './browserReadiness.mjs'

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
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { code: 0, message: 'OK', data: { methods, has_more: false, keyword_exists: false, keyword_inactive: false, can_manage: false } } }) })
        })
      },
      verify: async (page) => {
        await page.getByRole('button', { name: createLabel }).click()
        const form = page.locator('.erp-business-form-page:not([hidden])')
        const method = form.locator(`#${methodField}`)
        const days = form.locator(`#${daysField}`)
        await method.waitFor({ state: 'visible' })
        await expect(method).toHaveAttribute('role', 'combobox')
        if (key === 'supplier-dark') {
          await expect(page.getByText('付款方式读取失败，请重试')).toBeVisible()
          failRead = false
          await page.getByRole('button', { name: '重试', exact: true }).click()
        }
        await days.fill('45')
        if (await method.getAttribute('aria-expanded') !== 'true') await method.press('ArrowDown')
        await expect(page.locator('.ant-select-dropdown:visible .ant-select-item-option-content').filter({ hasText: /^跨页历史方式$/u })).toBeVisible()
        await method.fill('商业承兑')
        const savedOption = page.locator('.ant-select-dropdown:visible .ant-select-item-option-content').filter({ hasText: /^商业承兑$/u })
        await savedOption.click()
        await expectPaymentValue(method, '商业承兑')
        await expect(days).toHaveValue('45')
        await method.fill('信用证示例')
        await expect(page.getByText('没有匹配的公司共用付款方式', { exact: true })).toBeVisible()
        await expectPaymentValue(method, '商业承兑')
        await expect(days).toHaveValue('45')
        await method.fill('双方约定的超长付款方式名称'.repeat(7))
        await expect(page.locator('.ant-select-dropdown:visible')).not.toContainText('仅本次使用')
        await expectPaymentValue(method, '商业承兑')
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
    const catalogue = new Map(['aa', '银行转账', '合同约定的较长付款方式名称'.repeat(8)].map((method, index) => [method, { id: index + 1, method, is_active: true, has_been_used: method === '银行转账', version: 1 }]))
    let failRead = key === 'customer-dark'
    let failMutation = key === 'sales'
    let mutations = 0
    let pendingRead = null
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
        catalogue.clear()
        ;['aa', '银行转账', '合同约定的较长付款方式名称'.repeat(8)].forEach((method, index) => catalogue.set(method, { id: index + 1, method, is_active: true, has_been_used: method === '银行转账', version: 1 }))
        failRead = key === 'customer-dark'
        failMutation = key === 'sales'
        mutations = 0
        pendingRead = null
        await page.route('**/rpc/masterdata', async (route) => {
          const body = route.request().postDataJSON() || {}
          const params = body.params || {}
          const reply = (data, code = 0, message = 'OK') => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { code, message, data } }) })
          if (body.method === 'list_payment_methods') return reply({ methods: [...catalogue.values()].filter((item) => item.is_active && item.method.includes(params.keyword)).map((item) => item.method), has_more: false, keyword_exists: catalogue.has(params.keyword), keyword_inactive: catalogue.get(params.keyword)?.is_active === false, can_manage: !reader })
          if (body.method === 'list_payment_method_options') {
            if (pendingRead) await pendingRead
            if (failRead) { failRead = false; return reply({}, 50000, '服务暂不可用') }
            const matches = [...catalogue.values()].filter((item) => item.is_active === params.is_active && item.method.includes(params.keyword))
            return reply({ items: matches.slice(params.offset, params.offset + params.limit), has_more: matches.length > params.offset + params.limit, can_delete: !reader })
          }
          if (body.method === 'update_payment_method') {
            mutations += 1
            assert(!reader, 'reader must never manage catalogue')
            if (failMutation) { failMutation = false; return reply({}, RpcErrorCode.RESOURCE_VERSION_CONFLICT, '付款方式已被其他操作更新，请刷新后重试') }
            const previous = [...catalogue.values()].find((item) => item.id === params.id)
            assert.equal(previous.version, params.expected_version)
            const item = { ...previous, method: params.method, is_active: params.is_active, version: previous.version + 1 }
            catalogue.delete(previous.method)
            catalogue.set(item.method, item)
            return reply({ item })
          }
          if (body.method === 'create_payment_method') {
            const item = { id: Math.max(...[...catalogue.values()].map((item) => item.id)) + 1, method: params.method, is_active: true, has_been_used: false, version: 1 }
            catalogue.set(item.method, item)
            return reply({ item })
          }
          if (body.method === 'delete_payment_method') {
            const item = [...catalogue.values()].find((option) => option.id === params.id)
            assert.equal(item.has_been_used, false)
            catalogue.delete(item.method)
            return reply({ deleted_id: item.id })
          }
          return route.fallback()
        })
      },
      verify: async (page) => {
        await page.getByRole('button', { name: createLabel }).click()
        const form = page.locator('.erp-business-form-page:not([hidden])')
        const method = form.locator(`#${methodField}`)
        const days = form.locator(`#${daysField}`)
        await choosePaymentMethod(page, method, 'aa')
        await days.fill('45')
        const quote = form.locator('#price_condition_note')
        if (await quote.count()) await quote.fill('返回后应保留的报价草稿')
        if (reader) {
          await expect(form.getByRole('button', { name: '管理付款方式', exact: true })).toHaveCount(0)
          await expectPaymentValue(method, 'aa')
          assert.equal(mutations, 0)
          return
        }
        const manage = form.getByRole('button', { name: '管理付款方式', exact: true })
        await expect(manage).toBeVisible()
        const metrics = await method.evaluate((input) => {
          const row = input.closest('.erp-payment-method-field')
          const button = row.querySelector('.erp-payment-method-field__label button')
          return { row: row.getBoundingClientRect().toJSON(), input: input.closest('.ant-select').getBoundingClientRect().toJSON(), button: button.getBoundingClientRect().toJSON() }
        })
        assert(metrics.button.bottom <= metrics.input.top + 1, `management entry overlaps input ${JSON.stringify(metrics)}`)
        assert(metrics.button.right <= metrics.row.right + 1, `management entry clipped ${JSON.stringify(metrics)}`)
        const peerBaseline = await method.evaluate((input, periodID) => {
          const period = document.getElementById(periodID)
          const field = input.closest('.erp-payment-method-field').getBoundingClientRect()
          const peer = period.closest('.ant-form-item').getBoundingClientRect()
          return { sameRow: Math.abs(field.top - peer.top) <= 1, methodTop: input.closest('.ant-select').getBoundingClientRect().top, periodTop: period.closest('.ant-input-number').getBoundingClientRect().top }
        }, daysField)
        if (peerBaseline.sameRow) assert(Math.abs(peerBaseline.methodTop - peerBaseline.periodTop) <= 1, `payment fields must share a baseline ${JSON.stringify(peerBaseline)}`)

        await expect(page.locator('.ant-select-dropdown:visible')).toHaveCount(0)
        await form.screenshot({ path: path.join(outputDir, `payment-management-${key}-entry.png`) })
        await method.fill('快捷新增模拟')
        await expect(page.locator('.ant-select-dropdown:visible').getByRole('button', { name: '管理付款方式', exact: true })).toHaveCount(0)
        await page.getByRole('button', { name: '新增并选用「快捷新增模拟」', exact: true }).click()
        const quick = page.getByRole('dialog', { name: '新增付款方式', exact: true })
        await expect(quick).toBeVisible()
        await expect(quick.getByRole('textbox', { name: '新增名称', exact: true })).toBeFocused()
        await expect(quick.getByRole('textbox', { name: '新增名称', exact: true })).toHaveValue('快捷新增模拟')
        await expect(quick.getByRole('tab')).toHaveCount(0)
        await expect(quick.getByRole('textbox', { name: '搜索付款方式' })).toHaveCount(0)
        await assertPaymentModalCentered(page, quick, assert, `${key}-quick`)
        const quickSize = await quick.boundingBox()
        assert(quickSize.width <= 480 && quickSize.height < 300, `快捷新增应为紧凑单任务窗口 ${JSON.stringify(quickSize)}`)
        await quick.getByRole('button', { name: '取消', exact: true }).click()
        await expect(quick).toHaveCount(0)
        await waitForFiniteAnimations(page)
        await expect(method).toBeFocused()
        await expectPaymentValue(method, 'aa')
        await expect(days).toHaveValue('45')
        if (await method.getAttribute('aria-expanded') !== 'true') await method.press('ArrowDown')
        await method.fill('')
        await method.fill('快捷新增模拟')
        await expect(page.getByRole('button', { name: '新增并选用「快捷新增模拟」', exact: true })).toBeVisible()
        await waitForFiniteAnimations(page)
        await page.getByRole('button', { name: '新增并选用「快捷新增模拟」', exact: true }).click()
        await quick.getByRole('button', { name: '新增并选用', exact: true }).click()
        await expect(quick).toHaveCount(0)
        await expect(method).toBeFocused()
        await expectPaymentValue(method, '快捷新增模拟')
        await expect(days).toHaveValue('45')
        if (await quote.count()) await expect(quote).toHaveValue('返回后应保留的报价草稿')
        await choosePaymentMethod(page, method, 'aa')
        await method.press('Escape')
        await manage.click()
        const dialog = page.getByRole('dialog', { name: '管理付款方式' })
        await expect(dialog).toBeVisible()
        await expect(dialog.getByRole('button', { name: '改名付款方式', exact: true })).toBeDisabled()
        assert.equal(await dialog.locator('th.ant-table-selection-column').innerText(), '')
        assert.equal(await dialog.locator('tbody button').count(), 0)
        if (key === 'customer-dark') {
          await expect(dialog.getByText('付款方式读取失败，请重试')).toBeVisible()
          await dialog.getByRole('button', { name: '重试', exact: true }).click()
        }
        await selectPaymentRow(dialog, 'aa')
        await expect(dialog.getByRole('button', { name: '停用 aa', exact: true })).toBeEnabled()
        await assertPaymentModalCentered(page, dialog, assert, `${key}-manager`)
        const createPosition = await dialog.evaluate((node) => { const toolbar = node.querySelector('.erp-payment-method-manager__toolbar').getBoundingClientRect(); const button = node.querySelector('.erp-payment-method-manager__create').getBoundingClientRect(); const search = node.querySelector('.erp-payment-method-manager__search').getBoundingClientRect(); return { toolbar: toolbar.toJSON(), button: button.toJSON(), search: search.toJSON(), inFooter: !!node.querySelector('.ant-modal-footer [aria-label="新增付款方式"]') } })
        assert(!createPosition.inFooter && Math.abs(createPosition.button.right - createPosition.toolbar.right) <= 1, '新增入口应位于检索工具行右侧')
        if (width >= 680) assert(Math.abs(createPosition.button.y + createPosition.button.height / 2 - createPosition.search.y - createPosition.search.height / 2) <= 1, '宽屏新增与搜索同行居中')
        const assertRefreshStable = async (state) => {
          await expect(dialog).toHaveCSS('transform', 'none')
          await expect(dialog).toHaveCSS('opacity', '1')
          const refresh = dialog.getByRole('button', { name: '刷新', exact: true })
          await refresh.scrollIntoViewIfNeeded()
          const measure = () => dialog.evaluate((node) => {
            const modal = node.getBoundingClientRect()
            const footer = node.querySelector('.erp-payment-method-manager__footer').getBoundingClientRect()
            return { height: modal.height, footerTop: footer.top - modal.top, footerHeight: footer.height }
          })
          const before = await measure()
          let release
          pendingRead = new Promise((resolve) => { release = resolve })
          try {
            await refresh.click()
            await expect(dialog.locator('.erp-payment-method-manager__list')).toHaveAttribute('aria-busy', 'true')
            const during = await measure()
            assert(Math.abs(during.height - before.height) <= 1 && Math.abs(during.footerTop - before.footerTop) <= 1 && Math.abs(during.footerHeight - before.footerHeight) <= 1, `刷新${state}时弹窗底部不得跳动: ${JSON.stringify({ before, during })}`)
          } finally {
            pendingRead = null
            release()
          }
          await expect(dialog.locator('.erp-payment-method-manager__list')).toHaveAttribute('aria-busy', 'false')
          const after = await measure()
          assert(Math.abs(after.height - before.height) <= 1 && Math.abs(after.footerTop - before.footerTop) <= 1, `刷新${state}完成后底部应保持原位: ${JSON.stringify({ before, after })}`)
        }
        await assertRefreshStable('已有选项')
        await dialog.getByRole('group', { name: '付款方式状态' }).getByRole('button', { name: '已停用', exact: true }).click()
        await expect(dialog.getByText('没有停用的付款方式', { exact: true })).toBeVisible()
        await assertRefreshStable('空结果')
        await dialog.getByRole('group', { name: '付款方式状态' }).getByRole('button', { name: '启用', exact: true }).click()
        await selectPaymentRow(dialog, 'aa')
        await expect(dialog.getByRole('button', { name: '停用 aa', exact: true })).toBeEnabled()
        const search = dialog.getByRole('textbox', { name: '搜索付款方式', exact: true })
        await expect(search.locator('..')).toHaveClass(/erp-search-input/u)
        await search.fill('aa')
        await search.press('Enter')
        await expect(dialog.getByRole('button', { name: '停用 银行转账', exact: true })).toHaveCount(0)
        await selectPaymentRow(dialog, 'aa')
        await expect(dialog.getByRole('button', { name: '停用 aa', exact: true })).toBeEnabled()
        await dialog.getByRole('button', { name: '清除搜索', exact: true }).click()
        await selectPaymentRow(dialog, '银行转账')
        await expect(dialog.getByRole('button', { name: '停用 银行转账', exact: true })).toBeEnabled()
        const searchLayout = await dialog.locator('.erp-payment-method-manager__search').evaluate((node) => {
          const bounds = node.getBoundingClientRect()
          return [...node.children].map((child) => {
            const box = child.getBoundingClientRect()
            return { contained: box.left >= bounds.left - 1 && box.right <= bounds.right + 1 }
          })
        })
        assert(searchLayout.every((box) => box.contained), '付款方式搜索和刷新按钮不得超出弹窗内容')
        if (key === 'sales') {
          await selectPaymentRow(dialog, 'aa')
          await dialog.getByRole('button', { name: '停用 aa', exact: true }).click()
          await expect(dialog.getByText('付款方式已被其他操作更新，请刷新后重试')).toBeVisible()
          await dialog.getByRole('button', { name: '刷新', exact: true }).click()
          await selectPaymentRow(dialog, 'aa')
          await expect(dialog.getByRole('button', { name: '停用 aa', exact: true })).toBeEnabled()
        }
        await selectPaymentRow(dialog, 'aa')
        await dialog.getByRole('button', { name: '停用 aa', exact: true }).click()
        await expect(dialog.getByRole('button', { name: '停用 aa', exact: true })).toHaveCount(0)
        await dialog.getByRole('button', { name: '撤销', exact: true }).click()
        await selectPaymentRow(dialog, 'aa')
        await expect(dialog.getByRole('button', { name: '停用 aa', exact: true })).toBeEnabled()
        await selectPaymentRow(dialog, 'aa')
        await dialog.getByRole('button', { name: '停用 aa', exact: true }).click()
        await expect(dialog.getByRole('button', { name: '停用 aa', exact: true })).toHaveCount(0)
        const inactive = dialog.getByRole('group', { name: '付款方式状态' }).getByRole('button', { name: '已停用', exact: true })
        await inactive.click()
        await expect(inactive).toHaveAttribute('aria-pressed', 'true')
        await selectPaymentRow(dialog, 'aa')
        await expect(dialog.getByRole('button', { name: '启用 aa', exact: true })).toBeEnabled()
        await dialog.screenshot({ path: path.join(outputDir, `payment-management-${key}-hidden.png`) })
        await dialog.getByRole('button', { name: '返回填写', exact: true }).click()
        await expect(dialog).toHaveCount(0)
        await expectPaymentValue(method, 'aa')
        await expect(days).toHaveValue('45')
        if (await quote.count()) await expect(quote).toHaveValue('返回后应保留的报价草稿')
        if (await method.getAttribute('aria-expanded') !== 'true') await method.press('ArrowDown')
        await method.fill('')
        await method.fill('aa')
        await expect(page.getByText('没有匹配的公司共用付款方式', { exact: true })).toBeVisible()
        const dropdown = page.locator('.ant-select-dropdown:visible')
        const anchor = await method.evaluate((input) => input.closest('.ant-select').getBoundingClientRect().toJSON())
        await expect.poll(async () => Math.abs((await dropdown.boundingBox()).x - anchor.x)).toBeLessThan(2)
        const popup = await dropdown.boundingBox()
        assert(Math.abs(popup.x - anchor.x) < 2, `payment dropdown detached horizontally ${JSON.stringify({ popup, anchor })}`)
        assert(Math.abs(popup.y - anchor.bottom) < 16 || Math.abs(popup.y + popup.height - anchor.y) < 16, `payment dropdown detached vertically ${JSON.stringify({ popup, anchor })}`)
        await method.press('Escape')
        await manage.click()
        await expect(dialog.getByRole('group', { name: '付款方式状态' }).getByRole('button', { name: '启用', exact: true })).toHaveAttribute('aria-pressed', 'true')
        await inactive.click()
        await expect(inactive).toHaveAttribute('aria-pressed', 'true')
        await selectPaymentRow(dialog, 'aa')
        await dialog.getByRole('button', { name: '启用 aa', exact: true }).click()
        await expect(dialog.getByRole('button', { name: '启用 aa', exact: true })).toHaveCount(0)
        await dialog.getByRole('button', { name: '返回填写', exact: true }).click()
        await expectPaymentValue(method, 'aa')
        await expect(days).toHaveValue('45')
        if (key === 'sales') {
          await manage.click()
          await selectPaymentRow(dialog, '银行转账')
          await expect(dialog.getByRole('button', { name: '删除 银行转账', exact: true })).toBeDisabled()
          await dialog.getByRole('button', { name: '新增付款方式', exact: true }).click()
          await assertPaymentEditorLayout(dialog, assert)
          await dialog.getByRole('textbox', { name: '新增名称', exact: true }).fill('支票模拟')
          await dialog.getByRole('button', { name: '新增并选用', exact: true }).click()
          await selectPaymentRow(dialog, '支票模拟')
          await expect(dialog.getByRole('button', { name: '改名 支票模拟', exact: true })).toBeEnabled()
          await expect(dialog.locator('.ant-modal-footer [aria-label="loading"]')).toHaveCount(0)
          await selectPaymentRow(dialog, '支票模拟')
          await dialog.getByRole('button', { name: '改名 支票模拟', exact: true }).click()
          await dialog.getByRole('textbox', { name: '修改名称', exact: true }).fill('支票改名')
          await dialog.getByRole('button', { name: '保存名称', exact: true }).click()
          await selectPaymentRow(dialog, '支票改名')
          await expect(dialog.getByRole('button', { name: '改名 支票改名', exact: true })).toBeEnabled()
          await expect(dialog.locator('.ant-modal-footer [aria-label="loading"]')).toHaveCount(0)
          await dialog.getByRole('button', { name: '返回填写', exact: true }).click()
          await expectPaymentValue(method, '支票模拟')
          await form.getByRole('button', { name: '本单也使用新名称', exact: true }).click()
          await expectPaymentValue(method, '支票改名')
          await manage.click()
          await selectPaymentRow(dialog, '支票改名')
          await dialog.getByRole('button', { name: '删除 支票改名', exact: true }).click()
          await dialog.getByRole('button', { name: '确认删除', exact: true }).click()
          await expect(dialog.getByRole('button', { name: '改名 支票改名', exact: true })).toHaveCount(0)
          await expect(dialog.locator('.ant-modal-footer [aria-label="loading"]')).toHaveCount(0)
          await dialog.getByRole('button', { name: '返回填写', exact: true }).click()
          await expectPaymentValue(method, '支票改名')
          if (await quote.count()) await expect(quote).toHaveValue('返回后应保留的报价草稿')
        }
        await assertNoHorizontalOverflow(page)
      },
    }
  })
  const maintenanceOnly = {
    name: 'payment-maintainer-without-delete',
    path: '/erp/master/partners/customers',
    auth: 'admin',
    adminProfile: { is_super_admin: false, permissions: ['customer.read', 'payment_method.manage'], roles: [{ role_key: 'boss', name: '维护者' }] },
    effectiveSession: { ...customerRuntimeEffectiveSession, actions: [...customerRuntimeEffectiveSession.actions.filter((action) => action !== 'payment_method.delete'), 'payment_method.manage'] },
    viewport: { width: 1440, height: 900 },
    beforeNavigate: async (page) => {
      await page.route('**/rpc/masterdata', async (route) => {
        const body = route.request().postDataJSON() || {}
        let data
        if (body.method === 'list_payment_methods') data = { methods: ['现金'], has_more: false, keyword_exists: false, keyword_inactive: false, can_manage: true }
        else if (body.method === 'list_payment_method_options') data = { items: [{ id: 1, method: '现金', is_active: true, has_been_used: false, version: 1 }], has_more: false, can_delete: false }
        else return route.fallback()
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { code: 0, message: 'OK', data } }) })
      })
    },
    verify: async (page) => {
      await page.getByRole('button', { name: '管理付款方式', exact: true }).click()
      const dialog = page.getByRole('dialog', { name: '管理付款方式', exact: true })
      await selectPaymentRow(dialog, '现金')
      await expect(dialog.getByRole('button', { name: /删除/u })).toHaveCount(0)
      await expect(dialog.getByRole('button', { name: '新增付款方式', exact: true })).toBeEnabled()
      await expect(dialog.getByRole('button', { name: '改名 现金', exact: true })).toBeEnabled()
      await expect(dialog.getByRole('button', { name: '停用 现金', exact: true })).toBeEnabled()
      await dialog.screenshot({ path: path.join(outputDir, 'payment-maintainer-without-delete.png') })
    },
  }
  return [...inputScenarios, ...managementScenarios, maintenanceOnly, ...createPaymentGrowthScenarios({ assert, assertNoHorizontalOverflow, outputDir, customerRuntimeEffectiveSession })]
}

async function assertPaymentModalCentered(page, dialog, assert, label) {
  await waitForFiniteAnimations(page, '.erp-payment-method-modal, .erp-payment-method-quick-create')
  const metrics = await dialog.evaluate((node) => {
    const modal = node.getBoundingClientRect()
    const wrap = node.closest('.ant-modal-wrap')
    const bounds = wrap.getBoundingClientRect()
    return {
      centered: wrap.classList.contains('ant-modal-centered'),
      offsetX: modal.x + modal.width / 2 - bounds.x - bounds.width / 2,
      offsetY: modal.y + modal.height / 2 - bounds.y - bounds.height / 2,
      fits: modal.left >= bounds.left - 1 && modal.right <= bounds.right + 1 && modal.top >= bounds.top - 1 && modal.bottom <= bounds.bottom + 1,
    }
  })
  assert(metrics.centered && Math.abs(metrics.offsetX) <= 1 && Math.abs(metrics.offsetY) <= 1 && metrics.fits, `${label} 应在所属工作区居中且保持可见 ${JSON.stringify(metrics)}`)
}

async function selectPaymentRow(dialog, name) {
  const radio = dialog.getByRole('radio', { name: `选择 ${name}`, exact: true })
  await expect(radio).toBeEnabled()
  await radio.locator('xpath=ancestor::tr').getByRole('cell').last().click()
  await expect(radio).toBeChecked()
}

async function assertPaymentEditorLayout(dialog, assert) {
  const metrics = await dialog.evaluate((node) => {
    const input = node.querySelector('.erp-payment-method-manager__editor-field input').getBoundingClientRect()
    const footer = node.querySelector('.erp-payment-method-manager__footer')
    const buttons = [...footer.querySelectorAll('button')].map((button) => button.getBoundingClientRect().toJSON())
    return { input: input.toJSON(), buttons, footer: footer.getBoundingClientRect().toJSON() }
  })
  assert.equal(metrics.buttons.length, 2, '编辑操作集中在底部取消与保存')
  for (const button of metrics.buttons) {
    assert(button.top >= metrics.input.bottom, `保存操作应位于输入下方的固定底栏 ${JSON.stringify(metrics)}`)
    assert(button.left >= metrics.footer.left - 1 && button.right <= metrics.footer.right + 1, '编辑操作不得撑出底栏')
  }
}

function createPaymentGrowthScenarios({ assert, assertNoHorizontalOverflow, outputDir, customerRuntimeEffectiveSession }) {
  return [
    ['customer', '/erp/master/partners/customers', 1440, 'light'],
    ['supplier-narrow', '/erp/master/partners/suppliers', 390, 'dark'],
  ].map(([key, url, width, themeMode]) => {
    const catalogue = Array.from({ length: 1000 }, (_, index) => ({ id: index + 1, method: `模拟方式${String(index).padStart(4, '0')}`, is_active: index < 800, has_been_used: index === 0, version: 1 }))
    catalogue[1].method = '约定的超长付款方式名称'.repeat(10)
    const reads = []
    return {
      name: `payment-growth-${key}`,
      path: url,
      auth: 'admin',
      adminProfile: { is_super_admin: true },
      effectiveSession: { ...customerRuntimeEffectiveSession, actions: [...customerRuntimeEffectiveSession.actions, 'payment_method.manage'] },
      themeMode,
      viewport: { width, height: 900 },
      beforeNavigate: async (page) => {
        await page.route('**/rpc/masterdata', async (route) => {
          const body = route.request().postDataJSON() || {}
          const params = body.params || {}
          const reply = (data) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { code: 0, message: 'OK', data } }) })
          if (body.method === 'list_payment_methods') return reply({ methods: [], has_more: true, keyword_exists: false, keyword_inactive: false, can_manage: true })
          if (body.method !== 'list_payment_method_options') return route.fallback()
          reads.push({ ...params })
          const matches = catalogue.filter((item) => item.is_active === params.is_active && item.method.includes(params.keyword))
          return reply({ items: matches.slice(params.offset, params.offset + params.limit), has_more: matches.length > params.offset + params.limit, can_delete: true })
        })
      },
      verify: async (page) => {
        await page.getByRole('button', { name: '管理付款方式', exact: true }).click()
        const dialog = page.getByRole('dialog', { name: '管理付款方式', exact: true })
        const rows = dialog.locator('.erp-payment-method-manager__row')
        await expect(dialog).toHaveCSS('transform', 'none')
        await expect(dialog).toHaveCSS('opacity', '1')
        await expect(rows).toHaveCount(20)
        assert.equal(reads.at(-1).limit, 20)
        await assertPaymentModalCentered(page, dialog, assert, `${key}-long-list`)
        const regions = await dialog.evaluate((node) => {
          const body = node.querySelector('.ant-modal-body')
          const footer = node.querySelector('.erp-payment-method-manager__footer')
          return { footerInBody: body.contains(footer), bodyOverflow: getComputedStyle(body).overflowY, listScrolls: node.querySelector('.erp-payment-method-manager__list').scrollHeight > node.querySelector('.erp-payment-method-manager__list').clientHeight, scrollWidth: node.scrollWidth, width: node.clientWidth, box: node.getBoundingClientRect().toJSON(), overflows: [...node.querySelectorAll('*')].filter((child) => child.scrollWidth > child.clientWidth + 1).slice(0, 12).map((child) => ({ className: child.className, width: child.clientWidth, scrollWidth: child.scrollWidth, whiteSpace: getComputedStyle(child).whiteSpace })) }
        })
        assert.equal(regions.footerInBody, false)
        assert.equal(regions.bodyOverflow, 'auto')
        assert.equal(regions.listScrolls, true)
        assert(regions.scrollWidth <= regions.width + 1, `长名称不得撑宽弹窗 ${JSON.stringify(regions)}`)
        await dialog.getByRole('button', { name: '下一页', exact: true }).click()
        await expect(dialog.getByText('第 2 页', { exact: true })).toBeVisible()
        await expect(rows).toHaveCount(20)
        assert.equal(reads.at(-1).offset, 20)
        await expect(dialog.getByRole('button', { name: '改名 模拟方式0000', exact: true })).toHaveCount(0)
        await dialog.getByRole('group', { name: '付款方式状态' }).getByRole('button', { name: '已停用', exact: true }).click()
        await expect(rows).toHaveCount(20)
        await expect(dialog.getByText('第 1 页', { exact: true })).toBeVisible()
        await dialog.getByRole('group', { name: '付款方式状态' }).getByRole('button', { name: '启用', exact: true }).click()
        await expect(dialog.getByText('第 2 页', { exact: true })).toBeVisible()
        await expect(rows).toHaveCount(20)
        const search = dialog.getByRole('textbox', { name: '搜索付款方式', exact: true })
        await search.fill('模拟方式0799')
        await search.press('Enter')
        await expect(rows).toHaveCount(1)
        await expect(dialog.getByRole('button', { name: '下一页', exact: true })).toHaveCount(0)
        await dialog.getByRole('button', { name: '清除搜索', exact: true }).click()
        await expect(rows).toHaveCount(20)
        await dialog.getByRole('button', { name: '新增付款方式', exact: true }).click()
        if (width > 520) await assertPaymentEditorLayout(dialog, assert)
        else {
          const input = dialog.getByRole('textbox', { name: '新增名称', exact: true })
          const save = dialog.getByRole('button', { name: '保存', exact: true })
          const bounds = { input: await input.boundingBox(), save: await save.boundingBox() }
          assert(bounds.save.y >= bounds.input.y + bounds.input.height - 1, `窄屏编辑按钮应在输入下方 ${JSON.stringify(bounds)}`)
        }
        await dialog.getByRole('button', { name: '取消', exact: true }).click()
        if (width < 520) {
          await page.setViewportSize({ width: 360, height: 320 })
          await assertPaymentModalCentered(page, dialog, assert, `${key}-short-viewport`)
          await expect(dialog.getByRole('button', { name: '关闭', exact: true })).toBeInViewport()
          await expect(dialog.getByRole('button', { name: '下一页', exact: true })).toBeInViewport()
          await dialog.getByRole('button', { name: '下一页', exact: true }).click()
          await expect(dialog.getByText('第 2 页', { exact: true })).toBeVisible()
          const body = dialog.locator('.ant-modal-body')
          assert(await dialog.locator('.erp-payment-method-manager__list').evaluate((node) => node.clientHeight >= 100), '低窗口仍须保留可操作的列表区域')
          const bodyBox = await body.boundingBox()
          await page.mouse.move(bodyBox.x + bodyBox.width / 2, bodyBox.y + 8)
          await page.mouse.wheel(0, 600)
          await selectPaymentRow(dialog, '模拟方式0020')
          await expect(dialog.getByRole('button', { name: '改名 模拟方式0020', exact: true })).toBeEnabled()
          await expect(dialog.getByRole('button', { name: '关闭', exact: true })).toBeInViewport()
          await dialog.screenshot({ path: path.join(outputDir, `payment-growth-${key}-short.png`) })
          await page.setViewportSize({ width, height: 900 })
        }
        await dialog.screenshot({ path: path.join(outputDir, `payment-growth-${key}.png`) })
        await dialog.getByRole('button', { name: '关闭', exact: true }).click()
        await expect(dialog).toHaveCount(0)
        assert(reads.every((request) => request.limit === 20))
        await assertNoHorizontalOverflow(page)
      },
    }
  })
}

async function expectPaymentValue(control, value) {
  await expect.poll(() => control.evaluate((input) => input.closest('.ant-select')?.querySelector('.ant-select-selection-item')?.textContent || '')).toBe(value)
}

async function choosePaymentMethod(page, control, value) {
  if (await control.getAttribute('aria-expanded') !== 'true') await control.press('ArrowDown')
  await control.fill(value)
  await page.locator('.ant-select-dropdown:visible .ant-select-item-option-content').filter({ hasText: value }).click()
  await expectPaymentValue(control, value)
}
