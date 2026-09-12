import { sha256 } from 'js-sha256'
import {
  XlsxImportError,
  normalizeText,
  readXlsxWorkbook,
} from './xlsxWorkbook.mjs'
import {
  numeric20Scale6Units,
  numeric20Scale6TextFromUnits,
} from './numeric20Scale6.mjs'
import { salesOrderProductionQuantity } from './salesOrderRequirements.mjs'

const HEADER_ALIASES = {
  order_no: ['订单编号', '订单号', '销售订单号'],
  customer: ['客户', '客户名称', '客户简称', '客户编号'],
  customer_order_no: ['客户订单号', '客户PO', '客户PO号'],
  order_date: ['下单日期', '订单日期'],
  requested_product_name: ['产品名称', '订货产品名称', '品名'],
  customer_product_no: ['产品编号', '客户款号', '客户产品编号', '款号'],
  ordered_quantity: ['订单数量', '订货数量', '数量'],
  pre_shipment_sample_quantity: ['船头版', '船头样', '船头样数量'],
  production_quantity: ['生产数量'],
  planned_delivery_date: ['计划交付日期', '交货日期', '出货日期', '交期'],
  sales_owner: ['跟单业务人员', '业务员', '跟单员'],
  order_category: ['类别', '订单类别'],
  unit_price: ['单价', '销售单价'],
  unit: ['单位', '计量单位'],
  currency: ['币种', '货币'],
  note: ['备注'],
  process_requirement: ['工艺', '工艺要求'],
  designer: ['设计师'],
  image: ['图片', '产品图片'],
  unshipped_quantity: ['未出货数', '未出货数量'],
}
const REQUIRED_HEADERS = [
  'order_no',
  'requested_product_name',
  'ordered_quantity',
]
const MAX_IMPORT_LINES = 1000
const categoryValues = {
  新单: 'NEW',
  返单: 'REPEAT',
  NEW: 'NEW',
  REPEAT: 'REPEAT',
}
const currencyValues = {
  人民币: 'CNY',
  美元: 'USD',
  港币: 'HKD',
  CNY: 'CNY',
  USD: 'USD',
  HKD: 'HKD',
}
const headerText = (value) =>
  normalizeText(value)
    .replace(/[\s：:]/gu, '')
    .toUpperCase()

function fail(message, code = 'invalid_sales_order') {
  throw new XlsxImportError(message, code)
}

function findHeader(sheet) {
  for (const row of sheet.rows) {
    const columns = {}
    const duplicates = []
    row.values.forEach((label, index) => {
      const field = Object.keys(HEADER_ALIASES).find((key) =>
        HEADER_ALIASES[key].some(
          (alias) => headerText(alias) === headerText(label)
        )
      )
      if (!field) return
      if (columns[field] !== undefined) duplicates.push(label)
      columns[field] = index
    })
    if (!REQUIRED_HEADERS.every((key) => columns[key] !== undefined)) continue
    if (duplicates.length) {
      fail(
        `${sheet.name} 的表头重复：${duplicates.join('、')}，请保留一列`,
        'duplicate_headers'
      )
    }
    return { rowNumber: row.rowNumber, columns }
  }
  return null
}

function sheetCell(sheet, rowsByNumber, row, column) {
  if (column === undefined) return { value: '', type: '', formula: '' }
  const merge = sheet.mergeRanges.find(
    (range) =>
      range.startColumn === column + 1 &&
      range.endColumn === column + 1 &&
      range.startRow <= row.rowNumber &&
      range.endRow >= row.rowNumber
  )
  const source = merge ? rowsByNumber.get(merge.startRow) || row : row
  return {
    value: normalizeText(source.values[column]),
    type: source.cellTypes[column] || '',
    formula: source.formulas[column] || '',
  }
}

function decimalValue(
  cell,
  label,
  location,
  { required = false, positive = false } = {}
) {
  let { value } = cell
  if (!value && !required && !cell.formula) return ''
  if (cell.type === 'e' || cell.type === 'b' || !value) {
    fail(`${location}“${label}”缺少有效数字，请检查原表公式与数值`)
  }
  if (value.includes(',') && !/^\d{1,3}(,\d{3})+(\.\d+)?$/u.test(value)) {
    fail(`${location}“${label}”数字格式无效`)
  }
  value = value.replace(/,/gu, '')
  let units = numeric20Scale6Units(value)
  // Excel numeric cells can contain IEEE 754 noise. Accept only a difference
  // within floating-point representation error, never business rounding.
  if (
    units === null &&
    cell.type === 'n' &&
    /^\d+(?:\.\d+)?(?:e[+-]?\d+)?$/iu.test(value)
  ) {
    const number = Number(value)
    const rounded = number.toFixed(6)
    if (
      Number.isFinite(number) &&
      Math.abs(number - Number(rounded)) <=
        Number.EPSILON * Math.abs(number) * 2
    ) {
      units = numeric20Scale6Units(rounded)
    }
  }
  if (units === null || (positive && units === '0')) {
    fail(
      `${location}“${label}”须为${positive ? '大于零的' : '非负'}数字，最多六位小数`
    )
  }
  return numeric20Scale6TextFromUnits(units)
}

function dateValue(cell, location, label, uses1904Dates) {
  const { value } = cell
  if (!value && !cell.formula) return ''
  let result = ''
  if (cell.type !== 'e' && cell.type !== 'b') {
    const match = value.match(
      /^(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})(?:日)?(?:[ T]00:00:00(?:\.0+)?Z?)?$/u
    )
    if (match) {
      result = `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`
      const date = new Date(`${result}T00:00:00Z`)
      if (
        Number.isNaN(date.getTime()) ||
        date.toISOString().slice(0, 10) !== result
      ) {
        result = ''
      }
    } else if (/^\d+(?:\.0+)?$/u.test(value)) {
      const serial = Number(value)
      if (
        serial >= (uses1904Dates ? 0 : 1) &&
        serial <= 2957003 &&
        (uses1904Dates || serial !== 60)
      ) {
        const epoch = uses1904Dates
          ? Date.UTC(1904, 0, 1)
          : Date.UTC(1899, 11, 31)
        result = new Date(
          epoch + (serial - (!uses1904Dates && serial > 60 ? 1 : 0)) * 86400000
        )
          .toISOString()
          .slice(0, 10)
      }
    }
  }
  if (!result) fail(`${location}“${label}”不是完整有效日期，请在原表填写年月日`)
  return result
}

function boundedText(value, max, location, label) {
  if ([...value].length > max) {
    fail(`${location}“${label}”超过 ${max} 字，请精简原表内容`)
  }
  return value
}

export async function parseSalesOrderXlsx(
  input,
  { fileName = '销售订单.xlsx' } = {}
) {
  fileName = String(fileName).split(/[\\/]/u).at(-1).trim()
  if (!/\.xlsx$/iu.test(fileName)) {
    fail(
      '请选择 .xlsx 文件；Numbers 或旧版 Excel 文件请先导出为 Excel（.xlsx）',
      'unsupported_file_type'
    )
  }
  const workbook = await readXlsxWorkbook(input, { includeImages: true })
  boundedText(fileName, 255, '文件', '文件名')
  const fileSHA256 = sha256(input)
  const ordersByNumber = new Map()
  const ignoredSheets = []
  const ignoredColumns = new Set()
  let lineCount = 0
  for (const sheet of workbook.sheets) {
    const header = findHeader(sheet)
    if (!header) {
      ignoredSheets.push(sheet.name)
      continue
    }
    boundedText(sheet.name, 128, '工作表', '名称')
    const rowsByNumber = new Map(sheet.rows.map((row) => [row.rowNumber, row]))
    const headerRow = rowsByNumber.get(header.rowNumber)
    headerRow.values.forEach((label, index) => {
      if (label && !Object.values(header.columns).includes(index)) {
        ignoredColumns.add(label)
      }
    })
    for (const row of sheet.rows) {
      if (row.rowNumber <= header.rowNumber) continue
      const location = `${sheet.name} 第 ${row.rowNumber} 行`
      const cell = (key) =>
        sheetCell(sheet, rowsByNumber, row, header.columns[key])
      const text = (key) => {
        const source = cell(key)
        if (source.type === 'e' || (source.formula && !source.value)) {
          fail(
            `${location}“${HEADER_ALIASES[key][0]}”公式结果缺失或错误，请检查原表`
          )
        }
        return source.value
      }
      const orderNo = text('order_no')
      if (
        HEADER_ALIASES.order_no.some(
          (alias) => headerText(alias) === headerText(orderNo)
        )
      ) {
        continue
      }
      const hasItem =
        text('requested_product_name') ||
        text('customer_product_no') ||
        text('ordered_quantity')
      if (!hasItem && !orderNo) continue
      if (
        /^(?:合计|小计|总计)$/u.test(
          orderNo || normalizeText(row.values.find(Boolean))
        ) &&
        !text('requested_product_name') &&
        !text('customer_product_no')
      ) {
        continue
      }
      if (!orderNo) {
        fail(`${location}缺少订单编号，无法归入订单`, 'missing_order_no')
      }
      boundedText(orderNo, 64, location, '订单编号')
      if (!text('requested_product_name')) fail(`${location}缺少产品名称`)
      const category = text('order_category').toUpperCase()
      if (category && !categoryValues[category]) {
        fail(`${location}“类别”仅支持新单或返单`)
      }
      const currency = text('currency').toUpperCase()
      if (currency && !currencyValues[currency]) {
        fail(`${location}“币种”仅支持人民币、美元或港币`)
      }
      const orderDate = dateValue(
        cell('order_date'),
        location,
        '下单日期',
        workbook.uses1904Dates
      )
      const deliveryDate = dateValue(
        cell('planned_delivery_date'),
        location,
        '计划交付日期',
        workbook.uses1904Dates
      )
      if (orderDate && deliveryDate && deliveryDate < orderDate) {
        fail(`${location}计划交付日期早于下单日期`)
      }
      const item = {
        requested_product_name: boundedText(
          text('requested_product_name'),
          255,
          location,
          '产品名称'
        ),
        customer_product_no: boundedText(
          text('customer_product_no'),
          128,
          location,
          '产品编号'
        ),
        ordered_quantity: decimalValue(
          cell('ordered_quantity'),
          '订单数量',
          location,
          { required: true, positive: true }
        ),
        pre_shipment_sample_quantity:
          decimalValue(
            cell('pre_shipment_sample_quantity'),
            '船头版',
            location
          ) || '0',
        unit_price: decimalValue(cell('unit_price'), '单价', location),
        order_category: categoryValues[category] || 'NEW',
        planned_delivery_date: deliveryDate,
        process_requirement: boundedText(
          text('process_requirement'),
          255,
          location,
          '工艺'
        ),
        note: boundedText(text('note'), 255, location, '备注'),
      }
      const imageCell = cell('image')
      const imageID = (imageCell.formula || imageCell.value).match(
        /(?:_xlfn\.)?DISPIMG\(\s*"([^"]+)"/iu
      )?.[1]
      const embeddedImage = workbook.imagesByID.get(imageID)
      const anchoredImages =
        sheet.imagesByCell.get(
          `${row.rowNumber}:${header.columns.image + 1}`
        ) || []
      const images = [
        ...new Set([
          ...(embeddedImage ? [embeddedImage] : []),
          ...anchoredImages,
        ]),
      ].map((image, index) => ({
        ...image,
        fileName: `订单图片-${fileSHA256.slice(0, 12)}-${workbook.sheets.indexOf(sheet) + 1}-${row.rowNumber}-${index + 1}.${image.mimeType.split('/')[1].replace('jpeg', 'jpg')}`,
      }))
      const sourceCells = []
      const maxColumns = Math.max(headerRow.values.length, row.values.length)
      for (let column = 0; column < maxColumns; column += 1) {
        const source = sheetCell(sheet, rowsByNumber, row, column)
        const label = normalizeText(headerRow.values[column])
        if (!label && !source.value && !source.formula) continue
        const value =
          column === header.columns.order_date
            ? orderDate
            : column === header.columns.planned_delivery_date
              ? deliveryDate
              : source.value || (source.formula ? `=${source.formula}` : '')
        sourceCells.push({
          column: column + 1,
          label: boundedText(label || `第 ${column + 1} 列（无标题）`, 128, location, '原表字段名'),
          value: boundedText(value, 2048, location, label || '无标题字段'),
        })
      }
      if (sourceCells.length > 64 || images.length > 10) {
        fail(`${location}字段或图片过多，请将每行内容控制在 64 列、10 张图片以内`)
      }
      item.import_source = {
        file_name: fileName,
        file_sha256: fileSHA256,
        sheet_name: sheet.name,
        row_number: row.rowNumber,
        cells: sourceCells,
        ...(images.length
          ? { image_files: images.map((image) => image.fileName) }
          : {}),
      }
      const headerValues = {
        customer: text('customer'),
        customer_order_no: boundedText(
          text('customer_order_no'),
          128,
          location,
          '客户订单号'
        ),
        order_date: orderDate,
        sales_owner: boundedText(
          text('sales_owner'),
          128,
          location,
          '跟单业务人员'
        ),
        currency: currencyValues[currency] || '',
      }
      let order = ordersByNumber.get(orderNo)
      if (!order) {
        order = { order_no: orderNo, ...headerValues, lines: [], warnings: [] }
        ordersByNumber.set(orderNo, order)
      }
      for (const [key, value] of Object.entries(headerValues)) {
        if (order[key] && value && order[key] !== value) {
          fail(
            `${location}订单 ${orderNo} 的${HEADER_ALIASES[key][0]}与同单其他行不一致，请先拆单或更正`,
            'conflicting_order_header'
          )
        }
        if (value) order[key] = value
      }
      const productionQuantity = decimalValue(
        cell('production_quantity'),
        '生产数量',
        location
      )
      if (
        productionQuantity &&
        productionQuantity !== salesOrderProductionQuantity(item)
      ) {
        order.warnings.push(
          `${location}原生产数量与订单数量加船头版不一致，请核对`
        )
      }
      if ((imageCell.value || imageCell.formula) && !images.length) {
        order.warnings.push(
          `${location}仅有图片引用，文件中没有可读取的对应图片，请补传订单附件`
        )
      }
      order.lines.push({
        item,
        images,
        unit: text('unit'),
        sheetName: sheet.name,
        rowNumber: row.rowNumber,
      })
      lineCount += 1
      if (lineCount > MAX_IMPORT_LINES) {
        fail(
          '销售订单明细超过 1000 行，请拆分文件后再导入',
          'too_many_order_lines'
        )
      }
    }
  }
  if (!lineCount) {
    fail(
      '未找到订单明细，请检查是否包含“订单编号、产品名称、订单数量”表头',
      'empty_order_rows'
    )
  }
  return {
    fileName,
    orders: [...ordersByNumber.values()],
    lineCount,
    ignoredSheets,
    ignoredColumns: [...ignoredColumns],
  }
}

function matchingRecord(value, records, fields) {
  const comparable = (text) => normalizeText(text).toLowerCase()
  const matches = value
    ? records.filter(
        (record) =>
          record?.is_active !== false &&
          Number.isSafeInteger(record?.id) &&
          record.id > 0 &&
          fields.some(
            (field) => comparable(record[field]) === comparable(value)
          )
      )
    : []
  return matches.length === 1 ? matches[0] : null
}

export function buildSalesOrderImportDraft(
  order,
  {
    fileName,
    customers = [],
    units = [],
    defaultUnitID,
    defaultCurrency,
    customerMappings = {},
  } = {}
) {
  if (!order?.lines?.length) fail('请先选择一张包含明细的订单')
  const customer =
    customers.find(
      (record) =>
        record.id === customerMappings[order.customer] &&
        record.is_active !== false
    ) ||
    matchingRecord(order.customer, customers, ['code', 'name', 'short_name'])
  const defaultUnit = units.find(
    (unit) => unit.id === defaultUnitID && unit.is_active !== false
  )
  let missingUnitCount = 0
  const items = order.lines.map((line, index) => {
    const unit = line.unit
      ? matchingRecord(line.unit, units, ['code', 'name'])
      : defaultUnit
    if (!unit) missingUnitCount += 1
    return { ...line.item, line_no: index + 1, unit_id: unit?.id }
  })
  const deliveryDates = [
    ...new Set(items.map((item) => item.planned_delivery_date)),
  ]
  return {
    values: {
      order_no: order.order_no,
      customer_id: customer?.id,
      customer_order_no: order.customer_order_no,
      order_date: order.order_date,
      sales_owner: order.sales_owner,
      currency: order.currency || defaultCurrency || undefined,
      planned_delivery_date: deliveryDates.length === 1 ? deliveryDates[0] : '',
      items,
    },
    images: order.lines.flatMap((line) => line.images || []),
    review: {
      fileName,
      customer: order.customer,
      missingCustomer: !customer,
      missingUnitCount,
      missingCurrency: !order.currency,
      warnings: order.warnings,
      lineCount: items.length,
    },
  }
}
