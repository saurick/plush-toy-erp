import React, { useMemo } from 'react'
import { ArrowRightOutlined } from '@ant-design/icons'
import { Button, Select } from 'antd'
import { buildProductionProcessModel } from '../../utils/businessVisualizationModels.mjs'
import {
  BusinessVisualizationFrame,
  VisualizationState,
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
  const empty = !loading && !error && options.length === 0

  return (
    <BusinessVisualizationFrame
      className="erp-production-process"
      switcher={switcher}
      title="生产工序"
      metrics={[
        {
          key: 'products',
          label: '产品行',
          value: model.counts.products,
        },
        {
          key: 'active-batches',
          label: '当前批次',
          value: model.counts.activeBatches,
        },
        {
          key: 'quality',
          label: '待质检',
          value: model.counts.waitingQuality,
          tone: model.counts.waitingQuality > 0 ? 'warning' : 'success',
        },
        {
          key: 'exception',
          label: '需处理',
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
          {model.items.map((item) => (
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
                  <article
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
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : null}
    </BusinessVisualizationFrame>
  )
}
