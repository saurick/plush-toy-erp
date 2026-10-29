import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement as h } from 'react'
import { createReactTestHarness } from '../../../scripts/test/reactRuntime.mjs'
import { applyBusinessFormReadback } from './businessFormReadback.mjs'

test('表单回读保留控件并清除校验，不因未校验字段的共享元数据产生循环引用警告', async (t) => {
  const ui = await createReactTestHarness(t)
  const { Form, Input } = await import('antd')
  const errors = []
  t.mock.method(console, 'error', (...args) => errors.push(args.join(' ')))
  let form
  function Editor() {
    [form] = Form.useForm()
    return h(Form, { form, initialValues: { note: '原说明' } }, h(Form.Item, { name: 'name', label: '名称', rules: [{ required: true, message: '名称必填' }] }, h(Input)), h(Form.Item, { name: 'note', label: '说明' }, h(Input)),
    )
  }
  await ui.render(h(Editor))
  await ui.act(() => form.setFieldsValue({ name: '' }))
  await ui.act(() => form.setFields([{ name: 'note', touched: false }]))
  await ui.act(async () => { await assert.rejects(form.validateFields()) })
  await ui.act(() => form.setFields([{ name: 'name', warnings: ['请核对名称'] }]))
  const controls = [...ui.container.querySelectorAll('input')]
  await ui.act(() => applyBusinessFormReadback(form, { name: '回读名称', note: '回读说明' }))
  assert.deepEqual(form.getFieldsValue(), { name: '回读名称', note: '回读说明' })
  assert.deepEqual(form.getFieldError('name'), [])
  assert.deepEqual(form.getFieldWarning('name'), [])
  assert.equal(form.isFieldsTouched(), false)
  const currentControls = [...ui.container.querySelectorAll('input')]
  assert.equal(currentControls.length, controls.length)
  assert.equal(currentControls.every((control, index) => control === controls[index]), true)
  assert.deepEqual(errors, [])
})
