import React, { useState } from 'react'
import { Button, Drawer, Tag } from 'antd'
import Segmented from '@/common/components/navigation/SlidingSegmented'
import { OperationalFactStatus } from '../../../common/consts/statuses.generated.mjs'

const RECEIPT_STATUS = {
  [OperationalFactStatus.DRAFT]: '草稿，待仓库核对',
  [OperationalFactStatus.POSTED]: '已确认入库',
  [OperationalFactStatus.CANCELLED]: '已取消',
}

export default function ProductionProcessDrawer({
  item,
  step,
  aggregate,
  orderNo,
  open,
  onClose,
  afterOpenChange,
  onSelectStep,
  available,
  onAction,
  onOpenInspection,
}) {
  const [problemStepID, setProblemStepID] = useState(null)
  const onlyProblems = Boolean(open && step?.problemBatches.length && problemStepID === step.id)
  const visibleBatches = onlyProblems
    ? step.problemBatches
    : step?.activeBatches || []
  const inspections = (step?.inspections || []).filter(
    (inspection) => !onlyProblems || visibleBatches.some((batch) => batch.id === inspection.batchID)
  )
  const close = () => {
    setProblemStepID(null)
    onClose()
  }
  const selectStep = (stepID) => {
    setProblemStepID(null)
    onSelectStep(stepID)
  }
  const primary = step?.primary
  const current = item?.currentStep
  const ahead =
    item &&
    step &&
    item.steps.findIndex((entry) => entry.id === step.id) >
      item.steps.findIndex((entry) => entry.id === current?.id)
  const receipts = (aggregate?.finishedGoodsReceipts || []).filter((receipt) =>
    visibleBatches.some((batch) => batch.id === receipt.production_wip_batch_id)
  )
  return (
    <Drawer
      title={
        step ? (
          <div className="erp-production-process-drawer__heading">
            <small>生产进度与办理 · {orderNo}</small>
            <strong>
              {item.productName} · {step.name}
            </strong>
            <small>
              {[item.productCode, item.skuCode].filter(Boolean).join(' · ')} ·
              计划 {item.plannedQuantity} {item.unitName}
            </small>
          </div>
        ) : (
          '生产事项'
        )
      }
      open={open}
      onClose={close}
      afterOpenChange={afterOpenChange}
      width={560}
      className="erp-production-process-drawer"
      destroyOnHidden
      footer={
        <div className="erp-production-process-drawer__footer">
          {primary && !available(primary) ? (
            <span>
              {primary.allowedForOrder === false
                ? '订单已关闭，普通批次不能继续办理。'
                : `当前事项由${primary.owner}岗位办理。`}
            </span>
          ) : null}
          <Button onClick={close}>返回列表</Button>
          {primary && available(primary) ? (
            <Button type="primary" onClick={() => onAction(primary)}>
              {primary.label}
            </Button>
          ) : !primary && current && step?.id !== current.id ? (
            <Button type="primary" onClick={() => selectStep(current.id)}>
              查看当前事项
            </Button>
          ) : null}
        </div>
      }
    >
      {item && step ? (
        <div className="erp-production-process-drawer__content">
          <section
            className={`erp-production-process-drawer__summary erp-production-process-drawer__summary--${step.state.key}`}
          >
            <Tag color={step.color}>{step.state.label}</Tag>
            <h3>
              {primary?.title ||
                (ahead
                  ? `${step.name}尚未开始`
                  : step.state.key === 'done'
                    ? `${step.name}已有完成记录`
                    : `${step.name}暂未形成批次`)}
            </h3>
            <p>
              {primary?.reason ||
                (ahead
                  ? '前道工序尚未移交，暂未形成这道工序的批次。'
                  : step.state.key === 'done'
                    ? '本工序结果按下方批次、检验和入库记录核对。'
                    : '请选择当前事项跟进前道处理。')}
            </p>
            <dl>
              <dt>涉及数量</dt>
              <dd>
                {primary
                  ? `${primary.quantity} ${item.unitName} · 本批`
                  : step.batches.length
                    ? `${step.quantity} ${item.unitName} · 有效批次合计`
                    : '尚未形成批次'}
              </dd>
              <dt>负责岗位</dt>
              <dd>
                {primary?.owner ||
                  (item.current ? item.current.owner : '本工序暂无待办事项')}
              </dd>
              <dt>下一步</dt>
              <dd>
                {primary?.next ||
                  (item.current
                    ? `跟进${current.name}：${item.current.next}`
                    : '核对检验与成品入库记录。')}
              </dd>
            </dl>
          </section>
          <section>
            <h3>生产工序</h3>
            <Segmented
              hierarchy="secondary"
              block
              aria-label="查看生产工序"
              value={step.id}
              options={item.steps.map((entry) => ({
                value: entry.id,
                label: (
                  <span className="erp-production-process-drawer__stage">
                    <strong>{entry.name}</strong>
                    <small>{entry.state.label}</small>
                  </span>
                ),
              }))}
              onChange={selectStep}
            />
          </section>
          <section>
            <h3>
              <span>{onlyProblems ? '需处理批次' : '本工序批次'} <small>{visibleBatches.length} 批</small></span>
              {step.problemBatches.length ? (
                <Button
                  type="link"
                  size="small"
                  aria-pressed={onlyProblems}
                  onClick={() => setProblemStepID(onlyProblems ? null : step.id)}
                >
                  {onlyProblems ? '查看全部批次' : '只看需处理批次'}
                </Button>
              ) : null}
            </h3>
            {visibleBatches.length ? (
              <div className="erp-production-process-drawer__batches">
                {visibleBatches.map((batch) => {
                  const matter = step.matters.find(
                    (entry) => entry.batchID === batch.id
                  )
                  return (
                    <div
                      className="erp-production-process-drawer__batch"
                      key={batch.id}
                    >
                      <span>
                        <strong>{batch.batchNo}</strong>
                        <small>{batch.executionLabel}</small>
                      </span>
                      <span>
                        {batch.quantity} {item.unitName}
                      </span>
                      <span>{matter?.state || batch.status}</span>
                      {matter && available(matter) ? (
                        <Button
                          size="small"
                          type="link"
                          onClick={() => onAction(matter)}
                        >
                          {matter.label}
                        </Button>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            ) : (
              <p>等待前道移交后形成批次。</p>
            )}
          </section>
          <section>
            <h3>品质检验</h3>
            {inspections.length ? (
              <div className="erp-production-process-drawer__results">
                {inspections.map((inspection) => (
                  <div key={inspection.id}>
                    <span>{inspection.gate}</span>
                    <strong>{inspection.status}</strong>
                    <small>{inspection.inspectionNo}</small>
                    {onOpenInspection ? (
                      <Button
                        size="small"
                        type="link"
                        aria-label={`查看检验结果 ${inspection.inspectionNo}`}
                        onClick={() => onOpenInspection(inspection.id)}
                      >
                        查看检验结果
                      </Button>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <p>
                {step.qualityText
                  ? `检验要求：${step.qualityText}；${step.batches.length ? '尚未形成检验记录。' : '前道移交后再按工艺办理。'}`
                  : '本工序未设置品质检验要求。'}
              </p>
            )}
          </section>
          {receipts.length ? (
            <section>
              <h3>成品入库</h3>
              <div className="erp-production-process-drawer__results">
                {receipts.map((receipt) => (
                  <div key={receipt.id}>
                    <span>{receipt.fact_no}</span>
                    <strong>
                      {RECEIPT_STATUS[receipt.status] || '状态待核对'}
                    </strong>
                    <small>
                      {receipt.quantity} {item.unitName}
                    </small>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
          <details className="erp-production-process-drawer__trace">
            <summary>批次与原工艺名称</summary>
            <dl>
              <dt>原工艺名称</dt>
              <dd>{step.originalName || '未记录'}</dd>
              <dt>工序说明</dt>
              <dd>{step.description}</dd>
              {step.batches.filter((batch) => !step.activeBatches.some((active) => active.id === batch.id)).map((batch, index) => (
                <React.Fragment key={batch.id}>
                  <dt>第 {index + 1} 批</dt>
                  <dd>{batch.batchNo}</dd>
                </React.Fragment>
              ))}
            </dl>
          </details>
        </div>
      ) : null}
    </Drawer>
  )
}
