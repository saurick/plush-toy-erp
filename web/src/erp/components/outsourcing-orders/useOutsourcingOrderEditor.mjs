import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Form } from 'antd'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { currentBusinessDate } from '../../utils/businessDate.mjs'
import {
  materialLabel,
  productLabel,
  processLabel,
  supplierLabel,
  unitLabel,
} from './OutsourcingOrderForm.jsx'
import {
  listAllOutsourcingOrderItems,
  listAllMaterials,
  listAllProcesses,
  listAllProducts,
  listAllProductSKUs,
  listAllContactsByOwner,
  listAllSuppliers,
  listAllUnits,
  listAllWarehouses,
  saveOutsourcingOrderWithItems,
} from '../../api/masterDataOrderApi.mjs'
import {
  buildSequentialDraftCode,
  createBlankOutsourcingLine,
  hasActionPermission,
  normalizeOutsourcingLineFormValue,
  unixToDateInputValue,
} from '../../utils/masterDataOrderView.mjs'
import {
  buildOutsourcingOrderItemParams,
  buildOutsourcingOrderParams,
} from '../../utils/sourceOrderParams.mjs'
import {
  buildOutsourcingOrderItemSourceValuesFromMaterial,
  buildOutsourcingOrderItemSourceValuesFromProduct,
  buildOutsourcingOrderItemSourceValuesFromProductSKU,
  buildOutsourcingOrderSubjectSwitchValues,
} from '../../utils/sourceOrderLineValues.mjs'
import {
  buildOutsourcingSupplierSnapshot,
  contractPartySnapshotFromPrintTemplateDefaults,
  buildSupplierSnapshot,
  buildSupplierSnapshotWithContacts,
  SUPPLIER_CONTACT_OWNER_TYPE,
} from '../../utils/sourcePartySnapshots.mjs'
import {
  buildSourceDocumentItemSaveParams,
  commitSourceDocumentSaveResult,
  createSourceDocumentOpenEditController,
  isMutationResultUnknown,
  isResourceVersionConflict,
  openSourceDocumentEditWithAccessGate,
  selectOpenSourceDocumentItems,
  settleSourceDocumentPostSaveEffect,
} from '../../utils/sourceDocumentMutation.mjs'
import { PROCESSING_CONTRACT_TEMPLATE_KEY } from '../../utils/printWorkspace.js'
import { getEffectivePrintTemplateDefaults } from '../../utils/adminProfileSync.mjs'
import { canEditOutsourcingOrder } from './outsourcingOrderPageConfig.mjs'

export function useOutsourcingOrderEditor({
  beginLatestRequest,
  adminProfile,
  rows,
  setSelectedRow,
  setSaving,
  setPagination,
  loadWorkflowTasks,
  loadOrders,
}) {
  const [form] = Form.useForm()

  const [itemsLoading, setItemsLoading] = useState(false)

  const [modalOpen, setModalOpen] = useState(false)

  const [editingRow, setEditingRow] = useState(null)

  const [detailOrder, setDetailOrder] = useState(null)

  const orderAttachmentRef = useRef(null)

  const [suppliers, setSuppliers] = useState([])

  const [supplierContacts, setSupplierContacts] = useState([])

  const [supplierContactsLoading, setSupplierContactsLoading] = useState(false)

  const supplierContactsRequestRef = useRef(0)

  const [products, setProducts] = useState([])

  const [productSKUs, setProductSKUs] = useState([])

  const [materials, setMaterials] = useState([])

  const [processes, setProcesses] = useState([])

  const [units, setUnits] = useState([])

  const [warehouses, setWarehouses] = useState([])

  const sourceDocumentOpenEditController = useMemo(
    () =>
      createSourceDocumentOpenEditController({
        beginLatestRequest,
        setLoading: setItemsLoading,
      }),
    [beginLatestRequest]
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

  const productOptions = useMemo(
    () =>
      products.map((item) => ({
        value: item.id,
        label: productLabel(item),
        item,
      })),
    [products]
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

  const processOptions = useMemo(
    () =>
      processes
        .filter((item) => item.outsourcing_enabled === true)
        .map((item) => ({
          value: item.id,
          label: processLabel(item),
          item,
        })),
    [processes]
  )

  const unitOptions = useMemo(
    () =>
      units.map((item) => ({
        value: item.id,
        label: unitLabel(item),
        precision:
          Number.isInteger(Number(item.precision)) &&
          Number(item.precision) >= 0
            ? Number(item.precision)
            : undefined,
        item,
      })),
    [units]
  )

  const unitByID = useMemo(
    () => new Map(units.map((item) => [item.id, item])),
    [units]
  )

  const loadReferenceData = useCallback(async () => {
    try {
      const [
        supplierData,
        productData,
        productSKUData,
        materialData,
        processData,
        unitData,
        warehouseData,
      ] = await Promise.all([
        listAllSuppliers({
          active_only: true,
          supplier_types: ['outsourcing', 'mixed'],
        }),
        listAllProducts({ active_only: true }),
        listAllProductSKUs(),
        listAllMaterials({ active_only: true }),
        listAllProcesses({ active_only: true }),
        listAllUnits(),
        listAllWarehouses({ active_only: true }),
      ])
      setSuppliers(supplierData?.suppliers || [])
      setProducts(productData?.products || [])
      setProductSKUs(productSKUData?.product_skus || [])
      setMaterials(materialData?.materials || [])
      setProcesses(processData?.processes || [])
      setUnits(unitData?.units || [])
      setWarehouses(warehouseData?.warehouses || [])
    } catch (error) {
      message.error(getActionErrorMessage(error, '加载加工基础资料失败'))
    }
  }, [])

  const loadOrderItems = useCallback(async (order, options = {}) => {
    if (!order?.id) {
      throw new Error('缺少加工合同，无法加载明细')
    }
    const data = await listAllOutsourcingOrderItems(
      {
        outsourcing_order_id: order.id,
        expected_version: order.version,
      },
      options
    )
    return data.outsourcing_order_items
  }, [])

  useEffect(() => {
    loadReferenceData()
  }, [loadReferenceData])

  const canUpdate = hasActionPermission(
    adminProfile,
    'outsourcing.order.update'
  )

  const processingPrintTemplateDefaults = useMemo(
    () =>
      getEffectivePrintTemplateDefaults(
        adminProfile,
        PROCESSING_CONTRACT_TEMPLATE_KEY
      ),
    [adminProfile]
  )

  const openCreate = () => {
    sourceDocumentOpenEditController.invalidate()
    orderAttachmentRef.current?.clearPendingAttachments()
    setEditingRow(null)
    form.setFieldsValue({
      outsourcing_order_no: buildSequentialDraftCode(rows, {
        prefix: 'OUT',
        field: 'outsourcing_order_no',
      }),
      supplier_id: undefined,
      currency: 'CNY',
      payment_term_days: undefined,
      supplier_snapshot: {},
      source_order_no: '',
      order_date: currentBusinessDate(),
      expected_return_date: '',
      contract_party_snapshot: contractPartySnapshotFromPrintTemplateDefaults(
        processingPrintTemplateDefaults,
        PROCESSING_CONTRACT_TEMPLATE_KEY
      ),
      note: '',
      items: [createBlankOutsourcingLine(1)],
    })
    setSupplierContacts([])
    setModalOpen(true)
  }

  const openEdit = async (record) => {
    const editResult = await openSourceDocumentEditWithAccessGate({
      canUpdate,
      document: record,
      invalidatePending: () => sourceDocumentOpenEditController.invalidate(),
      isEditable: canEditOutsourcingOrder,
      open: () =>
        sourceDocumentOpenEditController.open({
          loadItems: ({ signal }) => loadOrderItems(record, { signal }),
          enterEditing: (items) => {
            const openItems = selectOpenSourceDocumentItems(items)
            orderAttachmentRef.current?.clearPendingAttachments()
            setEditingRow(record)
            form.setFieldsValue({
              ...record,
              order_date: unixToDateInputValue(record.order_date),
              expected_return_date: unixToDateInputValue(
                record.expected_return_date
              ),
              contract_party_snapshot:
                record.contract_party_snapshot &&
                typeof record.contract_party_snapshot === 'object'
                  ? record.contract_party_snapshot
                  : contractPartySnapshotFromPrintTemplateDefaults(
                      processingPrintTemplateDefaults,
                      PROCESSING_CONTRACT_TEMPLATE_KEY
                    ),
              items:
                openItems.length > 0
                  ? openItems.map((item) =>
                      normalizeOutsourcingLineFormValue(item)
                    )
                  : [createBlankOutsourcingLine(1)],
            })
            loadSupplierContacts(record.supplier_id)
            setModalOpen(true)
          },
        }),
    })
    if (editResult.status === 'blocked') {
      if (editResult.reason === 'forbidden') {
        message.warning('当前账号没有编辑加工合同的权限。')
      } else if (editResult.reason === 'not_editable') {
        message.warning('加工合同提交后已冻结，不能继续编辑。')
      }
      return
    }
    if (editResult.status === 'load_failed') {
      message.error(
        `${getActionErrorMessage(
          editResult.error,
          '加载加工合同明细失败'
        )}，未进入编辑`
      )
    }
  }

  const openOutsourcingOrderDetails = (record) => {
    if (!record?.id) return
    sourceDocumentOpenEditController.invalidate()
    setSelectedRow(record)
    setDetailOrder(record)
  }

  const openOutsourcingOrderRecord = (record) => {
    if (!record?.id) return
    setSelectedRow(record)
    if (canUpdate && canEditOutsourcingOrder(record)) {
      setDetailOrder(null)
      openEdit(record)
      return
    }
    openOutsourcingOrderDetails(record)
  }

  const closeModal = () => {
    sourceDocumentOpenEditController.invalidate()
    orderAttachmentRef.current?.clearPendingAttachments()
    setModalOpen(false)
    setEditingRow(null)
    setSupplierContacts([])
    form.resetFields()
  }

  const setLineValues = (fieldName, values = {}) => {
    form.setFields(
      Object.entries(values).map(([key, value]) => ({
        name: ['items', fieldName, key],
        value,
      }))
    )
  }

  const handleSubjectTypeChange = (fieldName, subjectType) => {
    setLineValues(
      fieldName,
      buildOutsourcingOrderSubjectSwitchValues(subjectType)
    )
  }

  const handleProductChange = (fieldName, productID) => {
    const product = products.find((item) => item.id === productID)
    const unit = unitByID.get(product?.default_unit_id)
    setLineValues(
      fieldName,
      buildOutsourcingOrderItemSourceValuesFromProduct(product, unit)
    )
  }

  const handleProductSKUChange = (fieldName, productSKUID) => {
    const productSKU = productSKUs.find((item) => item.id === productSKUID)
    const productID = form.getFieldValue(['items', fieldName, 'product_id'])
    const product = products.find((item) => item.id === productID)
    const unit = unitByID.get(
      productSKU?.default_unit_id || product?.default_unit_id
    )
    setLineValues(
      fieldName,
      buildOutsourcingOrderItemSourceValuesFromProductSKU(productSKU, unit)
    )
  }

  const handleMaterialChange = (fieldName, materialID) => {
    const material = materials.find((item) => item.id === materialID)
    const unit = unitByID.get(material?.default_unit_id)
    setLineValues(
      fieldName,
      buildOutsourcingOrderItemSourceValuesFromMaterial(material, unit)
    )
  }

  const handleProcessChange = (fieldName, processID) => {
    const process = processes.find((item) => item.id === processID)
    if (!process) return
    form.setFieldValue(
      ['items', fieldName, 'process_name_snapshot'],
      process.name
    )
    form.setFieldValue(
      ['items', fieldName, 'process_category_snapshot'],
      process.category || ''
    )
    const supplierID = Number(form.getFieldValue('supplier_id') || 0)
    const supplier = suppliers.find(
      (item) => Number(item?.id || 0) === supplierID
    )
    const capabilityIDs = Array.isArray(supplier?.process_ids)
      ? supplier.process_ids.map(Number)
      : []
    if (
      capabilityIDs.length > 0 &&
      !capabilityIDs.includes(Number(processID))
    ) {
      message.warning(
        `“${supplier?.short_name || supplier?.name || '当前加工厂'}”档案中未登记“${process.name}”能力，请核对后再继续；本提示不会阻止保存。`
      )
    }
  }

  const handleUnitChange = (fieldName, unitID) => {
    const unit = unitByID.get(unitID)
    const productSKUID = form.getFieldValue([
      'items',
      fieldName,
      'product_sku_id',
    ])
    const productSKU = productSKUs.find((item) => item.id === productSKUID)
    setLineValues(fieldName, {
      unit_name_snapshot: unit?.name || '',
      ...(productSKU &&
      Number(productSKU.default_unit_id || 0) !== Number(unitID)
        ? { product_sku_id: undefined, sku_code_snapshot: '' }
        : {}),
    })
  }

  const loadSupplierContacts = useCallback(async (supplierID) => {
    const requestID = supplierContactsRequestRef.current + 1
    supplierContactsRequestRef.current = requestID
    if (!Number(supplierID || 0)) {
      setSupplierContacts([])
      setSupplierContactsLoading(false)
      return []
    }
    setSupplierContactsLoading(true)
    try {
      const data = await listAllContactsByOwner({
        owner_type: SUPPLIER_CONTACT_OWNER_TYPE,
        owner_id: supplierID,
        active_only: true,
      })
      const contacts = Array.isArray(data?.contacts) ? data.contacts : []
      if (supplierContactsRequestRef.current === requestID) {
        setSupplierContacts(contacts)
      }
      return contacts
    } catch (error) {
      if (supplierContactsRequestRef.current === requestID) {
        setSupplierContacts([])
        message.warning(getActionErrorMessage(error, '加载加工厂联系人'))
      }
      return []
    } finally {
      if (supplierContactsRequestRef.current === requestID) {
        setSupplierContactsLoading(false)
      }
    }
  }, [])

  const handleSupplierChange = (supplierID) => {
    const supplier = suppliers.find((item) => item.id === supplierID)
    form.setFieldValue('supplier_snapshot', buildSupplierSnapshot(supplier))
    if (!editingRow?.id) {
      const termDays = supplier?.default_payment_term_days
      const normalizedTermDays = Number(termDays)
      form.setFieldValue(
        'payment_term_days',
        termDays !== undefined &&
          termDays !== null &&
          termDays !== '' &&
          Number.isFinite(normalizedTermDays) &&
          Number.isInteger(normalizedTermDays) &&
          normalizedTermDays >= 0
          ? normalizedTermDays
          : undefined
      )
    }
    setSupplierContacts([])
    loadSupplierContacts(supplierID).then((contacts) => {
      if (
        String(form.getFieldValue('supplier_id') ?? '') !==
        String(supplierID ?? '')
      ) {
        return
      }
      form.setFieldValue(
        'supplier_snapshot',
        buildSupplierSnapshotWithContacts(supplier, contacts)
      )
    })
  }

  const handleSupplierContactNameChange = () => {
    form.setFields([
      { name: ['supplier_snapshot', 'contact_id'], value: undefined },
      { name: ['supplier_snapshot', 'contact_phone'], value: '' },
      { name: ['supplier_snapshot', 'contact_mobile'], value: '' },
    ])
  }

  const handleSupplierContactSelect = (contact) => {
    form.setFields([
      {
        name: ['supplier_snapshot', 'contact_id'],
        value: Number(contact?.id || 0) || undefined,
      },
      {
        name: ['supplier_snapshot', 'contact_name'],
        value: contact?.name || '',
      },
      {
        name: ['supplier_snapshot', 'contact_phone'],
        value: contact?.phone || contact?.mobile || '',
      },
      {
        name: ['supplier_snapshot', 'contact_mobile'],
        value: contact?.mobile || '',
      },
    ])
  }

  const submitForm = async () => {
    const isCreatingOrder = !editingRow?.id
    setSaving(true)
    try {
      let payload
      try {
        const values = await form.validateFields()
        const supplier = suppliers.find(
          (item) => item.id === values.supplier_id
        )
        const supplierSnapshot = buildOutsourcingSupplierSnapshot(
          supplier,
          values.supplier_snapshot
        )
        payload = buildOutsourcingOrderParams(
          {
            ...values,
            supplier_snapshot: supplierSnapshot,
          },
          {
            id: editingRow?.id || undefined,
            expected_version: editingRow?.id ? editingRow.version : undefined,
            items: buildSourceDocumentItemSaveParams(
              values.items,
              buildOutsourcingOrderItemParams
            ),
          }
        )
      } catch (error) {
        if (!error?.errorFields) {
          message.error(getActionErrorMessage(error, '准备加工合同保存'))
        }
        return
      }

      const saveResult = await commitSourceDocumentSaveResult({
        save: async () => {
          const result = await saveOutsourcingOrderWithItems(payload)
          return result.outsourcing_order
        },
        bindSaved: (savedOrder) => {
          setEditingRow(savedOrder)
          setSelectedRow(savedOrder)
        },
      })
      if (saveResult.status === 'save_failed') {
        const saveError = saveResult.error
        if (isResourceVersionConflict(saveError)) {
          message.warning(
            '该单据已被其他人更新，本次内容没有覆盖最新数据。请核对最新单据后再保存。'
          )
        } else if (isMutationResultUnknown(saveError)) {
          message.warning(
            '保存结果尚未确认，请先核对该单据的最新状态，不要连续重复提交。'
          )
        } else {
          message.error(getActionErrorMessage(saveError, '保存加工合同失败'))
        }
        return
      }

      const { saved: savedOrder } = saveResult
      const attachmentEffect = await settleSourceDocumentPostSaveEffect(() =>
        orderAttachmentRef.current?.flushPendingAttachments(savedOrder.id)
      )
      const attachmentSaved =
        attachmentEffect.status === 'fulfilled' &&
        attachmentEffect.value !== false
      if (attachmentEffect.status === 'rejected') {
        message.warning(
          getActionErrorMessage(attachmentEffect.error, '上传加工合同附件')
        )
      }
      message.success(
        attachmentSaved
          ? editingRow
            ? '加工合同已更新'
            : '加工合同已创建'
          : '加工合同已保存，未上传的附件请重新选择'
      )
      closeModal()
      const refreshEffect = await settleSourceDocumentPostSaveEffect(
        async () => {
          if (isCreatingOrder) {
            setPagination((current) => ({ ...current, current: 1 }))
            await loadWorkflowTasks()
            return
          }
          await Promise.all([loadOrders(), loadWorkflowTasks()])
        }
      )
      if (refreshEffect.status === 'rejected') {
        message.warning(
          getActionErrorMessage(
            refreshEffect.error,
            '刷新加工合同列表和相关任务'
          )
        )
      }
    } finally {
      setSaving(false)
    }
  }
  return {
    form,
    itemsLoading,
    modalOpen,
    editingRow,
    detailOrder,
    setDetailOrder,
    orderAttachmentRef,
    suppliers,
    supplierContacts,
    supplierContactsLoading,
    productSKUs,
    warehouses,
    setWarehouses,
    supplierOptions,
    productOptions,
    materialOptions,
    processOptions,
    unitOptions,
    loadOrderItems,
    canUpdate,
    processingPrintTemplateDefaults,
    openCreate,
    openEdit,
    openOutsourcingOrderRecord,
    closeModal,
    handleSubjectTypeChange,
    handleProductChange,
    handleProductSKUChange,
    handleMaterialChange,
    handleProcessChange,
    handleUnitChange,
    handleSupplierChange,
    handleSupplierContactNameChange,
    handleSupplierContactSelect,
    submitForm,
  }
}
