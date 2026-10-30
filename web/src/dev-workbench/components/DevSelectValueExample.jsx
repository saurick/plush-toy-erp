import React, { useState } from 'react'
import { Button, Checkbox, Input, InputNumber } from 'antd'
import AppSelect from '@/common/components/select/AppSelect'
import BusinessLineItemsTable, { BusinessLineItemRow } from '@/erp/components/business-list/BusinessLineItemsTable.jsx'
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
  { warehouse: 'sewing', lot: 'batch-a', quantity: 1464, unit: 'set' },
  { warehouse: undefined, lot: undefined, quantity: 1465, unit: 'piece' },
]

export default function DevSelectValueExample() {
  const [rows, setRows] = useState(INITIAL_ROWS)
  const [long, setLong] = useState(true)
  const [narrow, setNarrow] = useState(false)
  const [more, setMore] = useState(false)
  const warehouses = [
    { value: 'sewing', label: long ? '佐制仓 · 一楼辅料与待出货产品临时存放区（WH-SEWING-01）' : '佐制仓' },
    { value: 'finished', label: long ? '成品仓 · 二楼成品待发货区（WH-FINISHED-02）' : '成品仓' },
  ]
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
      <p>产品和 SKU 为导入后锁定的示例；仓库可以搜索、清空。点选框内的信息图标可查看完整值。</p>
      <div className={`erp-select-value-example__viewport ${narrow ? 'erp-select-value-example__viewport--narrow' : ''}`}>
        <BusinessLineItemsTable columns={columns} label="长值演示明细">
          {rows.map((row, index) => (
            <BusinessLineItemRow
              key={index}
              index={index}
              cells={[
                <AppSelect key="product" aria-label={`第 ${index + 1} 行产品`} disabled value="product" options={[{ value: 'product', label: long ? `YS8-CP-01${index + 6} 背包小象 · 米白色柔软长毛绒配套产品与独立包装规格 27016-1` : '背包小象' }]} />,
                <AppSelect key="sku" aria-label={`第 ${index + 1} 行 SKU`} disabled value="sku" options={[{ value: 'sku', label: long ? 'YS8-GG-016-XL 米白色加大号（客户定制包装）' : '米白 / XL' }]} />,
                <AppSelect key="warehouse" aria-label={`第 ${index + 1} 行仓库`} placeholder="请选择仓库" showSearch optionFilterProp="label" value={row.warehouse} options={warehouses} onChange={(warehouse) => update(index, { warehouse, lot: undefined })} />,
                <AppSelect key="lot" aria-label={`第 ${index + 1} 行批次`} placeholder="请选择批次" showSearch optionFilterProp="label" disabled={!row.warehouse} value={row.lot} options={[{ value: 'batch-a', label: long ? 'LOT-20261030-A-001 · 米白色首批待出库产品' : '批次 A' }]} onChange={(lot) => update(index, { lot })} />,
                <InputNumber key="quantity" aria-label={`第 ${index + 1} 行数量`} min={0} precision={6} value={row.quantity} onChange={(quantity) => update(index, { quantity })} />,
                <AppSelect key="unit" aria-label={`第 ${index + 1} 行单位`} value={row.unit} options={[{ value: 'set', label: '套' }, { value: 'piece', label: '个' }]} onChange={(unit) => update(index, { unit })} />,
                ...(more ? [
                  <Input key="style" aria-label={`第 ${index + 1} 行客户款号`} defaultValue="DEMO-27016-1" />,
                  <AppSelect key="packing" aria-label={`第 ${index + 1} 行包装方式`} defaultValue="box" options={[{ value: 'box', label: '独立礼盒包装 · 外箱加防护隔板与标识' }, { value: 'bag', label: '独立袋装' }]} />,
                  <InputNumber key="boxes" aria-label={`第 ${index + 1} 行箱数`} min={0} defaultValue={12} />,
                  <Input key="note" aria-label={`第 ${index + 1} 行备注`} placeholder="选填" />,
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
