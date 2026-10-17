import React, { useMemo, useRef } from 'react'
import { ArrowRightOutlined } from '@ant-design/icons'
import { Button, Select, Tag } from 'antd'
import SearchInput from '@/common/components/SearchInput'
import Segmented from '@/common/components/navigation/SlidingSegmented'
import FilterChip from '@/common/components/navigation/FilterChip'
import { paginateVisualizationRows } from '../../utils/businessVisualizationModels.mjs'
import {
  buildProductionProcessWorkspace,
  filterProductionProcessItems,
} from '../../utils/productionProcessWorkspace.mjs'
import {
  BusinessVisualizationFrame,
  VisualizationState,
  VisualizationPagination,
} from './BusinessVisualizationFrame.jsx'
import ProductIdentity from '../master-data/ProductIdentity.jsx'
import ProductionProcessDrawer from './ProductionProcessDrawer.jsx'

const ORDER_STATUS_LABELS = Object.freeze({
  RELEASED: '生产中',
  CLOSED: '已关闭',
})
const VIEWS = [
  { value: 'current', label: '当前事项' },
  { value: 'matrix', label: '工序对照' },
]

function ProcessProduct({ item, onOpen }) {
  return (
    <ProductIdentity productId={item.productID} name={item.productName} compact>
      <Button
        type="link"
        size="small"
        onClick={onOpen}
        aria-label={`查看${item.productName}生产进度`}
        title={item.productName}
      >
        <span className="erp-production-process__product-name">
          {item.productName}
        </span>
      </Button>
      <small>
        {[item.productCode, item.skuCode].filter(Boolean).join(' · ') ||
          `第 ${item.lineNo} 行`}
      </small>
      <small>
        计划 {item.plannedQuantity} {item.unitName}
      </small>
    </ProductIdentity>
  )
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
  onOpenInspection,
  onOpenRecord,
  onOpenExceptions,
  canHandle = () => false,
  switcher,
  viewState = {},
  onViewStateChange,
}) {
  const model = useMemo(
    () => buildProductionProcessWorkspace(aggregate),
    [aggregate]
  )
  const returnFocus = useRef(null)
  const options = useMemo(
    () =>
      (Array.isArray(orders) ? orders : [])
        .filter((order) => Number(order?.id || 0) > 0)
        .map((order) => ({
          value: Number(order.id),
          label: `${order.order_no || '生产订单未编号'} · ${ORDER_STATUS_LABELS[order.status] || '状态待核对'}`,
        })),
    [orders]
  )
  const filter = viewState.filter || 'all'
  const layout = viewState.layout === 'matrix' ? 'matrix' : 'current'
  const filtered = filterProductionProcessItems(model.items, {
    filter,
    query: viewState.query,
  })
  const pagination = paginateVisualizationRows(filtered, viewState.page)
  const selectedItem = model.items.find((item) => item.id === viewState.itemID)
  const selectedStep = selectedItem?.steps.find(
    (step) => step.id === viewState.stepID
  )
  const change = (patch) => onViewStateChange?.({ ...viewState, ...patch })
  const open = (item, step, event) => {
    const target = step || item.currentStep
    if (!target) return
    returnFocus.current = event?.currentTarget || document.activeElement
    change({ itemID: item.id, stepID: target.id })
  }
  const available = (matter) => {
    if (!matter || matter.allowedForOrder === false) return false
    if (matter.target === 'wip') {
      return Boolean(onOpenOrder && canHandle(matter))
    }
    if (matter.target === 'inspection') {
      return Boolean(onOpenInspection && matter.recordID)
    }
    if (matter.target === 'record') {
      return Boolean(onOpenRecord && matter.recordID)
    }
    if (matter.target === 'exceptions') return Boolean(onOpenExceptions)
    return false
  }
  const act = (matter) => {
    if (!available(matter)) return
    const product = model.items.find((item) => item.matters.includes(matter))
    change({ itemID: product?.id || null, stepID: null })
    if (matter.target === 'wip') {
      onOpenOrder(selectedOrderID, matter.batchID, matter.action)
    }
    if (matter.target === 'inspection') onOpenInspection(matter.recordID)
    if (matter.target === 'record') onOpenRecord(matter.recordID)
    if (matter.target === 'exceptions') onOpenExceptions()
  }
  const rowAction = (item) => (
    <Button
      size="small"
      onClick={(event) =>
        available(item.current)
          ? act(item.current)
          : open(item, undefined, event)
      }
      icon={<ArrowRightOutlined aria-hidden="true" />}
      iconPosition="end"
    >
      {available(item.current) ? item.current.label : '查看进度'}
    </Button>
  )
  return (
    <BusinessVisualizationFrame
      className="erp-production-process"
      switcher={switcher}
      title="生产执行"
      loading={loading}
      error={error}
      toolbar={
        <div className="erp-production-process__toolbar">
          <div className="erp-production-process__order-picker">
            <label htmlFor="production-process-order">生产订单</label>
            <Select
              id="production-process-order"
              aria-label="选择生产订单"
              showSearch
              allowClear
              optionFilterProp="label"
              value={selectedOrderID || undefined}
              options={options}
              placeholder="选择已发布或已关闭的生产订单"
              onChange={(value) => onSelectOrder?.(value ?? null)}
            />
          </div>
          <Button
            className="erp-production-process__open-order"
            type="link"
            size="small"
            disabled={!selectedOrderID || !onOpenOrder}
            onClick={() => onOpenOrder?.(selectedOrderID)}
            icon={<ArrowRightOutlined aria-hidden="true" />}
            iconPosition="end"
          >
            打开生产订单
          </Button>
          <div
            className="erp-production-process__chips"
            aria-label="生产事项筛选"
          >
            {model.filters.map((entry) => (
              <FilterChip
                key={entry.key}
                selected={filter === entry.key}
                count={loading || error ? '—' : entry.count}
                disabled={loading || Boolean(error)}
                onClick={() => change({ filter: entry.key, page: 1 })}
              >
                {entry.label}
              </FilterChip>
            ))}
          </div>
          <SearchInput
            className="erp-production-process__search"
            aria-label="搜索生产产品或规格"
            placeholder="搜索产品、编码或规格"
            allowClear
            value={viewState.query || ''}
            onChange={(event) => change({ query: event.target.value, page: 1 })}
          />
          <div className="erp-business-visual-switch erp-production-process__layout">
            <Segmented
              hierarchy="secondary"
              aria-label="生产执行展示方式"
              options={VIEWS}
              value={layout}
              onChange={(value) => change({ layout: value })}
            />
          </div>
        </div>
      }
    >
      <VisualizationState
        loading={loading}
        error={error}
        empty={!loading && !error && options.length === 0}
        onRetry={onRetry}
      />
      {!loading && !error && options.length > 0 && !aggregate ? (
        <div className="erp-business-visual-state">请选择可查看的生产订单</div>
      ) : null}
      {!loading && !error && aggregate && !model.initialized ? (
        <div className="erp-business-visual-state">
          当前订单尚未形成在制工序；请先到生产订单办理工序安排。
        </div>
      ) : null}
      {!loading && !error && model.initialized ? (
        <>
          <VisualizationState empty={filtered.length === 0} />
          {layout === 'current' && pagination.rows.length > 0 ? (
            <div className="erp-production-process__current">
              <table aria-label="当前生产事项">
                <thead>
                  <tr>
                    <th>产品 / 规格</th>
                    <th>当前工序</th>
                    <th>进度 / 数量</th>
                    <th>当前事项 / 负责岗位</th>
                    <th>办理入口</th>
                  </tr>
                </thead>
                <tbody>
                  {pagination.rows.map((item) => (
                    <tr
                      key={item.id}
                      data-product-id={item.id}
                      data-selected={selectedItem?.id === item.id}
                    >
                      <td>
                        <ProcessProduct
                          item={item}
                          onOpen={(event) => open(item, undefined, event)}
                        />
                      </td>
                      <td data-label="当前工序">
                        {item.currentStep?.name || '工序待核对'}
                      </td>
                      <td data-label="进度 / 数量">
                        <Tag
                          color={item.current?.color || item.currentStep?.color}
                        >
                          {item.current?.state ||
                            item.currentStep?.state.label ||
                            '待核对'}
                        </Tag>
                        <small>
                          {item.current
                            ? `${item.current.quantity} ${item.unitName}`
                            : '查看工序结果'}
                        </small>
                      </td>
                      <td data-label="当前事项">
                        <span>
                          {item.current?.title ||
                            (item.steps.every(
                              (step) => step.state.key === 'done'
                            )
                              ? '本产品工序已完成'
                              : '等待前道移交，暂未形成当前批次')}
                        </span>
                        <small>
                          {item.current
                            ? `负责岗位：${item.current.owner}`
                            : '检验与成品入库分别核对'}
                          {item.matters.length > 1
                            ? ` · 另有 ${item.matters.length - 1} 项待跟进`
                            : ''}
                        </small>
                      </td>
                      <td>{rowAction(item)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {layout === 'matrix' ? (
            <div className="erp-production-process__lanes">
              {pagination.rows.length > 0 ? (
                <div className="erp-production-process__head">
                  <span>产品 / 规格</span>
                  <div className="erp-production-process__steps">
                    {pagination.rows[0].steps.map((step) => (
                      <strong key={step.id}>{step.name}</strong>
                    ))}
                  </div>
                </div>
              ) : null}
              {pagination.rows.map((item) => (
                <section className="erp-production-process__lane" key={item.id}>
                  <div className="erp-production-process__identity">
                    <ProcessProduct
                      item={item}
                      onOpen={(event) => open(item, undefined, event)}
                    />
                  </div>
                  <div className="erp-production-process__steps">
                    {item.steps.map((step) => (
                      <button
                        type="button"
                        aria-label={`查看${item.productName}的${step.name}`}
                        onClick={(event) => open(item, step, event)}
                        key={step.id}
                        className={`erp-production-process__step erp-production-process__step--${step.state.key}`}
                      >
                        <strong className="erp-production-process__step-name">
                          {step.name}
                        </strong>
                        <b>{step.state.label}</b>
                        {step.batchSummary || step.state.key !== 'waiting' ? (
                          <small>
                            {step.batchSummary || '暂无在制批次'}
                            {step.executionText
                              ? ` · ${step.executionText}`
                              : ''}
                          </small>
                        ) : null}
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : null}
          <VisualizationPagination
            pagination={pagination}
            onChange={(page) => change({ page })}
          />
        </>
      ) : null}
      <ProductionProcessDrawer
        item={selectedItem}
        step={selectedStep}
        aggregate={aggregate}
        orderNo={model.order?.orderNo}
        open={Boolean(selectedStep) && !loading && !error}
        onClose={() => change({ stepID: null, itemID: null })}
        afterOpenChange={(isOpen) => {
          if (!isOpen && returnFocus.current?.isConnected) {
            returnFocus.current.focus({ preventScroll: true })
          }
        }}
        onSelectStep={(stepID) => change({ stepID })}
        available={available}
        onAction={act}
        onOpenInspection={onOpenInspection ? (inspectionID) => {
          change({ stepID: null })
          onOpenInspection(inspectionID)
        } : undefined}
      />
    </BusinessVisualizationFrame>
  )
}
