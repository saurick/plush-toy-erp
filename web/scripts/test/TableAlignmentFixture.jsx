import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Button, ConfigProvider, Form, Input, Space, Tag, theme } from 'antd'
import AppTable from '../../src/common/components/table/AppTable'
import { BusinessDataTable } from '../../src/erp/components/business-list/BusinessListLayout'
import { ColumnOrderHeaderMenu } from '../../src/erp/components/business-list/ColumnOrderModal'
import BusinessLineItemsTable, {
  BusinessLineItemRow,
} from '../../src/erp/components/business-list/BusinessLineItemsTable'
import EngineeringMaterialSummarySheet from '../../src/erp/components/sales-orders/EngineeringMaterialSummarySheet'
import { applyModuleColumnOrder } from '../../src/erp/utils/moduleTableColumns.mjs'
import 'antd/dist/reset.css'
import '../../src/erp/styles/app.css'
import '../../src/erp/components/sales-orders/EngineeringMaterialRequest.css'
import '../../src/dev-workbench/styles/index.css'

const renderExpandedNote = (row) => <p>{row.note}</p>

const rows = [
  {
    key: 1,
    code: 'MAT-001',
    name: '黑色毛绒',
    unit: 'Y',
    quantity: 434.36,
    status: '待审核',
    note: '需要逐项核对规格、数量与厂商，备注较长时应保持完整阅读。'.repeat(3),
  },
  {
    key: 2,
    code: 'MAT-002',
    name: '透明胶按扣（过美规）',
    unit: '套',
    quantity: 10244,
    status: '已批准',
    note: '公扣、母扣各一个为一套。',
  },
]
const columns = [
  {
    title: '材料编号',
    dataIndex: 'code',
    key: 'code',
    width: 180,
    copyable: true,
  },
  {
    title: '品名',
    dataIndex: 'name',
    key: 'name',
    width: 220,
    align: 'left',
    copyable: true,
  },
  { title: '单位', dataIndex: 'unit', key: 'unit', width: 130 },
  {
    title: '数量',
    dataIndex: 'quantity',
    key: 'quantity',
    width: 160,
    align: 'right',
    sorter: (a, b) => a.quantity - b.quantity,
  },
  {
    title: '状态',
    dataIndex: 'status',
    key: 'status',
    width: 160,
    render: (value) => <Tag>{value}</Tag>,
  },
  { title: '备注', dataIndex: 'note', key: 'note', width: 280, align: 'left' },
]
const request = {
  order_no: 'SO-TABLE-QA',
  items: rows.map((row) => ({
    material_id: row.key,
    unit_id: row.key,
    material_name: row.name,
    unit_name: row.unit,
    spec: row.key === 1 ? '51"' : '10mm',
    supplier_item_no: 'TEST-001',
    supplier_name: '模拟厂商',
    required_quantity: String(row.quantity),
  })),
  sources: rows.map((row) => ({
    material_id: row.key,
    unit_id: row.key,
    sales_order_item_id: 1,
    bom_item_id: row.key,
    product_name: '模拟毛绒产品',
    line_no: 1,
    material_note: row.note,
    bom_version: 'V1',
    position: '面料',
    piece_count: '1',
    unit_usage: '0.5',
    loss_rate: '0.03',
    production_quantity: '100',
    total_usage: '51.5',
  })),
  inventory_reference: {
    status: 'AVAILABLE',
    scope: 'ALL',
    as_of: '2026-09-15T00:00:00Z',
    items: [],
  },
}

function Fixture() {
  const [dark, setDark] = useState(false)
  const [mobile, setMobile] = useState(false)
  const [empty, setEmpty] = useState(false)
  const [order, setOrder] = useState(columns.map((column) => column.key))
  const [selected, setSelected] = useState([])
  const [opened, setOpened] = useState('')
  const listColumns = applyModuleColumnOrder(columns, order).map((column) => ({
    ...column,
    title: (
      <ColumnOrderHeaderMenu
        column={column}
        columns={columns}
        order={order}
        onChange={setOrder}
      />
    ),
  }))
  return (
    <ConfigProvider
      theme={{ algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm }}
    >
      <main
        style={{
          padding: 16,
          display: 'grid',
          gap: 24,
          minWidth: 0,
          color: 'var(--erp-text, #17231c)',
        }}
      >
        <Space wrap>
          <Button
            id="toggle-theme"
            onClick={() => {
              document.documentElement.dataset.erpTheme = dark
                ? 'light'
                : 'dark'
              document.body.style.background = dark ? '#fff' : '#0e1726'
              setDark(!dark)
            }}
          >
            切换主题
          </Button>
          <Button id="toggle-mobile" onClick={() => setMobile(!mobile)}>
            切换手机查看
          </Button>
          <Button id="toggle-empty" onClick={() => setEmpty(!empty)}>
            切换空表
          </Button>
          <output id="selection-count">{selected.length}</output>
          <output id="opened-record">{opened}</output>
        </Space>
        <section id="business-table" style={{ minWidth: 0 }}>
          <h2>业务列表</h2>
          <BusinessDataTable
            rowKey="key"
            columns={listColumns}
            dataSource={empty ? [] : rows}
            pagination={false}
            rowSelection={{ selectedRowKeys: selected, onChange: setSelected }}
            onOpenRecord={(row) => setOpened(row.code)}
          />
        </section>
        <section
          id="plain-table"
          className="erp-dev-quality-history"
          style={{ minWidth: 0 }}
        >
          <h2>弹窗与工作台共用表格</h2>
          <AppTable
            rowKey="key"
            columns={columns}
            dataSource={rows}
            pagination={false}
            scroll={{ x: 1150 }}
            expandable={{ expandedRowRender: renderExpandedNote }}
          />
        </section>
        <section
          id="material-table"
          className={mobile ? 'erp-material-task-action--mobile' : ''}
          style={{ minWidth: 0 }}
        >
          <h2>材料汇总明细</h2>
          <EngineeringMaterialSummarySheet
            request={request}
            mobile={mobile}
            onReload={() => {}}
          />
        </section>
        <section id="native-table" style={{ minWidth: 0 }}>
          <h2>单据编辑明细</h2>
          <Form className="erp-business-form">
            <BusinessLineItemsTable
              columns={[
                { label: '品名', width: 220 },
                { label: '数量', width: 130 },
              ]}
            >
              <BusinessLineItemRow
                index={0}
                cells={[
                  <Form.Item key="name" name="name" initialValue="黑色毛绒">
                    <Input aria-label="编辑品名" />
                  </Form.Item>,
                  <Form.Item key="number" name="quantity" initialValue="434.36">
                    <Input aria-label="编辑数量" inputMode="decimal" />
                  </Form.Item>,
                ]}
                actions={<Button>移除</Button>}
              >
                <p>补充信息中的长说明保持易读。</p>
              </BusinessLineItemRow>
            </BusinessLineItemsTable>
          </Form>
        </section>
      </main>
    </ConfigProvider>
  )
}

createRoot(document.getElementById('root')).render(<Fixture />)
