import React, { useEffect, useMemo, useState } from 'react'
import { Alert, Button, Space, Tag } from 'antd'
import { DownloadOutlined, ReloadOutlined } from '@ant-design/icons'
import {
  useNavigate,
  useOutletContext,
  useSearchParams,
} from 'react-router-dom'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import {
  listSalesOrderSummary,
  listAllSalesOrderSummary,
} from '../../api/masterDataOrderApi.mjs'
import {
  BusinessDataTable,
  BusinessOperationPanel,
  DateRangeFilter,
  SearchInput,
  SelectFilter,
} from '../business-list/BusinessListLayout.jsx'
import WorkflowTaskProductImage from '../workflow/WorkflowTaskProductImage.jsx'
import useBusinessListExport from '../../hooks/useBusinessListExport.js'
import { hasActionPermission } from '../../utils/masterDataOrderView.mjs'
import {
  currentBusinessDate,
  unixSecondsToBusinessDate,
} from '../../utils/businessDate.mjs'
import {
  readSalesSummaryFilters,
  SALES_SUMMARY_STATUSES,
  updateSummarySearch,
} from '../../utils/workbenchSummary.mjs'

const valueOrDash = (value) => value ?? '—'
const dateLabel = (value) => unixSecondsToBusinessDate(value) || '—'
const productName = (row) =>
  row.requested_product_name || row.product_name_snapshot || '未填写产品名称'

const statusLabel = (row) => {
  const order =
    SALES_SUMMARY_STATUSES.find((item) => item.value === row.lifecycle_status)
      ?.label || '状态待确认'
  const line = { closed: '明细已关闭', canceled: '明细已取消' }[row.line_status]
  return line ? `${order} · ${line}` : order
}

function SearchFilter({ label, placeholder = label, value, onSearch }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  return (
    <SearchInput
      type="search"
      aria-label={label}
      placeholder={placeholder}
      allowClear
      maxLength={100}
      value={draft}
      onChange={(event) => {
        setDraft(event.target.value)
        if (!event.target.value) onSearch('')
      }}
      onPressEnter={() => onSearch(draft.trim())}
    />
  )
}

export default function SalesOrderSummaryPanel() {
  const { adminProfile } = useOutletContext() || {}
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const filters = useMemo(() => readSalesSummaryFilters(params), [params])
  const requestKey = JSON.stringify(filters)
  const [result, setResult] = useState({ items: [], total: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const update = (values) =>
    setParams(updateSummarySearch(params, 'sales', values), { replace: true })

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')
    setResult({ items: [], total: 0 })
    listSalesOrderSummary(JSON.parse(requestKey), { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setResult(data)
      })
      .catch((cause) => {
        if (!controller.signal.aborted) {
          setError(getActionErrorMessage(cause, '读取销售订单汇总'))
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [requestKey, revision])

  const columns = [
    {
      title: '下单日期',
      dataIndex: 'order_date',
      width: 120,
      render: dateLabel,
      exportValue: (row) => dateLabel(row.order_date),
    },
    { align: 'left', title: '客户', dataIndex: 'customer_name', width: 150 },
    {
      title: '订单编号',
      dataIndex: 'order_no',
      width: 180,
      render: (value, row) => (
        <Button
          type="link"
          onClick={() =>
            navigate(
              `/erp/sales/project-orders/sales-orders?sales_order_id=${row.sales_order_id}`
            )
          }
        >
          {value}
        </Button>
      ),
    },
    {
      title: '客户订单号',
      dataIndex: 'customer_order_no',
      width: 160,
      render: valueOrDash,
    },
    {
      title: '客户款号',
      dataIndex: 'customer_product_no',
      width: 160,
      render: valueOrDash,
    },
    {
      align: 'left',
      title: '产品名称',
      key: 'product',
      width: 220,
      render: (_, row) => (
        <span className="erp-workbench-summaries__product">
          <WorkflowTaskProductImage
            item={{
              kind: 'product',
              name: productName(row),
              productID: row.product_id,
              imageAttachmentID: row.product_image_attachment_id,
            }}
            preview
          />
          <span>{productName(row)}</span>
        </span>
      ),
      exportValue: productName,
    },
    {
      title: '订单数量',
      dataIndex: 'ordered_quantity',
      width: 110,
      align: 'right',
    },
    {
      title: '船头版',
      dataIndex: 'pre_shipment_sample_quantity',
      width: 100,
      align: 'right',
    },
    {
      title: '生产数量',
      dataIndex: 'production_quantity',
      width: 110,
      align: 'right',
    },
    { title: '单位', dataIndex: 'unit_name', width: 80 },
    {
      title: '计划交付日期',
      dataIndex: 'planned_delivery_date',
      width: 140,
      render: dateLabel,
      exportValue: (row) => dateLabel(row.planned_delivery_date),
    },
    {
      title: '未出货数',
      dataIndex: 'unshipped_quantity',
      width: 110,
      align: 'right',
      render: valueOrDash,
    },
    {
      title: '跟单业务人员',
      dataIndex: 'sales_owner',
      width: 140,
      render: valueOrDash,
    },
    {
      title: '类别',
      dataIndex: 'order_category',
      width: 90,
      render: (value) => (value === 'REPEAT' ? '返单' : '新单'),
      exportValue: (row) => (row.order_category === 'REPEAT' ? '返单' : '新单'),
    },
    ...(hasActionPermission(adminProfile, 'field.sales_commercial.read')
      ? [
          {
            title: '单价',
            dataIndex: 'unit_price',
            width: 110,
            align: 'right',
            render: valueOrDash,
          },
          ...(hasActionPermission(adminProfile, 'field.finance_settlement.read')
            ? [{ title: '币种', dataIndex: 'currency', width: 85 }]
            : []),
        ]
      : []),
    { title: '设计师', dataIndex: 'designer', width: 120, render: valueOrDash },
    {
      align: 'left',
      title: '备注',
      dataIndex: 'note',
      width: 220,
      render: valueOrDash,
    },
    {
      align: 'left',
      title: '工艺',
      dataIndex: 'process_requirement',
      width: 220,
      render: valueOrDash,
    },
    {
      title: '订单状态',
      dataIndex: 'lifecycle_status',
      width: 110,
      render: (_, row) => <Tag>{statusLabel(row)}</Tag>,
      exportValue: statusLabel,
    },
  ]
  const { exporting, exportRows } = useBusinessListExport({
    requestKey: `sales-summary:${requestKey}`,
    loadRows: async (options) =>
      (await listAllSalesOrderSummary(filters, options)).items,
    filename: () => `销售订单汇总-${currentBusinessDate()}.csv`,
    columns,
    recordLabel: '产品明细',
  })
  return (
    <>
      <BusinessOperationPanel
        compact
        filters={
          <>
            <SearchFilter
              label="搜索订单号、产品名称或款号"
              placeholder="订单号、产品或款号"
              value={filters.keyword}
              onSearch={(q) => update({ q })}
            />
            <SearchFilter
              label="搜索客户"
              value={filters.customer}
              onSearch={(customer) => update({ customer })}
            />
            <SearchFilter
              label="搜索跟单业务人员"
              value={filters.sales_owner}
              onSearch={(owner) => update({ owner })}
            />
            <SelectFilter
              aria-label="订单状态"
              value={filters.lifecycle_status}
              options={SALES_SUMMARY_STATUSES}
              onChange={(status) => update({ status })}
            />
            <DateRangeFilter
              value={filters.date_field}
              options={[
                { value: 'order_date', label: '下单日期' },
                { value: 'planned_delivery_date', label: '计划交付日期' },
              ]}
              onTypeChange={(date) => update({ date })}
              startValue={filters.date_from?.slice(0, 10) || ''}
              endValue={filters.date_to?.slice(0, 10) || ''}
              onStartChange={(from) => update({ from })}
              onEndChange={(to) => update({ to })}
            />
          </>
        }
        onClearFilters={() =>
          update({
            q: '',
            customer: '',
            owner: '',
            status: '',
            date: '',
            from: '',
            to: '',
          })
        }
        actions={
          <Space wrap>
            <Button
              icon={<ReloadOutlined aria-hidden="true" />}
              loading={loading}
              onClick={() => setRevision((value) => value + 1)}
            >
              刷新
            </Button>
            <Button
              icon={<DownloadOutlined aria-hidden="true" />}
              loading={exporting}
              disabled={loading || Boolean(error)}
              onClick={exportRows}
            >
              导出当前筛选
            </Button>
          </Space>
        }
      />
      <p className="erp-workbench-summaries__note">
        每行一款产品；生产数量含船头版，未出货数按实际出货扣减。缺少依据时显示“—”。
      </p>
      {error ? (
        <Alert
          type="error"
          showIcon
          message={error}
          action={
            <Button onClick={() => setRevision((value) => value + 1)}>
              重新加载
            </Button>
          }
        />
      ) : (
        <BusinessDataTable
          rowKey="id"
          columns={columns}
          dataSource={result.items}
          loading={loading}
          emptyDescription="暂无符合条件的销售订单明细"
          pagination={{
            current: filters.offset / filters.limit + 1,
            pageSize: filters.limit,
            total: result.total,
            showSizeChanger: false,
            showTotal: (total) => `共 ${total} 条产品明细`,
            onChange: (page) => update({ page }),
          }}
        />
      )}
    </>
  )
}
