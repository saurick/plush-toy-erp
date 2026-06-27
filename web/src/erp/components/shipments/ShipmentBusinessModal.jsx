import React from 'react'
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import {
  Alert,
  Button,
  Empty,
  Form,
  Input,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd'

import { DateInput } from '../business-list/BusinessListLayout.jsx'
import BusinessAttachmentPanel from '../business-list/BusinessAttachmentPanel.jsx'
import BusinessFormModal from '../business-list/BusinessFormModal.jsx'
import SourceImportPickerModal from '../business-list/SourceImportPickerModal.jsx'
import { useLineItemAppendScroll } from '../business-list/useLineItemAppendScroll.mjs'
import {
  createBlankShipmentItem,
  formatQuantity,
} from '../../utils/businessLineItems.mjs'
import { referenceLabel } from '../../utils/referenceSelectOptions.mjs'

const { Text } = Typography

export function salesOrderCustomerText(order = {}) {
  const snapshot = order.customer_snapshot
  if (typeof snapshot === 'string') {
    return snapshot
  }
  return (
    snapshot?.name ||
    snapshot?.short_name ||
    snapshot?.code ||
    (order.customer_id ? '客户已关联' : '')
  )
}

export function sourceLineProductText(
  item = {},
  productOptions = [],
  skuOptions = []
) {
  return [
    referenceLabel(productOptions, item.product_id, '产品'),
    item.product_sku_id
      ? referenceLabel(skuOptions, item.product_sku_id, 'SKU')
      : '',
  ]
    .filter(Boolean)
    .join(' / ')
}

function ShipmentFormFields({
  disabled = false,
  customerOptions = [],
  salesOrderOptions = [],
}) {
  return (
    <>
      <Form.Item
        className="erp-business-action-form__field"
        label="出货单号（自动）"
        name="shipment_no"
        rules={[{ required: true, message: '请填写或保留自动出货单号' }]}
      >
        <Input
          allowClear
          autoComplete="off"
          disabled={disabled}
          placeholder="自动生成，可按需要调整"
        />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        label="销售订单"
        name="sales_order_id"
      >
        <Select
          allowClear
          disabled={disabled}
          optionFilterProp="label"
          options={salesOrderOptions}
          placeholder="请选择销售订单"
          showSearch
        />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        label="客户"
        name="customer_id"
      >
        <Select
          allowClear
          disabled={disabled}
          optionFilterProp="label"
          options={customerOptions}
          placeholder="请选择客户"
          showSearch
        />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        label="客户快照"
        name="customer_snapshot"
      >
        <Input allowClear autoComplete="off" disabled={disabled} />
      </Form.Item>
      <Form.Item name="idempotency_key" hidden rules={[{ required: true }]}>
        <Input disabled={disabled} />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        label="计划出货日期"
        name="planned_ship_at"
      >
        <DateInput disabled={disabled} />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field erp-business-action-form__field--full"
        label="备注"
        name="note"
      >
        <Input.TextArea
          allowClear
          disabled={disabled}
          autoSize={{ minRows: 1, maxRows: 3 }}
          maxLength={300}
          showCount
        />
      </Form.Item>
    </>
  )
}

function ShipmentItemFormFields({
  field,
  showShipmentID = false,
  inventoryLotOptions = [],
  productOptions = [],
  productSKUOptions = [],
  salesOrderItemOptions = [],
  shipmentOptions = [],
  unitOptions = [],
  warehouseOptions = [],
}) {
  const namePrefix = field ? field.name : undefined
  const fieldName = (key) => (field ? [namePrefix, key] : key)
  return (
    <>
      {showShipmentID ? (
        <Form.Item
          className="erp-business-action-form__field"
          label="出货单"
          name={fieldName('shipment_id')}
          rules={[{ required: true, message: '请选择出货单' }]}
        >
          <Select
            allowClear
            optionFilterProp="label"
            options={shipmentOptions}
            placeholder="请选择出货单"
            showSearch
          />
        </Form.Item>
      ) : null}
      <Form.Item
        className="erp-business-action-form__field"
        label="销售订单行"
        name={fieldName('sales_order_item_id')}
      >
        <Select
          allowClear
          optionFilterProp="label"
          options={salesOrderItemOptions}
          placeholder="请选择销售订单行"
          showSearch
        />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        label="产品"
        name={fieldName('product_id')}
        rules={[{ required: true, message: '请选择产品' }]}
      >
        <Select
          allowClear
          optionFilterProp="label"
          options={productOptions}
          placeholder="请选择产品"
          showSearch
        />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        label="SKU"
        name={fieldName('product_sku_id')}
      >
        <Select
          allowClear
          optionFilterProp="label"
          options={productSKUOptions}
          placeholder="请选择 SKU"
          showSearch
        />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        label="仓库"
        name={fieldName('warehouse_id')}
        rules={[{ required: true, message: '请选择仓库' }]}
      >
        <Select
          allowClear
          optionFilterProp="label"
          options={warehouseOptions}
          placeholder="请选择仓库"
          showSearch
        />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        label="批次"
        name={fieldName('lot_id')}
      >
        <Select
          allowClear
          optionFilterProp="label"
          options={inventoryLotOptions}
          placeholder="请选择批次"
          showSearch
        />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        label="单位"
        name={fieldName('unit_id')}
        rules={[{ required: true, message: '请选择单位' }]}
      >
        <Select
          allowClear
          optionFilterProp="label"
          options={unitOptions}
          placeholder="请选择单位"
          showSearch
        />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        label="数量"
        name={fieldName('quantity')}
        rules={[{ required: true, message: '请填写数量' }]}
      >
        <Input allowClear autoComplete="off" placeholder="decimal，如 120.5" />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field erp-business-action-form__field--full"
        label="备注"
        name={fieldName('note')}
      >
        <Input.TextArea
          allowClear
          autoSize={{ minRows: 1, maxRows: 3 }}
          maxLength={300}
          showCount
        />
      </Form.Item>
    </>
  )
}

function ShipmentItemsTable({
  inventoryLotOptions = [],
  items = [],
  productOptions = [],
  productSKUOptions = [],
  salesOrderItemOptions = [],
  unitOptions = [],
  warehouseOptions = [],
}) {
  return (
    <Table
      rowKey="id"
      size="small"
      dataSource={items}
      pagination={false}
      locale={{ emptyText: <Empty description="暂无出货明细" /> }}
      scroll={{ x: 760 }}
      columns={[
        {
          title: '销售订单行',
          dataIndex: 'sales_order_item_id',
          width: 160,
          render: (value) =>
            referenceLabel(salesOrderItemOptions, value, '销售订单行'),
        },
        {
          title: '产品',
          dataIndex: 'product_id',
          width: 150,
          render: (value) => referenceLabel(productOptions, value, '产品'),
        },
        {
          title: 'SKU',
          dataIndex: 'product_sku_id',
          width: 130,
          render: (value) => referenceLabel(productSKUOptions, value, 'SKU'),
        },
        {
          title: '仓库 / 批次 / 单位',
          width: 260,
          render: (_, record) =>
            [
              referenceLabel(warehouseOptions, record.warehouse_id, '仓库'),
              referenceLabel(inventoryLotOptions, record.lot_id, '批次'),
              referenceLabel(unitOptions, record.unit_id, '单位'),
            ].join(' / '),
        },
        { title: '数量', dataIndex: 'quantity', width: 120 },
        { title: '备注', dataIndex: 'note' },
      ]}
    />
  )
}

export default function ShipmentBusinessModal({
  canCreate = false,
  canShip = false,
  customerOptions = [],
  form,
  importSalesOrderToShipment,
  inventoryLotOptions = [],
  isAppendModal = false,
  isCreateModal = false,
  modalSelectedShipment,
  onCancel,
  onOk,
  onOpenSalesOrderImport,
  productOptions = [],
  productSKUOptions = [],
  salesOrderImportColumns = [],
  salesOrderImportOpen = false,
  salesOrderItemOptions = [],
  salesOrderOptions = [],
  salesOrderSources = [],
  saving = false,
  selectedSalesOrder,
  selectedSourceRemainingTotal = 0,
  selectedSourceRows = [],
  setSalesOrderImportOpen,
  shipmentAttachmentRef,
  shipmentFormItems = [],
  shipmentOptions = [],
  sourceLoading = false,
  unitOptions = [],
  warehouseOptions = [],
}) {
  const { registerLineItemRow, requestLineItemScroll } =
    useLineItemAppendScroll(
      Array.isArray(shipmentFormItems) ? shipmentFormItems.length : 0
    )

  return (
    <BusinessFormModal
      title={
        isCreateModal
          ? '新建出货单'
          : isAppendModal
            ? '维护出货明细'
            : '维护出货明细'
      }
      description="出货单弹窗上方维护主表字段，下方维护出货明细；新建保存由后端事务一次写入。"
      open={Boolean(isCreateModal || isAppendModal)}
      onCancel={onCancel}
      onOk={onOk}
      okText="保存"
      cancelText="取消"
      confirmLoading={saving}
      okButtonProps={{ disabled: !canCreate }}
      forceRender
      destroyOnHidden={false}
    >
      <Form layout="vertical" form={form} className="erp-business-action-form">
        <ShipmentFormFields
          customerOptions={customerOptions}
          disabled={!isCreateModal}
          salesOrderOptions={salesOrderOptions}
        />
        <BusinessAttachmentPanel
          ref={shipmentAttachmentRef}
          ownerType="shipment"
          ownerId={modalSelectedShipment?.id}
          title="出货附件"
          description="上传装箱照片、物流单、签收回单、交付或出口凭证；附件不替代确认出货动作。"
          canUpload={canCreate || canShip}
          canDelete={canCreate || canShip}
          variant="inline"
        />
        {selectedSalesOrder ? (
          <Alert
            className="erp-business-source-summary"
            showIcon
            type="info"
            message={`来源销售订单：${
              selectedSalesOrder.order_no ||
              selectedSalesOrder.customer_order_no ||
              '已选择'
            }`}
            description={
              <Space direction="vertical" size={2}>
                <Text>
                  {`客户：${salesOrderCustomerText(selectedSalesOrder) || '-'}；已导入来源行：${
                    selectedSourceRows.length
                  } 行；当前来源行剩余可出货合计：${formatQuantity(
                    selectedSourceRemainingTotal
                  )}`}
                </Text>
                <Text type="secondary">
                  出货弹窗只做来源预览和默认数量；后端当前保存
                  sales_order_item_id 追溯，剩余量强校验仍需后续 usecase
                  合同补齐。
                </Text>
              </Space>
            }
          />
        ) : null}
        {modalSelectedShipment ? (
          <section className="erp-master-contact-list erp-shipment-modal-items">
            <div className="erp-master-contact-list__head">
              <div>
                <strong>已保存出货明细</strong>
                <span>当前出货单已保存的明细只读展示。</span>
              </div>
              <Tag>{modalSelectedShipment.items?.length || 0} 行</Tag>
            </div>
            <ShipmentItemsTable
              inventoryLotOptions={inventoryLotOptions}
              items={modalSelectedShipment.items || []}
              productOptions={productOptions}
              productSKUOptions={productSKUOptions}
              salesOrderItemOptions={salesOrderItemOptions}
              unitOptions={unitOptions}
              warehouseOptions={warehouseOptions}
            />
          </section>
        ) : null}
        <Form.List name="items">
          {(fields, { add, remove }) => (
            <section className="erp-master-contact-list erp-shipment-modal-items">
              <div className="erp-master-contact-list__head">
                <div>
                  <strong>{isCreateModal ? '出货明细' : '新增出货明细'}</strong>
                  <span>
                    明细随当前弹窗保存；可从销售订单导入来源，库存 OUT
                    仍由确认出货动作写入。
                  </span>
                </div>
              </div>
              <div className="erp-line-items-form__import-row">
                <div className="erp-line-items-form__import-copy">
                  <strong>从销售订单导入</strong>
                  <span>
                    先选择销售订单来源；产品、单位和订单行追溯带回主弹窗，仓库 /
                    批次仍在出货明细里补齐。
                  </span>
                </div>
                <Button
                  className="erp-line-items-form__import-button"
                  onClick={onOpenSalesOrderImport}
                >
                  从销售订单导入
                </Button>
              </div>
              <SourceImportPickerModal
                open={salesOrderImportOpen}
                title="从销售订单导入出货明细"
                description="选择同一张销售订单的来源行；导入后回到主弹窗维护仓库和批次。"
                rows={salesOrderSources}
                columns={salesOrderImportColumns}
                multiple
                loading={sourceLoading}
                getSelectedLabel={(item) =>
                  `第 ${item?.line_no || '-'} 行 / ${formatQuantity(
                    item?.remainingQuantity
                  )}`
                }
                getRowDisabledReason={(item) => item.disabledReason}
                isRowDisabled={(item) => Boolean(item.disabledReason)}
                searchPlaceholder="搜索订单"
                searchHint="可搜索：销售订单号、客户订单号、客户、产品"
                emptyDescription="暂无可导入销售订单行"
                onCancel={() => setSalesOrderImportOpen(false)}
                onImport={importSalesOrderToShipment}
              />
              <div className="erp-master-contact-list__items">
                {fields.map((field, index) => (
                  <div
                    className="erp-master-contact-list__row"
                    key={field.key}
                    ref={(node) => registerLineItemRow(index, node)}
                  >
                    <div className="erp-master-contact-list__row-head">
                      <strong>明细 {field.name + 1}</strong>
                      <Button
                        danger
                        size="small"
                        icon={<DeleteOutlined />}
                        disabled={fields.length <= 1}
                        onClick={() => remove(field.name)}
                      >
                        移除明细
                      </Button>
                    </div>
                    <div className="erp-master-contact-list__grid">
                      <ShipmentItemFormFields
                        field={field}
                        inventoryLotOptions={inventoryLotOptions}
                        productOptions={productOptions}
                        productSKUOptions={productSKUOptions}
                        salesOrderItemOptions={salesOrderItemOptions}
                        shipmentOptions={shipmentOptions}
                        unitOptions={unitOptions}
                        warehouseOptions={warehouseOptions}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="erp-line-items-form__footer">
                <div className="erp-line-items-form__footer-actions">
                  <Button
                    type="dashed"
                    icon={<PlusOutlined />}
                    onClick={() => {
                      requestLineItemScroll(fields.length)
                      add(createBlankShipmentItem(modalSelectedShipment?.id))
                    }}
                  >
                    添加条目
                  </Button>
                </div>
                <div className="erp-line-items-form__stats">
                  <span className="erp-line-items-form__stat">
                    已录入
                    <strong className="erp-line-items-form__stat-value">
                      {fields.length}
                    </strong>
                    条
                  </span>
                </div>
              </div>
            </section>
          )}
        </Form.List>
      </Form>
    </BusinessFormModal>
  )
}
