import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Window } from 'happy-dom'
import { registerJSXTestLoader } from '../../../../scripts/test/reactRuntime.mjs'

registerJSXTestLoader()
const { default: BusinessCellStack } = await import('./BusinessCellStack.jsx')

test('复合单元格保留文字、零值及可交互节点，缺项不占空行', async () => {
  const window = new Window()
  try {
    for (const [primary, secondary, expected] of [
      [' 张小林 ', ' 13800000000 ', ['张小林', '13800000000']],
      [0, '', ['0']],
      ['', '只有补充信息', ['只有补充信息']],
      [null, undefined, ['-']],
      [createElement('button', { type: 'button' }, '复制订单号'), createElement('span', null, '用料：待审核'), ['复制订单号', '用料：待审核']],
    ]) {
      window.document.body.innerHTML = renderToStaticMarkup(createElement(BusinessCellStack, { primary, secondary }))
      const lines = [...window.document.querySelector('.erp-business-cell-stack').children]
      assert.deepEqual(lines.map((line) => line.textContent), expected)
      assert.equal(lines[0].className, '')
    }
    assert(window.document.querySelector('button'), '节点不应被转成对象字符串')
  } finally {
    await window.happyDOM.close()
  }
})
