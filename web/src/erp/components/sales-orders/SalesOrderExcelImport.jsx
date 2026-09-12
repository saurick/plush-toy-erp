import React, { useEffect, useRef, useState } from 'react'
import { UploadOutlined } from '@ant-design/icons'
import { Select, Space, Table, Typography } from 'antd'
import SalesOrderBatchImportEditor from './SalesOrderBatchImportEditor.jsx'
import { SalesOrderImportImage } from './SalesOrderSourceEvidence.jsx'
import { BUSINESS_CURRENCY_OPTIONS } from '../../utils/masterDataOrderView.mjs'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import SourceImportPickerModal from '../business-list/SourceImportPickerModal.jsx'
import { ToolbarButton } from '../business-list/BusinessListLayout.jsx'
import {
  MAX_XLSX_FILE_BYTES,
  XlsxImportError,
} from '../../utils/xlsxWorkbook.mjs'
import {
  buildSalesOrderImportDraft,
  parseSalesOrderXlsx,
} from '../../utils/salesOrderXlsxImport.mjs'

const columns = [
  { title: '订单编号', dataIndex: 'order_no', width: 180 },
  { title: '原表客户', dataIndex: 'customer', width: 140 },
  { title: '下单日期', dataIndex: 'order_date', width: 120 },
  {
    title: '明细',
    key: 'line_count',
    width: 70,
    render: (_, order) => `${order.lines.length} 条`,
  },
]

const detailColumns = [
  { title: '原表行', dataIndex: 'rowNumber', width: 70 },
  {
    title: '图片',
    key: 'image',
    width: 90,
    render: (_, line) => (
      <SalesOrderImportImage
        image={line.images[0]}
        name={line.item.requested_product_name}
      />
    ),
  },
  ...[
    ['customer_product_no', '原表产品编号', 130],
    ['requested_product_name', '产品名称', 220],
    ['ordered_quantity', '订单数量', 95],
    ['pre_shipment_sample_quantity', '船头版', 80],
    ['unit_price', '单价', 80],
    ['planned_delivery_date', '交付日期', 120],
    ['order_category', '类别', 80],
    ['process_requirement', '工艺', 150],
    ['note', '备注', 220],
  ].map(([key, title, width]) => ({
    title,
    key,
    width,
    render: (_, line) =>
      key === 'order_category'
        ? line.item[key] === 'REPEAT'
          ? '返单'
          : '新单'
        : line.item[key] || '—',
  })),
  ...['设计师', '生产数量', '未出货数'].map((label) => ({
    title: label,
    key: label,
    width: 110,
    render: (_, line) =>
      line.item.import_source.cells.find((cell) => cell.label === label)
        ?.value || '未填写',
  })),
]

function renderOrderLines(order) {
  return (
    <Table
      size="small"
      rowKey={(line) => `${line.sheetName}:${line.rowNumber}`}
      dataSource={order.lines}
      columns={detailColumns}
      pagination={false}
      scroll={{ x: 1800, y: 340 }}
    />
  )
}

export default function SalesOrderExcelImport({
  customers,
  units,
  unitOptions,
  disabled,
  onSaved,
  productSKUs = [],
  salesOwnerOptions = [],
  customerKey,
}) {
  const inputRef = useRef(null)
  const readSequence = useRef(0)
  const readingRef = useRef(false)
  const [reading, setReading] = useState(false)
  const [workbook, setWorkbook] = useState(null)
  const [defaultUnitID, setDefaultUnitID] = useState(undefined)
  const [defaultCurrency, setDefaultCurrency] = useState(undefined)
  const [customerMappings, setCustomerMappings] = useState({})
  const [drafts, setDrafts] = useState(null)

  useEffect(
    () => () => {
      readSequence.current += 1
    },
    []
  )

  useEffect(() => {
    if (disabled) {
      readSequence.current += 1
      readingRef.current = false
      setReading(false)
      setWorkbook(null)
    }
  }, [disabled])

  const readFile = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || disabled || readingRef.current) return
    const sequence = ++readSequence.current
    readingRef.current = true
    setReading(true)
    setWorkbook(null)
    setDefaultUnitID(undefined)
    setDefaultCurrency(undefined)
    setCustomerMappings({})
    try {
      if (file.size > MAX_XLSX_FILE_BYTES) {
        throw new XlsxImportError(
          'Excel 文件超过 20MB，请精简图片或拆分后再导入'
        )
      }
      const parsed = await parseSalesOrderXlsx(await file.arrayBuffer(), {
        fileName: file.name,
      })
      if (sequence !== readSequence.current) return
      setWorkbook(parsed)
    } catch (error) {
      if (sequence !== readSequence.current) return
      message.error(
        error instanceof XlsxImportError
          ? error.message
          : getActionErrorMessage(error, '读取销售订单 Excel')
      )
    } finally {
      if (sequence === readSequence.current) {
        readingRef.current = false
        setReading(false)
      }
    }
  }

  const importOrders = (orders) => {
    if (!orders.length || disabled) return
    setDrafts(
      orders.map((order) =>
        buildSalesOrderImportDraft(order, {
          customers,
          units,
          defaultUnitID,
          defaultCurrency,
          customerMappings,
          fileName: workbook.fileName,
        })
      )
    )
    setWorkbook(null)
  }
  const previewColumns = [
    ...columns,
    {
      title: '保存到客户',
      key: 'mapped_customer',
      width: 240,
      render: (_, order) => {
        const matched = buildSalesOrderImportDraft(order, {
          customers,
          customerMappings,
        }).values.customer_id
        return (
          <Select
            aria-label={`订单 ${order.order_no} 的客户`}
            style={{ width: '100%' }}
            showSearch
            optionFilterProp="label"
            value={matched}
            placeholder="请选择对应客户"
            options={customers
              .filter((customer) => customer.is_active !== false)
              .map((customer) => ({
                value: customer.id,
                label: `${customer.code} - ${customer.name}`,
              }))}
            onChange={(id) =>
              setCustomerMappings((current) => ({
                ...current,
                [order.customer]: id,
              }))
            }
          />
        )
      },
    },
  ]

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx"
        hidden
        onChange={readFile}
        data-sales-order-import-input
      />
      <ToolbarButton
        aria-label="导入 Excel"
        icon={<UploadOutlined />}
        loading={reading}
        disabled={disabled || reading || Boolean(drafts)}
        onClick={() => inputRef.current?.click()}
      >
        导入 Excel
      </ToolbarButton>
      <SourceImportPickerModal
        open={Boolean(workbook) && !disabled}
        title="导入销售订单 Excel"
        description={
          <Space direction="vertical" style={{ width: '100%' }}>
            <Typography.Text>
              已识别 {workbook?.orders.length || 0} 张订单、
              {workbook?.lineCount || 0}{' '}
              条明细。可多选或全选，展开订单核对明细，再批量保存草稿。
            </Typography.Text>
            <Typography.Text type="secondary">
              同一订单编号的行归入同一张订单。图片随单保存为附件；原表资料保留供核对。
            </Typography.Text>
            {workbook?.ignoredSheets.length ? (
              <Typography.Text type="secondary">
                未作为订单读取的工作表：{workbook.ignoredSheets.join('、')}
              </Typography.Text>
            ) : null}
            <Select
              aria-label="原表缺少单位时使用"
              placeholder="原表缺少单位时，统一选择单位"
              style={{ width: '100%' }}
              allowClear
              options={unitOptions}
              value={defaultUnitID}
              onChange={setDefaultUnitID}
            />
            <Select
              aria-label="原表缺少币种时使用"
              placeholder="原表缺少币种时，统一选择币种"
              style={{ width: '100%' }}
              allowClear
              options={BUSINESS_CURRENCY_OPTIONS}
              value={defaultCurrency}
              onChange={setDefaultCurrency}
            />
          </Space>
        }
        searchPlaceholder="搜索订单编号、客户或产品名称"
        rows={workbook?.orders || []}
        columns={previewColumns}
        rowKey="order_no"
        multiple
        allowSelectAll
        width={1100}
        expandable={{
          expandedRowRender: renderOrderLines,
          columnTitle: '明细',
        }}
        selectedNoun="订单"
        getSelectedLabel={(order) => order.order_no}
        getSearchText={(order) =>
          [
            order.order_no,
            order.customer,
            ...order.lines.map((line) => line.item.requested_product_name),
          ].join(' ')
        }
        importText="核对所选订单"
        importDisabled={disabled}
        onImport={importOrders}
        onCancel={() => setWorkbook(null)}
      />
      {drafts ? (
        <SalesOrderBatchImportEditor
          container={inputRef.current?.closest('.erp-business-page-layout')}
          drafts={drafts}
          customers={customers}
          units={units}
          unitOptions={unitOptions}
          productSKUs={productSKUs}
          salesOwnerOptions={salesOwnerOptions}
          customerKey={customerKey}
          onClose={() => setDrafts(null)}
          onSaved={onSaved}
        />
      ) : null}
    </>
  )
}
