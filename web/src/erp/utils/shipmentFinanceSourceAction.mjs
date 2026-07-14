const ACTIONS = Object.freeze({
  receivable: Object.freeze({
    key: 'receivable',
    title: '生成应收',
    okText: '生成应收草稿',
    factType: 'RECEIVABLE',
    factNoPrefix: 'AR',
    successMessage: '应收草稿已生成，请到应收管理核对并确认',
  }),
  invoice: Object.freeze({
    key: 'invoice',
    title: '生成开票记录',
    okText: '生成开票草稿',
    factType: 'INVOICE',
    factNoPrefix: 'INV',
    successMessage: '开票记录草稿已生成，请到发票管理核对并确认',
  }),
})

function positiveID(value) {
  const parsed = Number(value || 0)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0
}

export function shipmentFinanceSourceActionConfig(action) {
  const config =
    ACTIONS[
      String(action || '')
        .trim()
        .toLowerCase()
    ]
  if (!config) throw new Error('请选择要生成的财务记录')
  return config
}

export function localDateTimeInputValue(now = new Date()) {
  const timestamp = now instanceof Date ? now.getTime() : Number.NaN
  if (!Number.isFinite(timestamp)) return ''
  const offset = now.getTimezoneOffset() * 60_000
  return new Date(timestamp - offset).toISOString().slice(0, 16)
}

export function buildShipmentFinanceSourcePayload(values = {}, shipment = {}) {
  if (String(shipment?.status || '').toUpperCase() !== 'SHIPPED') {
    throw new Error('仅已确认出货的出货单可以生成财务记录')
  }
  const shipmentID = positiveID(shipment?.id)
  const shipmentNo = String(shipment?.shipment_no || '').trim()
  if (!shipmentID || !shipmentNo) {
    throw new Error('出货单信息不完整，请刷新后重试')
  }

  const occurredAtText = String(values.occurred_at || '').trim()
  let occurredAt
  if (occurredAtText) {
    const parsed = new Date(occurredAtText)
    if (!Number.isFinite(parsed.getTime())) {
      throw new Error('发生时间无效，请重新选择')
    }
    occurredAt = parsed.toISOString()
  }

  const note = String(values.note || '').trim()
  if ([...note].length > 255) throw new Error('备注不能超过 255 个字符')

  return {
    shipment_id: shipmentID,
    ...(occurredAt ? { occurred_at: occurredAt } : {}),
    ...(note ? { note } : {}),
  }
}
