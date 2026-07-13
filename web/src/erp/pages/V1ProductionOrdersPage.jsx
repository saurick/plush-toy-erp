import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, Form, Input, Modal, Select, Tag, Typography } from 'antd'
import {
  EditOutlined,
  EyeOutlined,
  PlusOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import { useOutletContext, useSearchParams } from 'react-router-dom'
import { message, modal } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { isRpcAbortError } from '@/common/utils/jsonRpc'
import {
  BusinessDataTable,
  BusinessOperationPanel,
  BusinessPageLayout,
  DateRangeFilter,
  PageHeaderCard,
  SearchInput,
  SelectionActionBar,
} from '../components/business-list/BusinessListLayout.jsx'
import ProductionOrderFormModal from '../components/production-orders/ProductionOrderFormModal.jsx'
import {
  cancelProductionOrder,
  closeProductionOrder,
  createProductionOrder,
  getProductionOrder,
  listProductionOrderReferenceOptions,
  listProductionOrders,
  releaseProductionOrder,
  saveProductionOrder,
} from '../api/productionOrderApi.mjs'
import useLatestRequestCoordinator from '../hooks/useLatestRequestCoordinator.js'
import { hasActionPermission } from '../utils/masterDataOrderView.mjs'
import {
  createProductionOrderAttemptStore,
  dateInputToUnix,
  isProductionOrderResultUnknown,
  PRODUCTION_ORDER_STATUS,
  PRODUCTION_ORDER_STATUS_META,
  unixToDateInput,
} from '../utils/productionOrderModel.mjs'

const { Text } = Typography
const DEFAULT_QUERY = Object.freeze({
  keyword: '',
  status: '',
  date_field: 'planned_start_at',
  date_from: '',
  date_to: '',
  sort_by: 'updated_at',
  sort_direction: 'desc',
  page: 1,
  page_size: 20,
})

function positiveQuery(value, fallback) {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback
}

function queryFromSearchParams(params) {
  return {
    keyword: params.get('keyword') || '',
    status: params.get('status') || '',
    date_field: params.get('date_field') || DEFAULT_QUERY.date_field,
    date_from: params.get('date_from') || '',
    date_to: params.get('date_to') || '',
    sort_by: params.get('sort_by') || DEFAULT_QUERY.sort_by,
    sort_direction:
      params.get('sort_direction') || DEFAULT_QUERY.sort_direction,
    page: positiveQuery(params.get('page'), 1),
    page_size: Math.min(200, positiveQuery(params.get('page_size'), 20)),
  }
}

function displayTime(value) {
  if (!value) return '-'
  return new Date(value * 1000).toLocaleString('zh-CN', { hour12: false })
}

function optionIDs(items, key) {
  return [
    ...new Set(
      items
        .map((item) => item?.[key])
        .filter((value) => Number.isSafeInteger(value) && value > 0)
    ),
  ]
}

function aggregateToForm(aggregate) {
  return {
    order_no: aggregate.order.order_no,
    planned_start_at: unixToDateInput(aggregate.order.planned_start_at),
    planned_end_at: unixToDateInput(aggregate.order.planned_end_at),
    note: aggregate.order.note || '',
    items: aggregate.items.map((item) => ({
      line_no: item.line_no,
      product_id: item.product_id,
      product_sku_id: item.product_sku_id ?? null,
      unit_id: item.unit_id,
      planned_quantity: item.planned_quantity,
      sales_order_item_id: item.sales_order_item_id ?? null,
      bom_header_id: item.bom_header_id ?? null,
      note: item.note || '',
    })),
  }
}

function draftParams(values) {
  return {
    order_no: String(values.order_no || '').trim(),
    planned_start_at: dateInputToUnix(values.planned_start_at),
    planned_end_at: dateInputToUnix(values.planned_end_at),
    note: String(values.note || '').trim() || null,
    items: (values.items || []).map((item, index) => ({
      line_no: index + 1,
      product_id: item.product_id,
      product_sku_id: item.product_sku_id || null,
      unit_id: item.unit_id,
      planned_quantity: String(item.planned_quantity || '').trim(),
      sales_order_item_id: item.sales_order_item_id || null,
      bom_header_id: item.bom_header_id || null,
      note: String(item.note || '').trim() || null,
    })),
  }
}

export default function V1ProductionOrdersPage() {
  const outletContext = useOutletContext()
  const adminProfile = outletContext?.adminProfile || {}
  const [searchParams, setSearchParams] = useSearchParams()
  const [form] = Form.useForm()
  const [reasonForm] = Form.useForm()
  const [query, setQuery] = useState(() => queryFromSearchParams(searchParams))
  const [orders, setOrders] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [mutationLoading, setMutationLoading] = useState(false)
  const [selected, setSelected] = useState(null)
  const [aggregate, setAggregate] = useState(null)
  const [formMode, setFormMode] = useState(null)
  const [formValues, setFormValues] = useState(null)
  const [reasonAction, setReasonAction] = useState(null)
  const [optionsByType, setOptionsByType] = useState({})
  const attemptsRef = useRef(createProductionOrderAttemptStore())
  const inFlightRef = useRef(false)
  const beginLatestRequest = useLatestRequestCoordinator()

  const canRead = hasActionPermission(adminProfile, 'pmc.plan.read')
  const canCreate = hasActionPermission(adminProfile, 'pmc.plan.create')
  const canUpdate = hasActionPermission(adminProfile, 'pmc.plan.update')

  const writeQuery = useCallback(
    (patch) => {
      const next = { ...query, ...patch }
      setQuery(next)
      const params = new URLSearchParams()
      for (const [key, value] of Object.entries(next)) {
        if (value !== '' && value !== null && value !== undefined) {
          params.set(key, String(value))
        }
      }
      setSearchParams(params, { replace: true })
    },
    [query, setSearchParams]
  )

  const loadOrders = useCallback(async () => {
    if (!canRead) return
    const request = beginLatestRequest('production-orders')
    setLoading(true)
    try {
      const data = await listProductionOrders(
        {
          keyword: query.keyword,
          status: query.status,
          date_field: query.date_field,
          date_from: dateInputToUnix(query.date_from),
          date_to: dateInputToUnix(query.date_to),
          sort_by: query.sort_by,
          sort_direction: query.sort_direction,
          limit: query.page_size,
          offset: (query.page - 1) * query.page_size,
        },
        { signal: request.signal }
      )
      if (!request.isCurrent()) return
      setOrders(data.production_orders)
      setTotal(data.total)
    } catch (error) {
      if (!isRpcAbortError(error) && request.isCurrent()) {
        message.error(getActionErrorMessage(error, '加载生产订单'))
      }
    } finally {
      if (request.isCurrent()) setLoading(false)
      request.finish()
    }
  }, [beginLatestRequest, canRead, query])

  useEffect(() => {
    loadOrders()
  }, [loadOrders])

  useEffect(() => {
    if (!formMode || !formValues) return
    form.resetFields()
    form.setFieldsValue(formValues)
  }, [form, formMode, formValues])

  useEffect(() => {
    if (!reasonAction) return
    reasonForm.resetFields()
  }, [reasonAction, reasonForm])

  const loadHistoricalOptions = async (items) => {
    const definitions = [
      ['product', 'product_id'],
      ['product_sku', 'product_sku_id'],
      ['unit', 'unit_id'],
      ['sales_order_item', 'sales_order_item_id'],
      ['active_bom', 'bom_header_id'],
    ]
    const pairs = await Promise.all(
      definitions.map(async ([type, key]) => {
        const ids = optionIDs(items, key)
        if (ids.length === 0) return [type, []]
        const data = await listProductionOrderReferenceOptions(type, {
          selected_ids: ids,
        })
        return [type, data.options]
      })
    )
    setOptionsByType(Object.fromEntries(pairs))
  }

  const loadDetail = async (record, mode = 'view') => {
    setDetailLoading(true)
    try {
      const nextAggregate = await getProductionOrder(record.id)
      await loadHistoricalOptions(nextAggregate.items)
      setAggregate(nextAggregate)
      setSelected(nextAggregate.order)
      setFormValues(aggregateToForm(nextAggregate))
      setFormMode(mode)
    } catch (error) {
      message.error(getActionErrorMessage(error, '加载生产订单详情'))
    } finally {
      setDetailLoading(false)
    }
  }

  const selectRecord = async (record) => {
    const request = beginLatestRequest('production-order-selection')
    setSelected(record)
    setAggregate(null)
    try {
      const nextAggregate = await getProductionOrder(record.id, {
        signal: request.signal,
      })
      if (request.isCurrent() && nextAggregate.order.id === record.id) {
        setAggregate(nextAggregate)
        setSelected(nextAggregate.order)
      }
    } catch (error) {
      if (!isRpcAbortError(error) && request.isCurrent()) {
        message.error(getActionErrorMessage(error, '加载生产订单详情'))
      }
    } finally {
      request.finish()
    }
  }

  const beginCreate = () => {
    setAggregate(null)
    setOptionsByType({})
    setFormValues({
      order_no: '',
      planned_start_at: '',
      planned_end_at: '',
      note: '',
      items: [{ line_no: 1, planned_quantity: '1' }],
    })
    setFormMode('create')
  }

  const refreshAfterSuccess = async () => {
    try {
      await loadOrders()
    } catch {
      message.warning('操作已成功，但列表刷新失败，请手动刷新当前页')
    }
  }

  const runMutation = async (scope, payload, execute, successText) => {
    if (inFlightRef.current) return false
    const attempt = attemptsRef.current.prepare(scope, payload)
    inFlightRef.current = true
    setMutationLoading(true)
    try {
      const result = await execute(attempt.params)
      attemptsRef.current.finish(scope, attempt)
      message.success(successText)
      setAggregate(result)
      setSelected(result.order)
      return true
    } catch (error) {
      if (!isProductionOrderResultUnknown(error)) {
        attemptsRef.current.finish(scope, attempt)
        message.error(
          getActionErrorMessage(error, successText.replace('成功', ''))
        )
      } else {
        message.warning(
          '操作结果暂时无法确认，已保留本次请求，请使用相同内容重试'
        )
      }
      return false
    } finally {
      inFlightRef.current = false
      setMutationLoading(false)
    }
  }

  const submitDraft = async (values) => {
    const draft = draftParams(values)
    const isCreate = formMode === 'create'
    const payload = isCreate
      ? draft
      : {
          ...draft,
          production_order_id: aggregate.order.id,
          expected_version: aggregate.order.version,
        }
    const ok = await runMutation(
      isCreate ? 'create' : `save:${aggregate.order.id}`,
      payload,
      isCreate ? createProductionOrder : saveProductionOrder,
      isCreate ? '生产订单草稿创建成功' : '生产订单草稿保存成功'
    )
    if (!ok) return
    setFormMode(null)
    setFormValues(null)
    await refreshAfterSuccess()
  }

  const runLifecycle = async (action, reason = null) => {
    if (!aggregate?.order) return
    const payload = {
      production_order_id: aggregate.order.id,
      expected_version: aggregate.order.version,
      ...(action === 'close' || action === 'cancel' ? { reason } : {}),
    }
    const operations = {
      release: [releaseProductionOrder, '生产订单发布成功'],
      close: [closeProductionOrder, '生产订单关闭成功'],
      cancel: [cancelProductionOrder, '生产订单取消成功'],
    }
    const [execute, successText] = operations[action]
    const ok = await runMutation(
      `${action}:${aggregate.order.id}`,
      payload,
      execute,
      successText
    )
    if (!ok) return
    setReasonAction(null)
    setFormMode(null)
    setFormValues(null)
    await refreshAfterSuccess()
  }

  const columns = useMemo(
    () => [
      { title: '生产单号', dataIndex: 'order_no', width: 180 },
      {
        title: '状态',
        dataIndex: 'status',
        width: 110,
        render: (value) => (
          <Tag color={PRODUCTION_ORDER_STATUS_META[value]?.color}>
            {PRODUCTION_ORDER_STATUS_META[value]?.label || '待核对'}
          </Tag>
        ),
      },
      {
        title: '计划开始',
        dataIndex: 'planned_start_at',
        width: 150,
        render: displayTime,
      },
      {
        title: '计划结束',
        dataIndex: 'planned_end_at',
        width: 150,
        render: displayTime,
      },
      {
        title: '备注',
        dataIndex: 'note',
        width: 260,
        render: (value) => value || '-',
      },
    ],
    []
  )

  if (!canRead) {
    return (
      <BusinessPageLayout>
        <PageHeaderCard
          title="生产订单"
          description="当前账号没有查看生产订单的权限。"
        />
      </BusinessPageLayout>
    )
  }

  return (
    <BusinessPageLayout>
      <PageHeaderCard
        title="生产订单"
        description="维护生产计划源单；完工、领料和库存变动请到生产进度办理。"
        stats={[{ key: 'total', label: '符合条件', value: total }]}
      />
      <BusinessOperationPanel
        filters={
          <>
            <SearchInput
              value={query.keyword}
              placeholder="搜索生产单号或备注"
              onChange={(event) =>
                writeQuery({ keyword: event.target.value, page: 1 })
              }
            />
            <Select
              value={query.status || undefined}
              allowClear
              placeholder="全部状态"
              style={{ width: 150 }}
              options={Object.entries(PRODUCTION_ORDER_STATUS_META).map(
                ([value, meta]) => ({ value, label: meta.label })
              )}
              onChange={(value) => writeQuery({ status: value || '', page: 1 })}
            />
            <DateRangeFilter
              options={[
                { value: 'planned_start_at', label: '计划开始' },
                { value: 'planned_end_at', label: '计划结束' },
              ]}
              value={query.date_field}
              startValue={query.date_from}
              endValue={query.date_to}
              onTypeChange={(value) =>
                writeQuery({ date_field: value, page: 1 })
              }
              onStartChange={(value) =>
                writeQuery({ date_from: value, page: 1 })
              }
              onEndChange={(value) => writeQuery({ date_to: value, page: 1 })}
            />
          </>
        }
        actions={
          <Button icon={<ReloadOutlined />} onClick={loadOrders}>
            刷新当前页
          </Button>
        }
        primaryAction={
          canCreate ? (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={beginCreate}
            >
              新建生产订单
            </Button>
          ) : null
        }
        onClearFilters={() => {
          setQuery(DEFAULT_QUERY)
          setSearchParams(new URLSearchParams(), { replace: true })
        }}
      >
        <SelectionActionBar
          embedded
          selectedCount={selected ? 1 : 0}
          selectedLabel={selected ? `已选择 ${selected.order_no}` : ''}
        >
          <Button
            disabled={!selected || detailLoading}
            icon={<EyeOutlined />}
            onClick={() => loadDetail(selected, 'view')}
          >
            查看
          </Button>
          <Button
            disabled={
              !selected ||
              !canUpdate ||
              selected.status !== PRODUCTION_ORDER_STATUS.DRAFT ||
              detailLoading
            }
            icon={<EditOutlined />}
            onClick={() => loadDetail(selected, 'edit')}
          >
            编辑
          </Button>
          <Button
            disabled={
              !aggregate ||
              !canUpdate ||
              aggregate.order.status !== PRODUCTION_ORDER_STATUS.DRAFT ||
              mutationLoading
            }
            onClick={() =>
              modal.confirm({
                title: '确认发布生产订单？',
                content: '发布后计划明细将不能直接修改。',
                okText: '确认发布',
                onOk: () => runLifecycle('release'),
              })
            }
          >
            发布
          </Button>
          <Button
            disabled={
              !aggregate ||
              !canUpdate ||
              aggregate.order.status !== PRODUCTION_ORDER_STATUS.RELEASED ||
              mutationLoading
            }
            onClick={() => setReasonAction('close')}
          >
            关闭
          </Button>
          <Button
            danger
            disabled={
              !aggregate ||
              !canUpdate ||
              ![
                PRODUCTION_ORDER_STATUS.DRAFT,
                PRODUCTION_ORDER_STATUS.RELEASED,
              ].includes(aggregate.order.status) ||
              mutationLoading
            }
            onClick={() => setReasonAction('cancel')}
          >
            取消订单
          </Button>
        </SelectionActionBar>
      </BusinessOperationPanel>
      <BusinessDataTable
        loading={loading}
        rowKey="id"
        columns={columns}
        dataSource={orders}
        rowSelection={{
          type: 'radio',
          selectedRowKeys: selected ? [selected.id] : [],
          onChange: (_, rows) => {
            if (rows[0]) selectRecord(rows[0])
            else {
              setSelected(null)
              setAggregate(null)
            }
          },
        }}
        onRow={(record) => ({
          onClick: () => selectRecord(record),
          onDoubleClick: () =>
            loadDetail(
              record,
              canUpdate && record.status === PRODUCTION_ORDER_STATUS.DRAFT
                ? 'edit'
                : 'view'
            ),
        })}
        pagination={{
          current: query.page,
          pageSize: query.page_size,
          total,
          showSizeChanger: true,
          onChange: (page, pageSize) =>
            writeQuery({ page, page_size: pageSize }),
        }}
        emptyDescription={
          canCreate ? '暂无生产订单，可新建生产计划单' : '暂无可查看的生产订单'
        }
      />

      <ProductionOrderFormModal
        form={form}
        open={Boolean(formMode)}
        mode={formMode}
        loading={mutationLoading}
        optionsByType={optionsByType}
        onCancel={() => {
          setFormMode(null)
          setFormValues(null)
        }}
        onSubmit={submitDraft}
      />

      <Modal
        open={Boolean(reasonAction)}
        title={reasonAction === 'close' ? '关闭生产订单' : '取消生产订单'}
        okText={reasonAction === 'close' ? '确认关闭' : '确认取消'}
        cancelText="返回"
        confirmLoading={mutationLoading}
        onCancel={() => setReasonAction(null)}
        onOk={() => reasonForm.submit()}
      >
        <Form
          form={reasonForm}
          layout="vertical"
          onFinish={({ reason }) =>
            runLifecycle(reasonAction, String(reason || '').trim() || null)
          }
        >
          <Text type="secondary">
            {reasonAction === 'close'
              ? '若生产数量尚未全部完成，请填写短关闭原因；系统会按实际完成情况复核。'
              : '取消后不能恢复；已有生效生产记录的订单不能直接取消。'}
          </Text>
          <Form.Item
            name="reason"
            label={
              reasonAction === 'close'
                ? '短关闭原因（未完成时必填）'
                : '取消原因'
            }
            rules={
              reasonAction === 'cancel'
                ? [
                    {
                      required: true,
                      whitespace: true,
                      message: '请填写取消原因',
                    },
                  ]
                : []
            }
          >
            <Input.TextArea autoFocus rows={4} maxLength={255} showCount />
          </Form.Item>
        </Form>
      </Modal>
    </BusinessPageLayout>
  )
}
