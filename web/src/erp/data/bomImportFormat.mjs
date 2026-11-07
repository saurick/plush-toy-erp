export const BOM_IMPORT_EXAMPLE_FILENAME = 'BOM-材料分析示例.xlsx'
export const BOM_IMPORT_EXAMPLE_SHEET = '材料分析明细表-1'

export const BOM_IMPORT_FORMAT_GUIDE = [
  {
    title: '产品与订单',
    description: '核对产品、订单和数量；导入明细时保留当前表头。',
    region: { left: 2, right: 80, top: 20, bottom: 35, side: 'left' },
  },
  {
    title: '材料与部位',
    description:
      '保留“物料名称”“单位用量”表头，按部位填写；示例使用码／千克，保存前关联材料和单位。',
    region: { left: 2, right: 100, top: 36, bottom: 80, side: 'left' },
  },
  {
    title: '图片与附件',
    description: '右上为产品图，色卡和工艺图可留在原页。图片需另行添加为附件。',
    region: {
      left: 81,
      right: 93,
      top: 4,
      bottom: 28,
      side: 'right',
      kind: 'point',
    },
  },
]

export const BOM_IMPORT_EXAMPLE_CONTEXT = {
  code: 'PRODUCT-SAMPLE-001',
  name: '蓝色毛绒熊',
  sourceOrderNo: 'ORDER-SAMPLE-001',
  quantityText: '100',
  printDate: '2026-01-01',
}

export const BOM_IMPORT_EXAMPLE_COLUMNS = [
  { key: 'category', title: '材料类别' },
  { key: 'materialName', title: '物料名称' },
  { key: 'supplierItemNo', title: '厂商料号' },
  { key: 'materialSpec', title: '规格' },
  { key: 'color', title: '颜色' },
  { key: 'unit', title: '单位' },
  { key: 'position', title: '组装部位' },
  { key: 'pieceCount', title: '片数' },
  { key: 'quantity', title: '单位用量' },
  { key: 'lossRate', title: '损耗%' },
  { key: 'totalUsageSnapshot', title: '总用量 含损耗' },
  { key: 'processBase', title: '加工方式' },
  { key: 'processMethod', title: '加工方式' },
  { key: 'note', title: '备注' },
]

export const BOM_IMPORT_EXAMPLE_MATERIALS = [
  {
    materialName: '示例短毛绒',
    supplierItemNo: 'FABRIC-SAMPLE-001',
    materialSpec: '示例规格',
    color: '示例蓝',
    unit: '码',
  },
  {
    materialName: '示例填充棉',
    supplierItemNo: 'FILLING-SAMPLE-001',
    materialSpec: '示例规格',
    color: '示例白',
    unit: '千克',
  },
]

export const BOM_IMPORT_EXAMPLE_ROWS = [
  {
    ...BOM_IMPORT_EXAMPLE_MATERIALS[0],
    position: '身体前片',
    pieceCount: '2',
    quantity: 0.42,
    lossRate: 0.05,
    totalUsageSnapshot: 44.1,
    processBase: '贴衬',
    processMethod: '热裁',
    note: '毛向一致',
  },
  {
    ...BOM_IMPORT_EXAMPLE_MATERIALS[0],
    position: '身体后片',
    pieceCount: '1',
    quantity: 0.08,
    lossRate: 0.05,
    totalUsageSnapshot: 8.4,
    processBase: '贴衬',
    processMethod: '热裁',
    note: '',
  },
  {
    ...BOM_IMPORT_EXAMPLE_MATERIALS[1],
    position: '身体',
    pieceCount: '',
    quantity: 0.18,
    lossRate: 0,
    totalUsageSnapshot: 18,
    processBase: '',
    processMethod: '充棉',
    note: '',
  },
]

export const BOM_IMPORT_EXAMPLE_IMAGES = [
  { file: 'product.jpg', sheet: BOM_IMPORT_EXAMPLE_SHEET, row: 1, column: 13, width: 234, height: 132 },
  { file: 'materials.jpg', sheet: '色卡', row: 3, column: 6, width: 540, height: 304 },
  { file: 'product.jpg', sheet: 'Sheet1', row: 1, column: 9, width: 234, height: 132 },
  { file: 'cutting.jpg', sheet: 'Sheet1', row: 18, column: 2, width: 320, height: 180 },
  { file: 'sewing.jpg', sheet: 'Sheet1', row: 18, column: 6, width: 320, height: 180 },
  { file: 'stuffing.jpg', sheet: 'Sheet1', row: 18, column: 10, width: 320, height: 180 },
]
