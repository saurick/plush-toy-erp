import assert from 'node:assert/strict'
import test from 'node:test'
import { Window } from 'happy-dom'
import {
  findBlankPrintFields,
  findBlankPrintField,
} from './printBlankContentNotice.mjs'

function paper(markup) {
  const window = new Window()
  const root = window.document.createElement('div')
  root.innerHTML = markup
  return root
}

test('从最左侧的首个明细留白开始，不跳过编号列或改写纸面内容', () => {
  const root = paper(`<table><tbody><tr data-print-blank-row>
    <td data-print-blank-field="contractNo"><span contenteditable="true"></span></td>
    <td data-print-blank-field="materialName">示例材料</td>
    <td data-print-blank-field="quantity"><span contenteditable="true">&nbsp;</span></td>
    <td data-print-blank-field="unitPrice"><span contenteditable="true"><br></span></td>
  </tr></tbody></table>`)
  const before = root.innerHTML
  assert.deepEqual(
    findBlankPrintFields(root).map((field) => field.dataset.printBlankField),
    ['contractNo', 'quantity', 'unitPrice']
  )
  assert.equal(findBlankPrintField(root), root.querySelector('td'))
  assert.equal(root.innerHTML, before)
})

test('明细备注与其他空格一并提醒，签章和非编辑格不参与，零值属于已填内容', () => {
  const root = paper(`<table><tbody>
    <tr data-print-blank-row><td data-print-blank-field="quantity">&nbsp;</td><td data-print-blank-field="unitPrice">\u200b</td></tr>
    <tr data-print-blank-row><td data-print-blank-field="quantity">2</td><td data-print-blank-field="unitPrice">0</td><td data-print-blank-field="remark"></td><td></td></tr>
  </tbody></table><footer><span contenteditable="true"></span></footer>`)
  assert.deepEqual(
    findBlankPrintFields(root).map((field) => field.dataset.printBlankField),
    ['quantity', 'unitPrice', 'remark']
  )
  assert.deepEqual(findBlankPrintFields(null), [])
})

test('已填来源信息的明细仍提醒其他内容留白，合并后隐藏的格不参与', () => {
  const root = paper(`<table><tbody><tr data-print-blank-row>
    <td>示例产品编号</td><td data-print-blank-field="quantity"></td>
    <td data-print-blank-field="processingItem" colspan="2">已合并加工项目与单位</td>
  </tr></tbody></table>`)
  assert.deepEqual(
    findBlankPrintFields(root).map((field) => field.dataset.printBlankField),
    ['quantity']
  )
})

test('提醒跟随当前纸面输入消失和恢复，不依赖上一次渲染的空值标记', () => {
  const root = paper(`<table><tbody><tr data-print-blank-row>
    <td>示例项目</td><td data-print-blank-field="quantity"><span data-print-empty="true" contenteditable="true"></span></td>
  </tr></tbody></table>`)
  const editor = root.querySelector('[contenteditable]')
  assert.equal(findBlankPrintFields(root).length, 1)
  editor.textContent = '20'
  assert.deepEqual(findBlankPrintFields(root), [])
  editor.textContent = ''
  assert.equal(findBlankPrintFields(root).length, 1)
})

test('按纸面行列顺序定位留白，末尾循环回首个留白', () => {
  const root = paper(`<table><tbody>
    <tr data-print-blank-row>
      <td data-print-blank-field="materialName">材料</td>
      <td data-print-blank-field="unit"></td>
      <td data-print-blank-field="unitPrice"></td>
      <td data-print-blank-field="quantity">0</td>
    </tr>
    <tr data-print-blank-row><td data-print-blank-field="materialName"></td></tr>
  </tbody></table>`)
  const blanks = findBlankPrintFields(root)
  let current = null
  for (const expected of [...blanks, blanks[0]]) {
    current = findBlankPrintField(root, current)
    assert.equal(current, expected)
  }
})

test('首尾直接定位，上一处和下一处双向循环并跳过已填字段', () => {
  const root = paper(`<table><tr data-print-blank-row>
    <td data-print-blank-field="contractNo"></td>
    <td data-print-blank-field="unitPrice">0</td>
    <td data-print-blank-field="quantity"></td>
    <td data-print-blank-field="remark"></td>
  </tr></table>`)
  const [first, middle, last] = findBlankPrintFields(root)
  assert.equal(findBlankPrintField(root, last, 'first'), first)
  assert.equal(findBlankPrintField(root, first, 'last'), last)
  assert.equal(findBlankPrintField(root, first, 'previous'), last)
  assert.equal(findBlankPrintField(root, last, 'previous'), middle)
  assert.equal(findBlankPrintField(root, last, 'next'), first)
  assert.equal(findBlankPrintField(root, null, 'previous'), last)
})

test('当前字段补齐后双向按原位置继续，一处、零处和移除游标时使用当前纸面', () => {
  const root = paper(`<table><tr data-print-blank-row>
    <td data-print-blank-field="contractNo"></td>
    <td data-print-blank-field="quantity"></td>
    <td data-print-blank-field="remark"></td>
  </tr></table>`)
  const [first, middle, last] = findBlankPrintFields(root)
  middle.textContent = '10'
  assert.equal(findBlankPrintField(root, middle, 'previous'), first)
  assert.equal(findBlankPrintField(root, middle, 'next'), last)
  first.remove()
  assert.equal(findBlankPrintField(root, first, 'previous'), last)
  for (const action of ['first', 'previous', 'next', 'last']) {
    assert.equal(findBlankPrintField(root, middle, action), last)
  }
  last.textContent = '备注'
  for (const action of ['first', 'previous', 'next', 'last']) {
    assert.equal(findBlankPrintField(root, last, action), null)
    assert.equal(findBlankPrintField(null, last, action), null)
  }
})

test('填好当前格后不跳过相邻留白，补齐或移除内容后使用当前纸面', () => {
  const root = paper(`<table><tbody><tr data-print-blank-row>
    <td data-print-blank-field="unit"></td>
    <td data-print-blank-field="unitPrice"></td>
    <td data-print-blank-field="quantity"></td>
  </tr></tbody></table>`)
  const [unit, price, quantity] = findBlankPrintFields(root)
  assert.equal(findBlankPrintField(root), unit)
  unit.textContent = '件'
  assert.equal(findBlankPrintFields(root).length, 2)
  assert.equal(findBlankPrintField(root, unit), price)
  quantity.textContent = '10'
  assert.equal(findBlankPrintField(root, price), price)
  price.textContent = '0'
  assert.equal(findBlankPrintField(root, price), null)
  unit.textContent = ''
  assert.equal(findBlankPrintField(root, price), unit)
})

test('前一定位格已被移除或属于其他纸面时从首个留白重新开始', () => {
  const root = paper(`<table><tbody><tr data-print-blank-row>
    <td data-print-blank-field="unit"></td>
    <td data-print-blank-field="quantity"></td>
  </tr></tbody></table>`)
  const [removed, remaining] = findBlankPrintFields(root)
  removed.remove()
  assert.equal(findBlankPrintField(root, removed), remaining)
  const other = paper(
    '<table><tr data-print-blank-row><td data-print-blank-field="unit"></td></tr></table>'
  )
  assert.equal(
    findBlankPrintField(other, remaining),
    findBlankPrintFields(other)[0]
  )
  assert.equal(findBlankPrintField(null, remaining), null)
})

test('表头按可编辑值识别留白，字段标签、签署信息和签章不参与计数', () => {
  const root = paper(`<section data-print-blank-region>
    <div data-print-blank-field="contractNo">合同编号：<span contenteditable="true">&nbsp;</span></div>
    <div data-print-blank-field="orderDateText">下单日期：<span contenteditable="false"></span></div>
    <div data-print-blank-field="supplierName">供应商：<span contenteditable="true">示例供应商</span></div>
  </section>
  <table><tr data-print-blank-row><td data-print-blank-field="remark"></td></tr></table>
  <footer><div>签字：<span contenteditable="true"></span></div><span contenteditable="true"></span><div>盖章：</div></footer>`)
  const before = root.innerHTML
  assert.deepEqual(
    findBlankPrintFields(root).map((field) => field.dataset.printBlankField),
    ['contractNo', 'orderDateText', 'remark']
  )
  assert.equal(root.innerHTML, before)
  root.querySelector('[data-print-blank-field="contractNo"] span').textContent =
    'SIM-001'
  assert.equal(findBlankPrintFields(root).length, 2)
})

test('双列表头按实际纸面从上到下、同行从左到右定位，然后进入明细', () => {
  const root = paper(`<section data-print-blank-region>
    <div><div data-print-blank-field="contractNo"><span contenteditable="true"></span></div><div data-print-blank-field="supplierName"><span contenteditable="true"></span></div></div>
    <div><div data-print-blank-field="orderDateText"><span contenteditable="true"></span></div><div data-print-blank-field="buyerCompany"><span contenteditable="true"></span></div></div>
  </section><table><tr data-print-blank-row><td data-print-blank-field="materialName"></td></tr></table>`)
  const byKey = Object.fromEntries(
    findBlankPrintFields(root).map((node) => [
      node.dataset.printBlankField,
      node,
    ])
  )
  const measurements = { count: 0 }
  for (const [key, top, left] of [
    ['contractNo', 10, 0],
    ['supplierName', 50, 0],
    ['orderDateText', 10.3, 200],
    ['buyerCompany', 50.3, 200],
  ]) {
    byKey[key].getBoundingClientRect = () => {
      measurements.count += 1
      return { top, left }
    }
  }
  assert.equal(findBlankPrintFields(root).length, 5)
  assert.equal(measurements.count, 0, '输入后的计数不触发布局测量')
  let current = null
  for (const key of [
    'contractNo',
    'orderDateText',
    'supplierName',
    'buyerCompany',
    'materialName',
    'contractNo',
  ]) {
    current = findBlankPrintField(root, current)
    assert.equal(current, byKey[key])
  }
  assert.equal(findBlankPrintField(root, null, 'last'), byKey.materialName)
  current = byKey.materialName
  for (const key of [
    'buyerCompany',
    'supplierName',
    'orderDateText',
    'contractNo',
    'materialName',
  ]) {
    current = findBlankPrintField(root, current, 'previous')
    assert.equal(current, byKey[key])
  }
  byKey.contractNo.querySelector('span').textContent = 'SIM-001'
  assert.equal(findBlankPrintField(root, byKey.contractNo), byKey.orderDateText)
})

test('批量合同按每份纸面的表头、明细顺序继续，不汇总跳到另一份表头', () => {
  const root = paper(`<article>
    <section data-print-blank-region><div data-print-blank-field="first-header"><span contenteditable="true"></span></div></section>
    <table><tr data-print-blank-row><td data-print-blank-field="first-detail"></td></tr></table>
    <ol><li data-print-blank-field="first-clause">1、<span contenteditable="true"></span></li></ol>
  </article><article>
    <section data-print-blank-region><div data-print-blank-field="second-header"><span contenteditable="true"></span></div></section>
    <table><tr data-print-blank-row><td data-print-blank-field="second-detail"></td></tr></table>
    <ol><li data-print-blank-field="second-clause">1、<span contenteditable="true"></span></li></ol>
  </article>`)
  const expected = [
    'first-header',
    'first-detail',
    'first-clause',
    'second-header',
    'second-detail',
    'second-clause',
    'first-header',
  ]
  let current = null
  for (const key of expected) {
    current = findBlankPrintField(root, current)
    assert.equal(current.dataset.printBlankField, key)
  }
  assert.equal(
    findBlankPrintField(root, current, 'last').dataset.printBlankField,
    'second-clause'
  )
  assert.equal(
    findBlankPrintField(root, current, 'previous').dataset.printBlankField,
    'second-clause'
  )
  assert.equal(
    findBlankPrintField(
      root,
      root.querySelector('[data-print-blank-field="second-header"]'),
      'previous'
    ).dataset.printBlankField,
    'first-clause'
  )
})

test('非表格业务字段和合同条款参与计数，编号标签与未标记的签署字段不参与', () => {
  const root = paper(`<article>
    <span data-print-blank-field="company" contenteditable="true">&nbsp;</span>
    <div data-print-blank-field="contractNo">合同编号：<span contenteditable="true"></span></div>
    <table><tr data-print-blank-row><td data-print-blank-field="remark"></td></tr></table>
    <ol><li data-print-blank-field="clause">1、<span contenteditable="true"><br></span></li></ol>
    <footer><span contenteditable="true"></span><span contenteditable="true"></span></footer>
    <span data-print-blank-field="businessDate" contenteditable="true"></span>
  </article>`)
  const fields = findBlankPrintFields(root)
  assert.deepEqual(
    fields.map((field) => field.dataset.printBlankField),
    ['company', 'contractNo', 'remark', 'clause', 'businessDate']
  )
  let current = null
  for (const field of [...fields, fields[0]]) {
    current = findBlankPrintField(root, current)
    assert.equal(current, field)
  }
  fields[3].querySelector('[contenteditable]').textContent = '按约定结算'
  assert.equal(findBlankPrintFields(root).length, 4)
  assert.equal(findBlankPrintField(root, fields[3]), fields[4])
})

test('并排业务区域按单元格位置定位，跨行单元格内的垂直对齐不改变阅读顺序', () => {
  const root = paper(`<section data-print-blank-region>
    <table><tr><td rowspan="2"><span contenteditable="true" data-print-blank-field="left"></span></td></tr></table>
    <table><tr><td><span contenteditable="true" data-print-blank-field="right"></span></td></tr></table>
  </section>`)
  const [left, right] = findBlankPrintFields(root)
  left.closest('td').getBoundingClientRect = () => ({ top: 10, left: 0 })
  right.closest('td').getBoundingClientRect = () => ({ top: 10, left: 200 })
  left.getBoundingClientRect = () => ({ top: 40, left: 0 })
  right.getBoundingClientRect = () => ({ top: 20, left: 200 })
  assert.equal(findBlankPrintField(root), left)
  assert.equal(findBlankPrintField(root, left), right)
  assert.equal(findBlankPrintField(root, right, 'previous'), left)
})
