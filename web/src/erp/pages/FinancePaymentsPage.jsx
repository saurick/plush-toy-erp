import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Button,
  Empty,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
} from 'antd'
import { useOutletContext } from 'react-router-dom'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'

import {
  createFinanceCreditNote,
  createFinancePayment,
  getFinanceCreditNote,
  getFinancePayment,
  listFinanceCreditNotes,
  listFinanceFacts,
  listFinancePayments,
  postFinancePayment,
  reverseFinanceCreditNote,
  reverseFinancePayment,
} from '../api/operationalFactApi.mjs'
import {
  listAllCustomers,
  listAllSuppliers,
} from '../api/masterDataOrderApi.mjs'
import {
  BusinessPageLayout,
  PageHeaderCard,
} from '../components/business-list/BusinessListLayout.jsx'
import {
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
  isPositiveNumeric20Scale6Units,
  numeric20Scale6Units,
} from '../utils/numeric20Scale6.mjs'

const PAYMENT_STORAGE_PREFIX = 'plush-erp:finance-payment:last:v1:'
const CURRENCY_OPTIONS = ['CNY', 'USD', 'HKD'].map((value) => ({
  value,
  label: value === 'CNY' ? '人民币' : value === 'USD' ? '美元' : '港币',
}))
const PAYMENT_STATUS_META = Object.freeze({
  DRAFT: ['待核销', 'blue'],
  POSTED: ['已核销', 'green'],
  REVERSED: ['已冲销', 'default'],
})

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
  const outletContext = useOutletContext()
  const adminProfile = outletContext?.adminProfile || {}
  const customerKey = adminProfile?.effective_session?.customer?.key || ''
  const adminID = Number(adminProfile?.id || 0)
  const storageKey = adminID
    ? `${PAYMENT_STORAGE_PREFIX}${adminID}:${customerKey || 'default'}`
    : ''
  const [activeTab, setActiveTab] = useState('payments')
  const [currentPayment, setCurrentPayment] = useState(null)
  const [currentCredit, setCurrentCredit] = useState(null)
  const [payments, setPayments] = useState([])
  const [creditNotes, setCreditNotes] = useState([])
  const [financeFacts, setFinanceFacts] = useState([])
  const [customers, setCustomers] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading] = useState(false)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [allocationOpen, setAllocationOpen] = useState(false)
  const [reverseOpen, setReverseOpen] = useState(false)
  const [creditOpen, setCreditOpen] = useState(false)
  const [paymentForm] = Form.useForm()
  const [allocationForm] = Form.useForm()
  const [reverseForm] = Form.useForm()
  const [creditForm] = Form.useForm()
  const attemptsRef = useRef(createSourceBusinessActionAttemptStore())
  const listSequenceRef = useRef(0)

  const canCreatePayment = hasActionPermission(
    adminProfile,
    'finance.payment.create'
  )
  const canPostPayment = hasActionPermission(
    adminProfile,
    'finance.payment.post'
  )
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

  const rememberPayment = useCallback(
    (payment) => {
      setCurrentPayment(payment || null)
      if (storageKey && payment?.id) {
        window.sessionStorage.setItem(storageKey, String(payment.id))
      }
    },
    [storageKey]
  )

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

  const loadReferences = useCallback(async () => {
    const sequence = listSequenceRef.current + 1
    listSequenceRef.current = sequence
    setLoading(true)
    try {
      const [paymentResult, creditResult, receivables, payables, customerRows, supplierRows] =
        await Promise.all([
          listFinancePayments({ limit: 200, offset: 0 }),
          listFinanceCreditNotes({ limit: 200, offset: 0 }),
          listFinanceFacts({ fact_type: 'RECEIVABLE', limit: 200, offset: 0 }),
          listFinanceFacts({ fact_type: 'PAYABLE', limit: 200, offset: 0 }),
          listAllCustomers({ active_only: true }),
          listAllSuppliers({ active_only: true }),
        ])
      if (listSequenceRef.current !== sequence) return
      setPayments(paymentResult?.payments || [])
      setCreditNotes(creditResult?.credit_notes || [])
      setFinanceFacts([
        ...(receivables?.finance_facts || []),
        ...(payables?.finance_facts || []),
      ])
      setCustomers(
        Array.isArray(customerRows?.customers) ? customerRows.customers : []
      )
      setSuppliers(
        Array.isArray(supplierRows?.suppliers) ? supplierRows.suppliers : []
      )
    } catch (error) {
      if (listSequenceRef.current !== sequence) return
      message.error(getActionErrorMessage(error, '加载财务核销资料'))
    } finally {
      if (listSequenceRef.current === sequence) setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadReferences()
    if (storageKey) {
      const paymentID = Number(window.sessionStorage.getItem(storageKey) || 0)
      if (paymentID > 0) recoverPayment(paymentID, true)
    }
    return () => {
      listSequenceRef.current += 1
    }
  }, [loadReferences, recoverPayment, storageKey])
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
        ['POSTED', 'SETTLED'].includes(fact.status) &&
        Number(fact.counterparty_id || 0) ===
          Number(currentPayment.counterparty_id || 0) &&
        fact.currency === currentPayment.currency
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
      const payment = await createFinancePayment(attempt.params)
      if (!payment?.id || payment.status !== 'DRAFT') {
        throw Object.assign(new Error('收付款结果暂时无法确认'), {
          isInvalidResponse: true,
        })
      }
      attemptsRef.current.settle(scope, attempt, null)
      rememberPayment(payment)
      setPaymentOpen(false)
      await loadReferences()
      message.success('收付款记录已创建，请继续选择应收或应付进行核销')
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

  const openAllocation = () => {
    allocationForm.resetFields()
    allocationForm.setFieldsValue({
      allocations: allocationCandidates.map((fact) => ({
        finance_fact_id: fact.id,
        label: `${fact.fact_no || '财务记录'} / ${fact.amount || '-'} ${fact.currency || ''}`,
        amount: '',
      })),
    })
    setAllocationOpen(true)
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
    if (allocations.length === 0) {
      message.warning('请至少填写一笔核销金额')
      return
    }
    setLoading(true)
    try {
      const payment = await postFinancePayment({
        ...(customerKey ? { customer_key: customerKey } : {}),
        id: currentPayment.id,
        expected_version: currentPayment.version,
        allocations,
      })
      rememberPayment(payment)
      setAllocationOpen(false)
      await loadReferences()
      message.success('收付款已过账并完成核销')
    } catch (error) {
      await recoverPayment(currentPayment.id, true)
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
    const scope = `${reverse ? 'reverse-credit' : 'credit'}:${
      reverse ? currentCredit.id : payload.finance_fact_id
    }`
    const attempt = attemptsRef.current.prepare(scope, payload)
    setLoading(true)
    try {
      const credit = reverse
        ? await reverseFinanceCreditNote(attempt.params)
        : await createFinanceCreditNote(attempt.params)
      const validCreate = !reverse && Number(credit?.finance_fact_id) === Number(payload.finance_fact_id) && credit?.status === 'POSTED' && Number(credit?.amount) === Number(payload.amount)
      const validReverse = reverse && Number(credit?.reversal_of_credit_note_id) === Number(currentCredit?.id) && credit?.status === 'REVERSED'
      if (!credit?.id || (!validCreate && !validReverse)) {
        throw Object.assign(new Error('红冲结果暂时无法确认'), { isInvalidResponse: true })
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
          const sourceCredit = await getFinanceCreditNote({ id: currentCredit.id })
          const history = await listFinanceCreditNotes({ finance_fact_id: sourceCredit?.finance_fact_id, limit: 50, offset: 0 })
          const reversal = (history?.credit_notes || []).find((item) => Number(item?.reversal_of_credit_note_id) === Number(currentCredit.id))
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

  const openCredit = (reverse = false) => {
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
    { title: '账户摘要', dataIndex: 'account_ref', width: 200 },
    { title: '业务凭据', dataIndex: 'evidence_ref', width: 200 },
    {
      title: '发生时间',
      dataIndex: 'occurred_at',
      width: 170,
      render: formatUnixDateTime,
    },
  ]

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
          <Tag color="gold" key="reversal">
            冲销 / 红冲
          </Tag>,
        ]}
      />
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          { key: 'payments', label: '收付款与核销' },
          { key: 'credits', label: '红冲处理' },
        ]}
      />
      {activeTab === 'payments' ? (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Space wrap>
            {canCreatePayment ? (
              <Button type="primary" onClick={openPayment}>
                登记收付款
              </Button>
            ) : null}
            <Button onClick={loadReferences} loading={loading}>
              刷新核销资料
            </Button>
          </Space>
          {currentPayment ? (
            <Alert
              type="info"
              showIcon
              message={`最近收付款：${currentPayment.payment_no || '已登记'} / ${
                PAYMENT_STATUS_META[currentPayment.status]?.[0] || '状态待核对'
              }`}
              description={`金额 ${currentPayment.amount || '-'} ${currentPayment.currency || ''}；已关联 ${currentPayment.allocations?.length || 0} 笔核销。`}
              action={
                <Space wrap>
                  {currentPayment.status === 'DRAFT' && canPostPayment ? (
                    <Button type="primary" onClick={openAllocation}>
                      选择应收 / 应付核销
                    </Button>
                  ) : null}
                  {currentPayment.status === 'POSTED' && canReversePayment ? (
                    <Button
                      danger
                      onClick={() => {
                        reverseForm.resetFields()
                        setReverseOpen(true)
                      }}
                    >
                      冲销收付款
                    </Button>
                  ) : null}
                  <Button onClick={() => recoverPayment(currentPayment.id)}>
                    重新读取
                  </Button>
                </Space>
              }
            />
          ) : (
            <Empty description="尚未登记或恢复收付款记录" />
          )}
          <Table
            rowKey="id"
            columns={paymentColumns}
            dataSource={payments}
            pagination={false}
            scroll={{ x: 1200 }}
            rowSelection={{
              type: 'radio',
              selectedRowKeys: currentPayment?.id ? [currentPayment.id] : [],
              onChange: (_, rows) => rememberPayment(rows[0] || null),
            }}
            locale={{ emptyText: '暂无收付款记录' }}
          />
        </Space>
      ) : (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Space wrap>
            {canCreateCredit ? (
              <Button type="primary" onClick={() => openCredit(false)}>
                登记红冲
              </Button>
            ) : null}
            {currentCredit &&
            canReverseCredit &&
            currentCredit.status === 'POSTED' &&
            !currentCredit.reversal_of_credit_note_id &&
            !creditNotes.some(
              (item) =>
                Number(item?.reversal_of_credit_note_id) ===
                Number(currentCredit.id)
            ) ? (
              <Button danger onClick={() => openCredit(true)}>
                冲销当前红冲
              </Button>
            ) : null}
          </Space>
          <Alert
            type="warning"
            showIcon
            message="红冲只针对已过账或已结清的应收、应付业务记录；不会删除原记录，也不替代总账凭证或税控处理。"
          />
          <Table
            rowKey="id"
            pagination={false}
            dataSource={creditNotes}
            rowSelection={{
              type: 'radio',
              selectedRowKeys: currentCredit?.id ? [currentCredit.id] : [],
              onChange: (_, rows) => setCurrentCredit(rows[0] || null),
            }}
            locale={{ emptyText: '暂无红冲记录' }}
            columns={[
                { title: '红冲单号', dataIndex: 'credit_note_no' },
                {
                  title: '来源财务记录',
                  dataIndex: 'finance_fact_id',
                  render: (value) =>
                    financeFacts.find((fact) => Number(fact.id) === Number(value))
                      ?.fact_no || '已关联财务记录',
                },
                { title: '金额', dataIndex: 'amount' },
                { title: '币种', dataIndex: 'currency' },
                {
                  title: '状态',
                  dataIndex: 'status',
                  render: (value) => (
                    <Tag>{value === 'REVERSED' ? '冲销记录' : '已红冲'}</Tag>
                  ),
                },
                { title: '原因', dataIndex: 'reason' },
              ]}
          />
        </Space>
      )}

      <Modal
        title="登记收付款"
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
      </Modal>

      <Modal
        title="选择核销记录"
        open={allocationOpen}
        width={860}
        okText="过账并核销"
        cancelText="取消"
        confirmLoading={loading}
        onCancel={() => !loading && setAllocationOpen(false)}
        onOk={postPayment}
      >
        <Alert
          type="info"
          showIcon
          message="仅显示与当前收付款方向、往来方和币种一致的已过账应收或应付；实际可核销余额由系统再次校验。"
        />
        <Form
          form={allocationForm}
          layout="vertical"
          preserve={false}
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
      </Modal>

      <Modal
        title="冲销收付款"
        open={reverseOpen}
        okText="确认冲销"
        cancelText="返回"
        okButtonProps={{ danger: true }}
        confirmLoading={loading}
        onCancel={() => !loading && setReverseOpen(false)}
        onOk={reversePayment}
      >
        <Form form={reverseForm} layout="vertical" preserve={false}>
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
      </Modal>

      <Modal
        title={creditOpen === 'reverse' ? '冲销红冲记录' : '登记红冲'}
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
                options={financeFacts
                  .filter((fact) => ['POSTED', 'SETTLED'].includes(fact.status))
                  .map((fact) => ({
                    value: fact.id,
                    label: `${fact.fact_no || '财务记录'} / ${fact.amount || '-'} ${fact.currency || ''}`,
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
      </Modal>
    </BusinessPageLayout>
  )
}
