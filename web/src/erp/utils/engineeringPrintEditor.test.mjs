import assert from 'node:assert/strict'
import test from 'node:test'

import {
  COLOR_CARD_TEMPLATE_KEY,
  MATERIAL_DETAIL_TEMPLATE_KEY,
  WORK_INSTRUCTION_TEMPLATE_KEY,
  WORK_INSTRUCTION_DEFAULT_ROW_HEIGHT_MM,
  WORK_INSTRUCTION_ROW_TYPES,
  applyEngineeringPrintRuntimeSample,
  buildColorCardDraftFromBOMVersion,
  buildMaterialDetailDraftFromBOMVersion,
  buildWorkInstructionDraftFromBOMVersion,
  buildWorkInstructionDraftFromOutsourcingOrder,
  createEngineeringPrintDraft,
} from '../data/engineeringPrintTemplates.mjs'
import {
  ENGINEERING_PRINT_LIMITS,
  applyMaterialDetailCellMerge,
  createBlankEngineeringDraft,
  insertColorCardBlock,
  insertColorCardLine,
  insertContinuationInstructionRow,
  insertInstructionRow,
  insertMaterialDetailLine,
  removeColorCardBlock,
  removeColorCardLine,
  removeContinuationInstructionRow,
  removeInstructionRow,
  removeMaterialDetailLine,
  setContinuationInstructionRowType,
  setInstructionRowType,
  splitMaterialDetailCellMerge,
} from './engineeringPrintEditor.mjs'

test('engineeringPrintTemplates: BOM 版本带值生成物料明细并保留产品核心字段', () => {
  const draft = buildMaterialDetailDraftFromBOMVersion(
    {
      product_id: 11,
      version: 'V3',
      note: '单方向毛向',
      items: [
        {
          material_id: 21,
          unit_id: 31,
          quantity: '0.125',
          loss_rate: '8',
          position: '脸*1',
          piece_count: '1',
          total_usage_snapshot: '47.64',
          process_base: '布底贴12g纸朴',
          process_method: '热裁',
          note: '热裁',
        },
      ],
      source_order_no: 'WL260102',
      quantity_text: '3030',
      spare_text: '备品 30',
      print_date: 1768780800,
      designer: '罗伟',
      maker: '成慧怡',
      auditor: '审核人',
      hair_direction: '单方向',
    },
    {
      companyName: '东莞市永绅玩具有限公司',
      products: [
        {
          id: 11,
          code: '26204#',
          name: '抱抱猴子',
          style_no: '黑色',
          customer_style_no: '客户款 A',
        },
      ],
      materials: [
        {
          id: 21,
          code: 'MAT-BLACK-51',
          name: '黑色毛绒',
          category: '面料',
          spec: '51"',
          color: '黑色',
        },
      ],
      units: [{ id: 31, code: 'Y', name: '码' }],
    }
  )

  assert.equal(draft.companyName, '东莞市永绅玩具有限公司')
  assert.equal(draft.productNo, '26204#')
  assert.equal(draft.productName, '抱抱猴子 / 黑色 / 客户款 A')
  assert.equal(draft.orderNo, 'WL260102')
  assert.equal(draft.quantityText, '3030')
  assert.equal(draft.spareText, '备品 30')
  assert.equal(draft.dateText, '2026-01-19')
  assert.equal(draft.designer, '罗伟')
  assert.equal(draft.maker, '成慧怡')
  assert.equal(draft.auditor, '审核人')
  assert.equal(draft.hairDirection, '单方向')
  assert.equal(draft.topRemark, '单方向毛向')
  assert.deepEqual(draft.lines[0], {
    category: '面料',
    materialName: '黑色毛绒',
    vendorCode: 'MAT-BLACK-51',
    spec: '51"',
    color: '黑色',
    unit: '码',
    position: '脸*1',
    pieces: '1',
    unitUsage: '0.125',
    lossRate: '8',
    totalUsage: '47.64',
    processBase: '布底贴12g纸朴',
    processMethod: '热裁',
    remark: '热裁',
  })
})

test('engineeringPrintTemplates: BOM 版本带值生成色卡并用材料快照填充物料块', () => {
  const draft = buildColorCardDraftFromBOMVersion(
    {
      product_id: 11,
      items: [
        {
          material_id: 21,
          position: '后头*2',
          process_base: '布底贴12g纸朴',
          process_method: '热裁',
          note: '热裁 -2',
        },
      ],
      maker: '成慧怡',
      print_date: 1783641600,
      auditor: '工程审核',
    },
    {
      companyName: '东莞市永绅玩具有限公司',
      productOptions: [{ value: 11, label: '26204# / 抱抱猴子 / 黑色' }],
      materials: [
        {
          id: 21,
          code: 'MAT-YELLOW-51',
          name: '黄色毛绒',
          spec: '51"',
          color: '黄色',
        },
      ],
    }
  )

  assert.equal(draft.companyName, '东莞市永绅玩具有限公司')
  assert.equal(draft.productNo, '26204#')
  assert.equal(draft.productName, '抱抱猴子 / 黑色')
  assert.equal(draft.maker, '成慧怡')
  assert.equal(draft.dateText, '2026-07-10')
  assert.equal(draft.auditor, '工程审核')
  assert.equal(draft.blocks.length, 1)
  assert.equal(draft.blocks[0].materialName, '51" 黄色 黄色毛绒')
  assert.equal(draft.blocks[0].vendor, '料号：MAT-YELLOW-51')
  assert.deepEqual(draft.blocks[0].lines, [
    { position: '后头*2', method: '布底贴12g纸朴；热裁；热裁 -2' },
  ])
})

test('engineeringPrintTemplates: BOM 版本带值生成作业指导书工程资料草稿', () => {
  const draft = buildWorkInstructionDraftFromBOMVersion(
    {
      product_id: 11,
      version: 'V3',
      note: '按签样执行',
      source_order_no: 'WL260102',
      maker: '制表人',
      designer: '罗伟',
      auditor: '审核人',
      items: [
        {
          material_id: 21,
          unit_id: 31,
          quantity: '0.125',
          position: '脸*1',
          piece_count: '1',
          process_method: '热裁',
          note: '按色卡裁片',
        },
      ],
    },
    {
      companyName: '东莞市永绅玩具有限公司',
      productOptions: [{ value: 11, label: '26204# / 抱抱猴子 / 黑色' }],
      materials: [{ id: 21, name: '黑色毛绒', code: 'MAT-BLACK-51' }],
      units: [{ id: 31, name: '码', code: 'Y' }],
    }
  )

  assert.equal(draft.companyName, '东莞市永绅玩具有限公司')
  assert.equal(draft.productNo, '26204#')
  assert.equal(draft.productName, '抱抱猴子 / 黑色')
  assert.equal(draft.orderNo, 'WL260102')
  assert.equal(draft.versionText, 'BOM V3')
  assert.equal(draft.processName, '热裁')
  assert.equal(draft.department, '生产部 / 品质部')
  assert.equal(draft.maker, '制表人')
  assert.equal(draft.designer, '罗伟')
  assert.equal(draft.auditor, '审核人')
  assert.equal(draft.remark, '按签样执行')
  assert.equal(draft.rows.length, 1)
  assert.equal(draft.rows[0].type, WORK_INSTRUCTION_ROW_TYPES.step)
  assert.equal(
    draft.rows[0].text,
    '黑色毛绒 / 脸*1；用量：0.125码；片数：1；加工：热裁；备注：按色卡裁片'
  )
})

test('engineeringPrintTemplates: 委外订单带值生成外发作业指导书草稿', () => {
  const draft = buildWorkInstructionDraftFromOutsourcingOrder(
    {
      outsourcing_order_no: 'WX260701',
      source_order_no: 'SO260601',
      expected_return_date: '2026-07-20T00:00:00Z',
      supplier_snapshot: {
        short_name: '成慧怡',
      },
    },
    [
      {
        line_status: 'open',
        product_no_snapshot: '26204#',
        sku_code_snapshot: 'SKU-RED-M',
        product_name_snapshot: '抱抱猴子',
        process_name_snapshot: '车缝',
        unit_name_snapshot: '只',
        outsourcing_quantity: '300',
        note: '按签样执行',
      },
      {
        line_status: 'cancelled',
        product_no_snapshot: 'OLD',
        product_name_snapshot: '已取消',
        process_name_snapshot: '手工',
        outsourcing_quantity: '10',
      },
    ],
    {
      companyName: '东莞市永绅玩具有限公司',
    }
  )

  assert.equal(draft.companyName, '东莞市永绅玩具有限公司')
  assert.equal(draft.productNo, '26204# / SKU-RED-M')
  assert.equal(draft.productName, '抱抱猴子')
  assert.equal(draft.orderNo, 'WX260701')
  assert.equal(draft.versionText, '回货日期：2026-07-20')
  assert.equal(draft.processName, '车缝')
  assert.equal(draft.department, '生产部 / 品质部')
  assert.equal(draft.remark, '加工厂：成慧怡；来源订单：SO260601')
  assert.equal(draft.rows.length, 2)
  assert.equal(draft.rows[0].type, WORK_INSTRUCTION_ROW_TYPES.title)
  assert.equal(draft.rows[0].text, '外发加工信息')
  assert.equal(draft.rows[1].type, WORK_INSTRUCTION_ROW_TYPES.step)
  assert.equal(
    draft.rows[1].text,
    '加工项目：车缝；产品：26204# / SKU-RED-M / 抱抱猴子；数量：300只；要求：按签样执行'
  )
  assert.equal(
    draft.rows.some((row) => row.text.includes('已取消')),
    false
  )
})

test('engineeringPrintEditor: 物料明细插入行不复制已有业务值且至少保留一行', () => {
  const draft = createEngineeringPrintDraft(MATERIAL_DETAIL_TEMPLATE_KEY)
  const inserted = insertMaterialDetailLine(draft, 0, 'after')

  assert.equal(inserted.ok, true)
  assert.equal(inserted.selectedIndex, 1)
  assert.equal(inserted.draft.lines.length, draft.lines.length + 1)
  assert.equal(inserted.draft.lines[1].materialName, '')
  assert.equal(inserted.draft.lines[1].unitUsage, '')

  const single = createBlankEngineeringDraft(MATERIAL_DETAIL_TEMPLATE_KEY)
  const removed = removeMaterialDetailLine(single, 0)

  assert.equal(removed.ok, false)
  assert.match(removed.message, /至少保留一行/)
})

test('engineeringPrintEditor: 物料明细合并单元格只保留左上角并随行增删移动', () => {
  const draft = createEngineeringPrintDraft(MATERIAL_DETAIL_TEMPLATE_KEY, {
    lines: [
      { materialName: '黑色毛绒', vendorCode: '客供', spec: '51"' },
      { materialName: '灰色布', vendorCode: '旭辉', spec: '58"' },
      { materialName: '水晶眼', vendorCode: '客供', spec: '10.5mm' },
    ],
  })
  const merged = applyMaterialDetailCellMerge({
    lines: draft.lines,
    merges: draft.merges,
    selection: { rowStart: 0, rowEnd: 1, colStart: 1, colEnd: 2 },
  })

  assert.equal(merged.ok, true)
  assert.equal(merged.lines[0].materialName, '黑色毛绒')
  assert.equal(merged.lines[0].vendorCode, '')
  assert.equal(merged.lines[1].materialName, '')
  assert.equal(merged.lines[1].vendorCode, '')
  assert.equal(merged.merges.length, 1)

  const inserted = insertMaterialDetailLine(
    { ...draft, lines: merged.lines, merges: merged.merges },
    0,
    'before'
  )

  assert.equal(inserted.ok, true)
  assert.deepEqual(
    inserted.draft.merges.map(({ rowStart, rowEnd, colStart, colEnd }) => ({
      rowStart,
      rowEnd,
      colStart,
      colEnd,
    })),
    [{ rowStart: 1, rowEnd: 2, colStart: 1, colEnd: 2 }]
  )

  const removed = removeMaterialDetailLine(inserted.draft, 1)

  assert.equal(removed.ok, true)
  assert.equal(removed.draft.merges.length, 0)
  assert.equal(
    removed.draft.lines.some((line) => line.materialName === '黑色毛绒'),
    false
  )

  const split = splitMaterialDetailCellMerge({
    merges: merged.merges,
    rowIndex: 0,
    colIndex: 1,
  })

  assert.equal(split.ok, true)
  assert.equal(split.merges.length, 0)
})

test('engineeringPrintEditor: 色卡块和块内行可插入移除且不回填样例物料', () => {
  const draft = createEngineeringPrintDraft(COLOR_CARD_TEMPLATE_KEY)
  const insertedBlock = insertColorCardBlock(draft, 0, 'before')

  assert.equal(insertedBlock.ok, true)
  assert.equal(insertedBlock.selectedIndex, 0)
  assert.equal(insertedBlock.draft.blocks[0].materialName, '')
  assert.equal(insertedBlock.draft.blocks[0].vendor, '厂商：')

  const insertedLine = insertColorCardLine(insertedBlock.draft, 0, 0, 'after')

  assert.equal(insertedLine.ok, true)
  assert.equal(insertedLine.selectedBlockIndex, 0)
  assert.equal(insertedLine.selectedLineIndex, 1)
  assert.deepEqual(insertedLine.draft.blocks[0].lines[1], {
    position: '',
    method: '',
  })

  const removedLine = removeColorCardLine(insertedLine.draft, 0, 1)

  assert.equal(removedLine.ok, true)
  assert.equal(removedLine.draft.blocks[0].lines.length, 3)
})

test('engineeringPrintEditor: 色卡可从空白占位行上插或下插可见空白行', () => {
  const draft = createEngineeringPrintDraft(COLOR_CARD_TEMPLATE_KEY, {
    blocks: [
      {
        materialName: '主料',
        vendor: '厂商：客供',
        side: 'left',
        minRows: 3,
        lines: [{ position: '面布*1', method: '热裁' }],
      },
    ],
  })

  const insertedBefore = insertColorCardLine(draft, 0, 1, 'before')

  assert.equal(insertedBefore.ok, true)
  assert.equal(insertedBefore.selectedBlockIndex, 0)
  assert.equal(insertedBefore.selectedLineIndex, 1)
  assert.equal(insertedBefore.draft.blocks[0].lines.length, 2)
  assert.deepEqual(insertedBefore.draft.blocks[0].lines[1], {
    position: '',
    method: '',
  })
  assert.equal(insertedBefore.draft.blocks[0].minRows, 4)

  const insertedAfter = insertColorCardLine(draft, 0, 1, 'after')

  assert.equal(insertedAfter.ok, true)
  assert.equal(insertedAfter.selectedBlockIndex, 0)
  assert.equal(insertedAfter.selectedLineIndex, 2)
  assert.equal(insertedAfter.draft.blocks[0].lines.length, 3)
  assert.deepEqual(insertedAfter.draft.blocks[0].lines[1], {
    position: '',
    method: '',
  })
  assert.deepEqual(insertedAfter.draft.blocks[0].lines[2], {
    position: '',
    method: '',
  })
  assert.equal(insertedAfter.draft.blocks[0].minRows, 4)

  const removedInsertedAfter = removeColorCardLine(
    insertedAfter.draft,
    0,
    insertedAfter.selectedLineIndex
  )

  assert.equal(removedInsertedAfter.ok, true)
  assert.equal(removedInsertedAfter.draft.blocks[0].minRows, 3)
})

test('engineeringPrintEditor: 色卡块内行可超过源表 12 行且仍保留安全上限', () => {
  const draft = createEngineeringPrintDraft(COLOR_CARD_TEMPLATE_KEY, {
    blocks: [
      {
        materialName: '主料',
        vendor: '厂商：客供',
        side: 'left',
        minRows: 12,
        lines: Array.from({ length: 12 }, (_, index) => ({
          position: `部位${index + 1}`,
          method: '热裁',
        })),
      },
    ],
  })

  const insertedThirteenthLine = insertColorCardLine(draft, 0, 11, 'after')

  assert.equal(insertedThirteenthLine.ok, true)
  assert.equal(insertedThirteenthLine.selectedLineIndex, 12)
  assert.equal(insertedThirteenthLine.draft.blocks[0].lines.length, 13)

  const cappedDraft = createEngineeringPrintDraft(COLOR_CARD_TEMPLATE_KEY, {
    blocks: [
      {
        materialName: '主料',
        vendor: '厂商：客供',
        side: 'left',
        minRows: ENGINEERING_PRINT_LIMITS.colorBlockLines,
        lines: Array.from(
          { length: ENGINEERING_PRINT_LIMITS.colorBlockLines },
          (_, index) => ({
            position: `部位${index + 1}`,
            method: '热裁',
          })
        ),
      },
    ],
  })
  const overLimit = insertColorCardLine(
    cappedDraft,
    0,
    ENGINEERING_PRINT_LIMITS.colorBlockLines - 1,
    'after'
  )

  assert.equal(overLimit.ok, false)
  assert.match(
    overLimit.message,
    new RegExp(`最多支持 ${ENGINEERING_PRINT_LIMITS.colorBlockLines} 行`)
  )
})

test('engineeringPrintEditor: 色卡左右栏各至少保留一个块但不锁死右侧第一块', () => {
  const draft = createEngineeringPrintDraft(COLOR_CARD_TEMPLATE_KEY)
  const firstRightIndex = draft.blocks.findIndex(
    (block) => block.side === 'right'
  )

  assert.ok(firstRightIndex > 0)

  const insertedRight = insertColorCardBlock(draft, firstRightIndex, 'after')

  assert.equal(insertedRight.ok, true)
  assert.equal(
    insertedRight.draft.blocks[insertedRight.selectedIndex].side,
    'right'
  )

  const removedFirstRight = removeColorCardBlock(
    insertedRight.draft,
    firstRightIndex
  )

  assert.equal(removedFirstRight.ok, true)
  assert.ok(
    removedFirstRight.draft.blocks.some((block) => block.side === 'right')
  )

  const onePerSideDraft = createEngineeringPrintDraft(COLOR_CARD_TEMPLATE_KEY, {
    blocks: [
      {
        materialName: '主料',
        vendor: '厂商：客供',
        side: 'left',
        lines: [{ position: '脸*1', method: '热裁 -1' }],
      },
      {
        materialName: '辅料',
        vendor: '厂商：客供',
        side: 'right',
        lines: [{ position: '眼*2', method: '贴纸配套' }],
      },
    ],
  })
  const removeOnlyRight = removeColorCardBlock(onePerSideDraft, 1)

  assert.equal(removeOnlyRight.ok, false)
  assert.match(removeOnlyRight.message, /左右栏各至少保留/)
})

test('engineeringPrintEditor: 作业指导书作业行增删后按模块重编行号', () => {
  const draft = createEngineeringPrintDraft(WORK_INSTRUCTION_TEMPLATE_KEY)
  const inserted = insertInstructionRow(draft, 0, 'after')

  assert.equal(inserted.ok, true)
  assert.equal(inserted.selectedIndex, 1)
  assert.equal(inserted.draft.rows[1].text, '')
  assert.equal(
    inserted.draft.rows[1].heightMm,
    WORK_INSTRUCTION_DEFAULT_ROW_HEIGHT_MM
  )
  assert.equal(inserted.draft.rows[1].fontSizePt, null)
  assert.equal(inserted.draft.rows[1].imageAreaHeightMm, null)
  assert.deepEqual(inserted.draft.rows[1].imageNotes, { left: '', right: '' })
  assert.deepEqual(inserted.draft.rows[1].imageCallouts, [])
  assert.deepEqual(inserted.draft.rows[1].imageLabels, [])
  assert.deepEqual(inserted.draft.rows[1].images, [])
  assert.deepEqual(
    inserted.draft.rows
      .filter((row) => row.type === WORK_INSTRUCTION_ROW_TYPES.step)
      .slice(0, 4)
      .map((row) => row.no),
    ['1', '2', '3', '1']
  )

  const insertedBefore = insertInstructionRow(inserted.draft, 2, 'before')

  assert.equal(insertedBefore.ok, true)
  assert.equal(insertedBefore.selectedIndex, 2)
  assert.deepEqual(
    insertedBefore.draft.rows
      .filter((row) => row.type === WORK_INSTRUCTION_ROW_TYPES.step)
      .slice(0, 5)
      .map((row) => row.no),
    ['1', '2', '3', '4', '1']
  )

  const blank = createBlankEngineeringDraft(WORK_INSTRUCTION_TEMPLATE_KEY)
  const removed = removeInstructionRow(insertedBefore.draft, 2)

  assert.equal(removed.ok, true)
  assert.equal(removed.draft.rows.length, insertedBefore.draft.rows.length - 1)
  assert.deepEqual(
    removed.draft.rows
      .filter((row) => row.type === WORK_INSTRUCTION_ROW_TYPES.step)
      .slice(0, 5)
      .map((row) => row.no),
    ['1', '2', '3', '1', '1']
  )

  const removeBlank = removeInstructionRow(blank, 0)

  assert.equal(removeBlank.ok, true)
  assert.equal(removeBlank.draft.rows.length, 7)
})

test('engineeringPrintEditor: 作业指导书默认样例只保留首个备注前模板', () => {
  const draft = createEngineeringPrintDraft(WORK_INSTRUCTION_TEMPLATE_KEY)
  const stepRows = draft.rows.filter(
    (row) => row.type === WORK_INSTRUCTION_ROW_TYPES.step
  )

  assert.deepEqual(draft.continuationPages, [])
  assert.equal(draft.rows.length, 10)
  assert.equal(stepRows.length, 5)
  assert.equal(stepRows[0].no, '1')
  assert.deepEqual(
    stepRows.map((row) => row.no),
    ['1', '2', '1', '1', '2']
  )
  assert.deepEqual(
    draft.rows.map((row) => row.type),
    [
      WORK_INSTRUCTION_ROW_TYPES.title,
      WORK_INSTRUCTION_ROW_TYPES.step,
      WORK_INSTRUCTION_ROW_TYPES.step,
      WORK_INSTRUCTION_ROW_TYPES.title,
      WORK_INSTRUCTION_ROW_TYPES.step,
      WORK_INSTRUCTION_ROW_TYPES.title,
      WORK_INSTRUCTION_ROW_TYPES.text,
      WORK_INSTRUCTION_ROW_TYPES.step,
      WORK_INSTRUCTION_ROW_TYPES.step,
      WORK_INSTRUCTION_ROW_TYPES.text,
    ]
  )
  assert.deepEqual(
    draft.rows.map((row) => row.heightMm),
    Array.from({ length: 10 }, () => WORK_INSTRUCTION_DEFAULT_ROW_HEIGHT_MM)
  )
  assert.equal(
    draft.rows.some((row) => row.imageAreaHeightMm),
    false
  )
  assert.equal(
    draft.rows.some((row) => row.imageNotes.left || row.imageNotes.right),
    false
  )
  assert.equal(
    draft.rows.some((row) => row.images.length > 0),
    false
  )
  assert.match(draft.rows.at(-1).text, /备注：如有不明或不详处/u)
  assert.equal(draft.rows.at(-1).no, '')
})

test('engineeringPrintEditor: 客户样例覆盖 Sheet1 文本但不预置作业行图片', () => {
  const draft = createEngineeringPrintDraft(WORK_INSTRUCTION_TEMPLATE_KEY)
  const withSample = applyEngineeringPrintRuntimeSample(
    WORK_INSTRUCTION_TEMPLATE_KEY,
    draft,
    {
      draftPatch: {
        companyName: '东莞市永绅玩具有限公司',
        productName: '猴子抱抱-头',
        rows: [
          {
            type: WORK_INSTRUCTION_ROW_TYPES.title,
            text: '车缝：     针型号:12#针   每英寸:10-11 针',
          },
          {
            type: WORK_INSTRUCTION_ROW_TYPES.step,
            text: '止口必须一致，不能松线、跳针、断线，起皱。',
            heightMm: WORK_INSTRUCTION_DEFAULT_ROW_HEIGHT_MM,
          },
          {
            type: WORK_INSTRUCTION_ROW_TYPES.text,
            text: '注：车缝止口均匀，头车5mm止口。进出针倒针牢固！！',
          },
          {
            type: WORK_INSTRUCTION_ROW_TYPES.step,
            no: '1',
            text: '面打折：折位对齐打折，打折拖圆顺，不可起角。',
            heightMm: 11.6,
          },
          {
            type: WORK_INSTRUCTION_ROW_TYPES.step,
            no: '2',
            text: '面部打好折之后，然后才能去打鼻子、眼睛。',
            heightMm: 11.6,
          },
          {
            type: WORK_INSTRUCTION_ROW_TYPES.step,
            no: '3',
            text: '打眼鼻：按样板核对眼鼻配件、位置和方向。',
            heightMm: 11.6,
          },
          {
            type: WORK_INSTRUCTION_ROW_TYPES.step,
            no: '4',
            text: '上后头：左/右后头对齐脸片点位车。',
            heightMm: 11.6,
          },
          {
            type: WORK_INSTRUCTION_ROW_TYPES.step,
            no: '5',
            text: '头下面折边：向内折8mm，压4mm止口明线。',
            heightMm: 11.6,
          },
        ],
        continuationPages: [],
      },
      headerImage: {
        name: 'Sheet1 页眉图',
        url: '/test-assets/engineering/header-product.png',
        mimeType: 'image/png',
        crop: { left: 8.696, top: 26.615, right: 17.073, bottom: 38.995 },
      },
      rowImages: [],
    }
  )

  assert.equal(withSample.companyName, '东莞市永绅玩具有限公司')
  assert.equal(withSample.productName, '猴子抱抱-头')
  assert.equal(withSample.rows.length, 8)
  assert.deepEqual(
    withSample.rows.map((row) => row.type),
    [
      WORK_INSTRUCTION_ROW_TYPES.title,
      WORK_INSTRUCTION_ROW_TYPES.step,
      WORK_INSTRUCTION_ROW_TYPES.text,
      WORK_INSTRUCTION_ROW_TYPES.step,
      WORK_INSTRUCTION_ROW_TYPES.step,
      WORK_INSTRUCTION_ROW_TYPES.step,
      WORK_INSTRUCTION_ROW_TYPES.step,
      WORK_INSTRUCTION_ROW_TYPES.step,
    ]
  )
  assert.deepEqual(
    withSample.rows.map((row) => row.heightMm),
    Array.from({ length: 8 }, () => WORK_INSTRUCTION_DEFAULT_ROW_HEIGHT_MM)
  )
  assert.deepEqual(
    withSample.rows
      .filter((row) => row.type === WORK_INSTRUCTION_ROW_TYPES.step)
      .map((row) => row.no),
    ['1', '1', '2', '3', '4', '5']
  )
  assert.equal(
    withSample.rows.some((row) => row.imageAreaHeightMm),
    false
  )
  assert.equal(
    withSample.rows.some((row) => row.imageNotes.left || row.imageNotes.right),
    false
  )
  assert.equal(
    withSample.rows.some((row) => row.images.length > 0),
    false
  )
  assert.match(
    withSample.rows.find((row) => row.type === WORK_INSTRUCTION_ROW_TYPES.text)
      .text,
    /头车5mm止口/u
  )
  assert.match(withSample.rows[4].text, /面部打好折/u)
  assert.equal(
    withSample.images.header.dataURL,
    '/test-assets/engineering/header-product.png'
  )
  assert.deepEqual(withSample.images.header.crop, {
    left: 8.696,
    top: 26.615,
    right: 17.073,
    bottom: 38.995,
  })
  assert.deepEqual(withSample.continuationPages, [])
})

test('engineeringPrintEditor: 作业指导书续页作业行增删后行号在当前页连续', () => {
  const draft = createEngineeringPrintDraft(WORK_INSTRUCTION_TEMPLATE_KEY, {
    continuationPages: [
      {
        processName: '车缝',
        productName: '测试续页',
        rows: Array.from({ length: 20 }, (_, index) => ({
          no: String(index + 1),
          text: `续页行 ${index + 1}`,
          heightMm: index === 17 ? 216 : 11.6,
          imageAreaHeightMm: index === 17 ? 190 : null,
        })),
      },
      {
        processName: '手工',
        productName: '测试续页',
        rows: Array.from({ length: 3 }, (_, index) => ({
          no: String(index + 1),
          text: `手工行 ${index + 1}`,
          heightMm: 11.6,
        })),
      },
    ],
  })
  const inserted = insertContinuationInstructionRow(draft, 0, 17, 'after')

  assert.equal(inserted.ok, true)
  assert.equal(inserted.selectedIndex, 18)
  assert.equal(inserted.draft.rows.length, draft.rows.length)
  assert.equal(inserted.draft.continuationPages[0].rows.length, 21)
  assert.equal(inserted.draft.continuationPages[1].rows.length, 3)
  assert.deepEqual(inserted.draft.continuationPages[0].rows[18], {
    type: WORK_INSTRUCTION_ROW_TYPES.step,
    no: '19',
    text: '',
    heightMm: 11.6,
    fontSizePt: null,
    imageAreaHeightMm: null,
    imageNotes: { left: '', right: '' },
    imageCallouts: [],
    imageLabels: [],
    images: [],
  })
  assert.deepEqual(
    inserted.draft.continuationPages[0].rows.slice(16, 21).map((row) => row.no),
    ['17', '18', '19', '20', '21']
  )

  const removed = removeContinuationInstructionRow(inserted.draft, 0, 18)

  assert.equal(removed.ok, true)
  assert.equal(removed.selectedIndex, 18)
  assert.equal(removed.draft.continuationPages[0].rows.length, 20)
  assert.deepEqual(
    removed.draft.continuationPages[0].rows.slice(16, 20).map((row) => row.no),
    ['17', '18', '19', '20']
  )
})

test('engineeringPrintEditor: 作业指导书正文行类型切换后按模块重编编号行', () => {
  const draft = createEngineeringPrintDraft(WORK_INSTRUCTION_TEMPLATE_KEY)
  const titleResult = setInstructionRowType(
    draft,
    1,
    WORK_INSTRUCTION_ROW_TYPES.title
  )

  assert.equal(titleResult.ok, true)
  assert.equal(titleResult.draft.rows[1].type, WORK_INSTRUCTION_ROW_TYPES.title)
  assert.equal(titleResult.draft.rows[1].no, '')
  assert.deepEqual(
    titleResult.draft.rows
      .filter((row) => row.type === WORK_INSTRUCTION_ROW_TYPES.step)
      .map((row) => row.no),
    ['1', '1', '1', '2']
  )

  const stepResult = setInstructionRowType(
    titleResult.draft,
    1,
    WORK_INSTRUCTION_ROW_TYPES.step
  )

  assert.equal(stepResult.ok, true)
  assert.deepEqual(
    stepResult.draft.rows
      .filter((row) => row.type === WORK_INSTRUCTION_ROW_TYPES.step)
      .map((row) => row.no),
    ['1', '2', '1', '1', '2']
  )
})

test('engineeringPrintEditor: 作业指导书续页文本行后重新从 1 编号', () => {
  const draft = createEngineeringPrintDraft(WORK_INSTRUCTION_TEMPLATE_KEY, {
    continuationPages: [
      {
        rows: [
          { type: WORK_INSTRUCTION_ROW_TYPES.step, no: '1', text: 'A' },
          { type: WORK_INSTRUCTION_ROW_TYPES.step, no: '2', text: 'B' },
          { type: WORK_INSTRUCTION_ROW_TYPES.step, no: '3', text: 'C' },
        ],
      },
    ],
  })
  const result = setContinuationInstructionRowType(
    draft,
    0,
    1,
    WORK_INSTRUCTION_ROW_TYPES.text
  )

  assert.equal(result.ok, true)
  assert.deepEqual(
    result.draft.continuationPages[0].rows.map((row) => row.no),
    ['1', '', '1']
  )
  assert.equal(
    result.draft.continuationPages[0].rows[1].heightMm,
    WORK_INSTRUCTION_DEFAULT_ROW_HEIGHT_MM
  )
})

test('engineeringPrintEditor: 空白模板显式清空业务字段但保留版式骨架', () => {
  const material = createBlankEngineeringDraft(MATERIAL_DETAIL_TEMPLATE_KEY)
  const colorCard = createBlankEngineeringDraft(COLOR_CARD_TEMPLATE_KEY)
  const workInstruction = createBlankEngineeringDraft(
    WORK_INSTRUCTION_TEMPLATE_KEY
  )

  assert.equal(material.productNo, '')
  assert.equal(material.lines.length, 1)
  assert.equal(material.lines[0].materialName, '')
  assert.equal(material.columnLabels.length, 14)
  assert.deepEqual(material.merges, [])
  assert.equal(colorCard.productName, '')
  assert.equal(colorCard.blocks.length, 1)
  assert.equal(workInstruction.productNo, '')
  assert.equal(workInstruction.rows.length, 8)
  assert.equal(workInstruction.rows[0].text, '')
  assert.equal(workInstruction.rows[0].type, WORK_INSTRUCTION_ROW_TYPES.step)
  assert.equal(
    workInstruction.rows[0].heightMm,
    WORK_INSTRUCTION_DEFAULT_ROW_HEIGHT_MM
  )
  assert.deepEqual(workInstruction.continuationPages, [])
})

test('engineeringPrintTemplates: 作业行图片标注归一化后可随草稿恢复', () => {
  const draft = createEngineeringPrintDraft(WORK_INSTRUCTION_TEMPLATE_KEY, {
    rows: [
      {
        type: WORK_INSTRUCTION_ROW_TYPES.step,
        text: '确认眼鼻位置和背带尺寸',
        images: [
          {
            name: '工序图.jpg',
            dataURL: 'data:image/jpeg;base64,fixture',
            mimeType: 'image/jpeg',
            annotations: [
              {
                id: 'eye-nose-note',
                type: 'callout',
                text: '眼睛、鼻子左右对称',
                x: 66,
                y: 8,
                width: 30,
                height: 18,
                targets: [
                  { x: 28, y: 46 },
                  { x: 44, y: 48 },
                ],
              },
              {
                id: 'ruler-distance',
                type: 'measurement',
                text: '30 mm',
                start: { x: 20, y: 72 },
                end: { x: 58, y: 72 },
              },
            ],
          },
        ],
      },
    ],
  })

  assert.equal(draft.rows[0].images[0].annotations.length, 2)
  assert.deepEqual(draft.rows[0].images[0].annotations[0].targets, [
    { x: 28, y: 46 },
    { x: 44, y: 48 },
  ])
  assert.equal(draft.rows[0].images[0].annotations[1].text, '30 mm')
})
