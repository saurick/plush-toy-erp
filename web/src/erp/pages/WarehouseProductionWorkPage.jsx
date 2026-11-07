import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react'
import { Alert, Button, Checkbox, Descriptions, Form, Input, Tag } from 'antd'
import { PermissionCode } from '../../common/consts/permissions.generated.mjs'
import {
  WarehouseProductionKind as Kind,
  WarehouseProductionStage as Stage,
} from '../../common/consts/statuses.generated.mjs'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { isRpcAbortError } from '@/common/utils/jsonRpc'
import { listWarehouseProductionWork } from '../api/warehouseProductionApi.mjs'
import { postProductionFact } from '../api/operationalFactApi.mjs'
import useBusinessPageContext from '../hooks/useBusinessPageContext.js'
import useBusinessPageState from '../hooks/useBusinessPageState.js'
import useLatestRequestCoordinator from '../hooks/useLatestRequestCoordinator.js'
import useWorkflowTaskBusinessBusy from '../hooks/useWorkflowTaskBusinessBusy.js'
import { hasActionPermission } from '../utils/masterDataOrderView.mjs'
import { compareProductionWipQuantity } from '../utils/productionWipModel.mjs'
import {
  warehouseProductionStageLabels,
  warehouseProductionStageOptions,
  warehouseProductionActionLabel,
  warehouseProductionNextStep,
} from '../utils/warehouseProductionWork.mjs'
import {
  createBusinessTablePagination,
  DEFAULT_BUSINESS_PAGE_SIZE,
} from '../utils/businessPagination.mjs'
import {
  BusinessDataTable,
  BusinessOperationPanel,
  BusinessPageLayout,
  BusinessActionTooltip,
  SearchInput,
  SelectionActionBar,
  SelectionClearAction,
} from '../components/business-list/BusinessListLayout.jsx'
import BusinessStatusFilter from '../components/business-list/BusinessStatusFilter.jsx'
import BusinessFormModal from '../components/business-list/BusinessFormModal.jsx'
import BusinessForm from '../components/business-list/BusinessForm.jsx'
import BusinessDetailsModal from '../components/business-list/BusinessDetailsModal.jsx'
import BusinessCellStack from '../components/business-list/BusinessCellStack.jsx'
import ProductionRouteExecutionModal from '../components/production-orders/ProductionRouteExecutionModal.jsx'
import ProductionCompletionModal from '../components/production-orders/ProductionCompletionModal.jsx'
import { useProductionFactActions } from '../components/production-orders/useProductionFactActions.mjs'

const EMPTY_PAGE = { items: [], total: 0, counts: {} }

function ReceiptReviewInitialization({ receipt }) {
  const form = Form.useFormInstance()
  useLayoutEffect(() => {
    // Initialize the connected form before input; opening animations must not reset a count.
    form.resetFields()
    form.setFieldsValue({ quantity: receipt.quantity, checked: false })
  }, [form, receipt])
  return null
}

export default function WarehouseProductionWorkPage({ kind }) {
  const context = useBusinessPageContext() || {}
  const { registerPageRefresh } = context
  const profile = context.adminProfile || {}
  const allowed = (permission) => hasActionPermission(profile, permission)
  const [query, setQuery] = useBusinessPageState('warehouseProductionQuery', {
    keyword: '',
    stage: '',
    current: 1,
    pageSize: DEFAULT_BUSINESS_PAGE_SIZE,
  })
  const [selectionID, setSelectionID] = useBusinessPageState(
    'warehouseProductionSelection',
    null
  )
  const [page, setPage] = useState(EMPTY_PAGE)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [routeRecord, setRouteRecord] = useState(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [receiptReview, setReceiptReview] = useState(null)
  const [saving, setSaving] = useState(false)
  const [reviewForm] = Form.useForm()
  const beginLatestRequest = useLatestRequestCoordinator()
  const selected = page.items.find((row) => row.id === selectionID) || null
  const title = kind === Kind.RETURN ? '工序回货' : '成品入库'
  const readPermission =
    kind === Kind.RETURN
      ? PermissionCode.PRODUCTION_WIP_READ
      : PermissionCode.PRODUCTION_FACT_READ
  const canRead = allowed(readPermission)
  const canReadWip = allowed(PermissionCode.PRODUCTION_WIP_READ)
  const canPostReceipt = allowed(PermissionCode.WAREHOUSE_INBOUND_CONFIRM)
  const canReceive = allowed(PermissionCode.OUTSOURCING_RETURN_RECEIPT_CREATE)
  const canPack = allowed(PermissionCode.WAREHOUSE_PACKAGING_EXECUTE)
  const hasWorkAction =
    !selected ||
    [Stage.RETURN, Stage.INBOUND, Stage.PACKAGING].includes(selected.stage)
  useWorkflowTaskBusinessBusy(saving)

  const loadRows = useCallback(async () => {
    const request = beginLatestRequest('warehouse-production-list')
    if (!canRead) {
      setPage(EMPTY_PAGE)
      setLoading(false)
      request.finish()
      return
    }
    setLoading(true)
    try {
      const result = await listWarehouseProductionWork(
        {
          kind,
          keyword: query.keyword,
          stage: query.stage,
          limit: query.pageSize,
          offset: (query.current - 1) * query.pageSize,
        },
        { signal: request.signal }
      )
      if (!request.isCurrent()) return
      setPage(result)
      setLoadError('')
    } catch (error) {
      if (isRpcAbortError(error) || !request.isCurrent()) return
      setPage(EMPTY_PAGE)
      setLoadError(getActionErrorMessage(error, `读取${title}`))
    } finally {
      if (request.isCurrent()) setLoading(false)
      request.finish()
    }
  }, [beginLatestRequest, canRead, kind, query, title])
  useEffect(() => {
    loadRows()
  }, [loadRows])
  useEffect(
    () => registerPageRefresh?.(loadRows),
    [registerPageRefresh, loadRows]
  )
  const changeQuery = (values) =>
    setQuery((current) => ({ ...current, ...values, current: 1 }))
  const drafts = useProductionFactActions({
    adminProfile: profile,
    loadRows,
    canCreateProductionRework: false,
    canViewProductionReworkProgress: false,
    resetPaginationForKey: () => {},
  })
  const factFor = (row) => ({
    id: row.fact_id,
    version: row.fact_version,
    status: row.fact_status,
    fact_type: 'FINISHED_GOODS_RECEIPT',
    source_type: 'PRODUCTION_ORDER',
    source_id: row.production_order_id,
    source_line_id: row.production_order_item_id,
    production_wip_batch_id: row.production_wip_batch_id,
  })
  const canEditReceipt =
    selected?.stage === Stage.INBOUND &&
    selected.production_order_id > 0 &&
    (canPostReceipt || allowed(PermissionCode.PRODUCTION_COMPLETION_CREATE))
  const sourceUnavailable =
    selected &&
    (!selected.production_order_id ||
      !selected.production_order_item_id ||
      !selected.production_wip_batch_id ||
      (selected.kind === Kind.RECEIPT &&
        (!selected.fact_id || !selected.fact_version)))
  const actionDisabledReason = !selected
    ? '请先选择一条记录'
    : loading || saving
      ? '当前操作完成后可继续'
      : sourceUnavailable && hasWorkAction
        ? '办理来源不完整，请先核对原生产记录'
        : selected.stage === Stage.INBOUND && !canPostReceipt
          ? '当前账号不能确认成品入库'
          : [Stage.RETURN, Stage.PACKAGING].includes(selected.stage) &&
              !canReadWip
            ? '当前账号不能读取工序明细'
            : selected.stage === Stage.RETURN && !canReceive
              ? '当前账号不能登记工序回货'
              : selected.stage === Stage.PACKAGING && !canPack
                ? '当前账号不能办理查货包装'
                : selected.stage === Stage.PACKAGING &&
                    !selected.packaging_confirmed
                  ? '等待业务确认包装资料，当前可查看进度'
                  : ''

  const openAction = () => {
    if (!selected) return
    if (selected.stage === Stage.INBOUND) {
      setReceiptReview(selected)
      return
    }
    if (
      [Stage.RETURN, Stage.PACKAGING].includes(selected.stage) &&
      selected.action &&
      selected.action_batch_id > 0
    ) {
      setRouteRecord(selected)
      return
    }
    setDetailsOpen(true)
  }
  const confirmReceipt = async () => {
    try {
      await reviewForm.validateFields()
    } catch (error) {
      if (!error?.errorFields) {
        message.error(getActionErrorMessage(error, '核对成品入库'))
      }
      return
    }
    if (!receiptReview || !canPostReceipt || saving) return
    setSaving(true)
    try {
      await postProductionFact({
        id: receiptReview.fact_id,
        expected_version: receiptReview.fact_version,
      })
      message.success('成品已确认入库；待检、待包装数量仍不能发货')
      setReceiptReview(null)
      await loadRows()
    } catch (error) {
      message.error(getActionErrorMessage(error, '确认成品入库'))
      await loadRows()
    } finally {
      setSaving(false)
    }
  }
  const columns = useMemo(
    () => [
      {
        title: '业务单据 / 来源',
        key: 'source',
        width: 230,
        render: (_, row) => (
          <BusinessCellStack
            primary={row.fact_no || row.order_no}
            secondary={[
              row.fact_no ? row.order_no : row.operation_name,
              row.batch_no,
            ]
              .filter(Boolean)
              .join(' · ')}
          />
        ),
      },
      {
        title: '存货 / 规格',
        key: 'product',
        width: 230,
        render: (_, row) => (
          <BusinessCellStack
            primary={row.product_name || '来源产品待核对'}
            secondary={[row.product_code, row.sku_code]
              .filter(Boolean)
              .join(' · ')}
          />
        ),
      },
      {
        title: '仓库 / 批次',
        key: 'warehouse',
        width: 180,
        render: (_, row) => (
          <BusinessCellStack
            primary={row.warehouse_name || row.operation_name}
            secondary={row.lot_no || row.batch_no}
          />
        ),
      },
      {
        title: '本次数量',
        key: 'quantity',
        width: 130,
        render: (_, row) => `${row.quantity} ${row.unit_name}`,
      },
      {
        title: '办理状态',
        key: 'stage',
        width: 150,
        render: (_, row) => (
          <Tag
            color={
              row.stage === Stage.READY
                ? 'green'
                : [Stage.REJECTED, Stage.CANCELLED].includes(row.stage)
                  ? 'default'
                  : 'gold'
            }
          >
            {warehouseProductionStageLabels[row.stage]}
          </Tag>
        ),
      },
      {
        title: '下一步',
        key: 'next',
        width: 180,
        render: (_, row) => warehouseProductionNextStep(row),
      },
    ],
    []
  )
  const quantity = Form.useWatch('quantity', reviewForm)
  let quantityMismatch = false
  try {
    quantityMismatch = Boolean(
      receiptReview &&
      quantity !== undefined &&
      compareProductionWipQuantity(quantity, receiptReview.quantity) !== 0
    )
  } catch {
    quantityMismatch = true
  }

  return (
    <BusinessPageLayout
      inWorkspace
      className="erp-warehouse-production-workspace"
    >
      {loadError ? (
        <Alert
          type="error"
          showIcon
          message={loadError}
          action={<Button onClick={loadRows}>重新读取</Button>}
        />
      ) : null}
      <BusinessOperationPanel
        inWorkspace
        moduleKey="inbound"
        compact
        filters={
          <>
            <SearchInput
              value={query.keyword}
              placeholder="搜来源单号、存货或批次"
              title="可搜索来源单号、产品名称或编号、规格、仓库、批次与工序"
              onSearch={(keyword) => changeQuery({ keyword })}
            />
            <BusinessStatusFilter
              inline
              value={query.stage}
              counts={{ ...page.counts, total: page.counts[''] || 0 }}
              allCount={page.counts[''] || 0}
              loading={loading}
              options={warehouseProductionStageOptions(kind)}
              aria-label={`${title}办理状态`}
              onChange={(stage) => changeQuery({ stage })}
            />
          </>
        }
      >
        <SelectionActionBar
          embedded
          selectedCount={selected ? 1 : 0}
          selectedLabel={selected?.fact_no || selected?.order_no || ''}
        >
          <SelectionClearAction
            selectedCount={selected ? 1 : 0}
            selectionLabel="仓库办理记录"
            onClear={() => setSelectionID(null)}
          />
          <BusinessActionTooltip
            disabled={Boolean(actionDisabledReason)}
            disabledReason={actionDisabledReason}
          >
            <Button
              type={hasWorkAction ? 'primary' : 'default'}
              data-business-action-key="warehouse-handle"
              data-business-action-role="primary"
              disabled={Boolean(actionDisabledReason)}
              onClick={openAction}
            >
              {warehouseProductionActionLabel(selected)}
            </Button>
          </BusinessActionTooltip>
          {hasWorkAction ? (
            <Button
              data-business-action-key="view-details"
              data-business-action-role="view"
              disabled={!selected}
              onClick={() => setDetailsOpen(true)}
            >
              查看处理进度
            </Button>
          ) : null}
          {canEditReceipt ? (
            <Button
              data-business-action-key="edit"
              data-business-action-role="edit"
              onClick={() =>
                drafts.openProductionDraftEditor(factFor(selected))
              }
            >
              编辑收仓草稿
            </Button>
          ) : null}
        </SelectionActionBar>
      </BusinessOperationPanel>
      <BusinessDataTable
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={page.items}
        rowSelection={{
          type: 'radio',
          selectedRowKeys: selected ? [selected.id] : [],
          onChange: (_, rows) => setSelectionID(rows[0]?.id || null),
        }}
        onRow={(row) => ({ onClick: () => setSelectionID(row.id) })}
        onOpenRecord={(row) => {
          setSelectionID(row.id)
          setDetailsOpen(true)
        }}
        pagination={createBusinessTablePagination({
          pagination: { current: query.current, pageSize: query.pageSize },
          total: page.total,
          onChange: (current, pageSize) =>
            setQuery((value) => ({ ...value, current, pageSize })),
        })}
        emptyDescription={`暂无符合条件的${title}记录`}
      />
      <BusinessDetailsModal
        title={`${title}处理进度`}
        open={detailsOpen}
        onCancel={() => setDetailsOpen(false)}
        footer={null}
      >
        {selected ? (
          <Descriptions
            column={1}
            size="small"
            items={[
              {
                key: 'source',
                label: '来源',
                children: [
                  selected.fact_no,
                  selected.order_no,
                  selected.batch_no,
                ]
                  .filter(Boolean)
                  .join(' · '),
              },
              {
                key: 'product',
                label: '产品 / 规格',
                children: [selected.product_name, selected.sku_code]
                  .filter(Boolean)
                  .join(' · '),
              },
              {
                key: 'status',
                label: '当前状态',
                children: warehouseProductionStageLabels[selected.stage],
              },
              {
                key: 'quantity',
                label: '本次数量',
                children: `${selected.quantity} ${selected.unit_name}`,
              },
              ...(kind === Kind.RECEIPT
                ? [
                    {
                      key: 'quality',
                      label: '待检数量',
                      children: `${selected.pending_inspection_quantity} ${selected.unit_name}`,
                    },
                    {
                      key: 'packaging',
                      label: '待包装数量',
                      children: `${selected.pending_packaging_quantity} ${selected.unit_name}`,
                    },
                    {
                      key: 'confirmation',
                      label: '包装资料',
                      children: selected.packaging_confirmed
                        ? '业务已确认'
                        : '等待业务确认',
                    },
                  ]
                : []),
            ]}
          />
        ) : null}
        <p className="erp-business-inline-note">
          {kind === Kind.RETURN
            ? '工序回货先核对实点，再交品质检验，不增加成品库存。'
            : '成品正式入库后增加账面库存；检验与查货包装完成后才能发货。包装不重复入库。'}
        </p>
      </BusinessDetailsModal>
      <BusinessFormModal
        title="确认成品入库"
        open={Boolean(receiptReview)}
        confirmLoading={saving}
        okText="确认成品入库"
        onOk={confirmReceipt}
        onCancel={() => {
          if (!saving) setReceiptReview(null)
        }}
      >
        <Descriptions
          column={1}
          size="small"
          items={[
            {
              key: 'source',
              label: '成品收仓单',
              children: receiptReview?.fact_no,
            },
            {
              key: 'product',
              label: '产品 / 规格',
              children: [receiptReview?.product_name, receiptReview?.sku_code]
                .filter(Boolean)
                .join(' · '),
            },
            {
              key: 'warehouse',
              label: '入库仓库 / 批次',
              children: [receiptReview?.warehouse_name, receiptReview?.lot_no]
                .filter(Boolean)
                .join(' · '),
            },
            {
              key: 'expected',
              label: '本单收仓数量',
              children: `${receiptReview?.quantity || '—'} ${receiptReview?.unit_name || ''}`,
            },
          ]}
        />
        <BusinessForm
          name="warehouse-finished-goods-confirmation"
          form={reviewForm}
          layout="vertical"
        >
          <Form.Item
            name="quantity"
            label={`仓库实收数量${receiptReview?.unit_name ? `（${receiptReview.unit_name}）` : ''}`}
            rules={[
              { required: true, message: '请填写仓库实收数量' },
              {
                validator: async (_, value) => {
                  try {
                    if (
                      compareProductionWipQuantity(
                        value,
                        receiptReview?.quantity
                      ) === 0
                    ) {
                      return
                    }
                  } catch {
                    /* Validation keeps malformed quantities out of the confirmation. */
                  }
                  throw new Error(
                    '实收数量与收仓单不一致，请先核对并编辑收仓草稿'
                  )
                },
              },
            ]}
          >
            <Input inputMode="decimal" />
          </Form.Item>
          {quantityMismatch ? (
            <div className="erp-business-inline-note" role="status">
              数量不一致，请先核对来源；当前不能确认入库。
            </div>
          ) : null}
          <Form.Item
            name="checked"
            valuePropName="checked"
            rules={[
              {
                validator: async (_, value) => {
                  if (!value) throw new Error('请先核对实物、仓库和批次')
                },
              },
            ]}
          >
            <Checkbox>实物、仓库、批次与本次来源一致</Checkbox>
          </Form.Item>
          {receiptReview ? (
            <ReceiptReviewInitialization receipt={receiptReview} />
          ) : null}
        </BusinessForm>
        <p className="erp-business-inline-note">
          确认后增加账面库存；待检、待包装数量仍不可发货。
        </p>
      </BusinessFormModal>
      <ProductionRouteExecutionModal
        open={Boolean(routeRecord)}
        productionOrder={
          routeRecord ? { id: routeRecord.production_order_id } : null
        }
        initialBatchID={routeRecord?.action_batch_id}
        initialAction={routeRecord?.action || ''}
        initialFinishedGoodsReceiptID={
          routeRecord?.kind === Kind.RECEIPT ? routeRecord.fact_id : null
        }
        canReceiveReturn={canReceive}
        canWarehousePackaging={canPack}
        onCancel={() => setRouteRecord(null)}
        onChanged={loadRows}
      />
      <ProductionCompletionModal
        mode="edit"
        open={drafts.productionDraftEditContext?.kind === 'completion'}
        initialValues={drafts.productionDraftEditContext?.initialValues}
        excludeFactID={drafts.productionDraftEditContext?.record?.id}
        order={drafts.productionDraftEditContext?.order}
        items={drafts.productionDraftEditContext?.items}
        facts={drafts.productionDraftEditContext?.facts}
        wipAggregate={drafts.productionDraftEditContext?.wipAggregate}
        warehouseOptions={drafts.productionDraftEditContext?.warehouseOptions}
        lots={drafts.productionDraftEditContext?.lots}
        loading={drafts.productionDraftEditLoading}
        onCancel={drafts.closeProductionDraftEditor}
        onSubmit={drafts.submitProductionDraftEdit}
      />
    </BusinessPageLayout>
  )
}
