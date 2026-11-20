import { useMemo, useRef, useState } from 'react'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import {
  listAllSalesOrderItems,
  saveSalesOrderWithItems,
} from '../../api/masterDataOrderApi.mjs'
import { normalizeSalesOrderItemFormValue } from './SalesOrderForm.jsx'
import { currentBusinessDate } from '../../utils/businessDate.mjs'
import { DEFAULT_DELIVERY_COUNTRY } from '../../utils/deliveryAddress.mjs'
import {
  canReadReference,
  loadReferenceIDs,
} from '../../utils/remoteReferences.mjs'
import {
  buildSalesOrderItemParams,
  buildSalesOrderParams,
} from '../../utils/sourceOrderParams.mjs'
import {
  buildOrderContactSnapshot,
  buildSalesOrderContactFormValues,
  buildSalesOrderCustomerSourceValues,
  deliverySnapshotFormValues,
} from '../../utils/sourcePartySnapshots.mjs'
import { isDraftSourceDocument } from '../../utils/sourceDocumentEditing.mjs'
import {
  commitSourceDocumentSaveResult,
  createSourceDocumentOpenEditController,
  isMutationResultUnknown,
  isResourceVersionConflict,
  openSourceDocumentEditWithAccessGate,
  selectOpenSourceDocumentItems,
  settleSourceDocumentPostSaveEffect,
} from '../../utils/sourceDocumentMutation.mjs'
import { resetBusinessPaginationCurrent } from '../../utils/businessPagination.mjs'
import { createSourceBusinessActionAttemptStore } from '../../utils/sourceBusinessAction.mjs'
import { unixToDateInputValue } from '../../utils/masterDataOrderView.mjs'

const CREATE_SCOPE = 'sales-order-create'

export function useSalesOrderEditor({
  adminProfile,
  beginLatestRequest,
  canUpdateOrder,
  customers,
  loadCustomerContacts,
  loadOrders,
  mergeCustomers,
  mergeProductSKUs,
  orderForm,
  rememberPaymentCondition,
  setCustomerContacts,
  setPagination,
  setSaving,
  setSelectedOrder,
}) {
  const [itemLoading, setItemLoading] = useState(false)
  const [orderModalOpen, setOrderModalOpen] = useState(false)
  const [editingOrder, setEditingOrder] = useState(null)
  const [orderCreateResultUnknown, setOrderCreateResultUnknown] =
    useState(false)
  const orderAttachmentRef = useRef(null)
  const saveInFlightRef = useRef(false)
  const createAttemptsRef = useRef(createSourceBusinessActionAttemptStore())
  const createDraftValuesRef = useRef(null)
  const openEditController = useMemo(
    () =>
      createSourceDocumentOpenEditController({
        beginLatestRequest,
        setLoading: setItemLoading,
      }),
    [beginLatestRequest]
  )

  const invalidatePendingEdit = () => openEditController.invalidate()

  const cancelOrderEdit = () => {
    openEditController.invalidate()
    if (!orderCreateResultUnknown) {
      orderAttachmentRef.current?.clearPendingAttachments()
    }
    setOrderModalOpen(false)
  }

  const openCreateOrder = () => {
    if (createAttemptsRef.current.peek(CREATE_SCOPE)) {
      orderForm.setFieldsValue(createDraftValuesRef.current)
      setOrderModalOpen(true)
      return
    }
    openEditController.invalidate()
    orderAttachmentRef.current?.clearPendingAttachments()
    setEditingOrder(null)
    setOrderCreateResultUnknown(false)
    setCustomerContacts([])
    orderForm.resetFields()
    orderForm.setFieldsValue({
      order_no: undefined,
      currency: 'CNY',
      tax_mode: undefined,
      tax_rate: undefined,
      freight_terms: undefined,
      quoted_freight_amount: undefined,
      order_date: currentBusinessDate(),
      delivery_country_region: DEFAULT_DELIVERY_COUNTRY,
      items: [],
    })
    rememberPaymentCondition({})
    setOrderModalOpen(true)
  }

  const openEditOrder = async (order) => {
    if (createAttemptsRef.current.peek(CREATE_SCOPE)) {
      message.warning('请先打开新建订单，核对上次保存结果后再编辑其他订单')
      return
    }
    const editResult = await openSourceDocumentEditWithAccessGate({
      canUpdate: canUpdateOrder,
      document: order,
      invalidatePending: openEditController.invalidate,
      isEditable: isDraftSourceDocument,
      open: () =>
        openEditController.open({
          loadItems: async ({ signal }) => {
            const result = await listAllSalesOrderItems(
              {
                sales_order_id: order.id,
                expected_version: order.version,
              },
              { signal }
            )
            const [customerData, skuData] = await Promise.all([
              canReadReference(adminProfile, 'customers')
                ? loadReferenceIDs('customers', [order.customer_id], {
                    signal,
                  })
                : { customers: [] },
              canReadReference(adminProfile, 'product_skus')
                ? loadReferenceIDs(
                    'product_skus',
                    (result?.sales_order_items || []).map(
                      (row) => row.product_sku_id
                    ),
                    { signal }
                  )
                : { product_skus: [] },
            ])
            if (!signal.aborted) {
              mergeCustomers(customerData.customers)
              mergeProductSKUs(skuData.product_skus)
            }
            return result?.sales_order_items
          },
          enterEditing: (nextItems) => {
            const openItems = selectOpenSourceDocumentItems(nextItems)
            orderAttachmentRef.current?.clearPendingAttachments()
            setSelectedOrder(order)
            setEditingOrder(order)
            orderForm.setFieldsValue({
              ...order,
              order_date: unixToDateInputValue(order.order_date),
              planned_delivery_date: unixToDateInputValue(
                order.planned_delivery_date
              ),
              ...deliverySnapshotFormValues(order.delivery_snapshot),
              ...buildSalesOrderContactFormValues(order),
              items: openItems.map(normalizeSalesOrderItemFormValue),
            })
            rememberPaymentCondition(order)
            loadCustomerContacts(order.customer_id)
            setOrderModalOpen(true)
          },
        }),
    })
    if (editResult.status === 'blocked') {
      if (editResult.reason === 'forbidden') {
        message.warning('当前账号没有编辑销售订单的权限。')
      } else if (editResult.reason === 'not_editable') {
        message.warning('订单提交后已冻结；如需调整，请取消后重新建立订单。')
      }
      return
    }
    if (editResult.status === 'load_failed') {
      message.error(
        `${getActionErrorMessage(
          editResult.error,
          '加载销售订单明细失败'
        )}，未进入编辑`
      )
    }
  }

  const saveOrder = async () => {
    if (saveInFlightRef.current) return
    saveInFlightRef.current = true
    setSaving(true)
    const isCreatingOrder = !editingOrder?.id
    const retainedAttempt = isCreatingOrder
      ? createAttemptsRef.current.peek(CREATE_SCOPE)
      : null
    let createAttempt = retainedAttempt
    try {
      let params = retainedAttempt?.params
      if (!params) {
        let values
        try {
          values = await orderForm.validateFields()
        } catch (error) {
          if (!error?.errorFields) {
            message.error(getActionErrorMessage(error, '校验销售订单内容'))
          }
          return
        }
        const customer = customers.find(
          (item) => item.id === values.customer_id
        )
        const customerSourceValues =
          buildSalesOrderCustomerSourceValues(customer)
        const customerSnapshot = !customer && editingOrder &&
          Number(editingOrder.customer_id) === Number(values.customer_id)
          ? editingOrder.customer_snapshot
          : customerSourceValues.customer_snapshot
        try {
          params = {
            ...buildSalesOrderParams(
              {
                ...values,
                customer_snapshot: customerSnapshot,
                contact_snapshot: buildOrderContactSnapshot(values),
              },
              editingOrder?.id
                ? {
                    id: editingOrder.id,
                    expected_version: editingOrder.version,
                  }
                : {}
            ),
            items: (Array.isArray(values.items) ? values.items : []).map(
              (item, index) =>
                buildSalesOrderItemParams(item, {
                  ...(item?.id ? { id: item.id } : {}),
                  line_no: index + 1,
                })
            ),
          }
          if (isCreatingOrder) {
            createDraftValuesRef.current = structuredClone(values)
            createAttempt = createAttemptsRef.current.prepare(
              CREATE_SCOPE,
              params
            )
            params = createAttempt.params
          }
        } catch (error) {
          message.error(getActionErrorMessage(error, '准备销售订单保存'))
          return
        }
      }
      const saveResult = await commitSourceDocumentSaveResult({
        save: async () => {
          const result = await saveSalesOrderWithItems(params)
          return result.sales_order
        },
        bindSaved: (savedOrder) => {
          orderForm.setFieldsValue({ order_no: savedOrder.order_no })
          setEditingOrder(savedOrder)
          setSelectedOrder(savedOrder)
          if (createAttempt) {
            createAttemptsRef.current.clear(CREATE_SCOPE)
            createDraftValuesRef.current = null
            setOrderCreateResultUnknown(false)
          }
        },
      })
      if (saveResult.status === 'save_failed') {
        const saveError = saveResult.error
        if (createAttempt) {
          const unresolved =
            Boolean(retainedAttempt) || isMutationResultUnknown(saveError)
          setOrderCreateResultUnknown(unresolved)
          if (!unresolved) {
            createAttemptsRef.current.clear(CREATE_SCOPE)
            createDraftValuesRef.current = null
          }
        }
        if (isResourceVersionConflict(saveError)) {
          message.warning(
            '该单据已被其他人更新，本次内容没有覆盖最新数据。请核对最新单据后再保存。'
          )
        } else if (isMutationResultUnknown(saveError)) {
          message.warning(
            isCreatingOrder
              ? '保存结果尚未确认，请点击“核对保存结果”；将按原内容重试，不会重复创建订单。'
              : '保存结果尚未确认，请先核对该单据的最新状态，不要连续重复提交。'
          )
        } else {
          message.error(getActionErrorMessage(saveError, '保存销售订单'))
        }
        return
      }

      const { saved } = saveResult
      const attachmentEffect = await settleSourceDocumentPostSaveEffect(() =>
        orderAttachmentRef.current?.flushPendingAttachments(saved.id)
      )
      const attachmentSaved =
        attachmentEffect.status === 'fulfilled' &&
        attachmentEffect.value !== false
      if (attachmentEffect.status === 'rejected') {
        message.warning(
          getActionErrorMessage(attachmentEffect.error, '上传销售订单附件')
        )
      }
      message.success(
        attachmentSaved
          ? editingOrder?.id
            ? '销售订单已更新'
            : '销售订单已创建'
          : '销售订单已保存，未上传的附件请重新选择'
      )
      orderAttachmentRef.current?.clearPendingAttachments()
      setOrderModalOpen(false)
      if (isCreatingOrder) {
        resetBusinessPaginationCurrent(setPagination)
      } else {
        const refreshEffect =
          await settleSourceDocumentPostSaveEffect(loadOrders)
        if (refreshEffect.status === 'rejected') {
          message.warning(
            getActionErrorMessage(refreshEffect.error, '刷新销售订单列表')
          )
        }
      }
    } finally {
      saveInFlightRef.current = false
      setSaving(false)
    }
  }

  return {
    cancelOrderEdit,
    editingOrder,
    invalidatePendingEdit,
    itemLoading,
    openCreateOrder,
    openEditOrder,
    orderAttachmentRef,
    orderCreateResultUnknown,
    orderModalOpen,
    saveOrder,
  }
}
