import React, { useMemo } from 'react'
import { Button, Col, Form, Input, Row, Space, Typography } from 'antd'
import {
  DeleteOutlined,
  PlusOutlined,
  ScheduleOutlined,
} from '@ant-design/icons'
import BusinessFormModal from '../business-list/BusinessFormModal.jsx'
import { DateInput } from '../business-list/BusinessListLayout.jsx'
import ProductionOrderReferenceSelect from './ProductionOrderReferenceSelect.jsx'

const { Text } = Typography

function RowReference({ field, form, optionsByType, readOnly }) {
  const index = field.name
  const productID = Form.useWatch(['items', index, 'product_id'], form)
  const skuID = Form.useWatch(['items', index, 'product_sku_id'], form)
  const unitID = Form.useWatch(['items', index, 'unit_id'], form)

  const setRow = (patch) => {
    const items = [...(form.getFieldValue('items') || [])]
    items[index] = { ...(items[index] || {}), ...patch }
    form.setFieldValue('items', items)
  }

  return (
    <Row gutter={[12, 8]}>
      <Col xs={24} md={12}>
        <Form.Item
          name={[field.name, 'sales_order_item_id']}
          label="销售订单行（可选）"
        >
          <ProductionOrderReferenceSelect
            referenceType="sales_order_item"
            disabled={readOnly}
            initialOptions={optionsByType.sales_order_item}
            filters={{
              ...(productID ? { product_id: productID } : {}),
              ...(skuID ? { product_sku_id: skuID } : {}),
              ...(unitID ? { unit_id: unitID } : {}),
            }}
            placeholder="可先搜索销售单号或行号"
            onChange={(value, option) => {
              if (!value) {
                setRow({ sales_order_item_id: null })
                return
              }
              setRow({
                sales_order_item_id: value,
                product_id: option?.product_value || null,
                product_sku_id: option?.sku_value || null,
                unit_id: option?.unit_value || null,
                bom_header_id: null,
              })
            }}
          />
        </Form.Item>
      </Col>
      <Col xs={24} md={12}>
        <Form.Item
          name={[field.name, 'product_id']}
          label="产品"
          rules={[{ required: true, message: '请选择产品' }]}
        >
          <ProductionOrderReferenceSelect
            referenceType="product"
            disabled={readOnly}
            initialOptions={optionsByType.product}
            placeholder="搜索产品编号或名称"
            onChange={(value, option) => {
              setRow({
                product_id: value || null,
                product_sku_id: null,
                unit_id: option?.unit_value || null,
                sales_order_item_id: null,
                bom_header_id: null,
              })
            }}
          />
        </Form.Item>
      </Col>
      <Col xs={24} md={8}>
        <Form.Item name={[field.name, 'product_sku_id']} label="规格（可选）">
          <ProductionOrderReferenceSelect
            referenceType="product_sku"
            disabled={readOnly || !productID}
            initialOptions={optionsByType.product_sku}
            filters={productID ? { product_id: productID } : {}}
            placeholder={productID ? '搜索规格' : '请先选择产品'}
            onChange={(value, option) => {
              setRow({
                product_sku_id: value || null,
                unit_id: option?.unit_value || unitID || null,
                sales_order_item_id: null,
                bom_header_id: null,
              })
            }}
          />
        </Form.Item>
      </Col>
      <Col xs={24} md={8}>
        <Form.Item
          name={[field.name, 'unit_id']}
          label="单位"
          rules={[{ required: true, message: '请选择单位' }]}
        >
          <ProductionOrderReferenceSelect
            referenceType="unit"
            disabled={readOnly}
            initialOptions={optionsByType.unit}
            placeholder="搜索单位"
            onChange={(value) =>
              setRow({
                unit_id: value || null,
                sales_order_item_id: null,
              })
            }
          />
        </Form.Item>
      </Col>
      <Col xs={24} md={8}>
        <Form.Item
          name={[field.name, 'bom_header_id']}
          label="BOM 版本（可选）"
        >
          <ProductionOrderReferenceSelect
            referenceType="active_bom"
            disabled={readOnly || !productID}
            initialOptions={optionsByType.active_bom}
            filters={productID ? { product_id: productID } : {}}
            placeholder={productID ? '搜索当前生效 BOM' : '请先选择产品'}
          />
        </Form.Item>
      </Col>
      <Col xs={24} md={8}>
        <Form.Item
          name={[field.name, 'planned_quantity']}
          label="计划数量"
          rules={[
            { required: true, message: '请输入计划数量' },
            {
              pattern: /^(?:0\.(?:0*[1-9]\d*)|[1-9]\d*(?:\.\d+)?)$/u,
              message: '计划数量必须大于 0',
            },
          ]}
        >
          <Input disabled={readOnly} inputMode="decimal" maxLength={40} />
        </Form.Item>
      </Col>
      <Col xs={24} md={16}>
        <Form.Item name={[field.name, 'note']} label="明细备注">
          <Input disabled={readOnly} maxLength={255} />
        </Form.Item>
      </Col>
      <Form.Item name={[field.name, 'line_no']} hidden>
        <Input />
      </Form.Item>
    </Row>
  )
}

export default function ProductionOrderFormModal({
  form,
  open,
  mode,
  loading,
  optionsByType,
  onCancel,
  onSubmit,
}) {
  const readOnly = mode === 'view'
  const title =
    mode === 'create'
      ? '新建生产订单'
      : readOnly
        ? '查看生产订单'
        : '编辑生产订单'
  const footer = readOnly ? (
    <Button key="close" onClick={onCancel}>
      关闭
    </Button>
  ) : undefined

  const normalizedOptions = useMemo(
    () => ({
      product: [],
      product_sku: [],
      unit: [],
      sales_order_item: [],
      active_bom: [],
      ...optionsByType,
    }),
    [optionsByType]
  )

  return (
    <BusinessFormModal
      open={open}
      title={title}
      description="生产计划源单只维护计划，不在这里登记完工、领料或库存事实。"
      icon={<ScheduleOutlined />}
      size="masterDataItems"
      confirmLoading={loading}
      footer={footer}
      okText={mode === 'create' ? '创建草稿' : '保存草稿'}
      cancelText="取消"
      onCancel={onCancel}
      onOk={readOnly ? undefined : () => form.submit()}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" onFinish={onSubmit}>
        <Row gutter={16}>
          <Col xs={24} md={8}>
            <Form.Item
              name="order_no"
              label="生产单号"
              rules={[
                { required: true, whitespace: true, message: '请输入生产单号' },
              ]}
            >
              <Input disabled={readOnly} maxLength={64} />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item name="planned_start_at" label="计划开始">
              <DateInput disabled={readOnly} />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item name="planned_end_at" label="计划结束">
              <DateInput disabled={readOnly} />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item name="note" label="备注">
              <Input.TextArea
                disabled={readOnly}
                maxLength={255}
                rows={2}
                showCount={!readOnly}
              />
            </Form.Item>
          </Col>
        </Row>
        <Form.List name="items">
          {(fields, { add, remove }) => (
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              {fields.map((field, index) => (
                <section key={field.key} className="erp-production-order-line">
                  <Space
                    style={{ width: '100%', justifyContent: 'space-between' }}
                  >
                    <Text strong>明细 {index + 1}</Text>
                    {!readOnly && fields.length > 1 ? (
                      <Button
                        danger
                        type="text"
                        icon={<DeleteOutlined />}
                        onClick={() => remove(field.name)}
                      >
                        移除明细
                      </Button>
                    ) : null}
                  </Space>
                  <RowReference
                    field={field}
                    form={form}
                    optionsByType={normalizedOptions}
                    readOnly={readOnly}
                  />
                </section>
              ))}
              {!readOnly ? (
                <Button
                  type="dashed"
                  block
                  icon={<PlusOutlined />}
                  onClick={() =>
                    add({ line_no: fields.length + 1, planned_quantity: '1' })
                  }
                >
                  添加明细
                </Button>
              ) : null}
            </Space>
          )}
        </Form.List>
      </Form>
    </BusinessFormModal>
  )
}
