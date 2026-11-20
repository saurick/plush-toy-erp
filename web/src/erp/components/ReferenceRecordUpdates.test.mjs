import assert from 'node:assert/strict'
import test from 'node:test'
import { createContext, createElement, forwardRef, Fragment, useContext, useState } from 'react'
import { setTimeout as delay } from 'node:timers/promises'
import { createReactTestHarness } from '../../../scripts/test/reactRuntime.mjs'
import { installRpcCallHarness } from '../../../scripts/test/rpcApiTestHarness.mjs'

const originalMaterial = { id: 1, code: 'MAT-REF-1', name: '原面料', spec: '58 英寸', default_unit_id: 1, is_active: true }
const initialValues = { material_id: 1, quantity: '12.5', note: '正在编辑的备注', frozen_name: '单据原快照' }

async function setup(t, { selectors = 1, editor = false, nestedProvider = false } = {}) {
  const view = await createReactTestHarness(t)
  const setRpc = installRpcCallHarness((cleanup) => t.after(cleanup))
  const materials = new Map([[1, { ...originalMaterial }]])
  const calls = []
  let intercept
  setRpc(async (method, params, request) => {
    calls.push({ method, params, request })
    if (intercept) {
      const response = await intercept(method, params, request)
      if (response !== undefined) return response
    }
    if (method === 'list_materials') {
      let rows = [...materials.values()]
      if (params.ids) rows = rows.filter((row) => params.ids.includes(row.id))
      if (params.active_only) rows = rows.filter((row) => row.is_active !== false)
      if (params.keyword) rows = rows.filter((row) => row.name.includes(params.keyword))
      return { code: 0, data: { materials: rows.slice(params.offset, params.offset + params.limit), total: rows.length, limit: params.limit, offset: params.offset } }
    }
    if (['create_material', 'update_material', 'set_material_active'].includes(method)) {
      const id = method === 'create_material' ? 2 : params.id
      const record = { ...(materials.get(id) || originalMaterial), ...params, id }
      materials.set(id, record)
      return { code: 0, data: { material: record } }
    }
    throw new Error(`Unexpected RPC: ${method}`)
  })
  const { Form, Input } = await import('antd')
  const { default: RemoteReferenceSelect, ReferenceRecordsProvider } = await import('./RemoteReferenceSelect.jsx')
  const { materialOption } = await import('../utils/referenceSelectOptions.mjs')
  const { mergeReferenceRecords } = await import('../utils/remoteReferences.mjs')
  const api = await import('../api/masterDataOrderApi.mjs')
  const events = await import('../utils/referenceRecordChanges.mjs')
  const { default: BusinessFormPage } = editor ? await import('./business-list/BusinessFormPage.jsx') : {}
  const { ERPThemeProvider } = editor ? await import('../../common/theme/erpTheme.jsx') : {}
  const { createMemoryRouter, RouterProvider } = editor ? await import('react-router-dom') : {}
  const { PageLoadFeedbackBoundary } = nestedProvider ? await import('./PageLoadFeedback.jsx') : {}
  const OwnerContext = createContext(null)
  const current = new Map()
  let form
  let currentRecords = []
  const Probe = forwardRef((props, _ref) => {
    current.set(props['data-probe'], props)
    return createElement('output', { 'data-probe': props['data-probe'] }, JSON.stringify(props.options))
  })
  function Owner({ profile, open }) {
    const [records, setRecords] = useState([originalMaterial])
    currentRecords = records
    const [instance] = Form.useForm()
    form = instance
    const options = records.map(materialOption)
    const formContent = createElement(Form, { form: instance, initialValues }, createElement(Form.Item, { name: 'material_id' }, createElement(RemoteReferenceSelect, { referenceType: 'materials', component: Probe, options, 'data-probe': 'primary' })), ...['quantity', 'note', 'frozen_name'].map((name) => createElement(Form.Item, { key: name, name }, createElement(Input))), ...Array.from({ length: selectors - 1 }, (_, index) => createElement(RemoteReferenceSelect, { key: index, referenceType: 'materials', component: Probe, value: 1, options, 'data-probe': `extra-${index}` }))
    )
    return createElement(ReferenceRecordsProvider, {
      component: Fragment,
      adminProfile: profile,
      handlers: { materials: (rows) => setRecords((previous) => mergeReferenceRecords(previous, rows)) },
    }, editor ? createElement(Fragment, null, createElement(BusinessFormPage, { open, form: instance, title: '编辑采购单', initialDirty: true }, formContent), createElement(BusinessFormPage, { open: false, title: '隐藏的编辑器' })
    ) : formContent)
  }
  function EditorRoute() {
    return createElement(Owner, useContext(OwnerContext))
  }
  const router = editor ? createMemoryRouter([{ path: '*', element: createElement(EditorRoute) }]) : null
  if (router) t.after(() => router.dispose())
  return {
    ...view,
api,
events,
calls,
materials,
current,
    get form() { return form },
    get records() { return currentRecords },
    intercept: (handler) => { intercept = handler },
    renderOwner: (profile, open = true) => {
      const props = { profile, open }
      const content = editor ? createElement(ERPThemeProvider, null, createElement(OwnerContext.Provider, { value: props }, createElement(RouterProvider, { router, future: { v7_startTransition: true } })
        )
      ) : createElement(Owner, props)
      return view.render(nestedProvider ? createElement(PageLoadFeedbackBoundary, null, createElement(ReferenceRecordsProvider, { component: Fragment, handlers: { materials: () => {} } }, content)
      ) : content)
    },
    wait: (ms = 25) => view.act(async () => delay(ms)),
  }
}

test('物料写入确认后才通知；失败与无有效资料响应不广播', async (t) => {
  const view = await setup(t)
  const changes = []
  window.addEventListener(view.events.REFERENCE_RECORDS_CHANGED, (event) => changes.push(event.detail))
  let finish
  view.intercept((method) => method === 'create_material' ? new Promise((resolve) => { finish = resolve }) : undefined)
  const pending = view.api.createMaterial({ name: '新物料' })
  await view.wait()
  assert.equal(changes.length, 0)
  finish({ code: 0, data: { material: { id: 2, name: '新物料' } } })
  assert.deepEqual(await pending, { id: 2, name: '新物料' })
  assert.deepEqual(changes, [{ referenceType: 'materials', id: 2 }])
  view.intercept(undefined)
  await view.api.updateMaterial({ id: 1, name: '更新面料' })
  await view.api.setMaterialActive({ id: 1, is_active: false })
  assert.deepEqual(changes.map((change) => change.id), [2, 1, 1])
  view.intercept(() => ({ code: 50000, msg: '服务暂不可用' }))
  await assert.rejects(view.api.createMaterial({ name: '失败物料' }))
  view.intercept(() => ({ code: 0, data: {} }))
  assert.equal(await view.api.createMaterial({ name: '无返回资料' }), null)
  assert.equal(changes.length, 3)
})

test('独立建档后展开中的候选更新，原选择、数量、备注与单据快照保持', async (t) => {
  const view = await setup(t)
  await view.renderOwner()
  await view.act(async () => view.current.get('primary').onOpenChange(true))
  await view.wait()
  await view.act(async () => view.api.createMaterial({ name: '新面料', code: 'MAT-REF-2' }))
  await view.wait()
  assert.deepEqual(view.current.get('primary').options.map((option) => option.value), [1, 2])
  assert.deepEqual(view.form.getFieldsValue(true), initialValues)
  assert.equal(view.current.get('primary').value, 1)
  assert.equal(view.calls.filter((call) => call.method === 'create_material').length, 1)
})

test('关闭的多个引用只由所属 provider 定点读一次，不全量展开候选', async (t) => {
  const view = await setup(t, { selectors: 8 })
  await view.renderOwner()
  await view.act(async () => view.api.updateMaterial({ id: 1, name: '最新面料' }))
  await view.wait()
  const reads = view.calls.filter((call) => call.method === 'list_materials')
  assert.equal(reads.length, 1)
  assert.deepEqual(reads[0].params.ids, [1])
  assert.equal(reads[0].params.active_only, undefined)
  assert.equal(reads[0].params.limit, 200)
  assert.equal(view.current.size, 8)
  for (const props of view.current.values()) {
    assert.equal(props.options.find((option) => option.value === 1).identity.name, '最新面料')
  }
  assert.deepEqual(view.form.getFieldsValue(true), initialValues)
})

test('变更重读保留搜索和筛选，并拒绝旧查询的迟到结果', async (t) => {
  const view = await setup(t)
  await view.renderOwner()
  let finishOld
  let candidateReads = 0
  view.intercept((method, params) => {
    if (method === 'list_materials' && !params.ids && ++candidateReads === 1) {
      return new Promise((resolve) => { finishOld = resolve })
    }
    return undefined
  })
  await view.act(async () => view.current.get('primary').onSearch('新'))
  await view.act(async () => view.current.get('primary').onOpenChange(true))
  await view.wait(250)
  const old = view.calls.find((call) => call.method === 'list_materials' && !call.params.ids)
  await view.act(async () => view.api.createMaterial({ name: '新面料', code: 'MAT-REF-2' }))
  await view.wait()
  const reads = view.calls.filter((call) => call.method === 'list_materials' && !call.params.ids)
  assert.equal(reads.length, 2)
  assert.equal(reads[1].params.keyword, '新')
  assert.equal(reads[1].params.offset, 0)
  assert.equal(reads[1].params.active_only, true)
  assert.equal(old.request.init.signal.aborted, true)
  await view.act(async () => finishOld({ code: 0, data: { materials: [], total: 0, limit: 50, offset: 0 } }))
  await view.wait()
  assert.equal(view.current.get('primary').options.some((option) => option.value === 2), true)
  assert.deepEqual(view.form.getFieldsValue(true), initialValues)
})

test('更新或停用资料会重读当前候选，停用的已选资料仍保持回显', async (t) => {
  const view = await setup(t)
  await view.renderOwner()
  await view.act(async () => view.current.get('primary').onOpenChange(true))
  await view.wait()
  await view.act(async () => view.api.setMaterialActive({ id: 1, is_active: false }))
  await view.wait()
  const selected = view.current.get('primary').options.find((option) => option.value === 1)
  assert.equal(Boolean(selected), true)
  assert.equal(view.records.find((row) => row.id === 1).is_active, false)
  assert.equal(view.form.getFieldValue('material_id'), 1)
  await view.act(async () => view.current.get('primary').onChange(undefined))
  await view.wait()
  assert.equal(view.current.get('primary').options.some((option) => option.value === 1), false)
})

test('物料已保存而资料读取失败时，重试只读、不重复建档、不丢草稿', async (t) => {
  const view = await setup(t, { editor: true })
  await view.renderOwner()
  let failReads = true
  view.intercept((method) => {
    if (method === 'list_materials' && failReads) throw new Error('reference read failed')
    return undefined
  })
  await view.act(async () => view.api.createMaterial({ name: '已保存物料' }))
  await view.wait()
  const retry = [...document.querySelectorAll('button')].find((button) => button.textContent === '重试读取')
  assert.equal(Boolean(retry), true)
  assert.equal(Boolean(retry.closest('.erp-business-form-page:not([hidden])')), true)
  assert.equal(document.querySelectorAll('.ant-alert').length, 1)
  await view.renderOwner(undefined, false)
  const fallback = [...document.querySelectorAll('button')].filter((button) => button.textContent === '重试读取')
  assert.equal(fallback.length, 1)
  assert.equal(Boolean(fallback[0].closest('[hidden]')), false)
  await view.renderOwner()
  assert.deepEqual(view.form.getFieldsValue(true), initialValues)
  failReads = false
  const activeRetry = [...document.querySelectorAll('button')].find((button) => button.textContent === '重试读取')
  await view.act(async () => activeRetry.click())
  await view.wait()
  assert.equal([...document.querySelectorAll('button')].some((button) => button.textContent === '重试读取'), false)
  assert.equal(view.calls.filter((call) => call.method === 'create_material').length, 1)
  assert.equal(view.calls.filter((call) => call.method === 'list_materials').length, 2)
  assert.deepEqual(view.form.getFieldsValue(true), initialValues)
})

test('权限变化、同资料后续更新和卸载均不能接收旧读取结果', async (t) => {
  const view = await setup(t)
  await view.renderOwner()
  let finishOld
  let reads = 0
  view.intercept((method, params) => {
    if (method === 'list_materials' && params.ids && ++reads === 1) return new Promise((resolve) => { finishOld = resolve })
    return undefined
  })
  await view.act(async () => view.api.updateMaterial({ id: 1, name: '旧更新' }))
  await view.wait()
  const old = view.calls.find((call) => call.method === 'list_materials')
  await view.act(async () => view.api.updateMaterial({ id: 1, name: '最新更新' }))
  await view.wait()
  assert.equal(old.request.init.signal.aborted, true)
  await view.act(async () => finishOld({ code: 0, data: { materials: [{ ...originalMaterial, name: '旧响应' }], total: 1, limit: 200, offset: 0 } }))
  await view.wait()
  assert.equal(view.current.get('primary').options[0].identity.name, '最新更新')
  await view.renderOwner({ effective_session: { actions: [] } })
  const before = view.calls.length
  await view.act(async () => view.api.updateMaterial({ id: 1, name: '没有读取权限' }))
  await view.wait()
  assert.equal(view.current.get('primary').disabled, true)
  assert.equal(view.calls.length, before + 1)
  await view.render(createElement('div'))
  const unmounted = view.calls.length
  await view.api.updateMaterial({ id: 1, name: '卸载后更新' })
  await view.wait()
  assert.equal(view.calls.length, unmounted + 1)
})

test('读取过程中失去权限会取消请求，迟到成功不回填旧身份资料', async (t) => {
  const view = await setup(t)
  await view.renderOwner()
  let finish
  view.intercept((method) => method === 'list_materials' ? new Promise((resolve) => { finish = resolve }) : undefined)
  await view.act(async () => view.api.updateMaterial({ id: 1, name: '不应回填的资料' }))
  await view.wait()
  const read = view.calls.find((call) => call.method === 'list_materials')
  await view.renderOwner({ effective_session: { actions: [] } })
  assert.equal(read.request.init.signal.aborted, true)
  await view.act(async () => finish({ code: 0, data: { materials: [{ ...originalMaterial, name: '迟到资料' }], total: 1, limit: 200, offset: 0 } }))
  await view.wait()
  assert.equal(view.records[0].name, '原面料')
  assert.equal(view.current.get('primary').disabled, true)
  assert.deepEqual(view.form.getFieldsValue(true), initialValues)
})

test('列表与编辑器嵌套读取失败时，可见编辑器承接唯一提示并统一重试', async (t) => {
  const view = await setup(t, { editor: true, nestedProvider: true })
  await view.renderOwner()
  let failReads = true
  view.intercept((method) => method === 'list_materials' && failReads ? Promise.reject(new Error('read failed')) : undefined)
  await view.act(async () => view.api.createMaterial({ name: '新面料' }))
  await view.wait()
  const alerts = [...document.querySelectorAll('.ant-alert')]
  assert.equal(alerts.length, 1)
  assert.equal(Boolean(alerts[0].closest('.erp-business-form-page:not([hidden])')), true)
  failReads = false
  const retry = [...alerts[0].querySelectorAll('button')].find((button) => button.textContent === '重试读取')
  await view.act(async () => retry.click())
  await view.wait()
  assert.equal(document.querySelectorAll('.ant-alert').length, 0)
  assert.equal(view.calls.filter((call) => call.method === 'create_material').length, 1)
  assert.equal(view.calls.filter((call) => call.method === 'list_materials').length, 4)
  assert.deepEqual(view.form.getFieldsValue(true), initialValues)
})
