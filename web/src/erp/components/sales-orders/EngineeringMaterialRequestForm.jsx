import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Button, Form, Radio, Space, Spin, Tag } from 'antd'
import { useNavigate } from 'react-router-dom'
import BusinessTextArea from '../business-list/BusinessTextArea.jsx'
import {
  getEngineeringMaterialRequest,
  submitEngineeringMaterialRequest,
  reviewEngineeringMaterialRequest,
} from '../../api/masterDataOrderApi.mjs'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { message, modal } from '@/common/utils/antdApp'
import EngineeringMaterialSummarySheet, {
  EngineeringMaterialAmountSummary,
} from './EngineeringMaterialSummarySheet.jsx'
import {
  materialFinanceIssue,
  materialNoteFits,
} from '../../utils/engineeringMaterialSummary.mjs'
import { ENGINEERING_MATERIAL_STATUS as STATUS } from '../../utils/engineeringMaterialTask.mjs'
import './EngineeringMaterialRequest.css'

export default function EngineeringMaterialRequestForm({
  orderID,
  requestID,
  workflowTask,
  mobile = false,
  readOnly = false,
  permissions,
  onCancel,
  onChanged,
  taskProcessing = false,
  onBusyChange,
  leaveGuardRef,
  draftRef,
  onDraftChange,
  render,
}) {
  const [form] = Form.useForm()
  const navigate = useNavigate()
  const [request, setRequest] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [financeIssue, setFinanceIssue] = useState(null)
  const [decision, setDecision] = useState('approve')
  const submitting = useRef(false)
  const draftKey = `${workflowTask?.id}:${workflowTask?.version}:${orderID}:${requestID}`
  const confirming = useRef(false)
  const [taskSettled, setTaskSettled] = useState(false)
  const [error, setError] = useState('')
  const [reload, setReload] = useState({ key: 0, preview: false })
  const install = useCallback(
    (value) => {
      setRequest(value)
      setDirty(false)
      setFinanceIssue(null)
      form.resetFields()
      form.setFieldsValue({
        note: '',
        items: value.items.map((item) => ({
          id: item.id,
          purchase_quantity: item.purchase_quantity ?? item.required_quantity,
          unit_price: item.unit_price ?? '',
          expected_arrival_date: item.expected_arrival_date?.slice(0, 10) ?? '',
          note: item.note ?? '',
        })),
      })
      const draft = draftRef?.current
      if (draft?.key === draftKey && draft.requestVersion === value.version) {
        form.setFieldsValue(draft.values)
        setDecision(draft.decision)
        setDirty(true)
      }
    },
    [form, draftKey, draftRef]
  )
  useEffect(() => {
    if (!orderID) return undefined
    const controller = new AbortController()
    setLoading(true)
    setError('')
    setRequest(null)
    getEngineeringMaterialRequest(
      {
        sales_order_id: orderID,
        preview: reload.preview,
        ...(!reload.preview && requestID ? { request_id: requestID } : {}),
      },
      { signal: controller.signal }
    )
      .then((value) => {
        if (!controller.signal.aborted) install(value)
      })
      .catch((cause) => {
        if (!controller.signal.aborted) {
          setError(getActionErrorMessage(cause, '读取工程用料汇总'))
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [orderID, requestID, reload, install])

  const orderClosed = Boolean(
    request?.order_status && request.order_status !== 'active'
  )
  const canFinance =
    !readOnly &&
    !orderClosed &&
    !taskSettled &&
    request?.status === 'BOSS_APPROVED' &&
    permissions.finance
  const canBoss =
    !readOnly &&
    !orderClosed &&
    !taskSettled &&
    request?.status === 'SUBMITTED' &&
    permissions.boss
  const canSubmit =
    !readOnly &&
    !orderClosed &&
    !taskSettled &&
    request?.status === 'PREVIEW' &&
    permissions.submit
  const act = async (action) => {
    if (readOnly || submitting.current || saving || loading || !request) return
    if (
      (action === 'SUBMIT' && !canSubmit) ||
      (action === 'BOSS_APPROVE' && !canBoss) ||
      (action === 'FINANCE_APPROVE' && !canFinance) ||
      (action === 'REJECT' && !canBoss && !canFinance)
    ) {
      return
    }
    let values = form.getFieldsValue(true)
    if (!materialNoteFits(values.note)) {
      message.warning('审批备注过长，请适当精简')
      return
    }
    if (action === 'FINANCE_APPROVE') {
      const issue = materialFinanceIssue(request.items, values.items)
      if (issue) {
        setFinanceIssue({ ...issue })
        form.setFields([
          {
            name: ['items', issue.index, issue.field],
            errors: [issue.message],
          },
        ])
        message.warning(issue.message)
        return
      }
      try {
        values = await form.validateFields()
      } catch {
        message.warning(
          '请检查实购数量、单价、到货日期与调整原因；数量和单价最多六位小数'
        )
        return
      }
    }
    if (action === 'REJECT' && !String(values.note || '').trim()) {
      form.setFields([{ name: 'note', errors: ['请填写退回原因'] }])
      form.getFieldInstance('note')?.focus?.()
      message.warning('请填写退回原因')
      return
    }
    if (submitting.current) return
    submitting.current = true
    setSaving(true)
    setError('')
    const taskVersion = workflowTask
      ? {
          task_id: workflowTask.id,
          expected_task_version: workflowTask.version,
        }
      : {}
    try {
      const value =
        action === 'SUBMIT'
          ? await submitEngineeringMaterialRequest({
              sales_order_id: orderID,
              expected_version: request.source_order_version,
              expected_source_hash: request.source_hash,
              ...taskVersion,
            })
          : await reviewEngineeringMaterialRequest(
              {
                id: request.id,
                expected_version: request.version,
                action,
                ...taskVersion,
                note: values.note || null,
                ...(action === 'FINANCE_APPROVE'
                  ? {
                      items: values.items.map((item, index) => ({
                        ...item,
                        id: request.items[index].id,
                        purchase_quantity: String(item.purchase_quantity)
                          .replace(/,/gu, '')
                          .trim(),
                        unit_price: String(item.unit_price)
                          .replace(/,/gu, '')
                          .trim(),
                      })),
                    }
                  : {}),
              },
              canBoss ? 'boss' : 'finance'
            )
      const expectedStatus = {
        SUBMIT: 'SUBMITTED',
        BOSS_APPROVE: 'BOSS_APPROVED',
        FINANCE_APPROVE: 'APPROVED',
        REJECT: 'REJECTED',
      }[action]
      if (
        value.status !== expectedStatus ||
        Number(value.sales_order_id) !== Number(orderID) ||
        !Number.isSafeInteger(value.id) ||
        value.id <= 0 ||
        !Number.isSafeInteger(value.version) ||
        value.version <= 0 ||
        (action !== 'SUBMIT' &&
          (value.id !== request.id || value.version <= request.version))
      ) {
        throw new Error('用料办理结果尚未确认，请重新读取后核对')
      }
      if (draftRef) draftRef.current = null
      onDraftChange?.(null)
      install(value)
      if (workflowTask) setTaskSettled(true)
      const successMessage =
        action === 'FINANCE_APPROVE'
          ? value.purchase_orders.length
            ? `已批准，已生成 ${value.purchase_orders.length} 张采购订单`
            : '已批准，本次无需采购'
          : action === 'REJECT'
            ? '已退回工程修改'
            : action === 'SUBMIT'
              ? '已提交老板审核'
              : '审核已通过，已交财务核价'
      onChanged?.(value, { action, reason: values.note || '', successMessage })
      message.success(successMessage)
    } catch (cause) {
      setError(getActionErrorMessage(cause, '办理工程用料审批'))
    } finally {
      submitting.current = false
      setSaving(false)
    }
  }

  const shouldConfirmLeave = canFinance && dirty
  const discardThen = (next) => {
    if (submitting.current || saving || confirming.current) return
    if (!shouldConfirmLeave) {
      next()
      return
    }
    confirming.current = true
    modal.confirm({
      centered: true,
      title: '放弃未保存的核价内容？',
      content: '已填写的实购数量、单价、交期和备注尚未保存。',
      okText: '放弃修改',
      cancelText: '继续编辑',
      onOk: () => {
        confirming.current = false
        setDirty(false)
        if (draftRef) draftRef.current = null
        onDraftChange?.(null)
        next()
      },
      onCancel: () => {
        confirming.current = false
      },
    })
  }
  const title = readOnly
    ? '材料汇总'
    : permissions.finance
      ? '核价并批准采购'
      : permissions.boss
        ? '审核工程用料'
        : '处理工程用料'
  const saveDraft = (nextDecision) => {
    if (draftRef && request) {
      draftRef.current = {
        key: draftKey,
        requestVersion: request.version,
        values: form.getFieldsValue(true),
        decision: nextDecision,
      }
      onDraftChange?.(draftRef.current)
    }
  }
  useEffect(() => {
    onBusyChange?.(saving)
    return () => onBusyChange?.(false)
  }, [saving, onBusyChange])
  useEffect(() => {
    if (!leaveGuardRef) return undefined
    leaveGuardRef.current = discardThen
    return () => {
      leaveGuardRef.current = null
    }
  })
  useEffect(() => {
    if (!shouldConfirmLeave && !saving) return undefined
    const beforeUnload = (event) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [shouldConfirmLeave, saving])
  const selectedAction = canSubmit
    ? 'SUBMIT'
    : decision === 'reject'
      ? 'REJECT'
      : canBoss
        ? 'BOSS_APPROVE'
        : 'FINANCE_APPROVE'
  const selectedLabel = canSubmit
    ? '提交老板审核'
    : decision === 'reject'
      ? '确认退回工程'
      : canBoss
        ? '确认通过，交财务'
        : '批准并生成采购订单'
  const footer = taskProcessing ? (
    <div className="erp-material-task-action__footer">
      {request && canFinance ? (
        <EngineeringMaterialAmountSummary
          request={request}
          form={form}
          canFinance={canFinance}
        />
      ) : null}
      {!orderClosed &&
      !taskSettled &&
      request?.status === 'REJECTED' &&
      permissions.submit ? (
        <Button
          disabled={saving || loading}
          onClick={() =>
            discardThen(() => setReload({ key: reload.key + 1, preview: true }))
          }
        >
          按当前资料重新整理
        </Button>
      ) : null}
      {canBoss || canFinance || canSubmit ? (
        <Button
          type="primary"
          danger={decision === 'reject'}
          loading={saving}
          disabled={loading || (canSubmit && request.issues.length > 0)}
          onClick={() => act(selectedAction)}
        >
          {selectedLabel}
        </Button>
      ) : null}
    </div>
  ) : readOnly ? null : (
    <div className="erp-material-summary-footer">
      {request && (permissions.commercialRead || canFinance) ? (
        <EngineeringMaterialAmountSummary
          request={request}
          form={form}
          canFinance={canFinance}
        />
      ) : null}
      <Space wrap className="erp-material-summary-actions">
        <Button disabled={saving} onClick={() => discardThen(onCancel)}>
          关闭
        </Button>
        {!mobile ? (
          <Button
            disabled={saving || loading}
            onClick={() =>
              discardThen(() =>
                setReload({ key: reload.key + 1, preview: false })
              )
            }
          >
            重新读取
          </Button>
        ) : null}
        {!orderClosed &&
        !taskSettled &&
        request?.status === 'REJECTED' &&
        permissions.submit ? (
          <Button
            disabled={saving}
            onClick={() =>
              discardThen(() =>
                setReload({ key: reload.key + 1, preview: true })
              )
            }
          >
            按当前资料重新整理
          </Button>
        ) : null}
        {canSubmit ? (
          <Button
            type="primary"
            loading={saving}
            disabled={request.issues.length > 0}
            onClick={() => act('SUBMIT')}
          >
            提交老板审核
          </Button>
        ) : null}
        {canBoss || canFinance ? (
          <Button danger disabled={saving} onClick={() => act('REJECT')}>
            退回工程
          </Button>
        ) : null}
        {canBoss ? (
          <Button
            type="primary"
            loading={saving}
            onClick={() => act('BOSS_APPROVE')}
          >
            审核通过，交财务
          </Button>
        ) : null}
        {canFinance ? (
          <Button
            type="primary"
            loading={saving}
            onClick={() => act('FINANCE_APPROVE')}
          >
            批准并生成采购订单
          </Button>
        ) : null}
      </Space>
    </div>
  )
  const content = (
    <Spin spinning={loading}>
      <Form
        form={form}
        layout="vertical"
        onValuesChange={() => {
          setDirty(true)
          saveDraft(decision)
        }}
        onFinish={taskProcessing ? () => act(selectedAction) : undefined}
        className="erp-engineering-material-review"
      >
        {error ? (
          <Alert
            type="error"
            showIcon
            message={error}
            action={
              <Button
                disabled={loading}
                onClick={() =>
                  discardThen(() =>
                    setReload({ key: reload.key + 1, preview: false })
                  )
                }
              >
                重试
              </Button>
            }
          />
        ) : null}
        {request ? (
          <>
            {!mobile || orderClosed || dirty ? (
              <Space wrap>
                <Tag>{STATUS[request.status] || request.status}</Tag>
                {orderClosed ? <Tag>订单已结束，仅供查看</Tag> : null}
                {dirty ? (
                  <Tag color="orange">
                    {canFinance ? '核价内容尚未保存' : '审核意见尚未保存'}
                  </Tag>
                ) : null}
              </Space>
            ) : null}
            {request.status === 'PREVIEW' ? (
              <p className="erp-material-summary-hint">
                尚未提交审批，当前为已保存订单与 BOM 的用料预览。
              </p>
            ) : null}
            {request.issues.length ? (
              <Alert
                type="warning"
                message="提交前请补齐"
                description={
                  <ul>
                    {[...new Set(request.issues)].map((issue) => (
                      <li key={issue}>{issue}</li>
                    ))}
                  </ul>
                }
              />
            ) : null}
            {canFinance && !mobile ? (
              <p className="erp-material-summary-hint">
                核对实购数量、人民币单价和到货日期。调整数量请填写原因；库存不会自动抵扣。采购付款及开票约定沿用厂商档案。
              </p>
            ) : null}
            {taskProcessing && (canBoss || canFinance) ? (
              <Form.Item
                className="erp-material-task-action__field"
                label="处理方式"
              >
                <Radio.Group
                  value={decision}
                  disabled={saving}
                  onChange={(event) => {
                    setDecision(event.target.value)
                    saveDraft(event.target.value)
                  }}
                  options={[
                    {
                      value: 'approve',
                      label: canFinance ? '核价并批准采购' : '审批通过',
                    },
                    { value: 'reject', label: '退回工程' },
                  ]}
                />
              </Form.Item>
            ) : null}
            {!taskProcessing || canFinance || canSubmit ? (
              <EngineeringMaterialSummarySheet
                request={request}
                form={form}
                canFinance={canFinance}
                commercialRead={permissions.commercialRead}
                financeIssue={financeIssue}
                onReload={() =>
                  discardThen(() =>
                    setReload({ key: reload.key + 1, preview: false })
                  )
                }
                mobile={mobile}
                saving={saving}
              />
            ) : null}
            {readOnly && permissions.commercialRead ? (
              <EngineeringMaterialAmountSummary
                request={request}
                form={form}
                canFinance={false}
              />
            ) : null}
            {request.status === 'REJECTED' && request.review_note ? (
              <p>审批备注：{request.review_note}</p>
            ) : null}
            {request.boss_reviewed_at ? (
              <p>
                老板审核：{request.boss_reviewed_at.slice(0, 10)}{' '}
                {request.boss_review_note || ''}
              </p>
            ) : null}
            {request.finance_reviewed_at ? (
              <p>
                财务批准：{request.finance_reviewed_at.slice(0, 10)}{' '}
                {request.finance_review_note || ''}
              </p>
            ) : null}
            {canBoss || canFinance ? (
              <Form.Item
                className="erp-material-task-action__field"
                label={
                  taskProcessing
                    ? decision === 'reject'
                      ? '退回原因'
                      : '审批意见'
                    : '审批备注 / 退回原因'
                }
                name="note"
              >
                <BusinessTextArea
                  maxLength={255}
                  minRows={2}
                  disabled={saving}
                />
              </Form.Item>
            ) : null}
            {request.purchase_orders.length ? (
              <Space wrap>
                {request.purchase_orders.map((po) =>
                  mobile || !permissions.purchaseRead ? (
                    <Tag key={po.id}>{po.purchase_order_no}</Tag>
                  ) : (
                    <Button
                      key={po.id}
                      disabled={saving}
                      onClick={() => {
                        onCancel?.()
                        navigate(
                          `/erp/purchase/accessories?purchase_order_id=${po.id}`
                        )
                      }}
                    >
                      {po.purchase_order_no}
                    </Button>
                  )
                )}
              </Space>
            ) : null}
          </>
        ) : null}
      </Form>
    </Spin>
  )
  return render({ content, footer, title, request, saving, discardThen })
}
