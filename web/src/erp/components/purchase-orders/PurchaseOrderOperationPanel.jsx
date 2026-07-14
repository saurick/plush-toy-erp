import React from 'react'
import {
  DownOutlined,
  DownloadOutlined,
  EditOutlined,
  FileTextOutlined,
  ImportOutlined,
  LinkOutlined,
  PlusOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import { Button, Dropdown, Space, Tooltip } from 'antd'

import {
  BusinessOperationPanel,
  DateRangeFilter,
  SearchInput,
  SelectFilter,
  SelectionActionBar,
  ToolbarButton,
} from '../business-list/BusinessListLayout.jsx'
import {
  PURCHASE_ORDER_DATE_FILTER_OPTIONS,
  PURCHASE_ORDER_RELATED_MENU_ITEMS,
  PURCHASE_ORDER_SORT_OPTIONS,
  PURCHASE_ORDER_STATUS_OPTIONS,
} from './purchaseOrderPageConfig.mjs'

export default function PurchaseOrderOperationPanel({
  applySelectedRowKeys,
  canCreate = false,
  canGenerateInboundDraft = false,
  clearFilters,
  dateFilterEnd = '',
  dateFilterField = 'purchase_date',
  dateFilterStart = '',
  exportOrders,
  generatingInboundDraft = false,
  hasActiveFilters = false,
  itemsLoading = false,
  keyword = '',
  lifecycleMenuItems = [],
  loadOrders,
  openCreateModal,
  openEditModal,
  openInboundDraftModal,
  openRelatedTable,
  orders = [],
  primaryLifecycleAction,
  printPurchaseContract,
  printingContract = false,
  requestLifecycleAction,
  saving = false,
  secondaryLifecycleActions = [],
  selectedItems = [],
  selectedOrderCanEdit = false,
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

  return (
    <BusinessOperationPanel
      compact
      onClearFilters={clearFilters}
      clearFiltersDisabled={!hasActiveFilters}
      filters={
        <>
          <SearchInput
            value={keyword}
            placeholder="搜索采购单"
            searchHint="可搜索：采购单号、供应商单号"
            onChange={(event) => {
              resetPagination()
              setKeyword(event.target.value)
            }}
            onPressEnter={loadOrders}
          />
          <SelectFilter
            className="erp-business-filter-control--status"
            value={status}
            options={PURCHASE_ORDER_STATUS_OPTIONS}
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
            onChange={setSortValue}
          />
        </>
      }
      actions={
        <Space wrap>
          <ToolbarButton
            icon={<DownloadOutlined />}
            disabled={orders.length === 0}
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
        <ToolbarButton
          type="primary"
          className="erp-business-list-toolbar__primary-action"
          icon={<PlusOutlined />}
          disabled={!canCreate}
          onClick={openCreateModal}
        >
          新建采购订单
        </ToolbarButton>
      }
    >
      <SelectionActionBar
        embedded
        selectedCount={selectedRowKeys.length}
        selectedLabel={selectedOrderDisplayText}
        selectedItems={selectedItems}
      >
        <Button
          type="link"
          size="small"
          disabled={selectedRowKeys.length === 0}
          onClick={() => {
            applySelectedRowKeys([])
            setSelectedOrder(null)
          }}
        >
          清空
        </Button>
        <Button
          size="small"
          icon={<EditOutlined />}
          loading={itemsLoading}
          disabled={!selectedOrderCanEdit || itemsLoading}
          onClick={() => openEditModal(singleSelectedOrder)}
        >
          编辑
        </Button>
        <Dropdown
          trigger={['click']}
          destroyOnHidden
          disabled={selectedRowKeys.length !== 1 || !singleSelectedOrder}
          menu={{
            items: PURCHASE_ORDER_RELATED_MENU_ITEMS,
            onClick: openRelatedTable,
          }}
        >
          <Button
            size="small"
            icon={<LinkOutlined />}
            disabled={selectedRowKeys.length !== 1 || !singleSelectedOrder}
          >
            相关单据 <DownOutlined />
          </Button>
        </Dropdown>
        {primaryLifecycleAction ? (
          <Button
            size="small"
            type="primary"
            disabled={
              saving || selectedRowKeys.length !== 1 || !singleSelectedOrder
            }
            loading={saving}
            onClick={() =>
              requestLifecycleAction(
                primaryLifecycleAction,
                singleSelectedOrder
              )
            }
          >
            {primaryLifecycleAction.label}
          </Button>
        ) : null}
        <Tooltip
          title={
            canGenerateInboundDraft
              ? '按当前采购订单剩余明细生成采购入库草稿'
              : '仅已审核采购订单且具备采购入库创建权限时可生成'
          }
        >
          <span>
            <Button
              size="small"
              type="primary"
              icon={<ImportOutlined />}
              disabled={
                !canGenerateInboundDraft ||
                selectedRowKeys.length !== 1 ||
                !singleSelectedOrder
              }
              loading={generatingInboundDraft}
              onClick={() => openInboundDraftModal(singleSelectedOrder)}
            >
              生成入库
            </Button>
          </span>
        </Tooltip>
        <Button
          size="small"
          icon={<FileTextOutlined />}
          disabled={
            selectedRowKeys.length !== 1 || !singleSelectedOrder || itemsLoading
          }
          loading={printingContract}
          onClick={() => printPurchaseContract(singleSelectedOrder)}
        >
          打印合同
        </Button>
        <Dropdown
          trigger={['click']}
          destroyOnHidden
          disabled={
            saving ||
            selectedRowKeys.length !== 1 ||
            !singleSelectedOrder ||
            secondaryLifecycleActions.length === 0
          }
          menu={{
            items: lifecycleMenuItems,
            onClick: ({ key }) => {
              const action = secondaryLifecycleActions.find(
                (item) => item.key === key
              )
              requestLifecycleAction(action, singleSelectedOrder)
            },
          }}
        >
          <Button
            size="small"
            aria-label="更多操作"
            disabled={
              saving ||
              selectedRowKeys.length !== 1 ||
              !singleSelectedOrder ||
              secondaryLifecycleActions.length === 0
            }
          >
            更多 <DownOutlined />
          </Button>
        </Dropdown>
      </SelectionActionBar>
    </BusinessOperationPanel>
  )
}
