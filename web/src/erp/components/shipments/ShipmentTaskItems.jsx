import React from 'react'
import BusinessRowItemCards from '../business-list/BusinessRowItemCards.jsx'
import { referenceLabel } from '../../utils/referenceSelectOptions.mjs'
import { formatQuantity } from '../../utils/businessLineItems.mjs'
import { sourceLineProductText } from './ShipmentEditor.jsx'

export default function ShipmentTaskItems({
  shipment,
  title = '本次出货明细',
  productOptions = [],
  skuOptions = [],
  warehouseOptions = [],
  lotOptions = [],
  unitOptions = [],
}) {
  const items = shipment?.items || []
  return (
    <section className="mobile-task-facts" aria-label={title}>
      <h3>{title} · {items.length} 项</h3>
      {items.length ? (
        <BusinessRowItemCards
          items={items}
          record={shipment}
          getItemLabel={(item) =>
            sourceLineProductText(item, productOptions, skuOptions)
          }
          getItemFields={(item) => [
            {
              label: '数量',
              value: `${formatQuantity(item.quantity)} ${referenceLabel(unitOptions, item.unit_id, '单位')}`,
              strong: true,
            },
            {
              label: '仓库',
              value: referenceLabel(
                warehouseOptions,
                item.warehouse_id,
                '仓库'
              ),
            },
            {
              label: '批次',
              value: item.lot_id
                ? referenceLabel(lotOptions, item.lot_id, '批次')
                : '未指定',
              fullWidth: true,
            },
          ]}
        />
      ) : (
        <p>未读取到出货明细，请重新核对单据。</p>
      )}
    </section>
  )
}
