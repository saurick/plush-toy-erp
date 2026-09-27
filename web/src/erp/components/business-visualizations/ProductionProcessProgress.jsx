import React, { useMemo } from 'react'
import { ArrowRightOutlined } from '@ant-design/icons'
import { Button, Select, Drawer, Empty } from 'antd'
import {
  buildProductionProcessModel,
  paginateVisualizationRows,
} from '../../utils/businessVisualizationModels.mjs'
import {
  BusinessVisualizationFrame,
  VisualizationState,
  VisualizationPagination,
} from './BusinessVisualizationFrame.jsx'

const ORDER_STATUS_LABELS = Object.freeze({
  RELEASED: '生产中',
  CLOSED: '已关闭',
})

function orderOption(order) {
  const status = ORDER_STATUS_LABELS[order?.status] || '状态待核对'
  return {
    value: Number(order?.id || 0),
    label: `${order?.order_no || '生产订单未编号'} · ${status}`,
  }
}

export default function ProductionProcessProgress({
  orders,
  selectedOrderID,
  aggregate,
  loading,
  error,
  onRetry,
  onSelectOrder,
  onOpenOrder,
  switcher,
  viewState = {},
  onViewStateChange,
}) {
  const model = useMemo(
    () => buildProductionProcessModel(aggregate),
    [aggregate]
  )
  const options = useMemo(
    () =>
      (Array.isArray(orders) ? orders : [])
        .filter((order) => Number(order?.id || 0) > 0)
        .map(orderOption),
    [orders]
  )
  const filter = viewState.filter || 'all'
  const filtered = model.items.filter(
    (item) =>
      filter === 'all' ||
      item.steps.some(
        (step) =>
          step.state.key === filter ||
          (filter === 'quality' &&
            step.batches.some((batch) => batch.statusKey === 'WAITING_QUALITY'))
      )
  )
  const pagination = paginateVisualizationRows(filtered, viewState.page)
  const selectedItem = model.items.find((item) => item.id === viewState.itemID)
  const selectedStep = selectedItem?.steps.find(
    (step) => step.id === viewState.stepID
  )
  const change = (patch) => onViewStateChange?.({ ...viewState, ...patch })
  const empty = !loading && !error && options.length === 0

  return (
    <BusinessVisualizationFrame
      className="erp-production-process"
      switcher={switcher}
      title="生产工序"
      loading={loading}
      error={error}
      metrics={[
        {
          key: 'all',
          label: '全部产品行',
          value: model.counts.products,
          selected: filter === 'all',
          onClick: () => change({ filter: 'all', page: 1 }),
        },
        {
          key: 'active-batches',
          label: '当前批次',
          value: model.counts.activeBatches,
        },
        {
          key: 'quality',
          label: '待质检批次',
          selected: filter === 'quality',
          onClick: () => change({ filter: 'quality', page: 1 }),
          value: model.counts.waitingQuality,
          tone: model.counts.waitingQuality > 0 ? 'warning' : 'success',
        },
        {
          key: 'exception',
          label: '需处理批次',
          selected: filter === 'exception',
          onClick: () => change({ filter: 'exception', page: 1 }),
          value: model.counts.exceptions,
          tone: model.counts.exceptions > 0 ? 'danger' : 'success',
        },
      ]}
    >
      <div className="erp-production-process__toolbar">
        <div>
          <span className="erp-production-process__toolbar-label">
            选择生产订单
          </span>
          <Select
            showSearch
            optionFilterProp="label"
            value={selectedOrderID || undefined}
            options={options}
            placeholder="选择已发布或已关闭的生产订单"
            onChange={onSelectOrder}
          />
        </div>
        <Button
          type="link"
          size="small"
          icon={<ArrowRightOutlined aria-hidden="true" />}
          iconPosition="end"
          disabled={!selectedOrderID}
          onClick={() => onOpenOrder?.(selectedOrderID)}
        >
          打开生产订单
        </Button>
      </div>
      <VisualizationState
        loading={loading}
        error={error}
        empty={empty}
        onRetry={onRetry}
      />
      {!loading && !error && selectedOrderID && !aggregate ? (
        <div className="erp-business-visual-state">请选择可查看的生产订单</div>
      ) : null}
      {!loading && !error && aggregate && !model.initialized ? (
        <div className="erp-business-visual-state">
          当前订单尚未形成在制工序；请先到生产订单办理工序安排。
        </div>
      ) : null}
      {!loading && !error && model.initialized ? (
        <div className="erp-production-process__lanes">
          <VisualizationState empty={filtered.length === 0} />
          {pagination.rows.map((item) => (
            <section className="erp-production-process__lane" key={item.id}>
              <div className="erp-production-process__identity">
                <strong>{item.productName}</strong>
                <span>
                  {[item.productCode, item.skuCode]
                    .filter(Boolean)
                    .join(' · ') || `第 ${item.lineNo} 行`}
                </span>
                <small>
                  计划 {item.plannedQuantity} {item.unitName}
                </small>
              </div>
              <div className="erp-production-process__steps">
                {item.steps.map((step) => (
                  <button
                    type="button"
                    aria-label={`查看${item.productName}的${step.name}`}
                    onClick={() => change({ itemID: item.id, stepID: step.id })}
                    key={step.id}
                    className={`erp-production-process__step erp-production-process__step--${step.state.key}`}
                  >
                    <span className="erp-production-process__step-no">
                      {step.stepNo}
                    </span>
                    <strong>{step.name}</strong>
                    <b>{step.state.label}</b>
                    <small>
                      {step.batchSummary ||
                        (step.state.key === 'waiting'
                          ? '等待前序工序'
                          : '暂无在制批次')}
                    </small>
                    {step.executionText ? <em>{step.executionText}</em> : null}
                    {step.qualityText ? (
                      <span className="erp-production-process__quality">
                        {step.qualityText}
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            </section>
          ))}
          <VisualizationPagination
            pagination={pagination}
            onChange={(page) => change({ page })}
          />
        </div>
      ) : null}
      <Drawer
        title={
          selectedStep
            ? `${selectedItem.productName} · ${selectedStep.name}`
            : '工序明细'
        }
        open={Boolean(selectedStep) && !loading && !error}
        onClose={() => change({ stepID: null, itemID: null })}
        width={640}
        destroyOnHidden
      >
        {selectedStep ? (
          <>
            <p>
              {selectedStep.state.label} ·{' '}
              {selectedStep.executionText || '尚未安排生产方式'}
            </p>
            <h3>在制批次</h3>
            {selectedStep.batches.length ? (
              selectedStep.batches.map((batch) => (
                <div
                  className="erp-production-process__detail-row"
                  key={batch.id}
                >
                  <strong>{batch.batchNo}</strong>
                  <span>
                    {batch.quantity} {selectedItem.unitName}
                  </span>
                  <span>{batch.status}</span>
                </div>
              ))
            ) : (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="此工序暂无批次"
              />
            )}
            <h3>品质检验</h3>
            {selectedStep.inspections.length ? (
              selectedStep.inspections.map((inspection) => (
                <div
                  className="erp-production-process__detail-row"
                  key={inspection.id}
                >
                  <strong>{inspection.inspectionNo}</strong>
                  <span>{inspection.gate}</span>
                  <span>{inspection.status}</span>
                </div>
              ))
            ) : (
              <p>
                {selectedStep.qualityText
                  ? `待登记：${selectedStep.qualityText}`
                  : '本工序无需品质关口'}
              </p>
            )}
            <p>完工入库请到生产记录核对。</p>
          </>
        ) : null}
      </Drawer>
    </BusinessVisualizationFrame>
  )
}
