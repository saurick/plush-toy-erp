import React, { useEffect, useState } from 'react'
import { Button, Form, Select } from 'antd'
import { listAllMaterialWarehouses } from '../../api/masterDataOrderApi.mjs'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import {
  MATERIAL_STOCK_CATEGORY_OPTIONS,
  materialWarehouseOptions,
  warehouseTypeLabel,
} from '../../utils/warehouseClassification.mjs'

export default function MaterialStockFields({ form }) {
  const category = Form.useWatch('stock_category', form)
  const [warehouses, setWarehouses] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')
    listAllMaterialWarehouses({}, { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setWarehouses(result.warehouses)
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setError(getActionErrorMessage(err, '加载入库仓库'))
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [retry])
  const options = materialWarehouseOptions(warehouses, {
    stock_category: category,
  }).map((item) => ({
    value: item.id,
    label: `${item.name}（${warehouseTypeLabel(item.type)}）`,
  }))
  return (
    <>
      <Form.Item
        className="erp-business-action-form__field"
        name="stock_category"
        label="库存类别"
        rules={[
          {
            required: true,
            type: 'enum',
            enum: MATERIAL_STOCK_CATEGORY_OPTIONS.map((item) => item.value),
            message: '请选择主料、辅料、包材或其他材料',
          },
        ]}
      >
        <Select
          options={
            category === 'UNCLASSIFIED'
              ? [
                  ...MATERIAL_STOCK_CATEGORY_OPTIONS,
                  { value: 'UNCLASSIFIED', label: '待分类', disabled: true },
                ]
              : MATERIAL_STOCK_CATEGORY_OPTIONS
          }
          placeholder="选择库存类别"
          onChange={() => {
            if (form.getFieldValue('default_warehouse_id') != null) {
              form.setFieldsValue({ default_warehouse_id: undefined })
            }
          }}
        />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        name="default_warehouse_id"
        label="默认入库仓"
        extra={
          error ? (
            <span role="alert">
              {error}
              <Button
                size="small"
                onClick={() => setRetry((value) => value + 1)}
              >
                重试
              </Button>
            </span>
          ) : (
            '选填；收货时自动带出，仓库可按实际情况调整'
          )
        }
      >
        <Select
          showSearch
          optionFilterProp="label"
          allowClear
          loading={loading}
          disabled={!category || category === 'UNCLASSIFIED'}
          options={options}
          placeholder="选择常用入库仓"
        />
      </Form.Item>
    </>
  )
}
