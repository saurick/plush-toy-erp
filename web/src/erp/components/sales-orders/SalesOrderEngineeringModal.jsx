import React, { useEffect, useState } from 'react'
import { Button, Checkbox, Form, Input, Select, Space, Spin, Tag } from 'antd'
import { useNavigate } from 'react-router-dom'
import ProductIdentity, {
  renderProductOption,
} from '../master-data/ProductIdentity.jsx'

import BusinessFormModal from '../business-list/BusinessFormModal.jsx'
import {
  getSalesOrder,
  listAllProducts,
  listAllProductSKUs,
  listAllSalesOrderItems,
  saveSalesOrderEngineering,
} from '../../api/masterDataOrderApi.mjs'
import { listAllBOMVersions } from '../../api/bomApi.mjs'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { message } from '@/common/utils/antdApp'
import {
  SALES_ORDER_ENGINEERING_OPTIONS,
  salesOrderRequirementName,
} from '../../utils/salesOrderRequirements.mjs'

export default function SalesOrderEngineeringModal({
  orderID,
  onCancel,
  onSaved,
}) {
  const [form] = Form.useForm()
  const navigate = useNavigate()
  const [context, setContext] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  useEffect(() => {
    if (!orderID) return undefined
    const controller = new AbortController()
    setLoading(true)
    setContext(null)
    setLoadError('')
    const options = { signal: controller.signal }
    Promise.all([
      getSalesOrder({ id: orderID }, options).then(async (order) => ({
        order,
        detail: await listAllSalesOrderItems(
          { sales_order_id: orderID, expected_version: order.version },
          options
        ),
      })),
      listAllProducts({ active_only: true }, options),
      listAllProductSKUs({ active_only: true }, options),
      listAllBOMVersions({}, options),
    ])
      .then(([{ order, detail }, products, skus, boms]) => {
        if (controller.signal.aborted) return
        const items = detail.sales_order_items.filter(
          (item) => item.line_status === 'open'
        )
        setContext({
          order,
          items,
          products: products.products,
          skus: skus.product_skus,
          boms: boms.bom_versions,
        })
        form.setFieldsValue({
          items: items.map((item) => ({
            id: item.id,
            product_id: item.product_id || undefined,
            product_sku_id: item.product_sku_id || undefined,
            sample_bom_id: item.sample_bom_id || undefined,
            engineering_status: item.engineering_status || 'PREPARING',
            sample_note: item.sample_note || '',
            reuse_confirmed_sample: false,
          })),
        })
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setLoadError(getActionErrorMessage(error, '加载订单工程资料'))
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [orderID, reloadKey, form])

  const save = async () => {
    if (!context || saving || loading) return
    let values
    try {
      values = await form.validateFields()
    } catch {
      return
    }
    setSaving(true)
    try {
      await saveSalesOrderEngineering({
        id: context.order.id,
        expected_version: context.order.version,
        items: values.items.map((item) => ({
          ...item,
          product_id: item.product_id || null,
          product_sku_id: item.product_sku_id || null,
          sample_bom_id: item.sample_bom_id || null,
          expected_bom_version:
            context.boms.find((bom) => bom.id === item.sample_bom_id)
              ?.edit_version || null,
        })),
      })
      message.success('工程与打样进度已保存')
      onSaved()
    } catch (error) {
      message.error(getActionErrorMessage(error, '保存工程与打样进度'))
    } finally {
      setSaving(false)
    }
  }

  const openReference = (path) => {
    onCancel()
    navigate(path)
  }
  return (
    <BusinessFormModal
      title={`工程与打样${context?.order?.order_no ? ` · ${context.order.order_no}` : ''}`}
      description="先关联工程产品和 BOM，产品主图及物料齐备后开始打样，确认样品时填写结果。"
      open={Boolean(orderID)}
      onOk={save}
      onCancel={() => {
        if (!saving) onCancel()
      }}
      confirmLoading={saving}
      okButtonProps={{
        disabled:
          loading ||
          !context ||
          !['draft', 'submitted', 'active'].includes(
            context.order.lifecycle_status
          ),
      }}
    >
      <Space wrap>
        <Button
          disabled={saving}
          onClick={() => openReference('/erp/master/products')}
        >
          产品档案与图片
        </Button>
        <Button
          disabled={saving}
          onClick={() => openReference('/erp/purchase/material-bom')}
        >
          BOM 版本
        </Button>
        <Button
          disabled={loading || saving}
          onClick={() => setReloadKey((value) => value + 1)}
        >
          重新读取
        </Button>
      </Space>
      {loadError ? <p role="alert">{loadError}</p> : null}
      <Spin spinning={loading}>
        <Form
          form={form}
          disabled={saving}
          layout="vertical"
          onValuesChange={(changed) => {
            for (const [index, item] of Object.entries(changed.items || {})) {
              if (
                item &&
                [
                  'product_id',
                  'product_sku_id',
                  'sample_bom_id',
                  'engineering_status',
                ].some((key) => Object.hasOwn(item, key))
              ) {
                form.setFieldValue(
                  ['items', Number(index), 'reuse_confirmed_sample'],
                  false
                )
              }
            }
          }}
          className="erp-sales-order-engineering-form"
        >
          <Form.List name="items">
            {(fields) =>
              fields.map((field) => {
                const source = context?.items[field.name]
                return (
                  <section
                    className="erp-sales-order-engineering-section"
                    key={field.key}
                  >
                    <strong>
                      {source ? salesOrderRequirementName(source) : ''}
                    </strong>
                    {source?.customer_product_no ? (
                      <Tag>{source.customer_product_no}</Tag>
                    ) : null}
                    <div className="erp-business-action-form">
                      {source?.order_category === 'REPEAT' ? (
                        <Form.Item
                          name={[field.name, 'reuse_confirmed_sample']}
                          valuePropName="checked"
                        >
                          <Checkbox
                            onChange={(event) => {
                              if (event.target.checked) {
                                form.setFieldValue(
                                  ['items', field.name, 'engineering_status'],
                                  'CONFIRMED'
                                )
                              }
                            }}
                          >
                            本次返单沿用该客户已确认的同款样品（资料须完全一致）
                          </Checkbox>
                        </Form.Item>
                      ) : null}
                      <Form.Item name={[field.name, 'id']} hidden>
                        <Input />
                      </Form.Item>
                      <Form.Item
                        label="工程产品"
                        name={[field.name, 'product_id']}
                      >
                        <Select
                          allowClear
                          showSearch
                          optionFilterProp="label"
                          placeholder="选择工程建立的产品"
                          listItemHeight={48}
                          optionRender={renderProductOption}
                          options={(context?.products || []).map((p) => ({
                            value: p.id,
                            label: `${p.code} / ${p.name}`,
                          }))}
                          onChange={() => {
                            form.setFieldValue(
                              ['items', field.name, 'product_sku_id'],
                              undefined
                            )
                            form.setFieldValue(
                              ['items', field.name, 'sample_bom_id'],
                              undefined
                            )
                            form.setFieldValue(
                              ['items', field.name, 'engineering_status'],
                              'PREPARING'
                            )
                          }}
                        />
                      </Form.Item>
                      <Form.Item noStyle shouldUpdate>
                        {({ getFieldValue }) => {
                          const productID = getFieldValue([
                            'items',
                            field.name,
                            'product_id',
                          ])
                          const product = context?.products?.find(
                            (item) => item.id === productID
                          )
                          return productID ? (
                            <ProductIdentity
                              productId={productID}
                              name={product?.name}
                              code={product?.code}
                            />
                          ) : null
                        }}
                      </Form.Item>
                      <Form.Item noStyle shouldUpdate>
                        {({ getFieldValue }) => {
                          const productID = getFieldValue([
                            'items',
                            field.name,
                            'product_id',
                          ])
                          const bomID = getFieldValue([
                            'items',
                            field.name,
                            'sample_bom_id',
                          ])
                          const bom = context?.boms.find(
                            (item) => item.id === bomID
                          )
                          return (
                            <>
                              <Form.Item
                                label="规格（选填）"
                                name={[field.name, 'product_sku_id']}
                              >
                                <Select
                                  allowClear
                                  disabled={!productID}
                                  options={(context?.skus || [])
                                    .filter(
                                      (sku) => sku.product_id === productID
                                    )
                                    .map((sku) => ({
                                      value: sku.id,
                                      label: [sku.sku_code, sku.sku_name]
                                        .filter(Boolean)
                                        .join(' / '),
                                    }))}
                                  onChange={() =>
                                    form.setFieldValue(
                                      [
                                        'items',
                                        field.name,
                                        'engineering_status',
                                      ],
                                      'PREPARING'
                                    )
                                  }
                                />
                              </Form.Item>
                              <Form.Item
                                label="打样 BOM"
                                name={[field.name, 'sample_bom_id']}
                              >
                                <Select
                                  allowClear
                                  disabled={!productID}
                                  placeholder="选择该产品的 BOM"
                                  options={(context?.boms || [])
                                    .filter(
                                      (item) =>
                                        item.product_id === productID &&
                                        item.status !== 'ARCHIVED'
                                    )
                                    .map((item) => ({
                                      value: item.id,
                                      label: `${item.version}${item.status === 'DRAFT' ? '（草稿）' : ''}`,
                                    }))}
                                  onChange={() =>
                                    form.setFieldValue(
                                      [
                                        'items',
                                        field.name,
                                        'engineering_status',
                                      ],
                                      'PREPARING'
                                    )
                                  }
                                />
                              </Form.Item>
                              <Form.Item label="设计师">
                                <Input
                                  value={bom?.designer || ''}
                                  readOnly
                                  placeholder="由 BOM 工程资料带出"
                                />
                              </Form.Item>
                            </>
                          )
                        }}
                      </Form.Item>
                      <Form.Item
                        label="工程 / 打样进度"
                        name={[field.name, 'engineering_status']}
                        rules={[{ required: true }]}
                      >
                        <Select options={SALES_ORDER_ENGINEERING_OPTIONS} />
                      </Form.Item>
                      <Form.Item
                        label="打样说明"
                        name={[field.name, 'sample_note']}
                      >
                        <Input.TextArea
                          maxLength={255}
                          rows={2}
                          placeholder="确认结果或退回重做原因"
                        />
                      </Form.Item>
                    </div>
                  </section>
                )
              })
            }
          </Form.List>
        </Form>
      </Spin>
    </BusinessFormModal>
  )
}
