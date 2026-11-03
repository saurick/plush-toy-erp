import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { createElement as h, Fragment } from 'react'
import { createReactTestHarness } from '../../../../scripts/test/reactRuntime.mjs'

test('two copies keep field paths and values while labels and validation targets receive independent DOM names', async (t) => {
  const ui = await createReactTestHarness(t)
  const { Form, Input } = await import('antd')
  const { default: BusinessForm } = await import('./BusinessForm.jsx')
  const { BusinessSplitContext } = await import('./BusinessSplitContext.jsx')
  const instances = {}
  function Editor({ side, split }) {
    const [form] = Form.useForm()
    instances[side] = form
    return h(BusinessSplitContext.Provider, { value: { open: split, scope: side, side } }, h(BusinessForm, { form, name: 'material', initialValues: { name: `${side} 原值` }, 'data-side': side }, h(Form.Item, { label: '名称', name: 'name' }, h(Input))
      )
    )
  }
  const render = (split) => ui.render(h(Fragment, null, h(Editor, { side: 'left', split }), h(Editor, { side: 'right', split })))
  await render(false)
  const original = document.querySelector('form[data-side="right"] input')
  await ui.act(async () => instances.right.setFieldValue('name', '右栏草稿'))
  await render(true)
  const left = document.querySelector('form[data-side="left"] input')
  const right = document.querySelector('form[data-side="right"] input')
  assert.notEqual(left.id, right.id)
  assert.equal(document.querySelector('form[data-side="right"] label').control === right, true)
  assert.equal(right === original, true)
  assert.deepEqual(instances.right.getFieldsValue(), { name: '右栏草稿' })
  await render(false)
  assert.equal(right.id, 'right-material_name')
  assert.equal(right.value, '右栏草稿')
})

test('ERP form roots share BusinessForm so newly added pages cannot reintroduce duplicate pane control IDs', () => {
  const root = path.resolve(import.meta.dirname, '../..')
  const sourceFiles = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name)
    return entry.isDirectory() ? sourceFiles(file) : file.endsWith('.jsx') ? [file] : []
  })
  for (const file of sourceFiles(root)) {
    if (file.endsWith('/business-list/BusinessForm.jsx')) continue
    assert.equal(/<Form(?:\s|>)/u.test(readFileSync(file, 'utf8')), false, path.relative(root, file))
  }
})

test('read-only pages disable the shared form without changing its field values', async (t) => {
  const ui = await createReactTestHarness(t)
  const { Form, Input } = await import('antd')
  const { default: BusinessForm } = await import('./BusinessForm.jsx')
  const { businessFormReadOnly } = await import('./businessFormReadOnly.mjs')
  let instance
  function Example() {
    const [form] = Form.useForm()
    instance = form
    return businessFormReadOnly(h(BusinessForm, { form, initialValues: { note: '冻结内容' } }, h(Form.Item, { name: 'note', label: '备注' }, h(Input))))
  }
  await ui.render(h(Example))
  assert.equal(document.querySelector('input').disabled, true)
  assert.equal(instance.getFieldValue('note'), '冻结内容')
})
