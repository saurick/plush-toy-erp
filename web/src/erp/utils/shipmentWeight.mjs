const DECIMAL_SCALE = 6
const MAX_NET_WEIGHT_SCALED = '99999999999999999999'
const HALF_DECIMAL_FACTOR_TEXT = '500000'
const POSITIVE_DECIMAL_PATTERN =
  /^\+?(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/u
const SHIPMENT_WEIGHT_REFERENCE_PAGE_SIZE = 200

function normalizedID(value) {
  const text = String(value ?? '').trim()
  return /^[1-9]\d*$/u.test(text) ? text : ''
}

function stripLeadingZeros(value) {
  return String(value || '').replace(/^0+/u, '') || '0'
}

function compareUnsignedDecimalStrings(left, right) {
  const normalizedLeft = stripLeadingZeros(left)
  const normalizedRight = stripLeadingZeros(right)
  if (normalizedLeft.length !== normalizedRight.length) {
    return normalizedLeft.length < normalizedRight.length ? -1 : 1
  }
  if (normalizedLeft === normalizedRight) return 0
  return normalizedLeft < normalizedRight ? -1 : 1
}

function addUnsignedDecimalStrings(left, right) {
  const leftText = stripLeadingZeros(left)
  const rightText = stripLeadingZeros(right)
  let leftIndex = leftText.length - 1
  let rightIndex = rightText.length - 1
  let carry = 0
  let output = ''
  while (leftIndex >= 0 || rightIndex >= 0 || carry > 0) {
    const leftDigit = leftIndex >= 0 ? leftText.charCodeAt(leftIndex) - 48 : 0
    const rightDigit =
      rightIndex >= 0 ? rightText.charCodeAt(rightIndex) - 48 : 0
    const sum = leftDigit + rightDigit + carry
    output = String(sum % 10) + output
    carry = Math.floor(sum / 10)
    leftIndex -= 1
    rightIndex -= 1
  }
  return stripLeadingZeros(output)
}

function multiplyUnsignedDecimalStrings(left, right) {
  const leftText = stripLeadingZeros(left)
  const rightText = stripLeadingZeros(right)
  if (leftText === '0' || rightText === '0') return '0'
  const digits = Array.from(
    { length: leftText.length + rightText.length },
    () => 0
  )
  for (let leftIndex = leftText.length - 1; leftIndex >= 0; leftIndex -= 1) {
    const leftDigit = leftText.charCodeAt(leftIndex) - 48
    for (
      let rightIndex = rightText.length - 1;
      rightIndex >= 0;
      rightIndex -= 1
    ) {
      const rightDigit = rightText.charCodeAt(rightIndex) - 48
      digits[leftIndex + rightIndex + 1] += leftDigit * rightDigit
    }
  }
  for (let index = digits.length - 1; index > 0; index -= 1) {
    const carry = Math.floor(digits[index] / 10)
    digits[index] %= 10
    digits[index - 1] += carry
  }
  return stripLeadingZeros(digits.join(''))
}

function parseBoundedExponent(value) {
  const text = String(value || '0')
  const negative = text.startsWith('-')
  const unsigned = text.replace(/^[+-]/u, '').replace(/^0+/u, '') || '0'
  if (unsigned.length > 9) return null
  let exponent = 0
  for (const digit of unsigned) {
    exponent = exponent * 10 + digit.charCodeAt(0) - 48
  }
  return negative ? -exponent : exponent
}

function normalizedDecimal(value) {
  const text = String(value ?? '').trim()
  const match = POSITIVE_DECIMAL_PATTERN.exec(text)
  if (!match) return null
  const whole = match[1] || ''
  const fraction = match[1] === undefined ? match[3] || '' : match[2] || ''
  const coefficient = stripLeadingZeros(`${whole}${fraction}`)
  if (coefficient === '0') return null
  const exponent = parseBoundedExponent(match[4])
  if (exponent === null) return null
  const scaledPower = exponent - fraction.length + DECIMAL_SCALE
  let scaled = ''
  if (scaledPower >= 0) {
    if (coefficient.length + scaledPower > MAX_NET_WEIGHT_SCALED.length) {
      return null
    }
    scaled = `${coefficient}${'0'.repeat(scaledPower)}`
  } else {
    const digitsToRemove = -scaledPower
    let trailingZeros = 0
    for (
      let index = coefficient.length - 1;
      index >= 0 && coefficient[index] === '0';
      index -= 1
    ) {
      trailingZeros += 1
    }
    if (
      digitsToRemove >= coefficient.length ||
      digitsToRemove > trailingZeros
    ) {
      return null
    }
    scaled = coefficient.slice(0, -digitsToRemove)
  }
  scaled = stripLeadingZeros(scaled)
  return compareUnsignedDecimalStrings(scaled, MAX_NET_WEIGHT_SCALED) <= 0
    ? { scaled }
    : null
}

function formatScaledDecimal(value) {
  const scaled = stripLeadingZeros(value)
  const padded = scaled.padStart(DECIMAL_SCALE + 1, '0')
  const integer = stripLeadingZeros(padded.slice(0, -DECIMAL_SCALE))
  const fraction = padded.slice(-DECIMAL_SCALE).replace(/0+$/u, '')
  return fraction ? `${integer}.${fraction}` : integer
}

function roundProductToWeightScale(value) {
  const product = stripLeadingZeros(value)
  const integerLength = Math.max(0, product.length - DECIMAL_SCALE)
  const quotient = stripLeadingZeros(product.slice(0, integerLength))
  const remainder = product.slice(integerLength).padStart(DECIMAL_SCALE, '0')
  return compareUnsignedDecimalStrings(remainder, HALF_DECIMAL_FACTOR_TEXT) >= 0
    ? addUnsignedDecimalStrings(quotient, '1')
    : quotient
}

function lineIssue(index, code, message) {
  return { code, lineNumber: index + 1, message }
}

function recordByID(records, id) {
  const targetID = normalizedID(id)
  if (!targetID) return null
  return (
    (Array.isArray(records) ? records : []).find(
      (record) => normalizedID(record?.id) === targetID
    ) || null
  )
}

function invalidShipmentWeightReferenceResponse() {
  const error = new Error('产品净重资料不完整，请刷新后重试')
  error.isInvalidResponse = true
  return error
}

export async function listAllShipmentWeightReferenceRecords(
  listPage,
  itemKey,
  params = {}
) {
  if (typeof listPage !== 'function' || typeof itemKey !== 'string') {
    throw invalidShipmentWeightReferenceResponse()
  }

  const baseParams = { ...params }
  delete baseParams.active_only
  delete baseParams.limit
  delete baseParams.offset
  const records = []
  const recordIDs = new Set()
  let expectedTotal = null
  let offset = 0

  for (;;) {
    const data = await listPage({
      ...baseParams,
      limit: SHIPMENT_WEIGHT_REFERENCE_PAGE_SIZE,
      offset,
    })
    const page = data?.[itemKey]
    const total = data?.total
    const responseLimit = data?.limit
    const responseOffset = data?.offset
    if (
      !Array.isArray(page) ||
      !Number.isSafeInteger(total) ||
      total < 0 ||
      !Number.isSafeInteger(responseLimit) ||
      responseLimit <= 0 ||
      responseLimit > SHIPMENT_WEIGHT_REFERENCE_PAGE_SIZE ||
      page.length > responseLimit ||
      !Number.isSafeInteger(responseOffset) ||
      responseOffset !== offset ||
      (expectedTotal !== null && total !== expectedTotal)
    ) {
      throw invalidShipmentWeightReferenceResponse()
    }
    expectedTotal ??= total

    for (const record of page) {
      const recordID = normalizedID(record?.id)
      if (!recordID || recordIDs.has(recordID)) {
        throw invalidShipmentWeightReferenceResponse()
      }
      recordIDs.add(recordID)
      records.push(record)
    }

    if (records.length > expectedTotal) {
      throw invalidShipmentWeightReferenceResponse()
    }
    if (records.length === expectedTotal) return records
    if (page.length === 0 || page.length < responseLimit) {
      throw invalidShipmentWeightReferenceResponse()
    }
    offset += page.length
  }
}

export function shipmentWeightReferenceOption(record, toOption) {
  if (typeof toOption !== 'function') return null
  const option = toOption(record)
  if (!option || record?.is_active !== false) return option
  return {
    ...option,
    disabled: true,
    label: `${option.label}（已停用）`,
  }
}

function resolveLineWeight(item, products, productSKUs, index) {
  const product = recordByID(products, item?.product_id)
  if (!product) {
    return {
      issue: lineIssue(
        index,
        'product_missing',
        `明细 ${index + 1} 请选择产品`
      ),
    }
  }

  const skuID = normalizedID(item?.product_sku_id)
  const sku = skuID ? recordByID(productSKUs, skuID) : null
  if (
    skuID &&
    (!sku || normalizedID(sku.product_id) !== normalizedID(product.id))
  ) {
    return {
      issue: lineIssue(
        index,
        'sku_unavailable',
        `明细 ${index + 1} 所选 SKU 已不可用`
      ),
    }
  }

  const skuWeightText = String(sku?.unit_net_weight_kg ?? '').trim()
  if (sku && skuWeightText) {
    const skuWeight = normalizedDecimal(skuWeightText)
    const basisUnitID = normalizedID(sku.default_unit_id)
    if (!skuWeight) {
      return {
        issue: lineIssue(
          index,
          'sku_weight_invalid',
          `明细 ${index + 1} 的 SKU 单重无效，请回到产品档案确认`
        ),
      }
    }
    if (!basisUnitID) {
      return {
        issue: lineIssue(
          index,
          'sku_weight_unit_missing',
          `明细 ${index + 1} 的 SKU 已维护单重，但未明确单重对应单位`
        ),
      }
    }
    return {
      basisUnitID,
      source: 'sku',
      unitWeightKg: skuWeight,
    }
  }

  const productWeight = normalizedDecimal(product.unit_net_weight_kg)
  const productUnitID = normalizedID(product.default_unit_id)
  if (!productWeight || !productUnitID) {
    return {
      issue: lineIssue(
        index,
        'weight_missing',
        `明细 ${index + 1} 的产品或 SKU 尚未维护可用单重`
      ),
    }
  }
  return {
    basisUnitID: productUnitID,
    source: 'product',
    unitWeightKg: productWeight,
  }
}

export function normalizeNetWeightKg(value) {
  const decimal = normalizedDecimal(value)
  if (
    !decimal ||
    compareUnsignedDecimalStrings(decimal.scaled, MAX_NET_WEIGHT_SCALED) > 0
  ) {
    return null
  }
  return formatScaledDecimal(decimal.scaled)
}

export function normalizeShipmentQuantity(value) {
  return normalizeNetWeightKg(value)
}

export function hasFinalShipmentWeight(status) {
  return ['SHIPPED', 'CANCELLED'].includes(
    String(status || '')
      .trim()
      .toUpperCase()
  )
}

export function calculateShipmentLineNetWeightKg(quantity, unitWeightKg) {
  const normalizedQuantity = normalizedDecimal(quantity)
  const normalizedUnitWeight = normalizedDecimal(unitWeightKg)
  if (!normalizedQuantity || !normalizedUnitWeight) return null
  const rounded = roundProductToWeightScale(
    multiplyUnsignedDecimalStrings(
      normalizedQuantity.scaled,
      normalizedUnitWeight.scaled
    )
  )
  if (
    rounded === '0' ||
    compareUnsignedDecimalStrings(rounded, MAX_NET_WEIGHT_SCALED) > 0
  ) {
    return null
  }
  return formatScaledDecimal(rounded)
}

export function shipmentWeightItemsSignature(items = []) {
  return JSON.stringify(
    (Array.isArray(items) ? items : []).map((item) => [
      normalizedID(item?.sales_order_item_id),
      normalizedID(item?.product_id),
      normalizedID(item?.product_sku_id),
      normalizedID(item?.unit_id),
      String(item?.quantity ?? '').trim(),
    ])
  )
}

export function resolveShipmentWeightPreview({
  items = [],
  products = [],
  productSKUs = [],
} = {}) {
  const sourceItems = Array.isArray(items) ? items : []
  if (sourceItems.length === 0) {
    return {
      complete: false,
      issues: [lineIssue(0, 'items_missing', '请先添加出货明细')],
      linePreviews: [],
      totalNetWeightKg: null,
    }
  }

  const issues = []
  const linePreviews = []
  let exactTotal = '0'
  sourceItems.forEach((item, index) => {
    const quantity = normalizedDecimal(item?.quantity)
    if (!quantity) {
      const issue = lineIssue(
        index,
        'quantity_invalid',
        `明细 ${index + 1} 的数量需大于 0，且最多保留 6 位小数`
      )
      issues.push(issue)
      linePreviews.push({ issue, lineNumber: index + 1 })
      return
    }
    const resolved = resolveLineWeight(item, products, productSKUs, index)
    if (resolved.issue) {
      issues.push(resolved.issue)
      linePreviews.push({ issue: resolved.issue, lineNumber: index + 1 })
      return
    }
    if (normalizedID(item?.unit_id) !== resolved.basisUnitID) {
      const issue = lineIssue(
        index,
        'unit_mismatch',
        `明细 ${index + 1} 的出货单位与单重对应单位不一致`
      )
      issues.push(issue)
      linePreviews.push({ issue, lineNumber: index + 1 })
      return
    }
    const exactLineWeight = multiplyUnsignedDecimalStrings(
      quantity.scaled,
      resolved.unitWeightKg.scaled
    )
    exactTotal = addUnsignedDecimalStrings(exactTotal, exactLineWeight)
    linePreviews.push({
      basisUnitID: resolved.basisUnitID,
      lineNumber: index + 1,
      source: resolved.source,
      unitNetWeightKg: formatScaledDecimal(resolved.unitWeightKg.scaled),
      lineNetWeightKg: formatScaledDecimal(
        roundProductToWeightScale(exactLineWeight)
      ),
    })
  })

  if (issues.length > 0) {
    return {
      complete: false,
      issues,
      linePreviews,
      totalNetWeightKg: null,
    }
  }

  const roundedTotal = roundProductToWeightScale(exactTotal)
  if (
    roundedTotal === '0' ||
    compareUnsignedDecimalStrings(roundedTotal, MAX_NET_WEIGHT_SCALED) > 0
  ) {
    const issue = lineIssue(
      0,
      'total_out_of_range',
      '预计总净重超出可保存范围，请核对数量和单重'
    )
    return {
      complete: false,
      issues: [issue],
      linePreviews,
      totalNetWeightKg: null,
    }
  }
  return {
    complete: true,
    issues: [],
    linePreviews,
    totalNetWeightKg: formatScaledDecimal(roundedTotal),
  }
}

export function resolveShipmentSubmittedTotalNetWeight({
  preview,
  manualValue,
  manualItemsSignature,
  items = [],
} = {}) {
  if (preview?.complete === true) return null
  const normalizedManual = normalizeNetWeightKg(manualValue)
  if (!normalizedManual) return null
  return manualItemsSignature === shipmentWeightItemsSignature(items)
    ? normalizedManual
    : null
}
