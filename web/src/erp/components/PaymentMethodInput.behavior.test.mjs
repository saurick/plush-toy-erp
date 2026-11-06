import { act, createElement as h } from 'react'
import assert from 'node:assert/strict'
import test from 'node:test'
import { businessFormHarness, deferredFormRequest } from '../../../scripts/test/businessFormHarness.mjs'

const settleSearch = () => act(async () => new Promise((resolve) => setTimeout(resolve, 220)))

async function paymentForm(t, rpc, profile = {}) {
  let currentProfile = profile
  const ui = await businessFormHarness(t, { rpc: async (...args) => {
    const result = await rpc(...args)
    if (!result.data) return result
    const permission = args[0] === 'list_payment_methods' ? 'payment_method.manage' : args[0] === 'list_payment_method_options' ? 'payment_method.delete' : null
    if (!permission) return result
    const allowed = currentProfile?.is_super_admin === true || Boolean(currentProfile?.permissions?.includes(permission) && currentProfile?.effective_session?.actions?.includes(permission))
    return { ...result, data: { ...result.data, [permission === 'payment_method.manage' ? 'can_manage' : 'can_delete']: allowed } }
  } })
  const [{ Form, InputNumber, Button }, { PaymentMethodField }] = await Promise.all([
    import('antd'), import('./PaymentMethodInput.jsx'),
  ])
  const { BusinessPageContext } = await import('../hooks/useBusinessPageContext.js')
  let form
  function Example() {
    [form] = Form.useForm()
    return h(Form, { form, initialValues: { payment_method: '银行转账', payment_term_days: 30, note: '原报价备注' } }, h(PaymentMethodField, { name: 'payment_method', label: '付款方式' }), h(Form.Item, { name: 'payment_term_days', label: '付款周期' }, h(InputNumber)), h(Form.Item, { name: 'note', label: '报价备注' }, h('textarea')), h(Button, { onClick: () => form.resetFields() }, '取消修改'))
  }
  const render = () => ui.render(h(BusinessPageContext.Provider, { value: { adminProfile: currentProfile } }, h(Example)))
  await render()
  await settleSearch()
  return { ui, form: () => form, setProfile: async (next) => { currentProfile = next; await render(); await settleSearch() } }
}

test('payment methods select maintained choices and keep search text separate from the draft', async (t) => {
  const choices = ['银行转账', '商业承兑', '跨页历史方式']
  const { ui, form } = await paymentForm(t, (_method, params) => ({ data: { methods: choices.filter((value) => value.includes(params.keyword)), has_more: false, keyword_exists: choices.includes(params.keyword), keyword_inactive: false } }))
  await ui.options('付款方式')
  await ui.fill('付款方式', '未建档方式')
  await settleSearch()
  assert.equal(form().getFieldValue('payment_method'), '银行转账')
  assert.equal((await ui.options('付款方式')).length, 0)
  assert.equal(document.body.textContent.includes('仅本次使用'), false)
  await ui.fill('付款方式', '商业承兑')
  await settleSearch()
  await ui.click((await ui.options('付款方式')).find((option) => option.textContent === '商业承兑'))
  assert.equal(form().getFieldValue('payment_method'), '商业承兑')
  assert.equal(form().getFieldValue('payment_term_days'), 30)
  await act(async () => document.querySelector('.erp-payment-method-input__control .ant-select-clear').dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true })))
  assert.equal(form().getFieldValue('payment_method'), '')
  assert.equal(form().getFieldValue('payment_term_days'), 30)
})

test('failed payment catalogue reads keep the typed method and period and support retry without exposing raw errors', async (t) => {
  let fail = true
  const { ui, form } = await paymentForm(t, () => {
    if (fail) throw new Error('internal SQL details')
    return { data: { methods: ['信用证'], has_more: false, keyword_exists: false, keyword_inactive: false } }
  })
  await ui.options('付款方式')
  await ui.fill('付款方式', '信用证')
  await settleSearch()
  assert.equal(document.body.textContent.includes('付款方式读取失败'), true)
  assert.equal(document.body.textContent.includes('internal SQL details'), false)
  assert.equal(form().getFieldValue('payment_method'), '银行转账')
  assert.equal(form().getFieldValue('payment_term_days'), 30)
  fail = false
  await ui.click(ui.button('重试'))
  await settleSearch()
  assert.equal((await ui.options('付款方式')).some((option) => option.textContent === '信用证'), true)
})

test('late payment suggestions cannot replace a newer search or reappear after closing', async (t) => {
  const requests = []
  const { ui, form } = await paymentForm(t, (method, params, options) => {
    const request = deferredFormRequest()
    requests.push({ ...request, keyword: params.keyword, signal: options.signal })
    return request.promise
  })
  await ui.options('付款方式')
  await settleSearch()
  await ui.fill('付款方式', '商业')
  await settleSearch()
  const old = requests.at(-1)
  await ui.fill('付款方式', '信用')
  await settleSearch()
  const current = requests.at(-1)
  assert.equal(old.signal.aborted, true)
  await act(async () => current.resolve({ data: { methods: ['信用证'], has_more: false, keyword_exists: false, keyword_inactive: false } }))
  await act(async () => old.resolve({ data: { methods: ['商业承兑'], has_more: false, keyword_exists: false, keyword_inactive: false } }))
  assert.equal(form().getFieldValue('payment_method'), '银行转账')
  const options = await ui.options('付款方式')
  assert.equal(options.some((option) => option.textContent === '信用证'), true)
  assert.equal(options.some((option) => option.textContent === '商业承兑'), false)
  await ui.click(ui.button('取消修改'))
  await act(async () => requests[0].resolve({ data: { methods: ['过期方式'], has_more: false, keyword_exists: false, keyword_inactive: false } }))
  assert.equal(form().getFieldValue('payment_method'), '银行转账')
  assert.equal(document.querySelectorAll('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').length, 0)
})

const managerProfile = { id: 1, permissions: ['payment_method.manage', 'payment_method.delete'], effective_session: { actions: ['payment_method.manage', 'payment_method.delete'] } }
const managementTab = (name) => [...document.querySelectorAll('[role="tab"]')].find((node) => node.textContent === name)

test('maintenance without separate delete access can create and rename but has no delete command', async (t) => {
  const backend = catalogueRPC()
  const profile = { id: 2, permissions: ['payment_method.manage'], effective_session: { actions: ['payment_method.manage'] } }
  const { ui } = await paymentForm(t, backend.rpc, profile)
  await ui.click(ui.button('管理付款方式'))
  await settleSearch()
  await selectManagerMethod(ui, 'aa')
  assert.equal(Boolean(document.querySelector('[aria-label="删除 aa"]')), false)
  assert.equal(document.querySelector('[aria-label="改名 aa"]').disabled, false)
  assert.equal(document.querySelector('[aria-label="新增付款方式"]').disabled, false)
  assert.equal(backend.mutations.length, 0)
})

test('management list rejects a missing or nonboolean authoritative delete flag', async (t) => {
  await businessFormHarness(t, { rpc: async () => ({ data: { items: [], has_more: false, can_delete: 'true' } }) })
  const { listPaymentMethodOptions } = await import('../api/masterDataOrderApi.mjs')
  await assert.rejects(listPaymentMethodOptions({ is_active: true }), /付款方式读取失败/u)
})

test('the payment dropdown keeps creation but uses only the fixed field entry for management', async (t) => {
  const backend = catalogueRPC()
  const { ui, form } = await paymentForm(t, backend.rpc, managerProfile)
  const popup = () => document.querySelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')
  await ui.options('付款方式')
  assert.equal([...popup().querySelectorAll('button')].some((button) => button.textContent === '管理付款方式'), false)
  assert.equal(document.querySelector('.erp-payment-method-field__label').querySelectorAll('button').length, 1)
  await ui.fill('付款方式', '未建档的新方式')
  await settleSearch()
  assert.equal([...popup().querySelectorAll('button')].some((button) => button.textContent === '管理付款方式'), false)
  await ui.click(ui.button('新增并选用「未建档的新方式」'))
  assert.equal(document.querySelector('input[aria-label="新增名称"]').value, '未建档的新方式')
  await ui.click(ui.button('取消'))
  await ui.click(document.querySelector('.erp-payment-method-field__label button'))
  await settleSearch()
  assert.equal(Boolean(document.querySelector('.erp-payment-method-modal')), true)
  assert.equal(form().getFieldValue('payment_method'), '银行转账')
  assert.equal(backend.mutations.length, 0)
})
const selectManagerMethod = async (ui, name) => {
  const radio = [...document.querySelectorAll('.erp-payment-method-manager input[type="radio"]')].find((node) => node.getAttribute('aria-label') === `选择 ${name}`)
  assert.equal(Boolean(radio), true, `missing catalogue row ${name}`)
  await ui.click(radio.closest('tr'))
}

test('catalogue row selection has a blank header and scopes the single top action group', async (t) => {
  const backend = catalogueRPC()
  const { ui, form } = await paymentForm(t, backend.rpc, managerProfile)
  await ui.click(ui.button('管理付款方式'))
  await settleSearch()
  const list = () => document.querySelector('.erp-payment-method-manager__list')
  assert.equal(list().querySelector('th.ant-table-selection-column').textContent.trim(), '')
  assert.equal(list().querySelectorAll('tbody button').length, 0)
  assert.equal(document.querySelector('button[aria-label="改名付款方式"]').disabled, true)
  const used = document.querySelector('input[aria-label="选择 银行转账"]')
  await ui.click(used.closest('tr').querySelector('td:last-child'))
  assert.equal(used.checked, true, 'the status cell also selects the whole record')
  assert.equal(document.querySelector('[aria-label="改名 银行转账"]').disabled, false)
  assert.equal(document.querySelector('[aria-label="停用 银行转账"]').disabled, false)
  assert.equal(document.querySelector('[aria-label="删除 银行转账"]').disabled, true)
  await ui.click(ui.button('取消选择'))
  assert.equal(document.querySelector('button[aria-label="改名付款方式"]').disabled, true)
  await selectManagerMethod(ui, 'aa')
  await ui.fill(document.querySelector('input[aria-label="搜索付款方式"]'), '银行')
  await ui.click(ui.button('搜索'))
  await settleSearch()
  assert.equal(Boolean(document.querySelector('[aria-label="删除 aa"]')), false)
  assert.equal(document.querySelector('button[aria-label="删除付款方式"]').disabled, true)
  await selectManagerMethod(ui, '银行转账')
  await ui.click(managementTab('已停用'))
  await settleSearch()
  await ui.click(managementTab('启用'))
  await settleSearch()
  assert.equal(document.querySelector('button[aria-label="改名付款方式"]').disabled, true, 'returning to a filter does not restore a hidden action target')
  assert.equal(form().getFieldValue('payment_method'), '银行转账')
  assert.equal(backend.mutations.length, 0)
})

test('delete confirmation keeps its original record and locks row changes until cancellation', async (t) => {
  const backend = catalogueRPC()
  const { ui } = await paymentForm(t, backend.rpc, managerProfile)
  await ui.click(ui.button('管理付款方式'))
  await settleSearch()
  await selectManagerMethod(ui, 'aa')
  await ui.click(document.querySelector('[aria-label="删除 aa"]'))
  const other = document.querySelector('input[aria-label="选择 银行转账"]')
  assert.equal(other.disabled, true)
  await ui.click(other.closest('tr'))
  assert.equal(document.querySelector('input[aria-label="选择 aa"]').checked, true)
  assert.equal(document.querySelector('.erp-payment-method-manager__footer').textContent.includes('确认删除'), true)
  await ui.click(ui.button('取消'))
  assert.equal(Boolean(ui.button('确认删除')), false)
  await selectManagerMethod(ui, '银行转账')
  assert.equal(document.querySelector('[aria-label="删除 银行转账"]').disabled, true)
  assert.equal(backend.mutations.length, 0)
})

test('management search submits once, clears its own query and restores each tab without changing payment drafts', async (t) => {
  const backend = catalogueRPC()
  const reads = []
  const { ui, form } = await paymentForm(t, (method, params) => {
    if (method === 'list_payment_method_options') reads.push({ ...params })
    return backend.rpc(method, params)
  }, managerProfile)
  await ui.click(ui.button('管理付款方式'))
  await settleSearch()
  const search = () => document.querySelector('input[aria-label="搜索付款方式"]')
  const before = reads.length
  await ui.fill(search(), ' aa ')
  await settleSearch()
  assert.equal(reads.length, before, 'typing must not submit a read')
  await ui.click(ui.button('搜索'))
  await settleSearch()
  assert.equal(reads.length, before + 1)
  assert.equal(reads.at(-1).keyword, 'aa')
  await ui.click(ui.button('搜索'))
  await settleSearch()
  assert.equal(reads.length, before + 1, 'repeated submission must not repeat an unchanged query')
  await ui.click(managementTab('已停用'))
  await settleSearch()
  assert.equal(search().value, '')
  assert.equal(reads.at(-1).is_active, false)
  await ui.fill(search(), '银行')
  await ui.click(ui.button('搜索'))
  await settleSearch()
  await ui.click(managementTab('启用'))
  await settleSearch()
  assert.equal(search().value, 'aa')
  await ui.click(document.querySelector('.erp-payment-method-manager [aria-label="清除搜索"]'))
  await settleSearch()
  assert.equal(reads.at(-1).keyword, '')
  await ui.click(managementTab('已停用'))
  await settleSearch()
  assert.equal(search().value, '银行')
  assert.equal(reads.at(-1).keyword, '银行')
  assert.deepEqual(backend.mutations, [])
  assert.equal(form().getFieldValue('payment_method'), '银行转账')
  assert.equal(form().getFieldValue('payment_term_days'), 30)
  assert.equal(form().getFieldValue('note'), '原报价备注')
})

function catalogueRPC({ failMutation = () => false, failRead = () => false } = {}) {
  const records = new Map([['aa', { id: 1, method: 'aa', is_active: true, has_been_used: false, version: 1 }], ['银行转账', { id: 2, method: '银行转账', is_active: true, has_been_used: true, version: 1 }]])
  const mutations = []
  let nextID = 3
  return { records,
mutations,
rpc(method, params) {
    if (method === 'list_payment_methods') return { data: { methods: [...records.values()].filter((item) => item.is_active && item.method.includes(params.keyword)).map((item) => item.method), has_more: false, keyword_exists: records.has(params.keyword), keyword_inactive: records.get(params.keyword)?.is_active === false } }
    if (method === 'list_payment_method_options') {
      if (failRead()) throw new Error('internal SQL detail')
      const matches = [...records.values()].filter((item) => item.is_active === params.is_active && item.method.includes(params.keyword))
      const offset = params.offset ?? 0
      const limit = params.limit ?? 20
      return { data: { items: matches.slice(offset, offset + limit).map((item) => ({ ...item })), has_more: matches.length > offset + limit } }
    }
    mutations.push(params)
    if (failMutation()) throw new Error('付款方式已被其他操作更新，请刷新后重试')
    if (method === 'create_payment_method') {
      if (records.has(params.method)) throw new Error('已有同名付款方式，请选用已有项目')
      const item = { id: nextID++, method: params.method.trim(), is_active: true, has_been_used: false, version: 1 }
      records.set(item.method, item)
      return { data: { item: { ...item } } }
    }
    const previous = [...records.values()].find((item) => item.id === params.id)
    assert.equal(previous.version, params.expected_version)
    if (method === 'delete_payment_method') {
      assert.equal(previous.has_been_used, false)
      records.delete(previous.method)
      return { data: { deleted_id: params.id } }
    }
    assert.equal(method, 'update_payment_method')
    const item = { ...previous, method: params.method, is_active: params.is_active, version: previous.version + 1 }
    records.delete(previous.method)
    records.set(item.method, item)
    return { data: { item: { ...item } } }
  } }
}

test('refresh preserves mounted options and empty results until the new catalogue arrives', async (t) => {
  const backend = catalogueRPC()
  let pendingRead = null
  const { ui, form } = await paymentForm(t, (method, params) =>
    method === 'list_payment_method_options' && pendingRead
      ? pendingRead.promise
      : backend.rpc(method, params), managerProfile)
  await ui.click(ui.button('管理付款方式'))
  await settleSearch()
  const list = () => document.querySelector('.erp-payment-method-manager__list')
  const footer = document.querySelector('.erp-payment-method-manager__footer')
  for (const view of ['active', 'inactive']) {
    if (view === 'inactive') {
      await ui.click(managementTab('已停用'))
      await settleSearch()
    }
    const content = list().querySelector(view === 'active' ? '.erp-payment-method-manager__row' : '.ant-empty-description')
    assert.equal(Boolean(content), true)
    const request = deferredFormRequest()
    pendingRead = request
    try {
      await ui.click(document.querySelector('button[aria-label="刷新"]'))
      assert.equal(list().getAttribute('aria-busy'), 'true')
      assert.equal(list().contains(content), true, 'refresh keeps the current row or empty result mounted')
      assert.equal(document.querySelector('.erp-payment-method-manager__footer') === footer, true)
      assert.equal(Boolean(list().querySelector('.erp-payment-method-manager__loading')), false)
    } finally {
      pendingRead = null
      await act(async () => request.resolve(await backend.rpc('list_payment_method_options', { keyword: '', is_active: view === 'active' })))
    }
    assert.equal(list().getAttribute('aria-busy'), 'false')
  }
  assert.equal(form().getFieldValue('payment_method'), '银行转账')
  assert.equal(form().getFieldValue('payment_term_days'), 30)
  assert.equal(form().getFieldValue('note'), '原报价备注')
})

test('managers can hide, undo and restore candidates while payment and quotation drafts stay unchanged', async (t) => {
  const backend = catalogueRPC()
  const { ui, form } = await paymentForm(t, backend.rpc, managerProfile)
  await ui.options('付款方式')
  await ui.fill('付款方式', 'aa')
  await settleSearch()
  await ui.click((await ui.options('付款方式')).find((option) => option.textContent === 'aa'))
  await ui.fill('付款周期', '45')
  await ui.fill('报价备注', '尚未保存的报价备注')
  await ui.click(ui.button('管理付款方式'))
  await settleSearch()
  await selectManagerMethod(ui, 'aa')
  await ui.click(document.querySelector('[aria-label="停用 aa"]'))
  await settleSearch()
  assert.equal(backend.records.get('aa').is_active, false)
  await ui.click(ui.button('撤销'))
  await settleSearch()
  assert.equal(backend.records.get('aa').is_active, true)
  assert.equal(backend.mutations[1].expected_version, 2)
  await selectManagerMethod(ui, 'aa')
  await ui.click(document.querySelector('[aria-label="停用 aa"]'))
  await settleSearch()
  await ui.click(managementTab('已停用'))
  await settleSearch()
  await selectManagerMethod(ui, 'aa')
  assert.equal(Boolean(document.querySelector('[aria-label="启用 aa"]')), true)
  await ui.click(ui.button('返回填写'))
  assert.equal(form().getFieldValue('payment_method'), 'aa')
  assert.equal(form().getFieldValue('payment_term_days'), 45)
  assert.equal(form().getFieldValue('note'), '尚未保存的报价备注')
  await ui.options('付款方式')
  await ui.fill('付款方式', '')
  await ui.fill('付款方式', 'aa')
  await settleSearch()
  assert.equal(form().getFieldValue('payment_method'), 'aa', 'stopping an option does not rewrite the current value')
  assert.equal((await ui.options('付款方式')).some((option) => option.textContent === 'aa'), false)
  await ui.click(ui.button('管理付款方式'))
  await settleSearch()
  await ui.click(managementTab('已停用'))
  await settleSearch()
  await selectManagerMethod(ui, 'aa')
  await ui.click(document.querySelector('[aria-label="启用 aa"]'))
  await settleSearch()
  assert.equal(backend.records.get('aa').is_active, true)
  assert.equal(form().getFieldValue('note'), '尚未保存的报价备注')
})

test('readers cannot manage and an identity change closes old manager state', async (t) => {
  const backend = catalogueRPC()
  const { ui, setProfile } = await paymentForm(t, backend.rpc)
  assert.equal(Boolean(ui.button('管理付款方式')), false)
  await setProfile(managerProfile)
  await ui.click(ui.button('管理付款方式'))
  await settleSearch()
  assert.equal(Boolean(document.querySelector('[role="dialog"]')), true)
  await setProfile({ id: 2, permissions: [], effective_session: { actions: [] } })
  await settleSearch()
  assert.equal(Boolean(ui.button('管理付款方式')), false)
  assert.equal(document.querySelectorAll('[role="dialog"]').length, 0)
  await setProfile(managerProfile)
  assert.equal(document.querySelectorAll('[role="dialog"]').length, 0)
  assert.equal(backend.mutations.length, 0)
})

test('failed management reads retry, and a stale undo leaves the candidate state for explicit refresh', async (t) => {
  let readFails = true
  let mutationFails = false
  const backend = catalogueRPC({ failRead: () => readFails, failMutation: () => mutationFails })
  const { ui, form } = await paymentForm(t, backend.rpc, managerProfile)
  await ui.click(ui.button('管理付款方式'))
  await settleSearch()
  assert.equal(document.body.textContent.includes('付款方式读取失败'), true)
  assert.equal(document.body.textContent.includes('internal SQL'), false)
  readFails = false
  await ui.click(ui.button('重试'))
  await settleSearch()
  await selectManagerMethod(ui, 'aa')
  await ui.click(document.querySelector('[aria-label="停用 aa"]'))
  await settleSearch()
  mutationFails = true
  await ui.click(ui.button('撤销'))
  assert.equal(document.body.textContent.includes('已被其他操作更新'), true)
  assert.equal(backend.records.get('aa').is_active, false)
  assert.equal(form().getFieldValue('payment_method'), '银行转账')
  await ui.click(ui.button('返回填写'))
  assert.equal(document.querySelectorAll('[role="dialog"]').length, 0)
})

test('server-authorized manager entry remains visible when an older customer session lacks the new action', async (t) => {
 const backend = catalogueRPC()
 const { ui } = await paymentForm(t, backend.rpc, { id: 3, is_super_admin: true, permissions: [], effective_session: { actions: [] } })
 assert.equal(Boolean(ui.button('管理付款方式')), true)
 await ui.click(ui.button('管理付款方式'))
 await settleSearch()
 await selectManagerMethod(ui, 'aa')
 assert.equal(Boolean(document.querySelector('[aria-label="停用 aa"]')), true)
})

test('catalogue rename keeps the current draft until explicitly adopted, and used choices cannot be deleted', async (t) => {
  const backend = catalogueRPC()
  const { ui, form } = await paymentForm(t, backend.rpc, managerProfile)
  await ui.fill('付款周期', '0')
  await ui.click(ui.button('管理付款方式'))
  await settleSearch()
  await selectManagerMethod(ui, '银行转账')
  assert.equal(document.querySelector('[aria-label="删除 银行转账"]').disabled, true)
  await selectManagerMethod(ui, '银行转账')
  await ui.click(document.querySelector('[aria-label="改名 银行转账"]'))
  await ui.fill(document.querySelector('input[aria-label="修改名称"]'), '银行汇款')
  await ui.click(ui.button('保存名称'))
  await settleSearch()
  await ui.click(ui.button('返回填写'))
  assert.equal(form().getFieldValue('payment_method'), '银行转账')
  assert.equal(form().getFieldValue('payment_term_days'), 0)
  assert.equal(form().getFieldValue('note'), '原报价备注')
  await ui.click(ui.button('本单也使用新名称'))
  assert.equal(form().getFieldValue('payment_method'), '银行汇款')
  assert.equal(form().getFieldValue('payment_term_days'), 0)
})

test('explicit create publishes a choice and selects it without saving the parent document; unused choices can be deleted', async (t) => {
  const backend = catalogueRPC()
  const { ui, form } = await paymentForm(t, backend.rpc, managerProfile)
  await ui.fill('付款方式', '支票')
  await settleSearch()
  assert.equal(backend.records.has('支票'), false)
  await ui.click(ui.button('新增并选用「支票」'))
  await settleSearch()
  await ui.click(ui.button('新增并选用'))
  await settleSearch()
  assert.equal(backend.records.has('支票'), true)
  assert.equal(form().getFieldValue('payment_method'), '支票')
  assert.equal(form().getFieldValue('payment_term_days'), 30)
  assert.equal(document.querySelectorAll('[role="dialog"]').length, 0, 'quick create returns directly to the draft')
  assert.equal(document.activeElement?.id, 'payment_method')
  await ui.click(ui.button('管理付款方式'))
  await settleSearch()
  await selectManagerMethod(ui, '支票')
  await ui.click(document.querySelector('[aria-label="删除 支票"]'))
  const confirm = ui.button('确认删除')
  assert.equal(Boolean(confirm), true)
  await ui.click(confirm)
  await settleSearch()
  assert.equal(backend.records.has('支票'), false)
  await ui.click(ui.button('返回填写'))
  assert.equal(form().getFieldValue('payment_method'), '支票', 'deleting the unused option keeps free text in the draft')
})

test('undoing a rename removes the stale offer without changing the current draft', async (t) => {
  const backend = catalogueRPC()
  const { ui, form } = await paymentForm(t, backend.rpc, managerProfile)
  await ui.click(ui.button('管理付款方式'))
  await settleSearch()
  await selectManagerMethod(ui, '银行转账')
  await ui.click(document.querySelector('[aria-label="改名 银行转账"]'))
  await ui.fill(document.querySelector('input[aria-label="修改名称"]'), '银行汇款')
  await ui.click(ui.button('保存名称'))
  await settleSearch()
  await ui.click(ui.button('撤销'))
  await settleSearch()
  await ui.click(ui.button('返回填写'))
  assert.equal(form().getFieldValue('payment_method'), '银行转账')
  assert.equal(document.querySelectorAll('.erp-payment-method-input__rename').length, 0)
  assert.equal(backend.records.has('银行转账'), true)
})

test('quick create is prefilled, skips catalogue navigation and preserves the draft on cancel or failure', async (t) => {
  let failMutation = true
  let catalogueReads = 0
  const backend = catalogueRPC({ failMutation: () => failMutation })
  const { ui, form } = await paymentForm(t, (method, params) => {
    if (method === 'list_payment_method_options') catalogueReads += 1
    return backend.rpc(method, params)
  }, managerProfile)
  await ui.fill('付款方式', '日结')
  await settleSearch()
  await ui.click(ui.button('新增并选用「日结」'))
  await settleSearch()
  assert.equal(document.querySelector('input[aria-label="新增名称"]').value, '日结')
  assert.equal(document.querySelectorAll('[role="tab"]').length, 0)
  assert.equal(Boolean(document.querySelector('input[aria-label="搜索付款方式"]')), false)
  assert.equal(catalogueReads, 0)
  await ui.click(ui.button('新增并选用'))
  assert.equal(document.body.textContent.includes('已被其他操作更新'), true)
  assert.equal(document.querySelector('input[aria-label="新增名称"]').value, '日结')
  assert.equal(form().getFieldValue('payment_method'), '银行转账')
  await ui.click(ui.button('取消'))
  assert.equal(document.querySelectorAll('[role="dialog"]').length, 0)
  assert.equal(form().getFieldValue('payment_term_days'), 30)
  assert.equal(form().getFieldValue('note'), '原报价备注')
  assert.equal(backend.records.has('日结'), false)
  failMutation = false
  await ui.options('付款方式')
  await ui.fill('付款方式', '')
  await ui.fill('付款方式', '日结')
  await settleSearch()
  await ui.click(ui.button('新增并选用「日结」'))
  await ui.click(ui.button('新增并选用'))
  await settleSearch()
  assert.equal(document.querySelectorAll('[role="dialog"]').length, 0)
  assert.equal(backend.records.has('日结'), true)
  assert.equal(catalogueReads, 0)
})

test('a thousand choices use bounded pages and restore independent tab queries and pages', async (t) => {
  const backend = catalogueRPC()
  for (let index = 0; index < 1000; index += 1) {
    const method = `方式${String(index).padStart(4, '0')}`
    backend.records.set(method, { id: index + 1000, method, is_active: index < 960, has_been_used: false, version: 1 })
  }
  const reads = []
  const { ui, form } = await paymentForm(t, (method, params) => {
    if (method === 'list_payment_method_options') reads.push({ ...params })
    return backend.rpc(method, params)
  }, managerProfile)
  const rows = () => document.querySelectorAll('.erp-payment-method-manager__row')
  await ui.click(ui.button('管理付款方式'))
  await settleSearch()
  assert.equal(rows().length, 20)
  assert.equal(reads.at(-1).limit, 20)
  assert.equal(document.querySelector('button[aria-label="上一页"]').disabled, true)
  await ui.click(document.querySelector('button[aria-label="下一页"]'))
  await settleSearch()
  assert.equal(reads.at(-1).offset, 20)
  assert.equal(rows().length, 20, 'page replacement must not append old rows')
  assert.equal(Boolean(document.querySelector('[aria-label="改名 aa"]')), false)
  await ui.click(managementTab('已停用'))
  await settleSearch()
  assert.equal(reads.at(-1).offset, 0)
  await ui.fill(document.querySelector('input[aria-label="搜索付款方式"]'), '方式09')
  await ui.click(ui.button('搜索'))
  await settleSearch()
  await ui.click(document.querySelector('button[aria-label="下一页"]'))
  await settleSearch()
  assert.equal(reads.at(-1).offset, 20)
  await ui.click(managementTab('启用'))
  await settleSearch()
  assert.equal(reads.at(-1).offset, 20)
  assert.equal(document.querySelector('input[aria-label="搜索付款方式"]').value, '')
  await ui.click(managementTab('已停用'))
  await settleSearch()
  assert.equal(reads.at(-1).offset, 20)
  assert.equal(reads.at(-1).keyword, '方式09')
  await ui.click(document.querySelector('button[aria-label="新增付款方式"]'))
  await ui.fill(document.querySelector('input[aria-label="新增名称"]'), '新方式')
  assert.equal(Boolean(document.querySelector('button[aria-label="下一页"]')), false)
  assert.equal(document.querySelector('input[aria-label="搜索付款方式"]').disabled, true)
  await ui.click(ui.button('新增并选用'))
  await settleSearch()
  assert.equal(reads.at(-1).is_active, true)
  assert.equal(reads.at(-1).keyword, '新方式')
  assert.equal(reads.at(-1).offset, 0)
  assert.equal(rows().length, 1, 'a newly created choice remains reachable even from a later inactive page')
  assert.equal(form().getFieldValue('payment_method'), '新方式')
  assert.equal(form().getFieldValue('note'), '原报价备注')
})

test('deleting the final row on a later page returns to the previous page', async (t) => {
  const backend = catalogueRPC()
  backend.records.clear()
  for (let index = 0; index < 21; index += 1) {
    const method = `方式${index}`
    backend.records.set(method, { id: index + 1000, method, is_active: true, has_been_used: false, version: 1 })
  }
  const { ui, form } = await paymentForm(t, backend.rpc, managerProfile)
  await ui.click(ui.button('管理付款方式'))
  await settleSearch()
  await ui.click(document.querySelector('button[aria-label="下一页"]'))
  await settleSearch()
  assert.equal(document.querySelectorAll('.erp-payment-method-manager__row').length, 1)
  await selectManagerMethod(ui, '方式20')
  await ui.click(document.querySelector('[aria-label="删除 方式20"]'))
  const confirm = ui.button('确认删除')
  await ui.click(confirm)
  await settleSearch()
  assert.equal(document.querySelectorAll('.erp-payment-method-manager__row').length, 20)
  assert.equal(Boolean(document.querySelector('button[aria-label="上一页"]')), false)
  assert.equal(Boolean(document.querySelector('button[aria-label="下一页"]')), false)
  assert.equal(form().getFieldValue('payment_method'), '银行转账')
})

test('a late catalogue page cannot overwrite a newer status view', async (t) => {
  const backend = catalogueRPC()
  for (let index = 0; index < 30; index += 1) {
    const method = `分页方式${index}`
    backend.records.set(method, { id: index + 1000, method, is_active: true, has_been_used: false, version: 1 })
  }
  const delayed = deferredFormRequest()
  let pageSignal
  const { ui } = await paymentForm(t, (method, params, options) => {
    if (method === 'list_payment_method_options' && params.offset === 20) {
      pageSignal = options.signal
      return delayed.promise
    }
    return backend.rpc(method, params)
  }, managerProfile)
  await ui.click(ui.button('管理付款方式'))
  await settleSearch()
  await ui.click(document.querySelector('button[aria-label="下一页"]'))
  assert.equal(document.querySelector('.erp-payment-method-manager__list').getAttribute('aria-busy'), 'true')
  await ui.click(managementTab('已停用'))
  await settleSearch()
  assert.equal(pageSignal.aborted, true)
  await act(async () => delayed.resolve(backend.rpc('list_payment_method_options', { keyword: '', is_active: true, limit: 20, offset: 20 })))
  assert.equal(document.querySelectorAll('.erp-payment-method-manager__row').length, 0)
  assert.equal(document.body.textContent.includes('没有停用的付款方式'), true)
})

test('quick create exposes management and returns with the unsaved name intact', async (t) => {
 const backend = catalogueRPC()
 const { ui, form } = await paymentForm(t, backend.rpc, managerProfile)
 await ui.options('付款方式')
 await ui.fill('付款方式', '日结')
 await settleSearch()
 assert.equal(form().getFieldValue('payment_method'), '银行转账')
 await ui.click(ui.button('新增并选用「日结」'))
 await ui.fill(document.querySelector('input[aria-label="新增名称"]'), '日结待确认')
 const quick = document.querySelector('.erp-payment-method-quick-create')
 await ui.click([...quick.querySelectorAll('button')].find((button) => button.textContent === '管理付款方式'))
 await settleSearch()
 assert.equal(Boolean(document.querySelector('.erp-payment-method-modal')), true)
 assert.equal(Boolean(ui.button('返回新增')), true)
 await ui.click(ui.button('返回新增'))
 assert.equal(document.querySelector('input[aria-label="新增名称"]').value, '日结待确认')
 await ui.click(ui.button('取消'))
 assert.equal(form().getFieldValue('payment_method'), '银行转账')
 assert.equal(backend.mutations.length, 0)
})
