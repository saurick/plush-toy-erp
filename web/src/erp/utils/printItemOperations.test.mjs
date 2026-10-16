import assert from 'node:assert/strict'
import test from 'node:test'
import {
  editPrintTableRow,
  getPrintRowBlock,
  movePrintItem,
} from './printItemOperations.mjs'
import {
  editColorCardBlock,
  editColorCardLine,
  editInstructionRow,
  editMaterialDetailLine,
  getColorCardBlockMoveTarget,
} from './engineeringPrintEditor.mjs'
import { splitColorCardBlocks } from './colorCardLayout.mjs'
import { editMaterialPurchaseRow } from './materialPurchaseContractEditor.mjs'
import { editProcessingContractRow } from './processingContractEditor.mjs'

test('条目调序保留整条对象及图片，边界和无效目标不改写原数组', () => {
  const rows = [
    { text: '甲', images: [{ dataURL: 'image-a' }] },
    { text: '乙' },
  ]
  const moved = movePrintItem(rows, 0, 'down')
  assert.equal(moved.ok, true)
  assert.equal(moved.items[1], rows[0])
  assert.equal(moved.selectedIndex, 1)
  assert.equal(rows[0].text, '甲')
  for (const [index, direction] of [
    [0, 'up'],
    [1, 'down'],
    [-1, 'down'],
    [0, 'invalid'],
  ]) {
    assert.equal(movePrintItem(rows, index, direction).ok, false)
  }
})

test('纵向合并行整块移动，所有合并坐标和当前选择一起调整', () => {
  const lines = ['甲', '乙', '丙', '丁'].map((text) => ({ text }))
  const merges = [
    { id: 'vertical', rowStart: 1, rowEnd: 2, colStart: 0, colEnd: 1 },
  ]
  const moved = editPrintTableRow({ lines, merges, rowIndex: 2, action: 'up' })
  assert.deepEqual(
    moved.lines.map(({ text }) => text),
    ['乙', '丙', '甲', '丁']
  )
  assert.deepEqual(moved.merges, [
    { id: 'vertical', rowStart: 0, rowEnd: 1, colStart: 0, colEnd: 1 },
  ])
  assert.equal(moved.selectedIndex, 1)
  assert.deepEqual(merges, [
    { id: 'vertical', rowStart: 1, rowEnd: 2, colStart: 0, colEnd: 1 },
  ])
})

test('不同列相交的合并跨度视为同一个行块，移动时不拆散', () => {
  const lines = ['甲', '乙', '丙', '丁'].map((text) => ({ text }))
  const merges = [
    { rowStart: 0, rowEnd: 1, colStart: 0, colEnd: 0 },
    { rowStart: 1, rowEnd: 2, colStart: 2, colEnd: 2 },
  ]
  assert.deepEqual(getPrintRowBlock(merges, 0), { start: 0, end: 2 })
  const moved = editPrintTableRow({
    lines,
    merges,
    rowIndex: 1,
    action: 'down',
  })
  assert.deepEqual(
    moved.lines.map(({ text }) => text),
    ['丁', '甲', '乙', '丙']
  )
  assert.deepEqual(
    moved.merges.map(({ rowStart, rowEnd }) => [rowStart, rowEnd]),
    [
      [1, 2],
      [2, 3],
    ]
  )
})

test('清空合并行块保留结构，不残留原值，不改变相邻行', () => {
  const lines = [{ text: '甲' }, { text: '乙' }, { text: '丙' }]
  const merges = [
    { id: 'clear-block', rowStart: 0, rowEnd: 1, colStart: 0, colEnd: 0 },
  ]
  const cleared = editPrintTableRow({
    lines,
    merges,
    rowIndex: 1,
    action: 'clear',
    createBlankLine: () => ({ text: '' }),
  })
  assert.deepEqual(cleared.lines, [{ text: '' }, { text: '' }, { text: '丙' }])
  assert.deepEqual(cleared.merges, merges)
  assert.notEqual(cleared.lines[0], cleared.lines[1])
  assert.equal(cleared.lines[2], lines[2])
  assert.equal(lines[0].text, '甲')
})

test('损坏的合并范围不能触发循环或静默拆分', () => {
  for (const merges of [
    [{}],
    [{ rowStart: 0, rowEnd: 9 }],
    [{ rowStart: 1, rowEnd: 0 }],
  ]) {
    assert.equal(
      editPrintTableRow({
        lines: [{ text: '甲' }],
        merges,
        rowIndex: 0,
        action: 'down',
      }).ok,
      false
    )
  }
})

test('采购、加工及物料明细的清空使用各自空行结构，不保留金额或业务残值', () => {
  const line = {
    contractNo: '旧单',
    productNo: '旧品',
    materialName: '材料',
    unit: '个',
    quantity: '2',
    unitPrice: '10',
    amount: '20',
    remark: '旧备注',
  }
  const material = editMaterialPurchaseRow({
    lines: [line],
    merges: [],
    selectedRowIndex: 0,
    action: 'clear',
  })
  const processing = editProcessingContractRow({
    lines: [line],
    merges: [],
    selectedLineIndex: 0,
    action: 'clear',
  })
  const engineering = editMaterialDetailLine(
    { lines: [line], merges: [] },
    0,
    'clear'
  )
  for (const result of [material, processing, engineering]) {
    assert.equal(result.ok, true)
    const rows = result.draft?.lines || result.lines
    assert.equal(rows.length, 1)
    assert(Object.values(rows[0]).every((value) => value === ''))
  }
  assert.equal(line.amount, '20')
})

test('色卡块仅在所在栏调序，其他栏和块内行保持不变', () => {
  const draft = {
    blocks: [
      { materialName: '左甲', side: 'left', lines: [{ position: '甲' }] },
      { materialName: '右甲', side: 'right', lines: [{ position: '乙' }] },
      { materialName: '左乙', side: 'left', lines: [{ position: '丙' }] },
      { materialName: '右乙', side: 'right', lines: [{ position: '丁' }] },
    ],
  }
  assert.equal(getColorCardBlockMoveTarget(draft, 0, 'down'), 2)
  const moved = editColorCardBlock(draft, 0, 'down')
  assert.deepEqual(
    splitColorCardBlocks(moved.draft.blocks).map((column) =>
      column.map(({ block }) => block.materialName)
    ),
    [
      ['左乙', '左甲'],
      ['右甲', '右乙'],
    ]
  )
  assert.equal(moved.selectedIndex, 2)
  assert.equal(editColorCardBlock(draft, 0, 'up').ok, false)
  const cleared = editColorCardBlock(moved.draft, 2, 'clear')
  assert.equal(cleared.draft.blocks[2].materialName, '')
  assert.deepEqual(cleared.draft.blocks[2].lines, [
    { position: '', method: '' },
  ])
  assert.equal(cleared.draft.blocks.length, 4)
})

test('自动分栏的色卡在调序时固定当前栏，避免因高度重分配跳栏', () => {
  const draft = {
    blocks: [
      { materialName: '甲', minRows: 3, lines: [] },
      { materialName: '乙', minRows: 5, lines: [] },
      { materialName: '丙', minRows: 2, lines: [] },
    ],
  }
  const before = splitColorCardBlocks(draft.blocks)
  assert.deepEqual(
    before.map((column) => column.map(({ block }) => block.materialName)),
    [['甲', '丙'], ['乙']]
  )
  const moved = editColorCardBlock(draft, 2, 'up')
  assert.deepEqual(
    splitColorCardBlocks(moved.draft.blocks).map((column) =>
      column.map(({ block }) => block.materialName)
    ),
    [['丙', '甲'], ['乙']]
  )
})

test('色卡行调序和清空只作用当前块，清空不删除行', () => {
  const draft = {
    blocks: [
      {
        minRows: 3,
        lines: [
          { position: '甲', method: 'A' },
          { position: '乙', method: 'B' },
        ],
      },
      { lines: [{ position: '其他块' }] },
    ],
  }
  const moved = editColorCardLine(draft, 0, 1, 'up')
  assert.equal(moved.draft.blocks[0].lines[0].position, '乙')
  const cleared = editColorCardLine(moved.draft, 0, 0, 'clear')
  assert.deepEqual(cleared.draft.blocks[0].lines[0], {
    position: '',
    method: '',
  })
  assert.equal(cleared.draft.blocks[0].lines.length, 2)
  assert.equal(cleared.draft.blocks[1], draft.blocks[1])
})

test('作业行调序保留图片与标注，跨分组后自动重编号；清空保留行类型', () => {
  const row = {
    type: 'step',
    no: '2',
    text: '乙',
    images: [{ dataURL: 'img' }],
    imageCallouts: [{ text: '说明' }],
    heightMm: 18,
  }
  const draft = {
    rows: [
      { type: 'title', text: '第一组' },
      { type: 'step', no: '1', text: '甲' },
      row,
      { type: 'title', text: '第二组' },
      { type: 'step', no: '1', text: '丙' },
    ],
  }
  const moved = editInstructionRow(draft, 2, 'down')
  assert.deepEqual(
    moved.draft.rows.map(({ no }) => no),
    ['', '1', '', '1', '2']
  )
  assert.deepEqual(moved.draft.rows[3].images, row.images)
  assert.deepEqual(moved.draft.rows[3].imageCallouts, row.imageCallouts)
  const cleared = editInstructionRow(moved.draft, 3, 'clear')
  assert.equal(cleared.draft.rows[3].type, 'step')
  assert.equal(cleared.draft.rows[3].no, '1')
  assert.equal(cleared.draft.rows[3].text, '')
  assert.deepEqual(cleared.draft.rows[3].images, [])
  assert.equal(draft.rows[2].text, '乙')
})

test('续页行调序只调整当前页，并保留其他页和表头', () => {
  const draft = {
    rows: [{ text: '主纸面' }],
    continuationPages: [
      {
        productNo: '页一',
        rows: [
          { type: 'step', text: '甲' },
          { type: 'step', text: '乙' },
        ],
      },
      { productNo: '页二', rows: [{ text: '其他页' }] },
    ],
  }
  const moved = editInstructionRow(draft, 1, 'up', 0)
  assert.deepEqual(
    moved.draft.continuationPages[0].rows.map(({ text, no }) => [text, no]),
    [
      ['乙', '1'],
      ['甲', '2'],
    ]
  )
  assert.equal(moved.draft.continuationPages[0].productNo, '页一')
  assert.equal(moved.draft.continuationPages[1], draft.continuationPages[1])
  assert.equal(moved.draft.rows, draft.rows)
})
