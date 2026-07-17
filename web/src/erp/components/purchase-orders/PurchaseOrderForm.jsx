import React, { useCallback, useMemo, useState } from 'react'
import { CopyOutlined, DeleteOutlined } from '@ant-design/icons'
import { Button, Form, Input, Select, Space } from 'antd'

import { DateInput } from '../business-list/BusinessListLayout.jsx'
import FieldWithUnitSuffix, {
  isQuantityTextWithinUnitPrecision,
  unitPrecisionErrorMessage,
  unitPrecisionFromOptions,
  unitSuffixTextFromOptions,
} from '../business-list/FieldWithUnitSuffix.jsx'
import SourceImportPickerModal from '../business-list/SourceImportPickerModal.jsx'
import BusinessLineItemsSummaryValue from '../business-list/BusinessLineItemsSummaryValue.jsx'
import BusinessLineItemsSection from '../business-list/BusinessLineItemsSection.jsx'
import { useLineItemAppendScroll } from '../business-list/useLineItemAppendScroll.mjs'
import {
  dateInputNotAfterRule,
  dateInputNotBeforeRule,
  isDateInputAfter,
  isDateInputBefore,
} from '../../utils/dateRange.mjs'
import {
  buildPurchaseOrderItemSourceValuesFromMaterial,
  unixToDateInputValue,
} from '../../utils/masterDataOrderView.mjs'
import { createDuplicatedDraftLineItem } from '../../utils/businessLineItems.mjs'
import {
  CATALOG_FILL_DUPLICATE_POLICIES,
  CATALOG_FILL_MODES,
  buildCatalogFillRowsPlan,
} from '../../utils/catalogFillRows.mjs'

function decimalNumber(value) {
  const numeric = Number(
    String(value ?? '')
      .replace(/,/g, '')
      .trim()
  )
  return Number.isFinite(numeric) ? numeric : 0
}

function formatSummaryNumber(value, fractionDigits = 0) {
  if (!Number.isFinite(value) || value === 0) {
    return fractionDigits > 0 ? Number(0).toFixed(fractionDigits) : '0'
  }
  return fractionDigits > 0
    ? value.toFixed(fractionDigits)
    : String(Number(value.toFixed(4)))
}

function purchaseLineAmount(line = {}) {
  const explicitAmount = decimalNumber(line.amount)
  if (explicitAmount > 0) {
    return explicitAmount
  }
  return decimalNumber(line.purchased_quantity) * decimalNumber(line.unit_price)
}

function summarizePurchaseLines(lines = []) {
  const items = Array.isArray(lines) ? lines : []
  return items.reduce(
    (summary, line) => ({
      count: summary.count + 1,
      quantity: summary.quantity + decimalNumber(line?.purchased_quantity),
      amount: summary.amount + purchaseLineAmount(line),
    }),
    { count: 0, quantity: 0, amount: 0 }
  )
}

function getNextLineNo(lines = []) {
  const maxLineNo = lines.reduce((maxValue, line) => {
    const lineNo = Number(line?.line_no || 0)
    return Number.isFinite(lineNo) ? Math.max(maxValue, lineNo) : maxValue
  }, 0)
  return maxLineNo + 1
}

function supplierLabel(supplier = {}) {
  return (
    [supplier.code, supplier.name].filter(Boolean).join(' / ') || '供应商已关联'
  )
}

function materialLabel(material = {}) {
  return (
    [material.code, material.name].filter(Boolean).join(' / ') || '材料已关联'
  )
}

function sourceDefaultUnitText(unitOptions, unitID) {
  const normalizedID = Number(unitID || 0)
  if (!Number.isFinite(normalizedID) || normalizedID <= 0) {
    return '-'
  }
  return (
    unitSuffixTextFromOptions(unitOptions, normalizedID, '单位已关联') ||
    '单位已关联'
  )
}

function quantityPrecisionRule({ form, fieldName, unitOptions }) {
  return {
    validator: async (_, value) => {
      const line = form.getFieldValue(['items', fieldName]) || {}
      const precision = unitPrecisionFromOptions(unitOptions, line.unit_id)
      if (!isQuantityTextWithinUnitPrecision(value, precision)) {
        throw new Error(unitPrecisionErrorMessage(precision))
      }
    },
  }
}

export function createBlankPurchaseLine(lineNo = 1) {
  return {
    line_no: lineNo,
    material_id: undefined,
    unit_id: undefined,
    material_code_snapshot: '',
    material_name_snapshot: '',
    color_snapshot: '',
    product_order_no_snapshot: '',
    product_no_snapshot: '',
    product_name_snapshot: '',
    purchased_quantity: '',
    unit_price: '',
    amount: '',
    expected_arrival_date: '',
    note: '',
  }
}

function createLineFromMaterial(material = {}, lineNo = 1) {
  return {
    ...createBlankPurchaseLine(lineNo),
    ...buildPurchaseOrderItemSourceValuesFromMaterial(material),
  }
}

function optionalFormValue(value) {
  return value === null || value === undefined ? '' : value
}

export function normalizePurchaseLineFormValue(item = {}) {
  return {
    id: item.id,
    line_no: item.line_no,
    material_id: item.material_id,
    unit_id: item.unit_id,
    material_code_snapshot: item.material_code_snapshot || '',
    material_name_snapshot: item.material_name_snapshot || '',
    color_snapshot: item.color_snapshot || '',
    product_order_no_snapshot: item.product_order_no_snapshot || '',
    product_no_snapshot: item.product_no_snapshot || '',
    product_name_snapshot: item.product_name_snapshot || '',
    purchased_quantity: optionalFormValue(item.purchased_quantity),
    unit_price: optionalFormValue(item.unit_price),
    amount: optionalFormValue(item.amount),
    expected_arrival_date: unixToDateInputValue(item.expected_arrival_date),
    note: item.note || '',
    line_status: item.line_status,
  }
}

export function PurchaseOrderFormFields({
  form,
  suppliers,
  materials,
  unitOptions,
  attachmentPanel,
  onSupplierChange,
  onMaterialChange,
}) {
  const [materialImportOpen, setMaterialImportOpen] = useState(false)
  const purchaseDate = Form.useWatch('purchase_date', form)
  const expectedArrivalDate = Form.useWatch('expected_arrival_date', form)
  const { registerLineItemRow, requestLineItemScroll } =
    useLineItemAppendScroll()
  const disablePurchaseDateAfterExpectedArrival = useCallback(
    (current) => isDateInputAfter(current, expectedArrivalDate),
    [expectedArrivalDate]
  )
  const disableExpectedArrivalBeforePurchaseDate = useCallback(
    (current) => isDateInputBefore(current, purchaseDate),
    [purchaseDate]
  )
  const supplierOptions = useMemo(
    () =>
      suppliers.map((item) => ({
        value: item.id,
        label: supplierLabel(item),
        item,
      })),
    [suppliers]
  )
  const materialOptions = useMemo(
    () =>
      materials.map((item) => ({
        value: item.id,
        label: materialLabel(item),
        item,
      })),
    [materials]
  )
  const materialImportColumns = useMemo(
    () => [
      {
        title: '材料编码',
        dataIndex: 'code',
        width: 150,
        searchText: (material) => materialLabel(material),
      },
      {
        title: '材料名称',
        dataIndex: 'name',
        width: 190,
        searchText: (material) => materialLabel(material),
      },
      { title: '分类', dataIndex: 'category', width: 120 },
      { title: '规格', dataIndex: 'spec', width: 170 },
      { title: '颜色', dataIndex: 'color', width: 110 },
      {
        title: '默认单位',
        key: 'default_unit',
        width: 100,
        render: (_, material) =>
          sourceDefaultUnitText(unitOptions, material.default_unit_id),
      },
    ],
    [unitOptions]
  )

  return (
    <Form
      form={form}
      layout="vertical"
      preserve={false}
      className="erp-business-action-form"
    >
      <Form.Item name="supplier_snapshot" hidden>
        <Input />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        name="purchase_order_no"
        label="采购单号（自动）"
        rules={[{ required: true, message: '请输入或保留自动采购单号' }]}
      >
        <Input maxLength={64} placeholder="自动生成，可按需要调整" />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        name="supplier_id"
        label="供应商"
        rules={[{ required: true, message: '请选择供应商' }]}
      >
        <Select
          showSearch
          options={supplierOptions}
          optionFilterProp="label"
          onChange={onSupplierChange}
        />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        name="supplier_purchase_order_no"
        label="供应商单号"
      >
        <Input maxLength={128} />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        name="purchase_date"
        label="下单日期"
        rules={[
          { required: true, message: '请选择下单日期' },
          dateInputNotAfterRule({
            getEndValue: () => form.getFieldValue('expected_arrival_date'),
            message: '下单日期不能晚于预计到货日期',
          }),
        ]}
      >
        <DateInput
          disabledDate={
            expectedArrivalDate
              ? disablePurchaseDateAfterExpectedArrival
              : undefined
          }
        />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        dependencies={['purchase_date']}
        name="expected_arrival_date"
        label="预计到货日期"
        rules={[
          dateInputNotBeforeRule({
            getStartValue: () => form.getFieldValue('purchase_date'),
            message: '预计到货日期不能早于下单日期',
          }),
        ]}
      >
        <DateInput
          disabledDate={
            purchaseDate ? disableExpectedArrivalBeforePurchaseDate : undefined
          }
        />
      </Form.Item>
      <div className="erp-business-action-form__section-title">
        合同订购方信息
      </div>
      <Form.Item
        className="erp-business-action-form__field"
        name={['contract_party_snapshot', 'buyerCompany']}
        label="订购单位"
      >
        <Input maxLength={128} />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        name={['contract_party_snapshot', 'buyerContact']}
        label="订购人"
      >
        <Input maxLength={64} />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        name={['contract_party_snapshot', 'buyerPhone']}
        label="订购方电话"
      >
        <Input maxLength={64} />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        name={['contract_party_snapshot', 'buyerAddress']}
        label="公司地址"
      >
        <Input maxLength={255} />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        name={['contract_party_snapshot', 'buyerSigner']}
        label="订购方签字人"
      >
        <Input maxLength={64} />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field erp-business-action-form__field--full"
        name="note"
        label="备注"
      >
        <Input.TextArea
          allowClear
          autoSize={{ minRows: 1, maxRows: 3 }}
          showCount
          maxLength={255}
        />
      </Form.Item>
      {attachmentPanel}

      <BusinessLineItemsSection
        title="采购明细"
        description="同一个采购订单内维护多条供应商承诺明细。"
        emptyDescription="暂无采购明细"
        renderBeforeHeader={({ add }) => (
          <>
            <div className="erp-line-items-form__import-row">
              <div className="erp-line-items-form__import-copy">
                <strong>从材料库添加明细</strong>
                <span>
                  从材料库添加；数量、单价和预计到货日期回到采购明细维护。
                </span>
              </div>
              <Button
                className="erp-line-items-form__import-button"
                onClick={() => setMaterialImportOpen(true)}
              >
                从材料库添加
              </Button>
            </div>
            <SourceImportPickerModal
              open={materialImportOpen}
              title="选择材料添加采购明细"
              description="这里只选择材料档案；数量、单价和预计到货日期仍在主弹窗采购明细里维护。"
              rows={materials}
              columns={materialImportColumns}
              getSelectedLabel={materialLabel}
              searchPlaceholder="搜索材料"
              searchHint="可搜索：材料编码、名称、分类、规格、颜色"
              importText="添加到采购明细"
              selectedNoun="材料"
              emptyDescription="暂无可选材料"
              onCancel={() => setMaterialImportOpen(false)}
              onImport={(selectedMaterials) => {
                const currentLines = form.getFieldValue('items') || []
                const nextLineNo = getNextLineNo(currentLines)
                const startIndex = currentLines.length
                const { rowsToAdd: importedLines } = buildCatalogFillRowsPlan({
                  currentRows: currentLines,
                  selectedRows: selectedMaterials,
                  mode: CATALOG_FILL_MODES.APPEND,
                  // 同一材料可因交期、单价或批次承诺拆成多行。
                  duplicatePolicy: CATALOG_FILL_DUPLICATE_POLICIES.ALLOW,
                  getCurrentSourceKey: (line) => line.material_id,
                  getSelectedSourceKey: (material) => material.id,
                  mapSelectedRow: (material, { acceptedIndex }) =>
                    createLineFromMaterial(
                      material,
                      nextLineNo + acceptedIndex
                    ),
                })
                importedLines.forEach(() => {
                  add()
                })
                window.setTimeout(() => {
                  form.setFields(
                    importedLines.flatMap((line, index) =>
                      Object.entries(line).map(([key, value]) => ({
                        name: ['items', startIndex + index, key],
                        value,
                      }))
                    )
                  )
                })
                setMaterialImportOpen(false)
              }}
            />
          </>
        )}
        renderRow={({ add, field, fields, index, remove }) => (
          <div
            className="erp-sales-order-lines-form__row"
            key={field.key}
            ref={(node) => registerLineItemRow(index, node)}
          >
            <div className="erp-sales-order-lines-form__row-head">
              <strong>第 {index + 1} 行</strong>
              <Space
                className="erp-sales-order-lines-form__row-actions"
                size={4}
                wrap
              >
                <Button
                  aria-label={`复制第 ${index + 1} 行`}
                  type="text"
                  icon={<CopyOutlined />}
                  onClick={() => {
                    const currentLines = form.getFieldValue('items') || []
                    const sourceLine =
                      currentLines[field.name] || currentLines[index] || {}
                    add(createDuplicatedDraftLineItem(sourceLine), index + 1)
                    requestLineItemScroll(index + 1)
                  }}
                >
                  复制行
                </Button>
                <Button
                  danger
                  type="text"
                  icon={<DeleteOutlined />}
                  disabled={fields.length <= 1}
                  onClick={() => remove(field.name)}
                >
                  移除行
                </Button>
              </Space>
            </div>
            <div className="erp-sales-order-lines-form__grid">
              <Form.Item name={[field.name, 'id']} hidden>
                <Input />
              </Form.Item>
              <Form.Item name={[field.name, 'line_no']} hidden>
                <Input />
              </Form.Item>
              <Form.Item
                className="erp-line-item-field erp-line-item-field--source"
                name={[field.name, 'material_id']}
                label="材料"
                rules={[{ required: true, message: '请选择材料' }]}
              >
                <Select
                  allowClear
                  showSearch
                  options={materialOptions}
                  optionFilterProp="label"
                  onChange={(value) => onMaterialChange(field.name, value)}
                />
              </Form.Item>
              <Form.Item
                className="erp-line-item-field erp-line-item-field--unit"
                name={[field.name, 'unit_id']}
                label="单位"
                rules={[{ required: true, message: '请选择单位' }]}
              >
                <Select
                  allowClear
                  optionFilterProp="searchText"
                  options={unitOptions}
                  placeholder="请选择单位"
                  showSearch
                  onChange={() => {
                    form
                      .validateFields([
                        ['items', field.name, 'purchased_quantity'],
                      ])
                      .catch(() => {})
                  }}
                />
              </Form.Item>
              <Form.Item
                className="erp-line-item-field erp-line-item-field--snapshot-code"
                name={[field.name, 'material_code_snapshot']}
                label="下单材料编码"
              >
                <Input maxLength={64} />
              </Form.Item>
              <Form.Item
                className="erp-line-item-field erp-line-item-field--snapshot-name"
                name={[field.name, 'material_name_snapshot']}
                label="下单材料名称"
              >
                <Input maxLength={255} />
              </Form.Item>
              <Form.Item
                className="erp-line-item-field erp-line-item-field--snapshot-small"
                name={[field.name, 'color_snapshot']}
                label="下单颜色"
              >
                <Input maxLength={64} />
              </Form.Item>
              <Form.Item
                className="erp-line-item-field erp-line-item-field--snapshot-code"
                name={[field.name, 'product_order_no_snapshot']}
                label="产品订单编号"
              >
                <Input maxLength={128} />
              </Form.Item>
              <Form.Item
                className="erp-line-item-field erp-line-item-field--snapshot-code"
                name={[field.name, 'product_no_snapshot']}
                label="产品编号"
              >
                <Input maxLength={128} />
              </Form.Item>
              <Form.Item
                className="erp-line-item-field erp-line-item-field--snapshot-name"
                name={[field.name, 'product_name_snapshot']}
                label="产品名称"
              >
                <Input maxLength={255} />
              </Form.Item>
              <Form.Item
                noStyle
                shouldUpdate={(previous, current) =>
                  previous?.items?.[field.name]?.unit_id !==
                  current?.items?.[field.name]?.unit_id
                }
              >
                {({ getFieldValue }) => (
                  <Form.Item
                    className="erp-line-item-field erp-line-item-field--quantity"
                    name={[field.name, 'purchased_quantity']}
                    label="采购数量"
                    rules={[
                      { required: true, message: '请输入采购数量' },
                      quantityPrecisionRule({
                        form,
                        fieldName: field.name,
                        unitOptions,
                      }),
                    ]}
                  >
                    <FieldWithUnitSuffix
                      control={<Input />}
                      unitText={unitSuffixTextFromOptions(
                        unitOptions,
                        getFieldValue(['items', field.name, 'unit_id'])
                      )}
                    />
                  </Form.Item>
                )}
              </Form.Item>
              <Form.Item
                className="erp-line-item-field erp-line-item-field--money"
                name={[field.name, 'unit_price']}
                label="单价"
              >
                <Input />
              </Form.Item>
              <Form.Item
                className="erp-line-item-field erp-line-item-field--money"
                name={[field.name, 'amount']}
                label="金额"
              >
                <Input placeholder="留空时根据数量和单价自动计算" />
              </Form.Item>
              <Form.Item
                className="erp-line-item-field erp-line-item-field--date"
                name={[field.name, 'expected_arrival_date']}
                label="预计到货日期"
                dependencies={['purchase_date']}
                rules={[
                  dateInputNotBeforeRule({
                    getStartValue: () => form.getFieldValue('purchase_date'),
                    message: '明细预计到货日期不能早于下单日期',
                  }),
                ]}
              >
                <DateInput
                  disabledDate={
                    purchaseDate
                      ? disableExpectedArrivalBeforePurchaseDate
                      : undefined
                  }
                />
              </Form.Item>
              <Form.Item
                className="erp-sales-order-lines-form__field--full erp-line-item-field erp-line-item-field--note"
                name={[field.name, 'note']}
                label="备注"
              >
                <Input.TextArea
                  allowClear
                  autoSize={{ minRows: 1, maxRows: 3 }}
                  showCount
                  maxLength={255}
                />
              </Form.Item>
            </div>
          </div>
        )}
        footerProps={({ add, fields }) => ({
          addLabel: '添加条目',
          onAdd: () => {
            const currentLines = form.getFieldValue('items') || []
            add(createBlankPurchaseLine(getNextLineNo(currentLines)))
            requestLineItemScroll(currentLines.length)
          },
          stats: [
            {
              key: 'count',
              label: '已录入',
              value: fields.length,
              suffix: '条',
            },
            {
              key: 'quantity',
              label: '数量合计',
              value: (
                <BusinessLineItemsSummaryValue
                  summarize={summarizePurchaseLines}
                  select={(summary) => formatSummaryNumber(summary.quantity)}
                />
              ),
            },
            {
              key: 'amount',
              label: '金额合计',
              value: (
                <BusinessLineItemsSummaryValue
                  summarize={summarizePurchaseLines}
                  select={(summary) => formatSummaryNumber(summary.amount, 2)}
                />
              ),
            },
          ],
        })}
      />
    </Form>
  )
}
