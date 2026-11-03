import { act, createElement as h } from 'react'
import assert from 'node:assert/strict'
import test from 'node:test'
import { businessFormHarness, deferredFormRequest } from '../../../scripts/test/businessFormHarness.mjs'

const settleSearch = () => act(async () => new Promise((resolve) => setTimeout(resolve, 220)))

async function paymentForm(t, rpc, profile = {}) {
  let currentProfile = profile
  const ui = await businessFormHarness(t, { rpc: async (...args) => {
    const result = await rpc(...args)
    if (args[0] !== 'list_payment_methods' || !result.data) return result
    return { ...result, data: { ...result.data, can_manage: currentProfile?.is_super_admin === true || Boolean(currentProfile?.permissions?.includes('payment_method.manage') && currentProfile?.effective_session?.actions?.includes('payment_method.manage')) } }
  } })
  const [{ Form, InputNumber, Button }, { default: PaymentMethodInput }] = await Promise.all([
    import('antd'), import('./PaymentMethodInput.jsx'),
  ])
  const { BusinessPageContext } = await import('../hooks/useBusinessPageContext.js')
  let form
  function Example() {
    [form] = Form.useForm()
    return h(Form, { form, initialValues: { payment_method: '银行转账', payment_term_days: 30, note: '原报价备注' } }, h(Form.Item, { name: 'payment_method', label: '付款方式' }, h(PaymentMethodInput)), h(Form.Item, { name: 'payment_term_days', label: '付款周期' }, h(InputNumber)), h(Form.Item, { name: 'note', label: '报价备注' }, h('textarea')), h(Button, { onClick: () => form.resetFields() }, '取消修改'))
  }
  const render = () => ui.render(h(BusinessPageContext.Provider, { value: { adminProfile: currentProfile } }, h(Example)))
  await render()
  await settleSearch()
  return { ui, form: () => form, setProfile: async (next) => { currentProfile = next; await render(); await settleSearch() } }
}

test('payment methods remain editable, clearable and independent of the payment period; only persisted history is reused', async (t) => {
  const saved = new Set(['跨页历史方式'])
  const { ui, form } = await paymentForm(t, (method, params) => {
    assert.equal(method, 'list_payment_methods')
    return { data: { methods: [...saved].filter((value) => value.includes(params.keyword)), has_more: false, keyword_not_recommended: false } }
  })
  await ui.options('付款方式')
  await settleSearch()
  assert.equal((await ui.options('付款方式')).some((option) => option.textContent === '跨页历史方式'), true)
  await ui.fill('付款方式', '商业承兑')
  await settleSearch()
  const newOption = (await ui.options('付款方式')).find((option) => option.textContent.includes('使用「商业承兑」'))
  await ui.click(newOption)
  assert.equal(form().getFieldValue('payment_method'), '商业承兑')
  assert.equal(form().getFieldValue('payment_term_days'), 30)
  assert.equal(saved.has('商业承兑'), false)
  await ui.click(ui.button('取消修改'))
  assert.equal(form().getFieldValue('payment_method'), '银行转账')
  await ui.fill('付款方式', '')
  assert.equal(form().getFieldValue('payment_method'), '')
  assert.equal(form().getFieldValue('payment_term_days'), 30)
  saved.add('商业承兑')
  await ui.options('付款方式')
  await ui.fill('付款方式', '商业承兑')
  await settleSearch()
  assert.equal((await ui.options('付款方式')).some((option) => option.textContent === '商业承兑'), true)
})

test('failed payment history reads keep the typed method and period and support retry without exposing raw errors', async (t) => {
  let fail = true
  const { ui, form } = await paymentForm(t, () => {
    if (fail) throw new Error('internal SQL details')
    return { data: { methods: ['信用证'], has_more: false, keyword_not_recommended: false } }
  })
  await ui.options('付款方式')
  await ui.fill('付款方式', '信用证')
  await settleSearch()
  assert.equal(document.body.textContent.includes('历史方式读取失败'), true)
  assert.equal(document.body.textContent.includes('internal SQL details'), false)
  assert.equal(form().getFieldValue('payment_method'), '信用证')
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
  await act(async () => current.resolve({ data: { methods: ['信用证'], has_more: false, keyword_not_recommended: false } }))
  await act(async () => old.resolve({ data: { methods: ['商业承兑'], has_more: false, keyword_not_recommended: false } }))
  assert.equal(form().getFieldValue('payment_method'), '信用')
  const options = await ui.options('付款方式')
  assert.equal(options.some((option) => option.textContent === '信用证'), true)
  assert.equal(options.some((option) => option.textContent === '商业承兑'), false)
  await ui.click(ui.button('取消修改'))
  await act(async () => requests[0].resolve({ data: { methods: ['过期方式'], has_more: false, keyword_not_recommended: false } }))
  assert.equal(form().getFieldValue('payment_method'), '银行转账')
  assert.equal(document.querySelectorAll('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').length, 0)
})

const managerProfile = { id: 1, permissions: ['payment_method.manage'], effective_session: { actions: ['payment_method.manage'] } }
const managementTab = (name) => [...document.querySelectorAll('[role="tab"]')].find((node) => node.textContent === name)

test('management search submits once, clears its own query and restores each tab without changing payment drafts', async (t) => {
  const backend = recommendationRPC()
  const reads = []
  const { ui, form } = await paymentForm(t, (method, params) => {
    if (method === 'list_payment_method_recommendations') reads.push({ ...params })
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
  await ui.click(managementTab('不再推荐'))
  await settleSearch()
  assert.equal(search().value, '')
  assert.equal(reads.at(-1).is_recommended, false)
  await ui.fill(search(), '银行')
  await ui.click(ui.button('搜索'))
  await settleSearch()
  await ui.click(managementTab('可选'))
  await settleSearch()
  assert.equal(search().value, 'aa')
  await ui.click(document.querySelector('.erp-payment-method-manager [aria-label="清除搜索"]'))
  await settleSearch()
  assert.equal(reads.at(-1).keyword, '')
  await ui.click(managementTab('不再推荐'))
  await settleSearch()
  assert.equal(search().value, '银行')
  assert.equal(reads.at(-1).keyword, '银行')
  assert.deepEqual(backend.mutations, [])
  assert.equal(form().getFieldValue('payment_method'), '银行转账')
  assert.equal(form().getFieldValue('payment_term_days'), 30)
  assert.equal(form().getFieldValue('note'), '原报价备注')
})

function recommendationRPC({ failMutation = () => false, failRead = () => false } = {}) {
  const records = new Map([['aa', { method: 'aa', is_recommended: true, version: 0 }], ['银行转账', { method: '银行转账', is_recommended: true, version: 0 }]])
  const mutations = []
  return { records,
mutations,
rpc(method, params) {
    if (method === 'list_payment_methods') return { data: { methods: [...records.values()].filter((item) => item.is_recommended && item.method.includes(params.keyword)).map((item) => item.method), has_more: false, keyword_not_recommended: records.get(params.keyword)?.is_recommended === false } }
    if (method === 'list_payment_method_recommendations') {
      if (failRead()) throw new Error('internal SQL detail')
      return { data: { items: [...records.values()].filter((item) => item.is_recommended === params.is_recommended && item.method.includes(params.keyword)), has_more: false } }
    }
    assert.equal(method, 'set_payment_method_recommendation')
    mutations.push(params)
    if (failMutation()) throw new Error('付款方式推荐状态已变化，请刷新后重试')
    const previous = records.get(params.method)
    assert.equal(previous.version, params.expected_version)
    const item = { method: params.method, is_recommended: params.is_recommended, version: previous.version + 1 }
    records.set(params.method, item)
    return { data: { item } }
  } }
}

test('managers can hide, undo and restore candidates while payment and quotation drafts stay unchanged', async (t) => {
  const backend = recommendationRPC()
  const { ui, form } = await paymentForm(t, backend.rpc, managerProfile)
  await ui.fill('付款方式', 'aa')
  await ui.fill('付款周期', '45')
  await ui.fill('报价备注', '尚未保存的报价备注')
  await ui.click(ui.button('管理付款方式'))
  await settleSearch()
  await ui.click(document.querySelector('[aria-label="不再推荐 aa"]'))
  await settleSearch()
  assert.equal(backend.records.get('aa').is_recommended, false)
  await ui.click(ui.button('撤销'))
  await settleSearch()
  assert.equal(backend.records.get('aa').is_recommended, true)
  assert.equal(backend.mutations[1].expected_version, 1)
  await ui.click(document.querySelector('[aria-label="不再推荐 aa"]'))
  await settleSearch()
  await ui.click(managementTab('不再推荐'))
  await settleSearch()
  assert.equal(Boolean(document.querySelector('[aria-label="恢复推荐 aa"]')), true)
  await ui.click(ui.button('返回填写'))
  assert.equal(form().getFieldValue('payment_method'), 'aa')
  assert.equal(form().getFieldValue('payment_term_days'), 45)
  assert.equal(form().getFieldValue('note'), '尚未保存的报价备注')
  await ui.options('付款方式')
  await ui.fill('付款方式', 'aa')
  await settleSearch()
  assert.equal(document.body.textContent.includes('保存不会恢复推荐'), true)
  assert.equal((await ui.options('付款方式')).some((option) => option.textContent === 'aa'), false)
  await ui.click(ui.button('管理付款方式'))
  await settleSearch()
  await ui.click(managementTab('不再推荐'))
  await settleSearch()
  await ui.click(document.querySelector('[aria-label="恢复推荐 aa"]'))
  await settleSearch()
  assert.equal(backend.records.get('aa').is_recommended, true)
  assert.equal(form().getFieldValue('note'), '尚未保存的报价备注')
})

test('readers cannot manage and an identity change closes old manager state', async (t) => {
  const backend = recommendationRPC()
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
  const backend = recommendationRPC({ failRead: () => readFails, failMutation: () => mutationFails })
  const { ui, form } = await paymentForm(t, backend.rpc, managerProfile)
  await ui.click(ui.button('管理付款方式'))
  await settleSearch()
  assert.equal(document.body.textContent.includes('付款方式读取失败'), true)
  assert.equal(document.body.textContent.includes('internal SQL'), false)
  readFails = false
  await ui.click(ui.button('重试'))
  await settleSearch()
  await ui.click(document.querySelector('[aria-label="不再推荐 aa"]'))
  await settleSearch()
  mutationFails = true
  await ui.click(ui.button('撤销'))
  assert.equal(document.body.textContent.includes('推荐状态已变化'), true)
  assert.equal(backend.records.get('aa').is_recommended, false)
  assert.equal(form().getFieldValue('payment_method'), '银行转账')
  await ui.click(ui.button('返回填写'))
  assert.equal(document.querySelectorAll('[role="dialog"]').length, 0)
})

test('server-authorized manager entry remains visible when an older customer session lacks the new action', async (t) => {
 const backend = recommendationRPC()
 const { ui } = await paymentForm(t, backend.rpc, { id: 3, is_super_admin: true, permissions: [], effective_session: { actions: [] } })
 assert.equal(Boolean(ui.button('管理付款方式')), true)
 await ui.click(ui.button('管理付款方式'))
 await settleSearch()
 assert.equal(Boolean(document.querySelector('[aria-label="不再推荐 aa"]')), true)
})
