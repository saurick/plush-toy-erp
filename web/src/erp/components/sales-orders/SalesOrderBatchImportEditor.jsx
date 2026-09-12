import React, { useEffect, useRef, useState } from 'react'
import { Alert, Button, Form, Select, Space, Tag, Typography } from 'antd'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import BusinessFormPage from '../business-list/BusinessFormPage.jsx'
import {
  SalesOrderFormFields,
  SalesOrderItemsFormSection,
} from './SalesOrderForm.jsx'
import { useSalesOrderPaymentReview } from './useSalesOrderPaymentReview.mjs'
import {
  salesOrderImportIssues,
  saveSalesOrderImportBatch,
} from '../../utils/salesOrderImportBatch.mjs'
import {
  buildSalesOrderCustomerSourceValues,
  buildSalesOrderContactFormValues,
} from '../../utils/sourcePartySnapshots.mjs'
import {
  listAllContactsByOwner,
  listAllSalesOrderItems,
  listSalesOrders,
  saveSalesOrderWithItems,
} from '../../api/masterDataOrderApi.mjs'
import {
  listBusinessAttachments,
  uploadBusinessAttachment,
} from '../../api/attachmentApi.mjs'
import { businessFormSnapshot } from '../../utils/businessFormSnapshot.mjs'

const statusLabels = {
  pending: '待保存',
  saving: '保存中',
  complete: '已完成',
  failed: '保存失败',
  invalid: '待补齐',
  unconfirmed: '结果待核对',
  attachments_pending: '订单已保存，图片待处理',
}

export default function SalesOrderBatchImportEditor({
  drafts,
  customers,
  units,
  unitOptions,
  productSKUs,
  salesOwnerOptions,
  customerKey,
  container,
  onClose,
  onSaved,
}) {
  const [form] = Form.useForm()
  const [entries, setEntries] = useState(() =>
    drafts.map((draft, index) => ({
      ...draft,
      key: index,
      status: 'pending',
      errors: [],
      uploadStates: {},
    }))
  )
  const entriesRef = useRef(entries)
  const [index, setIndex] = useState(0)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const switchingRef = useRef(false)
  const [contacts, setContacts] = useState([])
  const customerID = Form.useWatch('customer_id', form)
  const payment = useSalesOrderPaymentReview({ customers, form })
  const { rememberPaymentCondition } = payment
  const current = entries[index]
  const completed = entries.filter(
    (entry) => entry.status === 'complete'
  ).length
  const saved = entries.filter((entry) => entry.savedOrder).length
  const submitLabel = entries.some((entry) => entry.savedOrder || entry.uncertainOrder)
    ? '重试未完成项 / 核对结果'
    : `保存全部 ${entries.length} 张草稿`
  const locked = saving || Boolean(current.savedOrder || current.uncertainOrder)
  const updateEntries = (next) => {
    entriesRef.current = next
    setEntries(next)
  }

  useEffect(() => {
    const next = entriesRef.current[index]
    form.resetFields()
    form.setFieldsValue(next.values)
    rememberPaymentCondition(next.values)
  }, [index, form, rememberPaymentCondition])

  useEffect(() => {
    let active = true
    setContacts([])
    if (customerID) {
      listAllContactsByOwner({
        owner_type: 'CUSTOMER',
        owner_id: customerID,
        active_only: true,
      })
        .then((result) => {
          if (active) setContacts(result.contacts || [])
        })
        .catch((error) => {
          if (active) {
            message.warning(getActionErrorMessage(error, '加载客户联系人'))
          }
        })
    }
    return () => {
      active = false
    }
  }, [customerID])

  const capture = async () => {
    const next = [...entriesRef.current]
    if (!next[index].savedOrder && !next[index].uncertainOrder) {
      let formErrors = []
      try {
        await form.validateFields()
      } catch (error) {
        formErrors = (error.errorFields || []).flatMap((field) => field.errors)
      }
      next[index] = {
        ...next[index],
        values: form.getFieldsValue(true),
        formErrors,
      }
    }
    return next
  }
  const selectOrder = async (nextIndex) => {
    if (savingRef.current || switchingRef.current || nextIndex === index) return
    switchingRef.current = true
    try {
      updateEntries(await capture())
      setIndex(nextIndex)
    } finally {
      switchingRef.current = false
    }
  }
  const onCustomerChange = (id) => {
    form.setFieldsValue({
      ...buildSalesOrderCustomerSourceValues(
        customers.find((customer) => customer.id === id)
      ),
      ...buildSalesOrderContactFormValues(),
    })
    payment.applyCustomerPaymentDefaults(id)
  }

  const reconcileOrder = async (params) => {
    const result = await listSalesOrders({
      keyword: params.order_no,
      limit: 200,
      lifecycle_scope: 'all',
    })
    const matches =
      result.sales_orders?.filter(
        (order) => order.order_no === params.order_no
      ) || []
    if (matches.length !== 1) return null
    const order = matches[0]
    if (
      order.customer_id !== params.customer_id ||
      order.currency !== params.currency
    ) {
      return null
    }
    const details = await listAllSalesOrderItems({ sales_order_id: order.id })
    const items = details.sales_order_items || []
    // Reconcile only the same source lines and demand. A same-number order is
    // never treated as permission to overwrite another record.
    if (
      items.length !== params.items.length ||
      items.some((item, position) => {
        const expected = params.items[position]
        return (
          [
            'requested_product_name',
            'customer_product_no',
            'ordered_quantity',
            'pre_shipment_sample_quantity',
            'unit_price',
            'unit_id',
            'order_category',
            'process_requirement',
            'note',
          ].some(
            (key) => String(item[key] ?? '') !== String(expected[key] ?? '')
          ) ||
          businessFormSnapshot(item.import_source) !==
            businessFormSnapshot(expected.import_source)
        )
      })
    ) {
      return null
    }
    return order
  }

  const saveAll = async () => {
    if (savingRef.current || switchingRef.current) return
    savingRef.current = true
    setSaving(true)
    try {
      let next = await capture()
      const numbers = new Set()
      next = next.map((entry) => {
        if (entry.savedOrder || entry.uncertainOrder) return entry
        const issues = [
          ...salesOrderImportIssues(entry.values, { customers, units }),
          ...(entry.formErrors || []),
        ]
        if (numbers.has(entry.values.order_no)) {
          issues.push('所选订单编号重复，请先更正')
        }
        numbers.add(entry.values.order_no)
        return {
          ...entry,
          status: issues.length ? 'invalid' : 'pending',
          errors: issues,
        }
      })
      const invalid = next.findIndex((entry) => entry.status === 'invalid')
      updateEntries(next)
      if (invalid >= 0) {
        setIndex(invalid)
        message.warning('请先补齐标记的订单信息，再批量保存')
        return
      }
      next = await saveSalesOrderImportBatch(next, {
        customers,
        saveOrder: (params) =>
          saveSalesOrderWithItems({
            ...params,
            customer_key: customerKey || undefined,
          }),
        uploadImage: uploadBusinessAttachment,
        listAttachments: listBusinessAttachments,
        reconcileOrder,
        onChange: updateEntries,
        errorMessage: getActionErrorMessage,
      })
      const incomplete = next.findIndex((entry) => entry.status !== 'complete')
      if (incomplete >= 0) {
        setIndex(incomplete)
        message.warning('部分订单或图片需要处理，请查看逐单结果')
      } else {
        message.success(
          `已导入 ${next.length} 张订单、${next.reduce((count, entry) => count + entry.values.items.length, 0)} 条明细`
        )
      }
      await onSaved?.()
    } catch (error) {
      message.warning(getActionErrorMessage(error, '刷新导入结果'))
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  return (
    <BusinessFormPage
      container={container}
      open
      form={form}
      title="批量导入销售订单"
      description={`已选 ${entries.length} 张订单。逐单核对后，一次保存为独立草稿。`}
      confirmLoading={saving}
      hasChanges={completed < entries.length}
      readOnly={completed === entries.length}
      okText={submitLabel}
      okButtonProps={{ 'aria-label': submitLabel }}
      onOk={saveAll}
      onCancel={onClose}
    >
      <Space wrap style={{ marginBottom: 16 }}>
        <Button
          disabled={saving || index === 0}
          onClick={() => selectOrder(index - 1)}
        >
          上一单
        </Button>
        <Select
          aria-label="切换导入订单"
          showSearch
          optionFilterProp="label"
          style={{ minWidth: 360, maxWidth: '100%' }}
          value={index}
          disabled={saving}
          onChange={selectOrder}
          options={entries.map((entry, position) => ({
            value: position,
            label: `${position + 1}. ${entry.values.order_no}（${entry.values.items.length} 条明细） · ${statusLabels[entry.status]}`,
          }))}
        />
        <Button
          disabled={saving || index === entries.length - 1}
          onClick={() => selectOrder(index + 1)}
        >
          下一单
        </Button>
        <Tag>
          已保存 {saved} / {entries.length} 张
        </Tag>
        <Tag color={completed === entries.length ? 'success' : undefined}>
          含图片已完成 {completed} / {entries.length} 张
        </Tag>
      </Space>
      {current.errors?.length ? (
        <Alert
          showIcon
          type="warning"
          message={statusLabels[current.status]}
          description={current.errors.join('；')}
          style={{ marginBottom: 16 }}
        />
      ) : null}
      <Typography.Paragraph type="secondary">
        本单原表客户：{current.review.customer || '未填写'}；共{' '}
        {current.values.items.length}{' '}
        条明细。原表设计师及未出货数保留供核对；工程分工和实际出货进度由对应业务记录确定。
      </Typography.Paragraph>
      {current.review.warnings.length ? (
        <Alert
          type="warning"
          message="原表有内容需要核对"
          description={current.review.warnings.join('；')}
          style={{ marginBottom: 16 }}
        />
      ) : null}
      <Form
        form={form}
        layout="vertical"
        className="erp-business-action-form"
        disabled={locked}
      >
        <SalesOrderFormFields
          form={form}
          customers={customers}
          contactOptions={contacts}
          salesOwnerOptions={salesOwnerOptions}
          paymentConditionOptions={payment.paymentConditionOptions}
          onCustomerChange={onCustomerChange}
          onContactSelect={(contact) =>
            form.setFieldsValue(buildSalesOrderContactFormValues(contact))
          }
          onPaymentMethodChange={payment.applyPaymentMethodTermDays}
          onPaymentConditionBlur={payment.requestPaymentConditionPriceReview}
        />
        <SalesOrderItemsFormSection
          form={form}
          canCreateItem={!locked}
          canUpdateItem={false}
          canCancelItem={false}
          unitOptions={unitOptions}
          productSKUs={productSKUs}
          importImages={current.images}
          orderID={current.savedOrder?.id}
        />
      </Form>
    </BusinessFormPage>
  )
}
