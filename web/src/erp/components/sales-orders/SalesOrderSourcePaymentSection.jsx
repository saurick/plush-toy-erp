import React from 'react'
import { Form, Typography } from 'antd'
import Table from '@/common/components/table/AppTable'
import BusinessFormSectionTitle from '../business-list/BusinessFormSectionTitle.jsx'
import { salesOrderSourcePayment } from '../../utils/salesOrderSourcePayment.mjs'

const showValues = (values) => [...new Set(values)].join('；') || '未标记'
const columns = [
  { title: '原表行', dataIndex: 'location', width: 180 },
  {
    align: 'left',
    title: '原表产品名称',
    dataIndex: 'productName',
    width: 200,
  },
  {
    align: 'right',
    title: '原表货款金额',
    dataIndex: 'amounts',
    width: 150,
    render: (values) => (values.length ? showValues(values) : '未填写'),
  },
  { title: '定金标记', dataIndex: 'deposit', width: 120, render: showValues },
  { title: '尾款标记', dataIndex: 'balance', width: 120, render: showValues },
]

export function SalesOrderSourcePaymentRecords({ items, showTitle = false }) {
  const { rows, notes } = salesOrderSourcePayment(items)
  if (!rows.length) return null
  return (
    <section aria-label="原表收款记录" style={{ minWidth: 0 }}>
      {showTitle && (
        <Typography.Paragraph strong>原表收款记录</Typography.Paragraph>
      )}
      <Typography.Paragraph type="secondary">
        自动带入原表记录，实际到账以财务收款为准。无标题金额按原表数量 ×
        单价核对。
      </Typography.Paragraph>
      <Table
        size="small"
        rowKey="key"
        columns={columns}
        dataSource={rows}
        pagination={false}
        scroll={{ x: 770, y: 280 }}
      />
      {notes.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <Typography.Text strong>收款说明</Typography.Text>
          {notes.map((note) => (
            <Typography.Paragraph
              key={note.key}
              style={{ margin: '8px 0', overflowWrap: 'anywhere' }}
            >
              <span>{note.text}</span>
              <br />
              <Typography.Text type="secondary">
                {note.locations.join('；')}
              </Typography.Text>
            </Typography.Paragraph>
          ))}
        </div>
      )}
    </section>
  )
}

export default function SalesOrderSourcePaymentSection({ form }) {
  const items = Form.useWatch('items', form)
  if (!salesOrderSourcePayment(items).rows.length) return null
  return (
    <>
      <BusinessFormSectionTitle>原表收款记录</BusinessFormSectionTitle>
      <Form.Item className="erp-business-action-form__field erp-business-action-form__field--full">
        <SalesOrderSourcePaymentRecords items={items} />
      </Form.Item>
    </>
  )
}
