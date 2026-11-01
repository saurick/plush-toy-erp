import assert from 'node:assert/strict'
import test from 'node:test'
import { act, createElement } from 'react'
import { installTestDOM, registerJSXTestLoader } from '../../../../scripts/test/reactRuntime.mjs'

test('remark counts follow editable, inherited disabled and readonly states without losing content', async (t) => {
  const dom = installTestDOM()
  registerJSXTestLoader()
  const [{ createRoot }, { Form }, { default: BusinessTextArea }] = await Promise.all([
    import('react-dom/client'), import('antd'), import('./BusinessTextArea.jsx'),
  ])
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  t.after(async () => {
    await act(async () => root.unmount())
    container.remove()
    dom.restore()
  })
  const value = '包装要求\n分两批交付'
  const render = async (formDisabled, props = {}) => {
    await act(async () => root.render(createElement(Form, { disabled: formDisabled }, createElement(BusinessTextArea, { value, maxLength: 255, showCount: true, ...props }))))
    assert.equal(container.querySelector('textarea').value, value)
    assert.equal(container.querySelector('.erp-business-textarea').style.getPropertyValue('--erp-textarea-rows'), String(props.minRows ?? 2))
  }
  await render(false)
  assert.equal(container.querySelector('.ant-input-data-count')?.textContent, `${value.length} / 255`)
  await render(true)
  assert.equal(container.querySelector('textarea').disabled, true)
  assert.equal(Boolean(container.querySelector('.ant-input-data-count')), false)
  await render(true, { disabled: false })
  assert.equal(container.querySelector('textarea').disabled, false)
  assert.ok(Boolean(container.querySelector('.ant-input-data-count')))
  await render(false, { readOnly: true })
  assert.equal(container.querySelector('textarea').readOnly, true)
  assert.equal(Boolean(container.querySelector('.ant-input-data-count')), false)
  await render(false, { disabled: true })
  assert.equal(Boolean(container.querySelector('.ant-input-data-count')), false)
  await render(false)
  assert.equal(container.querySelector('.ant-input-data-count')?.textContent, `${value.length} / 255`)
  await render(false, { minRows: 1 })
  await render(false, { minRows: 3 })
})
