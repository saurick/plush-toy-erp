import assert from 'node:assert/strict'
import test from 'node:test'
import { message, modal, notification, registerAntdAppApis, withMessageSemantics } from './antdApp.js'

test('message semantics retain operation keys, explicit durations, callbacks and close handles', () => {
  const calls = []
  const handle = () => {}
  const onClose = () => {}
  const api = withMessageSemantics({
    success: (...args) => { calls.push(args); return handle },
    error: (...args) => { calls.push(args); return handle },
    open: (...args) => { calls.push(args); return handle },
    destroy: (...args) => calls.push(args),
  })
  assert.equal(api.success({ key: 'save:42', content: '已保存', duration: 2, onClose }), handle)
  assert.equal(calls[0][0].key, 'save:42')
  assert.equal(calls[0][0].duration, 2)
  assert.equal(calls[0][0].onClose, onClose)
  assert.equal(calls[0][0].content.props.role, 'status')
  assert.equal(calls[0][0].content.props.children, '已保存')
  api.error('失败', 5, onClose)
  assert.equal(calls[1][0].content.props.role, 'alert')
  assert.deepEqual(calls[1].slice(1), [5, onClose])
  api.open({ key: 'save:42', content: '已确认', type: 'success', className: 'caller-style' })
  assert.equal(calls[2][0].className, 'erp-feedback-message caller-style')
  api.destroy('save:42')
  assert.deepEqual(calls[3], ['save:42'])
})

test('the existing bridge buffers feedback and preserves explicit confirmation focus', () => {
  registerAntdAppApis()
  message.info('准备完成')
  notification.warning({ key: 'export', message: '需要处理', duration: 0 })
  const calls = []
  registerAntdAppApis({
    message: { info: (config) => calls.push(['message', config]) },
    notification: { warning: (config) => calls.push(['notification', config]) },
    modal: { confirm: (config) => calls.push(['modal', config]) },
  })
  assert.equal(calls.length, 2)
  assert.equal(calls[0][1].content.props.children, '准备完成')
  assert.equal(calls[1][1].key, 'export')
  assert.equal(calls[1][1].duration, 0)
  modal.confirm({ title: '作废草稿' })
  assert.equal(calls[2][1].autoFocusButton, 'cancel')
  assert.equal(calls[2][1].width, 480)
  modal.confirm({ title: '知悉提示', autoFocusButton: 'ok', width: 520 })
  assert.equal(calls[3][1].autoFocusButton, 'ok')
  assert.equal(calls[3][1].width, 520)
  registerAntdAppApis()
})
