import React, { useState } from 'react'
import { Button, Checkbox, Input, InputNumber } from 'antd'
import AppSelect from '@/common/components/select/AppSelect'
import BusinessTextArea from '@/erp/components/business-list/BusinessTextArea.jsx'
import { BusinessTextPolicy } from '@/common/consts/policies.generated.mjs'
import BusinessLineItemsTable, { BusinessLineItemRow } from '@/erp/components/business-list/BusinessLineItemsTable.jsx'
import { productOption, productSKUOption, warehouseOptionFromRecord, inventoryLotOption } from '@/erp/utils/referenceSelectOptions.mjs'
import WorkflowTaskImagePlaceholder from '@/erp/components/workflow/WorkflowTaskImagePlaceholder.jsx'
import ProductFieldControl from '@/erp/components/master-data/ProductFieldControl.jsx'
import './devSelectValueExample.css'

const COLUMNS = [
  { label: '产品', width: 260, flexible: true },
  { label: 'SKU', width: 190 },
  { label: '仓库', width: 220, required: true },
  { label: '批次', width: 190 },
  { label: '数量', width: 180, required: true },
  { label: '单位', width: 94 },
]
const EXTRA_COLUMNS = [
  { label: '客户款号', width: 180 },
  { label: '包装方式', width: 220 },
  { label: '箱数', width: 120 },
  { label: '备注', width: 260 },
]
const INITIAL_ROWS = [
  { warehouse: 1, lot: 1, quantity: 1464, unit: 'set' },
  { warehouse: undefined, lot: undefined, quantity: 1465, unit: 'piece' },
  { warehouse: 2, lot: undefined, quantity: 1466, unit: 'set' },
]

export default function DevSelectValueExample() {
  const [rows, setRows] = useState(INITIAL_ROWS)
  const [long, setLong] = useState(true)
  const [narrow, setNarrow] = useState(false)
  const [more, setMore] = useState(false)
  const warehouses = [
    { id: 1, name: long ? '缝制仓 · 东莞一厂二楼毛绒玩具半成品与配套辅料存放区' : '缝制仓', code: 'WH-SEWING-01' },
    { id: 2, name: long ? '成品仓 · 东莞二厂 B 区出口订单待出货产品与独立包装存放区' : '成品仓', code: 'WH-FINISHED-02' },
  ].map(warehouseOptionFromRecord)
  const names = ['背包小象', '饼干小熊', '彩虹小兔']
  const update = (index, values) => setRows((previous) => previous.map((row, rowIndex) => rowIndex === index ? { ...row, ...values } : row))
  const columns = more ? [...COLUMNS, ...EXTRA_COLUMNS] : COLUMNS
  return (
    <section className="erp-control-example-stack erp-select-value-example" aria-label="长值与多列样例">
      <div className="erp-control-example-row">
        <Checkbox checked={long} onChange={(event) => setLong(event.target.checked)}>长名称</Checkbox>
        <Checkbox checked={narrow} onChange={(event) => setNarrow(event.target.checked)}>窄区域</Checkbox>
        <Checkbox checked={more} onChange={(event) => setMore(event.target.checked)}>增加 4 列</Checkbox>
        <Button onClick={() => { setRows(INITIAL_ROWS); setLong(true); setNarrow(false); setMore(false) }}>恢复初始内容</Button>
      </div>
      <p>选中后以名称为主，编码与规格等识别信息保留在候选项；长名称完整换行，短名称保持正常框高；产品和 SKU 从来源带入并锁定。仓库可以搜索、清空，列增加时只滚动明细。</p>
      <div className={`erp-select-value-example__viewport ${narrow ? 'erp-select-value-example__viewport--narrow' : ''}`}>
        <BusinessLineItemsTable columns={columns} label="长值演示明细">
          {rows.map((row, index) => (
            <BusinessLineItemRow
              key={index}
              index={index}
              cells={[
                <ProductFieldControl
                  key="product"
                  thumbnail={<WorkflowTaskImagePlaceholder item={{ kind: 'product', name: names[index] }} />}
                  aria-label={`第 ${index + 1} 行产品`}
                  disabled
                  value={index + 1}
                  options={[productOption({ id: index + 1, code: `YS8-CP-01${index + 6}`, name: long ? `${names[index]} · 米白色柔软长毛绒配套产品与独立包装规格 27016-1` : names[index] })]}
                />,
                <AppSelect key="sku" aria-label={`第 ${index + 1} 行 SKU`} disabled value={index + 1} options={[productSKUOption({ id: index + 1, sku_code: `YS8-GG-01${index + 6}-XL${long ? '-EXPORT-PACK-20261030-000001' : ''}`, sku_name: long ? '27016-1 · 米白色加大号（客户定制包装）' : '米白 / XL' })]} />,
                <AppSelect key="warehouse" aria-label={`第 ${index + 1} 行仓库`} placeholder="仓库" showSearch optionFilterProp="label" value={row.warehouse} options={warehouses} onChange={(warehouse) => update(index, { warehouse, lot: undefined })} />,
                <AppSelect key="lot" aria-label={`第 ${index + 1} 行批次`} placeholder="批次" showSearch optionFilterProp="label" disabled={!row.warehouse} value={row.lot} options={[inventoryLotOption({ id: 1, lot_no: long ? 'LOT-20261030-FG-A-001' : '批次 A', status: 'ACTIVE' })]} onChange={(lot) => update(index, { lot })} />,
                <InputNumber key="quantity" aria-label={`第 ${index + 1} 行数量`} min={0} precision={6} value={row.quantity} onChange={(quantity) => update(index, { quantity })} />,
                <AppSelect key="unit" aria-label={`第 ${index + 1} 行单位`} value={row.unit} options={[{ value: 'set', label: '套' }, { value: 'piece', label: '个' }]} onChange={(unit) => update(index, { unit })} />,
                ...(more ? [
                  <Input key="style" aria-label={`第 ${index + 1} 行客户款号`} defaultValue="DEMO-27016-1" />,
                  <AppSelect key="packing" aria-label={`第 ${index + 1} 行包装方式`} defaultValue="box" options={[{ value: 'box', label: '独立礼盒包装 · 外箱加防护隔板与标识' }, { value: 'bag', label: '独立袋装' }]} />,
                  <InputNumber key="boxes" aria-label={`第 ${index + 1} 行箱数`} min={0} defaultValue={12} />,
                  <BusinessTextArea key="note" aria-label={`第 ${index + 1} 行备注`} maxLength={BusinessTextPolicy.noteMaxCharacters} placeholder="选填" />,
                ] : []),
              ]}
              actions={<Button onClick={() => update(index, { warehouse: undefined, lot: undefined })}>清空仓库</Button>}
            />
          ))}
        </BusinessLineItemsTable>
      </div>
    </section>
  )
}
