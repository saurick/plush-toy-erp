import assert from 'node:assert/strict'
import test from 'node:test'
import { printTemplateCatalog } from '../config/printTemplates.mjs'
import {
  getPrintDraftProblems,
  getPrintOutputProblem,
  inspectPrintImageBudget,
  PRINT_IMAGE_LIMITS,
} from './printOutputPreflight.mjs'
import { unicodeRangeContainsText } from './printFonts.mjs'

const purchase = printTemplateCatalog.find(
  (item) => item.key === 'material-purchase-contract'
)
test('合同缺值逐项提示，零价、选填项和明确空表均可输出', () => {
  const draft = {
    contractNo: 'PO-1',
    supplierName: '供应方',
    buyerCompany: '订货单位',
    lines: [{ materialName: '面料', quantity: 1, unitPrice: 0 }],
  }
  assert.deepEqual(getPrintDraftProblems(purchase, draft), [])
  assert(
    getPrintDraftProblems(purchase, {
      ...draft,
      supplierName: '',
      lines: [],
    }).includes('供应方名称')
  )
  assert(
    getPrintDraftProblems(purchase, {
      ...draft,
      lines: [{ quantity: 1 }],
    }).includes('第 1 行材料品名')
  )
  assert.deepEqual(getPrintDraftProblems(purchase, { printMode: 'blank' }), [])
})

test('长图展开的每段均计数，图片边界与服务端预算相同', () => {
  const root = (sources) => ({
    querySelectorAll: () => sources.map((src) => ({ getAttribute: () => src })),
  })
  const image = 'data:image/png;base64,aGVsbG8='
  assert.equal(inspectPrintImageBudget(root(Array(32).fill(image))).problem, '')
  assert.match(
    inspectPrintImageBudget(root(Array(33).fill(image))).problem,
    /33/
  )
  const large = `data:image/png;base64,${Buffer.alloc(PRINT_IMAGE_LIMITS.eachBytes + 1).toString('base64')}`
  assert.match(inspectPrintImageBudget(root([large])).problem, /5 MB/)
  const chunk = `data:image/png;base64,${Buffer.alloc(4 * 1024 * 1024 + 1).toString('base64')}`
  assert.match(
    inspectPrintImageBudget(root(Array(4).fill(chunk))).problem,
    /16 MB/
  )
})

test('字体按实际字符选择分片，涵盖范围、通配符和增补平面', () => {
  assert.equal(unicodeRangeContainsText('U+4E00-9FFF', '中文'), true)
  assert.equal(unicodeRangeContainsText('U+4E??', '一'), true)
  assert.equal(unicodeRangeContainsText('U+1F600', '😀'), true)
  assert.equal(unicodeRangeContainsText('U+0000-00FF', '中文'), false)
})

test('已有草稿的说明框在输出前检查横向和纵向溢出，调整后允许输出', () => {
  const box = {
    clientWidth: 100,
    clientHeight: 40,
    scrollWidth: 100,
    scrollHeight: 80,
  }
  const paper = {
    querySelectorAll: (selector) =>
      selector.includes('annotation-kind') ? [box] : [],
  }
  assert.match(getPrintOutputProblem({}, {}, paper), /扩大说明框或拆分说明/)
  box.clientHeight = 80
  assert.equal(getPrintOutputProblem({}, {}, paper), '')
  box.scrollWidth = 130
  assert.match(getPrintOutputProblem({}, {}, paper), /超出说明框/)
  box.clientWidth = 130
  assert.equal(getPrintOutputProblem({}, {}, paper), '')
  box.scrollHeight = 81
  assert.equal(getPrintOutputProblem({}, {}, paper), '')
  box.clientHeight = 0
  assert.equal(getPrintOutputProblem({}, {}, paper), '')
})
