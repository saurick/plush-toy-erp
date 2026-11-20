import assert from 'node:assert/strict'
import test from 'node:test'
import { printTemplateCatalog } from '../config/printTemplates.mjs'
import {
  getPrintDraftProblems,
  getPrintOutputProblem,
  inspectPrintImageBudget,
  PRINT_IMAGE_LIMITS,
  assertPrintSnapshotBudget,
} from './printOutputPreflight.mjs'
import { unicodeRangeContainsText } from './printFonts.mjs'
import {
  CONTRACT_CLAUSES_PER_GROUP_MAX,
  CONTRACT_CLAUSE_GROUPS_MAX,
} from './contractClauseEditor.mjs'

test('缺图可输出，已有图片加载中、损坏或仅为单像素时必须更换或清空', () => {
  const image = { complete: false, naturalWidth: 0, naturalHeight: 0 }
  let failed = null
  let images = [image]
  const paper = {
    querySelector: () => failed,
    querySelectorAll: (selector) => (selector === 'img[src]' ? images : []),
  }
  assert.match(getPrintOutputProblem({}, {}, paper), /仍在加载/)
  image.complete = true
  assert.match(getPrintOutputProblem({}, {}, paper), /更换或清空/)
  image.naturalWidth = image.naturalHeight = 1
  assert.match(getPrintOutputProblem({}, {}, paper), /更换或清空/)
  image.naturalWidth = 640
  image.naturalHeight = 400
  image.getAttribute = () => 'data:image/png;base64,aGVsbG8='
  assert.equal(getPrintOutputProblem({}, {}, paper), '')
  images = []
  failed = {}
  assert.match(getPrintOutputProblem({}, {}, paper), /更换或清空/)
  assert.throws(() => assertPrintSnapshotBudget(paper, '<html/>'), /更换或清空/)
  failed = null
  assert.equal(getPrintOutputProblem({}, {}, paper), '')
  assert.doesNotThrow(() => assertPrintSnapshotBudget(paper, '<html/>'))
})

const purchase = printTemplateCatalog.find(
  (item) => item.key === 'material-purchase-contract'
)
test('合同条款删空与保留空条均可输出，超限不会截断现有条目', () => {
  for (const key of ['material-purchase-contract', 'processing-contract']) {
    const template = printTemplateCatalog.find((item) => item.key === key)
    for (const delivery of [
      [],
      [''],
      Array(CONTRACT_CLAUSES_PER_GROUP_MAX).fill(''),
    ]) {
      assert.equal(
        getPrintOutputProblem(template, { clauses: { delivery } }),
        ''
      )
    }
    const draft = {
      clauses: {
        delivery: Array(CONTRACT_CLAUSES_PER_GROUP_MAX + 1).fill('保留条目'),
      },
    }
    const before = structuredClone(draft)
    assert.match(
      getPrintOutputProblem(template, draft),
      /来货要求.*超过 100 条/u
    )
    assert.deepEqual(draft, before)
  }
})

test('自定义分组名称和条目可留白，分组超限明确提示且不截断', () => {
  for (const key of ['material-purchase-contract', 'processing-contract']) {
    const template = printTemplateCatalog.find((item) => item.key === key)
    for (const clauses of [
      [],
      [{ key: 'custom', label: '', items: [''] }],
      [{ key: 'empty', label: '空组', items: [] }],
    ]) {
      assert.equal(getPrintOutputProblem(template, { clauses }), '')
    }
    const clauses = Array.from(
      { length: CONTRACT_CLAUSE_GROUPS_MAX + 1 },
      (_, index) => ({ key: `group-${index}`, label: '', items: [''] })
    )
    assert.match(
      getPrintOutputProblem(template, { clauses }),
      /超过 20 个分组/u
    )
    assert.equal(clauses.length, CONTRACT_CLAUSE_GROUPS_MAX + 1)
  }
})

test('全部模板允许字段、部分明细和整行留白，无需切换空白模式且不改写已有内容', () => {
  for (const template of printTemplateCatalog) {
    for (const draft of [
      {},
      { lines: [] },
      {
        contractNo: '',
        supplierName: '',
        buyerCompany: '保留的订货单位',
        lines: [
          { materialName: '保留的材料', processingItem: '保留的加工项目' },
          { quantity: '1', unit: '', unitPrice: '0' },
          { unit: '码', quantity: ' ', unitPrice: '' },
          ...Array.from({ length: 10 }, () => ({})),
        ],
      },
      { printMode: 'blank', lines: [{}] },
    ]) {
      const original = structuredClone(draft)
      assert.deepEqual(getPrintDraftProblems(template, draft), [], template.key)
      assert.equal(getPrintOutputProblem(template, draft), '', template.key)
      assert.deepEqual(draft, original)
    }
  }
})

test('留白不绕过已填数字的精度检查，清空错误值后可以输出', () => {
  for (const printMode of ['normal', 'blank']) {
    const draft = {
      printMode,
      lines: [{ unit: '个', quantity: '1.5', unitPrice: '-1' }],
    }
    assert.deepEqual(getPrintDraftProblems(purchase, draft), [
      '第 1 行数量（个最多 0 位小数）',
      '第 1 行单价（须为非负数，最多 6 位小数）',
    ])
    assert.match(getPrintOutputProblem(purchase, draft), /请检查：/)
    draft.lines[0].quantity = ''
    draft.lines[0].unitPrice = ''
    assert.equal(getPrintOutputProblem(purchase, draft), '')
    draft.lines[0].quantity = '2'
    draft.lines[0].unitPrice = '0'
    assert.equal(getPrintOutputProblem(purchase, draft), '')
  }
})

test('单位留白不强制补齐，已填写数量仍检查数字格式', () => {
  const draft = { lines: [{ quantity: '1.234567', unit: '' }] }
  assert.equal(getPrintOutputProblem(purchase, draft), '')
  for (const quantity of ['abc', '-1', '0', '1.2345678']) {
    draft.lines[0].quantity = quantity
    assert.match(getPrintOutputProblem(purchase, draft), /第 1 行数量/)
  }
  draft.lines[0].quantity = ''
  assert.equal(getPrintOutputProblem(purchase, draft), '')
})

test('部分内容留白时仍检查损坏图片和说明框溢出', () => {
  const draft = { lines: [{}] }
  assert.match(
    getPrintOutputProblem(purchase, draft, {
      querySelector: () => ({}),
    }),
    /有图片无法使用/
  )
  assert.match(
    getPrintOutputProblem(purchase, draft, {
      querySelectorAll: (selector) =>
        selector.includes('annotation-kind')
          ? [{ clientHeight: 40, scrollHeight: 80 }]
          : [],
    }),
    /超出说明框/
  )
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
