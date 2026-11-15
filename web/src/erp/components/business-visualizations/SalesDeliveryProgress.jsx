import React, { useCallback, useMemo } from 'react'
import { Button, Progress } from 'antd'
import Table from '@/common/components/table/AppTable.jsx'
import { paginateVisualizationRows } from '../../utils/businessVisualizationModels.mjs'
import {
  BusinessVisualizationFrame,
  VisualizationState,
  VisualizationStatus,
} from './BusinessVisualizationFrame.jsx'
import ProductIdentity from '../master-data/ProductIdentity.jsx'
import { useBusinessTableRecordOpen } from '../business-list/BusinessListLayout.jsx'
import { ProgressHint } from './ProgressMetricHint.jsx'

function quantityText(value, unitName) {
  return value === null ? '—' : `${value} ${unitName}`
}

export default function SalesDeliveryProgress({
  model,
  loading,
  error,
  onRetry,
  onOpen,
  viewState = {},
  onViewStateChange,
}) {
  const filter = viewState.filter || 'all'
  const filtered = model.rows.filter(
    (row) => filter === 'all' || row.status.key === filter
  )
  const pagination = paginateVisualizationRows(filtered, viewState.page)
  const { rows } = pagination
  const openOrder = useCallback((row, event) => {
    const trigger = event.currentTarget.matches('button')
      ? event.currentTarget
      : event.currentTarget.querySelector('.erp-sales-delivery-order button')
    trigger.focus({ preventScroll: true })
    onOpen?.(row)
  }, [onOpen])
  const rowProps = useCallback(() => ({
    title: '双击打开销售订单',
  }), [])
  const { onRow } = useBusinessTableRecordOpen({
    dataSource: rows,
    rowKey: 'id',
    onRow: rowProps,
    onOpenRecord: openOrder,
  })
  const columns = useMemo(() => [
    {
      title: '订单 / 客户',
      key: 'order',
      width: 220,
      render: (_, row) => (
        <div className="erp-sales-delivery-order">
          <Button type="link" size="small" aria-label={`打开销售订单 ${row.orderNo}`} onClick={(event) => openOrder(row, event)}>
            {row.orderNo}
          </Button>
          <span>{row.customerName}</span>
        </div>
      ),
    },
    {
      title: '产品',
      key: 'product',
      width: 260,
      className: 'erp-product-identity-cell',
      render: (_, row) => (
        <ProductIdentity productId={row.productID} name={row.productName} code={row.customerProductNo} compact />
      ),
    },
    {
      title: '交付日期',
      dataIndex: 'deliveryDate',
      width: 140,
      render: (value) => value || '未填写',
    },
    {
      title: '出货进度',
      key: 'progress',
      width: 240,
      render: (_, row) => row.progressKnown ? (
        <ProgressHint
          className="erp-progress-metric-trigger erp-sales-delivery-progress"
          label={`查看${row.orderNo} ${row.productName}出货进度`}
          content={
            <div className="erp-progress-metric-hint">
              <strong>{row.orderNo} · {row.productName}</strong>
              <span>已出货 {quantityText(row.shipped, row.unitName)} / 订购 {quantityText(row.ordered, row.unitName)}</span>
              <span>剩余待交 {quantityText(row.remaining, row.unitName)}</span>
              <span>完成比例 {row.percent}%</span>
              <p>按实际出货数量计算，取消的出货不计入。</p>
            </div>
          }
        >
          <Progress
            percent={row.percent}
            showInfo={false}
            status={row.status.key === 'overdue' ? 'exception' : 'normal'}
            strokeColor={`var(--${row.status.key === 'overdue' ? 'erp-visual-danger-text' : row.status.key === 'delivered' ? 'erp-visual-success-text' : 'erp-visual-info-text'})`}
            size="small"
          />
          <small>{quantityText(row.shipped, row.unitName)} / {quantityText(row.ordered, row.unitName)}</small>
        </ProgressHint>
      ) : <span className="erp-business-visual-unknown">出货数量待核对</span>,
    },
    {
      title: '剩余待交',
      dataIndex: 'remaining',
      width: 140,
      align: 'right',
      render: (value, row) => quantityText(value, row.unitName),
    },
    {
      title: '交付状态',
      key: 'status',
      width: 160,
      render: (_, row) => <VisualizationStatus status={row.status} />,
    },
  ], [openOrder])

  return (
    <BusinessVisualizationFrame
      className="erp-sales-delivery-visual"
      title="销售交付进度"
      loading={loading}
      error={error}
    >
      <VisualizationState
        loading={loading}
        error={error}
        empty={!loading && !error && filtered.length === 0}
        onRetry={onRetry}
      />
      {!loading && !error && rows.length > 0 ? (
        <Table
          className="erp-sales-delivery-table"
          size="small"
          rowKey="id"
          columns={columns}
          dataSource={rows}
          tableLayout="fixed"
          scroll={{ x: 1160 }}
          scrollToolbar
          onRow={onRow}
          pagination={{
            current: pagination.page,
            pageSize: pagination.pageSize,
            total: pagination.total,
            showSizeChanger: false,
            onChange: (page) => onViewStateChange?.({ ...viewState, page }),
          }}
        />
      ) : null}
    </BusinessVisualizationFrame>
  )
}
