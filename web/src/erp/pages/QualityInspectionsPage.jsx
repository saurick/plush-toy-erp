import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  DownOutlined,
  EyeOutlined,
  FileDoneOutlined,
  LinkOutlined,
  PlusOutlined,
  RollbackOutlined,
  StopOutlined,
} from '@ant-design/icons'
import {
  Alert,
  Button,
  Descriptions,
  Dropdown,
  Form,
  Popconfirm,
  Select,
  Space,
  Tag,
  Typography,
} from 'antd'
import { useOutletContext, useSearchParams } from 'react-router-dom'
import { PurchaseReceiptStatus, PurchaseReturnStatus, QualityInspectionStatus } from '../../common/consts/statuses.generated.mjs'
import { showPageLoadError } from '../components/PageLoadFeedback.jsx'
import BusinessTaskActions from '../components/workflow/BusinessTaskActions.jsx'
import useWorkflowTaskBusinessResult from '../hooks/useWorkflowTaskBusinessResult.js'
import useBusinessNavigate from '../hooks/useBusinessNavigate.js'
import { PermissionCode } from '../../common/consts/permissions.generated.mjs'
import { resolveBusinessStatusCounts } from '../utils/businessStatusCounts.mjs'
import BusinessStatusFilter from '../components/business-list/BusinessStatusFilter.jsx'
import { IncomingCheckItemsDetails } from '../components/quality-inspections/IncomingCheckItems.jsx'
import { BUSINESS_SEARCH_SCOPES } from '../utils/businessSearchScopes.mjs'
import ProductIdentity from '../components/master-data/ProductIdentity.jsx'
import useQualityInspectionReferences from '../components/quality-inspections/useQualityInspectionReferences.js'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { isRpcAbortError } from '@/common/utils/jsonRpc'
import useLatestRequestCoordinator from '../hooks/useLatestRequestCoordinator.js'
import {
  getQualityInspection,
  submitQualityInspection,
} from '../api/qualityApi.mjs'
import {
  createPurchaseReturnFromQualityInspection,
  getPurchaseReceipt,
  listAllPurchaseReturns,
} from '../api/purchaseApi.mjs'
import {
  BusinessActionTooltip,
  BusinessDataTable,
  BusinessOperationPanel,
  BusinessPageLayout,
  DateRangeFilter,
  PageHeaderCard,
  SearchInput,
  SelectFilter,
  SelectionActionBar,
  SelectionClearAction,
  ToolbarButton,
} from '../components/business-list/BusinessListLayout.jsx'
import { BusinessListToolbarActions, useBusinessColumnOrder } from '../components/business-list/BusinessListToolbarActions.jsx'
import BusinessModal from '../components/business-list/BusinessModal.jsx'
import BusinessFormModal from '../components/business-list/BusinessFormModal.jsx'
import BusinessFormPage from '../components/business-list/BusinessFormPage.jsx'
import BusinessDetailsModal from '../components/business-list/BusinessDetailsModal.jsx'
import BusinessAttachmentPanel from '../components/business-list/BusinessAttachmentPanel.jsx'
import QualityInspectionPurchaseReturnModal from '../components/quality-inspections/QualityInspectionPurchaseReturnModal.jsx'
import PurchaseRejectionDispositionModal from '../components/quality-inspections/PurchaseRejectionDispositionModal.jsx'
import OutsourcingReturnDispositionModal from '../components/quality-inspections/OutsourcingReturnDispositionModal.jsx'
import ProductionExceptionRequestModal from '../components/quality-inspections/ProductionExceptionRequestModal.jsx'
import {
  QualityInspectionCreateForm,
  QualityInspectionDecisionForm,
  positiveInt,
} from '../components/quality-inspections/QualityInspectionForms.jsx'
import {
  buildQualityInspectionDataColumns,
  buildQualityInspectionExportColumns,
  isProductionStageQualityInspection,
  productionQualityGateLabel,
  QUALITY_DATE_FILTER_OPTIONS,
  QUALITY_INSPECTION_TYPE_LABELS,
  QUALITY_INSPECTION_TYPE_FILTER_OPTIONS,
  QUALITY_INSPECTIONS_MODULE_KEY,
  QUALITY_RESULT_FILTER_OPTIONS,
  QUALITY_STATUS_OPTIONS,
} from '../components/quality-inspections/qualityInspectionColumns.jsx'
import { formatQuantity } from '../utils/businessLineItems.mjs'
import { resolveContextualBusinessActionAvailability } from '../utils/businessActionAvailability.mjs'
import { resolveRelatedRecordActionAvailability } from '../utils/operationalActionAvailability.mjs'
import {
  hasActionPermission,
  statusText,
  BUSINESS_ROUTE_PATHS,
} from '../utils/masterDataOrderView.mjs'
import { compactParams, trimOptional } from '../utils/sourceDocumentValues.mjs'
import { currentBusinessDate } from '../utils/businessDate.mjs'
import {
  createBusinessTablePagination,
  resetBusinessPaginationCurrent,
  resolveExactRecordPage,
} from '../utils/businessPagination.mjs'
import { applyEffectiveFieldPolicyFlags } from '../utils/adminProfileSync.mjs'
import {
  inventoryLotOption,
  materialOption,
  productOption,
  purchaseReceiptItemOption,
  purchaseReceiptOption,
  referenceLabel,
  uniqueReferenceOptions,
  warehouseOptionFromRecord,
} from '../utils/referenceSelectOptions.mjs'
import {
  searchParamPositiveInt,
  searchParamText,
} from '../utils/routeQuery.mjs'
import {
  canOpenRelatedDocumentPath,
  clearLinkedDocumentParams,
  linkedDocumentContext,
  relatedDocumentRoute,
} from '../utils/relatedDocumentNavigation.mjs'
import {
  buildPurchaseReturnFromQualityInspectionPayload,
  canCreatePurchaseReturnFromRejectedInspection,
  canCreatePurchaseRejectionDispositionFromInspection,
  isQualityInspectionRouteSourceCompatible,
  isRejectedIncomingInspection,
} from '../utils/qualityInspectionSourceAction.mjs'
import { createSourceBusinessActionAttemptStore } from '../utils/sourceBusinessAction.mjs'
import useBusinessListExport from '../hooks/useBusinessListExport.js'
import { loadQualityInspectionList as queryQualityInspections, loadQualityInspectionExport } from '../components/quality-inspections/qualityInspectionQueries.mjs'
import useQualityInspectionEditor from '../components/quality-inspections/useQualityInspectionEditor.js'
import useQualityInspectionActions from '../components/quality-inspections/useQualityInspectionActions.js'

const EMPTY_ADMIN_PROFILE = Object.freeze({})
const PURCHASE_RECEIPT_STATUS_LABELS = Object.freeze({
  [PurchaseReceiptStatus.DRAFT]: '草稿',
  [PurchaseReceiptStatus.POSTED]: '已过账',
  [PurchaseReceiptStatus.CANCELLED]: '已取消',
})
const { Text } = Typography

function findByPositiveID(id, records = []) {
  const targetID = positiveInt(id)
  if (!targetID) return null
  return (Array.isArray(records) ? records : []).find(
    (record) => Number(record?.id || record?.lot_id || 0) === targetID
  )
}

function buildDecisionSourceSummary({
  inspection,
  allPurchaseReceiptItemOptions,
  inventoryLotOptions,
  materialOptions,
  productOptions,
  purchaseReceiptOptions,
}) {
  const sourceType = String(inspection?.source_type || '').toUpperCase()
  const subjectType = String(inspection?.subject_type || '').toUpperCase()
  const inspectionType =
    QUALITY_INSPECTION_TYPE_LABELS[
      String(inspection?.inspection_type || '').toUpperCase()
    ] || '质量检验'
  const visibleWipText = (value) => String(value ?? '').trim() || '—'

  if (isProductionStageQualityInspection(inspection)) {
    return {
      sourceNo: visibleWipText(inspection?.production_order_no),
      primary: [
        `检验类型：${inspectionType}`,
        `质量关口：${productionQualityGateLabel(inspection?.gate_code)}`,
      ].join('；'),
      secondary: [
        `产品：${visibleWipText(
          inspection?.product_code
        )} / ${visibleWipText(inspection?.product_name)}`,
        `生产工序：${visibleWipText(inspection?.operation_name)}`,
        `在制批次：${visibleWipText(inspection?.wip_batch_no)}`,
        `批次数量：${visibleWipText(inspection?.batch_quantity)}`,
      ].join('；'),
    }
  }

  const recordedSourceNo = trimOptional(inspection?.source_no)
  let sourceNo = recordedSourceNo
  if (!sourceNo && sourceType === 'PURCHASE_RECEIPT') {
    sourceNo = referenceLabel(
      purchaseReceiptOptions,
      inspection?.purchase_receipt_id,
      '采购入库已关联'
    )
  }
  if (!sourceNo && sourceType === 'OUTSOURCING_FACT') {
    sourceNo = '委外回货单已关联'
  }
  if (!sourceNo && sourceType === 'SHIPMENT') {
    sourceNo = '出货单已关联'
  }

  const sourceLine =
    sourceType === 'PURCHASE_RECEIPT' && inspection?.purchase_receipt_item_id
      ? referenceLabel(
          allPurchaseReceiptItemOptions,
          inspection.purchase_receipt_item_id,
          '入库行已关联'
        )
      : ''
  const subject =
    subjectType === 'PRODUCT'
      ? referenceLabel(productOptions, inspection?.subject_id, '产品已关联')
      : referenceLabel(
          materialOptions,
          inspection?.material_id || inspection?.subject_id,
          '材料已关联'
        )
  const lot = inspection?.inventory_lot_id
    ? referenceLabel(
        inventoryLotOptions,
        inspection.inventory_lot_id,
        '批次已关联'
      )
    : ''

  return {
    sourceNo: sourceNo || '来源单据已关联',
    primary: [
      `检验类型：${inspectionType}`,
      sourceLine ? `来源行：${sourceLine}` : '',
    ]
      .filter(Boolean)
      .join('；'),
    secondary: [
      subject ? `产品或材料：${subject}` : '',
      lot ? `批次：${lot}` : '',
    ]
      .filter(Boolean)
      .join('；'),
  }
}

export default function QualityInspectionsPage() {
  const outletContext = useOutletContext()
  const reportBusinessResult = useWorkflowTaskBusinessResult()
  const taskHandling = outletContext?.workflowTaskNavigation?.productionHandling
  const taskEntryRef = useRef(0)
  const [qualityTaskFocusOpen, setQualityTaskFocusOpen] = useState(false)
  const navigate = useBusinessNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const adminProfile = useMemo(
    () => outletContext?.adminProfile || EMPTY_ADMIN_PROFILE,
    [outletContext?.adminProfile]
  )
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [statusCounts, setStatusCounts] = useState(null)
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [resultFilter, setResultFilter] = useState('')
  const [inspectionTypeFilter, setInspectionTypeFilter] = useState('')
  const [dateFilterField, setDateFilterField] = useState('inspected_at')
  const [dateFilterStart, setDateFilterStart] = useState('')
  const [dateFilterEnd, setDateFilterEnd] = useState('')
  const [purchaseReceiptFilter, setPurchaseReceiptFilter] = useState('')
  const [materialFilter, setMaterialFilter] = useState('')
  const [warehouseFilter, setWarehouseFilter] = useState('')
  const [lotFilter, setLotFilter] = useState('')
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20 })
  const [loading, setLoading] = useState(false)
  const [selectedRow, setSelectedRow] = useState(null)
  const [detailInspection, setDetailInspection] = useState(null)
  const [purchaseReturnModal, setPurchaseReturnModal] = useState(null)
  const [rejectionDispositionOpen, setRejectionDispositionOpen] =
    useState(false)
  const [outsourcingDispositionOpen, setOutsourcingDispositionOpen] =
    useState(false)
  const [productionExceptionOpen, setProductionExceptionOpen] = useState(false)
  const [purchaseReturnLoading, setPurchaseReturnLoading] = useState(false)
  const [selectedRowPurchaseReceipt, setSelectedRowPurchaseReceipt] =
    useState(null)
  const [
    selectedRowPurchaseReceiptLoading,
    setSelectedRowPurchaseReceiptLoading,
  ] = useState(false)
  const [returnedInspectionIDs, setReturnedInspectionIDs] = useState(
    () => new Set()
  )
  const {
    purchaseReceipts,
    inventoryLots,
    materials,
    products,
    warehouses,
    referenceDataState,
    loadReferenceOptions,
  } = useQualityInspectionReferences({ adminProfile })

  const inspectionEditor = useQualityInspectionEditor({ rows, referenceDataState })
  const {
    saving, inspectionModal, inspectionForm, decisionForm, inspectionAttachmentRef,
    openCreate, openDecision, closeModal, handleReceiptChange,
  } = inspectionEditor
  const purchaseReturnInFlightRef = useRef(false)
  const purchaseReturnAttemptsRef = useRef(
    createSourceBusinessActionAttemptStore()
  )
  const detailRequestRef = useRef(0)
  const selectedRowPurchaseReceiptRequestRef = useRef(0)
  useEffect(
    () => () => {
      detailRequestRef.current += 1
    },
    []
  )
  const routePurchaseOrderID = searchParamPositiveInt(
    searchParams,
    'purchase_order_id'
  )
  const routePurchaseReceiptID = searchParamPositiveInt(
    searchParams,
    'purchase_receipt_id'
  )
  const routeQualityInspectionID = searchParamPositiveInt(
    searchParams,
    'quality_inspection_id'
  )
  const routeSourceType = searchParamText(searchParams, 'source_type')
  const routeSourceID = searchParamPositiveInt(searchParams, 'source_id')
  const linkedKeyword = linkedDocumentContext(searchParams).keyword
  const resolvedRouteKeyword =
    routeQualityInspectionID &&
    Number(selectedRow?.id || 0) === Number(routeQualityInspectionID)
      ? String(selectedRow?.inspection_no || '').trim()
      : ''
  const allowedMenuPaths = useMemo(
    () => outletContext?.allowedMenuPaths || [],
    [outletContext?.allowedMenuPaths]
  )
  const canOpenRelatedPath = useCallback(
    (path) =>
      canOpenRelatedDocumentPath({
        path,
        adminProfile,
        allowedMenuPaths,
      }),
    [adminProfile, allowedMenuPaths]
  )

  const beginLatestRequest = useLatestRequestCoordinator()
  const selectedPurchaseReceiptID = Form.useWatch(
    'purchase_receipt_id',
    inspectionForm
  )
  const selectedPurchaseReceiptItemID = Form.useWatch(
    'purchase_receipt_item_id',
    inspectionForm
  )

  const canCreate = hasActionPermission(
    adminProfile,
    PermissionCode.QUALITY_INSPECTION_CREATE
  )
  const canUpdate = hasActionPermission(
    adminProfile,
    PermissionCode.QUALITY_INSPECTION_UPDATE
  )
  const canCreatePurchaseReturn = hasActionPermission(
    adminProfile,
    PermissionCode.PURCHASE_RETURN_CREATE
  )
  const canReadPurchaseReturn = hasActionPermission(
    adminProfile,
    PermissionCode.PURCHASE_RETURN_READ
  )
  const canPostPurchaseReturn = hasActionPermission(
    adminProfile,
    PermissionCode.PURCHASE_RETURN_POST
  )
  const canCancelPurchaseReturn = hasActionPermission(
    adminProfile,
    PermissionCode.PURCHASE_RETURN_CANCEL
  )
  const canPostOutsourcingDisposition = hasActionPermission(
    adminProfile,
    PermissionCode.OUTSOURCING_FACT_POST
  )
  const canCancelOutsourcingDisposition = hasActionPermission(
    adminProfile,
    PermissionCode.OUTSOURCING_FACT_CANCEL
  )
  const canReadOutsourcingDisposition = hasActionPermission(
    adminProfile,
    PermissionCode.OUTSOURCING_FACT_READ
  )
  const canHandleQualityException = hasActionPermission(
    adminProfile,
    PermissionCode.QUALITY_EXCEPTION_HANDLE
  )
  const canSubmitProductionException = hasActionPermission(
    adminProfile,
    PermissionCode.PRODUCTION_EXCEPTION_SUBMIT
  )
  const canManageOutsourcingDisposition =
    canHandleQualityException ||
    canPostOutsourcingDisposition ||
    canCancelOutsourcingDisposition
  const canReadPurchaseReceipt = hasActionPermission(
    adminProfile,
    PermissionCode.PURCHASE_RECEIPT_READ
  )
  const canReadInventory = hasActionPermission(
    adminProfile,
    PermissionCode.WAREHOUSE_INVENTORY_READ
  )
  const canReadShipment = hasActionPermission(
    adminProfile,
    PermissionCode.SHIPMENT_READ
  )
  const activeCustomerKey = adminProfile?.effective_session?.customer?.key || ''
  const selectedSourceType = String(
    selectedRow?.source_type || ''
  ).toUpperCase()
  const canOpenInventory =
    canReadInventory && canOpenRelatedPath(BUSINESS_ROUTE_PATHS.inventory)
  const canOpenPurchaseReceipts =
    canReadPurchaseReceipt &&
    canOpenRelatedPath(BUSINESS_ROUTE_PATHS.purchaseReceipts)
  const canOpenShipments =
    canReadShipment && canOpenRelatedPath(BUSINESS_ROUTE_PATHS.shipments)
  const hasRelatedCapability =
    canOpenInventory || canOpenPurchaseReceipts || canOpenShipments
  const relatedMenuItems = useMemo(() => {
    if (selectedSourceType === 'PURCHASE_RECEIPT') {
      return [
        canOpenPurchaseReceipts
          ? { key: 'purchase-receipts', label: '采购入库' }
          : null,
        canOpenInventory ? { key: 'inventory', label: '库存台账' } : null,
      ].filter(Boolean)
    }
    if (selectedSourceType === 'SHIPMENT') {
      return [
        canOpenShipments ? { key: 'shipments', label: '出货单' } : null,
        canOpenInventory ? { key: 'inventory', label: '库存台账' } : null,
      ].filter(Boolean)
    }
    if (selectedSourceType === 'PRODUCTION_WIP') return []
    return canOpenInventory ? [{ key: 'inventory', label: '库存台账' }] : []
  }, [
    canOpenInventory,
    canOpenPurchaseReceipts,
    canOpenShipments,
    selectedSourceType,
  ])
  const relatedActionAvailability = resolveRelatedRecordActionAvailability({
    authorized: hasRelatedCapability,
    record: selectedRow,
    itemCount: relatedMenuItems.length,
  })

  const purchaseReceiptOptions = useMemo(
    () => uniqueReferenceOptions(purchaseReceipts, purchaseReceiptOption),
    [purchaseReceipts]
  )
  const purchaseReceiptItemOptions = useMemo(
    () =>
      uniqueReferenceOptions(
        purchaseReceipts
          .filter((receipt) => {
            const selectedReceiptID = positiveInt(selectedPurchaseReceiptID)
            return (
              !selectedReceiptID ||
              Number(receipt.id || 0) === selectedReceiptID
            )
          })
          .flatMap((receipt) =>
            Array.isArray(receipt?.items) ? receipt.items : []
          ),
        purchaseReceiptItemOption
      ),
    [purchaseReceipts, selectedPurchaseReceiptID]
  )
  const purchaseReceiptItems = useMemo(
    () =>
      purchaseReceipts.flatMap((receipt) =>
        Array.isArray(receipt?.items) ? receipt.items : []
      ),
    [purchaseReceipts]
  )
  const allPurchaseReceiptItemOptions = useMemo(
    () =>
      uniqueReferenceOptions(purchaseReceiptItems, purchaseReceiptItemOption),
    [purchaseReceiptItems]
  )
  const inventoryLotOptions = useMemo(
    () => uniqueReferenceOptions(inventoryLots, inventoryLotOption),
    [inventoryLots]
  )
  const materialOptions = useMemo(
    () => uniqueReferenceOptions(materials, materialOption),
    [materials]
  )
  const productOptions = useMemo(
    () => uniqueReferenceOptions(products, productOption),
    [products]
  )
  const warehouseOptions = useMemo(
    () => uniqueReferenceOptions(warehouses, warehouseOptionFromRecord),
    [warehouses]
  )
  const selectedPurchaseReceipt = useMemo(
    () => findByPositiveID(selectedPurchaseReceiptID, purchaseReceipts) || null,
    [purchaseReceipts, selectedPurchaseReceiptID]
  )
  const selectedRowCanCreatePurchaseReturn =
    canCreatePurchaseReturnFromRejectedInspection(
      selectedRow,
      selectedRowPurchaseReceipt
    )
  const selectedRowCanCreateRejectionDisposition = canCreatePurchaseRejectionDispositionFromInspection(selectedRow, selectedRowPurchaseReceipt)
  const selectedQualityStatus = String(selectedRow?.status || '').toUpperCase()
  const selectedIsCorrectionInspection = Boolean(selectedRow?.correction_of_inspection_id)
  const selectedInspectionType = String(
    selectedRow?.inspection_type || ''
  ).toUpperCase()
  const selectedIsIncomingInspection =
    selectedSourceType === 'PURCHASE_RECEIPT' &&
    selectedInspectionType === 'INCOMING'
  const selectedIsOutsourcingInspection =
    selectedSourceType === 'OUTSOURCING_FACT' &&
    selectedInspectionType === 'OUTSOURCING_RETURN'
  const selectedIsProductionInspection =
    Number(selectedRow?.production_wip_batch_id || 0) > 0
  const selectedDispositionSourceSupported =
    selectedIsIncomingInspection ||
    selectedIsOutsourcingInspection ||
    selectedIsProductionInspection
  const selectedDispositionAuthorized = selectedIsIncomingInspection
    ? canCreatePurchaseReturn
    : selectedIsOutsourcingInspection
      ? canManageOutsourcingDisposition
      : selectedIsProductionInspection
        ? canSubmitProductionException
        : false
  const selectedDispositionCompleted =
    [QualityInspectionStatus.PASSED, QualityInspectionStatus.CANCELLED].includes(selectedQualityStatus) ||
    (selectedIsIncomingInspection &&
      Boolean(selectedRow?.id) &&
      returnedInspectionIDs.has(selectedRow.id))
  const hasAnyDispositionCapability =
    canCreatePurchaseReturn ||
    canManageOutsourcingDisposition ||
    canSubmitProductionException
  const showQualityDispositionAction =
    hasAnyDispositionCapability &&
    (!selectedRow ||
      (selectedQualityStatus === QualityInspectionStatus.REJECTED &&
        selectedDispositionSourceSupported &&
        selectedDispositionAuthorized &&
        !selectedDispositionCompleted))
  const selectedDispositionKind = selectedIsIncomingInspection
    ? selectedRowCanCreateRejectionDisposition
      ? 'incoming-rejection'
      : selectedRowCanCreatePurchaseReturn
        ? 'incoming-return'
        : ''
    : selectedIsOutsourcingInspection
      ? 'outsourcing'
      : selectedIsProductionInspection
        ? 'production'
        : ''
  const qualityDispositionDisabled =
    !selectedRow ||
    !selectedDispositionSourceSupported ||
    !selectedDispositionAuthorized ||
    selectedDispositionCompleted ||
    selectedQualityStatus !== QualityInspectionStatus.REJECTED ||
    (selectedIsIncomingInspection && selectedRowPurchaseReceiptLoading) ||
    !selectedDispositionKind ||
    (selectedDispositionKind === 'incoming-rejection' &&
      !selectedRowCanCreateRejectionDisposition) ||
    (selectedDispositionKind === 'incoming-return' &&
      (!selectedRowCanCreatePurchaseReturn ||
        referenceDataState !== 'ready' ||
        purchaseReturnLoading)) ||
    saving
  const qualityDispositionDisabledReason = !selectedRow
    ? '请先选择一条质检记录'
    : !selectedDispositionSourceSupported
      ? '当前质检来源不支持在此办理不合格处置'
      : !selectedDispositionAuthorized
        ? '当前账号不能办理该来源的不合格处置'
        : selectedDispositionCompleted
          ? '当前质检的不合格处置已完成'
          : selectedQualityStatus !== QualityInspectionStatus.REJECTED
            ? '质检判定不合格后可办理处置'
            : selectedIsIncomingInspection && selectedRowPurchaseReceiptLoading
              ? '正在核对来源单据状态'
              : !selectedDispositionKind
                ? '当前来源单据状态暂不能办理不合格处置'
                : selectedDispositionKind === 'incoming-rejection' &&
                    !selectedRowCanCreateRejectionDisposition
                  ? '首次来料不合格处置条件尚未满足'
                  : selectedDispositionKind === 'incoming-return' &&
                      referenceDataState !== 'ready'
                    ? referenceDataState === 'loading'
                      ? '正在加载质检来源资料'
                      : '质检来源资料加载失败，请刷新当前页后重试'
                    : selectedDispositionKind === 'incoming-return' &&
                        !selectedRowCanCreatePurchaseReturn
                      ? '未能确认来源收货已入库，暂不能生成采购退货'
                      : purchaseReturnLoading || saving
                        ? '当前操作完成后可继续处置'
                        : ''
  const showReadOnlyOutsourcingDisposition =
    canReadOutsourcingDisposition && !canManageOutsourcingDisposition
  const outsourcingDispositionViewAvailability =
    resolveContextualBusinessActionAvailability({
      authorized: showReadOnlyOutsourcingDisposition,
      selected: Boolean(selectedRow),
      relevant:
        selectedIsOutsourcingInspection && selectedQualityStatus === QualityInspectionStatus.REJECTED,
      busy: saving,
      busyReason: '当前操作完成后可查看委外处置',
    })
  const selectedPurchaseReceiptItem = useMemo(
    () =>
      findByPositiveID(selectedPurchaseReceiptItemID, purchaseReceiptItems) ||
      null,
    [purchaseReceiptItems, selectedPurchaseReceiptItemID]
  )
  const purchaseReturnSourceSummary = useMemo(() => {
    const inspection = purchaseReturnModal?.inspection
    const receipt =
      findByPositiveID(inspection?.purchase_receipt_id, purchaseReceipts) ||
      (positiveInt(selectedRowPurchaseReceipt?.id) ===
      positiveInt(inspection?.purchase_receipt_id)
        ? selectedRowPurchaseReceipt
        : null)
    const item =
      findByPositiveID(
        inspection?.purchase_receipt_item_id,
        purchaseReceiptItems
      ) ||
      findByPositiveID(
        inspection?.purchase_receipt_item_id,
        Array.isArray(receipt?.items) ? receipt.items : []
      )
    return {
      receipt: receipt?.receipt_no || '采购入库已关联',
      supplier: receipt?.supplier_name || '供应商已关联',
      material: referenceLabel(
        materialOptions,
        item?.material_id || inspection?.material_id,
        '材料'
      ),
      warehouse: referenceLabel(
        warehouseOptions,
        item?.warehouse_id || inspection?.warehouse_id,
        '仓库'
      ),
      lot: referenceLabel(
        inventoryLotOptions,
        item?.lot_id || inspection?.inventory_lot_id,
        '批次'
      ),
    }
  }, [
    inventoryLotOptions,
    materialOptions,
    purchaseReceiptItems,
    purchaseReceipts,
    purchaseReturnModal?.inspection,
    selectedRowPurchaseReceipt,
    warehouseOptions,
  ])

  const openRelatedTable = ({ key }) => {
    if (!selectedRow) return
    const pathByKey = {
      'purchase-receipts': relatedDocumentRoute(
        BUSINESS_ROUTE_PATHS.purchaseReceipts,
        { receipt_id: selectedRow.purchase_receipt_id },
        {
          keyword: selectedRow.source_no,
          source: 'quality-inspection',
          fields: ['receipt_no'],
        }
      ),
      shipments: relatedDocumentRoute(
        BUSINESS_ROUTE_PATHS.shipments,
        { shipment_id: selectedRow.source_id },
        {
          keyword: selectedRow.source_no,
          source: 'quality-inspection',
          fields: ['shipment_no'],
        }
      ),
      inventory: relatedDocumentRoute(
        BUSINESS_ROUTE_PATHS.inventory,
        {
          source_type: selectedRow.source_type,
          source_id: selectedRow.source_id,
          lot_id: selectedRow.inventory_lot_id,
          view: 'txns',
        },
        {
          keyword: selectedRow.source_no,
          source: 'quality-inspection',
          fields: ['source_no'],
        }
      ),
    }
    const targetPath = pathByKey[key]
    if (targetPath) {
      navigate(targetPath)
    }
  }

  const qualityQuery = useMemo(
    () => ({
      filters: { dateFilterEnd, dateFilterField, dateFilterStart, inspectionTypeFilter, keyword, lotFilter, materialFilter, purchaseReceiptFilter, resultFilter, statusFilter, warehouseFilter },
      context: { linkedKeyword, routePurchaseOrderID, routePurchaseReceiptID, routeQualityInspectionID, routeSourceID, routeSourceType },
      pagination,
      customerKey: activeCustomerKey,
    }),
    [
      activeCustomerKey,
      dateFilterEnd,
      dateFilterField,
      dateFilterStart,
      inspectionTypeFilter,
      keyword,
      linkedKeyword,
      lotFilter,
      materialFilter,
      pagination,
      purchaseReceiptFilter,
      resultFilter,
      routePurchaseOrderID,
      routePurchaseReceiptID,
      routeQualityInspectionID,
      routeSourceID,
      routeSourceType,
      statusFilter,
      warehouseFilter,
    ]
  )
  const loadQualityInspectionList = useCallback(
    (options) => queryQualityInspections({ ...qualityQuery, ...options }),
    [qualityQuery]
  )

  const loadRows = useCallback(async () => {
    const request = beginLatestRequest('rows')
    setLoading(true)
    setStatusCounts(null)
    try {
      const routeSelectedID = Number(routeQualityInspectionID || 0)
      const [data, routeInspection] = await Promise.all([
        loadQualityInspectionList({ signal: request.signal }),
        routeSelectedID > 0 && inspectionTypeFilter !== 'PRODUCTION_STAGE'
          ? getQualityInspection({ id: routeSelectedID })
          : Promise.resolve(null),
      ])
      if (!request.isCurrent()) {
        return false
      }
      const listedRows = Array.isArray(data?.quality_inspections)
        ? data.quality_inspections
        : []
      const listedRouteInspection =
        routeSelectedID > 0
          ? listedRows.find((item) => Number(item?.id) === routeSelectedID) ||
            null
          : null
      const selectedRouteInspection = routeInspection || listedRouteInspection
      const exactPage = resolveExactRecordPage({
        records: listedRows,
        exactRecord: selectedRouteInspection,
        hasExactContext:
          routeSelectedID > 0 && inspectionTypeFilter !== 'PRODUCTION_STAGE',
        total: Number(data?.total || 0),
      })
      const nextRows = exactPage.records
      setRows(nextRows)
      setSelectedRow((current) => {
        if (routeSelectedID > 0) return selectedRouteInspection
        return current?.id
          ? nextRows.find((item) => item.id === current.id) || null
          : null
      })
      setTotal(exactPage.total)
      setStatusCounts(
        resolveBusinessStatusCounts(data, {
          hasExactContext:
            routeSelectedID > 0 && inspectionTypeFilter !== 'PRODUCTION_STAGE',
          exactRecord: selectedRouteInspection,
          statusField: 'status',
        })
      )
      return true
    } catch (error) {
      if (isRpcAbortError(error) || !request.isCurrent()) {
        return false
      }
      showPageLoadError(error, '加载质量检验单')
      return false
    } finally {
      if (request.isCurrent()) {
        setLoading(false)
        request.finish()
      }
    }
  }, [
    beginLatestRequest,
    inspectionTypeFilter,
    loadQualityInspectionList,
    routeQualityInspectionID,
  ])

  useEffect(() => {
    loadRows()
  }, [loadRows])

  useEffect(() => {
    const receiptID = positiveInt(selectedRow?.purchase_receipt_id)
    const requestID = selectedRowPurchaseReceiptRequestRef.current + 1
    selectedRowPurchaseReceiptRequestRef.current = requestID
    setSelectedRowPurchaseReceipt(null)

    if (!receiptID || !isRejectedIncomingInspection(selectedRow)) {
      setSelectedRowPurchaseReceiptLoading(false)
      return undefined
    }

    setSelectedRowPurchaseReceiptLoading(true)
    getPurchaseReceipt({ id: receiptID })
      .then((receipt) => {
        if (selectedRowPurchaseReceiptRequestRef.current !== requestID) return
        setSelectedRowPurchaseReceipt(
          positiveInt(receipt?.id) === receiptID ? receipt : null
        )
      })
      .catch((error) => {
        if (selectedRowPurchaseReceiptRequestRef.current !== requestID) return
        message.error(getActionErrorMessage(error, '核对来源收货状态'))
        setSelectedRowPurchaseReceipt(null)
      })
      .finally(() => {
        if (selectedRowPurchaseReceiptRequestRef.current === requestID) {
          setSelectedRowPurchaseReceiptLoading(false)
        }
      })

    return () => {
      if (selectedRowPurchaseReceiptRequestRef.current === requestID) {
        selectedRowPurchaseReceiptRequestRef.current += 1
      }
    }
  }, [selectedRow])

  const clearRouteContext = useCallback(
    (keys) => {
      const nextParams = clearLinkedDocumentParams(searchParams)
      const keysToDelete =
        Array.isArray(keys) && keys.length > 0
          ? keys
          : [
              'purchase_order_id',
              'purchase_receipt_id',
              'quality_inspection_id',
              'source_type',
              'source_id',
            ]
      keysToDelete.forEach((key) => nextParams.delete(key))
      setSearchParams(nextParams, { replace: true })
      resetBusinessPaginationCurrent(setPagination)
    },
    [searchParams, setSearchParams]
  )

  const refreshPageData = useCallback(async () => {
    const [rowsOK, referencesOK] = await Promise.all([
      loadRows(),
      loadReferenceOptions(),
    ])
    return rowsOK !== false && referencesOK !== false
  }, [loadReferenceOptions, loadRows])

  useEffect(() => {
    return outletContext?.registerPageRefresh?.(refreshPageData)
  }, [outletContext, refreshPageData])

  const openQualityInspectionDetails = useCallback(async (inspection) => {
    if (!inspection?.id) return
    const requestID = detailRequestRef.current + 1
    detailRequestRef.current = requestID
    setSelectedRow(inspection)
    setDetailInspection(inspection)
    try {
      const detail = await getQualityInspection({ id: inspection.id })
      if (detailRequestRef.current === requestID && detail?.id) {
        setDetailInspection(detail)
      }
    } catch (error) {
      if (detailRequestRef.current === requestID) {
        message.warning(getActionErrorMessage(error, '刷新质量检验详情'))
      }
    }
  }, [])

  const closeQualityInspectionDetails = useCallback(() => {
    detailRequestRef.current += 1
    setDetailInspection(null)
  }, [])

  const { handleCreateInspection, runInspectionAction, handleDecision } =
    useQualityInspectionActions({
      editor: inspectionEditor,
      activeCustomerKey,
      loadRows,
      reportBusinessResult,
      setSelectedRow,
      setPagination,
    })

  const markInspectionReturned = useCallback((inspectionID) => {
    const id = positiveInt(inspectionID)
    if (!id) return
    setReturnedInspectionIDs((current) => {
      const next = new Set(current)
      next.add(id)
      return next
    })
  }, [])

  const openPurchaseReturn = useCallback(
    async (inspection) => {
      if (referenceDataState !== 'ready') {
        message.warning(
          referenceDataState === 'loading'
            ? '质检来源资料正在加载，请稍后再生成采购退货'
            : '质检来源资料加载失败，请先刷新当前页后重试'
        )
        return
      }
      if (
        !canCreatePurchaseReturn ||
        !isRejectedIncomingInspection(inspection)
      ) {
        message.warning('只有已判定不合格的来料质检单可以退供应商')
        return
      }
      const sourceReceipt = selectedRowPurchaseReceipt
      if (
        !canCreatePurchaseReturnFromRejectedInspection(
          inspection,
          sourceReceipt
        )
      ) {
        message.warning(
          '首次到货检验不合格只会阻止入库；只有已入库后追加检验不合格才可退供应商'
        )
        return
      }
      if (returnedInspectionIDs.has(inspection.id)) {
        message.info('该质检单已生成采购退货')
        return
      }
      setPurchaseReturnLoading(true)
      try {
        if (canReadPurchaseReturn) {
          const data = await listAllPurchaseReturns(
            compactParams({
              customer_key: activeCustomerKey || undefined,
              quality_inspection_id: inspection.id,
            })
          )
          const activeReturn = (
            Array.isArray(data?.purchase_returns) ? data.purchase_returns : []
          ).find(
            (item) => String(item?.status || '').toUpperCase() !== PurchaseReturnStatus.CANCELLED
          )
          if (activeReturn) {
            markInspectionReturned(inspection.id)
            message.info('该质检单已生成采购退货')
            return
          }
        }
        setPurchaseReturnModal({ inspection })
      } catch (error) {
        message.error(getActionErrorMessage(error, '核对采购退货状态'))
      } finally {
        setPurchaseReturnLoading(false)
      }
    },
    [
      activeCustomerKey,
      canCreatePurchaseReturn,
      canReadPurchaseReturn,
      markInspectionReturned,
      referenceDataState,
      returnedInspectionIDs,
      selectedRowPurchaseReceipt,
    ]
  )

  const openSelectedQualityDisposition = useCallback(() => {
    if (qualityDispositionDisabled || !selectedRow) return
    if (selectedDispositionKind === 'incoming-rejection') {
      setRejectionDispositionOpen(true)
      return
    }
    if (selectedDispositionKind === 'incoming-return') {
      openPurchaseReturn(selectedRow)
      return
    }
    if (selectedDispositionKind === 'outsourcing') {
      setOutsourcingDispositionOpen(true)
      return
    }
    if (selectedDispositionKind === 'production') {
      setProductionExceptionOpen(true)
    }
  }, [
    openPurchaseReturn,
    qualityDispositionDisabled,
    selectedDispositionKind,
    selectedRow,
  ])

  useEffect(() => {
    if (!taskHandling || taskEntryRef.current === taskHandling.taskID || !selectedRow ||
      Number(selectedRow.id) !== routeQualityInspectionID || outletContext?.workflowTaskNavigation?.businessReceipt) return
    if (taskHandling.group === 'handoff_production_quality' && canUpdate && [QualityInspectionStatus.DRAFT, QualityInspectionStatus.SUBMITTED].includes(selectedRow.status)) {
      taskEntryRef.current = taskHandling.taskID
      setQualityTaskFocusOpen(true)
    } else if (taskHandling.group === 'handoff_production_exception' && !qualityDispositionDisabled && selectedDispositionKind === 'production') {
      taskEntryRef.current = taskHandling.taskID
      openSelectedQualityDisposition()
    }
  }, [taskHandling, selectedRow, routeQualityInspectionID, canUpdate, openDecision,
    qualityDispositionDisabled, selectedDispositionKind, openSelectedQualityDisposition, outletContext?.workflowTaskNavigation?.businessReceipt])

  const closePurchaseReturn = useCallback(() => {
    if (purchaseReturnInFlightRef.current) return
    setPurchaseReturnModal(null)
  }, [])

  const submitPurchaseReturn = useCallback(
    async (values) => {
      const inspection = purchaseReturnModal?.inspection
      if (
        purchaseReturnInFlightRef.current ||
        !isRejectedIncomingInspection(inspection)
      ) {
        return
      }
      let scope
      let attempt
      try {
        const payload = buildPurchaseReturnFromQualityInspectionPayload(
          values,
          inspection,
          activeCustomerKey
        )
        scope = `quality-purchase-return:${inspection.id}`
        attempt = purchaseReturnAttemptsRef.current.prepare(scope, payload)
      } catch (error) {
        message.error(getActionErrorMessage(error, '准备采购退货'))
        return
      }

      purchaseReturnInFlightRef.current = true
      setPurchaseReturnLoading(true)
      try {
        const created = await createPurchaseReturnFromQualityInspection(
          attempt.params
        )
        if (
          Number(created?.id || 0) <= 0 ||
          Number(created?.quality_inspection_id || 0) !== inspection.id ||
          String(created?.status || '').toUpperCase() !== PurchaseReturnStatus.DRAFT
        ) {
          const error = new Error('采购退货返回结果与当前质检单不一致')
          error.isInvalidResponse = true
          throw error
        }
        purchaseReturnAttemptsRef.current.settle(scope, attempt, null)
        markInspectionReturned(inspection.id)
        setPurchaseReturnModal(null)
        message.success('采购退货草稿已生成，请到采购退货记录核对并确认')
        await loadRows()
      } catch (error) {
        const retained = purchaseReturnAttemptsRef.current.settle(
          scope,
          attempt,
          error
        )
        if (retained) {
          message.warning(
            '暂时无法确认是否处理成功，请保持内容不变后重试，避免重复记录'
          )
        } else {
          message.error(getActionErrorMessage(error, '生成采购退货草稿'))
        }
      } finally {
        purchaseReturnInFlightRef.current = false
        setPurchaseReturnLoading(false)
      }
    },
    [activeCustomerKey, loadRows, markInspectionReturned, purchaseReturnModal]
  )

  const selectedRowLabel = selectedRow
    ? `${selectedRow.inspection_no || '质量检验单已关联'} / ${
        isProductionStageQualityInspection(selectedRow)
          ? String(selectedRow.wip_batch_no || '').trim() || '—'
          : referenceLabel(
              inventoryLotOptions,
              selectedRow.inventory_lot_id,
              '批次'
            )
      }`
    : '请先选择一张质量检验单'

  const isCreatingInspection =
    !inspectionModal || inspectionModal.mode === 'create'
  const InspectionEditor = isCreatingInspection
    ? BusinessFormPage
    : BusinessFormModal
  const modalTitle = {
    create: '生成来料质检草稿',
    pass: '判定合格',
    reject: '判定不合格',
    cancel: '取消质检',
  }[inspectionModal?.mode || 'create']

  const decisionIsProductionStage = isProductionStageQualityInspection(
    inspectionModal?.inspection
  )

  const modalDescription = {
    pass: decisionIsProductionStage
      ? '生产阶段质量关口当前只允许合格放行；让步接收需另有按关口审批策略和审计，在该能力落地前保持阻断。'
      : '选择合格或让步接收，并按来源记录估算不良比例；这里只登记质量结论，后续由对应来源规则处理。',
    reject:
      '记录不合格及来源的估算不良比例；后续返工、退货或阻断仍由对应来源业务办理。',
    cancel: '取消只关闭当前质检流程，不会直接改写库存数量或生产事实。',
  }[inspectionModal?.mode]

  const decisionSourceSummary = buildDecisionSourceSummary({
    inspection: inspectionModal?.inspection,
    allPurchaseReceiptItemOptions,
    inventoryLotOptions,
    materialOptions,
    productOptions,
    purchaseReceiptOptions,
  })

  const modalOkText = {
    create: '生成草稿',
    pass: '确认合格',
    reject: '确认不合格',
    cancel: '确认取消',
  }[inspectionModal?.mode || 'create']

  const exportColumns = useMemo(() => {
    const columns = buildQualityInspectionExportColumns({
      allPurchaseReceiptItemOptions,
      inventoryLotOptions,
      materialOptions,
      productOptions,
      purchaseReceiptOptions,
      warehouseOptions,
    })
    return applyEffectiveFieldPolicyFlags({
      adminProfile,
      moduleKey: QUALITY_INSPECTIONS_MODULE_KEY,
      columns,
    })
  }, [
    allPurchaseReceiptItemOptions,
    adminProfile,
    inventoryLotOptions,
    materialOptions,
    productOptions,
    purchaseReceiptOptions,
    warehouseOptions,
  ])

  const dataColumns = useMemo(
    () =>
      buildQualityInspectionDataColumns({
        allPurchaseReceiptItemOptions,
        inventoryLotOptions,
        materialOptions,
        productOptions,
        purchaseReceiptOptions,
        warehouseOptions,
      }),
    [
      allPurchaseReceiptItemOptions,
      inventoryLotOptions,
      materialOptions,
      productOptions,
      purchaseReceiptOptions,
      warehouseOptions,
    ]
  )

  const {
    tableColumns: columns,
    exportColumns: visibleDataColumns,
    openColumnOrder,
    columnOrderModal,
  } = useBusinessColumnOrder({
    adminProfile,
    moduleKey: QUALITY_INSPECTIONS_MODULE_KEY,
    moduleTitle: '质量检验列表',
    columns: dataColumns,
  })

  const loadExportQualityInspections = useCallback(
    (options) => loadQualityInspectionExport(qualityQuery, options),
    [qualityQuery]
  )

  const { exporting, exportRows: exportQualityInspections } =
    useBusinessListExport({
      requestKey: 'quality-inspections-export',
      loadRows: loadExportQualityInspections,
      filename: `质量检验-${currentBusinessDate()}.csv`,
      columns: exportColumns,
      recordLabel: '质检单',
    })

  const hasActiveFilters = Boolean(
    keyword.trim() ||
    statusFilter ||
    resultFilter ||
    inspectionTypeFilter ||
    purchaseReceiptFilter ||
    materialFilter ||
    warehouseFilter ||
    lotFilter ||
    dateFilterStart ||
    dateFilterEnd ||
    routePurchaseOrderID ||
    routePurchaseReceiptID ||
    routeQualityInspectionID ||
    routeSourceType ||
    routeSourceID ||
    linkedKeyword
  )
  const clearFilters = useCallback(() => {
    setKeyword('')
    setStatusFilter('')
    setResultFilter('')
    setInspectionTypeFilter('')
    setPurchaseReceiptFilter('')
    setMaterialFilter('')
    setWarehouseFilter('')
    setLotFilter('')
    setDateFilterField('inspected_at')
    setDateFilterStart('')
    setDateFilterEnd('')
    clearRouteContext()
  }, [clearRouteContext])

  return (
    <BusinessPageLayout className="erp-quality-inspections-page">
      <PageHeaderCard compact helpKey="quality-inspections" title="质量检验" />

      <BusinessOperationPanel
        compact
        onClearFilters={clearFilters}
        clearFiltersDisabled={!hasActiveFilters}
        filters={
          <>
            <SearchInput
              value={resolvedRouteKeyword || linkedKeyword || keyword}
              {...BUSINESS_SEARCH_SCOPES.quality}
              onChange={(event) => {
                if (
                  resolvedRouteKeyword ||
                  linkedKeyword ||
                  routeQualityInspectionID ||
                  routePurchaseOrderID ||
                  routePurchaseReceiptID ||
                  (routeSourceType && routeSourceID)
                ) {
                  clearRouteContext()
                }
                setKeyword(event.target.value)
                resetBusinessPaginationCurrent(setPagination)
              }}
              onPressEnter={loadRows}
            />
            <BusinessStatusFilter
              inline
              aria-label="质检状态"
              counts={statusCounts}
              loading={loading}
              exact={
                Boolean(routeQualityInspectionID) &&
                inspectionTypeFilter !== 'PRODUCTION_STAGE'
              }
              className="erp-business-filter-control--status"
              value={statusFilter}
              options={QUALITY_STATUS_OPTIONS}
              onChange={(nextStatus) => {
                setStatusFilter(nextStatus)
                resetBusinessPaginationCurrent(setPagination)
              }}
            />
            <SelectFilter
              aria-label="检验结果"
              className="erp-business-filter-control--status"
              value={resultFilter}
              options={QUALITY_RESULT_FILTER_OPTIONS}
              onChange={(nextResult) => {
                setResultFilter(nextResult)
                resetBusinessPaginationCurrent(setPagination)
              }}
            />
            <SelectFilter
              aria-label="检验类型"
              className="erp-business-filter-control--status"
              value={inspectionTypeFilter}
              options={QUALITY_INSPECTION_TYPE_FILTER_OPTIONS}
              onChange={(nextType) => {
                const normalizedType = nextType || ''
                const routeKeysToClear = []
                setInspectionTypeFilter(normalizedType)
                if (normalizedType && normalizedType !== 'INCOMING') {
                  setPurchaseReceiptFilter('')
                  setMaterialFilter('')
                  routeKeysToClear.push(
                    'purchase_order_id',
                    'purchase_receipt_id'
                  )
                }
                if (
                  (routeSourceType || routeSourceID) &&
                  !isQualityInspectionRouteSourceCompatible(
                    normalizedType,
                    routeSourceType
                  )
                ) {
                  routeKeysToClear.push('source_type', 'source_id')
                }
                if (routeKeysToClear.length > 0) {
                  clearRouteContext(routeKeysToClear)
                }
                if (normalizedType === 'PRODUCTION_STAGE') {
                  setWarehouseFilter('')
                  setLotFilter('')
                }
                setSelectedRow(null)
                resetBusinessPaginationCurrent(setPagination)
              }}
            />
            <SelectFilter
              aria-label="入库单"
              className="erp-business-filter-control--status"
              value={purchaseReceiptFilter}
              options={[
                { label: '全部入库单', value: '' },
                ...purchaseReceiptOptions,
              ]}
              placeholder="全部入库单"
              disabled={Boolean(
                inspectionTypeFilter && inspectionTypeFilter !== 'INCOMING'
              )}
              showSearch
              optionFilterProp="label"
              onChange={(nextReceipt) => {
                setPurchaseReceiptFilter(nextReceipt || '')
                resetBusinessPaginationCurrent(setPagination)
              }}
            />
            <SelectFilter
              aria-label="材料"
              className="erp-business-filter-control--status"
              value={materialFilter}
              options={[{ label: '全部材料', value: '' }, ...materialOptions]}
              placeholder="全部材料"
              disabled={Boolean(
                inspectionTypeFilter && inspectionTypeFilter !== 'INCOMING'
              )}
              showSearch
              optionFilterProp="label"
              onChange={(nextMaterial) => {
                setMaterialFilter(nextMaterial || '')
                resetBusinessPaginationCurrent(setPagination)
              }}
            />
            <SelectFilter
              aria-label="仓库"
              className="erp-business-filter-control--status"
              value={warehouseFilter}
              options={[{ label: '全部仓库', value: '' }, ...warehouseOptions]}
              placeholder="全部仓库"
              disabled={inspectionTypeFilter === 'PRODUCTION_STAGE'}
              showSearch
              optionFilterProp="label"
              onChange={(nextWarehouse) => {
                setWarehouseFilter(nextWarehouse || '')
                resetBusinessPaginationCurrent(setPagination)
              }}
            />
            <SelectFilter
              aria-label="批次"
              className="erp-business-filter-control--status"
              value={lotFilter}
              options={[
                { label: '全部批次', value: '' },
                ...inventoryLotOptions,
              ]}
              placeholder="全部批次"
              disabled={inspectionTypeFilter === 'PRODUCTION_STAGE'}
              showSearch
              optionFilterProp="label"
              onChange={(nextLot) => {
                setLotFilter(nextLot || '')
                resetBusinessPaginationCurrent(setPagination)
              }}
            />
            <DateRangeFilter
              options={QUALITY_DATE_FILTER_OPTIONS}
              value={dateFilterField}
              onTypeChange={(nextField) => {
                setDateFilterField(nextField || 'inspected_at')
                resetBusinessPaginationCurrent(setPagination)
              }}
              startValue={dateFilterStart}
              endValue={dateFilterEnd}
              onStartChange={(nextStart) => {
                setDateFilterStart(nextStart)
                resetBusinessPaginationCurrent(setPagination)
              }}
              onEndChange={(nextEnd) => {
                setDateFilterEnd(nextEnd)
                resetBusinessPaginationCurrent(setPagination)
              }}
            />
            {routePurchaseOrderID ? (
              <Tag
                closable
                color="blue"
                onClose={() => clearRouteContext(['purchase_order_id'])}
              >
                已按采购订单筛选
              </Tag>
            ) : null}
            {routePurchaseReceiptID ? (
              <Tag
                closable
                color="blue"
                onClose={() => clearRouteContext(['purchase_receipt_id'])}
              >
                已按采购入库筛选
              </Tag>
            ) : null}
            {routeQualityInspectionID ? (
              <Tag
                closable
                color="blue"
                onClose={() => clearRouteContext(['quality_inspection_id'])}
              >
                已定位质检单
              </Tag>
            ) : null}
            {routeSourceType && routeSourceID ? (
              <Tag
                closable
                color="blue"
                onClose={() => clearRouteContext(['source_type', 'source_id'])}
              >
                已按来源单据筛选
              </Tag>
            ) : null}
          </>
        }
        actions={
          <BusinessListToolbarActions
            onExport={exportQualityInspections}
            exportDisabled={loading || exporting || total === 0}
            exportDisabledReason={exporting ? '正在准备导出，请稍候' : ''}
            onOpenColumnOrder={openColumnOrder}
          />
        }
        primaryAction={
          canCreate ? (
            <BusinessActionTooltip
              disabled={referenceDataState !== 'ready'}
              disabledReason="质检来源资料加载完成后可补建"
            >
              <ToolbarButton
                type="primary"
                className="erp-business-list-toolbar__primary-action"
                icon={<PlusOutlined />}
                disabled={referenceDataState !== 'ready'}
                onClick={openCreate}
              >
                补建来料质检
              </ToolbarButton>
            </BusinessActionTooltip>
          ) : null
        }
      >
        <SelectionActionBar
          embedded
          selectedCount={selectedRow ? 1 : 0}
          selectedLabel={selectedRowLabel}
          boundaryText="提交、判定和取消均由系统按质检规则处理；不会绕过来源规则直接改写库存数量或生产事实。"
        >
          <SelectionClearAction
            selectedCount={selectedRow ? 1 : 0}
            selectionLabel="质检记录"
            onClear={() => setSelectedRow(null)}
          />
          <BusinessTaskActions
            sourceType="quality_inspection"
            record={selectedRow}
            adminProfile={adminProfile}
          />
          {relatedActionAvailability.visible ? (
            <BusinessActionTooltip
              disabled={relatedActionAvailability.disabled}
              disabledReason={
                !selectedRow
                  ? '请先选择一条质检记录'
                  : relatedActionAvailability.disabledReason
              }
            >
              <Dropdown
                trigger={['click']}
                destroyOnHidden
                disabled={relatedActionAvailability.disabled}
                menu={{
                  items: relatedMenuItems,
                  onClick: openRelatedTable,
                }}
              >
                <Button
                  size="small"
                  icon={<LinkOutlined />}
                  data-business-action-key="related-records"
                  data-business-action-role="related"
                  disabled={relatedActionAvailability.disabled}
                >
                  相关单据 <DownOutlined />
                </Button>
              </Dropdown>
            </BusinessActionTooltip>
          ) : null}
          <BusinessActionTooltip
            disabled={!selectedRow}
            disabledReason="请先选择一条质检记录"
          >
            <Button
              data-business-action-key="view-details"
              data-business-action-role="view"
              size="small"
              icon={<EyeOutlined />}
              disabled={!selectedRow}
              onClick={() => openQualityInspectionDetails(selectedRow)}
            >
              查看详情
            </Button>
          </BusinessActionTooltip>
          {canUpdate ? (
            <BusinessActionTooltip
              visible={!selectedRow || selectedQualityStatus === QualityInspectionStatus.DRAFT}
              disabled={
                !selectedRow || selectedRow.status !== QualityInspectionStatus.DRAFT || saving
              }
              disabledReason={
                !selectedRow
                  ? '请先选择一条质检记录'
                  : selectedRow.status !== QualityInspectionStatus.DRAFT
                    ? '只有质检草稿可以提交'
                    : saving
                      ? '当前操作完成后可提交'
                      : ''
              }
            >
              <Popconfirm
                title="确认提交质检并进入待判定状态？"
                onConfirm={() =>
                  runInspectionAction(
                    selectedRow,
                    submitQualityInspection,
                    '质检已提交'
                  )
                }
                okText="确认"
                cancelText="取消"
              >
                <Button
                  data-business-action-key="submit"
                  data-business-action-role="primary"
                  type="primary"
                  size="small"
                  className="erp-business-module-status-action"
                  icon={<FileDoneOutlined />}
                  disabled={
                    !selectedRow || selectedRow.status !== QualityInspectionStatus.DRAFT || saving
                  }
                >
                  提交质检
                </Button>
              </Popconfirm>
            </BusinessActionTooltip>
          ) : null}
          {canUpdate && selectedQualityStatus === QualityInspectionStatus.SUBMITTED ? (
            <Space data-business-action-role="primary">
              <BusinessActionTooltip
                visible={
                  !selectedRow ||
                  [QualityInspectionStatus.DRAFT, QualityInspectionStatus.SUBMITTED].includes(selectedQualityStatus)
                }
                disabled={
                  !selectedRow || selectedRow.status !== QualityInspectionStatus.SUBMITTED || saving
                }
                disabledReason={
                  !selectedRow
                    ? '请先选择一条质检记录'
                    : selectedRow.status !== QualityInspectionStatus.SUBMITTED
                      ? '质检提交后可判定'
                      : saving
                        ? '当前操作完成后可判定'
                        : ''
                }
              >
                <Button
                  data-business-action-key="pass"
                  data-business-action-role="primary"
                  size="small"
                  type={
                    selectedQualityStatus === QualityInspectionStatus.SUBMITTED
                      ? 'primary'
                      : 'default'
                  }
                  className="erp-business-module-status-action"
                  icon={<CheckCircleOutlined />}
                  disabled={
                    !selectedRow || selectedRow.status !== QualityInspectionStatus.SUBMITTED || saving
                  }
                  onClick={() => openDecision('pass', selectedRow)}
                >
                  判定合格
                </Button>
              </BusinessActionTooltip>
              <BusinessActionTooltip
                visible={
                  !selectedRow ||
                  [QualityInspectionStatus.DRAFT, QualityInspectionStatus.SUBMITTED].includes(selectedQualityStatus)
                }
                disabled={
                  !selectedRow || selectedRow.status !== QualityInspectionStatus.SUBMITTED || saving
                }
                disabledReason={
                  !selectedRow
                    ? '请先选择一条质检记录'
                    : selectedRow.status !== QualityInspectionStatus.SUBMITTED
                      ? '质检提交后可判定'
                      : saving
                        ? '当前操作完成后可判定'
                        : ''
                }
              >
                <Button
                  data-business-action-key="reject"
                  data-business-action-role="primary"
                  size="small"
                  danger
                  className="erp-business-module-status-action"
                  icon={<StopOutlined />}
                  disabled={
                    !selectedRow || selectedRow.status !== QualityInspectionStatus.SUBMITTED || saving
                  }
                  onClick={() => openDecision('reject', selectedRow)}
                >
                  判定不合格
                </Button>
              </BusinessActionTooltip>
            </Space>
          ) : null}
          {showQualityDispositionAction ? (
            <BusinessActionTooltip
              disabled={qualityDispositionDisabled}
              disabledReason={qualityDispositionDisabledReason}
            >
              <Button
                data-business-action-key="quality-disposition"
                data-business-action-role="primary"
                size="small"
                danger
                className="erp-business-module-status-action"
                icon={<RollbackOutlined />}
                disabled={qualityDispositionDisabled}
                onClick={openSelectedQualityDisposition}
              >
                不合格处置
              </Button>
            </BusinessActionTooltip>
          ) : null}
          {outsourcingDispositionViewAvailability.visible ? (
            <BusinessActionTooltip
              disabled={outsourcingDispositionViewAvailability.disabled}
              disabledReason={
                outsourcingDispositionViewAvailability.disabledReason
              }
            >
              <Button
                data-business-action-key="outsourcing-disposition-view"
                data-business-action-role="related"
                size="small"
                disabled={outsourcingDispositionViewAvailability.disabled}
                onClick={() => setOutsourcingDispositionOpen(true)}
              >
                查看委外处置
              </Button>
            </BusinessActionTooltip>
          ) : null}
          {canUpdate ? (
            <BusinessActionTooltip
              visible={
                !selectedRow ||
                (!selectedIsCorrectionInspection && [QualityInspectionStatus.DRAFT, QualityInspectionStatus.SUBMITTED].includes(selectedQualityStatus))
              }
              disabled={
                !selectedRow ||
                selectedIsCorrectionInspection ||
                ![QualityInspectionStatus.DRAFT, QualityInspectionStatus.SUBMITTED].includes(selectedRow.status) ||
                saving
              }
              disabledReason={
                !selectedRow
                  ? '请先选择一条质检记录'
                  : selectedIsCorrectionInspection
                    ? '纠正后的复检须完成判定，不能取消'
                    : ![QualityInspectionStatus.DRAFT, QualityInspectionStatus.SUBMITTED].includes(selectedRow.status)
                    ? '当前质检状态不能取消'
                    : saving
                      ? '当前操作完成后可取消'
                      : ''
              }
            >
              <Button
                data-business-action-key="cancel"
                data-business-action-role="danger"
                size="small"
                className="erp-business-module-status-action"
                icon={<CloseCircleOutlined />}
                disabled={
                  !selectedRow ||
                  selectedIsCorrectionInspection ||
                  ![QualityInspectionStatus.DRAFT, QualityInspectionStatus.SUBMITTED].includes(selectedRow.status) ||
                  saving
                }
                onClick={() => openDecision('cancel', selectedRow)}
              >
                取消质检
              </Button>
            </BusinessActionTooltip>
          ) : null}
        </SelectionActionBar>
      </BusinessOperationPanel>

      {outletContext?.mobileTaskBusiness?.task?.source_type === 'purchase_receipt' &&
      routePurchaseReceiptID === outletContext.mobileTaskBusiness.task.source_id ? (
        <label className="mobile-detail-section">
          选择本次收货的质检单
          <Select
            aria-label="选择本次收货的质检单"
            value={selectedRow?.id}
            disabled={loading || saving}
            options={rows.filter((row) => row.purchase_receipt_id === routePurchaseReceiptID).map((row) => ({ value: row.id, label: row.inspection_no }))}
            onChange={(id) => setSelectedRow(rows.find((row) => row.id === id && row.purchase_receipt_id === routePurchaseReceiptID) || null)}
          />
        </label>
      ) : null}
      <BusinessDataTable
        rowKey="id"
        loading={loading}
        dataSource={rows}
        columns={columns}
        pagination={createBusinessTablePagination({
          pagination,
          total,
          onChange: (current, pageSize) => setPagination({ current, pageSize }),
        })}
        scroll={{ x: 1600 }}
        rowSelection={{
          type: 'radio',
          selectedRowKeys: selectedRow ? [selectedRow.id] : [],
          onChange: (_keys, selectedRows) =>
            setSelectedRow(selectedRows[0] || null),
        }}
        rowClassName={(record) =>
          record.id === selectedRow?.id ? 'ant-table-row-selected' : ''
        }
        onRow={(record) => ({
          onClick: () => setSelectedRow(record),
        })}
        onOpenRecord={openQualityInspectionDetails}
        emptyDescription="暂无质量检验单"
      />

      <BusinessModal
        title="办理本次质检"
        open={qualityTaskFocusOpen}
        onCancel={saving ? undefined : () => setQualityTaskFocusOpen(false)}
        footer={
          <Space>
            <Button disabled={saving} onClick={() => setQualityTaskFocusOpen(false)}>关闭</Button>
            {selectedRow?.status === QualityInspectionStatus.DRAFT ? (
              <Button type="primary" loading={saving} onClick={() => runInspectionAction(selectedRow, submitQualityInspection, '质量检验已提交')}>
                提交质检
              </Button>
            ) : selectedRow?.status === QualityInspectionStatus.SUBMITTED ? (
              <>
                <Button onClick={() => { setQualityTaskFocusOpen(false); openDecision('reject', selectedRow) }}>判定不合格</Button>
                <Button type="primary" onClick={() => { setQualityTaskFocusOpen(false); openDecision('pass', selectedRow) }}>判定合格</Button>
              </>
            ) : null}
          </Space>
        }
      >
        <Descriptions
          column={1}
          size="small"
          items={[
          { key: 'inspection', label: '质检单', children: selectedRow?.inspection_no },
          { key: 'batch', label: '在制批次', children: selectedRow?.wip_batch_no || selectedRow?.batch_no },
          { key: 'state', label: '当前状态', children: selectedRow?.status === QualityInspectionStatus.DRAFT ? '待提交检验' : '待质量判定' },
        ]}
        />
        <p>核对当前来源和检验关口后选择本次结论，后续库存及异常仍按对应业务办理。</p>
      </BusinessModal>

      {columnOrderModal}

      <QualityInspectionPurchaseReturnModal
        open={Boolean(purchaseReturnModal)}
        inspection={purchaseReturnModal?.inspection}
        sourceSummary={purchaseReturnSourceSummary}
        loading={purchaseReturnLoading}
        referenceDataReady={referenceDataState === 'ready'}
        onCancel={closePurchaseReturn}
        onSubmit={submitPurchaseReturn}
      />

      <PurchaseRejectionDispositionModal
        open={rejectionDispositionOpen}
        inspection={selectedRow}
        canPost={canPostPurchaseReturn}
        canReceiveReplacement={hasActionPermission(
          adminProfile,
          PermissionCode.PURCHASE_RECEIPT_CREATE
        )}
        canCancel={canCancelPurchaseReturn}
        onClose={() => setRejectionDispositionOpen(false)}
        onChanged={() => loadRows()}
      />

      <OutsourcingReturnDispositionModal
        open={outsourcingDispositionOpen}
        inspection={selectedRow}
        canCreate={canHandleQualityException}
        canPost={canPostOutsourcingDisposition}
        canCancel={canCancelOutsourcingDisposition}
        onClose={() => setOutsourcingDispositionOpen(false)}
        onChanged={() => loadRows()}
      />

      <ProductionExceptionRequestModal
        open={productionExceptionOpen}
        inspection={selectedRow}
        customerKey={activeCustomerKey}
        onClose={() => setProductionExceptionOpen(false)}
        onChanged={(record) => {
          reportBusinessResult('异常申请已提交，等待审批', record)
          loadRows()
        }}
      />

      <BusinessDetailsModal
        descriptionInHelp
        columns={visibleDataColumns}
        description="查看当前质检单的来源、批次、检验状态和判定结果；如需提交、判定或取消，请使用列表上方的当前操作区。"
        open={Boolean(detailInspection)}
        record={detailInspection}
        title="质量检验详情"
        onClose={closeQualityInspectionDetails}
      >
        <IncomingCheckItemsDetails items={detailInspection?.check_items} />
        <BusinessAttachmentPanel
          ownerType="quality_inspection"
          ownerId={detailInspection?.id}
          title="质检附件"
          description="查看不良照片、检验报告、让步说明或批次异常证据。"
          canUpload={false}
          canWithdraw={false}
          variant="inline"
        />
      </BusinessDetailsModal>

      <InspectionEditor
        {...(isCreatingInspection
          ? { form: inspectionForm, loading: referenceDataState === 'loading' }
          : {
              destroyOnHidden: true,
              cancelText: '关闭',
              description: modalDescription,
            })}
        title={modalTitle}
        open={Boolean(inspectionModal)}
        onCancel={closeModal}
        onOk={
          inspectionModal?.mode === 'create'
            ? handleCreateInspection
            : handleDecision
        }
        confirmLoading={saving}
        okButtonProps={{
          disabled:
            inspectionModal?.mode === 'create' &&
            referenceDataState !== 'ready',
        }}
        okText={modalOkText}
      >
        {isCreatingInspection ? (
          <>
            {selectedPurchaseReceipt ? (
              <Alert
                className="erp-business-source-summary"
                showIcon
                type={selectedPurchaseReceiptItem ? 'info' : 'warning'}
                message={`来源采购入库：${
                  selectedPurchaseReceipt.receipt_no || '采购入库已关联'
                }`}
                description={
                  <Space direction="vertical" size={2}>
                    <Text>
                      {[
                        `供应商：${selectedPurchaseReceipt.supplier_name || '-'}`,
                        `状态：${statusText(
                          selectedPurchaseReceipt.status,
                          PURCHASE_RECEIPT_STATUS_LABELS,
                          '状态待确认'
                        )}`,
                        selectedPurchaseReceiptItem
                          ? `来源行：${
                              selectedPurchaseReceiptItem.source_line_no ||
                              '入库明细已关联'
                            }`
                          : '来源行：未选择',
                      ].join('；')}
                    </Text>
                    {selectedPurchaseReceiptItem ? (
                      <Text type="secondary">
                        {[
                          `到货数量：${formatQuantity(
                            selectedPurchaseReceiptItem.quantity
                          )}`,
                          `材料：${referenceLabel(
                            materialOptions,
                            selectedPurchaseReceiptItem.material_id,
                            '材料'
                          )}`,
                          `仓库：${referenceLabel(
                            warehouseOptions,
                            selectedPurchaseReceiptItem.warehouse_id,
                            '仓库'
                          )}`,
                          selectedPurchaseReceiptItem.lot_id
                            ? `批次：${referenceLabel(
                                inventoryLotOptions,
                                selectedPurchaseReceiptItem.lot_id,
                                '批次'
                              )}`
                            : '',
                        ]
                          .filter(Boolean)
                          .join('；')}
                      </Text>
                    ) : (
                      <Text type="secondary">
                        请选择采购入库行后再生成质检草稿，材料、仓库和批次会按来源行带出。
                      </Text>
                    )}
                    <Text type="secondary">
                      当前质检单按采购入库行建单；本次送检数量和已检数量暂未记录，页面不会自行补造。
                    </Text>
                  </Space>
                }
              />
            ) : null}
            <QualityInspectionCreateForm
              form={inspectionForm}
              purchaseReceiptOptions={purchaseReceiptOptions}
              purchaseReceiptItemOptions={purchaseReceiptItemOptions}
              disabled={referenceDataState !== 'ready'}
              onReceiptChange={handleReceiptChange}
            />
          </>
        ) : (
          <>
            <Alert
              className="erp-business-source-summary"
              showIcon
              type="info"
              message={`来源单据：${decisionSourceSummary.sourceNo}`}
              description={
                <Space direction="vertical" size={2}>
                  <Text>{decisionSourceSummary.primary}</Text>
                  {decisionSourceSummary.secondary ? (
                    <Text type="secondary">
                      {decisionSourceSummary.secondary}
                    </Text>
                  ) : null}
                </Space>
              }
            />
            {(
              decisionIsProductionStage
                ? inspectionModal?.inspection?.product_id
                : inspectionModal?.inspection?.subject_type === 'PRODUCT'
                  ? inspectionModal?.inspection?.subject_id
                  : 0
            ) ? (
              <div className="erp-business-inline-note">
                <ProductIdentity
                  productId={
                    decisionIsProductionStage
                      ? inspectionModal.inspection.product_id
                      : inspectionModal.inspection.subject_id
                  }
                  name="产品参考图"
                >
                  {decisionSourceSummary.primary}
                </ProductIdentity>
              </div>
            ) : null}
            <QualityInspectionDecisionForm
              form={decisionForm}
              mode={inspectionModal?.mode}
              disabled={saving}
              incoming={Boolean(
                inspectionModal?.inspection?.purchase_receipt_item_id
              )}
              allowConcession={!decisionIsProductionStage}
            />
          </>
        )}
        <BusinessAttachmentPanel
          ref={inspectionAttachmentRef}
          ownerType="quality_inspection"
          ownerId={inspectionModal?.inspection?.id}
          title="质检附件"
          description="上传不良照片、检验报告、让步说明或批次异常证据；附件不能代替质检处理。"
          canUpload={canCreate || canUpdate}
          canWithdraw={canUpdate || canHandleQualityException}
          variant="inline"
        />
      </InspectionEditor>
    </BusinessPageLayout>
  )
}
