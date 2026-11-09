import React, { useEffect, useMemo, useRef } from 'react'
import { FolderOpenOutlined } from '@ant-design/icons'
import { Alert, AutoComplete, Button, Form, Input, InputNumber, Space, Tag, Typography } from 'antd'
import BusinessLineItemActionButton from '../business-list/BusinessLineItemActionButton.jsx'
import Empty from '@/common/components/empty/AppEmpty.jsx'
import { BusinessTextPolicy } from '../../../common/consts/policies.generated.mjs'
import TaskSourceFacts from '../business-list/TaskSourceFacts.jsx'
import useBusinessPageContext from '../../hooks/useBusinessPageContext.js'
import Select from '@/common/components/select/AppSelect'
import { BusinessHelpLabel } from '../help/BusinessContextHelp.jsx'
import { ShipmentStatus } from '../../../common/consts/statuses.generated.mjs'
import { unitQuantityRuleFromOptions } from '../../utils/unitQuantity.mjs'
import Table from '@/common/components/table/AppTable'
import BusinessTextArea from '../business-list/BusinessTextArea.jsx'
import DeliveryAddressFields from '../business-list/DeliveryAddressFields.jsx'
import ProductFieldControl from '../master-data/ProductFieldControl.jsx'
import ProductIdentity, {
  ProductThumbnail,
  renderProductOption,
} from '../master-data/ProductIdentity.jsx'

import { DateInput } from '../business-list/BusinessDateInputs.jsx'
import BusinessAttachmentPanel from '../business-list/BusinessAttachmentPanel.jsx'
import BusinessCopyButton from '../business-list/BusinessCopyButton.jsx'
import BusinessFormSection from '../business-list/BusinessFormSection.jsx'
import BusinessLink from '../business-list/BusinessLink.jsx'
import {
  shipmentApprovalPath,
  shipmentApprovalState,
} from '../../utils/shipmentApproval.mjs'
import BusinessFormPage from '../business-list/BusinessFormPage.jsx'
import BusinessLineItemsFooter, {
  BusinessLineItemsHeader,
} from '../business-list/BusinessLineItemsFooter.jsx'
import FieldWithUnitSuffix from '../business-list/FieldWithUnitSuffix.jsx'
import SourceImportPickerModal from '../business-list/SourceImportPickerModal.jsx'
import BusinessImportActions from '../business-list/BusinessImportActions.jsx'
import { useLineItemAppendScroll } from '../business-list/useLineItemAppendScroll.mjs'
import {
  buildShipmentProductChangePatch,
  buildShipmentSKUChangePatch,
  buildShipmentSourceItemChangePatch,
  createBlankShipmentItem,
  filterShipmentInventoryLotOptions,
  filterShipmentProductSKUOptions,
} from '../../utils/businessLineItems.mjs'
import { numeric20Scale6Units } from '../../utils/numeric20Scale6.mjs'
import { referenceLabel } from '../../utils/referenceSelectOptions.mjs'
import {
  calculateShipmentLineNetWeightG,
  hasFinalShipmentWeight,
  normalizeNetWeightG,
  normalizeShipmentQuantity,
  resolveShipmentWeightPreview,
  shipmentGrossNetWeightError,
  shipmentWeightItemsSignature,
} from '../../utils/shipmentWeight.mjs'
import { message } from '@/common/utils/antdApp'
import {
  BusinessLineItemRow,
} from '../business-list/BusinessLineItemsTable.jsx'
import BusinessGroupedLineItems from '../business-list/BusinessGroupedLineItems.jsx'
import BusinessForm from '../business-list/BusinessForm.jsx'

const SHIPMENT_ITEM_COLUMNS = [
  { label: '产品', width: 240, flexible: true, required: true },
  { label: 'SKU', width: 150 },
  { label: '仓库', width: 140, required: true },
  { label: '批次', width: 160 },
  { label: '数量 / 单位', width: 200, required: true },
]

const { Text } = Typography
const EMPTY_SHIPMENT_ITEMS = Object.freeze([])
const SHIPMENT_TRANSPORT_METHOD_OPTIONS = Object.freeze(
  ['快递', '物流专线', '海运', '空运', '铁路', '自提'].map((value) => ({
    value,
  }))
)

function isPositiveNumeric20Scale6(value) {
  const units = numeric20Scale6Units(value)
  return units !== null && BigInt(units) > BigInt(0)
}

export function salesOrderCustomerText(order = {}) {
  const snapshot = order.customer_snapshot
  if (typeof snapshot === 'string' && snapshot.trim()) {
    return snapshot.trim()
  }
  return (
    snapshot?.name ||
    snapshot?.short_name ||
    snapshot?.code ||
    order.customer_name ||
    (order.customer_id ? '客户已关联' : '')
  )
}

export function sourceLineProductText(
  item = {},
  productOptions = [],
  skuOptions = []
) {
  const productSnapshot = [
    item.product_code_snapshot,
    item.product_name_snapshot,
  ]
    .filter(Boolean)
    .join(' ')
  const productText = [item.product_code, item.product_name]
    .filter(Boolean)
    .join(' ')
  const skuText = [item.sku_code, item.sku_name].filter(Boolean).join(' ')
  return [
    productSnapshot ||
      productText ||
      referenceLabel(productOptions, item.product_id, '产品'),
    item.product_sku_id
      ? skuText || referenceLabel(skuOptions, item.product_sku_id, 'SKU')
      : '',
  ]
    .filter(Boolean)
    .join(' ')
}

function ShipmentFormFields({
  form,
  disabled = false,
  copyShipmentNo = '',
  requireIdempotencyKey = false,
  customerOptions = [],
  salesOrderOptions = [],
  sourceCurrency = '',
  storedFreightCurrency = '',
  sourceSelectionOnly = false,
  sourceLocked = false,
  products = [],
  productSKUs = [],
  itemsSection,
  attachmentPanel,
}) {
  const { taskBusiness } = useBusinessPageContext() || {}
  const showSourceFacts = Boolean(taskBusiness || sourceLocked)
  const normalizedSourceCurrency = String(sourceCurrency || '')
    .trim()
    .toUpperCase()
  const normalizedStoredFreightCurrency = String(storedFreightCurrency || '')
    .trim()
    .toUpperCase()
  const displayedFreightCurrency =
    (disabled ? normalizedStoredFreightCurrency : normalizedSourceCurrency) ||
    ''

  return (
    <>
      <BusinessFormSection fieldLayout="adaptive" title={taskBusiness ? '本次出货' : '单据与客户'}>
        {showSourceFacts ? <TaskSourceFacts
          form={form}
          label={taskBusiness ? '本次任务来源' : '销售来源'}
          inline={!taskBusiness}
          fields={[
          ...(taskBusiness ? [{ name: 'shipment_no', label: '出货单号' }] : []),
          { name: 'sales_order_id', label: '销售订单', options: salesOrderOptions },
          { name: 'customer_snapshot', label: '客户' },
          { name: 'currency', label: '币种', value: normalizedSourceCurrency },
        ]}
        /> : null}
        <Form.Item
          className="erp-business-action-form__field"
          hidden={Boolean(taskBusiness)}
          label="出货单号（自动）"
          name="shipment_no"
          rules={[{ required: true, message: '请填写或保留自动出货单号' }]}
        >
          <Input
            allowClear
            autoComplete="off"
            disabled={disabled}
            suffix={
              <BusinessCopyButton
                label="出货单号"
                value={disabled ? copyShipmentNo : ''}
              />
            }
            placeholder="自动生成"
          />
        </Form.Item>
        <Form.Item
          className="erp-business-action-form__field"
          hidden={showSourceFacts}
          label="销售订单"
          name="sales_order_id"
        >
          <Select
            allowClear
            disabled={disabled || sourceSelectionOnly}
            optionFilterProp="label"
            options={salesOrderOptions}
            placeholder="请选择销售订单"
            showSearch
          />
        </Form.Item>
        <Form.Item
          className="erp-business-action-form__field erp-business-action-form__field--wide"
          hidden={showSourceFacts}
          label="客户"
          name="customer_id"
        >
          <Select
            allowClear
            disabled={disabled || sourceLocked}
            optionFilterProp="label"
            options={customerOptions}
            placeholder="请选择客户"
            showSearch
          />
        </Form.Item>
        <Form.Item
          className="erp-business-action-form__field"
          hidden={showSourceFacts}
          label="单据客户名称"
          name="customer_snapshot"
        >
          <Input
            allowClear
            autoComplete="off"
            disabled={disabled || sourceLocked}
          />
        </Form.Item>
        <Form.Item
          className="erp-business-action-form__field"
          hidden={showSourceFacts}
          label="币种（跟随销售订单）"
        >
          <Input
            aria-label="币种（跟随销售订单）"
            disabled
            placeholder="由订单带入"
            value={normalizedSourceCurrency}
          />
        </Form.Item>
        <Form.Item name="idempotency_key" hidden rules={[{ required: requireIdempotencyKey, message: '出货标识尚未准备，请重新打开后再保存' }]}>
          <Input disabled={disabled} />
        </Form.Item>

        <Form.Item
          className="erp-business-action-form__field erp-business-action-form__field--short"
          label="计划出货日期"
          name="planned_ship_at"
        >
          <DateInput disabled={disabled} />
        </Form.Item>
      </BusinessFormSection>
      {itemsSection}
      <BusinessFormSection title="收货信息">
        <DeliveryAddressFields
          form={form}
          disabled={disabled}
          description="从销售订单带出后可按本次出货调整；保存后固定为本单收货信息。"
        />
      </BusinessFormSection>
      <BusinessFormSection fieldLayout="adaptive" title="运输与费用">
        <Form.Item
          className="erp-business-action-form__field"
          label="运输方式"
          name="transport_method"
        >
          <AutoComplete
            allowClear
            disabled={disabled}
            maxLength={64}
            options={SHIPMENT_TRANSPORT_METHOD_OPTIONS}
            placeholder="选择或填写"
          />
        </Form.Item>
        <Form.Item
          className="erp-business-action-form__field"
          label="承运商"
          name="carrier_name"
        >
          <Input
            allowClear
            autoComplete="off"
            disabled={disabled}
            maxLength={128}
          />
        </Form.Item>
        <Form.Item
          className="erp-business-action-form__field"
          label="物流 / 提单号"
          name="tracking_no"
        >
          <Input
            allowClear
            autoComplete="off"
            disabled={disabled}
            maxLength={128}
          />
        </Form.Item>
        <Form.Item
          className="erp-business-action-form__field erp-business-action-form__field--short"
          label="件数 / 箱数"
          name="package_count"
          rules={[
            {
              type: 'integer',
              min: 1,
              message: '件数 / 箱数必须为大于 0 的整数',
            },
          ]}
        >
          <InputNumber disabled={disabled} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item
          className="erp-business-action-form__field erp-business-action-form__field--short"
          label="毛重（千克）"
          name="gross_weight_kg"
          dependencies={['total_net_weight_g', 'items']}
          rules={[
            {
              validator: async (_, value) => {
                if (value === undefined || value === null || value === '') {
                  return
                }
                if (!isPositiveNumeric20Scale6(value)) {
                  throw new Error('毛重必须大于 0，且最多保留 6 位小数')
                }
                const preview = resolveShipmentWeightPreview({ items: form.getFieldValue('items'), products, productSKUs })
                const error = shipmentGrossNetWeightError(preview.complete ? preview.totalNetWeightG : form.getFieldValue('total_net_weight_g'), value)
                if (error) throw new Error(error)
              },
            },
          ]}
        >
          <InputNumber
            disabled={disabled}
            stringMode
            style={{ width: '100%' }}
          />
        </Form.Item>
        <Form.Item
          className="erp-business-action-form__field erp-business-action-form__field--short"
          label="体积（立方米）"
          name="volume_m3"
          rules={[
            {
              validator: async (_, value) => {
                if (value === undefined || value === null || value === '') {
                  return
                }
                if (!isPositiveNumeric20Scale6(value)) {
                  throw new Error('体积必须大于 0，且最多保留 6 位小数')
                }
              },
            },
          ]}
        >
          <InputNumber
            disabled={disabled}
            stringMode
            style={{ width: '100%' }}
          />
        </Form.Item>

        <Form.Item
          className="erp-business-action-form__field"
          label={<BusinessHelpLabel label="实际运费金额" description="只记录本次出货的实际物流金额，并沿用销售订单币种；不自动生成应付或付款记录。" />}
          name="freight_amount"
          rules={[
            {
              validator: async (_, value) => {
                if (value === undefined || value === null || value === '') {
                  return
                }
                if (!normalizedSourceCurrency) {
                  throw new Error('请先导入销售订单以确定单据币种')
                }
                if (numeric20Scale6Units(value) === null) {
                  throw new Error('实际运费必须为非负数，且最多保留 6 位小数')
                }
              },
            },
          ]}
        >
          <FieldWithUnitSuffix
            control={<InputNumber aria-label="实际运费金额" stringMode />}
            disabled={disabled}
            suffixAriaLabel="实际运费币种（自动）"
            unitText={displayedFreightCurrency}
          />
        </Form.Item>

        <Form.Item
          className="erp-business-action-form__field erp-business-action-form__field--full"
          label="唛头"
          name="shipping_mark"
        >
          <BusinessTextArea
            minRows={1}
            allowClear
            disabled={disabled}
            maxLength={255}
            showCount
          />
        </Form.Item>
      </BusinessFormSection>
      <BusinessFormSection fieldLayout="support" title="备注与附件">
        <Form.Item
          className="erp-business-action-form__field"
          label="备注"
          name="note"
        >
          <BusinessTextArea
            minRows={2}
            allowClear
            disabled={disabled}
            maxLength={BusinessTextPolicy.noteMaxCharacters}
            showCount
          />
        </Form.Item>

        {attachmentPanel ? <div className="erp-business-form-section__attachments">{attachmentPanel}</div> : null}
      </BusinessFormSection>
    </>
  )
}

function selectedShipmentSourceRows(formItems = [], sourceRows = []) {
  const sourceItemIDs = new Set(
    (Array.isArray(formItems) ? formItems : [])
      .map((item) => Number(item?.sales_order_item_id || 0))
      .filter((itemID) => Number.isFinite(itemID) && itemID > 0)
  )
  return sourceRows.filter((row) => sourceItemIDs.has(Number(row.id)))
}

function ShipmentSelectedSourceAlert({
  selectedSalesOrder,
  shipmentSourceRows = [],
}) {
  if (!selectedSalesOrder) return null
  return (
    <Form.Item
      noStyle
      shouldUpdate={(previous, current) => previous?.items !== current?.items}
    >
      {({ getFieldValue }) => {
        const selectedSourceRows = selectedShipmentSourceRows(
          getFieldValue('items') || [],
          shipmentSourceRows
        )
        return (
          <div
            className="erp-business-source-summary erp-business-inline-note"
            role="note"
          >
            <Text type="secondary">已导入 {selectedSourceRows.length} 行</Text>
          </div>
        )
      }}
    </Form.Item>
  )
}

function shipmentWeightText(value, emptyText = '待补齐') {
  const text = String(value ?? '').trim()
  return text ? `${text} 克` : emptyText
}

function ShipmentWeightCreateSummary({ form, products, productSKUs }) {
  const items = Form.useWatch('items', form) || EMPTY_SHIPMENT_ITEMS
  const manualWeight = Form.useWatch('total_net_weight_g', { form, preserve: true })
  const manualItemsSignature = Form.useWatch(
    'total_net_weight_items_signature',
    form
  )
  const itemsSignature = shipmentWeightItemsSignature(items)
  const preview = resolveShipmentWeightPreview({ items, products, productSKUs })
  const hasWeightInput = items.some((item) =>
    [item?.product_id, item?.product_sku_id, item?.sales_order_item_id, item?.quantity]
      .some((value) => String(value ?? '').trim() !== '')
  )

  useEffect(() => {
    const hasManualWeight = String(manualWeight ?? '').trim() !== ''
    if (!hasManualWeight) return
    if (preview.complete) {
      form.setFieldsValue({
        total_net_weight_g: undefined,
        total_net_weight_items_signature: undefined,
      })
      message.info('当前明细已可自动计算，旧人工总净重已清空')
      return
    }
    if (!manualItemsSignature) {
      form.setFieldsValue({ total_net_weight_items_signature: itemsSignature })
      return
    }
    if (manualItemsSignature !== itemsSignature) {
      form.setFieldsValue({
        total_net_weight_g: undefined,
        total_net_weight_items_signature: undefined,
      })
      message.warning('出货明细已变更，旧人工总净重已清空，请重新填写')
    }
  }, [
    form,
    itemsSignature,
    manualItemsSignature,
    manualWeight,
    preview.complete,
  ])

  return (
    <section className="erp-shipment-weight-summary">
      <Form.Item name="total_net_weight_items_signature" hidden>
        <Input />
      </Form.Item>
      {preview.complete ? (
        <div className="erp-business-inline-note" role="note">
          <Text strong>预计总净重：{preview.totalNetWeightG} 克</Text>
        </div>
      ) : hasWeightInput ? (
        <div className="erp-shipment-weight-summary__manual">
          <Alert
            className="erp-shipment-weight-summary__notice"
            showIcon
            type="warning"
            message="预计总净重暂不可计算"
            description={`${
              preview.issues[0]?.message || '当前明细缺少可用单重'
            }。系统不会显示或提交部分合计；请补齐档案，或填写整单实称净重。`}
          />
          <Form.Item
            className="erp-business-action-form__field erp-shipment-weight-summary__field"
            extra="选填；明细变更后需重填。"
            label="实际总净重（克）"
            name="total_net_weight_g"
            rules={[
              {
                validator: async (_, value) => {
                  if (value === undefined || value === null || value === '') {
                    return
                  }
                  if (!normalizeNetWeightG(value)) {
                    throw new Error('实际总净重必须大于 0，且最多保留 6 位小数')
                  }
                },
              },
            ]}
          >
            <InputNumber
              stringMode
              style={{ width: '100%' }}
              onChange={(value) =>
                form.setFieldsValue({
                  total_net_weight_items_signature: String(value ?? '').trim()
                    ? itemsSignature
                    : undefined,
                })
              }
            />
          </Form.Item>
        </div>
      ) : (
        <p className="erp-business-inline-note">填写出货明细后显示预计总净重。</p>
      )}
    </section>
  )
}

function ShipmentWeightDetailSummary({ shipment, products, productSKUs }) {
  const status = String(shipment?.status || '').toUpperCase()
  if (hasFinalShipmentWeight(status)) {
    const finalWeight = String(shipment?.total_net_weight_g ?? '').trim()
    if (!finalWeight) {
      return (
        <Alert
          showIcon
          type="warning"
          message="最终总净重未记录"
          description="确认出货时单重信息不完整且未填实际总净重，因此未生成部分合计。"
        />
      )
    }
    return (
      <div className="erp-business-inline-note" role="note">
        <Text strong>最终总净重：{finalWeight} 克</Text>
        <Text type="secondary">确认出货时形成的整单净重</Text>
      </div>
    )
  }
  if (status === ShipmentStatus.DRAFT) {
    const preview = resolveShipmentWeightPreview({
      items: shipment?.items || [],
      products,
      productSKUs,
    })
    if (preview.complete) {
      return (
        <div className="erp-business-inline-note" role="note">
          <Text strong>预计总净重：{preview.totalNetWeightG} 克</Text>
          <Text type="secondary">草稿预估值，确认出货后形成最终结果</Text>
        </div>
      )
    }
    return (
      <div className="erp-business-inline-note" role="note">
        <Text strong>
          {shipment?.total_net_weight_g
            ? `实际总净重：${shipmentWeightText(shipment.total_net_weight_g)}`
            : '预计总净重：待补齐'}
        </Text>
        <Text type="secondary">当前仍是草稿</Text>
      </div>
    )
  }
  return (
    <div className="erp-business-inline-note" role="note">
      <Text strong>
        出货记录总净重：{shipmentWeightText(shipment?.total_net_weight_g)}
      </Text>
    </div>
  )
}

function ShipmentItemFormFields(props) {
  const { field } = props
  const fieldPath = (name) =>
    field ? ['items', field.name, name] : name
  const sourcePath = fieldPath('sales_order_item_id')
  const productPath = fieldPath('product_id')
  const skuPath = fieldPath('product_sku_id')

  return (
    <Form.Item noStyle dependencies={[sourcePath, productPath, skuPath]}>
      {({ getFieldValue }) => (
        <ShipmentItemFormContent
          {...props}
          sourceItemID={getFieldValue(sourcePath)}
          productID={getFieldValue(productPath)}
          productSkuID={getFieldValue(skuPath)}
        />
      )}
    </Form.Item>
  )
}

function ShipmentItemFormContent({
  index,
  rowRef,
  actions,
  field,
  form,
  inventoryLots = [],
  inventoryLotOptions = [],
  products = [],
  productOptions = [],
  productSKUs = [],
  productSKUOptions = [],
  salesOrderItems = [],
  salesOrderItemOptions = [],
  sourceItemID,
  productID,
  productSkuID,
  sourceSelectionDisabled = false,
  unitOptions = [],
  warehouseOptions = [],
}) {
  const namePrefix = field ? field.name : undefined
  const fieldName = (key) => (field ? [namePrefix, key] : key)
  const itemPath = field ? ['items', namePrefix] : []
  const sourceLocked = Number(sourceItemID || 0) > 0
  const filteredProductSKUOptions = filterShipmentProductSKUOptions(
    productSKUOptions,
    productSKUs,
    productID
  )
  const filteredInventoryLotOptions = filterShipmentInventoryLotOptions(
    inventoryLotOptions,
    inventoryLots,
    { productID, productSkuID }
  )
  const applyItemPatch = (patch) => {
    if (!form || !field) return
    const current = form.getFieldValue(itemPath) || {}
    form.setFieldValue(itemPath, { ...current, ...patch })
  }
  const productField = (
    <Form.Item
      className="erp-business-action-form__field"
      label="产品"
      name={fieldName('product_id')}
      rules={[{ required: true, message: '请选择产品' }]}
    >
      <ProductFieldControl
        thumbnail={productID ? <ProductThumbnail productId={productID} name={referenceLabel(productOptions, productID, '产品')} /> : null}
        allowClear
        disabled={sourceLocked}
        optionFilterProp="label"
        options={productOptions}
        listItemHeight={48}
        optionRender={renderProductOption}
        aria-label={`第 ${index + 1} 行产品`}
        placeholder="请选择产品"
        showSearch
        onChange={(nextID) =>
          applyItemPatch(buildShipmentProductChangePatch(nextID, products))
        }
      />
    </Form.Item>
  )
  return (
    <BusinessLineItemRow
      index={index}
      detailsLabel="来源、包装与备注"
      showDetailsHeading={false}
      rowRef={rowRef}
      actions={actions}
      cells={[
        productField,
        <Form.Item
          className="erp-business-action-form__field"
          label="SKU"
          name={fieldName('product_sku_id')}
        >
          <Select
            allowClear
            disabled={sourceLocked || !Number(productID || 0)}
            optionFilterProp="label"
            options={filteredProductSKUOptions}
            placeholder={!Number(productID || 0) ? '请先选择产品' : sourceLocked ? '来源未指定规格' : '选择产品规格'}
            showSearch
            onChange={(nextID) =>
              applyItemPatch(buildShipmentSKUChangePatch(nextID, productSKUs))
            }
          />
        </Form.Item>,
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
            placeholder="仓库"
            showSearch
          />
        </Form.Item>,
        <Form.Item
          className="erp-business-action-form__field"
          label="批次"
          name={fieldName('lot_id')}
        >
          <Select
            allowClear
            disabled={!Number(productID || 0)}
            optionFilterProp="label"
            options={filteredInventoryLotOptions}
            placeholder={Number(productID || 0) ? '选择批次' : '请先选择产品'}
            showSearch
          />
        </Form.Item>,
        <div className="erp-line-editor__quantity">
          <Form.Item
            className="erp-business-action-form__field"
            label="数量"
            name={fieldName('quantity')}
            dependencies={[[...itemPath, 'unit_id']]}
            rules={[
            unitQuantityRuleFromOptions(unitOptions, () =>
              form.getFieldValue([...itemPath, 'unit_id'])
            ),
            { required: true, message: '请填写数量' },
            {
              validator: async (_, value) => {
                if (value === undefined || value === null || value === '') {
                  return
                }
                if (!normalizeShipmentQuantity(value)) {
                  throw new Error('数量必须大于 0，且最多保留 6 位小数')
                }
              },
            },
          ]}
          >
            <Input allowClear autoComplete="off" placeholder="如 120.5" />
          </Form.Item>
          <Form.Item
            className="erp-business-action-form__field"
            label="单位"
            name={fieldName('unit_id')}
            rules={[{ required: true, message: '请选择单位' }]}
          >
            <Select
              allowClear
              disabled={sourceLocked}
              optionFilterProp="searchText"
              options={unitOptions}
              placeholder="单位"
              showSearch
            />
          </Form.Item>
        </div>
]}
    >
      <Form.Item
        className="erp-business-action-form__field"
        label="销售订单行追溯"
        name={fieldName('sales_order_item_id')}
      >
        <Select
          allowClear
          disabled={sourceSelectionDisabled}
          optionFilterProp="label"
          options={salesOrderItemOptions}
          placeholder="请选择销售订单行"
          showSearch
          onChange={(nextID) =>
            applyItemPatch(
              buildShipmentSourceItemChangePatch(nextID, salesOrderItems)
            )
          }
        />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        label="箱号"
        name={fieldName('case_no')}
      >
        <Input allowClear autoComplete="off" maxLength={128} />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        label="包装说明"
        name={fieldName('package_description')}
      >
        <BusinessTextArea minRows={1} allowClear autoComplete="off" maxLength={255} />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        label="备注"
        name={fieldName('note')}
      >
        <BusinessTextArea allowClear maxLength={BusinessTextPolicy.noteMaxCharacters} showCount />
      </Form.Item>
    </BusinessLineItemRow>
  )
}

function ShipmentEditableLines({
  fields, form, remove, registerLineItemRow, requestLineItemScroll, selectedSalesOrder, headerActions, ...options
}) {
  const productOptions = useMemo(
    () => new Map(options.productOptions.map((option) => [Number(option.value), option])),
    [options.productOptions]
  )
  const { inventoryLots, inventoryLotOptions, products, productSKUs, productSKUOptions, salesOrderItems, salesOrderItemOptions, unitOptions, warehouseOptions } = options
  return (
    <BusinessGroupedLineItems
      title="出货明细"
      description="确认出货时才会扣减相应库存。"
      headerActions={headerActions}
      fields={fields}
      form={form}
      tableProps={{ columns: SHIPMENT_ITEM_COLUMNS, label: '出货明细' }}
      getGroup={(item, field, index) => {
        const productID = Number(item.product_id) || undefined
        const product = productOptions.get(productID)
        const label = product?.identity?.name || products.find((entry) => Number(entry.id) === productID)?.name || (productID ? '产品已关联' : `待选择产品 · 第 ${index + 1} 条`)
        return { key: productID, label, title: <ProductIdentity productId={productID} name={label} code={product?.identity?.code} /> }
      }}
    >
      {(field, index) => (
        <ShipmentItemFormFields
          key="line"
          index={index}
          rowRef={(node) => registerLineItemRow(index, node)}
          actions={
            <BusinessLineItemActionButton
              action="remove"
              disabled={fields.length <= 1}
              onClick={() => { remove(field.name); requestLineItemScroll(Math.min(index, fields.length - 2), { focusField: false }) }}
            >
              移除明细
            </BusinessLineItemActionButton>
          }
          field={field}
          form={form}
          inventoryLots={inventoryLots}
          inventoryLotOptions={inventoryLotOptions}
          products={products}
          productOptions={options.productOptions}
          productSKUs={productSKUs}
          productSKUOptions={productSKUOptions}
          salesOrderItems={salesOrderItems}
          salesOrderItemOptions={salesOrderItemOptions}
          sourceSelectionDisabled={Boolean(selectedSalesOrder)}
          unitOptions={unitOptions}
          warehouseOptions={warehouseOptions}
        />
      )}
    </BusinessGroupedLineItems>
  )
}

function ShipmentItemsTable({
  inventoryLotOptions = [],
  items = [],
  productOptions = [],
  productSKUOptions = [],
  salesOrderItemOptions = [],
  status = '',
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
      scroll={{ x: hasFinalShipmentWeight(status) ? 1340 : 1040 }}
      columns={[
        {
          title: '销售订单行',
          dataIndex: 'sales_order_item_id',
          width: 160,
          render: (value) =>
            referenceLabel(salesOrderItemOptions, value, '销售订单行'),
        },
        {
          align: 'left',
          title: '产品',
          dataIndex: 'product_id',
          width: 280,
          className: 'erp-product-identity-cell',
          render: (value) => (
            <ProductIdentity
              productId={value}
              name={referenceLabel(productOptions, value, '产品')}
            />
          ),
        },
        {
          title: 'SKU',
          dataIndex: 'product_sku_id',
          width: 130,
          render: (value) => referenceLabel(productSKUOptions, value, 'SKU'),
        },
        {
          align: 'left',
          title: '仓库 / 批次 / 单位',
          width: 260,
          render: (_, record) =>
            [
              referenceLabel(warehouseOptions, record.warehouse_id, '仓库'),
              referenceLabel(inventoryLotOptions, record.lot_id, '批次'),
              referenceLabel(unitOptions, record.unit_id, '单位'),
            ].join(' '),
        },
        { align: 'right', title: '数量', dataIndex: 'quantity', width: 120 },
        {
          align: 'left',
          title: '包装说明',
          dataIndex: 'package_description',
          width: 180,
          render: (value) => value || '-',
        },
        {
          title: '箱号',
          dataIndex: 'case_no',
          width: 130,
          render: (value) => value || '-',
        },
        ...(hasFinalShipmentWeight(status)
          ? [
              {
                align: 'right',
                title: '确认出货单重（克）',
                dataIndex: 'unit_net_weight_g_snapshot',
                width: 180,
                render: (value) => {
                  const weight = String(value ?? '').trim()
                  if (!weight) return '-'
                  return `${weight} 克`
                },
              },
              {
                align: 'right',
                title: '行净重（克）',
                width: 140,
                render: (_, record) => {
                  const lineWeight = calculateShipmentLineNetWeightG(
                    record.quantity,
                    record.unit_net_weight_g_snapshot
                  )
                  return lineWeight ? `${lineWeight} 克` : '-'
                },
              },
            ]
          : []),
        { align: 'left', title: '备注', dataIndex: 'note' },
      ]}
    />
  )
}

export default function ShipmentEditor({
  canReadApproval = false,
  canCreate = false,
  canUpdate = false,
  canImportSalesOrderSource = false,
  customerOptions = [],
  form,
  importSalesOrderToShipment,
  sourceImportUndoState = '',
  onUndoSourceImport,
  inventoryLots = [],
  inventoryLotOptions = [],
  isCreateModal = false,
  isEditModal = false,
  isViewModal = false,
  modalSelectedShipment,
  onCancel,
  onOk,
  taskFocused = false,
  onSubmitApproval = null,
  onOpenSalesOrderImport,
  products = [],
  productOptions = [],
  productSKUs = [],
  productSKUOptions = [],
  salesOrderImportColumns = [],
  salesOrderImportOpen = false,
  salesOrderItems = [],
  salesOrderItemOptions = [],
  salesOrderOptions = [],
  salesOrderSources = [],
  salesOrderSourceTotal = 0,
  salesOrderSourceCurrent = 1,
  salesOrderSourceEmptyDescription = '暂无可导入销售订单行',
  salesOrderSourceLoadError,
  salesOrderSourceImportDisabled = false,
  onSalesOrderSourcePageChange,
  onSalesOrderSourceReload,
  onSalesOrderSourceSearchChange,
  onSalesOrderSourceSelectAll,
  salesOrderSourceFilters = {},
  salesOrderSourceOrderOptions = [],
  salesOrderSourceCustomerOptions = [],
  onSalesOrderSourceFiltersChange,
  salesOrderSourcePageSize = 20,
  saving = false,
  selectedSalesOrder,
  setSalesOrderImportOpen,
  shipmentAttachmentRef,
  shipmentSourceRows = [],
  sourceLoading = false,
  unitOptions = [],
  warehouseOptions = [],
}) {
  const { registerLineItemRow, requestLineItemScroll } =
    useLineItemAppendScroll(undefined, { initialFocusSelector: '.erp-product-field-control input' })
  const appendShipmentItem = (add, index) => {
    add(createBlankShipmentItem())
    requestLineItemScroll(index)
  }
  const isWritableModal = isCreateModal || isEditModal
  const canSave = isCreateModal ? canCreate : isEditModal ? canUpdate : false
  const sourceImportButtonRef = useRef(null)

  return (
    <BusinessFormPage
      form={form}
      baselineKey={`${modalSelectedShipment?.id || ''}:${modalSelectedShipment?.version || ''}`}
      readOnly={isViewModal}
      title={
        taskFocused ? '核对本次出货' : isCreateModal
          ? '新建出货单'
          : isEditModal
            ? '编辑出货草稿'
            : '查看出货明细'
      }
      open={Boolean(isWritableModal || isViewModal)}
      onCancel={onCancel}
      onOk={isWritableModal ? onSubmitApproval || onOk : undefined}
      okText={onSubmitApproval ? '保存并提交审批' : taskFocused ? '保存草稿' : '保存'}
      showCancel={!taskFocused}
      secondaryAction={onSubmitApproval ? <Button disabled={saving || !canSave} onClick={onOk}>保存草稿</Button> : null}
      confirmLoading={saving}
      okButtonProps={{ disabled: !canSave, hidden: isViewModal }}
    >
      {isViewModal && modalSelectedShipment ? (
        <BusinessFormSection title="财务审批">
          <Space wrap>
            <Tag color={shipmentApprovalState(modalSelectedShipment).color}>
              {shipmentApprovalState(modalSelectedShipment).label}
            </Tag>
            {modalSelectedShipment.finance_release_note ? (
              <span>{modalSelectedShipment.finance_release_note}</span>
            ) : null}
            {canReadApproval ? (
              <BusinessLink to={shipmentApprovalPath(modalSelectedShipment)}>
                查看审批
              </BusinessLink>
            ) : null}
          </Space>
        </BusinessFormSection>
      ) : null}
      <BusinessForm layout="vertical" form={form} className="erp-business-action-form">
        <ShipmentFormFields
          form={form}
          products={products}
          productSKUs={productSKUs}
          customerOptions={customerOptions}
          disabled={!isWritableModal}
          requireIdempotencyKey={isCreateModal}
          copyShipmentNo={isViewModal ? modalSelectedShipment?.shipment_no : ''}
          salesOrderOptions={salesOrderOptions}
          sourceCurrency={
            selectedSalesOrder?.currency ||
            modalSelectedShipment?.items?.find(
              (item) => item?.currency_snapshot
            )?.currency_snapshot
          }
          sourceSelectionOnly={isWritableModal}
          sourceLocked={Boolean(selectedSalesOrder)}
          storedFreightCurrency={modalSelectedShipment?.freight_currency}
          attachmentPanel={
            <BusinessAttachmentPanel
              compact
              ref={shipmentAttachmentRef}
              ownerType="shipment"
              ownerId={modalSelectedShipment?.id}
              title="出货附件"
              description="上传装箱照片、物流单、签收回单、交付或出口凭证；上传附件后仍需单独确认出货。"
              canUpload={isWritableModal && canSave}
              canWithdraw={isWritableModal && canSave}
              variant="inline"
            />
          }
          itemsSection={
            <BusinessFormSection
              title="出货明细"
              showHeading={false}
              layout="content"
            >
              {isWritableModal ? (
                <ShipmentSelectedSourceAlert
                  selectedSalesOrder={selectedSalesOrder}
                  shipmentSourceRows={shipmentSourceRows}
                />
              ) : null}
              {isViewModal && modalSelectedShipment ? (
                <section className="erp-sales-order-lines-form erp-shipment-modal-items">
                  <BusinessLineItemsHeader title="出货明细">
                    <Tag>{modalSelectedShipment.items?.length || 0} 行</Tag>
                  </BusinessLineItemsHeader>
                  <ShipmentWeightDetailSummary
                    shipment={modalSelectedShipment}
                    products={products}
                    productSKUs={productSKUs}
                  />
                  <ShipmentItemsTable
                    inventoryLotOptions={inventoryLotOptions}
                    items={modalSelectedShipment.items || []}
                    productOptions={productOptions}
                    productSKUOptions={productSKUOptions}
                    salesOrderItemOptions={salesOrderItemOptions}
                    status={modalSelectedShipment.status}
                    unitOptions={unitOptions}
                    warehouseOptions={warehouseOptions}
                  />
                </section>
              ) : null}
              {isWritableModal ? (
                <Form.List name="items">
                  {(fields, { add, remove }) => (
                    <section className="erp-sales-order-lines-form erp-shipment-modal-items">
                      <SourceImportPickerModal
                        open={salesOrderImportOpen}
                        title={<BusinessHelpLabel label="从销售订单导入出货明细" description="选择同一张销售订单的来源行；导入后回到编辑页维护仓库和批次。产品、SKU、单位和订单行追溯沿用来源。" />}
                        rows={salesOrderSources}
                        columns={salesOrderImportColumns}
                        multiple
                        loading={sourceLoading}
                        importDisabled={salesOrderSourceImportDisabled}
                        importDisabledReason="销售订单加载失败，请重新加载"
                        serverPagination
                        total={salesOrderSourceTotal}
                        current={salesOrderSourceCurrent}
                        pageSize={salesOrderSourcePageSize}
                        onPageChange={onSalesOrderSourcePageChange}
                        onReload={onSalesOrderSourceReload}
                        onSearchChange={onSalesOrderSourceSearchChange}
                        onSelectAllFiltered={onSalesOrderSourceSelectAll}
                        getSelectionGroup={(item) => item.sales_order_id}
                        selectionGroup={selectedSalesOrder?.id || salesOrderSourceFilters.salesOrderID}
                        selectAllDisabledReason={salesOrderSourceFilters.selectable === false ? '先返回可导入明细，再全选' : undefined}
                        filterResetKey={JSON.stringify([selectedSalesOrder?.id, salesOrderSourceFilters, canImportSalesOrderSource])}
                        hasActiveFilters={Boolean(salesOrderSourceFilters.customerID || salesOrderSourceFilters.salesOrderID || salesOrderSourceFilters.selectable === false)}
                        onClearFilters={() => onSalesOrderSourceFiltersChange?.({ selectable: true }, { keyword: '' })}
                        renderFilters={({ selectedRows, confirmSelectionReset }) => {
                          const changeSource = (next) => {
                            const apply = () => onSalesOrderSourceFiltersChange?.(next)
                            const selected = selectedRows[0]
                            if (selected && ((next.customerID && next.customerID !== selected.customer_id) ||
                              (next.salesOrderID && next.salesOrderID !== selected.sales_order_id))) confirmSelectionReset(apply)
                            else apply()
                          }
                          return [
                            <Select
                              key="customer"
                              aria-label="导入来源客户"
                              placeholder="按客户筛选"
                              allowClear
                              showSearch
                              optionFilterProp="label"
                              disabled={Boolean(selectedSalesOrder)}
                              options={selectedSalesOrder ? customerOptions : salesOrderSourceCustomerOptions}
                              value={selectedSalesOrder?.customer_id || salesOrderSourceFilters.customerID}
                              onChange={(customerID) => changeSource({ ...salesOrderSourceFilters, customerID, salesOrderID: undefined })}
                            />,
                            <Select
                              key="order"
                              aria-label="导入来源销售订单"
                              placeholder="按销售订单筛选"
                              allowClear
                              showSearch
                              optionFilterProp="label"
                              disabled={Boolean(selectedSalesOrder)}
                              options={selectedSalesOrder ? salesOrderOptions : salesOrderSourceOrderOptions}
                              value={selectedSalesOrder?.id || salesOrderSourceFilters.salesOrderID}
                              onChange={(salesOrderID) => changeSource({ ...salesOrderSourceFilters, salesOrderID })}
                            />,
                            <Button
                              key="eligibility"
                              type="link"
                              onClick={() => onSalesOrderSourceFiltersChange?.({ ...salesOrderSourceFilters, selectable: salesOrderSourceFilters.selectable === false })}
                            >
                              {salesOrderSourceFilters.selectable === false ? '返回可导入明细' : '查看不可导入原因'}
                            </Button>,
                          ]
                        }}
                        getSelectedLabel={(item) =>
                          `${item.order_no} · 第 ${item?.line_no || '-'} 行 · ${item.product_name_snapshot || item.product_name || '产品'}`
                        }
                        getRowDisabledReason={(item) => item.disabledReason}
                        isRowDisabled={(item) => Boolean(item.disabledReason)}
                        searchPlaceholder="搜索订单"
                        searchMaxLength={128}
                        searchHint="可搜索：销售订单号、客户订单号、客户、产品"
                        emptyDescription={salesOrderSourceEmptyDescription}
                        filteredEmptyDescription={salesOrderSourceFilters.selectable === false ? '当前范围没有不可导入明细' : '没有符合条件的可导入明细'}
                        loadError={salesOrderSourceLoadError}
                        onCancel={() => setSalesOrderImportOpen(false)}
                        onImport={importSalesOrderToShipment}
                      />
                      <ShipmentEditableLines
                        headerActions={!taskFocused ? (
                          <>
                            {!canImportSalesOrderSource ? (
                              <Text type="secondary" role="status">当前账号无权导入销售订单</Text>
                            ) : null}
                            <BusinessImportActions
                              undoState={sourceImportUndoState}
                              disabled={saving || sourceLoading || !canSave || !canImportSalesOrderSource}
                              onUndo={() => {
                                if (onUndoSourceImport?.()) sourceImportButtonRef.current?.focus()
                              }}
                            >
                              <Button
                                ref={sourceImportButtonRef}
                                icon={<FolderOpenOutlined aria-hidden="true" />}
                                className="erp-line-items-form__import-button erp-action-button"
                                disabled={!canImportSalesOrderSource}
                                onClick={onOpenSalesOrderImport}
                              >
                                从销售订单导入
                              </Button>
                            </BusinessImportActions>
                          </>
                        ) : null}
                        fields={fields}
                        form={form}
                        remove={remove}
                        registerLineItemRow={registerLineItemRow}
                        requestLineItemScroll={requestLineItemScroll}
                        selectedSalesOrder={selectedSalesOrder}
                        inventoryLots={inventoryLots}
                        inventoryLotOptions={inventoryLotOptions}
                        products={products}
                        productOptions={productOptions}
                        productSKUs={productSKUs}
                        productSKUOptions={productSKUOptions}
                        salesOrderItems={salesOrderItems}
                        salesOrderItemOptions={salesOrderItemOptions}
                        unitOptions={unitOptions}
                        warehouseOptions={warehouseOptions}
                      />
                      <BusinessLineItemsFooter
                        addDisabled={Boolean(selectedSalesOrder)}
                        addLabel="添加出货明细"
                        onAdd={taskFocused ? undefined : () => appendShipmentItem(add, fields.length)}
                        stats={[
                          {
                            key: 'count',
                            label: '已录入',
                            value: fields.length,
                            suffix: '条',
                          },
                        ]}
                      />
                    </section>
                  )}
                </Form.List>
              ) : null}
              {isWritableModal ? (
                <ShipmentWeightCreateSummary
                  form={form}
                  products={products}
                  productSKUs={productSKUs}
                />
              ) : null}
            </BusinessFormSection>
          }
        />
      </BusinessForm>
    </BusinessFormPage>
  )
}
