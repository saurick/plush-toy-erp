import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { QuestionCircleOutlined } from '@ant-design/icons'
import {
  Alert,
  Button,
  Form,
  Input,
  Popover,
  Select,
  Space,
  Tabs,
  Tag,
  Typography,
} from 'antd'
import { useOutletContext, useSearchParams } from 'react-router-dom'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { isRpcAbortError } from '@/common/utils/jsonRpc'

import {
  cancelFinancePayment,
  createFinanceCreditNote,
  createFinancePayment,
  getFinanceCreditNote,
  getFinancePayment,
  listAllFinanceFacts,
  listFinanceCreditNotes,
  listFinancePayments,
  reverseFinanceCreditNote,
  reverseFinancePayment,
} from '../api/operationalFactApi.mjs'
import {
  executeFinancePaymentPost,
  findExceptionProcessActiveNode,
  getFinancePaymentApprovalProcess,
  startFinancePaymentApprovalProcess,
} from '../api/customerConfigApi.mjs'
import {
  listAllCustomers,
  listAllSuppliers,
} from '../api/masterDataOrderApi.mjs'
import {
  BusinessActionTooltip,
  BusinessDataTable,
  BusinessOperationPanel,
  BusinessPageLayout,
  PageHeaderCard,
  SelectFilter,
  SelectionActionBar,
  SelectionClearAction,
  ToolbarButton,
} from '../components/business-list/BusinessListLayout.jsx'
import BusinessFormModal from '../components/business-list/BusinessFormModal.jsx'
import BusinessRecordDetailsModal from '../components/business-list/BusinessRecordDetailsModal.jsx'
import ExceptionProcessRecoveryButton from '../components/workflow/ExceptionProcessRecoveryButton.jsx'
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
  createSourceBusinessActionAttemptStore,
  isSourceBusinessActionResultUnknown,
  sourceBusinessActionNo,
  sourceBusinessActionUUID,
} from '../utils/sourceBusinessAction.mjs'
import {
  compareNumeric20Scale6Values,
  isPositiveNumeric20Scale6Units,
  numeric20Scale6Units,
} from '../utils/numeric20Scale6.mjs'
import {
  validateFinanceAllocationDraft,
  validateFinanceCreditDraft,
} from '../utils/financePaymentAllocation.mjs'

const { Text } = Typography
const PAYMENT_STORAGE_PREFIX = 'plush-erp:finance-payment:last:v1:'
const CURRENCY_OPTIONS = ['CNY', 'USD', 'HKD'].map((value) => ({
  value,
  label: value === 'CNY' ? '人民币' : value === 'USD' ? '美元' : '港币',
}))
const PAYMENT_STATUS_META = Object.freeze({
  DRAFT: ['待审批', 'blue'],
  APPROVED: ['已批准待核销', 'gold'],
  REJECTED: ['已退回', 'red'],
  CANCELLED: ['已取消', 'default'],
  POSTED: ['已核销', 'green'],
  REVERSED: ['已冲销', 'magenta'],
})
const PAYMENT_STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  ...Object.entries(PAYMENT_STATUS_META).map(([value, [label]]) => ({
    value,
    label,
  })),
]
const PAYMENT_DIRECTION_OPTIONS = [
  { value: '', label: '全部方向' },
  { value: 'RECEIPT', label: '收款' },
  { value: 'DISBURSEMENT', label: '付款' },
]
const CREDIT_STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: 'POSTED', label: '已红冲' },
  { value: 'REVERSED', label: '冲销记录' },
]
const FINANCE_VIEW_ITEMS = [
  { key: 'payments', label: '收付款记录' },
  { key: 'credits', label: '红冲记录' },
]

function FinanceReversalTermHelp() {
  const usesTouchInteraction =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(hover: none), (pointer: coarse)').matches

  return (
    <Popover
      placement="bottomLeft"
      trigger={usesTouchInteraction ? ['click'] : ['hover', 'focus', 'click']}
      title="冲销与红冲有什么区别？"
      content={
        <Space
          direction="vertical"
          size={8}
          style={{
            width: usesTouchInteraction
              ? 'min(260px, calc(100vw - 64px))'
              : 'min(340px, calc(100vw - 56px))',
          }}
        >
          <div>
            <Text strong>冲销：</Text>
            <Text>
              撤销一笔已经核销的收款或付款。相应金额会恢复为未核销，原收付款和核销记录仍会保留。
            </Text>
          </div>
          <div>
            <Text strong>红冲：</Text>
            <Text>
              对某笔应收或应付登记反向金额调整，减少该笔账款的未核销金额。原单不会删除，系统会另外保留红冲记录。
            </Text>
          </div>
          <Text type="secondary">
            这里只调整本系统中的应收、应付余额，不代表税控红字发票、总账凭证或银行对账已经完成。
          </Text>
        </Space>
      }
    >
      <Button
        type="text"
        shape="circle"
        size="small"
        icon={<QuestionCircleOutlined />}
        aria-label="查看冲销和红冲说明"
      />
    </Popover>
  )
}

function paymentStatus(value) {
  const [label, color] = PAYMENT_STATUS_META[value] || ['状态待核对', 'default']
  return <Tag color={color}>{label}</Tag>
}

function partyOption(record, fallback) {
  const code = String(
    record?.customer_code || record?.supplier_code || ''
  ).trim()
  const name = String(
    record?.name || record?.customer_name || record?.supplier_name || ''
  ).trim()
  return {
    value: Number(record?.id),
    label: [code, name].filter(Boolean).join(' / ') || fallback,
  }
}

export default function FinancePaymentsPage() {
  const [searchParams] = useSearchParams()
  const outletContext = useOutletContext()
  const adminProfile = outletContext?.adminProfile || {}
  const customerKey = adminProfile?.effective_session?.customer?.key || ''
  const adminID = Number(adminProfile?.id || 0)
  const storageKey = adminID
    ? `${PAYMENT_STORAGE_PREFIX}${adminID}:${customerKey || 'default'}`
    : ''
  const linkedFinancePaymentID = Number(
    searchParams.get('finance_payment_id') || 0
  )
  const [activeTab, setActiveTab] = useState('payments')
  const [currentPayment, setCurrentPayment] = useState(null)
  const [currentCredit, setCurrentCredit] = useState(null)
  const [payments, setPayments] = useState([])
  const [creditNotes, setCreditNotes] = useState([])
  const [financeFacts, setFinanceFacts] = useState([])
  const [customers, setCustomers] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading] = useState(false)
  const [tableLoading, setTableLoading] = useState({
    payments: false,
    credits: false,
  })
  const [referenceLoading, setReferenceLoading] = useState(false)
  const [paymentTotal, setPaymentTotal] = useState(0)
  const [creditTotal, setCreditTotal] = useState(0)
  const [paymentPagination, setPaymentPagination] = useState({
    current: 1,
    pageSize: 20,
  })
  const [creditPagination, setCreditPagination] = useState({
    current: 1,
    pageSize: 20,
  })
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('')
  const [paymentDirectionFilter, setPaymentDirectionFilter] = useState('')
  const [creditStatusFilter, setCreditStatusFilter] = useState('')
  const [paymentDetail, setPaymentDetail] = useState(null)
  const [creditDetail, setCreditDetail] = useState(null)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [allocationOpen, setAllocationOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [reverseOpen, setReverseOpen] = useState(false)
  const [creditOpen, setCreditOpen] = useState(false)
  const [paymentForm] = Form.useForm()
  const [allocationForm] = Form.useForm()
  const [cancelForm] = Form.useForm()
  const [reverseForm] = Form.useForm()
  const [creditForm] = Form.useForm()
  const attemptsRef = useRef(createSourceBusinessActionAttemptStore())
  const beginLatestRequest = useLatestRequestCoordinator()

  const canCreatePayment = hasActionPermission(
    adminProfile,
    'finance.payment.create'
  )
  const canPostPayment = hasActionPermission(
    adminProfile,
    'finance.payment.post'
  )
  const canCancelPayment = canCreatePayment
  const canReversePayment = hasActionPermission(
    adminProfile,
    'finance.payment.reverse'
  )
  const canCreateCredit = hasActionPermission(
    adminProfile,
    'finance.credit_note.create'
  )
  const canReverseCredit = hasActionPermission(
    adminProfile,
    'finance.credit_note.reverse'
  )
  const canRecoverProcess = hasActionPermission(
    adminProfile,
    'process_runtime.recover'
  )

  const rememberPayment = useCallback(
    (payment) => {
      setCurrentPayment(payment || null)
      if (storageKey && payment?.id) {
        window.sessionStorage.setItem(storageKey, String(payment.id))
      }
    },
    [storageKey]
  )
  const clearPaymentSelection = useCallback(() => {
    setCurrentPayment(null)
    if (storageKey) window.sessionStorage.removeItem(storageKey)
  }, [storageKey])

  const recoverPayment = useCallback(
    async (id, quiet = false) => {
      try {
        const payment = await getFinancePayment({ id: Number(id) })
        if (!payment?.id) {
          throw new Error('收付款回执不完整')
        }
        rememberPayment(payment)
        return payment
      } catch (error) {
        if (!quiet) {
          message.error(getActionErrorMessage(error, '恢复收付款记录'))
        }
        return null
      }
    },
    [rememberPayment]
  )

  const loadPaymentRows = useCallback(async () => {
    const request = beginLatestRequest('finance-payment-list')
    setTableLoading((current) => ({ ...current, payments: true }))
    try {
      const result = await listFinancePayments(
        compactParams({
          status: paymentStatusFilter,
          direction: paymentDirectionFilter,
          ...getBusinessPaginationParams(paymentPagination),
        }),
        { signal: request.signal }
      )
      if (!request.isCurrent()) return
      const nextRows = Array.isArray(result?.payments) ? result.payments : []
      setPayments(nextRows)
      setPaymentTotal(Number(result?.total || 0))
      setCurrentPayment((current) =>
        current?.id
          ? nextRows.find((item) => Number(item.id) === Number(current.id)) ||
            current
          : null
      )
    } catch (error) {
      if (!request.isCurrent() || isRpcAbortError(error)) return
      message.error(getActionErrorMessage(error, '加载收付款记录'))
    } finally {
      if (request.isCurrent()) {
        setTableLoading((current) => ({ ...current, payments: false }))
      }
      request.finish()
    }
  }, [
    beginLatestRequest,
    paymentDirectionFilter,
    paymentPagination,
    paymentStatusFilter,
  ])

  const loadCreditRows = useCallback(async () => {
    const request = beginLatestRequest('finance-credit-list')
    setTableLoading((current) => ({ ...current, credits: true }))
    try {
      const result = await listFinanceCreditNotes(
        compactParams({
          status: creditStatusFilter,
          ...getBusinessPaginationParams(creditPagination),
        }),
        { signal: request.signal }
      )
      if (!request.isCurrent()) return
      const nextRows = Array.isArray(result?.credit_notes)
        ? result.credit_notes
        : []
      setCreditNotes(nextRows)
      setCreditTotal(Number(result?.total || 0))
      setCurrentCredit((current) =>
        current?.id
          ? nextRows.find((item) => Number(item.id) === Number(current.id)) ||
            current
          : null
      )
    } catch (error) {
      if (!request.isCurrent() || isRpcAbortError(error)) return
      message.error(getActionErrorMessage(error, '加载红冲记录'))
    } finally {
      if (request.isCurrent()) {
        setTableLoading((current) => ({ ...current, credits: false }))
      }
      request.finish()
    }
  }, [beginLatestRequest, creditPagination, creditStatusFilter])

  const loadPartyReferences = useCallback(async () => {
    const request = beginLatestRequest('finance-party-references')
    setReferenceLoading(true)
    try {
      const [customerResult, supplierResult] = await Promise.allSettled([
        listAllCustomers({ active_only: true }, { signal: request.signal }),
        listAllSuppliers({ active_only: true }, { signal: request.signal }),
      ])
      if (!request.isCurrent()) return
      if (customerResult.status === 'fulfilled') {
        setCustomers(
          Array.isArray(customerResult.value?.customers)
            ? customerResult.value.customers
            : []
        )
      }
      if (supplierResult.status === 'fulfilled') {
        setSuppliers(
          Array.isArray(supplierResult.value?.suppliers)
            ? supplierResult.value.suppliers
            : []
        )
      }
      const errorResult = [customerResult, supplierResult].find(
        (result) =>
          result.status === 'rejected' && !isRpcAbortError(result.reason)
      )
      if (errorResult) {
        message.warning(
          getActionErrorMessage(
            errorResult.reason,
            '部分客户或供应商资料暂未加载'
          )
        )
      }
    } finally {
      if (request.isCurrent()) setReferenceLoading(false)
      request.finish()
    }
  }, [beginLatestRequest])

  const loadFinanceFactReferences = useCallback(
    async ({ factType, counterpartyID, currency } = {}) => {
      const request = beginLatestRequest('finance-fact-references')
      setReferenceLoading(true)
      const factTypes = factType ? [factType] : ['RECEIVABLE', 'PAYABLE']
      try {
        const results = await Promise.all(
          factTypes.map((currentFactType) =>
            listAllFinanceFacts(
              compactParams({
                fact_type: currentFactType,
                status: 'POSTED',
                counterparty_id: counterpartyID,
              }),
              { signal: request.signal }
            )
          )
        )
        if (!request.isCurrent()) return null
        const rows = results.flatMap((result) =>
          Array.isArray(result?.finance_facts) ? result.finance_facts : []
        )
        const scopedRows = currency
          ? rows.filter((item) => item?.currency === currency)
          : rows
        setFinanceFacts(scopedRows)
        return scopedRows
      } catch (error) {
        if (request.isCurrent() && !isRpcAbortError(error)) {
          message.error(getActionErrorMessage(error, '加载可核销财务记录'))
        }
        return null
      } finally {
        if (request.isCurrent()) setReferenceLoading(false)
        request.finish()
      }
    },
    [beginLatestRequest]
  )

  const loadReferences = useCallback(
    () =>
      Promise.allSettled([
        loadPaymentRows(),
        loadCreditRows(),
        loadPartyReferences(),
      ]),
    [loadCreditRows, loadPartyReferences, loadPaymentRows]
  )

  useEffect(() => {
    loadPaymentRows()
  }, [loadPaymentRows])
  useEffect(() => {
    loadCreditRows()
  }, [loadCreditRows])
  useEffect(() => {
    loadPartyReferences()
  }, [loadPartyReferences])
  useEffect(() => {
    if (
      Number.isSafeInteger(linkedFinancePaymentID) &&
      linkedFinancePaymentID > 0
    ) {
      recoverPayment(linkedFinancePaymentID)
    } else if (storageKey) {
      const paymentID = Number(window.sessionStorage.getItem(storageKey) || 0)
      if (paymentID > 0) recoverPayment(paymentID, true)
    }
  }, [linkedFinancePaymentID, recoverPayment, storageKey])
  useEffect(
    () => outletContext?.registerPageRefresh?.(loadReferences),
    [loadReferences, outletContext]
  )

  const direction = Form.useWatch('direction', paymentForm)
  const partyOptions = useMemo(
    () =>
      direction === 'RECEIPT'
        ? customers.map((item) => partyOption(item, '客户已关联'))
        : suppliers.map((item) => partyOption(item, '供应商已关联')),
    [customers, direction, suppliers]
  )
  const allocationCandidates = useMemo(() => {
    if (!currentPayment) return []
    const factType =
      currentPayment.direction === 'RECEIPT' ? 'RECEIVABLE' : 'PAYABLE'
    return financeFacts.filter(
      (fact) =>
        fact.fact_type === factType &&
        fact.status === 'POSTED' &&
        Number(fact.counterparty_id || 0) ===
          Number(currentPayment.counterparty_id || 0) &&
        fact.currency === currentPayment.currency &&
        isPositiveNumeric20Scale6Units(
          numeric20Scale6Units(fact.outstanding_amount)
        )
    )
  }, [currentPayment, financeFacts])

  const openPayment = () => {
    paymentForm.resetFields()
    paymentForm.setFieldsValue({ direction: 'RECEIPT', currency: 'CNY' })
    setPaymentOpen(true)
  }
  const createPayment = async () => {
    let values
    try {
      values = await paymentForm.validateFields()
    } catch {
      return
    }
    const payload = {
      ...(customerKey ? { customer_key: customerKey } : {}),
      payment_no: trimOptional(values.payment_no),
      direction: values.direction,
      counterparty_type:
        values.direction === 'RECEIPT' ? 'CUSTOMER' : 'SUPPLIER',
      counterparty_id: Number(values.counterparty_id),
      amount: String(values.amount).trim(),
      currency: values.currency,
      account_ref: trimOptional(values.account_ref),
      evidence_ref: trimOptional(values.evidence_ref),
      ...(values.occurred_at
        ? { occurred_at: new Date(values.occurred_at).toISOString() }
        : {}),
    }
    const scope = `finance-payment:${payload.direction}:${payload.counterparty_id}`
    const attempt = attemptsRef.current.prepare(scope, payload)
    setLoading(true)
    try {
      const created = await createFinancePayment(attempt.params)
      if (!created?.id || created.status !== 'DRAFT') {
        throw Object.assign(new Error('收付款结果暂时无法确认'), {
          isInvalidResponse: true,
        })
      }
      let processData
      try {
        processData = await startFinancePaymentApprovalProcess({
          ...(customerKey ? { customer_key: customerKey } : {}),
          finance_payment_id: created.id,
          idempotency_key: `finance-payment-approval/${created.id}`,
        })
      } catch (error) {
        if (!isSourceBusinessActionResultUnknown(error)) throw error
        processData = await getFinancePaymentApprovalProcess({
          ...(customerKey ? { customer_key: customerKey } : {}),
          finance_payment_id: created.id,
        })
        if (!processData?.process_context) throw error
      }
      const payment = processData.source_readback
      attemptsRef.current.settle(scope, attempt, null)
      rememberPayment(payment)
      setPaymentOpen(false)
      await loadReferences()
      message.success('收付款记录已创建，审批通过后可选择应收或应付核销')
    } catch (error) {
      const retained = attemptsRef.current.settle(scope, attempt, error)
      message[retained ? 'warning' : 'error'](
        retained
          ? '提交结果暂时无法确认，请保持填写内容不变后重试'
          : getActionErrorMessage(error, '创建收付款记录')
      )
    } finally {
      setLoading(false)
    }
  }

  const ensurePaymentApprovalProcess = async () => {
    if (!currentPayment?.id || currentPayment.status !== 'DRAFT') return
    setLoading(true)
    try {
      let processData = await getFinancePaymentApprovalProcess({
        ...(customerKey ? { customer_key: customerKey } : {}),
        finance_payment_id: currentPayment.id,
      })
      const alreadyStarted = Boolean(processData?.process_context)
      if (!alreadyStarted) {
        try {
          processData = await startFinancePaymentApprovalProcess({
            ...(customerKey ? { customer_key: customerKey } : {}),
            finance_payment_id: currentPayment.id,
            idempotency_key: `finance-payment-approval/${currentPayment.id}`,
          })
        } catch (error) {
          if (!isSourceBusinessActionResultUnknown(error)) throw error
          processData = await getFinancePaymentApprovalProcess({
            ...(customerKey ? { customer_key: customerKey } : {}),
            finance_payment_id: currentPayment.id,
          })
          if (!processData?.process_context) throw error
        }
      }
      if (!processData?.process_context || !processData?.source_readback?.id) {
        throw Object.assign(new Error('收付款审批流结果暂时无法确认'), {
          isInvalidResponse: true,
        })
      }
      rememberPayment(processData.source_readback)
      await loadReferences()
      message[alreadyStarted ? 'info' : 'success'](
        alreadyStarted
          ? '收付款审批流已存在，请到任务中心继续办理'
          : '收付款审批流已恢复发起'
      )
    } catch (error) {
      message.error(getActionErrorMessage(error, '核对收付款审批流'))
    } finally {
      setLoading(false)
    }
  }

  const openAllocation = async () => {
    if (!currentPayment) return
    const rows = await loadFinanceFactReferences({
      factType:
        currentPayment.direction === 'RECEIPT' ? 'RECEIVABLE' : 'PAYABLE',
      counterpartyID: Number(currentPayment.counterparty_id || 0),
      currency: currentPayment.currency,
    })
    if (rows === null) return
    setAllocationOpen(true)
  }
  const initializeAllocationForm = (visible) => {
    if (!visible) return
    allocationForm.resetFields()
    allocationForm.setFieldsValue({
      allocations: allocationCandidates.map((fact) => ({
        finance_fact_id: fact.id,
        label: `${fact.fact_no || '财务记录'} / 未核销 ${
          fact.outstanding_amount || '0'
        } / 原金额 ${fact.amount || '-'} ${fact.currency || ''}`,
        outstanding_amount: fact.outstanding_amount,
        amount: '',
      })),
    })
  }

  const openCancel = async () => {
    if (!currentPayment?.id) return
    setLoading(true)
    try {
      const processData = await getFinancePaymentApprovalProcess({
        ...(customerKey ? { customer_key: customerKey } : {}),
        finance_payment_id: currentPayment.id,
      })
      const payment = processData.source_readback
      rememberPayment(payment)
      const processStatus =
        processData.process_context?.process_instance?.status || ''
      const allowed =
        (payment.status === 'DRAFT' && !processData.process_context) ||
        (payment.status === 'APPROVED' && processStatus === 'blocked')
      if (!allowed) {
        message.warning(
          payment.status === 'DRAFT'
            ? '该收付款已进入审批，请先在任务中心驳回或阻塞流程'
            : payment.status === 'APPROVED'
              ? '只有流程受阻且尚未过账的收付款可以取消'
              : '当前状态不能取消收付款'
        )
        return
      }
      cancelForm.resetFields()
      setCancelOpen(true)
    } catch (error) {
      message.error(getActionErrorMessage(error, '核对收付款取消条件'))
    } finally {
      setLoading(false)
    }
  }

  const cancelPayment = async () => {
    let values
    try {
      values = await cancelForm.validateFields(['reason'])
    } catch {
      return
    }
    setLoading(true)
    try {
      const payment = await cancelFinancePayment({
        ...(customerKey ? { customer_key: customerKey } : {}),
        id: currentPayment.id,
        expected_version: currentPayment.version,
        reason: trimOptional(values.reason),
      })
      rememberPayment(payment)
      setCancelOpen(false)
      await loadReferences()
      message.success(
        '收付款已取消；如流程已有审批效果，系统会保留恢复记录，供管理员继续核对处理'
      )
    } catch (error) {
      if (isSourceBusinessActionResultUnknown(error)) {
        const recovered = await recoverPayment(currentPayment.id, true)
        if (recovered?.status === 'CANCELLED') {
          setCancelOpen(false)
          message.success('已重新读取收付款取消结果')
          return
        }
      }
      message.error(getActionErrorMessage(error, '取消收付款'))
    } finally {
      setLoading(false)
    }
  }

  const postPayment = async () => {
    let values
    try {
      values = await allocationForm.validateFields()
    } catch {
      return
    }
    const allocations = (values.allocations || [])
      .filter((item) => String(item.amount || '').trim())
      .map((item) => ({
        finance_fact_id: Number(item.finance_fact_id),
        amount: String(item.amount).trim(),
      }))
    const allocationCheck = validateFinanceAllocationDraft({
      allocations,
      candidates: allocationCandidates,
      paymentAmount: currentPayment?.amount,
    })
    if (allocationCheck.reason === 'EMPTY') {
      message.warning('请至少填写一笔核销金额')
      return
    }
    if (allocationCheck.reason === 'SOURCE_CHANGED') {
      message.error('核销来源或未核销金额已变化，请重新打开核销窗口')
      return
    }
    if (allocationCheck.reason === 'EXCEEDS_OUTSTANDING') {
      message.warning(
        `${
          allocationCheck.financeFactNo || '财务记录'
        }的本次核销金额超过未核销金额`
      )
      return
    }
    if (allocationCheck.reason === 'TOTAL_MISMATCH') {
      message.warning(
        `核销合计 ${allocationCheck.total || '0'} 必须等于本次收付款金额 ${
          currentPayment?.amount || '-'
        }`
      )
      return
    }
    setLoading(true)
    try {
      const processData = await getFinancePaymentApprovalProcess({
        ...(customerKey ? { customer_key: customerKey } : {}),
        finance_payment_id: currentPayment.id,
      })
      const node = findExceptionProcessActiveNode(
        processData,
        'post_finance_payment'
      )
      const execution = await executeFinancePaymentPost({
        ...(customerKey ? { customer_key: customerKey } : {}),
        process_instance_id: processData.process_context.process_instance.id,
        process_node_instance_id: node.id,
        expected_version: node.version,
        finance_payment_id: currentPayment.id,
        idempotency_key: `finance-payment-post/${currentPayment.id}/${node.id}`,
        allocations,
      })
      const payment = execution.source_readback
      rememberPayment(payment)
      setAllocationOpen(false)
      await loadReferences()
      message.success('收付款已过账并完成核销')
    } catch (error) {
      if (isSourceBusinessActionResultUnknown(error)) {
        try {
          const processData = await getFinancePaymentApprovalProcess({
            ...(customerKey ? { customer_key: customerKey } : {}),
            finance_payment_id: currentPayment.id,
          })
          const payment = processData.source_readback
          rememberPayment(payment)
          if (payment?.status === 'POSTED') {
            setAllocationOpen(false)
            await loadReferences()
            message.success('已重新读取收付款过账与核销结果')
            return
          }
        } catch {
          await recoverPayment(currentPayment.id, true)
        }
      } else {
        await recoverPayment(currentPayment.id, true)
      }
      message.error(getActionErrorMessage(error, '过账并核销收付款'))
    } finally {
      setLoading(false)
    }
  }

  const reversePayment = async () => {
    let values
    try {
      values = await reverseForm.validateFields(['reason'])
    } catch {
      return
    }
    setLoading(true)
    try {
      const payment = await reverseFinancePayment({
        ...(customerKey ? { customer_key: customerKey } : {}),
        id: currentPayment.id,
        expected_version: currentPayment.version,
        reason: trimOptional(values.reason),
      })
      rememberPayment(payment)
      setReverseOpen(false)
      await loadReferences()
      message.success('收付款已冲销，原核销金额已恢复')
    } catch (error) {
      if (isSourceBusinessActionResultUnknown(error)) {
        const recovered = await recoverPayment(currentPayment.id, true)
        if (recovered?.status === 'REVERSED') {
          setReverseOpen(false)
          message.success('已重新读取收付款冲销结果')
          return
        }
      }
      message.error(getActionErrorMessage(error, '冲销收付款'))
    } finally {
      setLoading(false)
    }
  }

  const submitCredit = async (reverse = false) => {
    let values
    try {
      values = await creditForm.validateFields()
    } catch {
      return
    }
    const source = financeFacts.find(
      (fact) => Number(fact.id) === Number(values.finance_fact_id)
    )
    const payload = reverse
      ? {
          ...(customerKey ? { customer_key: customerKey } : {}),
          credit_note_id: currentCredit.id,
          credit_note_no: trimOptional(values.credit_note_no),
          reason: trimOptional(values.reason),
        }
      : {
          ...(customerKey ? { customer_key: customerKey } : {}),
          credit_note_no: trimOptional(values.credit_note_no),
          finance_fact_id: Number(values.finance_fact_id),
          amount: String(values.amount).trim(),
          reason: trimOptional(values.reason),
        }
    if (!reverse) {
      const creditCheck = validateFinanceCreditDraft({
        amount: payload.amount,
        outstandingAmount: source?.outstanding_amount,
      })
      if (!source || creditCheck.reason === 'SOURCE_CHANGED') {
        message.error('来源应收或应付的未核销金额无法确认，请重新选择')
        return
      }
      if (creditCheck.reason === 'EXCEEDS_OUTSTANDING') {
        message.warning('红冲金额不能超过来源记录的当前未核销金额')
        return
      }
    }
    const scope = `${reverse ? 'reverse-credit' : 'credit'}:${
      reverse ? currentCredit.id : payload.finance_fact_id
    }`
    const attempt = attemptsRef.current.prepare(scope, payload)
    setLoading(true)
    try {
      const credit = reverse
        ? await reverseFinanceCreditNote(attempt.params)
        : await createFinanceCreditNote(attempt.params)
      const validCreate =
        !reverse &&
        Number(credit?.finance_fact_id) === Number(payload.finance_fact_id) &&
        credit?.status === 'POSTED' &&
        compareNumeric20Scale6Values(credit?.amount, payload.amount) === 0
      const validReverse =
        reverse &&
        Number(credit?.reversal_of_credit_note_id) ===
          Number(currentCredit?.id) &&
        credit?.status === 'REVERSED'
      if (!credit?.id || (!validCreate && !validReverse)) {
        throw Object.assign(new Error('红冲结果暂时无法确认'), {
          isInvalidResponse: true,
        })
      }
      attemptsRef.current.settle(scope, attempt, null)
      setCurrentCredit({
        ...credit,
        source_no: source?.fact_no || currentCredit?.source_no,
      })
      setCreditOpen(false)
      await loadReferences()
      message.success(reverse ? '红冲记录已冲销' : '红冲已登记')
    } catch (error) {
      const retained = attemptsRef.current.settle(scope, attempt, error)
      if (retained && reverse && currentCredit?.id) {
        try {
          const sourceCredit = await getFinanceCreditNote({
            id: currentCredit.id,
          })
          const history = await listFinanceCreditNotes({
            finance_fact_id: sourceCredit?.finance_fact_id,
            limit: 50,
            offset: 0,
          })
          const reversal = (history?.credit_notes || []).find(
            (item) =>
              Number(item?.reversal_of_credit_note_id) ===
              Number(currentCredit.id)
          )
          if (reversal?.status === 'REVERSED') {
            attemptsRef.current.settle(scope, attempt, null)
            setCurrentCredit(reversal)
            setCreditOpen(false)
            message.success('已重新读取红冲冲销结果')
            return
          }
        } catch {
          // Keep the frozen intent for an exact retry when readback is unavailable.
        }
      }
      message[retained ? 'warning' : 'error'](
        retained
          ? '红冲结果暂时无法确认，请保持内容不变后重试'
          : getActionErrorMessage(error, reverse ? '冲销红冲记录' : '登记红冲')
      )
    } finally {
      setLoading(false)
    }
  }

  const openCredit = async (reverse = false) => {
    if (!reverse) {
      const rows = await loadFinanceFactReferences()
      if (rows === null) return
    }
    creditForm.resetFields()
    creditForm.setFieldsValue({
      credit_note_no: sourceBusinessActionNo(
        reverse ? 'CR-REV' : 'CR',
        currentCredit?.credit_note_no || 'FINANCE',
        sourceBusinessActionUUID()
      ),
      reason: '',
    })
    setCreditOpen(reverse ? 'reverse' : 'create')
  }

  const paymentColumns = [
    { title: '收付款单号', dataIndex: 'payment_no', width: 200 },
    {
      title: '方向',
      dataIndex: 'direction',
      width: 100,
      render: (value) => (value === 'RECEIPT' ? '收款' : '付款'),
    },
    { title: '金额', dataIndex: 'amount', width: 140 },
    { title: '币种', dataIndex: 'currency', width: 90 },
    {
      title: '往来方',
      key: 'counterparty',
      width: 200,
      detailValue: (record) => {
        const source =
          record.counterparty_type === 'CUSTOMER' ? customers : suppliers
        return (
          source.find(
            (item) => Number(item.id) === Number(record.counterparty_id)
          )?.name || '往来方已关联'
        )
      },
      render: (_, record) => {
        const source =
          record.counterparty_type === 'CUSTOMER' ? customers : suppliers
        return (
          source.find(
            (item) => Number(item.id) === Number(record.counterparty_id)
          )?.name || '往来方已关联'
        )
      },
    },
    { title: '状态', dataIndex: 'status', width: 110, render: paymentStatus },
    {
      title: '核销明细',
      dataIndex: 'allocations',
      width: 110,
      render: (items) => `${Array.isArray(items) ? items.length : 0} 笔`,
    },
    { title: '账户摘要', dataIndex: 'account_ref', width: 200 },
    { title: '业务凭据', dataIndex: 'evidence_ref', width: 200 },
    {
      title: '发生时间',
      dataIndex: 'occurred_at',
      width: 170,
      render: formatUnixDateTime,
    },
  ]
  const creditColumns = [
    { title: '红冲单号', dataIndex: 'credit_note_no', width: 200 },
    {
      title: '来源财务记录',
      dataIndex: 'finance_fact_no',
      width: 190,
      render: (value) => value || '已关联财务记录',
    },
    {
      title: '来源类型',
      dataIndex: 'finance_fact_type',
      width: 110,
      render: (value) => (value === 'RECEIVABLE' ? '应收' : '应付'),
    },
    { title: '红冲金额', dataIndex: 'amount', width: 140 },
    { title: '币种', dataIndex: 'currency', width: 90 },
    {
      title: '来源原金额',
      dataIndex: 'finance_fact_original_amount',
      width: 140,
    },
    {
      title: '红冲后未核销',
      dataIndex: 'finance_fact_outstanding_amount',
      width: 150,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 110,
      render: (value) => (
        <Tag color={value === 'REVERSED' ? 'magenta' : 'gold'}>
          {value === 'REVERSED' ? '冲销记录' : '已红冲'}
        </Tag>
      ),
    },
    { title: '原因', dataIndex: 'reason', width: 260 },
  ]
  const paymentDetailLineItems = {
    title: '核销明细',
    items: Array.isArray(paymentDetail?.allocations)
      ? paymentDetail.allocations
      : [],
    emptyDescription: '当前收付款尚未形成核销明细',
    getItemKey: (item) => item?.id,
    getItemLabel: (item, { index }) =>
      item?.finance_fact_no || `核销明细 ${index + 1}`,
    getItemSummary: (item) => `${item?.amount || '-'} ${item?.currency || ''}`,
    getItemFields: (item) => [
      {
        key: 'type',
        label: '来源类型',
        value: item?.finance_fact_type === 'RECEIVABLE' ? '应收' : '应付',
      },
      {
        key: 'original',
        label: '来源原金额',
        value: item?.finance_fact_original_amount || '-',
      },
      {
        key: 'outstanding',
        label: '当前未核销',
        value: item?.finance_fact_outstanding_amount ?? '-',
      },
      {
        key: 'status',
        label: '核销状态',
        value: item?.status === 'REVERSED' ? '已冲销' : '已过账',
      },
    ],
  }
  const currentCreditHasReversal =
    Boolean(currentCredit?.id) &&
    creditNotes.some(
      (item) =>
        Number(item?.reversal_of_credit_note_id) === Number(currentCredit.id)
    )
  const currentCreditCanReverse =
    Boolean(currentCredit) &&
    currentCredit.status === 'POSTED' &&
    !currentCredit.reversal_of_credit_note_id &&
    !currentCreditHasReversal
  const financeViewTabs = (
    <Tabs
      activeKey={activeTab}
      items={FINANCE_VIEW_ITEMS}
      onChange={setActiveTab}
    />
  )

  return (
    <BusinessPageLayout className="erp-finance-payments-page">
      <PageHeaderCard
        compact
        title="收付款与核销"
        description="登记真实收款或付款，按同一往来方和币种跨多张应收或应付核销；已过账记录通过冲销恢复未核销金额，红冲记录保留独立审计。"
        tags={[
          <Tag color="blue" key="payment">
            真实收付款
          </Tag>,
          <Tag color="green" key="allocation">
            多单核销
          </Tag>,
          <Space key="reversal" size={2}>
            <Tag color="gold" style={{ marginInlineEnd: 0 }}>
              冲销 / 红冲
            </Tag>
            <FinanceReversalTermHelp />
          </Space>,
        ]}
        stats={[
          {
            key: 'total',
            label: activeTab === 'payments' ? '收付款记录' : '红冲记录',
            value: activeTab === 'payments' ? paymentTotal : creditTotal,
          },
          {
            key: 'page',
            label: '本页显示',
            value:
              activeTab === 'payments' ? payments.length : creditNotes.length,
          },
        ]}
      />
      {activeTab === 'payments' ? (
        <>
          <BusinessOperationPanel
            compact
            filters={
              <Space wrap>
                <SelectFilter
                  className="erp-business-filter-control--status"
                  value={paymentStatusFilter}
                  options={PAYMENT_STATUS_OPTIONS}
                  onChange={(value) => {
                    setPaymentStatusFilter(value || '')
                    setPaymentPagination((current) => ({
                      ...current,
                      current: 1,
                    }))
                  }}
                />
                <SelectFilter
                  className="erp-business-filter-control--status"
                  value={paymentDirectionFilter}
                  options={PAYMENT_DIRECTION_OPTIONS}
                  onChange={(value) => {
                    setPaymentDirectionFilter(value || '')
                    setPaymentPagination((current) => ({
                      ...current,
                      current: 1,
                    }))
                  }}
                />
              </Space>
            }
            primaryAction={
              canCreatePayment ? (
                <ToolbarButton
                  type="primary"
                  className="erp-business-list-toolbar__primary-action"
                  onClick={openPayment}
                >
                  登记收付款
                </ToolbarButton>
              ) : null
            }
          >
            <SelectionActionBar
              embedded
              selectedCount={currentPayment ? 1 : 0}
              selectedLabel={
                currentPayment
                  ? `${currentPayment.payment_no || '收付款已登记'} / ${
                      PAYMENT_STATUS_META[currentPayment.status]?.[0] ||
                      '状态待核对'
                    }`
                  : '请选择一条收付款记录'
              }
              boundaryText="审批仅确认收付款来源；过账时按同一往来方、方向和币种精确核销，已过账记录只能冲销。"
            >
              <SelectionClearAction
                selectedCount={currentPayment ? 1 : 0}
                selectionLabel="收付款记录"
                onClear={clearPaymentSelection}
              />
              <BusinessActionTooltip
                disabled={!currentPayment}
                disabledReason="请先选择一条收付款记录"
              >
                <Button
                  disabled={!currentPayment}
                  onClick={() => setPaymentDetail(currentPayment)}
                >
                  查看详情
                </Button>
              </BusinessActionTooltip>
              {canPostPayment &&
              (!currentPayment || currentPayment.status === 'APPROVED') ? (
                <BusinessActionTooltip
                  disabled={
                    !currentPayment ||
                    currentPayment.status !== 'APPROVED' ||
                    loading ||
                    referenceLoading
                  }
                  disabledReason={
                    !currentPayment
                      ? '请先选择一条收付款记录'
                      : currentPayment.status !== 'APPROVED'
                        ? '只有审批通过的收付款可以办理核销'
                        : '核销资料加载完成后可继续'
                  }
                >
                  <Button
                    type="primary"
                    className="erp-business-module-status-action"
                    disabled={
                      !currentPayment ||
                      currentPayment.status !== 'APPROVED' ||
                      loading ||
                      referenceLoading
                    }
                    onClick={openAllocation}
                  >
                    选择应收 / 应付核销
                  </Button>
                </BusinessActionTooltip>
              ) : null}
              {canCreatePayment &&
              (!currentPayment || currentPayment.status === 'DRAFT') ? (
                <BusinessActionTooltip
                  disabled={
                    !currentPayment ||
                    currentPayment.status !== 'DRAFT' ||
                    loading
                  }
                  disabledReason={
                    !currentPayment
                      ? '请先选择一条收付款记录'
                      : currentPayment.status !== 'DRAFT'
                        ? '只有待审批收付款可以核对审批流'
                        : '当前操作完成后可核对审批流'
                  }
                >
                  <Button
                    disabled={
                      !currentPayment ||
                      currentPayment.status !== 'DRAFT' ||
                      loading
                    }
                    onClick={ensurePaymentApprovalProcess}
                  >
                    核对审批流
                  </Button>
                </BusinessActionTooltip>
              ) : null}
              {canCancelPayment &&
              (!currentPayment ||
                ['DRAFT', 'APPROVED'].includes(currentPayment.status)) ? (
                  <BusinessActionTooltip
                    disabled={
                    !currentPayment ||
                    !['DRAFT', 'APPROVED'].includes(currentPayment.status) ||
                    loading
                  }
                    disabledReason={
                    !currentPayment
                      ? '请先选择一条收付款记录'
                      : '只有尚未过账的收付款可以核对取消'
                  }
                  >
                    <Button
                      danger
                      disabled={
                      !currentPayment ||
                      !['DRAFT', 'APPROVED'].includes(currentPayment.status) ||
                      loading
                    }
                      onClick={openCancel}
                    >
                      核对并取消
                    </Button>
                  </BusinessActionTooltip>
              ) : null}
              {canReversePayment &&
              (!currentPayment || currentPayment.status === 'POSTED') ? (
                <BusinessActionTooltip
                  disabled={
                    !currentPayment ||
                    currentPayment.status !== 'POSTED' ||
                    loading
                  }
                  disabledReason={
                    !currentPayment
                      ? '请先选择一条收付款记录'
                      : '只有已核销收付款可以冲销'
                  }
                >
                  <Button
                    danger
                    className="erp-business-module-status-action"
                    disabled={
                      !currentPayment ||
                      currentPayment.status !== 'POSTED' ||
                      loading
                    }
                    onClick={() => {
                      reverseForm.resetFields()
                      setReverseOpen(true)
                    }}
                  >
                    冲销收付款
                  </Button>
                </BusinessActionTooltip>
              ) : null}
              <ExceptionProcessRecoveryButton
                canRecover={canRecoverProcess}
                disabled={!currentPayment || loading}
                loadProcess={() =>
                  getFinancePaymentApprovalProcess({
                    ...(customerKey ? { customer_key: customerKey } : {}),
                    finance_payment_id: currentPayment.id,
                  })
                }
                onRecovered={async () => {
                  await recoverPayment(currentPayment.id)
                  await loadReferences()
                }}
              />
              <BusinessActionTooltip
                disabled={!currentPayment || loading}
                disabledReason="请先选择一条收付款记录"
              >
                <Button
                  disabled={!currentPayment || loading}
                  onClick={() => recoverPayment(currentPayment?.id)}
                >
                  重新读取
                </Button>
              </BusinessActionTooltip>
            </SelectionActionBar>
          </BusinessOperationPanel>
          <BusinessDataTable
            tableHeader={financeViewTabs}
            rowKey="id"
            loading={tableLoading.payments}
            columns={paymentColumns}
            dataSource={payments}
            pagination={createBusinessTablePagination({
              pagination: paymentPagination,
              total: paymentTotal,
              onChange: (current, pageSize) =>
                setPaymentPagination({ current, pageSize }),
            })}
            scroll={{ x: 1450 }}
            rowSelection={{
              type: 'radio',
              selectedRowKeys: currentPayment?.id ? [currentPayment.id] : [],
              onChange: (_, rows) => rememberPayment(rows[0] || null),
            }}
            onRow={(record) => ({
              onClick: () => rememberPayment(record),
            })}
            onOpenRecord={(record) => setPaymentDetail(record)}
            emptyDescription="暂无收付款记录"
          />
        </>
      ) : (
        <>
          <BusinessOperationPanel
            compact
            filters={
              <SelectFilter
                className="erp-business-filter-control--status"
                value={creditStatusFilter}
                options={CREDIT_STATUS_OPTIONS}
                onChange={(value) => {
                  setCreditStatusFilter(value || '')
                  setCreditPagination((current) => ({
                    ...current,
                    current: 1,
                  }))
                }}
              />
            }
            primaryAction={
              canCreateCredit ? (
                <ToolbarButton
                  type="primary"
                  className="erp-business-list-toolbar__primary-action"
                  loading={referenceLoading}
                  onClick={() => openCredit(false)}
                >
                  登记红冲
                </ToolbarButton>
              ) : null
            }
          >
            <SelectionActionBar
              embedded
              selectedCount={currentCredit ? 1 : 0}
              selectedLabel={
                currentCredit
                  ? `${currentCredit.credit_note_no || '红冲已登记'} / ${
                      currentCredit.status === 'REVERSED'
                        ? '冲销记录'
                        : '已红冲'
                    }`
                  : '请选择一条红冲记录'
              }
              boundaryText="红冲只调整应收、应付未核销金额并保留独立审计；不删除原记录，也不替代总账凭证或税控处理。"
            >
              <SelectionClearAction
                selectedCount={currentCredit ? 1 : 0}
                selectionLabel="红冲记录"
                onClear={() => setCurrentCredit(null)}
              />
              <BusinessActionTooltip
                disabled={!currentCredit}
                disabledReason="请先选择一条红冲记录"
              >
                <Button
                  disabled={!currentCredit}
                  onClick={() => setCreditDetail(currentCredit)}
                >
                  查看详情
                </Button>
              </BusinessActionTooltip>
              {canReverseCredit &&
              (!currentCredit || currentCreditCanReverse) ? (
                <BusinessActionTooltip
                  disabled={!currentCreditCanReverse || loading}
                  disabledReason={
                    !currentCredit
                      ? '请先选择一条红冲记录'
                      : currentCredit.reversal_of_credit_note_id
                        ? '冲销记录不能再次冲销'
                        : currentCredit.status !== 'POSTED'
                          ? '只有已红冲记录可以冲销'
                          : currentCreditHasReversal
                            ? '当前红冲记录已经完成冲销'
                            : '当前操作完成后可冲销'
                  }
                >
                  <Button
                    danger
                    className="erp-business-module-status-action"
                    disabled={!currentCreditCanReverse || loading}
                    onClick={() => openCredit(true)}
                  >
                    冲销当前红冲
                  </Button>
                </BusinessActionTooltip>
              ) : null}
            </SelectionActionBar>
          </BusinessOperationPanel>
          <BusinessDataTable
            tableHeader={financeViewTabs}
            rowKey="id"
            loading={tableLoading.credits}
            dataSource={creditNotes}
            columns={creditColumns}
            pagination={createBusinessTablePagination({
              pagination: creditPagination,
              total: creditTotal,
              onChange: (current, pageSize) =>
                setCreditPagination({ current, pageSize }),
            })}
            rowSelection={{
              type: 'radio',
              selectedRowKeys: currentCredit?.id ? [currentCredit.id] : [],
              onChange: (_, rows) => setCurrentCredit(rows[0] || null),
            }}
            onRow={(record) => ({
              onClick: () => setCurrentCredit(record),
            })}
            onOpenRecord={(record) => setCreditDetail(record)}
            scroll={{ x: 1450 }}
            emptyDescription="暂无红冲记录"
          />
        </>
      )}

      <BusinessFormModal
        title="登记收付款"
        description="登记实际发生的收款或付款；创建后须完成审批，过账时再选择应收或应付核销。"
        open={paymentOpen}
        width={760}
        okText="创建收付款记录"
        cancelText="取消"
        confirmLoading={loading}
        onCancel={() => !loading && setPaymentOpen(false)}
        onOk={createPayment}
      >
        <Form
          form={paymentForm}
          className="erp-business-action-form"
          layout="vertical"
          preserve={false}
          disabled={loading}
        >
          <Form.Item
            name="direction"
            label="收付款方向"
            rules={[{ required: true }]}
          >
            <Select
              options={[
                { value: 'RECEIPT', label: '收款' },
                { value: 'DISBURSEMENT', label: '付款' },
              ]}
              onChange={() =>
                paymentForm.setFieldValue('counterparty_id', undefined)
              }
            />
          </Form.Item>
          <Form.Item
            name="counterparty_id"
            label={direction === 'RECEIPT' ? '客户' : '供应商'}
            rules={[{ required: true, message: '请选择往来方' }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              loading={referenceLoading}
              options={partyOptions}
            />
          </Form.Item>
          <Form.Item
            name="payment_no"
            label="收付款单号"
            rules={[
              { required: true, whitespace: true, message: '请填写单号' },
            ]}
          >
            <Input maxLength={64} />
          </Form.Item>
          <Space align="start" wrap>
            <Form.Item
              name="amount"
              label="实收 / 实付金额"
              rules={[
                { required: true, message: '请填写金额' },
                {
                  validator: (_, value) =>
                    isPositiveNumeric20Scale6Units(numeric20Scale6Units(value))
                      ? Promise.resolve()
                      : Promise.reject(new Error('金额必须大于 0')),
                },
              ]}
            >
              <Input inputMode="decimal" />
            </Form.Item>
            <Form.Item
              name="currency"
              label="币种"
              rules={[{ required: true }]}
            >
              <Select options={CURRENCY_OPTIONS} style={{ width: 160 }} />
            </Form.Item>
            <Form.Item name="occurred_at" label="发生时间">
              <Input type="datetime-local" />
            </Form.Item>
          </Space>
          <Form.Item
            name="account_ref"
            label="收付款账户摘要"
            rules={[
              { required: true, whitespace: true, message: '请填写账户摘要' },
            ]}
          >
            <Input maxLength={255} />
          </Form.Item>
          <Form.Item
            name="evidence_ref"
            label="业务凭据"
            rules={[
              {
                required: true,
                whitespace: true,
                message: '请填写回单或凭据摘要',
              },
            ]}
          >
            <Input maxLength={255} />
          </Form.Item>
        </Form>
      </BusinessFormModal>

      <BusinessFormModal
        className="erp-business-action-modal--operational-fact"
        title="选择核销记录"
        description="本次核销合计必须精确等于收付款金额，且每笔不得超过来源记录的当前未核销金额。"
        open={allocationOpen}
        width={860}
        okText="过账并核销"
        cancelText="取消"
        confirmLoading={loading}
        okButtonProps={{ disabled: allocationCandidates.length === 0 }}
        afterOpenChange={initializeAllocationForm}
        onCancel={() => !loading && setAllocationOpen(false)}
        onOk={postPayment}
      >
        <Alert
          type="info"
          showIcon
          message="仅显示与当前收付款方向、往来方和币种一致的已过账应收或应付；实际可核销余额由系统再次校验。"
        />
        {allocationCandidates.length === 0 ? (
          <Alert
            type="warning"
            showIcon
            message="当前没有可核销的应收或应付记录"
          />
        ) : null}
        <Form
          form={allocationForm}
          className="erp-business-action-form"
          layout="vertical"
          disabled={loading}
        >
          <Form.List name="allocations">
            {(fields) => (
              <Space
                direction="vertical"
                style={{ width: '100%', marginTop: 16 }}
              >
                {fields.map((field) => (
                  <Space key={field.key} align="start" wrap>
                    <Form.Item name={[field.name, 'finance_fact_id']} hidden>
                      <Input />
                    </Form.Item>
                    <Form.Item name={[field.name, 'label']} label="应收 / 应付">
                      <Input disabled style={{ width: 360 }} />
                    </Form.Item>
                    <Form.Item
                      name={[field.name, 'amount']}
                      label="本次核销金额"
                      rules={[
                        {
                          validator: (_, value) =>
                            !String(value || '').trim() ||
                            isPositiveNumeric20Scale6Units(
                              numeric20Scale6Units(value)
                            )
                              ? Promise.resolve()
                              : Promise.reject(new Error('金额必须大于 0')),
                        },
                      ]}
                    >
                      <Input inputMode="decimal" style={{ width: 180 }} />
                    </Form.Item>
                  </Space>
                ))}
              </Space>
            )}
          </Form.List>
        </Form>
      </BusinessFormModal>

      <BusinessFormModal
        title="取消收付款"
        description="取消不会删除收付款记录；已发生的流程效果仍保留恢复审计。"
        open={cancelOpen}
        okText="确认取消"
        cancelText="返回"
        okButtonProps={{ danger: true }}
        confirmLoading={loading}
        onCancel={() => !loading && setCancelOpen(false)}
        onOk={cancelPayment}
      >
        <Alert
          type="warning"
          showIcon
          message="取消不会删除收付款记录；已发生的流程效果会保留补偿和恢复审计。"
        />
        <Form
          form={cancelForm}
          className="erp-business-action-form"
          layout="vertical"
          preserve={false}
          style={{ marginTop: 16 }}
        >
          <Form.Item
            name="reason"
            label="取消原因"
            rules={[
              { required: true, whitespace: true, message: '请填写取消原因' },
            ]}
          >
            <Input.TextArea rows={3} maxLength={255} showCount />
          </Form.Item>
        </Form>
      </BusinessFormModal>

      <BusinessFormModal
        title="冲销收付款"
        description="冲销会恢复原核销金额并保留原收付款及核销记录。"
        open={reverseOpen}
        okText="确认冲销"
        cancelText="返回"
        okButtonProps={{ danger: true }}
        confirmLoading={loading}
        onCancel={() => !loading && setReverseOpen(false)}
        onOk={reversePayment}
      >
        <Form
          form={reverseForm}
          className="erp-business-action-form"
          layout="vertical"
          preserve={false}
        >
          <Form.Item
            name="reason"
            label="冲销原因"
            rules={[
              { required: true, whitespace: true, message: '请填写冲销原因' },
            ]}
          >
            <Input.TextArea rows={3} maxLength={255} showCount />
          </Form.Item>
        </Form>
      </BusinessFormModal>

      <BusinessFormModal
        title={creditOpen === 'reverse' ? '冲销红冲记录' : '登记红冲'}
        description={
          creditOpen === 'reverse'
            ? '冲销会恢复该红冲对未核销金额的影响。'
            : '红冲金额不得超过来源应收或应付的当前未核销金额。'
        }
        open={Boolean(creditOpen)}
        width={720}
        okText={creditOpen === 'reverse' ? '确认冲销' : '确认红冲'}
        cancelText="取消"
        confirmLoading={loading}
        onCancel={() => !loading && setCreditOpen(false)}
        onOk={() => submitCredit(creditOpen === 'reverse')}
      >
        <Form
          form={creditForm}
          className="erp-business-action-form"
          layout="vertical"
          preserve={false}
          disabled={loading}
        >
          {creditOpen !== 'reverse' ? (
            <Form.Item
              name="finance_fact_id"
              label="来源应收 / 应付"
              rules={[{ required: true, message: '请选择来源财务记录' }]}
            >
              <Select
                showSearch
                optionFilterProp="label"
                loading={referenceLoading}
                options={financeFacts
                  .filter(
                    (fact) =>
                      fact.status === 'POSTED' &&
                      isPositiveNumeric20Scale6Units(
                        numeric20Scale6Units(fact.outstanding_amount)
                      )
                  )
                  .map((fact) => ({
                    value: fact.id,
                    label: `${fact.fact_no || '财务记录'} / 未核销 ${
                      fact.outstanding_amount || '0'
                    } / 原金额 ${fact.amount || '-'} ${fact.currency || ''}`,
                  }))}
              />
            </Form.Item>
          ) : null}
          <Form.Item
            name="credit_note_no"
            label={creditOpen === 'reverse' ? '冲销单号' : '红冲单号'}
            rules={[
              { required: true, whitespace: true, message: '请填写单号' },
            ]}
          >
            <Input maxLength={64} />
          </Form.Item>
          {creditOpen !== 'reverse' ? (
            <Form.Item
              name="amount"
              label="红冲金额"
              rules={[
                { required: true, message: '请填写红冲金额' },
                {
                  validator: (_, value) =>
                    isPositiveNumeric20Scale6Units(numeric20Scale6Units(value))
                      ? Promise.resolve()
                      : Promise.reject(new Error('金额必须大于 0')),
                },
              ]}
            >
              <Input inputMode="decimal" />
            </Form.Item>
          ) : null}
          <Form.Item
            name="reason"
            label="原因"
            rules={[
              { required: true, whitespace: true, message: '请填写原因' },
            ]}
          >
            <Input.TextArea rows={3} maxLength={255} showCount />
          </Form.Item>
        </Form>
      </BusinessFormModal>
      <BusinessRecordDetailsModal
        open={Boolean(paymentDetail)}
        title="收付款详情"
        description="收付款来源、核销明细与当前状态均以系统最新记录为准。"
        record={paymentDetail}
        columns={paymentColumns}
        lineItems={paymentDetailLineItems}
        onClose={() => setPaymentDetail(null)}
      />
      <BusinessRecordDetailsModal
        open={Boolean(creditDetail)}
        title="红冲详情"
        description="红冲保留来源应收或应付、原金额和当前未核销金额。"
        record={creditDetail}
        columns={creditColumns}
        onClose={() => setCreditDetail(null)}
      />
    </BusinessPageLayout>
  )
}
