import assert from 'node:assert/strict'
import test from 'node:test'
import { act, createElement } from 'react'
import { installTestDOM, registerJSXTestLoader } from '../../../../scripts/test/reactRuntime.mjs'

test('processing contract fields retain their own labels beside another mounted form', async (t) => {
  const dom = installTestDOM()
  registerJSXTestLoader()
  const [{ createRoot }, { Form, Input }, { default: ContractForm }] = await Promise.all([
    import('react-dom/client'), import('antd'), import('./OutsourcingOrderForm.jsx'),
  ])
  const container = document.createElement('div')
  const style = document.createElement('style')
  // Happy DOM does not resolve the initial border widths used by the browser stylesheet.
  style.textContent = 'textarea { padding: 0px !important; border: 0px solid transparent !important; box-sizing: content-box !important; }'
  document.head.appendChild(style)
  document.body.appendChild(container)
  const root = createRoot(container)
  t.after(async () => {
    await act(async () => root.unmount())
    container.remove()
    style.remove()
    dom.restore()
  })
  function Screen() {
    const [other] = Form.useForm()
    const [contract] = Form.useForm()
    return createElement('div', null, createElement('div', { hidden: true, 'data-other-form': true }, createElement(Form, { form: other }, createElement(Form.Item, { name: 'note', label: '其他单据备注' }, createElement(Input.TextArea)))), createElement('div', { 'data-source-contract': true }, createElement(ContractForm, { form: contract, supplierOptions: [], productOptions: [], materialOptions: [], processOptions: [], unitOptions: [] })))
  }
  await act(async () => root.render(createElement(Screen)))
  const otherNote = container.querySelector('[data-other-form] textarea')
  const source = container.querySelector('[data-source-contract]')
  const note = source.querySelector('[data-form-section="备注与附件"] textarea')
  assert.ok(otherNote && note)
  assert.notEqual(note.id, otherNote.id, 'separate forms cannot share the note control id')
  const label = [...source.querySelectorAll('label')].find((node) => node.textContent === '备注')
  assert.ok(label)
  assert.equal(label.control, note, 'the contract label must activate the contract field')
  assert.deepEqual([...note.labels].map((node) => node.textContent), ['备注'])
})
