import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FolderOpenOutlined } from '@ant-design/icons'
import { Button, Form, Input, InputNumber, Space, Typography } from 'antd'
import BusinessLineItemActionButton from '../business-list/BusinessLineItemActionButton.jsx'
import PurchaseMaterialSnapshotFields from './PurchaseMaterialSnapshotFields.jsx'
import PurchaseOrderLineSummary from './PurchaseOrderLineSummary.jsx'
import './purchaseOrderForm.css'
import { BusinessTextPolicy } from '../../../common/consts/policies.generated.mjs'
import { purchaseMaterialLineGroupKey } from '../../utils/sourceDocumentLineGroupKeys.mjs'
import useBusinessPageContext from '../../hooks/useBusinessPageContext.js'
import RemoteReferenceSelect from '../RemoteReferenceSelect.jsx'
import RemoteReferencePicker from '../RemoteReferencePicker.jsx'
import { MATERIAL_STOCK_CATEGORY_OPTIONS } from '../../utils/warehouseClassification.mjs'
import Select from '@/common/components/select/AppSelect'
import { referenceLabel, supplierOption } from '../../utils/referenceSelectOptions.mjs'
import {
  derivePurchaseOrderItemAmount,
  formatUnitQuantitySummary,
  summarizePurchaseOrderLines,
} from '../../utils/sourceOrderAmounts.mjs'
import BusinessTextArea from '../business-list/BusinessTextArea.jsx'
import { PaymentMethodField } from '../PaymentMethodInput.jsx'

import { DateInput, InheritedDateInput } from '../business-list/BusinessDateInputs.jsx'
import BusinessFormSection from '../business-list/BusinessFormSection.jsx'
import {
  unitPrecisionFromOptions,
  unitSuffixTextFromOptions,
} from '../business-list/FieldWithUnitSuffix.jsx'
import BusinessLineItemsSummaryValue from '../business-list/BusinessLineItemsSummaryValue.jsx'
import BusinessLineItemsSection from '../business-list/BusinessLineItemsSection.jsx'
import BusinessImportActions from '../business-list/BusinessImportActions.jsx'
import { BusinessHelpLabel } from '../help/BusinessContextHelp.jsx'
import { useLineItemAppendScroll } from '../business-list/useLineItemAppendScroll.mjs'
import {
  dateInputNotAfterRule,
  dateInputNotBeforeRule,
  isDateInputAfter,
  isDateInputBefore,
} from '../../utils/dateRange.mjs'
import {
  BUSINESS_CURRENCY_OPTIONS,
  PURCHASE_INVOICE_CATEGORY_OPTIONS,
  PURCHASE_INVOICE_REQUIRED_OPTIONS,
  unixToDateInputValue,
} from '../../utils/masterDataOrderView.mjs'
import { buildPurchaseOrderItemSourceValuesFromMaterial } from '../../utils/sourceOrderLineValues.mjs'
import {
  createDuplicatedDraftLineItem,
  withoutBlankPurchaseOrderDraftLines,
} from '../../utils/businessLineItems.mjs'
import {
  CATALOG_FILL_DUPLICATE_POLICIES,
  CATALOG_FILL_MODES,
  buildCatalogFillRowsPlan,
} from '../../utils/catalogFillRows.mjs'
import { formatNumeric20Scale6Summary } from '../../utils/numeric20Scale6.mjs'
import { optionalMoneyRule } from '../../utils/sourceOrderValidation.mjs'
import { unitQuantityRule } from '../../utils/unitQuantity.mjs'
import { BusinessLineItemRow } from '../business-list/BusinessLineItemsTable.jsx'
import { purchaseMaterialMatchesSupplier, purchaseMaterialOption } from '../../utils/purchaseMaterialSupplier.mjs'
import { canReadReference } from '../../utils/remoteReferences.mjs'
import { canUndoPurchaseMaterialImport, createPurchaseMaterialImportUndo, purchaseMaterialImportSnapshot } from '../../utils/purchaseMaterialImportUndo.mjs'
import BusinessForm from '../business-list/BusinessForm.jsx'

const PURCHASE_ORDER_COLUMNS = [
  { label: '材料名称', width: 240, flexible: true, required: true },
  { label: '采购数量 / 单位', width: 194, required: true },
  { label: '单价', width: 96 },
  {
    label: (
      <BusinessHelpLabel
        itemKey="purchase-line-amount"
        label="金额"
        pageKey="accessories-purchase"
      />
    ),
    width: 120,
  },
  { label: '预计到货日期', width: 150 },
]

function getNextLineNo(lines = []) {
  const maxLineNo = lines.reduce((maxValue, line) => {
    const lineNo = Number(line?.line_no || 0)
    return Number.isFinite(lineNo) ? Math.max(maxValue, lineNo) : maxValue
  }, 0)
  return maxLineNo + 1
}

function materialLabel(material = {}) {
  return (
    [material.code, material.name].filter(Boolean).join(' ') || '材料已关联'
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
  return unitQuantityRule(
    () =>
      unitPrecisionFromOptions(
        unitOptions,
        form.getFieldValue(['items', fieldName, 'unit_id'])
      ),
    { positive: true }
  )
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
  referenceDataReady = true,
  writable = true,
  saving = false,
  importUndo,
  onImportUndoChange,
  attachmentPanel,
  onSupplierChange,
  onMaterialChange,
}) {
  const context = useBusinessPageContext()
  const taskReadOnly = context?.taskBusiness?.readOnly === true
  const canReadMaterials = canReadReference(context?.adminProfile, 'materials')
  const canEdit = writable && !taskReadOnly
  const [materialImportOpen, setMaterialImportOpen] = useState(false)
  const materialImportButton = useRef(null)
  const supplierID = Form.useWatch('supplier_id', form)
  const importSnapshot = Form.useWatch(purchaseMaterialImportSnapshot, { form, preserve: true })
  const undoState = !importUndo ? '' : importUndo.invalidated || importSnapshot !== importUndo.appliedSnapshot ? 'changed' : 'ready'
  const materialImportHint = !canEdit
    ? '当前采购单只读，不能添加材料'
    : !canReadMaterials
      ? '当前账号无权查看材料，不能从材料库添加'
    : !referenceDataReady
      ? '采购基础资料加载完成后可选择材料'
      : !supplierID ? '请先选择供应商' : ''
  const materialParams = useMemo(() => supplierID ? { purchase_supplier_id: supplierID } : {}, [supplierID])
  useEffect(() => {
    if (!canEdit || !canReadMaterials || !referenceDataReady) {
      setMaterialImportOpen(false)
      onImportUndoChange?.(null)
    } else if (importUndo && !importUndo.invalidated && importSnapshot !== importUndo.appliedSnapshot) {
      onImportUndoChange?.((current) => current ? { ...current, invalidated: true } : null)
    }
  }, [canEdit, canReadMaterials, referenceDataReady, importUndo, importSnapshot, onImportUndoChange])
  const purchaseDate = Form.useWatch('purchase_date', form)
  const expectedArrivalDate = Form.useWatch('expected_arrival_date', form)
  const supplierConfirmedArrivalDate = Form.useWatch(
    'supplier_confirmed_arrival_date',
    form
  )
  const invoiceRequired = Form.useWatch('invoice_required', form)
  const { registerLineItemRow, requestLineItemScroll } =
    useLineItemAppendScroll()
  const disablePurchaseDateAfterArrival = useCallback(
    (current) =>
      isDateInputAfter(current, expectedArrivalDate) ||
      isDateInputAfter(current, supplierConfirmedArrivalDate),
    [expectedArrivalDate, supplierConfirmedArrivalDate]
  )
  const disableExpectedArrivalBeforePurchaseDate = useCallback(
    (current) => isDateInputBefore(current, purchaseDate),
    [purchaseDate]
  )
  const supplierOptions = useMemo(
    () =>
      suppliers.map((item) => ({
        ...supplierOption(item),
        item,
      })),
    [suppliers]
  )
  const materialOptions = useMemo(
    () =>
      materials.map((item) => purchaseMaterialOption(item, supplierID)),
    [materials, supplierID]
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
        align: 'left',
        title: '材料名称',
        dataIndex: 'name',
        width: 190,
        searchText: (material) => materialLabel(material),
      },
      { title: '分类', dataIndex: 'category', width: 120 },
      { align: 'left', title: '规格', dataIndex: 'spec', width: 170 },
      { title: '颜色', dataIndex: 'color', width: 110 },
      { title: '厂商料号', dataIndex: 'supplier_item_no', width: 150 },
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
    <BusinessForm
      form={form}
      layout="vertical"
      disabled={!canEdit || !referenceDataReady || saving}
      className="erp-business-action-form"
    >
      <Form.Item name="supplier_snapshot" hidden>
        <Input />
      </Form.Item>
      <BusinessFormSection fieldLayout="adaptive" title="订单与供应商">
        <Form.Item
          className="erp-business-action-form__field"
          name="purchase_order_no"
          label="采购单号（自动）"
          rules={[{ required: true, message: '请输入或保留自动采购单号' }]}
        >
          <Input maxLength={64} placeholder="自动生成" />
        </Form.Item>
        <Form.Item
          className="erp-business-action-form__field erp-business-action-form__field--wide"
          name="supplier_id"
          label="供应商"
          rules={[{ required: true, message: '请选择供应商' }]}
        >
          <RemoteReferenceSelect
            referenceType="suppliers"
            placeholder="请选择供应商"
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
          className="erp-business-action-form__field erp-business-action-form__field--short"
          name="currency"
          label="币种"
          rules={[{ required: true, message: '请选择币种' }]}
        >
          <Select placeholder="币种" options={BUSINESS_CURRENCY_OPTIONS} />
        </Form.Item>
        <Form.Item
          className="erp-business-action-form__field erp-business-action-form__field--short"
          name="purchase_date"
          label="下单日期"
          rules={[
            { required: true, message: '请选择下单日期' },
            dateInputNotAfterRule({
              getEndValue: () => form.getFieldValue('expected_arrival_date'),
              message: '下单日期不能晚于预计到货日期',
            }),
            dateInputNotAfterRule({
              getEndValue: () =>
                form.getFieldValue('supplier_confirmed_arrival_date'),
              message: '下单日期不能晚于供应商确认到货日期',
            }),
          ]}
        >
          <DateInput
            disabledDate={
              expectedArrivalDate || supplierConfirmedArrivalDate
                ? disablePurchaseDateAfterArrival
                : undefined
            }
          />
        </Form.Item>
        <Form.Item
          className="erp-business-action-form__field erp-business-action-form__field--short"
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
              purchaseDate
                ? disableExpectedArrivalBeforePurchaseDate
                : undefined
            }
          />
        </Form.Item>
      </BusinessFormSection>
      <BusinessFormSection title="采购明细" showHeading={false}>
        <BusinessLineItemsSection
          className="erp-purchase-order-lines"
          grouping={{
            form,
            defaultExpanded: context?.taskBusiness?.device !== 'mobile',
            getGroup: (item) => ({
              key: purchaseMaterialLineGroupKey(item),
              label: referenceLabel(materialOptions, item.material_id, '待选择材料'),
              title: `${referenceLabel(materialOptions, item.material_id, '待选择材料')} · ${referenceLabel(unitOptions, item.unit_id, '待选择单位')}`,
            }),
          }}
          columns={PURCHASE_ORDER_COLUMNS}
          title="采购明细"
          description="金额按采购数量和单价自动计算，缺少单价时显示待补齐。"
          emptyDescription="暂无采购明细"
          headerActions={(
            <>
              {materialImportHint ? (
                <Typography.Text type="secondary" role="status">{materialImportHint}</Typography.Text>
              ) : null}
              <BusinessImportActions
                undoState={undoState}
                disabled={!canEdit || !canReadMaterials || !referenceDataReady || saving}
                onUndo={() => {
                  if (!canEdit || !canReadMaterials || !referenceDataReady || saving || !canUndoPurchaseMaterialImport(importUndo, form.getFieldsValue(true))) return
                  form.setFieldsValue({ items: structuredClone(importUndo.items) })
                  onImportUndoChange?.(null)
                  materialImportButton.current?.focus()
                }}
              >
                <Button
                  ref={materialImportButton}
                  icon={<FolderOpenOutlined aria-hidden="true" />}
                  className="erp-line-items-form__import-button erp-action-button"
                  disabled={!canEdit || !canReadMaterials || !referenceDataReady || !supplierID || saving}
                  onClick={() => setMaterialImportOpen(true)}
                >
                  从材料库添加
                </Button>
              </BusinessImportActions>
            </>
          )}
          renderBeforeHeader={() => (
            <RemoteReferencePicker
              referenceType="materials"
              params={materialParams}
              filters={[{ key: 'stock_category', label: '库存分类', options: MATERIAL_STOCK_CATEGORY_OPTIONS }]}
              open={materialImportOpen}
              title={<BusinessHelpLabel label="从材料库添加" description="这里只选择材料档案；数量、单价和预计到货日期在编辑页的采购明细里维护。" />}
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
                  if (!canEdit || !canReadMaterials || !referenceDataReady || saving || !form.getFieldValue('supplier_id')) return
                  const before = form.getFieldsValue(true)
                  const currentLines = withoutBlankPurchaseOrderDraftLines(
                    form.getFieldValue('items') || []
                  )
                  const nextLineNo = getNextLineNo(currentLines)
                  const startIndex = currentLines.length
                  const { rowsToAdd: importedLines } = buildCatalogFillRowsPlan(
                    {
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
                    }
                  )
                  if (!importedLines.length) return
                  const items = [...currentLines, ...importedLines]
                  onImportUndoChange?.(createPurchaseMaterialImportUndo(before, { ...before, items }))
                  form.setFieldsValue({ items })
                  requestLineItemScroll(startIndex)
                  setMaterialImportOpen(false)
                }}
            />
          )}
          renderRow={({ add, field, fields, index, remove }) => (
            <BusinessLineItemRow
              key={field.key}
              index={index}
              detailsLabel={`第 ${index + 1} 条 · 下单资料与来源`}
              detailsIdentity={<PurchaseOrderLineSummary form={form} fieldName={field.name} materials={materials} identityOnly />}
              collapsibleDetails
              detailsToggleLabel="下单资料"
              rowRef={(node) => registerLineItemRow(index, node)}
              actions={
                <Space
                  className="erp-sales-order-lines-form__row-actions"
                  size={4}
                  wrap
                >
                  <BusinessLineItemActionButton
                    action="copy"
                    aria-label={`复制第 ${index + 1} 行`}
                    onClick={() => {
                      const currentLines = form.getFieldValue('items') || []
                      const sourceLine =
                        currentLines[field.name] || currentLines[index] || {}
                      add(createDuplicatedDraftLineItem(sourceLine), index + 1)
                      requestLineItemScroll(index + 1)
                    }}
                  >
                    复制行
                  </BusinessLineItemActionButton>
                  <BusinessLineItemActionButton
                    action="remove"
                    disabled={!canEdit || !referenceDataReady || saving || fields.length <= 1}
                    onClick={() => remove(field.name)}
                  >
                    移除行
                  </BusinessLineItemActionButton>
                </Space>
              }
              hiddenFields={
                <>
                  <Form.Item name={[field.name, 'id']} hidden>
                    <Input />
                  </Form.Item>
                  <Form.Item name={[field.name, 'line_no']} hidden>
                    <Input />
                  </Form.Item>
                </>
              }
              cells={[
                <div className="erp-purchase-line-material">
                  <Form.Item
                    className="erp-line-item-field erp-line-item-field--source"
                    name={[field.name, 'material_id']}
                    label="材料名称"
                    dependencies={['supplier_id']}
                    rules={[
                      { required: true, message: '请选择材料' },
                      { validator: (_, id) => purchaseMaterialMatchesSupplier(materials.find((material) => Number(material.id) === Number(id)), form.getFieldValue('supplier_id'))
                        ? Promise.resolve() : Promise.reject(new Error('材料属于其他厂商，请重新选择')) },
                    ]}
                  >
                    <RemoteReferenceSelect
                      referenceType="materials"
                      params={materialParams}
                      disabled={!canEdit || !referenceDataReady || saving || !supplierID}
                      mapOption={(material) => purchaseMaterialOption(material, supplierID)}
                      placeholder="选择材料"
                      allowClear
                      showSearch
                      options={materialOptions}
                      optionFilterProp="label"
                      onChange={(value) => onMaterialChange(field.name, value)}
                    />
                  </Form.Item>
                  <PurchaseOrderLineSummary form={form} fieldName={field.name} materials={materials} />
                </div>,
                <div className="erp-line-editor__quantity erp-purchase-line-quantity">
                  <Form.Item
                    className="erp-line-item-field erp-line-item-field--quantity"
                    name={[field.name, 'purchased_quantity']}
                    label="采购数量"
                    rules={[
                      { required: true, message: '请输入采购数量' },
                      quantityPrecisionRule({ form, fieldName: field.name, unitOptions }),
                    ]}
                  >
                    <Input inputMode="decimal" />
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
                      placeholder="单位"
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
                </div>,
                <Form.Item
                  className="erp-line-item-field erp-line-item-field--money"
                  name={[field.name, 'unit_price']}
                  label="单价"
                  rules={[optionalMoneyRule('单价')]}
                >
                  <Input />
                </Form.Item>,

                <Form.Item noStyle shouldUpdate={(before, after) => before.items?.[field.name] !== after.items?.[field.name]}>
                  {({ getFieldValue }) => (
                    <Form.Item className="erp-line-item-field erp-line-item-field--money" label="金额">
                      <Input
                        aria-label="金额"
                        disabled
                        readOnly
                        placeholder="待补齐"
                        value={derivePurchaseOrderItemAmount(getFieldValue(['items', field.name]) || {}) ?? ''}
                      />
                    </Form.Item>
                  )}
                </Form.Item>,

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
                  <InheritedDateInput
                    inheritedValue={supplierConfirmedArrivalDate || expectedArrivalDate}
                    label="预计到货日期"
                    disabledDate={
                      purchaseDate
                        ? disableExpectedArrivalBeforePurchaseDate
                        : undefined
                    }
                  />
                </Form.Item>,
              ]}
            >
              <PurchaseMaterialSnapshotFields fieldName={field.name} disabled={!canEdit || !referenceDataReady || saving} />
              <div className="erp-purchase-line-source-label">产品来源</div>
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
                <BusinessTextArea minRows={1} maxLength={255} />
              </Form.Item>
              <Form.Item
                className="erp-sales-order-lines-form__field--full erp-line-item-field erp-line-item-field--note"
                name={[field.name, 'note']}
                label="备注"
              >
                <BusinessTextArea allowClear showCount maxLength={BusinessTextPolicy.noteMaxCharacters} />
              </Form.Item>
            </BusinessLineItemRow>
          )}
          footerProps={({ add }) => ({
            addLabel: '添加采购明细',
            addDisabled: !canEdit || !referenceDataReady || saving,
            onAdd: () => {
              const currentLines = form.getFieldValue('items') || []
              add(createBlankPurchaseLine(getNextLineNo(currentLines)))
              requestLineItemScroll(currentLines.length)
            },
            stats: [
              {
                key: 'count',
                label: '已录入',
                value: (
                  <BusinessLineItemsSummaryValue
                    summarize={withoutBlankPurchaseOrderDraftLines}
                    select={(lines) => lines.length}
                  />
                ),
                suffix: '条',
              },
              {
                key: 'quantity',
                label: '数量合计',
                value: (
                  <BusinessLineItemsSummaryValue
                    summarize={(lines) =>
                      formatUnitQuantitySummary(
                        lines,
                        'purchased_quantity',
                        unitOptions
                      )
                    }
                    select={(text) => text}
                  />
                ),
              },
              {
                key: 'amount',
                label: '金额合计',
                value: (
                  <BusinessLineItemsSummaryValue
                    summarize={(lines) => summarizePurchaseOrderLines(withoutBlankPurchaseOrderDraftLines(lines))}
                    select={(summary) =>
                      summary.amount === undefined
                        ? (summary.count ? '待补齐' : '—')
                        : formatNumeric20Scale6Summary(summary.amount, 2)
                    }
                  />
                ),
              },
            ],
          })}
        />
      </BusinessFormSection>
      <BusinessFormSection fieldLayout="adaptive" title="交付与结算">
        <Form.Item
          className="erp-business-action-form__field erp-business-action-form__field--short"
          dependencies={['purchase_date']}
          name="supplier_confirmed_arrival_date"
          label="供应商确认到货日期"
          rules={[
            dateInputNotBeforeRule({
              getStartValue: () => form.getFieldValue('purchase_date'),
              message: '供应商确认到货日期不能早于下单日期',
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
          className="erp-business-action-form__field erp-business-action-form__field--full"
          label="收货地址"
          name="delivery_address"
        >
          <BusinessTextArea minRows={1} allowClear maxLength={512} showCount />
        </Form.Item>
        <PaymentMethodField
          className="erp-business-action-form__field"
          name="payment_method"
          label={<BusinessHelpLabel label="付款方式" description="从供应商档案带出后可按本单调整。" />}
        />
        <Form.Item
          className="erp-business-action-form__field erp-business-action-form__field--short"
          name="payment_term_days"
          label={<BusinessHelpLabel label="付款周期（天）" description="保存后冻结为本单付款条件，不随供应商档案后续调整。" />}
          rules={[
            { required: true, message: '请填写付款周期' },
            {
              type: 'integer',
              min: 0,
              message: '付款周期必须为不小于 0 的整数',
            },
          ]}
        >
          <InputNumber style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item
          className="erp-business-action-form__field erp-business-action-form__field--short"
          name="invoice_required"
          label="是否需要发票"
        >
          <Select
            allowClear
            options={PURCHASE_INVOICE_REQUIRED_OPTIONS}
            placeholder="选择是否需要发票"
            onChange={(value) => {
              if (value !== true) {
                form.setFieldsValue({ invoice_category: undefined })
              }
            }}
          />
        </Form.Item>
        <Form.Item
          className="erp-business-action-form__field erp-business-action-form__field--short"
          dependencies={['invoice_required']}
          name="invoice_category"
          label="发票类别"
          rules={[
            ({ getFieldValue }) => ({
              required: getFieldValue('invoice_required') === true,
              message: '请选择发票类别',
            }),
          ]}
        >
          <Select
            allowClear
            disabled={!canEdit || !referenceDataReady || saving || invoiceRequired !== true}
            options={PURCHASE_INVOICE_CATEGORY_OPTIONS}
            placeholder={invoiceRequired === true ? '选择发票类别' : '请先选择需要发票'}
          />
        </Form.Item>
      </BusinessFormSection>
      <BusinessFormSection fieldLayout="adaptive" title="合同订购方信息">
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
      </BusinessFormSection>
      <BusinessFormSection fieldLayout="support" title="备注与附件">
        <Form.Item
          className="erp-business-action-form__field"
          name="note"
          label="备注"
        >
          <BusinessTextArea minRows={2} allowClear showCount maxLength={BusinessTextPolicy.noteMaxCharacters} />
        </Form.Item>
        {attachmentPanel ? <div className="erp-business-form-section__attachments">{attachmentPanel}</div> : null}
      </BusinessFormSection>
    </BusinessForm>
  )
}
