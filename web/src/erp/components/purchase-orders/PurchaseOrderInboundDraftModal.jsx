import React, { useEffect, useRef, useState } from 'react'
import {
  Alert,
  Button,
  Empty,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Select,
  Spin,
  Tag,
} from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { modal } from '@/common/utils/antdApp'
import BusinessFormModal from '../business-list/BusinessFormModal.jsx'
import BusinessTextArea from '../business-list/BusinessTextArea.jsx'
import { DateInput } from '../business-list/BusinessListLayout.jsx'
import { formatQuantity } from '../../utils/businessLineItems.mjs'
import {
  arrivalDifference,
  arrivalItemErrors,
  arrivalItemHasInput,
} from '../../utils/incomingAcceptance.mjs'
import {
  normalizePositiveNumeric20Scale6,
  formatNumeric20Scale6Summary,
  sumNumeric20Scale6Values,
} from '../../utils/numeric20Scale6.mjs'
import './purchaseOrderArrival.css'

function ArrivalRecord({ field, item, row, form, disabled, onRemove }) {
  const number = field.name + 1
  const dependencies = [
    'quantity',
    'declared_quantity',
    'warehouse_id',
    'lot_no',
    'note',
  ].map((key) => ['arrival_items', field.name, key])
  const rules = (key) => [
    {
      validator: async () => {
        const error = arrivalItemErrors(
          form.getFieldValue(['arrival_items', field.name])
        )[key]
        if (error) throw new Error(error)
      },
    },
  ]
  const counted = normalizePositiveNumeric20Scale6(item.quantity)
  const difference = counted
    ? arrivalDifference(item.quantity, item.declared_quantity)
    : ''
  const discrepant = difference.startsWith('少') || difference.startsWith('多')

  return (
    <div
      className="erp-purchase-arrival__record"
      role="group"
      aria-label={`第${number}条到货记录`}
    >
      <div className="erp-purchase-arrival__record-head">
        <span className="erp-purchase-arrival__record-label">
          到货记录 {number}
        </span>
        <span className="erp-purchase-arrival__comparison" aria-live="polite">
          {counted ? (
            <Tag
              color={
                discrepant
                  ? 'warning'
                  : difference === '一致'
                    ? 'success'
                    : undefined
              }
            >
              {discrepant
                ? `比标示${difference} ${row.unit}`
                : difference === '一致'
                  ? '与标示一致'
                  : '未提供标示数量'}
            </Tag>
          ) : (
            '待清点'
          )}
        </span>
        <Popconfirm
          title="移除这条到货记录？"
          description="这条记录已填写的内容将被清除。"
          okText="移除记录"
          cancelText="保留"
          okButtonProps={{ danger: true }}
          disabled={disabled || !arrivalItemHasInput(item)}
          onConfirm={onRemove}
        >
          <Button
            type="text"
            size="small"
            danger
            aria-label={`移除第${number}条到货记录`}
            disabled={disabled}
            onClick={() => {
              if (!arrivalItemHasInput(item)) onRemove()
            }}
          >
            移除
          </Button>
        </Popconfirm>
      </div>
      <div className="erp-purchase-arrival__fields">
        <Form.Item
          name={[field.name, 'quantity']}
          label={`实点数量（${row.unit}）`}
          dependencies={dependencies}
          rules={rules('quantity')}
        >
          <InputNumber
            aria-label={`第${number}条实点数量`}
            stringMode
            min="0"
            controls={false}
            placeholder="填写本次实收"
          />
        </Form.Item>
        <Form.Item
          name={[field.name, 'declared_quantity']}
          label={`送货标示数量（${row.unit}）`}
          dependencies={dependencies}
          rules={rules('declared_quantity')}
        >
          <InputNumber
            aria-label={`第${number}条标示数量`}
            stringMode
            min="0"
            controls={false}
            placeholder="未提供可不填"
          />
        </Form.Item>
        <Form.Item
          name={[field.name, 'warehouse_id']}
          label="入库仓库"
          dependencies={dependencies}
          rules={rules('warehouse_id')}
        >
          <Select
            aria-label={`第${number}条入库仓库`}
            options={row.warehouseOptions || []}
            placeholder="请选择仓库"
          />
        </Form.Item>
        <Form.Item name={[field.name, 'lot_no']} label="批次 / 卷包编号">
          <Input
            maxLength={64}
            aria-label={`第${number}条批次号`}
            placeholder="选填"
          />
        </Form.Item>
      </div>
      <details className="erp-purchase-arrival__record-note">
        <summary>补充说明（选填）</summary>
        <Form.Item name={[field.name, 'note']}>
          <BusinessTextArea
            maxLength={255}
            aria-label={`第${number}条说明`}
            placeholder="记录异常情况或数量计算依据"
          />
        </Form.Item>
      </details>
    </div>
  )
}

export default function PurchaseOrderInboundDraftModal({
  open,
  form,
  order,
  rows,
  loading,
  loadError,
  submitting,
  referenceDataReady = false,
  hasRemaining,
  resolveSupplierName,
  onOk,
  onCancel,
  onRetry,
}) {
  const values = Form.useWatch('arrival_items', form) || []
  const [dirty, setDirty] = useState(false)
  const [emptyError, setEmptyError] = useState(false)
  const confirmingRef = useRef(false)
  const initialFocusRef = useRef(false)
  const materialPickerRef = useRef(null)
  const disabled = loading || !!loadError || !referenceDataReady || submitting
  const enteredCount = values.filter(arrivalItemHasInput).length

  useEffect(() => {
    if (open) {
      initialFocusRef.current = false
      setDirty(false)
      setEmptyError(false)
    }
  }, [open])

  useEffect(() => {
    if (!open || disabled || !values.length || initialFocusRef.current) {
      return undefined
    }
    const timer = window.setTimeout(() => {
      if (initialFocusRef.current) return
      initialFocusRef.current = true
      form.scrollToField(['arrival_items', 0, 'quantity'], {
        block: 'nearest',
        focus: true,
      })
    }, 200)
    return () => window.clearTimeout(timer)
  }, [disabled, form, open, values.length])

  const focusQuantity = (index) => {
    window.requestAnimationFrame(() => {
      if (index < 0) {
        materialPickerRef.current?.focus()
      } else {
        form.scrollToField(['arrival_items', index, 'quantity'], {
          block: 'nearest',
          focus: true,
        })
      }
    })
  }
  const markChanged = () => {
    setDirty(true)
    setEmptyError(false)
  }
  const handleCancel = () => {
    if (submitting || confirmingRef.current) return
    if (!dirty) {
      onCancel()
      return
    }
    confirmingRef.current = true
    modal.confirm({
      centered: true,
      title: '放弃本次到货登记？',
      content: '关闭后将清除当前填写的内容。',
      okText: '放弃登记',
      cancelText: '继续填写',
      onOk: () => {
        confirmingRef.current = false
        onCancel()
      },
      onCancel: () => {
        confirmingRef.current = false
      },
    })
  }
  const handleSave = () => {
    if (disabled || !hasRemaining) return
    if (!enteredCount) {
      setEmptyError(true)
      focusQuantity(values.length ? 0 : -1)
      return
    }
    onOk()
  }

  return (
    <BusinessFormModal
      title="登记采购到货"
      open={open}
      size="lineItems"
      className="erp-purchase-arrival"
      okText="保存到货并送检"
      cancelText="关闭"
      confirmLoading={submitting}
      closable={!submitting}
      keyboard={!submitting}
      cancelButtonProps={{ disabled: submitting }}
      okButtonProps={{ disabled: disabled || !hasRemaining }}
      onOk={handleSave}
      onCancel={handleCancel}
      footer={
        <div className="erp-purchase-arrival__footer">
          <span className="erp-purchase-arrival__footer-summary" role="status">
            {enteredCount
              ? `本次填写 ${enteredCount} 条到货记录`
              : '请填写本次实际收到的数量'}
          </span>
          <div className="erp-purchase-arrival__footer-actions">
            <Button disabled={submitting} onClick={handleCancel}>
              关闭
            </Button>
            <Button
              type="primary"
              aria-label="保存到货并送检"
              loading={submitting}
              disabled={disabled || !hasRemaining}
              onClick={handleSave}
            >
              保存到货并送检
            </Button>
          </div>
        </div>
      }
    >
      <div className="erp-purchase-arrival__source">
        <strong>{order?.purchase_order_no || '采购订单'}</strong>
        <span>{resolveSupplierName(order)}</span>
      </div>
      <Form
        name="purchase-arrival"
        form={form}
        layout="vertical"
        disabled={disabled}
        className="erp-business-action-form erp-purchase-arrival__form"
        onValuesChange={markChanged}
        onFocusCapture={() => {
          initialFocusRef.current = true
        }}
      >
        <section
          className="erp-purchase-arrival__receipt"
          aria-label="收货信息"
        >
          <Form.Item
            name="received_at"
            label="收货日期"
            rules={[{ required: true, message: '请选择收货日期' }]}
          >
            <DateInput disabled={disabled} />
          </Form.Item>
          <Form.Item
            name="receipt_no"
            label="入库单号"
            rules={[
              { required: true, whitespace: true, message: '请输入入库单号' },
            ]}
          >
            <Input maxLength={64} />
          </Form.Item>
          <Form.Item name="note" label="到货备注">
            <BusinessTextArea
              maxLength={255}
              placeholder="选填本次送货的补充信息"
            />
          </Form.Item>
        </section>
        <section
          className="erp-purchase-arrival__items"
          aria-label="采购到货清点明细"
        >
          <div className="erp-purchase-arrival__section-head">
            <h3>清点明细</h3>
            <span>按采购单位填写，空白记录不保存</span>
          </div>
          {loadError ? (
            <Alert
              type="error"
              showIcon
              message={loadError}
              action={
                <Button
                  size="small"
                  disabled={loading || submitting}
                  onClick={onRetry}
                >
                  重新加载
                </Button>
              }
            />
          ) : !loading && !hasRemaining ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="当前订单没有可登记的剩余材料"
            />
          ) : (
            <Spin spinning={loading}>
              <Form.List name="arrival_items">
                {(fields, { add, remove }) => {
                  const groups = rows.map((row) => ({
                    row,
                    fields: fields.filter(
                      (field) =>
                        Number(values[field.name]?.purchase_order_item_id) ===
                        Number(row.key)
                    ),
                  }))
                  const missing = groups.filter(
                    (group) => group.row.canGenerate && !group.fields.length
                  )
                  const addRecord = (row, warehouse, index = fields.length) => {
                    add(
                      {
                        purchase_order_item_id: row.key,
                        warehouse_id: warehouse,
                      },
                      index
                    )
                    markChanged()
                    focusQuantity(index)
                  }
                  return (
                    <div className="erp-purchase-arrival__materials">
                      {groups
                        .filter((group) => group.fields.length)
                        .map(({ row, fields: materialFields }) => {
                          const total = sumNumeric20Scale6Values(
                            materialFields.map(
                              (field) => values[field.name]?.quantity
                            )
                          )
                          const lastField =
                            materialFields[materialFields.length - 1]
                          return (
                            <section
                              className="erp-purchase-arrival__material"
                              key={row.key}
                              aria-label={row.material}
                            >
                              <div className="erp-purchase-arrival__material-head">
                                <div className="erp-purchase-arrival__material-name">
                                  <span>采购第 {row.lineNo} 行</span>
                                  <strong>{row.material}</strong>
                                </div>
                                <div className="erp-purchase-arrival__material-quantity">
                                  <span>
                                    可登记{' '}
                                    {formatQuantity(
                                      row.remainingGeneratableQuantity
                                    )}{' '}
                                    {row.unit}
                                  </span>
                                  <strong>
                                    本次实点{' '}
                                    {materialFields.some((field) =>
                                      normalizePositiveNumeric20Scale6(
                                        values[field.name]?.quantity
                                      )
                                    )
                                      ? `${formatNumeric20Scale6Summary(total)} ${row.unit}`
                                      : '待填写'}
                                  </strong>
                                </div>
                              </div>
                              {materialFields.map((field) => (
                                <ArrivalRecord
                                  key={field.key}
                                  field={field}
                                  item={values[field.name] || {}}
                                  row={row}
                                  form={form}
                                  disabled={disabled}
                                  onRemove={() => {
                                    remove(field.name)
                                    markChanged()
                                    focusQuantity(
                                      Math.min(field.name, fields.length - 2)
                                    )
                                  }}
                                />
                              ))}
                              <div className="erp-purchase-arrival__add-record">
                                <Button
                                  type="dashed"
                                  icon={<PlusOutlined />}
                                  disabled={disabled || fields.length >= 200}
                                  onClick={() =>
                                    addRecord(
                                      row,
                                      values[lastField.name]?.warehouse_id,
                                      lastField.name + 1
                                    )
                                  }
                                >
                                  增加一卷 / 包
                                </Button>
                              </div>
                            </section>
                          )
                        })}
                      {!loading && !fields.length && (
                        <Empty
                          image={Empty.PRESENTED_IMAGE_SIMPLE}
                          description="选择本次到货的材料后开始清点"
                        />
                      )}
                      {missing.length > 0 && (
                        <Form.Item label="添加本次到货材料">
                          <Select
                            ref={materialPickerRef}
                            aria-label="补充到货材料"
                            value={undefined}
                            showSearch
                            optionFilterProp="label"
                            placeholder="选择采购材料"
                            disabled={disabled || fields.length >= 200}
                            options={missing.map(({ row }) => ({
                              value: row.key,
                              label: `${row.lineNo} · ${row.material}`,
                            }))}
                            onChange={(key) => {
                              const row = rows.find((item) => item.key === key)
                              addRecord(row, row.defaultWarehouseID)
                            }}
                          />
                        </Form.Item>
                      )}
                    </div>
                  )
                }}
              </Form.List>
            </Spin>
          )}
          {emptyError && (
            <p className="erp-purchase-arrival__error" role="alert">
              请至少填写一条实点数量；未到货的材料可留空。
            </p>
          )}
        </section>
      </Form>
      <p className="erp-purchase-arrival__help">
        数量差异只比较本次送货标示与实点；保存后送检，仓库确认入库后才增加库存。
      </p>
    </BusinessFormModal>
  )
}
