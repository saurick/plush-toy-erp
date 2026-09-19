import React from 'react'
import {
  DownOutlined,
  DownloadOutlined,
  EditOutlined,
  EyeOutlined,
  FileTextOutlined,
  ImportOutlined,
  LinkOutlined,
  OrderedListOutlined,
  PlusOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import { Button, Dropdown, Space } from 'antd'
import { BUSINESS_SEARCH_SCOPES } from '../../utils/businessSearchScopes.mjs'

import {
  BusinessActionTooltip,
  BusinessLifecycleSecondaryAction,
  BusinessLifecyclePrimaryAction,
  BusinessOperationPanel,
  DateRangeFilter,
  SearchInput,
  SelectFilter,
  SelectionActionBar,
  SelectionClearAction,
  ToolbarButton,
} from '../business-list/BusinessListLayout.jsx'
import LifecycleScopeFilter from '../business-list/LifecycleScopeFilter.jsx'
import {
  PURCHASE_ORDER_DATE_FILTER_OPTIONS,
  PURCHASE_ORDER_RELATED_MENU_ITEMS,
  PURCHASE_ORDER_SORT_OPTIONS,
  PURCHASE_ORDER_STATUS_OPTIONS,
} from './purchaseOrderPageConfig.mjs'
import { filterLifecycleStatusOptions } from '../../utils/lifecycleScope.mjs'
import { resolveRelatedRecordActionAvailability } from '../../utils/operationalActionAvailability.mjs'

export default function PurchaseOrderOperationPanel({
  applySelectedRowKeys,
  canCreate = false,
  canCreateInboundDraftAction = false,
  canUpdate = false,
  referenceDataReady = false,
  canGenerateInboundDraft = false,
  hasInboundWarehouse = false,
  inboundReferenceDataState = 'loading',
  clearFilters,
  dateFilterEnd = '',
  dateFilterField = 'purchase_date',
  dateFilterStart = '',
  exportDisabled = false,
  exporting = false,
  exportOrders,
  generatingInboundDraft = false,
  hasActiveFilters = false,
  itemsLoading = false,
  lineOrderLoading = false,
  keyword = '',
  lifecycleScope = 'current',
  lifecycleActionStates = {},
  onLifecycleScopeChange,
  showLifecyclePrimary = false,
  loadOrders,
  openCreateModal,
  openEditModal,
  openDetails,
  openInboundDraftModal,
  openLineOrder,
  openRelatedTable,
  relatedMenuItems = PURCHASE_ORDER_RELATED_MENU_ITEMS,
  orders = [],
  primaryLifecycleAction,
  printPurchaseContract,
  printPurchaseContracts,
  printingContract = false,
  requestLifecycleAction,
  saving = false,
  secondaryLifecycleActions = [],
  selectedItems = [],
  selectedOrders = [],
  selectedOrderCanEdit = false,
  selectedOrderCanReorder = false,
  selectedOrderDisplayText = '请先选择采购订单',
  selectedRowKeys = [],
  setColumnOrderOpen,
  setDateFilterEnd,
  setDateFilterField,
  setDateFilterStart,
  setKeyword,
  setPagination,
  setSelectedOrder,
  setSortValue,
  setStatus,
  setSupplierFilter,
  singleSelectedOrder,
  sortValue = 'updated_at:desc',
  status = '',
  supplierFilter = '',
  supplierOptions = [],
}) {
  const resetPagination = () =>
    setPagination((current) => ({ ...current, current: 1 }))
  const hasSingleSelection =
    selectedRowKeys.length === 1 && Boolean(singleSelectedOrder)
  const selectedPrintOrders = Array.isArray(selectedOrders)
    ? selectedOrders
    : []
  const printSelectionCount = selectedPrintOrders.length
  const printSelectionReady =
    printSelectionCount > 0 && printSelectionCount === selectedRowKeys.length
  const selectedLifecycleStatus = String(
    singleSelectedOrder?.lifecycle_status || ''
  ).toLowerCase()
  const recordActionBusy =
    saving ||
    generatingInboundDraft ||
    printingContract ||
    itemsLoading ||
    lineOrderLoading
  const relatedActionAvailability = resolveRelatedRecordActionAvailability({
    authorized: relatedMenuItems.length > 0,
    record: singleSelectedOrder,
    itemCount: relatedMenuItems.length,
    busy: recordActionBusy,
    busyReason: '当前订单操作完成后可查看相关单据',
  })
  const primaryLifecycleState = lifecycleActionStates[
    primaryLifecycleAction?.key
  ] || {
    disabled: true,
    disabledReason: '请先选择一条采购订单',
  }

  return (
    <BusinessOperationPanel
      compact
      onClearFilters={clearFilters}
      clearFiltersDisabled={!hasActiveFilters}
      filters={
        <>
          <SearchInput
            value={keyword}
            {...BUSINESS_SEARCH_SCOPES.purchase}
            onChange={(event) => {
              resetPagination()
              setKeyword(event.target.value)
            }}
            onPressEnter={loadOrders}
          />
          <LifecycleScopeFilter
            value={lifecycleScope}
            onChange={onLifecycleScopeChange}
          />
          <SelectFilter
            className="erp-business-filter-control--status"
            value={status}
            options={filterLifecycleStatusOptions(
              PURCHASE_ORDER_STATUS_OPTIONS,
              lifecycleScope,
              ['closed', 'canceled']
            )}
            onChange={(value) => {
              resetPagination()
              setStatus(value)
            }}
          />
          <SelectFilter
            className="erp-business-filter-control--status"
            value={supplierFilter}
            options={[{ label: '全部供应商', value: '' }, ...supplierOptions]}
            placeholder="全部供应商"
            showSearch
            optionFilterProp="label"
            onChange={(value) => {
              resetPagination()
              setSupplierFilter(value || '')
            }}
          />
          <DateRangeFilter
            options={PURCHASE_ORDER_DATE_FILTER_OPTIONS}
            value={dateFilterField}
            onTypeChange={(value) => {
              resetPagination()
              setDateFilterField(value || 'purchase_date')
            }}
            startValue={dateFilterStart}
            endValue={dateFilterEnd}
            onStartChange={(value) => {
              resetPagination()
              setDateFilterStart(value)
            }}
            onEndChange={(value) => {
              resetPagination()
              setDateFilterEnd(value)
            }}
          />
          <SelectFilter
            className="erp-business-filter-control--sort"
            value={sortValue}
            options={PURCHASE_ORDER_SORT_OPTIONS}
            onChange={(value) => {
              resetPagination()
              setSortValue(value)
            }}
          />
        </>
      }
      actions={
        <Space wrap>
          <ToolbarButton
            icon={<DownloadOutlined />}
            loading={exporting}
            disabled={exportDisabled || orders.length === 0}
            onClick={exportOrders}
          >
            导出筛选结果
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
        canCreate ? (
          <BusinessActionTooltip
            disabled={!referenceDataReady}
            disabledReason="采购基础资料加载完成后可新建"
          >
            <ToolbarButton
              type="primary"
              className="erp-business-list-toolbar__primary-action"
              icon={<PlusOutlined />}
              disabled={!referenceDataReady}
              onClick={openCreateModal}
            >
              新建采购订单
            </ToolbarButton>
          </BusinessActionTooltip>
        ) : null
      }
    >
      <SelectionActionBar
        embedded
        selectedCount={selectedRowKeys.length}
        selectedLabel={selectedOrderDisplayText}
        selectedItems={selectedItems}
      >
        <SelectionClearAction
          selectedCount={selectedRowKeys.length}
          selectionLabel="采购订单"
          label="清空"
          disabled={recordActionBusy}
          disabledReason="当前订单操作完成后可更换选择"
          onClear={() => {
            if (recordActionBusy) return
            applySelectedRowKeys([])
            setSelectedOrder(null)
          }}
        />
        {canUpdate ? (
          <BusinessActionTooltip
            selectionActionPriority={20}
            visible={!singleSelectedOrder || selectedOrderCanReorder}
            disabled={!selectedOrderCanReorder || recordActionBusy}
            disabledReason={
              !singleSelectedOrder
                ? '请先选择一条采购订单'
                : !selectedOrderCanReorder
                  ? '当前状态不能调整材料顺序'
                  : recordActionBusy
                    ? '当前订单操作完成后可调整材料顺序'
                    : ''
            }
          >
            <Button
              size="small"
              data-business-action-key="line-order"
              icon={<OrderedListOutlined />}
              loading={lineOrderLoading}
              disabled={!selectedOrderCanReorder || recordActionBusy}
              onClick={openLineOrder}
            >
              材料顺序
            </Button>
          </BusinessActionTooltip>
        ) : null}
        <BusinessActionTooltip
          disabled={!hasSingleSelection || recordActionBusy}
          disabledReason={
            recordActionBusy
              ? '当前订单操作完成后可查看'
              : '请先选择一条采购订单'
          }
        >
          <Button
            data-business-action-key="purchase-details"
            size="small"
            icon={<EyeOutlined />}
            disabled={!hasSingleSelection || recordActionBusy}
            onClick={() => openDetails(singleSelectedOrder)}
          >
            查看详情
          </Button>
        </BusinessActionTooltip>
        {canUpdate ? (
          <BusinessActionTooltip
            visible={
              !singleSelectedOrder || selectedLifecycleStatus === 'draft'
            }
            disabled={
              !selectedOrderCanEdit || !referenceDataReady || recordActionBusy
            }
            disabledReason={
              !singleSelectedOrder
                ? '请先选择一条采购订单'
                : selectedLifecycleStatus !== 'draft'
                  ? '只有草稿采购订单可以编辑'
                  : !referenceDataReady
                    ? '采购基础资料加载完成后可编辑'
                    : recordActionBusy
                      ? '当前订单操作完成后可编辑'
                      : ''
            }
          >
            <Button
              data-business-action-key="purchase-edit"
              size="small"
              icon={<EditOutlined />}
              loading={itemsLoading}
              disabled={
                !selectedOrderCanEdit || !referenceDataReady || recordActionBusy
              }
              onClick={() => openEditModal(singleSelectedOrder)}
            >
              编辑
            </Button>
          </BusinessActionTooltip>
        ) : null}
        {relatedActionAvailability.visible ? (
          <BusinessActionTooltip
            disabled={relatedActionAvailability.disabled}
            disabledReason={relatedActionAvailability.disabledReason}
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
                data-business-action-key="related-records"
                size="small"
                icon={<LinkOutlined />}
                disabled={relatedActionAvailability.disabled}
              >
                相关单据 <DownOutlined />
              </Button>
            </Dropdown>
          </BusinessActionTooltip>
        ) : null}
        {showLifecyclePrimary ? (
          <BusinessLifecyclePrimaryAction
            action={primaryLifecycleAction}
            disabled={primaryLifecycleState.disabled}
            disabledReason={primaryLifecycleState.disabledReason}
            loading={saving && Boolean(primaryLifecycleAction)}
            onAction={(action) =>
              requestLifecycleAction(action, singleSelectedOrder)
            }
          />
        ) : null}
        {canCreateInboundDraftAction ? (
          <BusinessActionTooltip
            visible={
              !singleSelectedOrder ||
              ['draft', 'submitted', 'approved'].includes(
                selectedLifecycleStatus
              )
            }
            disabled={
              !canGenerateInboundDraft ||
              inboundReferenceDataState !== 'ready' ||
              !hasInboundWarehouse ||
              !hasSingleSelection ||
              recordActionBusy
            }
            disabledReason={
              !singleSelectedOrder
                ? '请先选择一条采购订单'
                : selectedLifecycleStatus !== 'approved'
                  ? '采购订单审核通过后，由仓库登记实际到货'
                  : inboundReferenceDataState !== 'ready'
                    ? inboundReferenceDataState === 'loading'
                      ? '入库仓库资料加载完成后可生成'
                      : '入库仓库资料加载失败，请刷新当前页后重试'
                    : !hasInboundWarehouse
                      ? '请先维护至少一个启用的入库仓库'
                      : recordActionBusy
                        ? '入库草稿生成完成后可继续'
                        : ''
            }
          >
            <Button
              data-business-action-key="generate-inbound"
              size="small"
              type="primary"
              icon={<ImportOutlined />}
              disabled={
                !canGenerateInboundDraft ||
                inboundReferenceDataState !== 'ready' ||
                !hasInboundWarehouse ||
                !hasSingleSelection ||
                recordActionBusy
              }
              loading={generatingInboundDraft}
              onClick={() => openInboundDraftModal(singleSelectedOrder)}
            >
              登记到货
            </Button>
          </BusinessActionTooltip>
        ) : null}
        <BusinessActionTooltip
          selectionActionPriority={printSelectionCount > 1 ? 120 : 40}
          disabled={!printSelectionReady || recordActionBusy}
          disabledReason={
            recordActionBusy
              ? '当前订单操作完成后可打印'
              : selectedRowKeys.length > 0 && !printSelectionReady
                ? '当前选择已变化，请刷新列表后重新选择'
                : '请先选择采购订单'
          }
        >
          <Button
            data-business-action-key="print-contract"
            size="small"
            icon={<FileTextOutlined />}
            disabled={!printSelectionReady || recordActionBusy}
            loading={printingContract}
            onClick={() => {
              if (printSelectionCount === 1) {
                printPurchaseContract(selectedPrintOrders[0])
                return
              }
              printPurchaseContracts(selectedPrintOrders)
            }}
          >
            {printSelectionCount > 1 ? '批量打印合同' : '打印合同'}
          </Button>
        </BusinessActionTooltip>
        {secondaryLifecycleActions.map((action) => (
          <BusinessLifecycleSecondaryAction
            key={action.key}
            action={action}
            disabled={lifecycleActionStates[action.key]?.disabled}
            disabledReason={lifecycleActionStates[action.key]?.disabledReason}
            onAction={(requestedAction) =>
              requestLifecycleAction(requestedAction, singleSelectedOrder)
            }
          />
        ))}
      </SelectionActionBar>
    </BusinessOperationPanel>
  )
}
