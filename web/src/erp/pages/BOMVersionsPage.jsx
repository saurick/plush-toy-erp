import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CheckCircleOutlined,
  CopyOutlined,
  DownloadOutlined,
  EditOutlined,
  InboxOutlined,
  PlusOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import {
  Button,
  Empty,
  Form,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
} from 'antd'
import { useOutletContext } from 'react-router-dom'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import {
  activateBOMVersion,
  addBOMItem,
  archiveBOMVersion,
  copyBOMVersion,
  createBOMDraft,
  deleteBOMItem,
  getBOMVersion,
  listBOMVersions,
  updateBOMDraft,
  updateBOMItem,
} from '../api/bomApi.mjs'
import { setERPColumnOrder } from '../api/erpPreferenceApi.mjs'
import {
  listMaterials,
  listProducts,
  listUnits,
} from '../api/masterDataOrderApi.mjs'
import {
  BusinessDataTable,
  BusinessOperationPanel,
  BusinessPageLayout,
  CollaborationTaskPanel,
  PageHeaderCard,
  SearchInput,
  SelectFilter,
  SelectionActionBar,
  ToolbarButton,
} from '../components/business-list/BusinessListLayout.jsx'
import {
  ColumnOrderHeaderMenu,
  ColumnOrderModal,
} from '../components/business-list/ColumnOrderModal.jsx'
import BusinessFormModal from '../components/business-list/BusinessFormModal.jsx'
import BusinessAttachmentPanel from '../components/business-list/BusinessAttachmentPanel.jsx'
import {
  BOM_MODULE_KEY,
  BOM_STATUS_LABELS,
  BOM_STATUS_OPTIONS,
  buildBOMItemColumns,
  buildBOMVersionColumns,
} from '../components/bom/BOMVersionColumns.jsx'
import {
  BOMHeaderFormFields,
  BOMItemFormFields,
  buildHeaderParams,
  buildItemParams,
  unixToDateInputValue,
} from '../components/bom/BOMVersionForms.jsx'
import {
  formatUnixDate,
  hasActionPermission,
} from '../utils/masterDataOrderView.mjs'
import {
  applyModuleColumnOrder,
  sanitizeModuleColumnOrder,
} from '../utils/moduleTableColumns.mjs'
import { suggestNextBOMVersion } from '../utils/bomVersionSuggestion.mjs'
import {
  createBusinessTablePagination,
  getBusinessPaginationParams,
  resetBusinessPaginationCurrent,
} from '../utils/businessPagination.mjs'
import {
  materialOption,
  productOption,
  referenceLabel,
  uniqueReferenceOptions,
  unitOption,
} from '../utils/referenceSelectOptions.mjs'

const COLUMN_ORDER_STORAGE_PREFIX = 'erp.module.column-order.'

function readStoredColumnOrder(moduleKey) {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(
      `${COLUMN_ORDER_STORAGE_PREFIX}${moduleKey}`
    )
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeStoredColumnOrder(moduleKey, order = []) {
  if (typeof window === 'undefined') return
  const storageKey = `${COLUMN_ORDER_STORAGE_PREFIX}${moduleKey}`
  if (!Array.isArray(order) || order.length === 0) {
    window.localStorage.removeItem(storageKey)
    return
  }
  window.localStorage.setItem(storageKey, JSON.stringify(order))
}

function getPreferredColumnOrder({
  adminProfile,
  moduleKey,
  columns,
  localOrder,
}) {
  if (Array.isArray(localOrder)) {
    return sanitizeModuleColumnOrder(localOrder, columns)
  }
  const accountOrder = adminProfile?.erp_preferences?.column_orders?.[moduleKey]
  const sanitizedAccountOrder = sanitizeModuleColumnOrder(accountOrder, columns)
  if (sanitizedAccountOrder.length > 0) return sanitizedAccountOrder
  return sanitizeModuleColumnOrder(readStoredColumnOrder(moduleKey), columns)
}

function csvEscape(value) {
  const text = String(value ?? '')
  return /[",\n\r]/u.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function downloadCSV({ filename, rows }) {
  const header = ['产品ID', 'BOM版本', '状态', '生效开始', '生效结束', '备注']
  const body = rows.map((row) => [
    row.product_id,
    row.version,
    BOM_STATUS_LABELS[row.status] || row.status,
    formatUnixDate(row.effective_from),
    formatUnixDate(row.effective_to),
    row.note || '',
  ])
  const csv = [header, ...body]
    .map((line) => line.map(csvEscape).join(','))
    .join('\n')
  const blob = new Blob([`\uFEFF${csv}`], {
    type: 'text/csv;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export default function BOMVersionsPage() {
  const outletContext = useOutletContext()
  const adminProfile = useMemo(
    () => outletContext?.adminProfile || {},
    [outletContext?.adminProfile]
  )
  const [loading, setLoading] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState('')
  const [productID, setProductID] = useState()
  const [versions, setVersions] = useState([])
  const [total, setTotal] = useState(0)
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20 })
  const [selectedVersion, setSelectedVersion] = useState(null)
  const [selectedRowKeys, setSelectedRowKeys] = useState([])
  const selectedRowKeysRef = useRef([])
  const headerAttachmentRef = useRef(null)
  const [columnOrder, setColumnOrder] = useState(null)
  const [columnOrderOpen, setColumnOrderOpen] = useState(false)
  const [columnOrderSaving, setColumnOrderSaving] = useState(false)
  const [headerModalOpen, setHeaderModalOpen] = useState(false)
  const [headerMode, setHeaderMode] = useState('create')
  const [itemModalOpen, setItemModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [products, setProducts] = useState([])
  const [materials, setMaterials] = useState([])
  const [units, setUnits] = useState([])
  const [headerForm] = Form.useForm()
  const [itemForm] = Form.useForm()
  const [headerProductIDForSuggestion, setHeaderProductIDForSuggestion] =
    useState()
  const [headerVersionCandidates, setHeaderVersionCandidates] = useState({
    productID: undefined,
    versions: [],
    loading: false,
    loaded: false,
  })

  const canRead = hasActionPermission(adminProfile, 'bom.read')
  const canCreate = hasActionPermission(adminProfile, 'bom.create')
  const canUpdate = hasActionPermission(adminProfile, 'bom.update')
  const canActivate = hasActionPermission(adminProfile, 'bom.activate')
  const productOptions = useMemo(
    () => uniqueReferenceOptions(products, productOption),
    [products]
  )
  const materialOptions = useMemo(
    () => uniqueReferenceOptions(materials, materialOption),
    [materials]
  )
  const unitOptions = useMemo(
    () => uniqueReferenceOptions(units, unitOption),
    [units]
  )
  const headerVersionSuggestion = useMemo(() => {
    if (!headerVersionCandidates.loaded) return ''
    return suggestNextBOMVersion(
      headerVersionCandidates.versions,
      headerProductIDForSuggestion
    )
  }, [
    headerVersionCandidates.loaded,
    headerVersionCandidates.versions,
    headerProductIDForSuggestion,
  ])
  const useHeaderVersionSuggestion = useCallback(() => {
    if (!headerVersionSuggestion) return
    headerForm.setFieldsValue({ version: headerVersionSuggestion })
  }, [headerForm, headerVersionSuggestion])

  const applySelectedRowKeys = useCallback((nextKeys = []) => {
    const normalizedKeys = Array.isArray(nextKeys) ? nextKeys : []
    selectedRowKeysRef.current = normalizedKeys
    setSelectedRowKeys(normalizedKeys)
  }, [])

  const loadDetail = useCallback(async (id) => {
    if (!id) return null
    setDetailLoading(true)
    try {
      const detail = await getBOMVersion({ id })
      setSelectedVersion(detail)
      return detail
    } catch (error) {
      message.error(getActionErrorMessage(error, '加载 BOM 详情'))
      return null
    } finally {
      setDetailLoading(false)
    }
  }, [])

  const loadVersions = useCallback(async () => {
    if (!canRead) {
      setVersions([])
      setSelectedVersion(null)
      applySelectedRowKeys([])
      return false
    }
    setLoading(true)
    try {
      const result = await listBOMVersions({
        keyword,
        status,
        product_id: productID || undefined,
        ...getBusinessPaginationParams(pagination),
      })
      const nextVersions = Array.isArray(result?.bom_versions)
        ? result.bom_versions
        : []
      setVersions(nextVersions)
      setTotal(Number(result?.total || nextVersions.length || 0))
      const validKeys = selectedRowKeysRef.current.filter((key) =>
        nextVersions.some((item) => item.id === key)
      )
      applySelectedRowKeys(validKeys)
      if (validKeys.length === 1) {
        await loadDetail(validKeys[0])
      } else {
        setSelectedVersion(null)
      }
      return true
    } catch (error) {
      message.error(getActionErrorMessage(error, '加载 BOM 版本'))
      return false
    } finally {
      setLoading(false)
    }
  }, [
    applySelectedRowKeys,
    canRead,
    keyword,
    loadDetail,
    pagination,
    productID,
    status,
  ])

  const loadReferenceOptions = useCallback(async () => {
    try {
      const [productResult, materialResult, unitResult] = await Promise.all([
        listProducts({ limit: 500, active_only: true }),
        listMaterials({ limit: 500, active_only: true }),
        listUnits({ limit: 500 }),
      ])
      setProducts(
        Array.isArray(productResult?.products) ? productResult.products : []
      )
      setMaterials(
        Array.isArray(materialResult?.materials) ? materialResult.materials : []
      )
      setUnits(Array.isArray(unitResult?.units) ? unitResult.units : [])
    } catch (error) {
      message.error(getActionErrorMessage(error, '加载 BOM 引用数据'))
      setProducts([])
      setMaterials([])
      setUnits([])
    }
  }, [])

  useEffect(() => {
    loadVersions()
  }, [loadVersions])

  useEffect(() => {
    loadReferenceOptions()
  }, [loadReferenceOptions])

  useEffect(() => {
    const nextProductID = Number(headerProductIDForSuggestion || 0)
    const shouldLoadSuggestions =
      headerModalOpen &&
      (headerMode === 'create' || headerMode === 'copy') &&
      Number.isFinite(nextProductID) &&
      nextProductID > 0

    if (!shouldLoadSuggestions) {
      setHeaderVersionCandidates((current) =>
        current.productID ||
        current.versions.length > 0 ||
        current.loading ||
        current.loaded
          ? {
              productID: undefined,
              versions: [],
              loading: false,
              loaded: false,
            }
          : current
      )
      return undefined
    }

    let cancelled = false
    setHeaderVersionCandidates({
      productID: nextProductID,
      versions: [],
      loading: true,
      loaded: false,
    })
    listBOMVersions({ product_id: nextProductID, limit: 200 })
      .then((result) => {
        if (cancelled) return
        setHeaderVersionCandidates({
          productID: nextProductID,
          versions: Array.isArray(result?.bom_versions)
            ? result.bom_versions
            : [],
          loading: false,
          loaded: true,
        })
      })
      .catch((error) => {
        if (cancelled) return
        setHeaderVersionCandidates({
          productID: nextProductID,
          versions: [],
          loading: false,
          loaded: false,
        })
        message.warning(getActionErrorMessage(error, '读取同产品 BOM 版本建议'))
      })

    return () => {
      cancelled = true
    }
  }, [headerModalOpen, headerMode, headerProductIDForSuggestion])

  useEffect(() => {
    return outletContext?.registerPageRefresh?.(loadVersions)
  }, [loadVersions, outletContext])

  const selectedVersions = useMemo(
    () => versions.filter((record) => selectedRowKeys.includes(record.id)),
    [selectedRowKeys, versions]
  )
  const singleSelectedVersion =
    selectedRowKeys.length === 1 ? selectedVersions[0] || selectedVersion : null
  const activeActionVersion = singleSelectedVersion
  const activeActionCanEdit =
    activeActionVersion?.status === 'DRAFT' && canUpdate
  const archivableSelectedVersions = selectedVersions.filter(
    (record) => record?.status !== 'ARCHIVED'
  )
  const selectedLabel =
    selectedVersions.length === 1
      ? selectedVersions[0]?.version || '已选择 1 条 BOM'
      : selectedVersions.length > 1
        ? `已选择 ${selectedVersions.length} 条 BOM`
        : '未选择 BOM'
  const selectedItems = selectedVersions.map((record) => ({
    key: record.id,
    label: record.version || `BOM ${record.id}`,
    title: `${referenceLabel(productOptions, record.product_id, '产品')} / ${
      BOM_STATUS_LABELS[record.status] || record.status || '-'
    }`,
  }))
  const selectSingleVersion = useCallback(
    async (record) => {
      if (!record?.id) return
      applySelectedRowKeys([record.id])
      setSelectedVersion(record)
      await loadDetail(record.id)
    },
    [applySelectedRowKeys, loadDetail]
  )

  const openCreate = () => {
    headerAttachmentRef.current?.clearPendingAttachments()
    setHeaderMode('create')
    headerForm.resetFields()
    headerForm.setFieldsValue({ effective_from: '', effective_to: '' })
    setHeaderProductIDForSuggestion(undefined)
    setHeaderModalOpen(true)
  }

  const fillHeaderForm = (record) => {
    headerForm.resetFields()
    headerForm.setFieldsValue({
      product_id: record.product_id,
      version: record.version,
      effective_from: unixToDateInputValue(record.effective_from),
      effective_to: unixToDateInputValue(record.effective_to),
      note: record.note || '',
    })
  }

  const openView = async (record = selectedVersion) => {
    if (!record?.id) return
    headerAttachmentRef.current?.clearPendingAttachments()
    const detail = (await loadDetail(record.id)) || record
    setHeaderMode('view')
    fillHeaderForm(detail)
    setHeaderProductIDForSuggestion(undefined)
    setHeaderModalOpen(true)
  }

  const openEdit = async (record = selectedVersion) => {
    if (!record?.id) return
    headerAttachmentRef.current?.clearPendingAttachments()
    const detail = (await loadDetail(record.id)) || record
    setHeaderMode('edit')
    fillHeaderForm(detail)
    setHeaderProductIDForSuggestion(undefined)
    setHeaderModalOpen(true)
  }

  const openCopy = (record = selectedVersion) => {
    if (!record?.id) return
    headerAttachmentRef.current?.clearPendingAttachments()
    const nextVersionSuggestion = suggestNextBOMVersion(
      versions,
      record.product_id
    )
    setHeaderMode('copy')
    headerForm.resetFields()
    headerForm.setFieldsValue({
      product_id: record.product_id,
      version: nextVersionSuggestion || `${record.version || 'V'}-COPY`,
      effective_from: '',
      effective_to: '',
      note: '',
    })
    setHeaderProductIDForSuggestion(record.product_id)
    setHeaderModalOpen(true)
  }

  const saveHeader = async () => {
    const values = await headerForm.validateFields()
    setSaving(true)
    try {
      let savedVersion = null
      if (headerMode === 'copy') {
        savedVersion = await copyBOMVersion(
          buildHeaderParams(values, { source_id: activeActionVersion?.id })
        )
      } else if (headerMode === 'edit') {
        savedVersion = await updateBOMDraft(
          buildHeaderParams(values, { id: activeActionVersion?.id })
        )
      } else {
        savedVersion = await createBOMDraft(buildHeaderParams(values))
      }
      const attachmentSaved =
        (await headerAttachmentRef.current?.flushPendingAttachments(
          savedVersion?.id
        )) !== false
      message.success(
        attachmentSaved
          ? headerMode === 'copy'
            ? 'BOM 新版本已复制为草稿'
            : headerMode === 'edit'
              ? 'BOM 草稿已更新'
              : 'BOM 草稿已创建'
          : 'BOM 草稿已保存，未上传的附件请重新选择'
      )
      headerAttachmentRef.current?.clearPendingAttachments()
      setHeaderModalOpen(false)
      await loadVersions()
    } catch (error) {
      message.error(getActionErrorMessage(error, '保存 BOM 版本'))
    } finally {
      setSaving(false)
    }
  }

  const openCreateItem = () => {
    if (!activeActionVersion?.id || selectedRowKeys.length !== 1) {
      message.warning('请先选择一个 BOM 版本')
      return
    }
    setEditingItem(null)
    itemForm.resetFields()
    itemForm.setFieldsValue({
      bom_header_id: activeActionVersion.id,
      quantity: '',
      loss_rate: '0',
    })
    setItemModalOpen(true)
  }

  const openEditItem = useCallback(
    (item) => {
      if (!item?.id) return
      setEditingItem(item)
      itemForm.resetFields()
      itemForm.setFieldsValue({
        material_id: item.material_id,
        quantity: item.quantity,
        unit_id: item.unit_id,
        loss_rate: item.loss_rate,
        position: item.position || '',
        note: item.note || '',
      })
      setItemModalOpen(true)
    },
    [itemForm]
  )

  const saveItem = async () => {
    const values = await itemForm.validateFields()
    setSaving(true)
    try {
      if (editingItem?.id) {
        await updateBOMItem(buildItemParams(values, { id: editingItem.id }))
        message.success('BOM 明细已更新')
      } else {
        await addBOMItem(
          buildItemParams(values, { bom_header_id: activeActionVersion?.id })
        )
        message.success('BOM 明细已添加')
      }
      setItemModalOpen(false)
      await loadDetail(activeActionVersion?.id)
      await loadVersions()
    } catch (error) {
      message.error(getActionErrorMessage(error, '保存 BOM 明细'))
    } finally {
      setSaving(false)
    }
  }

  const removeItem = useCallback(
    async (item) => {
      setSaving(true)
      try {
        await deleteBOMItem({ id: item.id })
        message.success('BOM 明细已移除')
        await loadDetail(activeActionVersion?.id)
        await loadVersions()
      } catch (error) {
        message.error(getActionErrorMessage(error, '移除 BOM 明细'))
      } finally {
        setSaving(false)
      }
    },
    [activeActionVersion?.id, loadDetail, loadVersions]
  )

  const activateSelected = async () => {
    if (!activeActionVersion?.id || selectedRowKeys.length !== 1) return
    setSaving(true)
    try {
      const next = await activateBOMVersion({ id: activeActionVersion.id })
      message.success('BOM 版本已激活，旧激活版本已设为历史版本')
      setSelectedVersion(next || activeActionVersion)
      await loadVersions()
    } catch (error) {
      message.error(getActionErrorMessage(error, '激活 BOM 版本'))
    } finally {
      setSaving(false)
    }
  }

  const archiveSelected = async () => {
    if (archivableSelectedVersions.length === 0) return
    setSaving(true)
    try {
      for (const record of archivableSelectedVersions) {
        await archiveBOMVersion({ id: record.id })
      }
      message.success(
        archivableSelectedVersions.length > 1
          ? `已将 ${archivableSelectedVersions.length} 个 BOM 版本设为历史版本`
          : 'BOM 版本已设为历史版本'
      )
      await loadVersions()
    } catch (error) {
      message.error(getActionErrorMessage(error, '设为历史版本'))
    } finally {
      setSaving(false)
    }
  }

  const dataColumns = useMemo(
    () => buildBOMVersionColumns({ productOptions }),
    [productOptions]
  )

  const persistColumnOrder = useCallback(
    async (nextOrder, columnsForOrder) => {
      const sanitizedOrder = sanitizeModuleColumnOrder(
        nextOrder,
        columnsForOrder
      )
      setColumnOrder(sanitizedOrder)
      writeStoredColumnOrder(BOM_MODULE_KEY, sanitizedOrder)
      setColumnOrderSaving(true)
      try {
        const erpPreferences = await setERPColumnOrder({
          module_key: BOM_MODULE_KEY,
          order: sanitizedOrder,
        })
        outletContext?.updateAdminERPPreferences?.(erpPreferences)
        message.success(
          sanitizedOrder.length > 0 ? '列顺序已保存' : '列顺序已恢复默认'
        )
      } catch (error) {
        message.warning(
          `${getActionErrorMessage(error, '保存列顺序')}，已保留本地设置`
        )
      } finally {
        setColumnOrderSaving(false)
      }
    },
    [outletContext]
  )

  const preferredColumnOrder = useMemo(
    () =>
      getPreferredColumnOrder({
        adminProfile,
        moduleKey: BOM_MODULE_KEY,
        columns: dataColumns,
        localOrder: columnOrder,
      }),
    [adminProfile, columnOrder, dataColumns]
  )

  const orderedDataColumns = useMemo(
    () => applyModuleColumnOrder(dataColumns, preferredColumnOrder),
    [dataColumns, preferredColumnOrder]
  )

  const columns = useMemo(
    () =>
      orderedDataColumns.map((column) => ({
        ...column,
        title: (
          <ColumnOrderHeaderMenu
            column={column}
            columns={dataColumns}
            order={preferredColumnOrder}
            saving={columnOrderSaving}
            onChange={(nextOrder) => persistColumnOrder(nextOrder, dataColumns)}
            onOpenPanel={() => setColumnOrderOpen(true)}
          />
        ),
      })),
    [
      columnOrderSaving,
      dataColumns,
      orderedDataColumns,
      persistColumnOrder,
      preferredColumnOrder,
    ]
  )

  const itemColumns = useMemo(
    () =>
      buildBOMItemColumns({
        activeActionCanEdit,
        materialOptions,
        onEditItem: openEditItem,
        onRemoveItem: removeItem,
        unitOptions,
      }),
    [
      activeActionCanEdit,
      materialOptions,
      openEditItem,
      removeItem,
      unitOptions,
    ]
  )

  const hasActiveFilters = Boolean(keyword.trim() || productID || status)
  const clearFilters = useCallback(() => {
    setKeyword('')
    setProductID(undefined)
    setStatus('')
    resetBusinessPaginationCurrent(setPagination)
  }, [])

  return (
    <BusinessPageLayout>
      <PageHeaderCard
        compact
        title="BOM 管理"
        description="维护产品工程资料版本、材料用量、损耗率和生效边界。"
        stats={[
          { key: 'total', label: '总BOM', value: total },
          { key: 'current', label: '当前结果', value: versions.length },
          {
            key: 'active',
            label: '已激活',
            value: versions.filter((item) => item.status === 'ACTIVE').length,
          },
          { key: 'selected', label: '已选BOM', value: selectedRowKeys.length },
        ]}
      />

      <BusinessOperationPanel
        compact
        onClearFilters={clearFilters}
        clearFiltersDisabled={!hasActiveFilters}
        filters={
          <>
            <SearchInput
              value={keyword}
              placeholder="搜索 BOM 版本"
              onChange={(event) => {
                setKeyword(event.target.value)
                resetBusinessPaginationCurrent(setPagination)
              }}
              onPressEnter={loadVersions}
            />
            <Select
              allowClear
              optionFilterProp="label"
              options={productOptions}
              placeholder="按产品筛选"
              showSearch
              value={productID}
              onChange={(nextProductID) => {
                setProductID(nextProductID)
                resetBusinessPaginationCurrent(setPagination)
              }}
              style={{ width: 180 }}
            />
            <SelectFilter
              value={status}
              options={BOM_STATUS_OPTIONS}
              onChange={(nextStatus) => {
                setStatus(nextStatus || '')
                resetBusinessPaginationCurrent(setPagination)
              }}
              style={{ width: 140 }}
            />
          </>
        }
        actions={
          <Space wrap>
            <ToolbarButton
              icon={<DownloadOutlined />}
              disabled={versions.length === 0}
              onClick={() =>
                downloadCSV({ filename: 'bom-versions.csv', rows: versions })
              }
            >
              导出当前结果
            </ToolbarButton>
            <ToolbarButton
              icon={<SettingOutlined />}
              onClick={() => setColumnOrderOpen(true)}
            >
              列顺序
            </ToolbarButton>
          </Space>
        }
        primaryAction={
          <ToolbarButton
            type="primary"
            className="erp-business-list-toolbar__primary-action"
            icon={<PlusOutlined />}
            disabled={!canCreate}
            onClick={openCreate}
          >
            新建草稿
          </ToolbarButton>
        }
      >
        <SelectionActionBar
          embedded
          selectedCount={selectedRowKeys.length}
          selectedLabel={selectedLabel}
          selectedItems={selectedItems}
        >
          <Button
            type="link"
            size="small"
            disabled={selectedRowKeys.length === 0}
            onClick={() => {
              applySelectedRowKeys([])
              setSelectedVersion(null)
            }}
          >
            清空已选
          </Button>
          <Button
            size="small"
            icon={<InboxOutlined />}
            disabled={selectedRowKeys.length !== 1}
            onClick={() => openView(activeActionVersion)}
          >
            查看
          </Button>
          <Button
            size="small"
            icon={<EditOutlined />}
            disabled={selectedRowKeys.length !== 1 || !activeActionCanEdit}
            onClick={() => openEdit(activeActionVersion)}
          >
            编辑草稿
          </Button>
          <Button
            size="small"
            icon={<PlusOutlined />}
            disabled={selectedRowKeys.length !== 1 || !activeActionCanEdit}
            onClick={openCreateItem}
          >
            添加明细
          </Button>
          <Button
            size="small"
            icon={<CopyOutlined />}
            disabled={selectedRowKeys.length !== 1 || !canCreate}
            onClick={() => openCopy(activeActionVersion)}
          >
            复制新版本
          </Button>
          <Popconfirm
            title="激活该 BOM 版本？同产品当前生效版本会设为历史版本。"
            okText="激活"
            cancelText="取消"
            onConfirm={activateSelected}
          >
            <Button
              size="small"
              icon={<CheckCircleOutlined />}
              disabled={
                selectedRowKeys.length !== 1 ||
                !activeActionVersion ||
                !canActivate ||
                activeActionVersion.status === 'ACTIVE'
              }
            >
              激活
            </Button>
          </Popconfirm>
          <Popconfirm
            title="将该 BOM 版本设为历史版本？后续仍可重新激活。"
            okText="设为历史版本"
            cancelText="取消"
            onConfirm={archiveSelected}
          >
            <Button
              size="small"
              icon={<InboxOutlined />}
              disabled={
                selectedRowKeys.length === 0 ||
                !canUpdate ||
                archivableSelectedVersions.length === 0
              }
            >
              {selectedRowKeys.length > 1 ? '所选设为历史版本' : '设为历史版本'}
            </Button>
          </Popconfirm>
        </SelectionActionBar>
      </BusinessOperationPanel>

      <BusinessDataTable
        loading={loading}
        rowKey="id"
        columns={columns}
        dataSource={versions}
        pagination={createBusinessTablePagination({
          pagination,
          total,
          onChange: (current, pageSize) => setPagination({ current, pageSize }),
        })}
        emptyDescription="暂无 BOM 版本"
        rowSelection={{
          selectedRowKeys,
          onChange: (nextKeys, nextRows) => {
            applySelectedRowKeys(nextKeys)
            const nextSingle =
              nextKeys.length === 1
                ? versions.find(
                    (record) => String(record.id) === String(nextKeys[0])
                  ) ||
                  nextRows[0] ||
                  null
                : null
            if (nextSingle?.id) {
              setSelectedVersion(nextSingle)
              loadDetail(nextSingle.id)
            } else {
              setSelectedVersion(null)
            }
          },
        }}
        rowClassName={(record) =>
          selectedRowKeys.includes(record?.id) ? 'ant-table-row-selected' : ''
        }
        onRow={(record) => ({
          onClick: (event) => {
            if (
              event.target?.closest?.(
                '.ant-checkbox-wrapper, .ant-checkbox, .ant-table-selection-column'
              )
            ) {
              return
            }
            selectSingleVersion(record)
          },
          onDoubleClick: () => {
            if (record.status === 'DRAFT' && canUpdate) {
              openEdit(record)
              return
            }
            openView(record)
          },
        })}
      />

      <CollaborationTaskPanel
        tasks={[]}
        selectedTasks={[]}
        selectedRecordLabel={selectedVersion?.version || ''}
      />

      <BusinessFormModal
        open={headerModalOpen}
        title={
          headerMode === 'copy'
            ? '复制 BOM 新版本'
            : headerMode === 'edit'
              ? '编辑 BOM 草稿'
              : headerMode === 'view'
                ? '查看 BOM 版本'
                : '新建 BOM 草稿'
        }
        description="BOM 只维护产品结构和材料用量，不写库存、采购或成本事实。"
        okText="保存"
        cancelText="取消"
        confirmLoading={saving || detailLoading}
        onOk={saveHeader}
        onCancel={() => {
          headerAttachmentRef.current?.clearPendingAttachments()
          setHeaderModalOpen(false)
        }}
        footer={
          headerMode === 'view' ? (
            <Button onClick={() => setHeaderModalOpen(false)}>关闭</Button>
          ) : undefined
        }
      >
        <Form
          form={headerForm}
          layout="vertical"
          className="erp-business-action-form"
          onValuesChange={(changedValues) => {
            if (
              Object.prototype.hasOwnProperty.call(changedValues, 'product_id')
            ) {
              setHeaderProductIDForSuggestion(changedValues.product_id)
            }
          }}
        >
          <BOMHeaderFormFields
            form={headerForm}
            includeProduct={headerMode !== 'edit'}
            disabled={headerMode === 'view'}
            productOptions={productOptions}
            versionSuggestion={headerVersionSuggestion}
            versionSuggestionLoading={headerVersionCandidates.loading}
            onUseVersionSuggestion={useHeaderVersionSuggestion}
          />
        </Form>
        <BusinessAttachmentPanel
          ref={headerAttachmentRef}
          ownerType="bom_header"
          ownerId={
            headerMode === 'edit' || headerMode === 'view'
              ? activeActionVersion?.id || selectedVersion?.id
              : undefined
          }
          title="BOM 附件"
          description="上传色卡、SOP、工艺图片或材料清单来源文件；附件不写库存、采购或成本事实。"
          canUpload={headerMode !== 'view' && (canCreate || canUpdate)}
          canDelete={canUpdate}
          variant="inline"
        />
        {headerMode === 'create' ? (
          <p className="erp-business-selection-action-bar__hint">
            保存 BOM 草稿后，在同一 BOM 版本弹窗下方维护材料明细。
          </p>
        ) : (
          <section className="erp-master-contact-list erp-bom-modal-items">
            <div className="erp-master-contact-list__head">
              <strong>BOM 明细</strong>
              <Space wrap size={8}>
                <Tag>{selectedVersion?.items?.length || 0} 行</Tag>
                <Button
                  size="small"
                  icon={<PlusOutlined />}
                  disabled={!activeActionCanEdit}
                  onClick={openCreateItem}
                >
                  添加明细
                </Button>
              </Space>
            </div>
            <Table
              loading={detailLoading}
              rowKey="id"
              size="small"
              columns={itemColumns}
              dataSource={
                Array.isArray(selectedVersion?.items)
                  ? selectedVersion.items
                  : []
              }
              pagination={false}
              scroll={{ x: 860 }}
              locale={{ emptyText: <Empty description="暂无 BOM 明细" /> }}
            />
          </section>
        )}
      </BusinessFormModal>

      <ColumnOrderModal
        open={columnOrderOpen}
        columns={dataColumns}
        order={preferredColumnOrder}
        saving={columnOrderSaving}
        moduleTitle="BOM 管理列表"
        onChange={(nextOrder) => persistColumnOrder(nextOrder, dataColumns)}
        onClose={() => setColumnOrderOpen(false)}
      />

      <BusinessFormModal
        open={itemModalOpen}
        title={editingItem ? '编辑 BOM 明细' : '添加 BOM 明细'}
        okText="保存"
        cancelText="取消"
        confirmLoading={saving}
        onOk={saveItem}
        onCancel={() => setItemModalOpen(false)}
      >
        <Form
          form={itemForm}
          layout="vertical"
          className="erp-business-action-form"
        >
          <BOMItemFormFields
            materialOptions={materialOptions}
            unitOptions={unitOptions}
          />
        </Form>
      </BusinessFormModal>
    </BusinessPageLayout>
  )
}
