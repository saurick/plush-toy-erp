import React, { useMemo } from 'react'
import {
  Alert,
  Button,
  Col,
  Form,
  Input,
  Row,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd'
import {
  DeleteOutlined,
  PlusOutlined,
  ScheduleOutlined,
} from '@ant-design/icons'
import BusinessFormModal from '../business-list/BusinessFormModal.jsx'
import { DateInput } from '../business-list/BusinessListLayout.jsx'
import ProductionOrderReferenceSelect from './ProductionOrderReferenceSelect.jsx'
import { isProductionMaterialIssueEligible } from '../../utils/productionMaterialIssueAction.mjs'
import {
  PRODUCTION_MATERIAL_REQUIREMENTS_STATE,
  PRODUCTION_ORDER_STATUS,
} from '../../utils/productionOrderModel.mjs'

const { Text } = Typography

function materialRequirementLabel(requirement = {}) {
  return (
    [requirement.material_code_snapshot, requirement.material_name_snapshot]
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .join(' / ') || '物料已关联'
  )
}

function materialUnitLabel(requirement = {}) {
  return (
    [requirement.unit_name_snapshot, requirement.unit_code_snapshot]
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .join(' / ') || '单位已关联'
  )
}

function ProductionMaterialRequirementsPanel({
  order,
  state,
  requirements = [],
  canCreateMaterialIssue = false,
  loading = false,
  onCreateMaterialIssue,
}) {
  if (order?.status !== PRODUCTION_ORDER_STATUS.RELEASED) return null

  const alert =
    state === PRODUCTION_MATERIAL_REQUIREMENTS_STATE.READY
      ? {
          type: 'success',
          message: '物料需求已按发布时的 BOM 冻结，可从需求行登记领料。',
        }
      : state === PRODUCTION_MATERIAL_REQUIREMENTS_STATE.NOT_REQUIRED
        ? {
            type: 'info',
            message: '该生产订单未关联 BOM，本单没有冻结的物料需求。',
          }
        : {
            type: 'warning',
            message: '物料需求需要复核，暂不能领料。',
            description:
              '请由计划人员核对订单明细的 BOM 版本与发布记录，确认需求完整后再办理领料。',
          }

  const columns = [
    {
      title: '需求物料',
      key: 'material',
      width: 220,
      render: (_, requirement) => materialRequirementLabel(requirement),
    },
    {
      title: '单位',
      key: 'unit',
      width: 120,
      render: (_, requirement) => materialUnitLabel(requirement),
    },
    {
      title: '计划需求',
      dataIndex: 'planned_quantity',
      width: 120,
    },
    {
      title: '已过账领料',
      dataIndex: 'issued_quantity',
      width: 120,
    },
    {
      title: '剩余可领',
      dataIndex: 'remaining_quantity',
      width: 120,
      render: (value) => (
        <Tag color={Number(value || 0) > 0 ? 'blue' : 'default'}>
          {value || '0'}
        </Tag>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      fixed: 'right',
      render: (_, requirement) => {
        if (!isProductionMaterialIssueEligible(order, state, requirement)) {
          return state === PRODUCTION_MATERIAL_REQUIREMENTS_STATE.NEEDS_REVIEW
            ? '待复核'
            : '已领完'
        }
        if (!canCreateMaterialIssue) return '仅查看'
        return (
          <Button
            size="small"
            type="primary"
            loading={loading}
            onClick={() => onCreateMaterialIssue?.(requirement)}
          >
            领料
          </Button>
        )
      },
    },
  ]

  return (
    <section style={{ marginTop: 20 }}>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Text strong>物料需求与领料</Text>
        <Alert showIcon {...alert} />
        {requirements.length > 0 ? (
          <Table
            rowKey="id"
            size="small"
            pagination={false}
            columns={columns}
            dataSource={requirements}
            scroll={{ x: 800 }}
          />
        ) : null}
      </Space>
    </section>
  )
}

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
  order,
  materialRequirementsState,
  materialRequirements,
  canCreateMaterialIssue,
  materialIssueLoading,
  onCreateMaterialIssue,
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
      description="生产订单字段只维护计划；发布后可从冻结的物料需求办理领料，领料草稿仍需在生产记录中核对过账。"
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
        {readOnly ? (
          <ProductionMaterialRequirementsPanel
            order={order}
            state={materialRequirementsState}
            requirements={materialRequirements}
            canCreateMaterialIssue={canCreateMaterialIssue}
            loading={materialIssueLoading}
            onCreateMaterialIssue={onCreateMaterialIssue}
          />
        ) : null}
      </Form>
    </BusinessFormModal>
  )
}
