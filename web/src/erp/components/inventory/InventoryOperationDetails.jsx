import React from 'react'
import { Descriptions } from 'antd'
import Table from '@/common/components/table/AppTable'

export default function InventoryOperationDetails({ operation }) {
  const count = operation?.operation_type === 'CYCLE_COUNT'
  const transfer = operation?.operation_type === 'TRANSFER'
  return (
    <>
      <Descriptions
        size="small"
        column={1}
        items={[
      { key: 'number', label: '作业单号', children: operation?.operation_no },
      { key: 'reason', label: '业务原因', children: operation?.reason },
      { key: 'scope', label: '盘点 / 作业范围', children: `${operation?.items?.length || 0} 行库存` },
    ]}
      />
      {count ? <div className="erp-business-inline-note">逐行核对账面数、实盘数与差异。零差异也保留完成记录；批准后由仓库过账，库存变化时须重新盘点。</div> : null}
      <Table
        rowKey="id"
        size="small"
        pagination={false}
        scroll={{ x: 760 }}
        dataSource={operation?.items || []}
        columns={[
      { title: '存货', dataIndex: 'subject_name', render: (value) => value || '名称暂不可用' },
      { title: '规格', dataIndex: 'sku_code', render: (value) => value || '—' },
      { title: transfer ? '来源仓库' : '仓库', dataIndex: 'warehouse_name', render: (value) => value || '名称暂不可用' },
      ...(transfer ? [{ title: '目标仓库', dataIndex: 'to_warehouse_name', render: (value) => value || '名称暂不可用' }] : []),
      { title: '批次', dataIndex: 'lot_no', render: (value, row) => value || (row.from_lot_id ? '批次暂不可用' : '未分批次') },
      { title: '单位', dataIndex: 'unit_name' },
      ...(count ? [
        { title: '账面数量', dataIndex: 'expected_quantity', align: 'right' },
        { title: '实盘数量', dataIndex: 'counted_quantity', align: 'right' },
      ] : []),
      { title: transfer ? '调拨数量' : '差异数量', dataIndex: 'adjustment_quantity', align: 'right' },
      { title: '备注', dataIndex: 'note' },
    ]}
      />
    </>
  )
}
