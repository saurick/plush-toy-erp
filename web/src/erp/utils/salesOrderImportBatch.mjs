import { sha256 } from 'js-sha256'
import { numeric20Scale6Units } from './numeric20Scale6.mjs'
import {
  buildSalesOrderItemParams,
  buildSalesOrderParams,
} from './sourceOrderParams.mjs'
import {
  buildSalesOrderCustomerSourceValues,
  buildOrderContactSnapshot,
} from './sourcePartySnapshots.mjs'
import { isMutationResultUnknown } from './sourceDocumentMutation.mjs'

const text = (value) => String(value ?? '').trim()

export function salesOrderImportIssues(
  values,
  { customers = [], units = [] } = {}
) {
  const issues = []
  if (!text(values.order_no)) issues.push('请填写订单编号')
  if (
    !customers.some(
      (customer) =>
        customer.id === values.customer_id && customer.is_active !== false
    )
  )
    { issues.push('请选择有效客户') }
  if (!['CNY', 'USD', 'HKD'].includes(values.currency))
    { issues.push('请选择币种') }
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(values.order_date || ''))
    { issues.push('请填写下单日期') }
  if (!values.items?.length) issues.push('至少保留一条订货明细')
  for (const [index, item] of (values.items || []).entries()) {
    const prefix = `第 ${index + 1} 条明细：`
    const unit = units.find(
      (candidate) =>
        candidate.id === item.unit_id && candidate.is_active !== false
    )
    if (!text(item.requested_product_name) && !item.product_id)
      { issues.push(`${prefix}请填写产品名称`) }
    if (!unit) issues.push(`${prefix}请选择单位`)
    for (const [key, label, positive] of [
      ['ordered_quantity', '订单数量', true],
      ['pre_shipment_sample_quantity', '船头版数量', false],
    ]) {
      const amount = numeric20Scale6Units(item[key] || (positive ? '' : '0'))
      if (amount === null || (positive && amount === '0'))
        { issues.push(`${prefix}${label}无效`) }
      else if (
        unit &&
        Number.isInteger(unit.precision) &&
        unit.precision >= 0 &&
        unit.precision < 6 &&
        !amount.padStart(6, '0').endsWith('0'.repeat(6 - unit.precision))
      )
        { issues.push(`${prefix}${label}不符合单位精度`) }
    }
    if (
      item.planned_delivery_date &&
      item.planned_delivery_date < values.order_date
    )
      { issues.push(`${prefix}交付日期早于下单日期`) }
  }
  return issues
}

export function salesOrderImportParams(values, customers) {
  const customer = customers.find((item) => item.id === values.customer_id)
  return {
    ...buildSalesOrderParams({
      ...values,
      customer_snapshot:
        buildSalesOrderCustomerSourceValues(customer).customer_snapshot,
      contact_snapshot: buildOrderContactSnapshot(values),
    }),
    items: values.items.map((item, index) =>
      buildSalesOrderItemParams(item, { line_no: index + 1 })
    ),
  }
}

async function imageUploadParams(image, ownerID) {
  let binary = ''
  for (let i = 0; i < image.bytes.length; i += 8192)
    { binary += String.fromCharCode(...image.bytes.subarray(i, i + 8192)) }
  return {
    owner_type: 'sales_order',
    owner_id: ownerID,
    attachment_type: 'evidence',
    file_name: image.fileName,
    mime_type: image.mimeType,
    file_size: image.bytes.length,
    content_base64: btoa(binary),
  }
}

// One existing aggregate transaction per order. Persist the successful order
// before attachments so a retry never creates the same order a second time.
export async function saveSalesOrderImportBatch(
  entries,
  {
    customers,
    saveOrder,
    uploadImage,
    listAttachments,
    reconcileOrder,
    onChange = () => {},
    errorMessage,
  }
) {
  const next = entries.map((entry) => ({
    ...entry,
    uploadStates: { ...entry.uploadStates },
  }))
  const publish = () =>
    onChange(
      next.map((entry) => ({
        ...entry,
        uploadStates: { ...entry.uploadStates },
      }))
    )
  for (const entry of next) {
    if (entry.status === 'complete') continue
    entry.status = 'saving'
    entry.errors = []
    publish()
    try {
      if (!entry.savedOrder) {
        if (entry.uncertainOrder) {
          const saved = await reconcileOrder(entry.requestParams)
          if (!saved) {
            entry.status = 'unconfirmed'
            entry.errors = [
              '订单保存结果尚未确认，请刷新核对；本次不会再次新建这张订单',
            ]
            publish()
            continue
          }
          entry.savedOrder = saved
          entry.uncertainOrder = false
        } else {
          entry.requestParams = salesOrderImportParams(entry.values, customers)
          try {
            const result = await saveOrder(entry.requestParams)
            if (
              !Number.isSafeInteger(result?.sales_order?.id) ||
              result.sales_order.order_no !== entry.requestParams.order_no
            ) {
              const error = new Error('invalid save response')
              error.isInvalidResponse = true
              throw error
            }
            entry.savedOrder = result.sales_order
            publish()
          } catch (error) {
            entry.uncertainOrder = isMutationResultUnknown(error)
            throw error
          }
        }
      }
      const wantedImages = new Set(
        entry.values.items.flatMap(
          (item) => item.import_source?.image_files || []
        )
      )
      const images = (entry.images || []).filter((image) =>
        wantedImages.has(image.fileName)
      )
      const remaining = images.filter(
        (image) => entry.uploadStates[image.fileName] !== 'complete'
      )
      const existing = remaining.length
        ? await listAttachments({
            owner_type: 'sales_order',
            owner_id: entry.savedOrder.id,
          })
        : []
      for (const image of remaining) {
        const hash = sha256(image.bytes)
        if (
          existing.some(
            (attachment) =>
              !attachment.withdrawn_at &&
              attachment.file_name === image.fileName &&
              attachment.sha256 === hash
          )
        ) {
          entry.uploadStates[image.fileName] = 'complete'
          continue
        }
        if (entry.uploadStates[image.fileName] === 'unconfirmed') {
          entry.errors.push(
            '有图片上传结果待核对，请到该订单附件查看；本次不会重复上传'
          )
          continue
        }
        try {
          const result = await uploadImage(
            await imageUploadParams(image, entry.savedOrder.id)
          )
          if (!Number.isSafeInteger(result?.id)) {
            const error = new Error('invalid attachment response')
            error.isInvalidResponse = true
            throw error
          }
          entry.uploadStates[image.fileName] = 'complete'
        } catch (error) {
          entry.uploadStates[image.fileName] = isMutationResultUnknown(error)
            ? 'unconfirmed'
            : 'failed'
          entry.errors.push(errorMessage(error, '上传原表图片'))
        }
        publish()
      }
      entry.status = entry.errors.length ? 'attachments_pending' : 'complete'
    } catch (error) {
      entry.status = entry.uncertainOrder
        ? 'unconfirmed'
        : entry.savedOrder
          ? 'attachments_pending'
          : 'failed'
      entry.errors = [
        entry.uncertainOrder
          ? '订单保存结果尚未确认，请刷新核对，不要修改编号重新导入'
          : errorMessage(
              error,
              entry.savedOrder ? '读取订单附件' : '保存订单草稿'
            ),
      ]
    }
    publish()
  }
  return next
}
