import {
  normalizeNumeric20Scale6,
  normalizePositiveNumeric20Scale6,
  numeric20Scale6Units,
  numeric20Scale6TextFromUnits,
} from './numeric20Scale6.mjs'

export function arrivalDifference(actual, declared) {
  const a = numeric20Scale6Units(actual)
  const d = numeric20Scale6Units(declared)
  if (a === null || d === null) return '未比较'
  const delta = BigInt(a) - BigInt(d)
  if (delta === BigInt(0)) return '一致'
  return `${delta < 0 ? '少' : '多'} ${numeric20Scale6TextFromUnits(
    (delta < 0 ? -delta : delta).toString()
  )}`
}

export function arrivalItemHasInput(line = {}) {
  return [line.quantity, line.declared_quantity, line.lot_no, line.note].some(
    (value) => String(value ?? '').trim() !== ''
  )
}

export function arrivalItemErrors(line = {}) {
  if (!arrivalItemHasInput(line)) return {}
  const errors = {}
  if (!normalizePositiveNumeric20Scale6(line.quantity)) {
    errors.quantity = '请输入大于 0 的实点数量，最多六位小数'
  }
  if (
    String(line.declared_quantity ?? '').trim() !== '' &&
    !normalizeNumeric20Scale6(line.declared_quantity)
  ) {
    errors.declared_quantity = '请输入不小于 0 的标示数量，最多六位小数'
  }
  if (!Number(line.warehouse_id)) errors.warehouse_id = '请选择入库仓库'
  return errors
}

export function buildArrivalItems(lines = []) {
  const items = []
  for (const line of lines) {
    if (!arrivalItemHasInput(line)) continue
    const quantity = normalizePositiveNumeric20Scale6(line.quantity)
    const hasDeclared = String(line.declared_quantity ?? '').trim() !== ''
    const declared = hasDeclared
      ? normalizeNumeric20Scale6(line.declared_quantity)
      : undefined
    if (Object.keys(arrivalItemErrors(line)).length) {
      throw new Error(
        '已填写的到货行需要有效实点数量和仓库，数量最多保留六位小数'
      )
    }
    items.push({
      purchase_order_item_id: Number(line.purchase_order_item_id),
      warehouse_id: Number(line.warehouse_id),
      quantity,
      declared_quantity: declared,
      lot_no: String(line.lot_no || '').trim() || undefined,
      note: String(line.note || '').trim() || undefined,
    })
  }
  if (!items.length) throw new Error('请至少填写一行本次实点数量')
  return items
}

export const INCOMING_CHECK_PRESETS = [
  { name: '物料与规格', requirement: '与采购订单及约定样品一致' },
  { name: '数量核对', requirement: '核对送货标示与本次实点数量' },
  { name: '外观与包装', requirement: '符合约定外观及包装要求' },
]

export const CHECK_RESULT_LABELS = {
  NOT_CHECKED: '未检',
  PASS: '符合',
  FAIL: '异常',
  NOT_APPLICABLE: '不适用',
}

export function initialIncomingChecks() {
  return INCOMING_CHECK_PRESETS.map((item) => ({
    ...item,
    result: 'NOT_CHECKED',
  }))
}

export function validateIncomingChecks(items, result) {
  if (!Array.isArray(items) || !items.length || items.length > 50)
    { return '请记录至少一个实际检查项目，最多 50 项' }
  let checked = 0
  let failed = 0
  for (const item of items) {
    if (!String(item.name || '').trim()) return '请填写检查项目名称'
    if (item.result === 'PASS' || item.result === 'FAIL') {
      checked += 1
      if (item.result === 'FAIL') failed += 1
      if (
        !String(item.requirement || '').trim() ||
        !String(item.observation || '').trim()
      )
        { return '已检查项目需要填写要求和实际情况' }
      if (!['FULL', 'SAMPLE'].includes(item.scope)) return '请选择全检或抽检'
      if (item.scope === 'SAMPLE' && !String(item.note || '').trim())
        { return '抽检项目请在说明中记录抽检范围或数量' }
    } else if (item.result === 'NOT_APPLICABLE') {
      if (!String(item.note || '').trim()) return '不适用项目请填写原因'
    } else if (item.result !== 'NOT_CHECKED' || result !== 'REJECT') {
      return '尚有未检项目，请完成检查或注明不适用原因'
    }
  }
  if (!checked) return '请至少记录一项实际检查结果'
  if (result === 'PASS' && failed)
    { return '存在异常项目，请选择让步接收或判定不合格' }
  if (result !== 'PASS' && !failed)
    { return '让步接收或不合格判定需要记录异常项目' }
  return ''
}
