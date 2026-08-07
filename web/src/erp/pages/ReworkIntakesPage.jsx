import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, Form, Input, Popconfirm, Select, Tag } from 'antd'
import { useOutletContext, useSearchParams } from 'react-router-dom'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { isRpcAbortError } from '@/common/utils/jsonRpc'

import {
  cancelReworkIntake,
  createProductionReworkFromIntake,
  createReworkIntake,
  createReworkReshipment,
  getReworkIntake,
  listAllReworkIntakeSourceCandidates,
  listAllReworkIntakes,
  listReworkIntakes,
  receiveReworkIntake,
  reverseReworkIntake,
} from '../api/operationalFactApi.mjs'
import {
  BusinessActionTooltip,
  BusinessDataTable,
  BusinessOperationPanel,
  BusinessPageLayout,
  PageHeaderCard,
  SearchInput,
  SelectFilter,
  SelectionActionBar,
  SelectionClearAction,
  ToolbarButton,
} from '../components/business-list/BusinessListLayout.jsx'
import BusinessFormModal from '../components/business-list/BusinessFormModal.jsx'
import BusinessRecordDetailsModal from '../components/business-list/BusinessRecordDetailsModal.jsx'
import {
  BusinessListToolbarActions,
  useBusinessColumnOrder,
} from '../components/business-list/BusinessListToolbarActions.jsx'
import useBusinessListExport from '../hooks/useBusinessListExport.js'
import useLatestRequestCoordinator from '../hooks/useLatestRequestCoordinator.js'
import {
  createBusinessTablePagination,
  getBusinessPaginationParams,
} from '../utils/businessPagination.mjs'
import {
  compactParams,
  formatUnixDateTime,
  hasActionPermission,
  trimOptional,
} from '../utils/masterDataOrderView.mjs'
import {
  isPositiveNumeric20Scale6Units,
  numeric20Scale6TextFromUnits,
  numeric20Scale6Units,
  subtractNumeric20Scale6Units,
} from '../utils/numeric20Scale6.mjs'
import { resolveReworkIntakeActionAvailability } from '../utils/operationalActionAvailability.mjs'

const STATUS_OPTIONS = Object.freeze([
  { value: '', label: '全部状态' },
  { value: 'DRAFT', label: '待接收' },
  { value: 'RECEIVED', label: '已接收' },
  { value: 'CANCELLED', label: '已取消' },
  { value: 'REVERSED', label: '已冲正' },
])

const STATUS_META = Object.freeze({
  DRAFT: Object.freeze({ label: '待接收', color: 'blue' }),
  RECEIVED: Object.freeze({ label: '已接收', color: 'green' }),
  CANCELLED: Object.freeze({ label: '已取消', color: 'default' }),
  REVERSED: Object.freeze({ label: '已冲正', color: 'magenta' }),
})

const STAGE_META = Object.freeze({
  WAITING_RECEIVE: Object.freeze({ label: '等待回厂收货', color: 'blue' }),
  WAITING_REWORK: Object.freeze({ label: '等待生产返工', color: 'gold' }),
  REWORKING: Object.freeze({ label: '生产返工中', color: 'orange' }),
  WAITING_RESHIP: Object.freeze({ label: '等待建立补发', color: 'cyan' }),
  RESHIPPED: Object.freeze({ label: '补发单待实际出货', color: 'purple' }),
  CLOSED: Object.freeze({ label: '返工补发已闭环', color: 'green' }),
})

function statusTag(status) {
  const meta = STATUS_META[status] || { label: '状态待核对', color: 'default' }
  return <Tag color={meta.color}>{meta.label}</Tag>
}

function stageTag(stage) {
  const meta = STAGE_META[stage] || { label: '进度待核对', color: 'default' }
  return <Tag color={meta.color}>{meta.label}</Tag>
}

function buildDraftNo(prefix) {
  const now = new Date()
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('')
  return `${prefix}-${stamp}`
}

function buildIdempotencyKey(prefix) {
  return `${prefix}/${Date.now()}/${Math.random().toString(36).slice(2, 10)}`
}

function quantityDifference(total, used) {
  const totalUnits = numeric20Scale6Units(total) || '0'
  const usedUnits = numeric20Scale6Units(used) || '0'
  const remaining = subtractNumeric20Scale6Units(totalUnits, usedUnits) || '0'
  return numeric20Scale6TextFromUnits(remaining)
}

function positiveQuantityRule(label) {
  return {
    validator: async (_rule, value) => {
      if (!isPositiveNumeric20Scale6Units(value)) {
        throw new Error(`${label}必须大于 0，且最多保留 6 位小数`)
      }
    },
  }
}

function sourceCandidateLabel(item) {
  return [
    item?.source_shipment_no || '出货单',
    [item?.product_code, item?.product_name].filter(Boolean).join(' / '),
    item?.product_sku_code || item?.product_sku_name || '',
    `生产单 ${item?.target_production_order_no || '-'}`,
    `可接收 ${item?.remaining_intake_quantity || '0'} ${item?.unit_code || ''}`,
  ]
    .filter(Boolean)
    .join(' · ')
}

function intakeItemLabel(item) {
  return (
    [
      item?.line_no,
      item?.product_code,
      item?.product_name,
      item?.product_sku_code,
      item?.product_sku_name,
    ]
      .filter(Boolean)
      .join(' / ') || `返工明细 ${item?.id || ''}`
  )
}

function completionLabel(candidate) {
  return [
    candidate?.production_fact_no ||
      `完工记录 ${candidate?.production_fact_id}`,
    candidate?.lot_no ? `批次 ${candidate.lot_no}` : '',
    `可补发 ${candidate?.remaining_quantity || '0'}`,
  ]
    .filter(Boolean)
    .join(' · ')
}

function flattenCompletionCandidates(intake) {
  return (intake?.items || []).flatMap((item) =>
    (item?.completion_candidates || []).map((candidate) => ({
      ...candidate,
      intake_item_id: item.id,
      intake_item_label: intakeItemLabel(item),
      unit_code: item.unit_code,
    }))
  )
}

export default function ReworkIntakesPage() {
  const outletContext = useOutletContext()
  const [searchParams] = useSearchParams()
  const adminProfile = outletContext?.adminProfile || {}
  const customerKey = adminProfile?.effective_session?.customer?.key || ''
  const linkedIntakeID = Number(searchParams.get('rework_intake_id') || 0)
  const beginLatestRequest = useLatestRequestCoordinator()

  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState('')
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20 })
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [selected, setSelected] = useState(null)
  const [detail, setDetail] = useState(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [sourceCandidates, setSourceCandidates] = useState([])
  const [sourceLoading, setSourceLoading] = useState(false)
  const [transitionAction, setTransitionAction] = useState('')
  const [transitionReason, setTransitionReason] = useState('')
  const [reworkOpen, setReworkOpen] = useState(false)
  const [reshipOpen, setReshipOpen] = useState(false)
  const [createForm] = Form.useForm()
  const [reworkForm] = Form.useForm()
  const [reshipForm] = Form.useForm()

  const canCreate = hasActionPermission(adminProfile, 'rework_intake.create')
  const canReceive = hasActionPermission(adminProfile, 'rework_intake.receive')
  const canCancel = hasActionPermission(adminProfile, 'rework_intake.cancel')
  const canReverse = hasActionPermission(adminProfile, 'rework_intake.reverse')
  const canCreateRework = hasActionPermission(
    adminProfile,
    'production.rework.create'
  )
  const canCreateReshipment = hasActionPermission(
    adminProfile,
    'shipment.create'
  )

  const loadRows = useCallback(async () => {
    const request = beginLatestRequest('rework-intake-list')
    setLoading(true)
    try {
      const data = await listReworkIntakes(
        compactParams({
          keyword: trimOptional(keyword),
          status,
          ...getBusinessPaginationParams(pagination),
        }),
        { signal: request.signal }
      )
      if (!request.isCurrent()) return
      const nextRows = Array.isArray(data?.rework_intakes)
        ? data.rework_intakes
        : []
      setRows(nextRows)
      setTotal(Number(data?.total || 0))
      setSelected((current) =>
        current?.id
          ? nextRows.find((item) => Number(item.id) === Number(current.id)) ||
            current
          : null
      )
    } catch (error) {
      if (!request.isCurrent() || isRpcAbortError(error)) return
      message.error(getActionErrorMessage(error, '加载返工回厂记录'))
    } finally {
      if (request.isCurrent()) setLoading(false)
      request.finish()
    }
  }, [beginLatestRequest, keyword, pagination, status])

  useEffect(() => {
    loadRows()
  }, [loadRows])

  useEffect(() => {
    if (!linkedIntakeID) return undefined
    const request = beginLatestRequest('linked-rework-intake')
    getReworkIntake({ id: linkedIntakeID }, { signal: request.signal })
      .then((item) => {
        if (!request.isCurrent() || !item?.id) return
        setSelected(item)
        setDetail(item)
      })
      .catch((error) => {
        if (!request.isCurrent() || isRpcAbortError(error)) return
        message.error(getActionErrorMessage(error, '打开关联返工回厂记录'))
      })
      .finally(request.finish)
    return request.abort
  }, [beginLatestRequest, linkedIntakeID])

  const openCreate = useCallback(async () => {
    setCreateOpen(true)
    setSourceLoading(true)
    createForm.setFieldsValue({
      intake_no: buildDraftNo('HCF'),
      reason: '',
      candidate_ids: [],
      items: [],
    })
    try {
      const data = await listAllReworkIntakeSourceCandidates()
      setSourceCandidates(data?.rework_intake_source_candidates || [])
    } catch (error) {
      message.error(getActionErrorMessage(error, '加载可返工出货明细'))
      setSourceCandidates([])
    } finally {
      setSourceLoading(false)
    }
  }, [createForm])

  const watchedCandidateIDs = Form.useWatch('candidate_ids', createForm)
  const selectedCandidateIDs = useMemo(
    () => (Array.isArray(watchedCandidateIDs) ? watchedCandidateIDs : []),
    [watchedCandidateIDs]
  )
  const anchorShipmentID = useMemo(() => {
    const first = sourceCandidates.find(
      (item) => String(item.id) === String(selectedCandidateIDs[0] || '')
    )
    return Number(first?.source_shipment_id || 0)
  }, [selectedCandidateIDs, sourceCandidates])
  const selectedSourceLineCandidates = useMemo(() => {
    const selectedBySourceLine = new Map()
    for (const candidateID of selectedCandidateIDs) {
      const candidate = sourceCandidates.find((item) => item.id === candidateID)
      if (candidate?.source_shipment_item_id) {
        selectedBySourceLine.set(
          Number(candidate.source_shipment_item_id),
          candidate.id
        )
      }
    }
    return selectedBySourceLine
  }, [selectedCandidateIDs, sourceCandidates])
  const sourceOptions = useMemo(
    () =>
      sourceCandidates.map((item) => {
        const selectedCandidateID = selectedSourceLineCandidates.get(
          Number(item.source_shipment_item_id)
        )
        const conflictsWithSelectedTarget =
          selectedCandidateID && selectedCandidateID !== item.id
        const conflictsWithSelectedShipment =
          anchorShipmentID > 0 &&
          Number(item.source_shipment_id) !== anchorShipmentID
        return {
          value: item.id,
          label: sourceCandidateLabel(item),
          disabled:
            item?.selectable !== true ||
            conflictsWithSelectedTarget ||
            conflictsWithSelectedShipment,
          title:
            item?.disabled_reason ||
            (conflictsWithSelectedTarget
              ? '同一条原出货明细只能选择一张生产单承接返工'
              : conflictsWithSelectedShipment
                ? '一张返工回厂单只能关联同一张原出货单'
                : ''),
        }
      }),
    [anchorShipmentID, selectedSourceLineCandidates, sourceCandidates]
  )

  const handleCandidateChange = useCallback(
    (ids) => {
      const currentItems = createForm.getFieldValue('items') || []
      const currentByID = new Map(
        currentItems.map((item) => [
          Number(item?.source_shipment_item_id),
          item,
        ])
      )
      const selectedCandidates = ids
        .map((id) => sourceCandidates.find((item) => item.id === id))
        .filter(Boolean)
      const sourceShipmentID = Number(
        selectedCandidates[0]?.source_shipment_id || 0
      )
      const sameShipment = selectedCandidates.filter(
        (item) => Number(item.source_shipment_id) === sourceShipmentID
      )
      createForm.setFieldsValue({
        candidate_ids: sameShipment.map((item) => item.id),
        items: sameShipment.map((item) => ({
          source_shipment_item_id: Number(item.source_shipment_item_id),
          target_production_order_item_id: Number(
            item.target_production_order_item_id
          ),
          quantity:
            currentByID.get(Number(item.source_shipment_item_id))?.quantity ||
            item.remaining_intake_quantity,
          note:
            currentByID.get(Number(item.source_shipment_item_id))?.note || '',
          label: sourceCandidateLabel(item),
          unit_code: item.unit_code || '',
        })),
      })
    },
    [createForm, sourceCandidates]
  )

  const submitCreate = useCallback(async () => {
    try {
      const values = await createForm.validateFields()
      const candidates = (values.candidate_ids || [])
        .map((id) => sourceCandidates.find((item) => item.id === id))
        .filter(Boolean)
      if (candidates.length === 0) {
        message.warning('请至少选择一条已出货明细')
        return
      }
      const sourceShipmentID = Number(candidates[0].source_shipment_id)
      if (
        candidates.some(
          (item) => Number(item.source_shipment_id) !== sourceShipmentID
        )
      ) {
        message.warning('一张返工回厂单只能关联同一张原出货单')
        return
      }
      setSaving(true)
      const created = await createReworkIntake({
        ...(customerKey ? { customer_key: customerKey } : {}),
        intake_no: values.intake_no.trim(),
        source_shipment_id: sourceShipmentID,
        reason: values.reason.trim(),
        idempotency_key: buildIdempotencyKey('rework-intake'),
        items: values.items.map((item) => ({
          source_shipment_item_id: Number(item.source_shipment_item_id),
          target_production_order_item_id: Number(
            item.target_production_order_item_id
          ),
          quantity: String(item.quantity).trim(),
          ...(trimOptional(item.note) ? { note: trimOptional(item.note) } : {}),
        })),
      })
      setCreateOpen(false)
      setSelected(created)
      message.success('返工回厂记录已建立，等待仓库确认实物接收')
      await loadRows()
    } catch (error) {
      if (error?.errorFields) return
      message.error(getActionErrorMessage(error, '建立返工回厂记录'))
    } finally {
      setSaving(false)
    }
  }, [createForm, customerKey, loadRows, sourceCandidates])

  const runReceive = useCallback(async () => {
    if (!selected?.id) return
    setSaving(true)
    try {
      const updated = await receiveReworkIntake({
        ...(customerKey ? { customer_key: customerKey } : {}),
        id: selected.id,
        expected_version: selected.version,
      })
      setSelected(updated)
      message.success('已确认回厂收货；实物进入待返工库存，暂不可直接出货')
      await loadRows()
    } catch (error) {
      message.error(getActionErrorMessage(error, '确认回厂收货'))
    } finally {
      setSaving(false)
    }
  }, [customerKey, loadRows, selected])

  const submitTransition = useCallback(async () => {
    if (!selected?.id || !transitionAction) return
    const reason = transitionReason.trim()
    if (!reason) {
      message.warning('请填写原因')
      return
    }
    setSaving(true)
    try {
      const request = {
        ...(customerKey ? { customer_key: customerKey } : {}),
        id: selected.id,
        expected_version: selected.version,
        reason,
      }
      const updated =
        transitionAction === 'cancel'
          ? await cancelReworkIntake(request)
          : await reverseReworkIntake(request)
      setSelected(updated)
      setTransitionAction('')
      setTransitionReason('')
      message.success(
        transitionAction === 'cancel'
          ? '返工回厂记录已取消'
          : '回厂收货已冲正，相关待返工库存已反向恢复'
      )
      await loadRows()
    } catch (error) {
      message.error(
        getActionErrorMessage(
          error,
          transitionAction === 'cancel' ? '取消返工回厂记录' : '冲正回厂收货'
        )
      )
    } finally {
      setSaving(false)
    }
  }, [customerKey, loadRows, selected, transitionAction, transitionReason])

  const eligibleReworkItems = useMemo(
    () =>
      (selected?.items || []).filter((item) =>
        isPositiveNumeric20Scale6Units(
          quantityDifference(item.quantity, item.active_rework_quantity)
        )
      ),
    [selected]
  )

  const openRework = useCallback(() => {
    const item = eligibleReworkItems[0]
    if (!item) return
    reworkForm.setFieldsValue({
      fact_no: buildDraftNo('FG'),
      rework_intake_item_id: item.id,
      quantity: quantityDifference(item.quantity, item.active_rework_quantity),
      reason: selected?.reason || '客户产品回厂返工',
    })
    setReworkOpen(true)
  }, [eligibleReworkItems, reworkForm, selected?.reason])

  const submitRework = useCallback(async () => {
    try {
      const values = await reworkForm.validateFields()
      setSaving(true)
      await createProductionReworkFromIntake({
        ...(customerKey ? { customer_key: customerKey } : {}),
        fact_no: values.fact_no.trim(),
        rework_intake_item_id: Number(values.rework_intake_item_id),
        quantity: String(values.quantity).trim(),
        reason: values.reason.trim(),
        idempotency_key: buildIdempotencyKey('production-rework-intake'),
      })
      setReworkOpen(false)
      message.success(
        '生产返工记录已建立；请在生产进度中确认并按原工序路线执行'
      )
      await loadRows()
    } catch (error) {
      if (error?.errorFields) return
      message.error(getActionErrorMessage(error, '建立生产返工记录'))
    } finally {
      setSaving(false)
    }
  }, [customerKey, loadRows, reworkForm])

  const completionCandidates = useMemo(
    () => flattenCompletionCandidates(selected),
    [selected]
  )
  const handleCompletionChange = useCallback(
    (ids) => {
      const currentItems = reshipForm.getFieldValue('items') || []
      const currentByID = new Map(
        currentItems.map((item) => [
          Number(item?.rework_completion_fact_id),
          item,
        ])
      )
      const candidates = ids
        .map((id) =>
          completionCandidates.find(
            (item) => Number(item.production_fact_id) === Number(id)
          )
        )
        .filter(Boolean)
      reshipForm.setFieldsValue({
        completion_fact_ids: candidates.map((item) =>
          Number(item.production_fact_id)
        ),
        items: candidates.map((item) => ({
          rework_completion_fact_id: Number(item.production_fact_id),
          quantity:
            currentByID.get(Number(item.production_fact_id))?.quantity ||
            item.remaining_quantity,
          note: currentByID.get(Number(item.production_fact_id))?.note || '',
          label: `${item.intake_item_label} · ${completionLabel(item)}`,
          unit_code: item.unit_code || '',
        })),
      })
    },
    [completionCandidates, reshipForm]
  )

  const openReship = useCallback(() => {
    const selectable = completionCandidates.filter(
      (item) =>
        item.selectable === true &&
        isPositiveNumeric20Scale6Units(
          numeric20Scale6Units(item.remaining_quantity) || '0'
        )
    )
    reshipForm.setFieldsValue({
      shipment_no: buildDraftNo('BF'),
      completion_fact_ids: selectable.map((item) =>
        Number(item.production_fact_id)
      ),
      note: '返工完成后补发，不产生新的销售应收或开票',
      items: selectable.map((item) => ({
        rework_completion_fact_id: Number(item.production_fact_id),
        quantity: item.remaining_quantity,
        note: '',
        label: `${item.intake_item_label} · ${completionLabel(item)}`,
        unit_code: item.unit_code || '',
      })),
    })
    setReshipOpen(true)
  }, [completionCandidates, reshipForm])

  const submitReship = useCallback(async () => {
    try {
      const values = await reshipForm.validateFields()
      if (!values.items?.length) {
        message.warning('请至少选择一条已完成返工的明细')
        return
      }
      setSaving(true)
      await createReworkReshipment({
        ...(customerKey ? { customer_key: customerKey } : {}),
        shipment_no: values.shipment_no.trim(),
        rework_intake_id: selected.id,
        idempotency_key: buildIdempotencyKey('rework-reshipment'),
        ...(trimOptional(values.note)
          ? { note: trimOptional(values.note) }
          : {}),
        items: values.items.map((item) => ({
          rework_completion_fact_id: Number(item.rework_completion_fact_id),
          quantity: String(item.quantity).trim(),
          ...(trimOptional(item.note) ? { note: trimOptional(item.note) } : {}),
        })),
      })
      setReshipOpen(false)
      message.success('返工补发单已建立；无需财务放行，请由仓库确认实际出货')
      await loadRows()
    } catch (error) {
      if (error?.errorFields) return
      message.error(getActionErrorMessage(error, '建立返工补发单'))
    } finally {
      setSaving(false)
    }
  }, [customerKey, loadRows, reshipForm, selected?.id])

  const columns = useMemo(
    () => [
      {
        title: '返工回厂单号',
        dataIndex: 'intake_no',
        key: 'intake_no',
        width: 180,
      },
      {
        title: '原出货单',
        dataIndex: 'source_shipment_no',
        key: 'source_shipment_no',
        width: 170,
      },
      {
        title: '客户',
        dataIndex: 'customer_snapshot',
        key: 'customer_snapshot',
        width: 180,
      },
      {
        title: '单据状态',
        dataIndex: 'status',
        key: 'status',
        width: 120,
        render: statusTag,
      },
      {
        title: '返工补发进度',
        dataIndex: 'progress_stage',
        key: 'progress_stage',
        width: 180,
        render: stageTag,
      },
      {
        title: '明细数',
        dataIndex: 'items',
        key: 'item_count',
        width: 90,
        render: (items) => (Array.isArray(items) ? items.length : 0),
      },
      {
        title: '回厂原因',
        dataIndex: 'reason',
        key: 'reason',
        width: 260,
      },
      {
        title: '建立时间',
        dataIndex: 'created_at',
        key: 'created_at',
        width: 170,
        render: formatUnixDateTime,
      },
    ],
    []
  )
  const { tableColumns, exportColumns, openColumnOrder, columnOrderModal } =
    useBusinessColumnOrder({
      adminProfile,
      moduleKey: 'rework-intakes',
      moduleTitle: '返工回厂与补发',
      columns,
    })
  const loadExportRows = useCallback(
    async ({ signal }) => {
      const data = await listAllReworkIntakes(
        compactParams({ keyword: trimOptional(keyword), status }),
        { signal }
      )
      return data?.rework_intakes
    },
    [keyword, status]
  )
  const { exporting, exportRows } = useBusinessListExport({
    requestKey: 'rework-intakes-export',
    loadRows: loadExportRows,
    filename: `返工回厂与补发-${new Date().toISOString().slice(0, 10)}.csv`,
    columns: exportColumns,
    recordLabel: '返工回厂记录',
  })

  const actionAvailability = useMemo(
    () => ({
      receive: resolveReworkIntakeActionAvailability({
        action: 'receive',
        authorized: canReceive,
        reworkIntake: selected,
        busy: saving,
      }),
      cancel: resolveReworkIntakeActionAvailability({
        action: 'cancel',
        authorized: canCancel,
        reworkIntake: selected,
        busy: saving,
      }),
      reverse: resolveReworkIntakeActionAvailability({
        action: 'reverse',
        authorized: canReverse,
        reworkIntake: selected,
        busy: saving,
      }),
      rework: resolveReworkIntakeActionAvailability({
        action: 'rework',
        authorized: canCreateRework,
        reworkIntake: selected,
        busy: saving,
      }),
      reship: resolveReworkIntakeActionAvailability({
        action: 'reship',
        authorized: canCreateReshipment,
        reworkIntake: selected,
        busy: saving,
      }),
    }),
    [
      canCancel,
      canCreateReshipment,
      canCreateRework,
      canReceive,
      canReverse,
      saving,
      selected,
    ]
  )

  const detailLineItems = useMemo(
    () => ({
      title: '返工回厂明细',
      items: detail?.items || [],
      emptyDescription: '当前记录没有明细',
      getItemKey: (item) => item?.id,
      getItemLabel: intakeItemLabel,
      getItemSummary: (item) =>
        `${item?.quantity || '0'} ${item?.unit_code || ''}`,
      getItemFields: (item) => [
        {
          key: 'production-order',
          label: '返工承接生产单',
          value: item?.target_production_order_no || '-',
        },
        {
          key: 'warehouse',
          label: '回厂仓库',
          value:
            [item?.receiving_warehouse_code, item?.receiving_warehouse_name]
              .filter(Boolean)
              .join(' / ') || '-',
        },
        {
          key: 'lot',
          label: '待返工批次',
          value: item?.received_lot_no || '确认收货后生成',
        },
        {
          key: 'rework',
          label: '已建立返工数量',
          value: item?.active_rework_quantity || '0',
        },
        {
          key: 'completed',
          label: '已完成返工数量',
          value: item?.completed_quantity || '0',
        },
        {
          key: 'reshipped',
          label: '已建立补发数量',
          value: item?.active_reshipment_quantity || '0',
        },
        {
          key: 'shipped',
          label: '已实际补发数量',
          value: item?.reshipped_quantity || '0',
        },
        {
          key: 'stage',
          label: '明细进度',
          value: STAGE_META[item?.progress_stage]?.label || '进度待核对',
        },
        {
          key: 'note',
          label: '备注',
          value: item?.note || '-',
          wide: true,
        },
      ],
    }),
    [detail]
  )

  return (
    <BusinessPageLayout className="erp-rework-intakes-page">
      <PageHeaderCard
        compact
        title="返工回厂与补发"
        description="只处理客户产品退回来返工后再发货：原出货明细可追溯，仓库接收后进入待返工库存，生产沿原工序路线返工并完成质检，最后建立不产生新应收和开票的补发单。"
        tags={[
          <Tag color="blue" key="source">
            原出货
          </Tag>,
          <Tag color="gold" key="receive">
            回厂收货
          </Tag>,
          <Tag color="orange" key="rework">
            生产返工
          </Tag>,
          <Tag color="cyan" key="quality">
            工序质检与完工
          </Tag>,
          <Tag color="green" key="reship">
            补发出货
          </Tag>,
        ]}
        stats={[
          { key: 'total', label: '筛选结果', value: total },
          { key: 'page', label: '本页显示', value: rows.length },
        ]}
      />

      <BusinessOperationPanel
        compact
        filters={
          <>
            <SearchInput
              value={keyword}
              placeholder="搜索单号、原出货单或客户"
              onChange={(event) => setKeyword(event.target.value)}
              onPressEnter={() =>
                setPagination((current) => ({ ...current, current: 1 }))
              }
            />
            <SelectFilter
              value={status}
              options={STATUS_OPTIONS}
              onChange={(value) => {
                setStatus(value || '')
                setPagination((current) => ({ ...current, current: 1 }))
              }}
            />
          </>
        }
        actions={
          <BusinessListToolbarActions
            onExport={exportRows}
            exportDisabled={loading || exporting || total === 0}
            exportDisabledReason={
              exporting
                ? '正在准备导出，请稍候'
                : loading
                  ? '记录加载完成后可导出'
                  : total === 0
                    ? '当前筛选没有可导出的记录'
                    : ''
            }
            onOpenColumnOrder={openColumnOrder}
          />
        }
        primaryAction={
          canCreate ? (
            <ToolbarButton type="primary" onClick={openCreate}>
              新建返工回厂
            </ToolbarButton>
          ) : null
        }
      >
        <SelectionActionBar
          embedded
          selectedCount={selected ? 1 : 0}
          selectedLabel={selected?.intake_no || '请选择返工回厂记录'}
          summaryItems={
            selected
              ? [
                  {
                    key: 'stage',
                    label: '当前进度',
                    value:
                      STAGE_META[selected.progress_stage]?.label || '待核对',
                  },
                ]
              : []
          }
        >
          <SelectionClearAction
            selectedCount={selected ? 1 : 0}
            selectionLabel="返工回厂记录"
            onClear={() => setSelected(null)}
          />
          <BusinessActionTooltip
            disabled={!selected}
            disabledReason="请先选择一条返工回厂记录"
          >
            <Button
              data-business-action-key="rework-intake-details"
              disabled={!selected}
              onClick={() => setDetail(selected)}
            >
              查看详情
            </Button>
          </BusinessActionTooltip>
          {actionAvailability.receive.visible ? (
            <BusinessActionTooltip
              disabled={actionAvailability.receive.disabled}
              disabledReason={actionAvailability.receive.disabledReason}
            >
              <Popconfirm
                title="确认实物已经回到仓库？"
                description="确认后会形成待返工批次与库存入库；该批次不能直接销售出货。"
                onConfirm={runReceive}
              >
                <Button
                  type="primary"
                  data-business-action-key="rework-intake-receive"
                  disabled={actionAvailability.receive.disabled}
                >
                  确认回厂收货
                </Button>
              </Popconfirm>
            </BusinessActionTooltip>
          ) : null}
          {actionAvailability.rework.visible ? (
            <BusinessActionTooltip
              disabled={actionAvailability.rework.disabled}
              disabledReason={actionAvailability.rework.disabledReason}
            >
              <Button
                type="primary"
                data-business-action-key="rework-intake-create-rework"
                disabled={actionAvailability.rework.disabled}
                onClick={openRework}
              >
                建立生产返工
              </Button>
            </BusinessActionTooltip>
          ) : null}
          {actionAvailability.reship.visible ? (
            <BusinessActionTooltip
              disabled={actionAvailability.reship.disabled}
              disabledReason={actionAvailability.reship.disabledReason}
            >
              <Button
                type="primary"
                data-business-action-key="rework-intake-create-reshipment"
                disabled={actionAvailability.reship.disabled}
                onClick={openReship}
              >
                建立返工补发
              </Button>
            </BusinessActionTooltip>
          ) : null}
          {actionAvailability.cancel.visible ? (
            <BusinessActionTooltip
              disabled={actionAvailability.cancel.disabled}
              disabledReason={actionAvailability.cancel.disabledReason}
            >
              <Button
                danger
                data-business-action-key="rework-intake-cancel"
                disabled={actionAvailability.cancel.disabled}
                onClick={() => {
                  setTransitionReason('')
                  setTransitionAction('cancel')
                }}
              >
                取消回厂记录
              </Button>
            </BusinessActionTooltip>
          ) : null}
          {actionAvailability.reverse.visible ? (
            <BusinessActionTooltip
              disabled={actionAvailability.reverse.disabled}
              disabledReason={actionAvailability.reverse.disabledReason}
            >
              <Button
                danger
                data-business-action-key="rework-intake-reverse"
                disabled={actionAvailability.reverse.disabled}
                onClick={() => {
                  setTransitionReason('')
                  setTransitionAction('reverse')
                }}
              >
                冲正回厂收货
              </Button>
            </BusinessActionTooltip>
          ) : null}
        </SelectionActionBar>
      </BusinessOperationPanel>

      <BusinessDataTable
        rowKey="id"
        loading={loading}
        columns={tableColumns}
        dataSource={rows}
        pagination={createBusinessTablePagination({
          pagination,
          total,
          onChange: (current, pageSize) => setPagination({ current, pageSize }),
        })}
        scroll={{ x: 1350 }}
        rowSelection={{
          type: 'radio',
          selectedRowKeys: selected ? [selected.id] : [],
          onChange: (_keys, selectedRows) =>
            setSelected(selectedRows[0] || null),
        }}
        onRow={(record) => ({ onClick: () => setSelected(record) })}
        onOpenRecord={(record) => setDetail(record)}
        emptyDescription="暂无返工回厂记录"
      />

      <BusinessFormModal
        title="新建返工回厂"
        description="从真实已出货明细发起，并明确由哪张生产单承接返工。"
        open={createOpen}
        width={960}
        okText="建立回厂记录"
        confirmLoading={saving}
        onCancel={() => !saving && setCreateOpen(false)}
        onOk={submitCreate}
        destroyOnHidden
      >
        <Form
          form={createForm}
          layout="vertical"
          preserve={false}
          disabled={saving}
        >
          <Form.Item
            name="intake_no"
            label="返工回厂单号"
            rules={[
              {
                required: true,
                whitespace: true,
                message: '请填写返工回厂单号',
              },
            ]}
          >
            <Input maxLength={64} />
          </Form.Item>
          <Form.Item
            name="reason"
            label="回厂返工原因"
            rules={[
              {
                required: true,
                whitespace: true,
                message: '请填写回厂返工原因',
              },
            ]}
          >
            <Input.TextArea rows={2} maxLength={255} showCount />
          </Form.Item>
          <Form.Item
            name="candidate_ids"
            label="原出货明细"
            rules={[
              {
                required: true,
                type: 'array',
                min: 1,
                message: '请至少选择一条已出货明细',
              },
            ]}
          >
            <Select
              mode="multiple"
              showSearch
              optionFilterProp="label"
              loading={sourceLoading}
              options={sourceOptions}
              placeholder="选择同一张原出货单中的返工明细"
              onChange={handleCandidateChange}
            />
          </Form.Item>
          <Alert
            showIcon
            type="info"
            message="确认收货后，系统会把这些实物放入待返工批次；必须经过生产返工、工序质检和完工，才能补发。"
          />
          <Form.List name="items">
            {(fields) =>
              fields.map((field) => (
                <div className="erp-rework-intake-line-card" key={field.key}>
                  <Form.Item
                    noStyle
                    name={[field.name, 'source_shipment_item_id']}
                    hidden
                  >
                    <Input />
                  </Form.Item>
                  <Form.Item
                    noStyle
                    name={[field.name, 'target_production_order_item_id']}
                    hidden
                  >
                    <Input />
                  </Form.Item>
                  <Form.Item shouldUpdate noStyle>
                    {() => (
                      <strong>
                        {createForm.getFieldValue([
                          'items',
                          field.name,
                          'label',
                        ])}
                      </strong>
                    )}
                  </Form.Item>
                  <Form.Item
                    name={[field.name, 'quantity']}
                    label="回厂数量"
                    rules={[
                      { required: true, message: '请填写回厂数量' },
                      positiveQuantityRule('回厂数量'),
                    ]}
                  >
                    <Input
                      inputMode="decimal"
                      suffix={createForm.getFieldValue([
                        'items',
                        field.name,
                        'unit_code',
                      ])}
                    />
                  </Form.Item>
                  <Form.Item name={[field.name, 'note']} label="明细备注">
                    <Input maxLength={255} />
                  </Form.Item>
                </div>
              ))
            }
          </Form.List>
        </Form>
      </BusinessFormModal>

      <BusinessFormModal
        title="建立生产返工"
        description="这里只建立返工记录；后续仍按生产进度中的原工序路线、质检和完工入库办理。"
        open={reworkOpen}
        okText="建立返工记录"
        confirmLoading={saving}
        onCancel={() => !saving && setReworkOpen(false)}
        onOk={submitRework}
        destroyOnHidden
      >
        <Form
          form={reworkForm}
          layout="vertical"
          preserve={false}
          disabled={saving}
        >
          <Form.Item
            name="fact_no"
            label="生产返工记录号"
            rules={[
              {
                required: true,
                whitespace: true,
                message: '请填写生产返工记录号',
              },
            ]}
          >
            <Input maxLength={64} />
          </Form.Item>
          <Form.Item
            name="rework_intake_item_id"
            label="返工明细"
            rules={[{ required: true, message: '请选择返工明细' }]}
          >
            <Select
              options={eligibleReworkItems.map((item) => ({
                value: item.id,
                label: `${intakeItemLabel(item)} · 可建立 ${quantityDifference(item.quantity, item.active_rework_quantity)} ${item.unit_code || ''}`,
              }))}
              onChange={(id) => {
                const item = eligibleReworkItems.find(
                  (row) => Number(row.id) === Number(id)
                )
                reworkForm.setFieldValue(
                  'quantity',
                  item
                    ? quantityDifference(
                        item.quantity,
                        item.active_rework_quantity
                      )
                    : ''
                )
              }}
            />
          </Form.Item>
          <Form.Item
            name="quantity"
            label="返工数量"
            rules={[
              { required: true, message: '请填写返工数量' },
              positiveQuantityRule('返工数量'),
            ]}
          >
            <Input inputMode="decimal" />
          </Form.Item>
          <Form.Item
            name="reason"
            label="返工说明"
            rules={[
              { required: true, whitespace: true, message: '请填写返工说明' },
            ]}
          >
            <Input.TextArea rows={2} maxLength={255} showCount />
          </Form.Item>
        </Form>
      </BusinessFormModal>

      <BusinessFormModal
        title="建立返工补发单"
        description="只可选择已经完成生产返工、工序质检通过并入库的批次；补发不产生新的销售应收或开票。"
        open={reshipOpen}
        width={900}
        okText="建立补发单"
        confirmLoading={saving}
        onCancel={() => !saving && setReshipOpen(false)}
        onOk={submitReship}
        destroyOnHidden
      >
        <Form
          form={reshipForm}
          layout="vertical"
          preserve={false}
          disabled={saving}
        >
          <Form.Item
            name="shipment_no"
            label="补发单号"
            rules={[
              { required: true, whitespace: true, message: '请填写补发单号' },
            ]}
          >
            <Input maxLength={64} />
          </Form.Item>
          <Form.Item
            name="completion_fact_ids"
            label="已完成返工明细"
            rules={[
              {
                required: true,
                type: 'array',
                min: 1,
                message: '请至少选择一条已完成返工的明细',
              },
            ]}
          >
            <Select
              mode="multiple"
              optionFilterProp="label"
              options={completionCandidates.map((item) => ({
                value: Number(item.production_fact_id),
                label: `${item.intake_item_label} · ${completionLabel(item)}`,
                disabled:
                  item.selectable !== true ||
                  !isPositiveNumeric20Scale6Units(
                    numeric20Scale6Units(item.remaining_quantity) || '0'
                  ),
                title: item.disabled_reason || '',
              }))}
              onChange={handleCompletionChange}
            />
          </Form.Item>
          <Alert
            showIcon
            type="success"
            message="补发单会标记为“不需要财务放行”；仓库仍需在出货单页面确认实际出货，确认后才扣减库存并完成闭环。"
          />
          <Form.List name="items">
            {(fields) =>
              fields.map((field) => (
                <div className="erp-rework-intake-line-card" key={field.key}>
                  <Form.Item
                    noStyle
                    name={[field.name, 'rework_completion_fact_id']}
                    hidden
                  >
                    <Input />
                  </Form.Item>
                  <Form.Item shouldUpdate noStyle>
                    {() => (
                      <strong>
                        {reshipForm.getFieldValue([
                          'items',
                          field.name,
                          'label',
                        ])}
                      </strong>
                    )}
                  </Form.Item>
                  <Form.Item
                    name={[field.name, 'quantity']}
                    label="补发数量"
                    rules={[
                      { required: true, message: '请填写补发数量' },
                      positiveQuantityRule('补发数量'),
                    ]}
                  >
                    <Input
                      inputMode="decimal"
                      suffix={reshipForm.getFieldValue([
                        'items',
                        field.name,
                        'unit_code',
                      ])}
                    />
                  </Form.Item>
                  <Form.Item name={[field.name, 'note']} label="明细备注">
                    <Input maxLength={255} />
                  </Form.Item>
                </div>
              ))
            }
          </Form.List>
          <Form.Item name="note" label="补发说明">
            <Input.TextArea rows={2} maxLength={255} showCount />
          </Form.Item>
        </Form>
      </BusinessFormModal>

      <BusinessFormModal
        title={
          transitionAction === 'cancel' ? '取消返工回厂记录' : '冲正回厂收货'
        }
        description={
          transitionAction === 'cancel'
            ? '只允许取消尚未确认收货的记录。'
            : '只允许冲正尚未建立生产返工的回厂收货；系统会反向恢复相关库存。'
        }
        open={Boolean(transitionAction)}
        okText={transitionAction === 'cancel' ? '确认取消' : '确认冲正'}
        okButtonProps={{ danger: true }}
        confirmLoading={saving}
        onCancel={() => !saving && setTransitionAction('')}
        onOk={submitTransition}
        destroyOnHidden
      >
        <Input.TextArea
          rows={3}
          maxLength={255}
          showCount
          placeholder="请填写原因"
          value={transitionReason}
          onChange={(event) => setTransitionReason(event.target.value)}
        />
      </BusinessFormModal>

      <BusinessRecordDetailsModal
        title="返工回厂与补发详情"
        description="这里显示原出货、回厂批次、生产返工、完工与补发的同一条追溯链。"
        open={Boolean(detail)}
        record={detail}
        columns={columns}
        lineItems={detailLineItems}
        onClose={() => setDetail(null)}
      />
      {columnOrderModal}
    </BusinessPageLayout>
  )
}
