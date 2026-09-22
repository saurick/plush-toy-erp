import React, { useMemo } from 'react'
import { Progress } from 'antd'
import { buildInventoryDistributionModel } from '../../utils/businessVisualizationModels.mjs'
import {
  BusinessVisualizationFrame,
  VisualizationState,
} from './BusinessVisualizationFrame.jsx'

export default function InventoryDistributionOverview({
  balances,
  warehouses,
  loading,
  error,
  onRetry,
  onSelectWarehouse,
  switcher,
}) {
  const model = useMemo(
    () => buildInventoryDistributionModel(balances, warehouses),
    [balances, warehouses]
  )
  return (
    <BusinessVisualizationFrame
      className="erp-inventory-distribution-visual"
      switcher={switcher}
      title="仓库库存分布"
      metrics={[
        {
          key: 'warehouses',
          label: '涉及仓库',
          value: model.counts.warehouses,
        },
        {
          key: 'records',
          label: '余额记录',
          value: model.counts.records,
        },
        {
          key: 'stocks',
          label: '仓内存货项',
          value: model.counts.stocks,
        },
        {
          key: 'unavailable',
          label: '无可用量记录',
          value: model.counts.unavailableRecords,
          tone: model.counts.unavailableRecords > 0 ? 'warning' : 'success',
        },
      ]}
    >
      <VisualizationState
        loading={loading}
        error={error}
        empty={!loading && !error && model.rows.length === 0}
        onRetry={onRetry}
      />
      {!loading && !error && model.rows.length > 0 ? (
        <div className="erp-inventory-distribution-grid">
          {model.rows.map((row) => (
            <button
              type="button"
              key={row.warehouseID || 'unassigned'}
              className="erp-inventory-distribution-grid__card"
              onClick={() => onSelectWarehouse?.(row)}
            >
              <span className="erp-inventory-distribution-grid__head">
                <strong>{row.warehouseName}</strong>
                <b>{row.percent}%</b>
              </span>
              <Progress percent={row.percent} showInfo={false} size="small" />
              <span className="erp-inventory-distribution-grid__facts">
                <span className="erp-inventory-distribution-grid__fact">
                  <strong className="erp-inventory-distribution-grid__fact-value">
                    {row.recordCount}
                  </strong>
                  <small className="erp-inventory-distribution-grid__fact-label">
                    余额记录
                  </small>
                </span>
                <span className="erp-inventory-distribution-grid__fact">
                  <strong className="erp-inventory-distribution-grid__fact-value">
                    {row.stockCount}
                  </strong>
                  <small className="erp-inventory-distribution-grid__fact-label">
                    存货项
                  </small>
                </span>
                <span className="erp-inventory-distribution-grid__fact">
                  <strong className="erp-inventory-distribution-grid__fact-value">
                    {row.availableRecordCount}
                  </strong>
                  <small className="erp-inventory-distribution-grid__fact-label">
                    有可用量
                  </small>
                </span>
                <span className="erp-inventory-distribution-grid__fact">
                  <strong className="erp-inventory-distribution-grid__fact-value">
                    {row.unavailableRecordCount}
                  </strong>
                  <small className="erp-inventory-distribution-grid__fact-label">
                    无可用量
                  </small>
                </span>
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </BusinessVisualizationFrame>
  )
}
