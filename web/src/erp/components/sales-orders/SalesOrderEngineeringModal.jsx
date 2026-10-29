import React, { useEffect, useState } from 'react'
import { Button, Form, Input, Space, Tag } from 'antd'
import { applyBusinessFormReadback } from '../../utils/businessFormReadback.mjs'
import useBusinessPageContext from '../../hooks/useBusinessPageContext.js'
import useWorkflowTaskBusinessResult from '../../hooks/useWorkflowTaskBusinessResult.js'
import Select from '@/common/components/select/AppSelect'
import { SalesOrderItemStatus, SalesOrderStatus } from '../../../common/consts/statuses.generated.mjs'
import BusinessEditorGroup, { useBusinessEditorGroup } from '../business-list/BusinessEditorGroup.jsx'
import BusinessEditorWorkspace, { BusinessEditorPane } from '../business-list/BusinessEditorWorkspace.jsx'
import ProductRecordEditor from '../master-data/ProductRecordEditor.jsx'
import BOMEditor from '../bom/BOMEditor.jsx'
import SalesOrderTaskBOMEditor from './SalesOrderTaskBOMEditor.jsx'
import { engineeringMaterialLocked } from '../../utils/taskBOMOrderLink.mjs'
import BusinessFormPage from '../business-list/BusinessFormPage.jsx'
import { PermissionCode } from '../../../common/consts/permissions.generated.mjs'
import { hasActionPermission } from '../../utils/masterDataOrderView.mjs'
import {
  ProductThumbnail,
  renderProductOption,
} from '../master-data/ProductIdentity.jsx'

import BusinessCompactFieldTable, {
  BusinessCompactFieldRow,
} from '../business-list/BusinessCompactFieldTable.jsx'
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
  salesOrderProductionQuantity,
  salesOrderRequirementName,
} from '../../utils/salesOrderRequirements.mjs'

function EngineeringSourceSelect({ onChange, ...props }) {
  const editors = useBusinessEditorGroup()
  return <Select {...props} onChange={async (...args) => { if (await editors.confirmLeave({ intent: 'object' })) onChange?.(...args) }} />
}

function EngineeringRow({ field, form, context, readOnly, referenceActions, onOpenEditor, busy }) {
  const source = context?.items[field.name]
  const productID = Form.useWatch(['items', field.name, 'product_id'], form)
  const bomID = Form.useWatch(['items', field.name, 'bom_id'], form)
  const product = context?.products?.find((item) => item.id === productID)
  const bom = context?.boms.find((item) => item.id === bomID)
  const referenceEntry = (kind) => referenceActions[kind] ? (
    <Button type="link" size="small" disabled={busy} data-engineering-editor={kind} onClick={() => onOpenEditor(kind)}>
      {referenceActions[kind]}
    </Button>
  ) : null
  return (
    <BusinessCompactFieldRow
      label={`工程资料 ${field.name + 1}`}
      sequence={field.name + 1}
      cells={[
        <div>
          <strong>{source ? salesOrderRequirementName(source) : ''}</strong>
          {source?.customer_product_no ? (
            <Tag>{source.customer_product_no}</Tag>
          ) : null}
        </div>,
        <div className="erp-product-field-control">
          <Form.Item name={[field.name, 'id']} hidden>
            <Input />
          </Form.Item>
          {productID ? (
            <ProductThumbnail
              productId={productID}
              name={product?.name}
              code={product?.code}
            />
          ) : null}
          <div className="erp-engineering-workspace__reference">
            <Form.Item label="工程产品" name={[field.name, 'product_id']}>
              <EngineeringSourceSelect
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder="选择工程建立的产品"
                listItemHeight={48}
                optionRender={renderProductOption}
                options={(context?.products || []).map((product) => ({
                  value: product.id,
                  label: `${product.code} ${product.name}`,
                }))}
                onChange={() => {
                  form.setFieldValue(
                    ['items', field.name, 'product_sku_id'],
                    undefined
                  )
                  form.setFieldValue(
                    ['items', field.name, 'bom_id'],
                    undefined
                  )
                }}
              />
            </Form.Item>
            {referenceEntry('product')}
          </div>
        </div>,
        <div>
          <Form.Item label="规格（选填）" name={[field.name, 'product_sku_id']}>
            <EngineeringSourceSelect
              placeholder="请选择规格（选填）"
              allowClear
              disabled={readOnly || !productID}
              options={(context?.skus || [])
                .filter((sku) => sku.product_id === productID)
                .map((sku) => ({
                  value: sku.id,
                  label: [sku.sku_code, sku.sku_name].filter(Boolean).join(' '),
                }))}
            />
          </Form.Item>
          {referenceEntry('sku')}
        </div>,
        <Space direction="vertical" size={4} className="erp-item-field-stack">
          <Form.Item label="工程 BOM" name={[field.name, 'bom_id']}>
            <EngineeringSourceSelect
              allowClear
              disabled={readOnly || !productID}
              placeholder="选择该产品的 BOM"
              options={(context?.boms || [])
                .filter(
                  (item) =>
                    item.product_id === productID && item.status !== 'ARCHIVED'
                )
                .map((item) => ({
                  value: item.id,
                  label: `${item.version}${item.status === 'DRAFT' ? '（草稿）' : ''}`,
                }))}
            />
          </Form.Item>
          {referenceEntry('bom')}
        </Space>,
        <Form.Item label="设计师">
          <Input
            value={bom?.designer || ''}
            readOnly
            placeholder="由 BOM 工程资料带出"
          />
        </Form.Item>,
      ]}
    />
  )
}

function engineeringFormItems(items) {
  return items.map((item) => ({
    id: item.id,
    product_id: item.product_id || undefined,
    product_sku_id: item.product_sku_id || undefined,
    bom_id: item.bom_id || undefined,
  }))
}

function SalesOrderEngineeringWorkspace({
  orderID,
  onCancel,
  onSaved,
}) {
  const [form] = Form.useForm()
  const outlet = useBusinessPageContext()
  const reportBusinessResult = useWorkflowTaskBusinessResult()
  const profile = outlet?.adminProfile
  const editorGroup = useBusinessEditorGroup()
  const [selectedItemID, setSelectedItemID] = useState(null)
  const [view, setView] = useState('engineering')
  const [visited, setVisited] = useState(() => new Set(['engineering']))
  const [context, setContext] = useState(null)
  const taskReadOnly = outlet?.taskBusiness?.readOnly === true || engineeringMaterialLocked(context?.order)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const formItems = Form.useWatch('items', { form, preserve: true }) || []
  const selectedIndex = Math.max(0, context?.items.findIndex((item) => item.id === selectedItemID) ?? 0)
  const selectedSource = context?.items[selectedIndex]
  const selectedValue = formItems[selectedIndex] || {}
  const currentProduct = context?.products.find((item) => item.id === selectedValue.product_id)
  const currentSKU = context?.skus.find((item) => item.id === selectedValue.product_sku_id)
  const currentBOM = context?.boms.find((item) => item.id === selectedValue.bom_id)
  const canMaintainEngineering = !taskReadOnly && hasActionPermission(profile, PermissionCode.SALES_ORDER_ENGINEERING_UPDATE)
  const openEditor = (next) => {
    if (editorGroup.busy) return
    setVisited((current) => new Set([...current, next]))
    setView(next)
  }
  const canWriteReference = !taskReadOnly
  const referenceAction = (record, read, create, update, label) => {
    if (!hasActionPermission(profile, read)) return null
    if (!record) return canWriteReference && hasActionPermission(profile, create) ? `新建${label}` : null
    return `${canWriteReference && update && hasActionPermission(profile, update) ? '编辑' : '查看'}${label}`
  }
  const referenceActions = {
    product: referenceAction(currentProduct, PermissionCode.PRODUCT_READ, PermissionCode.PRODUCT_CREATE, PermissionCode.PRODUCT_UPDATE, '产品'),
    sku: selectedValue.product_id ? referenceAction(currentSKU, PermissionCode.PRODUCT_SKU_READ, PermissionCode.PRODUCT_SKU_CREATE, PermissionCode.PRODUCT_SKU_UPDATE, '产品规格') : null,
    bom: selectedValue.product_id ? referenceAction(currentBOM, PermissionCode.BOM_READ, PermissionCode.BOM_CREATE, currentBOM?.status === 'DRAFT' ? PermissionCode.BOM_UPDATE : '', ' BOM') : null,
  }
  const canOpenBOM = Boolean(referenceActions.bom)
  const activeView = view === 'bom' && !canOpenBOM ? 'engineering' : view

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
          (item) => item.line_status === SalesOrderItemStatus.OPEN
        )
        setContext({
          order,
          items,
          products: products.products,
          skus: skus.product_skus,
          boms: boms.bom_versions,
        })
        const formItems = engineeringFormItems(items)
        applyBusinessFormReadback(form, { items: formItems })
        setSelectedItemID((current) => items.some((item) => item.id === current) ? current : items[0]?.id || null)
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

  const readyToCommit = (exceptForm) => {
    const pending = editorGroup.pending(exceptForm)
    if (!pending.length) return true
    message.warning(pending.some((item) => item.saving) ? '资料正在保存，请稍后再提交' : `请先保存${pending.map((item) => item.title).join('、')}中的修改`)
    return false
  }

  const save = async ({ keepOpen = false } = {}) => {
    if (!context || saving || loading || !canMaintainEngineering || !readyToCommit(form)) return false
    let values
    try {
      values = await form.validateFields()
    } catch {
      return false
    }
    setSaving(true)
    try {
      const saved = await saveSalesOrderEngineering({
        id: context.order.id,
        expected_version: context.order.version,
        items: values.items.map((item) => ({
          ...item,
          product_id: item.product_id || null,
          product_sku_id: item.product_sku_id || null,
          bom_id: item.bom_id || null,
          expected_bom_version:
            context.boms.find((bom) => bom.id === item.bom_id)
              ?.edit_version || null,
        })),
      })
      const fresh = await getSalesOrder({ id: saved.sales_order_id })
      const rows = await listAllSalesOrderItems({ sales_order_id: fresh.id, expected_version: fresh.version })
      const items = rows.sales_order_items.filter((item) => item.line_status === SalesOrderItemStatus.OPEN)
      applyBusinessFormReadback(form, { items: engineeringFormItems(items) })
      setContext((current) => ({ ...current, order: fresh, items }))
      const resultText = engineeringMaterialLocked(fresh) ? '工程资料已保存，用料已自动送审' : '工程资料已保存'
      message.success(resultText)
      reportBusinessResult(resultText, { id: saved.sales_order_id, order_no: context.order.order_no })
      if (!keepOpen && !outlet?.taskBusiness) onSaved?.()
      return true
    } catch (error) {
      message.error(getActionErrorMessage(error, '保存工程资料'))
      return false
    } finally {
      setSaving(false)
    }
  }

  const labels = { engineering: '工程资料', product: '产品资料', sku: '产品规格', bom: 'BOM' }
  const editorOpen = Boolean(orderID && !loading)
  const mainView = 'engineering'
  const returnView = 'engineering'
  return (
    <BusinessEditorWorkspace
      open={Boolean(orderID)}
      toolbar={(
        <>
          {activeView !== mainView ? <Button disabled={editorGroup.busy} data-engineering-editor={returnView} onClick={() => openEditor(returnView)}>返回{labels[returnView]}</Button> : null}
          {context?.items.length ? (
            <div className="erp-engineering-workspace__products" aria-label="本次产品">
              <label><span className="erp-engineering-workspace__product-label">本单产品</span><Select
                aria-label="本单产品"
                allowClear={false /* 不可清空：本次产品必须对应订单明细。 */}
                disabled={editorGroup.busy}
                value={selectedSource?.id}
                options={context.items.map((item) => ({ value: item.id, label: `第 ${item.line_no} 行 · ${salesOrderRequirementName(item)}` }))}
                onChange={async (id) => { if (await editorGroup.confirmLeave({ intent: 'object' })) setSelectedItemID(id) }}
              />
              </label>
              <span className="erp-business-editor-workspace__source">{context.order.order_no}</span>
            </div>
          ) : null}
        </>
      )}
    >
      <BusinessEditorPane value="engineering" label={labels.engineering} active={activeView === 'engineering'}>
        <BusinessFormPage
          form={form}
          baselineKey={context?.order.version}
          title="工程资料"
          open={Boolean(orderID)}
          readOnly={!canMaintainEngineering}
          loading={loading}
          onOk={() => save({ keepOpen: Boolean(outlet?.taskBusiness) })}
          okText="保存工程资料"
          onCancel={onCancel}
          confirmLoading={saving}
          okButtonProps={{ disabled: loading || !context || ![SalesOrderStatus.DRAFT, SalesOrderStatus.SUBMITTED, SalesOrderStatus.ACTIVE].includes(context.order.lifecycle_status) }}
        >
          {loadError ? <p role="alert">{loadError}<Button onClick={() => setReloadKey((value) => value + 1)}>重新读取</Button></p> : null}
          {taskReadOnly && selectedSource && !selectedValue.product_id ? <p>产品尚未建档，请在电脑完成产品资料。</p> : null}
          <Form
            name={`engineering-${orderID}`}
            form={form}
            disabled={saving || !canMaintainEngineering}
            layout="vertical"
            className="erp-sales-order-engineering-form"
          >
            <Form.List name="items">
              {(fields) => (
                <BusinessCompactFieldTable
                  label="订单工程资料"
                  showSequence
                  columns={[
                    { label: '订货要求' },
                    { label: '工程产品', width: '26%' },
                    { label: '规格' },
                    { label: '工程 BOM' },
                    { label: '设计师', width: 120 },
                  ]}
                >
                  {fields.filter((field) => field.name === selectedIndex).map((field) => <EngineeringRow key={field.key} field={field} form={form} context={context} readOnly={!canMaintainEngineering} referenceActions={referenceActions} onOpenEditor={openEditor} busy={saving || editorGroup.busy} />)}
                </BusinessCompactFieldTable>
              )}
            </Form.List>
          </Form>
        </BusinessFormPage>
      </BusinessEditorPane>
      {visited.has('product') ? (
        <BusinessEditorPane value="product" label={labels.product} active={activeView === 'product'}>
          {selectedSource && (!taskReadOnly || currentProduct) ? <ProductRecordEditor
            key={`product:${selectedSource.id}:${selectedValue.product_id || 'new'}`}
            type="products"
            open={editorOpen}
            continuous
            record={currentProduct}
            records={context?.products || []}
            initialValues={{ name: salesOrderRequirementName(selectedSource), customer_style_no: selectedSource.customer_product_no || '' }}
            onClose={onCancel}
            onSaved={(product) => {
              setContext((current) => ({ ...current, products: [product, ...current.products.filter((item) => item.id !== product.id)] }))
              if (selectedValue.product_id !== product.id) {
                form.setFieldValue(['items', selectedIndex], { ...form.getFieldValue(['items', selectedIndex]), product_id: product.id, product_sku_id: undefined, bom_id: undefined })
              }
            }}
          /> : <p>产品尚未建档，请在电脑完成产品资料。</p>}
        </BusinessEditorPane>
      ) : null}
      {visited.has('sku') ? (
        <BusinessEditorPane value="sku" label={labels.sku} active={activeView === 'sku'}>
          {selectedSource && selectedValue.product_id && (!taskReadOnly || currentSKU) ? <ProductRecordEditor
            key={`sku:${selectedSource.id}:${selectedValue.product_id}:${selectedValue.product_sku_id || 'new'}`}
            type="product_skus"
            open={editorOpen}
            continuous
            lockProduct
            record={currentSKU}
            records={context?.skus || []}
            products={context?.products || []}
            initialValues={{ product_id: selectedValue.product_id, default_unit_id: currentProduct?.default_unit_id }}
            onClose={onCancel}
            onSaved={(sku) => {
              setContext((current) => ({ ...current, skus: [sku, ...current.skus.filter((item) => item.id !== sku.id)] }))
              if (selectedValue.product_sku_id !== sku.id) {
                form.setFieldValue(['items', selectedIndex, 'product_sku_id'], sku.id)
              }
            }}
          /> : <p>请先关联产品；产品规格可按实际需要填写。</p>}
        </BusinessEditorPane>
      ) : null}
      {visited.has('bom') ? (
        <BusinessEditorPane value="bom" label={labels.bom} active={activeView === 'bom'}>
          {selectedSource && canOpenBOM ? <BOMEditor
            key={`bom:${selectedSource.id}:${selectedValue.product_id}:${selectedValue.bom_id || 'new'}`}
            open={editorOpen}
            continuous
            mode={currentBOM ? currentBOM.status === 'DRAFT' && hasActionPermission(profile, PermissionCode.BOM_UPDATE) && outlet?.taskBusiness?.device !== 'mobile' ? 'edit' : 'view' : 'create'}
            record={currentBOM}
            initialValues={{ product_id: selectedValue.product_id, source_order_no: context?.order.order_no, quantity_text: salesOrderProductionQuantity(selectedSource) }}
            onClose={onCancel}
            onSaved={(bom) => {
              setContext((current) => ({ ...current, boms: [bom, ...current.boms.filter((item) => item.id !== bom.id)] }))
              if (selectedValue.bom_id !== bom.id) {
                form.setFieldValue(['items', selectedIndex, 'bom_id'], bom.id)
              }
              reportBusinessResult(bom.status === 'ACTIVE' ? 'BOM 已启用' : 'BOM 草稿已保存', bom)
            }}
          /> : <p>请先关联产品，再编制或选择 BOM。</p>}
        </BusinessEditorPane>
      ) : null}

    </BusinessEditorWorkspace>
  )
}

export default function SalesOrderEngineeringModal(props) {
  const { orderID, materialTask } = props
  const outlet = useBusinessPageContext()
  return <BusinessEditorGroup key={`${orderID || ''}:${materialTask?.id || ''}`}>{outlet?.taskBusiness ? <SalesOrderTaskBOMEditor {...props} /> : <SalesOrderEngineeringWorkspace {...props} />}</BusinessEditorGroup>
}
