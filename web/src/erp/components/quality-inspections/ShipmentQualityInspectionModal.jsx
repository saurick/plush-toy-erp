import React, { useEffect, useMemo } from 'react'
import { Alert, Descriptions, Form, Input, Modal, Select } from 'antd'

import {
  sourceBusinessActionNo,
  sourceBusinessActionUUID,
} from '../../utils/sourceBusinessAction.mjs'
import { referenceLabel } from '../../utils/referenceSelectOptions.mjs'

function shipmentStatusText(status) {
  const labels = {
    DRAFT: '待出货',
    SHIPPED: '已出货',
    CANCELLED: '已取消',
  }
  return (
    labels[
      String(status || '')
        .trim()
        .toUpperCase()
    ] || '状态待核对'
  )
}

function sourceProductText(source, productOptions, productSKUOptions) {
  const product = referenceLabel(productOptions, source?.productID, '产品')
  const sku = source?.productSkuID
    ? referenceLabel(productSKUOptions, source.productSkuID, '产品规格')
    : '未分规格'
  return `${product} / ${sku}`
}

function sourceOptionLabel(
  source,
  productOptions,
  productSKUOptions,
  warehouseOptions,
  inventoryLotOptions
) {
  const product = sourceProductText(source, productOptions, productSKUOptions)
  const warehouse = referenceLabel(
    warehouseOptions,
    source?.warehouseID,
    '仓库'
  )
  const lot = referenceLabel(inventoryLotOptions, source?.lotID, '成品批次')
  const quantity = source?.quantity || '待核对'
  const unavailable = source?.unavailableReason
    ? `（${source.unavailableReason}）`
    : ''
  return `${product} / ${warehouse} / ${lot} · 数量 ${quantity}${unavailable}`
}

export default function ShipmentQualityInspectionModal({
  open,
  shipment,
  sources = [],
  productOptions = [],
  productSKUOptions = [],
  warehouseOptions = [],
  inventoryLotOptions = [],
  loading = false,
  onCancel,
  onSubmit,
}) {
  const [form] = Form.useForm()
  const normalizedSources = useMemo(
    () => (Array.isArray(sources) ? sources : []),
    [sources]
  )
  const availableSources = useMemo(
    () => normalizedSources.filter((source) => !source?.unavailableReason),
    [normalizedSources]
  )
  const defaultSourceKey =
    availableSources.length === 1 ? availableSources[0].sourceKey : undefined
  const sourceSignature = useMemo(
    () =>
      JSON.stringify(
        normalizedSources.map((source) => [
          source?.sourceKey,
          source?.quantity,
          source?.lineCount,
          source?.unavailableReason,
        ])
      ),
    [normalizedSources]
  )
  const sourceByKey = useMemo(
    () =>
      new Map(normalizedSources.map((source) => [source?.sourceKey, source])),
    [normalizedSources]
  )
  const selectedSourceKey = Form.useWatch('inspection_batch', form)
  const selectedSource = sourceByKey.get(selectedSourceKey) || null
  const sourceOptions = useMemo(
    () =>
      normalizedSources.map((source) => ({
        value: source.sourceKey,
        label: sourceOptionLabel(
          source,
          productOptions,
          productSKUOptions,
          warehouseOptions,
          inventoryLotOptions
        ),
        disabled: Boolean(source.unavailableReason),
      })),
    [
      inventoryLotOptions,
      normalizedSources,
      productOptions,
      productSKUOptions,
      warehouseOptions,
    ]
  )

  useEffect(() => {
    if (!open) return
    form.resetFields()
    form.setFieldsValue({
      inspection_batch: defaultSourceKey,
      inspection_no: sourceBusinessActionNo(
        'QI-FG',
        shipment?.shipment_no || 'SHIPMENT',
        sourceBusinessActionUUID()
      ),
      note: '',
    })
  }, [
    defaultSourceKey,
    form,
    open,
    shipment?.id,
    shipment?.shipment_no,
    sourceSignature,
  ])

  const submit = async () => {
    try {
      const values = await form.validateFields()
      const selected = sourceByKey.get(values.inspection_batch)
      if (!selected || selected.unavailableReason) {
        form.setFields([
          {
            name: 'inspection_batch',
            errors: ['请选择可送检的成品批次'],
          },
        ])
        return
      }
      await onSubmit?.(values, selected)
    } catch (error) {
      if (!error?.errorFields) throw error
    }
  }

  const unavailableMessage =
    normalizedSources.length === 0
      ? '当前出货单没有可送检批次，请先核对出货明细'
      : availableSources.length === 0
        ? '当前出货单暂时没有可发起检验的批次，请核对不可选原因'
        : ''

  return (
    <Modal
      className="erp-shipment-quality-inspection-modal"
      title="发起出货前成品检验"
      open={open}
      width={720}
      okText="生成检验草稿"
      cancelText="取消"
      confirmLoading={loading}
      closable={!loading}
      destroyOnHidden
      forceRender
      keyboard={!loading}
      maskClosable={!loading}
      okButtonProps={{ disabled: availableSources.length === 0 }}
      onCancel={() => {
        if (!loading) onCancel?.()
      }}
      onOk={submit}
    >
      <Alert
        type="info"
        showIcon
        message="这里只生成出货前成品检验草稿，不启动任务流程，也不代表已经出货；产品、规格、仓库和批次由出货单确定。"
      />
      {unavailableMessage ? (
        <Alert
          type="warning"
          showIcon
          message={unavailableMessage}
          style={{ marginTop: 12 }}
        />
      ) : null}
      <Descriptions
        size="small"
        column={{ xs: 1, sm: 2 }}
        style={{ marginTop: 16, marginBottom: 8 }}
        items={[
          {
            key: 'shipment',
            label: '出货单',
            children: shipment?.shipment_no || '出货单已关联',
          },
          {
            key: 'shipment_status',
            label: '当前状态',
            children: shipmentStatusText(shipment?.status),
          },
          ...(selectedSource
            ? [
                {
                  key: 'product',
                  label: '送检产品',
                  children: sourceProductText(
                    selectedSource,
                    productOptions,
                    productSKUOptions
                  ),
                },
                {
                  key: 'warehouse',
                  label: '仓库',
                  children: referenceLabel(
                    warehouseOptions,
                    selectedSource.warehouseID,
                    '仓库'
                  ),
                },
                {
                  key: 'lot',
                  label: '成品批次',
                  children: referenceLabel(
                    inventoryLotOptions,
                    selectedSource.lotID,
                    '成品批次'
                  ),
                },
                {
                  key: 'quantity',
                  label: '出货数量合计',
                  children:
                    selectedSource.lineCount > 1
                      ? `${selectedSource.quantity}（合并 ${selectedSource.lineCount} 条相同批次明细）`
                      : selectedSource.quantity,
                },
              ]
            : []),
        ]}
      />
      <Form form={form} layout="vertical" preserve={false} disabled={loading}>
        <Form.Item
          name="inspection_batch"
          label="送检批次"
          rules={[{ required: true, message: '请选择送检批次' }]}
        >
          <Select
            showSearch
            optionFilterProp="label"
            options={sourceOptions}
            placeholder="请选择本次送检的成品批次"
          />
        </Form.Item>
        <Form.Item
          name="inspection_no"
          label="检验单号（自动）"
          rules={[
            { required: true, whitespace: true, message: '请填写检验单号' },
          ]}
        >
          <Input maxLength={64} autoComplete="off" readOnly />
        </Form.Item>
        <Form.Item name="note" label="送检备注">
          <Input.TextArea
            aria-label="送检备注"
            rows={3}
            maxLength={255}
            showCount
          />
        </Form.Item>
      </Form>
    </Modal>
  )
}
