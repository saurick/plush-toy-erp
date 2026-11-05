import React, { useMemo } from 'react'
import { Alert, Button, Form, Input, Space, Switch, Tag } from 'antd'
import { DeleteOutlined } from '@ant-design/icons'
import { BusinessHelpLabel } from '../help/BusinessContextHelp.jsx'
import { BusinessTextPolicy } from '../../../common/consts/policies.generated.mjs'
import Select from '@/common/components/select/AppSelect'
import { unitQuantityRuleFromOptions } from '../../utils/unitQuantity.mjs'
import useQuantityUnits from '../../hooks/useQuantityUnits.mjs'
import Table from '@/common/components/table/AppTable'
import BusinessTextArea from '../business-list/BusinessTextArea.jsx'
import BusinessCopyButton from '../business-list/BusinessCopyButton.jsx'
import BusinessGroupedLineItems from '../business-list/BusinessGroupedLineItems.jsx'
import BusinessCompactFieldTable, {
  BusinessCompactFieldRow,
} from '../business-list/BusinessCompactFieldTable.jsx'
import { ProductThumbnail } from '../master-data/ProductIdentity.jsx'
import BusinessFormSection from '../business-list/BusinessFormSection.jsx'
import BusinessFormPage from '../business-list/BusinessFormPage.jsx'
import BusinessLineItemsFooter from '../business-list/BusinessLineItemsFooter.jsx'
import { useLineItemAppendScroll } from '../business-list/useLineItemAppendScroll.mjs'
import { DateInput } from '../business-list/BusinessDateInputs.jsx'
import ProductionOrderReferenceSelect from './ProductionOrderReferenceSelect.jsx'
import { isProductionMaterialIssueEligible } from '../../utils/productionMaterialIssueAction.mjs'
import {
  PRODUCTION_MATERIAL_REQUIREMENTS_STATE,
  PRODUCTION_ORDER_STATUS,
} from '../../utils/productionOrderModel.mjs'
import { PRODUCTION_WIP_ROUTE_CODE } from '../../utils/productionWipModel.mjs'
import BusinessForm from '../business-list/BusinessForm.jsx'

function materialRequirementLabel(requirement = {}) {
  return (
    [requirement.material_code_snapshot, requirement.material_name_snapshot]
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .join(' ') || '物料已关联'
  )
}

function materialUnitLabel(requirement = {}) {
  return requirement.unit_name_snapshot || '单位已关联'
}

function ProductionMaterialRequirementsPanel({
  order,
  state,
  requirements = [],
  canCreateMaterialIssue = false,
  canRequestOverIssue = false,
  loading = false,
  onCreateMaterialIssue,
  onRequestOverIssue,
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
      align: 'left',
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
      align: 'right',
      title: '计划需求',
      dataIndex: 'planned_quantity',
      width: 120,
    },
    {
      align: 'right',
      title: '已批准超领',
      dataIndex: 'approved_over_issue_quantity',
      width: 120,
    },
    {
      align: 'right',
      title: '当前可领上限',
      dataIndex: 'effective_limit_quantity',
      width: 120,
    },
    {
      align: 'right',
      title: '已过账领料',
      dataIndex: 'issued_quantity',
      width: 120,
    },
    {
      align: 'right',
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
      align: 'center',
      title: '操作',
      key: 'action',
      width: 190,
      fixed: 'right',
      render: (_, requirement) => {
        const canIssue = isProductionMaterialIssueEligible(
          order,
          state,
          requirement
        )
        return (
          <Space size={6}>
            {canIssue && canCreateMaterialIssue ? (
              <Button
                size="small"
                type="primary"
                loading={loading}
                onClick={() => onCreateMaterialIssue?.(requirement)}
              >
                领料
              </Button>
            ) : null}
            {canRequestOverIssue &&
            state === PRODUCTION_MATERIAL_REQUIREMENTS_STATE.READY ? (
              <Button
                size="small"
                disabled={loading}
                onClick={() => onRequestOverIssue?.(requirement)}
              >
                申请超领
              </Button>
            ) : null}
            {!canIssue && !canRequestOverIssue
              ? state === PRODUCTION_MATERIAL_REQUIREMENTS_STATE.NEEDS_REVIEW
                ? '待复核'
                : '已领完'
              : null}
            {canIssue && !canCreateMaterialIssue && !canRequestOverIssue
              ? '仅查看'
              : null}
          </Space>
        )
      },
    },
  ]

  return (
    <BusinessFormSection title="物料需求与领料" layout="content">
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        {alert.type === 'warning' ? (
          <Alert showIcon {...alert} />
        ) : (
          <div className="erp-business-inline-note" role="status">{alert.message}</div>
        )}
        {requirements.length > 0 ? (
          <Table
            rowKey="id"
            size="small"
            pagination={false}
            columns={columns}
            dataSource={requirements}
            scroll={{ x: 1150 }}
          />
        ) : null}
      </Space>
    </BusinessFormSection>
  )
}

function RowReference({
  field,
  form,
  optionsByType,
  readOnly,
  productionOrderID,
  referenceAccess,
  quantityUnitOptions,
  rowRef,
  sequence,
  onRemove,
}) {
  const index = field.name
  const watchedRow = Form.useWatch('items', form)?.[index] || {}
  const productID = watchedRow.product_id
  const skuID = watchedRow.product_sku_id
  const unitID = watchedRow.unit_id
  const routeCode = watchedRow.route_code

  const setRow = (patch) => {
    const items = [...(form.getFieldValue('items') || [])]
    items[index] = { ...(items[index] || {}), ...patch }
    form.setFieldValue('items', items)
  }

  return (
    <BusinessCompactFieldRow
      className="erp-production-order-line"
      rowRef={rowRef}
      label={`生产明细 ${index + 1}`}
      sequence={sequence}
      cells={[
        <Form.Item
          name={[field.name, 'sales_order_item_id']}
          label="销售订单行（可选）"
        >
          <ProductionOrderReferenceSelect
            referenceType="sales_order_item"
            disabled={readOnly || referenceAccess.sales_order_item !== true}
            initialOptions={optionsByType.sales_order_item}
            filters={{
              ...(productionOrderID
                ? { production_order_id: productionOrderID }
                : {}),
              ...(productID ? { product_id: productID } : {}),
              ...(skuID ? { product_sku_id: skuID } : {}),
              ...(unitID ? { unit_id: unitID } : {}),
            }}
            placeholder="销售单号或行号"
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
        </Form.Item>,
        <div className="erp-product-field-control">
          {productID ? (
            <ProductThumbnail
              productId={productID}
              name={
                optionsByType.product.find(
                  (option) => Number(option.value) === Number(productID)
                )?.label || '当前产品'
              }
            />
          ) : null}
          <Form.Item
            name={[field.name, 'product_id']}
            label="产品"
            rules={[{ required: true, message: '请选择产品' }]}
          >
            <ProductionOrderReferenceSelect
              referenceType="product"
              disabled={readOnly || referenceAccess.product !== true}
              initialOptions={optionsByType.product}
              placeholder="选择产品"
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
        </div>,
        <Form.Item name={[field.name, 'product_sku_id']} label="规格（可选）">
          <ProductionOrderReferenceSelect
            referenceType="product_sku"
            disabled={
              readOnly || referenceAccess.product_sku !== true || !productID
            }
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
        </Form.Item>,
        <div className="erp-line-editor__quantity">
          <Form.Item
            name={[field.name, 'planned_quantity']}
            dependencies={[['items', field.name, 'unit_id']]}
            label="计划数量"
            rules={[
            unitQuantityRuleFromOptions(quantityUnitOptions, unitID),
            { required: true, message: '请输入计划数量' },
            {
              pattern: /^(?:0\.(?:0*[1-9]\d*)|[1-9]\d*(?:\.\d+)?)$/u,
              message: '计划数量必须大于 0',
            },
          ]}
          >
            <Input disabled={readOnly} inputMode="decimal" maxLength={40} />
          </Form.Item>
          <Form.Item
            name={[field.name, 'unit_id']}
            label="单位"
            rules={[{ required: true, message: '请选择单位' }]}
          >
            <ProductionOrderReferenceSelect
              referenceType="unit"
              disabled={readOnly || referenceAccess.unit !== true}
              initialOptions={optionsByType.unit}
              placeholder="单位"
              onChange={(value) =>
              setRow({
                unit_id: value || null,
                sales_order_item_id: null,
              })
            }
            />
          </Form.Item>
        </div>,
        <Form.Item
          name={[field.name, 'bom_header_id']}
          label="BOM 版本（可选）"
        >
          <ProductionOrderReferenceSelect
            referenceType="active_bom"
            disabled={
              readOnly || referenceAccess.active_bom !== true || !productID
            }
            initialOptions={optionsByType.active_bom}
            filters={productID ? { product_id: productID } : {}}
            placeholder={productID ? '选择生效 BOM' : '请先选择产品'}
          />
        </Form.Item>
]}
      actions={
        onRemove ? (
          <Button
            type="text"
            danger
            icon={<DeleteOutlined />}
            aria-label={`移除明细 ${index + 1}`}
            onClick={onRemove}
          >
            移除行
          </Button>
        ) : null
      }
    >
      <Form.Item name={[field.name, 'line_no']} hidden>
        <Input />
      </Form.Item>
      <div className="erp-compact-field-table__supplement erp-production-order-line__supplement">
        <Form.Item
          name={[field.name, 'route_code']}
          label={<BusinessHelpLabel label="生产路线" description="布料加工 → 车缝 → 手工 → 包装；车缝和手工分别决定本厂或外发。" />}
          rules={[{ required: true, message: '请选择生产路线' }]}
        >
          <Select
            placeholder="请选择生产路线"
            disabled={readOnly}
            options={[
              {
                value: PRODUCTION_WIP_ROUTE_CODE,
                label: '毛绒标准路线（先车缝、后手工）',
              },
            ]}
          />
        </Form.Item>
        <Form.Item
          name={[field.name, 'customer_inspection_required']}
          label="客户验货"
          valuePropName="checked"
        >
          <Switch
            disabled={readOnly || routeCode !== PRODUCTION_WIP_ROUTE_CODE}
            checkedChildren="需要"
            unCheckedChildren="不需要"
          />
        </Form.Item>
        <Form.Item
          className="erp-production-order-line__note"
          name={[field.name, 'note']}
          label="明细备注"
        >
          <BusinessTextArea disabled={readOnly} maxLength={BusinessTextPolicy.noteMaxCharacters} />
        </Form.Item>
      </div>
    </BusinessCompactFieldRow>
  )
}

export default function ProductionOrderEditor({
  form,
  open,
  mode,
  loading,
  optionsByType,
  referenceAccess = {},
  order,
  materialRequirementsState,
  materialRequirements,
  canCreateMaterialIssue,
  canRequestOverIssue,
  materialIssueLoading,
  onCreateMaterialIssue,
  onRequestOverIssue,
  onCancel,
  onSubmit,
  savedRecordActions,
}) {
  const readOnly = mode === 'view'
  const quantityUnitOptions = useQuantityUnits(open && !readOnly)
  const { registerLineItemRow, requestLineItemScroll } =
    useLineItemAppendScroll()
  const appendProductionLine = (add, index) => {
    add({
      line_no: index + 1,
      planned_quantity: '1',
      route_code: PRODUCTION_WIP_ROUTE_CODE,
      customer_inspection_required: false,
    })
    requestLineItemScroll(index)
  }
  const title =
    mode === 'create'
      ? '新建生产订单'
      : readOnly
        ? '查看生产订单'
        : '编辑生产订单'
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
    <BusinessFormPage
      form={form}
      baselineKey={`${order?.id || ''}:${order?.version || ''}`}
      readOnly={readOnly}
      open={open}
      title={title}
      confirmLoading={loading}
      okText={mode === 'create' ? '创建草稿' : '保存草稿'}
      onCancel={onCancel}
      onOk={readOnly ? undefined : () => form.submit()}
      savedRecordActions={savedRecordActions}
    >
      <BusinessForm
        form={form}
        layout="vertical"
        className="erp-business-action-form"
        onFinish={onSubmit}
      >
        <BusinessFormSection fieldLayout="adaptive" title="生产计划">
          <Form.Item
            name="order_no"
            label="生产单号"
            rules={[
              { required: true, whitespace: true, message: '请输入生产单号' },
            ]}
          >
            <Input
              disabled={readOnly}
              maxLength={64}
              suffix={
                <BusinessCopyButton
                  label="生产单号"
                  value={readOnly ? order?.order_no : ''}
                />
              }
            />
          </Form.Item>
          <Form.Item className="erp-business-action-form__field--short" name="planned_start_at" label="计划开始">
            <DateInput disabled={readOnly} />
          </Form.Item>
          <Form.Item className="erp-business-action-form__field--short" name="planned_end_at" label="计划结束">
            <DateInput disabled={readOnly} />
          </Form.Item>
        </BusinessFormSection>
        <BusinessFormSection
          title="生产明细"
          showHeading={false}
          layout="content"
        >
          <Form.List name="items">
            {(fields, { add, remove }) => (
              <Space
                direction="vertical"
                size="middle"
                style={{ width: '100%' }}
              >
                <BusinessGroupedLineItems
                  title="生产明细"
                  description="发布后固定生产路线；客户验货仅在订单明确要求时开启，不能替代系统验收。"
                  fields={fields}
                  form={form}
                  table={BusinessCompactFieldTable}
                  getGroup={(item) => ({
                    key: item.product_id || undefined,
                    label: normalizedOptions.product.find((option) => Number(option.value) === Number(item.product_id))?.label || '待选择产品',
                  })}
                  tableProps={{
                    label: '生产明细',
                    showSequence: true,
                    columns: [
{ label: '销售订单行' },
{ label: '产品', required: true, width: '28%' },
{ label: '规格' },
{ label: '计划数量 / 单位', required: true, width: 200 },
{ label: 'BOM 版本' },
{ actions: true, label: '操作', width: 52 }
] }}
                >
                  {(field, index) => (
                    <RowReference
                      key={field.key}
                      field={field}
                      form={form}
                      optionsByType={normalizedOptions}
                      quantityUnitOptions={quantityUnitOptions}
                      readOnly={readOnly}
                      productionOrderID={
                        !readOnly &&
                        order?.status === PRODUCTION_ORDER_STATUS.DRAFT
                          ? order.id
                          : null
                      }
                      referenceAccess={referenceAccess}
                      rowRef={(node) => registerLineItemRow(index, node)}
                      sequence={index + 1}
                      onRemove={
                        !readOnly && fields.length > 1
                          ? () => remove(field.name)
                          : undefined
                      }
                    />
                  )}
                </BusinessGroupedLineItems>
                {!readOnly ? (
                  <BusinessLineItemsFooter
                    addLabel="添加生产明细"
                    onAdd={() => appendProductionLine(add, fields.length)}
                    stats={[
                      {
                        key: 'count',
                        label: '已录入',
                        value: fields.length,
                        suffix: '条',
                      },
                    ]}
                  />
                ) : null}
              </Space>
            )}
          </Form.List>
        </BusinessFormSection>
        {readOnly ? (
          <ProductionMaterialRequirementsPanel
            order={order}
            state={materialRequirementsState}
            requirements={materialRequirements}
            canCreateMaterialIssue={canCreateMaterialIssue}
            canRequestOverIssue={canRequestOverIssue}
            loading={materialIssueLoading}
            onCreateMaterialIssue={onCreateMaterialIssue}
            onRequestOverIssue={onRequestOverIssue}
          />
        ) : null}
        <BusinessFormSection title="备注">
          <Form.Item
            className="erp-business-action-form__field--full"
            name="note"
            label="备注"
          >
            <BusinessTextArea
              disabled={readOnly}
              maxLength={BusinessTextPolicy.noteMaxCharacters}
              minRows={2}
              showCount={!readOnly}
            />
          </Form.Item>
        </BusinessFormSection>
      </BusinessForm>
    </BusinessFormPage>
  )
}
