import React, { useEffect, useState } from 'react'
import { App, Button, Checkbox, Form, Input, Select, Space, Spin, Tag } from 'antd'
import { useLocation, useOutletContext } from 'react-router-dom'
import { SalesOrderItemStatus, SalesOrderStatus } from '../../../common/consts/statuses.generated.mjs'
import useBusinessNavigate from '../../hooks/useBusinessNavigate.js'
import EngineeringBOMAction from './EngineeringBOMAction.jsx'
import { PermissionCode } from '../../../common/consts/permissions.generated.mjs'
import { hasActionPermission } from '../../utils/masterDataOrderView.mjs'
import { engineeringBOMReturnState } from '../../utils/bomPreparationNavigation.mjs'
import {
  ProductThumbnail,
  renderProductOption,
} from '../master-data/ProductIdentity.jsx'

import BusinessFormModal from '../business-list/BusinessFormModal.jsx'
import BusinessTextArea from '../business-list/BusinessTextArea.jsx'
import BusinessCompactFieldTable, {
  BusinessCompactFieldRow,
  BusinessOptionalField,
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
  SALES_ORDER_ENGINEERING_OPTIONS,
  salesOrderProductionQuantity,
  salesOrderRequirementName,
} from '../../utils/salesOrderRequirements.mjs'

function EngineeringRow({ field, form, context, bomPermissions, disabled, onOpenBOM }) {
  const source = context?.items[field.name]
  const productID = Form.useWatch(['items', field.name, 'product_id'], form)
  const bomID = Form.useWatch(['items', field.name, 'sample_bom_id'], form)
  const product = context?.products?.find((item) => item.id === productID)
  const bom = context?.boms.find((item) => item.id === bomID)
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
          <Form.Item label="工程产品" name={[field.name, 'product_id']}>
            <Select
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
        </div>,
        <Form.Item label="规格（选填）" name={[field.name, 'product_sku_id']}>
          <Select
            allowClear
            disabled={!productID}
            options={(context?.skus || [])
              .filter((sku) => sku.product_id === productID)
              .map((sku) => ({
                value: sku.id,
                label: [sku.sku_code, sku.sku_name].filter(Boolean).join(' '),
              }))}
            onChange={() =>
              form.setFieldValue(
                ['items', field.name, 'engineering_status'],
                'PREPARING'
              )
            }
          />
        </Form.Item>,
        <Space direction="vertical" size={4} className="erp-item-field-stack">
          <Form.Item label="打样 BOM" name={[field.name, 'sample_bom_id']}>
            <Select
              allowClear
              disabled={!productID}
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
              onChange={() =>
                form.setFieldValue(
                  ['items', field.name, 'engineering_status'],
                  'PREPARING'
                )
              }
            />
          </Form.Item>
          <EngineeringBOMAction
            key={`${productID}:${bomID}`}
            productID={productID}
            bomID={bomID}
            boms={context?.boms || []}
            permissions={bomPermissions}
            disabled={disabled}
            onOpen={(action) => onOpenBOM(field.name, action)}
          />
        </Space>,
        <Form.Item label="设计师">
          <Input
            value={bom?.designer || ''}
            readOnly
            placeholder="由 BOM 工程资料带出"
          />
        </Form.Item>,
        <Form.Item
          label="工程 / 打样进度"
          name={[field.name, 'engineering_status']}
          rules={[{ required: true }]}
        >
          <Select options={SALES_ORDER_ENGINEERING_OPTIONS} />
        </Form.Item>,
      ]}
    >
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
      <BusinessOptionalField
        name={['items', field.name, 'sample_note']}
        label="打样说明"
      >
        <Form.Item label="打样说明" name={[field.name, 'sample_note']}>
          <BusinessTextArea
            maxLength={255}
            placeholder="确认结果或退回重做原因"
          />
        </Form.Item>
      </BusinessOptionalField>
    </BusinessCompactFieldRow>
  )
}

export default function SalesOrderEngineeringModal({
  orderID,
  returnedBOM,
  onCancel,
  onSaved,
}) {
  const [form] = Form.useForm()
  const { modal } = App.useApp()
  const location = useLocation()
  const outlet = useOutletContext()
  const profile = outlet?.adminProfile
  const bomPermissions = {
    canRead: hasActionPermission(profile, PermissionCode.BOM_READ),
    canCreate: hasActionPermission(profile, PermissionCode.BOM_CREATE),
    canUpdate: hasActionPermission(profile, PermissionCode.BOM_UPDATE),
  }
  const navigate = useBusinessNavigate()
  const [context, setContext] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [dirty, setDirty] = useState(false)
  useEffect(() => {
    if (!orderID) return undefined
    const controller = new AbortController()
    setLoading(true)
    setContext(null)
    setLoadError('')
    setDirty(false)
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
        const returningBOM = reloadKey === 0 && returnedBOM?.orderID === orderID
          ? boms.bom_versions.find((bom) => bom.id === returnedBOM.bomID && bom.product_id === returnedBOM.productID && bom.status !== 'ARCHIVED')
          : null
        const formItems = items.map((item) => ({
            id: item.id,
            product_id: item.product_id || undefined,
            product_sku_id: item.product_sku_id || undefined,
            sample_bom_id: item.sample_bom_id || undefined,
            engineering_status: item.engineering_status || 'PREPARING',
            sample_note: item.sample_note || '',
            reuse_confirmed_sample: false,
          }))
        const returningItem = formItems.find((item) => item.id === returnedBOM?.itemID && item.product_id === returningBOM?.product_id)
        if (returningBOM && returningItem && returningItem.sample_bom_id !== returningBOM.id) {
          returningItem.sample_bom_id = returningBOM.id
          returningItem.engineering_status = 'PREPARING'
          returningItem.reuse_confirmed_sample = false
          setDirty(true)
        }
        form.setFieldsValue({ items: formItems })
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
  }, [orderID, reloadKey, form, returnedBOM])

  const save = async ({ keepOpen = false } = {}) => {
    if (!context || saving || loading) return false
    let values
    try {
      values = await form.validateFields()
    } catch {
      return false
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
      setDirty(false)
      if (!keepOpen) onSaved()
      return true
    } catch (error) {
      message.error(getActionErrorMessage(error, '保存工程与打样进度'))
      return false
    } finally {
      setSaving(false)
    }
  }

  const leaveForBOM = (proceed) => {
    if (!dirty) return proceed()
    modal.confirm({
      maskClosable: true,
      title: '保存工程资料后继续？',
      content: '当前填写的内容尚未保存，保存成功后再进入相关资料。',
      okText: '保存并继续',
      cancelText: '继续填写',
      onOk: async () => { if (await save({ keepOpen: true })) proceed() },
    })
  }
  const openReference = (path) => leaveForBOM(() => {
    onCancel()
    navigate(path)
  })
  const openBOM = (index, action) => {
    const item = form.getFieldValue(['items', index])
    const source = context?.items[index]
    if (!item?.product_id || !source || !context) return
    leaveForBOM(() => {
      const preparation = {
        ...action,
        adminID: profile.id,
        orderID: context.order.id,
        itemID: source.id,
        productID: item.product_id,
        orderNo: context.order.order_no,
        quantityText: salesOrderProductionQuantity(source),
        returnPath: `${location.pathname}${location.search}`,
      }
      const history = window.history.state || {}
      window.history.replaceState({ ...history, usr: { ...history.usr, ...engineeringBOMReturnState(preparation) } }, '')
      onCancel()
      navigate(`/erp/purchase/material-bom?product_id=${item.product_id}`, { state: { bomPreparation: preparation } })
    })
  }
  return (
    <BusinessFormModal
      size="recordDetails"
      title={`工程与打样${context?.order?.order_no ? ` · ${context.order.order_no}` : ''}`}
      description="先关联工程产品和 BOM，产品主图及物料齐备后开始打样，确认样品时填写结果。"
      open={Boolean(orderID)}
      dirty={dirty}
      onOk={save}
      onCancel={() => {
        if (!saving) onCancel()
      }}
      confirmLoading={saving}
      maskClosable={!saving}
      okButtonProps={{
        disabled:
          loading ||
          !context ||
          ![SalesOrderStatus.DRAFT, SalesOrderStatus.SUBMITTED, SalesOrderStatus.ACTIVE].includes(
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
          BOM 管理
        </Button>
        <Button
          disabled={loading || saving}
          onClick={() => {
            const reload = () => setReloadKey((value) => value + 1)
            if (!dirty) return reload()
            modal.confirm({ maskClosable: true, title: '重新读取工程资料？', content: '当前未保存的填写内容将被替换。', okText: '重新读取', cancelText: '继续填写', onOk: reload })
          }}
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
            setDirty(true)
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
            {(fields) => (
              <BusinessCompactFieldTable
                label="订单工程资料"
                showSequence
                columns={[
                  { label: '订货要求' },
                  { label: '工程产品', width: '26%' },
                  { label: '规格' },
                  { label: '打样 BOM' },
                  { label: '设计师', width: 120 },
                  { label: '工程 / 打样进度', width: 156, required: true },
                ]}
              >
                {fields.map((field) => (
                  <EngineeringRow
                    key={field.key}
                    field={field}
                    form={form}
                    context={context}
                    bomPermissions={bomPermissions}
                    disabled={loading || saving || !['draft', 'submitted', 'active'].includes(context?.order?.lifecycle_status)}
                    onOpenBOM={openBOM}
                  />
                ))}
              </BusinessCompactFieldTable>
            )}
          </Form.List>
        </Form>
      </Spin>
    </BusinessFormModal>
  )
}
